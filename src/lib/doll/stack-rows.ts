// A drawn piece a person laid on a piece the doll does not draw (a yoke laid on a pocket panel that
// runs from the shoulder down to the pocket mouth) is the top ply of one stack. The card's rows may
// name the undrawn ply's edges — the shoulder sewn to the pocket panel's shoulder, the armhole run
// over its armhole, the placket over its front edge. The pocket panel is never in the mesh, so those
// rows would sew nothing there, and the drawn ply hangs by what is left. The doll sews the drawn
// ply's edges that lie on the named ones instead. A row that sews the drawn ply onto the very edge
// it lies on joins the two plies of one stack: it is not a seam.

import { apply } from 'lib/assembly-skeleton/union/affine';
import type { Affine, EdgeId, PieceGeom, Pt2 } from 'lib/assembly-skeleton/types';
import { resample } from './surface-rows';

/** A surface row's motion: the drawn part's pattern frame → the undrawn host's pattern frame. */
export type StackLay = { part: string; host: string; T: Affine };

/** The drawn part's edges lying on one host edge, in order along it. */
export type OnHost = { host: string; part: string; edges: EdgeId[] };

export type StackRead =
  | { kind: 'over'; a: EdgeId[]; b: EdgeId[]; over: EdgeId[]; off: string[] }
  | { kind: 'stack'; edge: EdgeId; on: EdgeId; part: string; host: string };

const N = 24;
/** A part edge lies on a host edge when this share of it is this close (mm, share of its length). */
const TOL_MM = 6;
const TOL_REL = 0.04;
const SHARE = 0.8;
const MIN_MM = 20;
/** A row read over the drawn ply must fit as a plain seam does. */
export const STACK_FIT = 0.12;

/** Distance from p to a polyline, and the arc position of the nearest point. */
function nearest(poly: readonly Pt2[], p: Pt2): { d: number; s: number } {
  let best = { d: Infinity, s: 0 };
  let s = 0;
  for (let i = 0; i + 1 < poly.length; i++) {
    const [x0, y0] = poly[i];
    const dx = poly[i + 1][0] - x0;
    const dy = poly[i + 1][1] - y0;
    const L2 = dx * dx + dy * dy;
    const t = L2 > 0 ? Math.max(0, Math.min(1, ((p[0] - x0) * dx + (p[1] - y0) * dy) / L2)) : 0;
    const d = Math.hypot(p[0] - (x0 + t * dx), p[1] - (y0 + t * dy));
    if (d < best.d) best = { d, s: s + t * Math.sqrt(L2) };
    s += Math.sqrt(L2);
  }
  return best;
}

/** Host edge → the drawn part's edges lying on it, for every stack. */
export function edgesLyingOnHost(
  lays: readonly StackLay[],
  geoms: ReadonlyMap<string, PieceGeom>,
): Map<EdgeId, OnHost> {
  const out = new Map<EdgeId, OnHost>();
  for (const { part, host, T } of lays) {
    const P = geoms.get(part);
    const H = geoms.get(host);
    if (!P || !H) continue;
    const hostEdges = H.edges.filter((e) => e.kind === 'edge' && e.pts.length >= 2);
    const lying = new Map<EdgeId, { id: EdgeId; at: number }[]>();
    for (const e of P.edges) {
      if (e.kind !== 'edge' || e.pts.length < 2 || e.lenMm < MIN_MM) continue;
      const pts = resample(
        e.pts.map((p) => apply(T, p)),
        N,
      );
      const tol = Math.max(TOL_MM, TOL_REL * e.lenMm);
      for (const h of hostEdges) {
        const hits = pts.map((p) => nearest(h.pts, p));
        if (hits.filter((x) => x.d <= tol).length < SHARE * N) continue;
        const at = hits.reduce((t, x) => t + x.s, 0) / N;
        lying.set(h.id, [...(lying.get(h.id) ?? []), { id: e.id, at }]);
      }
    }
    for (const [id, list] of lying)
      out.set(id, { host, part, edges: list.sort((x, y) => x.at - y.at).map((x) => x.id) });
  }
  return out;
}

/**
 * A row read over the stacks: its host edges replaced by the drawn part's edges lying on them.
 * `stack` when the drawn part's edge would then sit on both sides (the row joins the two plies);
 * `over` when the row so read fits as a seam; null when it names no host edge, or does not fit.
 * `len` is the sewn length of a part on this row (its stored stretch, or the whole edge).
 */
export function readOverStack(
  a: readonly EdgeId[],
  b: readonly EdgeId[],
  on: ReadonlyMap<EdgeId, OnHost>,
  len: (id: EdgeId) => number,
): StackRead | null {
  if (![...a, ...b].some((id) => on.has(id))) return null;
  const swap = (ids: readonly EdgeId[]) => ids.flatMap((id) => on.get(id)?.edges ?? [id]);
  const a1 = swap(a);
  const b1 = swap(b);
  const both = a1.find((id) => b1.includes(id));
  if (both) {
    const hostEdge = [...a, ...b].find((id) => on.get(id)?.edges.includes(both))!;
    const { host, part } = on.get(hostEdge)!;
    return { kind: 'stack', edge: both, on: hostEdge, part, host };
  }
  const la = a1.reduce((t, id) => t + len(id), 0);
  const lb = b1.reduce((t, id) => t + len(id), 0);
  if (1 - Math.min(la, lb) / Math.max(la, lb, 1e-9) > STACK_FIT) return null;
  const named = new Set([...a, ...b]);
  return {
    kind: 'over',
    a: a1,
    b: b1,
    over: [...a1, ...b1].filter((id) => !named.has(id)),
    off: [...new Set([...a, ...b].flatMap((id) => (on.has(id) ? [on.get(id)!.host] : [])))],
  };
}
