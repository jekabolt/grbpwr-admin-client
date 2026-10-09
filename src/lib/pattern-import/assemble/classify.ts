// assemble (F2) — page segmentation (contract `classifyPages`): cover / instructions / overview /
// tile / blank / unknown, and for tiles WHICH sheet. Segmentation comes before registration
// (Codex C6): instruction pages and the reduced overview must never be stitched into a sheet,
// and a file can carry several sheets (polupalto: Bogen A p6–55, Bogen B p57–91; r4454: main sheet
// p4–34, interfacing sheet p35–39).
//
// A page is a TILE when it has the file's tile format (orientation-agnostic: a quarter-turned tile
// is still one) and evidence: a recurrence or edge-stitch link to another page of its run, a
// printed cell label, or — for sparse pages — a place between linked tiles without being text.
// Runs of tiles split at non-tile pages and at index-label restarts (…, 31, 1, …).

import type { IRPage, PageClassification, SourceDoc } from 'lib/pattern-import/types';

import { cellLabelOf, indexLabels } from './labels';
import { detectLattice } from './overview';
import { recurrenceLinks } from './recurrence';
import { buildRegPage, furnitureOf } from './regpage';
import { DEFAULT_STITCH, TRACED_STITCH, accepted, stitchFree } from './stitch';

export type PageFeatures = {
  file: string;
  page: number;
  widthMm: number;
  heightMm: number;
  strokeLenM: number;
  strokes: number;
  fills: number;
  texts: number;
  chars: number;
  rasterCover: number;
  /** Share of vertices beyond the page edge (windowed tiles ≫ 0). */
  outShare: number;
  cellLabel: string | null;
  format: string;
  traced: boolean;
};

export function pageFeatures(p: IRPage): PageFeatures {
  let len = 0;
  let strokes = 0;
  let fills = 0;
  let out = 0;
  let tot = 0;
  for (const path of p.paths) {
    const s = p.styles[path.style];
    if (s?.fill && !s.widthMm) fills++;
    else {
      strokes++;
      for (let i = 1; i < path.pts.length; i++)
        len += Math.hypot(path.pts[i].x - path.pts[i - 1].x, path.pts[i].y - path.pts[i - 1].y);
    }
    for (const v of path.pts) {
      tot++;
      if (v.x < -1 || v.y < -1 || v.x > p.widthMm + 1 || v.y > p.heightMm + 1) out++;
    }
  }
  const cl = cellLabelOf(p);
  const a = Math.round(Math.min(p.widthMm, p.heightMm));
  const b = Math.round(Math.max(p.widthMm, p.heightMm));
  return {
    file: p.file,
    page: p.page,
    widthMm: p.widthMm,
    heightMm: p.heightMm,
    strokeLenM: len / 1000,
    strokes,
    fills,
    texts: p.texts.length,
    chars: p.texts.reduce((s, t) => s + t.text.length, 0),
    // A traced raster page (F11) is drawing, not a picture: its raster IS the source of its lines.
    rasterCover: p.calibration ? 0 : Math.max(0, ...p.rasters.map((r) => r.pageCover)),
    traced: !!p.calibration,
    outShare: tot ? out / tot : 0,
    cellLabel: cl ? cl.text : null,
    format: `${a}x${b}`,
  };
}

/**
 * An overview's grid: cells shaped like the tiles (±8 %: pitch = page − overlap) with drawing
 * inside that is not grid — a ruled TABLE on an instruction page (reef p2) has no such drawing.
 */
