import type { IRPath, PtMm, Sheet, ChainSet, SizeRun, Seed, PieceCandidate } from '../types';
import { PATIMPORT } from '../types';
import { bboxOf, dist, pointInPoly, quantile, resample, segNearest, signedArea } from './geom';
import { ringSelfIntersects } from 'lib/fusing-dxf/spline';
import { convexHull } from '../semantics/geom';
import { insideWithin } from './gfit/checks';

type Mark = { path: IRPath; kind: string; center: PtMm };
type Axis = { p: PtMm; x: number; y: number };
const axis = (a: PtMm, b: PtMm): Axis => ({
  p: a,
  x: (b.x - a.x) / dist(a, b),
  y: (b.y - a.y) / dist(a, b),
});
const along = (p: PtMm, l: Axis) => (p.x - l.p.x) * l.x + (p.y - l.p.y) * l.y;
const across = (p: PtMm, l: Axis) => (p.y - l.p.y) * l.x - (p.x - l.p.x) * l.y;
const median = (x: number[]) => quantile(x, 0.5);
function marksOf(sheet: Sheet, fullStrokes = false) {
  return sheet.paths.flatMap((path) => {
    const st = sheet.styles[path.style];
    if (
      (!path.visibleMotif &&
        !(fullStrokes && !st.fill && path.visibleEdges === true && !st.localClipPolygon)) ||
      path.background ||
      path.pts.length < 2 ||
      st.dash?.length ||
      !(path.closed || (!st.fill && path.pts.length === 2))
    )
      return [];
    const b = bboxOf(path.pts);
    if (Math.hypot(b.maxX - b.minX, b.maxY - b.minY) > 20) return [];
    return [
      {
        path,
        kind: (st.fill ? 'f' : 's') + path.pts.length + '-' + st.strokeRgb?.join(','),
        center: { x: (b.minX + b.maxX) / 2, y: (b.minY + b.maxY) / 2 },
      },
    ];
  });
}
function wordOf(seq: Mark[]) {
  for (let n = 1; n <= seq.length / 2; n++) {
    if (
      seq.length < Math.max(5, 2 * n + 1) ||
      !seq.every((p, i) => i < n || p.kind === seq[i - n].kind)
    )
      continue;
    const periods = seq.slice(n).map((p, i) => p.center.x - seq[i].center.x);
    const pitch = median(periods);
    if (pitch < 1 || periods.some((x) => Math.abs(x - pitch) > 0.1 * pitch)) continue;
    return { word: seq.slice(0, n).map((m) => m.kind), pitch, source: seq };
  }
}
type Key = NonNullable<ReturnType<typeof wordOf>>;
function legend(sheet: Sheet, set: ChainSet, marks: Mark[], label: string) {
  const texts = sheet.texts.filter(
    (t) =>
      t.text.trim().toLowerCase() === 'size ' + label.toLowerCase() && Math.abs(t.rotationDeg) < 1,
  );
  if (texts.length !== 1) return;
  const t = texts[0];
  const keys = set.classes.flatMap((r) =>
    r.evidence
      .filter((e) => e.kind === 'legend-sample' && Math.abs(e.textAt.x - t.anchor.x) < 2)
      .map((e) => (e.kind === 'legend-sample' ? e.at.x : 0)),
  );
  if (keys.length < 2) return;
  const x1 = Math.max(...keys) + 3;
  const seq = marks
    .filter(
      (m) =>
        m.path.src.page === t.src.page &&
        m.center.x >= t.anchor.x &&
        m.center.x < x1 &&
        Math.abs(m.center.y - (t.anchor.y - 0.3 * t.fontSizeMm)) < 0.4 * t.fontSizeMm,
    )
    .sort((a, b) => a.center.x - b.center.x);
  return wordOf(seq);
}
function template(input: PtMm[]) {
  const pts = input.slice();
  while (pts.length > 3) {
    const err = pts.map(
      (p, i) => segNearest(p, pts[(i + pts.length - 1) % pts.length], pts[(i + 1) % pts.length]).d,
    );
    const j = err.indexOf(Math.min(...err));
    if (err[j] > 1.5) break;
    pts.splice(j, 1);
  }
  return pts;
}
type Pass = { points: Mark[]; pitch: number; axis: Axis };
// Compare the actual glyph geometry in the tangent/normal frame. The PDF may
// stretch the repeat along a side. Its transverse size and normalized silhouette remain.
function glyph(m: Mark, l: Axis) {
  const pts = m.path.pts.map((p) => ({ x: along(p, l), y: across(p, l) })),
    b = bboxOf(pts);
  const w = b.maxX - b.minX,
    h = b.maxY - b.minY;
  return {
    w,
    h,
    pts: pts.map((p) => ({
      x: w > 0.05 ? (p.x - b.minX) / w - 0.5 : 0,
      y: h > 0.05 ? (p.y - b.minY) / h - 0.5 : 0,
    })),
  };
}
function sameGlyph(a: ReturnType<typeof glyph>, b: ReturnType<typeof glyph>, scale: number) {
  if (Math.abs(a.w - b.w * scale) > 0.45 + 0.1 * b.w || Math.abs(a.h - b.h) > 0.12) return false;
  if (a.pts.length !== b.pts.length) return false;
  return [1, -1].some((x) =>
    [1, -1].some((y) =>
      a.pts.every((p) => b.pts.some((q) => Math.hypot(p.x - x * q.x, p.y - y * q.y) < 0.12)),
    ),
  );
}
function passOf(marks: Mark[], line: Axis, key: Key): Pass | undefined {
  const seq = marks.slice().sort((a, b) => along(a.center, line) - along(b.center, line));
  const n = key.word.length;
  if (seq.length < Math.max(4, n * 2)) return;
  const phases = [key.word, key.word.slice().reverse()];
  if (!phases.some((w) => w.some((_, j) => seq.every((m, i) => m.kind === w[(i + j) % n])))) return;
  const span = dist(seq[0].center, seq.at(-1)!.center);
  if (span < 2) return;
  const last = Math.floor((seq.length - 1) / n) * n;
  const l = axis(seq[0].center, seq[last].center);
  const pitch = median(seq.slice(n).map((m, i) => along(m.center, l) - along(seq[i].center, l)));
  if (
    Math.abs(pitch / key.pitch - 1) > 0.32 ||
    seq
      .slice(n)
      .some((m, i) => Math.abs(along(m.center, l) - along(seq[i].center, l) - pitch) > 0.04 * pitch)
  )
    return;
  const keyAxis = { p: { x: 0, y: 0 }, x: 1, y: 0 };
  const proto = key.source.slice(0, n).map((m) => ({ m, g: glyph(m, keyAxis) }));
  const example = seq.map((m) => ({ m, g: glyph(m, l) }));
  if (
    ![proto, proto.slice().reverse()].some((w) =>
      w.some((_, j) =>
        example.every(({ m, g }, i) => {
          const k = w[(i + j) % n];
          return m.kind === k.m.kind && sameGlyph(g, k.g, pitch / key.pitch);
        }),
      ),
    )
  )
    return;
  // The full repeat gives the transverse ink envelope. A whole repeat is required on both arms.
  const offsets = seq.map((m) => m.path.pts.map((p) => across(p, l)));
  const ends = offsets.map((ds) => [Math.min(...ds), Math.max(...ds)]);
  const mid = (Math.min(...ends.map((a) => a[0])) + Math.max(...ends.map((a) => a[1]))) / 2;
  if (
    ends
      .slice(n)
      .some((e, i) => Math.abs(e[0] - ends[i][0]) > 0.09 || Math.abs(e[1] - ends[i][1]) > 0.09)
  )
    return;
  return {
    points: seq,
    pitch,
    axis: { ...l, p: { x: l.p.x - mid * l.y, y: l.p.y + mid * l.x } },
  };
}
function runs(marks: Mark[], a: PtMm, b: PtMm, key: Key): Pass[] {
  const l = axis(a, b),
    len = dist(a, b);
  const pool = marks.filter(
    (m) =>
      Math.abs(across(m.center, l)) < 2.8 &&
      along(m.center, l) > -1 &&
      along(m.center, l) < len + 1,
  );
  const parts: Mark[][] = [];
  for (const m of pool.sort(
    (a, b) => a.path.src.page - b.path.src.page || a.path.src.op - b.path.src.op,
  )) {
    const prev = parts.at(-1)?.at(-1);
    if (
      !prev ||
      prev.path.src.page !== m.path.src.page ||
      m.path.src.op - prev.path.src.op > 25 ||
      !key.word.includes(m.kind) ||
      !key.word.includes(prev.kind)
    )
      parts.push([]);
    parts.at(-1)!.push(m);
  }
  const passes: Pass[] = [];
  for (const part of parts) {
    const sorted = part.sort((a, b) => along(a.center, l) - along(b.center, l));
    // Intersections and clipped end glyphs can truncate an otherwise complete interior repeat.
    let best: Pass | undefined;
    for (let trim = 0; trim <= 4 && !best; trim++)
      for (let i = 0; i <= trim && !best; i++)
        best = passOf(sorted.slice(i, sorted.length - (trim - i)), l, key);
    if (best) passes.push(best);
    else
      for (let i = 0; i < sorted.length; ) {
        const n = Math.max(5, 2 * key.word.length + 1);
        let j = i + n,
          local = passOf(sorted.slice(i, j), l, key);
        if (!local) {
          i++;
          continue;
        }
        while (j < sorted.length) {
          const ext = passOf(sorted.slice(i, j + 1), l, key);
          if (!ext) break;
          local = ext;
          j++;
        }
        passes.push(local);
        i = j;
      }
  }
  // A tile may contain less than two periods near a corner. Extend only an already
  // identified row at positions its own repeated symbols predict, including shape and phase.
  for (const pass of passes) {
    const row = pass.axis,
      seen = new Set(pass.points),
      anchors = pass.points.slice(0, key.word.length);
    const extents = (m: Mark) => {
      const u = m.path.pts.map((p) => along(p, row)),
        v = m.path.pts.map((p) => across(p, row));
      return [Math.max(...u) - Math.min(...u), Math.min(...v), Math.max(...v)];
    };
    for (const part of parts) {
      const connected = part.some((m) => seen.has(m));
      const matches = part
        .filter((m) => {
          return anchors.some((ref) => {
            if (m.kind !== ref.kind) return false;
            const shift = along(m.center, row) - along(ref.center, row),
              count = Math.round(shift / pass.pitch);
            if (Math.abs(shift - count * pass.pitch) > 0.075) return false;
            const e = extents(m),
              f = extents(ref);
            return e.every((v, i) => Math.abs(v - f[i]) < 0.05);
          });
        })
        .sort((a, b) => along(a.center, row) - along(b.center, row));
      // An isolated coincident dot is also common to other sizes on a shared
      // edge. On a different source paint pass require a complete repeat.
      if (!connected) {
        if (matches.length < Math.max(3, key.word.length)) continue;
        const w = key.word;
        if (
          ![w, w.slice().reverse()].some((order) =>
            order.some((_, j) => matches.every((m, i) => m.kind === order[(i + j) % w.length])),
          )
        )
          continue;
        if (
          matches
            .slice(1)
            .some((m, i) => along(m.center, row) - along(matches[i].center, row) > pass.pitch)
        )
          continue;
      }
      for (const m of matches) seen.add(m);
    }
    pass.points = [...seen].sort((a, b) => along(a.center, row) - along(b.center, row));
  }
  return passes;
}
function hit(a: Axis, b: Axis) {
  const det = a.x * b.y - a.y * b.x;
  if (Math.abs(det) < 0.06) return;
  const t = ((b.p.x - a.p.x) * b.y - (b.p.y - a.p.y) * b.x) / det;
  return { x: a.p.x + t * a.x, y: a.p.y + t * a.y };
}
export function inspectPrintedMotif(
  sheet: Sheet,
  set: ChainSet,
  label: string,
  pred: PtMm[],
  marks = marksOf(sheet),
) {
  const key = legend(sheet, set, marks, label),
    shape = template(pred);
  if (
    !key ||
    shape.length < 3 ||
    shape.length > 12 ||
    shape.some((p, i) => dist(p, shape[(i + 1) % shape.length]) < key.pitch)
  )
    return;
  const sides = shape.map((p, i) => runs(marks, p, shape[(i + 1) % shape.length], key));
  return { key, shape, sides };
}

