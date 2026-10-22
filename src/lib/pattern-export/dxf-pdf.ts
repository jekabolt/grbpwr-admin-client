// A pattern drawing → PDF at 1:1, so a pattern can be printed without a plotter: either ONE sheet
// of the drawing's own size (for a print shop / a wide-format printer) or a set of tiled pages on
// office paper that are trimmed and taped together.
//
// The tiled file is written to be read back by our own importer (lib/pattern-import), so its
// conventions are THAT reader's, not a style choice:
//   • every path that crosses a tile is drawn WHOLE and clipped to the page window — the importer
//     recovers the tile pitch from a path that recurs on two pages (assemble/recurrence.ts);
//   • each tile carries one big «B3» label (row letter, column number), ≥ 5 % of the short page
//     side, as real text (assemble/labels.ts LETTER_NUM) — it is the only such text on the page;
//   • the test square is a closed axis-aligned 100 mm square with a «test square 10 cm x 10 cm»
//     label (adapters/pdf/scale.ts: dimension + keyword → confidence 0.97);
//   • marks (trim and lap lines, corner crosses) are LIGHT GREY and sit at the same page position on
//     every tile — the importer files them as page furniture, never as pattern lines;
//   • the overlap is 10 mm, inside the importer's stitch window (≤ 30 mm).
//
// Pure: no DOM, no fonts, no jsPDF import. The renderer takes the jsPDF constructor (and,
// optionally, a font) from the caller, so the same code runs in the browser and in a node probe.
import type { DrawingStroke, PatternDrawing } from './drawing';

/** PDF page limit: 14 400 pt per side (same rule as assembly-print/paper-pdf.ts PDF_MAX_MM). */
export const PDF_PAGE_LIMIT_MM = Math.floor((14400 * 25.4) / 72);
/** Unprintable edge of an office printer + room for the page header. */
export const TILE_MARGIN_MM = 10;
/** Tiles overlap by this much: the strip where the next page is laid and aligned. */
export const TILE_OVERLAP_MM = 10;
export const TEST_SQUARE_MM = 100;
/**
 * THE limits of every 1:1 print in the app (DXF, marker, PLT): past them a tiled PDF is not a sane
 * way to print the pattern — a wrong unit or a damaged file is. Refused, pointing at PLT.
 */
export const TILED_MAX_PAGES = 500;
export const TILED_MAX_SIDE_MM = 20_000;

/**
 * One size check for every source, run before anything per page is planned. `hint` names what
 * the caller can check (e.g. a PLT's plotter units); the message is otherwise the same for all.
 */
export function assertPrintableSize(wMm: number, hMm: number, hint = ''): void {
  if (!(Number.isFinite(wMm) && Number.isFinite(hMm)) || wMm < 0 || hMm < 0)
    throw new Error('the drawing has no finite size — the file is damaged');
  if (wMm > TILED_MAX_SIDE_MM || hMm > TILED_MAX_SIDE_MM)
    throw new Error(
      `too large to print (${(wMm / 1000).toFixed(1)} x ${(hMm / 1000).toFixed(1)} m, limit ${TILED_MAX_SIDE_MM / 1000} m a side)${hint ? ` ${hint}` : ''} — use PLT for a plotter`,
    );
}

export const TILE_PAPERS = {
  A4: [210, 297],
  A3: [297, 420],
  Letter: [215.9, 279.4],
} as const;
export type TilePaper = keyof typeof TILE_PAPERS;

export type PdfLayout = { kind: 'sheet' } | { kind: 'tiles'; paper: TilePaper };

/** Stroke widths per role, mm. One pen per role: the importer separates roles by pen. */
export const DRAWING_PEN_MM: Record<DrawingStroke['kind'], number> = {
  cut: 0.35,
  notch: 0.25,
  line: 0.15,
};
/** Grey of the marks: min(R,G,B) ≥ 140 is «light grey» to the importer (chains/classify.ts). */
const MARK = 170;
const MARK_W = 0.2;
const LABEL_GREY = 190;
/** Tile label: ≥ 5 % of the short side of the page (A4: 10.5 mm ≈ 30 pt). */
const labelPt = (pw: number, ph: number) => Math.ceil(((Math.min(pw, ph) * 0.06) / 25.4) * 72);
const PT_MM = 25.4 / 72;

export type Mark =
  | {
      k: 'path';
      pts: [number, number][];
      closed?: boolean;
      w: number;
      /** 0 = black … 255 = white. */
      grey?: number;
      dash?: [number, number];
      fill?: boolean;
    }
  | {
      k: 'text';
      x: number;
      y: number;
      s: string;
      pt: number;
      bold?: boolean;
      grey?: number;
      align?: 'left' | 'center' | 'right';
      angle?: number;
    };

