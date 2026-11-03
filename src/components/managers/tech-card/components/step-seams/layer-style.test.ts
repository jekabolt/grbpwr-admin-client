import { describe, expect, it } from 'vitest';

import type { Affine, PieceGeom, Pt2 } from 'lib/assembly-skeleton/types';
import { apply } from 'lib/assembly-skeleton/union/affine';
import { COVER_SHARE } from 'lib/assembly-skeleton/union/layer-cover';
import { pairOverlap, rasterize, thin } from 'lib/assembly-skeleton/union/overlap';

import {
  CARD6_OPS,
  CARD6_PIECE_KEYS,
  CARD6_SEAMS,
  card6Geoms,
  card6InnerLines,
  card6Step,
} from './card6.fixture';
import { layerStyle, paintedOrder, type LayerStyleInput } from './layer-style';
import type { PictureActionGlyph } from './step-picture-view';
import { stepResults } from './step-result';

const IDENTITY: Affine = [1, 0, 0, 1, 0, 0];

function rectangle(key: string, x: number, y: number, width: number, height: number): PieceGeom {
  return {
    pieceKey: key,
    name: key,
    hand: null,
    cloth: null,
    rs: [
      [x, y],
      [x + width, y],
      [x + width, y + height],
      [x, y + height],
    ],
    corners: [0, 1, 2, 3],
    notchIdx: [],
    edges: [],
    rect: true,
    areaMm2: width * height,
    perimMm: 2 * (width + height),
    twinOf: [],
  };
}

function syntheticStyle(
  geoms: readonly PieceGeom[],
  layers: readonly string[],
  options: Partial<Pick<LayerStyleInput, 'T' | 'marks' | 'innerLines' | 'colliding'>> = {},
) {
  return layerStyle({
    layers,
    T: options.T ?? new Map(geoms.map((geom) => [geom.pieceKey, IDENTITY])),
    geoms: new Map(geoms.map((geom) => [geom.pieceKey, geom])),
    marks: options.marks,
    innerLines: options.innerLines,
    colliding: options.colliding,
  });
}

function lengthOf(lines: readonly Pt2[][]): number {
  return lines.reduce(
    (total, line) =>
      total +
      line
        .slice(1)
        .reduce(
          (length, point, index) =>
            length + Math.hypot(point[0] - line[index][0], point[1] - line[index][1]),
          0,
        ),
    0,
  );
}

const levelsIn = (result: ReturnType<typeof layerStyle>) =>
  Object.fromEntries([...result.pieces.values()].map((piece) => [piece.key, piece.level]));

/** Every order of the keys: a rule that reads no order gives one answer across all of them. */
function ordersOf(keys: readonly string[]): string[][] {
  if (keys.length < 2) return [[...keys]];
  return keys.flatMap((key, index) =>
    ordersOf(keys.filter((_, other) => other !== index)).map((rest) => [key, ...rest]),
  );
}

