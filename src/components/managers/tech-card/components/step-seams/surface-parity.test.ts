import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { gunzipSync } from 'node:zlib';

import { describe, expect, it } from 'vitest';

import type { Affine, PieceGeom, Pt2 } from 'lib/assembly-skeleton/types';
import { apply, compose } from 'lib/assembly-skeleton/union/affine';
import type { StoredPose, StoredSeam } from 'lib/seams';

import { mapStepPictureOf } from '../assembly-map/step-view';
import {
  CARD6_CHAIN_OPS,
  CARD6_CHAIN_PIECE_KEYS,
  CARD6_CHAIN_POSES,
  CARD6_CHAIN_SEAMS,
  card6ChainGeoms,
  card6ChainInnerLines,
} from './card6-chain.fixture';
import { CARD58_OPS, CARD58_PIECE_KEYS, card58Geoms, card58InnerLines } from './card58.fixture';
import {
  CARD6_OPS,
  CARD6_PIECE_KEYS,
  CARD6_SEAMS,
  card6Geoms,
  card6InnerLines,
} from './card6.fixture';
import { CARD63_OPS, CARD63_PIECE_KEYS, card63Geoms, card63InnerLines } from './card63.fixture';
import { CARD77_OPS, CARD77_PIECE_KEYS, card77Geoms, card77InnerLines } from './card77.fixture';
import { CARD83_OPS, CARD83_PIECE_KEYS, card83Geoms, card83InnerLines } from './card83.fixture';
import { CARD85_OPS, CARD85_PIECE_KEYS, CARD85_SEAMS, card85Geoms } from './card85.fixture';
import { OWNER_FIT, stepResults, type StepResultsInput } from './step-result';
import { boxOf, invert } from './step-picture';
import type { FormOpLike } from './step-seams-model';
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

/** #90 test Pants as beta stores it (gate snapshot of 03.11): the card the owner's complaint is on. */
function card90(): StepResultsInput {
  const raw = JSON.parse(
    gunzipSync(readFileSync(resolve(__dirname, 'card90-real.json.gz'))).toString('utf8'),
  ) as {
    ops: FormOpLike[];
    seams: StoredSeam[];
    poses: StoredPose[];
    pieceKeys: string[];
    geoms: [string, PieceGeom][];
    innerLines: [string, Pt2[][]][];
  };
  return {
    ops: raw.ops,
    byKey: new Map(raw.seams.map((row) => [row.seamKey, row])),
    poses: new Map(raw.poses.map((pose) => [pose.seamKey, pose])),
    geoms: new Map(raw.geoms),
    innerLines: new Map(raw.innerLines),
    pieceKeys: new Set(raw.pieceKeys),
  };
}

const CARDS: [string, () => StepResultsInput][] = [
  [
    'card 6',
    () => ({
      ops: CARD6_OPS,
      byKey: CARD6_SEAMS,
      poses: new Map(),
      geoms: card6Geoms(),
      innerLines: card6InnerLines(),
      pieceKeys: CARD6_PIECE_KEYS,
    }),
  ],
  [
    'card 58',
    () => ({
      ops: CARD58_OPS,
      byKey: new Map(),
      poses: new Map(),
      geoms: card58Geoms(),
      innerLines: card58InnerLines(),
      pieceKeys: CARD58_PIECE_KEYS,
    }),
  ],
  [
    'card 63',
    () => ({
      ops: CARD63_OPS,
      byKey: new Map(),
      poses: new Map(),
      geoms: card63Geoms(),
      innerLines: card63InnerLines(),
      pieceKeys: CARD63_PIECE_KEYS,
    }),
  ],
  [
    'card 77',
    () => ({
      ops: CARD77_OPS,
      byKey: new Map(),
      poses: new Map(),
      geoms: card77Geoms(),
      innerLines: card77InnerLines(),
      pieceKeys: CARD77_PIECE_KEYS,
    }),
  ],
  [
    'card 83',
    () => ({
      ops: CARD83_OPS,
      byKey: new Map(),
      poses: new Map(),
      geoms: card83Geoms(),
      innerLines: card83InnerLines(),
      pieceKeys: CARD83_PIECE_KEYS,
    }),
  ],
  [
    'card 85',
    () => ({
      ops: CARD85_OPS,
      byKey: CARD85_SEAMS,
      poses: new Map(),
      geoms: card85Geoms(),
      innerLines: new Map(),
      pieceKeys: CARD85_PIECE_KEYS,
    }),
  ],
  ['card 90', card90],
];

/** How far a block's pieces moved against each other, mm, since the step that made the block. */
function relativeMoveMm(
  block: { inputKey: string; pieces: readonly string[] },
  index: number,
  all: ReturnType<typeof stepResults>,
  ops: readonly FormOpLike[],
) {
  const producer = ops
    .slice(0, index)
    .findLastIndex((op) => (op.outputUnitKey ?? '').trim() === block.inputKey);
  if (producer < 0) return 0;
  const relative = (T: ReadonlyMap<string, Affine>, piece: string) => {
    const base = T.get(block.pieces[0]);
    const own = T.get(piece);
    return base && own ? compose(invert(base), own) : null;
  };
  let worst = 0;
  for (const piece of block.pieces) {
    const now = relative(all[index].layout.T, piece);
    const was = relative(all[producer].layout.T, piece);
    if (now && was) worst = Math.max(worst, Math.hypot(now[4] - was[4], now[5] - was[5]));
  }
  return worst;
}

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

  describe.each(CARDS)('%s', (_, inputOf) => {
    const input = inputOf();
    const all = stepResults(input, OWNER_FIT);

    it('draws one picture on picker, tile, quiz and map', () => {
      input.ops.forEach((_op, index) => {
        const expected = stepPictureOf(all, index);
        expect(expected?.layout).toBe(all[index].layout);
        expectSamePicture(mapStepPictureOf(all, index), expected);
      });
    });

    it('never moves the pieces of a carried block against each other', () => {
      all.forEach((result, index) => {
        for (const block of result.blocks) {
          const moved = relativeMoveMm(block, index, all, input.ops);
          expect(moved, `op ${input.ops[index].operationNumber} ${block.inputKey}`).toBeLessThan(
            0.5,
          );
        }
      });
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
