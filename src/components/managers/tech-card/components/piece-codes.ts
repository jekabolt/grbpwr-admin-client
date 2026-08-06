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

// Grainline (долевая) is a CLOSED set, and not by preference: `tech_card_piece.grainline` carries a
// DB CHECK (`chk_tcp_grainline`, migration 0109) and the write path validates against
// entity.ValidTechCardGrainlines before it ever reaches SQL. A typed «долевая» or "straight" did not
// merely read badly — it failed the ENTIRE card save with a pathless error
// («piece %q grainline must be one of lengthwise|crosswise|bias|any»), on a field the datalist had
// invited the operator to type freely.
//
// `any` is part of the accepted set and is deliberately offered: it is the only way to say "the
// direction does not matter for this piece", and omitting it would make a stored `any` unrenderable
// in a closed picker.
export const grainlineOptions: Array<{ value: string; label: string }> = [
  { value: 'lengthwise', label: 'lengthwise — долевая' },
  { value: 'crosswise', label: 'crosswise — поперечная' },
  { value: 'bias', label: 'bias — косая' },
  { value: 'any', label: 'any — направление не важно' },
];

const grainlineValues = new Set(grainlineOptions.map((o) => o.value));

// Tolerant read, the same shape the sketch tab's `part` picker uses: a value that is not in the set
// still shows, flagged, instead of reading as empty in a controlled picker and being silently
// rewritten by the next save of an unrelated field. Today the DB CHECK makes an out-of-set value
// unreachable, so this is a guard rather than a migration path — but a picker that can only render
// what it happens to know is exactly how stored data goes missing when the set is widened.
//
// The empty option is NOT "no grainline": the server substitutes `lengthwise` for an empty string
// (dto/techcard.go), so the label says what saving will actually do rather than implying the field
// stays blank.
export function grainlineOptionsFor(current?: string): Array<{ value: string; label: string }> {
  const value = (current ?? '').trim();
  const items = [{ value: '', label: '— (сохранится как lengthwise)' }, ...grainlineOptions];
  if (value && !grainlineValues.has(value)) {
    items.splice(1, 0, { value, label: `${value} — не из списка` });
  }
  return items;
}

// Grainline is a DIRECTION, and a direction is read faster as an arrow than as a word — the pieces
// table shows the glyph beside the chosen value so a mis-set grain is spotted at a glance instead of
// by reading a column of near-identical strings. Unrecognised text renders no arrow rather than a
// wrong one: guessing here would be worse than staying quiet. The synonym prefixes stay in place for
// exactly that reason — the picker is closed now, but a value that arrived from another writer must
// still be read, not silently mis-drawn.
export function grainlineArrow(grainline?: string): string {
  const g = (grainline ?? '').trim().toLowerCase();
  if (!g) return '';
  if (/^(lengthwise|straight|warp|долев)/.test(g)) return '↑';
  if (/^(crosswise|cross|weft|попереч|уток)/.test(g)) return '→';
  if (/^(bias|коса|под углом|45)/.test(g)) return '↗';
  if (g === 'any') return '↕';
  return '';
}
