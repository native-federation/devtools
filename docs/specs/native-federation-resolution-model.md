# Native Federation DevTools — Resolution Model

Status: **approved for implementation** (2026-08-14)

> **Orchestrator 4.8 (2026-10-20, branch `pools-v48`):** 4.8 never borrows an entrypoint from
> another build, so the `self-filled` mapping state and the `self-filled-source` role described
> below were removed; a pre-4.8 self-fill now reads as `own-selected` / `not-selected`. See
> `docs/resolution-data-model.md` for the current model.

Branch: `feature/resolution-model`

Evidence baseline:

- lossless corpus `lab-lossless-corpus/1`, run `20260813T151211Z`;
- orchestrator `v4.6.0`, commit `8e5e0b3013de410ab8e26bd4d69dc847415776b1`;
- maintainer-supplied `DEPENDENCY-GRAPH.md`, SHA-256
  `5977479c34433256c89790a2ab2a3068817a11b24a39a764a480b7d486f693d3`,
  treated as an external challenger whose source/version and redistribution
  permission are not yet recorded.

This specification defines the canonical interpretation between `SnapshotV1` and
all user-facing projections. It corrects a cardinality error in V2: a registry
version row may contain several participant declarations, but the current store
flattens those declarations into peer rows and later counts them as versions,
copies, and providers.

The keywords **MUST**, **MUST NOT**, **SHOULD**, and **MAY** are normative.

## 1. Scope and supersession

This specification is intentionally narrower than a graph feature. It defines:

- the vocabulary and stable identities for registry registrations,
  declarations, candidate files, consumer resolutions, and resolved copies;
- the evidence boundary between the runtime registry and the effective import
  map;
- the separate meanings of registry basis, explicit pool anchor, observed map
  target owner, and runtime delivery;
- the semantics the Store, derivations, Packages, Remotes, Import Map, and
  Diagnostics projections MUST share;
- the evidence and migration gates that precede implementation;
- the sole model a future dependency graph is allowed to consume.

This specification normatively supersedes these V2 conclusions:

- `docs/specs/native-federation-devtools-v2.md` §2.1 and §7 J: corpus absence
  does not make `pool` and `servedBy` unsupported or safe to drop;
- V2 §3's participant-flattened core relation;
- V2 §3's participant-level own/winner arrows and any use of one
  participant row as one version or one resolved copy;
- any Packages or Remotes wording that counts participant declarations as
  versions or treats every non-`skip` participant as a provider.

All other V2 decisions remain in force unless they conflict with a rule here.
In particular, capture remains passive, raw evidence layers remain separate,
derived fields retain provenance, and resolution is not runtime use.
The checkpoint in `docs/work/v2/plan.md:14-21` remains authoritative: V2 Tasks
13–15 are deferred and MUST NOT be executed from their current wording.

### 1.1 Non-goals

This work does not:

- render the dependency graph or decide its geometry, palette, grouping,
  filtering, or interactions;
- fetch remote-entry bodies, inspect network requests, or instrument module
  execution;
- replay or replace the orchestrator's resolver;
- mutate the inspected page or its import maps;
- infer pooling, providers, or copies from filenames, `cached`, participant
  count, participant order, or an unqualified `pool` label;
- commit the external maintainer document into this repository without its
  provenance and redistribution permission being established.

## 2. Evidence doctrine

### 2.1 Precedence

Claims use this evidence hierarchy:

1. **Real capture evidence** proves an observed runtime shape or mapping for the
   captured scenario and pinned provenance.
2. **Pinned orchestrator source** proves supported semantics at the pinned
   source revision, including branches the corpus has not exercised.
3. **Maintainer document** challenges the model and contributes product
   requirements, but is not an oracle.
4. **Assumption** is explicit, testable, and never silently promoted to fact.

Corpus absence is an observation, not proof that the pinned runtime cannot emit
a field. A source-supported but unobserved branch stays representable and gets a
missing-witness gate. If real capture and source interpretation conflict, the
capture governs what the collector must accept; the conflict is retained as a
diagnostic or open claim rather than reconciled by guessing.

### 2.2 Evidence classes

Every non-raw fact in the canonical model MUST carry one of these classes plus
a concrete locator or derivation rule:

| Class                         | Meaning                                                                         |
| ----------------------------- | ------------------------------------------------------------------------------- |
| `capture-confirmed`           | Directly present in a real capture.                                             |
| `source-confirmed`            | Directly established by the pinned source revision.                             |
| `source-confirmed-unobserved` | Supported by pinned source but absent from the current corpus.                  |
| `derived-from-capture`        | Deterministically computed from captured values by a named rule.                |
| `maintainer-asserted`         | Claimed by the challenger document and not independently established.           |
| `conflicts-with-capture`      | A stronger claim contradicted or bounded by capture evidence.                   |
| `future-feature-only`         | Useful product intent outside this model's current evidence.                    |
| `assumption`                  | Explicitly provisional and paired with a validation route.                      |
| `normative-decision`          | An architecture constraint adopted here rather than an empirical runtime claim. |

Derived records MUST retain references to every raw record and import-map entry
that contributed to them. Views MUST be able to explain a result without
re-reading or reinterpreting the raw snapshot.

### 2.3 Evidence layers remain separate

The pipeline is:

```text
runtime registry evidence ─┐
                           ├─> canonical resolution derivation ─> views
effective import-map evidence ┘                                  └─> future graph
```

`SnapshotV1.runtime` and `SnapshotV1.importMaps` MUST remain separate evidence
layers. Ingest MAY index and join them, but MUST NOT overwrite either with the
result of the join. The canonical model contains raw normalized records and
separate derived resolution records.

## 3. Vocabulary and cardinalities

The following terms are reserved:

| Term                              | Cardinality and meaning                                                                                                                                                                                     |
| --------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Share scope**                   | A registry resolution domain such as `__GLOBAL__`, `strict`, or a named scope. It is not an import-map URL scope and not an external pool.                                                                  |
| **Shared external record**        | Exactly one package wrapper under `(shareScope, package)`. It owns `dirty` and an ordered list of version registrations.                                                                                    |
| **Version registration**          | Exactly one stored `versions[]` element under `(shareScope, package)`. It has one tag/action and zero or more participant declarations.                                                                     |
| **Participant declaration**       | Exactly one `version.remotes[]` element. It records one build's requirements, recorded files, links to derived candidates, and optional pooling metadata.                                                   |
| **Entrypoint candidate**          | One shared-participant- or private-registration-owned `(specifier, file, candidateUrl)` derived from `entries`, or from `file` plus the registry package name. It is not selected merely because it exists. |
| **Resolution claim**              | One shared declaration or private registration claiming one specifier for one consumer. Several claims can point at the same effective binding.                                                             |
| **Effective consumer resolution** | The one deterministically computed import-map binding at `(normalized consumer scope root, specifier)`. It is not evidence of a concrete importer module, runtime lookup, or import.                        |
| **Resolved dependency copy**      | A conservative source-oriented grouping of mapped resolution claims that have the same evidenced emitted copy. It is derived, never read directly from a registry action.                                   |
| **Registry serving slot**         | The first participant of a non-`scope` version registration, preserved as the source-defined basis slot. It is not a universal per-specifier provider.                                                      |
| **Explicit anchor**               | A participant's optional `servedBy`. It is per consumer and member; absence means only that no explicit anchor was recorded. The effective map can still differ or lack a registry explanation.             |
| **Observed target provider**      | The remote/build owner attributed from the effective target URL, preferably by exact candidate match and otherwise by bounded scope-prefix attribution.                                                     |
| **Delivery evidence**             | Evidence that a URL was requested, downloaded, evaluated, or used. The current passive snapshot has none.                                                                                                   |

The following equalities MUST NOT be assumed:

```text
participant count == registration count
participant count == resolved-copy count
claim count == effective-resolution count
registry serving slot == provider of every entrypoint
registry action == per-consumer mapping outcome
cached == selected provider
mapped == requested == downloaded == executed
pool label == effective pool identity == provider
```

The `co-declared-share` witness proves why: one `share` registration contains
two declarations and two distinct candidate URLs, while the effective map has
one selected URL for the package.

## 4. Canonical normalized evidence model

The exact TypeScript names may change during planning, but an implementation
MUST preserve the following information and boundaries.

