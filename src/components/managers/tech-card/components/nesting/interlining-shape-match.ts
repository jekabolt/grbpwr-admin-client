import { Clipper, FillRule, Path64, Paths64, Point64 } from 'clipper2-js';
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
const LEAD_MIN = 0.015;
/** A contour may stick out of the piece by this share of its own area (drawing jitter). */
const FIT_SPILL = 0.005;
/** Bbox jitter allowed, cm. */
const FIT_TOL_CM = 0.05;
const CLIP_SCALE = 1000;

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

/** The file contour in the garment piece's local centimetre frame, using the canvas centring rule. */
export function centredInterliningShape(shape: PieceDTO, piece: PieceDTO): Pt[] {
  const dx = piece.bboxW / 2 - shape.bboxW / 2;
  const dy = piece.bboxH / 2 - shape.bboxH / 2;
  return shape.poly.map((point) => ({ x: point.x + dx, y: point.y + dy }));
}

const clipPath = (ring: readonly Pt[]): Paths64 => {
  const path = new Path64();
  for (const q of ring)
    path.push(new Point64(Math.round(q.x * CLIP_SCALE), Math.round(q.y * CLIP_SCALE)));
  const out = new Paths64();
  out.push(path);
  return out;
};
const clipArea = (paths: Paths64) => Math.abs(Clipper.areaPaths(paths)) / (CLIP_SCALE * CLIP_SCALE);

/**
 * Inclusive fit: a same-size contour may share the cut line. Measured as the area of the contour
 * outside the piece, so float jitter of a contour drawn ON the cut line does not read as crossing.
 */
export function interliningShapeFits(shape: PieceDTO, piece: PieceDTO): boolean {
  if (
    shape.poly.length < 3 ||
    piece.poly.length < 3 ||
    shape.bboxW > piece.bboxW + FIT_TOL_CM ||
    shape.bboxH > piece.bboxH + FIT_TOL_CM
  )
    return false;
  const placed = clipPath(centredInterliningShape(shape, piece));
  const own = clipArea(placed);
  if (own <= 0) return false;
  const spill = clipArea(Clipper.Difference(placed, clipPath(piece.poly), FillRule.NonZero));
  return spill <= own * FIT_SPILL;
}

const nameKeys = (value: string) => {
  const keys = new Set([interliningIdentityKey(value)]);
  const side = sideOf(value);
  if (side) keys.add(interliningIdentityKey(side.stem));
  keys.delete('');
  return keys;
};

const exactName = (shape: string, entry: SheetEntry, pieces: readonly InterliningShapePair[]) => {
  const key = shape.trim().toLowerCase();
  return (
    entry.identity.trim().toLowerCase() === key ||
    pieces.some((piece) => piece.pieceName.trim().toLowerCase() === key)
  );
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
  type Claim = { pair: InterliningShapePair; rank: [number, number, number] };
  const drafts = [...file.entries.values()]
    .sort((left, right) => byName(left.key, right.key))
    .map((entry): InterliningShapeMatch & { claims: Claim[] } => {
      const shape = representative(entry, preferred);
      const candidates = [...targets.values()].flatMap((target) => {
        const fitting = target.pairs.filter((pair) => interliningShapeFits(shape, pair.piece));
        if (fitting.length === 0) return [];
        // Form and proportion only: an interlining file carries no notches and is often a scaled-down
        // copy, so the contour cost (area, perimeter, notches) would reject the very shapes it is for.
        const compared = compareSigsRotationTolerant(shapeSigOf(target.piece), shapeSigOf(shape));
        const { cmp, aspect } = compared;
        const named = sameName(entry.identity, target.entry, fitting);
        const exact = exactName(entry.identity, target.entry, fitting);
        const shaped = cmp.form <= FORM_MAX && aspect <= ASPECT_MAX;
        if (!shaped && !named) return [];
        return [{ target, fitting, named, exact, shaped, score: cmp.form + 0.1 * aspect }];
      });
      const shapedOnes = candidates.filter((candidate) => candidate.shaped);
      // No shape pair: a contour that fits inside the piece of its own name (a placket strip on a
      // front panel) still pairs by that name.
      const pool = shapedOnes.length
        ? shapedOnes
        : candidates.filter((candidate) => candidate.exact).length === 1
          ? candidates.filter((candidate) => candidate.exact)
          : candidates.filter((candidate) => candidate.named).length === 1
            ? candidates.filter((candidate) => candidate.named)
            : [];
      pool.sort((left, right) => {
        const score = left.score - right.score;
        if (Math.abs(score) >= LEAD_MIN) return score;
        return (
          Number(right.exact) - Number(left.exact) ||
          Number(right.named) - Number(left.named) ||
          score ||
          byName(left.target.entry.key, right.target.entry.key)
        );
      });
      const best = pool[0];
      if (!best) return { identity: entry.identity, shape, pairs: [], by: 'no pair', claims: [] };
      const selected = [
        best,
        ...pool.filter(
          (candidate) =>
            candidate !== best &&
            mirroredTargets(best, candidate) &&
            Math.abs(candidate.score - best.score) < LEAD_MIN,
        ),
      ];
      const rival = pool.find((candidate) => !selected.includes(candidate));
      if (
        rival &&
        Math.abs(rival.score - best.score) < LEAD_MIN &&
        rival.named === best.named &&
        rival.exact === best.exact
      ) {
        return { identity: entry.identity, shape, pairs: [], by: 'no pair', claims: [] };
      }
      const claims: Claim[] = selected.flatMap((candidate) =>
        candidate.fitting.map((pair) => ({
          pair,
          // Who keeps a piece two shapes both want: its own name first, then the shape's best
          // target before a mirrored fan-out, then the closer form.
          rank: [
            candidate.exact ? 0 : candidate.named ? 1 : 2,
            candidate === best ? 0 : 1,
            candidate.score,
          ] as [number, number, number],
        })),
      );
      const pairs = new Map<string, InterliningShapePair>();
      for (const candidate of selected)
        for (const pair of candidate.fitting)
          pairs.set(pair.pieceLineKey.trim().toLowerCase(), pair);
      return {
        identity: entry.identity,
        shape,
        pairs: [...pairs.values()].sort((left, right) => byName(left.pieceName, right.pieceName)),
        by: selected.some((candidate) => candidate.named) ? 'name + shape' : 'shape',
        claims,
      };
    });

  // One to one: a piece takes exactly one shape, so a cuff the file draws twice (SLV_M_L and
  // SLV_M_R) never gets two zones; a mirrored fan-out only fills a piece no other shape claims.
  const owner = new Map<string, { index: number; rank: [number, number, number] }>();
  const keyOf = (pair: InterliningShapePair) => pair.pieceLineKey.trim().toLowerCase();
  const before = (a: [number, number, number], b: [number, number, number]) =>
    a[0] - b[0] || a[1] - b[1] || a[2] - b[2];
  drafts.forEach((draft, index) => {
    for (const claim of draft.claims) {
      const held = owner.get(keyOf(claim.pair));
      if (!held || before(claim.rank, held.rank) < 0)
        owner.set(keyOf(claim.pair), { index, rank: claim.rank });
    }
  });
  return drafts.map(({ claims, ...draft }, index): InterliningShapeMatch => {
    void claims;
    const pairs = draft.pairs.filter((pair) => owner.get(keyOf(pair))?.index === index);
    return pairs.length ? { ...draft, pairs } : { ...draft, pairs, by: 'no pair' };
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
