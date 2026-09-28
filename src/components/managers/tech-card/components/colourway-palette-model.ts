import type { common_Color, common_ColorwayColour } from 'api/proto-http/admin';

import { findPantone, normalizePantone } from './pantone-swatches';

/**
 * ═══ ПАЛИТРА КОЛОРВЕЯ — ЧИСТАЯ ПОЛОВИНА (T45, решения владельца 06-COLOURWAYS-RESEARCH §7) ═════
 *
 * Колорвей с T45 — это имя (+ переводы по языкам сторфронта) + палитра 1…8 цветов (первый —
 * главный; каждый — Pantone-код ИЛИ свободная метка, hex только для превью) + обязательное
 * семейство из словаря 17 цветов (тег фильтра; сервер предлагает ближайшее по hex главного) +
 * SKU-токен, который чеканит сервер и который никогда не меняется.
 *
 * Здесь — всё, что три экрана (окно рождения в студии, предложение ИИ, форма продукта) обязаны
 * делать ОДИНАКОВО и что дороже всего проверять браузером: разбор палитры с провода и обратно,
 * ряд «pantone или метка», отказы палитры, подбор семейства. Компонент рядом только рисует.
 */

/** Один цвет палитры, как его держит редактор: обе записи хранятся, ряд показывает одну. */
export type PaletteRow = {
  /** Pantone-код в хранимом написании («19-4005 TCX», «407 C»); '' = цвет назван меткой. */
  pantone: string;
  /** Книга кода — хвост самого кода (`pantoneSystemOf`); '' без кода. */
  pantoneSystem: string;
  /** Свободные слова («bone white»); '' когда назван код. */
  label: string;
  /** Экранное превью «#RRGGBB» или ''. Никогда не авторитет — авторитет у кода. */
  hex: string;
};

/** Пределы провода (DesignColourwayProposal.colours и ColorwayColour): палитра 1…8. */
export const PALETTE_MAX = 8;
export const LABEL_MAX = 40;
export const PANTONE_MAX = 24;
export const NAME_I18N_MAX = 128;

/** Подпись токена — одна фраза на все экраны (спека T45 п.2). */
export const TOKEN_CAPTION = 'sku token · minted by the server';

/**
 * СИСТЕМА ПАНТОНА — ХВОСТ ЕГО ЖЕ КОДА, а не второе поле формы. `normalizePantone` уже привёл
 * написание к хранимому («18-1248 TCX», «407 C»), и система — это последнее слово этой строки.
 * Спросить её отдельно значило бы позволить человеку назвать TCX у кода, который кончается на C.
 */
export function pantoneSystemOf(code?: string): string | undefined {
  const tail = (code ?? '').trim().split(/\s+/).pop() ?? '';
  return /^[A-Za-z]+$/.test(tail) ? tail.toUpperCase() : undefined;
}

