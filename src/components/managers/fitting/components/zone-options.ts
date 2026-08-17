// WHERE on the garment a fitting remark points. This is a FITTING dictionary, deliberately separate
// from `zoneOptions` in tech-card/components/operation-options — that one groups sewing OPERATIONS
// into the three material bands (верх / подклад / приклад) and is a proto ENUM, so its values are
// enum NAMES. Reusing it here sent `TECH_CARD_CONSTRUCTION_ZONE_OTHER` into a plain-string field that
// the backend validates against lowercase tokens, and every save 400'd.
//
// Values are the wire tokens (lowercase), mirroring entity.ValidFittingChangeZones on the backend and
// the chk_fcr_zone_v2 CHECK from migration 0256. '' = zone not specified.
export const fittingZoneOptions: Array<{ value: string; label: string }> = [
  { value: '', label: '— zone —' },
  // material bands, kept from the old dictionary: a remark can be about a layer as such
  { value: 'outer', label: 'outer shell' },
  { value: 'lining', label: 'lining' },
  { value: 'interlining', label: 'interlining / fusible' },
  // garment areas — what a fitting actually flags
  { value: 'sleeve', label: 'sleeve' },
  { value: 'collar', label: 'collar' },
  { value: 'neckline', label: 'neckline' },
  { value: 'armhole', label: 'armhole' },
  { value: 'shoulder', label: 'shoulder' },
  { value: 'chest', label: 'chest' },
  { value: 'waist', label: 'waist' },
  { value: 'hip', label: 'hip' },
  { value: 'hem', label: 'hem' },
  { value: 'pocket', label: 'pocket' },
  { value: 'closure', label: 'closure' },
  { value: 'back', label: 'back' },
  { value: 'front', label: 'front' },
  { value: 'other', label: 'other' },
];

// Rows written before 0256 may carry the legacy `unknown` token, which the server now normalises to
// '' on write but still returns as-is on old rows — read it as "no zone" so the picker isn't blank
// with an unmatched value.
export function normalizeFittingZone(zone?: string): string {
  const z = (zone ?? '').trim().toLowerCase();
  return z === 'unknown' ? '' : z;
}

export function fittingZoneLabel(zone?: string): string {
  const z = normalizeFittingZone(zone);
  if (!z) return '';
  return fittingZoneOptions.find((o) => o.value === z)?.label ?? z;
}
