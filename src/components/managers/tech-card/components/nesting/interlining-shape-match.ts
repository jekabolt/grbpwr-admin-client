import { bareToken } from 'components/managers/tech-card/components/nesting/block-code';
import { pieceShapeReferences } from 'lib/dxf-reconcile';
import { byName, indexSheet, sideOf, type SheetEntry } from 'lib/dxf-reconcile/match';
import { compareSigsRotationTolerant, shapeSigOf } from 'lib/dxf-reconcile/shape-sig';
import { interliningIdentityKey } from 'lib/fusing-dxf/interlining-import';
import { SPLINE_MAX_POINTS } from 'lib/fusing-dxf/spline';
import type { FuseZone } from 'lib/fusing-dxf/types';
import type { PieceDTO, Pt } from 'lib/nesting/types';

type CardPiece = { lineKey?: string; name?: string };
type Alias = { blockName?: string; pieceLineKey?: string };

export type InterliningShapePair = {
  pieceLineKey: string;
  pieceName: string;
  piece: PieceDTO;
};

export type InterliningShapeMatch = {
  identity: string;
  shape: PieceDTO;
  pairs: InterliningShapePair[];
  by: 'shape' | 'name + shape' | 'no pair';
};

const EPS = 1e-7;
const FORM_MAX = 0.055;
const ASPECT_MAX = 0.08;
const COST_MAX = 0.14;
const LEAD_MIN = 0.015;

const representative = (entry: SheetEntry, preferred: ReadonlySet<string>): PieceDTO => {
  const preferredSize = entry.sizes.find((size) => preferred.has(size));
  const size = preferredSize ?? entry.sizes[Math.floor((entry.sizes.length - 1) / 2)] ?? '';
  return entry.bySize.get(size) ?? [...entry.bySize.values()][0];
};

export function interliningPieceShapeTargets(args: {
  mainBlocks: readonly PieceDTO[];
  mainAliases: readonly Alias[];
  pieces: readonly CardPiece[];
  sizeTokens: Iterable<string>;
  preferredSizeTokens?: readonly string[];
}): InterliningShapePair[] {
  const sizeTokens = [...args.sizeTokens];
  const preferred = new Set((args.preferredSizeTokens ?? []).map(bareToken).filter(Boolean));
  const references = pieceShapeReferences({
    parse: {
      pieces: args.mainBlocks,
      blockNames: args.mainBlocks.flatMap((piece) =>
        piece.blockName?.trim() ? [piece.blockName] : [],
      ),
    },
    bindings: args.mainAliases,
    pieces: args.pieces.flatMap((piece) => {
      const lineKey = piece.lineKey?.trim() ?? '';
      const name = piece.name?.trim() ?? '';
      return lineKey && name ? [{ lineKey, name }] : [];
    }),
    sizeTokens,
  });
  const out = new Map<string, InterliningShapePair>();
  for (const reference of references) {
    const key = reference.pieceLineKey.trim().toLowerCase();
    if (!key || out.has(key)) continue;
    out.set(key, {
      pieceLineKey: reference.pieceLineKey,
      pieceName: reference.pieceName,
      piece: representative(reference.entry, preferred),
    });
  }
  return [...out.values()].sort((left, right) => byName(left.pieceName, right.pieceName));
}

const cross = (a: Pt, b: Pt, c: Pt) => (b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x);

const pointOnSegment = (point: Pt, a: Pt, b: Pt) => {
  if (Math.abs(cross(a, b, point)) > EPS) return false;
  return (
    point.x >= Math.min(a.x, b.x) - EPS &&
    point.x <= Math.max(a.x, b.x) + EPS &&
    point.y >= Math.min(a.y, b.y) - EPS &&
    point.y <= Math.max(a.y, b.y) + EPS
  );
};

const pointInOrOnRing = (point: Pt, ring: readonly Pt[]) => {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const a = ring[j];
    const b = ring[i];
    if (pointOnSegment(point, a, b)) return true;
    if (
      a.y > point.y !== b.y > point.y &&
      point.x < ((b.x - a.x) * (point.y - a.y)) / (b.y - a.y) + a.x
    )
      inside = !inside;
  }
  return inside;
};

