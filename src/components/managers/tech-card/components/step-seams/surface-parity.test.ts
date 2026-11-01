import { describe, expect, it } from 'vitest';

import { apply } from 'lib/assembly-skeleton/union/affine';

import { mapStepPictureOf } from '../assembly-map/step-view';
import {
  CARD6_CHAIN_OPS,
  CARD6_CHAIN_PIECE_KEYS,
  CARD6_CHAIN_POSES,
  CARD6_CHAIN_SEAMS,
  card6ChainGeoms,
  card6ChainInnerLines,
} from './card6-chain.fixture';
import { OWNER_FIT, stepResults } from './step-result';
import { boxOf } from './step-picture';
import { stepPictureOf, unitPictureOf, type SurfacePicture } from './surface-picture';

const results = stepResults(
  {
    ops: CARD6_CHAIN_OPS,
    byKey: CARD6_CHAIN_SEAMS,
    poses: CARD6_CHAIN_POSES,
    geoms: card6ChainGeoms(),
    innerLines: card6ChainInnerLines(),
    pieceKeys: CARD6_CHAIN_PIECE_KEYS,
  },
  OWNER_FIT,
);

const expectSamePicture = (actual: SurfacePicture | null, expected: SurfacePicture | null) => {
  expect(actual?.layout ?? null).toBe(expected?.layout ?? null);
  expect(actual?.layout.T ?? null).toBe(expected?.layout.T ?? null);
  expect(actual?.layers ?? null).toBe(expected?.layers ?? null);
};

describe('shared surface picture parity', () => {
  it('gives every step tile, quiz, editor canvas and map view the same result object', () => {
    CARD6_CHAIN_OPS.forEach((_, index) => {
      const expected = stepPictureOf(results, index);
      const surfaces = {
        stepTile: stepPictureOf(results, index),
        quizTile: stepPictureOf(results, index),
        editorCanvas: stepPictureOf(results, index),
        mapStepView: mapStepPictureOf(results, index),
      };

      Object.values(surfaces).forEach((picture) => expectSamePicture(picture, expected));
      expect(expected?.layout).toBe(results[index].layout);
      expect(expected?.layers).toBe(results[index].layers);
    });
  });

  it('gives WITH tiles and unit glyphs the latest earlier producer result', () => {
    const produced = new Set(
      CARD6_CHAIN_OPS.map((op) => (op.outputUnitKey ?? '').trim()).filter(Boolean),
    );

    CARD6_CHAIN_OPS.forEach((op, beforeIndex) => {
      for (const unitKey of op.inputKeys ?? []) {
        if (!produced.has(unitKey)) continue;
        const expected = unitPictureOf(results, CARD6_CHAIN_OPS, unitKey, beforeIndex);
        const withTile = unitPictureOf(results, CARD6_CHAIN_OPS, unitKey, beforeIndex);
        const unitGlyph = unitPictureOf(results, CARD6_CHAIN_OPS, unitKey, beforeIndex);

        expectSamePicture(withTile, expected);
        expectSamePicture(unitGlyph, expected);
      }
    });
  });

  it('keeps rowless multi-input steps apart on every step surface', () => {
    const geoms = card6ChainGeoms();
    const rowlessResults = stepResults(
      {
        ops: CARD6_CHAIN_OPS,
        byKey: new Map(),
        poses: new Map(),
        geoms,
        innerLines: card6ChainInnerLines(),
        pieceKeys: CARD6_CHAIN_PIECE_KEYS,
      },
      OWNER_FIT,
    );
    const rowless = rowlessResults.filter(
      (result) => !result.owned && result.blocks.filter((block) => block.pieces.length).length > 1,
    );
    expect(rowless.length).toBeGreaterThan(0);
    for (const result of rowless) {
      const picture = mapStepPictureOf(rowlessResults, result.opIndex);
      expect(picture?.layout).toBe(result.layout);
      const boxes = result.blocks.flatMap((block) => {
        const points = block.pieces.flatMap((piece) => {
          const geom = geoms.get(piece);
          const transform = result.layout.T.get(piece);
          return geom && transform ? geom.rs.map((point) => apply(transform, point)) : [];
        });
        return points.length ? [boxOf(points)] : [];
      });
      for (let left = 0; left < boxes.length; left++)
        for (let right = left + 1; right < boxes.length; right++)
          expect(
            boxes[left].x1 < boxes[right].x0 ||
              boxes[right].x1 < boxes[left].x0 ||
              boxes[left].y1 < boxes[right].y0 ||
              boxes[right].y1 < boxes[left].y0,
          ).toBe(true);
    }
  });
});
