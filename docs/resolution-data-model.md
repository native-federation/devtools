# Resolution data model

This is the maintained model documentation of the DevTools resolution
pipeline: first the big picture and the view-model boundary beneath it, then
the five detailed class-diagram views of the store model. The normative
contract behind it is
[the resolution-model specification](specs/native-federation-resolution-model.md);
this document describes what the code implements today.

## The big picture

The whole system answers one question:

> A probe records what the page really declared. From that, pure functions
> compute: **which package lands where for which consumer — and why?**

Everything else is four stages, each answering exactly one question and each
adding one guarantee:

```mermaid
flowchart LR
  subgraph observe ["1 · Observe"]
    snapshot["SnapshotV1<br/>raw, sanitized facts"]
  end
  subgraph order ["2 · Order"]
    evidence["CanonicalRegistryEvidence<br/>every raw row addressable"]
  end
  subgraph derive ["3 · Derive"]
    resolutions["EffectiveConsumerResolution<br/>what does the map deliver?"]
    claims["Claims<br/>how does each registry row explain that?"]
    copies["ResolvedDependencyCopy<br/>how many material copies exist?"]
    bundles["Bundle and chunk claims<br/>which chunks belong to them?"]
    pools["Tag pools and pool families<br/>which packages travel together, and what did pooling do?"]
    verdicts["Package scope verdicts<br/>what did the resolver decide per version and declaration?"]
  end
  subgraph publish ["4 · Publish"]
    projection["CanonicalResolutionProjection<br/>one raw-free read surface"]
  end

  page["Page runtime +<br/>import maps"] --> snapshot
  snapshot --> evidence
  evidence --> resolutions --> claims --> copies --> bundles --> pools --> verdicts --> projection
  projection --> views["Views and any future graph"]
```

1. **Observe** — the collector probes read the Native Federation registry
   from wherever the orchestrator keeps it (a page global or web storage,
   recorded as `runtimeSource`) plus the document import maps and store them
   as a `SnapshotV1`: sanitized, but never interpreted. What was absent
   stays absent.
2. **Order** — ingest normalizes the raw repositories into
   `CanonicalRegistryEvidence`: every raw row gets a deterministic ID and
   provenance. Nothing is merged, de-duplicated, or decided here.
3. **Derive** — a chain of pure functions computes the answer in six
   sub-questions: the import-map outcome per consumer and specifier (the
   atomic truth, with honest `mapped | unmapped | blocked | unknown`
   states), the claim explanations of every registry row against that
   outcome, the materially resolved dependency copies, the bundle/chunk
   attribution, the explicit-tag pools — membership rebuilt from the
   stored `pool` tags as the orchestrator forms it, and per pool what
   pooling did to each remote's copy, read off the rows it wrote back —
   and the resolver's verdicts per registry key: the elected version, the
   status of every registered version, and what each declaration got
   (provides, reuses the shared copy, own copy, out of range). Nothing at
   this stage guesses: ambiguity stays visible as data.
4. **Publish** — one raw-free `CanonicalResolutionProjection` on the store
   model is the single surface views (and any future graph) read. No view
   re-derives winners, copy counts, or chunk ownership.

One boundary holds everywhere: the model proves what the captured import map
**resolves** — never that the browser requested, downloaded, cached, or
executed anything.

## The view-model boundary

The projection is the model's publication format, not a render format: flat,
normalized collections that reference each other only by canonical ID, and
deliberately pivot-neutral. Each view therefore keeps one thin, pure
view-model builder (for example `buildPackagesVm`) between the projection and
its template. That layer exists for exactly two jobs:

- **Joining and pivoting.** Templates cannot join by ID. The builder indexes
  the three read surfaces once (`resolutionProjection`,
  `effectiveConsumerResolutions`, `registryEvidence`) and folds them into the
  view's shape: Packages pivots the consumer → copy → chunk spine on the
  package, Remotes pivots it on the consumer, Import Map on the map entries,
  a future graph on all edges. Because several presentations read the one
  truth, the projection must stay pivot-neutral — baking any render shape
  into it would color canonical evidence with UI decisions.
