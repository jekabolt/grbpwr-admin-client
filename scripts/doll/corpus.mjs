#!/usr/bin/env node
// yarn doll:corpus — EVERY PROD CARD WITH A DXF, ASSEMBLED THE WAY THE LIVE APP ASSEMBLES IT.
//
// The archives the owner exported from prod and imported on beta (tech-card archive format,
// tmp/plans/assembly-3d-doll/prod-archives/prod-card-<id>.zip) are mounted one by one in the REAL
// construction column (scripts/assembly-doll-ui/stand-entry.tsx: AssemblyMap + SeamsDoor under the
// real providers, the real DXF parse, the real block links and findPiece, the card's sizes, BOM,
// operations and gender through mapTechCardToForm). The 3D chip is pressed, the doll is solved in
// the real worker, and the overlay's own words are read back: the state line, the size it read, the
// "no contour in size …" line and the ASSEMBLY CHECK rows. Nothing leaves the page (fetch is
// replaced; every non-stand URL is routed to a stub).
//
// The dictionary of each card is the archive's own id maps (sizes, category path), so the size
// tokens and the category template are the ones the card has.
//
//   yarn doll:corpus                       all 13
//   ONLY=7,11 yarn doll:corpus             some (prod ids)
//   CORPUS_TAG=after yarn doll:corpus      writes <out>/<tag>/<id>.png + corpus.json
//   CORPUS_COMPARE=before yarn doll:corpus  prints the table beside the saved <out>/before/corpus.json
//
// Defaults: PLANS=../tmp/plans, out = PLANS/assembly-3d-doll/beta-all.
import { build as esbuild } from 'esbuild';
import { execFileSync } from 'node:child_process';
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { createRequire } from 'node:module';
import { homedir, tmpdir } from 'node:os';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = resolve(HERE, '../..');
const PLANS = process.env.PLANS ?? resolve(REPO, '../tmp/plans');
const ARCH = process.env.CORPUS_ARCHIVES ?? resolve(PLANS, 'assembly-3d-doll/prod-archives');
const OUT = process.env.CORPUS_OUT ?? resolve(PLANS, 'assembly-3d-doll/beta-all');
const TAG = process.env.CORPUS_TAG ?? 'now';
const COMPARE = process.env.CORPUS_COMPARE ?? (TAG === 'before' ? '' : 'before');
const SHOTS = resolve(OUT, TAG);
mkdirSync(SHOTS, { recursive: true });
const TIMEOUT_MS = Number(process.env.CORPUS_TIMEOUT_MS ?? 60000);

// The order RESULTS.md lists them in (prod id).
const ORDER = [5, 6, 7, 8, 9, 11, 4, 16, 1, 12, 13, 14, 15];
const only = (process.env.ONLY ?? '').split(',').filter(Boolean).map(Number);
const ids = ORDER.filter(
  (id) => (!only.length || only.includes(id)) && existsSync(resolve(ARCH, `prod-card-${id}.zip`)),
);

// ── the archives → stand cards ──────────────────────────────────────────────────────────────────
const unz = mkdtempSync(resolve(tmpdir(), 'doll-corpus-'));
function standCard(id) {
  const dir = resolve(unz, String(id));
  mkdirSync(dir, { recursive: true });
  execFileSync('unzip', ['-oq', resolve(ARCH, `prod-card-${id}.zip`), '-d', dir]);
  const manifest = JSON.parse(readFileSync(resolve(dir, 'manifest.json'), 'utf8'));
  const full = JSON.parse(readFileSync(resolve(dir, 'card.json'), 'utf8'));
  const index = JSON.parse(readFileSync(resolve(dir, 'patterns/index.json'), 'utf8'));
  const fileOf = new Map(index.map((x) => [x.line_key, x.file]));
  const files = {};
  const tc = full.techCard;
  tc.patterns = (tc.patterns ?? []).map((p) => {
    const f = fileOf.get(p.lineKey);
    if (!f) return p;
    const url = `https://files.invalid/archive/${id}/${f}`;
    files[url] = readFileSync(resolve(dir, f)).toString('base64');
    return { ...p, url };
  });
  // Dictionary from the archive's id maps: every size the export knew, the category chain
  // (root first in the manifest) with the card's own category id on the leaf.
  const sizes = Object.entries(manifest.id_maps?.sizes ?? {})
    .map(([k, name]) => ({ id: Number(k), name, skuOrd: Number(k) }))
    .sort((a, b) => a.id - b.id);
  const path = manifest.id_maps?.category_path ?? [];
  const categories = path.map((name, i) => ({
    id: i === path.length - 1 ? tc.categoryId || 9000 + i : 9000 + i,
    name,
    ...(i > 0 ? { parentId: 9000 + i - 1 } : {}),
  }));
  if (path.length) tc.categoryId = categories[categories.length - 1].id;
  else delete tc.categoryId;
  const categoryNames = [...path].reverse();
  return {
    code: tc.styleNumber,
    card: { ...full, id: 6 },
    categoryNames,
    cloth: null,
    files,
    dictionary: { sizes, categories },
  };
}

