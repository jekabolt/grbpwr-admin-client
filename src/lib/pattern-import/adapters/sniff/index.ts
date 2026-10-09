// F12 · Format sniffing, AI/EPS routing and the typed refusal error.
export { sniffFormat, type SniffResult, type SniffRoute } from './sniff';
export { UnsupportedFormat, isUnsupportedFormat, type UnsupportedCode } from './errors';
export { makeExtractAi, pickExtractor, type ExtractorRegistry } from './ai';
