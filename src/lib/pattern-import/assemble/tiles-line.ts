// assemble (F2) — the TILES LINE: one plain-text machine line our own 1:1 tiled export
// (lib/pattern-export/dxf-pdf.ts) prints on page 1 of the file, so a sparse drawing (a marker, a
// PLT → PDF) that has nothing recurring across its seams still re-imports at its true pitch:
//
//   GRBPWR-TILES v1 page=210x297mm step=180x267mm overlap=10mm grid=4x3 order=row origin=A1:top-left
//   … origin=A1:top-left skip=B2,C4      (when blank cells were not printed)
//
// mm with at most one decimal; grid = cols x rows of cells; order = row | col (the reading order
// of the pattern pages); origin = the printed label of the top-left tile (every tile keeps its own
// printed label: row letter + column number, B3 = 2nd row, 3rd column; "row:col" past 26 rows);
// skip = the labels of the blank cells that were not printed (comma-separated, no spaces). Pattern
// pages = cols x rows − skipped; page 1 (the map) is not one.
//
// The line is a DECLARATION, not evidence on its own (D3): group.ts uses it only when the file
// agrees with it independently (page size, page count against the grid, printed labels where the
// grid puts them, step + overlap within the page). A line that does not parse, or of a version
// this build does not know, is ignored with a warning — the measured path runs as before.

import type { IRPage, IRText } from 'lib/pattern-import/types';

import { cellLabelOf } from './labels';

export const TILES_TAG = 'GRBPWR-TILES';

export type TilesDecl = {
  v: 1;
  pageW: number;
  pageH: number;
  stepX: number;
  stepY: number;
  overlap: number;
  cols: number;
  rows: number;
  order: 'row' | 'col';
  /** Cell of the top-left tile in label terms (A1 → row 0, col 0; "2:3" → row 1, col 2). */
  origin: { row: number; col: number; text: string };
  /** Blank cells not printed, grid frame (top-left tile = 0, 0), with their labels. */
  skip: { row: number; col: number; text: string }[];
  /** The line as read (for the operator and the warnings). */
  text: string;
};

const NUM = String.raw`(\d{1,5}(?:\.\d)?)`;
const LBL = String.raw`(?:[A-Z]\d{1,3}|\d{1,3}:\d{1,3})`;
const LABEL = `(${LBL})`;
const V1 = new RegExp(
  String.raw`^${TILES_TAG} v1 page=${NUM}x${NUM}mm step=${NUM}x${NUM}mm overlap=${NUM}mm ` +
    String.raw`grid=(\d{1,3})x(\d{1,3}) order=(row|col) origin=${LABEL}:top-left` +
    String.raw`(?: skip=(${LBL}(?:,${LBL})*))?$`,
);
const HEAD = new RegExp(String.raw`^${TILES_TAG} v(\d+)\b`);

/** A printed tile label → its cell, in the importer's terms (assemble/labels.ts). */
export function labelCell(s: string): { row: number; col: number } | null {
  const ln = /^([A-Z])(\d{1,3})$/.exec(s);
  if (ln) return { row: ln[1].charCodeAt(0) - 65, col: +ln[2] - 1 };
  const rc = /^(\d{1,3}):(\d{1,3})$/.exec(s);
  if (rc && +rc[1] >= 1 && +rc[2] >= 1) return { row: +rc[1] - 1, col: +rc[2] - 1 };
  return null;
}

/**
 * One line of text → the declaration, a reason it is ignored, or null when it is not a tiles
 * line at all. Strict: every field in the contract's order, nothing else on the line.
 */
