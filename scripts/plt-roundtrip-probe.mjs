#!/usr/bin/env node
// PLT ROUND TRIP + PLT → PDF visual check.
//
//   node scripts/plt-roundtrip-probe.mjs <outDir> <file.dxf|file.plt> [...]
//
// For each DXF: parse with the app's DXF reader → plotFromPattern → dxfToHpgl (default, and
// mirror+rotate90) → parse back with the IMPORT's HP-GL reader → max/mean deviation, piece count,
// pen counts, label count, overall size. Also a hand-made marker (plotFromMarker) of the same
// pieces. Every generated .plt and every given .plt then goes through pltToPdf (single sheet when it
// fits + tiled A4) and page 1–2 are rendered to PNG with pdftoppm.
//
// Fails (exit 1) when a deviation exceeds 0.05 mm (rounding to 0.025 mm plotter units allows
// ≤ 0.018 mm) or a count disagrees.
import { build } from 'esbuild';
import { execFileSync } from 'node:child_process';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { basename, dirname, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath, pathToFileURL } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const outfile = resolve(tmpdir(), `plt-roundtrip-${process.pid}.mjs`);
await build({
  entryPoints: [resolve(here, 'plt-roundtrip-entry.ts')],
  bundle: true,
  platform: 'node',
  format: 'esm',
  target: 'node20',
  outfile,
  logLevel: 'warning',
  external: ['canvg', 'html2canvas', 'dompurify'],
});
const m = await import(pathToFileURL(outfile).href);

const [outDir, ...inputs] = process.argv.slice(2);
if (!outDir || inputs.length === 0) {
  console.error('usage: plt-roundtrip-probe.mjs <outDir> <file.dxf|file.plt> [...]');
  process.exit(2);
}
await mkdir(outDir, { recursive: true });
const TOL = 0.05;
let failed = 0;
const plts = [];
const summary = [];

const stem = (p) =>
  basename(p)
    .replace(/\.[^.]+$/, '')
    .replace(/[^\w.-]+/g, '_');

function report(rt) {
  const pensOk = Object.values(rt.pens).every((p) => p.expected === p.got);
  const ok =
    rt.maxDevMm <= TOL &&
    pensOk &&
    rt.cutPieces.expected === rt.cutPieces.got &&
    rt.texts.expected === rt.texts.got;
  if (!ok) failed++;
  const line = `${ok ? 'ok  ' : 'FAIL'} ${rt.label}: ${rt.bytes} B, cut pieces ${rt.cutPieces.got}/${rt.cutPieces.expected}, pens ${Object.entries(
    rt.pens,
  )
    .map(([k, v]) => `${k} ${v.got}/${v.expected}`)
    .join(
      ' ',
    )}, labels ${rt.texts.got}/${rt.texts.expected}, max dev ${rt.maxDevMm.toFixed(4)} mm, mean ${rt.meanDevMm.toFixed(4)} mm, size ${rt.sizeMm.got.map((v) => v.toFixed(2)).join('x')} vs ${rt.sizeMm.expected.map((v) => v.toFixed(2)).join('x')} mm`;
  console.log(line);
  for (const w of rt.warnings.slice(0, 4)) console.log(`       warning: ${w}`);
  summary.push(line);
}

for (const path of inputs) {
  const buf = await readFile(path);
  const ab = buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength);
  if (/\.dxf$/i.test(path)) {
    const pieces = await m.parseDxf(basename(path), ab);
    const drawing = m.plotFromPattern(pieces);
    const s = stem(path);
    for (const [tag, opts] of [
      ['default', {}],
      ['mirror-rot90', { mirror: true, rotate90: true, originMm: { x: 5, y: 5 } }],
    ]) {
      const rt = await m.roundTrip(`${s} [${tag}]`, drawing, opts);
      report(rt);
      const f = resolve(outDir, `${s}.${tag}.plt`);
      await writeFile(f, rt.plt);
      if (tag === 'default') plts.push(f);
    }
    // Marker: the cut-layer contours in a row, alternating 0/90°, every third mirrored.
    const cutIds = new Set();
    const seen = new Set();
    for (const p of pieces) {
      const k = `${p.fileIndex}|${p.blockName || p.id}`;
      if (seen.has(k)) continue;
      seen.add(k);
      cutIds.add(p.id);
    }
    const chosen = pieces.filter((p) => cutIds.has(p.id)).slice(0, 12);
    const { result, widthCm } = m.rowMarker(chosen);
    const marker = m.plotFromMarker(result, chosen, { fabricWidthCm: widthCm });
    const rt = await m.roundTrip(`${s} [marker x${chosen.length}]`, marker, {});
    report(rt);
    const f = resolve(outDir, `${s}.marker.plt`);
    await writeFile(f, rt.plt);
    plts.push(f);
  } else plts.push(resolve(path));
}

const pngs = [];
for (const f of plts) {
  const buf = await readFile(f);
  const s = stem(f);
  for (const mode of ['sheet', 'a4']) {
    let res;
    try {
      res = await m.pltToPdf(buf, mode, { name: basename(f) });
    } catch (e) {
      console.log(`     ${s} ${mode}: ${e.message}`);
      continue;
    }
    const pdf = resolve(outDir, `${s}.${mode}.pdf`);
    await writeFile(pdf, res.bytes);
    const info = execFileSync('pdfinfo', [pdf]).toString();
    const size = /Page size:\s+([\d.]+) x ([\d.]+) pts/.exec(info);
    const mm = size
      ? `${((+size[1] * 25.4) / 72).toFixed(1)} x ${((+size[2] * 25.4) / 72).toFixed(1)} mm`
      : '?';
    console.log(
      `pdf  ${s} ${mode}: ${res.pages} page(s)${mode === 'a4' ? ` (${res.cols}x${res.rows} tiles)` : ''}, first page ${mm}, sheet ${res.sheet.widthMm.toFixed(1)} x ${res.sheet.heightMm.toFixed(1)} mm, pens ${res.sheet.pens.map((p) => `${p.pen}:${p.runs}`).join(' ')}`,
    );
    const last = mode === 'a4' ? Math.min(2, res.pages) : 1;
    const prefix = resolve(outDir, `${s}.${mode}`);
    execFileSync('pdftoppm', [
      '-png',
      '-r',
      mode === 'a4' ? '60' : '40',
      '-f',
      '1',
      '-l',
      String(last),
      pdf,
      prefix,
    ]);
    pngs.push(`${prefix}-*.png`);
  }
}
console.log(`\nPNGs: ${pngs.join('  ')}`);
console.log(failed ? `\n${failed} round trip(s) FAILED` : '\nall round trips within tolerance');
process.exit(failed ? 1 : 0);
