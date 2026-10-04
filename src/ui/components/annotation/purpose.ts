import { fitQuadToAspect } from './geometry';

// НАЗНАЧЕНИЕ УКАЗАНИЯ — ВТОРАЯ ОСЬ, А НЕ НОВЫЕ ВИДЫ (волна callout kinds, 04.10).
//
// Владелец: «нам нужно добавить новые виды колаутов: note, detail, artwork, stitch, material,
// section». Вид ХРАНЕНИЯ (`kinds.ts`) отвечает на «какая фигура» — точка, линия, зона; назначение
// отвечает на «что это за указание» и несёт свои поля. Это ось, а не ещё шесть видов, по тому же
// доводу, что наконечники (0362): деталь — это зона с вставкой, шов — записка со строкой ISO, разрез
// — линия со стрелками. Фигура, жест, ручки, попадание остаются теми же.
//
// На проводе — `TechCardCallout.spec`, JSON-ОБЪЕКТ строкой. `"{}"` = обычное указание; `""` —
// «не прислано» (сервер несёт хранимое), поэтому клиент ВСЕГДА пишет объект (`writeSpec`).
//
// ДОСТУП ТОТАЛЕН, как у `kindDef`: мусор с провода (`parseSpec`) читается как «обычное указание»,
// а не роняет экран.

export const PURPOSE_KEYS = ['note', 'detail', 'artwork', 'stitch', 'material', 'section'] as const;
export type Purpose = (typeof PURPOSE_KEYS)[number];

export const ARTWORK_SUBS = ['print', 'embroidery', 'label', 'branding'] as const;
export type ArtworkSub = (typeof ARTWORK_SUBS)[number];

export const DETAIL_SCALES = [2, 3, 4] as const;

export type SectionLayer = { name: string };

export type Spec =
  | { t: 'note' }
  | { t: 'detail'; scale: number; mediaId?: number; url?: string }
  | {
      t: 'artwork';
      sub: ArtworkSub;
      w?: string;
      h?: string;
      from?: string;
      method?: string;
      /** Своя картинка артворка (PNG с прозрачностью) — рисуется ВНУТРИ зоны, поверх флэта. */
      mediaId?: number;
      url?: string;
    }
  | {
      t: 'stitch';
      /** ISO 4915 stitch type, as written («301», «504»). */
      iso?: string;
      /** ISO 4916 seam class — the card's own token (TECH_CARD_SEAM_CLASS_…). */
      seam?: string;
      /** Stitch density, stitches per cm (the repo's unit); SPI is derived. */
      stcm?: string;
      /** Seam allowance, mm. */
      allowance?: string;
      method?: string;
    }
  | { t: 'material'; lineKey?: string; name?: string }
  | { t: 'section'; layers: SectionLayer[] };

/** Section layer presets — the order a cut through a garment edge usually reads. */
export const SECTION_PRESETS = [
  'shell',
  'interlining',
  'lining',
  'binding',
  'padding',
  'seam allowance',
  'topstitch',
  'facing',
] as const;

/** Какая фигура ставится чипом назначения. `rect` — два клика по диагонали дают прямоугольник. */
export type PurposeTool = {
  key: Purpose;
  label: string;
  hint: string;
  /** Вид хранения, которым идёт жест (`kinds.ts`). */
  geometry: 'pin' | 'label' | 'dim';
  /** Две точки жеста — углы по диагонали; хранится 4-вершинной зоной. */
  rect: boolean;
  defaults: () => Spec;
};

