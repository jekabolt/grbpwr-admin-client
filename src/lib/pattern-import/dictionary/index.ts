// dictionary/ — base codes (codes.ts) and printed-name synonyms (synonyms.ts). Main-thread safe.
export {
  AI_MODIFIERS,
  PIECE_CODES,
  PIECE_MODIFIERS,
  codeName,
  isKnownCode,
  type PieceCode,
} from './codes';
export { normaliseText, readPieceText, textAgrees, type PieceTextReading } from './synonyms';