function overviewLattice(p: IRPage, tileAspect: number): boolean {
  const lat = detectLattice(p);
  if (!lat || Math.abs(lat.sx / lat.sy / tileAspect - 1) > 0.08) return false;
  let len = 0;
  for (const path of p.paths) {
    const st = p.styles[path.style];
    if (st?.fill && !st.widthMm) continue;
    for (let i = 1; i < path.pts.length; i++) {
      const a = path.pts[i - 1];
      const b = path.pts[i];
      if (Math.abs(a.x - b.x) < 0.05 || Math.abs(a.y - b.y) < 0.05) continue;
      const inside =
        a.x >= lat.box.minX && a.x <= lat.box.maxX && a.y >= lat.box.minY && a.y <= lat.box.maxY;
      if (inside) len += Math.hypot(b.x - a.x, b.y - a.y);
    }
  }
  // ≥ 2 grid cells' perimeter worth of drawing.
  return len >= 4 * (lat.sx + lat.sy);
}

const textHeavy = (f: PageFeatures) => f.texts >= 40 || f.chars >= 1500;
const isScan = (f: PageFeatures) => f.rasterCover >= 0.9 && f.strokes <= 2;

type Cls = PageClassification;

/** Links between pages of one run: recurrence anywhere, edge stitch between consecutive pages. */
function linkedPages(run: IRPage[]): Set<number> {
  const fur = furnitureOf(run);
  const regs = run.map((p, i) => buildRegPage(p, i, 0, fur));
  const linked = new Set<number>();
  for (const l of recurrenceLinks(regs)) {
    linked.add(l.a.page);
    linked.add(l.b.page);
  }
  for (let i = 0; i + 1 < regs.length; i++) {
    if (linked.has(regs[i].page) && linked.has(regs[i + 1].page)) continue;
    for (const rel of ['right', 'below'] as const) {
      const st = run[i].calibration ? TRACED_STITCH : DEFAULT_STITCH;
      const l = stitchFree(regs[i], regs[i + 1], rel, st);
      if (accepted(l, st)) {
        linked.add(regs[i].page);
        linked.add(regs[i + 1].page);
        break;
      }
    }
  }
  return linked;
}

