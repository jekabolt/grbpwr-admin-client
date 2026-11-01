import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';

import type { Pt2 } from 'lib/assembly-skeleton/types';
import { pieceTilt } from 'lib/assembly-skeleton/union';
import { apply } from 'lib/assembly-skeleton/union/affine';
import { toWire } from 'lib/seams';

import { seamGraphOfCard, seamRowsOfCard } from '../components/card-seam-graph';
import {
  focusedStepLeaves,
  STEP_TILE_EXPLODE,
  STEP_TILE_RASTER_MM,
  StepPictureSvg,
  stepPictureOfOp,
  type SceneOp,
} from '../components/step-seams/step-picture-view';
import type { FormOpLike } from '../components/step-seams/step-seams-model';
import { boxOf, fitBox, stepLayout, toPx } from '../components/step-seams/step-picture';
import {
  CARD6_CHAIN_OPS,
  CARD6_CHAIN_POSES,
  CARD6_CHAIN_SEAMS,
  card6ChainGeoms,
  card6ChainInnerLines,
} from '../components/step-seams/card6-chain.fixture';
import { CARD6_SEAMS, card6Geoms, card6InnerLines } from '../components/step-seams/card6.fixture';
import { OWNER_FIT, stepResults } from '../components/step-seams/step-result';
import {
  card83RealFixture,
  card83StoredSeamsFixture,
  card85StoredSeamFixture,
} from './assembly-inference.fixture';
import { card85RealFixture, card85RealFixtureAvailable } from './assembly-card85-real.fixture';
import { asmProtoFlags, setAsmProtoFlags } from './asm-proto-flags';
import { deriveAssembly, type AsmPiece, type AssemblyInput } from './derive-assembly';
import {
  AssemblyPage,
  editorActionMarks,
  editorOperationPictures,
  editorPictureClusters,
} from './pages/assembly';

function sceneOf(input: AssemblyInput, operationNumber: number) {
  const graph = seamGraphOfCard(input.techCard, input.pieces);
  const geoms = new Map([...input.pieces].map(([key, piece]) => [key, piece.geom]));
  const innerLines = new Map<string, Pt2[][]>(
    [...input.pieces].map(([key, piece]) => [
      key,
      piece.inner.map((line) => line.map(([x, y]) => [x, -y] as Pt2)),
    ]),
  );
  const pieceKeys = new Set([
    ...geoms.keys(),
    ...(input.techCard.techCard?.pieces ?? []).flatMap((piece) =>
      piece.lineKey ? [piece.lineKey] : [],
    ),
  ]);
  const operations: SceneOp[] = (input.techCard.techCard?.operations ?? []).map((operation) => ({
    operationNumber: operation.operationNumber,
    operationType: operation.operationType,
    work: operation.work,
    inputKeys: operation.inputKeys ?? [],
    outputUnitKey: operation.outputUnitKey,
    outputUnitName: operation.outputUnitName,
    seamKeys: operation.seamKeys ?? [],
    fullnessRatio: operation.stitching?.fullnessRatio?.value,
  }));
  const index = operations.findIndex((operation) => operation.operationNumber === operationNumber);
  const op = operations[index];
  if (!op) throw new Error(`missing operation ${operationNumber}`);
  return stepPictureOfOp(op, graph, geoms, {
    operations,
    index,
    pieceKeys,
    innerLines,
    byKey: seamRowsOfCard(input.techCard),
    nameOf: (key) => input.pieces.get(key)?.name ?? key,
  });
}

const keyNamed = (input: AssemblyInput, name: string) =>
  [...input.pieces].find(([, piece]) => piece.name === name)?.[0] ?? '';

function expectSameAffines(
  actual: ReadonlyMap<string, readonly number[]>,
  expected: ReadonlyMap<string, readonly number[]>,
  label: string,
) {
  expect([...actual.keys()], label).toEqual([...expected.keys()]);
  for (const [key, affine] of actual) {
    const wanted = expected.get(key)!;
    affine.forEach((value, index) =>
      expect(value, `${label} · ${key} · affine ${index}`).toBeCloseTo(wanted[index], 6),
    );
  }
}

function expectSameRetainedAffines(
  actual: ReadonlyMap<string, readonly number[]>,
  expected: ReadonlyMap<string, readonly number[]>,
  label: string,
) {
  expect(actual.size, label).toBeGreaterThan(0);
  for (const [key, affine] of actual) {
    const wanted = expected.get(key);
    expect(wanted, `${label} · ${key}`).toBeDefined();
    affine.forEach((value, index) =>
      expect(value, `${label} · ${key} · affine ${index}`).toBeCloseTo(wanted![index], 6),
    );
  }
}

