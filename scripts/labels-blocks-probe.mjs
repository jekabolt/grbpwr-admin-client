#!/usr/bin/env node
// LABELS / PACKAGING BLOCKS (labels rework I-10 / I-11) — the real blocks in a real browser.
//
//   (1) empty state: the LABELS block shows ONLY the dashed `+ label` row — no card, no field;
//   (2) the picker replaces that row in place (never two add doors at once); picking a KNOWN kind
//       adds a card with the missing-mockup state (dashed slot + `! no mockup`), and the form holds
//       exactly one bare row with that key;
//   (3) typing a CUSTOM name (Enter) adds a custom card titled as typed;
//   (4) a field edit reaches the form by key, and clearing it again does NOT drop the row (keepBare);
//   (5) attaching a mockup (⌘V over the card → intake → upload, the real road) puts the media id on
//       the row and clears the missing state;
//   (6) each card has exactly ONE remove control, and it removes the row through the writer;
//   (7) PACKAGING: carton row present, items start empty with only `+ item`.
//
// Every run is checked on the real code AND on in-memory mutants that each must turn a named
// check red (the negative controls). The repository is never touched.
//
//   node scripts/labels-blocks-probe.mjs                  real + all mutants
//   node scripts/labels-blocks-probe.mjs --mutate=NAME    one mutant, output as is (red)
import { createRequire } from 'node:module';
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, rmSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { homedir, tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { build as esbuild } from 'esbuild';

const ONLY = (process.argv.find((a) => a.startsWith('--mutate=')) ?? '').split('=')[1] ?? '';

function resolvePlaywright() {
  const require = createRequire(import.meta.url);
  try { return require.resolve('playwright'); } catch {}
  try {
    const root = `${homedir()}/.npm/_npx`;
    if (!existsSync(root)) return null;
    const found = execFileSync('find',
      [root, '-maxdepth', '4', '-type', 'd', '-name', 'playwright', '-path', '*node_modules*'],
      { encoding: 'utf8' }).split('\n').filter(Boolean)[0];
    return found ? `${found}/index.js` : null;
  } catch { return null; }
}
const pw = resolvePlaywright();
if (!pw) { console.log('DID NOT RUN: playwright not found'); process.exit(2); }
const mod = await import(pw);
const chromium = mod.chromium ?? mod.default?.chromium;
if (!chromium) { console.log('DID NOT RUN: playwright without chromium'); process.exit(2); }

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = resolve(HERE, '..');
const C = 'src/components/managers/tech-card/components';

// [file suffix, from, to] + the check prefix that MUST go red.
const MUTANTS = {
  // the ✕ no longer calls the writer
  removeNoop: {
    file: `${C}/labels-blocks.tsx`,
    from: 'onRemove={() => writers.remove(getValues, setValue, key)}',
    to: 'onRemove={() => {}}',
    breaks: '6',
  },
  // the mockup slot stays «missing» whatever is attached
  missingSticks: {
    file: `${C}/label-card.tsx`,
    from: 'const missing = ids.length === 0;',
    to: 'const missing = true;',
    breaks: '5',
  },
  // the card patches without keepBare: clearing the last field drops the row
  noKeepBare: {
    file: `${C}/labels-blocks.tsx`,
    from: '{ keepBare: true }',
    to: '{ keepBare: false }',
    breaks: '4',
  },
  // the picker no longer replaces the door: two add doors at once
  twoDoors: {
    file: `${C}/kind-picker.tsx`,
    from: '  if (!open) {\n',
    to: '  if (!open || true) {\n',
    breaks: '2',
  },
};

async function bundle(mutant) {
  const m = mutant ? MUTANTS[mutant] : null;
  let hit = false;
  const outfile = resolve(tmpdir(), `labels-blocks-${process.pid}-${mutant || 'real'}.js`);
  await esbuild({
    entryPoints: [resolve(HERE, 'labels-blocks-probe-entry.tsx')],
    bundle: true, platform: 'browser', format: 'iife', target: 'es2020', outfile,
    logLevel: 'silent', absWorkingDir: REPO, jsx: 'automatic',
    loader: { '.svg': 'text', '.png': 'dataurl', '.woff2': 'dataurl', '.css': 'empty' },
    plugins: m ? [{
      name: 'mutate',
      setup(b) {
        b.onLoad({ filter: /\.(ts|tsx)$/ }, async (args) => {
          if (!args.path.endsWith(m.file)) return null;
          const src = await readFile(args.path, 'utf8');
          if (!src.includes(m.from)) throw new Error(`mutant ${mutant}: anchor not found`);
          hit = true;
          return { contents: src.split(m.from).join(m.to), loader: 'tsx' };
        });
      },
    }] : [],
    define: {
      'import.meta.env.VITE_SERVER_URL': '"http://stub.invalid"',
      'import.meta.env': '{"VITE_SERVER_URL":"http://stub.invalid","MODE":"production"}',
      'process.env.NODE_ENV': '"production"',
    },
    alias: {
      components: resolve(REPO, 'src/components'), lib: resolve(REPO, 'src/lib'),
      api: resolve(REPO, 'src/api'), utils: resolve(REPO, 'src/utils'),
      ui: resolve(REPO, 'src/ui'), constants: resolve(REPO, 'src/constants'),
      store: resolve(REPO, 'src/store'), hooks: resolve(REPO, 'src/hooks'),
      context: resolve(REPO, 'src/context'), types: resolve(REPO, 'src/types'),
    },
  });
  if (m && !hit) throw new Error(`mutant ${mutant}: did not apply`);
  const text = readFileSync(outfile, 'utf8');
  rmSync(outfile, { force: true });
  return text;
}

const PNG_B64 =
  'iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAYAAABytg0kAAAAFElEQVR4nGP8z8DAwMDAwMDEAAMADgIBAWiJ8fMAAAAASUVORK5CYII=';
const PNG = Buffer.from(PNG_B64, 'base64');
const media = (id) => ({
  id,
  media: {
    fullSize: { mediaUrl: `https://cdn.example/${id}-full.png`, width: 2, height: 2 },
    thumbnail: { mediaUrl: `https://cdn.example/${id}-thumb.png`, width: 2, height: 2 },
    blurhash: '',
  },
});

async function run(browser, code, log) {
  const results = [];
  const ck = (ok, what, d = '') => {
    results.push({ ok, what });
    if (log) console.log(`${ok ? '  ok  ' : '  FAIL'} ${what}${d ? `  — ${d}` : ''}`);
  };
  const page = await browser.newPage({ viewport: { width: 1280, height: 1000 } });
  // A mutant may take a card away: a step waits a few seconds, not thirty, and fails as a check.
  page.setDefaultTimeout(4000);
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  let uploads = 0;
  await page.route('http://probe.local/**', (r) =>
    r.fulfill({ status: 200, contentType: 'text/html', body: '<div id="root"></div>' }));
  await page.route('https://cdn.example/**', (r) =>
    r.fulfill({ status: 200, contentType: 'image/png', body: PNG }));
  await page.route('http://stub.invalid/**', (r) => {
    const url = r.request().url();
    if (/content\/(image|vector)/.test(url)) {
      uploads += 1;
      return r.fulfill({ status: 200, contentType: 'application/json',
        body: JSON.stringify({ media: media(700 + uploads) }) });
    }
    if (/usage/.test(url)) return r.fulfill({ status: 200, contentType: 'application/json', body: '{"usage":[]}' });
    return r.fulfill({ status: 200, contentType: 'application/json', body: '{"list":[],"total":0}' });
  });
  await page.goto('http://probe.local/');
  await page.addScriptTag({ content: code });
  await page.evaluate(() => window.__lb.mount());
  await page.waitForSelector('[data-keyed-cards="garmentLabels"]', { timeout: 15000 });

  const form = () => page.evaluate(() => window.__lb.form());
  const labels = async () => (await form()).garmentLabels ?? [];
  const L = '[data-keyed-cards="garmentLabels"]';

  // (1) empty state
  try {
    const cards = await page.locator(`${L} [data-label-card]`).count();
    const controls = await page.locator(`${L} button, ${L} input, ${L} select, ${L} textarea`).count();
    const door = await page.locator(`${L} [data-kind-add="label"]`).count();
    ck(cards === 0 && door === 1 && controls === 1,
      '1 · empty LABELS = only the + label row', `cards ${cards}, doors ${door}, controls ${controls}`);
  } catch (e) { ck(false, '1 · step threw', String(e).split('\n')[0]); }

  // (2) picker in place + known kind
  try {
    await page.click(`${L} [data-kind-add="label"]`);
    const doors = await page.locator(`${L} [data-kind-add="label"]`).count();
    const pickers = await page.locator(`${L} [data-kind-picker="label"]`).count();
    ck(doors === 0 && pickers === 1, '2 · the picker replaced the add row (one add door)', `doors ${doors}, pickers ${pickers}`);
    await page.selectOption(`${L} [data-kind-select="label"]`, 'hangtag').catch(() => {});
    await page.click(`${L} [data-kind-confirm="label"]`).catch(() => {});
    await page.waitForTimeout(150);
    const card = page.locator(`${L} [data-label-card="hangtag"]`);
    ck(await card.count() === 1, '2 · a known kind added its card');
    ck(await card.locator('[data-mockup-missing]').count() === 1
      && await card.locator('[data-mockup-missing-pill]').count() === 1,
      '2 · the new card shows the missing-mockup state');
    const ls = await labels();
    ck(ls.length === 1 && ls[0].key === 'hangtag' && (ls[0].mediaIds ?? []).length === 0,
      '2 · the form holds one bare row keyed hangtag', JSON.stringify(ls));
    ck(await page.locator(`${L} [data-kind-add="label"]`).count() === 1, '2 · the add row is back after adding');
  } catch (e) { ck(false, '2 · step threw', String(e).split('\n')[0]); }

  // (3) custom name
  try {
    await page.click(`${L} [data-kind-add="label"]`).catch(() => {});
    await page.fill(`${L} [data-kind-own="label"]`, 'tax stamp').catch(() => {});
    await page.press(`${L} [data-kind-own="label"]`, 'Enter').catch(() => {});
    await page.waitForTimeout(150);
    const card = page.locator(`${L} [data-label-card="tax stamp"]`);
    const title = (await card.locator('[data-label-card-title]').textContent().catch(() => '')) ?? '';
    ck(await card.count() === 1 && title.trim() === 'tax stamp', '3 · a typed name added a custom card', `title «${title}»`);
    const keys = (await labels()).map((l) => l.key);
    ck(JSON.stringify(keys) === '["hangtag","tax stamp"]', '3 · form keys in order', JSON.stringify(keys));
  } catch (e) { ck(false, '3 · step threw', String(e).split('\n')[0]); }

  // (4) field edit by key; clearing keeps the row
  try {
    const f = `${L} [data-label-field="hangtag:placement"]`;
    await page.fill(f, 'left side seam');
    let row = (await labels()).find((l) => l.key === 'hangtag');
    ck(row?.placement === 'left side seam', '4 · placement reached the row by key');
    await page.fill(f, '');
    await page.waitForTimeout(100);
    row = (await labels()).find((l) => l.key === 'hangtag');
    const cards = await page.locator(`${L} [data-label-card="hangtag"]`).count();
    ck(!!row && cards === 1, '4 · clearing the last field keeps the row and the card', JSON.stringify(await labels()));
  } catch (e) { ck(false, '4 · step threw', String(e).split('\n')[0]); }

  // (5) attach a mockup: ⌘V over the card → intake → upload
  try {
    const card = page.locator(`${L} [data-label-card="hangtag"]`);
    await card.hover({ position: { x: 600, y: 20 } });
    await page.evaluate((b64) => {
      const dt = new DataTransfer();
      const bin = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
      dt.items.add(new File([bin], 'mockup.png', { type: 'image/png' }));
      document.dispatchEvent(new ClipboardEvent('paste', { clipboardData: dt, bubbles: true, cancelable: true }));
    }, PNG_B64);
    await page.waitForTimeout(500);
    await page.locator('button', { hasText: /^upload( all)?( \(\d+\))?$/i }).first().click({ timeout: 5000 }).catch(() => {});
    await page.waitForTimeout(1200);
    const row = (await labels()).find((l) => l.key === 'hangtag');
    ck(uploads === 1 && JSON.stringify(row?.mediaIds) === '[701]',
      '5 · the pasted mockup landed on THIS row', `uploads ${uploads}, ${JSON.stringify(row?.mediaIds)}`);
    const other = (await labels()).find((l) => l.key === 'tax stamp');
    ck((other?.mediaIds ?? []).length === 0, '5 · and not on the neighbour');
    ck(await card.locator('[data-mockup-missing]').count() === 0
      && await card.locator('[data-mockup-missing-pill]').count() === 0
      && await card.locator('[data-mockup-pic="701"]').count() === 1,
      '5 · the missing state cleared, the thumbnail shows');
  } catch (e) { ck(false, '5 · step threw', String(e).split('\n')[0]); }

  // (6) one remove control; it removes via the writer
  try {
    const card = page.locator(`${L} [data-label-card="tax stamp"]`);
    const removes = await card.locator('[data-label-card-remove]').count();
    const named = await card.locator('button[aria-label^="remove label"]').count();
    ck(removes === 1 && named === 1, '6 · exactly one remove control on the card', `${removes}/${named}`);
    await card.locator('[data-label-card-remove]').click();
    await page.waitForTimeout(150);
    const keys = (await labels()).map((l) => l.key);
    ck(JSON.stringify(keys) === '["hangtag"]' && await page.locator(`${L} [data-label-card="tax stamp"]`).count() === 0,
      '6 · ✕ removed the row and the card', JSON.stringify(keys));
  } catch (e) { ck(false, '6 · step threw', String(e).split('\n')[0]); }

  // (7) packaging block
  try {
    const P = '[data-keyed-cards="packagingItems"]';
    ck(await page.locator('#packaging-spec label', { hasText: /^units per box$/ }).count() === 1
      && await page.locator('#packaging-spec label', { hasText: /^weight gross \(g\)$/ }).count() === 1
      && await page.locator('#packaging-spec input').count() >= 7,
      '7 · carton row present (units per box, gross weight)');
    ck(await page.locator(`${P} [data-label-card]`).count() === 0
      && await page.locator(`${P} [data-kind-add="item"]`).count() === 1,
      '7 · packaging items empty = only + item');
  } catch (e) { ck(false, '7 · step threw', String(e).split('\n')[0]); }

  ck(errors.length === 0, 'no page errors', errors.join(' | '));
  await page.close();
  return results;
}

const browser = await chromium.launch();
let exit = 0;
try {
  if (ONLY) {
    if (!MUTANTS[ONLY]) { console.log(`unknown mutant ${ONLY}`); process.exit(2); }
    console.log(`MUTANT ${ONLY} (must go red on ${MUTANTS[ONLY].breaks})`);
    const r = await run(browser, await bundle(ONLY), true);
    exit = r.every((x) => x.ok) ? 1 : 0;
  } else {
    console.log('REAL CODE');
    const real = await run(browser, await bundle(''), true);
    const green = real.every((x) => x.ok);
    let caught = 0;
    for (const [name, m] of Object.entries(MUTANTS)) {
      const r = await run(browser, await bundle(name), false);
      const red = r.filter((x) => !x.ok && x.what.startsWith(`${m.breaks} `));
      console.log(`${red.length ? '✓ red on mutant ' : '✗ MUTANT SURVIVED '} ${name} → (${m.breaks})`);
      if (red.length) caught += 1;
    }
    const all = green && caught === Object.keys(MUTANTS).length;
    console.log(`\n${green ? 'ALL GREEN (real code)' : 'RED ON REAL CODE'} · ${caught}/${Object.keys(MUTANTS).length} mutants caught`);
    exit = all ? 0 : 1;
  }
} finally {
  await browser.close();
}
process.exit(exit);
