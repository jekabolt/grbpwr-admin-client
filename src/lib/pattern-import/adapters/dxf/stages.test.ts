import { describe, expect, it } from 'vitest';

import type { PieceFamily, PieceSpec } from '../../types';
import { dxfWrittenPresegmentedIdentities } from './stages';

const family = (seed: number, identity: string, exactLabel = false) =>
  ({
    seed,
    candidates: [
      {
        dxf: {
          identity,
          identitySource: exactLabel ? 'label' : 'block-name',
          sizeSource: exactLabel ? 'label' : 'block-name',
        },
      },
    ],
  }) as unknown as PieceFamily;

const written = (seed: number, identity: string) =>
  ({ seed, identity }) as Pick<PieceSpec, 'seed' | 'identity'>;

describe('DXF pre-segmented identities', () => {
  it('carries card and label proof across semantic renames only', () => {
    const families = [
      family(1, 'FLAP_L'),
      family(2, 'PCK_BACK_L'),
      family(3, 'FP_XS'),
      family(4, 'LABEL_L', true),
    ];
    expect(
      dxfWrittenPresegmentedIdentities(
        families,
        [written(1, 'PCK_L'), written(2, 'BP_L'), written(3, 'FP_XS'), written(4, 'PLCK_L')],
        ['FLAP_L', 'PCK_BACK_L'],
      ),
    ).toEqual(['BP_L', 'PCK_L', 'PLCK_L']);
  });
});
