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
//
// The PDFs come from THE 1:1 tiler (dxf-pdf.ts). Their re-import by our importer (scale, tile
// labels, no missing pages) is measured by scripts/pattern-export/dxf-pdf-probe.mjs <file.plt>.
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

// ── Guards (Codex review majors) ────────────────────────────────────────────────────────────
const enc = (t) => new TextEncoder().encode(t);
const guard = async (name, fn) => {
  try {
    const r = await fn();
    if (r === true) console.log(`ok   guard: ${name}`);
    else {
      failed++;
      console.log(`FAIL guard: ${name} — ${r}`);
    }
  } catch (e) {
    failed++;
    console.log(`FAIL guard: ${name} — threw ${e.message}`);
  }
};
const refuses = async (fn, re) => {
  try {
    await fn();
    return 'did not refuse';
  } catch (e) {
    return re.test(e.message) ? true : `wrong message: ${e.message}`;
  }
};
// 1. Two different lines with the same ends, middle vertex and vertex count both survive.
await guard('distinct lines sharing ends+middle are both kept', async () => {
  const pieces = [
    {
      id: 1,
      name: 'A',
      blockName: 'A',
      layer: '1',
      source: 'x',
      fileIndex: 0,
      poly: [
        { x: 0, y: 0 },
        { x: 10, y: 0 },
        { x: 10, y: 10 },
        { x: 0, y: 10 },
      ],
      bboxW: 10,
      bboxH: 10,
      areaCm2: 100,
      originX: 0,
      originY: 0,
      inner: [
        {
          layer: '8',
          closed: false,
          pts: [
            { x: 1, y: 1 },
            { x: 2, y: 5 },
            { x: 5, y: 5 },
            { x: 8, y: 5 },
            { x: 9, y: 9 },
          ],
        },
        {
          layer: '8',
          closed: false,
          pts: [
            { x: 1, y: 1 },
            { x: 4, y: 2 },
            { x: 5, y: 5 },
            { x: 6, y: 8 },
            { x: 9, y: 9 },
          ],
        },
        {
          layer: '8',
          closed: false,
          pts: [
            { x: 1, y: 1 },
            { x: 2, y: 5 },
            { x: 5, y: 5 },
            { x: 8, y: 5 },
            { x: 9, y: 9 },
          ],
        },
      ],
    },
  ];
  const d = m.plotFromPattern(pieces);
  const n = d.polylines.filter((p) => p.role === 'draw').length;
  return n === 2 ? true : `${n} drawn lines, expected 2 (one exact duplicate dropped)`;
});
// 2. Units: the same file at 1000/in is 40/(1000/25.4) = 1.016 × larger than at 40/mm.
await guard('unitsPerMm reaches the sheet (1000/in vs 40/mm)', async () => {
  const f = enc('IN;SP1;PU0,0;PD4000,0,4000,2000,0,2000,0,0;PU;');
  const a = await m.readPltSheet(f, { unitsPerMm: 40 });
  const b = await m.readPltSheet(f, { unitsPerMm: 1000 / 25.4 });
  const ok = Math.abs(a.widthMm - 100) < 1e-6 && Math.abs(b.widthMm - 101.6) < 1e-6;
  return ok ? true : `widths ${a.widthMm} / ${b.widthMm}`;
});
await guard('IP/SC self-scaling is reported', async () => {
  const s = await m.readPltSheet(
    enc('IN;IP0,0,4000,4000;SC0,100,0,100;SP1;PU0,0;PD100,0,100,50;PU;'),
  );
  return s.selfScaled.ip && s.selfScaled.sc && Math.abs(s.widthMm - 100) < 1e-6
    ? true
    : JSON.stringify(s.selfScaled) + ' ' + s.widthMm;
});
// 3. RO before drawing is applied (a 100 × 50 rectangle becomes 50 × 100); RO mid-drawing refused.
await guard('RO 90 before drawing is applied', async () => {
  const s = await m.readPltSheet(enc('IN;RO90;SP1;PU0,0;PD4000,0,4000,2000,0,2000,0,0;PU;'));
  return Math.abs(s.widthMm - 50) < 1e-6 &&
    Math.abs(s.heightMm - 100) < 1e-6 &&
    s.rotationDeg === 90
    ? true
    : `${s.widthMm} x ${s.heightMm}, ro ${s.rotationDeg}`;
});
await guard('RO changed after drawing is refused', () =>
  refuses(
    () => m.readPltSheet(enc('IN;SP1;PU0,0;PD4000,0;RO90;PD4000,2000;PU;')),
    /RO 90 changes the rotation/,
  ),
);
await guard('IN before drawing cancels an earlier RO', async () => {
  const s = await m.readPltSheet(enc('RO90;IN;SP1;PU0,0;PD4000,0,4000,2000;PU;'));
  return s.rotationDeg === 0 && Math.abs(s.widthMm - 100) < 1e-6
    ? true
    : `ro ${s.rotationDeg}, w ${s.widthMm}`;
});
// 4. Non-finite coordinates are refused, never tiled.
await guard('non-finite coordinates are refused', () =>
  refuses(
    () => m.pltToPdf(enc(`IN;SP1;PU0,0;PD1${'0'.repeat(400)},0;PD0,4000;PU;`), 'pdf-a4'),
    /finite|damaged|not a finite|Infinity|non-finite|numbers?/i,
  ),
);
// 5. Absurd sizes are refused before tiling (reader cap and tiler cap).
await guard('a 40 m drawing is refused before planning', () =>
  refuses(() => m.pltToPdf(enc('IN;SP1;PU0,0;PD1600000,0,1600000,4000;PU;'), 'pdf-a4'), /limit/),
);
const fake = (w, h) => ({
  w,
  h,
  strokes: [
    {
      kind: 'cut',
      closed: false,
      pts: [
        [0, 0],
        [w, h],
      ],
    },
  ],
  labels: [],
  title: 'x',
  warnings: [],
});
await guard('tiler refuses > 500 pages without allocating', () =>
  refuses(async () => m.planPdf(fake(19_000, 19_000), { kind: 'tiles', paper: 'A4' }), /limit 500/),
);
await guard('tiler refuses infinite extents', () =>
  refuses(async () => m.planPdf(fake(Infinity, 10), { kind: 'tiles', paper: 'A4' }), /finite/),
);

const pngs = [];
for (const f of plts) {
  const buf = await readFile(f);
  const s = stem(f);
  for (const mode of ['sheet', 'a4']) {
    let res;
    try {
      res = await m.pltToPdf(buf, `pdf-${mode}`, { name: basename(f) });
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
      `pdf  ${s} ${mode}: ${res.pages} page(s)${res.plan.grid ? ` (${res.plan.grid.cols}x${res.plan.grid.rows} grid, ${res.plan.grid.cells.filter((c) => c.blank).length} blank)` : ''}, first page ${mm}, sheet ${res.sheet.widthMm.toFixed(1)} x ${res.sheet.heightMm.toFixed(1)} mm, pens ${res.sheet.pens.map((p) => `${p.pen}:${p.runs}`).join(' ')}${res.warnings.length ? `, warnings ${JSON.stringify(res.warnings)}` : ''}`,
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
