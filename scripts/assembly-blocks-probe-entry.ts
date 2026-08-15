// Точка входа для probe группировки: собирает движок и блоки в один бандл, потому что esbuild
// умеет бандлить только с файла, а probe нужны обе половины сразу.
export {
  assemblySweep,
  classifyAssemblyInputs,
} from '../src/components/managers/tech-card/components/assembly-frontier';
export { assemblyBlocks } from '../src/components/managers/tech-card/components/assembly-blocks';