export const PURPOSE_TOOLS: readonly PurposeTool[] = [
  {
    key: 'note',
    label: 'note',
    hint: 'a box of text on the sheet',
    geometry: 'pin',
    rect: false,
    defaults: () => ({ t: 'note' }),
  },
  {
    key: 'detail',
    label: 'detail',
    hint: 'frame a region — it is shown enlarged beside it, or with a photo of your own',
    geometry: 'dim',
    rect: true,
    defaults: () => ({ t: 'detail', scale: 2 }),
  },
  {
    key: 'artwork',
    label: 'artwork',
    hint: 'where a print, embroidery, label or branding goes',
    geometry: 'dim',
    rect: true,
    defaults: () => ({ t: 'artwork', sub: 'print' }),
  },
  {
    key: 'stitch',
    label: 'stitch',
    hint: 'stitch and seam — ISO 4915 / 4916, density, allowance',
    geometry: 'label',
    rect: false,
    defaults: () => ({ t: 'stitch' }),
  },
  {
    key: 'material',
    label: 'material',
    hint: 'which BOM line this is',
    geometry: 'label',
    rect: false,
    defaults: () => ({ t: 'material' }),
  },
  {
    key: 'section',
    label: 'section',
    hint: 'a cut line — the layers through it, top to bottom',
    geometry: 'dim',
    rect: false,
    defaults: () => ({ t: 'section', layers: [{ name: 'shell' }, { name: 'lining' }] }),
  },
];

const BY_KEY = new Map<string, PurposeTool>(PURPOSE_TOOLS.map((p) => [p.key, p]));

for (const key of PURPOSE_KEYS) {
  if (!BY_KEY.has(key)) throw new Error(`callout purpose registry is missing "${key}"`);
}

export function purposeTool(key: string | null | undefined): PurposeTool | undefined {
  return key ? BY_KEY.get(key) : undefined;
}

export function isPurpose(key: string | null | undefined): key is Purpose {
  return !!purposeTool(key);
}

/**
 * ИНСТРУМЕНТ ЛИСТА МОЖЕТ БЫТЬ И ВИДОМ, И НАЗНАЧЕНИЕМ: ключи не пересекаются. Поверхность ставит
 * фигуру по виду — назначение сводится к своему виду здесь, одной функцией.
 */
export function toolGeometry(tool: string | null | undefined): string | null {
  if (!tool) return null;
  return purposeTool(tool)?.geometry ?? tool;
}

// НЕ ОБРЕЗАЕТ: поле в строке читает значение отсюда же, и обрезка на каждом нажатии съедала бы
// пробел, который человек только что набрал («8 cm» не набрать).
const str = (v: unknown): string | undefined =>
  typeof v === 'string' && v.trim() ? v : typeof v === 'number' ? String(v) : undefined;

/** Тотальный разбор: всё, что не объект с известным `t`, — обычное указание (`null`). */
export function parseSpec(raw: string | null | undefined): Spec | null {
  if (!raw) return null;
  let o: unknown;
  try {
    o = JSON.parse(raw);
  } catch {
    return null;
  }
  if (!o || typeof o !== 'object' || Array.isArray(o)) return null;
  const r = o as Record<string, unknown>;
  switch (r.t) {
    case 'note':
      return { t: 'note' };
    case 'detail': {
      const scale = Number(r.scale);
      const mediaId = Number(r.mediaId);
      return {
        t: 'detail',
        scale: (DETAIL_SCALES as readonly number[]).includes(scale) ? scale : 2,
        ...(Number.isFinite(mediaId) && mediaId > 0 ? { mediaId } : {}),
        ...(str(r.url) ? { url: str(r.url) } : {}),
      };
    }
    case 'artwork': {
      const sub = (ARTWORK_SUBS as readonly string[]).includes(r.sub as string)
        ? (r.sub as ArtworkSub)
        : 'print';
      const mediaId = Number(r.mediaId);
      return compact({
        t: 'artwork' as const,
        sub,
        w: str(r.w),
        h: str(r.h),
        from: str(r.from),
        method: str(r.method),
        mediaId: Number.isFinite(mediaId) && mediaId > 0 ? mediaId : undefined,
        url: str(r.url),
      });
    }
    case 'stitch':
      return compact({
        t: 'stitch' as const,
        iso: str(r.iso),
        seam: str(r.seam),
        stcm: str(r.stcm),
        allowance: str(r.allowance),
        method: str(r.method),
      });
    case 'material':
      return compact({ t: 'material' as const, lineKey: str(r.lineKey), name: str(r.name) });
    case 'section': {
      const layers = Array.isArray(r.layers)
        ? r.layers
            .map((l) => str((l as Record<string, unknown> | null)?.name))
            .filter((n): n is string => !!n)
            .map((name) => ({ name }))
        : [];
      return { t: 'section', layers };
    }
    default:
      return null;
  }
}

