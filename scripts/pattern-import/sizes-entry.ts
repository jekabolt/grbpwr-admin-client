// PATTERN-IMPORT · F3 probe entry (bundled by sizes.mjs).
//   explore <sample>   style / text statistics of the shim sheet

import { detectSizeRun } from 'lib/pattern-import/sizes/detect';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { pathToFileURL } from 'node:url';

import {
  DEFAULT_EXTRACT_OPTS,
  extractPdf,
  setPdfjsLoader,
  type PdfjsModule,
} from 'lib/pattern-import/adapters/pdf';
import { extractRasterPdfDetailed, setRasterPdfjsLoader } from 'lib/pattern-import/adapters/raster';
import { buildChainsDetailed, rankOfClass } from 'lib/pattern-import/chains/build';
import { makeChains } from 'lib/pattern-import/chains/make';
import { describeSig } from 'lib/pattern-import/chains/motif';
import { resample, SegGrid } from 'lib/pattern-import/chains/geom';
import type { BoxMm, ChainSet, IRPath, PtMm, Sheet, SourceDoc } from 'lib/pattern-import/types';
import { PATIMPORT } from 'lib/pattern-import/types';

import { renderPng, PALETTE } from './sizes-render';
import { assembleSheet, classifyPages } from 'lib/pattern-import/assemble';

import { cachePath, readCached, shimSheet, writeCached, type ShimLayout } from './sizes-shim';

const REPO = process.env.PATIMPORT_REPO ?? process.cwd();
export const CORPUS =
  process.env.PATIMPORT_CORPUS ??
  '/Users/jekabolt/go/src/github.com/jekabolt/tmp/plans/pdf-to-dxf/corpus/';
export const REPORTS =
  process.env.PATIMPORT_REPORTS ??
  '/Users/jekabolt/go/src/github.com/jekabolt/tmp/plans/pdf-to-dxf/reports/';
const CACHE = process.env.PATIMPORT_CACHE ?? resolve(tmpdir(), 'patimport-f3-cache');
const LEGACY = pathToFileURL(resolve(REPO, 'node_modules/pdfjs-dist/legacy/build/pdf.mjs')).href;
setPdfjsLoader(() => import(LEGACY) as Promise<PdfjsModule>);
setRasterPdfjsLoader(() => import(LEGACY) as never);

export type Sample = { id: string; files: string[]; layouts: ShimLayout[]; raster?: boolean };

export const SAMPLES: Sample[] = [
  { id: 'palto', files: ['palto.pdf'], layouts: [{ kind: 'recurrence', pages: [2, 36] }] },
  {
    id: 'viola',
    files: ['viola.pdf'],
    layouts: [{ kind: 'grid', pages: [0, 34], cols: 6, dx: 195.9, dy: 259.4 }],
  },
  {
    id: 'kombinezon',
    files: ['kombinezon.pdf'],
    // Print Order map (p1): 35 pages 5 wide × 7 high, then 9 pages 3 × 3 under columns 1–3.
    layouts: [
      {
        kind: 'cells',
        dx: 190,
        dy: 280,
        cells: Array.from({ length: 44 }, (_, p): [number, number, number] =>
          p < 35 ? [p, Math.floor(p / 5), p % 5] : [p, 7 + Math.floor((p - 35) / 3), (p - 35) % 3],
        ),
      },
    ],
  },
  // reef: tiles p4–35, rows A–F of 6/6/5/5/5/5 (K0 map); pitch by edge stitching on row A
  {
    id: 'reef',
    files: ['reef.pdf'],
    layouts: [{ kind: 'stitch', pages: [3, 34], cols: 6, rows: [6, 6, 5, 5, 5, 5] }],
  },
  // robe: tiles p12–32 are windows onto one drawing (recurrence 170 × 257, 7 per row)
  { id: 'robe', files: ['robe.pdf'], layouts: [{ kind: 'recurrence', pages: [11, 31], cols: 7 }] },
  // r4454: main sheet = pages 4–34, 8 per row (K0); the interfacing sheet (35–39) is left out
  { id: 'r4454', files: ['r4454.pdf'], layouts: [{ kind: 'stitch', pages: [3, 33], cols: 8 }] },
  { id: 'zhaket', files: ['zhaket.pdf'], layouts: [{ kind: 'recurrence', pages: [1, 28] }] },
  // leonie: raster (F11 traces it), 9 rows A–I × 3 columns, edge-stitched
  {
    id: 'leonie',
    files: ['leonie.pdf'],
    layouts: [{ kind: 'stitch', pages: [0, 26], cols: 3 }],
    raster: true,
  },
];

async function loadDoc(file: string, id: string, raster = false): Promise<SourceDoc> {
  const cp = cachePath(CACHE, file.replace(/\W+/g, '_') + (raster ? '_raster' : ''));
  const hit = readCached(cp);
  if (hit) return hit;
  const b = readFileSync(resolve(CORPUS, 'pdf', file));
  const bytes = b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength) as ArrayBuffer;
  const doc = raster
    ? (await extractRasterPdfDetailed({ id, name: file, bytes }, DEFAULT_EXTRACT_OPTS)).doc
    : await extractPdf({ id, name: file, bytes }, DEFAULT_EXTRACT_OPTS);
  writeCached(cp, doc);
  return doc;
}

const sheetCache = new Map<string, Sheet>();

