import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, describe, expect, it, vi } from 'vitest';

import type { Pt2 } from 'lib/assembly-skeleton/types';
import { pieceTilt } from 'lib/assembly-skeleton/union';
import { apply } from 'lib/assembly-skeleton/union/affine';

import { seamGraphOfCard, seamRowsOfCard } from '../components/card-seam-graph';
import {
  focusedStepLeaves,
  STEP_TILE_EXPLODE,
  STEP_TILE_RASTER_MM,
  stepPictureOfOp,
  type SceneOp,
} from '../components/step-seams/step-picture-view';
import { boxOf, stepLayout } from '../components/step-seams/step-picture';
import {
  card83RealFixture,
  card83StoredSeamsFixture,
  card85StoredSeamFixture,
} from './assembly-inference.fixture';
import { asmProtoFlags, setAsmProtoFlags } from './asm-proto-flags';
import { deriveAssembly, type AssemblyInput } from './derive-assembly';
import { AssemblyPage } from './pages/assembly';

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

      expect([...picture.layout.T.keys()], `op ${operationNumber}`).toEqual([
        ...editorLayout.T.keys(),
      ]);
      for (const [key, affine] of picture.layout.T) {
        const expected = editorLayout.T.get(key)!;
        affine.forEach((value, index) =>
          expect(value, `op ${operationNumber} · ${key} · affine ${index}`).toBeCloseTo(
            expected[index],
            6,
          ),
        );
      }
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
});
