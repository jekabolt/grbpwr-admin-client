// assemble (F2) — contract `assembleSheet`: the tiles of one sheet → poses → one Sheet in a single
// mm frame (y-up, the sheet's tile-area lower-left at the origin).
//
// File-per-size sets (Redcafe 44…54, wm XS…XXXL) arrive as ONE sheet id spanning several files:
// each file is assembled on its own (its own grid — Redcafe's rows differ per size), then the
// files are aligned to each other on the top-left tile (the shared print frame), refined by the
// drawing they share. The per-file poses stay in `poses`; `pairs` carry the file-to-file links.

import type {
  Affine,
  BoxMm,
  GridOverride,
  IRPage,
  PageClassification,
  PagePose,
  PairTransform,
  Progress,
  Sheet,
  SourceDoc,
} from 'lib/pattern-import/types';
import { PATIMPORT } from 'lib/pattern-import/types';

import { assembleGroup, type GroupResult } from './group';
import { drawingBox, detectLattice } from './overview';
import { apply, placePages } from './place';
import { furnitureOf, pageKey } from './regpage';

export type SheetReport = {
  groups: GroupResult[];
  /** File-to-file alignment for file-per-size sets. */
  alignment: { file: string; dxMm: number; dyMm: number; method: string; votes: number }[];
  overview: {
    page: number;
    file: string;
    cells: [number, number];
    layoutCells: [number, number];
    factorX: number;
    factorY: number;
    sheetFromOverview: [number, number];
    sheetDrawing: [number, number];
    errX: number;
    errY: number;
  } | null;
  /** Tile-area extent (union of page rectangles), mm. */
  tileExtent: [number, number];
  place: ReturnType<typeof placePages>['stats'];
  ms: number;
};

const compose = (m: Affine, tx: number, ty: number): Affine => ({ ...m, e: m.e + tx, f: m.f + ty });

/** GridOverride → poses (method 'manual'): reading order from originPage, rows go down. */
export function manualPoses(pages: IRPage[], o: GridOverride): { poses: PagePose[]; pairs: PairTransform[] } {
  const start = Math.max(
    0,
    pages.findIndex((p) => p.file === o.originPage.file && p.page === o.originPage.page),
  );
  const list = pages.slice(start);
  const poses: PagePose[] = [];
  const pairs: PairTransform[] = [];
  list.forEach((p, k) => {
    const row = o.order === 'row-major' ? Math.floor(k / o.cols) : k % o.rows;
    const col = o.order === 'row-major' ? k % o.cols : Math.floor(k / o.rows);
    if (row >= o.rows || col >= o.cols) return;
    poses.push({
      file: p.file,
      page: p.page,
      toSheet: { a: 1, b: 0, c: 0, d: 1, e: col * o.stepXMm, f: -row * o.stepYMm },
      row,
      col,
      residualMm: 0,
    });
    if (k)
      pairs.push({
        from: { file: list[0].file, page: list[0].page },
        to: { file: p.file, page: p.page },
        dxMm: col * o.stepXMm,
        dyMm: -row * o.stepYMm,
        rotDeg: 0,
        method: 'manual',
        score: 0,
        secondBestRatio: 0,
      });
  });
  return { poses, pairs };
}

function tileBox(pages: IRPage[], poses: Map<string, PagePose>): BoxMm {
  const b = { minX: Infinity, minY: Infinity, maxX: -Infinity, maxY: -Infinity };
  for (const p of pages) {
    const pose = poses.get(pageKey(p.file, p.page));
    if (!pose) continue;
    for (const c of [
      { x: 0, y: 0 },
      { x: p.widthMm, y: 0 },
      { x: 0, y: p.heightMm },
      { x: p.widthMm, y: p.heightMm },
    ]) {
      const v = apply(pose.toSheet, c);
      b.minX = Math.min(b.minX, v.x);
      b.minY = Math.min(b.minY, v.y);
      b.maxX = Math.max(b.maxX, v.x);
      b.maxY = Math.max(b.maxY, v.y);
    }
  }
  return b;
}