describe('layerStyle', () => {
  it('leaves rectangles that only share a seam uncovered', () => {
    const left = rectangle('left', 0, 0, 10, 10);
    const right = rectangle('right', 10, 0, 10, 10);
    const result = syntheticStyle([left, right], ['left', 'right']);

    expect(result.lower).toEqual([]);
    expect(levelsIn(result)).toEqual({ left: 0, right: 0 });
    expect(result.pieces.get('left')).toMatchObject({ whole: true, covered: [], coveredBy: [] });
    expect(result.pieces.get('right')).toMatchObject({ whole: true, covered: [], coveredBy: [] });
  });

  it('dashes only the contour that runs under the piece above', () => {
    const big = rectangle('big', 0, 0, 10, 10);
    const small = rectangle('small', 4, 2, 6, 6);

    const smallLower = syntheticStyle([small, big], ['small', 'big']);
    expect(smallLower.pieces.get('small')).toMatchObject({
      fullyCovered: false,
      whole: false,
      visible: [],
      coveredBy: ['big'],
    });
    expect(lengthOf(smallLower.pieces.get('small')!.covered)).toBeCloseTo(24);
    expect(smallLower.pieces.get('big')).toMatchObject({ whole: true, coveredBy: [] });

    const bigLower = syntheticStyle([big, small], ['big', 'small']);
    expect(bigLower.pieces.get('big')).toMatchObject({ whole: false, coveredBy: ['small'] });
    expect(lengthOf(bigLower.pieces.get('big')!.covered)).toBeCloseTo(6);
    expect(lengthOf(bigLower.pieces.get('big')!.visible)).toBeCloseTo(34);
    expect(bigLower.pieces.get('small')).toMatchObject({ whole: true, coveredBy: [] });
  });

  it('keeps a contour whole when the cover lies inside the piece', () => {
    const panel = rectangle('panel', 0, 0, 10, 10);
    const pocket = rectangle('pocket', 3, 3, 4, 4);
    const result = syntheticStyle([panel, pocket], ['panel', 'pocket']);

    expect(result.lower).toEqual(['panel']);
    expect(result.pieces.get('panel')).toMatchObject({ whole: true, covered: [] });
    expect(lengthOf(result.pieces.get('panel')!.visible)).toBeCloseTo(40);
  });

  it('lists every piece above that covers, at any number of layers', () => {
    const deep = rectangle('deep', 5, 3, 2, 2);
    const bag = rectangle('bag', 4, 2, 6, 6);
    const front = rectangle('front', 0, 0, 10, 10);
    const placket = rectangle('placket', 6, 1, 4, 8);
    const result = syntheticStyle([deep, bag, front, placket], ['deep', 'bag', 'front', 'placket']);

    expect(result.lower).toEqual(['deep', 'bag', 'front']);
    expect(result.pieces.get('deep')?.coveredBy).toEqual(['bag', 'front', 'placket']);
    expect(result.pieces.get('bag')?.coveredBy).toEqual(['front', 'placket']);
    expect(result.pieces.get('front')?.coveredBy).toEqual(['placket']);
  });

  it('rejects twenty percent overlap and accepts forty percent overlap', () => {
    const lower = rectangle('lower', 0, 0, 10, 10);
    const twenty = rectangle('twenty', 8, 0, 10, 10);
    const forty = rectangle('forty', 6, 0, 10, 10);

    expect(syntheticStyle([lower, twenty], ['lower', 'twenty']).lower).toEqual([]);
    expect(levelsIn(syntheticStyle([lower, twenty], ['lower', 'twenty']))).toEqual({
      lower: 0,
      twenty: 0,
    });
    expect(syntheticStyle([lower, forty], ['lower', 'forty']).lower).toEqual(['lower']);
    // Equal sizes: which of the two lies above is the key's business, never the order's.
    const stackedLevels = levelsIn(syntheticStyle([lower, forty], ['forty', 'lower']));
    expect(new Set(Object.values(stackedLevels))).toEqual(new Set([0, 1]));
    expect(levelsIn(syntheticStyle([lower, forty], ['lower', 'forty']))).toEqual(stackedLevels);
  });

  it('keeps seam allowance out of a covered contour', () => {
    const lower = rectangle('lower', 0, 0, 10, 10);
    const sewn = rectangle('sewn', 9, 0, 10, 10);
    const result = syntheticStyle([lower, sewn], ['lower', 'sewn']);

    expect(result.pieces.get('lower')).toMatchObject({ whole: true, covered: [], coveredBy: [] });
  });

  it('marks an exactly stacked twin as fully covered', () => {
    const lower = rectangle('lower', 0, 0, 10, 10);
    const twin = rectangle('twin', 0, 0, 10, 10);
    const result = syntheticStyle([lower, twin], ['lower', 'twin']);

    expect(result.pieces.get('lower')).toMatchObject({
      fullyCovered: true,
      visible: [],
      coveredBy: ['twin'],
    });
    expect(lengthOf(result.pieces.get('lower')!.covered)).toBeCloseTo(40);
  });

  it('draws covered action marks by kind and returns world positions', () => {
    const lower = rectangle('lower', 0, 0, 10, 10);
    const upper = rectangle('upper', 0, 0, 5, 10);
    const marks: PictureActionGlyph[] = [
      { id: 'hole', piece: 'lower', kind: 'buttonhole', point: [2, 2] },
      { id: 'button-under', piece: 'lower', kind: 'button', point: [2, 2] },
      { id: 'label-under', piece: 'lower', kind: 'label', point: [2, 2] },
      { id: 'button-clear', piece: 'lower', kind: 'button', point: [8, 2] },
      { id: 'button-top', piece: 'upper', kind: 'button', point: [2, 2] },
      { id: 'press-under', piece: 'lower', kind: 'press-arrow', point: [2, 2], direction: [1, 0] },
    ];
    const T = new Map<string, Affine>([
      ['lower', [1, 0, 0, 1, 3, 4]],
      ['upper', [1, 0, 0, 1, 3, 4]],
    ]);
    const result = syntheticStyle([lower, upper], ['lower', 'upper'], { T, marks });

    expect(result.marks.get('hole')).toEqual({ id: 'hole', draw: 'solid', at: [5, 6] });
    expect(result.marks.get('button-under')).toEqual({
      id: 'button-under',
      draw: 'hidden',
      at: [5, 6],
    });
    expect(result.marks.get('label-under')?.draw).toBe('hidden');
    expect(result.marks.get('button-clear')?.draw).toBe('solid');
    expect(result.marks.get('button-top')?.draw).toBe('solid');
    // A press arrow points at a seam; it is never a covered mark.
    expect(result.marks.get('press-under')?.draw).toBe('solid');
  });

  it('does not hide a mark under a neighbour that only shares seam allowance', () => {
    const lower = rectangle('lower', 0, 0, 10, 10);
    const sewn = rectangle('sewn', 9, 0, 10, 10);
    const marks: PictureActionGlyph[] = [
      { id: 'button', piece: 'lower', kind: 'button', point: [9.5, 5] },
    ];
    const result = syntheticStyle([lower, sewn], ['lower', 'sewn'], { marks });

    expect(result.marks.get('button')?.draw).toBe('solid');
  });

  it('keeps the part of an inner line no piece above covers', () => {
    const panel = rectangle('panel', 0, 0, 10, 10);
    const line: Pt2[] = [
      [1, 5],
      [9, 5],
    ];
    const innerLines = new Map([['panel', [line]]]);

    const under = syntheticStyle([panel, rectangle('strip', 4, 0, 2, 10)], ['panel', 'strip'], {
      innerLines,
    });
    expect(under.pieces.get('panel')?.lines[0]).toEqual([
      [
        [1, 5],
        [4, 5],
      ],
      [
        [6, 5],
        [9, 5],
      ],
    ]);

    const beside = syntheticStyle([panel, rectangle('sewn', 8, 0, 10, 10)], ['panel', 'sewn'], {
      innerLines,
    });
    expect(beside.pieces.get('panel')?.lines[0]).toEqual([line]);
  });

  it('hides a covered button under its twin and dashes the contour', () => {
    const lower = rectangle('lower', 0, 0, 10, 10);
    const upper = rectangle('upper', 0, 0, 10, 10);
    const marks: PictureActionGlyph[] = [
      { id: 'button', piece: 'lower', kind: 'button', point: [5, 5] },
    ];
    const result = syntheticStyle([lower, upper], ['lower', 'upper'], { marks });

    expect(result.pieces.get('lower')).toMatchObject({ fullyCovered: true, visible: [] });
    expect(lengthOf(result.pieces.get('lower')!.covered)).toBeCloseTo(40);
    expect(result.marks.get('button')?.draw).toBe('hidden');
  });

  it('puts unlisted pieces at the bottom in transform-map order and skips missing inputs', () => {
    const a = rectangle('a', 0, 0, 10, 10);
    const b = rectangle('b', 0, 0, 10, 10);
    const top = rectangle('top', 0, 0, 10, 10);
    const missingTransform = rectangle('missing-transform', 0, 0, 10, 10);
    const T = new Map<string, Affine>([
      ['a', IDENTITY],
      ['b', IDENTITY],
      ['top', IDENTITY],
      ['missing-geom', IDENTITY],
    ]);
    const result = syntheticStyle([a, b, top, missingTransform], ['top', 'missing-transform'], {
      T,
    });

    expect([...result.pieces]).toHaveLength(3);
    expect(result.lower).toEqual(['a', 'b']);
    expect(result.pieces.get('a')?.coveredBy).toEqual(['b', 'top']);
    expect(result.pieces.get('b')?.coveredBy).toEqual(['top']);
    expect(result.pieces.has('missing-transform')).toBe(false);
    expect(result.pieces.has('missing-geom')).toBe(false);
  });

  it('takes its rings from one source', () => {
    const square = rectangle('square', 0, 0, 10, 10);
    const result = layerStyle({
      layers: ['square'],
      T: new Map([['square', IDENTITY]]),
      geoms: new Map([['square', square]]),
      ringOf: () => [
        [0, 0],
        [4, 0],
        [4, 4],
        [0, 4],
      ],
    });

    expect(lengthOf(result.pieces.get('square')!.visible)).toBeCloseTo(16);
  });

  it('asks nothing of a flag: the order alone says who is under whom', () => {
    const front = rectangle('front', 0, 0, 10, 10);
    const bag = rectangle('bag', 2, 2, 6, 6);
    const placket = rectangle('placket', 6, 0, 4, 10);
    const marks: PictureActionGlyph[] = [
      { id: 'b', piece: 'bag', kind: 'button', point: [4, 4] },
      { id: 'p', piece: 'front', kind: 'button', point: [8, 5] },
    ];
    const result = syntheticStyle([bag, front, placket], ['bag', 'front', 'placket'], { marks });

    expect(result.lower).toEqual(['bag', 'front']);
    expect(result.marks.get('b')?.draw).toBe('hidden');
    expect(result.marks.get('p')?.draw).toBe('hidden');
  });

  describe('the hierarchy level', () => {
    const front = rectangle('front', 0, 0, 10, 10);
    const bag = rectangle('bag', 4, 2, 6, 6);
    const placket = rectangle('placket', 6, 1, 4, 8);
    const deep = rectangle('deep', 5, 3, 2, 2);

    it('pieces that only collide neither cover each other nor change a level', () => {
      const body = rectangle('body', 0, 0, 10, 10);
      const sleeve = rectangle('sleeve', 4, 2, 6, 6);
      const cuff = rectangle('cuff', 4, 2, 6, 2);
      const colliding: [string, string][] = [
        ['body', 'sleeve'],
        ['body', 'cuff'],
      ];
      for (const order of ordersOf(['body', 'sleeve', 'cuff'])) {
        const style = syntheticStyle([body, sleeve, cuff], order, { colliding });
        // The cuff still lies on its own sleeve.
        expect(levelsIn(style)).toEqual({ body: 0, sleeve: 0, cuff: 1 });
        expect(style.pieces.get('body')?.coveredBy).toEqual([]);
        expect(style.pieces.get('body')?.whole).toBe(true);
      }
      // The same shapes without that fact stack, so the fact is what changed them.
      expect(levelsIn(syntheticStyle([body, sleeve, cuff], ['body', 'sleeve', 'cuff']))).toEqual({
        body: 0,
        sleeve: 1,
        cuff: 2,
      });
    });

    it('counts what a piece really lies on, one step per layer', () => {
      expect(levelsIn(syntheticStyle([front, bag], ['front', 'bag']))).toEqual({
        front: 0,
        bag: 1,
      });
      expect(
        levelsIn(syntheticStyle([front, bag, placket, deep], ['front', 'bag', 'placket', 'deep'])),
      ).toEqual({ front: 0, bag: 1, placket: 2, deep: 3 });
    });

    it('reads no order: every order of the layers gives the same levels', () => {
      const geoms = [front, bag, placket, deep];
      const levels = ordersOf(['front', 'bag', 'placket', 'deep']).map((order) =>
        levelsIn(syntheticStyle(geoms, order)),
      );
      for (const level of levels) expect(level).toEqual(levels[0]);
    });

    it('adds nothing for a seam: pieces that only meet at one are one level', () => {
      const left = rectangle('left', 0, 0, 10, 10);
      const sewn = rectangle('sewn', 9, 0, 10, 10);
      const next = rectangle('next', 18, 0, 10, 10);
      expect(levelsIn(syntheticStyle([left, sewn, next], ['left', 'sewn', 'next']))).toEqual({
        left: 0,
        sewn: 0,
        next: 0,
      });
    });

    it('keeps a pocket a level above the panel it lies on, beside any seam', () => {
      const panel = rectangle('panel', 0, 0, 10, 10);
      const pocket = rectangle('pocket', 2, 2, 4, 4);
      const sleeve = rectangle('sleeve', 10, 0, 6, 10);
      for (const order of ordersOf(['panel', 'pocket', 'sleeve']))
        expect(levelsIn(syntheticStyle([panel, pocket, sleeve], order))).toEqual({
          panel: 0,
          pocket: 1,
          sleeve: 0,
        });
    });

    it('gives left and right sewn the same one level, whichever way their layers are', () => {
      const leftPanel = rectangle('leftPanel', 0, 0, 10, 10);
      const leftPocket = rectangle('leftPocket', 2, 2, 4, 4);
      const leftYoke = rectangle('leftYoke', 1, 3, 5, 5);
      const rightPanel = rectangle('rightPanel', 10, 0, 10, 10);
      const rightPocket = rectangle('rightPocket', 14, 2, 4, 4);
      const rightYoke = rectangle('rightYoke', 14, 3, 5, 5);
      const geoms = [leftPanel, leftPocket, leftYoke, rightPanel, rightPocket, rightYoke];
      const left = ['leftPanel', 'leftPocket', 'leftYoke'];
      const right = ['rightPanel', 'rightPocket', 'rightYoke'];
      const first = levelsIn(syntheticStyle(geoms, [...left, ...right]));
      // Every order of one side against every order of the other: all that a flag can reach.
      for (const leftOrder of ordersOf(left))
        for (const rightOrder of ordersOf(right)) {
          const levels = levelsIn(syntheticStyle(geoms, [...leftOrder, ...rightOrder]));
          expect(levels.leftPanel).toBe(levels.rightPanel);
          expect(levels.leftPocket).toBe(levels.rightPocket);
          expect(levels.leftYoke).toBe(levels.rightYoke);
          expect(levels).toEqual(first);
        }
    });

    it('never lets two pieces that stack share a level', () => {
      const geoms = [front, bag, placket, deep];
      for (const order of ordersOf(['front', 'bag', 'placket', 'deep'])) {
        const result = syntheticStyle(geoms, order);
        for (const piece of result.pieces.values())
          for (const upper of piece.coveredBy)
            expect(piece.level).not.toBe(result.pieces.get(upper)!.level);
      }
    });

    it('survives a later step: more pieces beside the stack change no level', () => {
      const panel = rectangle('panel', 0, 0, 10, 10);
      const pocket = rectangle('pocket', 2, 2, 4, 4);
      const yoke = rectangle('yoke', 2, 3, 3, 3);
      const before = levelsIn(syntheticStyle([panel, pocket], ['panel', 'pocket']));
      const after = levelsIn(
        syntheticStyle(
          [panel, pocket, rectangle('later', 10, 0, 10, 10)],
          ['later', 'pocket', 'panel'],
        ),
      );
      expect(after).toMatchObject(before);
      // A piece that does land on the stack lifts only what lies on it.
      expect(levelsIn(syntheticStyle([panel, pocket, yoke], ['panel', 'pocket', 'yoke']))).toEqual({
        panel: 0,
        pocket: 1,
        yoke: 2,
      });
    });

    it('lets the order alone move the line work: one level set, two different contours', () => {
      const panel = rectangle('panel', 0, 0, 10, 10);
      const sticking = rectangle('pocket', 8, 2, 6, 4);
      const pocketOnTop = syntheticStyle([panel, sticking], ['panel', 'pocket']);
      const panelOnTop = syntheticStyle([panel, sticking], ['pocket', 'panel']);

      expect(levelsIn(pocketOnTop)).toEqual(levelsIn(panelOnTop));
      expect(lengthOf(pocketOnTop.pieces.get('panel')!.covered)).toBeCloseTo(4);
      expect(pocketOnTop.pieces.get('pocket')?.covered).toEqual([]);
      expect(panelOnTop.pieces.get('panel')?.covered).toEqual([]);
      expect(lengthOf(panelOnTop.pieces.get('pocket')!.covered)).toBeCloseTo(4 + 2 + 2);
    });
  });

  describe('every overlap has one side on top', () => {
    it('on a pair, whichever way round', () => {
      const a = rectangle('a', 0, 0, 10, 10);
      const b = rectangle('b', 3, 0, 10, 10);
      const first = syntheticStyle([a, b], ['a', 'b']);
      const second = syntheticStyle([a, b], ['b', 'a']);

      expect(first.pieces.get('a')?.coveredBy).toEqual(['b']);
      expect(first.pieces.get('b')?.coveredBy).toEqual([]);
      expect(second.pieces.get('a')?.coveredBy).toEqual([]);
      expect(second.pieces.get('b')?.coveredBy).toEqual(['a']);
      // The tone is the same both ways; the contours say who is on top.
      expect(levelsIn(first)).toEqual(levelsIn(second));
      expect(lengthOf(first.pieces.get('b')!.covered)).toBe(0);
      expect(lengthOf(second.pieces.get('b')!.covered)).toBeGreaterThan(0);
    });

    it('across card 6, measured apart from the cover test', { timeout: 60_000 }, () => {
      const geoms = card6Geoms();
      const results = stepResults(
        {
          ops: CARD6_OPS,
          byKey: CARD6_SEAMS,
          geoms,
          innerLines: card6InnerLines(),
          pieceKeys: CARD6_PIECE_KEYS,
        },
        { manualFit: true },
      );
      const RASTER_MM = 4;
      let overlaps = 0;
      // Every sixth step and the last: the rule does not vary by step, the raster is what costs.
      const sampled = results.filter((_, i) => i % 6 === 0 || i === results.length - 1);
      for (const at of sampled) {
        const style = layerStyle({ layers: at.layers, T: at.transforms, geoms });
        // `pieces` runs bottom to top, so `lower` always comes before `upper` here.
        const keys = [...style.pieces.keys()];
        const rasters = keys.map((key) => {
          const T = at.transforms.get(key)!;
          return rasterize(
            thin(geoms.get(key)!.rs).map((point) => apply(T, point)),
            RASTER_MM,
          );
        });
        keys.forEach((lower, i) =>
          keys.slice(i + 1).forEach((upper, offset) => {
            const share = pairOverlap(rasters[i], rasters[i + 1 + offset]);
            const lowerCovered = style.pieces.get(lower)!.coveredBy.includes(upper);
            // Never both ways, whatever the share.
            expect(style.pieces.get(upper)!.coveredBy).not.toContain(lower);
            // The raster is coarse: the margin keeps it off the threshold's own edge.
            if (share >= COVER_SHARE + 0.05) {
              overlaps++;
              expect(lowerCovered).toBe(true);
              expect(style.pieces.get(lower)!.level).not.toBe(style.pieces.get(upper)!.level);
            } else if (share <= COVER_SHARE - 0.05) expect(lowerCovered).toBe(false);
          }),
        );
      }
      expect(overlaps).toBeGreaterThan(0);
    });

    it('on card 6 at 540 and 660, where nothing is flagged', () => {
      const geoms = card6Geoms();
      const results = stepResults(
        {
          ops: CARD6_OPS,
          byKey: CARD6_SEAMS,
          geoms,
          innerLines: card6InnerLines(),
          pieceKeys: CARD6_PIECE_KEYS,
        },
        { manualFit: true },
      );
      for (const step of [540, 660]) {
        const at = results[card6Step(step)];
        expect(at.stacked).toEqual([]);
        const style = layerStyle({ layers: at.layers, T: at.transforms, geoms });
        // No flag no longer means two equal pieces: the order alone puts one under the other.
        for (const piece of style.lower)
          expect(at.layers.indexOf(piece)).toBeLessThan(at.layers.length - 1);
        // The level never read that order: the reverse of it colours every piece the same.
        const reversed = layerStyle({ layers: [...at.layers].reverse(), T: at.transforms, geoms });
        expect(levelsIn(reversed)).toEqual(levelsIn(style));
      }
    });
  });
});

