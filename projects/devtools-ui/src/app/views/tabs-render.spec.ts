/**
 * Every tab's view model builds for every fixture, with every package and
 * remote selected (pools-v48 T3-AC-03). The corpus spans orchestrator 4.6
 * (v2 corpus), the live v4 page and 4.8, plus a clone carrying the stored
 * values 4.8 removed (`poolCause: 'torn' | 'unshared'`), so older pages must
 * still render, just without explanations specific to them.
 */
import { describe, expect, it } from 'vitest';
import { FIXTURES, type FixtureId, type SnapshotV1 } from 'devtools-bridge';

import { ingestSnapshot } from '../shared/store/ingest';
import { buildGraphModel } from './graph/graph-model';
import { buildImportMapVm } from './import-map/import-map-view-model';
import { buildPackagesVm } from './packages/packages-view-model';
import { packageId } from './packages/packages-vm-shared';
import { buildPoolsVm } from './pools/pools-view-model';
import { buildRemotesVm } from './remotes/remotes-view-model';

// pool-showcase on 4.7 stored `unshared` on dashboard's chart-core and could store `torn`.
function with47Causes(): SnapshotV1 {
  const snapshot: SnapshotV1 = structuredClone(FIXTURES['pool-showcase']);
  const externals = snapshot.runtime!.sharedExternals['__GLOBAL__'];
  for (const remote of externals['@nf-lab/chart-core'].versions.flatMap((v) => v.remotes))
    if (remote.name === 'dashboard') remote.poolCause = 'unshared';
  for (const remote of externals['@nf-lab/ui-dom'].versions.flatMap((v) => v.remotes))
    remote.poolCause = 'torn';
  return snapshot;
}

function renderEveryTab(snapshot: SnapshotV1): void {
  const model = ingestSnapshot(snapshot);
  const projection = model.resolutionProjection;
  for (const verdicts of projection.packageScopeVerdicts) {
    buildPackagesVm(model, {
      filter: 'all',
      selectedParticipant: null,
      selectedId: packageId(verdicts.shareScope, verdicts.packageName),
    });
  }
  for (const remote of projection.remotes) buildRemotesVm(model, { selectedName: remote.name });
  for (const entry of model.importMapEntries)
    buildImportMapVm(model, { selected: entry.specifier });
  buildImportMapVm(model, { selected: null });
  buildPoolsVm(projection, snapshot.runtimeSource?.orchestratorVersion ?? null);
  buildGraphModel(projection);
}

describe('every tab renders every capture', () => {
  it.each(Object.keys(FIXTURES) as FixtureId[])('%s', (id) => {
    expect(() => renderEveryTab(FIXTURES[id])).not.toThrow();
  });

  it('a 4.7 record with the removed torn / unshared causes', () => {
    expect(() => renderEveryTab(with47Causes())).not.toThrow();
    const vm = buildPoolsVm(ingestSnapshot(with47Causes()).resolutionProjection, '4.7.0');
    expect(vm.pools.length).toBeGreaterThan(0);
  });
});
