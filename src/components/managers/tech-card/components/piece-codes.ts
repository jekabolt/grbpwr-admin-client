// Standardised pattern-piece nomenclature, used as free text where pieces are named
// (sketch callout «part», operation description). Base codes name the piece; the universal
// modifiers below combine onto them (FP_R_1, PCK_f, BP_L<M>). The modifier set is fixed;
// the base codes are suggestions, not a closed list.
export const pieceBaseCodes: Array<{ code: string; name: string }> = [
  { code: 'FP', name: 'front piece' },
  { code: 'BP', name: 'back piece' },
  { code: 'SP', name: 'side panel' },
  { code: 'YK', name: 'yoke' },
  { code: 'SLV', name: 'sleeve' },
  { code: 'CLR', name: 'collar' },
  { code: 'CUF', name: 'cuff' },
  { code: 'PLK', name: 'placket' },
  { code: 'WB', name: 'waistband' },
  { code: 'WS', name: 'waist strap' },
  { code: 'BLT', name: 'belt' },
  { code: 'FL', name: 'fly piece' },
  { code: 'PCK', name: 'pocket' },
  { code: 'FAC', name: 'facing' },
  { code: 'LIN', name: 'lining' },
  { code: 'GST', name: 'gusset' },
];

export const pieceModifiers: Array<{ mod: string; name: string }> = [
  { mod: '_R / _L', name: 'right / left' },
  { mod: '_f / _b', name: 'front / back' },
  { mod: '_#', name: 'main piece' },
  { mod: '_1 / _2 / _3…', name: 'part number' },
  { mod: '<size>', name: 'size' },
];

// Datalist suggestions for piece-code fields (modifiers are typed onto the base code).
export const pieceCodeOptions = pieceBaseCodes.map((p) => p.code);

// Grainline is free text (a factory may write «долевая», "straight", "lengthwise" for the same
// thing), so the suggestions stay open. These are the canonical three.
export const grainlineOptions = ['lengthwise', 'crosswise', 'bias'];

// Grainline is a DIRECTION, and a direction is read faster as an arrow than as a word — the pieces
// table shows the glyph beside the typed value so a mis-set grain is spotted at a glance instead of
// by reading a column of near-identical strings. Unrecognised text renders no arrow rather than a
// wrong one: guessing here would be worse than staying quiet.
export function grainlineArrow(grainline?: string): string {
  const g = (grainline ?? '').trim().toLowerCase();
  if (!g) return '';
  if (/^(lengthwise|straight|warp|долев)/.test(g)) return '↑';
  if (/^(crosswise|cross|weft|попереч|уток)/.test(g)) return '→';
  if (/^(bias|коса|под углом|45)/.test(g)) return '↗';
  return '';
}