export async function sheetOf(s: Sample): Promise<{ sheet: Sheet; docs: SourceDoc[] }> {
  const docs: SourceDoc[] = [];
  for (let i = 0; i < s.files.length; i++)
    docs.push(await loadDoc(s.files[i], String(i), s.raster));
  // F3b: the real F2 assembly (classifyPages → assembleSheet, tile sheet 0). SHIM=1 keeps the old
  // translation-only shim for comparison.
  if (process.env.SHIM) return { sheet: shimSheet(docs, s.layouts), docs };
  const key = `${s.id}${s.raster ? '_raster' : ''}`;
  const hit = sheetCache.get(key);
  if (hit) return { sheet: hit, docs };
  const sheet = assembleSheet(docs, classifyPages(docs), 0);
  sheetCache.set(key, sheet);
  return { sheet, docs };
}

async function explore(id: string) {
  const s = SAMPLES.find((x) => x.id === id);
  if (!s) throw new Error(`no sample ${id}`);
  const t0 = Date.now();
  const { sheet } = await sheetOf(s);
  const b = sheet.bbox;
  console.log(
    `${id}: paths=${sheet.paths.length} texts=${sheet.texts.length} sheet ${(b.maxX - b.minX).toFixed(0)}×${(b.maxY - b.minY).toFixed(0)} (${Date.now() - t0} ms)`,
  );
  const st = new Map<number, { n: number; len: number; ops: Set<string> }>();
  for (const p of sheet.paths) {
    let L = 0;
    for (let i = 1; i < p.pts.length; i++)
      L += Math.hypot(p.pts[i].x - p.pts[i - 1].x, p.pts[i].y - p.pts[i - 1].y);
    const e = st.get(p.style) ?? { n: 0, len: 0, ops: new Set<string>() };
    e.n++;
    e.len += L;
    e.ops.add(`${p.src.page}:${p.src.op}`);
    st.set(p.style, e);
  }
  const rows = [...st.entries()].sort((a, b) => b[1].len - a[1].len).slice(0, 30);
  for (const [sid, e] of rows) {
    const S = sheet.styles[sid];
    console.log(
      `  s${sid} rgb=${S.strokeRgb?.join(',')} w=${S.widthMm.toFixed(2)} dash=${S.dash ? S.dash.map((v) => v.toFixed(2)).join('/') : '-'} layer=${S.layer} fill=${S.fill} subs=${e.n} ops=${e.ops.size} len=${(e.len / 1000).toFixed(1)}m`,
    );
  }
  if (process.env.POSES)
    console.log(
      sheet.poses
        .map((q) => `p${q.page}:(${q.toSheet.e.toFixed(1)},${q.toSheet.f.toFixed(1)})`)
        .join(' '),
    );
  const tx = sheet.texts
    .slice(0, 400)
    .map((t) => t.text.trim())
    .filter(Boolean);
  console.log('  texts:', [...new Set(tx)].slice(0, 120).join(' | '));
}

async function zoom(id: string, args: string[]) {
  const s = SAMPLES.find((x) => x.id === id)!;
  const { sheet } = await sheetOf(s);
  const [x0, y0, w, h, px] = args.map(Number);
  const b = sheet.bbox;
  const box = process.env.ABS
    ? { minX: x0, minY: y0, maxX: x0 + w, maxY: y0 + h }
    : { minX: b.minX + x0, minY: b.maxY - y0 - h, maxX: b.minX + x0 + w, maxY: b.maxY - y0 };
  const rgbHex = (st: { strokeRgb?: number[] | null; fillRgb?: number[] | null }) => {
    const c = st.strokeRgb ?? st.fillRgb;
    return c ? '#' + c.map((v) => Math.round(v).toString(16).padStart(2, '0')).join('') : '#000';
  };
  const strokes = sheet.paths.map((p) => ({
    pts: p.pts,
    // RGB=1: the drawing's own colours (leonie) instead of a palette per style
    color: process.env.RGB
      ? rgbHex(sheet.styles[p.style] as never)
      : PALETTE[p.style % PALETTE.length],
    width: 1,
  }));
  const labels = sheet.texts.map((t) => ({ at: t.anchor, text: t.text, color: '#000', size: 10 }));
  const out = `${process.env.OUT ?? '/tmp'}/${id}-zoom.png`;
  renderPng(
    out,
    box,
    strokes,
    labels,
    px || 1,
    process.env.ABS
      ? []
      : sheet.styles
          .map((st) => ({
            color: PALETTE[st.id % PALETTE.length],
            text: `s${st.id} w${st.widthMm.toFixed(2)} ${st.dash?.map((v) => v.toFixed(2)).join('/') ?? ''} ${st.layer ?? ''}${st.fill ? ' fill' : ''}`,
          }))
          .slice(0, 20),
  );
  console.log(out);
}

export const OPTS = {
  joinGapMm: PATIMPORT.joinGapMm,
  joinAngleDeg: PATIMPORT.joinAngleDeg,
  joinLateralMm: PATIMPORT.joinLateralMm,
};

