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

/**
 * The side one EDGE click goes to. An edge already in hand keeps its side (a click shrinks or drops
 * it there). A piece closed on itself — a dart, a sleeve's underarm — has nobody else to open side 2:
 * while side 1 holds only this piece and side 2 nothing, its next edge opens side 2, unless the input
 * has other pieces and the edge runs on from side 1 (a run that grows). Later edges of that piece
 * join the side they run on from; otherwise the input rule of `sideForClick` decides.
 */
export function sideForTarget(
  id: string,
  groups: readonly { pieces: readonly string[] }[],
  picked: PickSides,
  pieceOf: (id: string) => string,
  touches: (x: string, y: string) => boolean,
): 'a' | 'b' {
  if (picked.b.includes(id)) return 'b';
  if (picked.a.includes(id)) return 'a';
  const piece = pieceOf(id);
  const side = sideForClick(piece, groups, picked, pieceOf);
  // Steps of several inputs keep input-owned sides: a piece sewn to itself is a one-input step.
  if (groups.length >= 2 || side !== 'a' || !picked.a.length) return side;
  if (!picked.a.every((x) => pieceOf(x) === piece)) return side;
  const nextToA = picked.a.some((x) => touches(x, id));
  if (!picked.b.length) {
    const input = groups.find((group) => group.pieces.includes(piece));
    const alone = !input || input.pieces.every((key) => key === piece);
    return !alone && nextToA ? 'a' : 'b';
  }
  const nextToB = picked.b.some((x) => pieceOf(x) === piece && touches(x, id));
  return nextToB && !nextToA ? 'b' : 'a';
}

/** Two edge targets of one piece meet end to end (a chain counts by its members). */
export function edgesTouch(
  x: string,
  y: string,
  geoms: ReadonlyMap<string, PieceGeom>,
  pieceOf: (id: string) => string,
): boolean {
  const piece = pieceOf(x);
  if (piece !== pieceOf(y)) return false;
  const geom = geoms.get(piece);
  const n = geom?.rs.length ?? 0;
  if (!geom || !n) return false;
  const members = (target: string) => {
    const at = target.lastIndexOf('#');
    if (at < 0) return [];
    const ks = target.slice(at + 1).split('+');
    return geom.edges.filter((edge) => ks.some((k) => edge.id === `${piece}#${k}`));
  };
  const xs = members(x);
  const ys = members(y);
  const meet = (p: number, q: number) => ((p % n) + n) % n === ((q % n) + n) % n;
  return xs.some((ex) => ys.some((ey) => meet(ex.e, ey.s) || meet(ey.e, ex.s)));
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
