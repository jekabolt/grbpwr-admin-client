// PAINT THE PARTS · T28/T29 — the paint (and artwork marks) carried onto a new flat, bundled by `paint-transfer-probe.mjs`.
export {
  transferMap,
  transferPoints,
  mapDrawBox,
  inkBox,
} from 'components/managers/tech-card/components/design/paint/transfer';
export { analyseFlat } from 'components/managers/tech-card/components/design/paint/regions';
export {
  mapPixels,
  packHex,
} from 'components/managers/tech-card/components/design/paint/map-model';
export { decode as decodePng } from 'fast-png';
