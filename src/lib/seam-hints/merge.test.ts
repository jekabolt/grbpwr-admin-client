import { describe, expect, it } from 'vitest';

import { mergeSeamHints } from './merge';
import {
  overrideFromWire,
  overrideValueJson,
  parseSeamHintsJson,
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
  value: { role: 'placket', hand: 'R' },
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
        value: { a: ai.joins[0].a, b: ai.joins[0].b, relation: 'surface' },
        state: 'fixed',
      }),
    ).toThrow();
  });

  it('reads the server run row by row: an unknown word drops its row, not the run', () => {
    const raw = JSON.stringify({
      ...ai,
      roles: [...ai.roles, { piece: 'X', role: 'wing', hand: '', conf: 'low' }],
      joins: [{ ...ai.joins[0], why: 'slit' }],
    });
    const run = parseSeamHintsJson(raw);
    expect(run?.roles.map((row) => row.piece)).toEqual(['FLP_R_MAIN']);
    expect(run?.joins[0].why).toBe('slit');
    expect(parseSeamHintsJson('')).toBeNull();
    expect(parseSeamHintsJson('{"schema_version":2,"roles":[]}')).toBeNull();
  });

  it('reads wire overrides: an empty value only with off, hand "" as null', () => {
    expect(
      overrideFromWire({
        kind: 'role',
        hintKey: 'FLP_R',
        valueJson: '{"role":"placket","hand":""}',
        state: 'fixed',
      }),
    ).toEqual({
      kind: 'role',
      hint_key: 'FLP_R',
      value: { role: 'placket', hand: null },
      state: 'fixed',
    });
    expect(overrideFromWire({ kind: 'join', hintKey: '260', valueJson: '', state: 'off' })).toEqual(
      {
        kind: 'join',
        hint_key: '260',
        value: null,
        state: 'off',
      },
    );
    expect(
      overrideFromWire({ kind: 'join', hintKey: '260', valueJson: '', state: 'ok' }),
    ).toBeNull();
    expect(overrideValueJson(role('ok'))).toBe('{"role":"placket","hand":"R"}');
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
      { piece: 'FLP_R_MAIN', role: 'placket', hand: 'R', conf: 'high', state: 'fixed' },
      { piece: 'FLP_L_MAIN', role: 'placket', hand: 'R', conf: 'high', state: 'ok' },
    ]);
  });

  it('keeps off as an inert tombstone and later owner rows win', () => {
    const out = mergeSeamHints(ai, [role('fixed'), role('off')]);
    expect(out.roles).toHaveLength(1);
    expect(out.roles[0]).toMatchObject({ piece: 'FLP_R_MAIN', state: 'off' });
  });

  it('an off row without a value keeps the AI words under it, and vanishes with no AI row', () => {
    const off: SeamHintOverride = { kind: 'join', hint_key: '260', value: null, state: 'off' };
    expect(mergeSeamHints(ai, [off]).joins[0]).toMatchObject({ op: 260, state: 'off' });
    expect(mergeSeamHints(ai, [off]).joins[0].a.edge).toBe('long');
    expect(mergeSeamHints(null, [off]).joins).toEqual([]);
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
