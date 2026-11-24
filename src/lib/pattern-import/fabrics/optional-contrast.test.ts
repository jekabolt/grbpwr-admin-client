import { expect, it } from 'vitest';

import type { DraftScopeTarget, IRText, PieceCandidate } from '../types';
import { proposeFabricsDetailed } from './propose';
import { PURPOSE } from './scope';

const scope = (purpose: string, label: string): DraftScopeTarget => ({
  scopeKey: purpose,
  fabricPurpose: purpose,
  bomLineKey: label,
  label,
  isInterlining: false,
});
const main = scope(PURPOSE.main, 'main');
const contrast = scope(PURPOSE.contrast, 'contrast');
const box = { minX: 0, minY: 0, maxX: 20, maxY: 40 };
function assignment(labels: string[], bom: DraftScopeTarget[]) {
  const texts: IRText[] = labels.map((text, id) => ({
    id,
    text,
    anchor: { x: 0, y: 0 },
    bbox: box,
    fontSizeMm: 3,
    rotationDeg: 0,
    layer: null,
    src: { file: '0', page: 0, op: id, sub: 0 },
  }));
  const c: PieceCandidate = {
    seed: 1,
    rank: 0,
    outer: [],
    walls: [],
    inside: [],
    textsInside: texts.map((t) => t.id),
    outcome: 'closed',
    areaMm2: 800,
    bbox: box,
    sourceCoverage: 1,
    p95Mm: 0,
  };
  return proposeFabricsDetailed({
    texts,
    families: [{ seed: 1, candidates: [c], monotone: true }],
    bom,
  }).assignment;
}
it('uses the available main cloth when the printed cut instruction explicitly allows either cloth', () => {
  const label = 'FABRIC OR CONTRAST: CUT 2';
  expect(assignment([label], [main]).byPurpose).toEqual({ [PURPOSE.main]: [1] });
  expect(assignment([label], [main, contrast]).byPurpose).toEqual({ [PURPOSE.contrast]: [1] });
  expect(assignment([label], []).refused).toHaveLength(1);
});
it('requires contrast for an independent mandatory contrast cut', () => {
  for (const labels of [['CONTRAST: CUT 2'], ['FABRIC OR CONTRAST: CUT 2', 'CONTRAST: CUT 1']])
    expect(assignment(labels, [main]).refused?.map((r) => r.purpose)).toEqual([PURPOSE.contrast]);
});
