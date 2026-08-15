// Точка входа для probe раскладки: собирает движок, группировку и раскладку в один бандл —
// esbuild умеет бандлить только с файла, а probe нужны все три половины сразу.
export {
  assemblySweep,
  classifyAssemblyInputs,
} from '../src/components/managers/tech-card/components/assembly-frontier';
export { assemblyBlocks } from '../src/components/managers/tech-card/components/assembly-blocks';
export {
  assemblyLayout,
  SCHEMATIC_METRICS,
} from '../src/components/managers/tech-card/components/assembly-layout';
