// Точка входа для probe слоя позиций: движок, группировка, раскладка и сам слой одним бандлом —
// esbuild бандлит только с файла, а пробе нужны все четыре половины сразу.
export {
  assemblySweep,
  classifyAssemblyInputs,
} from '../src/components/managers/tech-card/components/assembly-frontier';
export { assemblyBlocks } from '../src/components/managers/tech-card/components/assembly-blocks';
export { assemblyLayout } from '../src/components/managers/tech-card/components/assembly-layout';
export {
  applyOverrides,
  combineVerdict,
  hitNode,
  TAIL_KEY,
} from '../src/components/managers/tech-card/components/assembly-positions';
