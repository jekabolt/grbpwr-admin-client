// Repeated source marks can survive PDF extraction while their assembled chain is ignored or
// absent. Read the order of the printed pen independently on each tile before joining the tiles.
import type { ChainSet, IRPath, PieceCandidate, PtMm, Seed, Sheet, SizeRun } from '../types';
import { ringSelfIntersects } from 'lib/fusing-dxf/spline';
import {
  bboxOf,
  dist,
  pointInPoly,
  polyLen,
  quantile,
  segNearest,
  signedArea,
  simplify,
} from './geom';

type Mark = { path: IRPath; area: number; length: number; center: PtMm; colour: string };
type Sample = { marks: Mark[]; types: Mark[]; word: number[]; pitch: number; mean: number };
const cross = (a: PtMm, b: PtMm) => a.x * b.y - a.y * b.x;
const minus = (p: PtMm, q: PtMm) => ({ x: p.x - q.x, y: p.y - q.y });
const dot = (p: PtMm, q: PtMm) => p.x * q.x + p.y * q.y;
const unit = (q: PtMm) => {
  const d = Math.hypot(q.x, q.y);
  return { x: q.x / d, y: q.y / d };
};
const onRing = (p: PtMm, ring: PtMm[]) =>
  ring.reduce((d, a, i) => Math.min(d, segNearest(p, a, ring[(i + 1) % ring.length]).d), Infinity);
