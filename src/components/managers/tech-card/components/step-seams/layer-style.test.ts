import { describe, expect, it } from 'vitest';

import type { Affine, PieceGeom, Pt2 } from 'lib/assembly-skeleton/types';

import {
  CARD6_OPS,
  CARD6_PIECE_KEYS,
  CARD6_SEAMS,
  card6Geoms,
  card6InnerLines,
  card6Step,
} from './card6.fixture';
import { layerStyle, type LayerStyleInput } from './layer-style';
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
  options: Partial<Pick<LayerStyleInput, 'T' | 'marks' | 'mode' | 'flags'>> = {},
) {
  return layerStyle({
    layers,
    T: options.T ?? new Map(geoms.map((geom) => [geom.pieceKey, IDENTITY])),
    geoms: new Map(geoms.map((geom) => [geom.pieceKey, geom])),
    marks: options.marks,
    flags: options.flags,
    mode: options.mode ?? 'canvas',
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

describe('layerStyle', () => {
  it('leaves rectangles that only share a seam at depth zero', () => {
    const left = rectangle('left', 0, 0, 10, 10);
    const right = rectangle('right', 10, 0, 10, 10);
    const result = syntheticStyle([left, right], ['left', 'right']);

    expect(result.lower).toEqual([]);
    expect(result.pieces.get('left')).toMatchObject({ depth: 0, covered: [], coveredBy: [] });
    expect(result.pieces.get('right')).toMatchObject({ depth: 0, covered: [], coveredBy: [] });
  });

  it('covers a small lower rectangle and only dashes the big outline beneath it in reverse', () => {
    const big = rectangle('big', 0, 0, 10, 10);
    const small = rectangle('small', 4, 2, 6, 6);

    const smallLower = syntheticStyle([small, big], ['small', 'big']);
    expect(smallLower.pieces.get('small')).toMatchObject({
      depth: 1,
      fullyCovered: false,
      visible: [],
      coveredBy: ['big'],
    });
    expect(lengthOf(smallLower.pieces.get('small')!.covered)).toBeCloseTo(24);
    expect(smallLower.pieces.get('big')?.depth).toBe(0);

    const bigLower = syntheticStyle([big, small], ['big', 'small']);
    expect(bigLower.pieces.get('big')).toMatchObject({ depth: 1, coveredBy: ['small'] });
    expect(lengthOf(bigLower.pieces.get('big')!.covered)).toBeCloseTo(6);
    expect(lengthOf(bigLower.pieces.get('big')!.visible)).toBeCloseTo(34);
    expect(bigLower.pieces.get('small')?.depth).toBe(0);
  });

  it('uses the longest covering chain and caps fourth-layer depth at two', () => {
    const deep = rectangle('deep', 5, 3, 2, 2);
    const bag = rectangle('bag', 4, 2, 6, 6);
    const front = rectangle('front', 0, 0, 10, 10);
    const placket = rectangle('placket', 6, 1, 4, 8);
    const result = syntheticStyle([deep, bag, front, placket], ['deep', 'bag', 'front', 'placket']);

    expect(result.pieces.get('deep')?.depth).toBe(2);
    expect(result.pieces.get('bag')?.depth).toBe(2);
    expect(result.pieces.get('front')?.depth).toBe(1);
    expect(result.pieces.get('placket')?.depth).toBe(0);
  });

  it('rejects twenty percent overlap and accepts forty percent overlap', () => {
    const lower = rectangle('lower', 0, 0, 10, 10);
    const twenty = rectangle('twenty', 8, 0, 10, 10);
    const forty = rectangle('forty', 6, 0, 10, 10);

    expect(syntheticStyle([lower, twenty], ['lower', 'twenty']).lower).toEqual([]);
    expect(syntheticStyle([lower, forty], ['lower', 'forty']).lower).toEqual(['lower']);
  });

  it('marks an exactly stacked twin as fully covered', () => {
    const lower = rectangle('lower', 0, 0, 10, 10);
    const twin = rectangle('twin', 0, 0, 10, 10);
    const result = syntheticStyle([lower, twin], ['lower', 'twin']);

    expect(result.pieces.get('lower')).toMatchObject({
      depth: 1,
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
    ];
    const T = new Map<string, Affine>([
      ['lower', [1, 0, 0, 1, 3, 4]],
      ['upper', [1, 0, 0, 1, 3, 4]],
    ]);
    const result = syntheticStyle([lower, upper], ['lower', 'upper'], { T, marks });

    expect(result.marks.get('hole')).toEqual({ id: 'hole', draw: 'solid', at: [5, 6] });
    expect(result.marks.get('button-under')).toEqual({
      id: 'button-under',
      draw: 'dashed',
      at: [5, 6],
    });
    expect(result.marks.get('label-under')?.draw).toBe('hidden');
    expect(result.marks.get('button-clear')?.draw).toBe('solid');
    expect(result.marks.get('button-top')?.draw).toBe('solid');
  });

  it('hides covered buttons in thumbnails but keeps depths and the full outline', () => {
    const lower = rectangle('lower', 0, 0, 10, 10);
    const upper = rectangle('upper', 0, 0, 10, 10);
    const marks: PictureActionGlyph[] = [
      { id: 'button', piece: 'lower', kind: 'button', point: [5, 5] },
    ];
    const result = syntheticStyle([lower, upper], ['lower', 'upper'], {
      marks,
      mode: 'thumb',
    });

    expect(result.pieces.get('lower')).toMatchObject({
      depth: 1,
      fullyCovered: true,
      covered: [],
    });
    expect(lengthOf(result.pieces.get('lower')!.visible)).toBeCloseTo(40);
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
    expect(result.pieces.get('a')?.depth).toBe(2);
    expect(result.pieces.get('b')?.depth).toBe(1);
    expect(result.pieces.has('missing-transform')).toBe(false);
    expect(result.pieces.has('missing-geom')).toBe(false);
  });

  it('keeps card 6 pocket layering without greying edge-to-edge front pieces', () => {
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
    const at540 = results[card6Step(540)];
    const pocket = layerStyle({
      layers: at540.layers,
      T: at540.transforms,
      geoms,
      mode: 'canvas',
    });

    expect(pocket.pieces.get('PCK_L_BTTM')?.depth).toBe(1);
    expect(pocket.pieces.get('P_L_MAIN')?.depth).toBe(0);

    const at660 = results[card6Step(660)];
    const panel = layerStyle({
      layers: at660.layers,
      T: at660.transforms,
      geoms,
      mode: 'canvas',
    });
    expect(panel.pieces.get('P_L_U')?.coveredBy).toEqual(['PCK_L_MAIN']);
    expect(panel.pieces.get('P_L_MAIN')?.depth).toBe(0);

    const frontKeys = ['P_L_U', 'P_L_MAIN'];
    const edgePair = layerStyle({
      layers: at660.layers.filter((key) => frontKeys.includes(key)),
      T: new Map(frontKeys.map((key) => [key, at660.transforms.get(key)!])),
      geoms,
      mode: 'canvas',
    });
    expect(edgePair.pieces.get('P_L_U')?.depth).toBe(0);
    expect(edgePair.pieces.get('P_L_MAIN')?.depth).toBe(0);
  });

  it('uses only engine claims when stacked is given', () => {
    const front = rectangle('front', 0, 0, 10, 10);
    const bag = rectangle('bag', 2, 2, 6, 6);
    const placket = rectangle('placket', 6, 0, 4, 10);
    const marks: PictureActionGlyph[] = [
      { id: 'b', piece: 'bag', kind: 'button', point: [4, 4] },
      { id: 'p', piece: 'front', kind: 'button', point: [8, 5] },
    ];
    const claimed = syntheticStyle([bag, front, placket], ['bag', 'front', 'placket'], { marks });
    expect(claimed.lower).toEqual(['bag', 'front']);

    const result = layerStyle({
      layers: ['bag', 'front', 'placket'],
      T: new Map([bag, front, placket].map((geom) => [geom.pieceKey, IDENTITY])),
      geoms: new Map([bag, front, placket].map((geom) => [geom.pieceKey, geom])),
      marks,
      stacked: [['bag', 'front']],
      mode: 'canvas',
    });
    expect(result.lower).toEqual(['bag']);
    expect(result.pieces.get('bag')).toMatchObject({ depth: 1, coveredBy: ['front'] });
    expect(result.pieces.get('front')).toMatchObject({ depth: 0, covered: [], coveredBy: [] });
    expect(result.marks.get('b')?.draw).toBe('dashed');
    expect(result.marks.get('p')?.draw).toBe('solid');

    const none = layerStyle({
      layers: ['bag', 'front', 'placket'],
      T: new Map([bag, front, placket].map((geom) => [geom.pieceKey, IDENTITY])),
      geoms: new Map([bag, front, placket].map((geom) => [geom.pieceKey, geom])),
      stacked: [],
      mode: 'canvas',
    });
    expect(none.lower).toEqual([]);
  });
});
