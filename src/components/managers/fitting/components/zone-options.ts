// WHERE on the garment a fitting remark points. This is a FITTING dictionary, deliberately separate
// from `zoneOptions` in tech-card/components/operation-options — that one groups sewing OPERATIONS
// into the three material bands (верх / подклад / приклад) and is a proto ENUM, so its values are
// enum NAMES. Reusing it here sent `TECH_CARD_CONSTRUCTION_ZONE_OTHER` into a plain-string field that
// the backend validates against lowercase tokens, and every save 400'd.
//
// Values are the wire tokens (lowercase), mirroring entity.ValidFittingChangeZones on the backend and
// the chk_fcr_zone_v2 CHECK from migration 0256. '' = zone not specified.
export const fittingZoneOptions: Array<{ value: string; label: string }> = [
  { value: '', label: '— зона —' },
  // material bands, kept from the old dictionary: a remark can be about a layer as such
  { value: 'outer', label: 'верх' },
  { value: 'lining', label: 'подклад' },
  { value: 'interlining', label: 'приклад / дублерин' },
  // garment areas — what a fitting actually flags
  { value: 'sleeve', label: 'рукав' },
  { value: 'collar', label: 'воротник' },
  { value: 'neckline', label: 'горловина' },
  { value: 'armhole', label: 'пройма' },
  { value: 'shoulder', label: 'плечо' },
  { value: 'chest', label: 'грудь' },
  { value: 'waist', label: 'талия' },
  { value: 'hip', label: 'бёдра' },
  { value: 'hem', label: 'низ' },
  { value: 'pocket', label: 'карман' },
  { value: 'closure', label: 'застёжка' },
  { value: 'back', label: 'спинка' },
  { value: 'front', label: 'полочка' },
  { value: 'other', label: 'другое' },
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