export type PlanPage = {
  w: number;
  h: number;
  /** The drawing on this page: drawing point v → v + (tx, ty); clipped to `clip` when tiled. */
  content: { tx: number; ty: number; clip: [number, number, number, number] | null } | null;
  marks: Mark[];
  role: 'map' | 'tile' | 'sheet';
  /** Tile label (e.g. «B3»); tiles only. */
  label?: string;
};

export type TileCell = { row: number; col: number; label: string; blank: boolean };

export type PdfPlan = {
  layout: PdfLayout;
  pages: PlanPage[];
  /**
   * Tiled only: the full grid, blank cells included (they are on the map but not printed). Cell
   * (r, c) shows the drawing window x ∈ [c·sx − ox, c·sx − ox + cw], y likewise — previews draw
   * the grid from these numbers, never from a second plan.
   */
  grid?: {
    rows: number;
    cols: number;
    cells: TileCell[];
    paper: TilePaper;
    sx: number;
    sy: number;
    cw: number;
    ch: number;
    ox: number;
    oy: number;
  };
  fileName: string;
  warnings: string[];
};

// ── geometry helpers ─────────────────────────────────────────────────────────────────────────

type Box = { x0: number; y0: number; x1: number; y1: number };

function boxOf(pts: readonly [number, number][]): Box {
  let x0 = Infinity;
  let y0 = Infinity;
  let x1 = -Infinity;
  let y1 = -Infinity;
  for (const [x, y] of pts) {
    if (x < x0) x0 = x;
    if (x > x1) x1 = x;
    if (y < y0) y0 = y;
    if (y > y1) y1 = y;
  }
  return { x0, y0, x1, y1 };
}

const overlaps = (a: Box, b: Box) => a.x0 <= b.x1 && a.x1 >= b.x0 && a.y0 <= b.y1 && a.y1 >= b.y0;

/** Does segment p–q cross (or lie in) box b? Liang–Barsky. */
function segHitsBox(p: [number, number], q: [number, number], b: Box): boolean {
  let t0 = 0;
  let t1 = 1;
  const dx = q[0] - p[0];
  const dy = q[1] - p[1];
  const edges: [number, number][] = [
    [-dx, p[0] - b.x0],
    [dx, b.x1 - p[0]],
    [-dy, p[1] - b.y0],
    [dy, b.y1 - p[1]],
  ];
  for (const [pp, qq] of edges) {
    if (pp === 0) {
      if (qq < 0) return false;
      continue;
    }
    const r = qq / pp;
    if (pp < 0) {
      if (r > t1) return false;
      if (r > t0) t0 = r;
    } else {
      if (r < t0) return false;
      if (r < t1) t1 = r;
    }
  }
  return true;
}

function strokeHitsBox(s: DrawingStroke, b: Box): boolean {
  const n = s.pts.length;
  if (n === 1) return segHitsBox(s.pts[0], s.pts[0], b);
  for (let i = 1; i < n; i++) if (segHitsBox(s.pts[i - 1], s.pts[i], b)) return true;
  return s.closed && n > 2 && segHitsBox(s.pts[n - 1], s.pts[0], b);
}

const rectPath = (x: number, y: number, w: number, h: number): [number, number][] => [
  [x, y],
  [x + w, y],
  [x + w, y + h],
  [x, y + h],
];

/** Row letter: A…Z, then the importer's «row:col» form takes over (see tileLabel). */
const rowLetter = (r: number) => String.fromCharCode(65 + r);
export const tileLabel = (row: number, col: number, rows: number) =>
  rows <= 26 ? `${rowLetter(row)}${col + 1}` : `${row + 1}:${col + 1}`;

// ── shared furniture: test square + ruler + notes ───────────────────────────────────────────