- **Presentation judgements.** Display vocabulary and wording
  (`skipped own 1.0.0`, `mapped only for X`), deviation-first choices (what
  is a chip, what is a tooltip), ordering (elected copy first), and view-level
  indicators such as the resolved-tag-multiplicity glyph are view decisions,
  not domain facts — the actual conflict judgement belongs to diagnostics.

The boundary rule is strict in both directions and testable: a view-model
builder **groups and labels precomputed knowledge — it derives nothing new**.
It never computes winners, copy counts, roles, or chunk ownership; every
field it emits chains to a canonical ID, and the builders are pure functions
pinned by tests without a DOM. If a builder needs a fact the projection does
not state, the fact belongs in the model — not in the view.

## The model in five views

One captured `SnapshotV1` becomes one `FederationModel`. The Store keeps the
captured registry declarations, remote scope URLs, and import-map evidence
separate until `resolveEffectiveConsumerBindings` joins them. The diagrams show
the resolution-relevant part of that model in five focused views maintained
next to each other: captured registry evidence first, effective resolution
second, declaration-claim explanations third, materialized resolved copies
fourth, and the published canonical projection fifth.

| Layer                  | Snapshot source                                         | Store representation            |
| ---------------------- | ------------------------------------------------------- | ------------------------------- |
| Registry declarations  | `runtime.sharedExternals` and `runtime.scopedExternals` | `CanonicalRegistryEvidence`     |
| Consumer scope context | `runtime.remotes`                                       | `RemoteEntity[]`                |
| Import-map rules       | `importMaps.documentMaps`                               | `EffectiveMap`                  |
| Canonical result       | The three inputs above plus `channels.domImportMaps`    | `EffectiveConsumerResolution[]` |
| Claim explanations     | Registry evidence plus canonical results                | `ResolutionClaimsDerivation`    |
| Resolved copies        | Mapped canonical results plus their claims              | `ResolvedDependencyCopy[]`      |
| Package measures       | Registry evidence, claims, and resolved copies          | `PackageResolutionMeasures[]`   |
| Chunk groups           | `runtime.sharedChunks` and `@nf-internal/...` records   | `ChunkGroupProjection[]`        |
| Bundle claims          | Resolved copies plus chunk groups                       | `BundleClaim[]`                 |
| Tag pools              | Registry evidence: `pool` tags and stored `poolName`    | `TagPool[]`, `OrphanPoolTag[]`  |
| Grouping facets        | Copies, bundle claims, registry evidence, tag pools     | `CopyGroupingFacets[]`          |
| Pool families          | Registry rows written back by pooling, tag pools        | `PoolFamily[]`                  |
| Package verdicts       | Registry evidence, claims, copies, bundle claims, chunks | `PackageScopeVerdicts[]`        |
| Canonical projection   | Every canonical layer above                             | `CanonicalResolutionProjection` |
| Existing view contract | Registry evidence plus canonical results                | `SharedParticipantRow[]`        |

### 1. Registry evidence

This view answers _who declared what?_ `CanonicalRegistryEvidence` stores the
records as flat, ordered arrays. The arrows show their logical parent/child ID
relationships; no winner or effective file is selected here.

