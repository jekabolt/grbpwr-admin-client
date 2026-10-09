// PATTERN-IMPORT · F3 probe shim — NOT part of any module API.
//
// Lane F2 (assemble/) is built in parallel; until it is merged the F3 probe needs a Sheet. This
// file turns extracted SourceDocs into a Sheet by TRANSLATION ONLY, with the methods the Ф0.5
// probe proved (tmp/plans/pdf-to-dxf/probe/core/assemble.mjs):
//   - 'recurrence'  identical long paths on several pages → pairwise offsets → BFS; pages the
//                   recurrence cannot reach are placed by row-major index on the found pitch;
//   - 'grid'        a known pitch and column count (viola, edge-stitched in the probe);
//   - 'mosaic'      pages laid side by side with a 100 mm gap — nothing joins across pages. Good
//                   enough wherever size classes are declared (dash, OCG, labels, file).
// Paths duplicated by tile overlaps are dropped (same style, same translated geometry).

import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { resolve } from 'node:path';

import type {
  IRPath,
  IRText,
  PagePose,
  Sheet,
  SourceDoc,
  Style,
  StyleId,
} from 'lib/pattern-import/types';

export type ShimLayout =
  | { kind: 'recurrence'; pages: [number, number]; cols?: number }
  | { kind: 'grid'; pages: [number, number]; cols: number; dx: number; dy: number }
  | { kind: 'cells'; dx: number; dy: number; cells: [page: number, row: number, col: number][] }
  | { kind: 'stitch'; pages: [number, number]; cols: number }
  | { kind: 'mosaic'; pages?: [number, number] };

type PageRef = { doc: number; page: number };

const r1 = (v: number) => Math.round(v * 10) / 10;

function pathLen(pts: { x: number; y: number }[]): number {
  let L = 0;
  for (let i = 1; i < pts.length; i++) L += Math.hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y);
  return L;
}

/** Group the subpaths of one paint op back into the drawn path (recurrence works on whole paths). */
function opsOf(paths: IRPath[]): Map<number, IRPath[]> {
  const m = new Map<number, IRPath[]>();
  for (const p of paths) {
    const a = m.get(p.src.op);
    if (a) a.push(p);
    else m.set(p.src.op, [p]);
  }
  return m;
}

function recurrenceOffsets(doc: SourceDoc, from: number, to: number, colsHint?: number) {
  const shapes = new Map<string, { p: number; x: number; y: number }[]>();
  for (let p = from; p <= to; p++) {
    const pg = doc.pages[p];
    if (!pg) continue;
    for (const subs of opsOf(pg.paths).values()) {
      const pts = subs.flatMap((s) => s.pts);
      if (pts.length < 6 || pathLen(pts) < 150) continue;
      const x0 = pts[0].x;
      const y0 = pts[0].y;
      const key = pts.map((q) => `${(q.x - x0).toFixed(1)},${(q.y - y0).toFixed(1)}`).join(';');
      const occ = shapes.get(key);
      if (occ) occ.push({ p, x: x0, y: y0 });
      else shapes.set(key, [{ p, x: x0, y: y0 }]);
    }
  }
  const votes = new Map<string, Map<string, number>>();
  for (const occ of shapes.values()) {
    if (occ.length < 2 || occ.length > 6) continue;
    for (let i = 0; i < occ.length; i++)
      for (let j = i + 1; j < occ.length; j++) {
        const a = occ[i];
        const b = occ[j];
        if (a.p === b.p) continue;
        const k = `${a.p}|${b.p}`;
        const d = `${(b.x - a.x).toFixed(1)},${(b.y - a.y).toFixed(1)}`;
        const m = votes.get(k) ?? new Map<string, number>();
        votes.set(k, m);
        m.set(d, (m.get(d) ?? 0) + 1);
      }
  }
  const edges = new Map<number, { q: number; dx: number; dy: number }[]>();
  const add = (p: number, e: { q: number; dx: number; dy: number }) => {
    const a = edges.get(p);
    if (a) a.push(e);
    else edges.set(p, [e]);
  };
  for (const [k, m] of votes) {
    const [p, q] = k.split('|').map(Number);
    const sorted = [...m.entries()].sort((a, b) => b[1] - a[1]);
    const [best, n] = sorted[0];
    const total = [...m.values()].reduce((a, b) => a + b, 0);
    if (n < 2 || n < total * 0.6) continue;
    const [bx, by] = best.split(',').map(Number);
    add(p, { q, dx: -bx, dy: -by });
    add(q, { q: p, dx: bx, dy: by });
  }
  const off = new Map<number, { x: number; y: number; comp: number }>();
  const order = [...edges.keys()].sort((a, b) => edges.get(b)!.length - edges.get(a)!.length);
  for (const root of order) {
    if (off.has(root)) continue;
    off.set(root, { x: 0, y: 0, comp: root });
    const q = [root];
    while (q.length) {
      const p = q.shift()!;
      const o = off.get(p)!;
      for (const e of edges.get(p) ?? []) {
        if (off.has(e.q)) continue;
        off.set(e.q, { x: o.x + e.dx, y: o.y + e.dy, comp: o.comp });
        q.push(e.q);
      }
    }
  }
  // Index fallback for pages outside the main component (row-major on the main pitch).
  const comps = new Map<number, number[]>();
  for (const [p, o] of off) {
    const a = comps.get(o.comp);
    if (a) a.push(p);
    else comps.set(o.comp, [p]);
  }
  const main = [...comps.entries()].sort((a, b) => b[1].length - a[1].length)[0];
  const placed = new Map<number, { x: number; y: number }>();
  if (main) {
    const ps = main[1].sort((a, b) => a - b);
    const ux = [...new Set(ps.map((p) => Math.round(off.get(p)!.x)))].sort((a, b) => a - b);
    const uy = [...new Set(ps.map((p) => Math.round(off.get(p)!.y)))].sort((a, b) => a - b);
    const pitch = (u: number[]) => {
      const d: number[] = [];
      for (let i = 1; i < u.length; i++) if (u[i] - u[i - 1] > 20) d.push(u[i] - u[i - 1]);
      return d.length ? Math.min(...d) : 0;
    };
    const dx = pitch(ux);
    const dy = pitch(uy);
    const C = colsHint ?? (dx ? Math.round((ux[ux.length - 1] - ux[0]) / dx) + 1 : 1);
    const ref = ps[0];
    const ro = off.get(ref)!;
    // Row direction (down or up the sheet) is whichever predicts the linked pages best.
    const refCol = dx ? Math.round((ro.x - ux[0]) / dx) : 0;
    const predict = (sign: 1 | -1, p: number) => {
      const y0 = sign < 0 ? uy[uy.length - 1] : uy[0];
      const refRow = dy ? Math.round((sign * (ro.y - y0)) / dy) : 0;
      const i = refRow * C + refCol + (p - ref);
      const col = ((i % C) + C) % C;
      const row = Math.floor(i / C);
      return { x: ux[0] + col * dx, y: y0 + sign * row * dy };
    };
    const hits = (sign: 1 | -1) =>
      ps.filter((p) => {
        const q = predict(sign, p);
        const o = off.get(p)!;
        return Math.abs(q.x - o.x) < 2 && Math.abs(q.y - o.y) < 2;
      }).length;
    const sign: 1 | -1 = hits(-1) >= hits(1) ? -1 : 1;
    for (let p = from; p <= to; p++) {
      if (!doc.pages[p]) continue;
      const o = off.get(p);
      if (o && o.comp === main[0]) {
        placed.set(p, { x: o.x, y: o.y });
        continue;
      }
      placed.set(p, predict(sign, p));
    }
  }
  return placed;
}