function joinedResult(input: AssemblyInput, operationNumber: number) {
  const picture = sceneOf(input, operationNumber);
  return {
    ...picture,
    marks: [],
    layoutLeaves: picture.leaves,
    layout: stepLayout(picture.leaves, picture.frameSeams, picture.geoms, {
      explode: 0,
      rasterMm: STEP_TILE_RASTER_MM,
    }),
  };
}

const renderedBox = (picture: ReturnType<typeof sceneOf>) => {
  const hidden = new Set([
    ...picture.layout.stacked.flatMap((group) => group.slice(1)),
    ...picture.layout.pieceLayers.map(([piece]) => piece),
  ]);
  const visible = [...picture.layout.T].filter(([key]) => !hidden.has(key));
  const fit = fitBox(
    boxOf(
      visible.flatMap(([key, affine]) =>
        (picture.geoms.get(key)?.rs ?? []).map((point) => apply(affine, point)),
      ),
    ),
    212,
    186,
    4,
  );
  return boxOf(
    visible.flatMap(([key, affine]) =>
      (picture.geoms.get(key)?.rs ?? []).map((point) => toPx(fit, apply(affine, point))),
    ),
  );
};

const expectReadableFit = (picture: ReturnType<typeof sceneOf>) => {
  const box = renderedBox(picture);
  expect((box.x1 - box.x0) / 212).toBeGreaterThanOrEqual(0.6);
  expect((box.y1 - box.y0) / 186).toBeGreaterThanOrEqual(0.6);
};

const renderedPicture = (
  picture: ReturnType<typeof sceneOf>,
  action: ReturnType<typeof editorActionMarks>,
) =>
  renderToStaticMarkup(
    <StepPictureSvg
      w={212}
      h={186}
      pad={4}
      look='print'
      layout={picture.layout}
      geoms={picture.geoms}
      innerLines={picture.innerLines}
      actionLines={action.lines}
      actionGlyphs={action.glyphs}
    />,
  );

function card83WithNonJoins(): AssemblyInput {
  const input = card83StoredSeamsFixture();
  const insert = input.techCard.techCard!;
  const operation = (value: object) =>
    value as unknown as NonNullable<typeof insert.operations>[number];
  return {
    ...input,
    techCard: {
      ...input.techCard,
      techCard: {
        ...insert,
        operations: [
          ...(insert.operations ?? []),
          operation({
            operationNumber: 410,
            operationType: 'TECH_CARD_OPERATION_TYPE_PRESS',
            work: 'press_final',
            inputKeys: ['shirt regular'],
          }),
          operation({
            operationNumber: 420,
            operationType: 'TECH_CARD_OPERATION_TYPE_MACHINE',
            work: 'topstitch',
            inputKeys: ['shirt regular'],
          }),
          operation({
            operationNumber: 430,
            operationType: 'TECH_CARD_OPERATION_TYPE_MACHINE',
            work: 'buttonhole',
            inputKeys: ['shirt regular'],
          }),
        ],
      },
    },
  };
}

const CARD6_ROWLESS_NUMBER = 20;
const CARD6_ROWLESS_INPUTS = ['SLV_L', 'FLP_L_MAIN'] as const;
const CARD6_ROWLESS_OPERATION: FormOpLike = {
  operationNumber: CARD6_ROWLESS_NUMBER,
  operationType: 'TECH_CARD_OPERATION_TYPE_PRESS',
  work: 'press_flat',
  inputKeys: CARD6_ROWLESS_INPUTS,
  seamKeys: [],
  poseKeys: [],
};
const CARD6_TEST_OPERATIONS = [
  ...CARD6_CHAIN_OPS.filter((operation) =>
    [30, 380, 430].includes(operation.operationNumber ?? -1),
  ),
  CARD6_ROWLESS_OPERATION,
].sort((left, right) => (left.operationNumber ?? 0) - (right.operationNumber ?? 0));
const CARD6_TEST_PIECES = new Set(['SLV_L', 'FLP_L', 'FLP_L_MAIN']);
const CARD6_TEST_SEAMS = new Map(
  [...CARD6_CHAIN_SEAMS].filter(([key]) =>
    CARD6_TEST_OPERATIONS.some((operation) => operation.seamKeys?.includes(key)),
  ),
);
const CARD6_TEST_POSES = new Map(
  [...CARD6_CHAIN_POSES].filter(([key]) =>
    CARD6_TEST_OPERATIONS.some((operation) => operation.poseKeys?.includes(key)),
  ),
);
const card6TestGeoms = () =>
  new Map([...card6ChainGeoms()].filter(([key]) => CARD6_TEST_PIECES.has(key)));
