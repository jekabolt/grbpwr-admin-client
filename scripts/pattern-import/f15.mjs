#!/usr/bin/env node
// F15 PROBE — the card DXF parser on REAL CLO files: the 3-vertex grain arrow, R12 POINT notches,
// cut/seam notch twins, sample-size-only notches (10-CLO-DXF-FORMAT §2.4 pitfalls 1–4).
//
//   node scripts/pattern-import/f15.mjs            (yarn patimport:f15)
//
// Three bundles of f15-entry.ts:
//   base     — the tree before F15 (git archive of F15_BASE, default c456bf6e)
//   head     — this tree
//   noarrow  — HEAD with the grain-arrow recogniser switched off (grain-arrow.ts → always false)
//
// Over corpus/dxf-clo/*, the K1 fixtures (+ e-pack) and the K2 goldens:
//   1. isolation: base vs head differ ONLY in grain candidates, layer-4 notch paths and notch
//      warnings — every contour, every other inner path, every other warning is byte-identical;
//   2. negative control: noarrow grain candidates are byte-identical to base on EVERY file (the arrow
//      recogniser is the only grain change), and differ from head on the arrow files (it can see it);
//   3. 2-point files: head grain candidates and effective grain byte-identical to base;
//   4. files with no CLO notch quirks (K1, our R2000 golden, RC28 markers): whole parse byte-identical;
//   5. on arrow files every block's effective grain is the arrow shaft on layer 7.
// Writes reports/F15-<date>.json, reports/F15-table.md and reports/F15-shots/*.png (rsvg-convert).
import { build } from 'esbuild';
import { execFileSync } from 'node:child_process';
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  symlinkSync,
  writeFileSync,
  copyFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = resolve(HERE, '..', '..');
const PLANS =
  process.env.PATIMPORT_PLANS ?? '/Users/jekabolt/go/src/github.com/jekabolt/tmp/plans/pdf-to-dxf';
const CORPUS = process.env.PATIMPORT_CORPUS ?? join(PLANS, 'corpus');
const K1 = join(PLANS, 'k1-work', 'fixtures');
const K2 = join(PLANS, 'k2-work');
const BASE = process.env.F15_BASE ?? 'c456bf6e';
const REPORTS = join(PLANS, 'reports');
const SHOTS = join(REPORTS, 'F15-shots');

const work = mkdtempSync(join(tmpdir(), 'f15-'));
const baseRoot = join(work, 'base');
mkdirSync(baseRoot);
execFileSync('sh', [
  '-c',
  `git -C "${REPO}" archive ${BASE} src tsconfig.json global.d.ts | tar -x -C "${baseRoot}"`,
]);
symlinkSync(resolve(REPO, 'node_modules'), join(baseRoot, 'node_modules'));
mkdirSync(join(baseRoot, 'scripts', 'pattern-import'), { recursive: true });
copyFileSync(
  join(HERE, 'f15-entry.ts'),
  join(baseRoot, 'scripts', 'pattern-import', 'f15-entry.ts'),
);

const ARROW_RE = /nesting[\\/]dxf[\\/]grain-arrow\.ts$/;

async function bundle(root, tag, noArrow) {
  const outfile = join(work, `${tag}.mjs`);
  await build({
    entryPoints: [join(root, 'scripts', 'pattern-import', 'f15-entry.ts')],
    bundle: true,
    platform: 'node',
    format: 'esm',
    target: 'node20',
    outfile,
    logLevel: 'error',
    absWorkingDir: root,
    tsconfig: join(root, 'tsconfig.json'),
    nodePaths: [join(root, 'src'), join(REPO, 'node_modules')],
    plugins: noArrow
      ? [
          {
            name: 'f15-noarrow',
            setup(b) {
              b.onLoad({ filter: ARROW_RE }, () => ({
                contents: 'export function isGrainArrow() { return false; }',
                loader: 'ts',
              }));
            },
          },
        ]
      : [],
  });
  return import(pathToFileURL(outfile).href);
}

