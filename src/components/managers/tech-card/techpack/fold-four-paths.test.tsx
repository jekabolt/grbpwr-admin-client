import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

import { mapStepPictureOf } from '../components/assembly-map/step-view';
import { seamRowsOfCard } from '../components/card-seam-graph';
import { foldedDrawing } from '../components/step-seams/step-folds';
import { StepPictureSvg } from '../components/step-seams/step-picture-view';
import { OWNER_FIT, stepResults } from '../components/step-seams/step-result';
import { stepPictureOf } from '../components/step-seams/surface-picture';
import type { FormOpLike } from '../components/step-seams/step-seams-model';
import { foldsFromWire } from 'lib/folds';
import type { Pt2 } from 'lib/assembly-skeleton/types';
import type { TechCardPieceFold } from 'api/proto-http/common';

import { card83StoredSeamsFixture } from './assembly-inference.fixture';
import { deriveAssembly } from './derive-assembly';
import { editorOperationPictures } from './pages/assembly';

const FOLD_KEY = 'fold-four-paths';

// A fold on the first piece of the card's first join, closed on that join.
function foldedCard() {
  const input = card83StoredSeamsFixture();
  const model = deriveAssembly(input);
  const opNumber = model.rows.find((row) => row.card)?.n ?? 0;
  const geoms = new Map([...input.pieces].map(([key, piece]) => [key, piece.geom]));
  const insert = input.techCard.techCard!;
  const operations = (insert.operations ?? []).map((operation) =>
    operation.operationNumber === opNumber ? { ...operation, foldKeys: [FOLD_KEY] } : operation,
  );
  return { input, opNumber, geoms, operations };
}

const stretched = (ring: readonly Pt2[]) => {
  let best = { long: 0, short: Infinity };
  for (let deg = 0; deg < 180; deg += 0.5) {
    const angle = (deg * Math.PI) / 180;
    const along = ring.map((p) => p[0] * Math.cos(angle) + p[1] * Math.sin(angle));
    const across = ring.map((p) => -p[0] * Math.sin(angle) + p[1] * Math.cos(angle));
    const long = Math.max(...along) - Math.min(...along);
    const short = Math.max(...across) - Math.min(...across);
    if (short < best.short) best = { long, short };
  }
  return best.short / best.long;
};

const ringIn = (svg: string, piece: string): Pt2[] => {
  for (const match of svg.matchAll(/<path d="([^"]+)"[^>]*\sdata-piece-surface="([^"]+)"/g)) {
    if (match[2] !== piece) continue;
    return [...match[1].matchAll(/(-?[\d.]+)[, ](-?[\d.]+)/g)].map(
      (point) => [Number(point[1]), Number(point[2])] as Pt2,
    );
  }
  return [];
};

describe('canvas, tile, map and print agree on a folded ring', () => {
  it('draws one ring through one helper', () => {
    const { input, opNumber, geoms, operations } = foldedCard();
    const index = operations.findIndex((operation) => operation.operationNumber === opNumber);
    const ops = operations.map(
      (operation): FormOpLike => ({
        operationNumber: operation.operationNumber,
        operationType: operation.operationType,
        work: operation.work,
        inputKeys: operation.inputKeys ?? [],
        outputUnitKey: operation.outputUnitKey,
        seamKeys: operation.seamKeys ?? [],
        foldKeys: operation.foldKeys,
      }),
    );
    const planned = stepResults(
      {
        ops,
        byKey: seamRowsOfCard(input.techCard),
        geoms,
        innerLines: new Map(),
        pieceKeys: new Set(geoms.keys()),
      },
      OWNER_FIT,
    );
    const piece = [...planned[index].layout.T.keys()].find((key) => geoms.get(key)!.rs.length > 3)!;
    const wireFold: TechCardPieceFold = {
      foldKey: FOLD_KEY,
      pieceLineKey: piece,
      seq: 1,
      kind: 'TECH_CARD_PIECE_FOLD_KIND_INWARD',
      source: 'TECH_CARD_PIECE_FOLD_SOURCE_OWNER',
      line: [
        { u: 0.5, v: 0 },
        { u: 0.5, v: 1 },
      ],
      flipAt: { u: 0.25, v: 0.5 },
      edgeHint: '',
      edgeSamples: [],
      offsetMm: 0,
      contourSig: '',
      anchoredSize: 'M',
      note: '',
      stale: false,
      createdBy: '',
      createdAt: '',
      updatedBy: '',
      updatedAt: '',
    };
    const techCard = {
      ...input.techCard,
      pieceFolds: [wireFold],
      techCard: { ...input.techCard.techCard!, operations },
    } as typeof input.techCard;
    const rows = foldsFromWire(techCard.pieceFolds).folds;
    expect(rows).toHaveLength(1);

    const results = stepResults(
      {
        ops,
        byKey: seamRowsOfCard(techCard),
        geoms,
        innerLines: new Map(),
        pieceKeys: new Set(geoms.keys()),
        folds: { rows, grainDeg: input.grainDeg },
      },
      OWNER_FIT,
    );
    const result = results[index];
    expect(result.layout.folds?.closing).toEqual([piece]);

    const svgOf = (
      picture: {
        layout: typeof result.layout;
        layers?: unknown;
        lower?: unknown;
        stacked?: unknown;
      },
      look: 'canvas' | 'tile',
      foldGhost = false,
    ) =>
      renderToStaticMarkup(
        <StepPictureSvg
          w={600}
          h={600}
          pad={8}
          look={look}
          layout={picture.layout}
          layers={result.layers}
          lower={result.lower}
          stacked={result.stacked}
          geoms={geoms}
          foldGhost={foldGhost}
        />,
      );
    const printed = editorOperationPictures(techCard, deriveAssembly({ ...input, techCard }))!.get(
      opNumber,
    )!;
    const paths: Record<string, string> = {
      canvas: svgOf(result, 'canvas'),
      tile: svgOf(stepPictureOf(results, index)!, 'tile'),
      map: svgOf(mapStepPictureOf(results, index)!, 'tile', true),
      print: renderToStaticMarkup(
        <StepPictureSvg
          w={600}
          h={600}
          pad={8}
          look='print'
          layout={printed.layout}
          layers={printed.resultLayers}
          lower={printed.resultLower}
          stacked={printed.resultStacked}
          geoms={printed.geoms}
        />,
      ),
    };

    const flatShape = stretched(geoms.get(piece)!.rs);
    const foldedShape = stretched(
      foldedDrawing(geoms, undefined, result.layout.folds?.flat).geoms.get(piece)!.rs,
    );
    expect(Math.abs(foldedShape - flatShape)).toBeGreaterThan(0.1);
    for (const [path, svg] of Object.entries(paths)) {
      const ring = ringIn(svg, piece);
      expect(ring.length, path).toBeGreaterThan(2);
      expect(stretched(ring), path).toBeCloseTo(foldedShape, 2);
    }
  }, 300_000);
});