```mermaid
classDiagram
  direction LR

  class FederationModel {
    +CanonicalRegistryEvidence registryEvidence
  }
  class CanonicalRegistryEvidence {
    +SharedExternalRecord[] sharedExternals
    +VersionRegistration[] versionRegistrations
    +ParticipantDeclaration[] participantDeclarations
    +PrivateRegistration[] privateRegistrations
    +EntrypointCandidate[] entrypointCandidates
    +RegistryEvidenceDiagnostic[] diagnostics
  }
  class SharedExternalRecord {
    +string shareScope
    +string packageName
    +boolean dirty
    +string? poolName
  }
  class VersionRegistration {
    +string tag
    +string rawAction
    +RegistrationAction action
    +boolean host
  }
  class ParticipantDeclaration {
    +string participant
    +string requiredVersion
    +boolean strictVersion
    +string? pool
    +string? servedBy
    +string? poolCause
  }
  class PrivateRegistration {
    +string ownerRemote
    +string packageName
    +string tag
  }
  class EntrypointCandidate {
    +string specifier
    +string file
    +string? candidateUrl
    +CandidateUrlState candidateUrlState
  }
  class RegistryEvidenceDiagnostic {
    +string code
    +string message
    +string rawValue
  }
  class EvidenceRef {
    +"snapshot" source
    +PathSegment[] path
    +EvidenceState state
  }

  FederationModel "1" *-- "1" CanonicalRegistryEvidence : registryEvidence
  CanonicalRegistryEvidence "1" *-- "0..*" SharedExternalRecord : shared roots
  CanonicalRegistryEvidence "1" *-- "0..*" PrivateRegistration : private roots
  CanonicalRegistryEvidence "1" *-- "0..*" RegistryEvidenceDiagnostic : diagnostics

  SharedExternalRecord "1" --> "0..*" VersionRegistration : ordered IDs
  VersionRegistration "1" --> "0..*" ParticipantDeclaration : ordered IDs
  ParticipantDeclaration "1" --> "0..*" EntrypointCandidate : ordered IDs
  PrivateRegistration "1" --> "0..*" EntrypointCandidate : ordered IDs

  CanonicalRegistryEvidence ..> EvidenceRef : every record cites snapshot paths
```

### 2. Effective consumer resolution

This view answers _where would that declaration resolve at the consumer's
scope root?_ The package name, consumer, normalized remote scope URL, and
effective import map meet only in `EffectiveConsumerResolution`. The scope URL
is a lookup context, not an observed importer-module URL.

```mermaid
classDiagram
  direction LR

  class FederationModel {
    +CanonicalRegistryEvidence registryEvidence
    +EffectiveMap effectiveMap
    +RemoteEntity[] remotes
    +EffectiveConsumerResolution[] effectiveConsumerResolutions
    +SharedParticipantRow[] sharedRows
  }
  class CanonicalRegistryEvidence {
    +SharedExternalRecord[] sharedExternals
    +ParticipantDeclaration[] participantDeclarations
  }
  class SharedExternalRecord {
    +string packageName
  }
  class ParticipantDeclaration {
    +string participant
  }
  class RemoteEntity {
    +string name
    +string resolvedScopeUrl
  }
  class EffectiveMap {
    +Map imports
    +Map scopes
    +Map integrity
  }
  class EffectiveConsumerResolution {
    +string id
    +string scopeContextKey
    +string? consumerScopeUrl
    +string specifier
    +ResolutionStatus status
    +string[] consumerRemotes
    +string? targetUrl
    +boolean? hasIntegrity
    +EffectiveMapEntryProvenance? mapEntry
    +BlockedReason? blockedReason
    +UnknownReason[]? unknownReasons
  }
  class EffectiveMapEntryProvenance {
    +string? scope
    +string specifier
    +string target
    +MatchKind match
  }
  class SharedParticipantRow {
    <<compatibility projection>>
    +string participant
    +string packageName
    +EffectiveResolution? resolution
  }

  FederationModel "1" *-- "1" CanonicalRegistryEvidence : registryEvidence
  FederationModel "1" *-- "0..*" EffectiveConsumerResolution : canonical results
  CanonicalRegistryEvidence "1" --> "0..*" SharedExternalRecord : package claims
  CanonicalRegistryEvidence "1" --> "0..*" ParticipantDeclaration : consumer claims

  SharedExternalRecord ..> EffectiveConsumerResolution : package specifier
  ParticipantDeclaration "1..*" --> "1" EffectiveConsumerResolution : consumer claim
  RemoteEntity --> EffectiveConsumerResolution : consumer scope context
  EffectiveMap --> EffectiveConsumerResolution : scoped exact / prefix lookup
  EffectiveConsumerResolution "1" o-- "0..1" EffectiveMapEntryProvenance : mapped or blocked

  ParticipantDeclaration "1" ..> "1" SharedParticipantRow : registry context
  EffectiveConsumerResolution "1" ..> "1..*" SharedParticipantRow : resolution projection
```