```ts
type ExternalAction = 'share' | 'skip' | 'scope';

interface SharedExternalRecord {
  id: SharedExternalId;
  shareScope: string;
  packageName: string;
  dirty: boolean;
  registrations: VersionRegistrationId[];
  provenance: EvidenceRef[];
}

interface VersionRegistration {
  id: VersionRegistrationId;
  externalId: SharedExternalId;
  tag: string;
  action: ExternalAction | 'unknown';
  rawAction: string;
  host: boolean;
  registryIndex: number;
  declarations: ParticipantDeclarationId[];
  provenance: EvidenceRef[];
}

interface ParticipantDeclaration {
  id: ParticipantDeclarationId;
  registrationId: VersionRegistrationId;
  participantIndex: number;
  remote: string;
  requiredVersion: string;
  strictVersion: boolean;
  cached: boolean;
  bundle: string | null;
  pool: string | null;
  servedBy: string | null;
  generation: 'v4' | 'v4.5';
  recordedFiles: { specifier: string; file: string }[];
  candidateIds: EntrypointCandidateId[];
  provenance: EvidenceRef[];
}

interface EntrypointCandidate {
  id: EntrypointCandidateId;
  subject: ResolutionSubject;
  specifier: string;
  recordedFile: string;
  candidateUrl: string | null;
  urlState: 'resolved' | 'missing-remote-scope' | 'invalid';
  provenance: EvidenceRef[];
}
```

`SharedExternalRecord`, `VersionRegistration`, `ParticipantDeclaration`, and
the recorded file pairs are normalized raw evidence. `EntrypointCandidate` is a
separate `derived-from-capture` record: it resolves captured strings without
changing their parent records. `RegistryServingSlotClaim` is likewise derived
in §6.1 rather than stored on the raw registration.

Unknown action strings MUST remain inspectable through `rawAction` and produce a
diagnostic. They MUST NOT be coerced to `share`, `skip`, or `scope`.

### 4.1 Stable identity

Identities are deterministic within a snapshot and across byte-equivalent
snapshots. They do not promise identity continuity when the registry itself
changes.

- `SharedExternalId` MUST include `(shareScope, packageName)`.
- `VersionRegistrationId` MUST include the external ID and
  `(tag, rawAction, ordinalWithinEqualKey)`.
- `ParticipantDeclarationId` MUST include the registration ID and
  `(remote, ordinalWithinRegistration)`.
- `PrivateRegistrationId` MUST include `(ownerRemote, packageName)`.
- `EntrypointCandidateId` MUST include its shared declaration or private
  registration ID plus `(specifier, recordedFile, ordinalWithinEqualKey)`.
- `EffectiveConsumerResolutionId` MUST include
  `(normalizedConsumerScopeOrMissingKey, specifier)`. A missing-consumer-scope
  key is a deterministic per-consumer sentinel because absent scope evidence
  cannot prove that two consumer contexts share one binding.
- `DeclarationResolutionClaimId` MUST include its resolution subject and
  candidate ID. `SourceComparisonId` MUST include that claim ID and the closed
  comparison kind from §6.4.
- `RegistryServingSlotClaimId` MUST include its version registration ID.
- `ResolvedDependencyCopyId` follows the source-key rules in §7.1 and carries
  an explicit source-record versus target-URL discriminator.
- `ObservedTargetProviderId` MUST include the effective-resolution ID and
  attribution outcome. `BundleClaimId` MUST include copy ID, qualified source,
  and bundle. `ChunkGroupId` MUST include emitter, origin, and bundle or
  pseudo-package. `ConsumerCopyRelationId` MUST include consumer remote and
  copy ID.
- Delimiters MUST be escaped or the tuple MUST be encoded structurally; string
  concatenation that can collide is forbidden.
- Registry and participant indexes MUST be retained as provenance. A display
  sort MUST NOT mutate them.
- Duplicate-looking rows or duplicate participant names MUST remain distinct.
  A diagnostic MAY flag them, but ingest MUST NOT deduplicate raw evidence.

The ordinal is a collision discriminator, not a resolver rule. Code MUST NOT
interpret a lower ordinal as “winner” except where the pinned source explicitly
defines the first participant as the registry serving slot.

### 4.2 Candidate URL construction

For every normalized served file:

1. determine its specifier from the `entries` key; for the v4 `file` spelling,
   use the registry package name;
2. resolve the shared participant's or private owner's remote `scopeUrl`
   against the capture's resolution base (below);
3. resolve the recorded file against that resolved remote scope;
4. compare candidates and map targets as normalized absolute URLs.

The resolution base is the document base the loader and the runtime resolved
load-time-relative values against — `capture.pageUrl` only on a never-navigated
page. On an SPA page `history.pushState` moves `pageUrl` away from that base;
in shim mode the base MUST be recovered from the shim's recorded effective map
(a document-tag import with a path-relative target plus the shim's parse-time
absolute target pins the base directory; the candidate is verified by
re-resolution). Without such evidence — native mode, no shim map, no verifying
entry — `capture.pageUrl` remains the fallback. The recovered base applies
uniformly: candidate URLs here, the document-map merge, consumer scope
normalization. Playground evidence: `/playground/checkout/cart` resolved the
host's `./` scope into `@tractor-store/checkout`'s scope directory, collapsing
every share into an ambiguous target-URL copy.

Filename equality is never sufficient. A missing remote record or unusable
scope produces `candidateUrl: null` with an explicit state. It MUST NOT silently
fall back to `capture.pageUrl` for an arbitrary shared participant or private
owner.

### 4.3 Scoped externals

`scoped-externals` has its own raw identity `(ownerRemote, packageName)` and its
own shape. It MUST remain a separate `PrivateRegistration` (or equivalent), not
be rewritten into a fake shared version registration.

```ts
interface PrivateRegistration {
  id: PrivateRegistrationId;
  ownerRemote: string;
  packageName: string;
  tag: string;
  bundle: string | null;
  recordedFiles: { specifier: string; file: string }[];
  candidateIds: EntrypointCandidateId[];
  provenance: EvidenceRef[];
}

type ResolutionSubject =
  | { kind: 'shared'; declarationId: ParticipantDeclarationId }
  | { kind: 'private'; registrationId: PrivateRegistrationId };

type ResolutionDomain =
  { kind: 'share-scope'; name: string } | { kind: 'private-owner'; remote: string };
```

A downstream projection MAY render it with an “isolated” or synthetic `scope`
badge, but provenance MUST say that this is a projection label rather than a
stored shared-external action. `@nf-internal/chunk-*` records remain
distinguishable from ordinary private packages until the product decision in
§13 is resolved.

## 5. Consumer resolution: the atomic truth

Every shared declaration candidate and every private registration candidate
creates a resolution **claim**. The effective binding itself is computed once
per normalized consumer scope context and specifier. Multiple claims MAY point
to that one binding; they MUST NOT duplicate it or inflate copy counts.

An `EffectiveConsumerResolution` is the import-map-binding outcome at one
consumer's normalized remote scope root for one specifier. It records whether
the captured effective map supplies, lacks, blocks, or cannot reliably evaluate
that binding. The scope root is a lookup context, not an observed importer
module URL: modules under more specific map scopes or outside the remote scope
can resolve differently. The record does not model the browser's complete URL
fallback, nor observe that the browser performed a lookup or that code imported
the specifier.

```ts
type EffectiveConsumerResolutionBlockedReason =
  | 'invalid-target-url'
  | 'prefix-target-missing-trailing-slash'
  | 'invalid-prefix-expansion'
  | 'prefix-target-backtracking';

interface EffectiveMapEntryProvenance {
  source: 'effective-import-map';
  scope: string | null;
  specifier: string;
  target: string;
  match: 'exact' | 'prefix';
}

interface EffectiveConsumerResolution {
  id: EffectiveConsumerResolutionId;
  scopeContextKey: string;
  consumerRemotes: string[];
  specifier: string;
  consumerScopeUrl: string | null;
  status: 'mapped' | 'unmapped' | 'blocked' | 'unknown';
  effectiveTargetUrl: string | null;
  mapEntry: EffectiveMapEntryProvenance | null;
  blockedReason: EffectiveConsumerResolutionBlockedReason | null;
  claimIds: DeclarationResolutionClaimId[];
  sourceMatch: SourceMatch;
  provenance: EvidenceRef[];
}

interface DeclarationResolutionClaim {
  id: DeclarationResolutionClaimId;
  subject: ResolutionSubject;
  consumerRemote: string;
  resolutionDomain: ResolutionDomain;
  consumerRegistryPackage: string;
  candidateId: EntrypointCandidateId;
  effectiveResolutionId: EffectiveConsumerResolutionId;
  ownCandidateUrl: string | null;
  ownCandidateSelected: boolean | null;
  mappingState:
    | 'own-selected'
    | 'not-selected'
    | 'fallback'
    | 'self-filled'
    | 'anchored'
    | 'blocked'
    | 'unknown';
  sourceAction: ExternalAction | 'private' | 'unknown';
  copyId: ResolvedDependencyCopyId | null;
  comparisonIds: SourceComparisonId[];
  provenance: EvidenceRef[];
}
```

