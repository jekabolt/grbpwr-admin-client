import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';

import type { Pt2 } from 'lib/assembly-skeleton/types';
import { pieceTilt } from 'lib/assembly-skeleton/union';
import { apply } from 'lib/assembly-skeleton/union/affine';

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
  card83RealFixture,
  card83StoredSeamsFixture,
  card85StoredSeamFixture,
} from './assembly-inference.fixture';
import { card85RealFixture, card85RealFixtureAvailable } from './assembly-card85-real.fixture';
import { asmProtoFlags, setAsmProtoFlags } from './asm-proto-flags';
import { deriveAssembly, type AssemblyInput } from './derive-assembly';
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
  const fit = fitBox(picture.layout.bbox, 212, 186, 4);
  return boxOf(
    [...picture.layout.T].flatMap(([key, affine]) =>
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

  it('uses the producing join after-layout for every card 83 non-join operation', () => {
    const input = card83WithNonJoins();
    const model = deriveAssembly(input);
    const pictures = editorOperationPictures(input.techCard, model)!;
    const producer = sceneOf(input, 400);
    const expected = stepLayout(producer.leaves, producer.frameSeams, producer.geoms, {
      explode: 0,
      rasterMm: STEP_TILE_RASTER_MM,
    });

    for (const row of model.rows.filter((candidate) => !candidate.card)) {
      const picture = pictures.get(row.n);
      expect(picture, `op ${row.n}`).toBeDefined();
      expectSameRetainedAffines(picture!.layout.T, expected.T, `op ${row.n}`);
    }
  });

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
  });

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
  let fullClusters: string[][];

  beforeAll(() => {
    input = card85RealFixture();
    model = deriveAssembly(input);
    pictures = editorOperationPictures(input.techCard, model)!;
    fullGarment = joinedResult(input, 1060);
    fullClusters = editorPictureClusters(fullGarment);
  });

  const namesOf = (picture: ReturnType<typeof sceneOf>) =>
    [...picture.layout.T.keys()].map((key) => model.pieces.get(key)?.name);

  it('keeps operation 920 and removes the unmarked sleeve from operation 1010', () => {
    expect(namesOf(pictures.get(920)!)).toEqual(['FLP_R_MAIN']);
    expect(namesOf(pictures.get(1010)!)).toEqual(['FLP_R_MAIN', 'FLP_R']);
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

      expect(new Set(pictures.get(operationNumber)!.layout.T.keys())).toEqual(new Set(expected));
    },
  );

  it('keeps every non-join picture on marked clusters, or the largest unmarked cluster', () => {
    let checked = 0;
    for (const row of model.rows.filter((candidate) => !candidate.card)) {
      const picture = pictures.get(row.n);
      if (!picture) continue;
      checked += 1;
      const action = editorActionMarks(row.action, picture.geoms);
      const markedPieces = new Set(
        [...action.lines, ...action.glyphs]
          .map((mark) => mark.piece)
          .filter((key) => picture.layout.T.has(key)),
      );
      const clusters = editorPictureClusters(picture);

      if (!markedPieces.size) {
        expect(clusters, `op ${row.n}`).toHaveLength(1);
        continue;
      }
      for (const cluster of clusters)
        expect(
          cluster.some((key) => markedPieces.has(key)),
          `op ${row.n} · ${cluster.join(', ')}`,
        ).toBe(true);
    }
    expect(checked).toBeGreaterThan(0);
  });

  it('fills operation 1070 with only the largest sewn cluster', () => {
    const picture = pictures.get(1070)!;
    const largest = fullClusters[0];

    expect(new Set(picture.layout.T.keys())).toEqual(new Set(largest));
    expect(picture.layout.T.size).toBeLessThan(fullGarment.layout.T.size);
    expectReadableFit(picture);
  });

  it.each([
    [1080, 'buttonhole'],
    [1090, 'button'],
  ] as const)('fills operation %i with only marked sewn clusters', (operationNumber, kind) => {
    const picture = pictures.get(operationNumber)!;
    const row = model.rows.find((candidate) => candidate.n === operationNumber)!;
    const action = editorActionMarks(row.action, fullGarment.geoms);
    const markedPieces = new Set([...action.lines, ...action.glyphs].map((mark) => mark.piece));
    const expectedPieces = fullClusters
      .filter((cluster) => cluster.some((key) => markedPieces.has(key)))
      .flat();

    expect(expectedPieces.length).toBeGreaterThan(0);
    expect(new Set(picture.layout.T.keys())).toEqual(new Set(expectedPieces));
    expectReadableFit(picture);

    const markup = renderedPicture(picture, action);
    const drawn = renderedBox(picture);
    const spots = [...markup.matchAll(/data-asm-x="([^"]+)" data-asm-y="([^"]+)"/g)];
    expect(markup.match(/data-piece-outline=/g)).toHaveLength(expectedPieces.length);
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