async function chainsMode(id: string, args: string[]) {
  const s = SAMPLES.find((x) => x.id === id)!;
  const { sheet } = await sheetOf(s);
  const t0 = Date.now();
  const cb = makeChains(sheet, OPTS);
  console.log(
    `${id}: chains=${cb.chains.length} items=${cb.stats.items} freeBeads=${cb.stats.freeBeads} ignored=${cb.stats.ignoredPaths} in ${Date.now() - t0} ms`,
  );
  const hist = new Map<string, { n: number; len: number }>();
  cb.chains.forEach((c, i) => {
    if (c.lengthMm < 20) return;
    const k = describeSig(cb.sigs[i]);
    const e = hist.get(k) ?? { n: 0, len: 0 };
    e.n++;
    e.len += c.lengthMm;
    hist.set(k, e);
  });
  for (const [k, e] of [...hist].sort((a, b) => b[1].len - a[1].len).slice(0, 40))
    console.log(`  ${(e.len / 1000).toFixed(2).padStart(7)} m ${String(e.n).padStart(5)}  ${k}`);
  if (process.env.LOOK) {
    const b = sheet.bbox;
    cb.chains.forEach((c, i) => {
      if (c.lengthMm < 20 || !describeSig(cb.sigs[i]).includes(process.env.LOOK!)) return;
      const m = c.pts[Math.floor(c.pts.length / 2)];
      console.log(
        `  look@ chain ${i} len=${c.lengthMm.toFixed(0)} mid (${(m.x - b.minX).toFixed(0)},${(b.maxY - m.y).toFixed(0)}) ${describeSig(cb.sigs[i])}`,
      );
    });
  }
  const [x0, y0, w, h, px] = args.map(Number);
  if (args.length >= 4) {
    const b = sheet.bbox;
    const box = {
      minX: b.minX + x0,
      minY: b.maxY - y0 - h,
      maxX: b.minX + x0 + w,
      maxY: b.maxY - y0,
    };
    const strokes = cb.chains.map((c) => ({
      pts: c.pts,
      color: PALETTE[(c.id * 7 + (c.id >> 3)) % PALETTE.length],
      width: 1.2,
    }));
    const labels = cb.chains
      .filter((c) => c.lengthMm > 30)
      .map((c) => ({
        at: c.pts[Math.floor(c.pts.length / 2)],
        text: `${c.id}`,
        color: PALETTE[(c.id * 7) % PALETTE.length],
        size: 9,
      }));
    const out = `${process.env.OUT ?? '/tmp'}/${id}-chains.png`;
    renderPng(out, box, strokes, labels, px || 1);
    console.log(out);
  }
}

function docTexts(docs: SourceDoc[]): string[] {
  return docs.flatMap((d) => d.pages.flatMap((p) => p.texts.map((t) => t.text)));
}

async function runSample(id: string, mutate?: (sheet: Sheet) => Sheet) {
  const s = SAMPLES.find((x) => x.id === id)!;
  const got = await sheetOf(s);
  const docs = got.docs;
  const sheet = mutate ? mutate(got.sheet) : got.sheet;
  const t0 = Date.now();
  const fileNames = new Map(docs.map((d) => [d.file.id, d.file.name]));
  const { set, recover } = buildChainsDetailed(sheet, OPTS, {
    extraTexts: docTexts(docs),
    fileNames,
  });
  const ms = Date.now() - t0;
  return { s, sheet, docs, set, recover, ms };
}

async function sizesMode(id: string, args: string[]) {
  const { sheet, set, recover, ms } = await runSample(id);
  console.log(`${id}: ${recover.encoding} n=${recover.n} chains=${set.chains.length} in ${ms} ms`);
  console.log('  diag', JSON.stringify(recover.diag));
  for (const c of set.classes) {
    const r = rankOfClass(c);
    console.log(
      `  class ${c.id} ${c.role}${r !== null ? ` r${r}` : ''} label=${c.sizeLabel} chains=${c.chains.length} len=${(c.totalLengthMm / 1000).toFixed(2)}m conf=${c.confidence} ev=${c.evidence.map((e) => e.kind).join(',')}`,
    );
  }
  console.log(`  bundles=${set.bundles.length} orphans=${set.orphans.length}`);
  if (process.env.AT) {
    const mk = makeChains(sheet, OPTS);
    for (const xy of process.env.AT.split(';')) {
      const [ax, ay] = xy.split(',').map(Number);
      const P = { x: sheet.bbox.minX + ax, y: sheet.bbox.maxY - ay };
      const segD = (c: { pts: PtMm[] }) => {
        let m = Infinity;
        for (let i = 0; i + 1 < c.pts.length; i++) {
          const a = c.pts[i];
          const b = c.pts[i + 1];
          const L2 = (b.x - a.x) ** 2 + (b.y - a.y) ** 2 || 1e-12;
          const t = Math.max(
            0,
            Math.min(1, ((P.x - a.x) * (b.x - a.x) + (P.y - a.y) * (b.y - a.y)) / L2),
          );
          m = Math.min(m, Math.hypot(a.x + t * (b.x - a.x) - P.x, a.y + t * (b.y - a.y) - P.y));
        }
        return m;
      };
      const near = set.chains
        .map((c) => ({ c, d: segD(c) }))
        .sort((a, b) => a.d - b.d)
        .slice(0, 4);
      for (const { c, d } of near) {
        const cls = set.classes.find((k) => k.chains.includes(c.id));
        const e0 = c.pts[0];
        const e1 = c.pts[c.pts.length - 1];
        const rel = (q: { x: number; y: number }) =>
          `(${(q.x - sheet.bbox.minX).toFixed(0)},${(sheet.bbox.maxY - q.y).toFixed(0)})`;
        console.log(
          `  @${xy} chain ${c.id} d=${d.toFixed(1)} len=${c.lengthMm.toFixed(0)} class=${cls?.id}:${cls?.role}${cls ? rankOfClass(cls) ?? '' : ''} ends ${rel(e0)}→${rel(e1)} motif=${c.motif?.join('/')} look=${c.id < mk.sigs.length ? describeSig(mk.sigs[c.id]) : '-'} rgb=${sheet.styles[c.style]?.strokeRgb?.join(',')}`,
        );
      }
    }
  }
  if (process.env.HLINE) {
    // chains crossing a horizontal probe "y,x0,x1" (sheet top-left mm), left to right
    const [hy, hx0, hx1] = process.env.HLINE.split(',').map(Number);
    const Y = sheet.bbox.maxY - hy;
    const X0 = sheet.bbox.minX + hx0;
    const X1 = sheet.bbox.minX + hx1;
    const hits: { x: number; c: number }[] = [];
    set.chains.forEach((c) => {
      for (let i = 0; i + 1 < c.pts.length; i++) {
        const a = c.pts[i];
        const q = c.pts[i + 1];
        if ((a.y - Y) * (q.y - Y) > 0 || a.y === q.y) continue;
        const x = a.x + ((Y - a.y) * (q.x - a.x)) / (q.y - a.y);
        if (x >= X0 && x <= X1) hits.push({ x, c: c.id });
      }
    });
    hits.sort((a, b) => a.x - b.x);
    for (const h of hits) {
      const c = set.chains[h.c];
      const cls = set.classes.find((k) => k.chains.includes(c.id));
      console.log(
        `  x=${(h.x - sheet.bbox.minX).toFixed(1)} chain ${c.id} len=${c.lengthMm.toFixed(0)} ${cls?.role ?? (set.orphans.includes(c.id) ? 'ORPHAN' : '-')}${cls ? rankOfClass(cls) ?? '' : ''} rgb=${sheet.styles[c.style]?.strokeRgb?.join(',')} w=${sheet.styles[c.style]?.widthMm.toFixed(2)}`,
      );
    }
  }
  for (const a of set.ambiguities ?? []) console.log(`  ? ${a.kind}: ${a.message}`);
  const b = sheet.bbox;
  const [x0, y0, w, h, px] =
    args.length >= 4 ? args.map(Number) : [0, 0, b.maxX - b.minX, b.maxY - b.minY, 0.6];
  const box = {
    minX: b.minX + x0,
    minY: b.maxY - y0 - h,
    maxX: b.minX + x0 + w,
    maxY: b.maxY - y0,
  };
  const out = `${process.env.OUT ?? '/tmp'}/${id}-sizes.png`;
  overlay(set, box, px || 0.6, out);
  console.log(out);
}

