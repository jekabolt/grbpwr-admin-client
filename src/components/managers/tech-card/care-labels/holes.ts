// ДЫРЫ СОСТАВНИКА — единый словарь того, что мешает или портит печать ленты (план §9.5).
//
// Каждая дыра знает СВОЙ уровень по коду, а не по месту, где её создали: уровень берётся из
// `HOLE_LEVEL`, и конструктор `hole()` другого не принимает. Так один и тот же код не может стать
// блоком в резолвере и предупреждением в раскладке.
//
// Блок → кнопка экспорта закрыта; предупреждение → в README.txt (раздел WARNINGS) и на экран;
// info → только на экран (подсказка, что код волокна узнан по имени/псевдониму).
//
// ОБЛАСТЬ блока. Почти все блоки относятся к одному колорвею: блок в колорвее A не запрещает ZIP
// без него (снять чекбокс). Общие (`GLOBAL_HOLE_CODES`) держат весь экспорт: сломанные шрифты,
// QR-шаблон, пустой набор.
import type { PrintedPart } from './label-parts';
import type { LabelLang } from './phrases';

export type HoleLevel = 'block' | 'warn' | 'info';

export const BLOCK_HOLE_CODES = [
  'no-colorways',
  'no-sku',
  'size-no-ord',
  'no-colour-name',
  'no-country',
  'country-unknown',
  'fibre-unknown',
  'fibre-blend-code',
  'fibre-no-translation',
  'glyph-missing',
  'artwork-missing',
  'part-no-composition',
  'pinned-material-no-composition',
  'part-too-wide',
  'care-overflow',
  'care-too-many-symbols',
  'qr-empty',
  'qr-not-http',
  'qr-module-tiny',
  'nothing-to-export',
  'fonts-failed',
] as const;

export const WARN_HOLE_CODES = [
  'part-not-100',
  'equal-weight',
  'mixed-units',
  'no-usage',
  'care-empty',
  'qr-module-small',
  'colorway-not-active',
  'country-mismatch',
  'en-fallback-name',
  'third-label',
  'run-stale',
  'colorway-excluded',
  'legacy-free-text-composition',
] as const;

// §5.3 п. 3 называет совпадение по имени/псевдониму INFO-предупреждением: код узнан, печать верна,
// человеку лишь показывают, что слот хранил не код словаря.
export const INFO_HOLE_CODES = ['fibre-by-name'] as const;

export type HoleCode =
  | (typeof BLOCK_HOLE_CODES)[number]
  | (typeof WARN_HOLE_CODES)[number]
  | (typeof INFO_HOLE_CODES)[number];

export const HOLE_LEVEL: Record<HoleCode, HoleLevel> = Object.fromEntries([
  ...BLOCK_HOLE_CODES.map((c) => [c, 'block']),
  ...WARN_HOLE_CODES.map((c) => [c, 'warn']),
  ...INFO_HOLE_CODES.map((c) => [c, 'info']),
]) as Record<HoleCode, HoleLevel>;

/** Адрес дыры: что именно чинить. Все поля необязательны — дыра шаблона QR не знает колорвея. */
export type HoleRef = {
  colorwayId?: number;
  /** Часть-колонка (ключ; заголовок на ленте — `LABEL_PART_NAME[part]`). */
  part?: PrintedPart;
  lineKey?: string;
  fiberCode?: string;
  lang?: LabelLang;
  sizeId?: number;
  /** Артикул каталога (пин колорвея), к которому относится дыра. */
  materialId?: number;
};

export type Hole = {
  level: HoleLevel;
  code: HoleCode;
  message: string;
  ref: HoleRef;
};

export const hole = (code: HoleCode, message: string, ref: HoleRef = {}): Hole => ({
  level: HOLE_LEVEL[code],
  code,
  message,
  ref,
});

export const isBlocking = (h: Hole): boolean => h.level === 'block';

/** Общие дыры: держат весь экспорт, а не один колорвей (§9.5). */
export const GLOBAL_HOLE_CODES: ReadonlySet<HoleCode> = new Set<HoleCode>([
  'fonts-failed',
  'qr-empty',
  'qr-not-http',
  'qr-module-tiny',
  'qr-module-small',
  'nothing-to-export',
]);

export const isGlobalHole = (h: Hole): boolean => GLOBAL_HOLE_CODES.has(h.code);

/** Проставить колорвей всем дырам, которые его ещё не знают (резолвер зовут по колорвею). */
export const withColorway = (holes: Hole[], colorwayId: number | undefined): Hole[] =>
  colorwayId === undefined
    ? holes
    : holes.map((h) =>
        h.ref.colorwayId === undefined ? { ...h, ref: { ...h.ref, colorwayId } } : h,
      );
