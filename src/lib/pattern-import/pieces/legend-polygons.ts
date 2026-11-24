import type { BoxMm, PieceCandidate, PtMm } from 'lib/pattern-import/types';
import { PATIMPORT } from 'lib/pattern-import/types';
import { samePrintedCurve } from './printed-cut-curves';
import { sameDashShape } from '../chains/motif';
import { bboxOf, dist, pointInPoly, segNearest } from './geom';
import {
  joinsPrintedStrokes,
  printedStrokeRuns,
  straightCut,
  type PrintedCutGroup,
  type PrintedCutInput,
} from './printed-cut-ranges';

type Witness = {
  size: string;
  rank: number;
  page: number;
  seed: number;
  outer: PtMm[];
  paths: number[];
};
function sameFigure(a: Witness, b: Witness) {
  return (
    a.seed === b.seed &&
    a.page === b.page &&
    a.outer.length === b.outer.length &&
    a.outer.every((p, i) => dist(p, b.outer[i]) <= 0.025)
  );
}
function contradictoryStroke(pts: PtMm[], closed: boolean, seedAt: PtMm, ring: PtMm[], box: BoxMm) {
  if (!pts.length) return false;
  const tolerance = 2 * PATIMPORT.sagittaMm;
  const bounds = bboxOf(pts);
  if (
    (bounds.maxX < box.minX - tolerance ||
      bounds.minX > box.maxX + tolerance ||
      bounds.maxY < box.minY - tolerance ||
      bounds.minY > box.maxY + tolerance) &&
    !(closed && pointInPoly(seedAt, pts))
  )
    return false;
  for (let i = 1; i < pts.length; i++) {
    const a = pts[i - 1],
      b = pts[i],
      n = Math.max(1, Math.ceil(dist(a, b) / 0.5));
    for (let j = 0; j <= n; j++) {
      const p = { x: a.x + ((b.x - a.x) * j) / n, y: a.y + ((b.y - a.y) * j) / n };
      if (
        !ring.some(
          (u, k) => segNearest(p, u, ring[(k + 1) % ring.length]).d <= 2 * PATIMPORT.sagittaMm,
        )
      )
        return true;
    }
  }
  return false;
}
/** Two different legend pens trace the same printed polygon. A missing rank between them may
 * repeat it if its local strokes agree. Retain each actually painted source pass by path ID. */
