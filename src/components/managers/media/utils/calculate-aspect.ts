import { common_MediaFull } from 'api/proto-http/admin';

export const calculateAspectRatio = (width?: number, height?: number): string | undefined => {
  if (!width || !height) return undefined;

  const gcd = (a: number, b: number): number => (b === 0 ? a : gcd(b, a % b));
  const divisor = gcd(width, height);

  return `${width / divisor}:${height / divisor}`;
};

export const mediaAspectRatio = (
  media: common_MediaFull,
  videoSizes: Record<number, { width: number; height: number }>,
) => {
  const width = media.media?.thumbnail?.width || videoSizes[media.id || 0]?.width;
  const height = media.media?.thumbnail?.height || videoSizes[media.id || 0]?.height;
  return calculateAspectRatio(width, height);
};

/**
 * Что слот говорит о пропорциях. Список `aspectRatio` (`['4:5']`, `['4:5','Custom']`, `['Custom']`)
 * читают и пикер, и приёмная модалка, и рамка плейсхолдера — разбирать его в каждом из трёх мест
 * значило бы, что «слот с фиксированным соотношением» где-то определится иначе, и кроп по ⌘V
 * предложит не ту сетку, которую потом требует сама рамка.
 */
export type SlotAspect = {
  /** Конкретные соотношения списка, числами. */
  ratios: number[];
  /** Есть ли свободный кроп. */
  hasCustom: boolean;
  /** Соотношение ОБЯЗАТЕЛЬНО: перечислены конкретные и свободного среди них нет. */
  constrained: boolean;
  /** Первое конкретное — то, по которому рисуется рамка и открывается кроп. */
  primary?: number;
};

export function parseAspect(ratio?: string): number | undefined {
  if (!ratio || ratio.toLowerCase() === 'custom') return undefined;
  const [w, h] = ratio.split(':').map(Number);
  return w && h ? w / h : undefined;
}

export function readSlotAspect(aspectRatio?: string[]): SlotAspect {
  const list = aspectRatio ?? [];
  const ratios = list
    .filter((r) => r.toLowerCase() !== 'custom')
    .map(parseAspect)
    .filter((r): r is number => r !== undefined);
  const hasCustom = list.some((r) => r.toLowerCase() === 'custom');
  return {
    ratios,
    hasCustom,
    constrained: ratios.length > 0 && !hasCustom,
    primary: ratios[0],
  };
}

/** Совпадает ли соотношение медиа с одним из требуемых (3% — допуск на округление сторон). */
export function matchesSlotRatio(width?: number, height?: number, ratios: number[] = []): boolean {
  if (!width || !height || ratios.length === 0) return false;
  const r = width / height;
  return ratios.some((vr) => Math.abs(r - vr) / vr < 0.03);
}

/**
 * Какая доля кадра уйдёт под нож, если вписать его в рамку `target` по центру. 0 — ничего,
 * 0.6 — шесть десятых площади.
 *
 * Нужна, чтобы диалог выбора отвечал на вопрос «подойдёт ли» ДО клика. Раньше он молчал:
 * человек кликал по снимку и только тогда узнавал, что соотношение не то и сейчас откроется
 * кроп. Из двух десятков подходящих по смыслу кадров глазами не видно, какой переживёт рамку
 * 2:1, а какой потеряет две трети, — а это ровно тот выбор, который здесь делают.
 */
export function cropLoss(width?: number, height?: number, target?: number): number | undefined {
  if (!width || !height || !target) return undefined;
  const r = width / height;
  // Вписанная по центру рамка забирает всю короткую сторону, поэтому доля оставшегося —
  // отношение меньшего соотношения к большему.
  return 1 - Math.min(r, target) / Math.max(r, target);
}

/**
 * Соотношения, у которых есть имя. Раньше этот список был картой ЦВЕТОВ: подпись под каждой
 * плиткой медиатеки заливалась `bg-red-600`, `bg-orange-500`, `bg-yellow-400`, `bg-green-500`,
 * `bg-cyan-600`, `bg-blue-500`, `bg-purple-600` — единственная в приложении раскраска-категория,
 * и она стояла на КАЖДОМ снимке. DESIGN.md разрешает цвет только под состояние (сломано,
 * в работе, готово), поэтому имя соотношения теперь пишется словом, а форма показывается
 * глифом самой пропорции (`RatioGlyph`).
 */
const NAMED_RATIOS = ['16:9', '4:3', '2:1', '1:1', '4:5', '3:4', '5:4', '9:16'] as const;

export const isKnownAspectRatio = (aspectRatio?: string): boolean =>
  Boolean(aspectRatio && (NAMED_RATIOS as readonly string[]).includes(aspectRatio));

/** Подпись пропорции для плитки: «4:5» у именованных, «1447×1080» у всех остальных. */
export function ratioLabel(aspectRatio?: string, width?: number, height?: number): string {
  if (isKnownAspectRatio(aspectRatio)) return aspectRatio as string;
  if (width && height) return `${width}×${height}`;
  return '—';
}