### 5.1 Effective-map lookup

The existing document-map merge remains the effective-map ground truth. For
each unique `(normalized consumer scope context, specifier)`:

1. obtain the normalized remote scope URL and pass it to the
   standards-compatible lookup as the importer URL at that scope root;
2. enumerate every matching import-map scope from longest to shortest;
3. at each matching scope, select the most specific standards-compatible exact
   or valid prefix-key entry;
4. normalize that entry's target against the page URL: return `mapped` on
   success or `blocked` with the entry and a closed reason on failure; do not
   fall through after an entry matched;
5. only after every matching scope misses, perform the same lookup and target
   normalization against top-level imports.

If the import-map channel or consumer scope URL is unavailable, the result is
`unknown`. If both are available but no applicable import-map binding exists,
the result is `unmapped`. If an applicable entry terminally prevents a valid
target, the result is `blocked` and retains that entry's provenance and reason.
An empty shim map in native mode is not an empty effective map. A URL-like
specifier without an applicable map entry remains `unmapped` in this model,
even though the browser can resolve the URL without an import-map binding.
Several remote names with the same normalized consumer scope URL share one
effective resolution record. Their declaration claims and consumer relations
remain separate, and `consumerRemotes` is their sorted, de-duplicated context
list.

The current corpus proves exact-key lookups only. Seeded resolver vectors pin
the standards-compatible prefix rule, including longest-prefix selection,
suffix expansion, terminal invalid targets, and path backtracking.

### 5.2 Mapping-state rules

`mappingState` belongs to a declaration claim. It explains that claim's
relationship to the single computed binding; it is not a replacement for the
raw action. The following precedence is normative:

1. **`anchored`** — `servedBy` is present and the target can be attributed to
   that anchor. `servedBy === remote` is valid and remains `anchored`.
2. **`self-filled`** — a `skip` claim resolves to a uniquely matched candidate
   from a `skip` declaration in the same `SharedExternalRecord` for that
   specifier. The source can be this consumer's own declaration or the first
   skip declaration that filled the global entry.
3. **`own-selected`** — the normalized target exactly equals this claim's own
   candidate and no explicit anchor or skip self-fill is the stronger
   explanation.
4. **`fallback`** — a `skip` claim resolves to another uniquely evidenced
   selected source, normally a `share` registration. The source action is
   retained; a same-external `skip` source uses `self-filled` instead.
5. **`not-selected`** — an own candidate exists, the target is different, and
   neither a verified anchor, self-fill, nor fallback explains it. This is the
   non-selected `mfe2` claim in `co-declared-share`.
6. **`blocked`** — a matching import-map entry terminally prevents a valid
   target. No candidate is selected and no source or copy is attributed.
7. **`unknown`** — the map, consumer scope, candidate, source match, or
   explanation is absent or ambiguous.

The independent `ownCandidateSelected` field MUST remain available because an
explicit self-anchor or own skip self-fill may also be an exact own-candidate
match. No state above means requested, downloaded, evaluated, or used.

### 5.3 Action semantics

Actions stay attached to version registrations:

- `share` means the registration was retained as a shared result for that
  external. The action alone does not prove a globally unique shared
  registration, one participant, one emitted origin, or one target for every
  entrypoint. A fallback is emitted only when the effective target has a
  uniquely evidenced source.
- `scope` means the source maps each declaration's own files under its remote
  URL scope instead of publishing an ordinary shared union. That original
  registration context is isolated, but the same committed build may later be
  selected as an explicit pool anchor. The snapshot still proves mapping rather
  than download. “Strict incompatibility” MUST NOT be presented as the only
  possible cause; entrypoint policy and pool islanding can also produce
  isolation.
- `skip` means the registration did not become the ordinary shared result. It
  MUST remain in the canonical model. Its specifiers can resolve to the shared
  result, an explicit anchor, or a self-filled entrypoint from its own or
  another skip declaration. A global self-fill source can serve later
  consumers of that specifier. Therefore `skip` does not mean “no mapped file”
  or “no chunks”.

## 6. Source and provider claims

The word “provider” MUST be qualified in code, types, UI copy, and tests.

### 6.1 Registry serving slot

```ts
interface RegistryServingSlotClaim {
  id: RegistryServingSlotClaimId;
  registrationId: VersionRegistrationId;
  declarationId: ParticipantDeclarationId | null;
  status: 'basis-slot' | 'not-applicable' | 'empty';
  provenance: EvidenceRef[];
}
```

For a non-empty, non-`scope` version registration, the claim points to its first
declaration. Pinned source defines that position as the basis and maintains it
with host, existing `cached`, entrypoint **count**, then incumbent/arrival-order
precedence (`basis.ts:3-29`). The model reads the stored order and derives the
claim with `source-confirmed` provenance; it MUST NOT recompute the slot from
`cached` or sort declarations to manufacture it.

For `scope`, the claim is `not-applicable`; the raw first declaration remains
available but has no basis meaning. For an empty registration it is `empty`.
For `skip`, the slot records that row's basis precedence but is not the
ordinary shared override that its consumers resolve to.

The slot answers a registry question. It does not answer which declaration
serves every specifier. The source helper `versionEntries` constructs a
per-specifier union of eligible non-anchored declarations, with the first
eligible declaration supplying each entry (`basis.ts:62-115`), but that helper
is not a universal semantic of every registration:

- `share` uses that registration's union as its ordinary shared surface;
- `scope` maps each declaration's own files and does not union declarations;
- named-scope `skip` first uses the selected override's union (or its own union
  when no override exists), then fills uncovered entries from each consumer's
  own declaration;
- global `skip` does not publish an ordinary union: after shared winners it
  fills only genuinely `unmapped` specifiers in declaration order; a `blocked`
  binding is terminal and never self-filled;
- the dynamic global path can use only the narrower already committed surface
  (`basis.ts:76-83`, `update-cache.ts:114-129`).

Equal tags in distinct registrations never merge merely because their tags
match. Every derivation MUST select the action/map path before applying an
entrypoint-surface rule.

### 6.2 Explicit anchor (`servedBy`)

`servedBy` is optional per declaration because two consumers of the same tag
may use different anchors (`version.contract.ts:22-33`). It names the build that
serves this consumer/member when that differs from the normal basis mapping.

- Absence means “no explicit override recorded”, not “self-served”.
- The value may equal the consumer remote.
- An anchored declaration does not contribute its own files to the version's
  shared entrypoint surface.
- `servedBy` is source-confirmed but unobserved in the current capture corpus.

The pooling election chooses one serving build per consumer and pool. The
field is then materialized only on members whose ordinary basis differs from
that build (`pool-shared-externals.ts:48-56`, `:97-114`). Missing `servedBy` on
one member therefore does not prove a different anchor from its siblings.

Anchor candidate lookup is share-scope-wide and keyed by anchor remote plus
specifier, not restricted to the consumer's registry package. The pinned
source deliberately allows the anchor to provide that specifier as an entry of
another external (`generate-import-map.ts:262-295`). The model MUST therefore
carry consumer package/context separately from source package/registration.

### 6.3 Observed target provider

```ts
interface SourceMatch {
  resolutionId: EffectiveConsumerResolutionId;
  outcome:
    | 'exact-candidate'
    | 'ambiguous-candidate'
    | 'scope-derived'
    | 'ambiguous-scope'
    | 'host-fallback'
    | 'unattributable'
    | 'unknown';
  source: ResolutionSubject | null;
  candidateIds: EntrypointCandidateId[];
  observedTargetProviderId: ObservedTargetProviderId;
  provenance: EvidenceRef[];
}

interface ObservedTargetProvider {
  id: ObservedTargetProviderId;
  resolutionId: EffectiveConsumerResolutionId;
  remote: string | null;
  outcome: SourceMatch['outcome'];
  rule: 'exact-candidate' | 'scope-prefix-match' | 'host-fallback' | 'none';
  provenance: EvidenceRef[];
}
```

