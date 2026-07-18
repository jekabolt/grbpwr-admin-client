import { common_SeasonEnum, common_SkuSeason } from 'api/proto-http/admin';

// The form keeps season as a free-text label ("SS25", "Resort 25"); the wire uses the structured
// SkuSeason { code, year } (Q1 — it also feeds SuggestStyleNumber). These map between the two.

// Enum has only SS / FW / PF (pre-fall) / RC (resort-cruise) — the SeasonField's worded types fold
// into the nearest: Resort/Cruise → RC, Pre-Fall → PF, Holiday → (unknown, no enum).
const PREFIX_TO_ENUM: Record<string, common_SeasonEnum> = {
  SS: 'SEASON_ENUM_SS',
  FW: 'SEASON_ENUM_FW',
  PF: 'SEASON_ENUM_PF',
  PREFALL: 'SEASON_ENUM_PF',
  RC: 'SEASON_ENUM_RC',
  RESORT: 'SEASON_ENUM_RC',
  CRUISE: 'SEASON_ENUM_RC',
};

const ENUM_TO_PREFIX: Record<common_SeasonEnum, string> = {
  SEASON_ENUM_UNKNOWN: '',
  SEASON_ENUM_SS: 'SS',
  SEASON_ENUM_FW: 'FW',
  SEASON_ENUM_PF: 'PF',
  SEASON_ENUM_RC: 'RC',
};

// Parse a label like "SS25" / "Resort 25" / "PF2026" into { code, year }. Returns undefined when it
// carries no usable season/year (an empty or unrecognised label — the wire then stays unset).
export function parseSeasonToSku(label?: string): common_SkuSeason | undefined {
  const s = (label ?? '').trim();
  if (!s) return undefined;
  const m = s.match(/^([A-Za-z-]+)\s*'?(\d{2,4})$/);
  if (!m) return undefined;
  const prefix = m[1].replace(/-/g, '').toUpperCase();
  const code = PREFIX_TO_ENUM[prefix];
  if (!code) return undefined;
  let year = parseInt(m[2], 10);
  if (year < 100) year += 2000;
  return { code, year };
}

// Render a SkuSeason back into the form's label form ("SS25"). Empty when unset.
export function skuToSeasonLabel(sku?: common_SkuSeason): string {
  if (!sku?.code || sku.code === 'SEASON_ENUM_UNKNOWN') return '';
  const prefix = ENUM_TO_PREFIX[sku.code] || '';
  const yy = sku.year ? String(sku.year).slice(-2) : '';
  return prefix && yy ? `${prefix}${yy}` : prefix;
}