const inputs = [];
for (const f of readdirSync(join(CORPUS, 'dxf-clo'))
  .filter((n) => n.toLowerCase().endsWith('.dxf'))
  .sort())
  inputs.push({ id: `corpus/${f}`, files: [join(CORPUS, 'dxf-clo', f)] });
for (const f of readdirSync(K1)
  .filter((n) => n.endsWith('.dxf'))
  .sort())
  inputs.push({ id: `k1/${f}`, files: [join(K1, f)] });
inputs.push({
  id: 'k1/e-pack',
  files: ['e-shell.dxf', 'e-lining.dxf', 'e-interlining.dxf'].map((f) => join(K1, f)),
});
// The K2 goldens carry a pre-contract manifest the card now refuses as corrupt; they are read here as
// the LEGACY files they imitate, with the leading 999 lines removed.
for (const f of ['golden-min.dxf', 'golden-min-r12.dxf'])
  inputs.push({ id: `k2/${f}`, files: [join(K2, f)], stripManifest: true });

// ── synthetic notch controls (F14 MAJOR 1) ─────────────────────────────────────────────────────────
// mm, one single-size block each. `neg-*` are REAL notches the twin dedupe must keep (base, which has
// no dedupe at all, is the oracle: notch paths byte-identical). `twin` is the CLO cut/seam shape plus
// an exact duplicate: one notch per logical notch, the kept copy on the contour.
function syntheticDxf(block, ents) {
  const L = ['0', 'SECTION', '2', 'HEADER', '9', '$INSUNITS', '70', '4', '0', 'ENDSEC'];
  L.push('0', 'SECTION', '2', 'BLOCKS', '0', 'BLOCK', '8', '0', '2', block, '70', '0');
  L.push('10', '0', '20', '0', '30', '0', '3', block);
  for (const e of ents) {
    if (e.poly) {
      L.push('0', 'LWPOLYLINE', '8', e.layer, '90', String(e.poly.length), '70', '1');
      for (const [x, y] of e.poly) L.push('10', x.toFixed(4), '20', y.toFixed(4));
    } else {
      const [[x0, y0], [x1, y1]] = e.line;
      L.push('0', 'LINE', '8', e.layer, '10', x0.toFixed(4), '20', y0.toFixed(4), '30', '0');
      L.push('11', x1.toFixed(4), '21', y1.toFixed(4), '31', '0');
    }
  }
  L.push('0', 'ENDBLK', '8', '0', '0', 'ENDSEC');
  L.push('0', 'SECTION', '2', 'ENTITIES', '0', 'INSERT', '8', '0', '2', block);
  L.push('10', '0', '20', '0', '30', '0', '0', 'ENDSEC', '0', 'EOF');
  return `${L.join('\n')}\n`;
}
const rect = (x0, y0, x1, y1) => [
  [x0, y0],
  [x1, y0],
  [x1, y1],
  [x0, y1],
];
const n4 = (a, b) => ({ layer: '4', line: [a, b] });
const SYNTH = {
  // 20 mm strap, matching notches on both long edges (starts 20 mm apart, step along both axes)
  'neg-strap': syntheticDxf('STRAP_M', [
    { layer: '1', poly: rect(0, 0, 300, 20) },
    n4([100, 0], [100, 5]),
    n4([100, 20], [100, 15]),
    n4([200, 0], [200, 5]),
    n4([200, 20], [200, 15]),
  ]),
  // asymmetric corner notches on adjacent edges: 4 mm from the corner on one, 20 mm on the other
  'neg-corner': syntheticDxf('CORNER_M', [
    { layer: '1', poly: rect(0, 0, 200, 300) },
    n4([4, 0], [4, 5]),
    n4([0, 20], [5, 20]),
    n4([200, 296], [195, 296]),
    n4([180, 300], [180, 295]),
  ]),
  // CLO twin: cut-line notch + seam-line copy 10 mm in (straight edge and side edge) + a contour-start
  // duplicate 0.02 mm away
  twin: syntheticDxf('TWIN_M', [
    { layer: '1', poly: rect(0, 0, 200, 300) },
    { layer: '14', poly: rect(10, 10, 190, 290) },
    n4([100, 0], [100, 5]),
    n4([100, 10], [100, 15]),
    n4([100.02, 0], [100.02, 5]),
    n4([0, 150], [5, 150]),
    n4([10, 150], [15, 150]),
  ]),
};
const synthDir = join(work, 'synthetic');
mkdirSync(synthDir);
for (const [id, text] of Object.entries(SYNTH)) {
  const file = join(synthDir, `${id}.dxf`);
  writeFileSync(file, text, 'latin1');
  inputs.push({ id: `synthetic/${id}`, files: [file] });
}

