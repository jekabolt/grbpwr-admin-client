// Replay a proposed bridge with the same walls, seeds and fill as an operator edit.
// Publish only the target candidate. Trials never write into the session's wall edits.
import { pageMarginIds } from '../chains/classify';
import { perimeter } from '../semantics/geom';
import { PATIMPORT, type PieceCandidate, type PieceFamily, type PtMm } from '../types';
import { FACING_BRIDGE_MM } from './bridges';
import { isMonotone } from './fill';
import { gapPairs, type GapGuess } from './gap';
import { bboxOf, dist, pointInPoly, resample, SegGrid, segNearest } from './geom';
import { insideWithin, selfIntersects } from './gfit/checks';
import { applyWallEdits, type PieceSession } from './operator';
import { drawPolyline, exterior, Grid } from './raster';

type Finalize = (session: PieceSession) => PieceFamily[];
const rawFamilies: Finalize = (session) => session.families;
const cache = new WeakMap<PieceSession, WeakMap<Finalize, PieceFamily[]>>();

function distanceToRing(p: PtMm, ring: PtMm[]) {
  let d = Infinity;
  for (let i = 0; i < ring.length; i++)
    d = Math.min(d, segNearest(p, ring[i], ring[(i + 1) % ring.length]).d);
  return d;
}

function sameRing(a: PtMm[], b: PtMm[]) {
  return a === b || (a.length === b.length && a.every((p, i) => p.x === b[i].x && p.y === b[i].y));
}

/** The snapper may change the first vertex or split a collinear edge on an equivalent trial. */
function equivalentCut(a: PtMm[], b: PtMm[]): boolean {
  if (sameRing(a, b)) return true;
  const covered = (ring: PtMm[], other: PtMm[]) =>
    [...ring, ...resample(ring, 0.5, true)].every(
      (p) => distanceToRing(p, other) <= PATIMPORT.sagittaMm,
    );
  return covered(a, b) && covered(b, a);
}

function preservesClosed(before: PieceFamily[], after: PieceFamily[]) {
  return before.every((family) => {
    const other = after.find((f) => f.seed === family.seed);
    return (
      other === family ||
      family.candidates.every((c) => {
        if (c.outcome !== 'closed') return true;
        const next = other?.candidates.find((x) => x.rank === c.rank);
        return next?.outcome === 'closed' && sameRing(c.outer, next.outer);
      })
    );
  });
}

function eligiblePair(pair: GapGuess, own: Set<number>, pred: PtMm[]) {
  return (
    pair.facing &&
    pair.mm > PATIMPORT.snapMm &&
    pair.mm <= FACING_BRIDGE_MM &&
    pair.chains.some((id) => own.has(id)) &&
    resample([pair.from, pair.to], 1).every((p) => distanceToRing(p, pred) <= 1.5)
  );
}

/** Fast negative control before a full native refill. Only source walls of this rank
 * participate, so a piece which still leaks elsewhere costs one local flood. */
function sourceClosure(
  session: PieceSession,
  allowed: Set<number>,
  seed: PtMm,
  hi: PieceCandidate,
  boxes: ReturnType<typeof bboxOf>[],
) {
  const cell = session.opts.cellMm || PATIMPORT.fillCellMm;
  const anchor = session.sheet.bbox;
  // Use the native raster's lattice and leave room for the exterior around the larger cut.
  const left = anchor.minX - 15;
  const top = anchor.maxY + 15;
  const grid = new Grid(
    {
      minX: left + Math.floor((hi.bbox.minX - 2 - left) / cell) * cell,
      maxY: top - Math.floor((top - hi.bbox.maxY - 2) / cell) * cell,
      maxX: hi.bbox.maxX + 2,
      minY: hi.bbox.minY - 2,
    },
    cell,
  );
  const x = grid.ix(seed.x),
    y = grid.iy(seed.y);
  if (!grid.inside(x, y)) return;
  const walls = new Uint8Array(grid.W * grid.H);
  for (const id of allowed) {
    const chain = session.set.chains[id];
    const b = boxes[id];
    if (
      chain &&
      b &&
      b.minX <= grid.box.maxX + cell &&
      b.maxX >= grid.box.minX - cell &&
      b.minY <= grid.box.maxY + cell &&
      b.maxY >= grid.box.minY - cell
    )
      drawPolyline(grid, walls, chain.pts, chain.closed);
  }
  const k = y * grid.W + x;
  if (walls[k]) return;
  return (pair: GapGuess) => {
    const trial = walls.slice();
    drawPolyline(grid, trial, [pair.from, pair.to]);
    return !trial[k] && !exterior(grid, trial)[k];
  };
}