export function measuredMotifPolygon(read: NonNullable<ReturnType<typeof inspectPrintedMotif>>) {
  const { shape, sides } = read;
  if (sides.some((ps) => !ps.length)) return;
  const axes = sides.map(
    (passes) => passes.reduce((best, p) => (best.points.length > p.points.length ? best : p)).axis,
  );
  const corners: PtMm[] = [];
  for (let i = 0; i < axes.length; i++) {
    const q = hit(axes[(i + axes.length - 1) % axes.length], axes[i]);
    if (!q || dist(q, shape[i]) > 3) return;
    corners.push(q);
  }
  const edges = sides.map((passes, i) => {
    const a = corners[i],
      b = corners[(i + 1) % corners.length],
      l = axis(a, b);
    const pitch = median(passes.map((p) => p.pitch));
    const intervals = passes
      .flatMap((p) =>
        p.points.map((m) => {
          const u = m.path.pts.map((x) => along(x, l));
          return [Math.min(...u), Math.max(...u)];
        }),
      )
      .sort((x, y) => x[0] - y[0]);
    let end = 0,
      gap = 0;
    for (const [lo, hi] of intervals) {
      gap = Math.max(gap, lo - end);
      end = Math.max(end, hi);
    }
    gap = Math.max(gap, dist(a, b) - end);
    const residual = Math.max(
      ...passes.flatMap((p) =>
        [p.points[0], p.points.at(-1)!].map((m) => {
          const u = along(m.center, p.axis);
          return Math.abs(
            across({ x: p.axis.p.x + p.axis.x * u, y: p.axis.p.y + p.axis.y * u }, l),
          );
        }),
      ),
    );
    const length = dist(a, b);
    let covered = 0,
      coveredTo = 0;
    for (const [lo, hi] of intervals) {
      const start = Math.max(0, coveredTo, lo - pitch / 2),
        stop = Math.min(length, hi + pitch / 2);
      covered += Math.max(0, stop - start);
      coveredTo = Math.max(coveredTo, stop);
    }
    const errors = passes.flatMap((p) =>
      p.points.map((m) => {
        const u = along(m.center, p.axis);
        return Math.abs(across({ x: p.axis.p.x + u * p.axis.x, y: p.axis.p.y + u * p.axis.y }, l));
      }),
    );
    return { pitch, gap, residual, covered, length, errors };
  });
  return { corners, edges };
}

