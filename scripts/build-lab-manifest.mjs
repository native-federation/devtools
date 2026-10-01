#!/usr/bin/env node
/**
 * Build the run manifest for the lab lossless capture corpus
 * (`captures/manifest.json`), following the research-corpus pattern
 * (frankenstein `manifest.json`: schema id, run id, source commits,
 * collector block, per-file sha256).
 *
 * The manifest is what makes the corpus checkable (XC-01): the validator
 * (`scripts/validate-lab-corpus.mjs`) verifies hashes, schema ids, and the
 * expected scenario set against this file. Re-running the builder over an
 * unchanged capture set is deterministic except for `createdAt`.
 *
 * Usage: node scripts/build-lab-manifest.mjs [--corpus <id>] [--playground <path>]
 * (corpora and their scenario catalogs: scripts/lab-corpora.mjs; default `v2`).
 */
import { createHash } from "node:crypto";
import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { corpusById } from "./lab-corpora.mjs";

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const CAPTURES_DIR = join(REPO_ROOT, "captures");

const args = process.argv.slice(2);
const corpusFlag = args.indexOf("--corpus");
const corpus = corpusById(corpusFlag !== -1 ? args[corpusFlag + 1] : "v2");
const MANIFEST_PATH = join(CAPTURES_DIR, corpus.manifest);
const PROBE_PATH = join(REPO_ROOT, corpus.probe);
const EXPECTED_SCENARIOS = corpus.scenarios;
const playgroundFlag = args.indexOf("--playground");
const playgroundDir =
  playgroundFlag !== -1 && args[playgroundFlag + 1]
    ? resolve(args[playgroundFlag + 1])
    : resolve(REPO_ROOT, "..", "nf", "playground");

const sha256 = (buffer) => createHash("sha256").update(buffer).digest("hex");

const git = (repoDir, ...gitArgs) =>
  execFileSync("git", ["-C", repoDir, ...gitArgs], { encoding: "utf8" }).trim();

const failures = [];

const captures = [];
const orchestratorCommits = new Set();
for (const scenario of EXPECTED_SCENARIOS) {
  const dir = join(CAPTURES_DIR, scenario);
  let files;
  try {
    files = readdirSync(dir).filter((f) => f.endsWith(".json")).sort();
  } catch {
    failures.push(`missing capture directory: captures/${scenario}/`);
    continue;
  }
  if (files.length === 0) {
    failures.push(`no capture file in captures/${scenario}/`);
    continue;
  }
  // Newest runstamp is the corpus member; older ones may exist locally
  // but are not part of the manifest.
  const file = files[files.length - 1];
  const buffer = readFileSync(join(dir, file));
  let envelope;
  try {
    envelope = JSON.parse(buffer.toString("utf8"));
  } catch (error) {
    failures.push(`captures/${scenario}/${file}: unparseable JSON (${error.message})`);
    continue;
  }
  if (envelope?.scenario?.scenarioId !== scenario) {
    failures.push(
      `captures/${scenario}/${file}: scenario.scenarioId is ${JSON.stringify(
        envelope?.scenario?.scenarioId
      )}, expected "${scenario}"`
    );
  }
  if (envelope?.scenario?.orchestratorCommit) {
    orchestratorCommits.add(envelope.scenario.orchestratorCommit);
  }
  captures.push({
    scenario,
    path: `${scenario}/${file}`,
    runstamp: file.replace(/\.json$/, ""),
    sha256: sha256(buffer)
  });
}

if (orchestratorCommits.size !== 1) {
  failures.push(
    `expected exactly one orchestrator commit across captures, saw: ${[...orchestratorCommits].join(", ") || "none"}`
  );
}