The model first builds a complete candidate index by normalized
`(specifier, candidateUrl)`. For each mapped target, attribution follows this
ladder:

1. **Exact candidate** — target equals exactly one normalized shared or private
   candidate URL for the same specifier. The matching source record is the
   strongest observed source.
2. **Ambiguous candidate** — target equals candidates from more than one
   declaration. Retain all candidates; choose none.
3. **Unique scope owner** — no exact candidate matches, but exactly one
   most-specific non-host remote scope contains the target. Attribute the
   remote with rule `scope-prefix-match`.
4. **Ambiguous scope owner** — several equally specific scopes match. Retain
   candidates; choose none.
5. **Host fallback** — only a host scope matches and the target is within its
   resolved base. Mark the weaker host-fallback rule.
6. **Unattributable** — no scope matches, for example a CDN target.

Exact URL equality is stronger than scope-prefix ownership. Neither proves
runtime delivery.

The candidate set eligible to _explain_ a claim is narrower than the complete
index used to observe a target source:

- ordinary `share`: the source-defined union of eligible non-anchored
  declarations within the selected `VersionRegistration`;
- named-scope `skip`: the selected override union, followed by the consumer's
  own uncovered candidates; when no override exists, use the source-defined
  skip-registration path;
- global `skip`: only declarations that could have filled that genuinely
  `unmapped` specifier in source order; blocked specifiers are excluded;
- explicit anchor: declarations for `servedBy` within the same share scope,
  across external records, matching the specifier;
- `scope` or private registration: that claim's own candidate.

An exact source outside the eligible explanation set remains observed evidence
and yields a claim mismatch; it is not silently adopted as the registry story.

### 6.4 Agreements never erase claims

```ts
type SourceComparisonKind = 'slot-vs-observed' | 'anchor-vs-observed' | 'candidate-vs-target';

type QualifiedSourceClaim =
  | {
      kind: 'registry-serving-slot';
      slotClaimId: RegistryServingSlotClaimId;
      declarationId: ParticipantDeclarationId | null;
    }
  | { kind: 'explicit-anchor'; declarationId: ParticipantDeclarationId; remote: string }
  | { kind: 'own-candidate'; candidateId: EntrypointCandidateId; normalizedUrl: string | null }
  | {
      kind: 'observed-target-source';
      observedTargetProviderId: ObservedTargetProviderId;
      subject: ResolutionSubject | null;
    }
  | {
      kind: 'effective-target';
      resolutionId: EffectiveConsumerResolutionId;
      normalizedUrl: string | null;
    };

interface SourceComparison {
  id: SourceComparisonId;
  claimId: DeclarationResolutionClaimId;
  kind: SourceComparisonKind;
  left: QualifiedSourceClaim;
  right: QualifiedSourceClaim;
  status: 'match' | 'mismatch' | 'unknown';
  provenance: EvidenceRef[];
}
```

The derived model MUST compare, not collapse:

- registry slot versus exact/observed entrypoint source;
- explicit `servedBy` versus exact/observed target source;
- own candidate versus effective target.

The ordering is canonical: the registry slot, explicit anchor, or own candidate
is always `left`; the observed source or effective target is always `right`.
Only the three pairings named by `SourceComparisonKind` are valid. An
implementation MUST reject any other discriminant pair instead of inventing an
ordering, so IDs remain deterministic.

Each comparison is keyed by claim and specifier and has its own provenance. A
mismatch is a diagnostic candidate, not permission to overwrite either fact.
A slot mismatch on a secondary entrypoint may be expected when a later
declaration within the same `VersionRegistration` supplies coverage;
diagnostics MUST be entrypoint-aware.

The model has no `actualProvider` field while delivery evidence is absent.

## 7. Resolved dependency copies

A resolved copy is a source-oriented grouping over mapped resolution claims,
not over raw participant rows and not over claim count. It records every
consumer context separately from the source record so a pool anchor can supply
a specifier from another external without splitting one evidenced source copy.
Evidenced source variants embed the remote name of their referenced record
(`participant` / `ownerRemote`), copied verbatim at materialization so source
attribution reads from the projection alone; the ID stays the identity and
link anchor, and URL-identified copies carry no name field — its absence is
the no-evidenced-source statement.

```ts
type CopySource =
  | { kind: 'shared-declaration'; declarationId: ParticipantDeclarationId; participant: string }
  | { kind: 'private-registration'; registrationId: PrivateRegistrationId; ownerRemote: string }
  | { kind: 'target-url'; targetUrl: string };

type CopySourceDisposition =
  | 'share-registration'
  | 'scope-registration'
  | 'skip-registration'
  | 'private-registration'
  | 'target-only'
  | 'ambiguous-source'
  | 'unknown-registration';

type CopyEffectiveRole =
  | 'ordinary-shared'
  | 'isolated-own'
  | 'self-filled-source'
  | 'anchor-source'
  | 'private-own'
  | 'unclassified';

interface ResolutionContext {
  resolutionDomain: ResolutionDomain;
  consumerRegistryPackage: string;
  claimIds: DeclarationResolutionClaimId[];
}

interface ResolvedDependencyCopy {
  id: ResolvedDependencyCopyId;
  sourcePackage: string | null;
  resolvedTag: string | null;
  source: CopySource;
  sourceDisposition: CopySourceDisposition;
  effectiveRoles: CopyEffectiveRole[];
  sourceActions: (ExternalAction | 'private' | 'unknown')[];
  entrypoints: Record<string, string>; // specifier -> effective target URL
  effectiveResolutionIds: EffectiveConsumerResolutionId[];
  resolutionContexts: ResolutionContext[];
  sourceRegistrationRefs: (
    { kind: 'shared'; id: VersionRegistrationId } | { kind: 'private'; id: PrivateRegistrationId }
  )[];
  observedTargetProviders: ObservedTargetProvider[];
  registryServingSlotClaims: RegistryServingSlotClaim[];
  bundleClaimIds: BundleClaimId[];
  provenance: EvidenceRef[];
}
```

`sourceDisposition` reports only source provenance: an exact shared source maps
its raw action to `share-registration`, `scope-registration`, or
`skip-registration`; an exact private source maps to `private-registration`; an
exact shared source with an unknown raw action maps to `unknown-registration`;
an ambiguous exact-candidate set maps to `ambiguous-source`; and any remaining
URL-only source maps to `target-only`. It MUST NOT be used as shorthand for how
every consumer reaches the copy. `effectiveRoles` is a sorted, de-duplicated
set derived from the attached claim and mapping evidence:

- an ordinary selected `share` surface contributes `ordinary-shared`;
- a `scope` declaration's own mapping contributes `isolated-own`;
- a selected skip self-fill source contributes `self-filled-source`;
- any copy selected through an explicit `servedBy` contributes
  `anchor-source`;
- a private registration's own mapping contributes `private-own`;
- a target-only or otherwise unclassified mapped source contributes
  `unclassified` plus a diagnostic.

Roles can coexist. In particular, a committed `scope` copy can retain
`scope-registration`/`isolated-own` and also act as `anchor-source`; a `skip`
registration can be an anchor source without being mislabeled as self-filled.
This separation is canonical graph/view input, not presentation inference.

`sourceActions` contains actions of evidenced source registrations, never the
actions of every consumer claim that happens to point at the copy.

### 7.1 Copy identity

The safe identity is hierarchical:

1. When a target uniquely matches a shared declaration candidate or private
   registration candidate, that source-record ID is the copy key. Every mapped
   entrypoint from that exact source record MUST group into the same copy,
   including uses from other consumer package or share-scope contexts through
   `servedBy`. Shared source-record identity already contains its own share
   scope; consumer context MUST NOT duplicate the copy.
2. Otherwise the key within one snapshot is
   `('target-url', normalizedTargetUrl)`. The same effective absolute URL is
   the same addressable resource in the available evidence, even when several
   claims or registry contexts point to it. If future evidence can distinguish
   revisions behind one URL, that evidence requires an explicit new identity
   component; claim count is not such evidence. Cross-snapshot storage MUST
   namespace this key by snapshot identity.
3. Consumer share scope/package live in `resolutionContexts`; they are not
   substituted for the exact source package/registration.
