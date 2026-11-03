import type { PieceGeom } from 'lib/assembly-skeleton/types';
import {
  poseOf,
  type EdgeAnchor,
  type SeamLayer,
  type SeamPlacement,
  type StoredPose,
  type StoredSeam,
  withSeamLayer,
} from 'lib/seams';

import { decodeHandPlace, isHandSeamKind, twinRowOf, withHandPlace } from './step-hand';
import { mirrorPlacement } from './step-pose';
import { edgeWordVote } from './signals/edge-words';

/**
 * A proposal the model could not back (it won on length alone, or barely): shown as the best guess,
 * with the user's own pick one click away. A proposal without the flag reads as sure.
 */
export function isGuess(p: object | null | undefined): boolean {
  return !!p && (p as { confident?: boolean }).confident === false;
}

type PickSides = { a: readonly string[]; b: readonly string[] };

/**
 * One-input steps collect sides by piece click order: all runs of the first piece stay on side 1,
 * then the first different piece opens side 2. Multi-input steps retain their input-owned sides.
 */
export function sideForClick(
  piece: string,
  groups: readonly { pieces: readonly string[] }[],
  picked: PickSides,
  pieceOf: (id: string) => string,
): 'a' | 'b' {
  if (groups.length === 2) return groups[0].pieces.includes(piece) ? 'a' : 'b';
  if (groups.length > 2) {
    // Each of the step's seams joins two of its inputs: a side holds the input clicked first.
    const inputOf = (key: string) => groups.findIndex((group) => group.pieces.includes(key));
    const input = inputOf(piece);
    if (picked.a.some((id) => inputOf(pieceOf(id)) === input)) return 'a';
    if (picked.b.some((id) => inputOf(pieceOf(id)) === input)) return 'b';
    return picked.a.length ? 'b' : 'a';
  }
  if (picked.a.some((id) => pieceOf(id) === piece)) return 'a';
  if (picked.b.some((id) => pieceOf(id) === piece)) return 'b';
  return picked.a.length ? 'b' : 'a';
}

const NAMED_EDGE_WORDS = ['neckline', 'armhole', 'shoulder', 'hem', 'front_edge'] as const;

/** A coarse, human edge word when geometry decides one; every inner line reads as a slit. */
export function seamEdgeWord(
  ids: readonly string[],
  geoms: ReadonlyMap<string, PieceGeom>,
): string {
  if (ids.some((id) => /:i\d+$/.test(id))) return 'slit';
  const edges = ids.flatMap((id) => {
    const at = id.lastIndexOf('#');
    const geom = at < 0 ? undefined : geoms.get(id.slice(0, at));
    const edge = geom?.edges.find((candidate) => candidate.id === id);
    return edge ? [edge] : [];
  });
  if (!edges.length) return '';
  const side = {
    pieces: [...new Set(edges.map((edge) => edge.pieceKey))],
    ids: edges.map((edge) => edge.id),
    lenMm: edges.reduce((sum, edge) => sum + edge.lenMm, 0),
    turnDeg: edges.reduce((sum, edge) => sum + edge.turnDeg, 0),
  };
  const word = NAMED_EDGE_WORDS.find((candidate) => edgeWordVote(candidate, side, geoms) === true);
  return word === 'front_edge' ? 'front edge' : word ?? '';
}

/** Piece names as the card spells them, plus `slit` only when the target is truly an inner line. */
export function seamSideName(
  ids: readonly string[],
  geoms: ReadonlyMap<string, PieceGeom>,
  nameOf: (piece: string) => string,
  pieceOf: (id: string) => string,
): string {
  const names = [...new Set(ids.map((id) => nameOf(pieceOf(id))).filter(Boolean))];
  const edge = seamEdgeWord(ids, geoms) === 'slit' ? 'slit' : '';
  return [...names, edge].filter(Boolean).join(' ');
}

export type TwinMirrorUpdate = { row: StoredSeam; piece: string };

/** The right twin of a left piece among `keys`, with how it relates (`PieceGeom.twinOf`). */
function rightTwinOf(
  left: string,
  keys: Iterable<string>,
  geoms: ReadonlyMap<string, PieceGeom>,
): { key: string; kind: 'mirror' | 'identical' } | null {
  for (const key of keys) {
    if (key === left) continue;
    const link = geoms.get(key)?.twinOf.find((twin) => twin.key === left);
    if (link) return { key, kind: link.kind };
  }
  return null;
}

/** A left host + part laid at `at`, re-laid on their right twins; null when a twin is missing. */
function mirroredOnTwins(
  hostL: string,
  partL: string,
  at: SeamPlacement,
  hostR: string,
  partR: string,
  geoms: ReadonlyMap<string, PieceGeom>,
): SeamPlacement | null {
  const host = rightTwinOf(hostL, [hostR], geoms);
  const part = rightTwinOf(partL, [partR], geoms);
  const [gHL, gPL, gHR, gPR] = [hostL, partL, hostR, partR].map((key) => geoms.get(key));
  if (!host || !part || !gHL || !gPL || !gHR || !gPR) return null;
  return mirrorPlacement(gHL, gPL, at, gHR, gPR, host.kind, part.kind);
}