/** 10 cm test square and a 10 cm ruler (cm numbers, mm ticks), top-left at (x, y). 100 × 112 mm. */
function scaleBlock(x: number, y: number): Mark[] {
  const S = TEST_SQUARE_MM;
  const out: Mark[] = [
    { k: 'path', pts: rectPath(x, y, S, S), closed: true, w: 0.3 },
    {
      k: 'text',
      x: x + S / 2,
      y: y + S / 2 - 3,
      s: 'test square 10 cm x 10 cm',
      pt: 9,
      align: 'center',
    },
    {
      k: 'text',
      x: x + S / 2,
      y: y + S / 2 + 3,
      s: 'should measure 100 mm',
      pt: 7,
      align: 'center',
    },
  ];
  // Ruler under the square: baseline + ticks hanging down, 1 cm numbers.
  const ry = y + S + 4;
  out.push({
    k: 'path',
    pts: [
      [x, ry],
      [x + S, ry],
    ],
    w: 0.2,
  });
  for (let mm = 0; mm <= S; mm++) {
    const len = mm % 10 === 0 ? 4 : mm % 5 === 0 ? 2.5 : 1.5;
    out.push({
      k: 'path',
      pts: [
        [x + mm, ry],
        [x + mm, ry + len],
      ],
      w: 0.12,
    });
    if (mm % 10 === 0)
      out.push({ k: 'text', x: x + mm, y: ry + 7, s: String(mm / 10), pt: 6, align: 'center' });
  }
  out.push({ k: 'text', x: x + S + 2, y: ry + 7, s: 'cm', pt: 6 });
  return out;
}

function textLines(x: number, y: number, lines: string[], pt: number, bold = false): Mark[] {
  const lead = pt * PT_MM * 1.45;
  return lines.map((s, i) => ({ k: 'text', x, y: y + i * lead, s, pt, bold }));
}

const PRINT_NOTE = 'PRINT AT 100 % (ACTUAL SIZE) - turn off "fit to page" / "scale to fit"';