describe('paintedOrder', () => {
  const style = (level: number, coveredBy: readonly string[] = []) => ({
    level,
    coveredBy: [...coveredBy],
  });
  const styles = new Map([
    ['big', style(0, ['small'])],
    ['small', style(1)],
    ['loose', style(0)],
  ]);

  it('with no order the level alone decides, whatever the layers are', () => {
    expect(paintedOrder(['small', 'big', 'loose'], styles)).toEqual(['big', 'loose', 'small']);
    expect(paintedOrder(['small', 'big', 'loose'], styles, [])).toEqual(['big', 'loose', 'small']);
  });

  it('an owner pair beats the level between two pieces', () => {
    const out = paintedOrder(['small', 'big', 'loose'], styles, [['small', 'big']]);
    expect(out.indexOf('small')).toBeLessThan(out.indexOf('big'));
  });

  it('a pair no owner named keeps its level', () => {
    const inner = new Map([
      ['big', style(0, ['strip'])],
      ['strip', style(1)],
      ['other', style(2)],
    ]);
    const out = paintedOrder(['strip', 'big', 'other'], inner, [['other', 'big']]);
    expect(out.indexOf('big')).toBeLessThan(out.indexOf('strip'));
    expect(out.indexOf('other')).toBeLessThan(out.indexOf('big'));
  });

  it('a piece with no style reads as level 0, and nothing is lost', () => {
    const out = paintedOrder(['ghost', 'small', 'big'], styles, [['small', 'big']]);
    expect([...out].sort()).toEqual(['big', 'ghost', 'small']);
  });
});
