import { common_Material, googletype_Decimal } from 'api/proto-http/admin';
import { decimalToInput } from 'utils/decimal';

// A decimal as a clean string, treating undefined / 0 as absent (so "0 g/m²" never shows).
const dec = (d?: googletype_Decimal): string => {
  const s = decimalToInput(d);
  return s && s !== '0' ? s : '';
};

const roundStr = (v?: string): string => {
  if (!v) return '';
  const n = Number(v);
  return Number.isFinite(n) ? String(Math.round(n)) : '';
};

// Letters only, upper-cased, first `n` — for the short tokens in an article code (CTN, BLK, CER).
const abbr = (s?: string, n = 3): string =>
  (s ?? '').replace(/[^\p{L}]/gu, '').slice(0, n).toUpperCase();

// The identifying spec of a material, by class: what makes "хлопок 180" readable as a specific
// cloth rather than a row you have to open. Fabric → gsm · width; hardware → finish · Ø; packaging
// → gsm · substrate; thread → tex. The free-text `spec` and the fibre composition trail after,
// since they identify the material regardless of class. (Shared by the pickers and the catalogue.)
export function materialSpec(m: common_Material): string {
  const parts: string[] = [];
  switch (m.materialClass) {
    case 'MATERIAL_CLASS_FABRIC': {
      const gsm = dec(m.fabricAttrs?.weightGsm) || dec(m.fabricWeightGsm);
      const width = dec(m.fabricAttrs?.widthCm) || dec(m.fabricWidth);
      if (gsm) parts.push(`${gsm} g/m²`);
      if (width) parts.push(`${width} cm`);
      break;
    }
    case 'MATERIAL_CLASS_HARDWARE': {
      const fin = m.hardwareAttrs?.finish?.trim();
      const dia = dec(m.hardwareAttrs?.diameterMm);
      if (fin) parts.push(fin);
      if (dia) parts.push(`Ø${dia} mm`);
      if (m.hardwareAttrs?.dimensions?.trim()) parts.push(m.hardwareAttrs.dimensions.trim());
      break;
    }
    case 'MATERIAL_CLASS_PACKAGING': {
      const gsm = dec(m.packagingAttrs?.gsm);
      if (gsm) parts.push(`${gsm} g/m²`);
      if (m.packagingAttrs?.substrate?.trim()) parts.push(m.packagingAttrs.substrate.trim());
      break;
    }
    case 'MATERIAL_CLASS_THREAD': {
      if (m.threadAttrs?.ticketTex?.trim()) parts.push(`tex ${m.threadAttrs.ticketTex.trim()}`);
      break;
    }
    default: {
      const gsm = dec(m.fabricWeightGsm);
      const width = dec(m.fabricWidth);
      if (gsm) parts.push(`${gsm} g/m²`);
      if (width) parts.push(`${width} cm`);
    }
  }
  if (m.spec?.trim()) parts.push(m.spec.trim());
  const composition = materialCompositionText(m);
  if (composition) parts.push(composition);
  return parts.join(' · ');
}

// One fibre share of a material's blend, normalised off the structured entries the material modal
// writes (#37): a resolved dictionary display name and a numeric percent.
type MaterialFibre = { name: string; percent: number };

function materialFibres(m: common_Material): MaterialFibre[] {
  return (m.compositionEntries ?? [])
    .map((e) => ({
      // `name` is the fibres-dictionary label resolved server-side; fall back to the raw code so an
      // unresolved entry still reads as something rather than vanishing.
      name: (e.name ?? '').trim() || (e.fiberCode ?? '').trim(),
      percent: Number(decimalToInput(e.percent)) || 0,
    }))
    .filter((f) => f.name && f.percent > 0);
}

// A material's fibre composition as a readable line ("60% Cotton, 40% Polyester"), derived from the
// structured entries, falling back to the legacy free-text `composition`. '' when it has neither.
// Shared by the pickers, the catalogue and the BOM catalog-article plate so "composition not set"
// never shows for a material whose blend was entered structurally.
export function materialCompositionText(m: common_Material): string {
  const fibres = materialFibres(m);
  if (fibres.length) {
    return fibres
      .slice()
      .sort((a, b) => b.percent - a.percent)
      .map((f) => `${f.percent}% ${f.name}`)
      .join(', ');
  }
  return m.composition?.trim() ?? '';
}

