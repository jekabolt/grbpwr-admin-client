// Browser side of the pattern export: lazy jsPDF + the FeatureMono the assembly sheet embeds,
// one export, one file saved. The menus call these and show the warnings they resolve to.
import {
  paperFontData,
  registerPaperFonts,
} from 'components/managers/tech-card/assembly-print/paper-pdf';
import { downloadFile } from 'lib/pattern-export/download';
import type { PatternDrawing } from 'lib/pattern-export/drawing';
import type { PdfFont } from 'lib/pattern-export/dxf-pdf';
import { exportDrawing, exportPlot, type PdfFormatId } from 'lib/pattern-export/formats';
import type { PlotDrawing } from 'lib/pattern-export/hpgl';

/** jsPDF + the font every 1:1 PDF of the app embeds (also the PLT → PDF dialog). */
export async function pdfDeps(): Promise<{ jsPDF: typeof import('jspdf').jsPDF; font: PdfFont }> {
  const [{ jsPDF }, fonts] = await Promise.all([import('jspdf'), paperFontData()]);
  return {
    jsPDF,
    font: { family: 'FeatureMono', register: (pdf) => void registerPaperFonts(pdf, fonts) },
  };
}

/**
 * Build the drawing (it may need a download and a parse first), export it and save the file.
 * Resolves to the export's warnings — the caller decides how to show them.
 */
export async function downloadPatternExport(
  drawing: () => PatternDrawing | Promise<PatternDrawing>,
  format: PdfFormatId,
): Promise<string[]> {
  const [deps, d] = await Promise.all([pdfDeps(), Promise.resolve().then(drawing)]);
  const res = exportDrawing(d, format, deps);
  downloadFile(res.blob, res.fileName);
  return res.warnings;
}

/** The plotter file: build the plot, write HP-GL, save. Resolves to the warnings. */
export async function downloadPlotExport(
  plot: () => Promise<{ plot: PlotDrawing; title: string }>,
): Promise<string[]> {
  const { plot: p, title } = await plot();
  const res = exportPlot(p, title);
  downloadFile(res.blob, res.fileName);
  return res.warnings;
}

/** The stored all-size DXF as an AAMA base DXF + RUL pair in one ZIP, or the DXF itself when it cannot be. */
export async function downloadRulExport(
  original: () => Promise<{ blob: Blob; fileName: string }>,
  title?: string,
): Promise<string[]> {
  const [{ exportDxfRulArchive }, source] = await Promise.all([
    import('lib/pattern-export/rul'),
    original(),
  ]);
  let res;
  try {
    res = await exportDxfRulArchive(await source.blob.arrayBuffer(), source.fileName, title);
  } catch {
    // Not expressible as one RUL table (one size, a piece missing in a size): the graded DXF as is.
    downloadFile(source.blob, source.fileName);
    return [];
  }
  downloadFile(res.blob, res.fileName);
  return res.warnings;
}