function sameWord(a: Key, b: Key) {
  const x = a.word,
    y = b.word;
  return (
    x.length === y.length &&
    [y, y.slice().reverse()].some((seq) =>
      seq.some((_, j) => x.every((v, i) => v === seq[(i + j) % seq.length])),
    )
  );
}
export function restorePrintedMotifPolygons(
  sheet: Sheet,
  set: ChainSet,
  run: SizeRun,
  seeds: Seed[],
  families: Map<number, PieceCandidate[]>,
  excluded: ReadonlySet<number>,
) {
  if (
    ![...families.values()].some((cs) =>
      cs.some((c) => c.outcome === 'leak' && c.gradeHint && !c.gradeHint.extrapolated),
    )
  )
    return;
  if (
    !set.classes.some((r) => r.evidence.some((e) => e.kind === 'legend-sample')) ||
    !sheet.texts.some((t) => /^size /i.test(t.text.trim()))
  )
    return;
  const marks = marksOf(sheet);
  if (!marks.length || new Set(sheet.poses.map((p) => p.file)).size !== 1) return;
  const keys = run.sizes.map((s) => legend(sheet, set, marks, s.label));
  const blocked = new Set(
    [...excluded].flatMap((id) => set.chains[id]?.ranges.map((r) => r.path) ?? []),
  );
  const owners = new Map<number, number[]>();
  for (const ch of set.chains)
    for (const r of ch.ranges) {
      const v = owners.get(r.path) ?? [];
      v.push(ch.id);
      owners.set(r.path, v);
    }
  for (const seed of seeds) {
    const cells = families.get(seed.id);
    if (!cells || !seed.text) continue;
    const proposed = new Map<PieceCandidate, PieceCandidate>();
    for (const c of cells) {
      if (c.outcome !== 'leak' || c.hole || !c.gradeHint || c.gradeHint.extrapolated) continue;
      const key = keys[c.rank];
      if (!key || keys.some((k, i) => i !== c.rank && k && sameWord(k, key))) continue;
      const [lo, hi] = c.gradeHint.from.map((r) => cells.find((v) => v.rank === r));
      if (
        !lo ||
        !hi ||
        lo.rank >= c.rank ||
        hi.rank <= c.rank ||
        lo.outcome !== 'closed' ||
        hi.outcome !== 'closed'
      )
        continue;
      const read = inspectPrintedMotif(
        sheet,
        set,
        run.sizes[c.rank].label,
        c.gradeHint.pred,
        marks,
      );
      const result = read && measuredMotifPolygon(read);
      if (
        !read ||
        !result ||
        result.edges.some((e) => e.gap > e.pitch || e.residual > PATIMPORT.sagittaMm)
      )
        continue;
      const sourceCoverage =
        result.edges.reduce((sum, e) => sum + e.covered, 0) /
        result.edges.reduce((sum, e) => sum + e.length, 0);
      if (sourceCoverage < PATIMPORT.coverageBlock) continue;
      const paths = new Set(
        read.sides.flatMap((passes) => passes.flatMap((p) => p.points.map((m) => m.path.id))),
      );
      if ([...paths].some((id) => blocked.has(id))) continue;
      const outer = result.corners;
      if (signedArea(outer) < 0) outer.reverse();
      const area = signedArea(outer);
      if (
        area <= lo.areaMm2 ||
        area >= hi.areaMm2 ||
        ringSelfIntersects(outer) ||
        !pointInPoly(seed.at, outer) ||
        seeds.some((s) => s !== seed && pointInPoly(s.at, outer)) ||
        !insideWithin(resample(lo.outer, 0.5, true), outer) ||
        !insideWithin(resample(outer, 0.5, true), hi.outer)
      )
        continue;
      // Calibrate the pen's centre against a shared straight stroke of an independent
      // declared pen. A consistently off-centre decorative row must not become a cut.
      const shared = sheet.paths.some((p) => {
        if (
          !p.visibleMotif ||
          p.background ||
          p.pts.length !== 2 ||
          !sheet.styles[p.style]?.dash?.length ||
          dist(p.pts[0], p.pts[1]) < 30
        )
          return false;
        return outer.some((a, i) =>
          p.pts.every(
            (v) => segNearest(v, a, outer[(i + 1) % outer.length]).d <= PATIMPORT.sagittaMm,
          ),
        );
      });
      if (!shared) continue;
      const wallIds = [...new Set([...paths].flatMap((id) => owners.get(id) ?? []))].filter((id) =>
        set.chains[id].ranges.every((r) => paths.has(r.path)),
      );
      const contains = (p: PtMm) => pointInPoly(p, outer);
      const candidate: PieceCandidate = {
        ...c,
        outcome: 'closed',
        outer,
        bbox: bboxOf(outer),
        areaMm2: area,
        rankFrom: 'printed-motif',
        walls: wallIds,
        printedMotif: { key: key.source.map((m) => m.path.id), paths: [...paths] },
        sourceCoverage,
        p95Mm: quantile(
          result.edges.flatMap((e) => e.errors),
          0.95,
        ),
        inside: set.chains
          .filter((ch) => !wallIds.includes(ch.id) && ch.pts.length > 1 && ch.pts.every(contains))
          .map((ch) => ch.id),
        textsInside: sheet.texts.filter((t) => contains(t.anchor)).map((t) => t.id),
      };
      delete candidate.gradeHint;
      delete candidate.leakAt;
      delete candidate.gradeRefusal;
      delete candidate.gradeDetail;
      delete candidate.nest;
      proposed.set(c, candidate);
    }
    // Two independent repairs within the same bracket must agree on their nesting too.
    const all = cells
      .map((c) => proposed.get(c) ?? c)
      .filter((c) => c.outcome === 'closed')
      .sort((a, b) => a.rank - b.rank);
    for (const [c, v] of proposed) {
      const i = all.indexOf(v),
        lo = all[i - 1],
        hi = all[i + 1];
      if (
        lo &&
        hi &&
        lo.areaMm2 < v.areaMm2 &&
        v.areaMm2 < hi.areaMm2 &&
        insideWithin(lo.outer, v.outer) &&
        insideWithin(v.outer, hi.outer)
      )
        cells[cells.indexOf(c)] = v;
    }
  }
}

