// 1:1 TILING of a sheet onto small paper (A4 by default) — pure geometry, no PDF.
//
// Kept apart from the writer on purpose: a DXF → PDF path should converge on this same plan, so
// "where does page B2 start" has one answer for every 1:1 print in the app.
//
// The plan, in sheet mm (y-down, origin top-left of the drawing):
//   • the printable WINDOW of a page is paper − 2·margin; the drawing is never scaled
//   • neighbouring windows OVERLAP by `overlapMm`: tile (c, r) shows the sheet from
//     (c·stepX, r·stepY), step = window − overlap — the overlap strip is printed on both pages
//   • registration marks (⊕) sit in the MIDDLE of every overlap strip, at each row/column middle
//     and at every strip crossing — the operator lays B over A until the marks coincide
//   • columns are letters (A, B, … Z, AA…), rows numbers from 1: the top-left page is A1
//   • orientation: whichever of portrait/landscape needs fewer pages (portrait on a tie)

export const PAPER_MM = { A4: [210, 297], A3: [297, 420] } as const;
export type PaperName = keyof typeof PAPER_MM;

export type TilePlanOptions = {
  paper?: PaperName;
  /** Unprintable printer edge + room for page labels, mm. */
  marginMm?: number;
  /** Overlap between neighbouring windows, mm. */
  overlapMm?: number;
};

export type TileRect = {
  col: number;
  row: number;
  /** "B2" */
  label: string;
  /** Window origin in SHEET mm: page point = sheet point − (sx, sy) + (margin, margin). */
  sx: number;
  sy: number;
};

export type TilePlan = {
  paper: PaperName;
  pageW: number;
  pageH: number;
  landscape: boolean;
  margin: number;
  overlap: number;
  /** Printable window, mm. */
  winW: number;
  winH: number;
  cols: number;
  rows: number;
  tiles: TileRect[];
  /** Registration mark centres, sheet mm. */
  marks: { x: number; y: number }[];
};

export function colLabel(c: number): string {
  let s = '';
  let n = c + 1;
  while (n > 0) {
    const m = (n - 1) % 26;
    s = String.fromCharCode(65 + m) + s;
    n = Math.floor((n - 1) / 26);
  }
  return s;
}

export const tileLabel = (col: number, row: number) => `${colLabel(col)}${row + 1}`;

function count(len: number, win: number, ov: number): number {
  if (len <= win + 1e-6) return 1;
  return Math.ceil((len - ov) / (win - ov) - 1e-9);
}

/** Refused before any array is allocated: a pattern is never this big, a wrong unit or a damaged file is. */
export const TILE_MAX_PAGES = 500;
export const TILE_MAX_SIDE_MM = 20_000;

export function planTiles(sheetW: number, sheetH: number, opts: TilePlanOptions = {}): TilePlan {
  if (!(Number.isFinite(sheetW) && Number.isFinite(sheetH) && sheetW > 0 && sheetH > 0))
    throw new Error(`cannot tile a sheet of ${sheetW} × ${sheetH} mm`);
  if (sheetW > TILE_MAX_SIDE_MM || sheetH > TILE_MAX_SIDE_MM)
    throw new Error(
      `${Math.round(sheetW)} × ${Math.round(sheetH)} mm is over the ${TILE_MAX_SIDE_MM / 1000} m tiling limit — check the units`,
    );
  const paper = opts.paper ?? 'A4';
  const margin = opts.marginMm ?? 10;
  const [pw, ph] = PAPER_MM[paper];
  const variant = (landscape: boolean) => {
    const [pageW, pageH] = landscape ? [ph, pw] : [pw, ph];
    const winW = pageW - 2 * margin;
    const winH = pageH - 2 * margin;
    const overlap = Math.min(opts.overlapMm ?? 10, winW / 3, winH / 3);
    const cols = count(sheetW, winW, overlap);
    const rows = count(sheetH, winH, overlap);
    return { pageW, pageH, winW, winH, overlap, cols, rows, landscape };
  };
  const P = variant(false);
  const L = variant(true);
  const v = L.cols * L.rows < P.cols * P.rows ? L : P;
  // Counted, not allocated: the cap holds before a single tile or mark exists.
  if (v.cols * v.rows > TILE_MAX_PAGES)
    throw new Error(
      `${v.cols * v.rows} ${paper} pages (${v.cols} × ${v.rows}) — over the ${TILE_MAX_PAGES}-page limit; print it on a plotter as one sheet`,
    );
  const stepX = v.winW - v.overlap;
  const stepY = v.winH - v.overlap;

  const tiles: TileRect[] = [];
  for (let row = 0; row < v.rows; row++)
    for (let col = 0; col < v.cols; col++)
      tiles.push({ col, row, label: tileLabel(col, row), sx: col * stepX, sy: row * stepY });

  // Marks: middles of the overlap strips × middles of each window span (clamped to the sheet).
  const stripX = Array.from({ length: v.cols - 1 }, (_, c) => (c + 1) * stepX + v.overlap / 2);
  const stripY = Array.from({ length: v.rows - 1 }, (_, r) => (r + 1) * stepY + v.overlap / 2);
  // Middle of the part of each window the drawing actually reaches.
  const midX = Array.from(
    { length: v.cols },
    (_, c) => (c * stepX + Math.min(sheetW, c * stepX + v.winW)) / 2,
  );
  const midY = Array.from(
    { length: v.rows },
    (_, r) => (r * stepY + Math.min(sheetH, r * stepY + v.winH)) / 2,
  );
  const marks: { x: number; y: number }[] = [];
  for (const x of stripX) for (const y of midY) marks.push({ x, y });
  for (const y of stripY) for (const x of midX) marks.push({ x, y });
  for (const x of stripX) for (const y of stripY) marks.push({ x, y });

  return {
    paper,
    pageW: v.pageW,
    pageH: v.pageH,
    landscape: v.landscape,
    margin,
    overlap: v.overlap,
    winW: v.winW,
    winH: v.winH,
    cols: v.cols,
    rows: v.rows,
    tiles,
    marks,
  };
}
