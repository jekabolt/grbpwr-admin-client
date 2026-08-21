// Точка входа пробы причины и цены: esbuild бандлит только с файла, а модуль чистый — одного
// реэкспорта хватает.
//
// СВИП РЕЭКСПОРТИРУЕТСЯ ОТСЮДА ЖЕ, и это не удобство: проба обязана строить шаги ровно тем
// `classifyAssemblyInputs`, которым их строит экран, и сверять классификацию с нарушениями
// НАСТОЯЩЕГО движка. Своя модель шага здесь однажды уже стоила раунда: копия расчёта в пробе
// разошлась с оригиналом молча, и проба зеленела на модели, а не на коде.
export {
  assemblyFaults,
  assemblyPrice,
  dissolvePrice,
} from '../src/components/managers/tech-card/components/assembly-cause';
export {
  assemblySweep,
  classifyAssemblyInputs,
} from '../src/components/managers/tech-card/components/assembly-frontier';