function compact<T extends Record<string, unknown>>(o: T): T {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(o)) if (v !== undefined && v !== '') out[k] = v;
  return out as T;
}

/** Ключи по алфавиту — так же, как канонизирует сервер: прочитанное и записанное совпадают байтом. */
function sorted(v: unknown): unknown {
  if (Array.isArray(v)) return v.map(sorted);
  if (v && typeof v === 'object') {
    const out: Record<string, unknown> = {};
    for (const k of Object.keys(v as object).sort()) {
      const x = (v as Record<string, unknown>)[k];
      if (x === undefined || x === '') continue;
      out[k] = sorted(x);
    }
    return out;
  }
  return v;
}

/** ВСЕГДА объект: `"{}"` — обычное указание (пустая строка значила бы «не прислано»). */
export function writeSpec(spec: Spec | null | undefined): string {
  return JSON.stringify(sorted(spec ?? {}));
}

/** Пустое и `{}` — одно и то же «обычное указание»: форма держит пустое, провод видит `{}`. */
export function specWire(raw: string | null | undefined): string {
  return writeSpec(parseSpec(raw));
}

const SEAM_PREFIX = 'TECH_CARD_SEAM_CLASS_';

/** `TECH_CARD_SEAM_CLASS_LS_FLAT_FELLED` → `LS flat felled`. Незнакомое пишется как есть. */
export function seamShort(token: string | undefined): string {
  if (!token || token === `${SEAM_PREFIX}UNKNOWN`) return '';
  if (!token.startsWith(SEAM_PREFIX)) return token;
  const [fam, ...rest] = token.slice(SEAM_PREFIX.length).split('_');
  return [fam.length === 2 ? fam : fam.toLowerCase(), rest.join(' ').toLowerCase()]
    .filter(Boolean)
    .join(' ');
}

/** Стежков на см → SPI (стежков на дюйм), целым. Не число — пусто. */
export function spiOf(stcm: string | undefined): string {
  const n = Number(String(stcm ?? '').replace(',', '.'));
  return Number.isFinite(n) && n > 0 ? String(Math.round(n * 2.54)) : '';
}

const mm = (v: string | undefined) => (v ? (/^[\d.,]+$/.test(v) ? `${v} mm` : v) : '');

/**
 * ОДНА СТРОКА НАЗНАЧЕНИЯ — для плашки на листе, строки списка и печати. Пусто, когда сказать
 * нечего (поля ещё не заполнены): плашка тогда показывает только текст указания.
 */
export function specSummary(spec: Spec | null | undefined): string {
  if (!spec) return '';
  const join = (parts: (string | undefined | false)[]) =>
    parts
      .map((p) => (p ? p.trim() : ''))
      .filter(Boolean)
      .join(' · ');
  switch (spec.t) {
    case 'note':
      return '';
    case 'detail':
      return `detail ×${spec.scale}`;
    case 'artwork': {
      const size = spec.w || spec.h ? `${spec.w || '?'}×${spec.h || '?'} mm` : '';
      return join([spec.sub, size, spec.from, spec.method]);
    }
    case 'stitch': {
      const spi = spiOf(spec.stcm);
      return join([
        spec.iso,
        seamShort(spec.seam),
        spec.stcm && `${spec.stcm} st/cm${spi ? ` (${spi} spi)` : ''}`,
        mm(spec.allowance),
        spec.method,
      ]);
    }
    case 'material':
      return spec.name ?? '';
    case 'section':
      return spec.layers.map((l) => l.name).join(' / ');
  }
}

/** Ярлык назначения; обычное указание — пусто. */
export function purposeLabel(spec: Spec | null | undefined): string {
  return spec ? purposeTool(spec.t)?.label ?? '' : '';
}

