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

export const getAspectRatioBackgroundClass = (aspectRatio?: string): string => {
  return ASPECT_RATIO_CLASSES[aspectRatio || ''] || 'bg-gray-500';
};
