// RASTER ADAPTER (F11) — private types. The public surface (traceRaster / calibrate /
// extractRasterPdf / extractRasterImage) is re-exported from ./index.ts.
//
// Contract gap (reported in F11.md): types.ts §1 names `RasterCalibration` in the module map but
// does not define it, and `IRPage` has no slot for a per-page correction. Both live here until T0
// decides whether the wizard needs them on the wire.

import type { Affine, FileId, Mm, PageIndex, PtMm } from '../../types';

/** One decoded raster as the adapter sees it: pixels + where they sit on the page. */
export type RasterImage = {
  /** Row-major, top row first. 1 = gray, 3 = RGB, 4 = RGBA (alpha is composited over white). */
  data: Uint8Array | Uint8ClampedArray;
  width: number;
  height: number;
  channels: 1 | 3 | 4;
  /**
   * Pixel frame → page frame (mm, y-up). Pixel (u, v) is the CORNER grid: the centre of pixel
   * (col, row) is (col + 0.5, row + 0.5), v grows downwards.
   */
  pxToPage: Affine;
  /** Drawing-op index on the page (PDF paint op / 0 for a bare image file) — provenance `op`. */
  op: number;
};

/** One page to trace. Images are traced one at a time and released by the caller afterwards. */
export type RasterPageInput = {
  file: FileId;
  page: PageIndex;
  widthMm: Mm;
  heightMm: Mm;
  images: RasterImage[];
};

/** How a page is calibrated. */
export type RasterRef =
  /** A printed test square; `sideMm` undefined = guess from {25.4, 50, 50.8, 100, 101.6}. */
  | { kind: 'square'; sideMm?: Mm }
  /**
   * Reuse the SCANNER part of another page's calibration (stretch + skew = the upper-triangular
   * factor of its linear part). Rotation is per sheet of paper and is not inherited.
   */
  | { kind: 'inherit'; from: RasterCalibration }
  | { kind: 'none' };

export type RasterSquare = {
  page: PageIndex;
  /** Corners as traced (page frame, before correction), counter-clockwise from min-angle. */
  cornersMm: PtMm[];
  /** Mean of opposite sides, as traced. */
  measuredWMm: Mm;
  measuredHMm: Mm;
  /** Orientation of the "horizontal" pair vs the page x axis. */
  angleDeg: number;
  /** Deviation of the corner angle from 90°. */
  skewDeg: number;
  /** Side the square is declared to have (ref or the matched candidate). */
  sideMm: Mm;
  /** RMS of the 4 corners after the fitted affine, mm. */
  residualMm: Mm;
};

export type RasterCalibration = {
  method: 'test-square' | 'inherited' | 'none';
  /** Traced page frame → corrected page frame (true mm). Identity for 'none'. */
  affine: Affine;
  square: RasterSquare | null;
  /** 0..1: square with a declared/matched side 0.95, inherited 0.5, none 0. */
  confidence: number;
  notes: string[];
};

export type TraceOpts = {
  /** Douglas–Peucker tolerance on the traced centre line, mm. */
  simplifyMm: Mm;
  /** Ink strength (max channel absorption over paper, 0..255) for a pixel to count as ink. */
  inkLow: number;
  /** A connected ink component must reach this strength somewhere (hysteresis). */
  inkHigh: number;
  /** Max ink clusters before merging. */
  maxInks: number;
  /** Hue clusters closer than this (unit absorption direction distance) merge. */
  mergeDist: number;
  /** Clusters below this share of ink samples are folded into their nearest neighbour. */
  minInkShare: number;
  /** A hue class splits where a component is this many × stronger than the class so far. */
  strengthSplit: number;
  /** Line width above which a component is reported as a FILL (tile letters, blobs), mm. */
  fillWidthMm: Mm;
  /** Branches shorter than max(spurMm, 1.2 × line width) ending in a free end are pruned, mm. */
  spurMm: Mm;
  /** Components whose traced length is below this are dropped, mm. */
  minLengthMm: Mm;
  /** Sub-pixel centre-line refinement along the normal. */
  refine: boolean;
};

export const TRACE_DEFAULTS: TraceOpts = {
  simplifyMm: 0.1,
  inkLow: 40,
  inkHigh: 80,
  maxInks: 14,
  mergeDist: 0.12,
  minInkShare: 0.002,
  strengthSplit: 1.5,
  fillWidthMm: 1.0,
  spurMm: 0.6,
  minLengthMm: 0.5,
  refine: true,
};

/** One colour class found on a page (before the document-level merge). */
export type InkClass = {
  /** 1-based label in the label image. */
  label: number;
  /** Full-strength ink colour (median of core pixels). */
  rgb: [number, number, number];
  /** Hue: unit absorption direction (feature centroid). */
  dir: [number, number, number];
  /** Mean component strength (0..1 of 255) — splits black from pale grey of the same hue. */
  peak: number;
  /** Share of ink samples. */
  share: number;
};

/** Per-image numbers for the probe and the operator. */
export type TraceStats = {
  op: number;
  widthPx: number;
  heightPx: number;
  dpi: number;
  inks: InkClass[];
  components: number;
  polylines: number;
  ms: { paper: number; cluster: number; trace: number; total: number };
};