export function classifyPages(docs: SourceDoc[]): PageClassification[] {
  const out: Cls[] = [];
  type Run = { file: string; pages: IRPage[] };
  const runsAll: Run[] = [];
  const perDoc: { doc: SourceDoc; cls: Map<number, Cls>; runs: Run[] }[] = [];
  for (const doc of docs) {
    const cls = new Map<number, Cls>();
    const feats = new Map(doc.pages.map((p) => [p.page, pageFeatures(p)]));
    const F = (p: IRPage) => feats.get(p.page) as PageFeatures;
    // A one-page source (DXF, SVG, PLT, a single-sheet PDF) is its own sheet.
    if (doc.pages.length === 1) {
      const p = doc.pages[0];
      const f = F(p);
      const run = { file: doc.file.id, pages: [p] };
      if (isScan(f))
        cls.set(p.page, {
          file: p.file,
          page: p.page,
          cls: 'unknown',
          confidence: 0.5,
          why: 'raster scan — trace it first (F11)',
        });
      else {
        cls.set(p.page, {
          file: p.file,
          page: p.page,
          cls: 'tile',
          confidence: 0.9,
          why: 'single-page source: the page is the sheet',
        });
        runsAll.push(run);
        perDoc.push({ doc, cls, runs: [run] });
        continue;
      }
      perDoc.push({ doc, cls, runs: [] });
      continue;
    }
    // Tile format: the commonest page format among pages that carry drawing. Formats match
    // within 1.5 mm (170.5 can print as 170.49 on one page and 170.51 on the next).
    const dims = (f: PageFeatures) =>
      [Math.min(f.widthMm, f.heightMm), Math.max(f.widthMm, f.heightMm)] as const;
    const sameFmt = (a: readonly [number, number], b: readonly [number, number]) =>
      Math.abs(a[0] - b[0]) <= 1.5 && Math.abs(a[1] - b[1]) <= 1.5;
    const fmts: { d: readonly [number, number]; score: number }[] = [];
    for (const p of doc.pages) {
      const f = F(p);
      if (isScan(f) || textHeavy(f)) continue;
      if (f.strokeLenM >= 0.5 || f.outShare > 0.3 || f.cellLabel) {
        const d = dims(f);
        const e = fmts.find((x) => sameFmt(x.d, d));
        if (e) e.score += 1 + f.strokeLenM / 1000;
        else fmts.push({ d, score: 1 + f.strokeLenM / 1000 });
      }
    }
    fmts.sort((a, b) => b.score - a.score);
    const tileDims = fmts[0]?.d ?? ([0, 0] as const);
    const isTileFmt = (f: PageFeatures) => sameFmt(dims(f), tileDims);
    // Contiguous candidate runs.
    const cands: IRPage[][] = [];
    let cur: IRPage[] = [];
    for (const p of doc.pages) {
      const f = F(p);
      if (isTileFmt(f) && !isScan(f)) cur.push(p);
      else {
        if (cur.length) cands.push(cur);
        cur = [];
      }
    }
    if (cur.length) cands.push(cur);
    const runs: Run[] = [];
    for (const c of cands) {
      // Evidence first, then trim non-tiles off the run's ends.
      const linked = c.length > 1 ? linkedPages(c) : new Set<number>();
      // Traced raster pages register poorly in the quick check (resampled vertices): every
      // drawing page of a traced run counts as a tile.
      const tracedRun = c.every((p) => F(p).traced);
      const isTile = c.map(
        (p) =>
          linked.has(p.page) ||
          !!F(p).cellLabel ||
          (tracedRun && F(p).strokeLenM >= 0.2 && !textHeavy(F(p))),
      );
      const first = isTile.indexOf(true);
      const last = isTile.lastIndexOf(true);
      const tiles: IRPage[] = [];
      c.forEach((p, i) => {
        const f = F(p);
        if (isTile[i]) {
          tiles.push(p);
          cls.set(p.page, {
            file: p.file,
            page: p.page,
            cls: 'tile',
            confidence: linked.has(p.page) ? 0.95 : f.cellLabel ? 0.85 : 0.6,
            why: linked.has(p.page)
              ? 'tile format; registers with a neighbour'
              : f.cellLabel
                ? `tile format; cell label "${f.cellLabel}"`
                : 'traced raster page of the tile format with drawing',
          });
        } else if (
          first >= 0 &&
          i > first &&
          i < last &&
          !textHeavy(f) &&
          !overviewLattice(p, tileDims[0] / tileDims[1])
        ) {
          tiles.push(p);
          cls.set(p.page, {
            file: p.file,
            page: p.page,
            cls: 'tile',
            confidence: 0.6,
            why: 'tile format between registered tiles; too sparse to register alone',
          });
        }
      });
      // Trailing / leading pages of the format that did not register: a sparse edge tile (robe
      // p32: 16 strokes, nothing crosses its seams) is still a tile when it carries real drawing
      // and is not text; its index label, when the run has one, must continue the sequence.
      const idxAll = indexLabels(c);
      const labelledRun =
        c.filter((p, i) => isTile[i] && F(p).cellLabel).length > 0.5 * (last - first + 1);
      c.forEach((p, i) => {
        if (cls.has(p.page) || first < 0 || (i > first && i < last)) return;
        const f = F(p);
        if (overviewLattice(p, tileDims[0] / tileDims[1])) return;
        const near = i < first ? first : last;
        const iv = idxAll?.[i];
        const nv = idxAll?.[near];
        if (idxAll && iv != null && nv != null) {
          // A page number continuing the tiles' numbering (kombinezon p1–3: sparse tiles with
          // the test square and the size guide) — only a wall of text disqualifies it.
          if (iv - nv !== i - near || f.texts >= 80 || f.chars >= 1500) return;
        } else {
          // A drawing page: metres of line, little text, no picture (wm: 11–16 m, no text at all;
          // its col-major seams are too sparse for the cheap consecutive-page check).
          const drawing =
            f.strokeLenM >= (f.traced ? 0.5 : 3) && !textHeavy(f) && f.rasterCover < 0.2;
          if (labelledRun || !drawing) return;
        }
        tiles.push(p);
        cls.set(p.page, {
          file: p.file,
          page: p.page,
          cls: 'tile',
          confidence: idxAll && iv != null ? 0.7 : 0.5,
          why:
            idxAll && iv != null
              ? `tile format, index label ${iv} continues the tiles' numbering`
              : 'tile format with drawing and little text; no seam evidence in the quick check',
        });
      });
      tiles.sort((a, b) => a.page - b.page);
      if (!tiles.length) continue;
      // Index-label restarts split one run into sheets (r4454: 1…31 then 1…5).
      const idx = indexLabels(tiles);
      let part: IRPage[] = [];
      tiles.forEach((p, i) => {
        const prev = i ? idx?.[i - 1] : null;
        const v = idx?.[i] ?? null;
        if (part.length && v !== null && prev !== null && prev !== undefined && v <= prev) {
          runs.push({ file: doc.file.id, pages: part });
          part = [];
        }
        part.push(p);
      });
      if (part.length) runs.push({ file: doc.file.id, pages: part });
    }
    // Everything else.
    const firstTile = Math.min(...runs.map((r) => r.pages[0].page), Infinity);
    for (const p of doc.pages) {
      if (cls.has(p.page)) continue;
      const f = F(p);
      const base = { file: p.file, page: p.page };
      if (isScan(f))
        cls.set(p.page, {
          ...base,
          cls: 'unknown',
          confidence: 0.5,
          why: 'raster scan — trace it first (F11)',
        });
      else if (f.strokeLenM >= 2 && overviewLattice(p, tileDims[0] / tileDims[1]))
        cls.set(p.page, {
          ...base,
          cls: 'overview',
          confidence: 0.85,
          why: `reduced drawing with the tile grid${isTileFmt(f) ? '' : ' (other page format)'}`,
        });
      else if (f.strokeLenM < 0.2 && f.texts <= 3 && f.rasterCover < 0.2)
        cls.set(p.page, { ...base, cls: 'blank', confidence: 0.9, why: 'nothing drawn, no text' });
      else if (p.page < firstTile && (f.rasterCover >= 0.3 || p.page === 0) && !textHeavy(f))
        cls.set(p.page, {
          ...base,
          cls: 'cover',
          confidence: 0.7,
          why: f.rasterCover >= 0.3 ? 'picture page before the tiles' : 'first page, little text',
        });
      else if (f.texts >= 10)
        cls.set(p.page, {
          ...base,
          cls: 'instructions',
          confidence: 0.8,
          why: `${f.texts} text items, no tile evidence`,
        });
      else
        cls.set(p.page, {
          ...base,
          cls: 'unknown',
          confidence: 0.3,
          why: 'no tile evidence, little text',
        });
    }
    runsAll.push(...runs);
    perDoc.push({ doc, cls, runs });
  }
  // Sheet ids. A file-per-size set (several files, one run each) is ONE sheet: the sizes are
  // assembled per file and aligned (F2), then told apart by file (F3/F5).
  const fileSet = docs.length > 1 && perDoc.every((d) => d.runs.length === 1);
  let next = 0;
  for (const d of perDoc) {
    const sheetOfRun = d.runs.map(() => (fileSet ? 0 : next++));
    d.runs.forEach((r, ri) => {
      for (const p of r.pages) {
        const c = d.cls.get(p.page);
        if (c) c.sheet = sheetOfRun[ri];
      }
    });
    // Overviews describe the run that follows them (polupalto p5 → Bogen A), else the one before.
    for (const c of d.cls.values()) {
      if (c.cls !== 'overview' || !d.runs.length) continue;
      const after = d.runs.findIndex((r) => r.pages[0].page > c.page);
      const ri = after >= 0 ? after : d.runs.length - 1;
      c.sheet = sheetOfRun[ri];
    }
    if (fileSet) next = 1;
    for (const p of d.doc.pages) {
      const c = d.cls.get(p.page);
      if (c) out.push(c);
    }
  }
  return out;
}
