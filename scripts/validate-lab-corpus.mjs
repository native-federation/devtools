#!/usr/bin/env node
/**
 * Validate the lab lossless capture corpora against their run manifests
 * (one per corpus, see scripts/lab-corpora.mjs).
 *
 * Adapted from the research repo's `validate-frankenstein-corpus.mjs`,
 * reduced to the manifest-level checks that make sense for a lossless
 * corpus: manifest schema/metadata, per-file sha256, expected scenario
 * set, envelope structure, and per-scenario losslessness evidence.
 * The research validator's deep repository-shape validation is
 * deliberately NOT ported — an allowlist schema would reject exactly
 * the fields losslessness exists to keep.
 *
 * The per-scenario evidence predicates durably assert the observed facts
 * each scenario contributes beyond the shared envelope contract.
 *
 * Usage: node scripts/validate-lab-corpus.mjs
 * Exit code 0 = corpus valid, 1 = issues (listed on stderr).
 */
import { createHash } from "node:crypto";
import { readdirSync, readFileSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { LAB_CORPORA } from "./lab-corpora.mjs";

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const CAPTURES_DIR = join(REPO_ROOT, "captures");

const MANIFEST_SCHEMA = "lab-lossless-corpus/1";
const CAPTURE_SCHEMA = "lab-lossless-capture/1";
const CHANNELS = ["nativeFederationGlobals", "domImportMaps", "importShim"];
const SRI = /^sha(256|384|512)-[A-Za-z0-9+/=]+$/;

const issues = [];
const manifestPaths = new Set();
const issue = (location, message) => issues.push(`${location}: ${message}`);
const sha256 = (buffer) => createHash("sha256").update(buffer).digest("hex");

// --- per-scenario losslessness evidence (observed shapes, not hypotheses)
const sharedVersions = (ns, scope, pkg) =>
  ns["shared-externals"]?.[scope]?.[pkg]?.versions ?? [];
// Every participant of a scope as { pkg, tag, action, remote } rows.
const participantRows = (ns, scope = "__GLOBAL__") =>
  Object.entries(ns["shared-externals"]?.[scope] ?? {}).flatMap(([pkg, external]) =>
    (external.versions ?? []).flatMap((version) =>
      (version.remotes ?? []).map((remote) => ({ pkg, tag: version.tag, action: version.action, remote }))
    )
  );
const DENSE = "@nf-lab/dense-lib";
const denseEvidence = ({ chunking, externals }) => (ns, env, loc) => {
  const rows = participantRows(ns).filter((row) => row.pkg.startsWith(DENSE));
  const keys = [...new Set(rows.map((row) => row.pkg))].sort();
  const expectedKeys = externals ? [DENSE] : [DENSE, `${DENSE}/extra`];
  if (JSON.stringify(keys) !== JSON.stringify(expectedKeys))
    issue(loc, `expected registry keys ${expectedKeys.join(",")}, saw ${keys.join(",")}`);
  const entryCounts = rows.map((row) => Object.keys(row.remote.entries ?? {}).length);
  if (!entryCounts.every((count) => count === (externals ? 2 : 1)))
    issue(loc, `expected ${externals ? 2 : 1} entries per ${DENSE} participant, saw ${entryCounts.join(",")}`);
  if (!rows.every((row) => ("bundle" in row.remote) === chunking))
    issue(loc, `expected bundle ${chunking ? "on every" : "on no"} ${DENSE} participant`);
  const chunkList = ns["shared-chunks"]?.mfe1?.["browser-shared"] ?? [];
  if (chunking ? chunkList.length === 0 : "shared-chunks" in ns)
    issue(loc, chunking ? "expected a non-empty mfe1 browser-shared chunk list" : "expected no shared-chunks repository");
};
const UI = ["@nf-lab/ui-core", "@nf-lab/ui-dom"];
const uiRows = (ns) => participantRows(ns).filter((row) => UI.includes(row.pkg));
const noAnchors = (ns, loc) => {
  if (participantRows(ns).some((row) => "servedBy" in row.remote)) issue(loc, "expected no servedBy anchor");
};
// Orchestrator v4.7 pooling results (native-federation/orchestrator#87).
const poolNames = (ns, pkgs) =>
  pkgs.map((pkg) => ns["shared-externals"]?.["__GLOBAL__"]?.[pkg]?.poolName ?? "-").join(",");
const expectPoolName = (ns, loc, pkgs, name) => {
  const seen = poolNames(ns, pkgs);
  if (seen !== pkgs.map(() => name).join(",")) issue(loc, `expected poolName '${name}' on ${pkgs.join(", ")}, saw ${seen}`);
};
const expectIsolated = (ns, loc, pkgs, remote) => {
  const rows = participantRows(ns).filter((row) => pkgs.includes(row.pkg) && row.remote.name === remote);
  if (rows.length !== pkgs.length || !rows.every((row) => row.action === "scope" && row.remote.poolCause === "incompatible"))
    issue(loc, `expected every ${remote} copy of ${pkgs.join(", ")} scoped with poolCause 'incompatible'`);
};
const expectServedBy = (ns, loc, pkg, remotes, anchor) => {
  const seen = participantRows(ns)
    .filter((row) => row.pkg === pkg && "servedBy" in row.remote)
    .map((row) => `${row.remote.name}:${row.remote.servedBy}`)
    .sort();
  const expected = remotes.map((remote) => `${remote}:${anchor}`).sort();
  if (JSON.stringify(seen) !== JSON.stringify(expected))
    issue(loc, `expected ${pkg} anchors ${expected.join(",")}, saw ${seen.join(",")}`);
};

const KIT = "@nf-lab/kit";
const kitRows = (ns) => participantRows(ns).filter((row) => row.pkg === KIT);

const EVIDENCE = {
  "clean-skip": (ns, env, loc) => {
    const versions = sharedVersions(ns, "__GLOBAL__", "@nf-lab/conflict-lib");
    if (versions.length !== 2) issue(loc, `expected 2 version rows, saw ${versions.length}`);
    if (!versions.some((v) => v.action === "skip" && v.remotes?.length > 0))
      issue(loc, "expected a skip row with intact participant list");
    for (const v of versions)
      for (const r of v.remotes ?? [])
        for (const field of ["requiredVersion", "bundle", "entries"])
          if (!(field in r)) issue(loc, `participant ${r.name} misses allowlist-dropped field '${field}'`);
  },
  "strict-split": (ns, env, loc) => {
    const versions = sharedVersions(ns, "__GLOBAL__", "@nf-lab/conflict-lib");
    const actionsOfLosingTag = versions.filter((v) => v.tag === "1.0.0").map((v) => v.action).sort();
    if (actionsOfLosingTag.join(",") !== "scope,skip")
      issue(loc, `expected tag 1.0.0 split into scope+skip rows, saw [${actionsOfLosingTag}]`);
  },
  "scope-isolation": (ns, env, loc) => {
    const versions = sharedVersions(ns, "__GLOBAL__", "@nf-lab/conflict-lib");
    if (!versions.some((v) => v.action === "scope"))
      issue(loc, "expected a scope row for the losing declaration");
  },
  "strict-scope": (ns, env, loc) => {
    const strictScope = ns["shared-externals"]?.["strict"];
    if (!strictScope) return issue(loc, "expected share scope 'strict' in shared-externals");
    const versions = strictScope["@nf-lab/conflict-lib"]?.versions ?? [];
    if (versions.filter((v) => v.action === "share").length !== 2)
      issue(loc, "expected TWO share rows under the strict scope");
  },
  scoped: (ns, env, loc) => {
    const scoped = ns["scoped-externals"];
    if (!scoped) return issue(loc, "expected populated scoped-externals");
    let sawBundle = false;
    for (const [remote, pkgs] of Object.entries(scoped))
      for (const [pkg, entry] of Object.entries(pkgs)) {
        if (!("tag" in entry) || !("entries" in entry))
          issue(loc, `scoped ${remote}/${pkg} misses tag/entries`);
        if ("bundle" in entry) sawBundle = true;
      }
    if (!sawBundle) issue(loc, "expected at least one ScopedVersion with a bundle field");
  },
  "non-dense": (ns, env, loc) => {
    const scoped = ns["scoped-externals"] ?? {};
    const chunkKeys = Object.values(scoped).flatMap((pkgs) =>
      Object.keys(pkgs).filter((k) => k.startsWith("@nf-internal/chunk-"))
    );
    if (chunkKeys.length === 0) issue(loc, "expected @nf-internal/chunk-* pseudo-externals");
    // bundle proven optional here: chunk entries carry only {tag, entries}
    const withBundle = Object.values(scoped).flatMap((pkgs) =>
      Object.entries(pkgs).filter(([k, e]) => k.startsWith("@nf-internal/chunk-") && "bundle" in e)
    );
    if (withBundle.length > 0)
      issue(loc, "chunk pseudo-externals unexpectedly carry a bundle field now — update the shape report");
  },
  "dynamic-init-native": (ns, env, loc) => {
    const maps = env.channels.domImportMaps.data?.maps ?? [];
    if (maps.length !== 2 || !maps.every((m) => m.type === "importmap"))
      issue(loc, `expected exactly 2 importmap tags, saw ${maps.map((m) => m.type).join(",")}`);
  },
  "dynamic-init-shim": (ns, env, loc) => {
    const maps = env.channels.domImportMaps.data?.maps ?? [];
    if (maps.length !== 2 || !maps.every((m) => m.type === "importmap-shim"))
      issue(loc, `expected exactly 2 importmap-shim tags, saw ${maps.map((m) => m.type).join(",")}`);
    const shimMap = env.channels.importShim.data?.map;
    if (!shimMap || Object.keys(shimMap.imports ?? {}).length === 0)
      issue(loc, "expected populated importShim.getImportMap() imports");
    const integrity = Object.values(shimMap?.integrity ?? {});
    if (integrity.length === 0 || !integrity.every((v) => SRI.test(v)))
      issue(loc, "expected SRI hash values in the effective shim map integrity block");
    const remoteIntegrity = Object.entries(ns.remotes ?? {}).filter(
      ([name, r]) => name !== "__NF-HOST__" && Object.keys(r.integrity ?? {}).length > 0
    );
    if (remoteIntegrity.length === 0)
      issue(loc, "expected per-remote integrity maps in the remotes repository");
  },
  "dynamic-override": (ns, env, loc) => {
    const maps = env.channels.domImportMaps.data?.maps ?? [];
    if (maps.length !== 1)
      issue(loc, `override must REPLACE the map tag — expected 1 tag, saw ${maps.length}`);
  },
  "self-fill": (ns, env, loc) => {
    const scope = ns["shared-externals"]?.["__GLOBAL__"] ?? {};
    if (!("@nf-lab/conflict-lib" in scope) || !("@nf-lab/conflict-lib/extra" in scope))
      issue(loc, "expected the secondary entry point as its own external beside the primary");
  },
  "co-declared-share": (ns, env, loc) => {
    // The corpus's only multi-declarer row: same version from two remotes
    // is ONE row (action 'share'), not a negotiation split.
    const versions = sharedVersions(ns, "__GLOBAL__", "@nf-lab/conflict-lib");
    if (versions.length !== 1)
      return issue(loc, `expected ONE co-declared version row, saw ${versions.length}`);
    const row = versions[0];
    if (row.action !== "share")
      issue(loc, `expected action 'share' on the co-declared row, saw '${row.action}'`);
    const remotes = row.remotes ?? [];
    if (remotes.length !== 2)
      issue(loc, `expected TWO declarers in one row, saw ${remotes.length}`);
    const cachedParticipants = remotes.filter((r) => r.cached === true);
    if (cachedParticipants.length !== 1)
      issue(loc, `expected exactly one participant observed cached:true, saw ${cachedParticipants.length}`);
    const fileNames = new Set(remotes.map((r) => r.entries?.["@nf-lab/conflict-lib"]));
    if (fileNames.size !== 1)
      issue(loc, "co-declarers no longer build identical file names — update the shape report");

    // Resolve both same-named files below their own remote scope. `cached`
    // is deliberately NOT used to elect a provider: only the map target says
    // which concrete URL is selected in this capture.
    const candidateUrls = remotes.map((participant) => {
      const scopeUrl = ns.remotes?.[participant.name]?.scopeUrl;
      const file = participant.entries?.["@nf-lab/conflict-lib"];
      if (typeof scopeUrl !== "string" || typeof file !== "string") {
        issue(loc, `cannot resolve candidate URL for ${participant.name} from ${scopeUrl} + ${file}`);
        return { name: participant.name, url: null };
      }
      try {
        const resolvedScope = new URL(scopeUrl, env.page?.url).href;
        return { name: participant.name, url: new URL(file, resolvedScope).href };
      } catch {
        issue(loc, `cannot resolve candidate URL for ${participant.name} from ${scopeUrl} + ${file}`);
        return { name: participant.name, url: null };
      }
    });
    if (new Set(candidateUrls.map(({ url }) => url).filter(Boolean)).size !== 2)
      issue(loc, `expected two distinct candidate URLs, saw ${JSON.stringify(candidateUrls)}`);

    const targets = (env.channels.domImportMaps.data?.maps ?? []).flatMap((m) =>
      Object.entries(m.map?.imports ?? {})
        .filter(([specifier]) => specifier === "@nf-lab/conflict-lib")
        .flatMap(([, url]) => {
          if (typeof url !== "string") {
            issue(loc, `mapped target is not a string: ${JSON.stringify(url)}`);
            return [];
          }
          try {
            return [new URL(url, env.page?.url).href];
          } catch {
            issue(loc, `cannot resolve mapped target ${url}`);
            return [];
          }
        })
    );
    if (targets.length !== 1)
      issue(loc, `expected exactly one selected target URL, saw [${targets.join(",")}]`);
    const selectedCandidates = candidateUrls.filter(
      ({ url }) => url !== null && targets.includes(url)
    );
    if (selectedCandidates.length !== 1)
      issue(loc, `expected exactly one candidate URL selected, saw ${JSON.stringify(selectedCandidates)}`);
  },
  "pooling-anchor": (ns, env, loc) => {
    const findParticipant = (pkg, tag, action, name) =>
      sharedVersions(ns, "__GLOBAL__", pkg)
        .find((version) => version.tag === tag && version.action === action)
        ?.remotes?.find((remote) => remote.name === name);
    const absoluteUrl = (value, base, label) => {
      if (typeof value !== "string" || typeof base !== "string") {
        issue(loc, `cannot resolve ${label} from ${base} + ${value}`);
        return null;
      }
      try {
        return new URL(value, base).href;
      } catch {
        issue(loc, `cannot resolve ${label} from ${base} + ${value}`);
        return null;
      }
    };
    const main = "@nf-lab/conflict-lib";
    const extra = `${main}/extra`;
    const expected = [
      ["host-main", "__NF-HOST__", main, "2.0.0", "share", undefined, undefined],
      ["mfe1-main", "mfe1", main, "1.0.0", "skip", "family", "mfe1"],
      ["mfe2-main", "mfe2", main, "1.0.0", "skip", undefined, "mfe1"],
      ["mfe1-extra", "mfe1", extra, "1.0.0", "share", "family", undefined],
      ["mfe2-extra", "mfe2", extra, "1.0.0", "share", undefined, undefined]
    ];
    const candidates = {};
    for (const [id, remote, specifier, tag, action, pool, servedBy] of expected) {
      const participant = findParticipant(specifier, tag, action, remote);
      if (!participant) {
        issue(loc, `missing ${id} participant declaration`);
        candidates[id] = null;
        continue;
      }
      if (participant.pool !== pool || participant.servedBy !== servedBy)
        issue(loc, `${id} pooling fields differ from the witnessed values`);
      if (participant.bundle !== "browser-shared")
        issue(loc, `${id} bundle ${JSON.stringify(participant.bundle)} !== "browser-shared"`);
      const scope = absoluteUrl(ns.remotes?.[remote]?.scopeUrl, env.page?.url, `${id} scope`);
      candidates[id] = scope === null
        ? null
        : absoluteUrl(participant.entries?.[specifier], scope, `${id} candidate`);
    }
    if (candidates["mfe1-main"] !== null && candidates["mfe1-main"] === candidates["mfe2-main"])
      issue(loc, "expected distinct mfe1 and mfe2 main candidate URLs");

    const maps = env.channels.domImportMaps.data?.maps ?? [];
    if (maps.length !== 1 || maps[0]?.type !== "importmap" || maps[0]?.parsed !== true)
      issue(loc, "expected one parsed native import-map tag");
    const map = maps[0]?.map;
    const expectedTargets = [
      ["global main", map?.imports?.[main], candidates["host-main"]],
      ["global extra", map?.imports?.[extra], candidates["mfe1-extra"]],
      ["mfe1 main", map?.scopes?.["./mfe1/"]?.[main], candidates["mfe1-main"]],
      ["mfe2 main", map?.scopes?.["./mfe2/"]?.[main], candidates["mfe1-main"]]
    ];
    for (const [label, rawTarget, candidate] of expectedTargets) {
      const target = absoluteUrl(rawTarget, env.page?.url, `${label} target`);
      if (target !== candidate)
        issue(loc, `${label} target ${target} !== expected candidate ${candidate}`);
    }

    const sharedChunks = ns["shared-chunks"];
    for (const remote of ["__NF-HOST__", "mfe1", "mfe2"]) {
      const chunks = sharedChunks?.[remote];
      if (!Array.isArray(chunks?.["mapping-or-exposed"]) || chunks["mapping-or-exposed"].length !== 0)
        issue(loc, `${remote} mapping-or-exposed must remain an observed empty list`);
      if (Object.prototype.hasOwnProperty.call(chunks ?? {}, "browser-shared"))
        issue(loc, `${remote} unexpectedly records a browser-shared chunk list`);
    }
  },
  "dense-chunking-only": denseEvidence({ chunking: true, externals: false }),
  "dense-externals-only": denseEvidence({ chunking: false, externals: true }),
  "dense-both": denseEvidence({ chunking: true, externals: true }),
  // Tagged family already served whole by mfe1's build: pooling writes nothing.
  "pool-tag-coherent": (ns, env, loc) => {
    const rows = uiRows(ns);
    if (rows.length !== 4 || !rows.every((row) => row.remote.pool === "ui"))
      issue(loc, "expected four ui participants, all tagged pool 'ui'");
    if (rows.some((row) => row.action === "scope")) issue(loc, "expected no scope rows");
    noAnchors(ns, loc);
  },
  // Gate 1: mfe1 islanded across the whole family; ui-core is left with no share row.
  "pool-tag-islanded": (ns, env, loc) => {
    const mfe1 = uiRows(ns).filter((row) => row.remote.name === "mfe1");
    if (mfe1.length !== 2 || !mfe1.every((row) => row.action === "scope"))
      issue(loc, "expected every mfe1 ui member in a scope row");
    if (sharedVersions(ns, "__GLOBAL__", "@nf-lab/ui-core").some((version) => version.action === "share"))
      issue(loc, "expected ui-core without a share row (scoped-only)");
    noAnchors(ns, loc);
    expectPoolName(ns, loc, UI, "ui");
    expectIsolated(ns, loc, UI, "mfe1");
  },
  // Gate 2: the family is anchored onto mfe1's build for every remote, untagged mfe3 included.
  "pool-tag-anchored": (ns, env, loc) => {
    const skips = uiRows(ns).filter((row) => row.pkg === "@nf-lab/ui-core" && row.action === "skip");
    const anchored = skips.map((row) => `${row.remote.name}:${row.remote.servedBy}:${row.remote.pool ?? "-"}`).sort();
    const expected = ["mfe1:mfe1:ui", "mfe2:mfe1:ui", "mfe3:mfe1:-"];
    if (JSON.stringify(anchored) !== JSON.stringify(expected))
      issue(loc, `expected ui-core skip anchors ${expected.join(",")}, saw ${anchored.join(",")}`);
  },
  // A single tagged member joins nothing: no pool forms, nothing is written.
  "pool-tag-orphan": (ns, env, loc) => {
    const tagged = participantRows(ns).filter((row) => "pool" in row.remote);
    if (tagged.length !== 1 || tagged[0].pkg !== "@nf-lab/ui-core" || tagged[0].remote.name !== "mfe1")
      issue(loc, "expected exactly one pool tag: ui-core on mfe1");
    noAnchors(ns, loc);
  },
  // Four independent pools: ui redirected onto catalog, charts isolating catalog, form-kit one build
  // under two tags (named after the alphabetically first of the tied tags), icons an orphan tag.
  "pool-showcase": (ns, env, loc) => {
    expectPoolName(ns, loc, UI, "ui");
    expectPoolName(ns, loc, ["@nf-lab/chart-core", "@nf-lab/chart-dom"], "charts");
    expectPoolName(ns, loc, ["@nf-lab/form-core", "@nf-lab/form-dom"], "form-kit");
    expectPoolName(ns, loc, ["@nf-lab/icons"], "-");
    // The anchor names itself too, as in pool-tag-anchored.
    expectServedBy(ns, loc, "@nf-lab/ui-core", ["admin", "catalog", "checkout"], "catalog");
    expectIsolated(ns, loc, ["@nf-lab/chart-core", "@nf-lab/chart-dom"], "catalog");
  },
  // One family across twelve remotes: four redirected onto orders, legacy isolated.
  "pool-portfolio": (ns, env, loc) => {
    const family = ["core", "common", "router", "forms", "animations"].map((name) => `@nf-lab/acme-${name}`);
    expectPoolName(ns, loc, family, "acme");
    // servedBy only where the build differs from the version's basis: on the host-shared members;
    // forms and animations are shared from orders' build already.
    const onOrders = ["contacts", "invoices", "onboarding", "orders", "reports"];
    for (const pkg of family.slice(0, 3)) expectServedBy(ns, loc, pkg, onOrders, "orders");
    expectServedBy(ns, loc, "@nf-lab/acme-forms", [], "orders");
    expectIsolated(ns, loc, family, "legacy");
    const onHost = ["products", "search", "settings", "profile", "cart"];
    if (participantRows(ns).some((row) => onHost.includes(row.remote.name) && "servedBy" in row.remote))
      issue(loc, "expected the host-build remotes without a servedBy anchor");
  },
  // The host shares kit 2.0.0; mfe1's non-strict ^1.0.0 rejects it but is stored as a plain skip,
  // mfe2's strict one scopes.
  "out-of-range-nonstrict": (ns, env, loc) => {
    const rows = kitRows(ns).map((row) => `${row.remote.name}:${row.tag}:${row.action}:${row.remote.strictVersion}`).sort();
    const expected = ["__NF-HOST__:2.0.0:share:true", "mfe1:1.2.0:skip:false", "mfe2:1.3.0:scope:true", "mfe3:2.0.0:share:true"];
    if (JSON.stringify(rows) !== JSON.stringify(expected)) issue(loc, `expected kit rows ${expected.join(",")}, saw ${rows.join(",")}`);
  },
  // The shared 1.4.0 lacks eight secondaries; the map serves them from mfe1's and mfe2's builds.
  "torn-many": (ns, env, loc) => {
    const map = env.channels?.importShim?.data?.map?.imports ?? {};
    const served = Object.entries(map)
      .filter(([spec]) => spec.startsWith(`${KIT}/`))
      .map(([spec, url]) => `${spec.slice(KIT.length + 1)}@${new URL(url).pathname.split("/")[1]}`)
      .sort();
    const expected = ["charts/legend@mfe2", "charts@mfe2", "date-picker@mfe2", "dialog@mfe1", "forms@mfe1", "table/paginator@mfe1", "table/sort@mfe1", "table@mfe1"];
    if (JSON.stringify(served) !== JSON.stringify(expected)) issue(loc, `expected torn kit specifiers ${expected.join(",")}, saw ${served.join(",")}`);
    if (sharedVersions(ns, "__GLOBAL__", KIT).find((v) => v.action === "share")?.tag !== "1.4.0") issue(loc, "expected kit 1.4.0 shared");
  },
  // One shared row of kit 1.2.0 with two copies; the host's declares only the package itself.
  "merged-entrypoints": (ns, env, loc) => {
    const versions = sharedVersions(ns, "__GLOBAL__", KIT);
    const entries = (versions[0]?.remotes ?? []).map((r) => `${r.name}:${Object.keys(r.entries ?? {}).length}`).sort();
    if (versions.length !== 1 || versions[0].tag !== "1.2.0" || versions[0].action !== "share" || entries.join(",") !== "__NF-HOST__:1,mfe1:3")
      issue(loc, `expected one shared kit 1.2.0 row with host:1 and mfe1:3 entries, saw ${entries.join(",")}`);
  },
  // kit in global, team-a and strict, each with its own election.
  "multi-scope": (ns, env, loc) => {
    const shares = Object.entries(ns["shared-externals"] ?? {})
      .flatMap(([scope, pkgs]) => (pkgs[KIT]?.versions ?? []).filter((v) => v.action === "share").map((v) => `${scope}:${v.tag}`))
      .sort();
    const expected = ["__GLOBAL__:1.4.0", "strict:1.3.0", "strict:2.0.0", "team-a:1.3.0"];
    if (JSON.stringify(shares) !== JSON.stringify(expected)) issue(loc, `expected kit shares ${expected.join(",")}, saw ${shares.join(",")}`);
  },
};

// --- live-capture evidence (frankenstein-live, report rows 12–16) --------
// Same doctrine as EVIDENCE: these encode the OBSERVED shapes of the
// deployed released-v4 orchestrator generation (participants carry `file`,
// not the lab generation's `entries` map). A redeploy that changes any of
// them fails loudly and points at the shape report.
const forEachParticipant = (ns, fn) => {
  for (const [scope, pkgs] of Object.entries(ns["shared-externals"] ?? {}))
    for (const [pkg, entry] of Object.entries(pkgs))
      for (const version of entry.versions ?? [])
        for (const participant of version.remotes ?? []) fn(participant, pkg, scope);
};
const liveEvidence = (ns, env, loc) => {
  // Row 12: populated shared-chunks bundle lists; mapping-or-exposed empty.
  const chunkRepo = ns["shared-chunks"] ?? {};
  const bundleLists = Object.values(chunkRepo).flatMap((bundles) =>
    Object.entries(bundles).filter(([key]) => key !== "mapping-or-exposed")
  );
  if (bundleLists.length === 0) issue(loc, "expected populated shared-chunks bundle lists");
  for (const [bundle, files] of bundleLists)
    if (!Array.isArray(files) || files.length === 0)
      issue(loc, `shared-chunks bundle ${bundle} has an empty file list`);
  for (const [remote, bundles] of Object.entries(chunkRepo))
    if (!Array.isArray(bundles["mapping-or-exposed"]) || bundles["mapping-or-exposed"].length !== 0)
      issue(loc, `mapping-or-exposed no longer empty for ${remote} — update the shape report`);
  // Row 12 mapping side: every listed chunk appears in the effective map scopes.
  const domMaps = env.channels.domImportMaps.data?.maps ?? [];
  const scopeTargets = domMaps.flatMap((m) =>
    Object.values(m.map?.scopes ?? {}).flatMap((entries) => Object.values(entries))
  );
  const chunkFiles = bundleLists.flatMap(([, files]) => files);
  for (const file of chunkFiles)
    if (!scopeTargets.some((target) => target.endsWith("/" + file)))
      issue(loc, `shared-chunks file ${file} not mapped in any import-map scope`);
  // Rows 13/14: v4 participant shape — `file` string, no `entries` map, and
  // no servedBy/pool under real Angular sharing.
  forEachParticipant(ns, (participant, pkg) => {
    if (typeof participant.file !== "string")
      issue(loc, `participant ${participant.name} of ${pkg} misses the v4 'file' field`);
    for (const absent of ["entries", "servedBy", "pool"])
      if (absent in participant)
        issue(loc, `participant ${participant.name} of ${pkg} unexpectedly carries '${absent}' — update the shape report`);
  });
  // Row 14: real secondary entry points as own top-level package keys;
  // scoped-externals observed EMPTY in this generation.
  const globalScope = ns["shared-externals"]?.["__GLOBAL__"] ?? {};
  for (const pkg of ["@angular/common/http", "rxjs/operators"])
    if (!(pkg in globalScope))
      issue(loc, `expected secondary entry point ${pkg} as its own package key`);
  if (Object.keys(ns["scoped-externals"] ?? {}).length !== 0)
    issue(loc, "scoped-externals no longer empty in the v4 deployment — update the shape report");
  // Row 15: per-remote integrity at scale, SRI values, and an effective shim
  // map whose integrity keys are resolved absolute URLs.
  const remotesWithIntegrity = Object.entries(ns.remotes ?? {}).filter(
    ([, remote]) => Object.keys(remote.integrity ?? {}).length > 0
  );
  if (remotesWithIntegrity.length < 2)
    issue(loc, `expected per-remote integrity on 2+ remotes, saw ${remotesWithIntegrity.length}`);
  for (const [name, remote] of remotesWithIntegrity)
    for (const [file, hash] of Object.entries(remote.integrity))
      if (!SRI.test(hash)) issue(loc, `remotes.${name}.integrity[${file}] is not an SRI hash`);
  const shimMap = env.channels.importShim.data?.map;
  const shimIntegrity = Object.entries(shimMap?.integrity ?? {});
  if (shimIntegrity.length === 0) issue(loc, "expected populated shim map integrity block");
  for (const [url, hash] of shimIntegrity) {
    if (!/^https?:\/\//.test(url)) issue(loc, `shim integrity key not an absolute URL: ${url}`);
    if (!SRI.test(hash)) issue(loc, `shim integrity value not an SRI hash for ${url}`);
  }
  // Row 16: provider derivation — every shared package has exactly one
  // providing participant in this deployment.
  for (const [pkg, entry] of Object.entries(globalScope)) {
    const participants = (entry.versions ?? []).flatMap((v) => v.remotes ?? []);
    if (participants.length !== 1)
      issue(loc, `package ${pkg} has ${participants.length} participants — single-provider assumption broken, update the shape report`);
  }
};
// Registry stability under remote module loading: phases must be identical
// except for capture timestamps.
const livePhaseIdentity = (phases, loc) => {
  const first = phases.get("01-initial");
  const second = phases.get("02-post-interaction");
  if (!first || !second) return;
  const nsOf = (env) => env.channels?.nativeFederationGlobals?.data?.namespace;
  if (JSON.stringify(nsOf(first)) !== JSON.stringify(nsOf(second)))
    issue(loc, "namespace differs between phases — module loading mutated the registry, update the shape report");
  const tagsOf = (env) => (env.channels?.domImportMaps?.data?.maps ?? []).map((m) => m.text);
  if (JSON.stringify(tagsOf(first)) !== JSON.stringify(tagsOf(second)))
    issue(loc, "DOM import-map tags differ between phases");
  const shimOf = (env) => env.channels?.importShim?.data?.map;
  if (JSON.stringify(shimOf(first)) !== JSON.stringify(shimOf(second)))
    issue(loc, "effective shim map differs between phases");
};

// --- per corpus: manifest, capture entries, live captures ----------------
function validateCorpus(corpus) {
  const MANIFEST_PATH = join(CAPTURES_DIR, corpus.manifest);
  const EXPECTED_SCENARIOS = corpus.scenarios;

  // --- manifest ------------------------------------------------------------
  let manifest;
  try {
    manifest = JSON.parse(readFileSync(MANIFEST_PATH, "utf8"));
  } catch (error) {
    issue(`captures/${corpus.manifest}`, `unreadable (${error.message}) — run scripts/build-lab-manifest.mjs --corpus ${corpus.id}`);
    return { captures: 0, live: 0, runId: null, probe: "" };
  }

  if (manifest.schemaVersion !== MANIFEST_SCHEMA)
    issue("manifest.schemaVersion", `expected ${MANIFEST_SCHEMA}, saw ${manifest.schemaVersion}`);
  if (!/^\d{8}T\d{6}Z$/.test(manifest.runId ?? ""))
    issue("manifest.runId", `not a runstamp: ${manifest.runId}`);
  if (!/^[0-9a-f]{40}$/.test(manifest.source?.playground?.commit ?? ""))
    issue("manifest.source.playground.commit", "not a full commit hash");
  if (!manifest.source?.orchestratorCommit)
    issue("manifest.source.orchestratorCommit", "missing");
  if (manifest.collector?.sanitization !== "lossless")
    issue("manifest.collector.sanitization", `expected lossless, saw ${manifest.collector?.sanitization}`);
  if (manifest.collector?.kind !== corpus.collector.kind)
    issue("manifest.collector.kind", `expected ${corpus.collector.kind}, saw ${manifest.collector?.kind}`);
  if (JSON.stringify(manifest.expectedScenarios) !== JSON.stringify(EXPECTED_SCENARIOS))
    issue("manifest.expectedScenarios", "does not match the catalog");

  // Probe drift: the manifest pins the probe that produced the corpus. A corpus that can no longer be
  // re-captured names a preserved copy (scripts/lab-capture-dump-v1.js) instead of the current probe.
  const probeFile = manifest.source?.probe?.file ?? "scripts/lab-capture-dump.js";
  try {
    const probeHash = sha256(readFileSync(join(REPO_ROOT, probeFile)));
    if (manifest.source?.probe?.sha256 !== probeHash)
      issue(
        "manifest.source.probe.sha256",
        `does not match ${probeFile} — probe changed since capture; re-capture or rebuild the manifest`
      );
  } catch (error) {
    issue(probeFile, `unreadable (${error.message})`);
  }

  // --- capture entries -----------------------------------------------------
  const manifestScenarios = (manifest.captures ?? []).map((c) => c.scenario);
  if (JSON.stringify([...manifestScenarios].sort()) !== JSON.stringify([...EXPECTED_SCENARIOS].sort()))
    issue("manifest.captures", `scenario set mismatch: [${manifestScenarios.join(",")}]`);

  for (const entry of manifest.captures ?? []) {
    const loc = `manifest.captures[${entry.scenario}]`;
    manifestPaths.add(entry.path);
    let buffer;
    try {
      buffer = readFileSync(join(CAPTURES_DIR, entry.path));
    } catch {
      issue(loc, `capture file missing: ${entry.path}`);
      continue;
    }
    if (sha256(buffer) !== entry.sha256) {
      issue(loc, `sha256 mismatch for ${entry.path}`);
      continue;
    }

    let env;
    try {
      env = JSON.parse(buffer.toString("utf8"));
    } catch (error) {
      issue(loc, `unparseable JSON (${error.message})`);
      continue;
    }

    // Envelope structure
    if (env.schemaVersion !== CAPTURE_SCHEMA)
      issue(loc, `schemaVersion ${env.schemaVersion} !== ${CAPTURE_SCHEMA}`);
    if (env.scenario?.scenarioId !== entry.scenario)
      issue(loc, `scenarioId ${env.scenario?.scenarioId} !== ${entry.scenario}`);
    if (env.scenario?.ready !== true)
      issue(loc, `capture taken without resolved readiness (readyError: ${env.scenario?.readyError})`);
    // Fallback-mode keys are live-capture-only: a lab capture carrying them
    // means the runner readiness contract was silently bypassed.
    for (const liveOnly of ["readySource", "phase"])
      if (liveOnly in (env.scenario ?? {}))
        issue(loc, `lab capture carries fallback-mode scenario key '${liveOnly}' — probe ran without __NF_SCENARIO_READY__`);
    if (env.scenario?.orchestratorCommit !== manifest.source?.orchestratorCommit)
      issue(loc, "orchestratorCommit differs from manifest");
    if (env.page?.origin !== manifest.serving?.origin)
      issue(loc, `page.origin ${env.page?.origin} !== serving.origin ${manifest.serving?.origin}`);
    if (env.collector?.sanitization !== "lossless") issue(loc, "collector.sanitization !== lossless");
    if (!Array.isArray(env.collectionErrors) || env.collectionErrors.length > 0)
      issue(loc, `collectionErrors not empty: ${JSON.stringify(env.collectionErrors)}`);
    for (const name of CHANNELS) {
      const channel = env.channels?.[name];
      if (!channel) {
        issue(loc, `channel ${name} missing`);
        continue;
      }
      if (channel.availability !== "available") issue(loc, `channel ${name} not available`);
      if (Number.isNaN(Date.parse(channel.observedAt ?? "")))
        issue(loc, `channel ${name} observedAt not a timestamp`);
    }

    // Per-scenario losslessness evidence
    const ns = env.channels?.nativeFederationGlobals?.data?.namespace;
    if (!ns) {
      issue(loc, "namespace clone missing");
    } else {
      EVIDENCE[entry.scenario]?.(ns, env, loc);
    }
    // Captures from a v4.7+ lab carry the exposed version, and the probe stamps it.
    if (manifest.source?.orchestratorCommit === "4.7.0") {
      const exposed = env.channels?.orchestratorGlobal?.data?.storage?.["__NATIVE_FEDERATION__"]?.version;
      if (exposed !== "4.7.0") issue(loc, `expected orchestratorGlobal version 4.7.0, saw ${exposed}`);
    }
  }

  // --- live captures (frankenstein-live) -----------------------------------
  const LIVE_SCENARIO = "frankenstein-live";
  const live = corpus.live ? manifest.liveCaptures : null;
  if (!corpus.live && manifest.liveCaptures) issue("manifest.liveCaptures", `corpus ${corpus.id} carries no live captures`);
  if (live) {
    const lloc = "manifest.liveCaptures";
    if (live.scenarioId !== LIVE_SCENARIO)
      issue(`${lloc}.scenarioId`, `expected ${LIVE_SCENARIO}, saw ${live.scenarioId}`);
    if (live.collector?.kind !== "chrome-devtools-mcp")
      issue(`${lloc}.collector.kind`, `expected chrome-devtools-mcp, saw ${live.collector?.kind}`);
    if (live.collector?.sanitization !== "lossless")
      issue(`${lloc}.collector.sanitization`, "expected lossless");

    // Provenance: sidecar is the source of truth, the manifest embeds it.
    let sidecar = null;
    try {
      sidecar = JSON.parse(readFileSync(join(CAPTURES_DIR, LIVE_SCENARIO, "provenance.json"), "utf8"));
    } catch (error) {
      issue(`captures/${LIVE_SCENARIO}/provenance.json`, `unreadable (${error.message})`);
    }
    if (sidecar && JSON.stringify(sidecar) !== JSON.stringify(live.provenance))
      issue(`${lloc}.provenance`, "differs from the provenance.json sidecar — rebuild the manifest");
    const prov = live.provenance;
    if (
      !prov?.captureUrl ||
      !prov?.captureDate ||
      prov?.deploymentDependent !== true ||
      prov?.regenerableFromCheckouts !== false ||
      !prov?.deployment?.orchestrator?.bestKnown
    )
      issue(
        `${lloc}.provenance`,
        "missing required fields (captureUrl, captureDate, deploymentDependent: true, regenerableFromCheckouts: false, deployment.orchestrator.bestKnown)"
      );
    manifestPaths.add(`${LIVE_SCENARIO}/provenance.json`);

    const phases = new Map();
    for (const entry of live.files ?? []) {
      const loc = `${lloc}[${entry.phase}]`;
      manifestPaths.add(entry.path);
      let buffer;
      try {
        buffer = readFileSync(join(CAPTURES_DIR, entry.path));
      } catch {
        issue(loc, `capture file missing: ${entry.path}`);
        continue;
      }
      if (sha256(buffer) !== entry.sha256) {
        issue(loc, `sha256 mismatch for ${entry.path}`);
        continue;
      }
      let env;
      try {
        env = JSON.parse(buffer.toString("utf8"));
      } catch (error) {
        issue(loc, `unparseable JSON (${error.message})`);
        continue;
      }
      if (env.schemaVersion !== CAPTURE_SCHEMA)
        issue(loc, `schemaVersion ${env.schemaVersion} !== ${CAPTURE_SCHEMA}`);
      if (env.scenario?.scenarioId !== LIVE_SCENARIO)
        issue(loc, `scenarioId ${env.scenario?.scenarioId} !== ${LIVE_SCENARIO}`);
      if (env.scenario?.ready !== true)
        issue(loc, `capture taken without settled page (readyError: ${env.scenario?.readyError})`);
      if (env.scenario?.readySource !== "page-settled")
        issue(loc, `expected readySource page-settled, saw ${env.scenario?.readySource}`);
      if (env.scenario?.orchestratorCommit !== null)
        issue(loc, "live capture must not stamp a lab orchestratorCommit");
      if (env.scenario?.phase !== entry.phase)
        issue(loc, `scenario.phase ${env.scenario?.phase} !== manifest phase ${entry.phase}`);
      if (env.page?.url !== prov?.captureUrl)
        issue(loc, `page.url ${env.page?.url} !== provenance.captureUrl ${prov?.captureUrl}`);
      if (env.collector?.sanitization !== "lossless") issue(loc, "collector.sanitization !== lossless");
      if (!Array.isArray(env.collectionErrors) || env.collectionErrors.length > 0)
        issue(loc, `collectionErrors not empty: ${JSON.stringify(env.collectionErrors)}`);
      for (const name of CHANNELS) {
        const channel = env.channels?.[name];
        if (!channel) {
          issue(loc, `channel ${name} missing`);
          continue;
        }
        if (channel.availability !== "available") issue(loc, `channel ${name} not available`);
        if (Number.isNaN(Date.parse(channel.observedAt ?? "")))
          issue(loc, `channel ${name} observedAt not a timestamp`);
      }
      phases.set(entry.phase, env);

      const ns = env.channels?.nativeFederationGlobals?.data?.namespace;
      if (!ns) issue(loc, "namespace clone missing");
      else liveEvidence(ns, env, loc);
    }
    if (!phases.has("01-initial")) issue(lloc, "phase 01-initial missing");
    livePhaseIdentity(phases, lloc);
  }

  return {
    captures: manifest.captures?.length ?? 0,
    live: live ? live.files.length : 0,
    runId: manifest.runId,
    probe: manifest.source?.probe?.sha256 ?? "",
  };
}

const summaries = LAB_CORPORA.map((corpus) => [corpus, validateCorpus(corpus)]);

// --- stray files: everything under captures/ must be accounted for ------
const onDisk = readdirSync(CAPTURES_DIR, { recursive: true, withFileTypes: true })
  .filter((d) => d.isFile())
  .map((d) => relative(CAPTURES_DIR, join(d.parentPath, d.name)).replaceAll("\\", "/"));
for (const file of onDisk) {
  if (file === "README.md") continue;
  if (LAB_CORPORA.some((corpus) => corpus.manifest === file)) continue;
  if (file.startsWith("frankenstein/")) continue; // research-corpus subset, own provenance
  if (!manifestPaths.has(file)) issue(`captures/${file}`, "not listed in the manifest (stray capture)");
}

if (issues.length > 0) {
  for (const line of issues) console.error(`INVALID ${line}`);
  console.error(`\n${issues.length} issue(s).`);
  process.exit(1);
}
for (const [corpus, summary] of summaries)
  console.log(
    `corpus ${corpus.id} valid: ${summary.captures} captures` +
      (summary.live ? ` + ${summary.live} live phases` : "") +
      `, runId ${summary.runId}, probe ${summary.probe.slice(0, 12)}…`
  );
