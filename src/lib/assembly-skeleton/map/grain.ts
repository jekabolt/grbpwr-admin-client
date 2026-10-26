import { grainDisplaySegment } from 'lib/nesting/geom/grain-display';
import type { PieceGeom, Pt2 } from '../types';

export function mapGrainLayer(pieces: readonly PieceGeom[]): string {
  const declared = new Set(pieces.map((piece) => piece.declaredGrainLayer ?? ''));
  if (declared.size === 1 && !declared.has('')) return [...declared][0];

  const stats = new Map<string, { exactlyOne: number; seen: number; lengths: number[] }>();
  for (const piece of pieces) {
    const perLayer = new Map<string, { a: Pt2; b: Pt2 }[]>();
    for (const grain of piece.grain ?? []) {
      const list = perLayer.get(grain.layer) ?? [];
      list.push(grain);
      perLayer.set(grain.layer, list);
    }
    for (const [layer, grains] of perLayer) {
      const stat = stats.get(layer) ?? { exactlyOne: 0, seen: 0, lengths: [] };
      stat.seen++;
      if (grains.length === 1) {
        stat.exactlyOne++;
        stat.lengths.push(
          Math.hypot(grains[0].b[0] - grains[0].a[0], grains[0].b[1] - grains[0].a[1]),
        );
      }
      stats.set(layer, stat);
    }
  }
  const median = (values: number[]) => {
    const sorted = [...values].sort((a, b) => a - b);
    return sorted.length ? sorted[Math.floor(sorted.length / 2)] : 0;
  };
  const best = [...stats.entries()].sort(
    (a, b) =>
      b[1].exactlyOne - a[1].exactlyOne ||
      median(b[1].lengths) - median(a[1].lengths) ||
      b[1].seen - a[1].seen,
  )[0];
  return best && best[1].exactlyOne > 0 && best[1].exactlyOne * 2 >= best[1].seen ? best[0] : '';
}

export function mapGrainSegment(piece: PieceGeom, layer: string): [Pt2, Pt2] | null {
  if (!layer) return null;
  const hits = (piece.grain ?? []).filter((grain) => grain.layer === layer);
  if (hits.length !== 1) return null;
  const segment = grainDisplaySegment([piece.rs.map(([x, y]) => ({ x, y }))], {
    a: { x: hits[0].a[0], y: hits[0].a[1] },
    b: { x: hits[0].b[0], y: hits[0].b[1] },
  });
  return segment
    ? [
        [segment.a.x, segment.a.y],
        [segment.b.x, segment.b.y],
      ]
    : null;
}