/** `#rgb` / `#rrggbb` / без решётки → «#RRGGBB»; нечитаемое → ''. */
export function normalizeHex(input?: string): string {
  const h = (input ?? '').trim().replace(/^#/, '');
  const full = h.length === 3 ? h.replace(/./g, (c) => c + c) : h;
  return /^[0-9a-fA-F]{6}$/.test(full) ? `#${full.toUpperCase()}` : '';
}

export function blankRow(): PaletteRow {
  return { pantone: '', pantoneSystem: '', label: '', hex: '' };
}

/** Что стоит в ячейке «pantone или метка»: код, если он назван, иначе метка. */
export function rowText(r: PaletteRow): string {
  return r.pantone || r.label;
}

/**
 * ЯЧЕЙКА «PANTONE ИЛИ МЕТКА» — ОДНО ПОЛЕ, ДВА СМЫСЛА. Набранное читается как код ровно тогда,
 * когда `normalizePantone` его узнаёт (единственная проверка «ссылка ли это» на всю админку);
 * всё остальное — метка. Код из библиотеки приносит СВОЙ hex и перекрывает прежний: цвет
 * свотча книги авторитетнее превью, оставшегося от предыдущего выбора. Метка hex не трогает —
 * его набирают рядом.
 */
export function withText(r: PaletteRow, text: string): PaletteRow {
  const code = normalizePantone(text);
  if (code) {
    const swatch = findPantone(code);
    return {
      pantone: code,
      pantoneSystem: pantoneSystemOf(code) ?? '',
      label: '',
      hex: swatch?.hex ? normalizeHex(swatch.hex) : r.hex,
    };
  }
  return { pantone: '', pantoneSystem: '', label: text.trim().replace(/\s+/g, ' '), hex: r.hex };
}

export function withHex(r: PaletteRow, hex: string): PaletteRow {
  return { ...r, hex };
}

/** Палитра с провода (AdminColorwayRef.colours, ColorwayMerchandising.colours, предложение ИИ). */
export function paletteFromWire(colours?: readonly common_ColorwayColour[] | null): PaletteRow[] {
  return (colours ?? [])
    .map((c) => ({
      pantone: (c.pantone ?? '').trim(),
      pantoneSystem: (c.pantoneSystem ?? '').trim().toUpperCase(),
      label: (c.label ?? '').trim(),
      hex: normalizeHex(c.hex),
    }))
    .filter((r) => r.pantone || r.label);
}

/**
 * Палитра на провод. Пустые ряды (ни кода, ни метки) отсекаются — это «+ colour», который так
 * и не заполнили, а не цвет. Система названа только при коде (без кода сервер её отвергает).
 */
export function paletteToWire(rows: readonly PaletteRow[]): common_ColorwayColour[] {
  return rows
    .filter((r) => r.pantone.trim() || r.label.trim())
    .map((r) => ({
      pantone: r.pantone.trim(),
      pantoneSystem: r.pantone.trim() ? r.pantoneSystem || pantoneSystemOf(r.pantone) || '' : '',
      label: r.label.trim(),
      hex: normalizeHex(r.hex),
    }));
}

/** Ровно то, что уедет на провод, одной строкой — сравнивать палитры, а не объекты. */
export function paletteSignature(rows: readonly PaletteRow[]): string {
  return JSON.stringify(paletteToWire(rows));
}

/**
 * ОДИН ОТКАЗ ПАЛИТРЫ, СЛОВАМИ, по правилам провода (ColorwayColour, палитра 1…8). Ряд без кода
 * и без метки — не цвет; hex — либо #RRGGBB, либо пусто. Пустой список отказом НЕ является:
 * колорвей без палитры — законная старая форма (только семейство), это решает вызывающий.
 */
export function paletteRefusal(rows: readonly PaletteRow[]): string | null {
  if (rows.length > PALETTE_MAX) return `a palette holds up to ${PALETTE_MAX} colours`;
  for (let i = 0; i < rows.length; i += 1) {
    const r = rows[i];
    const n = i + 1;
    if (!r.pantone.trim() && !r.label.trim()) return `colour ${n} needs a pantone code or a label`;
    if (r.hex.trim() && !normalizeHex(r.hex)) return `colour ${n}: the preview hex is not #RRGGBB`;
    if (r.label.length > LABEL_MAX) return `colour ${n}: a label is up to ${LABEL_MAX} characters`;
    if (r.pantone.length > PANTONE_MAX)
      return `colour ${n}: a pantone code is up to ${PANTONE_MAX} characters`;
  }
  return null;
}

/* ─── переводы имени ───────────────────────────────────────────────────────────────────────── */

/**
 * ПЕРЕВОДЫ — UPSERT, А НЕ ЗАМЕНА (ColorwayDevelopmentInsert.name_i18n): непустое пишет язык, ''
 * удаляет, отсутствующий язык не трогается. Отсюда патч из «было → стало»: язык, стёртый в
 * форме, уезжает пустой строкой (удаление), нетронутый — не уезжает вовсе. `undefined` = нечего
 * писать. Ключи — Language.id строкой, как на проводе.
 */
export function nameI18nPatch(
  prev: Readonly<Record<string, string>> | undefined,
  next: Readonly<Record<string, string>> | undefined,
): Record<string, string> | undefined {
  const out: Record<string, string> = {};
  const keys = new Set([...Object.keys(prev ?? {}), ...Object.keys(next ?? {})]);
  for (const k of keys) {
    const was = (prev?.[k] ?? '').trim();
    const now = (next?.[k] ?? '').trim();
    if (was === now) continue;
    out[k] = now;
  }
  return Object.keys(out).length ? out : undefined;
}

/* ─── ближайшее семейство словаря (решение владельца 4) ────────────────────────────────────── */

/**
 * ЗЕРКАЛО СЕРВЕРНОЙ МЕРЫ — `internal/entity/colorway_palette.go: NearestColourFamily`, число в
 * число. Своего RPC «предложи семейство» у сервера нет: он предлагает семью только внутри
 * `CreateColorway` при пустом `color_code`, — а показать предложение человек должен ДО записи,
 * чтобы подтвердить или сменить. Значит клиент считает ту же меру сам, и она обязана совпадать
 * с серверной: «suggested: black» на экране и NAV в базе — это ложь в самом дорогом месте.
 *
 * ПОЧЕМУ НЕ ПРОСТОЕ РАССТОЯНИЕ В OKLab (цитата сервера): якоря словаря — чистые свотчи (BLK
 * #000000, NAV #1A2238), а тканевый чёрный — не #000000: 19-4005 TCX лежит по светлоте 0.27–0.30,
 * то есть ближе к NAV (0.26), чем к BLK (0), и простая метрика записывала каждый чёрный в navy.
 * Поэтому сперва «серый ли это вообще», потом светлота у серых и тон у цветных.
 */
type Oklab = { l: number; a: number; b: number };

const NEUTRAL_CHROMA_FLOOR = 0.02;
const NEUTRAL_SATURATION = 0.1;
const NEUTRAL_CHROMA_CAP = 0.035;
const LIGHTNESS_WEIGHT = 0.35;
const CHROMA_WEIGHT = 0.3;
const HUE_WEIGHT = 0.15;

function linear(c: number): number {
  return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
}

function hexToOklab(hex: string): Oklab | null {
  const h = normalizeHex(hex);
  if (!h) return null;
  const r = linear(parseInt(h.slice(1, 3), 16) / 255);
  const g = linear(parseInt(h.slice(3, 5), 16) / 255);
  const b = linear(parseInt(h.slice(5, 7), 16) / 255);
  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b);
  const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
  const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
  return {
    l: 0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s,
    a: 1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s,
    b: 0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s,
  };
}

