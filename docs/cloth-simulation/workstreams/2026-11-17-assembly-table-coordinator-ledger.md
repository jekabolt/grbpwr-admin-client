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
| AC-02 / AC-24 N=1 durable seam | frozen `b27efaa92d400a6ed0cf6a71055942c051780a3c`; genuine codec/CAS/readback/reload chain; independent review running | review | Rebase on current beta, rerun, authenticated save/reload browser acceptance |
| V6 arrangement/annotations | backend PR `grbpwr-manager#80` head `40be4f8`; frontend draft PR `grbpwr-admin-client#431` head `7bd5e5af1` | review/integration | Add explicit two-lane UI transaction and Save/Reset integration |
| AC-05–AC-09 visible 2D objects | clean UI branch `codex/assembly-table-ui-cleanup` | active | Always-visible functional toolbar, shape hit/fill, move/fit and visual product smoke |
| AC-25 annotations | V5/V6 lossless transition proven at codec/backend boundary | open | Product owner/readback/reload and edit evidence |
| Joint AC-26–AC-45 | shared cloth ledger and cloth coordinator | open/partial | Consume only verified handoff; coordinate one GPU/browser lane after candidate freeze |
| AC-43 golden cards | cards 6/11 remain mandatory; card156 is routing evidence only | open | Full existing suite on final integrated candidate |
| AC-44–AC-48 final acceptance | shared ledger | open | Final build/browser/performance/evidence sweep; no unsupported parity claim |

## Completion rule

Toolbar presence, session preview, compile receipts, blocker-only tests, status panels, codec
availability or a separately working solver are not completion. The workstream continues by
dependency order until the shared ledger has product evidence and `PASS` for every mandatory AC.
