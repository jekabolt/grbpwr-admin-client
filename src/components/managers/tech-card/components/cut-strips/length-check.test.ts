import { deriveAssembly } from 'components/managers/tech-card/techpack/derive-assembly';
import type { CutStripMark, PieceGeom } from 'lib/assembly-skeleton/types';
import { describe, expect, it } from 'vitest';

import { fittedSideMm, readStripSide, seamLengthsDiffer } from './length-check';
import type { CutStripLike } from './strip-pieces';
import { fromSeamStrip, oneLengthStrip, STRIP, waistbandCard } from './strip.fixture';

const BAND = 'band';

const geomsOf = (mark: Partial<CutStripMark> & { sewnMm: number }) =>
  new Map<string, PieceGeom>([
    [BAND, { key: BAND } as unknown as PieceGeom],
    [
      STRIP,
      {
        key: STRIP,
        cutStrip: {
          label: 'rubber',
          mode: 'from_seam',
          fitPct: 85,
          overlapMm: 30,
          widthMm: 40,
          ...mark,
        },
      } as unknown as PieceGeom,
    ],
  ]);

const cutOf = (seam: number, fit: number, overlap: number) =>
  Math.floor((seam * fit) / 100 + overlap + 0.5);

describe('the strip length rule', () => {
  it('a correct strip is never red, whatever the rounding, at no tolerance at all', () => {
    // One expect per case made 231k matcher calls and ran into the 5 s timeout under load (#291):
    // the misses are collected and asserted once, with a timeout of its own.
    let compared = 0;
    const red: string[] = [];
    for (const fit of [50, 60, 75, 85, 90, 99, 100]) {
      for (const overlap of [0, 15, 30]) {
        for (let seam = 300; seam <= 1400; seam += 0.1) {
          const sewn = cutOf(seam, fit, overlap) - overlap;
          const geoms = geomsOf({ sewnMm: sewn, fitPct: fit, overlapMm: overlap });
          compared++;
          if (seamLengthsDiffer(seam, sewn, [BAND], [STRIP], geoms, 0)) {
            red.push(`seam ${seam.toFixed(1)} fit ${fit} overlap ${overlap}`);
          }
        }
      }
    }
    expect(red.slice(0, 10)).toEqual([]);
    expect(compared).toBeGreaterThan(200_000);
  }, 30_000);

  it('the allowance is what keeps it so: without it a correct strip goes red', () => {
    // seam 790.4, fit 85, overlap 30: cut 702, sewn 672, and 672 / .85 = 790.59, which rounds to 791.
    const geoms = geomsOf({ sewnMm: 672 });
    expect(readStripSide(672, [STRIP], geoms)).toEqual({
      kind: 'through',
      lengthMm: 672 / 0.85,
      allowanceMm: 1,
    });
    expect(Math.round(672 / 0.85)).toBe(791);
    expect(Math.round(790.4)).toBe(790);
    expect(seamLengthsDiffer(790.4, 672, [BAND], [STRIP], geoms, 0)).toBe(false);
  });

  it('a wrong strip is red, close to the line', () => {
    const geoms = geomsOf({ sewnMm: 672 });
    // 672 / .85 = 790.6 reads as 791, allowance 1 + tolerance 1: 793 is the last quiet seam.
    expect(seamLengthsDiffer(793, 672, [BAND], [STRIP], geoms, 1)).toBe(false);
    expect(seamLengthsDiffer(794, 672, [BAND], [STRIP], geoms, 1)).toBe(true);
    expect(seamLengthsDiffer(788, 672, [BAND], [STRIP], geoms, 1)).toBe(true);
    // the same seam read plainly would be red at any length; it is the fit that makes it quiet
    expect(seamLengthsDiffer(790, 700, [BAND], [STRIP], geoms, 1)).toBe(true);
    // either side
    expect(seamLengthsDiffer(672, 790, [STRIP], [BAND], geoms, 1)).toBe(false);
    expect(seamLengthsDiffer(600, 790, [STRIP], [BAND], geoms, 1)).toBe(true);
  });

  it('a strip typed by hand states no seam, so it is exempt', () => {
    for (const mark of [
      { sewnMm: 672, mode: 'per_size' as const },
      { sewnMm: 672, mode: 'one_length' as const },
      { sewnMm: 672, manual: true },
    ]) {
      expect(seamLengthsDiffer(1400, 672, [BAND], [STRIP], geomsOf(mark), 0)).toBe(false);
    }
  });

  it('a seam with no strip reads exactly as it did', () => {
    const geoms = geomsOf({ sewnMm: 672 });
    expect(seamLengthsDiffer(790, 790, [BAND], [BAND], geoms, 1)).toBe(false);
    expect(seamLengthsDiffer(790, 791, [BAND], [BAND], geoms, 1)).toBe(false);
    expect(seamLengthsDiffer(790, 792, [BAND], [BAND], geoms, 1)).toBe(true);
    expect(readStripSide(790, [BAND], geoms)).toEqual({ kind: 'plain' });
    expect(fittedSideMm(790, [BAND], geoms)).toBe(790);
  });

  it('the strip`s short end is cloth to cloth: no fit stretches a width', () => {
    const geoms = geomsOf({ sewnMm: 672 });
    expect(readStripSide(40, [STRIP], geoms)).toEqual({ kind: 'plain' });
    expect(fittedSideMm(40, [STRIP], geoms)).toBe(40);
  });

  it('a side of a strip and a piece together states no one length', () => {
    const geoms = geomsOf({ sewnMm: 672 });
    expect(readStripSide(1400, [STRIP, BAND], geoms)).toEqual({ kind: 'exempt' });
    expect(seamLengthsDiffer(1400, 90, [STRIP, BAND], [BAND], geoms, 0)).toBe(false);
  });
});

describe('the PDF reads the same rule', () => {
  const mismatch = (strip: Parameters<typeof waistbandCard>[0]) =>
    deriveAssembly(waistbandCard(strip)).gaps.filter((gap) => gap.code === 'asm_length_mismatch');

  it('a correct strip on its seam has no mismatch', () => {
    expect(mismatch(fromSeamStrip())).toEqual([]);
  });

  it('a strip far from its seam is reported, one typed by hand is not', () => {
    const wrong = fromSeamStrip({ sizes: [{ sizeId: 2, seamMm: { value: '500' } }] } as never);
    expect(mismatch(wrong).length).toBe(1);
    expect(mismatch(oneLengthStrip(420))).toEqual([]);
  });
});

describe('a seam stored before the strip changed length', () => {
  const stripEdges = (strip: CutStripLike) => {
    const was = waistbandCard(fromSeamStrip());
    const now = waistbandCard(strip);
    return deriveAssembly({ ...now, techCard: { ...now.techCard, seams: was.techCard.seams } });
  };

  it.each(['100', '85', '70', '50', '30'])('stays laid at fit %s', (fit) => {
    const model = stripEdges(fromSeamStrip({ fitPct: { value: fit } } as Partial<CutStripLike>));
    const codes = model.gaps.map((gap) => gap.code);
    expect(codes).not.toContain('asm_edge_missing');
    expect(codes).not.toContain('asm_length_mismatch');
    const seams = [...model.cards.values()].flatMap((card) => card.seams ?? []);
    expect(seams).toHaveLength(1);
  });

  it('stays laid at one length, with no length check', () => {
    const codes = stripEdges(oneLengthStrip(300)).gaps.map((gap) => gap.code);
    expect(codes).not.toContain('asm_edge_missing');
    expect(codes).not.toContain('asm_length_mismatch');
  });
});