function description(path: IRPath, sheet: Sheet): Mark | undefined {
  const st = sheet.styles[path.style];
  if (path.background || !st?.strokeRgb || st.dash?.length || path.pts.length < 2) return;
  const length = polyLen(path.pts, path.closed);
  if (length > 15 || length < 0.2) return;
  const b = bboxOf(path.pts);
  return {
    path,
    area: Math.abs(signedArea(path.pts)),
    length,
    center: { x: (b.minX + b.maxX) / 2, y: (b.minY + b.maxY) / 2 },
    colour: JSON.stringify([st.strokeRgb, st.fill, st.layer]),
  };
}
function sameShape(a: Mark, b: Mark, tolerance = 0.12) {
  return (
    a.colour === b.colour &&
    a.path.closed === b.path.closed &&
    Math.abs(a.length / b.length - 1) < tolerance &&
    (!a.path.closed || Math.abs(a.area / b.area - 1) < tolerance)
  );
}
function sampleOf(marks: Mark[]): Sample | undefined {
  if (marks.length < 6 || !marks.some((m) => m.path.closed)) return;
  const types: Mark[] = [];
  const sequence = marks.map((m) => {
    let i = types.findIndex((t) => sameShape(m, t, 0.055));
    if (i < 0) {
      i = types.length;
      types.push(m);
    }
    return i;
  });
  for (let n = 1; n <= sequence.length / 3; n++) {
    if (!sequence.every((t, i) => t === sequence[i % n])) continue;
    const pitch = quantile(
      marks.slice(n).map((m, i) => dist(m.center, marks[i].center)),
      0.5,
    );
    if (pitch <= 0.8 || pitch > 10) return;
    return { marks, types, word: sequence.slice(0, n), pitch, mean: pitch / n };
  }
}
function strips(marks: Mark[], key: Sample, pred: PtMm[]) {
  const out: Mark[][] = [];
  let strip: Mark[] = [];
  const index = (m: Mark) => key.types.findIndex((t) => sameShape(m, t));
  const flush = () => {
    if (strip.length >= Math.max(3, key.word.length)) {
      const seq = strip.map(index);
      const share = (v: number, a: number[]) => a.filter((t) => t === v).length / a.length;
      const matches = key.types.every(
        (_, i) => Math.abs(share(i, seq) - share(i, key.word)) < 0.18,
      );
      const periodic = seq.filter(
        (t, i) => i >= key.word.length && seq[i - key.word.length] === t,
      ).length;
      if (
        matches &&
        (seq.length <= key.word.length || periodic >= (seq.length - key.word.length) * 0.8) &&
        strip.every((m) => onRing(m.center, pred) < Math.max(3 * key.pitch, 6))
      )
        out.push(strip);
    }
    strip = [];
  };
  for (const m of marks) {
    if (!m.path.visibleMotif || index(m) < 0) {
      flush();
      continue;
    }
    const p = strip.at(-1);
    if (
      p &&
      (p.path.src.page !== m.path.src.page ||
        m.path.src.op - p.path.src.op > 13 ||
        dist(m.center, p.center) > 1.25 * key.pitch + 2)
    )
      flush();
    strip.push(m);
  }
  flush();
  return out;
}
function cycle(parts: Mark[][], key: Sample) {
  if (parts.length < 2) return;
  const links = parts.map((p, i) =>
    parts.flatMap((q, j) =>
      i !== j && dist(p.at(-1)!.center, q[0].center) <= Math.max(2.1 * key.mean, 1.05 * key.pitch)
        ? [j]
        : [],
    ),
  );
  if (links.some((a) => a.length !== 1) || new Set(links.flat()).size !== parts.length) return;
  const seen = new Set<number>();
  let i = 0;
  const marks: Mark[] = [];
  while (!seen.has(i)) {
    seen.add(i);
    marks.push(...parts[i]);
    i = links[i][0];
  }
  if (i === 0 && seen.size === parts.length) return marks;
}
// A triangle or a crescent has its baseline along the straight chord of the drawing. Its centre
// is the halfway point of its two transverse extents in that frame. Round marks have a centre
// of symmetry. Open strokes are held back as independent evidence.
function markCentre(m: Mark) {
  const pts = m.path.pts;
  const edges = pts
    .map((p, i) => ({
      a: p,
      b: pts[(i + 1) % pts.length],
      len: dist(p, pts[(i + 1) % pts.length]),
    }))
    .sort((a, b) => b.len - a.len);
  if (edges.length < 3 || edges[0].len < 1.22 * edges[1].len) return m.center;
  const t = unit(minus(edges[0].b, edges[0].a)),
    n = { x: -t.y, y: t.x };
  const x = pts.map((p) => dot(p, t)),
    y = pts.map((p) => dot(p, n));
  const cx = (Math.max(...x) + Math.min(...x)) / 2,
    cy = (Math.max(...y) + Math.min(...y)) / 2;
  return { x: cx * t.x + cy * n.x, y: cx * t.y + cy * n.y };
}
function markedRing(marks: Mark[], key: Sample) {
  const circular = (m: Mark) => {
    if (!m.path.closed || m.path.pts.length < 7) return false;
    const radii = m.path.pts.map((p) => dist(p, m.center));
    return Math.min(...radii) > 0.85 * Math.max(...radii);
  };
  const round = key.types.filter(circular);
  const centers = marks
    .filter((m) => m.path.closed && (!round.length || round.some((t) => sameShape(m, t))))
    .map((m) => (round.length ? m.center : markCentre(m)));
  const n = centers.length;
  if (n < 40 || centers.some((p, i) => !(dist(p, centers[(i + 1) % n]) > 1e-7))) return;
  const at = (i: number) => centers[(i + n) % n];
  const angle = (i: number) => dot(unit(minus(at(i), at(i - 1))), unit(minus(at(i + 1), at(i))));
  const sharp = centers.map((_, i) => angle(i) < Math.cos((22 * Math.PI) / 180));
  // At a corner the last mark on the incoming side and the first on the outgoing side face a
  // gap. Both arms need independent centres on the same heading before they can be intersected.
  const ring: PtMm[] = [];
  let turns = 0;
  const covered = new Set<number>();
  for (let i = 0; i < n; i++) {
    const a = at(i);
    ring.push(a);
    if (!sharp[i] && !sharp[(i + 1) % n]) continue;
    const b = at(i + 1),
      u = unit(minus(a, at(i - 1))),
      v = unit(minus(at(i + 2), b));
    if (
      dot(u, v) > 0.8 ||
      dot(u, unit(minus(at(i - 1), at(i - 2)))) < 0.995 ||
      dot(v, unit(minus(at(i + 3), at(i + 2)))) < 0.995
    )
      continue;
    const det = cross(u, v);
    if (Math.abs(det) < 0.3) continue;
    const t = cross(minus(b, a), v) / det,
      corner = { x: a.x + t * u.x, y: a.y + t * u.y };
    if (t < 0 || dot(minus(b, corner), v) < 0 || t + dist(corner, b) > 2.2 * key.pitch) continue;
    if (covered.has(i) || covered.has((i + 1) % n)) return;
    covered.add(i);
    covered.add((i + 1) % n);
    ring.push(corner);
    turns++;
  }
  if (turns < 3 || sharp.some((s, i) => s && !covered.has(i)) || ringSelfIntersects(ring)) return;
  if (signedArea(ring) < 0) ring.reverse();
  return ring;
}
export function readPrintedMarkContours(
  sheet: Sheet,
  set: ChainSet,
  run: SizeRun,
  seeds: Seed[],
  cells: Map<number, PieceCandidate[]>,
  excluded: ReadonlySet<number>,
) {
  if (
    sheet.missing.length ||
    sheet.holes?.length ||
    set.assigned?.length ||
    excluded.size ||
    new Set(sheet.poses.map((p) => p.file)).size !== 1
  )
    return;
  const pending = seeds.flatMap((seed) =>
    (cells.get(seed.id) ?? [])
      .filter((c) => c.outcome === 'leak' && !c.hole && c.gradeHint && !c.gradeHint.extrapolated)
      .map((c) => ({ seed, c })),
  );
  if (!pending.length) return;
  const desc = sheet.paths.map((p) => description(p, sheet)),
    sorted = desc
      .filter((m): m is Mark => !!m)
      .sort((a, b) => a.path.src.page - b.path.src.page || a.path.src.op - b.path.src.op);
  const byId = new Map(sorted.map((m) => [m.path.id, m]));
  const keys = run.sizes.map((s) => {
    const row = set.classes.find((c) => c.id === s.classId);
    const proof = row?.evidence.find((e) => e.kind === 'legend-sample' && e.label === s.label);
    if (row?.role !== 'size' || proof?.kind !== 'legend-sample') return;
    const paths = set.chains[proof.chain]?.ranges.map((r) => byId.get(r.path));
    if (paths?.every((p): p is Mark => !!p)) return sampleOf(paths);
  });
  for (const { seed, c } of pending) {
    const key = keys[c.rank];
    if (!key) continue;
    if (
      keys.some(
        (other, i) =>
          i !== c.rank &&
          other &&
          other.word.length === key.word.length &&
          other.types.length === key.types.length &&
          other.types.every((t) => key.types.some((u) => sameShape(t, u))),
      )
    )
      continue;
    const family = cells.get(seed.id)!;
    const lo = family.find((q) => q.rank === c.rank - 1),
      hi = family.find((q) => q.rank === c.rank + 1);
    if (lo?.outcome !== 'closed' || hi?.outcome !== 'closed') continue;
    const marks = cycle(strips(sorted, key, c.gradeHint!.pred), key);
    if (!marks) continue;
    const outer = markedRing(marks, key);
    if (!outer) continue;
    const area = signedArea(outer);
    if (
      area <= lo.areaMm2 ||
      area >= hi.areaMm2 ||
      !pointInPoly(seed.at, outer) ||
      seeds.some((s) => s.id !== seed.id && pointInPoly(s.at, outer))
    )
      continue;
    const compact = simplify([...outer, outer[0]], 0.025).slice(0, -1);
    if (compact.length < 3 || ringSelfIntersects(compact)) continue;
    const edges = compact.map((a, i) => ({ a, b: compact[(i + 1) % compact.length], start: 0 }));
    let perimeter = 0;
    for (const edge of edges) {
      edge.start = perimeter;
      perimeter += dist(edge.a, edge.b);
    }
    const positions: number[] = [];
    const errors = marks.flatMap((m) => {
      let nearest = edges[0],
        min = Infinity,
        position = 0;
      for (const e of edges) {
        const hit = segNearest(m.center, e.a, e.b);
        if (hit.d < min) {
          min = hit.d;
          nearest = e;
          position = e.start + hit.u * dist(e.a, e.b);
        }
      }
      positions.push(position);
      if (!m.path.closed) return m.path.pts.map((p) => onRing(p, compact));
      if (key.types.length === 1) return [onRing(markCentre(m), compact)];
      const axis = unit(minus(nearest.b, nearest.a)),
        normal = { x: -axis.y, y: axis.x };
      const across = m.path.pts.map((p) => dot(minus(p, m.center), normal));
      const off = (Math.max(...across) + Math.min(...across)) / 2;
      return [onRing({ x: m.center.x + normal.x * off, y: m.center.y + normal.y * off }, compact)];
    });
    if (errors.some((d) => d > 0.25) || quantile(errors, 0.95) > 0.08) continue;
    positions.sort((a, b) => a - b);
    const gaps = positions.map(
      (p, i) => (i + 1 === positions.length ? positions[0] + perimeter : positions[i + 1]) - p,
    );
    const span = Math.max(key.pitch, 2 * key.mean);
    const sourceCoverage = gaps.reduce((n, v) => n + Math.min(span, v), 0) / perimeter;
    if (sourceCoverage < 0.98 || gaps.some((g) => g > 1.55 * span)) continue;
    const ids = new Set(marks.map((m) => m.path.id)),
      row = set.classes.find((r) => r.id === run.sizes[c.rank].classId)!;
    // A complete independent loop must also reproduce the great majority of a chain already
    // assigned to this size. At least one substantial source run must be missing from those chains.
    const own = new Set(row.chains.flatMap((id) => set.chains[id].ranges.map((r) => r.path)));
    const support = marks.filter((m) => own.has(m.path.id)).length / marks.length;
    if (support < 0.65 || support > 0.995) continue;
    const walls = row.chains.filter((id) => {
      const chain = set.chains[id];
      return (
        chain.ranges.some((r) => ids.has(r.path)) &&
        chain.pts.every((p) => onRing(p, compact) < 0.4)
      );
    });
    const inside = (p: PtMm) => pointInPoly(p, compact);
    const next: PieceCandidate = {
      ...c,
      outer: compact,
      bbox: bboxOf(compact),
      areaMm2: signedArea(compact),
      walls,
      printedMotif: { key: key.marks.map((m) => m.path.id), paths: [...ids] },
      rankFrom: 'printed-motif',
      outcome: 'closed',
      sourceCoverage,
      p95Mm: quantile(errors, 0.95),
      inside: set.chains
        .filter((ch) => !walls.includes(ch.id) && ch.pts.length > 1 && ch.pts.every(inside))
        .map((ch) => ch.id),
      textsInside: sheet.texts.filter((t) => inside(t.anchor)).map((t) => t.id),
    };
    delete next.gradeHint;
    delete next.gradeRefusal;
    delete next.gradeDetail;
    delete next.leakAt;
    delete next.nest;
    family[family.indexOf(c)] = next;
  }
}
