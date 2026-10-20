import { acceptsTag } from '../semver-range';
import { owningPackage } from './derive-grouping-facets';
import type { TagPool } from './grouping-model';
import type { CanonicalRegistryEvidence, VersionRegistration } from './model';
import type {
  PoolBuildBand,
  PoolConsumer,
  PoolFamily,
  PoolFamilyMember,
  PoolMiss,
  PoolPlacement,
  PoolRangeRejection,
  PoolStatusCell,
  PoolStatusMatrix,
  PoolStatusRow,
  PoolSurfaceEntry,
  PoolVerdict,
} from './pool-family-model';

interface MemberRow {
  remote: string;
  member: string;
  tag: string;
  requiredVersion: string;
  strictVersion: boolean;
  action: VersionRegistration['action'];
  poolTag: string | null;
  servedBy: string | null;
  poolCause: string | null;
  specifiers: string[];
}

// Specifier → tag, where an unlisted entrypoint is pinned by its package's tag (the orchestrator's
// `SpecifierTags.pinnedTag`).
class SpecifierTags extends Map<string, string> {
  private readonly packages = new Map<string, string>();

  override set(specifier: string, tag: string): this {
    super.set(specifier, tag);
    const pkg = owningPackage(specifier) ?? specifier;
    if (!this.packages.has(pkg)) this.packages.set(pkg, tag);
    return this;
  }

  pinnedTag(specifier: string): string | undefined {
    return this.get(specifier) ?? this.packages.get(owningPackage(specifier) ?? specifier);
  }
}

/**
 * Family view of every tag pool. Where each remote runs is read off the rows pooling wrote back
 * (orchestrator 4.8 `pooling/records.ts`); why is recomputed against what the global map serves,
 * following `pooling/election.ts` `missOf` and `pooling/rules.ts`. See docs/resolution-data-model.md.
 */
