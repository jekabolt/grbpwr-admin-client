#!/usr/bin/env node
// PATTERN-IMPORT · F11 raster adapter probe.
//   node scripts/pattern-import/raster.mjs            (all phases)
//   node scripts/pattern-import/raster.mjs synth      (synthetic ground truth only)
//   node scripts/pattern-import/raster.mjs leonie     (raster PDF only)
//
// Phases run in CHILD processes so each one's peak RSS is its own (process.resourceUsage().maxRSS).
//  synth-make   synthetic vector PDF → pdftoppm 300 dpi → "scanner" (0.3° rotation, +0.5 % x
//               stretch, blur, noise) → synth-scan.png
//  synth-trace  trace synth-scan.png (and the clean 300-dpi render) with and without the square
//               calibration; compare to the vector truth
//  leonie       all 27 pages of the CorelDRAW→Ghostscript raster PDF, per-page time and memory,
//               document ink classes, the 5 cm square
//  limit        C5: a synthetic RGBA scan of exactly PATIMPORT.maxRasterPixels (pattern outlines, a
//               sheet-wide frame = the largest component) traced in its own process: the peak the
//               limit is chosen by (≤ ~350 MB)
// Report: $REPORTS/F11-<yyyymmdd>.json + F11.md
import { build as esbuild } from 'esbuild';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, resolve } from 'node:path';
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { execFileSync, spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = resolve(HERE, '../..');
const CORPUS =
  process.env.PATIMPORT_CORPUS ??
  '/Users/jekabolt/go/src/github.com/jekabolt/tmp/plans/pdf-to-dxf/corpus/';
const REPORTS = process.env.PATIMPORT_REPORTS ?? resolve(CORPUS, '../reports');
const WORK = resolve(REPORTS, 'F11-work');
mkdirSync(WORK, { recursive: true });

const phaseArg = process.argv.indexOf('--phase');
const PHASE = phaseArg > 0 ? process.argv[phaseArg + 1] : null;
const BUNDLE = process.env.F11_BUNDLE ?? resolve(tmpdir(), `patimport-raster-${process.pid}.mjs`);

const mb = (b) => Math.round(b / 1e6);
const peakMb = () => Math.round((process.resourceUsage().maxRSS * 1024) / 1e6);

async function loadBundle() {
  if (!process.env.F11_BUNDLE) {
    await esbuild({
      entryPoints: [resolve(HERE, 'raster-entry.ts')],
      bundle: true,
      platform: 'node',
      format: 'esm',
      target: 'node20',
      outfile: BUNDLE,
      logLevel: 'warning',
      absWorkingDir: REPO,
      external: ['pdfjs-dist'],
      // node_modules is a symlink into another worktree: resolve inside this one.
      preserveSymlinks: true,
      alias: {
        lib: resolve(REPO, 'src/lib'),
        components: resolve(REPO, 'src/components'),
        utils: resolve(REPO, 'src/utils'),
      },
    });
  }
  return import(pathToFileURL(BUNDLE).href);
}

const PDFJS_LEGACY = resolve(REPO, 'node_modules/pdfjs-dist/legacy/build/pdf.mjs');

function pngDecoder(m) {
  return async (bytes) => {
    const p = m.decodePng(new Uint8Array(bytes));
    return { data: p.data, width: p.width, height: p.height, channels: p.channels };
  };
}

/** Centroid of the best square on a page (any side; used only to remove the free translation). */
function squareCentroid(m, page) {
  const sq = m
    .findRasterSquares(page)
    .sort((a, b) => Math.abs(a.measuredWMm - 100) - Math.abs(b.measuredWMm - 100))[0];
  if (!sq) return null;
  return {
    x: sq.cornersMm.reduce((s, p) => s + p.x, 0) / 4,
    y: sq.cornersMm.reduce((s, p) => s + p.y, 0) / 4,
    w: sq.measuredWMm,
    h: sq.measuredHMm,
  };
}

const r3 = (v) => (Number.isFinite(v) ? +v.toFixed(3) : v);

// ─────────────────────────────────────────────────────────────────────────────────────────────
async function phaseSynthMake(m) {
  const dr = m.synthDrawables();
  writeFileSync(resolve(WORK, 'synth.pdf'), m.synthPdf(dr));
  writeFileSync(
    resolve(WORK, 'synth-truth.json'),
    JSON.stringify(m.synthTruth(dr).map((t) => ({ ...t, pts: t.pts.length }))),
  );
  execFileSync('pdftoppm', [
    '-r',
    '300',
    '-png',
    '-singlefile',
    resolve(WORK, 'synth.pdf'),
    resolve(WORK, 'synth-300'),
  ]);
  const png = m.decodePng(readFileSync(resolve(WORK, 'synth-300.png')));
  const scan = m.distortScan(png.data, png.width, png.height, png.channels, 0.3, 1.005, 1.0, 3);
  writeFileSync(
    resolve(WORK, 'synth-scan.png'),
    m.encodePng({ width: png.width, height: png.height, data: scan, channels: 3, depth: 8 }),
  );
  return {
    width: png.width,
    height: png.height,
    rotDeg: 0.3,
    stretchX: 1.005,
    stretchY: 1.0,
    noiseSigma: 3,
    blur: '[1 2 1]/4 ×2 axes',
  };
}

async function phaseSynthTrace(m) {
  const truth = m.synthTruth(m.synthDrawables());
  const truthSq = { x: 65, y: 232 };
  const out = {};
  for (const [name, file] of [
    ['scan', 'synth-scan.png'],
    ['clean', 'synth-300.png'],
  ]) {
    const bytes = readFileSync(resolve(WORK, file));
    const ab = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
    for (const mode of ['calibrated', 'uncalibrated']) {
      const t0 = performance.now();
      const res = await m.extractRasterImageDetailed(
        { id: '0', name: file, bytes: ab },
        { sagittaMm: 0.05, keepFills: true },
        { decode: pngDecoder(m), dpi: 300, ref: mode === 'calibrated' ? 'auto' : { kind: 'none' } },
      );
      const ms = performance.now() - t0;
      const page = res.doc.pages[0];
      const c = squareCentroid(m, page);
      const shift = c ? { x: truthSq.x - c.x, y: truthSq.y - c.y } : { x: 0, y: 0 };
      const cmp = m.compareToTruth(page, truth, shift, 0.5);
      const cal = res.calibrations[0];
      out[`${name}-${mode}`] = {
        ms: Math.round(ms),
        stageMs: Object.fromEntries(
          Object.entries(res.stats[0][0].ms).map(([k, v]) => [k, Math.round(v)]),
        ),
        inks: res.stats[0][0].inks.map((i) => ({ rgb: i.rgb, share: +i.share.toFixed(3) })),
        paths: page.paths.length,
        pageCarriesCalibration: JSON.stringify(page.calibration) === JSON.stringify(cal),
        calibration: {
          method: cal.method,
          square: cal.square && { ...cal.square, cornersMm: undefined },
          affine: cal.affine,
          notes: cal.notes,
        },
        squareAfter: c && { w: r3(c.w), h: r3(c.h) },
        p50: r3(cmp.p50),
        p95: r3(cmp.p95),
        max: r3(cmp.max),
        recovered: r3(cmp.recoveredShare),
        recoveredByGroup: cmp.recoveredByGroup,
        colourCorrect: r3(cmp.colourCorrectShare),
        unmatchedTraced: r3(cmp.unmatchedTracedShare),
        separation: cmp.separation,
        lengthErr: cmp.lengthErr,
        inkToTruth: cmp.inkToTruth,
      };
    }
  }
  return out;
}

async function phaseLeonie(m) {
  m.setRasterPdfjsLoader(() => import(pathToFileURL(PDFJS_LEGACY).href));
  const file = resolve(CORPUS, 'pdf/leonie.pdf');
  const bytes = readFileSync(file);
  const ab = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
  const perPage = [];
  let last = performance.now();
  const t0 = last;
  const res = await m.extractRasterPdfDetailed(
    { id: '0', name: 'leonie.pdf', bytes: ab },
    { sagittaMm: 0.05, keepFills: true },
    {
      progress: (done) => {
        globalThis.gc?.();
        const now = performance.now();
        perPage.push({
          page: done,
          ms: Math.round(now - last),
          rssMb: mb(process.memoryUsage().rss),
          peakMb: peakMb(),
        });
        last = now;
      },
    },
  );
  const total = performance.now() - t0;
  res.stats.forEach((st, i) => {
    perPage[i].images = st.map((s) => `${s.widthPx}×${s.heightPx}@${Math.round(s.dpi)}`).join(' ');
    perPage[i].inks = st.map((s) => s.inks.length).join('+');
    perPage[i].polylines = st.reduce((a, s) => a + s.polylines, 0);
  });
  const sq = res.calibrations.find((c) => c.method === 'test-square');
  const lineClasses = res.inkClasses.filter((c) => !c.fill);
  const totalLen = lineClasses.reduce((s, c) => s + c.lengthMm, 0);
  return {
    pages: res.doc.pages.length,
    totalMs: Math.round(total),
    peakMb: peakMb(),
    perPage,
    square: sq && {
      page: sq.square.page + 1,
      ...sq.square,
      cornersMm: undefined,
      affine: sq.affine,
      notes: sq.notes,
    },
    calibrationMethods: res.calibrations.map((c) => c.method),
    pagesCarryCalibration: res.doc.pages.every(
      (p, i) => JSON.stringify(p.calibration) === JSON.stringify(res.calibrations[i]),
    ),
    inkClasses: res.inkClasses.map((c) => ({ ...c, share: +(c.lengthMm / totalLen).toFixed(4) })),
    lineClassCount: lineClasses.length,
    lineClassCountOver1pct: lineClasses.filter((c) => c.lengthMm / totalLen >= 0.01).length,
    warnings: res.doc.warnings,
  };
}

/** C5: the worker's peak for one scan at the pixel limit (RGBA in, as the browser decoder gives). */
async function phaseLimit(m) {
  const px = m.PATIMPORT.maxRasterPixels;
  const w = Math.round(Math.sqrt(px / Math.SQRT2));
  const h = Math.floor(px / w);
  globalThis.gc?.();
  const baseMb = mb(process.memoryUsage().rss);
  const data = m.synthScan(w, h);
  const t0 = performance.now();
  const res = await m.extractRasterImageDetailed(
    { id: '0', name: 'limit.png', bytes: new ArrayBuffer(16) },
    { sagittaMm: 0.05, keepFills: true },
    { decode: async () => ({ data, width: w, height: h, channels: 4 }), dpi: 300 },
  );
  return {
    width: w,
    height: h,
    megapixels: +((w * h) / 1e6).toFixed(1),
    baseMb,
    peakMb: peakMb(),
    bytesPerPixel: +(((peakMb() - baseMb) * 1e6) / (w * h)).toFixed(1),
    paths: res.doc.pages[0].paths.length,
    ms: Math.round(performance.now() - t0),
  };
}

/** Attribution baseline: pdf.js decoding every image of leonie, no tracing. */
async function phaseLeonieDecode() {
  const pdfjs = await import(pathToFileURL(PDFJS_LEGACY).href);
  const bytes = readFileSync(resolve(CORPUS, 'pdf/leonie.pdf'));
  const doc = await pdfjs.getDocument({
    data: new Uint8Array(bytes),
    verbosity: 0,
    isOffscreenCanvasSupported: false,
    isImageDecoderSupported: false,
    disableFontFace: true,
    isEvalSupported: false,
  }).promise;
  for (let p = 1; p <= doc.numPages; p++) {
    const page = await doc.getPage(p);
    const ol = await page.getOperatorList();
    for (let i = 0; i < ol.fnArray.length; i++) {
      if (ol.fnArray[i] !== pdfjs.OPS.paintImageXObject) continue;
      const id = ol.argsArray[i][0];
      await new Promise((r) => (page.objs.has(id) ? r(page.objs.get(id)) : page.objs.get(id, r)));
    }
    page.cleanup();
    globalThis.gc?.();
  }
  return { pages: doc.numPages, peakMb: peakMb() };
}

// ─────────────────────────────────────────────────────────────────────────────────────────────
if (PHASE) {
  const m = await loadBundle();
  const fn = {
    'synth-make': phaseSynthMake,
    'synth-trace': phaseSynthTrace,
    leonie: phaseLeonie,
    'leonie-gc': phaseLeonie,
    'leonie-decode': phaseLeonieDecode,
    'leonie-decode-gc': phaseLeonieDecode,
    'limit-gc': phaseLimit,
  }[PHASE];
  const result = await fn(m);
  result.processPeakMb = peakMb();
  writeFileSync(resolve(WORK, `phase-${PHASE}.json`), JSON.stringify(result, null, 1));
  process.exit(0);
}

const want = process.argv[2] ?? 'all';
await loadBundle();
const phases = [];
if (want === 'all' || want === 'synth') phases.push('synth-make', 'synth-trace');
if (want === 'all' || want === 'leonie')
  phases.push('leonie', 'leonie-gc', 'leonie-decode', 'leonie-decode-gc');
if (want === 'all' || want === 'limit') phases.push('limit-gc');
const results = {};
for (const ph of phases) {
  // "-gc" phases collect garbage after every page: the retained working set, not V8's laziness.
  const flags = ph.endsWith('-gc') ? ['--expose-gc'] : [];
  const r = spawnSync(process.execPath, [...flags, fileURLToPath(import.meta.url), '--phase', ph], {
    env: { ...process.env, F11_BUNDLE: BUNDLE },
    stdio: 'inherit',
  });
  if (r.status !== 0) {
    console.error(`phase ${ph} failed (${r.status})`);
    process.exit(1);
  }
  results[ph] = JSON.parse(readFileSync(resolve(WORK, `phase-${ph}.json`), 'utf8'));
}

// Merge with a previous run's phases when only some ran.
const day = new Date().toISOString().slice(0, 10).replace(/-/g, '');
const jsonPath = resolve(REPORTS, `F11-${day}.json`);
const prev = existsSync(jsonPath) ? JSON.parse(readFileSync(jsonPath, 'utf8')) : {};
const all = { ...prev, ...results, generatedAt: new Date().toISOString() };
writeFileSync(jsonPath, JSON.stringify(all, null, 1));

// Acceptance summary on stdout.
const st = all['synth-trace'];
if (st) {
  for (const k of Object.keys(st)) {
    const v = st[k];
    console.log(
      `${k.padEnd(20)} p50 ${v.p50}  p95 ${v.p95}  max ${v.max}  recovered ${v.recovered}  colour ${v.colourCorrect}  square ${v.squareAfter?.w}×${v.squareAfter?.h}  ${v.ms} ms`,
    );
  }
  const sep = st['scan-calibrated'].separation
    .map((s) => `${s.pair}@${s.spacingMm}:${s.separated ? 'ok' : 'FAIL'}`)
    .join('  ');
  console.log(`separation: ${sep}`);
  console.log(
    `short features (scan-calibrated): ${JSON.stringify(st['scan-calibrated'].lengthErr)}`,
  );
  const pass =
    st['scan-calibrated'].p95 <= 0.5 && st['scan-uncalibrated'].p95 > st['scan-calibrated'].p95;
  console.log(
    `(1) synthetic p95 ≤ 0.5 after calibration: ${st['scan-calibrated'].p95 <= 0.5 ? 'PASS' : 'FAIL'}`,
  );
  console.log(
    `(3) negative control error grows: ${pass ? 'PASS' : 'FAIL'} (${st['scan-uncalibrated'].p95} vs ${st['scan-calibrated'].p95})`,
  );
  const carried = Object.values(st)
    .filter((v) => v && typeof v === 'object')
    .every((v) => v.pageCarriesCalibration);
  console.log(
    `(4) IRPage.calibration = the applied calibration (synthetic): ${carried ? 'PASS' : 'FAIL'}`,
  );
}
const lim = results['limit-gc'];
if (lim) {
  console.log(
    `(5) C5 pixel limit: ${lim.width}×${lim.height} (${lim.megapixels} MP) traced at peak ${lim.peakMb} MB (${lim.bytesPerPixel} B/px over ${lim.baseMb} MB): ${lim.peakMb <= 360 ? 'PASS' : 'FAIL'} (≤ ~350 MB)`,
  );
}
const le = all.leonie;
if (le) {
  console.log(
    `(2) leonie: ${le.pages} pages, ${le.totalMs} ms, peak ${le.peakMb} MB, line classes ${le.lineClassCount} (≥1 %: ${le.lineClassCountOver1pct}), square ${le.square ? `${le.square.measuredWMm.toFixed(3)}×${le.square.measuredHMm.toFixed(3)} mm` : 'not found'}`,
  );
  console.log(
    `(4) IRPage.calibration on every leonie page: ${le.pagesCarryCalibration ? 'PASS' : 'FAIL'}`,
  );
  const g = all['leonie-gc'];
  const d = all['leonie-decode'];
  const dg = all['leonie-decode-gc'];
  if (g && d && dg) {
    console.log(
      `   peak MB — lazy GC: trace ${le.peakMb} vs pdf.js decode only ${d.peakMb}; GC per page: trace ${g.peakMb} vs decode only ${dg.peakMb}`,
    );
  }
  for (const c of le.inkClasses)
    console.log(
      `   ink rgb(${c.rgb.join(',')}) fill=${c.fill} ${c.lengthMm} mm (${(c.share * 100).toFixed(1)} %) pages ${c.pages.length}`,
    );
}
console.log(`report: ${jsonPath}`);