const properlyCrosses = (a: Pt, b: Pt, c: Pt, d: Pt) => {
  const abC = cross(a, b, c);
  const abD = cross(a, b, d);
  const cdA = cross(c, d, a);
  const cdB = cross(c, d, b);
  return abC * abD < -EPS && cdA * cdB < -EPS;
};

/** The file contour in the garment piece's local centimetre frame, using the canvas centring rule. */
export function centredInterliningShape(shape: PieceDTO, piece: PieceDTO): Pt[] {
  const dx = piece.bboxW / 2 - shape.bboxW / 2;
  const dy = piece.bboxH / 2 - shape.bboxH / 2;
  return shape.poly.map((point) => ({ x: point.x + dx, y: point.y + dy }));
}

/** Inclusive fit: a same-size contour may share the cut line, but no edge may cross it. */
export function interliningShapeFits(shape: PieceDTO, piece: PieceDTO): boolean {
  if (
    shape.poly.length < 3 ||
    piece.poly.length < 3 ||
    shape.areaCm2 > piece.areaCm2 * (1 + EPS) ||
    shape.bboxW > piece.bboxW + EPS ||
    shape.bboxH > piece.bboxH + EPS
  )
    return false;
  const placed = centredInterliningShape(shape, piece);
  if (!placed.every((point) => pointInOrOnRing(point, piece.poly))) return false;
  for (let i = 0; i < placed.length; i++) {
    const a = placed[i];
    const b = placed[(i + 1) % placed.length];
    for (let j = 0; j < piece.poly.length; j++) {
      if (properlyCrosses(a, b, piece.poly[j], piece.poly[(j + 1) % piece.poly.length]))
        return false;
    }
  }
  return true;
}

const nameKeys = (value: string) => {
  const keys = new Set([interliningIdentityKey(value)]);
  const side = sideOf(value);
  if (side) keys.add(interliningIdentityKey(side.stem));
  keys.delete('');
  return keys;
};

const sameName = (shape: string, entry: SheetEntry, pieces: readonly InterliningShapePair[]) => {
  const source = nameKeys(shape);
  const target = new Set([
    ...nameKeys(entry.identity),
    ...pieces.flatMap((piece) => [...nameKeys(piece.pieceName)]),
  ]);
  return [...source].some((key) => target.has(key));
};

const mirroredTargets = (
  left: { target: { entry: SheetEntry } },
  right: { target: { entry: SheetEntry } },
) => {
  const a = sideOf(left.target.entry.identity);
  const b = sideOf(right.target.entry.identity);
  return !!a && !!b && a.stem === b.stem && a.side !== b.side;
};

/**
 * Shape-first matching for an owner interlining file. A target pattern may own several garment
 * pieces, so one file contour can deliberately produce several zones.
 */
