// pieces/grade (H1) — how many sizes the sheet draws, and who says so.
//
// The solver's safety rests on this number: with more than one size expected, a piece whose ranks
// are not PROVEN is refused, never closed as one size. Sources that encode their sizes (legend,
// layers, colours, files, DXF blocks) say it themselves; a one-size file that names its size
// ("BLAZER M") says 1; otherwise the operator's answer, otherwise the card's run (the converter
// runs inside the card, whose sizes are the garment's). Unknown (null) → the sizes step asks.
import type { CardSize, ExpectedSizes, SizeRun } from 'lib/pattern-import/types';

export function expectedSizes(
  run: SizeRun,
  card: readonly CardSize[],
  drawnSizes?: number | null,
): ExpectedSizes | null {
  if (run.encoding !== 'single' && run.sizes.length > 1) return { n: run.sizes.length, from: 'source' };
  if (drawnSizes != null && drawnSizes >= 1) return { n: Math.round(drawnSizes), from: 'operator' };
  if (run.encoding === 'single' && run.sizes.length === 1 && run.sizes[0].label.trim())
    return { n: 1, from: 'source' };
  if (card.length >= 1) return { n: card.length, from: 'card' };
  return null;
}
