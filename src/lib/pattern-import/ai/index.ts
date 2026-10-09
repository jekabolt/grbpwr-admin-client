// ai/ — F10 AI piece naming. Worker side: renderSom (som.ts) + buildMarks (evidence.ts). Main thread:
// suggestNames (name.ts, deps injected). Pure: combineNames, wire mapping, threshold.
export { combineNames, W as EVIDENCE_WEIGHTS } from './combine';
export { buildMarks, markSources, parseQuantity, saysFold, languageOf } from './evidence';
export { buildSuggestInput, type CardFacts } from './input';
export { suggestNames, type NamerDeps, type NamerResult } from './name';
export { planSom, renderSom, SOM_DEFAULTS, type SomOptions } from './som';
export { AI_AUTO_ACCEPT_T } from './threshold';
export { fromWireResponse, toWireRequest, WIRE_LIMITS } from './wire';
