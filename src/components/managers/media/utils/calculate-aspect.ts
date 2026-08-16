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

const ASPECT_RATIO_CLASSES: Record<string, string> = {
  '16:9': 'bg-red-600',
  '4:3': 'bg-orange-500',
  '2:1': 'bg-gray-300',
  '1:1': 'bg-yellow-400',
  '4:5': 'bg-green-500',
  '3:4': 'bg-cyan-600',
  '5:4': 'bg-blue-500',
  '9:16': 'bg-purple-600',
} as const;

export const isKnownAspectRatio = (aspectRatio?: string): boolean => {
  if (!aspectRatio) return false;
  return Boolean(ASPECT_RATIO_CLASSES[aspectRatio]);
};

export const getAspectRatioBackgroundClass = (aspectRatio?: string): string => {
  return ASPECT_RATIO_CLASSES[aspectRatio || ''] || 'bg-gray-500';
};
