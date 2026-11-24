import { afterEach, describe, expect, it } from 'vitest';

import type { IRText, Sheet } from 'lib/pattern-import/types';

import { joinTileSplitTexts, oneLabelBlock, textSeeds } from './seeds';

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

describe('small facing titles', () => {
  const facingSheet = (label: string): Sheet => {
    const s = sheet([label, 'FABRIC: CUT 1', 'FUSING: CUT 1']);
    s.texts.forEach((t, i) => {
      t.fontSizeMm = 3.72;
      t.bbox = { minX: 10, maxX: 30, minY: 10 + 4 * i, maxY: 13 + 4 * i };
    });
    s.paths = [
      {
        id: 1,
        src: s.texts[0].src,
        style: 0,
        closed: true,
        pts: [
          { x: 0, y: 0 },
          { x: 40, y: 0 },
          { x: 40, y: 40 },
          { x: 0, y: 40 },
        ],
      },
    ];
    return s;
  };

  it('uses the facing title and both cutting instructions inside a closed outline', () => {
    const s = facingSheet('F - BACK FACING');
    expect(textSeeds(s).map((t) => t.label)).toEqual(['F']);
    s.paths[0].closed = false;
    expect(textSeeds(s)).toEqual([]);
    s.paths[0].closed = true;
    s.texts.pop();
    expect(textSeeds(s)).toEqual([]);
  });

  it('ignores a small size label next to the same instructions', () => {
    expect(textSeeds(facingSheet('L - 2XL'), SIZES)).toEqual([]);
  });
});

describe('joinTileSplitTexts: a line cut by a tile edge reads whole', () => {
  // glyphs 0.6 of a 10 mm type: 6 mm per glyph; the bbox ends where the last glyph ends
  const item = (id: number, text: string, x: number, page: number, h = 10, y = 0): IRText => ({
    id,
    text,
    anchor: { x, y },
    bbox: { minX: x, minY: y - h, maxX: x + text.length * 0.6 * h, maxY: y },
    fontSizeMm: h,
    rotationDeg: 0,
    layer: null,
    src: { file: 'f', page, op: 0, sub: 0 },
  });
  const read = (t: IRText[]) =>
    joinTileSplitTexts(t)
      .map((x) => x.text)
      .sort();
  afterEach(() => {
    delete process.env.TILE_TEXT_JOIN_OFF;
  });

  it('overlapping tiles: the repeated glyphs are read once (Opal "B - SL" + "SLEEVE")', () => {
    // "B - SL" ends at 36; "SLEEVE" starts two glyphs earlier, at 24
    expect(read([item(1, 'B - SL', 0, 11), item(2, 'SLEEVE', 24, 12)])).toEqual(['B - SLEEVE']);
    expect(read([item(1, 'FABRIC', 0, 11), item(2, 'IC : CUT 2', 24, 12)])).toEqual([
      'FABRIC : CUT 2',
    ]);
  });

  it('abutting tiles: joined as printed, a space where the gap is one (Xeranthemum)', () => {
    expect(read([item(1, 'MDF0', 0, 23), item(2, '73', 24, 24)])).toEqual(['MDF073']);
    expect(read([item(1, 'CUT', 0, 23), item(2, '2', 20.2, 24)])).toEqual(['CUT 2']);
  });

  it('a line cut by two edges reads whole', () => {
    expect(
      read([item(1, 'BODICE', 0, 1), item(2, 'E GATH', 30, 2), item(3, 'HERS', 66, 3)]),
    ).toEqual(['BODICE GATHERS']);
  });

  it('stays apart: one page, another type, another baseline, a gap, glyphs that disagree', () => {
    expect(read([item(1, 'MDF0', 0, 5), item(2, '73', 24, 5)])).toEqual(['73', 'MDF0']);
    expect(read([item(1, 'MDF0', 0, 5), item(2, '73', 24, 6, 8)])).toEqual(['73', 'MDF0']);
    expect(read([item(1, 'MDF0', 0, 5), item(2, '73', 24, 6, 10, 3)])).toEqual(['73', 'MDF0']);
    expect(read([item(1, 'MDF0', 0, 5), item(2, '73', 34, 6)])).toEqual(['73', 'MDF0']);
    // overlap of two glyphs, but "XY" does not repeat "SL"
    expect(read([item(1, 'B - SL', 0, 11), item(2, 'XYEEVE', 24, 12)])).toEqual([
      'B - SL',
      'XYEEVE',
    ]);
  });

  it('textSeeds: the halves are no longer pieces "IC" and "73"', () => {
    const s = (texts: IRText[]) =>
      textSeeds({ texts, poses: [] } as unknown as Sheet)
        .map((x) => x.label)
        .sort();
    expect(
      s([
        item(1, 'B - SL', 0, 11, 12.7),
        item(2, 'SLEEVE', 0.6 * 12.7 * 4, 12, 12.7),
        item(3, 'FABRIC', 0, 11, 12.7, -15),
        item(4, 'IC : CUT 2', 0.6 * 12.7 * 4, 12, 12.7, -15),
        item(5, 'C - BACK BODICE', 400, 3, 12.7),
      ]),
    ).toEqual(['B', 'C']);
    process.env.TILE_TEXT_JOIN_OFF = '1';
    expect(
      s([
        item(1, 'B - SL', 0, 11, 12.7),
        item(2, 'SLEEVE', 0.6 * 12.7 * 4, 12, 12.7),
        item(3, 'FABRIC', 0, 11, 12.7, -15),
        item(4, 'IC : CUT 2', 0.6 * 12.7 * 4, 12, 12.7, -15),
        item(5, 'C - BACK BODICE', 400, 3, 12.7),
      ]),
    ).toEqual(['B', 'C', 'IC']);
  });
});