Read the first two views from evidence to result: `normalizeRegistryEvidence`
retains every captured declaration and its snapshot paths; `mergeDocumentMaps`
normalizes the document tags into one `EffectiveMap`; remote scope URLs provide
the scope-root lookup context. The resolver evaluates one binding per scope
context and specifier — every declaration's registry package plus each
candidate specifier, including private registrations — and records exactly one
honest outcome. Modules under a more specific map scope or outside the remote
scope can resolve differently:

- `mapped` means a matching, valid import-map binding supplies the normalized
  target.
- `unmapped` means the map and consumer scope context are known, but no
  applicable import-map binding exists.
- `blocked` means a matching binding exists, but its target is unusable (for
  example an invalid URL or prefix expansion); the entry and exact reason are
  retained.
- `unknown` means the map channel or consumer scope evidence is missing.

`SharedParticipantRow` is only a one-way projection for existing views. It is
never input to canonical resolution. A mapped result describes what the
captured map would bind — not the browser's complete URL fallback behavior, nor
what it requested, downloaded, or executed. In particular, a URL-like
specifier without a matching map entry remains `unmapped` here even though the
browser can resolve that URL without an import-map binding. The
registry-specific rationale and invariants remain in the
[Task 1 design notes](work/resolution-model/task-1-domain-model.md), without
another copy of the diagrams.

### 3. Declaration resolution claims

This view answers _how does each declaration explain the computed binding?_
Every shared or private entrypoint candidate creates one
`DeclarationResolutionClaim` against the already computed
`EffectiveConsumerResolution`; several claims may point at the same binding
without duplicating it. The layer is a pure derivation
(`deriveResolutionClaims`) over the two views above; a later task publishes its
output on the store model.

```mermaid
classDiagram
  direction LR

  class VersionRegistration {
    +string tag
    +RegistrationAction action
  }
  class ParticipantDeclaration {
    +string participant
    +string? servedBy
  }
  class PrivateRegistration {
    +string ownerRemote
  }
  class EntrypointCandidate {
    +string specifier
    +string? candidateUrl
  }
  class EffectiveConsumerResolution {
    +ResolutionStatus status
    +string? targetUrl
  }
  class RegistryServingSlotClaim {
    +SlotStatus status
    +ParticipantDeclarationId? declarationId
  }
  class DeclarationResolutionClaim {
    +string consumerRemote
    +string consumerRegistryPackage
    +string specifier
    +string? ownCandidateUrl
    +boolean? ownCandidateSelected
    +ClaimMappingState mappingState
    +SourceAction sourceAction
    +ResolvedDependencyCopyId? copyId
  }
  class ObservedTargetProvider {
    +string? remote
    +SourceMatchOutcome outcome
    +AttributionRule rule
  }
  class SourceMatch {
    +SourceMatchOutcome outcome
    +ResolutionSubject? source
  }
  class SourceComparison {
    +SourceComparisonKind kind
    +QualifiedSourceClaim left
    +QualifiedSourceClaim right
    +ComparisonStatus status
  }

  VersionRegistration "1" --> "1" RegistryServingSlotClaim : stored-order basis slot
  ParticipantDeclaration "1" --> "0..*" DeclarationResolutionClaim : one per candidate
  PrivateRegistration "1" --> "0..*" DeclarationResolutionClaim : one per candidate
  EntrypointCandidate "1" --> "1" DeclarationResolutionClaim : own candidate
  DeclarationResolutionClaim "1..*" --> "1" EffectiveConsumerResolution : explains binding
  EffectiveConsumerResolution "1" --> "1" ObservedTargetProvider : attribution ladder
  EffectiveConsumerResolution "1" --> "1" SourceMatch : observed source
  DeclarationResolutionClaim "1" *-- "1..3" SourceComparison : slot / anchor / candidate
  SourceComparison ..> RegistryServingSlotClaim : left registry claim
  SourceComparison ..> ObservedTargetProvider : right observed source
```

`mappingState` explains the claim with one normative precedence; the
independent `ownCandidateSelected` flag records exact own-candidate equality
separately:

- `anchored` — `servedBy` is present and the target matches an anchor
  candidate of that remote within the share scope, across external records;
  `servedBy === consumerRemote` is a valid self-anchor.
