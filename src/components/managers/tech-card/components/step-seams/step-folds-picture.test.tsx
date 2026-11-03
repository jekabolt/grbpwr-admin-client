import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

import type { PieceGeom, Pt2 } from 'lib/assembly-skeleton/types';
import type { StoredFold } from 'lib/folds';

import { cardFoldsOf } from './step-folds';
import { stepLayout, type StepLayout } from './step-picture';
import { StepPictureSvg } from './step-picture-view';

const rectangle = (pieceKey: string, width: number, height: number) =>
  ({
    pieceKey,
    name: pieceKey,
    hand: null,
    cloth: null,
    rs: [
      [0, 0],
      [width, 0],
      [width, height],
      [0, height],
    ] as Pt2[],
    corners: [0, 1, 2, 3],
    notchIdx: [],
    edges: [],
    rect: true,
    areaMm2: width * height,
    perimMm: 2 * (width + height),
    twinOf: [],
  }) as PieceGeom;

const fold: StoredFold = {
  foldKey: 'fold',
  pieceKey: 'FLAP',
  seq: 1,
  kind: 'inward',
  source: 'owner',
  line: [
    [0.5, 0],
    [0.5, 1],
  ],
  flipAt: [0.25, 0.5],
  edge: null,
  contourSig: '',
  anchoredSize: 'M',
  note: '',
  stale: false,
};

const geoms = new Map([['FLAP', rectangle('FLAP', 80, 200)]]);
const flat = stepLayout([['FLAP']], [], geoms);
const steps = [{ foldKeys: ['fold'] }, {}];
const foldsAt = cardFoldsOf(steps, { rows: [fold], grainDeg: new Map() }, geoms)!;
const closing: StepLayout = { ...flat, folds: foldsAt(0)! };
const later: StepLayout = { ...flat, folds: foldsAt(1)! };

const svgOf = (
  layout: StepLayout,
  look: 'canvas' | 'tile' | 'print' = 'canvas',
  foldGhost = false,
) =>
  renderToStaticMarkup(
    <StepPictureSvg
      w={400}
      h={400}
      pad={0}
      look={look}
      layout={layout}
      geoms={geoms}
      foldGhost={foldGhost}
      bounds={{ x0: 0, y0: 0, x1: 200, y1: 200 }}
    />,
  );

const widthOf = (svg: string, attribute: string) => {
  const d = new RegExp(`<path d="([^"]+)"[^>]*${attribute}="FLAP"`).exec(svg)?.[1] ?? '';
  const xs = [...d.matchAll(/(-?[\d.]+)[, ](-?[\d.]+)/g)].map((point) => Number(point[1]));
  return (Math.max(...xs) - Math.min(...xs)) / 2;
};

describe('StepPictureSvg through the folds', () => {
  it('draws the folded ring, with T staying the flat one', () => {
    expect(widthOf(svgOf(flat), 'data-piece-outline')).toBeCloseTo(80, 0);
    expect(widthOf(svgOf(closing), 'data-piece-outline')).toBeCloseTo(40, 0);
    expect(widthOf(svgOf(later), 'data-piece-outline')).toBeCloseTo(40, 0);
    expect(closing.T).toBe(flat.T);
  });

  it('a canvas shows the turned-under part dashed over the outline', () => {
    const svg = svgOf(closing);
    expect(svg.indexOf('data-fold-under')).toBeGreaterThan(svg.indexOf('data-piece-outline'));
    expect(svg).toMatch(/stroke-dasharray="[^"]+" data-fold-under="FLAP"/);
  });

  it('a tile and the print keep the folded outline solid over it', () => {
    for (const look of ['tile', 'print'] as const) {
      const svg = svgOf(closing, look);
      expect(svg.indexOf('data-fold-under')).toBeLessThan(svg.indexOf('data-piece-outline'));
    }
  });

  it('the map ghosts the flat piece on the closing step only, under the outline', () => {
    const svg = svgOf(closing, 'tile', true);
    expect(widthOf(svg, 'data-fold-ghost')).toBeCloseTo(80, 0);
    expect(svg.indexOf('data-fold-ghost')).toBeLessThan(svg.indexOf('data-piece-outline'));
    expect(svgOf(later, 'tile', true)).not.toContain('data-fold-ghost');
    expect(svgOf(closing, 'tile')).not.toContain('data-fold-ghost');
  });

  it('a picture with no fold has no trace of them, ghost asked or not', () => {
    for (const look of ['canvas', 'tile', 'print'] as const) {
      const svg = svgOf(flat, look);
      expect(svg).not.toContain('data-fold-');
      expect(svgOf(flat, look, true)).toBe(svg);
    }
  });
});