export function readLegendPolygons(
  d: PrintedCutInput,
  card: string[],
  candidates: Map<number, PieceCandidate[]>,
): PrintedCutGroup[][] {
  const open = new Set(
    [...candidates]
      .filter(([, cs]) => cs.some((c) => c.outcome === 'leak' && !c.hole))
      .map(([seed]) => seed),
  );
  if (!open.size) return [];
  const seeds = d.seeds.filter((s) => open.has(s.id) && s.origin === 'text' && s.text);
  const pages = new Set(seeds.map((s) => s.text!.src.page));
  const paths = d.paths.filter((p) => pages.has(p.src.page));
  if (!paths.length || new Set(d.paths.map((p) => p.src.file)).size !== 1) return [];
  const legend = d.classes.filter(
    (g) => g.role === 'size' && g.sizeLabel && card.includes(g.sizeLabel),
  );
  const pens = legend.flatMap((g) => {
    const key = g.evidence.find(
      (e) =>
        e.kind === 'legend-sample' && e.label === g.sizeLabel && !e.nestingOnly && !e.alike.length,
    );
    const dash = g.evidence.find((e) => e.kind === 'declared-dash');
    return key && dash?.kind === 'declared-dash'
      ? [{ size: g.sizeLabel!, dash: dash.dash, chains: g.chains }]
      : [];
  });
  if (pens.length < 2) return [];
  const styleRank = new Map<number, string>();
  d.styles.forEach((style, index) => {
    if (!style.dash?.length) return;
    const hits = new Set(pens.filter((p) => sameDashShape(p.dash, style.dash!)).map((p) => p.size));
    if (hits.size === 1) styleRank.set(index, [...hits][0]);
  });
  const byPath = new Map(paths.map((p) => [p.id, p])),
    owners = new Map<number, Set<string>>();
  const byChain = new Map(d.chains.map((c) => [c.id, c]));
  const assignments = new Map<number, Set<string>>();
  for (const g of legend)
    for (const id of g.chains)
      for (const r of byChain.get(id)?.ranges ?? []) {
        const p = byPath.get(r.path);
        if (!p) continue;
        if (!assignments.has(p.id)) assignments.set(p.id, new Set());
        assignments.get(p.id)!.add(g.sizeLabel!);
        if (
          r.from === 0 &&
          r.to === p.pts.length - (p.closed ? 0 : 1) &&
          styleRank.get(p.style) === g.sizeLabel
        )
          owners.set(p.id, new Set([g.sizeLabel!]));
      }
  const passes = printedStrokeRuns(paths, d.styles, false, true).filter((run) =>
    joinsPrintedStrokes(run.at(-1)!, run[0], d.styles, false),
  );
  const sourceCopies = new Map<number, number[]>();
  // A complete closed native chain may refer to exact coincident PDF copies. Keep their
  // provenance while counting the single whole chain only once as a legend witness.
  for (const ch of d.chains) {
    if (!ch.closed || !ch.ranges.length) continue;
    const raw = ch.ranges.map((r) => byPath.get(r.path));
    const first = raw[0];
    if (
      !first?.closed ||
      first.background ||
      d.styles[first.style].fill ||
      d.styles[first.style].widthMm <= 0 ||
      !owners.has(first.id)
    )
      continue;
    if (
      !raw.every(
        (p, i) =>
          p?.closed &&
          p.src.page === first.src.page &&
          p.style === first.style &&
          owners.has(p.id) &&
          assignments.get(p.id)?.size === 1 &&
          !p.background &&
          ch.ranges[i].from === 0 &&
          ch.ranges[i].to === p.pts.length &&
          p.pts.length === first.pts.length &&
          p.pts.every((point, index) => dist(point, first.pts[index]) < 0.0001),
      )
    )
      continue;
    passes.push([first]);
    sourceCopies.set(
      first.id,
      ch.ranges.map((r) => r.path),
    );
  }
  const bySeed = new Map<number, Map<number, Witness[]>>();
  for (const run of passes) {
    const ranked = new Set(run.flatMap((p) => [...(owners.get(p.id) ?? [])]));
    if (ranked.size !== 1) continue;
    const size = [...ranked][0],
      rank = card.indexOf(size);
    if (
      run.some(
        (p) =>
          styleRank.has(p.style) &&
          (styleRank.get(p.style) !== size ||
            [...(assignments.get(p.id) ?? [])].some((owner) => owner !== size)),
      )
    )
      continue;
    const shape = straightCut(run, ranked, owners);
    if (!shape) continue;
    const enclosed = d.seeds.filter((s) => pointInPoly(s.at, shape.outer));
    const seed = enclosed[0],
      page = run[0].src.page;
    if (
      enclosed.length !== 1 ||
      !open.has(seed.id) ||
      seed.origin !== 'text' ||
      seed.text?.src.page !== page
    )
      continue;
    const inside = d.texts.filter((t) => t.src.page === page && pointInPoly(t.anchor, shape.outer));
    if (
      !inside.some((t) => /\bcut\s+\d/i.test(t.text)) ||
      inside.some((t) => /placement|template/i.test(t.text))
    )
      continue;
    if (!bySeed.has(seed.id)) bySeed.set(seed.id, new Map());
    const groups = bySeed.get(seed.id)!;
    if (!groups.has(rank)) groups.set(rank, []);
    groups.get(rank)!.push({
      seed: seed.id,
      size,
      rank,
      page,
      outer: shape.outer,
      paths: run.flatMap((p) => sourceCopies.get(p.id) ?? [p.id]),
    });
  }
  const result: PrintedCutGroup[][] = [];
  for (const [seed, groups] of bySeed) {
    const ordered = [...groups].sort(([a], [b]) => a - b);
    const recovered = new Map<number, PrintedCutGroup>();
    const family = candidates.get(seed)!;
    const seedAt = d.seeds.find((s) => s.id === seed)!.at;
    for (let i = 1; i < ordered.length; i++) {
      const left = ordered[i - 1][1],
        right = ordered[i][1];
      if (left.length !== 1 || right.length !== 1 || !sameFigure(left[0], right[0])) continue;
      const a = left[0],
        b = right[0];
      const local = new Set(paths.filter((p) => p.src.page === a.page).map((p) => p.id));
      const familyBox = bboxOf([
        ...a.outer,
        ...family.flatMap((c) => (c.outcome === 'closed' ? c.outer : [])),
      ]);
      for (const c of family) {
        if (c.outcome !== 'leak' || c.hole || c.rank < a.rank || c.rank > b.rank) continue;
        const ref = c.rank === b.rank ? b : a,
          confirm = ref === a ? b : a;
        if (sourceCopies.has(ref.paths[0]) || sourceCopies.has(confirm.paths[0])) {
          // An already-printed closed path carries its own size. Use it directly only
          // where the closed members already identify the same ungraded piece contour.
          const closed = family.filter((v) => v.outcome === 'closed' && !v.hole);
          if (
            c.rank !== ref.rank ||
            !closed.length ||
            !closed.every((v) => samePrintedCurve(v.outer, ref.outer))
          )
            continue;
        }
        if (c.rank !== a.rank && c.rank !== b.rank) {
          const target = legend.filter((g) => g.sizeLabel === card[c.rank]);
          // A pen identified only through nesting cannot distinguish local contradictory strokes.
          if (
            !target.some((g) =>
              g.evidence.some((e) => e.kind === 'legend-sample' && e.label === card[c.rank]),
            ) ||
            target.some((g) =>
              g.evidence.some(
                (e) => e.kind === 'legend-sample' && (e.alike.length || e.nestingOnly),
              ),
            )
          )
            continue;
          if (
            target
              .flatMap((g) => g.chains)
              .some((id) => {
                const ch = byChain.get(id);
                return (
                  ch &&
                  ch.ranges.some((r) => local.has(r.path)) &&
                  contradictoryStroke(ch.pts, ch.closed, seedAt, ref.outer, familyBox)
                );
              }) ||
            paths.some(
              (p) =>
                p.src.page === a.page &&
                styleRank.get(p.style) === card[c.rank] &&
                contradictoryStroke(p.pts, p.closed, seedAt, ref.outer, familyBox),
            )
          )
            continue;
          // An existing in-between size with different geometry splits the putative shared group.
          if (
            family.some(
              (x) =>
                x.rank > a.rank &&
                x.rank < b.rank &&
                x.outcome === 'closed' &&
                !samePrintedCurve(x.outer, ref.outer),
            )
          )
            continue;
        }
        recovered.set(c.rank, {
          seed,
          name: d.seeds.find((s) => s.id === seed)!.text!.text,
          lo: c.rank,
          hi: c.rank,
          outer: ref.outer,
          paths: ref.paths,
          label: card[c.rank],
          confirmedClosedPaths:
            sourceCopies.has(ref.paths[0]) && sourceCopies.has(confirm.paths[0]),
          polygonSource: {
            reference: ref.size,
            confirmedBy: confirm.size,
            paths: ref.paths,
            confirmationPaths: confirm.paths,
          },
        });
      }
    }
    if (recovered.size) result.push([...recovered.values()]);
  }
  return result;
}
