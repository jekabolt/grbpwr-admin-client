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
