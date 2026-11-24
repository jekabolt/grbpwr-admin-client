import type { Chain, IRPath, PtMm, Sheet, Style } from '../types';
import { bboxOf, dist, pointInPoly, segIntersect, segNearest } from './geom';
import { projectOntoCycle, type SourceRing } from './material-marks';
import { selfIntersects } from './gfit/checks';

const mid = (a: PtMm, b: PtMm) => ({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 });
const last = (p: IRPath) => p.pts[p.pts.length - 1];
const visible = (p: IRPath) => p.visibleMotif;
const samePen = (a: Style, b: Style) =>
  a.fill === b.fill &&
  a.widthMm === b.widthMm &&
  a.layer === b.layer &&
  !a.dash?.length &&
  String(a.strokeRgb) === String(b.strokeRgb);
type Mark = {
  axis?: PtMm;
  at: PtMm;
  ids: number[];
  pts?: PtMm[];
  corner?: boolean;
  page: number;
  op: number;
};

/** Rank-owned chains order the marks across tiles. A straight join in a guide is
 * allowed only as a search region; only source marks build the returned geometry. */
function proposedGuides(chains: Chain[], pred: PtMm[], seed: PtMm, pitch: number) {
  const close = projectOntoCycle(pred);
  const box = bboxOf(pred);
  const near = chains.filter(
    (c) =>
      c.lengthMm > 5 * pitch &&
      c.pts.every(
        (p) =>
          close(p).d <
          Math.max(
            4 * pitch,
            Math.min(45, 0.08 * Math.sqrt(Math.abs((box.maxX - box.minX) * (box.maxY - box.minY)))),
          ),
      ),
  );
  if (near.length > 12) return [];
  const guides: { g: PtMm[]; walls: number[] }[] = [];
  let visited = 0;
  function visit(g: PtMm[], used: number[]) {
    if (++visited > 4096) return;
    if (g.length && dist(g.at(-1)!, g[0]) < Math.max(3 * pitch, 18) && pointInPoly(seed, g))
      guides.push({ g, walls: used });
    if (guides.length > 32 || visited > 4096) return;
    for (const c of near) {
      if (used.includes(c.id) || c.id < used[0]) continue;
      for (const reverse of [false, true]) {
        const pts = reverse ? [...c.pts].reverse() : c.pts;
        if (g.length ? dist(g.at(-1)!, pts[0]) > Math.max(3 * pitch, 18) : reverse) continue;
        visit([...g, ...pts], [...used, c.id]);
      }
    }
  }
  visit([], []);
  return visited <= 4096 && guides.length <= 32 ? guides : [];
}
/** Two distinct clipping windows meet at a common edge. Their shared midpoint
 * is the turn of the printed compound pen. */
