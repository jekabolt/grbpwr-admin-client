// PIECES — every piece family once, its sewn edges numbered by the steps that sew them (§4 zone 4).
//
// A family is a piece and its twins (`twinOf`): mirrored L/R halves draw once as «L·R», identical
// layers as «×n» (D7). The twin's edges do not share indices with the drawn piece (a mirror walks
// the contour the other way), so a twin's step numbers land on the drawn piece's edge of the closest
// length — «one tile, both numbers when they differ» (§9 q5). Nothing is dropped: a number always
// finds an edge.

import type { EdgeId, PieceGeom, Pt2 } from '../types';
import { resolveEdge } from '../union/layout';
import { bboxOf, along, pieceNotchesLocal, polyLen, type MapNotch } from './frame';
import type { MapRead } from './step-seams';

export type PieceEdgeMark = {
  id: EdgeId;
  /** Polyline, y down, mm from the piece's top-left. */
  pts: Pt2[];
  /** Indexes of the sewing steps that sew this edge (or the twin's matching edge), ascending. */
  steps: number[];
  /** Midpoint of the edge and the outward unit normal there — where the number goes. */
  mid: Pt2;
  out: Pt2;
};

export type PieceMapPicture = {
  pieceKey: string;
  name: string;
  w: number;
  h: number;
  outline: Pt2[];
  /** Sewn edges only; the rest of the outline is «not sewn in any step». */
  edges: PieceEdgeMark[];
  notches: MapNotch[];
};

export type PieceFamily = {
  /** The piece drawn for the family. */
  leader: string;
  /** Every piece of the family, the leader first. */
  members: string[];
  /** «L·R», «×2», «L·R ×2» or ''. */
  tag: string;
  /** Family name without the hand: «SLV L» → «SLV». */
  name: string;
  /** Smallest step index that sews any member (Infinity = none). */
  first: number;
  picture: PieceMapPicture;
};

const handless = (name: string) =>
  name
    .replace(/[_\s-]+(L|R|LEFT|RIGHT|Л|П)$/i, '')
    .replace(/^(LEFT|RIGHT|Л|П)[_\s-]+/i, '')
    .replace(/\b(left|right)\b\s*/gi, '')
    .replace(/_/g, ' ')
    .trim() || name.replace(/_/g, ' ');

/** One piece in its own y-down frame with `stepsOf(edgeId)` written on its edges. */
export function piecePicture(
  g: PieceGeom,
  stepsOf: (id: EdgeId) => number[],
  ids: readonly EdgeId[],
): PieceMapPicture {
  const B = bboxOf(g.rs);
  const flip = (p: Pt2): Pt2 => [p[0] - B.x0, B.y1 - p[1]];
  const geoms = new Map([[g.pieceKey, g]]);
  const edges: PieceEdgeMark[] = [];
  for (const id of ids) {
    const steps = stepsOf(id);
    if (steps.length === 0) continue;
    const e = resolveEdge(id, geoms);
    if (!e || e.pts.length < 2) continue;
    const { p, t } = along(e.pts, polyLen(e.pts) / 2);
    // CCW contour: cloth on the left of travel; outward is the right normal. Then y flips.
    const outUp: Pt2 = [t[1], -t[0]];
    edges.push({ id, pts: e.pts.map(flip), steps, mid: flip(p), out: [outUp[0], -outUp[1]] });
  }
  return {
    pieceKey: g.pieceKey,
    name: g.name,
    w: B.x1 - B.x0,
    h: B.y1 - B.y0,
    outline: g.rs.map(flip),
    edges,
    notches: pieceNotchesLocal(g).map((n) => ({
      at: flip(n.at),
      inward: [n.inward[0], -n.inward[1]] as Pt2,
    })),
  };
}

/** Sewn edge ids of a piece (plain edges and chains), as the read numbered them. */
function sewnIds(read: MapRead, pieceKey: string): EdgeId[] {
  const out: EdgeId[] = [];
  for (const id of read.edgeSteps.keys())
    if (id.startsWith(`${pieceKey}#`) && id.indexOf('#', pieceKey.length + 1) < 0) out.push(id);
  return out;
}

const lenOf = (read: MapRead, id: EdgeId) => {
  const e = resolveEdge(id, read.geoms);
  return e ? e.len : 0;
};

/** Every contoured piece once per family, sorted by the first step that sews it. */
export function pieceFamilies(read: MapRead): PieceFamily[] {
  const seen = new Set<string>();
  const out: PieceFamily[] = [];
  const pieces = read.graph.pieces.filter((p) => p.rs.length >= 3);
  const byKey = new Map(pieces.map((p) => [p.pieceKey, p]));
  for (const p of pieces) {
    if (seen.has(p.pieceKey)) continue;
    const twins = p.twinOf.filter((t) => byKey.has(t.key) && !seen.has(t.key));
    const members = [p, ...twins.map((t) => byKey.get(t.key)!)];
    // Draw the left half when there is one (the sheet reads like the pattern: left first).
    const leader = members.find((m) => m.hand === 'L') ?? p;
    for (const m of members) seen.add(m.pieceKey);
    const mirrors = twins.filter((t) => t.kind === 'mirror').length;
    const n = members.length;
    const tag =
      n === 1 ? '' : mirrors > 0 ? (n === 2 ? 'L·R' : `L·R ×${Math.ceil(n / 2)}`) : `×${n}`;

    // The leader's own sewn edges, then every twin edge onto the leader edge of the closest length.
    const leaderIds = new Set(sewnIds(read, leader.pieceKey));
    const steps = new Map<EdgeId, Set<number>>();
    for (const id of leaderIds) steps.set(id, new Set(read.edgeSteps.get(id) ?? []));
    const candidates = [
      ...leader.edges.filter((e) => e.kind === 'edge').map((e) => e.id),
      ...[...leaderIds].filter((id) => id.includes('+')),
    ];
    for (const m of members) {
      if (m === leader) continue;
      for (const id of sewnIds(read, m.pieceKey)) {
        const L = lenOf(read, id);
        let best: EdgeId | null = null;
        let bestD = Infinity;
        for (const c of candidates) {
          const d = Math.abs(lenOf(read, c) - L);
          if (d < bestD) {
            bestD = d;
            best = c;
          }
        }
        if (!best) continue;
        const set = steps.get(best) ?? new Set<number>();
        for (const s of read.edgeSteps.get(id) ?? []) set.add(s);
        steps.set(best, set);
      }
    }
    const stepsOf = (id: EdgeId) => [...(steps.get(id) ?? [])].sort((a, b) => a - b);
    const all = [...steps.values()].flatMap((s) => [...s]);
    out.push({
      leader: leader.pieceKey,
      members: [leader.pieceKey, ...members.filter((m) => m !== leader).map((m) => m.pieceKey)],
      tag,
      name: handless(leader.name),
      first: all.length ? Math.min(...all) : Infinity,
      picture: piecePicture(leader, stepsOf, [...steps.keys()]),
    });
  }
  return out.sort((a, b) => (a.first === b.first ? 0 : a.first < b.first ? -1 : 1));
}
