import { describe, expect, it } from 'vitest';

import type { PieceGeom } from 'lib/assembly-skeleton/types';

import { card77Geoms } from './card77.fixture';
import { CONFIDENT_ON, outcomeOf, T_GUESS } from './seam-ranker';
import { isLayerCloth, MIN_SUM, signalsOf, withSignals, type SignalSide } from './seam-signals';
import { zoneOf } from './signals/zone';

// Card 77 carries card 6's pattern (the same DXF), so its pieces are card 6's pieces.
const geoms = card77Geoms();
const side = (...ids: string[]): SignalSide => {
  const edges = ids.map((id) => {
    const piece = id.slice(0, id.lastIndexOf('#'));
    const e = geoms.get(piece)?.edges.find((x) => x.id === id);
    if (!e) throw new Error(`no edge ${id}`);
    return e;
  });
  return {
    ids,
    pieces: [...new Set(edges.map((e) => e.pieceKey))],
    lenMm: edges.reduce((t, e) => t + e.lenMm, 0),
    turnDeg: edges.reduce((t, e) => t + e.turnDeg, 0),
  };
};
const FRONT = { zone: 'TECH_CARD_GARMENT_ZONE_FRONT', work: 'join_lockstitch' };

describe('zone signal (card 6, step 720: placket on the left front)', () => {
  const placketOnFront = [side('PLCK_L#0'), side('P_L_U#2', 'P_L_MAIN#2')] as const;
  const placketOnPocket = [side('PLCK_L#3'), side('PCK_L_MAIN#2')] as const;

  it('rewards the placket along the centre front and penalises the placket on the pocket piece', () => {
    const good = signalsOf(...placketOnFront, { op: FRONT, geoms: geoms });
    const bad = signalsOf(...placketOnPocket, { op: FRONT, geoms: geoms });
    expect(placketOnFront[0].lenMm).toBeCloseTo(701.4, 0);
    expect(good.delta).toBeLessThan(0);
    expect(good.signals.map((s) => s.term)).toContain('zone');
    expect(bad.delta).toBeGreaterThan(0);
  });

  it('turns the starved ranking: 102 ↔ 106.9 at 0.095 no longer beats 701.4 ↔ 701.4 at 0.134', () => {
    const ranked = withSignals(
      [
        { score: 0.095, a: placketOnPocket[0], b: placketOnPocket[1], tag: 'pocket' },
        { score: 0.134, a: placketOnFront[0], b: placketOnFront[1], tag: 'front' },
      ],
      { op: FRONT, geoms },
    );
    expect(ranked[0].tag).toBe('front');
    expect(ranked[1].score).toBeGreaterThan(T_GUESS);
  });

  it('a placket short end on the front is not the placket seam', () => {
    expect(signalsOf(side('PLCK_L#1'), side('P_L_MAIN#0'), { op: FRONT, geoms: geoms }).delta).toBe(
      0,
    );
  });

  it('says nothing in a zone that names no part', () => {
    for (const zone of ['outer', 'TECH_CARD_GARMENT_ZONE_OTHER', 'lining', undefined])
      expect(signalsOf(...placketOnPocket, { op: { zone }, geoms: geoms }).delta).toBe(0);
  });

  it('reads the enum and the short spelling alike', () => {
    expect(zoneOf('TECH_CARD_GARMENT_ZONE_FRONT')).toBe('front');
    expect(zoneOf('front')).toBe('front');
  });
});

describe('cloth (D3)', () => {
  const withCloth = (map: Record<string, PieceGeom['cloth']>) =>
    new Map(
      [...geoms].map(([k, g]) => [k, map[k] !== undefined ? { ...g, cloth: map[k] } : g] as const),
    );

  it('a pocketing piece is a layer; a shell front is not', () => {
    const g = withCloth({ PCK_L_BTTM: 'pocketing', P_L_MAIN: 'main' });
    expect(isLayerCloth('PCK_L_BTTM', g)).toBe(true);
    expect(isLayerCloth('P_L_MAIN', g)).toBe(false);
  });

  it('a lining piece is a layer by its cloth, whatever its name', () => {
    expect(isLayerCloth('SLV_R', withCloth({ SLV_R: 'lining' }))).toBe(true);
  });

  it('a bag on a shell edge fits a little better than nothing', () => {
    const g = withCloth({ PCK_L_BTTM: 'pocketing', P_L_MAIN: 'main' });
    const s = signalsOf(side('P_L_MAIN#1'), side('PCK_L_BTTM#1'), {
      op: { zone: 'outer' },
      geoms: g,
    });
    expect(s.delta).toBeLessThan(0);
    expect(s.signals.map((x) => x.term)).toEqual(['cloth']);
  });
});

describe('caps', () => {
  it('bonuses together never pass the floor', () => {
    const g = new Map(
      [...geoms].map(
        ([k, v]) => [k, { ...v, cloth: k.startsWith('PCK') ? 'pocketing' : 'main' }] as const,
      ),
    );
    const s = signalsOf(side('P_L_MAIN#1'), side('PCK_L_BTTM#1'), { op: FRONT, geoms: g });
    expect(s.delta).toBeGreaterThanOrEqual(MIN_SUM);
    for (const x of s.signals) expect(Math.abs(x.delta)).toBeLessThanOrEqual(0.08);
  });
});

describe('outcome', () => {
  it('no pair → hand pick', () => {
    expect(outcomeOf(undefined).outcome).toBe('manual');
  });
  it('a pair scored past the guess line → hand pick', () => {
    expect(outcomeOf({ score: T_GUESS + 0.01 }).outcome).toBe('manual');
  });
  it('a strong lone pair is a guess until the metric turns confidence on', () => {
    const o = outcomeOf({ score: -0.2, signals: [] }, { score: 0.1 });
    expect(o.margin).toBeCloseTo(0.3);
    expect(o.outcome).toBe(CONFIDENT_ON ? 'confident' : 'guess');
  });
  it('an AI hint counts once and only where geometry already holds the pair', () => {
    const ai = { term: 'ai', delta: -0.05, reason: '' };
    const zone = { term: 'zone', delta: -0.04, reason: '' };
    expect(outcomeOf({ score: -0.1, signals: [ai, ai, zone] }).support).toBe(2);
    expect(outcomeOf({ score: T_GUESS - 0.01, signals: [ai] }).support).toBe(0);
  });
  it('a close runner-up without support is a guess', () => {
    expect(outcomeOf({ score: -0.1 }, { score: -0.09 }).outcome).toBe('guess');
  });
});