const chroma = (c: Oklab) => Math.hypot(c.a, c.b);
const hue = (c: Oklab) => Math.atan2(c.b, c.a);
const neutral = (c: Oklab) => {
  const ch = chroma(c);
  return ch < NEUTRAL_CHROMA_FLOOR || ch < Math.min(NEUTRAL_SATURATION * c.l, NEUTRAL_CHROMA_CAP);
};

function familyDistance(t: Oklab, p: Oklab): number {
  const dl = LIGHTNESS_WEIGHT * (t.l - p.l);
  if (neutral(t)) {
    const da = t.a - p.a;
    const db = t.b - p.b;
    return Math.sqrt(dl * dl + da * da + db * db);
  }
  const dc = CHROMA_WEIGHT * (chroma(t) - chroma(p));
  let dh = Math.abs(hue(t) - hue(p));
  if (dh > Math.PI) dh = 2 * Math.PI - dh;
  dh *= HUE_WEIGHT;
  return Math.sqrt(dl * dl + dc * dc + dh * dh);
}

/**
 * Ближайшее НЕАРХИВНОЕ семейство словаря к hex главного цвета — ровно как выберет сервер. Серый
 * ищется среди серых, цветной среди цветных (при пустом своём классе — среди всех); равенство
 * решается МЕНЬШИМ кодом, чтобы ответ не зависел от порядка строк словаря. `undefined` — hex не
 * читается или сравнивать не с чем (в словаре нет цветов с hex).
 */
export function suggestFamily(
  hex: string | undefined,
  colours: readonly common_Color[] | undefined,
): common_Color | undefined {
  const target = hexToOklab(hex ?? '');
  if (!target) return undefined;
  const all: { c: common_Color; p: Oklab }[] = [];
  const same: { c: common_Color; p: Oklab }[] = [];
  for (const c of colours ?? []) {
    if (!c.code || c.archived) continue;
    const p = hexToOklab(c.hex ?? '');
    if (!p) continue;
    all.push({ c, p });
    if (neutral(p) === neutral(target)) same.push({ c, p });
  }
  const pool = same.length ? same : all;
  let best: common_Color | undefined;
  let bestD = Infinity;
  for (const cand of pool) {
    const d = familyDistance(target, cand.p);
    if (!best || d < bestD || (d === bestD && (cand.c.code ?? '') < (best.code ?? ''))) {
      best = cand.c;
      bestD = d;
    }
  }
  return best;
}

/** Строка под селектом семейства: «suggested: black». */
export function suggestionWords(c: common_Color | undefined): string {
  if (!c) return '';
  return `suggested: ${(c.name ?? '').trim().toLowerCase() || (c.code ?? '')}`;
}
