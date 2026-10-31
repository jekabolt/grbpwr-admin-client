import { describe, expect, it } from 'vitest';

import { EMPTY_SEAM_HINTS, mergeSeamHints, seamHintsSchema, type SeamHints } from 'lib/seam-hints';

import { CARD6_OPS, CARD6_PIECE_KEYS, CARD6_SEAMS, card6Geoms, card6Step } from '../card6.fixture';
import {
  easeOf,
  suggestStepPairs,
  suggestStepSurface,
  usedEdgesBeforeStep,
  type FormOpLike,
} from '../step-seams-model';
import handFixture from 'lib/seam-hints/__fixtures__/card6-hand.json';
import { aiSignal, AI_MATCH, AI_MISMATCH } from './ai';
import { edgeWordVote } from './edge-words';
import type { SignalSide } from './types';

const geoms = card6Geoms();
const hints = mergeSeamHints(seamHintsSchema.parse(handFixture), []);

type OpWithHints = FormOpLike & { hints?: SeamHints };
const opsWith = (value: SeamHints): OpWithHints[] =>
  CARD6_OPS.map((op) => ({ ...op, hints: value }));

const side = (...ids: string[]): SignalSide => {
  const edges = ids.map((id) => {
    const geom = geoms.get(id.slice(0, id.lastIndexOf('#')));
    const edge = geom?.edges.find((candidate) => candidate.id === id);
    if (!edge) throw new Error(`no edge ${id}`);
    return edge;
  });
  return {
    ids,
    pieces: [...new Set(edges.map((edge) => edge.pieceKey))],
    lenMm: edges.reduce((sum, edge) => sum + edge.lenMm, 0),
    turnDeg: edges.reduce((sum, edge) => sum + edge.turnDeg, 0),
  };
};

const proposal = (ops: readonly FormOpLike[], operationNumber: number) => {
  const index = card6Step(operationNumber);
  return suggestStepPairs(
    ops,
    index,
    CARD6_PIECE_KEYS,
    geoms,
    usedEdgesBeforeStep(ops, index, CARD6_SEAMS),
    easeOf(ops[index]),
    CARD6_SEAMS,
  )[0];
};

const surface = (ops: readonly FormOpLike[], operationNumber: number) =>
  suggestStepSurface(ops, card6Step(operationNumber), CARD6_PIECE_KEYS, geoms, CARD6_SEAMS);

describe('AI seam signal: edge words', () => {
  it('recognises the card 6 centre-front chain and abstains on unknown words', () => {
    expect(edgeWordVote('front_edge', side('P_L_U#2', 'P_L_MAIN#2'), geoms)).toBe(true);
    expect(edgeWordVote('front_edge', side('PCK_L_MAIN#2'), geoms)).not.toBe(true);
    expect(edgeWordVote('future_word', side('P_L_MAIN#2'), geoms)).toBeNull();
  });

  it('recognises relative top/bottom, curves, and inner-line sleeve slits', () => {
    expect(edgeWordVote('bottom', side('P_R_U#4'), geoms)).toBe(true);
    expect(edgeWordVote('top', side('P_R_MAIN#1'), geoms)).toBe(true);
    expect(edgeWordVote('neckline', side('clr_main#2', 'clr_main_2#2'), geoms)).toBe(true);
    const slit: SignalSide = {
      ids: ['SLV_R:i0'],
      pieces: ['SLV_R'],
      lenMm: 0,
      turnDeg: 0,
    };
    expect(edgeWordVote('slit', slit, geoms)).toBe(true);
    expect(edgeWordVote('inner_line', slit, geoms)).toBe(true);
  });
});

describe('AI seam signal: card 6 owner truth', () => {
  const ops = opsWith(hints);

  it('rewards the named pair in either orientation and penalises a different pair', () => {
    const front = side('P_L_U#2', 'P_L_MAIN#2');
    const placket = side('PLCK_L#0');
    const ctx = { op: ops[card6Step(720)], geoms };
    expect(aiSignal(placket, front, ctx)?.delta).toBe(AI_MATCH);
    expect(aiSignal(front, placket, ctx)?.delta).toBe(AI_MATCH);
    expect(aiSignal(side('PLCK_L#3'), side('PCK_L_MAIN#2'), ctx)?.delta).toBe(AI_MISMATCH);
  });

  it('is silent for an off row', () => {
    const off: SeamHints = {
      ...hints,
      joins: hints.joins.map((row) => (row.op === 720 ? { ...row, state: 'off' } : row)),
    };
    expect(
      aiSignal(side('PLCK_L#0'), side('P_L_U#2', 'P_L_MAIN#2'), {
        op: opsWith(off)[card6Step(720)],
        geoms,
      }),
    ).toBeNull();
  });

  it('720 ranks the placket on the centre-front chain first', () => {
    expect(proposal(ops, 720)).toMatchObject({
      a: ['PLCK_L#0'],
      b: ['P_L_U#2', 'P_L_MAIN#2'],
    });
  });

  it('770 ranks the yoke/main-front boundary above the pocket layers', () => {
    expect(proposal(ops, 770)).toMatchObject({ a: ['P_R_U#4'], b: ['P_R_MAIN#1'] });
  });

  it('870 ranks the stand against the main-collar neckline first', () => {
    const suggested = proposal(ops, 870)!;
    expect([suggested.a, suggested.b]).toContainEqual(['CLR_SECOND#1']);
    expect([suggested.a, suggested.b]).toContainEqual(['clr_main#2', 'clr_main_2#2']);
  });

  it('260 remains the model surface proposal onto the sleeve slit', () => {
    expect(proposal(ops, 260)).toBeUndefined();
    expect(surface(ops, 260)).toMatchObject({ host: 'SLV_R', inner: 0, part: 'FLP_R_MAIN' });
  });
});

describe('AI seam signal: absent hints', () => {
  it('an empty typed value produces exactly the baseline proposals on every card 6 step', () => {
    const empty = opsWith(EMPTY_SEAM_HINTS);
    const results = (ops: readonly FormOpLike[]) =>
      CARD6_OPS.map((op) => {
        const operationNumber = op.operationNumber!;
        const pairs = suggestStepPairs(
          ops,
          card6Step(operationNumber),
          CARD6_PIECE_KEYS,
          geoms,
          usedEdgesBeforeStep(ops, card6Step(operationNumber), CARD6_SEAMS),
          easeOf(op),
          CARD6_SEAMS,
        );
        return {
          operationNumber,
          pairs,
          surface: pairs.length ? null : surface(ops, operationNumber),
        };
      });
    expect(results(empty)).toEqual(results(CARD6_OPS));
  });
});
