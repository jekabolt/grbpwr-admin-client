#!/usr/bin/env node
// TECH PACK LABEL SHEETS (labels rework I-17): the REAL TechPackDocument in a real browser, fed a
// fixture card through stubbed RPCs.
//
//   A · card WITH labels: the composition-label sheet prints the default colourway's lines (SKU,
//       colour, MADE IN from the colourway, the card's fibre override marked «set on the card»);
//       the LABELS table has one row per label with the mockup image or a «no mockup» cell and
//       every field; the PACKAGING ITEMS table likewise; the legacy `type · content` table is gone.
//   B · card WITHOUT labels: the composition sheet still prints, no labels / items tables, no crash.
//   C · card without a colourway: the composition sheet says so instead of printing blanks.
//
// Negative controls: in-memory mutants that must each turn a named check red. The repo is never
// touched.
//
//   node scripts/tech-pack-labels-probe.mjs                  real + all mutants
//   node scripts/tech-pack-labels-probe.mjs --mutate=NAME    one mutant, output as is (red)
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

const MUTANTS = {
  // every mockup cell prints «no mockup», attached or not
  noMockupAlways: {
    file: `${C}/tech-pack-labels.tsx`,
    from: '{shown.length === 0 ? (',
    to: '{true ? (',
    breaks: 'A2',
  },
  // the document hands the sheet no labels
  labelsDropped: {
    file: `${C}/tech-pack-document.tsx`,
    from: 'labels={tc.garmentLabels ?? []}',
    to: 'labels={[]}',
    breaks: 'A2',
  },
  // the fibre override is not reported as set on the card
  overrideHidden: {
    file: `${C}/composition-label/label-summary.ts`,
    from: '!!cw.fiberOverride?.length,',
    to: 'false,',
    breaks: 'A1',
  },
};

