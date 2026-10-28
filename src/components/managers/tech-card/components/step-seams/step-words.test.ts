import { describe, expect, it } from 'vitest';

import { BUNDLED_WORK_CATALOG } from '../operation-work';
import { CARD77_OPS, card77Step } from './card77.fixture';
import { stepWords } from './step-words';

describe('stepWords', () => {
  const op = { ...CARD77_OPS[card77Step(1020)], zone: 'TECH_CARD_GARMENT_ZONE_ARMHOLE' };

  it('card 77’s op 1020 reads as the rows do: the catalog’s word for the work, then the zone', () => {
    expect(stepWords(op, BUNDLED_WORK_CATALOG)).toBe('Join / seam · armhole');
  });

  it('no step, no words', () => {
    expect(stepWords(undefined, BUNDLED_WORK_CATALOG)).toBe('');
  });
});
