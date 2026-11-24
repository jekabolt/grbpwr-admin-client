// Offline: vite-node scripts/pattern-import/gap-evidence-check.ts <accepted shot> <new JSONL>
//   <fresh graded rows directory or WD_ALL shot> [earlier JSONL to restrict the replay]
// Masks known contour intervals, then replays open holes against assigned and unassigned strokes.
// A positive strict/draw replay still needs a native eligibility and whole-file check.
import { appendFileSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { repairSize, type GfitWall } from 'lib/pattern-import/pieces/gfit/repair';
import { GRADE_DRAW, GRADE_P2, type RepairProbe } from 'lib/pattern-import/pieces/gfit/repair-hook';
import { SegGrid, segNearest, resample } from 'lib/pattern-import/pieces/geom';
import { fitFamily } from 'lib/pattern-import/pieces/gfit/fit';
import { referenceSpan, spanError, straightSpan } from './gap-span';
import type { PtMm } from 'lib/pattern-import/types';

const [shot, output, archive, previousReport] = process.argv.slice(2);
if (!archive)
  throw new Error('Expected accepted shot directory, new JSONL path and WD_ALL archive');
const read = <T>(p: string): T => JSON.parse(readFileSync(p, 'utf8'));
const distance = (a: PtMm, b: PtMm) => Math.hypot(a.x - b.x, a.y - b.y);
const near = (a: PtMm, b: PtMm) => distance(a, b) <= 0.75;
type Clip = GfitWall & { source: number };
type End = { p: PtMm; inner: PtMm; wall: GfitWall };
function ends(w: GfitWall): End[] {
  if (w.closed || w.pts.length < 2) return [];
  const result: End[] = [];
  for (const side of [1, -1]) {
    const i = side === 1 ? 0 : w.pts.length - 1,
      p = w.pts[i];
    for (let j = i + side; j >= 0 && j < w.pts.length; j += side) {
      if (distance(w.pts[j], p) < 2) continue;
      result.push({ p, inner: w.pts[j], wall: w });
      break;
    }
  }
  return result;
}
function uniquePath(a: PtMm, b: PtMm, candidates: End[][]) {
  const paths: GfitWall[][] = [];
  for (const pair of candidates) {
    for (const [start, end] of [
      [pair[0], pair[1]],
      [pair[1], pair[0]],
    ]) {
      if (!near(start.p, a)) continue;
      if (near(end.p, b)) paths.push([start.wall]);
      else
        for (const next of candidates) {
          if (next === pair) continue;
          if (
            (near(end.p, next[0].p) && near(next[1].p, b)) ||
            (near(end.p, next[1].p) && near(next[0].p, b))
          )
            paths.push([start.wall, next[0].wall]);
        }
      if (paths.length > 1) return null;
    }
  }
  return paths.length === 1 ? paths[0] : null;
}
function faces(end: End, p: PtMm) {
  const dx = end.p.x - end.inner.x,
    dy = end.p.y - end.inner.y;
  return (
    (dx * (p.x - end.p.x) + dy * (p.y - end.p.y)) /
      (distance(end.p, end.inner) * distance(end.p, p)) >=
    Math.cos((5 * Math.PI) / 180)
  );
}
function deviation(pts: readonly PtMm[], a: PtMm, b: PtMm) {
  const dx = b.x - a.x,
    dy = b.y - a.y,
    den = dx * dx + dy * dy;
  return Math.max(
    ...pts.map((p) => {
      const t = Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / den));
      return Math.hypot(p.x - a.x - t * dx, p.y - a.y - t * dy);
    }),
  );
}
type WallDump = {
  common: number[];
  byRank: number[][];
  chains: Record<string, { closed: boolean; pts: [number, number][] }>;
};
function archiveInk(d: WallDump) {
  const grid = new SegGrid(5);
  const lines = new Map<number, PtMm[]>();
  const ranks = new Map<number, Set<number>>();
  const common = new Set(d.common);
  d.byRank.forEach((ids, r) =>
    ids.forEach((id) => {
      if (!ranks.has(id)) ranks.set(id, new Set());
      ranks.get(id)!.add(r);
    }),
  );
  for (const [key, w] of Object.entries(d.chains)) {
    const line = w.pts.map(([x, y]) => ({ x, y }));
    if (w.closed && line.length) line.push(line[0]);
    lines.set(+key, line);
    grid.addPolyline(+key, line);
  }
  const hits = (p: PtMm, mm: number) => {
    const found = new Map<number, { i: number; d: number; q: PtMm }>();
    grid.near(p, mm, (id, i) => {
      const line = lines.get(id)!;
      const hit = segNearest(p, line[i], line[i + 1]);
      if (hit.d <= mm && hit.d < (found.get(id)?.d ?? Infinity)) found.set(id, { i, ...hit });
    });
    return found;
  };
  const role = (id: number, r: number) =>
    common.has(id)
      ? 'common'
      : ranks.get(id)?.has(r)
        ? 'own'
        : ranks.has(id)
          ? 'other-size'
          : 'unassigned';
  return (gap: readonly PtMm[], rank: number) => {
    const head = hits(gap[0], 0.75),
      tail = hits(gap[gap.length - 1], 0.75);
    // Independent coordinate check: actual recorded ends must both land on a line attributed
    // to the current rank or common in the older dump, to within its sampling precision.
    const aligned = (h: typeof head) =>
      [...h].some(([id, v]) => v.d <= 0.25 && ['own', 'common'].includes(role(id, rank)));
    if (!aligned(head) || !aligned(tail)) return null;
    const close = (pts: readonly PtMm[], to: readonly PtMm[]) =>
      resample(pts, 0.5, false).every((p) =>
        to.slice(1).some((q, i) => segNearest(p, to[i], q).d <= 1),
      );
    const matches = [];
    for (const [id, a] of head) {
      const b = tail.get(id);
      if (!b) continue;
      const line = lines.get(id)!;
      const [lo, hi] = a.i <= b.i ? [a, b] : [b, a];
      const part = [lo.q, ...line.slice(lo.i + 1, hi.i + 1), hi.q];
      if (close(part, gap) && close(gap, part))
        matches.push({ id, role: role(id, rank), pts: part });
    }
    // A fully sampled gap can still follow several pens. Count foreign-only samples separately.
    const samples = resample(gap, 1, false);
    let own = 0,
      withLoose = 0,
      anyInk = 0;
    const rows = samples.map((p) => hits(p, 1));
    const needed = new Set<number>();
    let ambiguous = false;
    for (const row of rows) {
      const roles = new Set([...row.keys()].map((id) => role(id, rank)));
      const assigned = roles.has('own') || roles.has('common');
      if (!assigned) {
        const loose = [...row.keys()].filter((id) => role(id, rank) === 'unassigned');
        if (loose.length !== 1 || roles.has('other-size')) ambiguous = true;
        else needed.add(loose[0]);
      }
      own += Number(assigned);
      withLoose += Number(assigned || roles.has('unassigned'));
      anyInk += Number(roles.size > 0);
    }
    const fragments: Clip[] = [];
    if (!ambiguous && own < samples.length && withLoose === samples.length) {
      for (const id of needed) {
        const line = lines.get(id)!;
        for (let i = 0; i < rows.length; ) {
          if (!rows[i].has(id)) {
            i++;
            continue;
          }
          const start = i;
          while (i + 1 < rows.length && rows[i + 1].has(id)) i++;
          const a = rows[start].get(id)!,
            b = rows[i].get(id)!;
          const [lo, hi] = a.i <= b.i ? [a, b] : [b, a];
          const part = [lo.q, ...line.slice(lo.i + 1, hi.i + 1), hi.q],
            segment = samples.slice(start, i + 1);
          if (
            start < i &&
            distance(a.q, b.q) >= 1.5 &&
            close(part, segment) &&
            close(segment, part)
          )
            fragments.push({ kind: 'loose', source: id, pts: part });
          i++;
        }
      }
    }
    return { fragments, matches, coverage: { samples: samples.length, own, withLoose, anyInk } };
  };
}
type Family = {
  seed: number;
  cells: {
    size: string;
    outcome: string;
    refusal?: string;
    reason?: string;
    from?: string;
    derivedMm?: number;
    outer?: [number, number][];
  }[];
};
const clean = (c: Family['cells'][number]) =>
  c.outcome === 'closed' && c.from === 'class' && c.derivedMm === 0 && !!c.outer?.length;
