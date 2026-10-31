import { describe, expect, it } from 'vitest';

import type { PieceGeom } from 'lib/assembly-skeleton/types';

import {
  buildSeamHintsInput,
  cardSources,
  keyedSeamHints,
  sketchIdsOf,
  withSeamHints,
} from './input';
import { mergeSeamHints } from './merge';

const rect = (w: number, h: number) =>
  ({
    rs: [
      [0, 0],
      [w, 0],
      [w, h],
      [0, h],
    ],
    areaMm2: w * h + 0.4,
    perimMm: 2 * (w + h) + 0.4,
  }) as unknown as PieceGeom;

describe('buildSeamHintsInput', () => {
  const built = buildSeamHintsInput(
    [
      {
        key: 'k1',
        name: 'PLCK_L',
        purpose: 'TECH_CARD_BOM_PURPOSE_MAIN',
        geom: rect(40, 600),
        notches: 3,
      },
      {
        key: 'k2',
        name: 'P_L_MAIN',
        symmetry: 'TECH_CARD_PIECE_CUT_SYMMETRY_MIRRORED',
        dictRole: 'front',
        geom: rect(300, 600),
      },
      { key: 'k3', name: 'P_L_MAIN', purpose: 'TECH_CARD_BOM_PURPOSE_UNSET' },
      { key: 'k4', name: '' },
    ],
    [
      {
        operationNumber: 10,
        zone: 'TECH_CARD_GARMENT_ZONE_FRONT',
        work: 'join',
        inputKeys: ['k2', 'k3'],
        outputUnitKey: 'u1',
        outputUnitName: 'FRONT',
      },
      {
        operationNumber: 20,
        operationType: 'TECH_CARD_OPERATION_TYPE_SEW',
        inputKeys: ['k1', 'u1', 'gone'],
        outputUnitKey: 'u2',
      },
      { operationNumber: 0, inputKeys: ['k1'] },
    ],
    [5, 5, 0, 7, 8, 9, 10],
  );

  it('sends card names, made unique, never line keys', () => {
    expect(built.input.pieces.map((p) => p.name)).toEqual([
      'PLCK_L',
      'P_L_MAIN',
      'P_L_MAIN_2',
      'PIECE 4',
    ]);
    expect(built.keyOfName.get('P_L_MAIN_2')).toBe('k3');
  });

  it('reads the shape summary and bare enum words', () => {
    expect(built.input.pieces[0]).toMatchObject({
      purpose: 'main',
      aspect: 15,
      area: 24000,
      perimeter: 1280,
      notches: 3,
    });
    expect(built.input.pieces[1]).toMatchObject({
      symmetry: 'mirrored',
      dict_role: 'front',
      aspect: 2,
    });
    expect(built.input.pieces[2]).toMatchObject({ purpose: '', aspect: 0, area: 0 });
  });

  it('names units and expands inputs through them', () => {
    expect(built.input.units).toEqual([
      { name: 'FRONT', inputs: ['P_L_MAIN', 'P_L_MAIN_2'] },
      { name: 'UNIT 2', inputs: ['PLCK_L', 'FRONT'] },
    ]);
    expect(built.input.ops).toEqual([
      {
        number: 10,
        zone: 'front',
        work: 'join',
        operation_type: '',
        inputs: ['P_L_MAIN', 'P_L_MAIN_2'],
        output: 'FRONT',
      },
      {
        number: 20,
        zone: '',
        work: '',
        operation_type: 'sew',
        inputs: ['PLCK_L', 'FRONT'],
        output: 'UNIT 2',
      },
    ]);
    expect(built.piecesOfName.get('UNIT 2')).toEqual(['k1', 'k2', 'k3']);
  });

  it('keeps at most four distinct sketches', () => {
    expect(built.input.sketch_media_ids).toEqual([5, 7, 8, 9]);
  });
});

describe('the way back to the seam model', () => {
  const keyOfName = new Map([
    ['PLCK_L', 'k1'],
    ['P_L_MAIN', 'k2'],
  ]);
  const hints = mergeSeamHints(
    {
      schema_version: 1,
      roles: [
        { piece: 'PLCK_L', role: 'placket', hand: 'L', conf: 'high' },
        { piece: 'NOPE', role: 'back', hand: null, conf: 'low' },
      ],
      joins: [
        {
          op: 10,
          a: { pieces: ['PLCK_L'], edge: 'long' },
          b: { pieces: ['P_L_MAIN'], edge: 'front_edge' },
          relation: 'boundary',
          conf: 'medium',
        },
        {
          op: 20,
          a: { pieces: ['NOPE'], edge: 'long' },
          b: { pieces: ['P_L_MAIN'], edge: 'side' },
          relation: 'boundary',
          conf: 'low',
        },
      ],
      not_inferred: [],
    },
    [],
  );

  it('turns names into keys and drops rows about pieces the card lost', () => {
    const keyed = keyedSeamHints(hints, keyOfName);
    expect(keyed.roles.map((r) => r.piece)).toEqual(['k1']);
    expect(keyed.joins).toHaveLength(1);
    expect(keyed.joins[0].a.pieces).toEqual(['k1']);
    expect(keyed.joins[0].b.pieces).toEqual(['k2']);
  });

  it('attaches hints only to steps with a live row; none → the same array', () => {
    const ops = [{ operationNumber: 10 }, { operationNumber: 30 }];
    const out = withSeamHints(ops, keyedSeamHints(hints, keyOfName));
    expect(out[0]).toHaveProperty('hints');
    expect(out[1]).toBe(ops[1]);
    expect(withSeamHints(ops, null)).toBe(ops);
    const off = mergeSeamHints(null, [{ kind: 'join', hint_key: '10', value: null, state: 'off' }]);
    expect(withSeamHints(ops, off)).toBe(ops);
  });
});

describe('cardSources', () => {
  it('reads the saved card, BOM purpose and DXF counts', () => {
    const card = {
      techCard: {
        pieces: [
          { lineKey: 'k1', name: 'FLP_R_MAIN', fused: true, materials: [{ bomLineKey: 'b1' }] },
        ],
        bomItems: [{ lineKey: 'b1', purpose: 'TECH_CARD_BOM_PURPOSE_MAIN' }],
        operations: [{ operationNumber: 10 }],
      },
      resolvedTechnicalMedia: [
        { media: { id: 3 }, kind: 'TECH_CARD_MEDIA_KIND_DETAIL' },
        { media: { id: 2 }, kind: 'TECH_CARD_MEDIA_KIND_BACK' },
        { media: { id: 1 }, kind: 'TECH_CARD_MEDIA_KIND_FRONT' },
      ],
    };
    const shapes = new Map([['k1', { geom: rect(10, 20), inner: [1, 2], notch: [1] }]]);
    const out = cardSources(card, shapes, () => 'placket');
    expect(out.pieces[0]).toMatchObject({
      key: 'k1',
      purpose: 'TECH_CARD_BOM_PURPOSE_MAIN',
      fused: true,
      dictRole: 'placket',
      notches: 1,
      innerLines: 2,
    });
    expect(out.sketchMediaIds).toEqual([1, 2, 3]);
    expect(sketchIdsOf({})).toEqual([]);
  });
});
