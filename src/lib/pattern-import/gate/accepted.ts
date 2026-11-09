// Findings already present on the card's current sheet. These are deliberately reconstructed from
// the card parser's piece geometry: legacy/foreign sheets carry no conversion manifest, while a
// renamed re-import must still match the accepted condition by card-piece binding, not block name.

import type { PieceDTO } from 'lib/nesting/types';
import type { GateCheckId, PtMm } from '../types';
import { PATIMPORT } from '../types';
import { polylineLength } from '../write/geom';
import { GRAIN_PROPOSAL_MIN_MM, grainOutsideMm, pointOnRings } from '../semantics/grain-inside';
import { glyphCellKey, undashed } from '../semantics/glyphs';
import { drillMarkOf } from './drill-mark';

export type AcceptedGateEntry = {
  identity: string;
  /** Every contour candidate of the identity (cut/sew layers and repeated quantities). */
  pieces: readonly PieceDTO[];
  /** The contour selected for each size by the card's normal sheet index. */
  bySize: ReadonlyMap<string, PieceDTO>;
};

const mmPoint = (p: { x: number; y: number }, origin = { x: 0, y: 0 }): PtMm => ({
  x: (p.x + origin.x) * 10,
  y: (p.y + origin.y) * 10,
});

function glyphFinding(piece: PieceDTO): boolean {
  const origin = { x: piece.originX ?? 0, y: piece.originY ?? 0 };
  const strokes = (piece.inner ?? []).flatMap((path) => {
    if (path.layer !== '8' || path.pts.length < 2) return [];
    const pts = path.pts.map((point) => mmPoint(point, origin));
    if (drillMarkOf({ closed: path.closed, pts })) return [];
    return [
      {
        pts,
        closed: path.closed,
        lengthMm: polylineLength(pts, path.closed),
      },
    ];
  });
  const short = undashed(strokes.filter((stroke) => stroke.lengthMm < PATIMPORT.glyphShortMm));
  // The card parser chains touching raw entities into one inner path. The gate later judges the
  // writer's entities, where a chain can split again at its DXF vertices; five paths is the largest
  // compression seen in the card reader's accepted legacy sheets.
  if (short.length >= PATIMPORT.glyphMaxShortPerBlock - 5) return true;
  const cells = new Map<string, number>();
  for (const stroke of short) {
    const key = glyphCellKey(stroke.pts[0]);
    const count = (cells.get(key) ?? 0) + 1;
    if (count >= PATIMPORT.glyphMaxShortPerCell) return true;
    cells.set(key, count);
  }
  return false;
}

function drillFinding(piece: PieceDTO): boolean {
  const origin = { x: piece.originX ?? 0, y: piece.originY ?? 0 };
  return (piece.inner ?? []).some(
    (path) =>
      path.layer === '8' &&
      !!drillMarkOf({
        closed: path.closed,
        pts: path.pts.map((point) => mmPoint(point, origin)),
      }),
  );
}

function grainFinding(piece: PieceDTO): boolean {
  const grain = piece.grain?.find((candidate) => candidate.layer === '7');
  if (!grain || piece.poly.length < 3) return false;
  const origin = { x: piece.originX ?? 0, y: piece.originY ?? 0 };
  const cut = piece.poly.map((point) => mmPoint(point, origin));
  const a = mmPoint(grain.a);
  const b = mmPoint(grain.b);
  const mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
  if (pointOnRings(mid, [cut])) return false;
  const through = Math.hypot(b.x - a.x, b.y - a.y) - grainOutsideMm(a, b, [cut]);
  return through < GRAIN_PROPOSAL_MIN_MM;
}

const polygonArea = (points: readonly PtMm[]) => {
  let twice = 0;
  for (let index = 0; index < points.length; index++) {
    const point = points[index];
    const next = points[(index + 1) % points.length];
    twice += point.x * next.y - next.x * point.y;
  }
  return Math.abs(twice / 2);
};

function nestedPieceFinding(piece: PieceDTO): boolean {
  const cutArea = polygonArea(piece.poly.map((point) => mmPoint(point)));
  if (!(cutArea > 0)) return false;
  return (piece.inner ?? []).some((path) => {
    if (path.layer !== '8' || path.pts.length < 3) return false;
    const points = path.pts.map((point) => mmPoint(point));
    const first = points[0];
    const last = points[points.length - 1];
    const closed = path.closed || Math.hypot(first.x - last.x, first.y - last.y) <= 0.5;
    if (!closed || drillMarkOf({ closed: path.closed, pts: points })) return false;
    const area = polygonArea(points);
    return area >= PATIMPORT.nestedPieceMinMm2 && area <= 0.45 * cutArea;
  });
}

const hand = (identity: string): 'L' | 'R' | null => {
  const tokens = identity
    .toUpperCase()
    .split(/[^A-Z0-9]+/)
    .filter(Boolean);
  const found = tokens.filter((token) => token === 'L' || token === 'R');
  return found.length === 1 ? (found[0] as 'L' | 'R') : null;
};

const handless = (identity: string) =>
  identity
    .toUpperCase()
    .split(/[^A-Z0-9]+/)
    .filter((token) => token && token !== 'L' && token !== 'R')
    .join('|');

function pairFinding(left: AcceptedGateEntry, right: AcceptedGateEntry): boolean {
  for (const [size, lp] of left.bySize) {
    const rp = right.bySize.get(size);
    const lg = lp?.grain?.find((candidate) => candidate.layer === '7');
    const rg = rp?.grain?.find((candidate) => candidate.layer === '7');
    if (!lg || !rg) continue;
    let delta = Math.abs(lg.angleDeg - rg.angleDeg) % 180;
    if (delta > 90) delta = 180 - delta;
    if (delta > 0.5) return true;
  }
  return false;
}

/** Check ids the current sheet already fails, per source identity. */
export function acceptedGateFindings(
  entries: readonly AcceptedGateEntry[],
): Map<string, GateCheckId[]> {
  const out = new Map<string, Set<GateCheckId>>();
  const add = (identity: string, id: GateCheckId) => {
    const key = identity.trim().toLowerCase();
    const found = out.get(key) ?? new Set<GateCheckId>();
    found.add(id);
    out.set(key, found);
  };
  for (const entry of entries) {
    if (entry.pieces.some(glyphFinding)) add(entry.identity, 'G16-glyphs');
    if (entry.pieces.some(drillFinding) || [...entry.bySize.values()].some(grainFinding))
      add(entry.identity, 'G5-features');
    if (entry.pieces.some(nestedPieceFinding)) add(entry.identity, 'G20-nested-piece');
  }
  const left = entries.filter((entry) => hand(entry.identity) === 'L');
  for (const l of left) {
    const r = entries.find(
      (entry) => hand(entry.identity) === 'R' && handless(entry.identity) === handless(l.identity),
    );
    if (!r || !pairFinding(l, r)) continue;
    add(l.identity, 'G12-pair');
    add(r.identity, 'G12-pair');
  }
  return new Map([...out].map(([identity, ids]) => [identity, [...ids]]));
}
