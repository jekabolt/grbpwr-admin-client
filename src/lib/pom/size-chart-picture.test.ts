import { describe, expect, it } from 'vitest';

import {
  defaultSizeChartIcon,
  iconLineMeasurementId,
  normalizePicturePoint,
} from './size-chart-picture';

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

describe('iconLineMeasurementId', () => {
  const ids: Record<string, number> = { length: 1, height: 2, rise: 3 };
  const idOf = (name: string) => ids[name] ?? 0;

  it('reads a trouser length line as the height row', () => {
    expect(iconLineMeasurementId('joggers', 'length', idOf, new Set([2, 3]))).toBe(2);
  });

  it('keeps an older trouser card that still names the row length', () => {
    expect(iconLineMeasurementId('joggers', 'length', idOf, new Set([1, 3]))).toBe(1);
  });

  it('adds the height row when the trouser card has neither', () => {
    expect(iconLineMeasurementId('joggers', 'length', idOf, new Set([3]))).toBe(2);
  });

  it('leaves tops and bags on their own names', () => {
    expect(iconLineMeasurementId('shirt', 'length', idOf, new Set([2]))).toBe(1);
    expect(iconLineMeasurementId('bag', 'length', idOf, new Set([2]))).toBe(1);
  });
});