function maskCorners(sheet: Sheet, rows: IRPath[], pen: Style) {
  const out: Mark[] = [];
  const masked = rows.filter(
    (p) =>
      p.visibleFill?.length &&
      samePen(sheet.styles[p.style], pen) &&
      sheet.styles[p.style].localClipPolygon?.length === 4,
  );
  for (let i = 0; i < masked.length; i++) {
    const a = masked[i],
      pa = sheet.styles[a.style].localClipPolygon!;
    for (const b of masked.slice(i + 1)) {
      if (b.src.page !== a.src.page || b.style === a.style || Math.abs(a.src.op - b.src.op) > 90)
        continue;
      const pb = sheet.styles[b.style].localClipPolygon!;
      const common = pa.filter((p) => pb.some((q) => dist(p, q) < 0.003));
      if (common.length !== 2) continue;
      const at = mid(common[0], common[1]);
      if (out.some((m) => dist(m.at, at) < 0.01)) continue;
      out.push({ at, corner: true, ids: [a.id, b.id], page: a.src.page, op: a.src.op });
    }
  }
  return out;
}
function tinyWindow(st: Style, pitch: number) {
  const box = st.clip?.split(':').at(-1)?.split(',').map(Number);
  return box?.length === 4 && Math.max(box[2] - box[0], box[3] - box[1]) < 2 * pitch
    ? box
    : undefined;
}
function strokeCorners(sheet: Sheet, rows: IRPath[], pen: Style, pitch: number) {
  const clipped = rows.filter(
    (p) =>
      !p.closed && samePen(sheet.styles[p.style], pen) && tinyWindow(sheet.styles[p.style], pitch),
  );
  const out: Mark[] = [];
  for (let i = 0; i < clipped.length; i++) {
    const a = clipped[i];
    for (const b of clipped.slice(i + 1)) {
      if (a.src.page !== b.src.page || a.style === b.style || Math.abs(a.src.op - b.src.op) > 60)
        continue;
      const hits: PtMm[] = [];
      for (let j = 1; j < a.pts.length; j++)
        for (let k = 1; k < b.pts.length; k++) {
          const hit = segIntersect(a.pts[j - 1], a.pts[j], b.pts[k - 1], b.pts[k]);
          if (!hit) continue;
          const physical = [a, b].every((p) => {
            const st = sheet.styles[p.style],
              box = tinyWindow(st, pitch)!;
            const polygon = st.clipPolygon ?? st.localClipPolygon;
            if (
              polygon?.length &&
              !pointInPoly(hit.p, polygon) &&
              !polygon.some(
                (z, n) => segNearest(hit.p, z, polygon[(n + 1) % polygon.length]).d < 0.005,
              )
            )
              return false;
            if (!polygon && !p.visibleEdges) return false;
            return (
              hit.p.x >= box[0] - 0.01 &&
              hit.p.x <= box[2] + 0.01 &&
              hit.p.y >= box[1] - 0.01 &&
              hit.p.y <= box[3] + 0.01
            );
          });
          if (physical && !hits.some((q) => dist(q, hit.p) < 0.001)) hits.push(hit.p);
        }
      if (hits.length === 1)
        out.push({ at: hits[0], corner: true, ids: [a.id, b.id], page: a.src.page, op: a.src.op });
    }
  }
  return out;
}
export function compoundMaterialRing(
  sheet: Sheet,
  key: IRPath[],
  own: Chain[],
  pred: PtMm[],
  seed: PtMm,
) {
  const sample = [...key].sort((a, b) => a.src.op - b.src.op),
    first = sample[0];
  if (!first || sample.length < 10 || !pred.length) return;
  const pen = sheet.styles[first.style];
  const dotMode = pen.fill;
  const dot = (p: IRPath) => p.closed && p.pts.length === 9 && dist(p.pts[0], last(p)) < 0.001;
  // Recognize the actual repeat from the legend sample. Individual dots alone
  // also occur in other sizes, and straight dashes alone can be placement marks.
  const pattern = dotMode ? 'tttdd' : '=ooo';
  if (
    !sample.every(
      (p, i) =>
        (dotMode ? (dot(p) ? 'd' : 't') : p.closed ? 'o' : '=') === pattern[i % pattern.length],
    )
  )
    return;
  const pitch = dist(first.pts[0], sample[pattern.length].pts[0]);
  const dotSample = sample.find(dot);
  if (!dotSample) return;
  const width = dist(dotSample.pts[0], dotSample.pts[4]),
    len = dist(first.pts[0], last(first));
  const guides = proposedGuides(own, pred, seed, pitch);
  const box = bboxOf(pred),
    rows = [...sheet.paths, ...(sheet.materialMarks ?? [])].filter((p) => {
      const a = p.pts[0];
      return (
        !p.background &&
        p.src.file === first.src.file &&
        a.x >= box.minX - 4 * pitch &&
        a.x <= box.maxX + 4 * pitch &&
        a.y >= box.minY - 4 * pitch &&
        a.y <= box.maxY + 4 * pitch
      );
    });
  const corners = dotMode ? maskCorners(sheet, rows, pen) : strokeCorners(sheet, rows, pen, pitch);
  const byOp = new Map(rows.map((p) => [p.src.page + ',' + p.src.op, p]));
  const marks: Mark[] = [];
  for (const p of rows) {
    if (!visible(p) || !samePen(sheet.styles[p.style], pen)) continue;
    if (dotMode) {
      if (!dot(p) || Math.abs(dist(p.pts[0], p.pts[4]) / width - 1) > 0.05) continue;
      marks.push({
        at: mid(p.pts[0], p.pts[4]),
        axis: { x: p.pts[4].x - p.pts[0].x, y: p.pts[4].y - p.pts[0].y },
        ids: [p.id],
        page: p.src.page,
        op: p.src.op,
      });
      continue;
    }
    if (p.closed || p.pts.length > 8 || dist(p.pts[0], last(p)) > 1.45 * len) continue;
    const rings = Array.from({ length: sample[pattern.length].src.op - first.src.op - 1 }, (_, i) =>
      byOp.get(p.src.page + ',' + (p.src.op + i + 1)),
    )
      .flatMap((k) => (k ? [k] : []))
      .filter(
        (k) =>
          k.closed &&
          samePen(sheet.styles[k.style], sheet.styles[dotSample.style]) &&
          visible(k) &&
          dist(k.pts[0], p.pts[0]) < pitch,
      );
    if (!rings.length) continue;
    marks.push({
      at: mid(p.pts[0], last(p)),
      pts: p.pts,
      axis: { x: last(p).x - p.pts[0].x, y: last(p).y - p.pts[0].y },
      ids: [p.id, ...rings.map((k) => k.id)],
      page: p.src.page,
      op: p.src.op,
    });
  }
  const byId = new Map(rows.map((p) => [p.id, p]));
  const loops: SourceRing[] = [];
  for (const { g, walls } of guides) {
    const locate = projectOntoCycle(g);
    const guideCorners = corners
      .map((m) => ({ m, ...locate(m.at) }))
      .filter((x) => x.d < pitch * 0.85)
      .sort((a, b) => a.arc - b.arc);
    const ordinary = marks
      .map((m) => ({ m, ...locate(m.at) }))
      .filter(
        (x) =>
          x.d < pitch * 0.4 &&
          (!x.m.axis ||
            Math.abs(x.axis.x * x.m.axis.x + x.axis.y * x.m.axis.y) >
              0.91 * Math.hypot(x.m.axis.x, x.m.axis.y)),
      );
    const selected = [...ordinary, ...guideCorners].sort((a, b) => a.arc - b.arc);
    const v = selected.filter((x, i) => !i || dist(x.m.at, selected[i - 1].m.at) > 0.03);
    if (v.length < 20 || guideCorners.length < 3) continue;
    const bad = v.some(
      (x, i) => dist(x.m.at, v[(i + 1) % v.length].m.at) > pitch * (dotMode ? 1.45 : 1.65),
    );
    if (bad) continue;
    const segments = v.map((x, i) => {
      if (!x.m.pts) return [x.m.at];
      const prev = v[(i + v.length - 1) % v.length].m.at,
        next = v[(i + 1) % v.length].m.at,
        p = x.m.pts;
      return (next.x - prev.x) * (p.at(-1)!.x - p[0].x) +
        (next.y - prev.y) * (p.at(-1)!.y - p[0].y) >=
        0
        ? p
        : [...p].reverse();
    });
    // Some turns lie inside a deformed ring. Require the two bracketing source
    // dashes to converge inside that same visible ring before adding a vertex.
    const outer = segments.flatMap((p, i) => {
      const q = segments[(i + 1) % segments.length];
      if (p.length !== 2 || q.length !== 2) return p;
      const a = p[0],
        b = p[1],
        c = q[0],
        d = q[1];
      const u = { x: b.x - a.x, y: b.y - a.y },
        w = { x: d.x - c.x, y: d.y - c.y };
      const cross = u.x * w.y - u.y * w.x;
      if (Math.abs(cross) < 0.12 * dist(a, b) * dist(c, d)) return p;
      const t = ((c.x - a.x) * w.y - (c.y - a.y) * w.x) / cross;
      const hit = { x: a.x + t * u.x, y: a.y + t * u.y };
      if (t < 1 || dist(hit, b) + dist(hit, c) > 1.1 * dist(b, c)) return p;
      const source = [...v[i].m.ids, ...v[(i + 1) % v.length].m.ids].map((id) => byId.get(id)!);
      const bent = source.filter(
        (r) => r.closed && r.pts.length > dotSample.pts.length && pointInPoly(hit, r.pts),
      );
      return bent.length === 1 ? [...p, hit] : p;
    });
    if (!selfIntersects(outer)) loops.push({ outer, paths: v.flatMap((x) => x.m.ids), walls });
  }
  if (loops.length === 1) return loops[0];
}