export function derivePoolFamilies(
  evidence: CanonicalRegistryEvidence,
  tagPools: readonly TagPool[],
  hostRemote: string,
  undecidedScopes: readonly string[] = [],
): PoolFamily[] {
  const externalById = new Map(evidence.sharedExternals.map((e) => [e.id, e]));
  const registrationById = new Map(evidence.versionRegistrations.map((r) => [r.id, r]));
  const declarationById = new Map(evidence.participantDeclarations.map((d) => [d.id, d]));
  const candidateById = new Map(evidence.entrypointCandidates.map((c) => [c.id, c]));

  return tagPools.map((pool) => {
    const externals = pool.sharedExternalIds.map((id) => externalById.get(id)!);
    const rowsByMember = new Map<string, MemberRow[]>();
    const surface: PoolSurfaceEntry[] = [];
    for (const external of externals) {
      const member = external.packageName;
      const rows: MemberRow[] = [];
      rowsByMember.set(member, rows);
      const registrations = external.versionRegistrationIds.map((id) => registrationById.get(id)!);
      for (const registration of registrations) {
        for (const declaration of registration.participantDeclarationIds.map((id) =>
          declarationById.get(id)!,
        )) {
          // A remote ships one copy per member; a second row is a record it cannot produce.
          if (rows.some((row) => row.remote === declaration.participant)) continue;
          rows.push({
            remote: declaration.participant,
            member,
            tag: registration.tag,
            requiredVersion: declaration.requiredVersion,
            strictVersion: declaration.strictVersion,
            action: registration.action,
            poolTag: declaration.pool?.trim() || null,
            servedBy: declaration.servedBy,
            poolCause: declaration.poolCause,
            specifiers: declaration.entrypointCandidateIds.map(
              (id) => candidateById.get(id)!.specifier,
            ),
          });
        }
      }
      // The global map serves the serving build's copy at its `share` tag (4.8 `servingBuild`),
      // else the first participant of the `share` row.
      const shared = registrations.find((r) => r.action === 'share');
      if (shared === undefined) continue;
      const participants = shared.participantDeclarationIds.map(
        (id) => declarationById.get(id)!.participant,
      );
      const build =
        external.servingBuild !== null && participants.includes(external.servingBuild)
          ? external.servingBuild
          : participants[0];
      const copy = rows.find((row) => row.remote === build);
      for (const specifier of copy?.specifiers ?? [])
        surface.push({ specifier, member, tag: shared.tag, build });
    }

    const surfaceTags = new SpecifierTags();
    for (const entry of surface)
      if (!surfaceTags.has(entry.specifier)) surfaceTags.set(entry.specifier, entry.tag);
    const memberSurface = new Map<string, { tag: string; build: string }>();
    for (const entry of surface)
      if (!memberSurface.has(entry.member)) memberSurface.set(entry.member, entry);

    const rowsOf = (remote: string) =>
      pool.members.flatMap((member) => {
        const row = rowsByMember.get(member)?.find((r) => r.remote === remote);
        return row === undefined ? [] : [row];
      });
    const builds = pool.remotes.map((remote) => {
      const tags = new SpecifierTags();
      for (const row of rowsOf(remote))
        for (const specifier of row.specifiers)
          if (!tags.has(specifier)) tags.set(specifier, row.tag);
      return tags;
    });

    const members: PoolFamilyMember[] = pool.members.map((packageName) => {
      const rows = rowsByMember.get(packageName) ?? [];
      const owner = owningPackage(packageName);
      return {
        packageName,
        followsPackage:
          rows.every((row) => row.poolTag === null) &&
          owner !== undefined &&
          pool.members.includes(owner)
            ? owner
            : null,
        unshared: !memberSurface.has(packageName) && !rows.some((row) => row.servedBy !== null),
        scopedRemotes: [
          ...new Set(rows.filter((row) => row.action === 'scope').map((row) => row.remote)),
        ].sort(compareText),
      };
    });

    const consumers: PoolConsumer[] = pool.remotes.map((remote) => {
      const rows = rowsOf(remote);
      const placement = placementOf(rows);
      const miss = missOf(rows, surfaceTags, builds);
      const storedCauses = [...new Set(rows.flatMap((row) => row.poolCause ?? []))];
      const storedCause = storedCauses.length === 1 ? storedCauses[0] : null;
      return {
        remote,
        host: remote === hostRemote,
        placement,
        miss,
        storedCause,
        consistent: consistentOf(remote, placement, miss, storedCause),
        servingBuilds: Object.fromEntries(
          rows.map((row) => [
            row.member,
            row.action === 'scope'
              ? remote
              : (row.servedBy ?? memberSurface.get(row.member)?.build ?? remote),
          ]),
        ),
      };
    });

    const rowOf = (remote: string, member: string) =>
      rowsByMember.get(member)?.find((row) => row.remote === remote);
    const winner = externals.find((e) => e.poolWinner !== null)?.poolWinner ?? null;
    return {
      poolId: pool.id,
      members,
      winner,
      globalSurface: [...surface].sort((a, b) => compareText(a.specifier, b.specifier)),
      statusMatrix: statusMatrixOf(pool, members, consumers, rowOf, memberSurface, winner),
      consumers,
      pending:
        externals.some((external) => external.dirty) || undecidedScopes.includes(pool.shareScope),
      recorded: externals.some((external) => external.poolName !== null),
    };
  });
}

function placementOf(rows: readonly MemberRow[]): PoolPlacement {
  const scoped = rows.filter((row) => row.action === 'scope').length;
  if (rows.length > 0 && scoped === rows.length) return { kind: 'self' };
  if (scoped > 0) return { kind: 'unknown' };
  const owner = rows.find((row) => row.servedBy !== null)?.servedBy ?? null;
  return owner === null ? { kind: 'global' } : { kind: 'subpool', owner };
}

