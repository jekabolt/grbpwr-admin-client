// fabrics/ (F7) — which fabric(s) each piece is cut from, one DXF per fabric PURPOSE scope, and the
// atomic apply of the whole import to the card (08-CONTRACT §2, §4.3; owner decisions 13/14).
//
//   proposeFabrics / proposeFabricsDetailed   labels, piece names, cut layouts, AI hints → scopes
//   planScopes(pieces, assignment, targets)   per-scope specs (lining → LIN_…), problems that block
//   fusedSeeds(assignment, targets)           seeds carrying `fused`
//   buildDraft(write, card)                   per-scope files + pieces + aliases → CardDraft
//   applyDraft(draft, deps)                   upload all → one ordered form batch → card save
//
// Main thread may import `scope.ts`, `draft.ts`, `apply.ts`, `lexicon.ts` directly (types + string
// ops only). `propose.ts` / `layout.ts` are pure too but belong to the worker's `fabrics` stage.
export {
  proposeFabrics,
  proposeFabricsDetailed,
  type FabricHint,
  type ProposeFabricsDetail,
  type ProposeFabricsInput,
  type SeedFabrics,
} from './propose';
export { readCutLists, linesOf, pieceNumberText, type CutList, type TextLine } from './layout';
export { fabricKindOf, fabricKindsIn, type FabricKind } from './lexicon';
export {
  PURPOSE,
  SECTION,
  fusedSeeds,
  isInterliningScope,
  isLiningScope,
  kindsOfScope,
  liningIdentity,
  planScopes,
  purposeWord,
  scopeFor,
  scopedSpec,
  type ScopePlan,
  type ScopeProblem,
} from './scope';
export { buildDraft, cardNameOf, fingerprint, type DraftCardContext } from './draft';
export { applyDraft, planFormWrites, type ApplyDeps, type LiveCard, type FormWrite } from './apply';