/**
 * Copy explicit left-hand placements onto matching rows in this step: edge rows by hand place,
 * surface rows by the left part's placement re-laid on the right host.
 */
export function mirrorLeftRows(
  stepRows: readonly StoredSeam[],
  cardRows: readonly StoredSeam[],
  geoms: ReadonlyMap<string, PieceGeom>,
): TwinMirrorUpdate[] {
  const updates = new Map<string, TwinMirrorUpdate>();
  for (const source of cardRows) {
    if (source.kind === 'surface') {
      const at = source.sideA[0]?.placement;
      const hostL = source.sideA[0]?.piece;
      const partL = source.sideB[0]?.piece;
      if (!at || !hostL || !partL) continue;
      if (geoms.get(hostL)?.hand !== 'L' && geoms.get(partL)?.hand !== 'L') continue;
      for (const target of stepRows) {
        const hostR = target.sideA[0]?.piece;
        const partR = target.sideB[0]?.piece;
        if (target.kind !== 'surface' || target.seamKey === source.seamKey || !hostR || !partR)
          continue;
        const placement = mirroredOnTwins(hostL, partL, at, hostR, partR, geoms);
        if (!placement) continue;
        updates.set(`${target.seamKey}:${partR}`, {
          row: {
            ...target,
            sideA: target.sideA.map((anchor) =>
              withLayer({ ...anchor, placement }, source.sideA[0]),
            ),
            sideB: target.sideB.map((anchor) =>
              withLayer({ ...anchor, placement }, source.sideB[0]),
            ),
          },
          piece: partR,
        });
      }
      continue;
    }
    if (!isHandSeamKind(source.kind)) continue;
    for (const [own, other] of [
      [source.sideA, source.sideB],
      [source.sideB, source.sideA],
    ] as const) {
      for (const anchor of own) {
        if (geoms.get(anchor.piece)?.hand !== 'L') continue;
        const hand = decodeHandPlace(anchor.placement);
        const partner = other.find((candidate) => candidate.piece !== anchor.piece)?.piece;
        // A flag set without a move has no hand place; it still goes to the twin, the place stays.
        if (!partner || (!hand && !anchor.layer)) continue;
        const target = twinRowOf(stepRows, anchor.piece, partner, hand, geoms);
        if (!target || (hand && !target.place)) continue;
        const key = `${target.row.seamKey}:${target.twin}`;
        const placed = target.place
          ? withHandPlace(target.row, target.twin, target.place)
          : target.row;
        const twinLayer = (side: readonly EdgeAnchor[]) =>
          side.map((candidate) =>
            candidate.piece === target.twin ? withLayer(candidate, anchor) : candidate,
          );
        updates.set(key, {
          row: { ...placed, sideA: twinLayer(placed.sideA), sideB: twinLayer(placed.sideB) },
          piece: target.twin,
        });
      }
    }
  }
  return [...updates.values()];
}

export type TwinPose = { piece: string; host: string; placement: SeamPlacement; layer?: SeamLayer };

/** The right anchor takes the left anchor's under/over (or none). */
function withLayer(anchor: EdgeAnchor, left: EdgeAnchor | undefined): EdgeAnchor {
  return withSeamLayer(anchor, left?.layer);
}

/**
 * Right pieces of this step posed as the mirror of their left twins' stored poses (piece and host
 * both have a right twin here). Only on the owner's `mirror left` click; nothing calls it alone.
 */
export function mirrorLeftPoses(
  stepPieces: readonly string[],
  cardPoses: Iterable<StoredPose>,
  geoms: ReadonlyMap<string, PieceGeom>,
): TwinPose[] {
  const out = new Map<string, TwinPose>();
  for (const row of cardPoses) {
    const pose = poseOf(row);
    if (!pose || geoms.get(pose.piece)?.hand !== 'L') continue;
    const piece = rightTwinOf(pose.piece, stepPieces, geoms)?.key;
    const host = rightTwinOf(pose.host, stepPieces, geoms)?.key;
    if (!piece || !host) continue;
    const placement = mirroredOnTwins(pose.host, pose.piece, pose.placement, host, piece, geoms);
    const layer = row.sideA[0]?.layer;
    if (placement) out.set(piece, { piece, host, placement, ...(layer ? { layer } : {}) });
  }
  return [...out.values()];
}

export { cycleLayerHit, type LayerHit } from './pose-picking';

/**
 * One click on the canvas. An inner line (a slit, a placement line) is a host on its own: it takes
 * its side alone and drops the other side's edges of the same piece; an edge clicked next to a
 * picked line drops that line. Any piece of a block is a door, the base a patch was sewn on too.
 */
export function pickTarget<S extends PickSides>(
  sel: S,
  side: 'a' | 'b',
  id: string,
  isInner: (id: string) => boolean,
  pieceOf: (id: string) => string,
): S {
  const other = side === 'a' ? 'b' : 'a';
  if (sel[side].includes(id)) return { ...sel, [side]: sel[side].filter((x) => x !== id) };
  if (isInner(id)) {
    const host = pieceOf(id);
    return {
      ...sel,
      [side]: [id],
      [other]: sel[other].filter((x) => !isInner(x) && pieceOf(x) !== host),
    };
  }
  return { ...sel, [side]: [...sel[side].filter((x) => !isInner(x)), id] };
}