/** Empty lattice cells that drawing runs into (lines ending on the seam facing them). */
function missingCells(
  g: GroupResult,
  pages: IRPage[],
  poses: Map<string, PagePose>,
): { row: number; col: number; evidence: number }[] {
  const cells = new Map<string, PagePose>();
  for (const p of g.poses) if (p.row !== undefined && p.col !== undefined) cells.set(`${p.row},${p.col}`, p);
  if (!cells.size) return [];
  const rows = [...cells.values()].map((p) => p.row as number);
  const cols = [...cells.values()].map((p) => p.col as number);
  const out: { row: number; col: number; evidence: number }[] = [];
  const byKey = new Map(pages.map((p) => [pageKey(p.file, p.page), p]));
  // Frame, rulers and corner targets end on every page edge — they are not drawing.
  const furniture = furnitureOf(pages);
  const isFurniture = (v: { x: number; y: number }) =>
    furniture.has(`${Math.round(v.x * 10)},${Math.round(v.y * 10)}`);
  for (let r = Math.min(...rows); r <= Math.max(...rows); r++)
    for (let c = Math.min(...cols); c <= Math.max(...cols); c++) {
      if (cells.has(`${r},${c}`)) continue;
      let evidence = 0;
      for (const [dr, dc, side] of [
        [0, -1, 'R'],
        [0, 1, 'L'],
        [-1, 0, 'B'],
        [1, 0, 'T'],
      ] as const) {
        const nb = cells.get(`${r + dr},${c + dc}`);
        if (!nb) continue;
        const pg = byKey.get(pageKey(nb.file, nb.page));
        if (!pg) continue;
        // Endpoints of open paths within 1 mm of the page edge that faces the empty cell.
        for (const path of pg.paths) {
          if (path.closed || path.pts.length < 2) continue;
          const st = pg.styles[path.style];
          if (st?.fill && !st.widthMm) continue;
          if (path.pts.length === 2) {
            const [a, b] = path.pts;
            if (Math.abs(a.x - b.x) < 0.05 || Math.abs(a.y - b.y) < 0.05) continue; // ruling
          }
          for (const v of [path.pts[0], path.pts[path.pts.length - 1]]) {
            if (isFurniture(v)) continue;
            const near =
              side === 'R'
                ? Math.abs(v.x - pg.widthMm) < 1
                : side === 'L'
                  ? Math.abs(v.x) < 1
                  : side === 'B'
                    ? Math.abs(v.y) < 1
                    : Math.abs(v.y - pg.heightMm) < 1;
            if (near) evidence++;
          }
        }
      }
      void poses;
      if (evidence >= 3) out.push({ row: r, col: c, evidence });
    }
  return out;
}

