import type { PieceGeom } from 'lib/assembly-skeleton/types';
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