export function overlay(set: ChainSet, box: BoxMm, px: number, out: string) {
  const classOf = new Map<number, number>();
  for (const c of set.classes) for (const ch of c.chains) classOf.set(ch, c.id);
  const orph = new Set(set.orphans);
  const strokes = set.chains.map((c) => {
    const k = classOf.get(c.id);
    const cls = k !== undefined ? set.classes[k] : null;
    const r = cls ? rankOfClass(cls) : null;
    const color =
      r !== null
        ? PALETTE[r % PALETTE.length]
        : cls?.role === 'common'
          ? cls.evidence.length
            ? '#000'
            : '#555'
          : cls?.role === 'internal' || cls?.role === 'notch'
            ? '#9ab'
            : orph.has(c.id)
              ? '#ff00ff'
              : '#e4e4e4';
    return {
      pts: c.pts,
      color,
      width: r !== null ? 1.4 : cls?.role === 'common' ? 1.6 : orph.has(c.id) ? 1.4 : 0.8,
      dash: cls?.role === 'common' && cls.evidence.length ? '6 3' : undefined,
    };
  });
  const z = (st: { color: string }) => (st.color === '#e4e4e4' ? 0 : st.color === '#9ab' ? 1 : 2);
  strokes.sort((a, b) => z(a) - z(b));
  const legend = set.classes
    .filter((c) => c.role === 'size')
    .map((c) => ({
      color: PALETTE[rankOfClass(c)! % PALETTE.length],
      text: `r${rankOfClass(c)} ${c.sizeLabel ?? '?'} ${(c.totalLengthMm / 1000).toFixed(1)}m`,
    }));
  legend.push(
    { color: '#555', text: 'common' },
    { color: '#000', text: 'shared (drawn as a size)' },
    { color: '#ff00ff', text: 'unassigned size line' },
  );
  renderPng(out, box, strokes, [], px, legend);
}

