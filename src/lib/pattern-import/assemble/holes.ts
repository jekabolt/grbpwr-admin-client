// assemble · UXHOOKS — missing tile cells accepted as BLANK pages ("holes").
//
// A cell the grid says exists but no file provides (`Sheet.missing`, sheet.ts `missingCells`)
// blocks the sheet step: the drawing that runs into it is cut there. The operator may answer "these
// are blank pages" (`acceptMissing`, the wizard's `sheet-accept-missing`); the autopilot may only
// on TWO evidences that the hole holds no pattern (D5, `holeAutoEvidence`). An accepted cell moves
// from `missing` to `holes`; nothing is drawn into it and nothing is closed across it — the fill
// still runs on the drawing as it is, and `pieces/holes.ts holeGuard` turns every piece one of
// whose lines the hole cuts back into the leak it is (D3). A refused placement stays refused:
// accepting holes never touches `Sheet.refused`.
//
// Geometry, per missing cell (drawing frame): `box` = where the page would lie (its paper, from the
// lattice of its group's placed pages); `open` = the part of `box` no neighbouring page's paper
// covers. Lines cut by the hole end inside `box` (in the overlap strip the neighbour repeats).
import type {
  BoxMm,
  IRPath,
  MissingCell,
  PagePose,
  HoleCell,
  Sheet,
  SheetAcceptMissing,
  SheetHole,
} from 'lib/pattern-import/types';

/** Line ends this close outside a cell's paper still end on it (mm). */
export const HOLE_END_TOL_MM = 1;

const grow = (b: BoxMm, m: number): BoxMm => ({
  minX: b.minX - m,
  minY: b.minY - m,
  maxX: b.maxX + m,
  maxY: b.maxY + m,
});
const inBox = (b: BoxMm, p: { x: number; y: number }) =>
  p.x >= b.minX && p.x <= b.maxX && p.y >= b.minY && p.y <= b.maxY;
const overlaps = (a: BoxMm, b: BoxMm) =>
  a.minX < b.maxX && a.maxX > b.minX && a.minY < b.maxY && a.maxY > b.minY;

/** A pose's paper rectangle in the drawing frame. */
export function poseBox(p: Pick<PagePose, 'toSheet' | 'widthMm' | 'heightMm'>): BoxMm {
  const m = p.toSheet;
  const xs: number[] = [];
  const ys: number[] = [];
  for (const [x, y] of [
    [0, 0],
    [p.widthMm, 0],
    [0, p.heightMm],
    [p.widthMm, p.heightMm],
  ]) {
    xs.push(m.a * x + m.c * y + m.e);
    ys.push(m.b * x + m.d * y + m.f);
  }
  return {
    minX: Math.min(...xs),
    minY: Math.min(...ys),
    maxX: Math.max(...xs),
    maxY: Math.max(...ys),
  };
}

const median = (v: number[]) => {
  const s = [...v].sort((a, b) => a - b);
  return s[s.length >> 1];
};

/**
 * Where the page of (row, col) would lie, from the placed pages of its group (the same file):
 * the lattice pitch measured between placed neighbours (rows go down), the nearest placed page's
 * size and turn. `open` = the box less the paper of its four direct neighbours. Null when the
 * group has no placed page with a cell.
 */
