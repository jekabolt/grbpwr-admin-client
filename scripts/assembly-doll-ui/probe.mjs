#!/usr/bin/env node
// 3D PAPER DOLL — headless UI stand (01-DESIGN-L0 §6, P3).
//
//   node scripts/assembly-doll-ui/probe.mjs
//   SHOT_DIR=… PLANS=…   (defaults: ../tmp/plans/assembly-3d-doll/p3-ui, ../tmp/plans)
//
// The REAL AssemblyMap (3D chip) + SeamsDoor + the doll overlay under the REAL providers, on:
//   • SS26-005 — the prod-run stand's form + the card's DXF (probe copy), without and with the gold
//     seam rows (scripts/doll/gold/ss26.seams.json, remapped onto the card's line keys);
//   • prod card 6 (SS26-006) — a card read built from prod-data/cards.json + its two DXFs, without
//     and with scripts/doll/gold/card6.seams.json.
// Every request is answered inside the page (stand-entry.tsx replaces fetch); every non-stand URL is
// routed to a stub here as well, and listed — nothing reaches a backend. The doll worker is its own
// bundle, served at the URL the client builds. Needs `vite build` for the CSS and playwright.
import { build as esbuild } from 'esbuild';
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync } from 'node:fs';
import { createRequire } from 'node:module';
import { homedir, tmpdir } from 'node:os';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = resolve(HERE, '../..');
const PLANS = process.env.PLANS ?? resolve(REPO, '../tmp/plans');
const SHOT_DIR = process.env.SHOT_DIR ?? resolve(PLANS, 'assembly-3d-doll/p3-ui');
mkdirSync(SHOT_DIR, { recursive: true });

let bad = 0;
const ck = (ok, what, d = '') => {
  if (!ok) bad++;
  console.log(`${ok ? '  ok  ' : '  FAIL'} ${what}${d ? `  — ${d}` : ''}`);
};
const head = (s) => console.log(`\n${s}`);

const ALIAS = Object.fromEntries(
  [
    'components',
    'lib',
    'api',
    'utils',
    'ui',
    'constants',
    'store',
    'hooks',
    'context',
    'types',
    'styles',
  ].map((a) => [a, resolve(REPO, 'src', a)]),
);
const ORIGIN = 'http://probe.local';
const common = {
  bundle: true,
  platform: 'browser',
  format: 'iife',
  target: 'es2020',
  logLevel: 'warning',
  absWorkingDir: REPO,
  jsx: 'automatic',
  loader: { '.svg': 'text', '.png': 'dataurl', '.woff2': 'dataurl', '.ttf': 'dataurl' },
  define: {
    'import.meta.env.VITE_SERVER_URL': '"http://stub.invalid"',
    'import.meta.env': '{"VITE_SERVER_URL":"http://stub.invalid","MODE":"production"}',
    // the client builds the worker's URL from this: the probe serves the worker bundle there
    'import.meta.url': `"${ORIGIN}/stand/client.js"`,
    'process.env.NODE_ENV': '"production"',
  },
  alias: ALIAS,
  plugins: [
    {
      name: 'vite-url-stub',
      setup(b) {
        b.onResolve({ filter: /\?url$/ }, (a) => ({ path: a.path, namespace: 'url-stub' }));
        b.onLoad({ filter: /.*/, namespace: 'url-stub' }, () => ({
          contents: 'export default "";',
          loader: 'js',
        }));
      },
    },
  ],
};
const out1 = resolve(tmpdir(), `doll-ui-${process.pid}.js`);
const out2 = resolve(tmpdir(), `doll-ui-worker-${process.pid}.js`);
await esbuild({ ...common, entryPoints: [resolve(HERE, 'stand-entry.tsx')], outfile: out1 });
await esbuild({
  ...common,
  entryPoints: [resolve(REPO, 'src/lib/doll/worker/doll.worker.ts')],
  outfile: out2,
});
const bundle = readFileSync(out1, 'utf8');
const workerJs = readFileSync(out2, 'utf8');
rmSync(out1, { force: true });
rmSync(out2, { force: true });
let css = '';
try {
  const dir = resolve(REPO, 'dist/assets');
  const name = readdirSync(dir).find((f) => /^index-.*\.css$/.test(f));
  if (name) css = readFileSync(resolve(dir, name), 'utf8');
} catch {
  /* no build */
}
if (!css) console.log('note: dist CSS missing — screenshots are unstyled (run `vite build`)');

