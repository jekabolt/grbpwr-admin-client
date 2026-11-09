import { describe, expect, it } from 'vitest';

import { defaultSizeChartIcon, normalizePicturePoint } from './size-chart-picture';

describe('defaultSizeChartIcon', () => {
  it('uses leaf-first category names and midi defaults', () => {
    expect(defaultSizeChartIcon(['Dresses', 'Bottoms'])).toBe('dress_midi');
    expect(defaultSizeChartIcon(['Skirts', 'Bottoms'])).toBe('skirt_midi');
    expect(defaultSizeChartIcon(['Pullover hoodie', 'Tops'])).toBe('hoodie');
  });

  it('returns no icon for an unknown category', () => {
    expect(defaultSizeChartIcon(['Unmapped thing'])).toBeUndefined();
    expect(defaultSizeChartIcon([])).toBeUndefined();
  });
});

describe('normalizePicturePoint', () => {
  const rect = { left: 100, top: 50, width: 400, height: 200 } as DOMRect;

  it('normalises points inside the picture box', () => {
    expect(normalizePicturePoint(300, 100, rect)).toEqual({ x: 0.5, y: 0.25 });
  });

  it('clamps points to the picture box', () => {
    expect(normalizePicturePoint(40, 400, rect)).toEqual({ x: 0, y: 1 });
  });
});
