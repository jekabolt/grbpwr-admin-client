import { afterEach, describe, expect, it } from 'vitest';

import { mergeSeamHints, seamHintsSchema } from 'lib/seam-hints';
import recordedFixture from 'lib/seam-hints/__fixtures__/card6.json';
import { setOwnerCodes } from 'lib/seam-hints/dictionary';

import { joinWords, roleReader, roleView } from './hint-words';

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

describe('role precedence: own > DB dictionary row > AI > static default', () => {
  afterEach(() => setOwnerCodes([]));
  const aiRole = (piece: string) => hints.roles.find((row) => row.piece === piece);

  it('the AI beats the static default', () => {
    // P_L_U reads «front» by the static codes (first token p); the model said yoke.
    expect(roleView('P_L_U', undefined, undefined)?.src).toBe('book');
    expect(roleView('P_L_U', aiRole('P_L_U'), undefined)).toMatchObject({
      role: 'yoke',
      src: 'ai',
    });
  });

  it('a DB dictionary row beats the AI', () => {
    setOwnerCodes([{ code: 'BP', role: 'back', hand: null }]);
    expect(roleView('BP_U', aiRole('BP_U'), undefined)).toMatchObject({ role: 'back', src: 'all' });
  });

  it('the static default speaks only when the AI has no role', () => {
    expect(aiRole('BP_MAIN')).toBeUndefined();
    expect(roleView('BP_MAIN', undefined, undefined)?.src).toBe('book');
  });
});