const card6TestInnerLines = () =>
  new Map([...card6ChainInnerLines()].filter(([key]) => CARD6_TEST_PIECES.has(key)));

function card6ChainInput(owned: boolean): AssemblyInput {
  const geoms = card6TestGeoms();
  const innerLines = card6TestInnerLines();
  const pieces = new Map<string, AsmPiece>(
    [...geoms].map(([key, geom]) => [
      key,
      {
        key,
        name: geom.name,
        code: geom.name,
        cut: geom.rs.map(([x, y]) => [x, -y] as Pt2),
        inner: (innerLines.get(key) ?? []).map((line) => line.map(([x, y]) => [x, -y] as Pt2)),
        notch: [],
        pocketing: false,
        area: Math.abs(geom.areaMm2),
        geom,
      },
    ]),
  );
  const operations = CARD6_TEST_OPERATIONS.map((operation) => ({
    operationNumber: operation.operationNumber,
    operationType: operation.operationType,
    work: operation.work,
    inputKeys: operation.inputKeys ?? [],
    outputUnitKey: operation.outputUnitKey,
    seamKeys: [...(operation.seamKeys ?? []), ...(operation.poseKeys ?? [])],
  }));
  const rows = owned
    ? [...CARD6_TEST_SEAMS.values(), ...CARD6_TEST_POSES.values()].map(toWire)
    : [];
  return {
    techCard: {
      id: 6,
      techCard: {
        pieces: [...pieces].map(([lineKey, piece]) => ({ lineKey, name: piece.name })),
        operations,
      },
      seams: rows,
    } as AssemblyInput['techCard'],
    pieces,
    grainDeg: new Map([...pieces.keys()].map((key) => [key, 0])),
  };
}

function card6ActionLineInput(owned: boolean): AssemblyInput {
  const keys = new Set(['SLV_R', 'FLP_R']);
  const geoms = new Map([...card6Geoms()].filter(([key]) => keys.has(key)));
  const innerLines = new Map([...card6InnerLines()].filter(([key]) => keys.has(key)));
  const pieces = new Map<string, AsmPiece>(
    [...geoms].map(([key, geom]) => [
      key,
      {
        key,
        name: geom.name,
        code: geom.name,
        cut: geom.rs.map(([x, y]) => [x, -y] as Pt2),
        inner: (innerLines.get(key) ?? []).map((line) => line.map(([x, y]) => [x, -y] as Pt2)),
        notch: [],
        pocketing: false,
        area: Math.abs(geom.areaMm2),
        geom,
      },
    ]),
  );
  return {
    techCard: {
      id: 6,
      techCard: {
        pieces: [...pieces].map(([lineKey, piece]) => ({ lineKey, name: piece.name })),
        operations: [
          {
            operationNumber: 90,
            operationType: 'TECH_CARD_OPERATION_TYPE_MACHINE',
            work: 'join_lockstitch',
            inputKeys: ['SLV_R', 'FLP_R'],
            outputUnitKey: 'SLEEVE-3',
            seamKeys: ['sleeve slit'],
          },
          {
            operationNumber: 100,
            operationType: 'TECH_CARD_OPERATION_TYPE_PRESS',
            work: 'press_to_one_side',
            inputKeys: ['SLEEVE-3'],
            press: { action: 'TECH_CARD_PRESS_ACTION_TO_ONE_SIDE' },
          },
        ],
      },
      seams: owned ? [toWire(CARD6_SEAMS.get('sleeve slit')!)] : [],
    } as AssemblyInput['techCard'],
    pieces,
    grainDeg: new Map([...pieces.keys()].map((key) => [key, 0])),
  };
}

