/**
 * A proposal the model could not back (it won on length alone, or barely): shown as the best guess,
 * with the user's own pick one click away. A proposal without the flag reads as sure.
 */
export function isGuess(p: object | null | undefined): boolean {
  return !!p && (p as { confident?: boolean }).confident === false;
}

type PickSides = { a: readonly string[]; b: readonly string[] };

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