// Whole parse must be byte-identical: no CLO notch quirks in these (K1 + our writer + our markers).
const FULLY_IDENTICAL = (id) =>
  id.startsWith('k1/') || id.includes('/RC28-') || id.startsWith('synthetic/neg-');
// Notch paths must not move: one notch per logical notch already (K1, our R2000 writer, markers).
const NOTCHES_UNTOUCHED = (id) => FULLY_IDENTICAL(id) || id === 'k2/golden-min.dxf';

function stripLeading999(buf) {
  const lines = buf.toString('latin1').split(/(?<=\n)/);
  let i = 0;
  while (i + 1 < lines.length && lines[i].trim() === '999') i += 2;
  return Buffer.from(lines.slice(i).join(''), 'latin1');
}
const sheetsOf = (files, stripManifest) =>
  files.map((p) => {
    const raw = readFileSync(p);
    return {
      name: p.split('/').pop(),
      bytes: new Uint8Array(stripManifest ? stripLeading999(raw) : raw),
    };
  });

const t0 = Date.now();
const [base, head, noarrow] = await Promise.all([
  bundle(baseRoot, 'base', false),
  bundle(REPO, 'head', false),
  bundle(REPO, 'noarrow', true),
]);

let failed = 0;
const checks = [];
const ck = (ok, what, d = '') => {
  if (!ok) failed++;
  checks.push({ ok, what, d });
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${what}${d ? `  — ${d}` : ''}`);
};
const J = (x) => JSON.stringify(x);
const isNotchWarning = (w) => /notch/i.test(w);
const strip = (r) =>
  J({
    contourLayer: r.contourLayer,
    parse: r.parse.map(({ grain, innerNotch, ...rest }) => rest),
    warnings: r.warnings.filter((w) => !isNotchWarning(w)),
    failedFiles: r.failedFiles,
    skippedBlocks: r.skippedBlocks,
    blockNames: r.blockNames,
  });
const grainOf = (r) => J(r.parse.map((p) => [p.id, p.grain]));
const effOf = (r) => J(r.rows.map((x) => [x.block, x.grainLayer, x.angle, x.seg]));

const table = [];
const changed = [];
const summary = [];
for (const input of inputs) {
  const sheets = sheetsOf(input.files, input.stripManifest);
  const b = await base.probe(sheets);
  const h = await head.probe(sheets);
  const n = await noarrow.probe(sheets);
  const hasArrow = grainOf(n) !== grainOf(h);

  ck(
    strip(b) === strip(h),
    `isolation ${input.id}: only grain / notch paths / notch warnings differ`,
  );
  ck(
    grainOf(n) === grainOf(b),
    `negative control ${input.id}: arrow off ⇒ grain candidates = base`,
  );
  if (!hasArrow) {
    ck(
      grainOf(h) === grainOf(b) && effOf(h) === effOf(b),
      `2-point ${input.id}: grain candidates and effective grain byte-identical to base`,
    );
  } else {
    const bad = h.rows.filter(
      (r) =>
        r.grainLayer !== '7' ||
        r.angle == null ||
        !r.inner.some(
          (c) =>
            c.layer === '7' &&
            c.pts.length === 3 &&
            Math.hypot(c.pts[0].x - r.seg.a.x, c.pts[0].y - r.seg.a.y) < 1e-6 &&
            Math.hypot(c.pts[1].x - r.seg.b.x, c.pts[1].y - r.seg.b.y) < 1e-6,
        ),
    );
    ck(
      bad.length === 0,
      `arrow ${input.id}: every block's grain is the layer-7 arrow shaft`,
      bad.length ? bad.map((r) => r.block).join(', ') : `${h.rows.length} blocks`,
    );
  }
  if (NOTCHES_UNTOUCHED(input.id)) {
    const notchOf = (r) => J(r.parse.map((p) => [p.id, p.innerNotch]));
    ck(notchOf(b) === notchOf(h), `notches ${input.id}: layer-4 paths byte-identical to base`);
  }
  if (input.id.startsWith('synthetic/')) {
    const r = h.rows[0];
    const want = input.id === 'synthetic/twin' ? 2 : 4;
    const off = (r?.inner ?? [])
      .filter((c) => c.layer === '4')
      .filter((c) => {
        let m = Infinity;
        for (let k = 0; k < r.poly.length; k++) {
          const a = r.poly[k];
          const b = r.poly[(k + 1) % r.poly.length];
          const dx = b.x - a.x;
          const dy = b.y - a.y;
          const t = Math.max(
            0,
            Math.min(1, ((c.pts[0].x - a.x) * dx + (c.pts[0].y - a.y) * dy) / (dx * dx + dy * dy)),
          );
          m = Math.min(m, Math.hypot(c.pts[0].x - a.x - t * dx, c.pts[0].y - a.y - t * dy));
        }
        return m > 0.05;
      });
    ck(
      h.rows.length === 1 && r.notches === want && off.length === 0,
      `notch dedupe ${input.id}: ${want} notches kept, all on the contour (L${h.contourLayer})`,
      `head ${r?.notches}, base ${b.rows[0]?.notches}, off-contour ${off.length}`,
    );
  }
  if (FULLY_IDENTICAL(input.id)) {
    ck(
      J({ ...b, grainOpts: b.grainOpts }) === J({ ...h, grainOpts: h.grainOpts }),
      `untouched ${input.id}: whole card parse byte-identical to base`,
    );
  }

  const byBlock = new Map(b.rows.map((r) => [`${r.file}|${r.block}`, r]));
  // Every grain candidate the OLD parser saw for the block (any layer) — drawn thin in the shots, so a
  // picture shows what a manual grain-layer pick could have rotated by before.
  const oldCands = new Map(b.parse.map((p) => [`${p.file}|${p.block}`, p.grain]));
  let nb = 0;
  let nh = 0;
  for (const r of h.rows) {
    const o = byBlock.get(`${r.file}|${r.block}`);
    const row = {
      input: input.id,
      block: r.block,
      grainBefore: o?.angle != null,
      grainAfter: r.angle != null,
      layerBefore: o?.grainLayer ?? '',
      layerAfter: r.grainLayer,
      angleBefore: o?.angle ?? null,
      angleAfter: r.angle,
      notchesBefore: o?.notches ?? 0,
      notchesAfter: r.notches,
    };
    nb += row.notchesBefore;
    nh += row.notchesAfter;
    table.push(row);
    const d =
      row.angleBefore != null && row.angleAfter != null
        ? Math.min(
            Math.abs(row.angleBefore - row.angleAfter),
            180 - Math.abs(row.angleBefore - row.angleAfter),
          )
        : null;
    if ((d != null && d > 1) || row.grainBefore !== row.grainAfter) {
      changed.push({
        ...row,
        deltaDeg: d,
        old: o,
        now: r,
        oldCands: oldCands.get(`${r.file}|${r.block}`) ?? [],
      });
    }
  }
  summary.push({
    input: input.id,
    blocks: h.rows.length,
    contourLayer: h.contourLayer,
    grainLayerBefore: b.grainLayer,
    grainLayerAfter: h.grainLayer,
    grainFoundBefore: b.rows.filter((r) => r.angle != null).length,
    grainFoundAfter: h.rows.filter((r) => r.angle != null).length,
    notchesBefore: nb,
    notchesAfter: nh,
    arrow: hasArrow,
    notchWarnings: h.warnings.filter(isNotchWarning),
  });
}
const negSees = summary.filter((s) => s.arrow).length;
ck(negSees > 0, `negative control sees the arrow on ${negSees} input(s)`);