export async function main(argv: string[]): Promise<number> {
  const [mode, ...rest] = argv;
  if (!mode || mode === 'all' || mode === 'report') {
    await reportMode(rest.length ? rest : SAMPLES.map((x) => x.id));
    return 0;
  }
  if (mode === 'sizes') {
    await sizesMode(rest[0], rest.slice(1));
    return 0;
  }
  if (mode === 'chains') {
    await chainsMode(rest[0], rest.slice(1));
    return 0;
  }
  if (mode === 'zoom') {
    await zoom(rest[0], rest.slice(1));
    return 0;
  }
  if (mode === 'texts') {
    // texts matching a regex, with sheet-relative (top-left) positions
    const s = SAMPLES.find((x) => x.id === rest[0])!;
    const { sheet } = await sheetOf(s);
    const re = new RegExp(rest[1] ?? '.', 'i');
    const b = sheet.bbox;
    for (const t of sheet.texts)
      if (re.test(t.text))
        console.log(
          `${JSON.stringify(t.text)} @ ${(t.anchor.x - b.minX).toFixed(0)},${(b.maxY - t.anchor.y).toFixed(0)} p${t.src?.page ?? '?'}`,
        );
    return 0;
  }
  if (mode === 'near') {
    // styles of the paths in a sheet-relative box (top-left origin): near <id> x y w h
    const s = SAMPLES.find((x) => x.id === rest[0])!;
    const { sheet } = await sheetOf(s);
    const [x0, y0, w, h] = rest.slice(1).map(Number);
    const b = sheet.bbox;
    const box = {
      minX: b.minX + x0,
      maxX: b.minX + x0 + w,
      minY: b.maxY - y0 - h,
      maxY: b.maxY - y0,
    };
    const st = new Map<number, { n: number; len: number; y: number[] }>();
    for (const p of sheet.paths) {
      if (
        !p.pts.every(
          (q) => q.x >= box.minX && q.x <= box.maxX && q.y >= box.minY && q.y <= box.maxY,
        )
      )
        continue;
      let L = 0;
      for (let i = 1; i < p.pts.length; i++)
        L += Math.hypot(p.pts[i].x - p.pts[i - 1].x, p.pts[i].y - p.pts[i - 1].y);
      const e = st.get(p.style) ?? { n: 0, len: 0, y: [] };
      e.n++;
      e.len += L;
      e.y.push(Math.round(b.maxY - p.pts[0].y));
      if (process.env.SHAPES) {
        const xs = p.pts.map((q) => q.x);
        const ys = p.pts.map((q) => q.y);
        console.log(
          `  s${p.style} closed=${p.closed} n=${p.pts.length} w=${(Math.max(...xs) - Math.min(...xs)).toFixed(2)} h=${(Math.max(...ys) - Math.min(...ys)).toFixed(2)} L=${L.toFixed(2)} at ${(p.pts[0].x - b.minX).toFixed(1)},${(b.maxY - p.pts[0].y).toFixed(1)}`,
        );
      }
      st.set(p.style, e);
    }
    for (const [sid, e] of st) {
      const S = sheet.styles[sid];
      console.log(
        `s${sid} rgb=${S.strokeRgb?.join(',')} w=${S.widthMm.toFixed(2)} dash=${S.dash?.map((v) => v.toFixed(2)).join('/') ?? '-'} fill=${S.fill} n=${e.n} len=${e.len.toFixed(1)} y=${[...new Set(e.y)].slice(0, 8).join(',')}`,
      );
    }
    return 0;
  }
  if (mode === 'pieces') {
    // histogram of open stroke lengths per style width (0.25 mm bins): pieces <id> [minW] [maxW]
    const s = SAMPLES.find((x) => x.id === rest[0])!;
    const { sheet } = await sheetOf(s);
    const [w0, w1] = [Number(rest[1] ?? 0), Number(rest[2] ?? 9)];
    const h = new Map<string, number>();
    for (const p of sheet.paths) {
      const st = sheet.styles[p.style];
      if (st.widthMm < w0 || st.widthMm > w1 || p.closed) continue;
      let L = 0;
      for (let i = 1; i < p.pts.length; i++)
        L += Math.hypot(p.pts[i].x - p.pts[i - 1].x, p.pts[i].y - p.pts[i - 1].y);
      const k = `w${st.widthMm.toFixed(2)} ${st.fill ? 'F' : ''}${st.dash ? 'D' : ''} L${(Math.round(L * 4) / 4).toFixed(2)}`;
      h.set(k, (h.get(k) ?? 0) + 1);
    }
    for (const [k, v] of [...h].sort((a, b) => b[1] - a[1]).slice(0, 40)) console.log(v, k);
    return 0;
  }
  if (mode === 'explore') {
    for (const id of rest) await explore(id);
    return 0;
  }
  console.log('usage: explore <sample…>');
  return 1;
}

// ─────────────────────────────────────────────────────────────────────────────────────────────
// Report: every sample, acceptance numbers, overlays, negative controls
// ─────────────────────────────────────────────────────────────────────────────────────────────

type Truth = { samples: { id: string; sizes: { list: string[] | string; count?: number } }[] };

function rng(seed: number) {
  let x = seed >>> 0 || 1;
  return () => {
    x ^= x << 13;
    x ^= x >>> 17;
    x ^= x << 5;
    return (x >>> 0) / 4294967296;
  };
}
function shuffled<T>(a: T[], r: () => number): T[] {
  const b = a.slice();
  for (let i = b.length - 1; i > 0; i--) {
    const j = Math.floor(r() * (i + 1));
    [b[i], b[j]] = [b[j], b[i]];
  }
  return b;
}

/** Negative control A (rhythm): every dashed contour path is re-dashed with ANOTHER path's rhythm. */
function redashShuffle(sheet: Sheet, seed: number): Sheet {
  const ops = new Map<string, IRPath[]>();
  for (const p of sheet.paths) {
    const k = `${p.src.file}|${p.src.page}|${p.src.op}`;
    const a = ops.get(k);
    if (a) a.push(p);
    else ops.set(k, [p]);
  }
  const dashed = [...ops.entries()].filter(
    ([, a]) => a.length >= 20 && (sheet.styles[a[0].style]?.widthMm ?? 0) >= 0.3,
  );
  const d = (a: PtMm, b: PtMm) => Math.hypot(a.x - b.x, a.y - b.y);
  const lineOf = (subs: IRPath[]) => {
    const pts: PtMm[] = [];
    const rhythm: number[] = [];
    let last: PtMm | null = null;
    for (const s of subs.slice().sort((x, y) => x.src.sub - y.src.sub)) {
      let q = s.pts;
      if (last && d(last, q[q.length - 1]) < d(last, q[0])) q = q.slice().reverse();
      if (last) rhythm.push(d(last, q[0]));
      let L = 0;
      for (let i = 1; i < q.length; i++) L += d(q[i - 1], q[i]);
      rhythm.push(L);
      pts.push(...q);
      last = q[q.length - 1];
    }
    return { pts, rhythm: rhythm.slice(1) };
  };
  const lines = dashed.map(([k, subs]) => ({ k, subs, ...lineOf(subs) }));
  const perm = shuffled(lines, rng(seed));
  const replaced = new Map<string, IRPath[]>();
  lines.forEach((ln, i) => {
    const donor = perm[i].rhythm.filter((x) => x > 0.01);
    if (donor.length < 2) return;
    // cut ln.pts by donor's (dash, gap, dash, gap …) cyclically
    const out: IRPath[] = [];
    let k = 0;
    let draw = true;
    let left = donor[0];
    let cur: PtMm[] = [ln.pts[0]];
    for (let j = 1; j < ln.pts.length; j++) {
      let a = ln.pts[j - 1];
      const b = ln.pts[j];
      let seg = d(a, b);
      while (seg > left) {
        const t = left / seg;
        const m = { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t };
        if (draw) {
          cur.push(m);
          if (cur.length >= 2)
            out.push({
              ...ln.subs[0],
              pts: cur,
              closed: false,
              src: { ...ln.subs[0].src, sub: out.length },
            });
        }
        cur = [m];
        seg -= left;
        a = m;
        draw = !draw;
        k++;
        left = donor[k % donor.length];
      }
      left -= seg;
      if (draw) cur.push(b);
      else cur = [b];
    }
    if (draw && cur.length >= 2)
      out.push({
        ...ln.subs[0],
        pts: cur,
        closed: false,
        src: { ...ln.subs[0].src, sub: out.length },
      });
    replaced.set(ln.k, out);
  });
  const paths: IRPath[] = [];
  const done = new Set<string>();
  for (const p of sheet.paths) {
    const k = `${p.src.file}|${p.src.page}|${p.src.op}`;
    if (replaced.has(k)) {
      if (!done.has(k)) for (const q of replaced.get(k)!) paths.push({ ...q, id: paths.length });
      done.add(k);
    } else paths.push({ ...p, id: paths.length });
  }
  return { ...sheet, paths };
}

