import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

import type { PieceGeom, Pt2 } from 'lib/assembly-skeleton/types';
import {
  LOWER_LAYER_FILL,
  LOWER_LAYER_STROKE,
  type UnionPicture,
} from 'lib/assembly-skeleton/union';
import { IDENTITY, translate } from 'lib/assembly-skeleton/union/affine';

import { UnitGlyph } from '../unit-silhouette';
import { boxOf, type StepLayout } from './step-picture';
import { StepPictureSvg, type EdgeMark } from './step-picture-view';

const rectangle = (pieceKey: string, name: string, width: number, height: number) =>
  ({
    pieceKey,
    name,
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

const bag = {
  ...rectangle('bag', 'pocket bag', 70, 70),
  edges: [{ id: 'bag#0', k: 0, pts: [[0, 0] as Pt2, [70, 0] as Pt2], len: 70 }],
} as unknown as PieceGeom;
const geoms = new Map([
  ['bag', bag],
  ['front', rectangle('front', 'front', 100, 100)],
]);
const transforms = new Map([
  ['bag', IDENTITY],
  ['front', translate(15, 15)],
]);
const points = [...transforms].flatMap(([key, transform]) =>
  geoms
    .get(key)!
    .rs.map(
      ([x, y]) =>
        [
          transform[0] * x + transform[2] * y + transform[4],
          transform[1] * x + transform[3] * y + transform[5],
        ] as Pt2,
    ),
);
const layout: StepLayout = {
  T: transforms,
  input: new Map([
    ['bag', 0],
    ['front', 1],
  ]),
  ghosts: [],
  stacked: [],
  onRuns: [],
  apart: [],
  clusters: [[0, 1]],
  layers: [[0, 1]],
  pieceLayers: [],
  hand: new Map(),
  bbox: boxOf(points),
};

const renderPicture = (
  layers?: readonly string[],
  marks?: readonly EdgeMark[],
  picture: StepLayout = layout,
) =>
  renderToStaticMarkup(
    <StepPictureSvg
      w={120}
      h={100}
      pad={4}
      look='tile'
      layout={picture}
      layers={layers}
      geoms={geoms}
      marks={marks}
    />,
  );

describe('StepPictureSvg lower layers', () => {
  it('overlays an owned bag below an overlapping front', () => {
    const markup = renderPicture(['bag', 'front']);
    const overlay = markup.match(/<path[^>]*data-lower-layer="bag"[^>]*>/)?.[0];

    expect(overlay).toBeDefined();
    expect(overlay).toContain(`fill="${LOWER_LAYER_FILL}"`);
    expect(overlay).toContain(`stroke="${LOWER_LAYER_STROKE}"`);
    expect(overlay).toContain('pointer-events="none"');
  });

  it('marks a picked edge on the lower piece above its grey overlay', () => {
    // One input carried as a block: no input partner to borrow a host from.
    const markup = renderPicture(['bag', 'front'], [{ id: 'bag#0', tone: 'pick' }], {
      ...layout,
      input: new Map([
        ['bag', 0],
        ['front', 0],
      ]),
      layers: [],
    });
    const mark = markup.indexOf('data-seam-mark="pick"');

    expect(mark).toBeGreaterThan(-1);
    expect(mark).toBeGreaterThan(markup.indexOf('data-lower-layer="bag"'));
  });

  it('does not add a lower overlay to a rowless picture', () => {
    expect(renderPicture()).not.toContain('data-lower-layer=');
  });

  it('keeps stacked-twin numbers at ten screen pixels', () => {
    const stacked = renderPicture(['bag', 'front'], undefined, {
      ...layout,
      stacked: [['front', 'bag']],
    });
    const tileLabel = stacked.match(/<text[^>]*data-twin-number="2"[^>]*>/)?.[0];

    expect(tileLabel).toContain('font-size="10"');
    expect(tileLabel).toContain('paint-order="stroke"');

    const picture: UnionPicture = {
      w: 100,
      h: 100,
      shapes: [
        {
          pieceKey: 'bag',
          pts: bag.rs,
          cloth: null,
          count: 1,
          hung: false,
          surface: false,
          mark: null,
          share: 1,
          lines: [],
        },
      ],
      pieceCount: 2,
      overflow: [],
      underlay: [],
      overlap: 0,
      lowerLayers: ['bag'],
      twinLabels: { bag: 2 },
    };
    const graph = renderToStaticMarkup(<UnitGlyph picture={picture} name='bag' />);
    const graphLabel = graph.match(/<text[^>]*data-twin-number="2"[^>]*>/)?.[0];

    expect(graphLabel).toContain('font-size="10"');
    expect(graphLabel).toContain('paint-order="stroke"');
    expect(graph).toContain('<svg xmlns="http://www.w3.org/2000/svg" width="100%" height="100%"');
  });
});