function placementActionInput(kind: 'button' | 'buttonhole'): AssemblyInput {
  const source = card6Geoms().get('FLP_R')!;
  const box = boxOf(source.rs);
  const x = (box.x0 + box.x1) / 2;
  const marks = Array.from({ length: 8 }, (_, index) => {
    const y = box.y0 + ((index + 1) * (box.y1 - box.y0)) / 9;
    return {
      id: `FLP_R@${index}`,
      kind: kind === 'button' ? ('drill' as const) : ('buttonhole' as const),
      layer: 'mark',
      closed: kind === 'button',
      pts: [
        [x, y - 2],
        [x, y + 2],
      ] as Pt2[],
      bbox: { w: 0, h: 4, cx: x, cy: y },
      lenMm: 4,
    };
  });
  const geom = { ...source, marks };
  const piece: AsmPiece = {
    key: 'FLP_R',
    name: geom.name,
    code: geom.name,
    cut: geom.rs.map(([px, py]) => [px, -py] as Pt2),
    inner: [],
    notch: [],
    pocketing: false,
    area: Math.abs(geom.areaMm2),
    geom,
  };
  const button = kind === 'button';
  return {
    techCard: {
      id: 6,
      techCard: {
        pieces: [{ lineKey: piece.key, name: piece.name }],
        operations: [
          {
            operationNumber: button ? 860 : 750,
            operationType: 'TECH_CARD_OPERATION_TYPE_MACHINE',
            machineType: button
              ? 'TECH_CARD_MACHINE_TYPE_BUTTON_ATTACH'
              : 'TECH_CARD_MACHINE_TYPE_BUTTONHOLE',
            work: button ? 'button_attach' : 'buttonhole',
            inputKeys: [piece.key],
            placementLayout: { count: 8 },
            attachmentSizeMm: { value: '11' },
            fastening: button
              ? {
                  attachPattern: 'TECH_CARD_BUTTON_ATTACH_PATTERN_PARALLEL',
                  buttonHoles: 2,
                }
              : {
                  buttonholeOrientation: 'TECH_CARD_BUTTONHOLE_ORIENTATION_HORIZONTAL',
                  cutLengthMm: { value: '12' },
                },
          },
        ],
      },
      seams: [],
    } as unknown as AssemblyInput['techCard'],
    pieces: new Map([[piece.key, piece]]),
    grainDeg: new Map([[piece.key, 0]]),
  };
}