// ── bundles ─────────────────────────────────────────────────────────────────────────────────────
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
const out1 = resolve(tmpdir(), `doll-corpus-${process.pid}.js`);
const out2 = resolve(tmpdir(), `doll-corpus-worker-${process.pid}.js`);
await esbuild({
  ...common,
  entryPoints: [resolve(REPO, 'scripts/assembly-doll-ui/stand-entry.tsx')],
  outfile: out1,
});
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
  console.log('playwright not found — corpus skipped');
  process.exit(1);
}
const mod = await import(pw);
const chromium = mod.chromium ?? mod.default?.chromium;
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
  if (url.startsWith(`${ORIGIN}/assets/`)) {
    const f = resolve(REPO, 'dist/assets', url.slice(`${ORIGIN}/assets/`.length));
    if (existsSync(f)) return route.fulfill({ status: 200, body: readFileSync(f) });
  }
  if (url.startsWith(`${ORIGIN}/stand/`) && /doll\.worker/.test(url))
    return route.fulfill({ status: 200, contentType: 'text/javascript', body: workerJs });
  if (!url.startsWith('data:') && !url.startsWith('blob:')) escaped.push(url);
  return route.fulfill({ status: 200, contentType: 'application/json', body: '{}' });
});
const wait = (ms) => page.waitForTimeout(ms);
const waitFor = async (fn, ms, arg) => {
  const t0 = Date.now();
  while (Date.now() - t0 < ms) {
    if (await page.evaluate(fn, arg)) return true;
    await wait(200);
  }
  return false;
};

// ── run ─────────────────────────────────────────────────────────────────────────────────────────
const results = [];
for (const id of ids) {
  const c = standCard(id);
  const r = { id, code: c.code, name: c.card.techCard?.name ?? '' };
  results.push(r);
  console.log(`\n── prod ${id} · ${c.code} ${r.name}`);
  await page.goto(`${ORIGIN}/`);
  // The doll request the overlay posts to the worker, kept for the node runner (corpus-node.mjs).
  await page.evaluate(() => {
    const orig = Worker.prototype.postMessage;
    window.__dollReqs = [];
    Worker.prototype.postMessage = function (m, ...rest) {
      if (m && m.kind !== 'pom' && m.input?.facts) window.__dollReqs.push(m.input);
      return orig.call(this, m, ...rest);
    };
  });
  await page.addScriptTag({ content: bundle });
  await page.evaluate((card) => window.__doll.mount(card, {}), c);
  r.graph = await waitFor(() => window.__doll.hasGraph(), 30000);
  const chip = page.locator('[aria-label="assembly map view"] [role="radio"]', { hasText: '3d' });
  if (!(await chip.count())) {
    r.state = r.graph ? 'no 3D chip' : 'no seam graph (no 3D chip)';
    console.log(`  ${r.state}`);
    continue;
  }
  const t0 = Date.now();
  await chip.click();
  await page.locator('[data-doll-overlay]').waitFor();
  const ended = await waitFor(() => {
    const el = document.querySelector('[data-doll-overlay]');
    const s = el?.getAttribute('data-doll-status');
    return s === 'done' || s === 'error';
  }, TIMEOUT_MS);
  r.wallMs = Date.now() - t0;
  await wait(600);
  const o = await page.evaluate(() => {
    const el = document.querySelector('[data-doll-overlay]');
    const text = (sel) => document.querySelector(sel)?.textContent?.trim() ?? '';
    const missing = [...document.querySelectorAll('[data-doll-overlay] p')]
      .map((p) => p.textContent?.trim() ?? '')
      .find((t) => /no contour in/.test(t));
    const words = [...document.querySelectorAll('[data-doll-overlay] p')]
      .map((p) => p.textContent?.trim() ?? '')
      .filter((t) => /not a garment|flat/.test(t));
    return {
      status: el?.getAttribute('data-doll-status') ?? '',
      size: el?.getAttribute('data-doll-size') ?? '',
      doneMs: Number(el?.getAttribute('data-doll-done-ms') || NaN),
      state: text('[data-doll-state]'),
      missing: missing ?? '',
      words,
      rows: [...document.querySelectorAll('[data-doll-row]')].map((li) => ({
        kind: li.getAttribute('data-doll-row'),
        text: (li.textContent ?? '').replace(/fix in seams review|check$/g, '').trim(),
      })),
    };
  });
  Object.assign(r, o, { ended });
  const n = (re) => Number((o.state.match(re) ?? [])[1] ?? 0);
  r.closed = n(/(\d+) seams? closed/);
  r.stretched = n(/(\d+) stretched/);
  r.proposed = n(/(\d+) proposed/);
  r.open = n(/(\d+) open/);
  r.floating = o.rows.filter((x) => x.kind === 'floating').length;
  r.contradictions = o.rows.filter((x) => x.kind === 'contradiction').length;
  r.missingCount = Number((o.missing.match(/^(\d+)/) ?? [])[1] ?? 0);
  console.log(`  size ${o.size} · ${o.status}${ended ? '' : ' (TIMED OUT)'} · ${o.state}`);
  if (o.missing) console.log(`  ${o.missing.slice(0, 240)}`);
  for (const w of o.words) console.log(`  words: ${w.slice(0, 240)}`);
  for (const row of o.rows.slice(0, 14))
    console.log(`   · [${row.kind}] ${row.text.slice(0, 200)}`);
  if (o.rows.length > 14) console.log(`   · … ${o.rows.length - 14} more`);
  const reqs = await page.evaluate(() => JSON.stringify(window.__dollReqs ?? []));
  mkdirSync(resolve(SHOTS, 'req'), { recursive: true });
  writeFileSync(resolve(SHOTS, 'req', `${id}.json`), reqs);
  const shotPath = resolve(SHOTS, `${id}-${c.code}.png`);
  await page.locator('[data-doll-overlay]').screenshot({ path: shotPath });
}
await browser.close();
rmSync(unz, { recursive: true, force: true });