export function parseTilesLine(raw: string): { decl: TilesDecl } | { ignored: string } | null {
  const s = raw.replace(/\s+/g, ' ').trim();
  const head = HEAD.exec(s);
  if (!head)
    return s.startsWith(TILES_TAG) ? { ignored: `"${s}" is not a ${TILES_TAG} line` } : null;
  if (head[1] !== '1')
    return { ignored: `${TILES_TAG} v${head[1]}: version unknown to this build` };
  const m = V1.exec(s);
  if (!m) return { ignored: `"${s}" does not follow the ${TILES_TAG} v1 grammar` };
  const [pageW, pageH, stepX, stepY, overlap] = m.slice(1, 6).map(Number);
  const cols = +m[6];
  const rows = +m[7];
  const origin = labelCell(m[9]);
  if (!origin) return { ignored: `"${s}": origin ${m[9]} is not a tile label` };
  if (!(pageW > 0 && pageH > 0 && stepX > 0 && stepY > 0 && overlap >= 0 && cols > 0 && rows > 0))
    return { ignored: `"${s}": a size, step or grid is zero` };
  const skip: TilesDecl['skip'] = [];
  for (const t of m[10] ? m[10].split(',') : []) {
    const c = labelCell(t);
    const row = (c?.row ?? -1) - origin.row;
    const col = (c?.col ?? -1) - origin.col;
    if (!c || row < 0 || col < 0 || row >= rows || col >= cols)
      return { ignored: `"${s}": skipped cell ${t} is not a cell of the ${cols}x${rows} grid` };
    if (skip.some((k) => k.row === row && k.col === col))
      return { ignored: `"${s}": skipped cell ${t} named twice` };
    skip.push({ row, col, text: t });
  }
  if (skip.length >= cols * rows) return { ignored: `"${s}": every cell is skipped` };
  return {
    decl: {
      v: 1,
      pageW,
      pageH,
      stepX,
      stepY,
      overlap,
      cols,
      rows,
      order: m[8] as 'row' | 'col',
      origin: { ...origin, text: m[9] },
      skip,
      text: s,
    },
  };
}

/**
 * pdf.js may hand one written string over as several items (it splits where the glyph advance
 * jumps). The line is rebuilt from the items on the tag's baseline, left to right: a gap under a
 * fifth of the type size joins without a space.
 */
function lineFrom(start: IRText, texts: readonly IRText[]): string {
  const fs = start.fontSizeMm || 1;
  const rot = start.rotationDeg;
  const a = (rot * Math.PI) / 180;
  const ux = Math.cos(a);
  const uy = Math.sin(a);
  const along = (t: IRText) =>
    (t.anchor.x - start.anchor.x) * ux + (t.anchor.y - start.anchor.y) * uy;
  const off = (t: IRText) =>
    Math.abs(-(t.anchor.x - start.anchor.x) * uy + (t.anchor.y - start.anchor.y) * ux);
  const same = texts
    .filter(
      (t) =>
        Math.abs(t.rotationDeg - rot) < 1 &&
        off(t) < 0.3 * fs &&
        Math.abs(t.fontSizeMm - fs) < 0.15 * fs &&
        along(t) >= -0.01,
    )
    .sort((p, q) => along(p) - along(q));
  let out = '';
  let end = -Infinity;
  for (const t of same) {
    const st = along(t);
    if (out && st - end > 0.2 * fs) out += ' ';
    out += t.text;
    // the item's advance along the baseline (the line is written level or a quarter turn)
    end =
      st +
      Math.max(
        0,
        Math.abs(ux) >= Math.abs(uy) ? t.bbox.maxX - t.bbox.minX : t.bbox.maxY - t.bbox.minY,
      );
  }
  return out;
}

/**
 * The tiles line of a file: read on its FIRST page only (the contract). `decl` null with no
 * warning = no line (a foreign PDF); a line that is there but unusable is a warning.
 */
export function tilesLineOf(first: IRPage | undefined): {
  decl: TilesDecl | null;
  warnings: string[];
} {
  if (!first) return { decl: null, warnings: [] };
  const starts = first.texts.filter((t) => t.text.includes(TILES_TAG));
  if (!starts.length) return { decl: null, warnings: [] };
  const found: TilesDecl[] = [];
  const warnings: string[] = [];
  for (const t of starts) {
    const line = lineFrom(t, first.texts);
    const at = line.indexOf(TILES_TAG);
    const r = parseTilesLine(at >= 0 ? line.slice(at) : line);
    if (!r) continue;
    if ('ignored' in r) warnings.push(`tiles line ignored — ${r.ignored}`);
    else found.push(r.decl);
  }
  const distinct = new Set(found.map((d) => d.text));
  if (distinct.size > 1) {
    warnings.push(
      `tiles line ignored — page 1 prints ${distinct.size} different ${TILES_TAG} lines`,
    );
    return { decl: null, warnings };
  }
  return { decl: found[0] ?? null, warnings };
}

/** Page size agreement, mm (a PDF page box is written to 0.01 pt; paper sizes are exact). */
const PAGE_TOL_MM = 0.5;