function resolvePlaywright() {
  const req = createRequire(import.meta.url);
  try {
    return req.resolve('playwright');
  } catch {
    /* npx cache next */
  }
  const r = `${homedir()}/.npm/_npx`;
  if (!existsSync(r)) return null;
  const found = execFileSync(
    'find',
    [r, '-maxdepth', '4', '-type', 'd', '-name', 'playwright', '-path', '*node_modules*'],
    { encoding: 'utf8' },
  )
    .split('\n')
    .filter(Boolean)[0];
  return found ? `${found}/index.js` : null;
}
const pw = resolvePlaywright();
if (!pw) {
  console.log('playwright not found — stand skipped');
  process.exit(1);
}
const mod = await import(pw);
const chromium = mod.chromium ?? mod.default?.chromium;

// ── stand cards ──
const b64file = (p) => readFileSync(p).toString('base64');
const ssStand = JSON.parse(
  readFileSync(resolve(PLANS, 'assembly-from-pattern/prod-run/SS26-005.stand.json'), 'utf8'),
);
const ssDxf = resolve(PLANS, 'assembly-from-pattern/probe/data/ss26-005-shirt.dxf');
const ss = {
  code: 'SS26-005',
  form: ssStand.form,
  categoryNames: ssStand.categoryNames,
  cloth: ssStand.cloth,
  files: Object.fromEntries((ssStand.form.patterns ?? []).map((p) => [p.url, b64file(ssDxf)])),
  // STAND DATA, not the card's: every prod size chart is empty (prod-data/README). A few cells so
  // the rail's spec / Δ / check is seen; the values are invented.
  chart: [
    { size: 'm', name: 'chest', value: 450 },
    { size: 'm', name: 'length', value: 660 },
    { size: 'm', name: 'shoulders', value: 400 },
    { size: 'm', name: 'sleeve', value: 662 },
    { size: 's', name: 'chest', value: 430 },
  ],
};

const prod = resolve(PLANS, 'assembly-3d-doll/prod-data');
const c6 = JSON.parse(readFileSync(resolve(prod, 'cards.json'), 'utf8'))['6'];
const dxfOf = (purpose) =>
  resolve(
    prod,
    'dxf',
    readdirSync(resolve(prod, 'dxf')).find((f) => f.startsWith(`card6-${purpose}-`)),
  );
const P = (x) => `TECH_CARD_BOM_PURPOSE_${x}`;
const fabricLines = c6.bom.filter((b) => b[1] === 'MAIN' || b[1] === 'POCKETING');
const card6 = {
  code: 'SS26-006',
  categoryNames: ['shirts', 'tops'],
  cloth: null,
  files: Object.fromEntries(c6.patterns.map((p) => [p[2], b64file(dxfOf(p[3]))])),
  card: {
    id: 6,
    techCard: {
      styleNumber: c6.sn,
      name: c6.name,
      targetGender: c6.gender,
      measurementUnit: c6.unit,
      sizeIds: c6.sizeIds,
      bomItems: c6.bom.map((b) => ({
        lineKey: b[0],
        section:
          b[1] === 'MAIN' || b[1] === 'POCKETING'
            ? 'TECH_CARD_BOM_SECTION_FABRIC'
            : b[2].includes('THREAD')
              ? 'TECH_CARD_BOM_SECTION_THREAD'
              : 'TECH_CARD_BOM_SECTION_HARDWARE',
        purpose: P(b[1]),
        kind: b[2],
        name: b[1].toLowerCase(),
        unit: 'm',
      })),
      patterns: c6.patterns.map((p) => ({
        sizeId: p[0],
        filename: p[1],
        url: p[2],
        fabricPurpose: P(p[3]),
        bomLineKey: p[4],
      })),
      pieces: c6.pieces.map((p) => ({
        lineKey: p[0],
        name: p[1],
        piecesPerGarment: p[2],
        cutSymmetry: `TECH_CARD_PIECE_CUT_SYMMETRY_${p[3]}`,
        fused: !!p[4],
        grainline: p[5],
      })),
      // prod-data keeps no block links: each piece's name IS its block (checked on the DXFs), and
      // a block is looked for in both fabrics (MAIN first) — findPiece takes the first that exists.
      pieceDxfAliases: {
        items: c6.pieces.flatMap((p) =>
          fabricLines.map((b) => ({
            pieceLineKey: p[0],
            blockName: p[1],
            bomLineKey: b[0],
            fabricPurpose: P(b[1]),
          })),
        ),
      },
      operations: c6.ops.map((o, i) => ({
        inputKeys: o[0].split('+').filter(Boolean),
        outputUnitKey: o[1],
        outputUnitName: o[2],
        operationType: `TECH_CARD_OPERATION_TYPE_${o[3]}`,
        seamClass: `TECH_CARD_SEAM_CLASS_${o[4]}`,
        operationNumber: (i + 1) * 10,
      })),
    },
  },
};
const goldOf = (id) =>
  JSON.parse(readFileSync(resolve(REPO, `scripts/doll/gold/${id}.seams.json`), 'utf8')).rows.map(
    (x) => x.row,
  );

