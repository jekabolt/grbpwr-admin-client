// Pieces are measured upright: the grain line vertical. CLO exports most pieces upright already,
// but a piece can sit a few degrees off in the layout (Allsizes BP_1: grain 92°, its hem slants
// 21 mm across 53 cm) — every level and every vertical would tilt with it. A grain line (DXF layer
// 7) within GRAIN_SNAP_DEG of vertical turns the piece upright; one far from vertical (an 18 cm
// arrow drawn sideways on an upright piece, SS26-005) is not trusted and the drawing frame stays.
// Values are measured in the upright frame; lines and landmarks go back to the piece's own frame.

import type { PieceDTO } from 'lib/nesting/types';
import type { Edge, PieceGeom, Pt2 } from 'lib/assembly-skeleton/types';
import { bboxOf } from './geom';

const GRAIN_LAYER = '7';
const GRAIN_SNAP_DEG = 8;
const MIN_DEG = 0.3;

export type Upright = { deg: number; c: Pt2 };

/** Degrees (CCW) that make the piece's grain vertical; 0 when it is upright or the grain is not trusted. */
export function grainRotation(piece: PieceDTO | undefined): number {
  const g = (piece?.grain ?? []).find((x) => x.layer === GRAIN_LAYER);
  if (!g) return 0;
  const off = 90 - g.angleDeg;
  return Math.abs(off) >= MIN_DEG && Math.abs(off) <= GRAIN_SNAP_DEG ? off : 0;
}

export function rotatePt(p: Pt2, deg: number, c: Pt2): Pt2 {
  const r = (deg * Math.PI) / 180;
  const cs = Math.cos(r);
  const sn = Math.sin(r);
  const x = p[0] - c[0];
  const y = p[1] - c[1];
  return [c[0] + x * cs - y * sn, c[1] + x * sn + y * cs];
}

export function uprightGeom(g: PieceGeom, deg: number): { geom: PieceGeom; up: Upright } {
  const bb = bboxOf(g.rs.length ? g.rs : [[0, 0]]);
  const c: Pt2 = [(bb.x0 + bb.x1) / 2, (bb.y0 + bb.y1) / 2];
  if (!deg) return { geom: g, up: { deg: 0, c } };
  const R = (p: Pt2) => rotatePt(p, deg, c);
  const edges: Edge[] = g.edges.map((e) => ({ ...e, pts: e.pts.map(R) }));
  return { geom: { ...g, rs: g.rs.map(R), edges }, up: { deg, c } };
}
