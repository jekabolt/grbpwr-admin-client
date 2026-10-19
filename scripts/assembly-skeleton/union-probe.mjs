#!/usr/bin/env node
// UNION PICTOGRAM PROBE (lane C, C4) — five golden units through the real code path:
// fixture → PieceGeom → unionLayout → unionPicture → UnitTile / UnitShape / UnitGlyph + print tile.
//
//   node scripts/assembly-skeleton/union-probe.mjs              gate + golden compare + screenshot
//   node scripts/assembly-skeleton/union-probe.mjs --capture    write golden SVGs anew
//   node scripts/assembly-skeleton/union-probe.mjs --out=<dir>  where the HTML / PNG go (default: tmp)
//
// GATE (01-PLAN C4 / §4 item 3): overlap of drawn contours ≤ SKELETON.overlapMax (15 %) of the
// smaller piece for every pair; the print tile stays inside 28×16 mm; every synthetic §G rule holds;
// the UnitShape markup at the 56 px tile matches scripts/assembly-skeleton/golden/<unit>.svg.
// Readability at 56 px is not a number: the probe writes a contact sheet PNG — LOOK at it.
//
// Fixtures: scripts/assembly-skeleton/fixtures/union-units.json (union-fixtures.mjs cut them from
// the feasibility probe's seam graphs; lane A's real graph replaces them once it lands).
import { build } from 'esbuild';
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, '../..');
const capture = process.argv.includes('--capture');
const outArg = process.argv.find((a) => a.startsWith('--out='));
const outDir = outArg ? resolve(outArg.slice(6)) : resolve(tmpdir(), 'union-probe');
mkdirSync(outDir, { recursive: true });

const outfile = resolve(here, `.union-probe-${process.pid}.mjs`);
await build({
  entryPoints: [resolve(here, 'union-probe-entry.tsx')],
  bundle: true,
  format: 'esm',
  platform: 'node',
  jsx: 'automatic',
  absWorkingDir: root,
  outfile,
  logLevel: 'warning',
  external: ['react', 'react-dom', 'react-dom/server', 'react/jsx-runtime'],
  banner: {
    js: "import { createRequire as __cr } from 'node:module';\nvar require = __cr(import.meta.url);",
  },
  define: {
    'import.meta.env': '{"VITE_SERVER_URL":"http://stub.invalid","MODE":"production"}',
    'process.env.NODE_ENV': '"production"',
  },
  alias: {
    components: resolve(root, 'src/components'),
    lib: resolve(root, 'src/lib'),
    api: resolve(root, 'src/api'),
    utils: resolve(root, 'src/utils'),
    ui: resolve(root, 'src/ui'),
    constants: resolve(root, 'src/constants'),
    store: resolve(root, 'src/store'),
    hooks: resolve(root, 'src/hooks'),
  },
});
let mod;
try {
  mod = await import(pathToFileURL(outfile).href);
} finally {
  rmSync(outfile, { force: true });
}

let bad = 0;
const ck = (ok, what, detail = '') => {
  if (!ok) bad++;
  console.log(`  ${ok ? 'ok  ' : 'FAIL'} ${what}${detail ? ` — ${detail}` : ''}`);
};

// useId tokens → id1, id2, … (same canonicalisation as assembly-views-probe).
function canon(html) {
  const map = new Map();
  const rename = (v) => {
    if (!/«[^»]*»|:[A-Za-z0-9]+:|-[Rr][0-9a-z]*$/.test(v)) return v;
    if (!map.has(v)) map.set(v, `id${map.size + 1}`);
    return map.get(v);
  };
  return html.replace(/id="([^"]*)"|url\(#([^)]*)\)/g, (_, idVal, urlVal) =>
    idVal !== undefined ? `id="${rename(idVal)}"` : `url(#${rename(urlVal)})`,
  );
}

const units = JSON.parse(readFileSync(resolve(here, 'fixtures/union-units.json'), 'utf8'));
const OVERLAP_MAX = 0.15;
const runs = [];
console.log('union pictograms — golden units');
for (const u of units) {
  const r = mod.runUnit(u);
  runs.push(r);
  const L = r.layout;
  const ov = L.overlap ?? 0;
  console.log(
    `▣ ${u.id}: ${r.placedKeys.length}/${u.pieces.length} placed · overlap ${(ov * 100).toFixed(1)} % · ` +
      `${(r.wMm / 10).toFixed(1)}×${(r.hMm / 10).toFixed(1)} cm · stacked ${JSON.stringify(L.stacked)} · ` +
      `hung [${L.hung}] · overflow [${L.overflow}] · ${r.ms.toFixed(0)} ms`,
  );
  for (const p of L.placements)
    console.log(
      `      ${p.pieceKey.padEnd(8)} via ${p.attachedVia ?? 'root'}${p.mirrored ? ' mirrored' : ''}${p.approx ? ' approx' : ''}`,
    );
  ck(ov <= OVERLAP_MAX + 1e-9, `${u.id}: drawn overlap ≤ 15 %`, `${(ov * 100).toFixed(1)} %`);
  ck(r.printInside, `${u.id}: print tile inside 28×16 mm`);
  const golden = resolve(here, `golden/${u.id}.svg`);
  const svg = canon(r.golden) + '\n';
  if (capture) writeFileSync(golden, svg);
  else
    ck(
      existsSync(golden) && readFileSync(golden, 'utf8') === svg,
      `${u.id}: UnitShape markup = golden`,
      existsSync(golden) ? '' : 'no golden — run with --capture',
    );
}