// ── visual check: every block whose effective grain changed (found or > 1°) ───────────────────────
mkdirSync(SHOTS, { recursive: true });
const shots = [];
const byInput = new Map();
for (const c of changed) {
  const list = byInput.get(c.input) ?? [];
  list.push(c);
  byInput.set(c.input, list);
}
const esc = (s) =>
  String(s).replace(/[<&>]/g, (m) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;' })[m]);
for (const [input, list] of byInput) {
  const CELL = 360;
  const cols = Math.min(5, list.length);
  const rowsN = Math.ceil(list.length / cols);
  let svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${cols * CELL}" height="${rowsN * CELL + 40}" viewBox="0 0 ${cols * CELL} ${rowsN * CELL + 40}"><rect width="100%" height="100%" fill="#fff"/>`;
  svg += `<text x="8" y="24" font-family="Helvetica" font-size="16">${esc(input)} — old effective grain: thick orange dashed · old candidates (any layer, never auto-picked): thin orange · new grain: blue (arrow = drawn CLO arrow) · grey: inner · red: notches</text>`;
  list.forEach((c, k) => {
    const ox = (k % cols) * CELL;
    const oy = 40 + Math.floor(k / cols) * CELL;
    const r = c.now;
    const pts = [...r.poly, ...r.inner.flatMap((p) => p.pts)];
    const xs = pts.map((p) => p.x);
    const ys = pts.map((p) => p.y);
    const minX = Math.min(...xs);
    const maxX = Math.max(...xs);
    const minY = Math.min(...ys);
    const maxY = Math.max(...ys);
    const s = (CELL - 50) / Math.max(maxX - minX, maxY - minY, 1);
    const X = (p) => (ox + 25 + (p.x - minX) * s).toFixed(1);
    const Y = (p) => (oy + CELL - 30 - (p.y - minY) * s).toFixed(1); // DXF y up
    const path = (ps, closed) =>
      `M${ps.map((p) => `${X(p)} ${Y(p)}`).join(' L')}${closed ? 'Z' : ''}`;
    svg += `<rect x="${ox + 2}" y="${oy + 2}" width="${CELL - 4}" height="${CELL - 4}" fill="none" stroke="#ddd"/>`;
    for (const p of r.inner) {
      const notch = p.layer === '4';
      svg += `<path d="${path(p.pts, p.closed)}" fill="none" stroke="${notch ? '#d00' : '#aaa'}" stroke-width="${notch ? 3 : 1}"/>`;
    }
    svg += `<path d="${path(r.poly, true)}" fill="none" stroke="#000" stroke-width="1.4"/>`;
    for (const g of c.oldCands) {
      svg += `<path d="${path([g.a, g.b], false)}" fill="none" stroke="#f80" stroke-width="1.5" stroke-dasharray="4 3"/>`;
      svg += `<text x="${X(g.a)}" y="${Y(g.a)}" font-family="Helvetica" font-size="10" fill="#c60">L${esc(g.layer)} ${g.angleDeg.toFixed(0)}°</text>`;
    }
    if (c.old?.seg) {
      svg += `<path d="${path([c.old.seg.a, c.old.seg.b], false)}" fill="none" stroke="#f80" stroke-width="5" stroke-dasharray="10 6" opacity="0.85"/>`;
    }
    if (r.seg) {
      svg += `<path d="${path([r.seg.a, r.seg.b], false)}" fill="none" stroke="#06f" stroke-width="2.5"/>`;
      svg += `<circle cx="${X(r.seg.b)}" cy="${Y(r.seg.b)}" r="4" fill="#06f"/>`;
    }
    const lab = `${c.block}  ${c.angleBefore == null ? 'none' : `L${c.layerBefore} ${c.angleBefore}°`} → ${c.angleAfter == null ? 'none' : `L${c.layerAfter} ${c.angleAfter}°`}`;
    svg += `<text x="${ox + 8}" y="${oy + 18}" font-family="Helvetica" font-size="12">${esc(lab)}</text>`;
  });
  svg += '</svg>';
  const base = input.replace(/[^A-Za-z0-9._-]+/g, '_');
  const svgPath = join(work, `${base}.svg`);
  const pngPath = join(SHOTS, `${base}.png`);
  writeFileSync(svgPath, svg);
  try {
    execFileSync('rsvg-convert', ['-o', pngPath, svgPath]);
    shots.push(pngPath);
  } catch (e) {
    console.log(`     (render skipped for ${input}: ${e.message})`);
  }
}

// ── table ─────────────────────────────────────────────────────────────────────────────────────────
const fmtA = (layer, a) => (a == null ? '—' : `L${layer} ${a}°`);
let md = '# F15 — card DXF parser, BEFORE/AFTER per block\n\n';
md += `Base ${BASE} vs HEAD. Effective grain = the file's default grain layer (grain.ts), exactly one candidate (grain-orient.ts) — what drives marker rotation. Notches = layer-4 inner paths of the piece on the default contour layer.\n\n`;
md +=
  '## Per file\n\n| input | blocks | contour L | grain L before → after | grain found before → after | notches before → after | arrow |\n|---|---|---|---|---|---|---|\n';
for (const s of summary)
  md += `| ${s.input} | ${s.blocks} | ${s.contourLayer || '—'} | ${s.grainLayerBefore || '—'} → ${s.grainLayerAfter || '—'} | ${s.grainFoundBefore} → ${s.grainFoundAfter} | ${s.notchesBefore} → ${s.notchesAfter} | ${s.arrow ? 'yes' : ''} |\n`;
md +=
  '\n## Per block\n\n| input | block | grain before | grain after | angle before | angle after | notches before | notches after |\n|---|---|---|---|---|---|---|---|\n';
for (const r of table)
  md += `| ${r.input} | ${r.block} | ${r.grainBefore ? 'yes' : 'no'} | ${r.grainAfter ? 'yes' : 'no'} | ${fmtA(r.layerBefore, r.angleBefore)} | ${fmtA(r.layerAfter, r.angleAfter)} | ${r.notchesBefore} | ${r.notchesAfter} |\n`;
md += `\n## Grain changed (found, or angle > 1°): ${changed.length} blocks\n\n`;
for (const c of changed)
  md += `- ${c.input} ${c.block}: ${fmtA(c.layerBefore, c.angleBefore)} → ${fmtA(c.layerAfter, c.angleAfter)}${c.deltaDeg != null ? ` (Δ ${c.deltaDeg.toFixed(2)}°)` : ''}\n`;

const stamp = new Date().toISOString().slice(0, 10).replace(/-/g, '');
if (existsSync(REPORTS)) {
  writeFileSync(join(REPORTS, 'F15-table.md'), md);
  writeFileSync(
    join(REPORTS, `F15-${stamp}.json`),
    JSON.stringify(
      {
        base: BASE,
        checks,
        summary,
        changed: changed.map(({ old, now, oldCands, ...r }) => r),
        shots,
      },
      null,
      2,
    ),
  );
}
console.log(
  `\n${summary.map((s) => `${s.input}: grain ${s.grainFoundBefore}→${s.grainFoundAfter} (L${s.grainLayerBefore || '—'}→L${s.grainLayerAfter || '—'}), notches ${s.notchesBefore}→${s.notchesAfter}`).join('\n')}`,
);
console.log(`changed grain: ${changed.length} blocks; shots: ${shots.length}`);
console.log(`\n${failed === 0 ? 'PASS' : `FAIL (${failed})`} in ${Date.now() - t0} ms`);
rmSync(work, { recursive: true, force: true });
process.exit(failed === 0 ? 0 : 1);
