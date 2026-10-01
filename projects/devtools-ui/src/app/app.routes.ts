import { Routes } from '@angular/router';

import { environment } from '../environments/environment';
import { GraphView } from './views/graph/graph';
import { ImportMapView } from './views/import-map/import-map';
import { PackagesView } from './views/packages/packages';
import { PoolsView } from './views/pools/pools';
import { RemotesView } from './views/remotes/remotes';
import { ViewPlaceholder } from './views/placeholder';

/**
 * V2 tab set (spec order); `/packages` is the default view.
 *
 * Cross-link selection convention: each view owns an optional `select`
 * query parameter carrying its initial selection —
 *   /packages?select=<scope>|<pkg>
 *   /remotes?select=<remote>
 *   /import-map?select=<specifier>
 *   /pools?select=<tag pool ID>
 * Views (Tasks 10–13) read it on entry; cross-view links (e.g. from
 * Diagnostics) navigate with it.
 */
export const routes: Routes = [
  { path: '', pathMatch: 'full', redirectTo: 'packages' },
  { path: 'packages', component: PackagesView },
  { path: 'remotes', component: RemotesView },
  { path: 'import-map', component: ImportMapView },
  { path: 'graph', component: GraphView },
  { path: 'pools', component: PoolsView },
  // Hidden from the nav until resolution-model Task 10 (canonical
  // Diagnostics) lands; stays reachable by direct URL (no redirect).
  { path: 'diagnostics', component: ViewPlaceholder, data: { title: 'Diagnostics' } },
  // Dev-only additions (e.g. /kit-demo); empty in the extension build.
  ...environment.extraRoutes,
];
