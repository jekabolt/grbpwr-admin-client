// RASTER ADAPTER (F11) — scans and raster PDFs → canonical IR. See 08-CONTRACT §2 and F11.md.
//
// Public API:
//   traceRaster(page, calib, opts)  one decoded page → IRPage (calibrated when calib is given)
//   calibrate(page, ref)            traced page + reference (test square / inherit) → RasterCalibration
//   applyCalibration(page, calib)   pure re-map of a traced page
//   extractRasterPdf / extractRasterImage   ExtractFn (contract shape)
//   extract*Detailed                same, plus per-page calibrations, stats and the ink classes

import type { IRPage } from '../../types';
import { tracePageSync } from './trace';
import type { RasterCalibration, RasterPageInput, TraceOpts } from './types';

export { calibrate, applyCalibration, findRasterSquares, SQUARE_CANDIDATES_MM } from './calibrate';
export {
  extractRasterPdf,
  extractRasterPdfDetailed,
  extractRasterImage,
  extractRasterImageDetailed,
  harmonizeInks,
} from './extract';
export type { RasterExtractConfig, RasterExtractResult, InkClassSummary } from './extract';
export {
  setRasterPdfjsLoader,
  declaredDpi,
  scanPlacement,
  rasterFromPdfjs,
  decodeWithBitmap,
} from './decode';
export type { ImageDecoder, DecodedImage } from './decode';
export { tracePageSync, traceImage } from './trace';
export * from './types';

/** Contract signature: trace one page (pixels already decoded), optionally calibrated. */
export async function traceRaster(
  page: RasterPageInput,
  calib: RasterCalibration | null,
  opts: Partial<TraceOpts> = {},
): Promise<IRPage> {
  return tracePageSync(page, calib, opts).page;
}
