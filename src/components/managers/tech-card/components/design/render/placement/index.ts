/**
 * ПРИМЕРКА ТКАНИ НА ФЛЭТЕ — K-14, целиком.
 *
 * `PlacementBlock` — весь орган: отдай ему полосу, и он нарисует выбор флэта, выбор ткани, кадр с
 * тканью под чертежом и три регулятора. Ни одного платного вызова внутри нет.
 *
 * Счётная часть вынесена в `./model` не ради красоты слоёв, а потому что её проверяют пробы:
 * утверждения «плитка того размера, который написан» и «в сеть уходят те числа, что на экране»
 * доказываются на функциях, а не на разметке.
 */
export { PlacementBlock } from './placement-block';
export { FittingView } from './fitting-view';
export {
  DEFAULT_SPAN_MM,
  REPEAT_MAX_MM,
  REPEAT_MIN_MM,
  ROTATION_MAX_DEG,
  SPANS,
  SURVIVES,
  assetSaveInput,
  clampRepeat,
  fittingCloths,
  fittingFlats,
  pictureUrl,
  pinAnnotation,
  pinOnFlat,
  pinPoint,
  pinSaveGate,
  repeatLabel,
  repeatSaveGate,
  tilePercent,
  tilesAcross,
  wrapRotation,
} from './model';
export type { AssetSaveInput, SaveGate } from './model';
