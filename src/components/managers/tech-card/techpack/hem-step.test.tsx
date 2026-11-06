import { describe, expect, it } from 'vitest';

import type { common_TechCard } from 'api/proto-http/admin';
import { segmentPiece } from 'lib/assembly-skeleton/geometry/segment';
import type { PieceDTO } from 'lib/nesting/types';

import { deriveAssembly, type AsmPiece } from './derive-assembly';
import { GapSink } from './gaps';
import { hemFinishWords, isHemStep } from './hem-step';
import { editorActionMarks } from './pages/assembly';

const KEY = 'PANEL';
/** Corners in cm, CCW: flat bottom, slanted shoulder on top. */
const CORNERS = [
  [0, 0],
  [33, 0],
  [33, 45],
  [20, 65],
  [0, 60],
];

function panel(): AsmPiece {
  const geom = segmentPiece({
    pieceKey: KEY,
    name: 'panel',
    piece: {
      name: 'panel',
      layer: '1',
      poly: CORNERS.map(([x, y]) => ({ x, y })),
      inner: [],
    } as unknown as PieceDTO,
    piecesPerGarment: 1,
    cutSymmetry: null,
    cloth: null,
    fused: false,
  });
  return {
    key: KEY,
    code: 'P',
    name: 'panel',
    geom,
    cut: geom.rs.map(([x, y]) => [x, -y]),
    inner: [],
    notch: [],
    pocketing: false,
    area: 1,
  };
}

function derive(
  op: Record<string, unknown>,
  card: { sa?: string; pieces?: boolean } = {},
): { model: ReturnType<typeof deriveAssembly>; codes: string[] } {
  const techCard = {
    techCard: {
      pieces: [{ lineKey: KEY, name: 'panel' }],
      requiredSeamAllowanceMm: card.sa ? { value: card.sa } : undefined,
      operations: [
        {
          operationNumber: 10,
          operationType: 'TECH_CARD_OPERATION_TYPE_MACHINE',
          machineType: 'TECH_CARD_MACHINE_TYPE_LOCKSTITCH',
          inputKeys: [KEY],
          ...op,
        },
      ],
    },
  } as unknown as common_TechCard;
  const sink = new GapSink();
  const pieces = new Map(card.pieces === false ? [] : [[KEY, panel()] as const]);
  const model = deriveAssembly({ techCard, pieces, grainDeg: new Map() }, sink);
  return { model, codes: model.gaps.map((gap) => gap.code) };
}

const HEM = {
  work: 'hem_turned',
  seamKind: 'hem_closed',
  seamClass: 'TECH_CARD_SEAM_CLASS_EF_HEM_TURNED',
};

describe('hem step recognition', () => {
  it('reads work, kind and class, which disagree on real cards', () => {
    expect(isHemStep({ work: 'hem_turned', seamClass: 'TECH_CARD_SEAM_CLASS_SS_PLAIN' })).toBe(
      true,
    );
    expect(isHemStep({ work: 'moscow_hem' })).toBe(true);
    expect(
      isHemStep({ work: 'coverstitch', seamClass: 'TECH_CARD_SEAM_CLASS_EF_HEM_TURNED' }),
    ).toBe(true);
    expect(isHemStep({ work: 'join_lockstitch', seamKind: 'blind_hem' })).toBe(true);
  });

  it('leaves other steps alone, an overlocked edge in a hem class included', () => {
    expect(isHemStep({ work: 'topstitch', seamClass: 'TECH_CARD_SEAM_CLASS_SS_PLAIN' })).toBe(
      false,
    );
    expect(
      isHemStep({ seamKind: 'edge_overlock', seamClass: 'TECH_CARD_SEAM_CLASS_EF_HEM_RAW' }),
    ).toBe(false);
    expect(isHemStep({})).toBe(false);
  });

  it('takes the words from the kind, then the class', () => {
    expect(hemFinishWords(HEM)).toBe('Turned twice, closed edge');
    expect(hemFinishWords({ seamClass: 'TECH_CARD_SEAM_CLASS_EF_HEM_TURNED' })).toBe(
      'Turned twice',
    );
    expect(hemFinishWords({ seamKind: 'blind_hem' })).toBe('Blind hem');
    expect(hemFinishWords({ work: 'hem_turned' })).toBe('');
  });
});

describe('hem step on paper', () => {
  it('prints finish and depth once, without the class line', () => {
    const { model } = derive({ ...HEM, seamAllowanceMm: { value: '35' } });
    const words = model.words.get(10);
    expect(words?.hem).toBe('Turned twice, closed edge · 35 mm');
    expect(words?.params.join(' · ')).not.toContain('EF');
    expect(words?.tool).toEqual([]);
  });

  it('keeps a stored 0, falls back to the card standard, else a gap', () => {
    expect(
      derive({ ...HEM, seamAllowanceMm: { value: '0' } }, { sa: '7' }).model.words.get(10)?.hem,
    ).toBe('Turned twice, closed edge · 0 mm');
    expect(derive(HEM, { sa: '7' }).model.words.get(10)?.hem).toBe(
      'Turned twice, closed edge · 7 mm',
    );
    const empty = derive(HEM);
    expect(empty.model.words.get(10)?.hem).toBe('Turned twice, closed edge');
    expect(empty.codes).toContain('pdf_sa_missing');
  });

  it('survives a step with no kind and no class', () => {
    const { model } = derive({ work: 'hem_turned' }, { sa: '7' });
    expect(model.words.get(10)?.hem).toBe('7 mm');
  });

  it('marks the computed bottom edge and its depth', () => {
    const { model, codes } = derive({ ...HEM, seamAllowanceMm: { value: '35' } });
    const action = model.rows[0].action;
    expect(codes).not.toContain('asm_hem_edge_unknown');
    expect(action?.hem).toEqual({ status: 'computed', depth: '35' });
    const ys = action?.edgeParts.flatMap((part) => part.pts.map(([, y]) => y)) ?? [];
    expect(ys.length).toBeGreaterThan(0);
    for (const y of ys) expect(Math.abs(y)).toBeLessThan(1);

    const geoms = new Map([...model.pieces].map(([k, p]) => [k, { rs: p.geom.rs }]));
    const marks = editorActionMarks(action, geoms);
    expect(marks.lines.map((line) => [line.weight, line.kind])).toEqual([['heavy', 'hem-line']]);
    expect(marks.dims?.map((dim) => dim.text)).toEqual(['35']);
  });

  it('draws no line and leaves a gap when the edge is unknown', () => {
    const { model, codes } = derive(
      { ...HEM, seamAllowanceMm: { value: '35' } },
      { pieces: false },
    );
    expect(model.rows[0].action?.hem).toEqual({ status: 'unknown' });
    expect(model.rows[0].action?.edgeParts).toEqual([]);
    expect(codes).toContain('asm_hem_edge_unknown');
    expect(model.words.get(10)?.hem).toBe('Turned twice, closed edge · 35 mm');
  });

  it('does not touch a plain step', () => {
    const { model, codes } = derive({
      work: 'join_lockstitch',
      seamKind: 'seam_edge',
      seamClass: 'TECH_CARD_SEAM_CLASS_SS_PLAIN',
    });
    expect(model.words.get(10)?.hem).toBeUndefined();
    expect(model.words.get(10)?.params.join(' · ')).toContain('SS');
    expect(model.rows[0].action?.hem).toBeUndefined();
    expect(codes).not.toContain('asm_hem_edge_unknown');
  });
});
