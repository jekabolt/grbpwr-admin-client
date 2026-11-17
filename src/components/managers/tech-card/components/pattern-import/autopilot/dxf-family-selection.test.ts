import { describe, expect, it } from 'vitest';
import { planScopes, PURPOSE } from 'lib/pattern-import/fabrics/scope';
import { squareSpec } from 'lib/pattern-import/gate';
import type { FabricAssignment, ImportSession } from 'lib/pattern-import/types';
import type { Inputs } from '../use-import-session';
import { replayAnswer, type Prior } from './replay';

const main = {
  scopeKey: 'main',
  fabricPurpose: PURPOSE.main,
  bomLineKey: 'bom-main',
  label: 'Main',
  isInterlining: false,
};
const unedited: FabricAssignment = {
  byPurpose: { main: [0, 1] },
  interliningInBom: false,
  proposals: [],
};
const piece = squareSpec();
const familySizes = [
  { ...piece.sizes[0], sizeToken: 'S' },
  { ...piece.sizes[0], sizeToken: 'M', rank: 1 },
];
const pieces = [
  { ...piece, seed: 0, identity: 'FP', sizes: familySizes },
  { ...piece, seed: 1, identity: 'PK_L', sizes: familySizes },
  { ...piece, seed: 1, identity: 'PK_R', sizes: familySizes },
];

describe('DXF family selection', () => {
  it('writes the included families at every size and restores both hands when re-included', () => {
    const selected = planScopes(
      pieces,
      { ...unedited, dxfOmissions: { scopeKey: 'main', seeds: [1] } },
      [main],
    );
    expect(selected.problems).toEqual([]);
    expect(selected.scopes[0].specs.map((spec) => spec.identity)).toEqual(['FP']);
    expect(selected.scopes[0].specs[0].sizes).toEqual(familySizes);
    expect(
      planScopes(pieces, unedited, [main]).scopes[0].specs.map((spec) => spec.identity),
    ).toEqual(['FP', 'PK_L', 'PK_R']);
  });

  it('still blocks unassigned pieces, all omitted, and stale source selections', () => {
    expect(
      planScopes(pieces, { ...unedited, byPurpose: { main: [0] } }, [main]).problems[0]?.kind,
    ).toBe('no-fabric');
    for (const dxfOmissions of [
      { scopeKey: 'main', seeds: [0, 1] },
      { scopeKey: 'main', seeds: [3] },
      { scopeKey: 'pocketing', seeds: [1] },
    ]) {
      const plan = planScopes(pieces, { ...unedited, dxfOmissions }, [main]);
      expect(plan.scopes).toEqual([]);
      expect(plan.problems[0]?.kind).toBe('selection');
    }
  });

  it('does not replace an omitted drawn hand with a manufactured mirror', () => {
    const pair = [
      { ...pieces[1], seed: 0, pairHand: 'L' as const, pairOf: 'PK_R' },
      { ...pieces[2], seed: 1, pairHand: 'R' as const, pairOf: 'PK_L' },
    ];
    const select = { ...unedited, dxfOmissions: { scopeKey: 'main', seeds: [1] } };
    const scope = planScopes(pair, select, [main]).scopes[0];
    expect(scope.specs).toMatchObject([{ identity: 'PK_L', pairHand: null, pairOf: null }]);
    expect(planScopes(pair, unedited, [main]).scopes[0].specs).toMatchObject([
      { identity: 'PK_L', pairHand: 'L', pairOf: 'PK_R' },
      { identity: 'PK_R', pairHand: 'R', pairOf: 'PK_L' },
    ]);
  });

  it('replays omissions only on the same input bytes and pinned fabric slot', () => {
    const snapshot = {
      session: {
        step: 'fabrics',
        fabrics: unedited,
        sheet: null,
        variant: null,
        semantics: { pieces },
      } as ImportSession,
      inputs: { autopilot: [], assignment: null } as unknown as Inputs,
      card: { techCardId: 1, scopes: [main], sizes: [], existingPieces: [], styleLabel: '' },
      baseSeeds: null,
      presegmented: true,
      dxfImportScopeKey: 'main',
      question: null,
    };
    const prior: Prior = {
      key: 'previous',
      label: 'main.dxf',
      exact: true,
      matched: 1,
      of: 1,
      files: new Map([[0, '0']]),
      answers: [
        { step: 'fabrics', kind: 'fabrics', subject: 'the pieces', value: { answered: true } },
        {
          step: 'fabrics',
          kind: 'dxf-omitted-families',
          subject: 'DXF import selection',
          value: { scopeKey: 'main', seeds: [1] },
        },
      ],
      legacy: false,
      skipped: [],
      residualMm: null,
    };
    expect(replayAnswer(snapshot, prior).answer?.events).toEqual([
      {
        type: 'fabrics',
        assignment: {
          ...unedited,
          aiOnly: [],
          dxfOmissions: { scopeKey: 'main', seeds: [1] },
        },
      },
    ]);
    expect(replayAnswer(snapshot, { ...prior, exact: false }).answer).toBeNull();
    expect(replayAnswer({ ...snapshot, dxfImportScopeKey: 'pocketing' }, prior).answer).toBeNull();
    expect(replayAnswer({ ...snapshot, presegmented: false }, prior).answer).toBeNull();
  });
});
