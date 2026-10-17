// RUL · AAMA / ASTM D6673 grade rule tables: read a base DXF + .rul as every size, and write our
// per-size blocks as base DXF + .rul when they are point-for-point gradable (RUL-SPEC.md).
export type { RulTable, RulDelta, RulUnits } from './types';
export { parseRul, looksLikeRul, formatRul, RUL_MAX_BYTES } from './parse';
export { expandRul, RUL_SAME_PLACE_MM, type RulExpansion, type RulExpandStats } from './expand';
export {
  packRul,
  RUL_PACK_TOL_MM,
  type RulPackage,
  type RulPackRefusal,
  type RulPackOptions,
} from './pack';
export { zipRulPair, RUL_ZIP_MAX_BYTES, type ZipPair } from './zip';
