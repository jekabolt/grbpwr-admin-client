import type { PieceGeom } from 'lib/assembly-skeleton/types';
import { codeName } from 'lib/pattern-import/dictionary/codes';
import type { StoredSeam } from 'lib/seams';

import { decodeHandPlace, isHandSeamKind, twinRowOf, withHandPlace } from './step-hand';
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
  if (groups.length >= 2) return groups[0].pieces.includes(piece) ? 'a' : 'b';
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

/** Card codes the import dictionary does not list (card 6 names pieces SLV_L, FLP_L_MAIN). */
const PIECE_WORD_ALIASES: Readonly<Record<string, string>> = { SLV: 'sleeve', FLP: 'placket' };
const SIDE_TOKENS = new Set(['L', 'R', 'F', 'B', 'MAIN', '#']);

/** A piece name in plain words: `SLV_L` → «sleeve», `FLP_L_MAIN` → «placket»; prose names stay. */
export function pieceWord(name: string): string {
  if (!/[_]|^[A-Z0-9#]+$/.test(name)) return name.trim().toLowerCase();
  const words = name
    .split(/[_\s]+/)
    .filter((token) => token && !SIDE_TOKENS.has(token.toUpperCase()) && !/^\d+$/.test(token))
    .map((token) => {
      const code = token.toUpperCase();
      return PIECE_WORD_ALIASES[code] ?? (codeName(code) || token.toLowerCase());
    });
  return [...new Set(words)].join(' ');
}

/** Piece words plus a useful edge word, never an input/unit name. */
export function seamSideName(
  ids: readonly string[],
  geoms: ReadonlyMap<string, PieceGeom>,
  nameOf: (piece: string) => string,
  pieceOf: (id: string) => string,
): string {
  const names = [...new Set(ids.map((id) => pieceWord(nameOf(pieceOf(id)))).filter(Boolean))];
  const edge = seamEdgeWord(ids, geoms);
  return [...names, edge].filter(Boolean).join(' ');
}

export type TwinMirrorUpdate = { row: StoredSeam; piece: string };

/**
 * Copy explicit left-hand edge placements onto matching rows in this step. Surface/free-pose
 * placements deliberately stay out: their spatial fields have no hand-placement interpretation.
 */
export function mirrorLeftRows(
  stepRows: readonly StoredSeam[],
  cardRows: readonly StoredSeam[],
  geoms: ReadonlyMap<string, PieceGeom>,
): TwinMirrorUpdate[] {
  const updates = new Map<string, TwinMirrorUpdate>();
  for (const source of cardRows) {
    if (!isHandSeamKind(source.kind)) continue;
    for (const [own, other] of [
      [source.sideA, source.sideB],
      [source.sideB, source.sideA],
    ] as const) {
      for (const anchor of own) {
        if (geoms.get(anchor.piece)?.hand !== 'L') continue;
        const hand = decodeHandPlace(anchor.placement);
        const partner = other.find((candidate) => candidate.piece !== anchor.piece)?.piece;
        if (!hand || !partner) continue;
        const target = twinRowOf(stepRows, anchor.piece, partner, hand, geoms);
        if (!target?.place) continue;
        const key = `${target.row.seamKey}:${target.twin}`;
        updates.set(key, {
          row: withHandPlace(target.row, target.twin, target.place),
          piece: target.twin,
        });
      }
    }
  }
  return [...updates.values()];
}

export type LayerHit = { piece: string; at: readonly [number, number] };

/** Top-first hit, cycling down while repeated clicks stay within `tolerance` screen pixels. */
export function cycleLayerHit(
  hits: readonly string[],
  at: readonly [number, number],
  previous: LayerHit | null,
  tolerance = 4,
): string | null {
  if (!hits.length) return null;
  const sameSpot =
    previous && Math.hypot(at[0] - previous.at[0], at[1] - previous.at[1]) <= tolerance;
  const previousIndex = sameSpot ? hits.indexOf(previous.piece) : -1;
  return hits[(previousIndex + 1) % hits.length];
}

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
