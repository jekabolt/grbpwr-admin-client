// Fold hints — what the pattern already says about folds on a piece. Read-only: a hint is shown, and
// becomes a row only when the owner accepts it (anchor.ts foldFromHint).
//
//   mark      a classified `fold` mark (geometry/marks.ts: a straight line parallel to an edge, near it)
//   unfolded  the layer-8 line of a piece the converter unfolded from a fold (PieceDTO.manifest.unfolded, or the
//             manifest's `unfoldedFold` override) — the reference fold line, spanning the piece
//   mirror    the AAMA mirror line (layer 6) of a half-on-fold piece — a CUTTING axis, so only a weak
//             hint: a cuff cut on fold is folded there, a back cut on fold is not
//   inner     an inner line from the assembly map — weak DXF evidence that may be a construction fold
//
// Straight lines only (v1). Each line is extended to the sewing loop; near-duplicates collapse to the
// first (marks before layer lines, then assembly-map inner lines).

import type { PieceGeom, Pt2, SkeletonPieceInput } from 'lib/assembly-skeleton/types';
import { runById } from 'lib/seams/frame';
import {
  add,
  angleBetween,
  chordDeviation,
  clampUV,
  clipThrough,
  distToPoly,
  edgeAlong,
  foldEdgeOf,
  frameOf,
  len,
  mul,
  sub,
  toUV,
} from './geom';
import { FOLDS, type FoldHint, type FoldHintOrigin, type FoldSource } from './types';

const MM_PER_CM = 10;
const INTERNAL_LAYER = '8';
const AAMA_MIRROR_LAYER = '6';

export type FoldHintOptions = {
  /** Grain turn of this piece (lib/seams grainDegOf) — the frame of `line`. */
  grainDeg?: number;
  /** The import manifest's per-piece `unfoldedFold` override (wins over PieceDTO.manifest.unfolded). */
  unfoldedFold?: boolean;
  /** Assembly-map inner lines, mm in the piece's y-up `rs` frame. */
  innerLines?: readonly (readonly Pt2[])[];
  thresholds?: Partial<typeof FOLDS>;
};

type Raw = {
  origin: FoldHintOrigin;
  strength: FoldHint['strength'];
  source: FoldSource;
  pts: Pt2[];
  edgeId?: string;
};

export function foldHints(
  input: SkeletonPieceInput,
  geom: PieceGeom,
  opts: FoldHintOptions = {},
): FoldHint[] {
  const th = { ...FOLDS, ...opts.thresholds };
  if (geom.rs.length < 3) return [];
  const raws: Raw[] = [];
  for (const m of geom.marks ?? []) {
    if (m.kind !== 'fold' || m.closed || m.pts.length < 2) continue;
    raws.push({
      origin: 'mark',
      strength: 'strong',
      source: 'accepted_hint',
      pts: m.pts,
      edgeId: m.nearEdge?.edge,
    });
  }
  const unfolded = opts.unfoldedFold ?? input.piece.manifest?.unfolded ?? false;
  for (const ip of input.piece.inner ?? []) {
    if (ip.closed || ip.pts.length < 2) continue;
    const pts: Pt2[] = ip.pts.map((q) => [q.x * MM_PER_CM, q.y * MM_PER_CM]);
    if (ip.layer === INTERNAL_LAYER && unfolded) {
      raws.push({ origin: 'unfolded', strength: 'strong', source: 'dxf', pts });
    } else if (ip.layer === AAMA_MIRROR_LAYER) {
      raws.push({ origin: 'mirror', strength: 'weak', source: 'dxf', pts });
    }
  }
  for (const line of opts.innerLines ?? []) {
    if (line.length < 2) continue;
    raws.push({
      origin: 'inner',
      strength: 'weak',
      source: 'dxf',
      pts: line.map(([x, y]) => [x, y]),
    });
  }

  const f = frameOf(geom, opts.grainDeg ?? 0);
  const out: FoldHint[] = [];
  const count: Record<FoldHintOrigin, number> = { mark: 0, unfolded: 0, mirror: 0, inner: 0 };
  for (const r of raws) {
    if (chordDeviation(r.pts) > th.straightMm) continue;
    const a = r.pts[0];
    const b = r.pts[r.pts.length - 1];
    const rawLen = len(sub(b, a));
    if (rawLen < th.minLenMm || (r.origin === 'inner' && rawLen < th.innerMinMm)) continue;
    const mid = mul(add(a, b), 0.5);
    if (r.origin === 'inner' && distToPoly(geom.rs, mid) <= th.onContourMm) continue;
    // A layer line must reach the contour at both ends to be a fold across the piece; a mark is a
    // classified fold already and an inner line may stop inside (for example, at a vent).
    if (
      (r.origin === 'unfolded' || r.origin === 'mirror') &&
      (distToPoly(geom.rs, a) > th.onContourMm || distToPoly(geom.rs, b) > th.onContourMm)
    ) {
      continue;
    }
    const lineMm = clipThrough(geom.rs, mid, sub(b, a));
    if (!lineMm || len(sub(lineMm[1], lineMm[0])) < th.minLenMm) continue;
    if (out.some((h) => sameLine(h.lineMm, lineMm, th))) continue;
    let run = r.edgeId ? runById(geom, r.edgeId, 1) : undefined;
    if (
      run &&
      angleBetween(sub(lineMm[1], lineMm[0]), sub(run.pts[run.pts.length - 1], run.pts[0])) >
        th.parallelDeg
    ) {
      run = undefined;
    }
    const along = run ?? edgeAlong(geom, lineMm, th);
    out.push({
      id: `${geom.pieceKey}:${r.origin}:${count[r.origin]++}`,
      pieceKey: geom.pieceKey,
      origin: r.origin,
      strength: r.strength,
      source: r.source,
      lineMm,
      line: [clampUV(toUV(f, lineMm[0])), clampUV(toUV(f, lineMm[1]))],
      edge: along ? foldEdgeOf(geom, f, along, lineMm) : null,
    });
  }
  return out;
}

function sameLine(p: readonly [Pt2, Pt2], q: readonly [Pt2, Pt2], th: typeof FOLDS): boolean {
  if (angleBetween(sub(p[1], p[0]), sub(q[1], q[0])) > th.parallelDeg) return false;
  const d = (x: Pt2, y: Pt2) => len(sub(x, y));
  return (
    (d(p[0], q[0]) < th.dedupeMm && d(p[1], q[1]) < th.dedupeMm) ||
    (d(p[0], q[1]) < th.dedupeMm && d(p[1], q[0]) < th.dedupeMm)
  );
}
