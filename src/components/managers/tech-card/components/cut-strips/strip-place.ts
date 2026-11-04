// A strip is sewn INSIDE the piece it joins (elastic in a waistband), so on a sewn picture it lies on
// that piece, along the seam, centred and a little in from the edge, instead of edge to edge beside
// it. Pure, and it reads nothing but the seam's sides and the transforms the layout already chose.
import type { Affine, EdgeId, PieceGeom, Pt2, SeamCandidate } from 'lib/assembly-skeleton/types';
import { pieceKeyOf, resolveEdge } from 'lib/assembly-skeleton/union';
import { apply, compose, rigid, translate } from 'lib/assembly-skeleton/union/affine';

const INSET_MM = 6;
const INSET_SHARE = 0.1;

const sideOf = (seam: SeamCandidate, side: 'a' | 'b'): readonly EdgeId[] =>
  (side === 'a' ? seam.aParts : seam.bParts) ?? [side === 'a' ? seam.a : seam.b];

const insideRing = (point: Pt2, ring: readonly Pt2[]) => {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i];
    const [xj, yj] = ring[j];
    if (
      yi > point[1] !== yj > point[1] &&
      point[0] < ((xj - xi) * (point[1] - yi)) / (yj - yi) + xi
    )
      inside = !inside;
  }
  return inside;
};

/** The farthest pair among the run's ends: a run across two pieces reads as one straight line. */
function chordOf(runs: readonly (readonly Pt2[])[]): [Pt2, Pt2] | null {
  const ends = runs.flatMap((run) => (run.length ? [run[0], run[run.length - 1]] : []));
  let best: [Pt2, Pt2] | null = null;
  let far = -1;
  for (let i = 0; i < ends.length; i++)
    for (let j = i + 1; j < ends.length; j++) {
      const d = Math.hypot(ends[i][0] - ends[j][0], ends[i][1] - ends[j][1]);
      if (d > far) {
        far = d;
        best = [ends[i], ends[j]];
      }
    }
  return far > 0 ? best : null;
}

/** The strip's transform on its host, or `null` when this seam cannot say where it lies. */
export function stripOnHost(
  stripEdge: EdgeId,
  hostSide: readonly EdgeId[],
  T: ReadonlyMap<string, Affine>,
  geoms: ReadonlyMap<string, PieceGeom>,
): Affine | null {
  const strip = geoms.get(pieceKeyOf(stripEdge));
  const own = resolveEdge(stripEdge, geoms);
  if (!strip?.cutStrip || !own || own.pts.length < 2) return null;
  // Sewn by its end (a loop's tab), not along its length: a plain seam is what the picture needs.
  if (own.len < strip.cutStrip.sewnMm / 2) return null;
  const runs = hostSide.flatMap((id) => {
    const transform = T.get(pieceKeyOf(id));
    const edge = resolveEdge(id, geoms);
    return transform && edge ? [edge.pts.map((point) => apply(transform, point))] : [];
  });
  const chord = chordOf(runs);
  const hostKey = hostSide.find((id) => T.has(pieceKeyOf(id)));
  const hostGeom = hostKey ? geoms.get(pieceKeyOf(hostKey)) : undefined;
  const hostT = hostKey ? T.get(pieceKeyOf(hostKey)) : undefined;
  if (!chord || !hostGeom || !hostT) return null;
  const ring = hostGeom.rs.map((point) => apply(hostT, point));
  const length = Math.hypot(chord[1][0] - chord[0][0], chord[1][1] - chord[0][1]);
  const along: Pt2 = [(chord[1][0] - chord[0][0]) / length, (chord[1][1] - chord[0][1]) / length];
  const mid: Pt2 = [(chord[0][0] + chord[1][0]) / 2, (chord[0][1] + chord[1][1]) / 2];
  // In: the normal whose small step from the run's middle stays on the host. A curved run's chord
  // can miss the cloth, so the step starts from the run's own middle point.
  const longest = runs.reduce((best, run) => (run.length > best.length ? run : best), runs[0]);
  const onRun = longest[Math.floor(longest.length / 2)];
  const normal: Pt2 = [-along[1], along[0]];
  const inward: Pt2 = insideRing([onRun[0] + normal[0], onRun[1] + normal[1]], ring)
    ? normal
    : [-normal[0], -normal[1]];
  const depths = ring.map((p) => (p[0] - mid[0]) * inward[0] + (p[1] - mid[1]) * inward[1]);
  const depth = Math.max(...depths);
  const widthMm = strip.cutStrip.widthMm;
  const inset =
    depth > widthMm
      ? Math.min(INSET_MM, depth * INSET_SHARE, (depth - widthMm) / 2)
      : (depth - widthMm) / 2;
  const half = own.len / 2;
  const start: Pt2 = [mid[0] - along[0] * half, mid[1] - along[1] * half];
  const end: Pt2 = [mid[0] + along[0] * half, mid[1] + along[1] * half];
  const a = own.pts[0];
  const b = own.pts[own.pts.length - 1];
  const laid = rigid(start, end, a, b, false);
  const centre = strip.rs.reduce<Pt2>(
    (sum, point) => [sum[0] + point[0] / strip.rs.length, sum[1] + point[1] / strip.rs.length],
    [0, 0],
  );
  const c = apply(laid, centre);
  const body = (c[0] - mid[0]) * inward[0] + (c[1] - mid[1]) * inward[1];
  // The rectangle's body has to fall on the cloth's side of the run: turn it end for end if not.
  const placed = body >= 0 ? laid : rigid(end, start, a, b, false);
  return compose(translate(inward[0] * inset, inward[1] * inset), placed);
}

/**
 * Every strip this step's seams name goes on its host, painted last (Map order is paint order).
 * Returns strip → host, the facts the picture hangs its host's name and the dimension on.
 */
export function placeStripsOnHosts(
  T: Map<string, Affine>,
  seams: readonly SeamCandidate[],
  geoms: ReadonlyMap<string, PieceGeom>,
  held: ReadonlySet<string> = new Set(),
): ReadonlyMap<string, string> {
  const hosts = new Map<string, string>();
  for (const seam of seams) {
    if (seam.kind === 'surface' || seam.kind === 'closure-not-seam') continue;
    for (const [mine, other] of [
      ['a', 'b'],
      ['b', 'a'],
    ] as const) {
      const stripEdge = sideOf(seam, mine).find(
        (id) => geoms.get(pieceKeyOf(id))?.cutStrip && T.has(pieceKeyOf(id)),
      );
      if (!stripEdge) continue;
      const key = pieceKeyOf(stripEdge);
      const hostSide = sideOf(seam, other).filter((id) => !geoms.get(pieceKeyOf(id))?.cutStrip);
      if (hostSide.length === 0) continue;
      const hostKey = pieceKeyOf(hostSide[0]);
      if (!hosts.has(key)) hosts.set(key, hostKey);
      if (held.has(key)) continue;
      const on = stripOnHost(stripEdge, hostSide, T, geoms);
      if (!on) continue;
      T.delete(key);
      T.set(key, on);
    }
  }
  return hosts;
}

/** A row or seam with a strip on a side is not edge to edge on the picture, by design. */
export function anchorsNameStrip(
  anchors: readonly { piece: string }[],
  geoms: ReadonlyMap<string, PieceGeom>,
): boolean {
  return anchors.some((anchor) => !!geoms.get(anchor.piece)?.cutStrip);
}
