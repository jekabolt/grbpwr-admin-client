import { describe, expect, it } from 'vitest';

import {
  CARD6_CHAIN_OPS,
  CARD6_CHAIN_PIECE_KEYS,
  CARD6_CHAIN_POSES,
  CARD6_CHAIN_SEAMS,
  card6ChainGeoms,
  card6ChainInnerLines,
  card6ChainStep,
} from './card6-chain.fixture';
import { OWNER_FIT, stepResults } from './step-result';
import { stepPictureOf, unitPictureOf } from './surface-picture';

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

describe('surface pictures', () => {
  it('returns the operation result layout and layers by identity', () => {
    const index = card6ChainStep(430);
    const picture = stepPictureOf(results, index);

    expect(picture?.layout).toBe(results[index].layout);
    expect(picture?.layers).toBe(results[index].layers);
    expect(stepPictureOf(results, -1)).toBeNull();
    expect(stepPictureOf(null, index)).toBeNull();
  });

  it('returns the latest matching producer before the consumer', () => {
    const first = card6ChainStep(380);
    const second = card6ChainStep(430);
    const ops = CARD6_CHAIN_OPS.map((op, index) =>
      index === second ? { ...op, outputUnitKey: 'SLEEVE-2' } : op,
    );

    expect(unitPictureOf(results, ops, 'SLEEVE-2', second)?.layout).toBe(results[first].layout);
    expect(unitPictureOf(results, ops, ' SLEEVE-2 ')?.layout).toBe(results[second].layout);
    expect(unitPictureOf(results, ops, 'missing')).toBeNull();
    expect(unitPictureOf(null, ops, 'SLEEVE-2')).toBeNull();
  });
});
