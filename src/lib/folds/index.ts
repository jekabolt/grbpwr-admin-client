// Piece folds saved on the tech card — client data layer (doll-folds SPEC-T2).
//
//   hints     foldHints(input, geom, {grainDeg, unfoldedFold}) → FoldHint[] (read-only suggestions)
//   rows      foldFromHint(piece, hint, {seq, kind}) / foldFromLine(piece, lineMm, flipMm, meta) → StoredFold
//   resolve   resolveFolds(rows, piecesOfOneSize, {grainDeg}) → {folds: Record<pieceKey, DollFold[]>, unresolved}
//             — `folds` is DollOptions.folds (SPEC-T3)
//   wire      foldToWire / foldsFromWire ↔ proto common.TechCardPieceFold
//   folded    foldedOutline(poly, flatFolds) / foldSection → the folded shape and its cross-section (UI)

export * from './types';
export { defaultFlipMm, foldFromHint, foldFromLine, type FoldMeta } from './anchor';
export { coincidentGroups, foldedSideLengthMm } from './coincide';
export { foldHints, type FoldHintOptions } from './hints';
export { resolveFolds } from './resolve';
export {
  findPleatFans,
  mapPleatPoint,
  pleatFanGeometry,
  rotateAround,
  type PleatFanGeometry,
  type PleatLineLike,
} from './pleat';
export { foldFromWire, foldsFromWire, foldToWire } from './wire';
export {
  activeFoldKeys,
  activeFoldRows,
  foldMap,
  type FoldMapGeometry,
  type FoldStep,
} from './fold-map';
export {
  clipSide,
  doubleTurn,
  foldedOutline,
  foldSection,
  pointOnSide,
  reflect,
  sideOf,
  smallerSide,
  type FlatFold,
  type FoldPleat,
  type FoldedShape,
  type FoldPly,
  type FoldSection,
} from './folded';
