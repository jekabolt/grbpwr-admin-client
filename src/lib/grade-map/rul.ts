// Grade map · trust `exact` from a .rul grade (GRADEMAP-DESIGN §2, source «.rul»). The expansion
// knows where every coordinate of a chain went in every size; a derived track of the same line is
// replaced by those nodes when they lie on the runtime geometry in every size. Anything that does not
// fit (another frame, a missing size, a line the derived map does not have) keeps the derived track.

import type { RulPieceGrade } from 'lib/pattern-import/adapters/rul/expand';
import type { PtMm } from 'lib/pattern-import/types';
import { BIND_MM, bindPiece, liveOf } from './bind';
import { pieceBaseSize } from './compare';
import { bboxOf, distanceToPolyline, signedArea, toQ } from './geom';
import type { GmPiece, GmSizeGeometry, GmTrack } from './types';

/** On the runtime cut within this, per coordinate, or the frame is not the one the runtime sees. */
const FRAME_MM = 0.05;

export type ExactResult = { piece: GmPiece; exact: number; note: string | null };

/**
 * Upgrade the chain tracks of one derived piece with the .rul grade. `sizeIdOf` maps a .rul size
 * name to the card's size id (0 when unknown); `geos` is every size of the piece in the runtime frame.
 */
export function exactFromRul(
  piece: GmPiece,
  grade: RulPieceGrade,
  rulSizes: readonly string[],
  sizeIdOf: (rulSize: string) => number,
  geos: readonly GmSizeGeometry[],
  sizeOrder: readonly number[],
): ExactResult {
  const keep = (note: string): ExactResult => ({ piece, exact: 0, note: `${piece.key}: ${note}` });
  const geoById = new Map(geos.map((g) => [g.sizeId, g]));
  const base = pieceBaseSize(piece, [...geoById.keys()]);
  if (base === null || !geoById.has(base)) return keep('base size unknown');
  const col = new Map<number, number>();
  rulSizes.forEach((name, i) => {
    const id = sizeIdOf(name);
    if (id && geoById.has(id)) col.set(id, i);
  });
  const ids = sizeOrder.filter((id) => geoById.has(id));
  if (ids.some((id) => !col.has(id))) return keep('a size of the file is not in the .rul');
  const cutLayer = piece.tracks.find((t) => t.kind === 'cut')?.layer ?? '1';
  const cutEnt = grade.entities.find((e) => e.kind === 'chain' && e.closed && e.layer === cutLayer);
  if (!cutEnt) return keep('no graded cut');
  // Per size: block-local → runtime frame (the runtime moves each piece to its bbox minimum).
  const shift = new Map<number, PtMm>();
  for (const id of ids) {
    const ring = cutEnt.at.map((slot) => slot[col.get(id)!]);
    const rb = bboxOf(ring);
    const lb = bboxOf(geoById.get(id)!.cut);
    const t = { x: lb.minX - rb.minX, y: lb.minY - rb.minY };
    const cut = geoById.get(id)!.cut;
    if (ring.some((p) => distanceToPolyline({ x: p.x + t.x, y: p.y + t.y }, cut, true) > FRAME_MM))
      return keep(`the .rul cut is not the drawn cut in size ${id}`);
    shift.set(id, t);
  }
  const at = (slot: PtMm[], id: number): PtMm => {
    const p = slot[col.get(id)!];
    const t = shift.get(id)!;
    return { x: p.x + t.x, y: p.y + t.y };
  };
  const tracks = [...piece.tracks];
  const swapped = new Set<number>();
  for (const ent of grade.entities) {
    if (ent.kind !== 'chain') continue;
    let slots = ent.at.filter(
      (s, i) =>
        !i ||
        Math.hypot(
          s[col.get(base)!].x - ent.at[i - 1][col.get(base)!].x,
          s[col.get(base)!].y - ent.at[i - 1][col.get(base)!].y,
        ) > 1e-6,
    );
    if (ent.closed && slots.length > 1) {
      const a = at(slots[0], base);
      const z = at(slots[slots.length - 1], base);
      if (Math.hypot(a.x - z.x, a.y - z.y) <= 1e-6) slots = slots.slice(0, -1);
    }
    if (slots.length < (ent.closed ? 3 : 2)) continue;
    const baseNodes = slots.map((s) => at(s, base));
    if (ent.closed && signedArea(baseNodes) < 0) {
      slots = [...slots].reverse();
      baseNodes.reverse();
    }
    const j = tracks.findIndex(
      (t, k) =>
        !swapped.has(k) &&
        t.kind !== 'drill' &&
        t.kind !== 'notch' &&
        t.closed === ent.closed &&
        t.base.every(
          ([x, y]) =>
            distanceToPolyline({ x: x / 100, y: y / 100 }, baseNodes, ent.closed) <= BIND_MM,
        ) &&
        baseNodes.every(
          (p) =>
            distanceToPolyline(
              p,
              t.base.map(([x, y]) => ({ x: x / 100, y: y / 100 })),
              t.closed,
            ) <= BIND_MM,
        ),
    );
    if (j < 0) continue;
    const derived = tracks[j];
    const baseQ = baseNodes.map((p): [number, number] => [toQ(p.x), toQ(p.y)]);
    const exact: GmTrack = {
      kind: derived.kind,
      layer: derived.layer,
      closed: derived.closed,
      trust: 'exact',
      residualMm: 0,
      base: baseQ,
      sizes: derived.sizes.map((s) => ({
        sizeId: s.sizeId,
        delta: slots.map((slot, n): [number, number] => {
          const p = at(slot, s.sizeId);
          return [toQ(p.x) - baseQ[n][0], toQ(p.y) - baseQ[n][1]];
        }),
        residualMm: 0,
      })),
    };
    tracks[j] = exact;
    swapped.add(j);
  }
  if (!swapped.size) return keep('no .rul chain matches a derived track');
  // Every exact track must bind in every size, or that track stays derived.
  const lives = new Map(geos.map((g) => [g.sizeId, liveOf(g)]));
  const trial: GmPiece = { ...piece, tracks };
  const binding = bindPiece(trial, lives.get(base)!, lives);
  let exact = 0;
  const failed: string[] = [];
  for (const k of swapped) {
    const b = binding.tracks[k];
    const ok = b.base.ok && [...b.sizes.values()].every((s) => s.ok);
    if (ok) exact++;
    else {
      tracks[k] = piece.tracks[k];
      failed.push(`${piece.tracks[k].kind} ${piece.tracks[k].layer}`);
    }
  }
  return {
    piece: { ...piece, tracks },
    exact,
    note: failed.length
      ? `${piece.key}: kept derived (${failed.join(', ')}) — exact nodes do not bind`
      : null,
  };
}
