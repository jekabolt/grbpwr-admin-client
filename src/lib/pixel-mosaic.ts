import { decode } from 'blurhash';

const PREVIEW_CACHE_LIMIT = 2000;
const previewCache = new Map<string, Promise<HTMLImageElement | null>>();

export function loadPixelPreview(src: string): Promise<HTMLImageElement | null> {
  const cached = previewCache.get(src);
  if (cached) {
    previewCache.delete(src);
    previewCache.set(src, cached);
    return cached;
  }

  if (typeof Image === 'undefined') return Promise.resolve(null);

  const pending = new Promise<HTMLImageElement | null>((resolve) => {
    const image = new Image();
    image.decoding = 'async';
    image.onload = () => resolve(image);
    image.onerror = () => resolve(null);
    image.src = src;
  });
  previewCache.set(src, pending);

  if (previewCache.size > PREVIEW_CACHE_LIMIT) {
    const oldest = previewCache.keys().next().value;
    if (oldest !== undefined) previewCache.delete(oldest);
  }

  return pending;
}

function targetSize(
  canvas: HTMLCanvasElement,
  width: number,
): { width: number; height: number; ratio: number } {
  const box = canvas.getBoundingClientRect();
  const ratio = box.width > 0 && box.height > 0 ? box.height / box.width : 1;
  return { width, height: Math.max(1, Math.round(width * ratio)), ratio };
}

export function drawPixelPreview(
  canvas: HTMLCanvasElement,
  image: HTMLImageElement,
  width: number,
): void {
  const size = targetSize(canvas, width);
  canvas.width = size.width;
  canvas.height = size.height;
  const context = canvas.getContext('2d');
  if (!context || !image.naturalWidth || !image.naturalHeight) return;

  const boxRatio = size.ratio;
  const imageRatio = image.naturalHeight / image.naturalWidth;
  let sourceX = 0;
  let sourceY = 0;
  let sourceWidth = image.naturalWidth;
  let sourceHeight = image.naturalHeight;

  if (imageRatio > boxRatio) {
    sourceHeight = sourceWidth * boxRatio;
    sourceY = (image.naturalHeight - sourceHeight) / 2;
  } else {
    sourceWidth = sourceHeight / boxRatio;
    sourceX = (image.naturalWidth - sourceWidth) / 2;
  }

  context.imageSmoothingEnabled = true;
  context.imageSmoothingQuality = 'high';
  context.drawImage(
    image,
    sourceX,
    sourceY,
    sourceWidth,
    sourceHeight,
    0,
    0,
    size.width,
    size.height,
  );
}

export function drawBlurhashPreview(canvas: HTMLCanvasElement, hash: string): void {
  const size = targetSize(canvas, 6);
  canvas.width = size.width;
  canvas.height = size.height;
  const context = canvas.getContext('2d');
  if (!context) return;

  try {
    const pixels = decode(hash, size.width, size.height);
    const imageData = context.createImageData(size.width, size.height);
    imageData.data.set(pixels);
    context.putImageData(imageData, 0, 0);
  } catch {
    context.clearRect(0, 0, size.width, size.height);
  }
}