// A confirmed nest walk can traverse the same wall twice. Such an area exceeds
// its own bounding rectangle and rejects valid internal features by even/odd parity.
// Accept a single polygon only when every side is independently covered by the keyed pen.
export function readRepeatedMotifWalk(
  sheet: Sheet,
  set: ChainSet,
  run: SizeRun,
  c: PieceCandidate,
  seed: Seed,
  others: Seed[],
) {
  const box = c.bbox;
  if (
    c.outcome !== 'closed' ||
    !c.nest ||
    c.areaMm2 <= (box.maxX - box.minX) * (box.maxY - box.minY) ||
    new Set(c.walls).size === c.walls.length
  )
    return;
  const size = run.sizes[c.rank],
    cls = set.classes.find((cl) => cl.id === size.classId);
  const evidence = cls?.evidence.find((e) => e.kind === 'legend-sample');
  if (
    !cls ||
    evidence?.kind !== 'legend-sample' ||
    evidence.label !== size.label ||
    evidence.nestingOnly ||
    evidence.alike?.length
  )
    return;
  const walls = cls.chains.filter((id) => c.walls.includes(id));
  if (walls.length !== 1) return;
  const paths = new Set(set.chains[walls[0]].ranges.map((r) => r.path)),
    sample = set.chains[evidence.chain];
  const keys = new Set(sample.ranges.map((r) => r.path));
  const allMarks = marksOf(sheet, true);
  const marks = allMarks.filter((m) => paths.has(m.path.id) || keys.has(m.path.id));
  const ink = marks.filter((m) => paths.has(m.path.id));
  if (ink.length < 8) return;
  const hull = convexHull(ink.map((m) => m.center));
  const read = inspectPrintedMotif(sheet, set, size.label, hull, marks);
  const result = read && measuredMotifPolygon(read);
  if (
    !read ||
    !result ||
    run.sizes.some((other) => {
      if (other.rank === c.rank) return false;
      const k = legend(sheet, set, allMarks, other.label);
      return k && sameWord(read.key, k);
    }) ||
    Math.abs(c.areaMm2 / (2 * Math.abs(signedArea(result.corners))) - 1) > 0.01 ||
    result.edges.reduce((a, e) => a + e.covered, 0) <
      PATIMPORT.coverageBlock * result.edges.reduce((a, e) => a + e.length, 0) ||
    result.edges.some((e) => e.gap > e.pitch || e.residual > PATIMPORT.sagittaMm) ||
    ringSelfIntersects(result.corners) ||
    !pointInPoly(seed.at, result.corners) ||
    others.some((s) => s.id !== seed.id && pointInPoly(s.at, result.corners))
  )
    return;
  const used = new Set(
    read.sides.flatMap((passes) => passes.flatMap((p) => p.points.map((m) => m.path.id))),
  );
  if (ink.some((m) => !used.has(m.path.id)) || [...used].some((id) => !paths.has(id))) return;
  return { pts: result.corners, walls, paths: used };
}
