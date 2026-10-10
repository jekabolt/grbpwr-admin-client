// Entry of the AI second-opinion probe (ai.mjs): the real request builder and answer mappers the
// panel calls, the real engine, the real frontier rules — only the model's answer is a stub.
export {
  applySkeletonAIOrder,
  skeletonAIPins,
  skeletonAIPlaces,
  skeletonAIRequest,
  skeletonStepSignatures,
  SKELETON_AI,
} from '../../src/lib/assembly-skeleton/ai';
export { skeletonDeps } from '../../src/components/managers/tech-card/components/assembly-skeleton-deps';
export {
  assemblySweep,
  classifyAssemblyInputs,
} from '../../src/components/managers/tech-card/components/assembly-frontier';
export { proposeSkeleton } from '../../src/lib/assembly-skeleton/pipeline';
export { orderTemplate } from '../../src/lib/assembly-skeleton/skeleton';
export { loadFacts } from './seams-entry';