/**
 * Edge-stitch pitch (Ф0 probe stitchVote): vertices near the right edge of page p against the left
 * edge of p+1 vote for dx (step 0.1); p against p+cols for dy. The global mode wins.
 */
function stitchPitch(doc: SourceDoc, from: number, to: number, cols: number) {
  const pts = (p: number) => (doc.pages[p]?.paths ?? []).filter((q) => q.pts.length >= 2).flatMap((q) => q.pts);
  const vote = (a: number, b: number, axis: 'x' | 'y', votes: Map<string, number>) => {
    const A = doc.pages[a];
    const B = doc.pages[b];
    if (!A || !B) return;
    const band = 40;
    const pa = pts(a).filter((q) => (axis === 'x' ? q.x > A.widthMm - band : q.y < band));
    const pb = pts(b).filter((q) => (axis === 'x' ? q.x < band : q.y > B.heightMm - band));
    const idx = new Map<number, { x: number; y: number }[]>();
    for (const q of pb) {
      const k = Math.round((axis === 'x' ? q.y : q.x) / 0.12);
      const arr = idx.get(k);
      if (arr) arr.push(q);
      else idx.set(k, [q]);
    }
    const size = axis === 'x' ? A.widthMm : A.heightMm;
    for (const q of pa) {
      const k = Math.round((axis === 'x' ? q.y : q.x) / 0.12);
      for (const kk of [k - 1, k, k + 1])
        for (const r of idx.get(kk) ?? []) {
          if (Math.abs((axis === 'x' ? q.y - r.y : q.x - r.x)) > 0.12) continue;
          const d = axis === 'x' ? q.x - r.x : r.y - q.y;
          if (d < size - band || d > size + 1) continue;
          const key = (Math.round(d * 10) / 10).toFixed(1);
          votes.set(key, (votes.get(key) ?? 0) + 1);
        }
    }
  };
  const vx = new Map<string, number>();
  const vy = new Map<string, number>();
  for (let p = from; p <= to; p++) {
    const i = p - from;
    if (i % cols !== cols - 1 && p + 1 <= to) vote(p, p + 1, 'x', vx);
    if (p + cols <= to) vote(p, p + cols, 'y', vy);
  }
  const top = (m: Map<string, number>) => Number([...m.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? 0);
  return { dx: top(vx), dy: top(vy) };
}

/** Build a Sheet from docs by translation only. Path ids are re-numbered sheet-wide; src kept. */
export function shimSheet(docs: SourceDoc[], layouts: ShimLayout[]): Sheet {
  const styles: Style[] = [];
  const styleKey = new Map<string, StyleId>();
  const paths: IRPath[] = [];
  const texts: IRText[] = [];
  const poses: PagePose[] = [];
  const seen = new Set<string>();
  let cursorX = 0;
  docs.forEach((doc, di) => {
    const L = layouts[di] ?? { kind: 'mosaic' };
    const from = 'pages' in L && L.pages ? L.pages[0] : 0;
    const to = 'pages' in L && L.pages ? L.pages[1] : doc.pages.length - 1;
    let offs = new Map<number, { x: number; y: number }>();
    if (L.kind === 'recurrence') offs = recurrenceOffsets(doc, from, to, L.cols);
    else if (L.kind === 'grid') {
      for (let p = from, i = 0; p <= to; p++, i++)
        offs.set(p, { x: (i % L.cols) * L.dx, y: -Math.floor(i / L.cols) * L.dy });
    } else if (L.kind === 'stitch') {
      const { dx, dy } = stitchPitch(doc, from, to, L.cols);
      for (let p = from, i = 0; p <= to; p++, i++) offs.set(p, { x: (i % L.cols) * dx, y: -Math.floor(i / L.cols) * dy });
    } else if (L.kind === 'cells') {
      for (const [p, row, col] of L.cells) offs.set(p, { x: col * L.dx, y: -row * L.dy });
    } else {
      let x = 0;
      for (let p = from; p <= to; p++) {
        offs.set(p, { x, y: 0 });
        x += (doc.pages[p]?.widthMm ?? 0) + 100;
      }
    }
    // shift this doc right of the previous one
    let minX = Infinity;
    let maxX = -Infinity;
    for (const [p, o] of offs) {
      const pg = doc.pages[p];
      if (!pg) continue;
      minX = Math.min(minX, o.x);
      maxX = Math.max(maxX, o.x + pg.widthMm);
    }
    const shiftX = Number.isFinite(minX) ? cursorX - minX : 0;
    cursorX += Number.isFinite(maxX) ? maxX - minX + 200 : 0;
    for (const [p, o] of offs) {
      const pg = doc.pages[p];
      if (!pg) continue;
      const ox = o.x + shiftX;
      const oy = o.y;
      poses.push({
        file: doc.file.id,
        page: p,
        toSheet: { a: 1, b: 0, c: 0, d: 1, e: ox, f: oy },
        residualMm: 0,
      });
      const local = new Map<StyleId, StyleId>();
      for (const s of pg.styles) {
        const k = JSON.stringify({ ...s, id: 0, clip: null });
        let id = styleKey.get(k);
        if (id === undefined) {
          id = styles.length;
          styles.push({ ...s, id, clip: null });
          styleKey.set(k, id);
        }
        local.set(s.id, id);
      }
      for (const subs of opsOf(pg.paths).values()) {
        const tr = subs.map((s) => s.pts.map((q) => ({ x: q.x + ox, y: q.y + oy })));
        const flat = tr.flat();
        const sid = local.get(subs[0].style)!;
        const key = `${sid}|${flat.length}|${r1(flat[0].x)},${r1(flat[0].y)}|${r1(flat[flat.length - 1].x)},${r1(flat[flat.length - 1].y)}|${r1(pathLen(flat))}`;
        if (L.kind !== 'mosaic') {
          if (seen.has(key)) continue;
          seen.add(key);
        }
        subs.forEach((s, k) => {
          paths.push({ id: paths.length, pts: tr[k], closed: s.closed, style: local.get(s.style)!, src: s.src });
        });
      }
      for (const t of pg.texts) {
        texts.push({
          ...t,
          id: texts.length,
          anchor: { x: t.anchor.x + ox, y: t.anchor.y + oy },
          bbox: { minX: t.bbox.minX + ox, minY: t.bbox.minY + oy, maxX: t.bbox.maxX + ox, maxY: t.bbox.maxY + oy },
        });
      }
    }
  });
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const p of paths)
    for (const q of p.pts) {
      if (q.x < minX) minX = q.x;
      if (q.y < minY) minY = q.y;
      if (q.x > maxX) maxX = q.x;
      if (q.y > maxY) maxY = q.y;
    }
  return {
    id: 0,
    poses,
    pairs: [],
    bbox: { minX, minY, maxX, maxY },
    missing: [],
    paths,
    texts,
    rasters: [],
    styles,
    warnings: ['F3 shim sheet (translation only) — replace with assemble/ when F2 lands'],
  };
}

// ─── SourceDoc cache (extraction of palto takes seconds; the probe re-runs often) ───────────────

export function cachePath(dir: string, name: string) {
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  return resolve(dir, `${name}.json`);
}
export function readCached(path: string): SourceDoc | null {
  if (!existsSync(path)) return null;
  return JSON.parse(readFileSync(path, 'utf8')) as SourceDoc;
}
export function writeCached(path: string, doc: SourceDoc) {
  writeFileSync(path, JSON.stringify(doc));
}

export type { PageRef };