// The same composition as the { part: [{ code, percent }] } JSON the CompositionPicker edits and the
// care-label generator parses — so a BOM line snapshotted off this material carries a composition
// that BOTH round-trips in the picker AND generates the care / composition label. The fibre NAME is
// written into the code slot on purpose: a material's fibres come from the fibres dictionary, a
// different code space than care-label's garment-composition table, so encoding the resolved name
// makes the generator print the authoritative fibre name (its `codeToName[code] ?? code` falls
// through to it) instead of an unresolved code. Legacy plain-text `composition` (older materials)
// passes through untouched — parseComposition reads that shape too. '' when the material has neither.
export function materialCompositionCode(m: common_Material): string {
  const legacy = m.composition?.trim();
  if (legacy) return legacy;
  const fibres = materialFibres(m);
  if (!fibres.length) return '';
  return JSON.stringify({ fibre: fibres.map((f) => ({ code: f.name, percent: f.percent })) });
}

const CLASS_PREFIX: Record<string, string> = {
  MATERIAL_CLASS_FABRIC: 'FAB',
  MATERIAL_CLASS_HARDWARE: 'HW',
  MATERIAL_CLASS_THREAD: 'THR',
  MATERIAL_CLASS_PACKAGING: 'PKG',
  MATERIAL_CLASS_OTHER: 'OTH',
};

const FINISH_ABBR: Record<string, string> = {
  matte: 'MAT',
  satin: 'SAT',
  gloss: 'GLS',
  glossy: 'GLS',
  polished: 'POL',
  brushed: 'BRU',
  antique: 'ANT',
};

// A loose input the article code is composed from — both the create-modal draft and a saved
// common_Material map into it (see composeArticleFromMaterial).
export type ArticleInput = {
  materialClass?: string;
  /** fibre codes, dominant first (e.g. ['CTN','ELA']) */
  fibreCodes?: string[];
  gsm?: string;
  widthCm?: string;
  diameterMm?: string;
  finish?: string;
  baseMaterial?: string;
  /** a hardware/type hint (e.g. 'button', 'zip') when known */
  typeHint?: string;
  colour?: string;
  supplier?: string;
};

// composeArticle — a self-describing code built from the material's own attributes:
//   [SUPPLIER·]CLASS·[fibre|type][gsm|Ø]·[Wwidth]·COLOUR   (tokens drop out when absent)
// e.g. FAB·CTN240·W150·BLK · HW·BTN·18·MAT · CER·FAB·CTN240·BLK (with supplier).
//
// NB this is the CLIENT-SIDE PREVIEW: the authoritative code is minted server-side on save. It is
// what the create modal shows live and the catalogue/pickers can display, so the code reads as a
// spec instead of a running number — but a saved material's `code` remains the source of truth.
export function composeArticle(inp: ArticleInput, withSupplier = false): string {
  const t: string[] = [];
  if (withSupplier && inp.supplier?.trim()) t.push(abbr(inp.supplier));
  t.push(CLASS_PREFIX[inp.materialClass ?? ''] ?? 'MAT');
  switch (inp.materialClass) {
    case 'MATERIAL_CLASS_FABRIC': {
      const fibre = abbr(inp.fibreCodes?.[0]);
      const gsm = roundStr(inp.gsm);
      if (fibre || gsm) t.push(`${fibre}${gsm}`);
      if (inp.widthCm) t.push(`W${roundStr(inp.widthCm)}`);
      break;
    }
    case 'MATERIAL_CLASS_HARDWARE': {
      const type = abbr(inp.typeHint) || abbr(inp.baseMaterial);
      if (type) t.push(type);
      if (inp.diameterMm) t.push(roundStr(inp.diameterMm));
      if (inp.finish?.trim()) t.push(FINISH_ABBR[inp.finish.trim().toLowerCase()] ?? abbr(inp.finish));
      break;
    }
    case 'MATERIAL_CLASS_THREAD': {
      const fibre = abbr(inp.fibreCodes?.[0]);
      if (fibre) t.push(fibre);
      break;
    }
    case 'MATERIAL_CLASS_PACKAGING': {
      const gsm = roundStr(inp.gsm);
      if (gsm) t.push(`G${gsm}`);
      break;
    }
    default:
      break;
  }
  if (inp.colour?.trim()) t.push(abbr(inp.colour));
  return t.filter(Boolean).join('·');
}

export function composeArticleFromMaterial(m: common_Material, withSupplier = false): string {
  return composeArticle(
    {
      materialClass: m.materialClass,
      fibreCodes: (m.compositionEntries ?? []).map((e) => e.fiberCode ?? '').filter(Boolean),
      gsm: dec(m.fabricAttrs?.weightGsm) || dec(m.fabricWeightGsm) || dec(m.packagingAttrs?.gsm),
      widthCm: dec(m.fabricAttrs?.widthCm) || dec(m.fabricWidth),
      diameterMm: dec(m.hardwareAttrs?.diameterMm),
      finish: m.hardwareAttrs?.finish,
      baseMaterial: m.hardwareAttrs?.baseMaterial,
      colour: m.color,
      supplier: m.supplier,
    },
    withSupplier,
  );
}