/** Coverage against assigned input chains alone, excluding the trial's synthetic wall. */
function followsSource(session: PieceSession, cut: PieceCandidate, pair: GapGuess) {
  const index = new SegGrid(4);
  for (const id of cut.walls) {
    const chain = session.set.chains[id];
    index.addPolyline(id, chain.pts, chain.closed);
  }
  const samples = resample(cut.outer, 0.5, true);
  let supported = 0;
  for (const p of samples) {
    let onSource = false;
    index.near(p, PATIMPORT.snapMm, (id, i) => {
      if (onSource) return;
      const pts = session.set.chains[id].pts;
      onSource = segNearest(p, pts[i], pts[(i + 1) % pts.length]).d <= PATIMPORT.snapMm;
    });
    if (onSource) supported++;
    else if (segNearest(p, pair.from, pair.to).d > PATIMPORT.snapMm) return false;
  }
  return supported >= samples.length * PATIMPORT.coverageBlock;
}

function verifiedTrial(
  session: PieceSession,
  family: PieceFamily,
  c: PieceCandidate,
  pair: GapGuess,
  allowed: Set<number>,
  lo: PieceCandidate,
  hi: PieceCandidate,
  finalize: Finalize,
  baseline: () => PieceFamily[],
) {
  const trial = applyWallEdits(session, [
    {
      kind: 'bridge',
      seed: family.seed,
      rank: c.rank,
      from: pair.from,
      to: pair.to,
    },
  ]);
  const next = trial.families
    .find((f) => f.seed === family.seed)
    ?.candidates.find((x) => x.rank === c.rank);
  if (
    !next ||
    next.outcome !== 'closed' ||
    next.rankFrom !== 'class' ||
    next.outer.length < 3 ||
    next.sourceCoverage < PATIMPORT.coverageBlock ||
    next.p95Mm > PATIMPORT.hausdorffP95VectorMm ||
    !next.walls.length ||
    !next.walls.every((id) => allowed.has(id)) ||
    !pair.chains.every((id) => next.walls.includes(id)) ||
    !preservesClosed(session.families, trial.families)
  )
    return;
  const edge = next.derived?.[0];
  if (
    next.derived?.length !== 1 ||
    edge?.kind !== 'operator-bridge' ||
    edge.pts.length !== 2 ||
    dist(edge.pts[0], edge.pts[1]) > perimeter(next.outer) * PATIMPORT.derivedMaxShare ||
    dist(edge.pts[0], pair.from) > 1 ||
    dist(edge.pts[1], pair.to) > 1
  )
    return;
  const seed = session.seeds.find((s) => s.id === family.seed);
  if (
    !seed ||
    !pointInPoly(seed.at, next.outer) ||
    selfIntersects(next.outer) ||
    !followsSource(session, next, pair) ||
    next.areaMm2 <= lo.areaMm2 ||
    next.areaMm2 >= hi.areaMm2 ||
    !insideWithin(resample(lo.outer, 0.5, true), next.outer) ||
    !insideWithin(resample(next.outer, 0.5, true), hi.outer) ||
    !resample([pair.from, pair.to], 0.5).every(
      (p) => distanceToRing(p, next.outer) <= PATIMPORT.snapMm,
    )
  )
    return;
  const normalized = finalize(trial);
  const preview = normalized
    .find((f) => f.seed === family.seed)
    ?.candidates.find((v) => v.rank === c.rank);
  if (!preview || preview.outcome !== 'closed' || !preservesClosed(baseline(), normalized)) return;
  return {
    preview,
    candidate: {
      ...next,
      derived: [{ ...edge, kind: 'bridge' as const, chains: pair.chains }],
      gapRecovery: { from: pair.from, to: pair.to, chains: pair.chains },
    },
  };
}

