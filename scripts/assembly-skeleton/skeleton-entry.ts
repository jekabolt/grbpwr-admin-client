// Entry of the B4 probe (skeleton.mjs): esbuild bundles from a file. The deps are the REAL ones the
// tech card uses (inferZone, suggestUnitCode, assemblySweep + release check) — a model of them
// here would let the probe go green on the model instead of the code.
export {
  buildSkeleton,
  groupUnits,
  orderTemplate,
  readTemplate,
} from '../../src/lib/assembly-skeleton/skeleton';
export { skeletonDeps } from '../../src/components/managers/tech-card/components/assembly-skeleton-deps';
export { readSeamGraph, proposeSkeleton } from '../../src/lib/assembly-skeleton/pipeline';
export { loadFacts } from './seams-entry';
// P2 lane D (darts): the reader, the geometry it stands on, and the pictogram that draws it.
export {
  DART_CONFIDENCE,
  DART_RULES,
  dartsByPiece,
  dartsOf,
  outlineVNotches,
} from '../../src/lib/assembly-skeleton/geometry/darts';
export { segmentPiece, twins } from '../../src/lib/assembly-skeleton/geometry';
export { unionLayout, unionPicture } from '../../src/lib/assembly-skeleton/union';
export { SKELETON } from '../../src/lib/assembly-skeleton/types';
// The panel's ticks (auto / manual picks): the tie lifecycle is gated on the real ones.
export {
  autoPicks,
  personalPick,
  picksFor,
} from '../../src/components/managers/tech-card/components/assembly-skeleton-ticks';
export { loadInputs } from './marks-entry';
export {
  buttonColumns,
  planButtons,
  ventEvidence,
  zipSeats,
} from '../../src/lib/assembly-skeleton/geometry/closures';
