import { describe, expect, it } from 'vitest';

import type { Pt2 } from 'lib/assembly-skeleton/types';
import { anchorOfRunId, type StoredSeam } from 'lib/seams';

import { card58Geoms, card58InnerLines } from './card58.fixture';
import { card6InnerLines } from './card6.fixture';
import { mirrorStepPlan } from './mirror-step';
import {
  innerBreaks,
  innerRangesAreContiguous,
  NO_SPANS,
  pickSegments,
  segmentsAt,
} from './span-pick';
import {
  type FormOpLike,
  innerSlices,
  innerStretches,
  polylineLenMm,
  surfaceRow,
} from './step-seams-model';

// Card 6 (real): the left sleeve's inner line i3 is open, 385 mm, with two corners; its i0 is the
// open, straight 147 mm sleeve slit. An open inner line takes stretches like an outline edge (I1).
describe('an open inner line takes stretches (card 6 sleeve)', () => {
  const inner = card6InnerLines();
  const bent = inner.get('SLV_L')![3];
  const slit = inner.get('SLV_L')![0];

  it('breaks at its own corners, never at its ends', () => {
    const stretches = innerStretches(bent);
    expect(stretches?.closed).toBe(false);
    expect(stretches?.cornersMm.map(Math.round)).toEqual([159, 198]);
    expect(innerBreaks(bent).map((b) => [Math.round(b.atMm), b.kind])).toEqual([
      [159, 'turn'],
      [198, 'turn'],
    ]);
  });

  it('a click takes the stretch between breaks, never a wrap', () => {
    const length = polylineLenMm(bent);
    const breaks = innerBreaks(bent);
    const round = (ranges: readonly (readonly [number, number])[]) =>
      ranges.map((range) => range.map(Math.round));
    expect(round(segmentsAt(breaks, length, 20, false))).toEqual([[0, 159]]);
    expect(round(segmentsAt(breaks, length, 180, false))).toEqual([[159, 198]]);
    expect(round(segmentsAt(breaks, length, 380, false))).toEqual([[198, 385]]);
  });

  it('its first and last stretch are two stretches, not one across its ends', () => {
    const length = polylineLenMm(bent);
    const ends: [number, number][] = [
      [0, 159],
      [198, length],
    ];
    expect(innerRangesAreContiguous(ends, length, false)).toBe(false);
    expect(innerRangesAreContiguous(ends, length)).toBe(true);
    const rules = {
      isInner: (id: string) => id.includes(':i'),
      pieceOf: (id: string) => id.split(':')[0],
      wraps: () => false,
    };
    const id = 'SLV_L:i3';
    const first = pickSegments(
      { a: [], b: [], spans: NO_SPANS },
      'a',
      id,
      [ends[0]],
      length,
      rules,
    );
    const second = pickSegments(first, 'a', id, [ends[1]], length, rules);
    expect(second.spans.a[id]?.map((range) => range.map(Math.round))).toEqual([
      [198, Math.round(length)],
    ]);
  });

  it('a straight open line is one stretch: the whole line', () => {
    const stretches = innerStretches(slit);
    expect(stretches).not.toBeNull();
    expect(stretches?.cornersMm).toEqual([]);
    expect(segmentsAt(innerBreaks(slit), polylineLenMm(slit), 70, false)).toEqual([
      [0, polylineLenMm(slit)],
    ]);
  });

  it('draws its first and last stretch apart, never joined across its ends', () => {
    const length = polylineLenMm(bent);
    const slices = innerSlices(bent, [
      [0, 100],
      [250, length],
    ]);
    expect(slices).toHaveLength(2);
    const sliceLen = (line: readonly Pt2[]) => Math.round(polylineLenMm(line));
    expect(slices.map(sliceLen).sort((a, b) => a - b)).toEqual([100, Math.round(length - 250)]);
  });
});

// Card 58 (real): the sleeves are mirror twins; their 120 mm inner lines are open and straight.
describe('MIRROR carries a stretch of an open inner line (card 58 sleeves)', () => {
  it('lands the same stretch on the twin sleeve line', () => {
    const geoms = card58Geoms();
    const inner = card58InnerLines();
    const line = inner.get('SLV_L')![0];
    const source = surfaceRow(
      { geom: geoms.get('SLV_L')!, k: 0, line, grainDeg: 0, ranges: [[20, 80]] },
      [anchorOfRunId([...geoms.values()], 'SLV_M_L#0')!],
      undefined,
      'left sleeve part',
    )!;
    const ops: FormOpLike[] = [
      {
        operationNumber: 10,
        inputKeys: ['SLV_L', 'SLV_M_L'],
        outputUnitKey: 'LEFT',
        seamKeys: [source.seamKey],
      },
      { operationNumber: 20, inputKeys: ['SLV_R', 'SLV_M_R'], outputUnitKey: 'RIGHT' },
    ];
    const plan = mirrorStepPlan({
      step: ops[1],
      cardOps: ops,
      rows: [source],
      poses: [],
      geoms,
      innerLines: inner,
    });
    expect(plan.kind).toBe('create');
    if (plan.kind !== 'create') return;
    const host = (plan.upsert[0] as StoredSeam).sideA.find((anchor) => anchor.piece === 'SLV_R')!;
    const twin = inner.get('SLV_R')![Number(/^i(\d+)$/.exec(host.edgeHint)?.[1] ?? -1)];
    expect(host.range.map((share) => Math.round(share * polylineLenMm(twin)))).toEqual([20, 80]);
  });
});
