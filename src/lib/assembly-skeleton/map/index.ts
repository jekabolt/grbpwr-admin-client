// ASSEMBLY MAP (04-ASSEMBLY-MAP-DESIGN): what joins what, at which edge — read off the seam graph
// the card already computes for its unit pictograms. Pure TS; the tech card draws it (STEP / PIECES)
// and the print sheet typesets it (SEAM MAP).
export {
  edgeSteps,
  isJoin,
  readMap,
  seamEdgeIds,
  stepInputLeaves,
  stepSeams,
  type MapRead,
  type MapStep,
} from './step-seams';
export {
  pairPicture,
  type PairPicture,
  type PairShape,
  type PairSide,
  type PairLabel,
} from './pair-layout';
export {
  pieceFamilies,
  piecePicture,
  type PieceEdgeMark,
  type PieceFamily,
  type PieceMapPicture,
} from './families';
export {
  confidenceWord,
  seamWords,
  stepConfidence,
  stepReadings,
  thenChain,
  type ConfidenceWord,
  type ThenUnit,
} from './words';
export { type MapNotch } from './frame';