// --- live captures (frankenstein-live) -----------------------------------
// Unlike lab scenarios there is no newest-runstamp rule: every capture file
// in the directory is a corpus member (one per observed phase). Superseded
// runs must be deleted before rebuilding (same cleanup forcing function).
// Non-derivable provenance (deployment, best-known orchestrator version)
// lives in the checked-in sidecar `provenance.json` and is embedded here so
// the manifest stays the single file consumers need to read.
const LIVE_SCENARIO = "frankenstein-live";
const LIVE_DIR = join(CAPTURES_DIR, LIVE_SCENARIO);
let liveCaptures = null;
let liveFiles = [];
try {
  if (corpus.live) liveFiles = readdirSync(LIVE_DIR).filter((f) => f.endsWith(".json")).sort();
} catch {
  // No live capture directory — manifest stays lab-only.
}
if (liveFiles.length > 0) {
  let provenance = null;
  if (!liveFiles.includes("provenance.json")) {
    failures.push(`captures/${LIVE_SCENARIO}/provenance.json missing (deployment provenance sidecar)`);
  } else {
    try {
      provenance = JSON.parse(readFileSync(join(LIVE_DIR, "provenance.json"), "utf8"));
    } catch (error) {
      failures.push(`captures/${LIVE_SCENARIO}/provenance.json: unparseable JSON (${error.message})`);
    }
  }
  const files = [];
  for (const file of liveFiles.filter((f) => f !== "provenance.json")) {
    const match = /^(\d{8}T\d{6}Z)-(.+)\.json$/.exec(file);
    if (!match) {
      failures.push(`captures/${LIVE_SCENARIO}/${file}: not <runstamp>-<phase>.json`);
      continue;
    }
    const buffer = readFileSync(join(LIVE_DIR, file));
    let envelope;
    try {
      envelope = JSON.parse(buffer.toString("utf8"));
    } catch (error) {
      failures.push(`captures/${LIVE_SCENARIO}/${file}: unparseable JSON (${error.message})`);
      continue;
    }
    if (envelope?.scenario?.scenarioId !== LIVE_SCENARIO)
      failures.push(`captures/${LIVE_SCENARIO}/${file}: scenario.scenarioId is ${JSON.stringify(envelope?.scenario?.scenarioId)}`);
    if (envelope?.scenario?.phase !== match[2])
      failures.push(`captures/${LIVE_SCENARIO}/${file}: scenario.phase ${JSON.stringify(envelope?.scenario?.phase)} does not match filename phase "${match[2]}"`);
    files.push({
      phase: match[2],
      path: `${LIVE_SCENARIO}/${file}`,
      runstamp: match[1],
      capturedAt: envelope?.capturedAt ?? null,
      sha256: sha256(buffer)
    });
  }
  if (files.length === 0) failures.push(`captures/${LIVE_SCENARIO}/: no phase captures found`);
  liveCaptures = {
    scenarioId: LIVE_SCENARIO,
    collector: {
      kind: "chrome-devtools-mcp",
      interface: "generic-devtools",
      webMcpUsed: false,
      sanitization: "lossless"
    },
    provenance,
    files
  };
}

if (failures.length > 0) {
  for (const failure of failures) console.error(`manifest: ${failure}`);
  process.exit(1);
}

const runId = captures.map((c) => c.runstamp).sort().at(-1);

const manifest = {
  schemaVersion: "lab-lossless-corpus/1",
  runId,
  createdAt: new Date().toISOString(),
  source: {
    playground: {
      repository: corpus.repository,
      branch: git(playgroundDir, "branch", "--show-current"),
      commit: git(playgroundDir, "rev-parse", "HEAD"),
      runner: corpus.runner
    },
    orchestratorCommit: [...orchestratorCommits][0],
    probe: {
      file: corpus.probe,
      schemaVersion: "lab-lossless-capture/1",
      sha256: sha256(readFileSync(PROBE_PATH))
    }
  },
  collector: { ...corpus.collector, sanitization: "lossless" },
  serving: {
    mode: "run-scenario-single-origin",
    origin: "http://localhost:4300",
    cacheControl: "no-store"
  },
  expectedScenarios: EXPECTED_SCENARIOS,
  captures
};
if (liveCaptures) manifest.liveCaptures = liveCaptures;

writeFileSync(MANIFEST_PATH, JSON.stringify(manifest, null, 2) + "\n");
console.log(
  `wrote captures/${corpus.manifest} (runId ${runId}, ${captures.length} captures` +
    (liveCaptures ? `, ${liveCaptures.files.length} live phases` : "") +
    `)`
);