console.log('§G rules (synthetic)');
for (const c of mod.syntheticChecks()) ck(c.ok, c.what, c.detail);

// ── contact sheet ───────────────────────────────────────────────────────────────────────────
const cells = runs
  .map(
    (r) => `<section class="cell">
  <h2>${r.name} <small>${r.id} · overlap ${((r.layout.overlap ?? 0) * 100).toFixed(1)} %</small></h2>
  <div class="row">
    <div class="big">${r.big}</div>
    <div class="col">
      <div class="lbl">tile 56 px (1×)</div>${r.tile}
      <div class="lbl">glyph 28 / 16 px</div><div class="flex items-center gap-2">${r.glyphs}</div>
      <div class="lbl">print 28×16 mm (×4)</div>${r.print}
      <div class="lbl">${r.caption.join(' · ')}</div>
    </div>
  </div>
</section>`,
  )
  .join('\n');
const tiles = runs.map((r) => r.tile).join('');
const rules = mod
  .syntheticSheet()
  .map(
    (r) => `<section class="cell"><h2>${r.name} <small>synthetic §G case</small></h2>
  <div class="row"><div class="big">${r.big}</div><div class="col"><div class="lbl">tile 56 px</div>${r.tile}</div></div></section>`,
  )
  .join('\n');
const body = `<main>
<div class="strip"><div class="lbl">tiles at 56 px, side by side (as on a surface)</div><div class="flex gap-2 bg-bgColor p-2">${tiles}</div></div>
${cells}
${rules}
</main>`;

let css = '';
try {
  const { compile } = await import(
    pathToFileURL(resolve(root, 'node_modules/@tailwindcss/node/dist/index.mjs')).href
  );
  const src = readFileSync(resolve(root, 'src/global.css'), 'utf8').replace(
    /url\('\.\/fonts\//g,
    `url('${pathToFileURL(resolve(root, 'src/fonts')).href}/`,
  );
  const compiler = await compile(src, { base: resolve(root, 'src'), onDependency: () => {} });
  const candidates = new Set();
  for (const m of body.matchAll(/class="([^"]*)"/g))
    for (const c of m[1].split(/\s+/)) if (c) candidates.add(c);
  css = compiler.build([...candidates]);
} catch (e) {
  console.log(`  (tailwind not compiled: ${e.message} — sheet renders unstyled)`);
}
const html = `<!doctype html><html><head><meta charset="utf-8"><style>${css}
html,body{background:#f2f2f2;}body{margin:0;padding:16px;font-family:FeatureMono,Inter,Arial,sans-serif}
main{display:grid;grid-template-columns:repeat(2,560px);gap:16px}
.strip{grid-column:1/-1}
.cell{background:#fff;border:1px solid #ccc;padding:12px}
.cell h2{font-size:12px;font-weight:700;text-transform:uppercase;margin:0 0 8px;border-bottom:2px solid #000;padding-bottom:4px}
.cell h2 small{font-weight:400;color:#666;text-transform:none}
.row{display:flex;gap:16px;align-items:flex-start}
.big{width:300px;height:300px;background:#fafafa}
.col{display:flex;flex-direction:column;gap:6px}
.lbl{font-size:10px;color:#666;text-transform:uppercase;letter-spacing:.04em}
</style></head><body>${body}</body></html>`;
const htmlPath = resolve(outDir, 'union-probe.html');
writeFileSync(htmlPath, html);
const chrome = process.env.CHROME ?? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const png = resolve(outDir, 'union-probe.png');
if (existsSync(chrome)) {
  const rowsH = Math.ceil((runs.length + 3) / 2) * 400 + 140;
  try {
    execFileSync(
      chrome,
      [
        '--headless=new',
        '--disable-gpu',
        '--hide-scrollbars',
        '--allow-file-access-from-files',
        '--force-device-scale-factor=2',
        `--window-size=1180,${rowsH}`,
        `--screenshot=${png}`,
        pathToFileURL(htmlPath).href,
      ],
      { stdio: 'ignore', timeout: 60000 },
    );
    console.log(`sheet: ${png}`);
  } catch (e) {
    console.log(`  (screenshot failed: ${e.message}) — open ${htmlPath}`);
  }
} else console.log(`no Chrome at ${chrome} — open ${htmlPath}`);

console.log(bad ? `\n${bad} FAIL` : capture ? '\ngolden written, all else ok' : '\nall ok');
process.exit(bad ? 1 : 0);
