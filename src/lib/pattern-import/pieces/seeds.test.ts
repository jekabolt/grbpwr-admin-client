import { afterEach, describe, expect, it } from 'vitest';

import type { IRText, Sheet } from 'lib/pattern-import/types';

import { textSeeds } from './seeds';

const SIZES = new Set(['XS', 'S', 'M', 'L', 'XL', '2XL', '3XL', '4XL', '5XL']);

// The labels sit 200 mm apart so dedupe never merges them.
const sheet = (labels: string[]): Sheet =>
  ({
    texts: labels.map(
      (text, i): IRText => ({
        id: i + 1,
        text,
        anchor: { x: i * 200, y: 0 },
        bbox: { minX: i * 200, minY: 0, maxX: i * 200 + 40, maxY: 6 },
        fontSizeMm: 6,
        rotationDeg: 0,
        layer: null,
        src: { file: 'f', page: 0, op: 0, sub: 0 },
      }),
    ),
    poses: [],
  }) as unknown as Sheet;

const labels = (texts: string[], sizes: ReadonlySet<string> = SIZES) =>
  textSeeds(sheet(texts), sizes)
    .map((s) => s.label)
    .sort();

afterEach(() => {
  delete process.env.SEED_SIZE_RANGE_OFF;
});

describe('textSeeds: a size range is not a piece label', () => {
  it('drops "L - 2XL", keeps "D - PANTS FRONT"', () => {
    expect(labels(['L - 2XL', 'D - PANTS FRONT'])).toEqual(['D']);
  });

  it('SEED_SIZE_RANGE_OFF=1 keeps the old seed L', () => {
    process.env.SEED_SIZE_RANGE_OFF = '1';
    expect(labels(['L - 2XL', 'D - PANTS FRONT'])).toEqual(['D', 'L']);
  });

  it('keeps "L - LINING": the name is not a size', () => {
    expect(labels(['L - LINING'])).toEqual(['L']);
  });

  it('drops "XL: 2XL"', () => {
    expect(labels(['XL: 2XL'])).toEqual([]);
  });

  it('gives no seed for "S - M"', () => {
    expect(labels(['S - M'])).toEqual([]);
  });

  it('with no size labels, "L - 2XL" keeps its seed', () => {
    expect(labels(['L - 2XL'], new Set())).toEqual(['L']);
  });
});