// ── the page ──
// The GPU when there is one (Metal through ANGLE on a Mac): fps on software GL measures SwiftShader,
// not the view. GL=swiftshader forces the software path.
const GL_ARGS =
  process.env.GL === 'swiftshader'
    ? ['--use-angle=swiftshader', '--enable-unsafe-swiftshader']
    : ['--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist'];
const browser = await chromium.launch({ args: GL_ARGS });
const page = await browser.newPage({ viewport: { width: 1600, height: 1000 } });
const errors = [];
const escaped = [];
page.on('pageerror', (e) => errors.push(String(e)));
page.on('console', (m) => {
  if (m.type() === 'error') errors.push(`console: ${m.text()}`);
});
await page.route('**/*', (route) => {
  const url = route.request().url();
  if (url === `${ORIGIN}/`)
    return route.fulfill({
      status: 200,
      contentType: 'text/html',
      body: `<!doctype html><html><head><style>${css}</style></head><body class="bg-pageBg"><div id="root"></div></body></html>`,
    });
  // the app's fonts, from the build the CSS came from
  if (url.startsWith(`${ORIGIN}/assets/`)) {
    const f = resolve(REPO, 'dist/assets', url.slice(`${ORIGIN}/assets/`.length));
    if (existsSync(f)) return route.fulfill({ status: 200, body: readFileSync(f) });
  }
  if (url.startsWith(`${ORIGIN}/stand/`) && /doll\.worker/.test(url))
    return route.fulfill({ status: 200, contentType: 'text/javascript', body: workerJs });
  if (!url.startsWith('data:') && !url.startsWith('blob:')) escaped.push(url);
  return route.fulfill({ status: 200, contentType: 'application/json', body: '{}' });
});
const shot = async (name, el) => {
  const path = resolve(SHOT_DIR, `${name}.png`);
  if (el) await page.locator(el).first().screenshot({ path });
  else await page.screenshot({ path });
  console.log(`  shot → ${path}`);
};
const wait = (ms) => page.waitForTimeout(ms);
const waitFor = async (fn, tries = 100, arg) => {
  for (let i = 0; i < tries; i++) {
    if (await page.evaluate(fn, arg)) return true;
    await wait(200);
  }
  return false;
};
const mount = async (stand, o) => {
  await page.goto(`${ORIGIN}/`);
  await page.addScriptTag({ content: bundle });
  const parseMs = await page.evaluate(
    ([c, opts]) => window.__doll.mount(c, opts),
    [stand, o ?? {}],
  );
  const ok = await waitFor(() => window.__doll.hasGraph());
  return { ok, parseMs };
};
const overlayDone = (size) =>
  waitFor(
    (s) => {
      const el = document.querySelector('[data-doll-overlay]');
      return (
        !!el &&
        el.getAttribute('data-doll-status') === 'done' &&
        (!s || el.getAttribute('data-doll-size') === s)
      );
    },
    150,
    size,
  );
