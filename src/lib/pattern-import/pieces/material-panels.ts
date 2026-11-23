import type { ChainSet, PieceCandidate, Seed, Sheet, SizeRun } from '../types';
import { bboxOf, pointInPoly, signedArea } from './geom';
import { liningCut } from './material-cut';
import { readTriangleRing } from './material-marks';
import { compoundMaterialRing } from './material-compound';

export function recoverMaterialPanels(
  sheet: Sheet,
  set: ChainSet,
  run: SizeRun,
  seeds: Seed[],
  groups: Map<number, PieceCandidate[]>,
  measure: (c: PieceCandidate, ids: ReadonlySet<number>) => void,
) {
  if (
    !sheet.texts.some((t) => /^cut here for lining$/i.test(t.text.trim())) ||
    (sheet.parts?.length ?? 0) > 1
  )
    return;
  const paths = new Map(sheet.paths.map((p) => [p.id, p]));
  for (const seed of seeds) {
    const family = groups.get(seed.id);
    if (!family?.some((c) => c.outcome === 'leak' && c.gradeHint)) continue;
    for (const c of family) {
      if (c.outcome !== 'leak' || !c.gradeHint) continue;
      const pred = c.gradeHint.pred;
      const labels = sheet.texts.filter((t) => pointInPoly(t.anchor, pred));
      if (
        !labels.some((t) => /^cut here for lining$/i.test(t.text.trim())) ||
        !['fabric', 'lining'].every((mat) =>
          labels.some((t) => new RegExp('^' + mat + '\\s*:\\s*cut\\b', 'i').test(t.text.trim())),
        )
      )
        continue;
      const cls = set.classes.find((k) => k.id === run.sizes[c.rank]?.classId && k.role === 'size');
      const key = cls?.evidence.find(
        (e) => e.kind === 'legend-sample' && e.label === run.sizes[c.rank].label,
      );
      if (!cls || key?.kind !== 'legend-sample') continue;
      const own = cls.chains.map((id) => set.chains[id]),
        sample = set.chains[key.chain].ranges.flatMap((r) => paths.get(r.path) ?? []);
      const hit =
        readTriangleRing(sheet, sample, own, seed.at) ??
        compoundMaterialRing(sheet, sample, own, pred, seed.at);
      if (!hit || seeds.some((s) => s.id !== seed.id && pointInPoly(s.at, hit.outer))) continue;
      const variant = liningCut(sheet, hit.outer, seed.at);
      if (!variant) continue;
      const signed = signedArea(hit.outer);
      c.outer = signed > 0 ? hit.outer : [...hit.outer].reverse();
      c.liningCut = variant;
      c.outcome = 'closed';
      c.materialMarkPaths = hit.paths;
      c.walls = hit.walls;
      c.areaMm2 = Math.abs(signed);
      c.bbox = bboxOf(c.outer);
      c.rankFrom = 'class';
      delete c.leakAt;
      delete c.derived;
      delete c.repair;
      measure(c, new Set(hit.paths));
    }
    if (family.some((c) => c.liningCut)) {
      for (const c of family) {
        if (c.outcome !== 'closed' || c.liningCut) continue;
        const variant = liningCut(sheet, c.outer, seed.at);
        if (variant) c.liningCut = variant;
      }
    }
  }
}