export function cellGeometry(
  poses: readonly PagePose[],
  file: string | undefined,
  row: number,
  col: number,
): { box: BoxMm; open: BoxMm | null } | null {
  const ps = poses.filter(
    (p) => p.row !== undefined && p.col !== undefined && (file == null || p.file === file),
  );
  if (!ps.length) return null;
  const at = new Map(ps.map((p) => [`${p.row},${p.col}`, p]));
  const rx: number[] = [];
  const ry: number[] = [];
  const bx: number[] = [];
  const by: number[] = [];
  for (const p of ps) {
    const r = at.get(`${p.row},${(p.col as number) + 1}`);
    if (r) {
      rx.push(r.toSheet.e - p.toSheet.e);
      ry.push(r.toSheet.f - p.toSheet.f);
    }
    const b = at.get(`${(p.row as number) + 1},${p.col}`);
    if (b) {
      bx.push(b.toSheet.e - p.toSheet.e);
      by.push(b.toSheet.f - p.toSheet.f);
    }
  }
  let ref = ps[0];
  let best = Infinity;
  for (const p of ps) {
    const d = Math.abs((p.row as number) - row) + Math.abs((p.col as number) - col);
    if (d < best) {
      best = d;
      ref = p;
    }
  }
  const right = rx.length ? { x: median(rx), y: median(ry) } : { x: ref.widthMm, y: 0 };
  const below = bx.length ? { x: median(bx), y: median(by) } : { x: 0, y: -ref.heightMm };
  const dc = col - (ref.col as number);
  const dr = row - (ref.row as number);
  const box = poseBox({
    ...ref,
    toSheet: {
      ...ref.toSheet,
      e: ref.toSheet.e + dc * right.x + dr * below.x,
      f: ref.toSheet.f + dc * right.y + dr * below.y,
    },
  });
  const open = { ...box };
  const nb = (r: number, c: number) => {
    const p = at.get(`${r},${c}`);
    return p ? poseBox(p) : null;
  };
  const L = nb(row, col - 1);
  const R = nb(row, col + 1);
  const T = nb(row - 1, col);
  const B = nb(row + 1, col);
  if (L) open.minX = Math.max(open.minX, L.maxX);
  if (R) open.maxX = Math.min(open.maxX, R.minX);
  if (T) open.maxY = Math.min(open.maxY, T.minY);
  if (B) open.minY = Math.max(open.minY, B.maxY);
  return { box, open: open.minX < open.maxX && open.minY < open.maxY ? open : null };
}

/**
 * The tile grid of sheet `k` as one key (a hole answer is bound to it): every tile page with the
 * cell it sits on. Other pages, or the same pages on another grid (a scale, a mask edit, a hand
 * grid that re-registers them), are another key — the answer is asked again.
 */
export function holePagesKey(
  sheet: Pick<Sheet, 'poses' | 'parts'> | null | undefined,
  k: number,
): string {
  if (!sheet) return '';
  const part = sheet.parts?.find((p) => p.sheet === k);
  const on = part ? new Set(part.pages.map((p) => `${p.file}:${p.page}`)) : null;
  const poses = sheet.parts?.length && !part ? [] : sheet.poses;
  return poses
    .filter((p) => !on || on.has(`${p.file}:${p.page}`))
    .map((p) => `${p.file}:${p.page}@${p.row ?? '-'},${p.col ?? '-'}`)
    .sort()
    .join(',');
}

/**
 * The cells of sheet `k` accepted NOW (materialised `Sheet.holes`, each with its file and who
 * accepted it) — what a new answer for that sheet keeps. Never the stored input: an answer the
 * worker dropped as stale is not given again under a new stamp.
 */
export const heldCells = (sheet: Pick<Sheet, 'holes'> | null | undefined, k: number): HoleCell[] =>
  (sheet?.holes ?? [])
    .filter((h) => h.sheet === k)
    .map((h) => ({
      row: h.row,
      col: h.col,
      ...(h.file != null ? { file: h.file } : {}),
      origin: h.origin,
    }));

const ends = (p: IRPath) =>
  p.closed || p.pts.length < 2 ? [] : [p.pts[0], p.pts[p.pts.length - 1]];

/**
 * The evidence the sheet step and the autopilot read, per missing cell: drawn lines ending inside
 * it, whether its uncovered part lies outside the sheet's line work. Masked lines (background) are
 * not drawing. Cells without geometry are left as they are.
 */
export function missingEvidence<C extends MissingCell>(
  sheet: Pick<Sheet, 'paths' | 'parts'>,
  cells: readonly C[],
): C[] {
  if (!cells.length) return [...cells];
  const live = sheet.paths.filter((p) => !p.background && p.pts.length > 0);
  // the part a path starts on (composite.ts partAt, kept here: sheet.ts imports this module)
  const sheetOf = (p: IRPath) => {
    let best: number | null = null;
    let bd = Infinity;
    for (const q of sheet.parts ?? []) {
      const d = Math.max(q.box.minX - p.pts[0].x, 0, p.pts[0].x - q.box.maxX);
      if (d < bd) {
        bd = d;
        best = q.sheet;
      }
    }
    return best;
  };
  const lineBox = new Map<number | null, BoxMm>();
  for (const p of live) {
    const k = sheet.parts?.length ? sheetOf(p) : null;
    const b = lineBox.get(k) ?? {
      minX: Infinity,
      minY: Infinity,
      maxX: -Infinity,
      maxY: -Infinity,
    };
    for (const v of p.pts) {
      if (v.x < b.minX) b.minX = v.x;
      if (v.y < b.minY) b.minY = v.y;
      if (v.x > b.maxX) b.maxX = v.x;
      if (v.y > b.maxY) b.maxY = v.y;
    }
    lineBox.set(k, b);
  }
  return cells.map((c) => {
    if (!c.box) return c;
    const zone = grow(c.box, HOLE_END_TOL_MM);
    let lineEnds = 0;
    for (const p of live) for (const v of ends(p)) if (inBox(zone, v)) lineEnds++;
    const lb = lineBox.get(sheet.parts?.length ? c.sheet ?? 0 : null);
    const outside = !!c.open && (!lb || !Number.isFinite(lb.minX) || !overlaps(c.open, lb));
    return { ...c, lineEnds, outside };
  });
}

