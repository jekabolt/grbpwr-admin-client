import { describe, expect, it } from 'vitest';

import { mergeSeamHints } from './merge';
import {
  seamHintOverrideSchema,
  seamHintsSchema,
  type SeamHintOverride,
  type SeamHintsJson,
} from './schema';

const ai: SeamHintsJson = {
  schema_version: 1,
  roles: [{ piece: 'FLP_R_MAIN', role: 'flap', hand: 'R', conf: 'medium', why: 'name' }],
  joins: [
    {
      op: 260,
      a: { pieces: ['FLP_R_MAIN'], edge: 'long' },
      b: { pieces: ['SLV_R'], edge: 'slit' },
      relation: 'surface',
      conf: 'medium',
    },
  ],
  not_inferred: ['op:1060'],
};

const role = (state: SeamHintOverride['state'], piece = 'FLP_R_MAIN'): SeamHintOverride => ({
  kind: 'role',
  hint_key: piece,
  value_json: { role: 'placket', hand: 'R', conf: 'high', why: 'owner' },
  state,
});

describe('seam hints schemas', () => {
  it('accepts schema version 1 and rejects words outside the closed vocabularies', () => {
    expect(seamHintsSchema.parse(ai)).toEqual(ai);
    expect(() =>
      seamHintsSchema.parse({
        ...ai,
        joins: [{ ...ai.joins[0], a: { pieces: ['FLP_R_MAIN'], edge: 'diagonal' } }],
      }),
    ).toThrow();
  });

  it('uses a piece key for roles and a decimal operation key for joins', () => {
    expect(seamHintOverrideSchema.parse(role('ok'))).toMatchObject({ kind: 'role' });
    expect(() =>
      seamHintOverrideSchema.parse({
        kind: 'join',
        hint_key: 'op:260',
        value_json: ai.joins[0],
        state: 'fixed',
      }),
    ).toThrow();
  });
});

describe('mergeSeamHints', () => {
  it('marks untouched run rows as AI', () => {
    const out = mergeSeamHints(ai, []);
    expect(out.roles[0].state).toBe('ai');
    expect(out.joins[0].state).toBe('ai');
    expect(out.not_inferred).toEqual(['op:1060']);
  });

  it('lets the owner replace AI rows and add rows absent from the run', () => {
    const out = mergeSeamHints(ai, [role('fixed'), role('ok', 'FLP_L_MAIN')]);
    expect(out.roles).toEqual([
      {
        piece: 'FLP_R_MAIN',
        role: 'placket',
        hand: 'R',
        conf: 'high',
        why: 'owner',
        state: 'fixed',
      },
      {
        piece: 'FLP_L_MAIN',
        role: 'placket',
        hand: 'R',
        conf: 'high',
        why: 'owner',
        state: 'ok',
      },
    ]);
  });

  it('keeps off as an inert tombstone and later owner rows win', () => {
    const out = mergeSeamHints(ai, [role('fixed'), role('off')]);
    expect(out.roles).toHaveLength(1);
    expect(out.roles[0]).toMatchObject({ piece: 'FLP_R_MAIN', state: 'off' });
  });

  it('builds a valid empty effective value without an AI run', () => {
    expect(mergeSeamHints(undefined, [])).toEqual({
      schema_version: 1,
      roles: [],
      joins: [],
      not_inferred: [],
    });
  });
});