function missOf(
  rows: readonly MemberRow[],
  surface: SpecifierTags,
  builds: readonly SpecifierTags[],
): PoolMiss | null {
  const rejections: PoolRangeRejection[] = [];
  for (const row of rows)
    for (const specifier of row.specifiers) {
      const tag = surface.get(specifier);
      if (tag === undefined || acceptsTag(tag, row.tag, row.requiredVersion) !== false) continue;
      rejections.push({
        member: row.member,
        specifier,
        tag,
        requiredVersion: row.requiredVersion,
        strict: row.strictVersion,
      });
    }
  if (rejections.length > 0)
    return {
      kind: 'range',
      rejections: rejections.sort((a, b) => Number(b.strict) - Number(a.strict)),
    };

  const specifiers = rows.flatMap((row) => row.specifiers);
  const missing = specifiers.filter((specifier) => !surface.has(specifier));
  if (missing.length > 0) return { kind: 'coverage', missing };

  // `rules.ts` `unwitnessedGap`: some build must ship the whole combination at the surface's tags.
  let gap = -1;
  for (const build of builds) {
    const miss = specifiers.findIndex((s) => build.pinnedTag(s) !== surface.get(s));
    if (miss === -1) return null;
    gap = Math.max(gap, miss);
  }
  return gap === -1 ? null : { kind: 'unshipped', gap: specifiers[gap] };
}

const causeOf = (miss: PoolMiss | null): string | null =>
  miss === null ? null : miss.kind === 'range' ? 'incompatible' : 'uncovered';

function consistentOf(
  remote: string,
  placement: PoolPlacement,
  miss: PoolMiss | null,
  storedCause: string | null,
): boolean {
  switch (placement.kind) {
    case 'global':
      return miss === null;
    case 'subpool':
      return placement.owner === remote || miss !== null;
    case 'self':
      return miss !== null && (storedCause === null || storedCause === causeOf(miss));
    case 'unknown':
      return false;
  }
}

type RowOf = (remote: string, member: string) => MemberRow | undefined;
type MemberSurface = ReadonlyMap<string, { tag: string; build: string }>;

function bandKeyOf(
  consumer: PoolConsumer,
  globalOwner: string | null,
): { kind: PoolBuildBand['kind']; owner: string | null } {
  switch (consumer.placement.kind) {
    case 'global':
      return { kind: 'global', owner: globalOwner };
    case 'subpool':
      return { kind: 'subpool', owner: consumer.placement.owner };
    case 'self':
      return { kind: 'isolated', owner: consumer.remote };
    case 'unknown':
      return { kind: 'unknown', owner: null };
  }
}