/** Negative control B (declared dash): each dashed path gets a random dash pattern of the file. */
function dashShuffle(sheet: Sheet, seed: number): Sheet {
  const r = rng(seed);
  const dashedStyles = sheet.styles.filter(
    (s) => s.dash && s.dash.some((v) => v > 0.01) && s.widthMm >= 0.3,
  );
  const styles = sheet.styles.slice();
  const paths = sheet.paths.map((p) => {
    const st = sheet.styles[p.style];
    if (!st?.dash || !dashedStyles.includes(st)) return p;
    const pick = dashedStyles[Math.floor(r() * dashedStyles.length)];
    return { ...p, style: pick.id };
  });
  return { ...sheet, styles, paths };
}

/** op key → majority rank (for comparing a run with its negative control). */
function rankByOp(sheet: Sheet, set: ChainSet): Map<string, number> {
  const opOf = new Map(sheet.paths.map((p) => [p.id, `${p.src.file}|${p.src.page}|${p.src.op}`]));
  const votes = new Map<string, Map<number, number>>();
  for (const c of set.classes) {
    const r = rankOfClass(c);
    if (r === null) continue;
    for (const id of c.chains)
      for (const rg of set.chains[id].ranges) {
        const k = opOf.get(rg.path);
        if (!k) continue;
        const m = votes.get(k) ?? new Map<number, number>();
        m.set(r, (m.get(r) ?? 0) + set.chains[id].lengthMm);
        votes.set(k, m);
      }
  }
  const out = new Map<string, number>();
  for (const [k, m] of votes) out.set(k, [...m.entries()].sort((a, b) => b[1] - a[1])[0][0]);
  return out;
}

/**
 * Shared-line false positives (proxy, no per-line truth). A stretch split off as shared ("drawn
 * once in one size's style, used by all") must sit where the sizes have converged. Two ways it is
 * a size line misread as shared:
 *  - inside a group: parallel line work on BOTH sides within `reachMm` (2.5 × the median spacing
 *    between neighbouring sizes), a size / shared line on at least one side, along ≥ half its length;
 *  - in a ladder: graded ends of a band (reef's hem bands, one end per size 50 mm apart) — on both
 *    sides within 60 mm a parallel size / shared chain of similar length (±30 %), along ≥ 60 %.
 */
export function sharedFalsePositives(set: ChainSet, reachMm: number) {
  const sizeIds = new Set<number>();
  for (const c of set.classes) if (c.role === 'size') for (const id of c.chains) sizeIds.add(id);
  const grid = new SegGrid(8);
  const shared = set.classes
    .filter((c) => c.role === 'common' && c.evidence.length)
    .flatMap((c) => c.chains)
    .filter((id) => set.chains[id].lengthMm >= 30);
  // neighbours: every line work chain — in a misread group the other sizes may be shared too
  const lineWork = set.classes
    .filter((c) => c.role !== 'ignore' && c.role !== 'notch')
    .flatMap((c) => c.chains)
    .concat(set.orphans)
    .filter((id) => set.chains[id].lengthMm >= 20);
  for (const id of lineWork) grid.addPolyline(id, set.chains[id].pts);
  const sizeSet = new Set([...sizeIds, ...shared]);
  /** Nearest parallel chain crossed by the ray p + u·n, u ∈ (0.25, reach]. */
  const firstHit = (self: number, p: PtMm, n: PtMm, t: PtMm, reach: number) => {
    let best = -1;
    let bu = Infinity;
    const mid = { x: p.x + (n.x * reach) / 2, y: p.y + (n.y * reach) / 2 };
    grid.near(mid, reach / 2 + 1, (j, si) => {
      if (j === self) return;
      const a = set.chains[j].pts[si];
      const b = set.chains[j].pts[si + 1];
      const sx = b.x - a.x;
      const sy = b.y - a.y;
      const den = n.x * sy - n.y * sx;
      if (Math.abs(den) < 1e-12) return;
      const qx = a.x - p.x;
      const qy = a.y - p.y;
      const u = (qx * sy - qy * sx) / den;
      const v = (qx * n.y - qy * n.x) / den;
      if (v < 0 || v > 1 || u <= 0.25 || u > reach || u >= bu) return;
      const L = Math.hypot(sx, sy) || 1;
      if (Math.abs((t.x * sx + t.y * sy) / L) >= 0.8) {
        best = j;
        bu = u;
      }
    });
    return best;
  };
  const fp: number[] = [];
  let inGroup = 0;
  let ladder = 0;
  for (const id of shared) {
    const L0 = set.chains[id].lengthMm;
    const smp = resample(set.chains[id].pts, 5);
    let both = 0;
    let rungs = 0;
    for (const s of smp) {
      const nrm = { x: -s.t.y, y: s.t.x };
      const neg = { x: -nrm.x, y: -nrm.y };
      const a = firstHit(id, s.p, nrm, s.t, reachMm);
      const b = firstHit(id, s.p, neg, s.t, reachMm);
      if (a >= 0 && b >= 0 && (sizeSet.has(a) || sizeSet.has(b))) both++;
      const similar = (j: number) =>
        j >= 0 && sizeSet.has(j) && Math.abs(set.chains[j].lengthMm - L0) <= 0.3 * L0;
      if (similar(firstHit(id, s.p, nrm, s.t, 60)) && similar(firstHit(id, s.p, neg, s.t, 60)))
        rungs++;
    }
    const g = smp.length > 0 && both >= 0.5 * smp.length;
    const l = smp.length > 0 && rungs >= 0.6 * smp.length;
    if (g) inGroup++;
    else if (l) ladder++;
    if (g || l) fp.push(id);
  }
  return {
    shared: shared.length,
    sharedM: +(shared.reduce((a, i) => a + set.chains[i].lengthMm, 0) / 1000).toFixed(2),
    falsePositives: fp.length,
    inGroup,
    ladder,
    falsePositiveM: +(fp.reduce((a, i) => a + set.chains[i].lengthMm, 0) / 1000).toFixed(2),
    reachMm: +reachMm.toFixed(1),
  };
}