describe('oneLabelBlock: two labels of one paragraph are one outline', () => {
  // a centred line: anchor x so the line is centred on x = 100; glyph 0.6 of the type
  const line = (id: number, text: string, y: number, h: number, cx = 100): IRText => {
    const w = text.length * 0.6 * h;
    return {
      id,
      text,
      anchor: { x: cx - w / 2, y },
      bbox: { minX: cx - w / 2, minY: y - h, maxX: cx + w / 2, maxY: y },
      fontSizeMm: h,
      rotationDeg: 0,
      layer: null,
      src: { file: 'f', page: 0, op: 0, sub: 0 },
    };
  };
  // Madison MDF450, sheet mm: labels 8.82, cut lines 7.76, the note 6.35
  const H = line(1, 'H - SKIRT SHELL', 2047, 8.82);
  const I = line(3, 'I - SKIRT LINING', 2017.6, 8.82);
  const block = [
    H,
    line(2, 'FABRIC: Cut 2 on fold', 2033.9, 7.76),
    I,
    line(4, 'LINING: Cut 1 on fold', 2004.5, 7.76),
    line(5, 'Reduce one inch in length for the lining', 1994.2, 6.35),
  ];
  afterEach(() => {
    delete process.env.ONE_BLOCK_OFF;
  });

  it('Madison: H and I are one block', () => {
    expect(oneLabelBlock(H, I, block)).toBe(true);
    process.env.ONE_BLOCK_OFF = '1';
    expect(oneLabelBlock(H, I, block)).toBe(false);
  });

  it('another column, or a gap of more than two lines in the block: two pieces', () => {
    const I2 = line(3, 'I - SKIRT LINING', 2017.6, 8.82, 160);
    expect(oneLabelBlock(H, I2, [H, I2])).toBe(false);
    const far = line(3, 'I - SKIRT LINING', 2047 - 34, 8.82);
    expect(oneLabelBlock(H, far, [H, far])).toBe(false);
    expect(oneLabelBlock(H, far, [H, line(2, 'FABRIC: Cut 2 on fold', 2030, 7.76), far])).toBe(
      true,
    );
  });
});