function statusMatrixOf(
  pool: TagPool,
  members: readonly PoolFamilyMember[],
  consumers: readonly PoolConsumer[],
  rowOf: RowOf,
  memberSurface: MemberSurface,
  winner: string | null,
): PoolStatusMatrix {
  // Before 4.8 no winner is stored; the build serving the first shared member stands in.
  const globalOwner = winner ?? [...memberSurface.values()][0]?.build ?? null;
  const bands = new Map<
    string,
    { kind: PoolBuildBand['kind']; owner: string | null; consumers: PoolConsumer[] }
  >();
  for (const consumer of consumers) {
    const { kind, owner } = bandKeyOf(consumer, globalOwner);
    const key = JSON.stringify([kind, owner]);
    const band = bands.get(key) ?? { kind, owner, consumers: [] };
    bands.set(key, band);
    band.consumers.push(consumer);
  }

  const unshared = new Set(members.filter((m) => m.unshared).map((m) => m.packageName));
  const rowFor = (
    consumer: PoolConsumer,
    owner: string | null,
    servesOthers: boolean,
  ): PoolStatusRow => {
    const placement = consumer.placement;
    const cells = pool.members.map((member): PoolStatusCell | null => {
      const row = rowOf(consumer.remote, member);
      if (row === undefined) return null;
      const sharedTag = memberSurface.get(member)?.tag ?? null;
      const acceptsShared =
        sharedTag === null ? null : acceptsTag(sharedTag, row.tag, row.requiredVersion);
      const servedTag =
        placement.kind === 'self'
          ? row.tag
          : placement.kind === 'subpool'
            ? (rowOf(placement.owner, member)?.tag ?? row.tag)
            : (sharedTag ?? row.tag);
      const state: PoolStatusCell['state'] =
        row.strictVersion && acceptsShared === false
          ? 'conflict'
          : placement.kind === 'self'
            ? 'isolated'
            : unshared.has(member)
              ? 'not-shared'
              : servesOthers && consumer.remote === owner
                ? 'serves-others'
                : 'unchanged';
      return {
        state,
        servedTag,
        declaredTag: row.tag,
        requiredVersion: row.requiredVersion,
        strictVersion: row.strictVersion,
        sharedTag,
        acceptsShared,
      };
    });
    return {
      remote: consumer.remote,
      host: consumer.host,
      tag:
        pool.members
          .map((member) => rowOf(consumer.remote, member)?.poolTag ?? null)
          .find((t) => t !== null) ?? null,
      redirected: placement.kind === 'subpool' && placement.owner !== consumer.remote,
      cells,
    };
  };

  const kindOrder = { global: 0, subpool: 1, isolated: 2, unknown: 3 };
  const built: PoolBuildBand[] = [...bands.values()]
    .map(({ kind, owner, consumers: inBand }) => {
      const ordered = [...inBand].sort(
        (a, b) => Number(b.remote === owner) - Number(a.remote === owner),
      );
      const servesOthers =
        kind === 'global' || kind === 'subpool'
          ? ordered.filter((c) => c.remote !== owner).length
          : 0;
      const rows = ordered.map((c) => rowFor(c, owner, servesOthers > 0));
      return {
        kind,
        owner,
        rows,
        servesOthers,
        redirected: rows.filter((row) => row.redirected).length,
        hostPrecedence: ordered.some((c) => c.host && c.remote === owner),
      };
    })
    .sort(
      (a, b) =>
        kindOrder[a.kind] - kindOrder[b.kind] ||
        b.rows.length - a.rows.length ||
        Number(b.hostPrecedence) - Number(a.hostPrecedence) ||
        compareText(a.owner ?? '', b.owner ?? ''),
    );

  return { bands: built, verdict: verdictOf(built, consumers) };
}

function verdictOf(
  bands: readonly PoolBuildBand[],
  consumers: readonly PoolConsumer[],
): PoolVerdict {
  const isolatedBands = bands.filter((b) => b.kind === 'isolated');
  const isolated = consumers.filter((c) => c.placement.kind === 'self');
  const conflicts = isolatedBands.reduce(
    (sum, b) => sum + b.rows.flatMap((r) => r.cells).filter((c) => c?.state === 'conflict').length,
    0,
  );
  const storedCauses = new Set(isolated.map((c) => c.storedCause));

  const redirected = consumers.filter(
    (c) => c.placement.kind === 'subpool' && c.placement.owner !== c.remote,
  );
  const anchors = [
    ...new Set(
      redirected.flatMap((c) => (c.placement.kind === 'subpool' ? [c.placement.owner] : [])),
    ),
  ].sort(compareText);
  const redirectCauses = new Set(redirected.map((c) => causeOf(c.miss)));

  return {
    kind: isolated.length > 0 ? 'isolated' : redirected.length > 0 ? 'redirected' : 'one-build',
    isolated:
      isolated.length > 0
        ? {
            remotes: isolated.map((c) => c.remote).sort(compareText),
            conflicts,
            cause: storedCauses.size === 1 ? [...storedCauses][0] : null,
          }
        : null,
    redirected:
      redirected.length > 0
        ? {
            remotes: redirected.map((c) => c.remote).sort(compareText),
            anchors,
            cause: redirectCauses.size === 1 ? [...redirectCauses][0] : null,
          }
        : null,
    builds: bands
      .filter((b) => b.kind === 'global' || b.kind === 'subpool')
      .flatMap((b) => (b.owner === null ? [] : [b.owner])),
  };
}

function compareText(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}
