// assemble (F2) — tiles → one sheet: every path, text and raster moved into the sheet frame by its
// page pose, and the duplicates that tiling creates removed BEFORE anything downstream sees them.
//
// Two kinds of duplicate, both only ACROSS pages (two coincident lines on one page are drawing —
// a common edge of two sizes — and stay):
//  1. whole-path copies: windowed tiles (Burda, kombinezon, blazer) carry the same unclipped
//     subpath on every tile it crosses. One copy is kept: the one drawn most inside its own page
//     (the page where it is actually visible), so its provenance points at a real place on paper.
//  2. overlap strips: cut-at-edge tiles print the strip they share twice (reef 12.7 mm, viola
//     20 mm). Edges of a later page lying on geometry of the same style already placed from another
//     page (both ends and the midpoint within `dedupeTolMm`) are dropped; the rest of the path is
//     kept as its runs. A run keeps its source's `src` (file/page/op/sub).
//
// Clip provenance: `Style.clip` keeps F1's `<kind><op>:` prefix with the box moved into the sheet
// frame; the page it came from is the path's `src.page`. Clips are still not applied.

import { fullyVisibleSourcePath } from '../pieces/source-visibility';
import {restoreCutLabels} from './cut-text';
import type {
  Affine,
  BoxMm,
  IRPage,
  IRPath,
  IRRaster,
  IRText,
  PtMm,
  Style,
} from 'lib/pattern-import/types';

export type Placed = { page: IRPage; pose: Affine };

export type PlaceResult = {
  materialMarks?: IRPath[];
  paths: IRPath[];
  texts: IRText[];
  rasters: IRRaster[];
  styles: Style[];
  bbox: BoxMm;
  stats: {
    pathsIn: number;
    pathsOut: number;
    wholeDuplicates: number;
    edgesIn: number;
    edgesDropped: number;
    textsDropped: number;
  };
};

export const apply = (m: Affine, p: PtMm): PtMm => ({
  x: m.a * p.x + m.c * p.y + m.e,
  y: m.b * p.x + m.d * p.y + m.f,
});

function boxOf(pts: PtMm[]): BoxMm {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const p of pts) {
    if (p.x < minX) minX = p.x;
    if (p.y < minY) minY = p.y;
    if (p.x > maxX) maxX = p.x;
    if (p.y > maxY) maxY = p.y;
  }
  return { minX, minY, maxX, maxY };
}

function moveClip(clip: string | null, m: Affine): string | null {
  if (!clip) return null;
  const k = clip.indexOf(':');
  const nums = clip
    .slice(k + 1)
    .split(',')
    .map(Number);
  if (k < 0 || nums.length !== 4 || nums.some((v) => !Number.isFinite(v))) return clip;
  const b = boxOf([
    apply(m, { x: nums[0], y: nums[1] }),
    apply(m, { x: nums[2], y: nums[3] }),
    apply(m, { x: nums[0], y: nums[3] }),
    apply(m, { x: nums[2], y: nums[1] }),
  ]);
  const f = (v: number) => v.toFixed(2);
  return `${clip.slice(0, k)}:${f(b.minX)},${f(b.minY)},${f(b.maxX)},${f(b.maxY)}`;
}

/** Style identity for dedupe: what the line looks like, not where its clip was. */
const lookOf = (s: Style) =>
  `${s.strokeRgb?.join(',')}|${s.widthMm.toFixed(3)}|${s.dash?.map((v) => v.toFixed(2)).join('/') ?? ''}|${s.layer ?? ''}|${s.fill ? 1 : 0}`;

type Cand = {
  pageIdx: number;
  path: IRPath;
  pts: PtMm[];
  look: string;
  style: Style;
  pose: Affine;
  inside: number;
  stampCopies?: IRPath['stampCopies'];
  paintCopies?: IRPath['paintCopies'];
};

function segDist(p: PtMm, a: PtMm, b: PtMm): number {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const L = dx * dx + dy * dy;
  let t = L ? ((p.x - a.x) * dx + (p.y - a.y) * dy) / L : 0;
  t = Math.max(0, Math.min(1, t));
  return Math.hypot(p.x - a.x - t * dx, p.y - a.y - t * dy);
}

