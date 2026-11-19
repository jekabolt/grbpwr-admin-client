import type { PatternImportDxfProductPhaseEAssemblyProjectionContourV1 } from 'lib/pattern-import/dxf-product-phase-e-assembly-workbench-v1';
import type { PtMm } from 'lib/pattern-import/types';
import { expect, it } from 'vitest';
import {
  hasDraftCutAllowanceJoinsV1,
  selectDraftCutAllowanceOffsetV1,
} from './draft-cad-allowance-offset-geometry-v1';

const taperedCut = [
  { x: 210.000076, y: 220 },
  { x: 150.000015, y: 220 },
  { x: 150.000137, y: 0 },
  { x: 210.000076, y: 0 },
];
const right = ['v3', 'v0'] as const;

function contour(points: PtMm[]): PatternImportDxfProductPhaseEAssemblyProjectionContourV1 {
  return {
    contourId: 'native-cut',
    role: 'cut-boundary',
    closed: true,
    vertices: points.map((pointMm, ordinal) => ({
      pointMm,
      ordinal,
      vertexId: `v${ordinal}`,
      normalizedArc: ordinal / 4,
    })),
  };
}

it('offsets the sole perpendicular native edge while holding the far taper exactly', () => {
  const cut = contour(taperedCut);
  expect(
    cut.vertices.map(({ vertexId }, i) =>
      hasDraftCutAllowanceJoinsV1(cut, [vertexId, cut.vertices[(i + 1) % 4]!.vertexId]),
    ),
  ).toEqual([false, false, false, true]);
  expect(selectDraftCutAllowanceOffsetV1(cut, right, 4)?.ring).toEqual([
    { x: 214.000076, y: 220 },
    taperedCut[1],
    taperedCut[2],
    { x: 214.000076, y: 0 },
  ]);
  // The new right support would cross the lower end of the fixed taper by 0.000061 mm.
  expect(selectDraftCutAllowanceOffsetV1(cut, right, -60)).toBeNull();
});

it('refuses an incident edge that is off perpendicular by one DXF grid unit', () => {
  const cut = contour(
    taperedCut.map((point, i) => (i === 1 ? { ...point, y: 220.000001 } : point)),
  );
  expect(hasDraftCutAllowanceJoinsV1(cut, right)).toBe(false);
  expect(selectDraftCutAllowanceOffsetV1(cut, right, 4)).toBeNull();
});
