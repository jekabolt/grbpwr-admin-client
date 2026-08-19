// Точка входа пробы «ткань детали»: весь чистый модуль одним бандлом — esbuild собирает только с
// файла, а проба проверяет карту, приоритет слоёв, свёртку и словарь геометрии сразу.
export {
  CLOTH_GEOMETRY,
  CLOTH_RAMP,
  clothGroupKey,
  clothRollup,
  pickPrimaryLayer,
  pieceClothMap,
} from '../src/components/managers/tech-card/components/piece-cloth';