4. `resolvedTag` comes from the uniquely matched source registration. It is
   `null` when the source cannot be linked uniquely. A fallback consumer's
   declared tag MUST NOT relabel a different or unknown source. An exactly
   selected own skip/self-fill source legitimately contributes its own tag.

This deliberately rejects the tempting identity
`(shareScope, package, tag, effectiveTargetUrl)`: consumer context belongs to
relations, while exact source identity or, conservatively, the effective URL
identifies the copy. The rule represents co-declared copies, private copies,
cross-external anchors, and action-qualified entrypoint surfaces without
pretending that a remote name or claim row alone identifies an artifact.

### 7.2 Cardinality consequences

- One registration can yield zero, one, or several resolved copies.
- Several claims and effective resolutions can resolve to one copy.
- One declaration can contribute several mapped entrypoints to one copy.
- One version tag can be served by several declaration-backed copies when
  different declarations within one registration provide different
  entrypoints.
- One consumer can resolve different specifiers of a logical package to
  different copies.
- A `skip` declaration can contribute an own selected entrypoint through
  self-fill and can supply later skip consumers even when another entrypoint
  falls back.
- One effective scope-context/specifier binding can carry several registry
  claims when external records overlap; it is still one effective resolution.

Views MUST name four different measures:

- `registrationCount` from `VersionRegistration[]`;
- `distinctDeclaredTagCount` from distinct registration tags;
- `resolvedCopyCount` from `ResolvedDependencyCopy[]`;
- `distinctResolvedTagCount` from known distinct copy tags, with unknowns
  reported separately.

Declaration and claim counts are additional measures, never aliases for any of
the four. Several copy fragments of the same tag do not by themselves prove a
version conflict.

## 8. Share scopes, strict scope, pooling, and dynamic limits

### 8.1 Share scopes

Share-scope identity is mandatory for registry records, claims, and resolution
contexts. The same package in two share scopes remains two independent
registry/claim contexts even when both contexts converge on one normalized
scope-context/specifier binding or one source-oriented copy. A share-scope name
MUST NOT be normalized as an import-map scope URL.

Named share scopes are commonly expressed through per-consumer import-map
scopes rather than root imports. A `share` action therefore MUST NOT imply a
top-level import-map entry.

The pinned source excludes the `strict` share scope from pooling
(`pool.util.ts:19-40`). The current corpus also demonstrates `strict` as the
only share scope in a snapshot. Code MUST NOT assume `__GLOBAL__` exists.

### 8.2 `pool`

`pool` is raw participant metadata. It is not a canonical pool ID and not a
provider:

- pooling is evaluated within one share scope;
- explicit labels are remote-local graph edges;
- equal labels on disconnected remotes need not form one pool;
- different labels can join through shared members;
- automatic pooling can create a family without an explicit label;
- the source's canonical component name is derived, not necessarily the raw
  label.

The resolution model preserves `pool` but does not derive a pool graph until a
real witness exists and the full source algorithm is deliberately specified.
A future view MAY add a separately proven `DerivedPoolId`; it MUST NOT group by
the raw string alone.

### 8.3 Pool anchors

Pooling coordinates coherent build families, not “one provider per pool”. A
pool may intentionally have different serving builds for different consumers.
`servedBy` is the explicit per-consumer/member evidence for a non-default
anchor. Multiple observed providers within a pool are not automatically an
error.

### 8.4 Dynamic-init boundary

Pinned source can produce additive dynamic override mappings without writing a
new persistent `servedBy` value. The effective import map may therefore show a
target whose registry explanation is absent. The canonical result in that case
is an observed mapping with partial/unknown registry explanation, not an
invented anchor.

## 9. Bundle and chunk attribution

Bundle/chunk relations follow selected source evidence:

```ts
interface BundleClaim {
  id: BundleClaimId;
  copyId: ResolvedDependencyCopyId;
  source:
    | { kind: 'shared'; declarationId: ParticipantDeclarationId }
    | { kind: 'private'; registrationId: PrivateRegistrationId }
    | null;
  sourceRemote: string | null;
  bundle: string;
  chunkGroupIds: ChunkGroupId[];
  status: 'mapped-source' | 'source-only' | 'ambiguous';
  provenance: EvidenceRef[];
}
```

`ChunkGroupId` MUST retain emitter remote and bundle/pseudo-external origin.
A graph-facing chunk-file ID MUST additionally include the recorded file or
normalized mapped URL. Equal filenames from different emitters MUST NOT merge.

Rules:

1. A declaration's `bundle` is a raw claim, not automatic attribution to every
   resolution involving that declaration.
2. A dense chunk group joins a copy only through its selected declaration or
   explicit/observed source remote and matching bundle.
3. A non-selected, bundle-bearing participant MUST NOT donate chunks to the
   selected copy.
4. A declaration within the same `VersionRegistration` that supplies a
   selected secondary entrypoint MAY contribute its own bundle and chunks.
5. A `servedBy` mapping uses the anchor's bundle/chunk source when that source
   is identifiable.
6. A self-filled `skip` entrypoint contributes chunks only when the relevant
   import-map path also records matching chunk evidence. Cold global self-fill
   registers the bundle; named-share-scope and dynamic self-fill map the file
   without registering its bundle in the pinned source
   (`generate-import-map.ts:194-208`, `:443-466`;
   `convert-to-import-map.ts:59-82`, `:175-198`). Absence on those paths is
   `source-only`/no chunk evidence, not an inconsistency.
7. `mapping-or-exposed` remains separate from shared-dependency attribution.
8. Legacy `@nf-internal/chunk-*` scoped externals retain their raw provenance;
   their final product classification is open.

Only `mapped-source` may be presented without qualification as a “mapped
backing chunk”. `source-only` and `ambiguous` MUST surface their uncertainty.
The UI MUST NOT infer wire cost, downloads, cache hits, or execution from these
records.

## 10. Snapshot, Store, and view migration contract

### 10.1 Witness before schema

Before collector schemas change, a real orchestrator scenario MUST capture
`pool` and `servedBy`. The witness must prove at least:

- the exact raw field locations and omission behavior;
- two consumers of the same tag can be represented independently;
- the effective target for each relevant consumer/specifier;
- at least one explicit anchor whose target can be compared with anchor
  candidates;
- preservation of hostile-page projection limits and URL sanitization.

Only then may one traceable task extend, together:

- `projects/collector/src/lib/runtime-schema.ts`;
- the hand-mirrored schema in `projects/collector/src/lib/passive-probe.ts`;
- `projects/collector/src/lib/snapshot-mapper.ts`;
- `projects/devtools-bridge/src/lib/snapshot-v1.ts`;
- the lossless validator, derived fixtures, drift checks, and focused tests.

Both values are bounded strings, not URLs. Absence remains absent in raw
evidence and normalizes to `null` only in the canonical Store. Older snapshots
without the keys remain importable. Because the fields are additive and do not
reinterpret an existing populated field, the current target is an additive
`SnapshotV1` extension; a compatibility audit MUST confirm this before code is
changed.

Concretely, raw `SnapshotV1` fields remain optional (`pool?: string`,
`servedBy?: string`); only Store normalization uses `string | null`. The schema
task MUST pin import/export round-trips for old and new snapshots, the
collector-version/provenance behavior, and rejection/projection limits for
hostile non-string values.

### 10.2 Store migration

`FederationModel.sharedRows: SharedParticipantRow[]` MUST cease to be the core
relation. The canonical Store MUST expose, directly or by lossless indexes:

```text
sharedExternalRecords
versionRegistrations
participantDeclarations
privateRegistrations
entrypointCandidates
declarationResolutionClaims
effectiveConsumerResolutions
resolvedCopies
provider/claim comparisons
bundle/chunk claims
```

Raw registrations and derived outcomes MAY live in separate `FederationModel`
and `DerivedFederation` types, but their IDs and provenance contract MUST be
shared. A temporary `sharedRows` compatibility projection MAY exist during
migration; no migrated view may use it for version, copy, winner, provider, or
chunk cardinality.

Ingest MUST preserve registry order before producing display sorts. It MUST
remove the current arbitrary `pageUrl` fallback for a missing participant
remote scope.

### 10.3 Derivations

The following current derivations require replacement or narrowing:

- share winner selection by `shareRows.length === 1`;
- “own” arrows for every `share` participant;
- provider labels derived from every non-`skip` participant;
- mapped-copy counts derived from non-`skip` participant rows;
- chunk joins from every participant row with a bundle.