export function assembleSheetDetailed(
  docs: SourceDoc[],
  classes: PageClassification[],
  sheet: number,
  override?: GridOverride,
  progress?: Progress,
): { sheet: Sheet; report: SheetReport } {
  const t0 = Date.now();
  const warnings: string[] = [];
  const isTile = (c: PageClassification) => c.cls === 'tile' && c.sheet === sheet;
  const byFile = new Map<string, IRPage[]>();
  for (const d of docs) {
    const tiles = d.pages.filter((p) =>
      classes.some((c) => c.file === p.file && c.page === p.page && isTile(c)),
    );
    if (tiles.length) byFile.set(d.file.id, tiles);
  }
  const groups: GroupResult[] = [];
  const allPoses = new Map<string, PagePose>();
  const allPairs: PairTransform[] = [];
  const missing: Sheet['missing'] = [];
  let done = 0;
  const total = byFile.size + 1;
  const fileOffsets = new Map<string, { dx: number; dy: number }>();
  const alignment: SheetReport['alignment'] = [];
  for (const [file, pages] of byFile) {
    progress?.(done, total, `file ${file}: ${pages.length} tiles`);
    if (override && (override.originPage.file === file || byFile.size === 1)) {
      const m = manualPoses(pages, override);
      for (const p of m.poses) allPoses.set(pageKey(p.file, p.page), p);
      allPairs.push(...m.pairs);
      warnings.push(`file ${file}: placed by the operator's grid (${override.rows}×${override.cols})`);
    } else if (pages.length === 1) {
      const p = pages[0];
      allPoses.set(pageKey(p.file, p.page), {
        file: p.file,
        page: p.page,
        toSheet: { a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 },
        row: 0,
        col: 0,
        residualMm: 0,
      });
    } else {
      const g = assembleGroup(pages);
      groups.push(g);
      for (const p of g.poses) allPoses.set(pageKey(p.file, p.page), p);
      allPairs.push(...g.pairs);
      warnings.push(...g.warnings.map((w) => (byFile.size > 1 ? `file ${file}: ${w}` : w)));
      for (const m of missingCells(g, pages, allPoses)) {
        missing.push({ row: m.row, col: m.col });
        warnings.push(
          `${byFile.size > 1 ? `file ${file}: ` : ''}tile row ${m.row + 1} col ${m.col + 1} missing — ` +
            `${m.evidence} line ends run into it`,
        );
      }
    }
    // Normalise each file: its top-left tile's top-left corner at (0, 0) of the tile area.
    const box = tileBox(pages, allPoses);
    fileOffsets.set(file, { dx: -box.minX, dy: -box.maxY });
    done++;
  }
  // File-per-size: every file's top-left at the same point (the shared print frame).
  for (const [file, off] of fileOffsets) {
    for (const p of allPoses.values())
      if (p.file === file) p.toSheet = compose(p.toSheet, off.dx, off.dy);
    if (byFile.size > 1)
      alignment.push({ file, dxMm: off.dx, dyMm: off.dy, method: 'top-left tile', votes: 0 });
  }
  // Frame: tile area lower-left at the origin (y-up).
  const allPages = [...byFile.values()].flat();
  const tb = tileBox(allPages, allPoses);
  for (const p of allPoses.values()) p.toSheet = compose(p.toSheet, -tb.minX, -tb.minY);
  const placed = allPages
    .map((page) => ({ page, pose: allPoses.get(pageKey(page.file, page.page))?.toSheet }))
    .filter((x): x is { page: IRPage; pose: Affine } => !!x.pose);
  progress?.(done, total, 'placing paths');
  const pl = placePages(placed);
  // Overview check.
  let overview: Sheet['overview'];
  let ovReport: SheetReport['overview'] = null;
  const ovClass = classes.find((c) => c.cls === 'overview' && c.sheet === sheet);
  const g0 = groups[0];
  if (ovClass && g0) {
    const doc = docs.find((d) => d.file.id === ovClass.file);
    const page = doc?.pages.find((p) => p.page === ovClass.page);
    const pr = g0.fitted?.right ?? g0.pitch.right;
    const pb = g0.fitted?.below ?? g0.pitch.below;
    const pitchX = Math.hypot(pr.dx, pr.dy);
    const pitchY = Math.hypot(pb.dx, pb.dy);
    const lat = page ? detectLattice(page, pitchX / pitchY) : null;
    if (page && lat) {
      const fx = pitchX / lat.sx;
      const fy = pitchY / lat.sy;
      const f = (fx + fy) / 2;
      const ovDraw = drawingBox(page.paths, 3 / f, lat.box);
      const shDraw = drawingBox(pl.paths, 20);
      const rows = new Set(g0.poses.map((p) => p.row)).size;
      const cols = new Set(g0.poses.map((p) => p.col)).size;
      if (ovDraw && shDraw) {
        const ow = (ovDraw.maxX - ovDraw.minX) * f;
        const oh = (ovDraw.maxY - ovDraw.minY) * f;
        const sw = shDraw.maxX - shDraw.minX;
        const sh = shDraw.maxY - shDraw.minY;
        ovReport = {
          page: page.page,
          file: page.file,
          cells: [lat.xs.length - 1, lat.ys.length - 1],
          layoutCells: [cols, rows],
          factorX: fx,
          factorY: fy,
          sheetFromOverview: [ow, oh],
          sheetDrawing: [sw, sh],
          errX: sw / ow - 1,
          errY: sh / oh - 1,
        };
        overview = {
          file: page.file,
          page: page.page,
          factor: f,
          bbox: { minX: ovDraw.minX, minY: ovDraw.minY, maxX: ovDraw.maxX, maxY: ovDraw.maxY },
        };
        if (Math.abs(ovReport.errX) > 0.02 || Math.abs(ovReport.errY) > 0.02)
          warnings.push(
            `overview p${page.page + 1} disagrees with the assembled drawing by ` +
              `${(ovReport.errX * 100).toFixed(1)} % × ${(ovReport.errY * 100).toFixed(1)} %`,
          );
        if (Math.abs(fx / fy - 1) > 0.02)
          warnings.push(`overview p${page.page + 1}: grid cells are not the tile pitch's shape`);
      }
    } else if (page) warnings.push(`overview p${page.page + 1}: no tile grid found on it`);
  }
  const maxRes = Math.max(0, ...[...allPoses.values()].map((p) => p.residualMm));
  if (maxRes > PATIMPORT.registrationMaxResidualMm)
    warnings.push(`max loop-closure residual ${maxRes.toFixed(2)} mm`);
  progress?.(total, total);
  const sheetOut: Sheet = {
    id: sheet,
    poses: [...allPoses.values()],
    pairs: allPairs,
    bbox: pl.bbox,
    missing,
    overview,
    paths: pl.paths,
    texts: pl.texts,
    rasters: pl.rasters,
    styles: pl.styles,
    warnings,
  };
  return {
    sheet: sheetOut,
    report: {
      groups,
      alignment,
      overview: ovReport,
      tileExtent: [tb.maxX - tb.minX, tb.maxY - tb.minY],
      place: pl.stats,
      ms: Date.now() - t0,
    },
  };
}

/** Contract `assembleSheet`. */
export function assembleSheet(
  docs: SourceDoc[],
  classes: PageClassification[],
  sheet: number,
  override?: GridOverride,
  progress?: Progress,
): Sheet {
  return assembleSheetDetailed(docs, classes, sheet, override, progress).sheet;
}
