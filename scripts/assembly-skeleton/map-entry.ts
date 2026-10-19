// Entry of the ASSEMBLY MAP lib probe (map-probe.mjs, node half): the real pipeline + the real
// map lib, nothing modelled. esbuild bundles from a file.
export { skeletonDeps } from '../../src/components/managers/tech-card/components/assembly-skeleton-deps';
export { proposeSkeleton, readSeamGraph } from '../../src/lib/assembly-skeleton/pipeline';
export {
  readMap,
  pairPicture,
  pieceFamilies,
  stepSeams,
  stepInputLeaves,
  seamWords,
  stepConfidence,
  thenChain,
} from '../../src/lib/assembly-skeleton/map';
export { loadFacts } from './seams-entry';
