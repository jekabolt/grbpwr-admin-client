// PATTERN-IMPORT · F3 probe entry (bundled by sizes.mjs).
//   explore <sample>   style / text statistics of the shim sheet

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { pathToFileURL } from 'node:url';

import { DEFAULT_EXTRACT_OPTS, extractPdf, setPdfjsLoader, type PdfjsModule } from 'lib/pattern-import/adapters/pdf';
import { buildChainsDetailed, rankOfClass } from 'lib/pattern-import/chains/build';
import { makeChains } from 'lib/pattern-import/chains/make';
import { describeSig } from 'lib/pattern-import/chains/motif';
import type { Sheet, SourceDoc } from 'lib/pattern-import/types';
import { PATIMPORT } from 'lib/pattern-import/types';

import { renderPng, PALETTE } from './sizes-render';
import { cachePath, readCached, shimSheet, writeCached, type ShimLayout } from './sizes-shim';

const REPO = process.env.PATIMPORT_REPO ?? process.cwd();
export const CORPUS =
  process.env.PATIMPORT_CORPUS ?? '/Users/jekabolt/go/src/github.com/jekabolt/tmp/plans/pdf-to-dxf/corpus/';
export const REPORTS =
  process.env.PATIMPORT_REPORTS ?? '/Users/jekabolt/go/src/github.com/jekabolt/tmp/plans/pdf-to-dxf/reports/';
const CACHE = process.env.PATIMPORT_CACHE ?? resolve(tmpdir(), 'patimport-f3-cache');
const LEGACY = pathToFileURL(resolve(REPO, 'node_modules/pdfjs-dist/legacy/build/pdf.mjs')).href;
setPdfjsLoader(() => import(LEGACY) as Promise<PdfjsModule>);

export type Sample = { id: string; files: string[]; layouts: ShimLayout[] };

export const SAMPLES: Sample[] = [
  { id: 'palto', files: ['palto.pdf'], layouts: [{ kind: 'recurrence', pages: [2, 36] }] },
  { id: 'viola', files: ['viola.pdf'], layouts: [{ kind: 'grid', pages: [0, 34], cols: 6, dx: 195.9, dy: 259.4 }] },
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
  { id: 'reef', files: ['reef.pdf'], layouts: [{ kind: 'mosaic' }] },
  { id: 'robe', files: ['robe.pdf'], layouts: [{ kind: 'mosaic' }] },
  { id: 'r4454', files: ['r4454.pdf'], layouts: [{ kind: 'mosaic' }] },
  { id: 'zhaket', files: ['zhaket.pdf'], layouts: [{ kind: 'recurrence', pages: [1, 28] }] },
];

async function loadDoc(file: string, id: string): Promise<SourceDoc> {
  const cp = cachePath(CACHE, file.replace(/\W+/g, '_'));
  const hit = readCached(cp);
  if (hit) return hit;
  const b = readFileSync(resolve(CORPUS, 'pdf', file));
  const bytes = b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength) as ArrayBuffer;
  const doc = await extractPdf({ id, name: file, bytes }, DEFAULT_EXTRACT_OPTS);
  writeCached(cp, doc);
  return doc;
}

export async function sheetOf(s: Sample): Promise<{ sheet: Sheet; docs: SourceDoc[] }> {
  const docs: SourceDoc[] = [];
  for (let i = 0; i < s.files.length; i++) docs.push(await loadDoc(s.files[i], String(i)));
  return { sheet: shimSheet(docs, s.layouts), docs };
}

