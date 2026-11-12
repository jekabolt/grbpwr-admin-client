import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

import type { PieceGeom, Pt2 } from 'lib/assembly-skeleton/types';
import { levelFill, unionPictureOfLayout, type UnionPicture } from 'lib/assembly-skeleton/union';
import { IDENTITY, translate } from 'lib/assembly-skeleton/union/affine';
import type { EdgeAnchor, StoredSeam } from 'lib/seams';

import { UnitGlyph } from '../unit-silhouette';
import { boxOf, fitBox, seamOfSides, seamSig, toPx, type StepLayout } from './step-picture';
import {
  buttonGlyphGeometry,
  buttonHostChord,
  buttonRadiusPx,
  drawnRing,
  stepActionMarks,
  stepLineKey,
  stepSeamsOfOp,
  StepPictureSvg,
  withoutCoveredDoors,
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

describe('step preview stored-row fallback', () => {
  const outlinePiece = (pieceKey: string, width: number) =>
    ({
      ...rectangle(pieceKey, pieceKey, width, 40),
      edges: [
        {
          id: `${pieceKey}#0`,
          pieceKey,
          k: 0,
          s: 0,
          e: 1,
          pts: [
            [0, 0],
            [width, 0],
          ],
          len: width,
          lenMm: width,
          chordMm: width,
          turnDeg: 0,
          notchesMm: [],
          kind: 'edge',
        },
      ],
    }) as unknown as PieceGeom;
  const left = outlinePiece('left', 100);
  const right = outlinePiece('right', 80);
  const outlineGeoms = new Map([
    [left.pieceKey, left],
    [right.pieceKey, right],
  ]);
  const anchor = (piece: string, length: number, range: readonly [number, number]): EdgeAnchor =>
    ({ piece, edgeHint: `${piece}#0`, lenMm: length, range }) as EdgeAnchor;

  it('draws a stored outline partial row byte-equal to the pre-C11 whole-side fallback', () => {
    const row: StoredSeam = {
      seamKey: 'outline-partial',
      status: 'confirmed',
      kind: 'partial',
      direction: 'reversed',
      source: 'manual',
      sideA: [anchor('left', 100, [0.2, 0.8])],
      sideB: [anchor('right', 80, [0.25, 0.75])],
      anchoredSize: 'M',
      note: '',
    };
    const operation = {
      operationNumber: 1,
      inputKeys: ['left', 'right'],
      seamKeys: [row.seamKey],
    };
    const actual = stepSeamsOfOp(operation, { chosen: [] }, outlineGeoms, {
      operations: [operation],
      index: 0,
      pieceKeys: new Set(['left', 'right']),
      byKey: new Map([[row.seamKey, row]]),
      ready: false,
      skipLayout: true,
    }).storedSeams;
    const beforeC11 = seamOfSides({ a: ['left#0'], b: ['right#0'] }, outlineGeoms, new Map());

    expect(seamSig(actual)).toBe(seamSig(beforeC11 ? [beforeC11] : []));
  });
});

const transforms = new Map([
  ['bag', translate(15, 15)],
  ['front', IDENTITY],
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

const surfaceTag = (markup: string, piece: string) =>
  markup.match(new RegExp(`<path[^>]*data-piece-surface="${piece}"[^>]*>`))?.[0] ?? '';

const fillOf = (markup: string, piece: string) =>
  / fill="([^"]*)"/.exec(surfaceTag(markup, piece))?.[1];

const renderPicture = ({
  layers,
  stacked,
  marks,
  stepEdges,
  stepParts,
  actionGlyphs,
  noSeamText,
  picture = layout,
  look = 'tile',
}: {
  layers?: readonly string[];
  stacked?: readonly (readonly [string, string])[];
  marks?: readonly EdgeMark[];
  stepEdges?: readonly string[];
  stepParts?: readonly { target: string; range?: readonly [number, number] }[];
  actionGlyphs?: readonly PictureActionGlyph[];
  noSeamText?: string;
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
      stacked={stacked}
      geoms={geoms}
      marks={marks}
      stepEdges={stepEdges}
      stepParts={stepParts}
      actionGlyphs={actionGlyphs}
      noSeamText={noSeamText}
    />,
  );

describe('StepPictureSvg lower layers', () => {
  it.each(['canvas', 'tile', 'print'] as const)(
    'paints each piece the colour of its level, in the order of the layers, in the %s renderer',
    (look) => {
      for (const order of [
        ['bag', 'front'],
        ['front', 'bag'],
      ]) {
        const markup = renderPicture({ layers: order, look });

        // The bag lies on the front: one level above it, whichever layer is on top.
        expect(fillOf(markup, 'front')).toBe(levelFill(0));
        expect(fillOf(markup, 'bag')).toBe(levelFill(1));
        expect(surfaceTag(markup, 'bag')).toContain('data-piece-level="1"');
        // The fills lie in the order of the layers.
        expect(markup.indexOf(`data-piece-surface="${order[1]}"`)).toBeGreaterThan(
          markup.indexOf(`data-piece-surface="${order[0]}"`),
        );
        expect(markup).not.toContain('data-lower-layer-region');
        expect(markup).not.toContain('data-layer-depth');
        expect(markup).not.toContain('data-lower-layer-depth');
        expect(markup).not.toContain('clip-path');
      }
    },
  );

  it.each(['canvas', 'tile', 'print'] as const)(
    'draws the top contour solid and the hidden contour dashed in the %s renderer',
    (look) => {
      const markup = renderPicture({ layers: ['bag', 'front'], look });
      const tagsOf = (attribute: string) =>
        markup.match(new RegExp(`<path[^>]*${attribute}[^>]*>`, 'g')) ?? [];

      expect(tagsOf('data-piece-outline="front"').length).toBeGreaterThan(0);
      for (const tag of tagsOf('data-piece-outline="front"'))
        expect(tag).not.toContain('stroke-dasharray');
      expect(tagsOf('data-piece-hidden="front"')).toEqual([]);

      // Under the front, whole: every line of the bag is hidden.
      expect(tagsOf('data-piece-outline="bag"')).toEqual([]);
      expect(tagsOf('data-piece-hidden="bag"').length).toBeGreaterThan(0);
      for (const tag of tagsOf('data-piece-hidden="bag"'))
        expect(tag).toContain('stroke-dasharray');
    },
  );

  it('draws the dashes of the mockup on a tile', () => {
    const markup = renderPicture({ layers: ['bag', 'front'], look: 'tile' });

    expect(markup).toMatch(/stroke-dasharray="3 2"[^>]*data-piece-hidden="bag"/);
  });

  it.each(['canvas', 'tile', 'print'] as const)(
    'gives two orders of one pair different pictures in the %s renderer',
    (look) => {
      const one = renderPicture({ layers: ['bag', 'front'], look });
      const two = renderPicture({ layers: ['front', 'bag'], look });

      expect(one).not.toBe(two);
      // The order moves the line work and never the colour.
      for (const piece of ['bag', 'front']) expect(fillOf(one, piece)).toBe(fillOf(two, piece));
      // The bag lies inside the front: under it, it is dashed; over it, it is solid and nothing is.
      expect(one).toContain('data-piece-hidden="bag"');
      expect(one).not.toContain('data-piece-outline="bag"');
      expect(two).toContain('data-piece-outline="bag"');
      expect(two).not.toContain('data-piece-hidden=');
    },
  );

  it('asks nothing of the flags: the order alone paints', () => {
    const plain = renderPicture({ layers: ['bag', 'front'], look: 'canvas' });
    const flagged = renderPicture({
      layers: ['bag', 'front'],
      stacked: [['bag', 'front']],
      look: 'canvas',
    });

    expect(flagged).toBe(plain);
  });

  it.each(['canvas', 'tile', 'print'] as const)(
    'cuts a sleeve contour at its narrow cover in the %s renderer',
    (look) => {
      const sleeve = rectangle('sleeve', 'sleeve', 100, 100);
      const strip = rectangle('strip', 'placket strip', 10, 120);
      const partialGeoms = new Map([
        ['sleeve', sleeve],
        ['strip', strip],
      ]);
      const partialLayout: StepLayout = {
        ...layout,
        T: new Map([
          ['sleeve', IDENTITY],
          ['strip', translate(45, -10)],
        ]),
        input: new Map([
          ['sleeve', 0],
          ['strip', 1],
        ]),
        bbox: boxOf([
          [0, -10],
          [100, 110],
        ]),
        layers: [[0, 1]],
      };
      const markup = renderToStaticMarkup(
        <StepPictureSvg
          w={140}
          h={120}
          pad={4}
          look={look}
          layout={partialLayout}
          layers={['sleeve', 'strip']}
          geoms={partialGeoms}
        />,
      );

      expect(markup.match(/data-piece-outline="sleeve"/g)?.length).toBeGreaterThan(0);
      expect(markup.match(/data-piece-hidden="sleeve"/g)?.length).toBeGreaterThan(0);
      expect(markup).toMatch(/stroke="var\(--color-borderColor\)"[^>]*data-piece-outline="sleeve"/);
    },
  );

  it('gives left and right pockets one tone per level in every flag combination', () => {
    const sewn = new Map([
      ['front', rectangle('front', 'front', 300, 100)],
      ['bagL', rectangle('bagL', 'bag', 60, 60)],
      ['bagR', rectangle('bagR', 'bag', 60, 60)],
      ['facingL', rectangle('facingL', 'facing', 40, 30)],
      ['facingR', rectangle('facingR', 'facing', 40, 30)],
    ]);
    const sewnLayout: StepLayout = {
      ...layout,
      T: new Map([
        ['front', IDENTITY],
        ['bagL', translate(20, 20)],
        ['bagR', translate(220, 20)],
        ['facingL', translate(30, 30)],
        ['facingR', translate(230, 30)],
      ]),
      input: new Map([
        ['front', 0],
        ['bagL', 1],
        ['bagR', 1],
        ['facingL', 2],
        ['facingR', 2],
      ]),
      bbox: boxOf([
        [0, 0],
        [300, 100],
      ]),
      layers: [],
    };
    const orders: [string[], [string, string][]][] = [
      [['front', 'bagL', 'bagR', 'facingL', 'facingR'], []],
      [
        ['front', 'bagL', 'bagR', 'facingL', 'facingR'],
        [
          ['front', 'bagL'],
          ['bagL', 'facingL'],
        ],
      ],
      [
        ['bagL', 'bagR', 'front', 'facingL', 'facingR'],
        [
          ['bagR', 'front'],
          ['front', 'facingR'],
        ],
      ],
      [['bagL', 'facingL', 'front', 'bagR', 'facingR'], [['bagL', 'front']]],
      [['facingL', 'bagL', 'bagR', 'facingR', 'front'], [['facingL', 'bagL']]],
    ];
    const looks = ['canvas', 'tile', 'print'] as const;
    for (const look of looks) {
      const pictures = orders.map(([order, stacked]) =>
        renderToStaticMarkup(
          <StepPictureSvg
            w={300}
            h={100}
            pad={0}
            look={look}
            layout={sewnLayout}
            layers={order}
            stacked={stacked}
            geoms={sewn}
          />,
        ),
      );
      for (const markup of pictures) {
        expect(fillOf(markup, 'front')).toBe(levelFill(0));
        expect(fillOf(markup, 'bagL')).toBe(levelFill(1));
        expect(fillOf(markup, 'bagR')).toBe(levelFill(1));
        expect(fillOf(markup, 'facingL')).toBe(levelFill(2));
        expect(fillOf(markup, 'facingR')).toBe(levelFill(2));
      }
      // Each order drew its own line work; a flag on the same order changes nothing.
      expect(new Set(pictures).size).toBe(new Set(orders.map(([order]) => order.join())).size);
    }
  });

  it('tones and dashes an unflagged overlap, seam allowance excluded', () => {
    const upper = rectangle('upper', 'upper front', 100, 100);
    const front = rectangle('front', 'front', 100, 100);
    const liveGeoms = new Map([
      ['front', front],
      ['upper', upper],
    ]);
    const liveLayout = (overlap: number): StepLayout => ({
      ...layout,
      T: new Map([
        ['front', translate(0, 100 - overlap)],
        ['upper', IDENTITY],
      ]),
      input: new Map([
        ['front', 0],
        ['upper', 1],
      ]),
      bbox: boxOf([
        [0, 0],
        [100, 200 - overlap],
      ]),
      layers: [[0, 1]],
    });
    const render = (overlap: number) =>
      renderToStaticMarkup(
        <StepPictureSvg
          w={140}
          h={200}
          pad={4}
          look='canvas'
          layout={liveLayout(overlap)}
          layers={['upper', 'front']}
          stacked={[]}
          geoms={liveGeoms}
        />,
      );

    expect(render(40)).toContain('data-piece-hidden="upper"');
    expect(fillOf(render(40), 'upper')).not.toBe(fillOf(render(40), 'front'));
    expect(render(10)).not.toContain('data-piece-hidden=');
    expect(fillOf(render(10), 'upper')).toBe(fillOf(render(10), 'front'));
  });

  it('paints in the order of the layers, the colour stays the level', () => {
    const sleeve = rectangle('sleeve', 'sleeve', 100, 100);
    const strip = rectangle('strip', 'strip', 10, 120);
    const liveGeoms = new Map([
      ['sleeve', sleeve],
      ['strip', strip],
    ]);
    const liveLayout: StepLayout = {
      ...layout,
      T: new Map([
        ['sleeve', IDENTITY],
        ['strip', translate(45, -10)],
      ]),
      input: new Map([
        ['sleeve', 0],
        ['strip', 1],
      ]),
      bbox: boxOf([
        [0, -10],
        [100, 110],
      ]),
      layers: [[0, 1]],
    };
    const render = (layers: readonly string[]) =>
      renderToStaticMarkup(
        <StepPictureSvg
          w={140}
          h={200}
          pad={4}
          look='canvas'
          layout={liveLayout}
          layers={layers}
          geoms={liveGeoms}
        />,
      );
    const paintsFirst = (markup: string) =>
      markup.indexOf(surfaceTag(markup, 'sleeve')) < markup.indexOf(surfaceTag(markup, 'strip'))
        ? 'sleeve'
        : 'strip';

    const under = render(['strip', 'sleeve']);
    const over = render(['sleeve', 'strip']);
    expect(paintsFirst(under)).toBe('strip');
    expect(paintsFirst(over)).toBe('sleeve');
    // The colour stays the level's either way.
    expect(fillOf(under, 'strip')).toBe(levelFill(1));
    expect(fillOf(over, 'strip')).toBe(levelFill(1));
  });

  it('cuts the graph glyph by the same rule', () => {
    const sleeve = rectangle('sleeve', 'sleeve', 100, 100);
    const strip = rectangle('strip', 'strip', 10, 120);
    const picture = unionPictureOfLayout(
      {
        T: new Map([
          ['sleeve', IDENTITY],
          ['strip', translate(45, -10)],
        ]),
        stacked: [],
        onRuns: [],
      },
      new Map([
        ['sleeve', sleeve],
        ['strip', strip],
      ]),
      ['sleeve', 'strip'],
    );
    const markup = renderToStaticMarkup(<UnitGlyph picture={picture} name='sleeve unit' />);

    expect(picture.lowerLayers).toEqual(['sleeve']);
    expect(picture.levels).toEqual({ sleeve: 0, strip: 1 });
    expect(picture.lowerLayerRuns?.sleeve.hidden.length).toBeGreaterThan(0);
    expect(picture.lowerLayerRuns?.sleeve.visible.length).toBeGreaterThan(0);
    expect(markup).toMatch(/stroke-dasharray="3 2"[^>]*data-lower-layer-hidden="sleeve"/);
    expect(markup).toMatch(/fill="var\(--color-bgColor\)"[^>]*data-lower-layer-base="sleeve"/);
    expect(markup).toContain(`fill="${levelFill(1)}"`);
    // Lowest level first, so the strip's colour lies over the sleeve's.
    expect(markup.indexOf(`fill="${levelFill(1)}"`)).toBeGreaterThan(
      markup.indexOf('data-lower-layer-base="sleeve"'),
    );
    // The other way round the glyph follows the layers; the strip keeps its colour.
    const flipped = unionPictureOfLayout(
      {
        T: new Map([
          ['sleeve', IDENTITY],
          ['strip', translate(45, -10)],
        ]),
        stacked: [],
        onRuns: [],
      },
      new Map([
        ['sleeve', sleeve],
        ['strip', strip],
      ]),
      ['strip', 'sleeve'],
    );
    const flippedMarkup = renderToStaticMarkup(<UnitGlyph picture={flipped} name='sleeve unit' />);
    expect(flipped.levels).toEqual({ sleeve: 0, strip: 1 });
    expect(flippedMarkup.indexOf(`fill="${levelFill(1)}"`)).toBeLessThan(
      flippedMarkup.indexOf(`fill="${levelFill(0)}"`),
    );
  });

  it('gives the graph glyph no levels when pieces only share seam allowance', () => {
    const left = rectangle('left', 'left', 100, 100);
    const right = rectangle('right', 'right', 100, 100);
    const picture = unionPictureOfLayout(
      {
        T: new Map([
          ['left', IDENTITY],
          ['right', translate(90, 0)],
        ]),
        stacked: [],
        onRuns: [],
      },
      new Map([
        ['left', left],
        ['right', right],
      ]),
      ['left', 'right'],
    );

    expect(picture.lowerLayers).toBeUndefined();
    expect(picture.levels).toBeUndefined();
  });

  it('gives two pieces of one block one tone, under or over another block', () => {
    const blockGeoms = new Map([
      ['panel', rectangle('panel', 'panel', 300, 200)],
      ['left', rectangle('left', 'left', 100, 60)],
      ['right', rectangle('right', 'right', 100, 60)],
    ]);
    const blockLayout: StepLayout = {
      ...layout,
      T: new Map([
        ['panel', IDENTITY],
        ['left', translate(20, 140)],
        ['right', translate(115, 140)],
      ]),
      input: new Map([
        ['panel', 0],
        ['left', 1],
        ['right', 1],
      ]),
      bbox: boxOf([
        [0, 0],
        [300, 200],
      ]),
      layers: [[0, 1]],
    };
    const looks = ['canvas', 'tile', 'print'] as const;
    for (const look of looks) {
      const svgs = [
        ['panel', 'left', 'right'],
        ['left', 'right', 'panel'],
      ].map((order) => {
        const markup = renderToStaticMarkup(
          <StepPictureSvg
            w={300}
            h={200}
            pad={0}
            look={look}
            layout={blockLayout}
            layers={order}
            geoms={blockGeoms}
          />,
        );
        expect(fillOf(markup, 'panel')).toBe(levelFill(0));
        expect(fillOf(markup, 'left')).toBe(levelFill(1));
        expect(fillOf(markup, 'right')).toBe(levelFill(1));
        return markup;
      });
      expect(svgs[0]).not.toBe(svgs[1]);
    }
  });

  it('keeps a level inside a sewn block: the pocket on its panel keeps its tone', () => {
    const sewn = new Map([
      ['front', rectangle('front', 'front', 100, 100)],
      ['bag', rectangle('bag', 'bag', 70, 70)],
    ]);
    const sewnLayout: StepLayout = {
      ...layout,
      input: new Map([
        ['front', 0],
        ['bag', 0],
      ]),
    };
    const draw = (order: string[]) =>
      renderToStaticMarkup(
        <StepPictureSvg
          w={120}
          h={100}
          pad={4}
          look='canvas'
          layout={sewnLayout}
          layers={order}
          geoms={sewn}
        />,
      );
    const bagOnTop = draw(['front', 'bag']);
    const frontOnTop = draw(['bag', 'front']);

    for (const markup of [bagOnTop, frontOnTop]) {
      expect(fillOf(markup, 'front')).toBe(levelFill(0));
      expect(fillOf(markup, 'bag')).toBe(levelFill(1));
    }
    expect(bagOnTop).toContain('data-piece-outline="bag"');
    expect(bagOnTop).not.toContain('data-piece-hidden');
    expect(frontOnTop).toContain('data-piece-hidden="bag"');
    expect(frontOnTop).not.toContain('data-piece-outline="bag"');
  });

  it('marks a picked edge above the surfaces', () => {
    // One input carried as a block: no input partner to borrow a host from.
    const markup = renderPicture({
      layers: ['bag', 'front'],
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
    expect(mark).toBeGreaterThan(markup.indexOf('data-piece-surface="bag"'));
  });

  it('draws seam side 1 black and thicker with its piece shaded, side 2 blue', () => {
    const tagOf = (markup: string, attribute: string) => {
      const at = markup.indexOf(attribute);
      return markup.slice(markup.lastIndexOf('<path', at), markup.indexOf('/>', at));
    };
    const first = renderPicture({ look: 'canvas', marks: [{ id: 'bag#0', tone: 'pickFirst' }] });
    const second = renderPicture({ look: 'canvas', marks: [{ id: 'bag#0', tone: 'pick' }] });

    expect(tagOf(first, 'data-seam-mark="pickFirst"')).toContain('stroke="var(--color-textColor)"');
    expect(tagOf(first, 'data-seam-mark="pickFirst"')).toContain('stroke-width="4.5"');
    expect(first).toContain('data-seam-side-fill="bag"');
    expect(tagOf(second, 'data-seam-mark="pick"')).toContain('stroke="var(--color-warning)"');
    expect(second).not.toContain('data-seam-side-fill');
  });

  it('offers no door for an edge sewn under a piece of the same unit', () => {
    const square = (x: number, size: number): Pt2[] => [
      [x, 0],
      [x + size, 0],
      [x + size, size],
      [x, size],
    ];
    const doors = [
      {
        id: 'bag#0',
        points: [
          [10, 10],
          [20, 10],
        ] as Pt2[],
      },
      {
        id: 'bag#1',
        points: [
          [10, 10],
          [150, 10],
        ] as Pt2[],
      },
      {
        id: 'front#0',
        points: [
          [0, 0],
          [100, 0],
        ] as Pt2[],
      },
    ];
    const coveredBy = (key: string) => (key === 'bag' ? ['front'] : []);
    const inUnit = [
      { key: 'bag', ring: square(5, 50), input: 0 },
      { key: 'front', ring: square(0, 100), input: 0 },
    ];
    const beingSewn = [inUnit[0], { ...inUnit[1], input: 1 }];

    expect(withoutCoveredDoors(doors, inUnit, coveredBy).map((door) => door.id)).toEqual([
      'bag#1',
      'front#0',
    ]);
    expect(
      withoutCoveredDoors(doors, inUnit, coveredBy, new Set(doors.map((door) => door.id))),
    ).toHaveLength(3);
    expect(withoutCoveredDoors(doors, beingSewn, coveredBy)).toHaveLength(3);
  });

  it('keeps a picked edge visible while the step highlight is on', () => {
    const none = renderPicture({
      look: 'canvas',
      stepEdges: [],
      marks: [{ id: 'bag#0', tone: 'pick' }],
    });
    const worked = renderPicture({
      look: 'canvas',
      stepEdges: ['bag#0'],
      marks: [{ id: 'bag#0', tone: 'pick' }],
    });

    expect(none).toMatch(/stroke="var\(--color-warning\)"[^>]*data-seam-mark="pick"/);
    expect(none).not.toContain('data-step-no-seams=""');
    expect(worked).toMatch(/stroke="var\(--color-warning\)"[^>]*data-seam-mark="pick"/);
    expect(worked).not.toContain('data-step-seam-edge="bag#0"');
  });

  it('does not grey an edge-to-edge pair: seam allowance never counts', () => {
    const beside = new Map([
      ['bag', bag],
      ['front', rectangle('front', 'front', 100, 100)],
    ]);
    const besideLayout = {
      ...layout,
      T: new Map([
        ['bag', IDENTITY],
        ['front', translate(85, 0)],
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
        stacked={[]}
        geoms={beside}
      />,
    );

    expect(fillOf(markup, 'bag')).toBe(levelFill(0));
    expect(fillOf(markup, 'front')).toBe(levelFill(0));
    expect(markup).not.toContain('data-piece-hidden=');
  });

  it('hides a covered button under the piece above it', () => {
    const markup = renderPicture({
      layers: ['bag', 'front'],
      stacked: [['bag', 'front']],
      look: 'canvas',
      actionGlyphs: [
        { id: 'covered-button', piece: 'bag', kind: 'button', point: [30, 30], sizeMm: 15 },
      ],
    });

    expect(markup).not.toContain('data-asm-mark="button"');
  });

  it('keeps a claimed coincident twin at zero offset, its hidden contour dashed', () => {
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
        stacked={[['lining', 'shell']]}
        geoms={twinGeoms}
        names={['lining', 'shell']}
      />,
    );
    const surfacePath = (piece: string) => {
      const tag = markup.match(new RegExp(`<path[^>]*data-piece-surface="${piece}"[^>]*>`))?.[0];
      return tag?.match(/ d="([^"]+)"/)?.[1];
    };
    const hidden = markup.match(/<path[^>]*data-piece-hidden="lining"[^>]*>/)?.[0];

    expect(surfacePath('lining')).toBe(surfacePath('shell'));
    expect(hidden).toContain('stroke-dasharray=');
    // The top contour comes after it and lies on the same line: solid wins.
    expect(markup.indexOf('data-piece-hidden="lining"')).toBeLessThan(
      markup.indexOf('data-piece-outline="shell"'),
    );
    expect(markup).toContain('data-stacked-name-leader="lining"');
  });

  it('draws a rowless picture from the order it is given, with no dashes on a seam', () => {
    expect(renderPicture()).not.toContain('data-lower-layer-region');
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
      lowerLayerRuns: { bag: { visible: [bag.rs], hidden: [], lines: [] } },
      twinLabels: { bag: 2 },
    };
    const graph = renderToStaticMarkup(<UnitGlyph picture={picture} name='bag' />);
    const graphLabel = graph.match(/<text[^>]*data-twin-number="2"[^>]*>/)?.[0];

    expect(graphLabel).toContain('font-size="10"');
    expect(graphLabel).toContain('paint-order="stroke"');
    expect(graph).toContain('<svg xmlns="http://www.w3.org/2000/svg" width="100%" height="100%"');
  });
});

describe('the back pocket and the two back tops sewn on it', () => {
  // The world rings of that step of the owner's card, in mm, thinned to 24 points.
  const pocketRing: Pt2[] = [
    [80, 0],
    [117, 3],
    [154, 7],
    [191, 15],
    [228, 36],
    [247, 67],
    [253, 105],
    [247, 143],
    [242, 181],
    [236, 218],
    [219, 252],
    [186, 253],
    [149, 247],
    [110, 243],
    [75, 240],
    [37, 238],
    [8, 227],
    [4, 190],
    [2, 154],
    [1, 118],
    [0, 80],
    [10, 39],
    [27, 16],
    [55, 3],
  ];
  const rightRing: Pt2[] = [
    [126, 167],
    [123, 184],
    [121, 201],
    [119, 218],
    [117, 235],
    [112, 247],
    [94, 243],
    [77, 240],
    [60, 236],
    [42, 233],
    [25, 230],
    [7, 227],
    [5, 212],
    [5, 196],
    [5, 179],
    [6, 163],
    [7, 147],
    [23, 149],
    [40, 152],
    [56, 155],
    [73, 158],
    [90, 161],
    [107, 164],
    [124, 167],
  ];
  const leftRing: Pt2[] = [
    [124, 167],
    [140, 169],
    [156, 171],
    [172, 173],
    [187, 175],
    [203, 178],
    [220, 180],
    [236, 183],
    [238, 196],
    [235, 212],
    [232, 227],
    [225, 241],
    [217, 256],
    [204, 259],
    [187, 257],
    [171, 254],
    [155, 252],
    [140, 250],
    [124, 248],
    [121, 236],
    [121, 220],
    [121, 204],
    [120, 188],
    [120, 172],
  ];
  const piece = (key: string, rs: Pt2[]) =>
    ({ ...rectangle(key, key, 1, 1), rs, corners: [], rect: false }) as PieceGeom;
  const backGeoms = new Map([
    ['pocket', piece('pocket', pocketRing)],
    ['right', piece('right', rightRing)],
    ['left', piece('left', leftRing)],
  ]);
  const backLayout: StepLayout = {
    ...layout,
    T: new Map([
      ['pocket', IDENTITY],
      ['right', IDENTITY],
      ['left', IDENTITY],
    ]),
    input: new Map([
      ['pocket', 0],
      ['right', 1],
      ['left', 1],
    ]),
    bbox: boxOf([...pocketRing, ...rightRing, ...leftRing]),
    layers: [[0, 1]],
  };
  const over = ['pocket', 'right', 'left'];
  const under = ['right', 'left', 'pocket'];
  const draw = (order: string[], look: 'canvas' | 'tile' | 'print') =>
    renderToStaticMarkup(
      <StepPictureSvg
        w={300}
        h={300}
        pad={4}
        look={look}
        layout={backLayout}
        layers={order}
        geoms={backGeoms}
      />,
    );

  it.each(['canvas', 'tile', 'print'] as const)(
    'paints both tops one colour in both orders in the %s renderer',
    (look) => {
      const pictures = [over, under].map((order) => draw(order, look));
      for (const markup of pictures) {
        expect(fillOf(markup, 'pocket')).toBe(levelFill(0));
        expect(fillOf(markup, 'right')).toBe(levelFill(1));
        expect(fillOf(markup, 'left')).toBe(levelFill(1));
      }
      expect(pictures[0]).not.toBe(pictures[1]);
      // Under the pocket the tops are the dashed ones; over it, the pocket is.
      expect(pictures[0]).not.toContain('data-piece-hidden="right"');
      expect(pictures[1]).toContain('data-piece-hidden="right"');
      expect(pictures[1]).toContain('data-piece-hidden="left"');
    },
  );

  it('keeps one colour on the unit pictogram too', () => {
    for (const order of [over, under]) {
      const picture = unionPictureOfLayout(
        { T: backLayout.T, stacked: [], onRuns: [] },
        backGeoms,
        order,
      );
      expect(picture.levels).toEqual({ pocket: 0, right: 1, left: 1 });
    }
  });

  describe('when the tops only collide with the pocket', () => {
    const colliding: [string, string][] = [
      ['pocket', 'right'],
      ['pocket', 'left'],
    ];

    it.each(['canvas', 'tile', 'print'] as const)(
      'no piece goes grey or dashed in the %s renderer, in either order',
      (look) => {
        for (const order of [over, under]) {
          const markup = renderToStaticMarkup(
            <StepPictureSvg
              w={300}
              h={300}
              pad={4}
              look={look}
              layout={{ ...backLayout, colliding }}
              layers={order}
              geoms={backGeoms}
            />,
          );
          for (const key of over) {
            expect(fillOf(markup, key)).toBe(levelFill(0));
            expect(markup).not.toContain(`data-piece-hidden="${key}"`);
          }
        }
      },
    );

    it('the unit pictogram reads the same test', () => {
      for (const order of [over, under]) {
        const picture = unionPictureOfLayout(
          { T: backLayout.T, stacked: [], onRuns: [], colliding },
          backGeoms,
          order,
        );
        expect(picture.levels ?? {}).not.toHaveProperty('right', 1);
        expect(picture.lowerLayerRuns).toBeUndefined();
      }
    });
  });
});

describe('StepPictureSvg step highlight', () => {
  const edgeTag = (markup: string) =>
    markup.match(/<path[^>]*data-step-seam-edge="bag#0"[^>]*>/)?.[0] ?? '';

  it('draws the exact edge blue on screen and black in print at 1.26× outline width', () => {
    const screen = renderPicture({ look: 'canvas', stepEdges: ['bag#0'] });
    const print = renderPicture({ look: 'print', stepEdges: ['bag#0'] });

    expect(edgeTag(screen)).toContain('stroke="var(--color-highlightColor)"');
    expect(edgeTag(screen)).toContain('stroke-width="4.032"');
    expect(edgeTag(print)).toContain('stroke="var(--color-textColor)"');
    expect(edgeTag(print)).toContain('stroke-width="2.205"');
    expect(screen).toContain('stroke="var(--color-borderColor)" stroke-width="3.2"');
  });

  // A seam that leaves an edge for a pocket and returns to it: two stretches, one edge id.
  it('draws both stretches of one edge and keys each drawn line apart', () => {
    const stepParts = [
      { target: 'bag#0', range: [0, 20] as const },
      { target: 'bag#0', range: [50, 70] as const },
    ];
    const markup = renderPicture({ look: 'tile', stepEdges: ['bag#0'], stepParts });

    expect(markup.match(/data-step-seam-edge="bag#0"/g)).toHaveLength(2);
    const keys = stepParts.map(stepLineKey);
    expect(new Set(keys).size).toBe(keys.length);
    // Even the same stretch listed twice must not collide.
    expect(stepLineKey(stepParts[0], 0)).not.toBe(stepLineKey(stepParts[0], 1));
  });

  it('marks a known rowless picture without highlighting an edge or printing a length', () => {
    const markup = renderPicture({ look: 'canvas', stepEdges: [] });
    const print = renderPicture({ look: 'print', stepEdges: [], noSeamText: 'no seam' });

    expect(markup).not.toContain('data-step-seam-edge=');
    expect(markup).toContain('data-step-no-seams=""');
    expect(markup).toContain('>no seam</text>');
    expect(markup).not.toMatch(/>[^<]*\bmm\b/i);
    expect(print).toContain('data-step-no-seams=""');
    expect(print).toContain('>no seam</text>');
  });
});

describe('stepActionMarks stored span', () => {
  const tall = {
    ...rectangle('tall', 'tall', 100, 200),
    edges: [{ id: 'tall#0', k: 0, pts: [[0, 0] as Pt2, [0, 200] as Pt2], len: 200 }],
  } as unknown as PieceGeom;
  const geoms = new Map([['tall', tall]]);
  const span = { target: 'tall#0', range: [0, 50] as const };
  const reach = (points: readonly Pt2[]) => {
    const ys = points.map((point) => point[1]);
    return Math.max(...ys) - Math.min(...ys);
  };

  it.each([
    ['topstitch', { operationType: 'topstitch', work: 'Topstitch' }],
    ['press', { work: 'press_open' }],
  ])('%s line stops where the stored span stops', (_kind, op) => {
    const ranged = stepActionMarks(op as never, [span], geoms, new Map());
    const whole = stepActionMarks(op as never, [{ target: 'tall#0' }], geoms, new Map());

    expect(reach(ranged.lines[0].points)).toBeLessThan(55);
    expect(reach(whole.lines[0].points)).toBeGreaterThan(190);
  });

  it('uses explicit line parts and draws every row before seam-derived marks', () => {
    const explicit = stepActionMarks(
      {
        operationNumber: 10,
        operationType: 'TECH_CARD_OPERATION_TYPE_MACHINE',
        machineType: 'TECH_CARD_MACHINE_TYPE_LOCKSTITCH',
        topstitchMode: 'TECH_CARD_TOPSTITCH_MODE_EDGE',
        topstitchWidthMm: '2',
        topstitchLines: [
          {
            lineKey: 'line-a',
            bomLineKey: 'thread-a',
            anchoredSize: 'M',
            rows: 2,
            sizes: [],
            parts: [
              {
                piece: 'tall',
                samples: [],
                perimShare: 1,
                lenMm: 200,
                notches: 0,
                turnDeg: 0,
                range: [0, 0.5],
                edgeHint: 'tall#0',
                contourSig: 'shape',
              },
            ],
          },
        ],
      } as never,
      [{ target: 'tall#0', range: [150, 200] }],
      geoms,
      new Map(),
    );

    expect(explicit.lines).toHaveLength(2);
    expect(explicit.lines.every((line) => line.dashed && line.kind === 'topstitch')).toBe(true);
    expect(explicit.lines.every((line) => reach(line.points) < 105)).toBe(true);
    expect(explicit.lines[0].points).not.toEqual(explicit.lines[1].points);
  });
});

describe('StepPictureSvg topstitch lines', () => {
  const line = {
    id: 'line-a:0:0:topstitch',
    piece: 'bag',
    target: 'bag#0',
    points: [
      [2, 2],
      [68, 2],
    ] as Pt2[],
    weight: 'ink' as const,
    dashed: true,
    kind: 'topstitch',
  };
  const render = (look: 'canvas' | 'result' | 'tile' | 'print', activeNo?: number) =>
    renderToStaticMarkup(
      <StepPictureSvg
        w={120}
        h={100}
        pad={4}
        look={look}
        layout={layout}
        geoms={geoms}
        stepEdges={[]}
        stepParts={[]}
        seamless
        actionLines={[line]}
        nos={[{ id: 'bag#0', i: 0 }]}
        activeNo={activeNo}
      />,
    );
  const tagOf = (markup: string) =>
    markup.match(/<path[^>]*data-asm-mark="topstitch"[^>]*>/)?.[0] ?? '';
  const strokeOf = (markup: string) => tagOf(markup).match(/ stroke="([^"]+)"/)?.[1];

  it.each(['canvas', 'result', 'tile'] as const)(
    'draws a stored line dashed in the highlight ink on the %s',
    (look) => {
      const markup = render(look);
      expect(strokeOf(markup)).toBe('var(--color-highlightColor)');
      expect(tagOf(markup)).toContain('stroke-dasharray="5 3"');
    },
  );

  it('keeps print in ink', () => {
    expect(strokeOf(render('print'))).toBe('var(--color-textColor)');
  });

  it('numbers a line on the canvas, filled while active, never on a tile', () => {
    const idle = render('canvas');
    const active = render('canvas', 0);
    const box = (markup: string) =>
      markup.match(/<g data-pair-no="1"><rect[^>]*>/)?.[0].match(/ fill="([^"]+)"/)?.[1];

    expect(idle).toContain('data-pair-no="1"');
    expect(box(idle)).not.toBe('var(--color-textColor)');
    expect(box(active)).toBe('var(--color-textColor)');
    expect(render('tile')).not.toContain('data-pair-no=');
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
    expect(tag(canvas)).toContain('stroke="var(--color-highlightColor)"');
    expect(tag(canvas)).toContain('stroke-width="3"');
    expect(tag(pdf)).toContain('stroke="var(--color-textColor)"');
    expect(tag(pdf)).toContain('stroke-width="3"');
  });

  it('keeps eight narrow-host buttons on eight distinct marks', () => {
    const markup = renderNarrow(marks('button'));
    const centres = [
      ...markup.matchAll(/data-asm-mark="button"[^>]*data-asm-x="([^"]+)" data-asm-y="([^"]+)"/g),
    ];

    expect(centres).toHaveLength(8);
    expect(new Set(centres.map((match) => `${match[1]}:${match[2]}`)).size).toBe(8);
  });

  it('keeps an edge button on its mark and caps it at ninety percent of the narrow host', () => {
    const point: Pt2 = [10, 50];
    const markup = renderNarrow([{ ...marks('button')[0], point, direction: [1, 0], sizeMm: 11 }]);
    const tag = markup.match(/<g[^>]*data-asm-mark="button"[^>]*>/)?.[0] ?? '';
    const attribute = (name: string) =>
      Number(tag.match(new RegExp(`${name}="([^"]+)"`))?.[1] ?? Number.NaN);
    const fit = fitBox(narrowLayout.bbox, 120, 140, 7);
    const left = toPx(fit, [0, point[1]]);
    const right = toPx(fit, [10, point[1]]);
    const mark = toPx(fit, point);
    const hostWidth = Math.abs(right[0] - left[0]);

    expect(attribute('data-asm-x')).toBeCloseTo(mark[0], 1);
    expect(attribute('data-asm-y')).toBeCloseTo(mark[1], 1);
    expect(attribute('data-asm-radius') * 2).toBeLessThanOrEqual(hostWidth * 0.9 + 1e-9);
  });

  it('keeps seven wide-host button centres on their collinear pattern marks within one millimetre', () => {
    const ring: Pt2[] = [
      [0, 0],
      [350, 0],
      [390, 35],
      [375, 220],
      [15, 220],
      [-20, 125],
    ];
    const wide = { ...rectangle('wide', 'wide front', 390, 220), rs: ring } as PieceGeom;
    const wideLayout: StepLayout = {
      ...narrowLayout,
      T: new Map([['wide', IDENTITY]]),
      input: new Map([['wide', 0]]),
      bbox: boxOf(ring),
    };
    const glyphs: PictureActionGlyph[] = Array.from({ length: 7 }, (_, index) => ({
      id: `wide-${index}`,
      piece: 'wide',
      kind: 'button',
      point: [273, 30 + index * 25],
      direction: [1, 0],
      sizeMm: 11,
    }));
    const markup = renderToStaticMarkup(
      <StepPictureSvg
        w={120}
        h={140}
        pad={4}
        look='print'
        layout={wideLayout}
        geoms={new Map([['wide', wide]])}
        actionGlyphs={glyphs}
      />,
    );
    const centres = [
      ...markup.matchAll(/data-asm-mark="button"[^>]*data-asm-x="([^"]+)" data-asm-y="([^"]+)"/g),
    ].map((match) => [Number(match[1]), Number(match[2])] as Pt2);
    const fit = fitBox(wideLayout.bbox, 120, 140, 7);

    expect(centres).toHaveLength(7);
    centres.forEach((centre, index) => {
      const expected = toPx(fit, glyphs[index].point);
      expect(
        Math.hypot(centre[0] - expected[0], centre[1] - expected[1]) / fit.s,
      ).toBeLessThanOrEqual(1);
    });
    expect(
      Math.max(...centres.map(([x]) => x)) - Math.min(...centres.map(([x]) => x)),
    ).toBeLessThan(fit.s);
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

  it('measures the host chord without moving the mark', () => {
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

    expect(chord?.at[0]).toBeCloseTo(0, 6);
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
    const three = buttonGlyphGeometry([20, 20], 8, 3, 'square');
    expect(three.holes).toHaveLength(3);
    expect(three.holes[0][0]).toBeCloseTo(20, 8);
    expect(three.holes[0][1]).toBeLessThan(three.holes[1][1]);
    expect(three.holes[1][1]).toBeCloseTo(three.holes[2][1], 8);
    expect(three.thread.match(/L/g)).toHaveLength(3);
    expect(buttonGlyphGeometry([20, 20], 8, 3, 'u_shape').thread.match(/L/g)).toHaveLength(2);
    expect(buttonGlyphGeometry([20, 20], 8, 3, 'other').thread).toBe('');
    const geometry = buttonGlyphGeometry([20, 20], 8, 2, 'cross_x');

    expect(geometry.holes).toHaveLength(2);
    expect(geometry.thread.match(/M/g)).toHaveLength(1);
  });
});

describe('StepPictureSvg drawn outline', () => {
  it('draws a layered outline thinned like its surface, closed by its first point again', () => {
    const n = 720;
    const rs = Array.from({ length: n }, (_, i): Pt2 => {
      const a = (2 * Math.PI * i) / n;
      return [50 + 50 * Math.cos(a), 50 + 50 * Math.sin(a)];
    });
    const disc = { ...rectangle('disc', 'disc', 100, 100), rs, corners: [] } as PieceGeom;
    const discLayout: StepLayout = {
      ...layout,
      T: new Map([['disc', IDENTITY]]),
      input: new Map([['disc', 0]]),
      bbox: boxOf(rs),
      clusters: [[0]],
      layers: [],
    };
    const markup = renderToStaticMarkup(
      <StepPictureSvg
        w={140}
        h={120}
        pad={4}
        look='print'
        layout={discLayout}
        layers={['disc']}
        geoms={new Map([['disc', disc]])}
      />,
    );
    const d = (tag: string) =>
      / d="([^"]*)"/.exec(
        markup.match(new RegExp(`<path[^>]*${tag}="disc"[^>]*>`))?.[0] ?? '',
      )?.[1] ?? '';
    const outline = d('data-piece-outline');
    const surface = d('data-piece-surface');
    const vertices = (s: string) => s.replace(/Z$/, '').split(/[ML]/).filter(Boolean);

    expect(drawnRing(rs).length).toBeLessThan(n / 10);
    expect(vertices(surface)).toHaveLength(drawnRing(rs).length);
    expect(surface.endsWith('Z')).toBe(true);
    expect(vertices(outline)).toEqual([...vertices(surface), vertices(surface)[0]]);
    expect(outline.endsWith('Z')).toBe(false);
  });

  it('thins a covered piece’s uncovered run to the same tolerance', () => {
    const n = 720;
    const rs = Array.from({ length: n }, (_, i): Pt2 => {
      const a = (2 * Math.PI * i) / n;
      return [50 + 50 * Math.cos(a), 50 + 50 * Math.sin(a)];
    });
    const disc = { ...rectangle('disc', 'disc', 100, 100), rs, corners: [] } as PieceGeom;
    const lid = rectangle('lid', 'lid', 100, 60);
    const coverLayout: StepLayout = {
      ...layout,
      T: new Map([
        ['disc', IDENTITY],
        ['lid', translate(0, 40)],
      ]),
      input: new Map([
        ['disc', 0],
        ['lid', 1],
      ]),
      bbox: boxOf(rs),
      layers: [[0, 1]],
    };
    const markup = renderToStaticMarkup(
      <StepPictureSvg
        w={140}
        h={120}
        pad={4}
        look='print'
        layout={coverLayout}
        layers={['disc', 'lid']}
        stacked={[['disc', 'lid']]}
        geoms={
          new Map([
            ['disc', disc],
            ['lid', lid],
          ])
        }
      />,
    );
    const runs = [...markup.matchAll(/<path[^>]*data-piece-outline="disc"[^>]*>/g)].map(
      (m) => / d="([^"]*)"/.exec(m[0])?.[1] ?? '',
    );
    const vertices = runs.map((run) => run.split(/[ML]/).filter(Boolean).length);

    expect(runs.length).toBeGreaterThan(0);
    // the uncovered arc is under half the disc: a dense run of ~300 points, drawn with a few dozen
    expect(Math.max(...vertices)).toBeLessThan(60);
    expect(Math.min(...vertices)).toBeGreaterThan(2);
  });
});
