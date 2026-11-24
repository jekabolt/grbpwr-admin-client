import type { Chain, ChainSet, IRPath, PtMm, Sheet, Style } from '../types';
import { PtGrid, dist, median } from './geom';
import { maskCrossings } from '../pieces/ring-sections';
import { bboxOf, segIntersect, segNearest } from '../pieces/geom';

type Mark = { at: PtMm; paths: IRPath[] };

function center(p: IRPath): PtMm {
  const b = bboxOf(p.pts);
  return { x: (b.minX + b.maxX) / 2, y: (b.minY + b.maxY) / 2 };
}

function matchingInk(s: Style, pen: Style) {
  return (
    !s.fill &&
    !s.dash?.length &&
    s.layer === pen.layer &&
    s.widthMm === pen.widthMm &&
    String(s.strokeRgb) === String(pen.strokeRgb)
  );
}

function cutCenter(a: IRPath, b: IRPath, styles: Map<number, Style>): PtMm | undefined {
  const sa = styles.get(a.style)!,
    sb = styles.get(b.style)!;
  // A split ring can have a stepped mask on one impression. Intersect each
  // outline with its own mask: both section endpoints must agree.
  if (!sa.clipPolygon || !sb.clipPolygon) {
    const ma = sa.localClipPolygon ?? sa.clipPolygon,
      mb = sb.localClipPolygon ?? sb.clipPolygon;
    if (!ma || !mb) return;
    const u = maskCrossings(a, ma),
      v = maskCrossings(b, mb);
    if (u.length !== 2 || v.length !== 2) return;
    const agree = (i: number) => dist(u[0], v[i]) <= 0.035 && dist(u[1], v[1 - i]) <= 0.035;
    if (!agree(0) && !agree(1)) return;
    return {
      x: (u[0].x + u[1].x + v[0].x + v[1].x) / 4,
      y: (u[0].y + u[1].y + v[0].y + v[1].y) / 4,
    };
  }
  const pa = sa.clipPolygon,
    pb = sb.clipPolygon;
  const common = pa.filter((p) => pb.some((q) => dist(p, q) < 0.025));
  if (common.length !== 2) return;
  const [u, v] = common;
  const mids = [];
  for (const ring of [a, b]) {
    const hits: PtMm[] = [];
    for (let j = 0; j < ring.pts.length; j++) {
      const hit = segIntersect(u, v, ring.pts[j], ring.pts[(j + 1) % ring.pts.length]);
      if (hit) hits.push(hit.p);
    }
    if (hits.length < 2) return;
    hits.sort((l, r) => dist(u, l) - dist(u, r));
    const first = hits[0],
      last = hits.at(-1)!;
    if (dist(first, last) < 0.01) return;
    mids.push({ x: (first.x + last.x) / 2, y: (first.y + last.y) / 2 });
  }
  if (dist(mids[0], mids[1]) > 0.035) return;
  return { x: (mids[0].x + mids[1].x) / 2, y: (mids[0].y + mids[1].y) / 2 };
}

/** Connect centres only when the pitch measured on the printed legend admits
 * exactly two neighbours per mark in one cycle. Both clipped impressions at
 * a turn witness the centre on their common cut edge. */
export function orderedRingBoundary(regular: Mark[], corners: Mark[], pitch: number) {
  if (regular.length < 4 || !corners.length || pitch <= 0) return;
  const marks = regular.concat(corners);
  const grid = new PtGrid(2 * pitch);
  marks.forEach((m, i) => grid.add(i, m.at));
  const links = marks.map((m, i) => {
    const ns: number[] = [];
    grid.near(m.at, 1.25 * pitch, (j) => {
      if (i === j || (i >= regular.length && j >= regular.length)) return;
      const delta = Math.abs(dist(m.at, marks[j].at) / pitch - 1);
      if (delta < (i >= regular.length || j >= regular.length ? 0.25 : 0.065)) ns.push(j);
    });
    return ns;
  });
  // Corner pairs elsewhere on the sheet have no connection to this row.
  const used = marks.map((_, i) => i).filter((i) => i < regular.length || links[i].length > 0);
  if (used.some((i) => links[i].length !== 2)) return;
  const ring: Mark[] = [];
  let prev = -1,
    i = 0;
  do {
    ring.push(marks[i]);
    const ns = links[i];
    const next = ns[0] === prev ? ns[1] : ns[0];
    prev = i;
    i = next;
  } while (i !== 0 && ring.length <= used.length);
  if (ring.length !== used.length || !ring.some((m) => m.paths.length === 2)) return;
  return ring;
}

