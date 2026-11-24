import type { ChainSet, IRPath, PieceCandidate, Seed, Sheet, SizeRun, Style } from '../types';
import { bboxOf, dist, pointInPoly, resample, signedArea } from './geom';
import { insideWithin, selfIntersects } from './gfit/checks';
import { fullyVisibleSourcePath } from './source-visibility';

function samePen(a: Style, b: Style) {
  if (
    !a.dash?.length ||
    !b.dash ||
    a.dash.length !== b.dash.length ||
    a.fill ||
    b.fill ||
    a.layer !== b.layer ||
    a.widthMm !== b.widthMm ||
    String(a.strokeRgb) !== String(b.strokeRgb)
  )
    return false;
  const sa = a.dash.reduce((n, v) => n + v, 0),
    sb = b.dash.reduce((n, v) => n + v, 0);
  // The printed sample is scaled to fit the legend. PDF decimal rounding changes
  // individual dash fractions on this sheet by less than one part in a thousand.
  return (
    sa > 0 &&
    sb > 0 &&
    Math.min(sa, sb) / Math.max(sa, sb) >= 0.75 &&
    a.dash.every((v, i) => Math.abs(v / sa - b.dash![i] / sb) <= 0.001)
  );
}
type Outline = { path: IRPath; outer: IRPath['pts']; area: number; wall: number; labels: number[] };
const fits = (a: Outline, b: Outline) =>
  a.area < b.area && insideWithin(resample(a.outer, 0.5, true), b.outer);