function summarise(
  id: string,
  set: ChainSet,
  recover: Awaited<ReturnType<typeof runSample>>['recover'],
  ms: number,
  truth?: Truth['samples'][number],
) {
  const sizes = set.classes.filter((c) => c.role === 'size');
  const sizeLen = sizes.reduce((a, c) => a + c.totalLengthMm, 0);
  const orphanLen = set.orphans.reduce((a, i) => a + set.chains[i].lengthMm, 0);
  const shared = set.classes.filter((c) => c.role === 'common' && c.evidence.length);
  // graded runs: contract bundles that share a chain are one run along a piece outline
  const parent = set.bundles.map((_, i) => i);
  const find = (i: number): number => (parent[i] === i ? i : (parent[i] = find(parent[i])));
  const owner = new Map<number, number>();
  set.bundles.forEach((b, i) => {
    for (const c of b.chains) {
      if (owner.has(c)) parent[find(i)] = find(owner.get(c)!);
      else owner.set(c, i);
    }
  });
  const runs = new Set(set.bundles.map((_, i) => find(i))).size;
  const truthList = truth ? (Array.isArray(truth.sizes.list) ? truth.sizes.list : null) : null;
  const truthN = truthList ? truthList.length : truth?.sizes.count ?? null;
  const labels = sizes.map((c) => c.sizeLabel);
  return {
    id,
    encoding: recover.encoding,
    n: recover.n,
    truthN,
    truthLabels: truthList,
    labels,
    labelsMatchTruth: truthList
      ? truthList.length === labels.length && truthList.every((l, k) => labels[k] === l)
      : null,
    nonEmptyClasses: sizes.filter((c) => c.chains.length).length,
    // a class "filled" carries real line work (≥ 0.25 m), not a stray fragment
    filledClasses: sizes.filter((c) => c.totalLengthMm >= 250).length,
    classes: sizes.map((c) => ({
      rank: rankOfClass(c),
      label: c.sizeLabel,
      chains: c.chains.length,
      lengthM: +(c.totalLengthMm / 1000).toFixed(2),
      confidence: c.confidence,
      evidence: [...new Set(c.evidence.map((e) => e.kind))],
    })),
    bundles: set.bundles.length,
    gradedRuns: runs,
    bundlesOfPresentRanks: recover.diag.bundlesOfPresentRanks ?? null,
    unassignedShare: +(orphanLen / Math.max(1, sizeLen + orphanLen)).toFixed(3),
    sharedM: +(shared.reduce((a, c) => a + c.totalLengthMm, 0) / 1000).toFixed(2),
    // reach: 2.5 × the median spacing between neighbouring sizes (12…35 mm)
    sharedCheck: sharedFalsePositives(
      set,
      // FP_REACH='{"reef":31.8}' replays a reach (comparing against an older build without diag)
      (JSON.parse(process.env.FP_REACH ?? '{}') as Record<string, number>)[id] ??
        Math.min(
          35,
          Math.max(
            12,
            2.5 * ((recover.diag.laneSpacing as { median?: number } | undefined)?.median ?? 0),
          ),
        ),
    ),
    landings: recover.diag.landings,
    bridges: recover.diag.bridges,
    ambiguities: (set.ambiguities ?? []).map((a) => `${a.kind}: ${a.message}`),
    ms,
    diag: {
      n: recover.diag.n,
      insideVote: recover.diag.insideVote,
      legend: recover.diag.legend,
      legendRemap: recover.diag.legendRemap,
      nestingCheck: recover.diag.nestingCheck,
    },
  };
}

