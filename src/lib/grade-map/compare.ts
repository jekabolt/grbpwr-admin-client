// Grade map · compare two maps of one file on the file's own geometry: how far apart the places
// they carry the same base point to are, per size. Used to hold «the map from the block» equal to
// «the map built on the fly» (GRADEMAP-DESIGN §2, P2).

import { bindPiece, carryArc, liveOf, type Bound, type BoundLine, type LiveSize } from './bind';
import { dist, pointAt, project } from './geom';
import type { GmFile, GmPiece, GmSizeGeometry, GmTrack } from './types';

/** The base size of a piece: the one of its sizes its tracks do not list. */
export function pieceBaseSize(piece: GmPiece, sizeIds: readonly number[]): number | null {
  const listed = new Set(piece.tracks.flatMap((t) => t.sizes.map((s) => s.sizeId)));
  const left = sizeIds.filter((id) => !listed.has(id));
  return left.length === 1 ? left[0] : null;
}

const lineOf = (b: Bound | undefined): BoundLine | null =>
  b && b.ok && 'line' in b ? b.line : null;
const pointOf = (b: Bound | undefined) => (b && b.ok && 'point' in b ? b.point : null);

export type MapDiff = {
  /** Largest distance between the two carried places over every matched track and size, mm. */
  maxMm: number;
  /** Tracks of A with a counterpart in B and carried in both. */
  compared: number;
  /** Tracks (or sizes) one map carries and the other does not. */
  unmatched: string[];
};

/**
 * Compare map A with map B on the geometry `geoOf(pieceKey)` (every size of the piece). A track of
 * A is matched to the B track of the same kind and layer whose base binds to the same live line;
 * along A's base line, each sample is carried by both maps into every size both carry.
 */
export function compareMaps(
  a: GmFile,
  b: GmFile,
  geoOf: (key: string) => readonly GmSizeGeometry[] | null,
  stepMm = 2,
): MapDiff {
  const out: MapDiff = { maxMm: 0, compared: 0, unmatched: [] };
  const bByKey = new Map(b.pieces.map((p) => [p.key.toLowerCase(), p]));
  for (const pa of a.pieces) {
    const pb = bByKey.get(pa.key.toLowerCase());
    const geos = geoOf(pa.key);
    if (!pb || !geos) {
      out.unmatched.push(`${pa.key}: ${pb ? 'no geometry' : 'not in B'}`);
      continue;
    }
    const ids = geos.map((g) => g.sizeId);
    const baseA = pieceBaseSize(pa, ids);
    const baseB = pieceBaseSize(pb, ids);
    const lives = new Map<number, LiveSize>(geos.map((g) => [g.sizeId, liveOf(g)]));
    const la = baseA !== null ? lives.get(baseA) : undefined;
    const lb = baseB !== null ? lives.get(baseB) : undefined;
    if (!la || !lb) {
      out.unmatched.push(`${pa.key}: base size missing`);
      continue;
    }
    const ba = bindPiece(pa, la, lives);
    const bb = bindPiece(pb, lb, lives);
    pa.tracks.forEach((ta, i) => {
      const j = matchTrack(
        ta,
        i,
        ba.tracks[i].base,
        pb.tracks,
        bb.tracks.map((t) => t.base),
      );
      if (j < 0) {
        out.unmatched.push(`${pa.key}: ${ta.kind} ${ta.layer} #${i} not in B`);
        return;
      }
      const d = trackDiff(ta, ba.tracks[i], pb.tracks[j], bb.tracks[j], baseA!, baseB!, stepMm);
      out.compared++;
      out.maxMm = Math.max(out.maxMm, d.maxMm);
      for (const s of d.onlyOne)
        out.unmatched.push(`${pa.key}: ${ta.kind} ${ta.layer} #${i} size ${s}`);
    });
  }
  return out;
}

