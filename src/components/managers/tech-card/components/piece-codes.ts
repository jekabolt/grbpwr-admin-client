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