/**
 * КАКИЕ НАЗНАЧЕНИЯ ПРИМЕНИМЫ К ПОСТАВЛЕННОЙ ФИГУРЕ. Смена назначения в строке не перерисовывает
 * геометрию: деталь и арт — зоны, разрез — линия, записка — точка без лидера. Шов и материал
 * ложатся на любую фигуру с плашкой.
 */
export function purposesFor(kind: string | null | undefined): (Purpose | '')[] {
  switch (kind) {
    case 'pin':
      return ['', 'note'];
    case 'polygon':
      return ['', 'detail', 'artwork', 'stitch', 'material'];
    case 'dim':
    case 'bracket':
      return ['', 'section', 'stitch', 'material'];
    case 'ink':
      return [''];
    default:
      return ['', 'stitch', 'material'];
  }
}

/** Буква разреза по порядку: A, B, … Z, AA… */
export function sectionLetter(i: number): string {
  let n = Math.max(0, Math.floor(i));
  let s = '';
  do {
    s = String.fromCharCode(65 + (n % 26)) + s;
    n = Math.floor(n / 26) - 1;
  } while (n >= 0);
  return s;
}

/** 2 точки по диагонали → 4 вершины прямоугольника по часовой (зона). */
export function rectCorners(
  a: { x: number; y: number },
  b: { x: number; y: number },
): { x: number; y: number }[] {
  const x0 = Math.min(a.x, b.x);
  const x1 = Math.max(a.x, b.x);
  const y0 = Math.min(a.y, b.y);
  const y1 = Math.max(a.y, b.y);
  return [
    { x: x0, y: y0 },
    { x: x1, y: y0 },
    { x: x1, y: y1 },
    { x: x0, y: y1 },
  ];
}

/** Прямоугольник, охватывающий точки (доли кадра) — регион вставки детали. */
/**
 * ЗОНА НАНЕСЕНИЯ — ВСЕГДА ЧЕТЫРЕ УГЛА (владелец, 04.10: «принт криво работает» — зона обросла
 * вершинами через ручки сторон, и картинку стало не на что натянуть). Четыре точки отдаются как
 * есть; любое другое число — прямоугольником охвата в порядке TL, TR, BR, BL (как ставит постановка).
 */
export function artworkQuad<P extends { x: number; y: number }>(pts: readonly P[]): { x: number; y: number }[] {
  if (pts.length === 4) return pts.slice();
  const b = boundsOf(pts);
  if (!b) return [];
  return [
    { x: b.x, y: b.y },
    { x: b.x + b.w, y: b.y },
    { x: b.x + b.w, y: b.y + b.h },
    { x: b.x, y: b.y + b.h },
  ];
}

export function boundsOf(pts: readonly { x: number; y: number }[]) {
  if (pts.length === 0) return null;
  const xs = pts.map((p) => p.x);
  const ys = pts.map((p) => p.y);
  const x0 = Math.min(...xs);
  const y0 = Math.min(...ys);
  return { x: x0, y: y0, w: Math.max(...xs) - x0, h: Math.max(...ys) - y0 };
}

/**
 * ПОСТАНОВКА НАЗНАЧЕНИЯ — ОДНО ПРАВИЛО НА ЛИСТ ARTIFACTS И НА МУДБОРД. Поверхность поставила фигуру
 * вида; здесь она становится фигурой назначения: деталь и арт — два угла → зона-прямоугольник,
 * разрез — линия со стрелками, арт — пунктиром; маркер детали — сбоку от региона, к свободной
 * половине кадра. `spec` — всегда объект (`writeSpec`); без назначения — `''` (обычное).
 */