New derivations MUST accept the canonical model, remain pure and deterministic,
and return explicit `mapped | unmapped | blocked | unknown`,
`match | mismatch | unknown`, and attribution outcomes. They MUST NOT inspect
the raw snapshot independently.

### 10.4 View-model consequences

- **Packages** shows `registrationCount`, `distinctDeclaredTagCount`,
  `resolvedCopyCount`, and `distinctResolvedTagCount` separately, with
  declaration and unknown-tag counts as supporting facts. Copy multiplicity is
  not automatically a version conflict: several selected entrypoint sources
  can carry one tag. Requested and resolved tags remain distinct.
- **Remotes** shows each remote as a consumer, its own candidate, effective
  binding, per-declaration claim state, and qualified source claims. It does
  not call every non-`skip` declaration a provider.
- **Import Map** remains the raw mapping pivot and annotates entries with exact
  candidate matches, all registry claims, observed target owner, copy IDs, and
  provenance without duplicating one scope-context/specifier binding.
- **Diagnostics** compares registry slots, explicit anchors, exact candidates,
  and observed targets. Ambiguity or missing evidence is a result, not an
  exception to hide.
- **Private dependencies** traverse the same candidate → claim → effective
  resolution → copy pipeline, retaining `PrivateRegistrationId`; no view
  invents a shared action or share scope for them.
- All views use the same IDs. A label or count shown in two views MUST come from
  the same canonical entity, not a parallel reconstruction.

Allowed user-facing verbs without delivery evidence are **declared**,
**mapped**, **resolves to**, **selected**, **not selected**, **anchored**, and
**available for loading**. **Loaded**, **downloaded**, **fetched**, **executed**,
**used**, **cache hit**, and **wire cost** are forbidden unless a future
network/performance evidence channel proves them.

### 10.5 Fixture-to-view truth verification

The existing evidence chain already validates raw captures and proves that all
corpus-derived `SnapshotV1` fixtures equal a fresh run of the collector
pipeline. That does not by itself prove the Store's interpretation or the data
shown by Packages, Remotes, and Import Map. In particular,
`co-declared-share` is currently absent from all six view-model and DOM specs,
which allows the participant-flattening bug to remain green.

The implementation plan MUST therefore contain one small, test-only
fixture-to-view verification task with this chain:

```text
validated capture
  → reproducible SnapshotV1 fixture
  → evidence-pinned canonical witness expectations
  → cross-view ID/count/relationship contract
  → focused DOM assertions
```

The canonical model MUST NOT be its own only oracle. A compact hand-authored
matrix, citing the capture and this specification, pins at least. Its expected
values MUST NOT be generated or updated through the canonical model, view-model
builders, or shared resolver helpers; a test-only extractor may only select
stable fields from the actual output.

- `co-declared-share`: one registration, two declarations, two distinct
  consumer-scope resolutions, one effective target, one resolved copy, and one
  exact selected source;
- `clean-skip`: two registrations and two distinct declared tags but one
  resolved copy;
- `strict-split`: three registrations, two declared tags, and two resolved
  copies;
- `strict-scope`: the named scope remains independent and the empty
  `__GLOBAL__` observation creates no package;
- `scoped`: two private registration → resolution → copy paths without an
  invented share action;
- `frankenstein-live`: three remotes and the captured 22 global plus 7 scoped
  import-map entries.

A cheap parameterized contract then runs over every corpus-derived fixture
(currently 12) and verifies only stable semantics:

- every ID shown by a view exists in the canonical model;
- the three views use the same IDs, counts, targets, and relationships for the
  same fact;
- participant declarations never inflate registration, resolution, or copy
  counts;
- each `(scope, specifier)` entry of the merged effective import map appears
  exactly once with its recorded target;
- each `(normalized consumer scope context, specifier)` has at most one
  effective resolution;
- an unselected candidate is never exposed as a selected copy.

Focused DOM tests only need to prove that the new semantic fields are actually
rendered for `co-declared-share`, private `scoped`, and one dense live case.
The task MUST NOT add a second resolver, production oracle API, full view-model
snapshots, Playwright/Cypress/Storybook, or pixel-golden infrastructure.

After the automated contract is green, the plan MUST include a separate manual
fixture walkthrough using the existing `?fixture=` picker. Maintainer-provided
screenshots are reviewed against the same witness matrix for wording, visual
distinction, cross-links, clipping, and hierarchy. They are UX review evidence,
not the semantic oracle, and need not be committed as golden assets.

## 11. Dependency graph boundary

The maintainer document contributes useful requirements:

- share scope belongs to identity;
- shared copies fan in from consumers;
- isolated outcomes remain visually distinct;
- purely declarative skip records need no graph node; a verified fallback can
  project as an edge to the selected copy;
- chunk emitter and dependency consumer are different roles;
- the graph builder and renderer should remain pure and deterministic.

Its raw-cache builder is not adopted. It assumes one provider per share row,
omits `servedBy`, treats `entries` as the only generation, assumes absolute
`scopeUrl`, collapses action into copy cardinality, and repeatedly equates
mapping with download.

A future graph MUST have this boundary and minimum input:

```ts
interface ConsumerCopyRelation {
  id: ConsumerCopyRelationId; // (consumerRemote, copyId)
  consumerRemote: RemoteId;
  copyId: ResolvedDependencyCopyId;
  effectiveResolutionIds: EffectiveConsumerResolutionId[];
  claimIds: DeclarationResolutionClaimId[];
  mappingStates: DeclarationResolutionClaim['mappingState'][];
}

interface CompletenessCounts {
  unknownResolutions: number;
  unmappedResolutions: number;
  blockedResolutions: number;
  ambiguousSourceClaims: number;
}

interface IncompleteConsumerResolution {
  consumerRemote: RemoteId;
  effectiveResolutionId: EffectiveConsumerResolutionId;
  issues: (
    | 'unknown-resolution'
    | 'unmapped-resolution'
    | 'blocked-resolution'
    | 'ambiguous-source'
  )[];
  ambiguousClaimIds: DeclarationResolutionClaimId[];
}

interface CanonicalResolutionProjection {
  remotes: RemoteProjection[];
  copies: ResolvedDependencyCopy[]; // every canonical source disposition and effective role
  consumerRelations: ConsumerCopyRelation[];
  chunkGroups: ChunkGroupProjection[];
  bundleClaims: BundleClaim[];
  completeness: {
    total: CompletenessCounts;
    byConsumer: Record<RemoteId, CompletenessCounts>;
    consumerIssues: IncompleteConsumerResolution[];
  };
}

buildGraph(
  resolution: CanonicalResolutionProjection,
  selection?: ReadonlySet<RemoteId>,
  options?: GraphOptions,
): GraphModel;
```

It MUST NOT parse `SnapshotV1`, `__NATIVE_FEDERATION__`, or the four raw
repositories. One copy node corresponds to one `ResolvedDependencyCopyId`.
Declaration membership alone creates neither a node nor an edge. Every copy
selected through skip self-fill or an anchor remains a normal copy node; only a
claim with `mappingState: fallback` may create a fallback-styled edge to the
copy it actually maps. The graph formats canonical `sourceDisposition`,
`effectiveRoles`, `sourceActions`, and relation states; it does not reconstruct
action semantics. Only private-registration provenance may be displayed as a
synthetic `scope` label.

One consume relation is keyed `(consumerRemote, copyId)` and retains all
supporting effective-resolution IDs, claim IDs, and mapping states. Multiple
specifier paths MUST NOT collapse through “first edge wins” or one boolean
fallback flag.

Copy nodes arise only from mapped claims in `ResolvedDependencyCopy[]`;
candidates are never promoted to copies. If unknown, unmapped, or blocked
results are not drawn, the graph MUST surface the projection's total
completeness counts. A
consumer-filtered view MUST derive its completeness warning from
`completeness.byConsumer` and `consumerIssues` for the selected remotes; it MUST
NOT reuse the global count or inspect raw evidence. Because one effective
binding can belong to several consumer contexts, per-consumer counts MUST NOT
be summed and presented as a unique-binding total; a filtered aggregate
de-duplicates `consumerIssues` by effective-resolution ID and claim ID. Chunk
nodes retain emitter-aware IDs, and only `mapped-source` claims appear as
unqualified mapped backing chunks. A consumer filter must retain mapped backing
chunks from an unselected source remote.

