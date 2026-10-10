// Entry of the fix-round-2 probe (fixes.mjs): the real functions the tech card calls, nothing
// modelled — category, lining, facts, gate (card side) and the engine (lib).
export {
  buildSkeletonFacts,
  skeletonCategoryOf,
  skeletonGate,
  skeletonLined,
} from '../../src/components/managers/tech-card/components/assembly-skeleton-source';
export { skeletonDeps } from '../../src/components/managers/tech-card/components/assembly-skeleton-deps';
export {
  assemblyReleaseCheck,
  assemblySweep,
  classifyAssemblyInputs,
} from '../../src/components/managers/tech-card/components/assembly-frontier';
export { proposeSkeleton, readSeamGraph } from '../../src/lib/assembly-skeleton/pipeline';
export { namesIn } from '../../src/lib/assembly-skeleton/skeleton/build-skeleton';
export { replayExisting } from '../../src/lib/assembly-skeleton/skeleton/existing';
export { buildSkeleton, orderTemplate, readName } from '../../src/lib/assembly-skeleton/skeleton';
export { twinKind } from '../../src/lib/assembly-skeleton/geometry';
export { unionLayout } from '../../src/lib/assembly-skeleton/union';
export { SKELETON } from '../../src/lib/assembly-skeleton/types';
export { loadFacts } from './seams-entry';
export { firstColorwayCloth } from '../../src/components/managers/tech-card/components/skeleton-card-inputs';
export { unitPictures } from '../../src/lib/assembly-skeleton/union';