export function readRingBoundaries(
  sheet: Pick<Sheet, 'paths' | 'styles'>,
  set: Pick<ChainSet, 'classes' | 'chains'>,
) {
  const boundaries = new Map<number, Mark[]>();
  const paths = new Map(sheet.paths.map((p) => [p.id, p]));
  const styles = new Map(sheet.styles.map((s) => [s.id, s]));
  const marksOf = (ch: Chain) =>
    ch.ranges.map((r) => paths.get(r.path)).filter((p): p is IRPath => !!p);
  for (const cls of set.classes) {
    const ev = cls.evidence.find((e) => e.kind === 'legend-sample');
    if (cls.role !== 'size' || ev?.kind !== 'legend-sample') continue;
    const legend = set.chains[ev.chain];
    if (!legend) continue;
    const sample = marksOf(legend);
    if (sample.length < 4 || sample.some((p) => !p.closed || p.background || p.pts.length < 5))
      continue;
    const pen = styles.get(sample[0].style)!;
    if (sample.some((p) => !matchingInk(styles.get(p.style)!, pen))) continue;
    const centers = sample.map(center);
    const spacing = centers.slice(1).map((p, i) => dist(p, centers[i]));
    const pitch = median(spacing);
    if (pitch <= 0 || spacing.some((x) => Math.abs(x / pitch - 1) > 0.065)) continue;
    // A ring is a closed, approximately circular stroke smaller than one
    // repeat. Reject other closed glyphs with the same stroke width.
    const diameter = (p: IRPath) => {
      const b = bboxOf(p.pts);
      return Math.max(b.maxX - b.minX, b.maxY - b.minY);
    };
    const width = median(sample.map(diameter));
    if (
      width <= 0 ||
      width >= pitch ||
      sample.some((p) => {
        const c = center(p);
        return p.pts.some((v) => Math.abs((2 * dist(c, v)) / width - 1) > 0.2);
      })
    )
      continue;
    const sameSize = (p: IRPath) => Math.abs(diameter(p) / width - 1) < 0.35;
    const file = sample[0].src.file;
    const clipped = sheet.paths.filter(
      (p) =>
        p.src.file === file &&
        !p.background &&
        p.closed &&
        sameSize(p) &&
        (styles.get(p.style)?.clipPolygon || styles.get(p.style)?.localClipPolygon) &&
        matchingInk(styles.get(p.style)!, pen),
    );
    const corners: Mark[] = [];
    const maskGrid = new PtGrid(pitch);
    const positions = clipped.map(center);
    for (let i = 0; i < clipped.length; i++) {
      const a = clipped[i],
        ac = positions[i];
      maskGrid.near(ac, 0.1 * pitch, (j) => {
        const b = clipped[j];
        if (
          a.src.page !== b.src.page ||
          dist(ac, positions[j]) > 0.1 * pitch ||
          a.style === b.style
        )
          return;
        const at = cutCenter(a, b, styles);
        if (at) corners.push({ at, paths: [b, a] });
      });
      maskGrid.add(i, ac);
    }
    if (!corners.length) continue;
    for (const id of cls.chains) {
      const chain = set.chains[id];
      if (
        id === ev.chain ||
        chain.ranges.length < 4 ||
        !chain.pts.length ||
        dist(chain.pts[0], chain.pts.at(-1)!) > 2 * pitch
      )
        continue;
      const glyphs = marksOf(chain);
      if (
        glyphs.length !== chain.ranges.length ||
        glyphs.some(
          (p) =>
            p.src.file !== file ||
            p.background ||
            !p.closed ||
            !sameSize(p) ||
            !matchingInk(styles.get(p.style)!, pen),
        )
      )
        continue;
      const regular = glyphs
        .filter((p) => !styles.get(p.style)!.clipPolygon && !styles.get(p.style)!.localClipPolygon)
        .map((p) => ({ at: center(p), paths: [p] }));
      const ring = orderedRingBoundary(regular, corners, pitch);
      if (ring) boundaries.set(id, ring);
    }
  }
  return boundaries;
}

/** The straight side shared across sizes is where a flooded face can switch to a
 * foreign parallel wall. Keep this recovery scoped to panels with one such side. */
export function recoverRingPanels(
  sheet: Pick<Sheet, 'styles' | 'paths'>,
  set: Pick<ChainSet, 'classes' | 'chains'>,
) {
  for (const [id, ring] of readRingBoundaries(sheet, set)) {
    const turns = ring.flatMap((m, i) => (m.paths.length === 2 ? [i] : []));
    if (turns.length < 3) continue;
    const pts = ring.map((m) => m.at);
    const sides: [PtMm, PtMm][] = [];
    for (let j = 0; j < turns.length; j++) {
      const from = turns[j],
        to = turns[(j + 1) % turns.length];
      const a = pts[from],
        b = pts[to];
      let straight = true;
      for (let i = (from + 1) % pts.length; i !== to; i = (i + 1) % pts.length) {
        if (segNearest(pts[i], a, b).d > 0.08) {
          straight = false;
          break;
        }
      }
      if (straight) sides.push([a, b]);
    }
    if (sides.length !== 1) continue;
    const ch = set.chains[id];
    // Other sizes may use stretches of the provisional wall. Preserve their
    // geometry; only a fill of this printed size consumes the complete cycle.
    ch.ringBoundary = {
      side: sides[0],
      pts,
      ranges: ring.flatMap((m) => m.paths.map((p) => ({ path: p.id, from: 0, to: p.pts.length }))),
    };
  }
}