export function placePages(placed: Placed[], dedupeTolMm = 0.15): PlaceResult {
  const styles: Style[] = [];
  const styleIds = new Map<string, number>();
  const intern = (s: Style, pose: Affine): number => {
    const t: Style = {
      ...s,
      clip: moveClip(s.clip, pose),
      ...(s.clipQuad ? { clipQuad: s.clipQuad.map((p) => apply(pose, p)) } : {}),
      ...(s.clipPolygon ? { clipPolygon: s.clipPolygon.map((p) => apply(pose, p)) } : {}),
      ...(s.localClipPolygon
        ? { localClipPolygon: s.localClipPolygon.map((p) => apply(pose, p)) }
        : {}),
    };
    const key = JSON.stringify([
      t.strokeRgb,
      t.widthMm,
      t.dash,
      t.layer,
      t.fill,
      t.clip,
      t.clipQuad,
      t.clipPolygon,
      t.localClipPolygon,
    ]);
    const id = styleIds.get(key);
    if (id !== undefined) return id;
    const nid = styles.length;
    styles.push({ ...t, id: nid });
    styleIds.set(key, nid);
    return nid;
  };
  // 1. Whole-path duplicates.
  const cands: Cand[] = [];
  let pathsIn = 0;
  placed.forEach(({ page, pose }, pageIdx) => {
    for (const path of page.paths) {
      pathsIn++;
      const style = page.styles[path.style];
      let inside = 0;
      for (const q of path.pts)
        if (q.x >= 0 && q.y >= 0 && q.x <= page.widthMm && q.y <= page.heightMm) inside++;
      cands.push({
        pageIdx,
        path,
        pts: path.pts.map((q) => apply(pose, q)),
        look: `${path.src.file}|${lookOf(style)}`,
        style,
        pose,
        inside: path.pts.length ? inside / path.pts.length : 0,
      });
    }
  });
  const q = (v: number) => Math.round(v * 10);
  const groups = new Map<string, Cand[]>();
  for (const c of cands) {
    const a = c.pts[0];
    const z = c.pts[c.pts.length - 1];
    const key = `${c.look}|${c.pts.length}|${c.path.closed ? 1 : 0}|${q(a.x)},${q(a.y)}|${q(z.x)},${q(z.y)}`;
    const g = groups.get(key);
    if (g) g.push(c);
    else groups.set(key, [c]);
  }
  const same = (u: Cand, v: Cand) => {
    for (let i = 0; i < u.pts.length; i++)
      if (Math.abs(u.pts[i].x - v.pts[i].x) > 0.05 || Math.abs(u.pts[i].y - v.pts[i].y) > 0.05)
        return false;
    return true;
  };
  const survivors: Cand[] = [];
  let wholeDuplicates = 0;
  for (const g of groups.values()) {
    if (g.length === 1) {
      survivors.push(g[0]);
      continue;
    }
    // Partition into identical-copy classes; within a class only cross-page copies collapse.
    const used = new Array(g.length).fill(false);
    for (let i = 0; i < g.length; i++) {
      if (used[i]) continue;
      used[i] = true;
      const cls = [g[i]];
      for (let j = i + 1; j < g.length; j++)
        if (!used[j] && same(g[i], g[j])) {
          used[j] = true;
          cls.push(g[j]);
        }
      // Per page, every copy stays (legit repeats on one page); across pages OF ONE FILE, the
      // best page wins. Files never dedupe against each other: in a file-per-size set a line
      // shared by two sizes belongs to both.
      const byFile = new Map<string, Cand[]>();
      for (const c of cls) {
        const l = byFile.get(c.path.src.file);
        if (l) l.push(c);
        else byFile.set(c.path.src.file, [c]);
      }
      for (const fileCands of byFile.values()) {
        const byPage = new Map<number, Cand[]>();
        for (const c of fileCands) {
          const l = byPage.get(c.pageIdx);
          if (l) l.push(c);
          else byPage.set(c.pageIdx, [c]);
        }
        let bestPage = -1;
        let bestInside = -1;
        for (const [pi, l] of byPage) {
          const v = Math.max(...l.map((c) => c.inside));
          if (v > bestInside || (v === bestInside && pi < bestPage))
            [bestPage, bestInside] = [pi, v];
        }
        for (const [pi, l] of byPage) {
          if (pi === bestPage) {
            for(const c of l){
              if (c.path.closed && c.style.fill && !c.path.background && l.length === 1) {
                const copies = cls.filter(
                  (o) =>
                    o.pageIdx !== pi &&
                    byPage.get(o.pageIdx)?.length === 1 &&
                    o.path.src.file === c.path.src.file &&
                    o.pts.length === c.pts.length &&
                    o.pts.every((v, i) => Math.hypot(v.x - c.pts[i].x, v.y - c.pts[i].y) < 0.006),
                );
                if (copies.length) c.stampCopies = copies.map((o) => o.path.src);
              }
              if ((c.path.closed || c.path.pts.length === 2) && c.path.visibleEdges !== true) {
                const copies=cls.filter(other=>other.pageIdx!==pi && !other.path.background && other.path.src.file===c.path.src.file && other.path.visibleEdges);
                if(copies.length)c.paintCopies=copies.map(other=>({src:other.path.src,edges:other.path.visibleEdges!}));
              }
            }
            survivors.push(...l);
          }
          else wholeDuplicates += l.length;
        }
      }
    }
  }
  // Stable order: page, then source path id.
  survivors.sort((a, b) => a.pageIdx - b.pageIdx || a.path.id - b.path.id);
  // debug: env PLACE_DEBUG="x,y;x,y" — every dashed path each page draws within 20 mm of a point,
  // as read (before the overlap dedupe), with its x range and whether it survived the whole-copy pass
  const dbg =
    typeof process !== 'undefined' && process.env?.PLACE_DEBUG
      ? process.env.PLACE_DEBUG.split(';').map((t) => t.split(',').map(Number))
      : [];
  for (const [x, y] of dbg)
    for (const c of cands) {
      if (!c.style.dash || !c.pts.some((p) => Math.abs(p.x - x) <= 20 && Math.abs(p.y - y) <= 20))
        continue;
      const xs = c.pts.map((p) => p.x);
      console.log(
        `PLACE at ${x},${y} pg ${c.path.src.page} op ${c.path.src.op} look ${c.look.split('|').slice(2, 4).join(' ')} x ${Math.min(...xs).toFixed(1)}..${Math.max(...xs).toFixed(1)} n ${c.pts.length} ${survivors.includes(c) ? 'kept' : 'whole-dup'} clip ${c.style.clip ?? '-'}`,
      );
    }
  // 2. Overlap-strip edges. Segments of accepted paths indexed per look on a 2 mm grid.
  const CELL = 2;
  const segs = new Map<string, Map<number, { a: PtMm; b: PtMm; page: number; closed: boolean }[]>>();
  const cellKey = (x: number, y: number) => Math.floor(x / CELL) * 1_000_003 + Math.floor(y / CELL);
  const addSeg = (look: string, a: PtMm, b: PtMm, page: number, closed: boolean) => {
    let m = segs.get(look);
    if (!m) segs.set(look, (m = new Map()));
    const x0 = Math.floor((Math.min(a.x, b.x) - dedupeTolMm) / CELL);
    const x1 = Math.floor((Math.max(a.x, b.x) + dedupeTolMm) / CELL);
    const y0 = Math.floor((Math.min(a.y, b.y) - dedupeTolMm) / CELL);
    const y1 = Math.floor((Math.max(a.y, b.y) + dedupeTolMm) / CELL);
    if ((x1 - x0 + 1) * (y1 - y0 + 1) > 4096) return; // absurdly long single edge: skip index
    for (let x = x0; x <= x1; x++)
      for (let y = y0; y <= y1; y++) {
        const k = x * 1_000_003 + y;
        const l = m.get(k);
        const s = { a, b, page, closed };
        if (l) l.push(s);
        else m.set(k, [s]);
      }
  };
  const covered = (look: string, p: PtMm, page: number, closedOnly = false) => {
    const m = segs.get(look);
    if (!m) return false;
    const l = m.get(cellKey(p.x, p.y));
    if (!l) return false;
    for (const s of l)
      if (s.page !== page && (!closedOnly || s.closed) && segDist(p, s.a, s.b) <= dedupeTolMm)
        return true;
    return false;
  };
  const paths: IRPath[] = [];
  let edgesIn = 0;
  let edgesDropped = 0;
  const glyphRecorded = new Set<Cand>();
  const emit = (c: Cand, pts: PtMm[], closed: boolean) => {
    const wholeGlyph =
      !closed && c.path.closed && c.path.visibleMotif && c.style.fill && !glyphRecorded.has(c);
    if (wholeGlyph) glyphRecorded.add(c);
    paths.push({
      id: paths.length,
      pts,
      closed,
      style: intern(c.style, c.pose),
      ...(c.path.unknownFill ? { unknownFill: true as const } : {}),
      ...(closed && c.path.visibleFill
        ? { visibleFill: c.path.visibleFill.map((p) => apply(c.pose, p)) }
        : {}),
      ...(c.path.visibleMotif && closed === c.path.closed && pts.length === c.pts.length
        ? { visibleMotif: true as const }
        : {}),
      src: c.path.src,
      ...(pts === c.pts && c.path.visibleEdges ? {visibleEdges:c.path.visibleEdges} : {}),
      ...(wholeGlyph ? {printedGlyph:c.pts} : {}),
      ...((closed || wholeGlyph) && c.stampCopies ? {stampCopies:c.stampCopies} : {}),
      ...(pts === c.pts && c.paintCopies ? {paintCopies:c.paintCopies} : {}),
      // A8: the clean stage's mask rides with the path into the sheet
      ...(c.path.background ? { background: c.path.background } : {}),
    });
  };
  for (const page of placed.map((_, i) => i)) {
    const mine = survivors.filter((c) => c.pageIdx === page);
    const toIndex: { look: string; a: PtMm; b: PtMm; closed: boolean }[] = [];
    for (const c of mine) {
      const n = c.pts.length;
      const ne = c.path.closed ? n : n - 1;
      edgesIn += ne;
      if (n < 2) {
        emit(c, c.pts, c.path.closed);
        continue;
      }
      const keep: boolean[] = [];
      for (let i = 0; i < ne; i++) {
        const a = c.pts[i];
        const b = c.pts[(i + 1) % n];
        const mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
        const dup =
          covered(c.look, a, page) && covered(c.look, b, page) && covered(c.look, mid, page);
        keep.push(!dup);
        if (dup) edgesDropped++;
        else toIndex.push({ look: c.look, a, b, closed: c.path.closed });
      }
      // One coincident edge on two otherwise distinct closed outlines is a cut edge
      // of both sizes. Whole-path copies have already been removed above.
      const omitted = keep.flatMap((kept, i) => {
        const a = c.pts[i];
        const b = c.pts[(i + 1) % n];
        return !kept && Math.hypot(a.x - b.x, a.y - b.y) > 0.01 ? [{ a, b }] : [];
      });
      const shared = omitted.length === 1 ? omitted[0] : undefined;
      const sharedLoopEdge = c.path.closed && shared && keep.filter(Boolean).length >= 3 &&
        segs.get(c.look)?.get(cellKey(shared.a.x, shared.a.y))?.some((s) =>
          s.closed && s.page !== page &&
          segDist(shared.a, s.a, s.b) <= dedupeTolMm &&
          segDist(shared.b, s.a, s.b) <= dedupeTolMm);
      // An independently visible, closed size line can briefly coincide with another
      // closed size in the same pen. The cross-tile copy pass above has already merged
      // copies of this whole outline. Retain all of a predominantly distinct source cut.
      const visibleCut =
        omitted.length > 1 &&
        c.path.closed &&
        !c.style.fill &&
        c.style.dash?.length &&
        c.paintCopies?.length &&
        keep.filter(Boolean).length > ne / 2 &&
        fullyVisibleSourcePath({ ...c.path, paintCopies: c.paintCopies }) &&
        omitted.every(({ a, b }) =>
          [a, b, { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }].every((point) =>
            covered(c.look, point, page, true),
          ),
        );
      if (keep.every(Boolean) || sharedLoopEdge || visibleCut) {
        if (sharedLoopEdge || visibleCut) edgesDropped -= keep.filter((kept) => !kept).length;
        emit(c, c.pts, c.path.closed);
        continue;
      }
      // Runs of kept edges → open paths (a closed ring opened where it was cut).
      const runs: PtMm[][] = [];
      let cur: PtMm[] | null = null;
      const start = c.path.closed ? Math.max(0, keep.indexOf(false)) : 0;
      for (let k = 0; k < ne; k++) {
        const i = (start + k) % ne;
        if (keep[i]) {
          if (!cur) {
            cur = [c.pts[i]];
            runs.push(cur);
          }
          cur.push(c.pts[(i + 1) % n]);
        } else cur = null;
      }
      for (const r of runs) emit(c, r, false);
    }
    // Index after the page: a page never dedupes against itself.
    for (const s of toIndex) addSeg(s.look, s.a, s.b, page, s.closed);
  }
  // Texts: a label printed on two overlapping tiles at the same sheet spot is one label.
  const texts: IRText[] = [];
  const seenText = new Map<string, number>();
  let textsDropped = 0;
  placed.forEach(({ page, pose }, pageIdx) => {
    for (const t of page.texts) {
      const anchor = apply(pose, t.anchor);
      const key = `${t.src.file}|${t.text}|${Math.round(anchor.x / 0.3)}|${Math.round(anchor.y / 0.3)}`;
      const prev = seenText.get(key);
      if (prev !== undefined && prev !== pageIdx) {
        textsDropped++;
        continue;
      }
      seenText.set(key, pageIdx);
      const bb = boxOf([
        apply(pose, { x: t.bbox.minX, y: t.bbox.minY }),
        apply(pose, { x: t.bbox.maxX, y: t.bbox.maxY }),
        apply(pose, { x: t.bbox.minX, y: t.bbox.maxY }),
        apply(pose, { x: t.bbox.maxX, y: t.bbox.minY }),
      ]);
      const rot = (Math.atan2(pose.b, pose.a) * 180) / Math.PI;
      texts.push({
        ...t,
        id: texts.length,
        anchor,
        bbox: bb,
        rotationDeg: Math.round((t.rotationDeg + rot) * 1e6) / 1e6,
      });
    }
  });
  const rasters: IRRaster[] = [];
  for (const { page, pose } of placed)
    for (const r of page.rasters) {
      const bb = boxOf([
        apply(pose, { x: r.bbox.minX, y: r.bbox.minY }),
        apply(pose, { x: r.bbox.maxX, y: r.bbox.maxY }),
        apply(pose, { x: r.bbox.minX, y: r.bbox.maxY }),
        apply(pose, { x: r.bbox.maxX, y: r.bbox.minY }),
      ]);
      rasters.push({ ...r, bbox: bb });
    }
  let bbox: BoxMm = { minX: 0, minY: 0, maxX: 0, maxY: 0 };
  if (paths.length) {
    bbox = { minX: Infinity, minY: Infinity, maxX: -Infinity, maxY: -Infinity };
    for (const p of paths)
      for (const v of p.pts) {
        if (v.x < bbox.minX) bbox.minX = v.x;
        if (v.y < bbox.minY) bbox.minY = v.y;
        if (v.x > bbox.maxX) bbox.maxX = v.x;
        if (v.y > bbox.maxY) bbox.maxY = v.y;
      }
  }
  // A partly coincident run may disappear from chain input at a page seam. Keep its
  // original, fully visible paint as independent evidence for labelled material cuts.
  let materialMarks: IRPath[] | undefined;
  if (texts.some((t) => /^cut here for lining$/i.test(t.text.trim()))) {
    const key = (p: IRPath) => [p.src.file, p.src.page, p.src.op, p.src.sub].join('/');
    const emitted = new Map(paths.map((p) => [key(p), p]));
    materialMarks = [];
    for (const c of cands) {
      if (c.path.background || !c.path.visibleMotif || c.pts.length > 16) continue;
      const saved = emitted.get(key(c.path));
      if (saved?.visibleMotif && saved.pts.length === c.pts.length) continue;
      const a = c.pts[0];
      if (!c.pts.every((p) => Math.hypot(p.x - a.x, p.y - a.y) < 12)) continue;
      materialMarks.push({
        ...c.path,
        id: paths.length + materialMarks.length,
        pts: c.pts,
        style: intern(c.style, c.pose),
      });
    }
  }
  return {
    ...(materialMarks?.length ? { materialMarks } : {}),
    paths,
    texts: restoreCutLabels(texts),
    rasters,
    styles,
    bbox,
    stats: {
      pathsIn,
      pathsOut: paths.length,
      wholeDuplicates,
      edgesIn,
      edgesDropped,
      textsDropped,
    },
  };
}