export function matchInterliningShapes(args: {
  shapes: readonly PieceDTO[];
  mainBlocks: readonly PieceDTO[];
  mainAliases: readonly Alias[];
  pieces: readonly CardPiece[];
  sizeTokens: Iterable<string>;
  preferredSizeTokens?: readonly string[];
}): InterliningShapeMatch[] {
  const sizeTokens = [...args.sizeTokens];
  const dict = new Set(sizeTokens.map(bareToken).filter(Boolean));
  const preferred = new Set((args.preferredSizeTokens ?? []).map(bareToken).filter(Boolean));
  const references = pieceShapeReferences({
    parse: {
      pieces: args.mainBlocks,
      blockNames: args.mainBlocks.flatMap((piece) =>
        piece.blockName?.trim() ? [piece.blockName] : [],
      ),
    },
    bindings: args.mainAliases,
    pieces: args.pieces.flatMap((piece) => {
      const lineKey = piece.lineKey?.trim() ?? '';
      const name = piece.name?.trim() ?? '';
      return lineKey && name ? [{ lineKey, name }] : [];
    }),
    sizeTokens,
  });
  const targets = new Map<
    string,
    { entry: SheetEntry; piece: PieceDTO; pairs: InterliningShapePair[] }
  >();
  for (const ref of references) {
    const target = targets.get(ref.entry.key) ?? {
      entry: ref.entry,
      piece: representative(ref.entry, preferred),
      pairs: [],
    };
    if (!target.pairs.some((pair) => pair.pieceLineKey === ref.pieceLineKey)) {
      target.pairs.push({
        pieceLineKey: ref.pieceLineKey,
        pieceName: ref.pieceName,
        piece: target.piece,
      });
    }
    targets.set(ref.entry.key, target);
  }

  const file = indexSheet(
    {
      pieces: args.shapes,
      blockNames: args.shapes.flatMap((shape) =>
        shape.blockName?.trim() ? [shape.blockName] : [],
      ),
    },
    dict,
  );
  return [...file.entries.values()]
    .sort((left, right) => byName(left.key, right.key))
    .map((entry): InterliningShapeMatch => {
      const shape = representative(entry, preferred);
      const candidates = [...targets.values()].flatMap((target) => {
        const fitting = target.pairs.filter((pair) => interliningShapeFits(shape, pair.piece));
        if (fitting.length === 0) return [];
        const compared = compareSigsRotationTolerant(shapeSigOf(target.piece), shapeSigOf(shape));
        const { cmp, aspect } = compared;
        if (cmp.form > FORM_MAX || aspect > ASPECT_MAX || cmp.cost > COST_MAX) return [];
        const named = sameName(entry.identity, target.entry, fitting);
        return [{ target, fitting, named, score: cmp.cost + 0.1 * aspect }];
      });
      candidates.sort((left, right) => {
        const score = left.score - right.score;
        if (Math.abs(score) >= LEAD_MIN) return score;
        return (
          Number(right.named) - Number(left.named) ||
          score ||
          byName(left.target.entry.key, right.target.entry.key)
        );
      });
      const best = candidates[0];
      if (!best) return { identity: entry.identity, shape, pairs: [], by: 'no pair' };
      const selected = [
        best,
        ...candidates.filter(
          (candidate) =>
            candidate !== best &&
            mirroredTargets(best, candidate) &&
            Math.abs(candidate.score - best.score) < LEAD_MIN,
        ),
      ];
      const rival = candidates.find((candidate) => !selected.includes(candidate));
      if (rival && Math.abs(rival.score - best.score) < LEAD_MIN && rival.named === best.named) {
        return { identity: entry.identity, shape, pairs: [], by: 'no pair' };
      }
      const pairs = new Map<string, InterliningShapePair>();
      for (const candidate of selected)
        for (const pair of candidate.fitting)
          pairs.set(pair.pieceLineKey.trim().toLowerCase(), pair);
      return {
        identity: entry.identity,
        shape,
        pairs: [...pairs.values()].sort((left, right) => byName(left.pieceName, right.pieceName)),
        by: selected.some((candidate) => candidate.named) ? 'name + shape' : 'shape',
      };
    });
}

const triangleArea = (a: Pt, b: Pt, c: Pt) => Math.abs(cross(a, b, c));

/** Deterministic vertex thinning that retains the imported contour as a sharp spline. */
function simplifyRing(points: readonly Pt[], maxPoints: number): Pt[] {
  const out = points.map((point) => ({ ...point }));
  if (
    out.length > 1 &&
    Math.hypot(out[0].x - out[out.length - 1].x, out[0].y - out[out.length - 1].y) <= EPS
  )
    out.pop();
  while (out.length > maxPoints) {
    let drop = 0;
    let smallest = Infinity;
    for (let i = 0; i < out.length; i++) {
      const area = triangleArea(
        out[(i - 1 + out.length) % out.length],
        out[i],
        out[(i + 1) % out.length],
      );
      if (area < smallest) {
        smallest = area;
        drop = i;
      }
    }
    out.splice(drop, 1);
  }
  return out;
}

/** Imported centimetres become a centred, piece-local millimetre spline zone. */
export function interliningShapeToZone(shape: PieceDTO, piece: PieceDTO): FuseZone {
  if (!interliningShapeFits(shape, piece)) throw new Error('interlining shape does not fit piece');
  const points = simplifyRing(centredInterliningShape(shape, piece), SPLINE_MAX_POINTS).map(
    (point) => ({
      x: Math.round(point.x * 100) / 10,
      y: Math.round(point.y * 100) / 10,
      corner: true,
    }),
  );
  if (points.length < 3) throw new Error('interlining shape is empty');
  return { spline: { points }, holes: [], islands: [] };
}
