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