writeFileSync(resolve(SHOTS, 'corpus.json'), JSON.stringify(results, null, 2));
let before = null;
if (COMPARE && existsSync(resolve(OUT, COMPARE, 'corpus.json')))
  before = new Map(
    JSON.parse(readFileSync(resolve(OUT, COMPARE, 'corpus.json'), 'utf8')).map((x) => [x.id, x]),
  );
const cell = (x) =>
  !x
    ? '—'
    : x.status === 'done' && /cannot wrap/.test(x.state)
      ? `flat, in words (not a garment) · ${(x.doneMs / 1000).toFixed(1)}s · ${x.size}`
      : x.status !== 'done'
        ? `${x.status || x.state || 'none'}${x.ended === false ? ' (hung)' : ''}`
        : `${x.closed}c ${x.stretched ? `${x.stretched}s ` : ''}${x.proposed}p ${x.open}o ${x.floating}f · ${(x.doneMs / 1000).toFixed(1)}s · ${x.size}${x.missingCount ? ` (${x.missingCount} missing)` : ''}`;
console.log(
  `\n══ SUMMARY (${TAG}${before ? ` vs ${COMPARE}` : ''}) — c closed · s stretched · p proposed · o open · f floating`,
);
console.log(
  `| prod | card | ${before ? `${COMPARE} | ` : ''}${TAG} |\n|---|---|${before ? '---|' : ''}---|`,
);
for (const r of results)
  console.log(
    `| ${r.id} | ${r.code} | ${before ? `${cell(before.get(r.id))} | ` : ''}${cell(r)} |`,
  );
if (errors.length)
  console.log(`\npage errors (${errors.length}):\n  ${errors.slice(0, 10).join('\n  ')}`);
const leaked = escaped.filter((u) => !u.startsWith('https://files.invalid/'));
console.log(
  `\nrequests routed to the stub: ${leaked.length}${leaked.length ? ` (${[...new Set(leaked)].slice(0, 5).join(', ')})` : ''}`,
);
console.log(`shots + corpus.json → ${SHOTS}`);

// The shape gate (shape.mjs): the captured requests solved again in node and measured by shape,
// plus FRONT / LEFT / BACK renders at 1600 px — into the same tag. CORPUS_SHAPE=0 skips it.
if (process.env.CORPUS_SHAPE !== '0')
  execFileSync(process.execPath, [resolve(HERE, 'shape.mjs')], {
    stdio: 'inherit',
    env: { ...process.env, CORPUS_TAG: TAG, CORPUS_REQ: TAG },
  });
