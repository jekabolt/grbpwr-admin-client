# Assembly Table coordinator workstream

Date: 2026-11-17  
Coordinator: 2D Assembly Table, thread `01a1d572-da02-79d2-bc52-af50027d33e7`  
Status: **ACTIVE — BETA MILESTONE AND FULL ACCEPTANCE OPEN**

## Mandatory completion contract

This workstream accepts P0–P8 and every AC-01–AC-48 as mandatory completion gates. No AC is
excluded. The limited beta milestone may be shipped and described with exact limitations, but the
full 2D/3D DrapeXD-parity task cannot be marked complete while any mandatory AC is not `PASS` with
evidence from the agreed product build, unless the user explicitly changes scope.

Canonical plan:

- `/Users/jekabolt/go/src/github.com/jekabolt/grbpwr-admin-client-wt-w1107-g-flake/docs/cloth-simulation/workstreams/2026-11-16-drapexd-2d-3d-completion-plan.md`

Shared AC-01–AC-48 ledger (all 48 IDs present, with status, owner, evidence, blocker and next
action):

- `/Users/jekabolt/go/src/github.com/jekabolt/grbpwr-admin-client-wt-w1107-g-flake/docs/cloth-simulation/workstreams/assembly-table-cloth-handoff-boundary-v1.md`
- Section: `DrapeXD completion acceptance ledger — 2026-11-16`

This document points to the shared ledger instead of copying it. The shared ledger remains the
single acceptance-status table.

## Ownership

- The 2D coordinator is accountable for all `T` gates, AC-01–AC-25, and the 2D side of joint gates
  AC-04, AC-16, AC-20, AC-31, AC-41 and AC-43–AC-48.
- Cloth/renderer owners retain all `C`/`R` implementation ownership. The 2D coordinator integrates
  only through the agreed handoff and never creates a second solver, renderer, Assembly Order,
  seam graph or persistence owner.
- Existing producer, AO, import/apply, sidecar, placement, renderer and solver owners remain the
  only writers for their domains.

## Current execution

| Area | Executor / evidence | Status | Next action |
| --- | --- | --- | --- |
| AC-01 saved table | beta card 156 observed with real saved DXF, AO operation and mannequin | partial | Record final candidate SHA/URL and repeat saved/fresh route acceptance |
| AC-02 / AC-24 N=1 durable seam | frozen `b27efaa92d400a6ed0cf6a71055942c051780a3c` + `ae46587b447fbfa3073e43f16f589a20fc0bd6a4`; genuine codec/CAS/readback/reload chain | P1 follow-up | Require exact saved/live ordered-seam match and prevent duplicate AO append for legacy N=1 fallback; then re-review/rebase/browser acceptance |
| V6 arrangement/annotations | backend PR `grbpwr-manager#80` head `40be4f8`; frontend draft PR `grbpwr-admin-client#431` includes reviewed two-lane commit `217de79c8bc9c9e36777848cf60f29e50881716a` | reviewed/integration | Add explicit Save/Reset UI integration and real-codec candidate evidence |
| AC-05–AC-09 visible 2D objects | clean UI branch `codex/assembly-table-ui-cleanup`, commits `91b531bb5` + `2a6a4f8cb` | reviewed | Add component-level pointer/viewBox regression, merge current beta, then product smoke |
| AC-25 annotations | V5/V6 lossless transition proven at codec/backend boundary | open | Product owner/readback/reload and edit evidence |
| Joint AC-26–AC-45 | shared cloth ledger and cloth coordinator | open/partial | Consume only verified handoff; coordinate one GPU/browser lane after candidate freeze |
| AC-43 golden cards | cards 6/11 remain mandatory; card156 is routing evidence only | open | Full existing suite on final integrated candidate |
| AC-44–AC-48 final acceptance | shared ledger | open | Final build/browser/performance/evidence sweep; no unsupported parity claim |

## Physical initialization boundary

The V6 arrangement component is presentation-only. It must not be reinterpreted as physical
cloth initialization because the mannequin/body-dependent stage applies scaling, centering,
axis conversion and lane/body bases that V6 does not persist.

The next canonical full-assembly intent may add an optional, discriminated
`physicalInitialization` component. A generic physical initialization is accepted only when it
explicitly confirms, for every exact piece:

- `pieceId`, `sourceOriginM`, a proper row-major rotation matrix with nine finite SI values, and
  an absolute three-value `translationM`;
- exact source and compile SHA bindings;
- `support: none`, the numerical profile, and the current canonical observed-target hash;
- document identity, revision, size token and sewing-surface intent needed for native replay.

Existing V4/V5/V6 and arrangement bytes remain byte-preserved. Qualified annular two-panel
PlacementV3 is not a generic carrier and must not be coerced into this role. The outer snapshot
SHA remains the CAS/read receipt and is not embedded into its own graph. Full AO identity is bound
inside the graph, and the existing persistence owner remains the sole writer.

Ownership is split once: the Table workstream owns the outer full-graph container, component
registry, persistence/CAS/backend admission and authoring UI. The cloth workstream owns the new
generic physical-initialization DTO/codec/projection and physical host/body dispatcher/runtime.
The Table integration consumes those exports; it does not implement a second mapping codec,
physical host, solver or runtime. No component version is reserved before both owners freeze the
shared payload contract.

The outer snapshot SHA is never persisted inside that component. A successful CAS invalidates the
pre-save full compile session; reload must use a fresh saved-source reprocess/native owner and a
new private compile generation, then replay the persisted intent and recover the exact
`compileInputSha256`. Durable intent preserves the source `documentId`, revision and `sizeToken`
and declares the sewing-surface profile, including `seamAllowancePhysical: false` when that is the
contract.

The AO-only content digest binds the domain, row identity, server revision, canonical operations
payload and all selected topology receipts/seams. It excludes outer/CAS digests and transport
counters. A graph fingerprint validates the graph against the full AO snapshot and hashes the
domain plus canonical graph; it is not evidence that the AO snapshot is still fresh. Product
admission additionally requires the future fixed verified-component reader/issuer. Codec hashes
alone do not grant admission. The required reload test proves that the outer SHA changes across
the first save/read boundary while the graph fingerprint and compile-input SHA remain exact.

The frozen cloth-owned consumer boundary exports:

- `fingerprintDxfExactAssemblyGraphV1({ graph, assemblySnapshot })`;
- `validateDxfGarmentPhysicalInitializationV1` plus its exact encode/decode pair;
- `projectDxfGarmentPhysicalInitializationV1({ document, graph, assemblySnapshot, sourceRequest,
  sourceArtifact }, signal)`.

The projection performs a real recompile and placement projection and must not be advertised as a
pure-content replay. The future generic physical host remains an explicit dynamic import; no
eager runtime edge is allowed from the current mannequin or Table route. Registry integration
waits for the cloth owner's combined reviewed package and private-host freeze.

## Completion rule

Toolbar presence, session preview, compile receipts, blocker-only tests, status panels, codec
availability or a separately working solver are not completion. The workstream continues by
dependency order until the shared ledger has product evidence and `PASS` for every mandatory AC.