function matchTrack(
  t: GmTrack,
  i: number,
  bound: Bound,
  cands: readonly GmTrack[],
  cb: readonly Bound[],
): number {
  const same = (c: GmTrack) => c.kind === t.kind && c.layer === t.layer && c.closed === t.closed;
  // the same nodes first (two maps of one builder), then the same span of one live line
  const key = JSON.stringify(t.base);
  if (cands[i] && same(cands[i]) && JSON.stringify(cands[i].base) === key) return i;
  const twin = cands.findIndex((c) => same(c) && JSON.stringify(c.base) === key);
  if (twin >= 0) return twin;
  const p = pointOf(bound);
  const l = lineOf(bound);
  for (let j = 0; j < cands.length; j++) {
    if (!same(cands[j])) continue;
    if (p) {
      const q = pointOf(cb[j]);
      if (q && dist(p, q) < 1e-6) return j;
    } else if (l) {
      const m = lineOf(cb[j]);
      if (m && sameSpan(l, m)) return j;
    }
  }
  return -1;
}

const SPAN_MM = 0.5;

/** One live line, and (open) the same ends in either direction. */
function sameSpan(x: BoundLine, y: BoundLine): boolean {
  if (Math.abs(x.path.total - y.path.total) > 1e-6) return false;
  if (project(y.path, x.path.pts[0]).d > 1e-3) return false;
  if (x.path.closed) return true;
  const ends = (b: BoundLine) => [
    pointAt(b.path, b.arcs[0]),
    pointAt(b.path, b.arcs[b.arcs.length - 1]),
  ];
  const [x0, x1] = ends(x);
  const [y0, y1] = ends(y);
  return (
    (dist(x0, y0) <= SPAN_MM && dist(x1, y1) <= SPAN_MM) ||
    (dist(x0, y1) <= SPAN_MM && dist(x1, y0) <= SPAN_MM)
  );
}

function trackDiff(
  ta: GmTrack,
  ba: { base: Bound; sizes: Map<number, Bound> },
  tb: GmTrack,
  bb: { base: Bound; sizes: Map<number, Bound> },
  baseA: number,
  baseB: number,
  step: number,
): { maxMm: number; onlyOne: number[] } {
  const sizes = new Set([...ta.sizes.map((s) => s.sizeId), baseA]);
  const sizesB = new Set([...tb.sizes.map((s) => s.sizeId), baseB]);
  const carriedA = (id: number) => (id === baseA ? ba.base : ba.sizes.get(id));
  const carriedB = (id: number) => (id === baseB ? bb.base : bb.sizes.get(id));
  const onlyOne: number[] = [];
  let maxMm = 0;
  const pa = pointOf(ba.base);
  for (const id of new Set([...sizes, ...sizesB])) {
    const ca = carriedA(id);
    const cb = carriedB(id);
    const okA = !!ca && ca.ok;
    const okB = !!cb && cb.ok;
    if (okA !== okB) onlyOne.push(id);
    if (!okA || !okB) continue;
    if (pa) {
      const qa = pointOf(ca);
      const qb = pointOf(cb);
      if (qa && qb) maxMm = Math.max(maxMm, dist(qa, qb));
      continue;
    }
    const la = lineOf(ba.base)!;
    const lb = lineOf(bb.base)!;
    const sa = lineOf(ca);
    const sb = lineOf(cb);
    if (!sa || !sb) continue;
    const from = la.arcs[0];
    const to = la.path.closed ? from + la.path.total : la.arcs[la.arcs.length - 1];
    const n = Math.max(1, Math.ceil((to - from) / step));
    for (let k = 0; k <= n; k++) {
      const s = from + ((to - from) * k) / n;
      const at = pointAt(la.path, s);
      const sB = project(lb.path, at).s;
      const xa = pointAt(sa.path, carryArc(la, sa, s));
      const xb = pointAt(sb.path, carryArc(lb, sb, sB));
      maxMm = Math.max(maxMm, dist(xa, xb));
    }
  }
  return { maxMm, onlyOne };
}
