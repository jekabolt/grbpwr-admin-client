// PAINT THE PARTS · T2 — the label raster, bundled by `paint-map-probe.mjs`.
export * from 'components/managers/tech-card/components/design/paint/map-model';
export { analyseFlat } from 'components/managers/tech-card/components/design/paint/regions';
export { decode as decodePng } from 'fast-png';
export * from 'components/managers/tech-card/components/design/paint/parts-model';
export * from 'components/managers/tech-card/components/design/paint/mockup';
export {
  hardwareModelLines,
  hardwarePartsText,
  MAX_RENDER_HARDWARE,
  paintRun,
  remainderCloth,
} from 'components/managers/tech-card/components/design/paint/plan-run';
export { isPaintableHardware } from 'components/managers/tech-card/components/design/pattern/slot-fabrics';
export * from 'components/managers/tech-card/components/design/paint/ceiling';
