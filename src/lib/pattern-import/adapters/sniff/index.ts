// F12 · Format sniffing, AI/EPS routing and the typed refusal error.
export { sniffFormat, type SniffResult, type SniffRoute } from './sniff';
export {
  UnsupportedFormat,
  isUnsupportedFormat,
  refusalMessage,
  refusalHint,
  type UnsupportedCode,
} from './errors';
export { refusalForName, zipEntryNames, classifyNative } from './native';
export { makeExtractAi, pickExtractor, isPdfPasswordError, type ExtractorRegistry } from './ai';