export function placePurpose(
  tool: string | null | undefined,
  shape: string,
  pts: { x: number; y: number }[],
): {
  shape: string;
  pts: { x: number; y: number }[];
  /** Где встанет маркер/плашка; `null` — по правилу владельца (над центром). */
  marker: { x: number; y: number } | null;
  dashed?: boolean;
  filled?: boolean;
  caps?: 'arrow';
  spec: string;
} {
  const p = purposeTool(tool);
  if (!p || pts.length === 0) return { shape, pts, marker: null, spec: '' };
  let outShape = shape;
  let outPts = pts;
  if (p.rect && pts.length === 2) {
    outShape = 'polygon';
    outPts = rectCorners(pts[0], pts[1]);
  }
  if (p.key === 'section') outShape = 'dim';
  let marker: { x: number; y: number } | null = null;
  if (p.key === 'detail') {
    const xs = outPts.map((q) => q.x);
    const cx = xs.reduce((s, x) => s + x, 0) / xs.length;
    const cy = outPts.reduce((s, q) => s + q.y, 0) / outPts.length;
    const sideX = cx < 0.5 ? Math.max(...xs) + 0.2 : Math.min(...xs) - 0.2;
    marker = { x: Math.min(0.9, Math.max(0.1, sideX)), y: Math.min(0.9, Math.max(0.1, cy)) };
  }
  return {
    shape: outShape,
    pts: outPts,
    marker,
    ...(p.key === 'artwork' ? { dashed: true } : {}),
    ...(p.rect ? { filled: false } : {}),
    ...(p.key === 'section' ? { caps: 'arrow' as const } : {}),
    spec: writeSpec(p.defaults()),
  };
}

/** Буквы разрезов по порядку списка: A, B… — один счёт на экран и бумагу. */
export function sectionLettersOf<T>(rows: readonly T[], specOf: (r: T) => string | undefined) {
  const out = new Map<T, string>();
  for (const r of rows)
    if (parseSpec(specOf(r))?.t === 'section') out.set(r, sectionLetter(out.size));
  return out;
}

/**
 * ЗОНА АРТВОРКА ПОД ПРОПОРЦИИ ПРИКРЕПЛЁННОЙ КАРТИНКИ — ИЗ ДЕЙСТВИЯ ПРИКРЕПЛЕНИЯ, А НЕ ИЗ НАБЛЮДЕНИЯ
 * (R20). Картинка грузится асинхронно, а строки адресуются индексом массива, который сдвигается
 * при удалении соседа. Поэтому цель ищется В МОМЕНТ ЗАПИСИ: по `clientRef`, если он есть, иначе —
 * строка на том же индексе, у которой ВСЁ ЕЩЁ тот же адрес картинки и те же точки, что были при
 * прикреплении. Не нашлась (удалили, сдвинули, перекосили руками, сменили картинку) — записи нет.
 *
 * `aspect` — ширина/высота КАРТИНКИ, `frameAspect` — ширина/высота КАДРА: подгонка идёт в пикселях
 * кадра, доли анизотропны. Возвращает индекс и новые точки (строки, как в форме) или `null`.
 */
export function artworkAttachFit<
  T extends {
    clientRef?: string | null;
    spec?: string | null;
    points?: { x?: string; y?: string }[] | null;
  },
>(
  list: readonly T[],
  at: { index: number; clientRef?: string | null; url: string; points: string },
  aspect: number,
  frameAspect: number | null,
): { index: number; points: { x: string; y: string }[] } | null {
  if (!(aspect > 0) || !frameAspect || !(frameAspect > 0)) return null;
  const index = at.clientRef ? list.findIndex((c) => c.clientRef === at.clientRef) : at.index;
  const c = index >= 0 ? list[index] : undefined;
  if (!c) return null;
  const spec = parseSpec(c.spec);
  if (spec?.t !== 'artwork' || spec.url !== at.url) return null;
  if (JSON.stringify(c.points ?? []) !== at.points) return null;
  const pts = (c.points ?? []).map((p) => ({ x: Number(p.x) || 0, y: Number(p.y) || 0 }));
  if (pts.length !== 4) return null;
  const fitted = fitQuadToAspect(
    pts.map((p) => ({ x: p.x * frameAspect, y: p.y })),
    aspect,
  );
  const clamp = (n: number) => Math.min(1, Math.max(0, n));
  return {
    index,
    points: fitted.map((p) => ({
      x: clamp(p.x / frameAspect).toFixed(4),
      y: clamp(p.y).toFixed(4),
    })),
  };
}