Graph layout and interactions stay deferred until the canonical projection is
implemented and stable against the witness matrix.

## 12. Claim ledger

| ID       | Claim                                                                                           | Evidence class and locator                                                                                                                                                 | Verdict and normative consequence                                                                                                                                                    |
| -------- | ----------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| RM-CL-01 | One stored version registration owns a participant list.                                        | `capture-confirmed`: `captures/co-declared-share/20260813T151211Z.json:58-90`; `source-confirmed`: orchestrator `version.contract.ts:14-18`                                | Version identity precedes participant identity.                                                                                                                                      |
| RM-CL-02 | Participant count is not version, tag, effective-resolution, or copy count.                     | `capture-confirmed`: `captures/co-declared-share/20260813T151211Z.json:62-90`; current flattening: `projects/devtools-ui/src/app/shared/store/ingest.ts:70-98`             | All cardinalities are stored and displayed separately.                                                                                                                               |
| RM-CL-03 | Candidate identity needs a normalized URL, not a filename.                                      | `derived-from-capture`: `captures/co-declared-share/20260813T151211Z.json:34-55,74-86`; `scripts/validate-lab-corpus.mjs:142-180`                                          | Identical filenames below distinct scopes remain distinct candidates.                                                                                                                |
| RM-CL-04 | Exactly one witness candidate equals the effective package target.                              | `derived-from-capture`: `captures/co-declared-share/20260813T151211Z.json:117-124`; `scripts/validate-lab-corpus.mjs:182-204`                                              | Exact URL equality selects `mfe1` as the observed source for this capture.                                                                                                           |
| RM-CL-05 | `cached` is not a provider or browser-cache rule.                                               | `capture-confirmed`: `captures/co-declared-share/20260813T151211Z.json:67-86`; `source-confirmed`: orchestrator `basis.ts:3-29`                                            | Preserve registry metadata. Existing `cached` can affect a newly generated basis, but views never elect from it.                                                                     |
| RM-CL-06 | `remotes[0]` is the registry basis slot for a non-scoped registration.                          | `source-confirmed`: orchestrator `basis.ts:5-45`; `determine-shared-externals.split.spec.ts:403-430`                                                                       | Preserve a qualified slot claim; do not generalize it to every entrypoint or consumer.                                                                                               |
| RM-CL-07 | A `share` registration can jointly supply entrypoints from several declarations.                | `source-confirmed-unobserved`: orchestrator `basis.ts:62-115`; `generate-import-map.ts:406-440`                                                                            | Apply the action/path matrix in §6.1; `scope` stays per declaration, skip paths differ, and equal tags in separate registrations do not union. Require a real witness if producible. |
| RM-CL-08 | `servedBy` is optional and per consumer/member; its source search can cross external records.   | `source-confirmed-unobserved`: orchestrator `version.contract.ts:22-33`; `generate-import-map.ts:262-340`                                                                  | Preserve separately; different consumers may have different anchors, self-anchor is valid, and consumer/source package are distinct.                                                 |
| RM-CL-09 | `pool` is participant metadata, not a global pool ID or provider.                               | `source-confirmed-unobserved`: orchestrator `pool-graph.ts:51-169`; `pool.util.ts:19-40`                                                                                   | Preserve the raw value; defer derived pool components until witnessed and specified.                                                                                                 |
| RM-CL-10 | `scope` maps each declaration's own isolated context, not necessarily a strict-version failure. | `source-confirmed`: orchestrator `generate-import-map.ts:124-136,359-375`; `pool-shared-externals.ts:65-84`; dynamic anchor path `pool-views.ts:35-49`                     | Do not invent a cause from action alone or deny a separately evidenced later anchor role.                                                                                            |
| RM-CL-11 | `skip` can map a shared fallback, anchor, or skip self-fill source.                             | `source-confirmed-unobserved`: orchestrator `generate-import-map.ts:194-208,359-466`; `convert-to-import-map.ts:59-82,175-198`                                             | Keep skip registrations and resolve per specifier; no universal “never mapped/no chunks” rule.                                                                                       |
| RM-CL-12 | Observed target ownership is URL attribution.                                                   | `derived-from-capture`: `captures/co-declared-share/20260813T151211Z.json:34-124`; `scripts/validate-lab-corpus.mjs:142-204`                                               | Keep exact candidate and bounded scope-prefix outcomes separate from registry claims.                                                                                                |
| RM-CL-13 | Import-map evidence does not prove runtime lookup or delivery.                                  | `normative-decision`, grounded in `projects/devtools-bridge/src/lib/snapshot-v1.ts:5-9` and `projects/devtools-ui/src/app/views/import-map/import-map-view-model.ts:30-32` | Use resolution-honest wording throughout Store, views, diagnostics, and graph.                                                                                                       |
| RM-CL-14 | Scoped externals have raw identity `(remote, package)` and a complete private-resolution path.  | `capture-confirmed`: `captures/scoped/20260811T095215Z.json:58-77,101-115`; bridge contract `projects/devtools-bridge/src/lib/snapshot-v1.ts:126-140`                      | Keep private records separate; synthetic graph `scope` is projection provenance.                                                                                                     |
| RM-CL-15 | Chunk evidence follows the selected entrypoint source and is path-dependent.                    | `source-confirmed-unobserved`: orchestrator `generate-import-map.ts:156-208,406-466`; missing losing-bundle witness                                                        | Attribute through source/copy claims; self-fill without chunk registration remains `source-only`.                                                                                    |
| RM-CL-16 | The graph is a downstream projection, not a second resolver.                                    | `normative-decision`; challenger conflict: external `DEPENDENCY-GRAPH.md:248-342,361-475,847-879`                                                                          | One raw-free canonical projection drives all views and any future graph.                                                                                                             |
| RM-CL-17 | `dirty` belongs to the `(shareScope, package)` wrapper, not a version row.                      | `capture-confirmed`: `captures/co-declared-share/20260813T151211Z.json:58-63`; `source-confirmed`: orchestrator `external.contract.ts:11-14`                               | Preserve `SharedExternalRecord`; do not denormalize `dirty` as raw version evidence.                                                                                                 |
| RM-CL-18 | Several declaration claims can converge on one scope-context/specifier binding.                 | `source-confirmed-unobserved`: orchestrator `generate-import-map.ts:419-440,493-505`                                                                                       | Derive one `EffectiveConsumerResolution` with many claim IDs; never count claims as bindings.                                                                                        |
| RM-CL-19 | Import-map lookup continues through less-specific matching scopes after a key miss.             | existing lookup: `projects/devtools-ui/src/app/shared/store/ingest.ts:188-215`; seeded standard vector required                                                            | Search matching scopes longest-to-shortest before top-level imports; never jump directly from the most-specific miss to top level.                                                   |

## 13. Witness matrix and open evidence

| Witness                                      | State                       | What it must prove or already proves                                                                                                                                                                                  | Gate                                                                        |
| -------------------------------------------- | --------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------- |
| `co-declared-share`                          | Real capture                | One share registration, two declarations, two candidate URLs, one exact selected target.                                                                                                                              | Required regression for model and all affected VMs.                         |
| `clean-skip`                                 | Real capture                | Distinct share/skip registrations and ordinary fallback mapping.                                                                                                                                                      | Characterize before derivation rewrite.                                     |
| `strict-split`                               | Real capture                | Three registrations, two declared tags, and two mapped copies; equal-tag `skip`/`scope` rows do not union.                                                                                                            | Characterize before copy/conflict rewrite.                                  |
| `strict-scope`                               | Real capture                | Named strict scope can exist without `__GLOBAL__`; scope identity is independent.                                                                                                                                     | Required regression.                                                        |
| `scope-isolation` / `scoped`                 | Real capture                | Isolated shared outcomes and non-singleton private registrations remain distinct; `scoped` yields two private registration → resolution → copy paths.                                                                 | Required regression.                                                        |
| Pooling with `servedBy`                      | Missing real capture        | Optional raw fields, per-consumer anchors, target agreement, and chunk source.                                                                                                                                        | **Blocks collector-schema change.**                                         |
| Losing bundle-bearing declaration            | Missing real capture        | A non-selected declaration cannot donate chunk attribution.                                                                                                                                                           | Blocks claiming chunk rewrite fully capture-backed.                         |
| Same-registration multi-entrypoint providers | Source/E2E only             | A `share` registration's primary and secondary specifiers can come from different declaration-backed copies; action-specific `scope`/`skip` paths remain distinct, and equal tags in other registrations do not join. | Attempt real capture; otherwise retain source-backed seeded test.           |
| Skip self-fill                               | Source/corpus mechanism gap | One skip source can fill an entrypoint for itself and later skip consumers; cold-global versus named/dynamic chunk evidence differs.                                                                                  | Seeded positive/negative characterization required; real capture preferred. |
| Overlapping specifier claims                 | Source only                 | Several external/declaration claims converge on one effective scope-context/specifier binding with deterministic map precedence.                                                                                      | Seeded test required before Store migration.                                |
| Import-map prefix key                        | Uncharacterized             | Standards-compatible prefix matching differs from exact-key-only lookup.                                                                                                                                              | Seeded standard vector blocks claiming complete resolution.                 |
| Nested import-map scope fallback             | Source/seed only            | A key miss in the longest matching scope continues through less-specific matching scopes before top-level imports.                                                                                                    | Seeded positive and negative vector required before Store migration.        |
| Generation matrix                            | Existing captures + seed    | v4 `file`, v4.5 single/multi-key `entries`, and mixed-generation normalization produce stable candidates without downstream branching.                                                                                | Required migration regression.                                              |

