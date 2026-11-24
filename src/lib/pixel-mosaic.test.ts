import { afterEach, describe, expect, it, vi } from 'vitest';

import { drawPixelPreview, loadPixelPreview } from './pixel-mosaic';

describe('pixel mosaic', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('cover-crops with the box ratio before rounding the tiny canvas', () => {
    const drawImage = vi.fn();
    const context = {
      imageSmoothingEnabled: false,
      imageSmoothingQuality: 'low',
      drawImage,
    };
    const canvas = {
      width: 300,
      height: 150,
      getBoundingClientRect: () => ({ width: 400, height: 500 }),
      getContext: () => context,
    } as unknown as HTMLCanvasElement;
    const image = { naturalWidth: 6, naturalHeight: 12 } as HTMLImageElement;

    drawPixelPreview(canvas, image, 2);

    expect(canvas.width).toBe(2);
    expect(canvas.height).toBe(3);
    expect(drawImage).toHaveBeenCalledWith(image, 0, 2.25, 6, 7.5, 0, 0, 2, 3);
  });

  it('creates one preview image per source', async () => {
    class FakeImage {
      static count = 0;
      decoding = '';
      naturalWidth = 6;
      naturalHeight = 8;
      onload: (() => void) | null = null;
      onerror: (() => void) | null = null;

      constructor() {
        FakeImage.count += 1;
      }

      set src(_value: string) {
        queueMicrotask(() => this.onload?.());
      }
    }

    vi.stubGlobal('Image', FakeImage);
    const src = 'data:image/png;base64,pixel-mosaic-test';
    const first = loadPixelPreview(src);
    const second = loadPixelPreview(src);

    expect(second).toBe(first);
    expect(await second).toBe(await first);
    expect(FakeImage.count).toBe(1);
  });
});