- `own-selected` — the target exactly equals the claim's own candidate URL.
- `fallback` — a `skip` claim resolves to the unique matching `share` source
  of the same shared external; the raw action is retained.
- `not-selected` — an own candidate exists, the target differs, and no rule
  above explains it (the visible `mfe2` claim in `co-declared-share`).
- `blocked` — the binding is terminally blocked: nothing is selected and no
  source is attributed.
- `unknown` — map, consumer scope, candidate URL, source match, or
  explanation is missing or ambiguous.

The observed side stays qualified: exact candidate equality outranks
scope-prefix ownership, the host never outranks a matching remote, and
ambiguity retains all candidates instead of choosing one. Comparisons never
collapse the sides — only `slot-vs-observed`, `anchor-vs-observed`, and
`candidate-vs-target` exist, with the registry-side claim always on the left —
and a mismatch is data, not permission to overwrite either fact. No mapping
state or attribution outcome proves that anything was requested, downloaded,
or executed.

### 4. Resolved dependency copies

This view answers _which materially resolved instances of a dependency exist,
and who uses them?_ Only `mapped` effective resolutions and their claims
materialize a `ResolvedDependencyCopy` — candidates and participant membership
alone never do. Sharing success reads as convergence: many registrations,
declarations, and claims may end in one copy, and one registration can yield
zero, one, or several copies. The layer is a pure derivation
(`materializeResolvedCopies`, `aggregatePackageMeasures`) over the views
above; ingest publishes its output through the canonical projection (view 5).

```mermaid
classDiagram
  direction LR

  class VersionRegistration {
    +string tag
    +RegistrationAction action
  }
  class ParticipantDeclaration {
    +string participant
  }
  class PrivateRegistration {
    +string ownerRemote
  }
  class EffectiveConsumerResolution {
    +ResolutionStatus status
    +string? targetUrl
  }
  class SourceMatch {
    +SourceMatchOutcome outcome
    +ResolutionSubject? source
  }
  class DeclarationResolutionClaim {
    +ClaimMappingState mappingState
    +ResolvedDependencyCopyId? copyId
  }
  class ResolvedDependencyCopy {
    +ResolvedCopySource source
    +string? sourcePackage
    +string? resolvedTag
    +ResolvedCopySourceDisposition sourceDisposition
    +SourceAction[] sourceActions
    +ResolvedCopyEffectiveRole[] effectiveRoles
    +Map entrypoints
    +SourceRegistrationRef[] sourceRegistrationRefs
    +BundleClaimId[] bundleClaimIds
  }
  class ResolvedCopyResolutionContext {
    +ResolutionDomain resolutionDomain
    +string consumerRegistryPackage
    +ClaimId[] claimIds
  }
  class PackageResolutionMeasures {
    +string packageName
    +int registrationCount
    +int distinctDeclaredTagCount
    +int resolvedCopyCount
    +int distinctResolvedTagCount
    +int unknownResolvedTagCopyCount
  }

  SourceMatch ..> ResolvedDependencyCopy : unique exact subject keys the copy
  ParticipantDeclaration "1" --> "0..1" ResolvedDependencyCopy : source-record identity
  PrivateRegistration "1" --> "0..1" ResolvedDependencyCopy : source-record identity
  VersionRegistration ..> ResolvedDependencyCopy : resolvedTag and sourceDisposition
  EffectiveConsumerResolution "1..*" --> "0..1" ResolvedDependencyCopy : mapped members only
  ResolvedDependencyCopy "1" *-- "0..*" ResolvedCopyResolutionContext : consumer uses
  ResolvedCopyResolutionContext "1" --> "1..*" DeclarationResolutionClaim : claim IDs
  DeclarationResolutionClaim "0..*" --> "0..1" ResolvedDependencyCopy : copyId
  ResolvedDependencyCopy "0..*" ..> "1" PackageResolutionMeasures : outcome counts
```

