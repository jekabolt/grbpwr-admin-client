import { SIZE_CHART_ICONS, type SizeChartIconLine } from './size-chart-icons';

export type SizeChartPictureSource = 'icon' | 'sketch' | 'upload';

export type SizeChartFreeLine = {
  measurementNameId: number;
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  position: number;
};

export type SizeChartPictureDraft = {
  source: SizeChartPictureSource;
  iconKey: string;
  mediaId: number;
  mediaUrl: string;
  lines: SizeChartFreeLine[];
};

export type PicturePoint = { x: number; y: number };
export type PictureSegment = PicturePoint & { x2: number; y2: number };
export type PictureViewBox = { x: number; y: number; width: number; height: number };

const CATEGORY_ICON: Record<string, string> = {
  outerwear: 'biker',
  tops: 'shirt',
  bottoms: 'joggers',
  dresses: 'dress_midi',
  dress: 'dress_midi',
  underwear: 'bodysuit',
  accessories: 'bag',
  shoes: 'shoe',
  footwear: 'shoe',
  bags: 'bag',
  objects: 'pouch',
  coats: 'puffer_coat',
  coat: 'puffer_coat',
  jackets: 'biker',
  jacket: 'biker',
  blazer: 'biker',
  vests: 'utility_vest',
  vest: 'utility_vest',
  tanks: 'cami',
  tank: 'cami',
  crop: 'crop_top',
  sweaters_knits: 'cardigan',
  sweaters: 'cardigan',
  sweater: 'cardigan',
  shirts: 'shirt',
  hoodies_sweatshirts: 'hoodie',
  hoodies: 'hoodie',
  pants: 'joggers',
  trousers: 'joggers',
  shorts: 'sport_shorts',
  skirts: 'skirt_midi',
  skirt: 'skirt_midi',
  gloves: 'mitten',
};

const categoryKey = (value: string) =>
  value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');

const directIconByName = new Map<string, string>();
for (const [key, icon] of Object.entries(SIZE_CHART_ICONS)) {
  directIconByName.set(categoryKey(key), key);
  directIconByName.set(categoryKey(icon.label), key);
}

/** Leaf-first category names resolve like the storefront map; an unknown chain has no icon. */
export function defaultSizeChartIcon(categoryNames: readonly string[]): string | undefined {
  for (const name of categoryNames) {
    const normalized = categoryKey(name);
    const key = directIconByName.get(normalized) ?? CATEGORY_ICON[normalized];
    if (key && SIZE_CHART_ICONS[key]) return key;
  }
  return undefined;
}

/**
 * Trousers draw their body length as `length`; the dictionary names that outseam `height`, and
 * older cards still call the row `length`. Only bottoms read them as one point: on bags and shoes
 * `height` and `length` are two different measurements.
 */
const BOTTOM_LENGTH_NAMES = ['height', 'length', 'outseam'];

/** The measurement a predrawn icon line stands for on this card: an existing row wins. */
export function iconLineMeasurementId(
  iconKey: string,
  lineName: string,
  idOf: (name: string) => number,
  rowIds: ReadonlySet<number>,
): number {
  const exact = idOf(lineName);
  const name = lineName.trim().toLowerCase();
  if (SIZE_CHART_ICONS[iconKey]?.family !== 'bottoms' || !BOTTOM_LENGTH_NAMES.includes(name)) {
    return exact;
  }
  for (const candidate of [name, ...BOTTOM_LENGTH_NAMES]) {
    const id = idOf(candidate);
    if (id && rowIds.has(id)) return id;
  }
  return idOf('height') || exact;
}

const clamp01 = (value: number) => Math.min(1, Math.max(0, value));

/** Pointer position in the picture box, persisted in the backend's normalised 0..1 frame. */
export function normalizePicturePoint(
  clientX: number,
  clientY: number,
  rect: Pick<DOMRect, 'left' | 'top' | 'width' | 'height'>,
): PicturePoint {
  if (rect.width <= 0 || rect.height <= 0) return { x: 0, y: 0 };
  return {
    x: clamp01((clientX - rect.left) / rect.width),
    y: clamp01((clientY - rect.top) / rect.height),
  };
}

export function parsePictureViewBox(value: string): PictureViewBox {
  const [x = 0, y = 0, width = 1, height = 1] = value.split(/\s+/).map(Number);
  if (![x, y, width, height].every(Number.isFinite) || width <= 0 || height <= 0) {
    return { x: 0, y: 0, width: 1, height: 1 };
  }
  return { x, y, width, height };
}

export function iconLineSegment(line: SizeChartIconLine): PictureSegment {
  if (line.type === 'horizontal') {
    return { x: line.xStart, y: line.y, x2: line.xEnd, y2: line.y };
  }
  return {
    x: line.x,
    y: line.yStart,
    x2: line.view === 'diagonal' ? line.xEnd ?? line.x : line.x,
    y2: line.yEnd,
  };
}

export function normalizedLineSegment(
  line: SizeChartFreeLine,
  viewBox: PictureViewBox,
): PictureSegment {
  return {
    x: viewBox.x + line.x1 * viewBox.width,
    y: viewBox.y + line.y1 * viewBox.height,
    x2: viewBox.x + line.x2 * viewBox.width,
    y2: viewBox.y + line.y2 * viewBox.height,
  };
}