async function bundle(mutant) {
  const m = mutant ? MUTANTS[mutant] : null;
  let hit = false;
  const outfile = resolve(tmpdir(), `tech-pack-labels-${process.pid}-${mutant || 'real'}.js`);
  await esbuild({
    entryPoints: [resolve(HERE, 'tech-pack-labels-probe-entry.tsx')],
    bundle: true, platform: 'browser', format: 'iife', target: 'es2020', outfile,
    logLevel: 'silent', absWorkingDir: REPO, jsx: 'automatic',
    loader: { '.svg': 'text', '.png': 'dataurl', '.woff2': 'dataurl', '.css': 'empty' },
    plugins: [{
      // Vite `?url` / `?raw` imports (label fonts): the sheets never shape text, a stub is enough.
      name: 'vite-queries',
      setup(b) {
        b.onResolve({ filter: /\?(raw|url)$/ }, (args) => ({ path: args.path, namespace: 'vite-q' }));
        b.onLoad({ filter: /.*/, namespace: 'vite-q' }, () => ({ contents: 'export default "";', loader: 'js' }));
      },
    }, ...(m ? [{
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
    }] : [])],
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

const PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAYAAABytg0kAAAAFElEQVR4nGP8z8DAwMDAwMDEAAMADgIBAWiJ8fMAAAAASUVORK5CYII=',
  'base64',
);

// ─── fixture ──────────────────────────────────────────────────────────────────────────────────
const LANGS = ['en', 'fr', 'de', 'it', 'es', 'pt', 'nl', 'pl', 'cn', 'jp'];
const DICT = {
  languages: [{ id: 1, code: 'en', name: 'English', isDefault: true, isActive: true }],
  sizes: [{ id: 11, name: 's', skuOrd: 3 }, { id: 12, name: 'm', skuOrd: 4 }],
  countries: [{ code: 'PL', name: 'Poland' }],
  fibers: [['COT', 'Cotton']].map(([code, name]) => ({
    code, name, archived: false, animalNonTextile: false,
    translations: LANGS.map((l) => ({ labelLang: l, name: l === 'en' ? name : `${name}-${l}` })),
  })),
  careSymbols: [],
};
const CW = {
  colorwayId: 101, baseSku: 'RC27-00001-OFW', devName: 'off white', nameI18n: { 1: 'Off White' },
  status: 'COLORWAY_LIFECYCLE_STATUS_ACTIVE',
};
const COLORWAY_FULL = {
  colorway: { colorway: { id: 101, display: { merchandising: { countryCode: 'PL' } } } },
};
const base = (insert, colorways = [CW], extra = {}) => ({
  id: 1, lockVersion: 1, colorways, ...extra,
  techCard: { name: 'probe coat', styleNumber: 'GR-0001', sizeIds: [11, 12], ...insert },
});
const CARD_A = base(
  {
    // legacy rows still on the wire until I-19: they must not print
    labels: [{ labelType: 'TECH_CARD_LABEL_TYPE_MAIN', content: 'LEGACY-ROW', placement: 'x' }],
    careLabel: {
      colorways: [{ colorwayId: 101, fibers: [{ part: 'TECH_CARD_BOM_LABEL_PART_SHELL', fiberCode: 'COT', pct: 100 }] }],
    },
    garmentLabels: [
      { key: 'hangtag', placement: 'left side seam', attachment: 'loop pin', folding: 'flat',
        size: '50 × 90 mm', qtyPerGarment: 1, note: 'recycled board', mediaIds: [501] },
      { key: 'tax stamp', placement: 'inside pocket', mediaIds: [] },
    ],
    packagingItems: [
      { key: 'polybag', usage: 'whole garment', packing: 'folded in 3', size: '30 × 40 cm',
        qtyPerGarment: 1, note: 'PE 40 mic', mediaIds: [] },
    ],
  },
  [CW],
  { resolvedLabelMedia: [{ media: { id: 501, media: {
    compressed: { mediaUrl: 'https://cdn.example/501.png', width: 2, height: 2 },
    fullSize: { mediaUrl: 'https://cdn.example/501-full.png', width: 2, height: 2 },
    thumbnail: { mediaUrl: 'https://cdn.example/501-thumb.png', width: 2, height: 2 },
  } } }] },
);
const CARD_B = base({});
const CARD_C = base({ garmentLabels: [] }, []);

const b64 = (o) => Buffer.from(JSON.stringify(o)).toString('base64').replace(/=+$/, '');
const TOKEN = `${b64({ alg: 'none' })}.${b64({ exp: 4102444800 })}.x`;

async function run(browser, code, log) {
  const results = [];
  const ck = (ok, what, d = '') => {
    results.push({ ok, what });
    if (log) console.log(`${ok ? '  ok  ' : '  FAIL'} ${what}${d ? `  — ${d}` : ''}`);
  };
  const page = await browser.newPage({ viewport: { width: 1280, height: 1000 } });
  page.setDefaultTimeout(6000);
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  await page.route('http://probe.local/**', (r) =>
    r.fulfill({ status: 200, contentType: 'text/html', body: '<div id="root"></div>' }));
  await page.route('https://cdn.example/**', (r) =>
    r.fulfill({ status: 200, contentType: 'image/png', body: PNG }));
  await page.route('http://stub.invalid/**', (r) => {
    const url = r.request().url();
    const json = (o) => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(o) });
    if (/api\/admin\/dictionary(\?|$)/.test(url)) return json({ dictionary: DICT });
    if (/api\/admin\/colorways\/101(\?|$)/.test(url)) return json(COLORWAY_FULL);
    if (/api\/admin\/materials(\?|$)/.test(url)) return json({ materials: [] });
    return json({});
  });
  await page.goto('http://probe.local/');
  await page.evaluate((t) => localStorage.setItem('authToken', t), TOKEN);
  await page.addScriptTag({ content: code });

  const mount = async (card) => {
    await page.evaluate((c) => window.__tp.mount(c), card);
    await page.waitForSelector('text=composition label', { timeout: 15000 });
  };
  const lineText = (line) =>
    page.locator(`[data-tp-line="${line}"]`).innerText().then((t) => t.replace(/\s+/g, ' ').trim());

  // ── A ──
  try {
    await mount(CARD_A);
    await page.waitForFunction(
      () => /MADE IN POLAND/.test(document.querySelector('[data-tp-line="made-in"]')?.textContent ?? ''),
      null, { timeout: 8000 },
    ).catch(() => {});
    const product = await lineText('product');
    const madeIn = await lineText('made-in');
    const comp = await lineText('composition');
    ck(/RC27-00001-OFW/.test(product) && /OFF WHITE/.test(product) && /\[S · M\]/.test(product),
      'A1 · product line: base SKU / colour / size run', product);
    ck(/MADE IN POLAND/.test(madeIn), 'A1 · made in comes from the colourway', madeIn);
    ck(/SHELL/i.test(comp) && /100% COTTON/i.test(comp) && /set on the card/.test(comp),
      'A1 · composition = the card override, marked set on the card', comp);
  } catch (e) { ck(false, 'A1 · step threw', String(e).split('\n')[0]); }
  try {
    const rows = page.locator('[data-tp-labels] tbody tr');
    ck(await rows.count() === 2, 'A2 · one labels row per garment label', String(await rows.count()));
    const hang = page.locator('[data-tp-label="hangtag"]');
    const img = hang.locator('img[data-mockup="501"]');
    const src = (await img.count()) ? await img.getAttribute('src') : '';
    const decoded = (await img.count()) ? await img.evaluate((i) => i.complete && i.naturalWidth > 0) : false;
    ck(src === 'https://cdn.example/501.png' && decoded && (await hang.locator('[data-no-mockup]').count()) === 0,
      'A2 · hangtag prints its resolved mockup', `src ${src}, decoded ${decoded}`);
    const ht = (await hang.innerText()).replace(/\s+/g, ' ');
    ck(['hangtag', 'left side seam', 'loop pin', 'flat', '50 × 90 mm', '1', 'recycled board'].every((s) => ht.includes(s)),
      'A2 · hangtag row carries name, placement, attachment, folding, size, qty, note', ht);
    const tax = page.locator('[data-tp-label="tax stamp"]');
    ck((await tax.locator('[data-no-mockup]').count()) === 1 && /no mockup/i.test(await tax.innerText()),
      'A2 · a label without a mockup prints «no mockup»');
  } catch (e) { ck(false, 'A2 · step threw', String(e).split('\n')[0]); }
  try {
    const item = page.locator('[data-tp-items] tbody tr');
    const it = (await item.count()) ? (await item.first().innerText()).replace(/\s+/g, ' ') : '';
    ck(await item.count() === 1 && ['polybag', 'whole garment', 'folded in 3', '30 × 40 cm', 'PE 40 mic'].every((s) => it.includes(s))
      && (await item.first().locator('[data-no-mockup]').count()) === 1,
      'A3 · packaging item row: fields + «no mockup»', it);
    const legacy = await page.locator('th', { hasText: /^content$/i }).count();
    const row = await page.locator('text=LEGACY-ROW').count();
    ck(legacy === 0 && row === 0, 'A4 · legacy labels on the wire do not print', `content headers ${legacy}, rows ${row}`);
    if (process.env.TP_SHOT) await page.locator('[data-tp-composition]').locator('xpath=ancestor::section/..').screenshot({ path: process.env.TP_SHOT });
  } catch (e) { ck(false, 'A3 · step threw', String(e).split('\n')[0]); }

  // ── B ──
  try {
    await mount(CARD_B);
    await page.waitForSelector('[data-tp-composition]');
    const labels = await page.locator('[data-tp-labels]').count();
    const items = await page.locator('[data-tp-items]').count();
    ck(labels === 0 && items === 0, 'B1 · card without labels: composition sheet only, no tables', `labels ${labels}, items ${items}`);
    const comp = await lineText('composition');
    ck(/BOM/.test(comp) && !/set on the card/.test(comp), 'B1 · no override: composition derived from the BOM', comp);
  } catch (e) { ck(false, 'B1 · step threw', String(e).split('\n')[0]); }

  // ── C ──
  try {
    await mount(CARD_C);
    const t = await page.locator('text=no colourway yet').count();
    ck(t === 1 && (await page.locator('[data-tp-composition]').count()) === 0,
      'C1 · no colourway: the sheet says so');
  } catch (e) { ck(false, 'C1 · step threw', String(e).split('\n')[0]); }

  ck(errors.length === 0, 'Z · no page errors', errors.join(' | ').slice(0, 300));
  await page.close();
  return results;
}

const browser = await chromium.launch();
let failed = false;
try {
  if (ONLY) {
    const res = await run(browser, await bundle(ONLY), true);
    process.exit(res.every((r) => r.ok) ? 0 : 1);
  }
  console.log('real code:');
  const real = await run(browser, await bundle(''), true);
  if (!real.every((r) => r.ok)) failed = true;
  console.log('\nnegative controls (each must turn its check red):');
  for (const [name, m] of Object.entries(MUTANTS)) {
    const res = await run(browser, await bundle(name), false);
    const red = res.filter((r) => !r.ok).map((r) => r.what);
    const hit = red.some((w) => w.startsWith(m.breaks));
    console.log(`${hit ? '  ok  ' : '  FAIL'} ${name} → ${m.breaks} red${hit ? '' : ` (red: ${red.join('; ') || 'none'})`}`);
    if (!hit) failed = true;
  }
} finally {
  await browser.close();
}
console.log(failed ? '\nRED' : '\nGREEN');
process.exit(failed ? 1 : 0);
