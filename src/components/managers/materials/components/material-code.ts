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
  if (m.composition?.trim()) parts.push(m.composition.trim());
  return parts.join(' · ');
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