async function explore(id: string) {
  const s = SAMPLES.find((x) => x.id === id);
  if (!s) throw new Error(`no sample ${id}`);
  const t0 = Date.now();
  const { sheet } = await sheetOf(s);
  const b = sheet.bbox;
  console.log(`${id}: paths=${sheet.paths.length} texts=${sheet.texts.length} sheet ${(b.maxX - b.minX).toFixed(0)}×${(b.maxY - b.minY).toFixed(0)} (${Date.now() - t0} ms)`);
  const st = new Map<number, { n: number; len: number; ops: Set<string> }>();
  for (const p of sheet.paths) {
    let L = 0;
    for (let i = 1; i < p.pts.length; i++) L += Math.hypot(p.pts[i].x - p.pts[i - 1].x, p.pts[i].y - p.pts[i - 1].y);
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
  if (process.env.POSES) console.log(sheet.poses.map((q) => `p${q.page}:(${q.toSheet.e.toFixed(1)},${q.toSheet.f.toFixed(1)})`).join(' '));
  const tx = sheet.texts.slice(0, 400).map((t) => t.text.trim()).filter(Boolean);
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
  const strokes = sheet.paths.map((p) => ({ pts: p.pts, color: PALETTE[p.style % PALETTE.length], width: 1 }));
  const labels = sheet.texts.map((t) => ({ at: t.anchor, text: t.text, color: '#000', size: 10 }));
  const out = `${process.env.OUT ?? '/tmp'}/${id}-zoom.png`;
  renderPng(out, box, strokes, labels, px || 1, process.env.ABS ? [] : sheet.styles.map((st) => ({ color: PALETTE[st.id % PALETTE.length], text: `s${st.id} w${st.widthMm.toFixed(2)} ${st.dash?.map((v) => v.toFixed(2)).join('/') ?? ''} ${st.layer ?? ''}${st.fill ? ' fill' : ''}` })).slice(0, 20));
  console.log(out);
}

export const OPTS = { joinGapMm: PATIMPORT.joinGapMm, joinAngleDeg: PATIMPORT.joinAngleDeg, joinLateralMm: PATIMPORT.joinLateralMm };

async function chainsMode(id: string, args: string[]) {
  const s = SAMPLES.find((x) => x.id === id)!;
  const { sheet } = await sheetOf(s);
  const t0 = Date.now();
  const cb = makeChains(sheet, OPTS);
  console.log(`${id}: chains=${cb.chains.length} items=${cb.stats.items} freeBeads=${cb.stats.freeBeads} ignored=${cb.stats.ignoredPaths} in ${Date.now() - t0} ms`);
  const hist = new Map<string, { n: number; len: number }>();
  cb.chains.forEach((c, i) => {
    if (c.lengthMm < 20) return;
    const k = describeSig(cb.sigs[i]);
    const e = hist.get(k) ?? { n: 0, len: 0 };
    e.n++;
    e.len += c.lengthMm;
    hist.set(k, e);
  });
  for (const [k, e] of [...hist].sort((a, b) => b[1].len - a[1].len).slice(0, 40)) console.log(`  ${(e.len / 1000).toFixed(2).padStart(7)} m ${String(e.n).padStart(5)}  ${k}`);
  const [x0, y0, w, h, px] = args.map(Number);
  if (args.length >= 4) {
    const b = sheet.bbox;
    const box = { minX: b.minX + x0, minY: b.maxY - y0 - h, maxX: b.minX + x0 + w, maxY: b.maxY - y0 };
    const strokes = cb.chains.map((c) => ({ pts: c.pts, color: PALETTE[(c.id * 7 + (c.id >> 3)) % PALETTE.length], width: 1.2 }));
    const labels = cb.chains.filter((c) => c.lengthMm > 30).map((c) => ({ at: c.pts[Math.floor(c.pts.length / 2)], text: `${c.id}`, color: PALETTE[(c.id * 7) % PALETTE.length], size: 9 }));
    const out = `${process.env.OUT ?? '/tmp'}/${id}-chains.png`;
    renderPng(out, box, strokes, labels, px || 1);
    console.log(out);
  }
}

function docTexts(docs: SourceDoc[]): string[] {
  return docs.flatMap((d) => d.pages.flatMap((p) => p.texts.map((t) => t.text)));
}

async function runSample(id: string, opts: { png?: boolean; zoom?: number[] } = {}) {
  const s = SAMPLES.find((x) => x.id === id)!;
  const { sheet, docs } = await sheetOf(s);
  const t0 = Date.now();
  const fileNames = new Map(docs.map((d) => [d.file.id, d.file.name]));
  const { set, recover } = buildChainsDetailed(sheet, OPTS, { extraTexts: docTexts(docs), fileNames });
  const ms = Date.now() - t0;
  return { s, sheet, docs, set, recover, ms };
}

async function sizesMode(id: string, args: string[]) {
  const { sheet, set, recover, ms } = await runSample(id);
  console.log(`${id}: ${recover.encoding} n=${recover.n} chains=${set.chains.length} in ${ms} ms`);
  console.log('  diag', JSON.stringify(recover.diag));
  for (const c of set.classes) {
    const r = rankOfClass(c);
    console.log(`  class ${c.id} ${c.role}${r !== null ? ` r${r}` : ''} label=${c.sizeLabel} chains=${c.chains.length} len=${(c.totalLengthMm / 1000).toFixed(2)}m conf=${c.confidence} ev=${c.evidence.map((e) => e.kind).join(',')}`);
  }
  console.log(`  bundles=${set.bundles.length} orphans=${set.orphans.length}`);
  if (process.env.AT) {
    for (const xy of process.env.AT.split(';')) {
      const [ax, ay] = xy.split(',').map(Number);
      const P = { x: sheet.bbox.minX + ax, y: sheet.bbox.maxY - ay };
      const near = set.chains
        .map((c) => ({ c, d: Math.min(...c.pts.map((q) => Math.hypot(q.x - P.x, q.y - P.y))) }))
        .sort((a, b) => a.d - b.d)
        .slice(0, 4);
      for (const { c, d } of near) {
        const cls = set.classes.find((k) => k.chains.includes(c.id));
        const e0 = c.pts[0];
        const e1 = c.pts[c.pts.length - 1];
        const rel = (q: { x: number; y: number }) => `(${(q.x - sheet.bbox.minX).toFixed(0)},${(sheet.bbox.maxY - q.y).toFixed(0)})`;
        console.log(`  @${xy} chain ${c.id} d=${d.toFixed(1)} len=${c.lengthMm.toFixed(0)} class=${cls?.id}:${cls?.role}${cls ? rankOfClass(cls) ?? '' : ''} ends ${rel(e0)}→${rel(e1)} motif=${c.motif?.join('/')}`);
      }
    }
  }
  for (const a of set.ambiguities) console.log(`  ? ${a.kind}: ${a.message}`);
  const b = sheet.bbox;
  const [x0, y0, w, h, px] = args.length >= 4 ? args.map(Number) : [0, 0, b.maxX - b.minX, b.maxY - b.minY, 0.6];
  const box = { minX: b.minX + x0, minY: b.maxY - y0 - h, maxX: b.minX + x0 + w, maxY: b.maxY - y0 };
  const classOf = new Map<number, number>();
  for (const c of set.classes) for (const ch of c.chains) classOf.set(ch, c.id);
  const strokes = set.chains.map((c) => {
    const k = classOf.get(c.id);
    const cls = k !== undefined ? set.classes[k] : null;
    const r = cls ? rankOfClass(cls) : null;
    const color = r !== null ? PALETTE[r % PALETTE.length] : cls?.role === 'common' ? (cls.evidence.length ? '#000' : '#555') : cls?.role === 'internal' ? '#9ab' : cls?.role === 'ignore' ? '#e4e4e4' : '#ff00ff';
    return { pts: c.pts, color, width: r !== null ? 1.4 : cls?.role === 'common' ? 1.6 : 0.8, dash: cls?.role === 'common' && cls.evidence.length ? '6 3' : undefined };
  });
  // draw page furniture and joined pieces first, size lines on top
  const z = (st: { color: string }) => (st.color === '#e4e4e4' ? 0 : st.color === '#9ab' ? 1 : 2);
  strokes.sort((a, b) => z(a) - z(b));
  const legend = set.classes.filter((c) => c.role === 'size').map((c) => ({ color: PALETTE[rankOfClass(c)! % PALETTE.length], text: `r${rankOfClass(c)} ${c.sizeLabel ?? '?'} ${(c.totalLengthMm / 1000).toFixed(1)}m` }));
  legend.push({ color: '#555', text: 'common' }, { color: '#000', text: 'shared (drawn as a size)' }, { color: '#ff00ff', text: 'orphan' });
  const out = `${process.env.OUT ?? '/tmp'}/${id}-sizes.png`;
  renderPng(out, box, strokes, [], px || 0.6, legend);
  console.log(out);
}

export async function main(argv: string[]): Promise<number> {
  const [mode, ...rest] = argv;
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
  if (mode === 'explore') {
    for (const id of rest) await explore(id);
    return 0;
  }
  console.log('usage: explore <sample…>');
  return 1;
}