Copy identity is hierarchical and source-oriented. A resolution whose target
uniquely and exactly matches one source's candidate takes that source-record
identity — the shared `ParticipantDeclaration` or `PrivateRegistration` —
grouping every mapped entrypoint of that source across all consumer contexts.
Anything else groups by the normalized target URL — the copy ID namespaces
that identity by snapshot — without claiming a source. Consumer share scope,
package, and claim IDs live only in `resolutionContexts`; an exact source copy
is never duplicated or relabeled because another consumer context or external
record points at one of its URLs. `resolvedTag` comes only from the uniquely
matched source registration — a URL-identified copy keeps it `null` rather
than borrowing a consumer's declared tag. After materialization,
`attachCopyIds` completes the claim contract: a mapped claim references its
copy through `copyId`, and unmapped, blocked, and unknown claims carry an
explicit `null`.

Source provenance and effective behavior stay separate axes:

- `sourceDisposition` says where the copy's bytes come from —
  `share-registration`, `skip-registration`, or `scope-registration` from the
  unique source's raw action, `private-registration`, `unknown-registration`,
  `ambiguous-source`, or `target-only` when nothing but the URL is evidenced.
  Consumer actions never change it.
- `effectiveRoles` (sorted, coexisting) derive from the attached claim and
  action evidence, never from consumer counts: a selected `share` surface
  contributes `ordinary-shared` even with a single consumer, a `scope`
  declaration's own mapping contributes `isolated-own`, selection through an explicit
  `servedBy` `anchor-source`, a private registration's own mapping
  `private-own`, and a copy no closed rule explains stays `unclassified`.
- `sourceActions` lists evidenced source actions only, never every consumer
  claim's action.

`PackageResolutionMeasures` keeps four package-level counts deliberately
separate — shared version registrations and their distinct declared tags
describe intent (private registrations are separate canonical records and
never fold into these), resolved copies and distinct resolved tags (plus
unknown-tag copies) describe outcome — with declaration and claim counts as
supporting measures. The aggregation has
no conflict field: equal-tag copy multiplicity alone is never reported as a
version conflict; that judgement needs distinct registration and tag evidence
and belongs to diagnostics. As everywhere in this model, a copy proves what
the captured map resolves, not that the browser requested, downloaded, or
executed the target.

### 5. Canonical resolution projection

This view answers _what do views (and any future graph) read?_ Ingest runs
the complete canonical pipeline — claims, copies with attached `copyId`
links, chunk groups, bundle claims, package measures, tag pools, grouping
facets, pool families, package verdicts — and publishes one
raw-free `CanonicalResolutionProjection` on the store model
(`buildCanonicalProjection`). The projection never exposes `SnapshotV1`, the
raw repositories, or the compatibility `sharedRows`; its
`effectiveResolutionId` references resolve against the canonical
`effectiveConsumerResolutions` collection of view 2.