const ring = (c: Family['cells'][number]) => c.outer!.map(([x, y]) => ({ x, y }));
// An existing full report can restrict a repeat to cells where at least one gap had full
// sampled coverage only after including unassigned ink, or two agreeing reference spans.
// This prefilter uses no replay verdict.
const selected = new Map<string, Set<string>>();
if (previousReport) {
  for (const line of readFileSync(previousReport, 'utf8').trim().split('\n')) {
    const row = JSON.parse(line) as {
      mode: string;
      id: string;
      seed: number;
      size: string;
      holes?: {
        corroboratedSpan?: boolean;
        coverage?: { own: number; withLoose: number; samples: number };
      }[];
    };
    if (
      !row.holes?.some(
        (h) =>
          h.corroboratedSpan ||
          (h.coverage &&
            h.coverage.own < h.coverage.samples &&
            h.coverage.withLoose === h.coverage.samples),
      )
    )
      continue;
    if (!selected.has(row.id)) selected.set(row.id, new Set());
    selected.get(row.id)!.add(JSON.stringify([row.seed, row.size]));
  }
}
writeFileSync(output, '', { flag: 'wx' });
for (const { id } of read<{ id: string }[]>(join(shot, 'shot.json'))) {
  if (previousReport && !selected.has(id)) continue;
  const dir = join(shot, id);
  if (!existsSync(join(dir, 'probes.json'))) continue;
  const fam = read<Family[]>(join(dir, 'cells.json'));
  const { probes, card } = read<{ probes: RepairProbe[]; card: string[] }>(
    join(dir, 'probes.json'),
  );
  const freshPath = join(archive, id + '.json');
  const fresh = existsSync(freshPath)
    ? read<{ id: string; card: string[]; rows: WallDump }>(freshPath)
    : null;
  if (fresh && (fresh.id !== id || JSON.stringify(card) !== JSON.stringify(fresh.card)))
    throw new Error('Source rows and probe differ ' + id);
  const archived = join(archive, id, 'walls-dump.json');
  const dumps = fresh ? [fresh.rows] : existsSync(archived) ? read<WallDump[]>(archived) : [];
  const inspect =
    dumps.length === 1 && dumps[0].byRank.length === card.length ? archiveInk(dumps[0]) : null;
  for (const family of previousReport ? [] : fam) {
    const cells = family.cells;
    if (!cells.some((c) => c.outcome !== 'closed')) continue;
    const ranks = cells.flatMap((v, r) => (clean(v) ? [r] : []));
    if (ranks.length < 2) continue;
    const target = ranks[Math.floor(ranks.length / 2)];
    const refs = ranks
      .filter((r) => r !== target)
      .sort((a, b) => Math.abs(a - target) - Math.abs(b - target) || a - b)
      .slice(0, 2);
    const rings = refs.map((r) => ring(cells[r]));
    const samples = resample(ring(cells[target]), 0.5, true);
    const at = (i: number) => samples[(i + samples.length) % samples.length];
    for (const mm of [20, 40])
      for (const frac of [0.125, 0.375, 0.625, 0.875]) {
        const n = mm * 2;
        if (samples.length < n + 12) continue;
        const i = Math.floor(frac * samples.length);
        const a = { p: at(i), inner: at(i - 4) },
          b = { p: at(i + n), inner: at(i + n + 4) };
        if (distance(a.p, b.p) <= 12 || distance(a.p, b.p) > 60) continue;
        const hidden = Array.from({ length: n + 1 }, (_, j) => at(i + j));
        const straight = straightSpan(a, b);
        const spans = rings.map((o) => referenceSpan(a, b, o));
        const pair =
          spans.length === 2 && spans[0] && spans[1] ? spanError(spans[0], spans[1]) : null;
        appendFileSync(
          output,
          JSON.stringify({
            mode: 'hidden-interval',
            id,
            seed: family.seed,
            rank: target,
            mm,
            frac,
            straight: straight ? spanError(straight, hidden) : null,
            single: spans[0] ? spanError(spans[0], hidden) : null,
            corroborated: !!pair && pair.p95 <= 0.5 && pair.max <= 1.5,
          }) + '\n',
        );
      }
  }
  const seen = new Set<string>();
  for (const p of probes) {
    const c = fam.find((f) => f.seed === p.seed)?.cells.find((c) => c.size === card[p.rank]);
    if (
      !c ||
      c.outcome === 'closed' ||
      (previousReport && !selected.get(id)?.has(JSON.stringify([p.seed, c.size])))
    )
      continue;
    const key = p.seed + '/' + p.rank;
    if (seen.has(key)) throw new Error('Duplicate probe ' + id + '/' + key);
    seen.add(key);
    const reason = (c.refusal || c.reason || c.outcome).split('|')[0];
    const emit = (v: object) =>
      appendFileSync(
        output,
        JSON.stringify({ id, seed: p.seed, size: c.size, reason, ...v }) + '\n',
      );
    if (reason === 'not-bracketed') {
      const f = fitFamily(p.ins, { tol: p.tol, frame: 'stacked' });
      emit({
        mode: 'anchors',
        trusted: f.trusted.length,
        local: f.why === 'inconsistent',
        distance: Math.min(...f.trusted.map((r) => Math.abs(r - p.rank))),
      });
    }
    const assigned = p.walls.filter((w) => w.kind === 'own' || w.kind === 'common');
    const endpoints = assigned.flatMap(ends);
    const loose = p.walls
      .filter((w) => w.kind === 'loose')
      .map(ends)
      .filter((v) => v.length === 2);
    // Positive control: remove an assigned stroke and use only ends of other walls as the query.
    // Negative control: remove the true stroke from the candidate pool as well.
    for (const w of assigned) {
      if (w.kind !== 'own') continue;
      const e = ends(w);
      if (e.length !== 2) continue;
      const gap = distance(e[0].p, e[1].p);
      if (gap <= 1.5 || gap > 60) continue;
      const other = endpoints.filter((v) => v.wall !== w);
      const left = other.filter((v) => near(v.p, e[0].p)),
        right = other.filter((v) => near(v.p, e[1].p));
      if (left.length !== 1 || right.length !== 1) continue;
      const a = left[0],
        b = right[0];
      const path = uniquePath(a.p, b.p, [...loose, e]);
      const straight = gap > 12 && faces(a, b.p) && faces(b, a.p);
      emit({
        mode: 'hidden-stroke',
        loose: loose.length,
        correct: path?.length === 1 && path[0] === w,
        falseWhenAbsent: !!uniquePath(a.p, b.p, loose),
        straight,
        straightMaxMm: straight ? deviation(w.pts, a.p, b.p) : null,
      });
      break;
    }
    if (reason !== 'E1-cover' && !reason.startsWith('E2')) continue;
    const base = repairSize(
      p.ins,
      p.rank,
      p.walls.filter((w) => w.kind !== 'loose'),
      { tol: p.tol, frame: 'stacked', fast: true },
    );
    const clips: Clip[] = [];
    const fragments: Clip[] = [];
    const holes = base.holes.map((h) => {
      const a = h.pts[0],
        b = h.pts[h.pts.length - 1];
      if (!a || !b || distance(a, b) <= 1.5 || distance(a, b) > 60) return {};
      const evidence = inspect?.(h.pts, p.rank);
      const raw = evidence?.matches ?? [];
      fragments.push(...(evidence?.fragments ?? []));
      const observed = {
        raw: raw.map(({ id, role }) => ({ id, role })),
        coverage: evidence?.coverage,
        lengthMm: h.lenMm,
      };
      if (raw.length === 1 && raw[0].role === 'unassigned')
        clips.push({ kind: 'loose', source: raw[0].id, pts: raw[0].pts });
      const l = endpoints.filter((e) => near(e.p, a)),
        r = endpoints.filter((e) => near(e.p, b));
      if (
        l.length !== 1 ||
        r.length !== 1 ||
        (l[0].wall.kind !== 'own' && r[0].wall.kind !== 'own')
      )
        return observed;
      const path = uniquePath(l[0].p, r[0].p, loose);
      const refs = Array.from(p.ins)
        .filter((v) => v.anchor)
        .sort((a, b) => Math.abs(a.rank - p.rank) - Math.abs(b.rank - p.rank))
        .slice(0, 2);
      const spans = distance(a, b) > 12 ? refs.map((v) => referenceSpan(l[0], r[0], v.outer)) : [];
      const pair =
        spans.length === 2 && spans[0] && spans[1] ? spanError(spans[0], spans[1]) : null;
      return {
        ...observed,
        localCoverage:
          pair && pair.p95 <= 0.5 && pair.max <= 1.5 && spans[0]
            ? inspect?.(spans[0], p.rank)?.coverage
            : undefined,
        singleSpan: !!spans[0],
        corroboratedSpan: !!pair && pair.p95 <= 0.5 && pair.max <= 1.5,
        ends: true,
        path: path?.length ?? 0,
        straight: distance(a, b) > 12 && faces(l[0], b) && faces(r[0], a),
      };
    });
    // Compare the same strict and draw checks with and without the candidate. A replay pass
    // is only a lead. The full export and nesting gates are downstream of this experiment.
    const replay = (ws: GfitWall[]) => {
      for (const draw of [false, true]) {
        const bounds = draw ? GRADE_DRAW : GRADE_P2;
        const rep = repairSize(p.ins, p.rank, ws, {
          tol: p.tol,
          frame: 'stacked',
          fast: true,
          ...(draw
            ? { draw: { maxShare: GRADE_DRAW.maxShare, extrapolate: GRADE_DRAW.extrapolate } }
            : {}),
        });
        if (
          rep.ok &&
          rep.outer &&
          rep.holes.length <= bounds.maxHoles &&
          rep.holes.reduce((sum, h) => sum + h.lenMm, 0) <= bounds.maxHolesMm
        )
          return draw ? 'draw' : 'strict';
      }
      return 'refused';
    };
    const trial = clips.length
      ? { before: replay(p.walls), after: replay([...p.walls, ...clips]) }
      : undefined;
    const fragmentTrial = fragments.length
      ? { before: trial?.before ?? replay(p.walls), after: replay([...p.walls, ...fragments]) }
      : undefined;
    const winner = (v: typeof trial) => v?.before === 'refused' && v.after !== 'refused';
    emit({
      mode: 'open-holes',
      loose: loose.length,
      holes,
      trial,
      fragmentTrial,
      ...(winner(trial) ? { rawClips: clips } : {}),
      ...(winner(fragmentTrial) ? { fragmentClips: fragments } : {}),
    });
  }
}