The corpus validator currently accepts 11 lab captures plus two live phases.
Documentation and validator predicates that still call the catalog “10
captures” or call the `pool`/`servedBy` drop final MUST be corrected in the
implementation plan; that correction is not evidence of the missing witness.

Open product/evidence decisions:

1. Establish the maintainer document's plugin/source/version provenance and
   redistribution permission before copying any of it into the repository.
2. Decide whether `@nf-internal/chunk-*` scoped externals are user-facing
   private dependencies or implementation chunk records; preserve raw
   provenance until then.
3. If a real same-registration multi-entrypoint-provider scenario cannot be
   built, document why, retain the source-backed seeded test, and keep the
   exact-source/target fallback boundary in §7.1.
4. Runtime request, download, evaluation, and wire-cost claims require a future
   evidence channel and a separate specification.

## 14. Acceptance criteria and invariants

### RM-AC-01 — Evidence traceability

Every candidate, declaration claim, effective resolution, copy, source
attribution, comparison, and chunk claim links to its raw source records plus
the effective-map entry and a named rule. Missing and ambiguous evidence
remains representable.

### RM-AC-02 — Registration/declaration cardinality

`co-declared-share` produces exactly one version registration and two
participant declarations. Given an unchanged captured effective map, reversing
registry-only fixture order or changing `cached` does not change exact URL
matching or observed target ownership; it may change the derived registry slot,
and a real orchestrator run over the mutation may generate a different map.

### RM-AC-03 — Candidate and selected-copy cardinality

The same witness produces two distinct candidate URLs, two declaration claims,
two effective consumer resolutions because its normalized consumer scope URLs
are distinct, one effective target URL, one exact source declaration, and one
resolved dependency copy. A seeded alias case in which two remote names share
one normalized consumer scope URL produces one effective resolution with two
consumer contexts. `mfe2` remains a declaration and candidate but is not
rendered as an own selected copy.

### RM-AC-04 — True multi-version distinction

The existing synthetic case with two actual version registrations remains
distinguishable from one registration with two participants. Every package
projection exposes registration count, distinct declared-tag count, resolved
copy count, and distinct resolved-tag count separately. `strict-split` pins
three registrations, two declared tags, and two mapped copies; equal-tag copy
fragments alone do not constitute a version conflict.

### RM-AC-05 — Per-consumer, per-specifier resolution

`clean-skip`, `strict-split`, named scopes, same-registration multi-entrypoint
coverage, pool anchors, skip self-fill, and private registrations resolve per
consumer-scope/specifier. Multiple overlapping claims share one effective
binding. `scoped` yields two private registrations, claims, effective
resolutions, and copies without a fabricated share scope/action. A missing
consumer scope yields `unknown`, never an implicit page-base lookup. Prefix-key
behavior is either standards-pinned by a seed or explicitly `unknown`. A
nested-scope seed proves that a miss in the most-specific matching scope can
resolve in a less-specific matching scope before top-level imports.

### RM-AC-06 — Qualified source claims

`registryServingSlot`, `servedBy`, exact candidate source, scope-derived
`observedTargetProvider`, and delivery evidence are separate fields. Their
agreements can be `match`, `mismatch`, or `unknown`; no universal equality is
asserted. The closed comparison kinds and canonical left/right orientation are
type- and ID-stable. Tests pin a unique exact match, exact-match ambiguity,
equal-prefix scope ambiguity, host fallback, unattributable target, expected
secondary-entry slot mismatch, and a cross-external `servedBy` source.

### RM-AC-07 — Pooling schema gate

No collector/bridge schema change for `pool` or `servedBy` lands before a real
witness. After the witness, both schema copies, mapper, snapshot contract,
validator, fixtures, drift guards, and security tests change together and
older snapshots remain readable. Snapshot keys stay optional, old/new export
round-trips and collector provenance are pinned, and only Store normalization
turns absence into `null`.

### RM-AC-08 — View consistency

Packages, Remotes, Import Map, and Diagnostics use the same canonical IDs and
counts. No view interprets participant-row count as version/copy count or every
non-`skip` participant as a provider.

### RM-AC-09 — Chunk attribution

Chunk claims follow the declaration/build that supplies the mapped specifier.
Tests cover a non-selected bundle-bearing declaration, a selected
same-registration secondary provider, a `servedBy` anchor, cold-global
skip-self-fill with chunks, and named/dynamic self-fill without registered
chunks before the UI claims package-level accuracy. Equal chunk filenames from
different emitters remain distinct.

### RM-AC-10 — Resolution-honest language

Code, tests, labels, tooltips, diagnostics, and the future graph use
`mapped/resolves to/selected` without delivery verbs unless a delivery channel
is present. A repository search guards the affected resolution UI against the
forbidden wording in §10.4.

### RM-AC-11 — Graph boundary

The resolution-model phase exports and tests a raw-free
`CanonicalResolutionProjection` containing remotes, all copy source
dispositions and effective roles, consumer-copy relations, chunk claims, and
completeness counts. The deferred graph task MUST add an import-boundary guard
that fails if graph code reads raw snapshot/cache types or reconstructs action,
provider, copy, or chunk semantics.

### RM-AC-12 — Determinism, corpus, and safety

IDs and derivations are deterministic across byte-identical inputs; all 11 lab
captures and both live phases remain valid; derived fixtures are byte-stable;
v4 `file`, v4.5 single/multi-entry `entries`, and the mixed-generation seed are
covered; hostile-page limits and privacy sanitization remain intact; duplicate
keys/names, unknown actions, and delimiter-bearing identity components cannot
collide; the full test and extension-build chain stays green.

### RM-AC-13 — Fixture-to-view truth chain

The corpus validator and fixture-drift guard remain green. Independent,
evidence-cited witness expectations pin the six cases in §10.5; a generic
contract covers every corpus-derived fixture and proves cross-view ID, count,
target, and relationship consistency. Reintroducing participant flattening
causes the `co-declared-share` assertions to fail. Focused DOM tests and a
separate manual screenshot walkthrough complete semantic and visual acceptance
without a new screenshot-testing framework.

## 15. Review and approval gate

The reviewer should explicitly confirm:

1. consumer/specifier resolution as the atomic truth;
2. the hierarchical copy identity in §7.1;
3. the qualified provider vocabulary and delivery-language boundary;
4. the real-witness gate before `pool`/`servedBy` schema work;
5. the graph's downstream-only boundary;
6. the open decisions in §13 are acceptable as gated follow-ups rather than
   unresolved core semantics;
7. the automated fixture truth contract and manual screenshot walkthrough in
   §10.5 are sufficient acceptance without a new E2E framework.

Approval record:

```text
Status: APPROVED
Approved by: Maintainer (chat)
Approved at: 2026-08-14
Notes: Approved with the YAGNI, Clean Code/SRP, fixture-truth, and manual
walkthrough boundaries reflected in the branch-scoped implementation plan.
```

No implementation plan or production-code change should begin until this
specification is reviewed and approved. After approval, use the plan workflow
on `feature/resolution-model` to create
`docs/work/resolution-model/plan.md`; the first implementation commit must
follow that approved plan.
