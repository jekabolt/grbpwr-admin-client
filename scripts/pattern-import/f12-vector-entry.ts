// PATTERN-IMPORT · F12 — the PLT/HPGL + SVG adapters and the AI/EPS sniffer, bundled by `f12-vector.mjs`.
export { extractHpgl, makeExtractHpgl } from 'lib/pattern-import/adapters/hpgl';
export { extractSvg, makeExtractSvg } from 'lib/pattern-import/adapters/svg';
export {
  sniffFormat,
  makeExtractAi,
  pickExtractor,
  isUnsupportedFormat,
  UnsupportedFormat,
} from 'lib/pattern-import/adapters/sniff';
// C4 · bounded work: the run budget, the PDF operator walker (driven with a synthetic list).
export { WorkBudget } from 'lib/pattern-import/adapters/budget';
export { walkOperatorList } from 'lib/pattern-import/adapters/pdf/walk';
// A0.1 · the scale step's reading of an SVG that declares its units.
export { detectScale } from 'lib/pattern-import/adapters/pdf/scale';