export async function reportMode(ids: string[]) {
  const shots = resolve(REPORTS, process.env.SHIM ? 'F3b-shots-shim' : 'F3b-shots');
  mkdirSync(shots, { recursive: true });
  const truth = JSON.parse(readFileSync(resolve(CORPUS, 'truth.json'), 'utf8')) as Truth;
  const truthOf: Record<string, string> = {
    r4454: 'r4454',
    palto: 'palto',
    viola: 'viola',
    kombinezon: 'kombinezon',
    reef: 'reef',
    robe: 'robe',
    zhaket: 'zhaket',
    leonie: 'leonie',
  };
  const out: Record<string, unknown> = {};
  const summaries: (ReturnType<typeof summarise> & { sizeRun?: unknown })[] = [];
  for (const id of ids) {
    const { sheet, set, recover, ms } = await runSample(id);
    const sm = summarise(
      id,
      set,
      recover,
      ms,
      truth.samples.find((t) => t.id === truthOf[id]),
    );
    const run = detectSizeRun(sheet, set, []);
    summaries.push({
      ...sm,
      sizeRun: {
        encoding: run.encoding,
        labels: run.sizes.map((x) => x.label),
        evidence: run.evidence.slice(0, 6),
      },
    });
    const b = sheet.bbox;
    const W = b.maxX - b.minX;
    const H = b.maxY - b.minY;
    const px = Math.min(0.8, 2400 / Math.max(W, H));
    overlay(set, b, px, resolve(shots, `${id}-classes.png`));
    console.log(
      `${id}: ${sm.encoding} n=${sm.n} (truth ${sm.truthN}) filled ${sm.filledClasses}/${sm.n} bundles ${sm.bundles} runs ${sm.gradedRuns} unassigned ${(sm.unassignedShare * 100).toFixed(1)} % shared ${sm.sharedCheck.shared} (FP ${sm.sharedCheck.falsePositives}, ${sm.sharedCheck.falsePositiveM} m) labels ${sm.labels.join(',')} ${ms} ms`,
    );
  }
  // zooms the reviewer looks at
  const zooms: [string, number, number, number, number, number][] = [
    // F3b: coordinates on the F2 sheets (top-left origin, mm)
    ['palto', 0, 950, 1190, 335, 1.6],
    ['palto', 820, 960, 160, 160, 5],
    ['viola', 380, 1240, 300, 180, 3],
    ['viola', 840, 1120, 140, 50, 6],
    ['kombinezon', 0, 840, 950, 600, 1.5],
    ['r4454', 300, 0, 500, 330, 2],
    ['robe', 300, 250, 500, 350, 2],
    ['reef', 0, 640, 400, 380, 2],
    ['reef', 600, 1170, 190, 110, 6],
    ['reef', 100, 30, 90, 70, 10],
    ['zhaket', 0, 380, 620, 420, 1.6],
    ['leonie', 0, 1150, 595, 1300, 0.9],
    ['leonie', 0, 1330, 90, 120, 8],
  ];
  for (const [id, x0, y0, w, h, px] of zooms) {
    if (!ids.includes(id)) continue;
    const { sheet, set } = await runSample(id);
    const b = sheet.bbox;
    overlay(
      set,
      { minX: b.minX + x0, minY: b.maxY - y0 - h, maxX: b.minX + x0 + w, maxY: b.maxY - y0 },
      px,
      resolve(shots, `${id}-zoom-${x0}-${y0}.png`),
    );
  }
  // negative controls
  const negatives: Record<string, unknown>[] = [];
  for (const [id, mutate, what] of [
    [
      'palto',
      (s: Sheet) => redashShuffle(s, 7),
      're-dash every dashed contour with another contour’s rhythm',
    ],
    [
      'robe',
      (s: Sheet) => dashShuffle(s, 11),
      'each dashed path gets a random dash pattern of the file',
    ],
    [
      'reef',
      (s: Sheet) => dashShuffle(s, 5),
      'each dashed path gets a random dash pattern of the file (legend identity)',
    ],
  ] as const) {
    if (!ids.includes(id)) continue;
    const base = await runSample(id);
    const neg = await runSample(id, mutate);
    const a = rankByOp(base.sheet, base.set);
    const bb = rankByOp(neg.sheet, neg.set);
    let same = 0;
    let both = 0;
    for (const [k, r] of a)
      if (bb.has(k)) {
        both++;
        if (bb.get(k) === r) same++;
      }
    // identity / look contradictions the operator must see
    const flagKinds = new Set([
      'class-merge',
      'class-split',
      'unassigned',
      'rank-direction',
      'size-empty',
    ]);
    const flagsBase = (base.set.ambiguities ?? []).filter((x) => flagKinds.has(x.kind)).length;
    const flagsNeg = (neg.set.ambiguities ?? []).filter((x) => flagKinds.has(x.kind)).length;
    const sm = summarise(`${id}-negative`, neg.set, neg.recover, neg.ms);
    negatives.push({
      id,
      mutation: what,
      opsCompared: both,
      sameRank: same,
      sameShare: +(same / Math.max(1, both)).toFixed(3),
      flagsBase,
      flagsNegative: flagsNeg,
      unassignedBase: summarise(id, base.set, base.recover, base.ms).unassignedShare,
      unassignedNegative: sm.unassignedShare,
      ambiguitiesNegative: sm.ambiguities,
      // F3b: a control passes only when it RAISES flags (the assignment changing alone is silent)
      pass: flagsNeg > flagsBase,
    });
    overlay(
      neg.set,
      neg.sheet.bbox,
      Math.min(0.8, 2400 / (neg.sheet.bbox.maxX - neg.sheet.bbox.minX)),
      resolve(shots, `${id}-negative.png`),
    );
    console.log(`negative ${id}: same rank ${same}/${both}, flags ${flagsBase} → ${flagsNeg}`);
  }
  out.samples = summaries;
  out.negatives = negatives;
  const date = new Date().toISOString().slice(0, 10).replace(/-/g, '');
  writeFileSync(
    resolve(REPORTS, `F3b${process.env.SHIM ? '-shim' : ''}-${date}.json`),
    JSON.stringify(out, null, 2),
  );
  console.log(
    `report: ${resolve(REPORTS, `F3b${process.env.SHIM ? '-shim' : ''}-${date}.json`)}; shots: ${shots}`,
  );
}
