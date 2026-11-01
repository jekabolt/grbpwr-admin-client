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
import { boxOf, fitBox, toPx, type StepLayout } from './step-picture';
import {
  buttonGlyphGeometry,
  buttonHostChord,
  buttonRadiusPx,
  StepPictureSvg,
  type EdgeMark,
  type PictureActionGlyph,
} from './step-picture-view';

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

const renderPicture = ({
  layers,
  lower,
  stacked,
  marks,
  actionGlyphs,
  picture = layout,
  look = 'tile',
}: {
  layers?: readonly string[];
  lower?: readonly string[];
  stacked?: readonly (readonly [string, string])[];
  marks?: readonly EdgeMark[];
  actionGlyphs?: readonly PictureActionGlyph[];
  picture?: StepLayout;
  look?: 'canvas' | 'result' | 'tile' | 'print';
} = {}) =>
  renderToStaticMarkup(
    <StepPictureSvg
      w={120}
      h={100}
      pad={4}
      look={look}
      layout={picture}
      layers={layers}
      lower={lower}
      stacked={stacked}
      geoms={geoms}
      marks={marks}
      actionGlyphs={actionGlyphs}
    />,
  );

describe('StepPictureSvg lower layers', () => {
  it('tints an owned bag at depth one and omits its covered outline', () => {
    const markup = renderPicture({
      layers: ['bag', 'front'],
      lower: ['bag'],
      stacked: [['bag', 'front']],
      look: 'canvas',
    });
    const overlay = markup.match(/<path[^>]*data-lower-layer="bag"[^>]*>/)?.[0];

    expect(overlay).toBeDefined();
    expect(overlay).toContain(`fill="${LOWER_LAYER_FILL}"`);
    expect(overlay).toContain('pointer-events="none"');
    expect(markup).toContain('data-layer-depth="1"');
    expect(markup).toContain(`stroke="${LOWER_LAYER_STROKE}"`);
    expect(markup).not.toContain('data-covered-layer');
  });

  it('marks a picked edge above the lower-piece tint', () => {
    // One input carried as a block: no input partner to borrow a host from.
    const markup = renderPicture({
      layers: ['bag', 'front'],
      lower: ['bag'],
      stacked: [['bag', 'front']],
      marks: [{ id: 'bag#0', tone: 'pick' }],
      picture: {
        ...layout,
        input: new Map([
          ['bag', 0],
          ['front', 0],
        ]),
        layers: [],
      },
    });
    const mark = markup.indexOf('data-seam-mark="pick"');

    expect(mark).toBeGreaterThan(-1);
    expect(mark).toBeGreaterThan(markup.indexOf('data-lower-layer="bag"'));
  });

  it('does not tint an edge-to-edge pair without an owner claim', () => {
    const beside = new Map([
      ['bag', bag],
      ['front', rectangle('front', 'front', 100, 100)],
    ]);
    const besideLayout = {
      ...layout,
      T: new Map([
        ['bag', IDENTITY],
        ['front', translate(70, 0)],
      ]),
    };
    const markup = renderToStaticMarkup(
      <StepPictureSvg
        w={120}
        h={100}
        pad={4}
        look='canvas'
        layout={besideLayout}
        layers={['bag', 'front']}
        lower={[]}
        stacked={[]}
        geoms={beside}
      />,
    );

    expect(markup).not.toContain('data-lower-layer=');
    expect(markup).not.toContain('data-covered-layer=');
  });

  it('draws a covered button as an empty dashed outline', () => {
    const markup = renderPicture({
      layers: ['bag', 'front'],
      lower: ['bag'],
      stacked: [['bag', 'front']],
      look: 'canvas',
      actionGlyphs: [
        { id: 'covered-button', piece: 'bag', kind: 'button', point: [30, 30], sizeMm: 15 },
      ],
    });
    const group = markup.match(/<g[^>]*data-asm-mark="button"[^>]*>[\s\S]*?<\/g>/)?.[0] ?? '';

    expect(group).toContain('stroke-dasharray=');
    expect(group).not.toContain('data-button-hole=');
    expect(group).not.toContain('data-button-thread=');
    expect(markup.indexOf('data-asm-mark="button"')).toBeGreaterThan(
      markup.indexOf('data-piece-outline="front"'),
    );
  });

  it('keeps a claimed coincident twin at zero offset with its dashed edge underneath', () => {
    const lining = rectangle('lining', 'lining', 70, 70);
    const shell = rectangle('shell', 'shell', 70, 70);
    const twinGeoms = new Map([
      ['lining', lining],
      ['shell', shell],
    ]);
    const twinLayout: StepLayout = {
      ...layout,
      T: new Map([
        ['lining', IDENTITY],
        ['shell', IDENTITY],
      ]),
      input: new Map([
        ['lining', 0],
        ['shell', 1],
      ]),
      stacked: [['shell', 'lining']],
      bbox: boxOf(shell.rs),
    };
    const markup = renderToStaticMarkup(
      <StepPictureSvg
        w={160}
        h={120}
        pad={20}
        look='canvas'
        layout={twinLayout}
        layers={['lining', 'shell']}
        lower={['lining']}
        stacked={[['lining', 'shell']]}
        geoms={twinGeoms}
        names={['lining', 'shell']}
      />,
    );
    const surfacePath = (piece: string) => {
      const tag = markup.match(new RegExp(`<path[^>]*data-piece-surface="${piece}"[^>]*>`))?.[0];
      return tag?.match(/ d="([^"]+)"/)?.[1];
    };
    const underlay = markup.match(/<path[^>]*data-stacked-underlay="lining"[^>]*>/)?.[0];

    expect(surfacePath('lining')).toBe(surfacePath('shell'));
    expect(underlay).toContain('stroke-dasharray=');
    expect(markup.indexOf('data-stacked-underlay="lining"')).toBeLessThan(
      markup.indexOf('data-piece-surface="shell"'),
    );
    expect(markup).toContain('data-stacked-name-leader="lining"');
  });

  it('does not add a lower overlay to a rowless picture', () => {
    expect(renderPicture()).not.toContain('data-lower-layer=');
  });

  it('keeps stacked-twin numbers at ten screen pixels', () => {
    const stacked = renderPicture({
      layers: ['bag', 'front'],
      picture: { ...layout, stacked: [['front', 'bag']] },
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

describe('StepPictureSvg action glyphs', () => {
  const narrow = rectangle('narrow', 'narrow placket', 10, 100);
  const narrowGeoms = new Map([['narrow', narrow]]);
  const narrowLayout: StepLayout = {
    ...layout,
    T: new Map([['narrow', IDENTITY]]),
    input: new Map([['narrow', 0]]),
    bbox: boxOf(narrow.rs),
    clusters: [[0]],
    layers: [],
  };
  const marks = (kind: 'button' | 'buttonhole'): PictureActionGlyph[] =>
    Array.from({ length: 8 }, (_, index) => ({
      id: `${kind}-${index}`,
      piece: 'narrow',
      kind,
      point: [5, 10 + index * 11],
      direction: [1, 0],
      sizeMm: 11,
      lengthMm: kind === 'buttonhole' ? 12 : undefined,
    }));
  const renderNarrow = (glyphs: readonly PictureActionGlyph[]) =>
    renderToStaticMarkup(
      <StepPictureSvg
        w={120}
        h={140}
        pad={4}
        look='print'
        layout={narrowLayout}
        geoms={narrowGeoms}
        actionGlyphs={glyphs}
      />,
    );

  it('keeps eight narrow-host buttonholes on distinct real marks with parallel directions', () => {
    const markup = renderNarrow(marks('buttonhole'));
    const centres = [
      ...markup.matchAll(
        /data-asm-mark="buttonhole"[^>]*data-asm-x="([^"]+)" data-asm-y="([^"]+)"[^>]*data-asm-dx="([^"]+)" data-asm-dy="([^"]+)"/g,
      ),
    ];

    expect(centres).toHaveLength(8);
    expect(new Set(centres.map((match) => `${match[1]}:${match[2]}`)).size).toBe(8);
    expect(centres.every((match) => Math.abs(Number(match[3]) - 1) < 1e-9)).toBe(true);
    expect(centres.every((match) => Math.abs(Number(match[4])) < 1e-9)).toBe(true);
    expect(markup.match(/data-asm-length-mm="12"/g)).toHaveLength(8);
    expect(markup).not.toMatch(/mm²|мм²/);
  });

  it('uses the same buttonhole angle and scaled length on the editor canvas and PDF', () => {
    const glyph = marks('buttonhole')[0];
    const canvas = renderToStaticMarkup(
      <StepPictureSvg
        w={120}
        h={140}
        pad={4}
        look='canvas'
        layout={narrowLayout}
        geoms={narrowGeoms}
        actionGlyphs={[glyph]}
      />,
    );
    const pdf = renderNarrow([glyph]);
    const tag = (markup: string) =>
      markup.match(/<path[^>]*data-asm-mark="buttonhole"[^>]*>/)?.[0] ?? '';
    const direction = (markup: string) => [
      Number(tag(markup).match(/data-asm-dx="([^"]+)"/)?.[1]),
      Number(tag(markup).match(/data-asm-dy="([^"]+)"/)?.[1]),
    ];
    const segmentLength = (markup: string) => {
      const path = tag(markup).match(/\sd="([^"]+)"/)?.[1] ?? '';
      const values = (path.match(/-?\d+(?:\.\d+)?(?:e[+-]?\d+)?/gi) ?? []).map(Number);
      expect(values, tag(markup)).toHaveLength(4);
      return Math.hypot(values[2] - values[0], values[3] - values[1]);
    };

    expect(direction(canvas)).toEqual(direction(pdf));
    expect(segmentLength(canvas)).toBeCloseTo(segmentLength(pdf), 8);
    expect(tag(canvas)).toContain('stroke-width="0.8"');
    expect(tag(pdf)).toContain('stroke-width="0.7"');
  });

  it('keeps eight narrow-host buttons on eight distinct marks', () => {
    const markup = renderNarrow(marks('button'));
    const centres = [
      ...markup.matchAll(/data-asm-mark="button"[^>]*data-asm-x="([^"]+)" data-asm-y="([^"]+)"/g),
    ];

    expect(centres).toHaveLength(8);
    expect(new Set(centres.map((match) => `${match[1]}:${match[2]}`)).size).toBe(8);
  });

  it('centres an edge button across its narrow host and caps it at ninety percent', () => {
    const point: Pt2 = [10, 50];
    const markup = renderNarrow([{ ...marks('button')[0], point, direction: [1, 0], sizeMm: 11 }]);
    const tag = markup.match(/<g[^>]*data-asm-mark="button"[^>]*>/)?.[0] ?? '';
    const attribute = (name: string) =>
      Number(tag.match(new RegExp(`${name}="([^"]+)"`))?.[1] ?? Number.NaN);
    const fit = fitBox(narrowLayout.bbox, 120, 140, 7);
    const left = toPx(fit, [0, point[1]]);
    const right = toPx(fit, [10, point[1]]);
    const hostWidth = Math.abs(right[0] - left[0]);

    expect(attribute('data-asm-x')).toBeCloseTo((left[0] + right[0]) / 2, 1);
    expect(attribute('data-asm-y')).toBeCloseTo(left[1], 1);
    expect(attribute('data-asm-radius') * 2).toBeLessThanOrEqual(hostWidth * 0.9 + 1e-9);
  });

  it('spreads truly outside fallbacks along the narrow host', () => {
    const markup = renderNarrow(
      marks('button').map((glyph) => ({ ...glyph, point: [30, glyph.point[1]] })),
    );
    const centres = [
      ...markup.matchAll(/data-asm-mark="button"[^>]*data-asm-x="([^"]+)" data-asm-y="([^"]+)"/g),
    ];

    expect(centres).toHaveLength(8);
    expect(new Set(centres.map((match) => `${match[1]}:${match[2]}`)).size).toBe(8);
  });

  it('uses true button size with a sixteen-pixel minimum on a wide host', () => {
    expect(buttonRadiusPx(2, 1, 100)).toBe(8);
    expect(buttonRadiusPx(20, 2, 100)).toBe(20);
    expect(buttonRadiusPx(undefined, 2, 100)).toBe(15);
  });

  it('lets a ten-pixel host override the sixteen-pixel minimum', () => {
    expect(buttonRadiusPx(20, 2, 10)).toBe(4.5);
  });

  it('takes the host chord containing the mark', () => {
    const chord = buttonHostChord(
      [0, 40],
      [1, 0],
      [
        [0, 0],
        [10, 0],
        [10, 100],
        [0, 100],
      ],
    );

    expect(chord?.at[0]).toBeCloseTo(5, 6);
    expect(chord?.at[1]).toBeCloseTo(40, 6);
    expect(chord?.width).toBeCloseTo(10, 6);
  });

  it.each([
    ['cross_x', 2],
    ['parallel', 2],
    ['square', 1],
    ['u_shape', 1],
    ['other', 0],
  ] as const)('draws the %s attach pattern with visible four holes', (pattern, moves) => {
    const geometry = buttonGlyphGeometry([20, 20], 8, 4, pattern);

    expect(geometry.holes).toHaveLength(4);
    expect(geometry.thread.match(/M/g)?.length ?? 0).toBe(moves);
  });

  it('draws two holes with one thread bar', () => {
    const geometry = buttonGlyphGeometry([20, 20], 8, 2, 'cross_x');

    expect(geometry.holes).toHaveLength(2);
    expect(geometry.thread.match(/M/g)).toHaveLength(1);
  });
});