describe('editor operation picture in the PDF', () => {
  afterEach(() => {
    setAsmProtoFlags();
    vi.unstubAllGlobals();
  });

  it('uses editor pictures by default and keeps the legacy URL override', () => {
    expect(asmProtoFlags().pic).toBe('editor');
    vi.stubGlobal('window', { location: { search: '?pic=legacy' } });
    expect(asmProtoFlags().pic).toBe('legacy');
    vi.stubGlobal('window', { location: { search: '?pic=editor' } });
    expect(asmProtoFlags().pic).toBe('editor');
  });

  it('draws a rowless action along its producer surface row laid-part edge', () => {
    const input = card6ActionLineInput(true);
    const action = deriveAssembly(input).rows.find((row) => row.n === 100)?.action;
    const target = CARD6_SEAMS.get('sleeve slit')!.sideB[0].edgeHint;
    const expected = input.pieces.get('FLP_R')!.geom.edges.find((edge) => edge.id === target)!.pts;
    const marks = editorActionMarks(
      action,
      new Map([...input.pieces].map(([key, piece]) => [key, piece.geom])),
    );
    const edgeLine = marks.lines.find((line) => line.id.endsWith(':press-edge'));

    expect(action?.edgeParts.map((part) => part.piece)).toEqual(['FLP_R']);
    expect(edgeLine?.points).toEqual(expected);
    expect(edgeLine?.points.length).toBeGreaterThan(2);
  });

  it('draws no action line when neither the step nor its producers have owner rows', () => {
    const input = card6ActionLineInput(false);
    const action = deriveAssembly(input).rows.find((row) => row.n === 100)?.action;
    const marks = editorActionMarks(
      action,
      new Map([...input.pieces].map(([key, piece]) => [key, piece.geom])),
    );

    expect(action?.edgeParts).toEqual([]);
    expect(marks.lines).toEqual([]);
  });

  describe('press arrows on the owner seam', () => {
    const pressMarks = (raw: object) => {
      const input = card6ActionLineInput(true);
      const action = deriveAssembly(input).rows.find((row) => row.n === 100)?.action;
      const geoms = new Map([...input.pieces].map(([key, piece]) => [key, piece.geom]));
      return {
        geoms,
        marks: editorActionMarks(action && { ...action, raw: { ...action.raw, ...raw } }, geoms),
      };
    };
    const inside = (point: Pt2, ring: readonly Pt2[]) => {
      let hit = false;
      for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
        const [xi, yi] = ring[i];
        const [xj, yj] = ring[j];
        if (
          yi > point[1] !== yj > point[1] &&
          point[0] < ((xj - xi) * (point[1] - yi)) / (yj - yi) + xi
        )
          hit = !hit;
      }
      return hit;
    };
    const step = (glyph: { point: Pt2; direction?: Pt2 }, mm: number): Pt2 => [
      glyph.point[0] + (glyph.direction?.[0] ?? 0) * mm,
      glyph.point[1] + (glyph.direction?.[1] ?? 0) * mm,
    ];

    it('press to one side: one plain line and one arrow with the side word', () => {
      const { marks, geoms } = pressMarks({
        press: {
          action: 'TECH_CARD_PRESS_ACTION_TO_ONE_SIDE',
          toward: 'TECH_CARD_PRESS_TOWARD_BACK',
        },
      });
      expect(marks.lines).toHaveLength(1);
      expect(marks.lines[0]).toMatchObject({ weight: 'ink', kind: 'press-side', piece: 'FLP_R' });
      expect(marks.lines.some((line) => line.id.endsWith(':press-offset'))).toBe(false);
      const arrows = marks.glyphs.filter((glyph) => glyph.kind === 'press-arrow');
      expect(arrows).toHaveLength(1);
      expect(arrows[0].label).toBe('to back');
      // No back piece on this seam: the arrow goes into the run's own piece.
      expect(inside(step(arrows[0], 3), geoms.get('FLP_R')!.rs)).toBe(true);
    });

    it('press to one side toward the other piece points across the seam', () => {
      const { marks, geoms } = pressMarks({
        press: {
          action: 'TECH_CARD_PRESS_ACTION_TO_ONE_SIDE',
          toward: 'TECH_CARD_PRESS_TOWARD_SLEEVE',
        },
      });
      const [arrow] = marks.glyphs.filter((glyph) => glyph.kind === 'press-arrow');
      expect(arrow.label).toBe('into the sleeve');
      expect(arrow.piece).toBe('FLP_R');
      expect(inside(step(arrow, 3), geoms.get('FLP_R')!.rs)).toBe(false);
    });

    it('press open: one plain line and two opposite arrows, one word', () => {
      const { marks } = pressMarks({
        operationType: 'TECH_CARD_OPERATION_TYPE_PRESS_OPEN',
        work: 'press_open',
        press: undefined,
      });
      expect(marks.lines).toHaveLength(1);
      expect(marks.lines[0]).toMatchObject({ weight: 'ink', kind: 'press-open' });
      const arrows = marks.glyphs.filter((glyph) => glyph.kind === 'press-arrow');
      expect(arrows).toHaveLength(2);
      const [a, b] = arrows;
      expect(a.point).toEqual(b.point);
      expect(a.direction![0] + b.direction![0]).toBeCloseTo(0);
      expect(a.direction![1] + b.direction![1]).toBeCloseTo(0);
      expect(arrows.map((arrow) => arrow.label).filter(Boolean)).toEqual(['open']);
    });

    it('press flat: the seam line only, no arrows, no word', () => {
      const { marks } = pressMarks({
        work: 'press_flat',
        press: { action: 'TECH_CARD_PRESS_ACTION_PRESS_FLAT' },
      });
      expect(marks.lines).toHaveLength(1);
      expect(marks.lines[0]).toMatchObject({ weight: 'ink', kind: 'press-flat' });
      expect(marks.glyphs).toEqual([]);
    });

    it('press flat without an owner row draws nothing and is not missing a seam', () => {
      const input = card6ActionLineInput(false);
      const operations = input.techCard.techCard!.operations!.map((operation) =>
        operation.operationNumber === 100
          ? {
              ...operation,
              work: 'press_flat',
              press: { action: 'TECH_CARD_PRESS_ACTION_PRESS_FLAT' as const, toward: undefined },
            }
          : operation,
      );
      const action = deriveAssembly({
        ...input,
        techCard: { ...input.techCard, techCard: { ...input.techCard.techCard!, operations } },
      }).rows.find((row) => row.n === 100)?.action;
      const marks = editorActionMarks(
        action,
        new Map([...input.pieces].map(([key, piece]) => [key, piece.geom])),
      );
      expect(action?.missing).toBeUndefined();
      expect(marks).toEqual({ lines: [], glyphs: [] });
    });

    it('renders the arrows with their word off the seam in the print picture', () => {
      const input = card6ActionLineInput(true);
      const picture = sceneOf(input, 100);
      const { marks } = pressMarks({
        operationType: 'TECH_CARD_OPERATION_TYPE_PRESS_OPEN',
        work: 'press_open',
        press: undefined,
      });
      const svg = renderedPicture(picture, marks);
      expect(svg.match(/data-asm-mark="press-arrow"/g)).toHaveLength(2);
      expect(svg.match(/data-asm-mark="press-open"/g)).toHaveLength(1);
      expect(svg).toContain('>open</text>');
    });
  });

  it('keeps eight horizontal buttonholes on eight distinct pattern marks', () => {
    const input = placementActionInput('buttonhole');
    const action = deriveAssembly(input).rows.find((row) => row.n === 750)?.action;
    const glyphs = editorActionMarks(
      action,
      new Map([['FLP_R', input.pieces.get('FLP_R')!.geom]]),
    ).glyphs;

    expect(glyphs).toHaveLength(8);
    expect(new Set(glyphs.map((glyph) => glyph.point.join(':'))).size).toBe(8);
    expect(glyphs.every((glyph) => Math.abs(glyph.direction?.[0] ?? 0) > 0.999)).toBe(true);
    expect(glyphs.every((glyph) => Math.abs(glyph.direction?.[1] ?? 1) < 0.001)).toBe(true);
    expect(glyphs.every((glyph) => glyph.lengthMm === 12)).toBe(true);
  });

  it('keeps eight buttons on distinct marks and carries their fastening style', () => {
    const input = placementActionInput('button');
    const action = deriveAssembly(input).rows.find((row) => row.n === 860)?.action;
    const glyphs = editorActionMarks(
      action,
      new Map([['FLP_R', input.pieces.get('FLP_R')!.geom]]),
    ).glyphs;

    expect(glyphs).toHaveLength(8);
    expect(new Set(glyphs.map((glyph) => glyph.point.join(':'))).size).toBe(8);
    expect(glyphs.every((glyph) => glyph.pattern === 'parallel')).toBe(true);
    expect(glyphs.every((glyph) => glyph.holes === 2)).toBe(true);
    expect(glyphs.every((glyph) => glyph.sizeMm === 11)).toBe(true);
  });

  it('matches the editor tile affines for every card 83 join operation', () => {
    const input = card83StoredSeamsFixture();
    const joins = deriveAssembly(input)
      .rows.filter((row) => row.card)
      .map((row) => row.n);

    for (const operationNumber of joins) {
      const picture = sceneOf(input, operationNumber);
      const leaves = focusedStepLeaves(
        picture.leaves,
        picture.marks.map((mark) => mark.id),
        picture.innerSeams,
      );
      const editorLayout = stepLayout(leaves, picture.frameSeams, picture.geoms, {
        explode: STEP_TILE_EXPLODE,
        rasterMm: STEP_TILE_RASTER_MM,
      });

      expectSameAffines(picture.layout.T, editorLayout.T, `op ${operationNumber}`);
    }
  });

  it('uses the normalized producing join layout for every card 83 non-join operation', () => {
    const input = card83WithNonJoins();
    const model = deriveAssembly(input);
    const pictures = editorOperationPictures(input.techCard, model)!;
    const expected = pictures.get(400)!;

    for (const row of model.rows.filter((candidate) => !candidate.card)) {
      const picture = pictures.get(row.n);
      expect(picture, `op ${row.n}`).toBeDefined();
      expectSameRetainedAffines(picture!.layout.T, expected.layout.T, `op ${row.n}`);
    }
  }, 120_000);

  it('uses the editor result for a rowless card 6 step when another step is owned', () => {
    const ownedInput = card6ChainInput(true);
    const ownedPictures = editorOperationPictures(ownedInput.techCard, deriveAssembly(ownedInput))!;
    const expectedResults = stepResults(
      {
        ops: CARD6_TEST_OPERATIONS,
        byKey: CARD6_TEST_SEAMS,
        poses: CARD6_TEST_POSES,
        geoms: card6TestGeoms(),
        innerLines: card6TestInnerLines(),
        pieceKeys: CARD6_TEST_PIECES,
      },
      OWNER_FIT,
    );
    const rowlessIndex = CARD6_TEST_OPERATIONS.findIndex(
      (operation) => operation.operationNumber === CARD6_ROWLESS_NUMBER,
    );
    const expected = expectedResults[rowlessIndex];
    const [leftBox, rightBox] = CARD6_ROWLESS_INPUTS.map((key) =>
      boxOf(
        card6TestGeoms()
          .get(key)!
          .rs.map((point) => apply(expected.transforms.get(key)!, point)),
      ),
    );

    expect(expected.owned).toBe(false);
    expect(expectedResults.some((result) => result.owned)).toBe(true);
    expect(
      leftBox.x1 < rightBox.x0 ||
        rightBox.x1 < leftBox.x0 ||
        leftBox.y1 < rightBox.y0 ||
        rightBox.y1 < leftBox.y0,
    ).toBe(true);
    expectSameAffines(
      ownedPictures.get(CARD6_ROWLESS_NUMBER)!.layout.T,
      expected.transforms,
      'rowless op 20',
    );
    expect(ownedPictures.get(CARD6_ROWLESS_NUMBER)!.resultLayers).toEqual(expected.layers);
  }, 120_000);

  it('makes a rowless card PDF equal the shared editor result', () => {
    const rowlessInput = card6ChainInput(false);
    const rowlessPictures = editorOperationPictures(
      rowlessInput.techCard,
      deriveAssembly(rowlessInput),
    )!;
    const expected = stepResults(
      {
        ops: CARD6_TEST_OPERATIONS,
        byKey: new Map(),
        poses: new Map(),
        geoms: card6TestGeoms(),
        innerLines: card6TestInnerLines(),
        pieceKeys: CARD6_TEST_PIECES,
      },
      OWNER_FIT,
    );
    const index = CARD6_TEST_OPERATIONS.findIndex((operation) => operation.operationNumber === 430);

    expectSameAffines(rowlessPictures.get(430)!.layout.T, expected[index].transforms, 'op 430');
    expect(rowlessPictures.get(430)!.resultLayers).toEqual(expected[index].layers);
  }, 120_000);

  it('keeps card 83 op 200 panels and op 400 collar grain-upright', () => {
    const input = card83StoredSeamsFixture();
    const pictures = [sceneOf(input, 200), sceneOf(input, 400)];

    for (const picture of pictures)
      for (const [key, affine] of picture.layout.T) {
        const quarterTurn = Math.abs(pieceTilt(picture.geoms.get(key)!, affine) - Math.PI / 2);
        expect(quarterTurn, picture.geoms.get(key)?.name).toBeGreaterThan(0.1);
      }

    const op200 = pictures[0];
    expect(
      pieceTilt(
        op200.geoms.get(keyNamed(input, 'FL'))!,
        op200.layout.T.get(keyNamed(input, 'FL'))!,
      ),
    ).toBeLessThan(0.1);

    const op400 = pictures[1];
    const collarKey = [...op400.layout.T.keys()].find((key) =>
      /^CLR/.test(input.pieces.get(key)?.name ?? ''),
    )!;
    const collar = op400.geoms
      .get(collarKey)!
      .rs.map((point) => apply(op400.layout.T.get(collarKey)!, point));
    const collarBox = boxOf(collar);
    expect(collarBox.x1 - collarBox.x0).toBeGreaterThan(collarBox.y1 - collarBox.y0);
  });

  it('renders card 85 and bare card 83 without throwing', () => {
    for (const input of [card85StoredSeamFixture(), card83RealFixture()]) {
      const model = deriveAssembly(input);
      expect(() =>
        renderToStaticMarkup(
          <AssemblyPage
            techCard={input.techCard}
            orient='port'
            docline='test'
            n='06'
            model={model}
            pdfGaps={[]}
            onLaidOut={() => undefined}
          />,
        ),
      ).not.toThrow();
    }
  }, 120_000);

  it('returns no editor picture when an operation has no geometry', () => {
    const input = card83StoredSeamsFixture();
    const picture = sceneOf({ ...input, pieces: new Map() }, 400);

    expect(picture.layout.T.size).toBe(0);
  });

  it('falls back cleanly when a target has legacy cut geometry only', () => {
    const input = card85StoredSeamFixture();
    const pieces = new Map(
      [...input.pieces].map(([key, piece]) => [
        key,
        { ...piece, geom: { ...piece.geom, rs: [], edges: [] } },
      ]),
    );
    const legacyOnly = { ...input, pieces };
    const model = deriveAssembly(legacyOnly);
    const pictures = editorOperationPictures(legacyOnly.techCard, model);

    expect(pictures?.has(1070)).toBe(true);
    expect(pictures?.get(1070)?.layout.T.size).toBe(0);
    expect(() =>
      renderToStaticMarkup(
        <AssemblyPage
          techCard={legacyOnly.techCard}
          orient='port'
          docline='test'
          n='06'
          model={model}
          pdfGaps={[]}
          onLaidOut={() => undefined}
        />,
      ),
    ).not.toThrow();
  });
});

