import type { ChainSet, PieceCandidate, Seed, Sheet, SizeRun } from 'lib/pattern-import/types';
import { bboxOf, dist, pointInPoly, segNearest, signedArea } from './geom';
import { fullyVisibleSourcePath } from './source-visibility';
import { selfIntersects } from './gfit/checks';

// A mixed-sheet refusal can surround an encoded piece. Require every card size to
// identify its own entire path twice: a unique legend pen and a local printed size.
export function readLabelledSourceFamilies(
  sheet: Sheet,
  set: ChainSet,
  run: SizeRun,
  seeds: Seed[],
  candidates: Map<number, PieceCandidate[]>,
  excluded: ReadonlySet<number>,
) {
  const held = seeds.filter((seed) => {
    const cells = candidates.get(seed.id);
    return (
      seed.origin === 'face' &&
      cells?.length === run.sizes.length &&
      cells.every((c) => c.outcome === 'refused' && c.gradeRefusal === 'sizes-not-distinguished')
    );
  });
  if (!held.length) return;
  const paths = new Map(sheet.paths.map((p) => [p.id, p]));
  const owners = new Map<number, number>();
  for (const cls of set.classes)
    for (const id of cls.chains) owners.set(id, (owners.get(id) ?? 0) + 1);
  const ranked = run.sizes.map(({ label }) => {
    const rows = set.classes.filter((g) => g.role === 'size' && g.sizeLabel === label);
    if (rows.length !== 1) return [];
    const row = rows[0];
    const key = row.evidence.find((e) => e.kind === 'legend-sample' && e.label === label);
    if (key?.kind !== 'legend-sample' || key.nestingOnly || key.alike.length) return [];
    const sample = set.chains[key.chain];
    const dash = sheet.styles[sample.style]?.dash;
    if (!dash?.length) return [];
    return row.chains.flatMap((id) => {
      const chain = set.chains[id];
      if (excluded.has(id) || owners.get(id) !== 1 || !chain.closed || chain.ranges.length !== 1)
        return [];
      const r = chain.ranges[0],
        p = paths.get(r.path);
      if (!p || !fullyVisibleSourcePath(p, 0.001) || r.from !== 0 || r.to !== p.pts.length)
        return [];
      const style = sheet.styles[p.style];
      if (
        style.fill ||
        style.widthMm <= 0 ||
        !style.dash ||
        style.dash.length !== dash.length ||
        !style.dash.every((d, i) => Math.abs(d - dash[i]) < 0.001)
      )
        return [];
      const pts = dist(p.pts[0], p.pts[p.pts.length - 1]) < 0.001 ? p.pts.slice(0, -1) : p.pts;
      const area = signedArea(pts);
      if (!area || selfIntersects(pts)) return [];
      const labels = sheet.texts.filter(
        (t) =>
          t.src.file === p.src.file &&
          t.text.trim().toUpperCase() === 'SIZE ' + label.toUpperCase() &&
          pts.some(
            (a, i) => segNearest(t.anchor, a, pts[(i + 1) % pts.length]).d <= t.fontSizeMm / 2,
          ),
      );
      if (labels.length !== 1) return [];
      const outer = area < 0 ? pts.slice().reverse() : pts;
      return [{ id, outer, area: Math.abs(area) }];
    });
  });
  for (const seed of held) {
    const rings = ranked.map((rank) => rank.filter((r) => pointInPoly(seed.at, r.outer)));
    if (rings.some((rank) => rank.length !== 1)) continue;
    const family = rings.map((rank) => rank[0]);
    if (
      family.some(
        (r, i) =>
          (i > 0 && r.area <= family[i - 1].area) ||
          seeds.some((q) => q.id !== seed.id && pointInPoly(q.at, r.outer)),
      )
    )
      continue;
    const first = family[0].outer;
    if (
      !sheet.texts.some(
        (t) => /\b\d+\s+OF\s+(?:FABRIC|LINING)\b/i.test(t.text) && pointInPoly(t.anchor, first),
      )
    )
      continue;
    for (const c of candidates.get(seed.id)!) {
      const { id, outer, area } = family[c.rank];
      const inside = set.chains
        .filter((ch) => ch.id !== id && ch.pts.length && ch.pts.every((p) => pointInPoly(p, outer)))
        .map((ch) => ch.id);
      Object.assign(c, {
        outer,
        areaMm2: area,
        bbox: bboxOf(outer),
        walls: [id],
        inside,
        textsInside: sheet.texts.filter((t) => pointInPoly(t.anchor, outer)).map((t) => t.id),
        sourceCoverage: 1,
        p95Mm: 0,
        outcome: 'closed',
        rankFrom: 'class',
      });
      delete c.gradeDetail;
      delete c.gradeRefusal;
    }
  }
}
