import { describe, expect, it } from 'vitest';

import { mergeSeamHints, seamHintsSchema } from 'lib/seam-hints';
import recordedFixture from 'lib/seam-hints/__fixtures__/card6.json';

import { joinWords, roleReader } from './hint-words';

const hints = mergeSeamHints(seamHintsSchema.parse(recordedFixture), []);
const roleOf = roleReader(hints, []);
const wordsOf = (op: number) => {
  const row = hints.joins.find((join) => join.op === op);
  if (!row) throw new Error(`no join ${op}`);
  const { what, where } = joinWords(row, roleOf);
  return `${what} → ${where}`;
};

describe('joinWords on the recorded card 6 run', () => {
  it('says a place word alone', () => {
    expect(wordsOf(720)).toBe('placket → front edge');
  });

  it('puts the roles in front of a generic edge word', () => {
    expect(wordsOf(870)).toBe('collar → collar curved');
    expect(wordsOf(260)).toMatch(/^placket → .*slit$/);
  });

  it('an owner role fix speaks before the model', () => {
    const own = roleReader(hints, [
      { kind: 'role', hint_key: 'PLCK_L', value: { role: 'facing', hand: 'L' }, state: 'fixed' },
    ]);
    const row = hints.joins.find((join) => join.op === 720)!;
    expect(joinWords(row, own).what).toBe('facing');
  });
});
