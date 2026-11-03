// THE LAYERS WINDOW, its pure half (L22, owner's mockup 03.11). A row is an input block of the step,
// the top row lies on top. Until the owner sets an order the rows follow the picture as it is painted,
// so what he sees on top is the top row and his first move is measured from it.

export type LayerWindowBlock = { key?: string; pieces: readonly string[] };
export type LayerWindowRow = { key: string; pieces: readonly string[] };
export type LayerMove = 'up' | 'down' | 'front' | 'back' | number;

/**
 * The rows, top first: the blocks with a piece on the picture. With an order the rule's own ranking
 * (a key no longer here is skipped, a new block goes on top); without one, each block at the height of
 * its highest piece as painted.
 */
export function windowRows(
  blocks: readonly LayerWindowBlock[],
  painted: readonly string[],
  order?: readonly string[],
): LayerWindowRow[] {
  const height = new Map(painted.map((piece, at) => [piece, at]));
  const drawn = new Map<string, LayerWindowRow>();
  for (const { key, pieces } of blocks)
    if (key && !drawn.has(key) && pieces.some((piece) => height.has(piece)))
      drawn.set(key, { key, pieces });
  const named = [...new Set(order ?? [])].filter((key) => drawn.has(key));
  if (named.length) {
    const others = [...drawn.keys()].filter((key) => !named.includes(key));
    return [...named, ...others].reverse().map((key) => drawn.get(key)!);
  }
  const top = ({ pieces }: LayerWindowRow) =>
    Math.max(...pieces.map((piece) => height.get(piece) ?? -1));
  return [...drawn.values()].sort((a, b) => top(b) - top(a));
}

/** The rows after a move, the same array when nothing moves. A number is the row's new place. */
export function moveRow(
  rows: readonly LayerWindowRow[],
  key: string,
  move: LayerMove,
): readonly LayerWindowRow[] {
  const from = rows.findIndex((row) => row.key === key);
  if (from < 0) return rows;
  const wanted =
    move === 'up'
      ? from - 1
      : move === 'down'
        ? from + 1
        : move === 'front'
          ? 0
          : move === 'back'
            ? rows.length - 1
            : move;
  const to = Math.max(0, Math.min(rows.length - 1, wanted));
  if (to === from) return rows;
  const next = rows.filter((row) => row.key !== key);
  next.splice(to, 0, rows[from]);
  return next;
}

/** What a step stores: its blocks bottom to top. */
export const orderOfRows = (rows: readonly LayerWindowRow[]) =>
  rows.map((row) => row.key).reverse();

/** The place a dragged row takes among the others, from their vertical middles, top first. */
export function dropPlace(middles: readonly number[], y: number): number {
  const at = middles.findIndex((middle) => y < middle);
  return at < 0 ? middles.length : at;
}