const safeStem = (s: string) => s.replace(/[\\/:*?"<>|]+/g, '_').trim() || 'pattern';

// ── one sheet ────────────────────────────────────────────────────────────────────────────────

/** Strip under the drawing: test square, ruler and notes. */
const SHEET_FOOT_MM = 130;
const SHEET_MIN_W = 260;

const sheetPageOf = (d: Pick<PatternDrawing, 'w' | 'h'>) => ({
  w: Math.max(d.w + 2 * TILE_MARGIN_MM, SHEET_MIN_W),
  h: d.h + 2 * TILE_MARGIN_MM + SHEET_FOOT_MM,
});

/** Does the drawing fit ONE PDF page (with its margin and the test-square strip)? */
export function fitsOneSheet(d: Pick<PatternDrawing, 'w' | 'h'>): boolean {
  const { w, h } = sheetPageOf(d);
  return w <= PDF_PAGE_LIMIT_MM && h <= PDF_PAGE_LIMIT_MM;
}

function planSheet(d: PatternDrawing): PdfPlan | null {
  const M = TILE_MARGIN_MM;
  const { w, h } = sheetPageOf(d);
  if (!fitsOneSheet(d)) return null;
  const footY = M + d.h + 12;
  const marks: Mark[] = [
    {
      k: 'text',
      x: M,
      y: M - 3,
      s: `${d.title} - 1:1 - ${Math.round(d.w)} x ${Math.round(d.h)} mm - ${PRINT_NOTE}`,
      pt: 8,
    },
    ...scaleBlock(M, footY),
    ...textLines(
      M + TEST_SQUARE_MM + 14,
      footY + 4,
      [
        d.title,
        `drawing ${(d.w / 10).toFixed(1)} x ${(d.h / 10).toFixed(1)} cm, scale 1:1`,
        PRINT_NOTE,
        'check the test square before cutting',
        'solid heavy line = cutting line; thin lines = internal / sewing lines',
        ...d.warnings.map((x) => `! ${x}`),
      ],
      8,
    ),
  ];
  return {
    layout: { kind: 'sheet' },
    pages: [
      {
        w,
        h,
        role: 'sheet',
        content: { tx: M + (w - 2 * M - d.w) / 2, ty: M, clip: null },
        marks,
      },
    ],
    fileName: `${safeStem(d.title)}-1to1-${Math.round(w)}x${Math.round(h)}mm.pdf`,
    warnings: [...d.warnings],
  };
}

// ── tiles ────────────────────────────────────────────────────────────────────────────────────

function planTiles(d: PatternDrawing, paper: TilePaper, extraWarnings: string[] = []): PdfPlan {
  const [pw, ph] = TILE_PAPERS[paper];
  const M = TILE_MARGIN_MM;
  const OV = TILE_OVERLAP_MM;
  const cw = pw - 2 * M;
  const ch = ph - 2 * M;
  const sx = cw - OV;
  const sy = ch - OV;
  // The size is checked from the extent alone, BEFORE anything per page is allocated: a
  // mis-scaled DXF (mm read as inches) would otherwise plan tens of thousands of pages.
  assertPrintableSize(d.w, d.h);
  const cols = Math.max(1, Math.ceil((d.w - cw) / sx - 1e-9) + 1);
  const rows = Math.max(1, Math.ceil((d.h - ch) / sy - 1e-9) + 1);
  if (rows * cols > TILED_MAX_PAGES)
    throw new Error(
      `too large for a tiled PDF (${rows * cols} pages of ${paper}, limit ${TILED_MAX_PAGES}) — use PLT for a plotter`,
    );
  // The drawing sits centred in the grid: spare paper splits evenly between the edges.
  const ox = ((cols - 1) * sx + cw - d.w) / 2;
  const oy = ((rows - 1) * sy + ch - d.h) / 2;
  const boxes = d.strokes.map((s) => boxOf(s.pts));
  const LPT = labelPt(pw, ph);
  // Window of cell (r, c) in drawing coordinates.
  const winOf = (r: number, c: number): Box => ({
    x0: c * sx - ox,
    y0: r * sy - oy,
    x1: c * sx - ox + cw,
    y1: r * sy - oy + ch,
  });

  // Pass 1: which cells have line work. Pages are only built for those (pass 2).
  const cells: TileCell[] = [];
  const blankAt = new Uint8Array(rows * cols);
  for (let r = 0; r < rows; r++)
    for (let c = 0; c < cols; c++) {
      // Blank = no line work on the whole PAGE (window + margin), not just the window: the
      // importer places a page by its full rectangle, so a line in a skipped page's margin band —
      // drawn whole on the neighbour that owns it — would read as running into a missing page.
      const w = winOf(r, c);
      const page: Box = { x0: w.x0 - M, y0: w.y0 - M, x1: w.x1 + M, y1: w.y1 + M };
      const blank = !d.strokes.some((s, i) => overlaps(boxes[i], page) && strokeHitsBox(s, page));
      blankAt[r * cols + c] = blank ? 1 : 0;
      cells.push({ row: r, col: c, label: tileLabel(r, c, rows), blank });
    }
  const printedAt = (r: number, c: number) =>
    r >= 0 && r < rows && c >= 0 && c < cols && !blankAt[r * cols + c];

  // MARKS NEVER REACH INTO A BLANK CELL. The page margin and the overlap strip of a tile lie
  // over its neighbours' windows, so a trim line, a lap line, a corner cross or a crop tick drawn
  // there lands, in sheet terms, inside the neighbour. When that neighbour is a blank page that
  // was deliberately not printed, the importer sees line ends running into a page it does not have
  // and reports it missing. Every mark segment (all are axis-aligned) is cut against the page
  // rectangles (window + margin) of the blank cells around (r, c); only the rest is kept.
  const clearOfBlankCells = (marks: Mark[], r: number, c: number): Mark[] => {
    const pad = M; // the blank cell's whole page rectangle, not only its window
    const blanks: Box[] = [];
    for (let rr = r - 1; rr <= r + 1; rr++)
      for (let cc = c - 1; cc <= c + 1; cc++)
        if (rr >= 0 && rr < rows && cc >= 0 && cc < cols && blankAt[rr * cols + cc])
          // Page coordinates of that cell's window, as seen from page (r, c).
          blanks.push({
            x0: M + (cc - c) * sx - pad,
            y0: M + (rr - r) * sy - pad,
            x1: M + (cc - c) * sx + cw + pad,
            y1: M + (rr - r) * sy + ch + pad,
          });
    if (blanks.length === 0) return marks;
    const out: Mark[] = [];
    for (const m of marks) {
      if (m.k !== 'path' || m.pts.length !== 2) {
        out.push(m);
        continue;
      }
      const [[ax, ay], [bx, by]] = m.pts;
      const vertical = ax === bx;
      if (!vertical && ay !== by) {
        out.push(m);
        continue;
      }
      // 1-D interval along the segment, minus each blank window it runs through.
      let spans: [number, number][] = [
        vertical ? [Math.min(ay, by), Math.max(ay, by)] : [Math.min(ax, bx), Math.max(ax, bx)],
      ];
      for (const b of blanks) {
        const across = vertical ? ax : ay;
        const [lo, hi] = vertical ? [b.x0, b.x1] : [b.y0, b.y1];
        if (across < lo || across > hi) continue;
        const [s0, s1] = vertical ? [b.y0, b.y1] : [b.x0, b.x1];
        spans = spans.flatMap(([u, v]): [number, number][] => {
          if (v <= s0 || u >= s1) return [[u, v]];
          const keep: [number, number][] = [];
          if (u < s0) keep.push([u, s0]);
          if (v > s1) keep.push([s1, v]);
          return keep;
        });
      }
      for (const [u, v] of spans)
        if (v - u > 0.5)
          out.push({
            ...m,
            pts: vertical
              ? [
                  [ax, u],
                  [ax, v],
                ]
              : [
                  [u, ay],
                  [v, ay],
                ],
          });
    }
    return out;
  };

  const tiles: PlanPage[] = [];
  for (let r = 0; r < rows; r++)
    for (let c = 0; c < cols; c++) {
      if (!printedAt(r, c)) continue;
      const win = winOf(r, c);
      const label = tileLabel(r, c, rows);
      const marks: Mark[] = [];
      const grey = MARK;
      const dash: [number, number] = [2, 1.5];
      // Trim lines: left and top edges of the window, where an earlier page meets this one.
      if (printedAt(r, c - 1))
        marks.push({
          k: 'path',
          pts: [
            [M, M - 4],
            [M, M + ch + 4],
          ],
          w: MARK_W,
          grey,
          dash,
        });
      if (printedAt(r - 1, c))
        marks.push({
          k: 'path',
          pts: [
            [M - 4, M],
            [M + cw + 4, M],
          ],
          w: MARK_W,
          grey,
          dash,
        });
      // Lap lines: where the NEXT page's trimmed edge is laid (the overlap starts here).
      if (printedAt(r, c + 1))
        marks.push({
          k: 'path',
          pts: [
            [M + sx, M],
            [M + sx, M + ch],
          ],
          w: MARK_W,
          grey,
          dash: [0.6, 1.2],
        });
      if (printedAt(r + 1, c))
        marks.push({
          k: 'path',
          pts: [
            [M, M + sy],
            [M + cw, M + sy],
          ],
          w: MARK_W,
          grey,
          dash: [0.6, 1.2],
        });
      // Corner crosses on the cell corners — the points where four pages meet. Same sheet point on
      // every neighbour, so after laying the pages the crosses sit on top of each other.
      for (const x of [M, M + sx])
        for (const y of [M, M + sy]) {
          marks.push({
            k: 'path',
            pts: [
              [x - 4, y],
              [x + 4, y],
            ],
            w: 0.25,
            grey,
          });
          marks.push({
            k: 'path',
            pts: [
              [x, y - 4],
              [x, y + 4],
            ],
            w: 0.25,
            grey,
          });
        }
      // Window corner ticks in the margin: the crop marks of the printable area.
      for (const [x, y, ddx, ddy] of [
        [M, M, -1, -1],
        [M + cw, M, 1, -1],
        [M, M + ch, -1, 1],
        [M + cw, M + ch, 1, 1],
      ] as const) {
        marks.push({
          k: 'path',
          pts: [
            [x + ddx * 1.5, y],
            [x + ddx * 6, y],
          ],
          w: MARK_W,
          grey,
        });
        marks.push({
          k: 'path',
          pts: [
            [x, y + ddy * 1.5],
            [x, y + ddy * 6],
          ],
          w: MARK_W,
          grey,
        });
      }
      // THE label: one big «B3» per page, inside the window, light grey so lines read through it.
      marks.push({
        k: 'text',
        x: M + 3,
        y: M + 3 + LPT * PT_MM * 0.75,
        s: label,
        pt: LPT,
        bold: true,
        grey: LABEL_GREY,
      });
      // Header and neighbour hints, small, in the margins (never the «B3» form on its own).
      // Physical page number (page 1 is the map); filled in once the blank cells are known.
      marks.push({
        k: 'text',
        x: M + 8,
        y: M - 3,
        s: `${label} - page {PAGE} of {PAGES} - ${paper} - ${d.title} - 1:1, print at 100 %`,
        pt: 6.5,
      });
      // Hints only toward pages that are printed: a blank neighbour has no paper to lay.
      const nb = (rr: number, cc: number) => (printedAt(rr, cc) ? tileLabel(rr, cc, rows) : null);
      const up = nb(r - 1, c);
      const down = nb(r + 1, c);
      const left = nb(r, c - 1);
      const right = nb(r, c + 1);
      if (up)
        marks.push({
          k: 'text',
          x: M + cw / 2,
          y: M - 3,
          s: `^ ${up} above`,
          pt: 7,
          align: 'center',
          bold: true,
        });
      if (down)
        marks.push({
          k: 'text',
          x: M + cw / 2,
          y: ph - M + 5,
          s: `v ${down} below - lay its top edge on the dotted line`,
          pt: 7,
          align: 'center',
          bold: true,
        });
      if (left)
        marks.push({
          k: 'text',
          x: M - 3,
          y: M + ch / 2,
          s: `< ${left} left`,
          pt: 7,
          align: 'center',
          angle: 90,
          bold: true,
        });
      if (right)
        marks.push({
          k: 'text',
          x: pw - M + 5,
          y: M + ch / 2,
          s: `${right} right >`,
          pt: 7,
          align: 'center',
          angle: 90,
          bold: true,
        });
      tiles.push({
        w: pw,
        h: ph,
        role: 'tile',
        label,
        content: { tx: M - win.x0, ty: M - win.y0, clip: [M, M, cw, ch] },
        marks: clearOfBlankCells(marks, r, c),
      });
    }

  const printed = tiles.length;
  tiles.forEach((t, i) => {
    for (const m of t.marks)
      if (m.k === 'text')
        m.s = m.s.replace('{PAGE}', String(i + 2)).replace('{PAGES}', String(printed + 1));
  });
  const warnings = [...extraWarnings, ...d.warnings];
  const map = mapPage(d, paper, { rows, cols, cells, sx, sy, cw, ch, ox, oy, printed });
  return {
    layout: { kind: 'tiles', paper },
    pages: [map, ...tiles],
    grid: { rows, cols, cells, paper, sx, sy, cw, ch, ox, oy },
    fileName: `${safeStem(d.title)}-1to1-${paper}-${printed}tiles.pdf`,
    warnings,
  };
}

/** Page 1: what this is, how to print and tape it, the test square, and the map of the pages. */
function mapPage(
  d: PatternDrawing,
  paper: TilePaper,
  g: {
    rows: number;
    cols: number;
    cells: TileCell[];
    sx: number;
    sy: number;
    cw: number;
    ch: number;
    ox: number;
    oy: number;
    printed: number;
  },
): PlanPage {
  const [pw, ph] = TILE_PAPERS[paper];
  const M = TILE_MARGIN_MM;
  const marks: Mark[] = [];
  marks.push({ k: 'text', x: M, y: M + 6, s: d.title, pt: 14, bold: true });
  const notes = [
    `pattern at 1:1 - ${(d.w / 10).toFixed(1)} x ${(d.h / 10).toFixed(1)} cm - ${g.printed} pages of ${paper} (${g.rows} rows x ${g.cols} columns${g.printed < g.rows * g.cols ? `, ${g.rows * g.cols - g.printed} blank pages not printed` : ''})`,
    PRINT_NOTE,
    'measure the test square below: it must be exactly 10 cm. If not, fix the printer scale first.',
    `pages overlap by ${TILE_OVERLAP_MM} mm. Trim each page along its dashed line (left and top),`,
    'lay the trimmed edge on the dotted line of the page before it, match the grey crosses, tape.',
    'heavy line = cutting line; thin lines = sewing / internal lines, grain, notches.',
    ...d.warnings.map((x) => `! ${x}`),
  ];
  marks.push(...textLines(M, M + 13, notes, 7.5));
  // The machine line (PATTERN-IMPORT's TILESTEP contract): our importer takes the tile pitch from
  // it when the file agrees (page size, pattern-page count = grid minus skip, labels where the grid
  // puts them) — a sparse drawing has no line recurring across a seam to measure it from.
  const mm = (v: number) => String(Math.round(v * 10) / 10);
  const skip = g.cells.filter((c) => c.blank).map((c) => c.label);
  marks.push({
    k: 'text',
    x: M,
    y: ph - 4,
    pt: 5,
    s:
      `GRBPWR-TILES v1 page=${mm(pw)}x${mm(ph)}mm step=${mm(g.sx)}x${mm(g.sy)}mm overlap=${TILE_OVERLAP_MM}mm` +
      ` grid=${g.cols}x${g.rows} order=row origin=A1:top-left` +
      (skip.length ? ` skip=${skip.join(',')}` : ''),
  });
  const top = M + 13 + notes.length * 7.5 * PT_MM * 1.45 + 4;

  // Map box: what is left above the scale block (100 mm square + ruler ≈ 115 mm).
  const scaleH = 118;
  const boxW = pw - 2 * M;
  const boxH = ph - M - scaleH - 6 - top;
  const gridW = (g.cols - 1) * g.sx + g.cw;
  const gridH = (g.rows - 1) * g.sy + g.ch;
  const k = Math.min(boxW / gridW, boxH / gridH);
  const mx = M + (boxW - gridW * k) / 2;
  const my = top + (boxH - gridH * k) / 2;
  // Thumbnail: cutting lines only, grey (furniture to the importer, a picture to a person). A
  // drawing without cutting lines (a foreign PLT plotted with one pen) shows all its lines.
  const hasCut = d.strokes.some((s) => s.kind === 'cut');
  for (const s of d.strokes) {
    if (hasCut && s.kind !== 'cut') continue;
    marks.push({
      k: 'path',
      pts: s.pts.map(([x, y]) => [mx + (x + g.ox) * k, my + (y + g.oy) * k] as [number, number]),
      closed: s.closed,
      w: 0.15,
      grey: 150,
    });
  }
  const cellPt = Math.max(4, Math.min(9, ((Math.min(g.sx, g.sy) * k) / PT_MM) * 0.35));
  for (const cell of g.cells) {
    const x = mx + cell.col * g.sx * k;
    const y = my + cell.row * g.sy * k;
    // The cell a page OWNS (its window minus the overlap with the next page); the last row and
    // column own the whole window.
    const w = (cell.col === g.cols - 1 ? g.cw : g.sx) * k;
    const h = (cell.row === g.rows - 1 ? g.ch : g.sy) * k;
    marks.push({
      k: 'path',
      pts: rectPath(x, y, w, h),
      closed: true,
      w: cell.blank ? 0.12 : 0.25,
      grey: cell.blank ? 200 : 0,
      ...(cell.blank ? { dash: [1, 1] as [number, number] } : {}),
    });
    marks.push({
      k: 'text',
      x: x + w / 2,
      y: y + h / 2 + cellPt * PT_MM * 0.35,
      s: cell.label,
      pt: cellPt,
      bold: !cell.blank,
      grey: cell.blank ? 175 : 0,
      align: 'center',
    });
  }
  marks.push(...scaleBlock(M, ph - M - scaleH));
  marks.push(
    ...textLines(
      M + TEST_SQUARE_MM + 8,
      ph - M - scaleH + 6,
      [
        'assembly map: one cell per page,',
        'labelled in the page corner (B3 =',
        'row B, column 3). Grey dashed cells',
        'have no lines and are not printed.',
      ],
      7,
    ),
  );
  return { w: pw, h: ph, role: 'map', content: null, marks };
}

/** Lay out a drawing as PDF pages. A sheet beyond the PDF page limit falls back to A4 tiles. */
export function planPdf(d: PatternDrawing, layout: PdfLayout): PdfPlan {
  assertPrintableSize(d.w, d.h);
  if (layout.kind === 'sheet') {
    const sheet = planSheet(d);
    if (sheet) return sheet;
    return planTiles(d, 'A4', [
      `the drawing is larger than a PDF page can be (${PDF_PAGE_LIMIT_MM} mm) — tiled on A4 instead`,
    ]);
  }
  return planTiles(d, layout.paper);
}

// ── rendering ───────────────────────────────────────────────────────────────────────────────

type JsPdf = InstanceType<typeof import('jspdf').jsPDF>;
type JsPdfCtor = typeof import('jspdf').jsPDF;

/** A font registered on the document by the caller; Helvetica (built in, Latin only) otherwise. */
export type PdfFont = { family: string; register: (pdf: JsPdf) => void };

const gray = (v: number | undefined) => {
  const g = Math.max(0, Math.min(255, Math.round(v ?? 0)));
  return [g, g, g] as const;
};

function drawPath(
  pdf: JsPdf,
  pts: readonly [number, number][],
  closed: boolean,
  tx: number,
  ty: number,
  fill = false,
) {
  if (pts.length === 0) return;
  pdf.moveTo(pts[0][0] + tx, pts[0][1] + ty);
  for (let i = 1; i < pts.length; i++) pdf.lineTo(pts[i][0] + tx, pts[i][1] + ty);
  if (closed) pdf.close();
  if (fill) pdf.fill();
  else pdf.stroke();
}

function drawMarks(pdf: JsPdf, marks: readonly Mark[], family: string) {
  for (const m of marks) {
    if (m.k === 'path') {
      const [r, g, b] = gray(m.grey);
      pdf.setDrawColor(r, g, b);
      pdf.setFillColor(r, g, b);
      pdf.setLineWidth(m.w);
      pdf.setLineDashPattern(m.dash ? [...m.dash] : [], 0);
      drawPath(pdf, m.pts, !!m.closed, 0, 0, !!m.fill);
      pdf.setLineDashPattern([], 0);
    } else {
      const [r, g, b] = gray(m.grey);
      pdf.setTextColor(r, g, b);
      pdf.setFont(family, m.bold ? 'bold' : 'normal');
      pdf.setFontSize(m.pt);
      if (m.angle) {
        // jsPDF aligns rotated text along the PAGE x axis, not along the text — centre it here.
        const a = (m.angle * Math.PI) / 180;
        const shift =
          m.align === 'center'
            ? pdf.getTextWidth(m.s) / 2
            : m.align === 'right'
              ? pdf.getTextWidth(m.s)
              : 0;
        pdf.text(m.s, m.x - Math.cos(a) * shift, m.y + Math.sin(a) * shift, {
          baseline: 'alphabetic',
          angle: m.angle,
        });
      } else pdf.text(m.s, m.x, m.y, { align: m.align ?? 'left', baseline: 'alphabetic' });
    }
  }
  pdf.setDrawColor(0, 0, 0);
  pdf.setFillColor(0, 0, 0);
  pdf.setTextColor(0, 0, 0);
}

function drawContent(pdf: JsPdf, d: PatternDrawing, page: PlanPage, family: string) {
  const c = page.content;
  if (!c) return;
  let win: Box | null = null;
  if (c.clip) {
    pdf.saveGraphicsState();
    pdf.rect(c.clip[0], c.clip[1], c.clip[2], c.clip[3], null);
    pdf.clip();
    pdf.discardPath();
    // The window in drawing coordinates (+ a hair) — strokes outside it are not written at all.
    win = {
      x0: c.clip[0] - c.tx - 1,
      y0: c.clip[1] - c.ty - 1,
      x1: c.clip[0] + c.clip[2] - c.tx + 1,
      y1: c.clip[1] + c.clip[3] - c.ty + 1,
    };
  }
  pdf.setDrawColor(0, 0, 0);
  pdf.setLineJoin('round');
  pdf.setLineCap('round');
  // Internals first, cutting lines on top.
  for (const kind of ['line', 'notch', 'cut'] as const) {
    pdf.setLineWidth(DRAWING_PEN_MM[kind]);
    let dashed = false;
    for (const s of d.strokes) {
      if (s.kind !== kind || s.pts.length < 2) continue;
      // Drawn WHOLE (not cut at the window): the importer finds the tile pitch from a path that
      // recurs, unchanged, on two pages.
      if (win && !(overlaps(boxOf(s.pts), win) && strokeHitsBox(s, win))) continue;
      const dash = s.dash && s.dash.length ? s.dash : null;
      if (dash || dashed) {
        pdf.setLineDashPattern(dash ? [...dash] : [], 0);
        dashed = !!dash;
      }
      drawPath(pdf, s.pts, s.closed, c.tx, c.ty);
    }
    if (dashed) pdf.setLineDashPattern([], 0);
  }
  pdf.setLineJoin('miter');
  pdf.setLineCap('butt');
  pdf.setFont(family, 'normal');
  pdf.setFontSize(9);
  pdf.setTextColor(0, 0, 0);
  for (const l of d.labels) {
    if (l.sizeMm != null) {
      // A placed text (PLT LB): baseline-left, its own size and angle. It reaches far from its
      // anchor when rotated, so only what is clearly elsewhere is culled; the clip does the rest.
      const reach = l.sizeMm * (l.s.length + 2);
      if (
        win &&
        (l.x > win.x1 + reach ||
          l.x < win.x0 - reach ||
          l.y > win.y1 + reach ||
          l.y < win.y0 - reach)
      )
        continue;
      pdf.setFontSize(l.sizeMm / PT_MM);
      pdf.text(l.s, l.x + c.tx, l.y + c.ty, { angle: l.angle ?? 0, baseline: 'alphabetic' });
      pdf.setFontSize(9);
      continue;
    }
    if (win && (l.x < win.x0 || l.x > win.x1 || l.y < win.y0 || l.y > win.y1)) continue;
    pdf.text(l.s, l.x + c.tx, l.y + c.ty, { align: 'center', baseline: 'middle' });
  }
  if (c.clip) pdf.restoreGraphicsState();
}

/** Write the plan with jsPDF. Returns the document; the caller saves or reads its bytes. */
export function renderPdf(
  JsPDF: JsPdfCtor,
  d: PatternDrawing,
  plan: PdfPlan,
  font?: PdfFont,
): JsPdf {
  const first = plan.pages[0];
  const orient = (p: PlanPage) => (p.w > p.h ? 'landscape' : 'portrait');
  const pdf = new JsPDF({
    orientation: orient(first),
    unit: 'mm',
    format: [first.w, first.h],
    compress: true,
  });
  let family = 'helvetica';
  if (font) {
    font.register(pdf);
    family = font.family;
  }
  pdf.setProperties({ title: d.title, subject: 'pattern at 1:1', creator: 'grbpwr admin' });
  plan.pages.forEach((p, i) => {
    if (i > 0) pdf.addPage([p.w, p.h], orient(p));
    drawContent(pdf, d, p, family);
    drawMarks(pdf, p.marks, family);
  });
  return pdf;
}