```mermaid
classDiagram
  direction LR

  class FederationModel {
    +CanonicalResolutionProjection resolutionProjection
  }
  class CanonicalResolutionProjection {
    +RemoteProjection[] remotes
    +ResolvedDependencyCopy[] copies
    +ConsumerCopyRelation[] consumerRelations
    +ChunkGroupProjection[] chunkGroups
    +BundleClaim[] bundleClaims
    +DeclarationResolutionClaim[] declarationResolutionClaims
    +RegistryServingSlotClaim[] registryServingSlotClaims
    +ObservedTargetProvider[] observedTargetProviders
    +SourceComparison[] sourceComparisons
    +PackageResolutionMeasures[] packageMeasures
    +TagPool[] tagPools
    +OrphanPoolTag[] orphanPoolTags
    +PoolFamily[] poolFamilies
    +CopyGroupingFacets[] copyGroupingFacets
    +PackageScopeVerdicts[] packageScopeVerdicts
    +ResolutionCompleteness completeness
  }
  class PackageScopeVerdicts {
    +SharedExternalId sharedExternalId
    +string shareScope
    +string packageName
    +string? electedTag
    +VersionVerdict[] versions
    +DeclarationVerdictRecord[] declarations
  }
  class VersionVerdict {
    +string tag
    +VersionStatus status
    +ResolvedDependencyCopyId[] copyIds
    +VersionBuild[] builds
    +boolean merged
  }
  class DeclarationVerdictRecord {
    +ParticipantDeclarationId declarationId
    +DeclarationVerdict verdict
    +boolean? acceptsElected
    +string? runsTag
  }
  class TagPool {
    +string name
    +string shareScope
    +string[] members
    +PoolTagDeclaration[] tags
    +string[] remotes
  }
  class PoolFamily {
    +TagPoolId poolId
    +PoolFamilyMember[] members
    +PoolStatusMatrix statusMatrix
    +PoolConsumer[] consumers
    +boolean pending
  }
  class CopyGroupingFacets {
    +ResolvedDependencyCopyId copyId
    +string? shareScope
    +TagPoolId? tagPoolId
    +CopyBuild[] builds
  }
  class ConsumerCopyRelation {
    +string consumerRemote
    +ResolvedDependencyCopyId copyId
    +ResolutionId[] effectiveResolutionIds
    +ClaimId[] claimIds
    +ClaimMappingState[] mappingStates
  }
  class ChunkGroupProjection {
    +string emitterRemote
    +ChunkGroupOrigin origin
    +string? bundleName
    +string? pseudoPackage
    +string[] files
  }
  class BundleClaim {
    +ResolvedDependencyCopyId copyId
    +BundleClaimSource? source
    +string? sourceRemote
    +string bundle
    +ChunkGroupId[] chunkGroupIds
    +BundleClaimStatus status
  }
  class ResolvedDependencyCopy {
    +ResolvedCopySourceDisposition sourceDisposition
    +ResolvedCopyEffectiveRole[] effectiveRoles
    +BundleClaimId[] bundleClaimIds
  }
  class ResolutionCompleteness {
    +CompletenessCounts total
    +Map byConsumer
    +IncompleteConsumerResolution[] consumerIssues
  }
  class IncompleteConsumerResolution {
    +string consumerRemote
    +ResolutionId effectiveResolutionId
    +ConsumerResolutionIssue[] issues
    +ClaimId[] ambiguousClaimIds
  }

  FederationModel "1" *-- "1" CanonicalResolutionProjection : published by ingest
  CanonicalResolutionProjection "1" *-- "0..*" ConsumerCopyRelation
  CanonicalResolutionProjection "1" *-- "0..*" ChunkGroupProjection
  CanonicalResolutionProjection "1" *-- "0..*" BundleClaim
  CanonicalResolutionProjection "1" *-- "0..*" TagPool
  CanonicalResolutionProjection "1" *-- "0..*" PoolFamily
  CanonicalResolutionProjection "1" *-- "0..*" CopyGroupingFacets
  PoolFamily "1" --> "1" TagPool : poolId, same order
  CopyGroupingFacets "1" --> "1" ResolvedDependencyCopy : copyId, same order
  CanonicalResolutionProjection "1" *-- "0..*" PackageScopeVerdicts
  PackageScopeVerdicts "1" *-- "1..*" VersionVerdict : semver descending
  PackageScopeVerdicts "1" *-- "0..*" DeclarationVerdictRecord : registry order
  VersionVerdict "1" --> "0..*" ResolvedDependencyCopy : copyIds
  CanonicalResolutionProjection "1" *-- "1" ResolutionCompleteness
  ResolutionCompleteness "1" *-- "0..*" IncompleteConsumerResolution
  ConsumerCopyRelation "0..*" --> "1" ResolvedDependencyCopy : copyId
  BundleClaim "0..*" --> "1" ResolvedDependencyCopy : copyId
  ResolvedDependencyCopy "1" --> "0..*" BundleClaim : bundleClaimIds
  BundleClaim "0..*" --> "0..*" ChunkGroupProjection : chunkGroupIds
```

A `ConsumerCopyRelation` is keyed `(consumerRemote, copyId)` and retains all
supporting effective-resolution IDs, claim IDs, and mapping states — several
specifier paths between one consumer and one copy never collapse into a
first-edge-wins or a single boolean. A relation exists for every consumer
that resolves to the copy, even where a candidate-less declaration left the
binding without a claim.

