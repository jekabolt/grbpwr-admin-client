// СТРОКИ СОСТАВНИКА — чистые правила блока (без React): что значит «переопределено», как правка
// превращается в запись формы, куда ведёт дыра. Ими же пользуется проба (scripts/composition-label-probe.mjs).
import type { common_TechCardBomLabelPart } from 'api/proto-http/admin';
import type { UseFormGetValues, UseFormSetValue } from 'react-hook-form';
import type { OverrideFiber } from '../../care-labels/composition-override';
import type { Hole } from '../../care-labels/holes';
import { labelPartToWire, labelPartFromWire } from '../../care-labels/label-parts';
import { setCareLabel, setCareLabelColorway } from '../form-writers';
import type { FormCareLabelFiber } from '../labels-schema';
import type { TechCardFormData } from '../schema';

export type LineKey =
  | 'logo'
  | 'product'
  | 'care-symbols'
  | 'care-text'
  | 'made-in'
  | 'composition'
  | 'qr'
  | 'caption'
  | 'address';

/** Строки, как их пишет оператор: без пустых, без пробелов по краям. */
export const cleanLines = (text: string): string[] =>
  text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);

const sameLines = (a: readonly string[], b: readonly string[]) =>
  a.length === b.length && a.every((l, i) => l === b[i]);

/**
 * Правка многострочного значения → что хранить. Совпало с выведенным (без учёта регистра — лента
 * печатается капсом) — это не переопределение: `[]`, строка снова «выведена».
 */
export function linesOverride(text: string, derived: readonly string[]): string[] {
  const lines = cleanLines(text);
  const up = (ls: readonly string[]) => ls.map((l) => l.toUpperCase());
  return lines.length === 0 || sameLines(up(lines), up(derived)) ? [] : lines;
}

/** Имя цвета: совпало с выведенным (без регистра) — не переопределение. */
export function colourNameOverride(text: string, derived: string): string {
  const t = text.trim();
  return !t || t.toUpperCase() === derived.trim().toUpperCase() ? '' : t;
}

type G = UseFormGetValues<TechCardFormData>;
type S = UseFormSetValue<TechCardFormData>;

/** Строка «product line»: имя цвета колорвея на ленте. '' = выведенное (↺ derived). */
export function writeColourName(g: G, s: S, colorwayId: number, text: string, derived: string) {
  setCareLabelColorway(g, s, colorwayId, { colourName: colourNameOverride(text, derived) });
}

export function writeLines(
  g: G,
  s: S,
  field: 'careProseLines' | 'backCaptionLines' | 'addressLines',
  text: string,
  derived: readonly string[],
) {
  setCareLabel(g, s, { [field]: linesOverride(text, derived) });
}

// ---------- состав ----------

/** Строки редактора → записи формы: только годные (волокно выбрано, 1..100 %), дубли слиты. */
export function fibersToForm(rows: readonly OverrideFiber[]): FormCareLabelFiber[] {
  const merged = new Map<string, FormCareLabelFiber>();
  for (const r of rows) {
    const code = r.fiberCode.trim().toUpperCase();
    const pct = Math.round(r.pct);
    if (!code || !(pct >= 1)) continue;
    const part = labelPartToWire(r.part) as common_TechCardBomLabelPart;
    const k = `${part}|${code}`;
    const prev = merged.get(k);
    merged.set(k, { part, fiberCode: code, pct: Math.min(100, (prev?.pct ?? 0) + pct) });
  }
  return [...merged.values()].map((f) => ({ ...f, pct: Math.min(100, Math.max(1, f.pct ?? 1)) }));
}

export function fibersFromForm(rows: readonly FormCareLabelFiber[] | undefined): OverrideFiber[] {
  return (rows ?? []).flatMap((f) => {
    const part = labelPartFromWire(f.part);
    if (!part || part === 'NOT_ON_LABEL') return [];
    return [{ part, fiberCode: f.fiberCode ?? '', pct: f.pct ?? 0 }];
  });
}

/**
 * Состав колорвея (и, галочкой, всех остальных) ← строки редактора. Пустой итог = «выведено из
 * BOM» (запись колорвея, не переопределяющая ничего, снимается писателем).
 */
export function writeComposition(
  g: G,
  s: S,
  colorwayIds: readonly number[],
  rows: readonly OverrideFiber[],
) {
  const fibers = fibersToForm(rows);
  for (const id of colorwayIds) setCareLabelColorway(g, s, id, { fibers });
}

// ---------- дыры → строки ----------

const HOLE_LINE: Partial<Record<string, LineKey>> = {
  'logo-svg-unsupported': 'logo',
  'logo-unavailable': 'logo',
  'no-colour-name': 'product',
  'no-sku': 'product',
  'size-no-ord': 'product',
  'care-empty': 'care-symbols',
  'artwork-missing': 'care-symbols',
  'care-too-many-symbols': 'care-symbols',
  'no-country': 'made-in',
  'country-unknown': 'made-in',
  'colorway-unavailable': 'made-in',
  'fibre-unknown': 'composition',
  'fibre-blend-code': 'composition',
  'fibre-no-translation': 'composition',
  'fibre-by-name': 'composition',
  'en-fallback-name': 'composition',
  'part-no-composition': 'composition',
  'composition-empty': 'composition',
  'pinned-material-no-composition': 'composition',
  'part-too-wide': 'composition',
  'part-not-100': 'composition',
  'equal-weight': 'composition',
  'mixed-units': 'composition',
  'no-usage': 'composition',
  'third-label': 'composition',
  'legacy-free-text-composition': 'composition',
  'piece-pin-differs': 'composition',
  'qr-empty': 'qr',
  'qr-not-http': 'qr',
  'qr-module-tiny': 'qr',
  'qr-module-small': 'qr',
};

/** Строка, к которой ведёт дыра. `care-overflow` — по тексту: шапка, проза, подпись или адрес. */
export function holeLine(h: Hole): LineKey | null {
  if (h.code === 'care-overflow') {
    if (/caption/i.test(h.message)) return 'caption';
    if (/address/i.test(h.message)) return 'address';
    if (/header/i.test(h.message)) return 'product';
    return 'care-text';
  }
  return HOLE_LINE[h.code] ?? null;
}
