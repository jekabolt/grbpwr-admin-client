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
import { boxOf, fitBox, stepLayout, toPx } from '../components/step-seams/step-picture';
import {
  CARD6_CHAIN_OPS,
  CARD6_CHAIN_POSES,
  CARD6_CHAIN_SEAMS,
  card6ChainGeoms,
  card6ChainInnerLines,
} from '../components/step-seams/card6-chain.fixture';
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

const CARD6_TEST_OPERATIONS = CARD6_CHAIN_OPS.filter((operation) =>
  [30, 380, 430].includes(operation.operationNumber ?? -1),
);
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

const affineSnapshot = (transforms: ReadonlyMap<string, readonly number[]>) =>
  [...transforms]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([key, affine]) => [key, affine.map((value) => Number(value.toFixed(6)))]) as [
    string,
    number[],
  ][];

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

  it('uses card 6 owner results and preserves the rowless print layout', () => {
    const ownedInput = card6ChainInput(true);
    const ownedPictures = editorOperationPictures(ownedInput.techCard, deriveAssembly(ownedInput))!;
    const expected = stepResults(
      {
        ops: CARD6_TEST_OPERATIONS,
        byKey: CARD6_TEST_SEAMS,
        poses: CARD6_TEST_POSES,
        geoms: card6TestGeoms(),
        innerLines: card6TestInnerLines(),
        pieceKeys: CARD6_TEST_PIECES,
      },
      OWNER_FIT,
    )[CARD6_TEST_OPERATIONS.findIndex((operation) => operation.operationNumber === 430)];
    expectSameAffines(ownedPictures.get(430)!.layout.T, expected.transforms, 'owned op 430');

    const rowlessInput = card6ChainInput(false);
    const rowlessPictures = editorOperationPictures(
      rowlessInput.techCard,
      deriveAssembly(rowlessInput),
    )!;
    expect(affineSnapshot(rowlessPictures.get(430)!.layout.T)).toEqual([
      ['FLP_L', [1, 0, 0, 1, -52.1, 411.9]],
      ['FLP_L_MAIN', [1, -0.000627, 0.000627, 1, 468, 571.5]],
      ['SLV_L', [1, 0, 0, 1, 0, 0]],
    ]);
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

    expect(pictures?.has(1070)).toBe(false);
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
    expect(markup).toContain('stroke-width="3"');
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