/** The first release addresses bracketed, graded PDF sizes with an independently predicted gap. */
export function recoverAutomaticGaps(
  session: PieceSession,
  checkCancel?: () => void,
  finalize: Finalize = rawFamilies,
): PieceFamily[] {
  const results = cache.get(session) ?? new WeakMap<Finalize, PieceFamily[]>();
  const saved = results.get(finalize);
  let prior: PieceFamily[] | undefined;
  const baseline = () => (prior ??= finalize(session));
  if (saved) return saved;
  if (
    session.sheet.holes?.length ||
    session.families.every((f) =>
      f.candidates.every((c) => c.outcome !== 'leak' || !c.leakAt || !c.gradeHint?.pred.length),
    )
  )
    return baseline();
  const boxes = session.set.chains.map((c) => bboxOf(c.pts));
  const skipped = pageMarginIds(session.set.chains, session.sheet.poses);
  for (const id of session.walls.exclude) skipped.add(id);
  const lines = session.set.chains.map((c) => {
    if (c.closed || !c.ranges.length) return new Float32Array(0);
    return Float32Array.from(c.pts.flatMap((p) => [p.x, p.y]));
  });
  const families = session.families.map((family) => {
    const closed = family.candidates
      .filter((c) => c.outcome === 'closed' && !c.derived?.length && c.rankFrom === 'class')
      .sort((a, b) => a.rank - b.rank);
    const candidates = family.candidates.map((c) => {
      checkCancel?.();
      if (
        c.outcome !== 'leak' ||
        !c.leakAt ||
        c.hole ||
        !c.gradeHint?.pred.length ||
        c.gradeHint.extrapolated
      )
        return c;
      const lo = closed.filter((x) => x.rank < c.rank).pop();
      const hi = closed.find((x) => x.rank > c.rank);
      if (!lo || !hi) return c;
      const label = session.run.sizes[c.rank]?.label;
      const own = new Set<number>();
      const allowed = new Set<number>();
      const forbidden = new Set(skipped);
      for (const row of session.set.classes) {
        const target = row.role === 'size' && row.sizeLabel === label;
        for (const id of row.chains) {
          if (target) own.add(id);
          if (target || row.role === 'common') allowed.add(id);
          else forbidden.add(id);
        }
      }
      for (const id of forbidden) allowed.delete(id);
      const pred = c.gradeHint.pred;
      const pairs = gapPairs(c.leakAt, lines, forbidden, 40, allowed, (p) =>
        eligiblePair(p, own, pred),
      );
      if (!pairs.length) return c;
      const seed = session.seeds.find((s) => s.id === family.seed);
      const closes = seed && sourceClosure(session, allowed, seed.at, hi, boxes);
      if (!closes) return c;
      const options: NonNullable<PieceCandidate['gapOptions']> = [];
      let unique: PieceCandidate | undefined;
      for (const pair of pairs) {
        checkCancel?.();
        if (!closes(pair)) continue;
        const result = verifiedTrial(session, family, c, pair, allowed, lo, hi, finalize, baseline);
        if (!result || options.some((o) => equivalentCut(o.outer, result.preview.outer))) continue;
        unique = result.candidate;
        options.push({ outer: result.preview.outer, bridges: [{ from: pair.from, to: pair.to }] });
      }
      if (options.length === 1 && unique) return unique;
      return options.length ? { ...c, gapOptions: options } : c;
    });
    if (candidates.every((c, i) => c === family.candidates[i])) return family;
    // Independent successful trials cannot introduce a size-order inversion between two new sizes.
    const ranked = candidates.filter((c) => c.outcome === 'closed').sort((a, b) => a.rank - b.rank);
    const conflicts = new Set<PieceCandidate>();
    for (let i = 1; i < ranked.length; i++) {
      const a = ranked[i - 1],
        b = ranked[i];
      if (!(a.gapRecovery || b.gapRecovery)) continue;
      if (a.areaMm2 >= b.areaMm2 || !insideWithin(a.outer, b.outer)) {
        if (a.gapRecovery) conflicts.add(a);
        if (b.gapRecovery) conflicts.add(b);
      }
    }
    const accepted = candidates.map((c, i) => (conflicts.has(c) ? family.candidates[i] : c));
    return {
      ...family,
      candidates: accepted,
      monotone: accepted.some((c) => c.gapRecovery) ? isMonotone(accepted) : family.monotone,
    };
  });
  let result = baseline();
  if (families.some((f, i) => f !== session.families[i])) {
    const published = finalize({ ...session, families });
    if (preservesClosed(result, published)) result = published;
  }
  results.set(finalize, result);
  cache.set(session, results);
  return result;
}
