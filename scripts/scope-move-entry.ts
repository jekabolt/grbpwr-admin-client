// Entry of the scope-move probe: the pure half of «one writer for a scope's bindings» (lane B1).
export {
  aliasCollisions,
  bindingForScope,
  bindingScopes,
  blockKey,
  clothLines,
  fabricScopes,
  impactEmpty,
  lineExitImpact,
  moveSheet,
  planLineChange,
  resolveSet,
  scopeImpact,
  scopeKeyOfBinding,
  scopeOfLine,
} from 'components/managers/tech-card/components/bom-purpose';
export { publishPatternSizeIndex } from 'components/managers/tech-card/components/pattern-size-index';
export {
  pieceAreaSheetsRefusal,
  publishPieceAreas,
} from 'components/managers/tech-card/components/piece-areas';
export {
  areaReadKeysOfScope,
  serverKeyOfScope,
} from 'components/managers/tech-card/components/piece-areas-state';
export {
  applyLineChange,
  changeLinePurpose,
  changeLineSection,
  lineExitHold,
  releaseLineBindings,
  withoutGenerated,
} from 'components/managers/tech-card/components/form-writers';