export type TilesHold =
  | {
      ok: true;
      /** Cell of every page (same order as the input), grid frame (top-left tile = 0, 0). */
      cells: { row: number; col: number }[];
      /** The declared blank cells (not printed), grid frame. */
      blank: { row: number; col: number }[];
      /** How the file agreed (for the warnings / the operator). */
      agreed: string;
    }
  | { ok: false; why: string };

/**
 * D3: hold the declaration to the file. Every check is the FILE's, independent of the line:
 *   • every tile page has the declared paper size (no page turned against it);
 *   • step + overlap fit the page;
 *   • the pattern pages are exactly the grid's cells minus the skipped (blank) ones;
 *   • every readable printed label sits on the cell the grid gives that page, in reading order —
 *     and with cells skipped EVERY page must print its label (the order alone no longer says).
 * Any disagreement: the line is not used (the caller warns and measures as before).
 */
export function holdTilesDecl(d: TilesDecl, pages: IRPage[], turned: IRPage[]): TilesHold {
  const name = (c: { row: number; col: number }) =>
    d.origin.text.includes(':')
      ? `${c.row + d.origin.row + 1}:${c.col + d.origin.col + 1}`
      : `${String.fromCharCode(65 + c.row + d.origin.row)}${c.col + d.origin.col + 1}`;
  if (turned.length)
    return {
      ok: false,
      why: `${turned.length} tile page(s) are turned against the declared paper`,
    };
  const off = pages.find(
    (p) =>
      Math.abs(p.widthMm - d.pageW) > PAGE_TOL_MM || Math.abs(p.heightMm - d.pageH) > PAGE_TOL_MM,
  );
  if (off)
    return {
      ok: false,
      why: `page ${off.page + 1} is ${off.widthMm.toFixed(1)} x ${off.heightMm.toFixed(1)} mm, the line says ${d.pageW} x ${d.pageH}`,
    };
  if (d.stepX + d.overlap > d.pageW + 0.05 || d.stepY + d.overlap > d.pageH + 0.05)
    return {
      ok: false,
      why: `step + overlap (${d.stepX}+${d.overlap} x ${d.stepY}+${d.overlap}) exceed the page`,
    };
  const skipped = new Set(d.skip.map((c) => `${c.row},${c.col}`));
  // The printed cells in the declared reading order (blank cells skipped).
  const printed: { row: number; col: number }[] = [];
  for (let k = 0; k < d.cols * d.rows; k++) {
    const c =
      d.order === 'row'
        ? { row: Math.floor(k / d.cols), col: k % d.cols }
        : { row: k % d.rows, col: Math.floor(k / d.rows) };
    if (!skipped.has(`${c.row},${c.col}`)) printed.push(c);
  }
  const n = pages.length;
  if (n !== printed.length)
    return {
      ok: false,
      why:
        `${n} pattern pages, the line declares ${printed.length} ` +
        `(${d.cols}x${d.rows} grid${d.skip.length ? ` minus ${d.skip.length} skipped` : ''})`,
    };
  const labels = pages
    .map(cellLabelOf)
    .map((l) =>
      l ? { row: l.row - d.origin.row, col: l.col - d.origin.col, text: l.text.trim() } : null,
    );
  for (const [i, l] of labels.entries())
    if (l && (l.row !== printed[i].row || l.col !== printed[i].col))
      return {
        ok: false,
        why: `page ${pages[i].page + 1} prints "${l.text}" where the grid puts ${name(printed[i])}`,
      };
  const readable = labels.filter(Boolean).length;
  // With cells skipped the reading order alone no longer names a page's cell: the labels must.
  if (d.skip.length && readable < n)
    return {
      ok: false,
      why: `${d.skip.length} cell(s) skipped and ${n - readable} page(s) print no tile label to say which cells the rest are`,
    };
  return {
    ok: true,
    cells: printed,
    blank: d.skip.map((c) => ({ row: c.row, col: c.col })),
    agreed:
      `${n} pages = ${d.cols}x${d.rows} grid${d.skip.length ? ` minus ${d.skip.length} blank (${d.skip.map((c) => c.text).join(',')})` : ''}, ` +
      `paper ${d.pageW}x${d.pageH} mm, ${readable}/${n} labels on their cells`,
  };
}
