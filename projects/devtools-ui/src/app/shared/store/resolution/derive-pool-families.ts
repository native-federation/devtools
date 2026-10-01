import { satisfiesRange } from '../semver-range';
import { owningPackage } from './derive-grouping-facets';
import type { TagPool } from './grouping-model';
import type { CanonicalRegistryEvidence, VersionRegistration } from './model';
import type {
  PoolBuildBand,
  PoolConsumer,
  PoolConsumerOutcome,
  PoolFamily,
  PoolFamilyMember,
  PoolStatusCell,
  PoolStatusMatrix,
  PoolStatusRow,
  PoolVerdict,
} from './pool-family-model';

interface MemberRow {
  remote: string;
  tag: string;
  requiredVersion: string;
  strictVersion: boolean;
  action: VersionRegistration['action'];
  poolTag: string | null;
  servedBy: string | null;
  poolCause: string | null;
  specifiers: string[];
}

/**
 * Family view of every tag pool, read off the rows pooling wrote back
 * (`rebuildMember` in the orchestrator's `pool-shared-externals.ts`): who
 * serves each consumer each member, and whether the resolved combination is
 * one some single build shipped (the `findTornRemotes` contract).
 */
export function derivePoolFamilies(
  evidence: CanonicalRegistryEvidence,
  tagPools: readonly TagPool[],
  hostRemote: string,
): PoolFamily[] {
  const externalById = new Map(evidence.sharedExternals.map((e) => [e.id, e]));
  const registrationById = new Map(evidence.versionRegistrations.map((r) => [r.id, r]));
  const declarationById = new Map(evidence.participantDeclarations.map((d) => [d.id, d]));
  const candidateById = new Map(evidence.entrypointCandidates.map((c) => [c.id, c]));

  return tagPools.map((pool) => {
    const externals = pool.sharedExternalIds.map((id) => externalById.get(id)!);
    const rowsByMember = new Map<string, MemberRow[]>();
    // The global mapping publishes the first participant of the `share` row (`remotes[0]`).
    const basisByMember = new Map<string, { remote: string; tag: string }>();
    for (const external of externals) {
      const rows = rowsByMember.get(external.packageName) ?? [];
      rowsByMember.set(external.packageName, rows);
      for (const registration of external.versionRegistrationIds.map((id) =>
        registrationById.get(id)!,
      )) {
        const declarations = registration.participantDeclarationIds.map((id) =>
          declarationById.get(id)!,
        );
        if (
          registration.action === 'share' &&
          declarations.length > 0 &&
          !basisByMember.has(external.packageName)
        ) {
          basisByMember.set(external.packageName, {
            remote: declarations[0].participant,
            tag: registration.tag,
          });
        }
        for (const declaration of declarations) {
          rows.push({
            remote: declaration.participant,
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
    }

    const rowOf = (remote: string, member: string) =>
      rowsByMember.get(member)?.find((row) => row.remote === remote);
    const servingBuildOf = (row: MemberRow, member: string): string => {
      if (row.action === 'scope') return row.remote;
      if (row.servedBy !== null) return row.servedBy;
      return basisByMember.get(member)?.remote ?? row.remote;
    };
    // Every build's own specifier → tag table, `scope` rows included: a build is coherent by construction.
    const buildTags = new Map<string, Map<string, string>>();
    for (const [, rows] of rowsByMember) {
      for (const row of rows) {
        const tags = buildTags.get(row.remote) ?? new Map<string, string>();
        buildTags.set(row.remote, tags);
        for (const specifier of row.specifiers)
          if (!tags.has(specifier)) tags.set(specifier, row.tag);
      }
    }
    const shipped = (combination: Map<string, string>) =>
      [...buildTags.values()].some((tags) =>
        [...combination].every(([spec, tag]) => tags.get(spec) === tag),
      );
    const listOf = (combination: Map<string, string>) =>
      [...combination].map(([spec, tag]) => `${spec}@${tag}`).sort(compareText);

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
        unshared: !rows.some((row) => row.action === 'share'),
        scopedRemotes: [
          ...new Set(rows.filter((row) => row.action === 'scope').map((row) => row.remote)),
        ].sort(compareText),
      };
    });

    const consumers: PoolConsumer[] = pool.remotes.map((remote) => {
      const consumed = pool.members.flatMap((member) => {
        const row = rowOf(remote, member);
        return row === undefined ? [] : [{ member, row }];
      });
      const servingBuilds = Object.fromEntries(
        consumed.map(({ member, row }) => [member, servingBuildOf(row, member)]),
      );
      const combination = new Map<string, string>();
      for (const { member, row } of consumed) {
        const servedTag = rowOf(servingBuilds[member], member)?.tag ?? row.tag;
        for (const specifier of row.specifiers) combination.set(specifier, servedTag);
      }
      const outcome = outcomeOf(
        remote,
        consumed.map(({ row }) => row),
        Object.values(servingBuilds),
      );
      const host = remote === hostRemote;
      return {
        remote,
        host,
        outcome,
        poolCauses: causesOf(consumed),
        servingBuilds,
        coherent: host ? null : combination.size === 0 || shipped(combination),
        combination: listOf(combination),
      };
    });

    return {
      poolId: pool.id,
      members,
      statusMatrix: statusMatrixOf(pool, members, consumers, rowOf, basisByMember),
      consumers,
      pending: externals.some((external) => external.dirty),
      recorded: externals.some((external) => external.poolName !== null),
    };
  });
}

type RowOf = (remote: string, member: string) => MemberRow | undefined;
type BasisByMember = ReadonlyMap<string, { remote: string; tag: string }>;

// Bands group consumers by the build they load: one serving build → that build; `own-copy` →
// isolated on its own build; several builds → the ownerless mixed band. See Stage 2 Task 10.
function statusMatrixOf(
  pool: TagPool,
  members: readonly PoolFamilyMember[],
  consumers: readonly PoolConsumer[],
  rowOf: RowOf,
  basisByMember: BasisByMember,
): PoolStatusMatrix {
  const bandOf = (
    consumer: PoolConsumer,
  ): { kind: PoolBuildBand['kind']; owner: string | null } => {
    if (consumer.outcome === 'own-copy') return { kind: 'isolated', owner: consumer.remote };
    const builds = new Set(Object.values(consumer.servingBuilds));
    if (consumer.outcome === 'mixed-builds' || builds.size > 1)
      return { kind: 'mixed', owner: null };
    return { kind: 'shared', owner: [...builds][0] ?? consumer.remote };
  };
  const bands = new Map<
    string,
    { kind: PoolBuildBand['kind']; owner: string | null; consumers: PoolConsumer[] }
  >();
  for (const consumer of consumers) {
    const { kind, owner } = bandOf(consumer);
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
    const cells = pool.members.map((member): PoolStatusCell | null => {
      const row = rowOf(consumer.remote, member);
      if (row === undefined) return null;
      const sharedTag = basisByMember.get(member)?.tag ?? null;
      const acceptsShared =
        sharedTag === null ? null : satisfiesRange(sharedTag, row.requiredVersion);
      const state: PoolStatusCell['state'] =
        row.strictVersion && acceptsShared === false
          ? 'conflict'
          : consumer.outcome === 'own-copy'
            ? 'isolated'
            : unshared.has(member)
              ? 'not-shared'
              : servesOthers && consumer.remote === owner
                ? 'serves-others'
                : 'unchanged';
      return {
        state,
        servedTag: rowOf(consumer.servingBuilds[member], member)?.tag ?? row.tag,
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
      redirected: consumer.outcome === 'redirected',
      cells,
    };
  };

  const kindOrder = { shared: 0, isolated: 1, mixed: 2 };
  const built: PoolBuildBand[] = [...bands.values()]
    .map(({ kind, owner, consumers: inBand }) => {
      const ordered = [...inBand].sort(
        (a, b) => Number(b.remote === owner) - Number(a.remote === owner),
      );
      const servesOthers = kind === 'shared' ? ordered.filter((c) => c.remote !== owner).length : 0;
      return {
        kind,
        owner,
        rows: ordered.map((c) => rowFor(c, owner, servesOthers > 0)),
        servesOthers,
        redirected: ordered.filter((c) => c.outcome === 'redirected').length,
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

  return { bands: built, verdict: verdictOf(built, consumers, basisByMember) };
}

function verdictOf(
  bands: readonly PoolBuildBand[],
  consumers: readonly PoolConsumer[],
  basisByMember: BasisByMember,
): PoolVerdict {
  const torn = consumers.filter((c) => c.coherent === false).map((c) => c.remote);

  const isolatedBands = bands.filter((b) => b.kind === 'isolated');
  const isolatedRemotes = new Set(isolatedBands.map((b) => b.owner!));
  const conflicts = isolatedBands.reduce(
    (sum, b) => sum + b.rows.flatMap((r) => r.cells).filter((c) => c?.state === 'conflict').length,
    0,
  );
  const storedCauses = new Set(
    consumers
      .filter((c) => isolatedRemotes.has(c.remote))
      .flatMap((c) => c.poolCauses.map((p) => p.cause)),
  );
  const cause =
    storedCauses.size === 1 ? [...storedCauses][0] : conflicts > 0 ? 'incompatible' : null;

  const redirected = consumers.filter((c) => c.outcome === 'redirected');
  const anchors = [...new Set(redirected.flatMap((c) => Object.values(c.servingBuilds)))].sort(
    compareText,
  );
  const mixes = [
    ...new Set(
      redirected.flatMap((c) =>
        Object.keys(c.servingBuilds).flatMap((member) => basisByMember.get(member)?.remote ?? []),
      ),
    ),
  ].sort(
    (a, b) =>
      Number(isHostName(b, consumers)) - Number(isHostName(a, consumers)) || compareText(a, b),
  );

  return {
    kind:
      torn.length > 0
        ? 'torn'
        : isolatedRemotes.size > 0
          ? 'isolated'
          : redirected.length > 0
            ? 'redirected'
            : 'one-build',
    torn,
    isolated:
      isolatedRemotes.size > 0
        ? { remotes: [...isolatedRemotes].sort(compareText), conflicts, cause }
        : null,
    redirected:
      redirected.length > 0
        ? { remotes: redirected.map((c) => c.remote).sort(compareText), anchors, mixes }
        : null,
    builds: bands.filter((b) => b.kind === 'shared').map((b) => b.owner!),
  };
}

function isHostName(remote: string, consumers: readonly PoolConsumer[]): boolean {
  return consumers.some((c) => c.host && c.remote === remote);
}

function causesOf(consumed: { member: string; row: MemberRow }[]): PoolConsumer['poolCauses'] {
  const members = new Map<string, string[]>();
  for (const { member, row } of consumed) {
    if (row.poolCause !== null)
      members.set(row.poolCause, [...(members.get(row.poolCause) ?? []), member]);
  }
  return [...members]
    .sort(([a], [b]) => compareText(a, b))
    .map(([cause, names]) => ({ cause, members: names }));
}

function outcomeOf(
  remote: string,
  rows: MemberRow[],
  servingBuilds: string[],
): PoolConsumerOutcome {
  if (rows.length > 0 && rows.every((row) => row.action === 'scope')) return 'own-copy';
  if (rows.some((row) => row.servedBy !== null && row.servedBy !== remote)) return 'redirected';
  return new Set(servingBuilds).size <= 1 ? 'one-build' : 'mixed-builds';
}

function compareText(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}