const cellKey = (sheet: number, row: number, col: number, file?: string) =>
  `${sheet}:${row}:${col}${file != null ? `:${file}` : ''}`;

/**
 * The accepted cells moved from `missing` to `holes`. An answer whose sheet's pages changed since
 * it was given (`pages` ≠ `holePagesKey` now) is dropped; a cell the answer names that is not
 * missing now is ignored. `refused` is never touched.
 */
export function acceptMissing(
  sheet: Sheet,
  accepts: readonly SheetAcceptMissing[] | undefined,
): Sheet {
  if (!accepts?.length || !sheet.missing.length) return sheet;
  const ok = new Map<string, 'operator' | 'autopilot'>();
  for (const a of accepts) {
    if (a.pages != null && a.pages !== holePagesKey(sheet, a.sheet)) continue;
    for (const c of a.cells)
      ok.set(cellKey(a.sheet, c.row, c.col, c.file), c.origin ?? a.origin ?? 'operator');
  }
  if (!ok.size) return sheet;
  const holes: SheetHole[] = [...(sheet.holes ?? [])];
  const missing: MissingCell[] = [];
  for (const m of sheet.missing) {
    // a cell named with its file (file-per-size sets) is that file's only; without, any file's
    const origin =
      ok.get(cellKey(m.sheet ?? 0, m.row, m.col, m.file)) ??
      ok.get(cellKey(m.sheet ?? 0, m.row, m.col));
    // a cell without geometry cannot be guarded — it stays missing (asked)
    if (!origin || !m.box) {
      missing.push(m);
      continue;
    }
    holes.push({
      ...m,
      sheet: m.sheet ?? 0,
      box: m.box,
      open: m.open ?? null,
      lineEnds: m.lineEnds ?? 0,
      origin,
    });
  }
  if (holes.length === (sheet.holes?.length ?? 0)) return sheet;
  const left = new Map<number, number>();
  for (const m of missing) left.set(m.sheet ?? 0, (left.get(m.sheet ?? 0) ?? 0) + 1);
  return {
    ...sheet,
    missing,
    holes,
    ...(sheet.parts
      ? { parts: sheet.parts.map((p) => ({ ...p, missing: left.get(p.sheet) ?? 0 })) }
      : {}),
    warnings: [
      ...sheet.warnings,
      ...holes
        .slice(sheet.holes?.length ?? 0)
        .map(
          (h) =>
            `${sheet.parts && sheet.parts.length > 1 ? `sheet ${h.sheet + 1}: ` : ''}tile row ${h.row + 1} col ${h.col + 1} imported as a blank page (${h.origin}) — ${h.lineEnds} line ends run into it; no piece closes across it`,
        ),
    ],
  };
}

/**
 * D5: the autopilot accepts a missing cell as blank only on TWO evidences that it holds no
 * pattern — no drawn line ends inside it (within 1 mm), AND its uncovered part lies outside the
 * sheet's line work OR the printed index labels number every tile without a gap. The evidences in
 * words, or null (the operator's answer).
 */
export function holeAutoEvidence(m: MissingCell): string[] | null {
  if (!m.box || m.lineEnds == null || m.lineEnds > 0 || m.labels === 'gap') return null;
  const ev = [`no drawn line ends within ${HOLE_END_TOL_MM} mm of the cell`];
  if (m.outside) ev.push('the cell lies outside the line work of its sheet');
  if (m.labels === 'complete') ev.push('the printed tile numbers run without a gap');
  return ev.length >= 2 ? ev : null;
}