/** Resolve a whole previously indistinguishable family from its labelled closed PDF strokes. */
export function restoreSourceOutlineFamilies(
  sheet: Sheet,
  set: ChainSet,
  run: SizeRun,
  seeds: Seed[],
  cands: Map<number, PieceCandidate[]>,
  excluded: ReadonlySet<number>,
) {
  if (
    sheet.missing.length ||
    sheet.holes?.length ||
    sheet.refused?.length ||
    set.assigned?.length ||
    run.sizes.length < 3
  )
    return;
  const held = seeds.filter(
    (s) =>
      s.origin === 'text' &&
      s.text &&
      !/placement|template|grainline|\bdart\b/i.test(s.text.text) &&
      cands.get(s.id)?.length === run.sizes.length &&
      cands
        .get(s.id)!
        .every(
          (c) => c.outcome === 'refused' && c.gradeRefusal === 'sizes-not-distinguished' && !c.hole,
        ),
  );
  if (!held.length) return;
  const styles = new Map(sheet.styles.map((s) => [s.id, s]));
  const keys: { style: Style; chain: number; own: Set<number> }[] = [];
  for (const size of run.sizes) {
    const cls = set.classes.find(
      (c) => c.id === size.classId && c.role === 'size' && c.sizeLabel === size.label,
    );
    const matches = cls?.evidence.filter(
      (e) => e.kind === 'legend-sample' && e.label === size.label,
    );
    const key = matches?.length === 1 ? matches[0] : undefined;
    if (!cls || !key || key.kind !== 'legend-sample' || excluded.has(key.chain)) return;
    const style = styles.get(set.chains[key.chain]?.style);
    if (!style?.dash?.length || style.fill) return;
    keys.push({ style, chain: key.chain, own: new Set(cls.chains) });
  }
  const assignments = new Map<number, Set<string | null>>();
  for (const row of set.classes)
    for (const id of row.chains) {
      if (!assignments.has(id)) assignments.set(id, new Set());
      assignments.get(id)!.add(row.role === 'size' ? row.sizeLabel : null);
    }
  const owners = new Map<number, number[]>();
  for (const chain of set.chains)
    for (const id of new Set(chain.ranges.map((r) => r.path))) {
      if (!owners.has(id)) owners.set(id, []);
      owners.get(id)!.push(chain.id);
    }
  for (const seed of held) {
    const paths: Outline[] = [];
    let incomplete = false;
    for (const p of sheet.paths) {
      if (!p.closed || p.background || p.pts.length < 3 || !pointInPoly(seed.at, p.pts)) continue;
      const style = styles.get(p.style);
      if (!style) continue;
      const labels = keys.flatMap((key, i) => (samePen(style, key.style) ? [i] : []));
      if (!labels.length) continue;
      const walls = owners.get(p.id) ?? [];
      const ch = walls.length === 1 ? set.chains[walls[0]] : undefined;
      if (
        !ch ||
        excluded.has(ch.id) ||
        !ch.closed ||
        ch.ranges.length !== 1 ||
        ch.ranges[0].from !== 0 ||
        ch.ranges[0].to !== p.pts.length ||
        !labels.some((i) => keys[i].own.has(ch.id)) ||
        [...(assignments.get(ch.id) ?? [])].some(
          (label) => !labels.some((i) => run.sizes[i].label === label),
        ) ||
        (seed.text?.src && seed.text.src.file !== p.src.file) ||
        !fullyVisibleSourcePath(p) ||
        seeds.some((s) => s !== seed && pointInPoly(s.at, p.pts))
      ) {
        incomplete = true;
        break;
      }
      let outer = dist(p.pts[0], p.pts[p.pts.length - 1]) < 1e-6 ? p.pts.slice(0, -1) : p.pts;
      const a = signedArea(outer);
      if (!a || selfIntersects(outer)) {
        incomplete = true;
        break;
      }
      if (a < 0) outer = outer.slice().reverse();
      paths.push({ path: p, outer, area: Math.abs(a), wall: ch.id, labels });
    }
    if (incomplete || paths.length !== keys.length) continue;
    const min = paths.reduce((a, b) => (a.area < b.area ? a : b));
    const labels = sheet.texts.filter((t) => pointInPoly(t.anchor, min.outer)).map((t) => t.text);
    if (
      !labels.some((t) => /\bcut\s+[1-9]\d*\b/i.test(t)) ||
      labels.some((t) => /\b(?:placement|template)\b/i.test(t))
    )
      continue;
    const matches = keys.map((_, i) => paths.filter((p) => p.labels.includes(i)));
    const direct = matches.map((opts) =>
      opts.length === 1 && opts[0].labels.length === 1 ? opts[0] : undefined,
    );
    const ranked = matches.map((opts, i) => {
      if (direct[i]) return direct[i];
      const lo = direct[i - 1],
        hi = direct[i + 1];
      if (!lo || !hi) return undefined;
      const found = opts.filter((p) => fits(lo, p) && fits(p, hi));
      return found.length === 1 ? found[0] : undefined;
    });
    if (
      ranked.some((p, i) => !p || !keys[i].own.has(p.wall)) ||
      new Set(ranked).size !== keys.length
    )
      continue;
    const contours = ranked as Outline[];
    if (contours.some((p, i) => i > 0 && !fits(contours[i - 1], p))) continue;
    const cells = cands.get(seed.id)!;
    for (const c of cells) {
      const p = contours[c.rank],
        bbox = bboxOf(p.outer);
      const contains = (q: IRPath['pts'][number]) =>
        q.x >= bbox.minX &&
        q.x <= bbox.maxX &&
        q.y >= bbox.minY &&
        q.y <= bbox.maxY &&
        pointInPoly(q, p.outer);
      Object.assign(c, {
        outer: p.outer,
        walls: [p.wall],
        bbox,
        areaMm2: p.area,
        rankFrom: 'class',
        sourceCoverage: 1,
        p95Mm: 0,
        derived: [],
        outcome: 'closed',
        inside: set.chains
          .filter((ch) => ch.id !== p.wall && ch.pts.length > 1 && ch.pts.every(contains))
          .map((ch) => ch.id),
        textsInside: sheet.texts
          .filter((t) =>
            contains({ x: (t.bbox.minX + t.bbox.maxX) / 2, y: (t.bbox.minY + t.bbox.maxY) / 2 }),
          )
          .map((t) => t.id),
        sourceOutline: {
          path: p.path.id,
          key: keys[c.rank].chain,
          ...(!direct[c.rank]
            ? { brackets: [contours[c.rank - 1].path.id, contours[c.rank + 1].path.id] }
            : {}),
        },
      });
      delete c.gradeRefusal;
      delete c.gradeDetail;
    }
  }
}