const open3d = async () => {
  await page.locator('[aria-label="assembly map view"] [role="radio"]', { hasText: '3d' }).click();
  await page.locator('[data-doll-overlay]').waitFor();
};
const timings = [];
const timing = async (label) => {
  const t = await page.evaluate(() => {
    const el = document.querySelector('[data-doll-overlay]');
    return {
      first: Number(el?.getAttribute('data-doll-first-frame-ms') || NaN),
      done: Number(el?.getAttribute('data-doll-done-ms') || NaN),
      verts: Number(el?.getAttribute('data-doll-vertices') || NaN),
      size: el?.getAttribute('data-doll-size'),
    };
  });
  timings.push({ label, ...t });
  console.log(
    `  ${label}: first frame ${t.first.toFixed(0)} ms · settled ${t.done.toFixed(0)} ms · ${t.verts} vertices · size ${t.size}`,
  );
  return t;
};
/** Orbit by a real drag for ~2 s; fps = frames drawn by the canvas / time, and rAF fps alongside. */
const orbitFps = async () => {
  const box = await page.locator('[data-doll-gl]').boundingBox();
  const cx = box.x + box.width / 2;
  const cy = box.y + box.height / 2;
  const f0 = await page.evaluate(() => {
    window.__long = 0;
    window.__lo?.disconnect();
    try {
      window.__lo = new PerformanceObserver((l) => (window.__long += l.getEntries().length));
      window.__lo.observe({ type: 'longtask' });
    } catch {
      /* no longtask timing */
    }
    window.__raf = 0;
    window.__rafOn = true;
    const tick = () => {
      window.__raf++;
      if (window.__rafOn) requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
    return window.__dollFrames ?? 0;
  });
  const t0 = Date.now();
  await page.mouse.move(cx, cy);
  await page.mouse.down();
  for (let i = 0; i < 120; i++) {
    await page.mouse.move(cx + 200 * Math.sin(i / 12), cy + 30 * Math.cos(i / 9));
    await wait(16);
  }
  await page.mouse.up();
  const dt = (Date.now() - t0) / 1000;
  const r = await page.evaluate(() => {
    window.__rafOn = false;
    window.__lo?.disconnect();
    return { frames: window.__dollFrames ?? 0, raf: window.__raf, long: window.__long };
  });
  const fps = (r.frames - f0) / dt;
  const raf = r.raf / dt;
  return { fps, raf, dt, long: r.long };
};

// ════ SS26-005, no stored rows ════
head('SS26-005 — engine only (no stored rows)');
let m = await mount(ss);
ck(m.ok, 'the provider reads the seam graph', `DXF parsed in ${m.parseMs.toFixed(0)} ms`);
ck(
  (await page
    .locator('[aria-label="assembly map view"] [role="radio"]', { hasText: '3d' })
    .count()) === 1,
  'the map shows the fourth chip: STEP · PIECES · SKETCH · 3D',
);
await open3d();
ck(await overlayDone(), 'the overlay solves the doll in the worker');
const tSS = await timing('SS26-005 M (engine)');
ck(tSS.first <= 1500, 'first frame ≤ 1.5 s after the graph is ready', `${tSS.first.toFixed(0)} ms`);
ck(tSS.verts <= 20000, '≤ 20k vertices', `${tSS.verts}`);
const honesty = await page.locator('[data-doll-honesty]').innerText();
ck(
  /paper doll — shape approximate, no fabric or body · measures from the pattern laid flat \(seam lines\) · size M/i.test(
    honesty,
  ),
  'header honesty line verbatim',
  honesty,
);
const stateSS = await page.locator('[data-doll-state]').innerText();
console.log(`  state: ${stateSS}`);
ck(/seams? closed/.test(stateSS), 'state line in words');
await waitFor(() => document.querySelectorAll('[data-pom-row]').length > 0);
const pomRows = await page.locator('[data-pom-row]').count();
ck(pomRows >= 10, 'POM rail lists the standard measures', `${pomRows}`);
const exWords = await page
  .locator('[data-pom-row]')
  .evaluateAll((els) => els.map((e) => e.getAttribute('data-pom-exactness')));
console.log(
  `  exactness: ${JSON.stringify(exWords.reduce((a, w) => ((a[w] = (a[w] ?? 0) + 1), a), {}))}`,
);
const specs = await page.locator('[data-pom-spec]').allInnerTexts();
console.log(`  spec rows: ${specs.join(' | ')}`);
ck(specs.length >= 3, 'spec + Δ shown where the (stand) chart has a value');
ck(
  specs.some((t) => /±1\.0 default/.test(t)),
  'tolerance said as «±1.0 default»',
);
await page.locator('[data-doll-toggle="pom"]').click();
await wait(400);
await shot('02-overlay-ss26-front-pom-lines');
const chestRow = page.locator('[data-pom-row="chest"]');
await chestRow.hover();
await wait(400);
const pin = await page.locator('[data-pin^="pom:"]').allInnerTexts();
ck(
  pin.length === 1 && /chest · \d+\.\d cm/i.test(pin[0]),
  'hovered POM row → its line lit with «chest · 44.5 cm»',
  pin[0],
);
await shot('03-hover-pom-chest');
const fpsSS = await orbitFps();
console.log(
  `  orbit: ${fpsSS.fps.toFixed(1)} frames drawn/s (one per mouse move the probe sends) · rAF ${fpsSS.raf.toFixed(1)}/s · ${fpsSS.long} long tasks over ${fpsSS.dt.toFixed(1)} s (${process.env.GL === 'swiftshader' ? 'SwiftShader, software GL' : 'GPU through ANGLE'})`,
);
ck(fpsSS.fps > 0, 'orbit redraws on drag');
ck(
  fpsSS.raf >= 55 && fpsSS.long === 0,
  'orbit holds 60 fps: rAF ≥ 55/s, no long task during the drag',
  `${fpsSS.raf.toFixed(1)}/s · ${fpsSS.long} long`,
);
// the report strip
const reportRowsSS = await page
  .locator('[data-doll-row]')
  .evaluateAll((els) => els.map((e) => e.getAttribute('data-doll-row')));
console.log(
  `  report rows: ${JSON.stringify(reportRowsSS.reduce((a, w) => ((a[w] = (a[w] ?? 0) + 1), a), {}))}`,
);
// camera presets
await page.locator('[aria-label="camera"] [role="radio"]', { hasText: 'back' }).click();
await wait(500);
await shot('04-ss26-back');
await page.locator('[aria-label="camera"] [role="radio"]', { hasText: 'front' }).click();
await wait(400);
// size switch
await page.locator('[aria-label="size"] [role="radio"]', { hasText: /^S$/ }).click();
ck(await overlayDone('S'), 'size S: the doll is rebuilt in the worker on selection');
const tS = await timing('SS26-005 S (engine)');
ck(tS.first <= 1500, 'size S: first frame ≤ 1.5 s', `${tS.first.toFixed(0)} ms`);
ck(
  /size S/.test(await page.locator('[data-doll-honesty]').innerText()),
  'honesty line follows the size',
);
await wait(300);
await shot('05-size-switch-S');
await page.locator('[aria-label="size"] [role="radio"]', { hasText: /^M$/ }).click();
ck(await overlayDone('M'), 'back to M: the cached doll');
// fix in seams review
const fixDoors = page.locator('[data-doll-door="fix"]');
if ((await fixDoors.count()) > 0) {
  await fixDoors.first().click();
  await page.locator('[data-seams-review]').waitFor();
  await wait(500);
  const sel = await page.locator('[data-seam-row][aria-selected="true"]').count();
  const hand = await page.locator('[data-connect-words]').count();
  ck(
    sel === 1 || hand === 1,
    '«fix in seams review» opens SEAMS on that seam (row selected, or laid in the connect strip)',
    `selected ${sel} · strip ${hand}`,
  );
  await shot('06-fix-in-seams-review');
  await page.keyboard.press('Escape');
  await wait(200);
  if (await page.locator('[data-connect-words]').count()) {
    await page.keyboard.press('Escape');
    await wait(200);
  }
  if (await page.locator('[data-seams-review]').count()) {
    await page.locator('[data-seams-door="close"]').click();
    await wait(300);
  }
  ck(
    (await page.locator('[data-seams-review]').count()) === 0,
    'the review closes back onto the doll',
  );
}
await page.keyboard.press('Escape');
await wait(400);
ck((await page.locator('[data-doll-overlay]').count()) === 0, 'Esc closes the overlay');
await waitFor(() => !!document.querySelector('[data-doll-still] img'));
const colState = await page.locator('[data-doll-column-state]').innerText();
console.log(`  column: ${colState}`);
ck(/closed/.test(colState), 'column: the state line');
ck(
  (await page.locator('[data-doll-still] img').count()) === 1,
  'column: the PNG still from the worker (no second WebGL context)',
);
ck(
  (await page.locator('[data-map-column] canvas').count()) === 0,
  'column: no canvas in the column',
);
await shot('01-chip-in-column', '[data-map-column]');

// ════ SS26-005 with gold rows ════
head('SS26-005 — gold seam rows stored on the card');
m = await mount(ss, { gold: goldOf('ss26') });
ck(m.ok, 'the provider reads the seam graph with the stored rows');
await wait(1500);
await open3d();
ck(await overlayDone(), 'solved');
await timing('SS26-005 M (gold rows)');
await waitFor(() => document.querySelectorAll('[data-pom-row]').length > 0);
console.log(`  state: ${await page.locator('[data-doll-state]').innerText()}`);
await page.locator('[data-doll-toggle="pom"]').click();
await wait(400);
await shot('07-ss26-gold-front-pom-lines');
await page.keyboard.press('Escape');

// ════ card 6 ════
for (const [label, gold, name] of [
  ['prod card 6 (SS26-006) — engine only', null, '08-card6-engine'],
  ['prod card 6 (SS26-006) — gold seam rows', goldOf('card6'), '09-card6-gold'],
]) {
  head(label);
  m = await mount(card6, gold ? { gold } : {});
  ck(m.ok, 'the provider reads the seam graph', `DXF parsed in ${m.parseMs.toFixed(0)} ms`);
  if (!m.ok) continue;
  await wait(gold ? 1500 : 300);
  await open3d();
  ck(await overlayDone(), 'solved');
  await waitFor(() => document.querySelectorAll('[data-pom-row]').length > 0);
  await page.locator('[data-doll-toggle="pom"]').click();
  await wait(400);
  const t = await timing(label);
  ck(t.first <= 1500, 'first frame ≤ 1.5 s', `${t.first.toFixed(0)} ms`);
  console.log(`  state: ${await page.locator('[data-doll-state]').innerText()}`);
  const rr = await page.locator('[data-doll-row]').allInnerTexts();
  rr.slice(0, 6).forEach((x) => console.log(`  row: ${x.replace(/\n+/g, ' | ')}`));
  await shot(name);
  if (rr.some((x) => /^open/i.test(x)))
    await shot(`${name}-report-open-seam`, '[data-doll-report]');
  const f = await orbitFps();
  console.log(
    `  orbit: ${f.fps.toFixed(1)} frames drawn/s · rAF ${f.raf.toFixed(1)}/s · ${f.long} long tasks`,
  );
  ck(f.raf >= 55 && f.long === 0, 'orbit holds 60 fps', `${f.raf.toFixed(1)}/s · ${f.long} long`);
  await page.keyboard.press('Escape');
}

head('network');
ck(escaped.length === 0, 'no request left the page', escaped.slice(0, 3).join(', '));
const all = await page.evaluate(() => window.__doll.calls().map((c) => `${c.method} ${c.path}`));
console.log(`  fake backend saw (last mount): ${[...new Set(all)].join(' · ')}`);
ck(
  all.every((c) => c.startsWith('GET ')),
  'the doll writes nothing: only GETs reached the fake backend',
);
ck(errors.length === 0, 'no page errors', errors.slice(0, 3).join(' | '));
console.log(`\ntimings: ${JSON.stringify(timings)}`);
await browser.close();
console.log(`\n${bad ? `${bad} FAIL` : 'all ok'}`);
process.exit(bad ? 1 : 0);
