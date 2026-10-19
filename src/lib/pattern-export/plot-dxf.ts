// One DXF file → the PlotDrawing the HP-GL writer takes, for the per-file «download as · PLT».
//
// Pieces come from the SAME parse the marker worker and the probes run (nesting/worker/parse-files
// `parseSheets`), never a second reader. Kept in its own module so the menu loads the parser only
// when someone actually asks for a PLT.
import { NEST_DEFAULTS } from 'lib/nesting/types';
import { parseSheets } from 'lib/nesting/worker/parse-files';
import type { PlotDrawing } from './hpgl';
import { pickCutLayer, plotFromPattern } from './plot-drawing';

/**
 * `cutLayer`: the card's contour layer when the caller knows it (dxf-geometry `index.contourLayer`).
 * A converter manifest's declared cut layer always wins over it: the file said so itself.
 */
export async function plotFromDxfBytes(
  bytes: ArrayBuffer,
  name: string,
  cutLayer?: string,
): Promise<PlotDrawing> {
  const parsed = await parseSheets([{ name, open: async () => bytes }], {
    unit: 'auto',
    tol: NEST_DEFAULTS.tol,
    tolChain: NEST_DEFAULTS.tolChain,
  });
  if (parsed.failedFiles > 0)
    throw new Error(parsed.warnings.join('; ') || 'the drawing could not be read');
  // Same rule as the PDF: a plot with pieces missing is worse than no plot.
  if (parsed.skippedBlocks > 0)
    throw new Error(
      `${parsed.skippedBlocks} block insert(s) of the drawing could not be read, so the PLT would be incomplete`,
    );
  if (parsed.pieces.length === 0) throw new Error('the drawing has no pieces');
  const declared = parsed.pieces.find((p) => p.manifest?.cutLayer)?.manifest?.cutLayer;
  const plot = plotFromPattern(parsed.pieces, {
    cutLayer: declared ?? (cutLayer || pickCutLayer(parsed.pieces)),
  });
  // Only the unit guess is the user's business here (the PLT is drawn at the size it implies);
  // chaining notes stay in the parse.
  const units = parsed.warnings.filter((w) => /units are not set/.test(w));
  return { ...plot, warnings: [...units, ...(plot.warnings ?? [])] };
}
