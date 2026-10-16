// Browser side of the pattern export: lazy jsPDF + the FeatureMono the assembly sheet embeds,
// one export, one file saved. The menus call `downloadPatternExport` and show its warnings.
import {
  paperFontData,
  registerPaperFonts,
} from 'components/managers/tech-card/assembly-print/paper-pdf';
import type { PatternDrawing } from 'lib/pattern-export/drawing';
import { exportDrawing, type ExportFormatId } from 'lib/pattern-export/formats';

function saveBlob(blob: Blob, fileName: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  a.click();
  // Deferred: Safari/Firefox may not have started the download when click() returns.
  window.setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

/**
 * Build the drawing (it may need a download and a parse first), export it and save the file.
 * Resolves to the export's warnings — the caller decides how to show them.
 */
export async function downloadPatternExport(
  drawing: () => PatternDrawing | Promise<PatternDrawing>,
  format: ExportFormatId,
): Promise<string[]> {
  const [{ jsPDF }, fonts, d] = await Promise.all([
    import('jspdf'),
    paperFontData(),
    Promise.resolve().then(drawing),
  ]);
  const res = exportDrawing(d, format, {
    jsPDF,
    font: { family: 'FeatureMono', register: (pdf) => void registerPaperFonts(pdf, fonts) },
  });
  saveBlob(res.blob, res.fileName);
  return res.warnings;
}