describe.skipIf(!card85RealFixtureAvailable())('real card 85 finishing pictures', () => {
  let input: AssemblyInput;
  let model: ReturnType<typeof deriveAssembly>;
  let pictures: NonNullable<ReturnType<typeof editorOperationPictures>>;
  let fullGarment: ReturnType<typeof joinedResult>;

  beforeAll(() => {
    input = card85RealFixture();
    model = deriveAssembly(input);
    fullGarment = joinedResult(input, 1060);
    pictures = editorOperationPictures(input.techCard, model)!;
  }, 30_000);

  const namesOf = (picture: ReturnType<typeof sceneOf>) =>
    [...picture.layout.T.keys()].map((key) => model.pieces.get(key)?.name);

  it('keeps operation 920 and retains the upstream sleeve at operation 1010', () => {
    expect(namesOf(pictures.get(920)!)).toEqual(['FLP_R_MAIN']);
    expect(namesOf(pictures.get(1010)!)).toEqual(['FLP_R_MAIN', 'SLV_R', 'FLP_R']);
  });

  it.each([
    [510, false],
    [520, true],
    [530, false],
  ] as const)(
    'keeps operation %i on the relevant left-front cluster',
    (operationNumber, marked) => {
      const source = joinedResult(input, 490);
      const clusters = editorPictureClusters(source);
      const row = model.rows.find((candidate) => candidate.n === operationNumber)!;
      const action = editorActionMarks(row.action, source.geoms);
      const markedPieces = new Set([...action.lines, ...action.glyphs].map((mark) => mark.piece));
      const expected = marked
        ? clusters.filter((cluster) => cluster.some((key) => markedPieces.has(key))).flat()
        : clusters[0];

      const actual = new Set(pictures.get(operationNumber)!.layout.T.keys());
      for (const key of source.layout.T.keys()) expect(actual.has(key), key).toBe(true);
      for (const key of expected) expect(actual.has(key), key).toBe(true);
    },
  );

  it('keeps every non-join picture upstream-complete', () => {
    const pieceKeys = new Set(input.pieces.keys());
    const producers = new Map(
      (input.techCard.techCard?.operations ?? [])
        .filter((operation) => operation.outputUnitKey)
        .map((operation) => [operation.outputUnitKey!, operation]),
    );
    const upstreamPieces = (keys: readonly string[]) => {
      const found = new Set<string>();
      const visited = new Set<string>();
      const visit = (key: string) => {
        if (visited.has(key)) return;
        visited.add(key);
        if (pieceKeys.has(key)) found.add(key);
        const producer = producers.get(key);
        for (const inputKey of producer?.inputKeys ?? []) visit(inputKey);
      };
      for (const key of keys) visit(key);
      return found;
    };
    let checked = 0;
    for (const row of model.rows.filter((candidate) => !candidate.card)) {
      const picture = pictures.get(row.n);
      if (!picture) continue;
      checked += 1;
      const operation = input.techCard.techCard?.operations?.find(
        (candidate) => candidate.operationNumber === row.n,
      );
      for (const key of upstreamPieces(operation?.inputKeys ?? []))
        expect(picture.layout.T.has(key), `op ${row.n} · ${key}`).toBe(true);
    }
    expect(checked).toBeGreaterThan(0);
  });

  it('keeps operation 1070 on the preceding completed garment', () => {
    const picture = pictures.get(1070)!;
    const assembled = pictures.get(1060)!;

    expect(new Set(picture.layout.T.keys())).toEqual(new Set(assembled.layout.T.keys()));
    expectSameAffines(picture.layout.T, assembled.layout.T, 'op 1070');
    expectReadableFit(picture);
  });

  it.each([
    [1080, 'buttonhole'],
    [1090, 'button'],
  ] as const)('keeps operation %i on the assembled garment', (operationNumber, kind) => {
    const picture = pictures.get(operationNumber)!;
    const assembled = pictures.get(1060)!;
    const row = model.rows.find((candidate) => candidate.n === operationNumber)!;
    const action = editorActionMarks(row.action, fullGarment.geoms);
    const markedPieces = new Set([...action.lines, ...action.glyphs].map((mark) => mark.piece));

    expect(markedPieces.size).toBeGreaterThan(0);
    expect(new Set(picture.layout.T.keys())).toEqual(new Set(assembled.layout.T.keys()));
    expect(picture.layout.T.size).toBeGreaterThan(2);
    expectReadableFit(picture);

    const markup = renderedPicture(picture, action);
    const drawn = renderedBox(picture);
    const spots = [...markup.matchAll(/data-asm-x="([^"]+)" data-asm-y="([^"]+)"/g)];
    expect(markup.match(/data-piece-outline=/g)?.length ?? 0).toBeGreaterThan(2);
    expect(markup).toContain(`data-asm-mark="${kind}"`);
    expect(markup).toContain('stroke-width="0.7"');
    expect(spots).toHaveLength(action.glyphs.length);
    for (const spot of spots) {
      const x = Number(spot[1]);
      const y = Number(spot[2]);
      expect(x).toBeGreaterThanOrEqual(drawn.x0);
      expect(x).toBeLessThanOrEqual(drawn.x1);
      expect(y).toBeGreaterThanOrEqual(drawn.y0);
      expect(y).toBeLessThanOrEqual(drawn.y1);
    }
  });
});