Chunk groups are emitter-aware: identity retains the emitter remote, the
origin (`shared-chunks` or `scoped-pseudo-external`), and the bundle or
pseudo-package, so equal chunk filenames from different emitters never merge.
Bundle attribution follows the selected source only: a copy's uniquely
evidenced declaration or private registration claims its own bundle, an
identifiable `servedBy` anchor is that copy's source already, and a
non-selected bundle-bearing declaration donates nothing. A claim is
`mapped-source` only when registered `shared-chunks` evidence of
`(sourceRemote, bundle)` backs it; a declared bundle without registered
chunks stays `source-only` (a named share scope maps the file without
registering its bundle — absence there is qualified evidence,
never "missing" or "downloaded"); an ambiguous-source copy surfaces every
candidate `(sourceRemote, bundle)` pair as `ambiguous` without attributing
chunks. Structural zero-entry bundle lists (`mapping-or-exposed`) contribute
nothing, and legacy `@nf-internal/...` carriers keep their raw provenance as
pseudo-external chunk groups outside dependency attribution.

Pooling facts are three sibling lists. `tagPools` rebuilds the explicit-tag
pools from the registry exactly as the orchestrator forms them
(`pool-graph.ts` `groupByMembership`, tag edges only): per share scope, a
connected component of `package — (remote, tag)` and `entrypoint — owning
package` edges with at least two members, never in the `strict` scope; a
tagged package that joins nothing is an `orphanPoolTag`. The pool name is the
stored `poolName` (orchestrator 4.7+), else the alphabetically first member;
the ID always keys on the latter. `poolFamilies` (one per pool, same order)
re-runs nothing the orchestrator decided: the serving build per
`(remote, member)` is read off the stored row — `scope` is the remote's own
build, `servedBy` names the build, otherwise the first participant of the
`share` row — and the status matrix folds those into bands per build with
one verdict (`isolated > redirected > one-build`). The model makes one
computation of its own, a consistency check on stored facts: a strict range
that rejects the shared tag (npm `semver`, the orchestrator's own `satisfies`
call) marks a `conflict` cell. A stored `poolCause` is published as is, never
inferred. `copyGroupingFacets` (one per copy, same order) names
each copy's share scope, tag pool, and build outputs; the Graph's share-scope,
pool, and build groupings read nothing else.

Package verdicts restate the resolver's own decisions per registry key
(share scope, package), the Packages tab's read surface. The elected tag is
the `share` row (none in the `strict` scope); each declaration's verdict is
read off its row action — first participant of the `share` row `provides`,
a `scope` row is an `own-copy`, a `skip` row `reuses-shared` — and the one
computation is again the `semver` range check, which tells `reuses-shared`
from `out-of-range` (a non-strict declaration the orchestrator left on a
plain `skip` although its range rejects the elected tag). Each registered
version carries its status (`shared`, `scoped`, `partly-mapped`,
`not-mapped`) and its builds, the copies that materialize it with their
entry and chunk files; `merged` marks a shared version the map assembles from
more than one `share`-row build, which orchestrator 4.8 does only without a
serving build. Orchestrator 4.8 never fills an entrypoint from another build
(no tear): a copy the serving build does not cover runs from its own build as
a `scope` row. An unreadable range or a missing election yields `unknown`,
never a guess.

Completeness counts each unique binding once: `total` reports unknown,
unmapped, and blocked bindings plus ambiguous source claims without double
counting a binding shared by several consumer contexts. Both ambiguity kinds
count as ambiguous source claims — ambiguous exact candidates count each
affected declaration claim (listed in `ambiguousClaimIds`), and an ambiguous
scope attribution counts its single ambiguous provider claim per binding
(issued to every consumer, with no declaration claim to name). `byConsumer`
counts per consumer remote — every published remote appears with explicit,
possibly zero, counts — and overlaps by design; it must never be summed into
a unique-binding total. A consumer-filtered view derives its warnings from
`byConsumer` and `consumerIssues`, de-duplicating by effective-resolution and
claim ID. As everywhere in this model, the projection proves what the
captured map resolves — never wire cost, downloads, cache hits, or execution.
