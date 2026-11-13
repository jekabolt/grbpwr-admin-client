import { describe, expect, it } from 'vitest';

import type { Pt2 } from 'lib/assembly-skeleton/types';
import { anchorOfRunId, type StoredSeam } from 'lib/seams';

import { card58Geoms, card58InnerLines } from './card58.fixture';
import { mirrorStepPlan } from './mirror-step';
import { surfaceRow, type FormOpLike } from './step-seams-model';

const lineLen = (line: readonly Pt2[]) =>
  line.slice(1).reduce((sum, p, i) => sum + Math.hypot(p[0] - line[i][0], p[1] - line[i][1]), 0);

// Card 58 (real): SLV_L and SLV_R are mirror twins with a full edge map, but their inner lines
// come in a different order (left 120,120,13,3,3,12,3 mm; right 31,20,20,120,120,13 mm), so inner
// line K of the left sleeve is not inner line K of the right one.
describe('MIRROR on an inner contour (card 58 sleeves)', () => {
  const geoms = card58Geoms();
  const inner = card58InnerLines();
  const left = inner.get('SLV_L')!;
  const right = inner.get('SLV_R')!;

  const planFor = (k: number) => {
    const source = surfaceRow(
      { geom: geoms.get('SLV_L')!, k, line: left[k], grainDeg: 0 },
      [anchorOfRunId([...geoms.values()], 'SLV_M_L#0')!],
      undefined,
      `flap-${k}`,
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
    return mirrorStepPlan({
      step: ops[1],
      cardOps: ops,
      rows: [source],
      poses: [],
      geoms,
      innerLines: inner,
    });
  };

  it('never lands a mirrored inner seam on a contour of another size', () => {
    const checked: number[] = [];
    left.forEach((line, k) => {
      const plan = planFor(k);
      if (plan.kind !== 'create') return;
      const row = plan.upsert[0] as StoredSeam;
      const hint = row.sideA.find((a) => a.piece === 'SLV_R')?.edgeHint ?? '';
      const target = right[Number(/^i(\d+)$/.exec(hint)?.[1] ?? -1)];
      expect(target, `left i${k} → right ${hint}`).toBeDefined();
      expect(Math.abs(lineLen(target) - lineLen(line)), `left i${k} → right ${hint}`).toBeLessThan(
        1,
      );
      checked.push(k);
    });
    expect(checked.length).toBeGreaterThan(0);
  });

  it('lands left 120 mm line 0 on the right 120 mm line it mirrors to, not on right line 0', () => {
    const plan = planFor(0);
    expect(plan.kind).toBe('create');
    const hint = (plan.upsert[0] as StoredSeam).sideA.find((a) => a.piece === 'SLV_R')?.edgeHint;
    expect(hint).not.toBe('i0');
    expect(Math.round(lineLen(right[Number(hint!.slice(1))]))).toBe(Math.round(lineLen(left[0])));
  });

  it('does not mirror a contour the twin does not have (left 3 mm mark)', () => {
    expect(planFor(3).kind).toBe('edge-mismatch');
  });
});
