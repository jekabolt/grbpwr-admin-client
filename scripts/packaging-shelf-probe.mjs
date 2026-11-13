#!/usr/bin/env node
// PACKAGING SHELF + PDF SHEET 05b: the real components in a real browser with production CSS and the
// real webfont. THE NETWORK IS STUBBED: this is a harness, not beta. No server validates anything here.
//
//   A picker: every kind a chip in shelf order, catalog list, search, added dim, use item
//   B tiles: kind order, per-order defaults, details, qty, garment/order, how, note, colourways
//   C shelf filter, new item takes the filter's colourway, remove
//   D packed: ships on hanger / folded, fold select, packed size
//   E the form value and the card write payload (mapFormToTechCardInsert, the one the save sends)
//   F packaging recipe block is gone, 375 px has no horizontal scroll
//   G PDF 05b: order, colour column only when something differs, red missing mark, both orientations
//     fit, stress card flows, printed page count
//
// Needs `yarn build` (reads the Tailwind CSS and the fonts from dist/).
//   node scripts/packaging-shelf-probe.mjs [--out=DIR]
// Exit: 0 all checks pass, 1 a check failed, 2 the harness could not be set up.
import { createRequire } from 'node:module';
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { homedir, tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { basename, dirname, join, resolve } from 'node:path';
import { build as esbuild } from './probe-esbuild.mjs';

const setupError = (what) => {
  console.log(`DID NOT RUN: ${what}`);
  process.exit(2);
};

const OUT =
  (process.argv.find((a) => a.startsWith('--out=')) ?? '').split('=')[1] ||
  mkdtempSync(join(tmpdir(), 'packaging-shelf-'));
mkdirSync(OUT, { recursive: true });

function resolvePlaywright() {
  const require = createRequire(import.meta.url);
  try {
    return require.resolve('playwright');
  } catch {}
  const root = `${homedir()}/.npm/_npx`;
  if (!existsSync(root)) return null;
  const found = execFileSync(
    'find',
    [root, '-maxdepth', '4', '-type', 'd', '-name', 'playwright', '-path', '*node_modules*'],
    { encoding: 'utf8' },
  )
    .split('\n')
    .filter(Boolean)[0];
  return found ? `${found}/index.js` : null;
}
const pw = resolvePlaywright();
if (!pw) setupError('playwright not found');
const mod = await import(pw);
const chromium = mod.chromium ?? mod.default?.chromium;
if (!chromium) setupError('playwright without chromium');

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = resolve(HERE, '..');
const assets = resolve(REPO, 'dist/assets');
const css = existsSync(assets)
  ? readdirSync(assets)
      .filter((f) => f.endsWith('.css'))
      .sort((a, b) => statSync(join(assets, b)).size - statSync(join(assets, a)).size)[0]
  : null;
if (!css) setupError('no dist/assets css, run yarn build first');

async function bundle() {
  const outfile = join(OUT, 'entry.js');
  await esbuild({
    entryPoints: [resolve(HERE, 'packaging-shelf-probe-entry.tsx')],
    bundle: true,
    platform: 'browser',
    format: 'iife',
    target: 'es2020',
    outfile,
    logLevel: 'silent',
    absWorkingDir: REPO,
    jsx: 'automatic',
    loader: { '.svg': 'text', '.png': 'dataurl', '.woff2': 'dataurl', '.css': 'empty' },
    plugins: [
      {
        name: 'vite-queries',
        setup(b) {
          b.onResolve({ filter: /\?(raw|url)$/ }, (args) => ({
            path: args.path,
            namespace: 'vite-q',
          }));
          b.onLoad({ filter: /.*/, namespace: 'vite-q' }, () => ({
            contents: 'export default "";',
            loader: 'js',
          }));
        },
      },
    ],
    define: {
      'import.meta.env.VITE_SERVER_URL': '"http://stub.invalid"',
      'import.meta.env.VITE_PATTERN_VIEWER_ORIGIN': '"https://admin.beta.grbpwr.com"',
      'import.meta.env':
        '{"VITE_SERVER_URL":"http://stub.invalid","VITE_PATTERN_VIEWER_ORIGIN":"https://admin.beta.grbpwr.com","MODE":"production"}',
      'process.env.NODE_ENV': '"production"',
    },
    alias: {
      components: resolve(REPO, 'src/components'),
      lib: resolve(REPO, 'src/lib'),
      api: resolve(REPO, 'src/api'),
      utils: resolve(REPO, 'src/utils'),
      ui: resolve(REPO, 'src/ui'),
      constants: resolve(REPO, 'src/constants'),
      store: resolve(REPO, 'src/store'),
      hooks: resolve(REPO, 'src/hooks'),
      context: resolve(REPO, 'src/context'),
      types: resolve(REPO, 'src/types'),
    },
  });
  return readFileSync(outfile, 'utf8');
}

// ── fixtures ──
const svg = (body) =>
  'data:image/svg+xml,' +
  encodeURIComponent(
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" width="400" height="400"><rect width="100" height="100" fill="#fff"/>${body}</svg>`,
  );
const pic = (body) => {
  const url = svg(body);
  return {
    fullSize: { mediaUrl: url, width: 400, height: 400 },
    compressed: { mediaUrl: url, width: 400, height: 400 },
    thumbnail: { mediaUrl: url, width: 400, height: 400 },
  };
};
const mediaFull = (id, body) => ({ id, media: pic(body) });
const HANGER = '<path d="M50 25v12L12 70h76L50 37" fill="none" stroke="#000" stroke-width="3"/>';
const BAG = '<rect x="22" y="20" width="56" height="64" fill="none" stroke="#000" stroke-width="3"/>';
const BOX = '<path d="M15 35h70v45H15zM15 35l12-15h46l12 15" fill="none" stroke="#000" stroke-width="3"/>';
const POLY = '<circle cx="50" cy="50" r="30" fill="none" stroke="#000" stroke-width="3"/>';
const PACK = '<path d="M10 30h80v40H10z" fill="#ddd" stroke="#000" stroke-width="2"/>';

const pkg = (id, name, image) => ({
  id,
  name,
  code: `PKG-${id}`,
  materialClass: 'MATERIAL_CLASS_PACKAGING',
  unit: 'pcs',
  ...(image ? { image } : {}),
});
const MATERIALS = [
  pkg(301, 'wooden hanger', mediaFull(601, HANGER)),
  pkg(302, 'dust bag - cotton', mediaFull(602, BAG)),
  pkg(303, 'shipping box - standard', mediaFull(603, BOX)),
  pkg(304, 'kraft sheet 40'),
  pkg(305, 'care insert card'),
  { ...pkg(306, 'silk lining'), materialClass: 'MATERIAL_CLASS_FABRIC' },
];
const AUX = [
  { id: 41, name: 'garment bag', outputMaterialId: 0 },
  { id: 42, name: 'octagon tote s', outputMaterialId: 77, outputMaterialName: 'octagon s' },
  { id: 43, name: 'Brand Label (PLM seed)', auxSubtype: 'TECH_CARD_AUX_SUBTYPE_BRAND_LABEL' },
  { id: 44, name: 'Care Label (PLM seed)', auxSubtype: 'TECH_CARD_AUX_SUBTYPE_CARE_LABEL' },
  { id: 45, name: 'Size Label (PLM seed)', auxSubtype: 'TECH_CARD_AUX_SUBTYPE_SIZE_LABEL' },
  { id: 46, name: 'Hangtag (PLM seed)', auxSubtype: 'TECH_CARD_AUX_SUBTYPE_HANGTAG' },
];
const DICT = {
  languages: [{ id: 1, code: 'en', name: 'English', isDefault: true, isActive: true }],
  sizes: [{ id: 11, name: 'm', skuOrd: 4 }],
};
const COLOURS = [
  { colorwayId: 21, devName: 'black', devHex: '#000000', baseSku: 'B1' },
  { colorwayId: 22, devName: 'bone', devHex: '#e8e4d8', baseSku: 'B2' },
];
const HANGER_ROW = {
  key: 'hanger',
  usage: 'stored usage words',
  packing: '',
  size: '42 cm',
  qtyPerGarment: 1,
  materialId: 301,
  auxTechCardId: 0,
  perOrder: false,
  pickedName: 'wooden hanger',
  pickedThumbnail: mediaFull(601, HANGER),
  colorwayIds: [],
  bomItemId: 17,
  bomLineKey: 'BL-1',
  note: '',
  mediaIds: [51],
};
const LEGACY_ROW = {
  key: 'polybag',
  usage: 'one per garment',
  packing: 'flat',
  size: '30 × 40 cm',
  qtyPerGarment: 1,
  bomItemId: 9,
  bomLineKey: 'BL-2',
  note: '',
  mediaIds: [52],
};
const baseCard = (over = {}, colorways = COLOURS) => ({
  id: 7,
  lockVersion: 3,
  colorways,
  resolvedLabelMedia: [
    { media: mediaFull(51, HANGER) },
    { media: mediaFull(52, POLY) },
    { media: mediaFull(53, PACK) },
  ],
  techCard: {
    name: 'probe coat',
    styleNumber: 'GR-1',
    sizeIds: [11],
    packaging: {
      foldingMethod: 'on a hanger',
      packedSize: '62 × 40 × 6 cm',
      packedMediaId: 53,
      weightNetGrams: 310,
      weightGrossGrams: 480,
      unitsPerBox: 20,
      boxDimensions: '60×40×30',
      boxMarking: 'style + qty',
    },
    packagingItems: [HANGER_ROW, LEGACY_ROW],
    ...over,
  },
});
const RECIPE = {
  lines: [
    {
      id: 1,
      scope: 'PACKAGING_RECIPE_SCOPE_STYLE',
      techCardId: 7,
      styleId: 7,
      materialId: 303,
      materialName: 'shipping box - standard',
      materialUnit: 'pcs',
      qtyPerOrder: { value: '1' },
      active: true,
    },
  ],
};

const b64 = (o) => Buffer.from(JSON.stringify(o)).toString('base64').replace(/=+$/, '');
const TOKEN = `${b64({ alg: 'none' })}.${b64({ exp: 4102444800 })}.x`;

const results = [];
const ck = (ok, what, d = '') => {
  results.push(!!ok);
  console.log(`${ok ? '  ok  ' : '  FAIL'} ${what}${d ? `  — ${d}` : ''}`);
};
const step = async (page, name, fn) => {
  try {
    await fn();
  } catch (e) {
    ck(false, `${name} threw`, String(e).split('\n').slice(0, 3).join(' '));
    await page.screenshot({ path: join(OUT, `threw-${name}.png`), fullPage: true }).catch(() => {});
  }
};

let code;
try {
  code = await bundle();
} catch (e) {
  setupError(`bundle failed: ${String(e).split('\n').slice(0, 6).join(' ')}`);
}
const browser = await chromium.launch().catch((e) => setupError(`chromium: ${e}`));

async function base(viewport) {
  const page = await browser.newPage({ viewport });
  page.setDefaultTimeout(5000);
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  await page.route('http://probe.local/**', (r) => {
    const { pathname } = new URL(r.request().url());
    const asset = join(assets, basename(pathname));
    if (pathname.startsWith('/assets/') && existsSync(asset))
      return r.fulfill({ status: 200, path: asset });
    return r.fulfill({
      status: 200,
      contentType: 'text/html',
      body: '<!doctype html><html><body><div id="root"></div></body></html>',
    });
  });
  await page.route('http://stub.invalid/**', async (r) => {
    const url = r.request().url();
    const json = (o) =>
      r.fulfill({
        status: 200,
        contentType: 'application/json',
        headers: { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*' },
        body: JSON.stringify(o),
      });
    if (r.request().method() === 'OPTIONS') return json({});
    if (/api\/admin\/dictionary(\?|$)/.test(url)) return json({ dictionary: DICT });
    if (/api\/admin\/materials(\?|$)/.test(url)) return json({ materials: MATERIALS });
    if (/api\/admin\/tech-card\/list/.test(url)) return json({ techCards: AUX, total: AUX.length });
    if (/api\/admin\/tech-card\/7(\?|$)/.test(url)) return json({ techCard: page.__card });
    if (/api\/admin\/inventory\/packaging-recipe/.test(url)) return json(RECIPE);
    if (/api\/admin\/production-runs/.test(url)) return json({ runs: [] });
    if (/accounts\/sections/.test(url)) return json({ sections: [{ key: 'tech_cards' }] });
    return json({});
  });
  await page.goto('http://probe.local/');
  await page.evaluate((t) => localStorage.setItem('authToken', t), TOKEN);
  await page.addStyleTag({ path: join(assets, css) });
  await page.addScriptTag({ content: code });
  return { page, errors };
}

async function openShelf(card, { viewport = { width: 1180, height: 1000 }, canEdit = true } = {}) {
  const { page, errors } = await base(viewport);
  page.__card = card;
  await page.evaluate(([c, o]) => window.__ps.mount(c, o), [card, { canEdit }]);
  await page.waitForSelector('#packaging-spec', { timeout: 15000 });
  await page.waitForTimeout(500);
  return { page, errors };
}

const fontReady = (page) =>
  page.evaluate(async () => {
    await document.fonts.ready;
    await Promise.all([
      document.fonts.load('400 12px FeatureMono'),
      document.fonts.load('700 12px FeatureMono'),
    ]);
    return [...document.fonts].filter((f) => f.family.includes('FeatureMono') && f.status === 'loaded')
      .length;
  });

const S = '#packaging-spec';
const DIALOG = '[role="dialog"]';
const items = async (page) => (await page.evaluate(() => window.__ps.form())).packagingItems;
const chip = (page, scope, word) =>
  page.locator(`${scope} [aria-pressed]`, { hasText: new RegExp(`^\\s*${word}\\s*$`, 'i') });
const tile = (page, title) => page.locator(`${S} button[title="${title}"]`);
const addDoor = (page) => page.locator(`${S} button`, { hasText: /^\+ item$/i });
const openPicker = async (page) => {
  await addDoor(page).click();
  await page.waitForSelector(DIALOG);
  await page.waitForTimeout(250);
};
const pickerTile = (page, name) => page.locator(`${DIALOG} [title="${name}"]`);
const useItem = (page) => page.locator(`${DIALOG} button`, { hasText: /^use item$/i });
const pickAndUse = async (page, name, kindChip) => {
  await openPicker(page);
  if (kindChip) await chip(page, DIALOG, kindChip).click();
  await pickerTile(page, name).click();
  await useItem(page).click();
  await page.waitForSelector(DIALOG, { state: 'detached' });
  await page.waitForTimeout(150);
};
const noHScroll = (page) =>
  page.evaluate(() => {
    const d = document.documentElement;
    return { sw: d.scrollWidth, cw: d.clientWidth };
  });
const detail = (page, label) =>
  page.locator(`${S} div.min-w-0:has(> span:text-is("${label}"))`).last();

// ── A–F, main card ──
let exitSetup = false;
const main = await openShelf(baseCard()).catch((e) => {
  exitSetup = `shelf did not mount: ${String(e).split('\n')[0]}`;
  return null;
});
if (exitSetup) {
  await browser.close();
  setupError(exitSetup);
}
{
  const { page, errors } = main;
  const crash = await page.locator('[data-crash]').count();
  const faces = await fontReady(page);
  if (crash || faces < 2) {
    await browser.close();
    setupError(crash ? 'shelf crashed on mount' : `webfont not loaded (${faces} faces)`);
  }
  ck(true, 'setup: production css and FeatureMono regular + bold loaded', `${faces} faces`);
  const family = await page.locator(`${S} button`).first().evaluate((e) => getComputedStyle(e).fontFamily);
  ck(/FeatureMono/.test(family), 'setup: the shelf renders in the webfont', family.slice(0, 40));

  await step(page, 'P', async () => {
    const heights = async () =>
      page.evaluate((S) => {
        const box = (el) => Math.round(el.getBoundingClientRect().height);
        const root = document.querySelector(S);
        const chips = [...root.querySelectorAll('[aria-pressed]')].filter((e) => /on hanger|folded/i.test(e.textContent));
        const combo = root.querySelector('[role="combobox"]');
        return {
          chips: chips.map(box),
          inputs: [...root.querySelectorAll('label')]
            .filter((l) => /packed size|net weight|gross weight/i.test(l.textContent))
            .map((l) => box(document.getElementById(l.htmlFor))),
          combo: combo ? box(combo) : 0,
          comboScroll: combo ? combo.scrollHeight - combo.clientHeight : 0,
        };
      }, S);
    const h = await heights();
    const all = new Set([...h.chips, ...h.inputs]);
    ck(all.size === 1, 'P ships chips and inputs: one control height', JSON.stringify(h));
    const thumb = await page.locator(`${S} img[alt="packed photo"]`).boundingBox();
    ck(thumb && thumb.height <= [...all][0], 'P stored packed photo: the control footprint', JSON.stringify(thumb));
    const net = await page.locator(S).getByLabel('net weight (g)', { exact: true }).boundingBox();
    const size = await page.locator(S).getByLabel('packed size', { exact: true }).boundingBox();
    const gross = await page.locator(S).getByLabel('gross weight (g)', { exact: true }).boundingBox();
    ck(gross.y - size.y < 70 && net.y === size.y, 'P no empty gap in the packed grid', `${gross.y - size.y}px`);
    await chip(page, S, 'folded').click();
    await page.waitForTimeout(100);
    const f = await heights();
    ck(f.combo === f.inputs[0], 'P fold select: the same height as the inputs', JSON.stringify(f));
    await page.mouse.move(0, 0);
    await chip(page, S, 'on hanger').click();
    await page.waitForTimeout(100);
  });

  await step(page, 'A0', async () => {
    const t = tile(page, 'polybag');
    ck(
      (await t.locator('img').count()) === 1,
      'A0 a stored item without a pick shows its own mockup on the tile',
    );
    const before = await items(page);
    ck(before.length === 2, 'A0 two stored items read into the form', before.map((i) => i.key).join(','));
    ck(
      (await chip(page, S, 'black').count()) === 1 && (await chip(page, S, 'bone').count()) === 1,
      'A0 shelf filter has the two colourways',
    );
  });

  await step(page, 'A1', async () => {
    await page.screenshot({ path: join(OUT, 'shelf-desktop-initial.png'), fullPage: true });
    await openPicker(page);
    const words = await page
      .locator(`${DIALOG} [aria-pressed]`)
      .evaluateAll((els) => els.map((e) => e.textContent.trim().toLowerCase()));
    ck(
      JSON.stringify(words) ===
        JSON.stringify([
          'all',
          'hanger',
          'shirt board',
          'collar support',
          'tissue paper',
          'silica gel',
          'insert card',
          'spare kit bag',
          'hangtag string',
          'dust bag',
          'garment case',
          'polybag',
          'sticker',
          'box',
          'mailer',
          'tote bag',
        ]),
      'A1 every kind is a chip, in the mockup order',
      words.join(','),
    );
    for (const name of ['dust bag - cotton', 'shipping box - standard', 'garment bag', 'octagon tote s'])
      ck((await pickerTile(page, name).count()) === 1, `A1 listed: ${name}`);
    ck((await pickerTile(page, 'silk lining').count()) === 0, 'A1 a non-packaging material is not listed');
    for (const name of ['Brand Label (PLM seed)', 'Care Label (PLM seed)', 'Size Label (PLM seed)', 'Hangtag (PLM seed)'])
      ck((await pickerTile(page, name).count()) === 0, `A1 not packaging, not listed: ${name}`);
    const warn = await pickerTile(page, 'garment bag').innerText();
    ck(/no output material/i.test(warn), 'A1 aux card without output has the red pill');
    ck(!/no output material/i.test(await pickerTile(page, 'octagon tote s').innerText()), 'A1 aux with output has none');
    const added = pickerTile(page, 'wooden hanger');
    ck(
      /added/i.test(await added.innerText()) &&
        (await added.evaluate((e) => e.tagName)) !== 'BUTTON' &&
        Number(await added.evaluate((e) => getComputedStyle(e).opacity)) < 1,
      'A1 a thing covering all colourways is dimmed, added, not pickable',
    );
    ck(await useItem(page).isDisabled(), 'A1 use item waits for a choice');
    await page.locator(`${DIALOG} input[aria-label="search"]`).fill('octagon');
    await page.waitForTimeout(100);
    ck(
      (await pickerTile(page, 'octagon tote s').count()) === 1 &&
        (await pickerTile(page, 'garment bag').count()) === 0,
      'A1 search narrows the list',
    );
    await page.locator(`${DIALOG} input[aria-label="search"]`).fill('zzz');
    await page.waitForTimeout(100);
    const body = await page.locator(DIALOG).innerText();
    ck(/nothing in the catalog/i.test(body) && /\+ new/i.test(body), 'A1 nothing found: words and + new');
    await page.locator(`${DIALOG} input[aria-label="search"]`).fill('');
    await chip(page, DIALOG, 'collar support').click();
    await page.waitForTimeout(100);
    ck(
      (await page.locator(DIALOG).getByRole('button', { name: '+ new', exact: true }).count()) === 1,
      'A1 a kind with no thing of its own offers + new',
    );
    await chip(page, DIALOG, 'hanger').click();
    await page.waitForTimeout(100);
    ck(
      (await page.locator(DIALOG).getByRole('button', { name: '+ new', exact: true }).count()) === 0,
      'A1 a kind with its own thing lists it, no + new',
    );
    await chip(page, DIALOG, 'shirt board').click();
    await page.waitForTimeout(100);
    ck(
      (await pickerTile(page, 'kraft sheet 40').count()) === 1,
      'A1 a material with no guessed kind can be used under a chip',
    );
    await pickerTile(page, 'kraft sheet 40').click();
    await page.waitForTimeout(100);
    await page.screenshot({ path: join(OUT, 'picker.png') });
    await useItem(page).click();
    await page.waitForSelector(DIALOG, { state: 'detached' });
    await page.waitForTimeout(150);
    const rows = await items(page);
    ck(
      rows.map((r) => r.key).join() === 'hanger,shirt_board,polybag',
      'A2 picked under a chip: that kind, in kind order',
      rows.map((r) => r.key).join(),
    );
    const row = rows.find((r) => r.key === 'shirt_board');
    ck(
      row.materialId === 304 && row.auxTechCardId === 0 && row.perOrder === false,
      'A2 materialId written, not per order',
      JSON.stringify([row.materialId, row.auxTechCardId, row.perOrder]),
    );
  });

  await step(page, 'B1', async () => {
    await pickAndUse(page, 'dust bag - cotton');
    await pickAndUse(page, 'shipping box - standard');
    await pickAndUse(page, 'octagon tote s', 'tote bag');
    await pickAndUse(page, 'garment bag', 'garment case');
    const rows = await items(page);
    ck(
      rows.map((r) => r.key).join() ===
        'hanger,shirt_board,dust_bag,garment_case,polybag,box,tote_bag',
      'B1 tiles in kind order',
      rows.map((r) => r.key).join(),
    );
    const titles = await page
      .locator(`${S} button[title]`)
      .evaluateAll((els) => els.map((e) => e.getAttribute('title')));
    ck(
      titles.join() ===
        'wooden hanger,kraft sheet 40,dust bag - cotton,garment bag,polybag,shipping box - standard,octagon tote s',
      'B1 the DOM follows the form order',
      titles.join(),
    );
    const by = (k) => rows.find((r) => r.key === k);
    ck(by('box').perOrder === true && by('tote_bag').perOrder === true, 'B1 box and tote bag default to order');
    ck(by('dust_bag').perOrder === false, 'B1 dust bag defaults to garment');
    ck(by('tote_bag').auxTechCardId === 42 && by('tote_bag').materialId === 0, 'B1 aux pick: auxTechCardId');
    const spill = await page.locator(`${S} button[title="garment bag"]`).evaluate((tile) => {
      const box = tile.getBoundingClientRect();
      return Math.max(...[...tile.querySelectorAll('*')].map((el) => el.getBoundingClientRect().right - box.right));
    });
    ck(spill <= 0, 'B1 the red pill stays inside the tile', String(spill));
    ck(by('box').pickedName === 'shipping box - standard', 'B1 the form keeps the picked name');
    ck(!!by('box').pickedThumbnail?.media?.thumbnail?.mediaUrl, 'B1 the form keeps the picked thumbnail');
    ck((await tile(page, 'shipping box - standard').locator('img').count()) === 1, 'B1 the tile shows the picture');
    ck(/no output material/i.test(await tile(page, 'garment bag').innerText()), 'B1 tile: red pill for aux without output');
    const count = await page.locator(`${S}`).getByText(/^items$/i).locator('xpath=..').innerText();
    ck(/7/.test(count), 'B1 items group has the count', count.replace(/\s+/g, ' '));
    // nothing on any tile is cut off
    const cut = await page.locator(`${S} button[title] :is(p,span,div)`).evaluateAll((els) =>
      els
        .filter((e) => e.children.length === 0 && e.scrollWidth > e.clientWidth + 1 && /\/\s*(garment|order)/i.test(e.textContent))
        .map((e) => e.textContent),
    );
    ck(cut.length === 0, 'B1 the qty / per line is never truncated', cut.join(' | '));
    ck(
      /1\s*\/\s*order/i.test(await tile(page, 'shipping box - standard').innerText()) &&
        /1\s*\/\s*garment/i.test(await tile(page, 'wooden hanger').innerText()),
      'B1 tile: qty / garment or order',
    );
  });

  await step(page, 'B2', async () => {
    await tile(page, 'wooden hanger').click();
    await page.waitForTimeout(100);
    const border = await tile(page, 'wooden hanger').evaluate((e) => getComputedStyle(e).borderTopWidth);
    ck(border === '2px', 'B2 selected tile has the heavy outline', border);
    const q = detail(page, 'quantity').locator('input');
    await q.fill('3');
    await chip(page, `${S}`, 'order').click();
    await detail(page, 'size').locator('input').fill('44 cm');
    await detail(page, 'how').locator('input').fill('on the hanger, top button closed');
    await detail(page, 'note').locator('textarea').fill('one per box');
    await page.waitForTimeout(100);
    let row = (await items(page))[0];
    ck(
      row.qtyPerGarment === 3 && row.perOrder === true && row.size === '44 cm' && row.note === 'one per box' && row.packing.startsWith('on the hanger'),
      'B2 qty, order, size, how, note reach the row',
      JSON.stringify([row.qtyPerGarment, row.perOrder, row.size, row.packing, row.note]),
    );
    ck(
      row.usage === 'stored usage words' &&
        JSON.stringify(row.mediaIds) === '[51]' &&
        row.bomItemId === 17 &&
        row.bomLineKey === 'BL-1' &&
        row.materialId === 301,
      'B2 usage, mediaIds, bomItemId, bomLineKey, materialId preserved',
      JSON.stringify([row.usage, row.mediaIds, row.bomItemId, row.bomLineKey, row.materialId]),
    );
    ck(/3\s*\/\s*order/i.test(await tile(page, 'wooden hanger').innerText()), 'B2 tile follows');
    await chip(page, S, 'garment').click();
    await page.waitForTimeout(80);
    row = (await items(page))[0];
    ck(row.perOrder === false, 'B2 flip back to garment');
    const colours = detail(page, 'colourways');
    ck(
      (await colours.locator('[aria-pressed]').count()) === 3,
      'B2 details: all + one chip per colourway',
    );
    await colours.locator('[aria-pressed]', { hasText: /^black$/i }).click();
    await page.waitForTimeout(80);
    row = (await items(page))[0];
    ck(JSON.stringify(row.colorwayIds) === '[21]', 'B2 colourway set', JSON.stringify(row.colorwayIds));
    ck(/black/i.test(await tile(page, 'wooden hanger').innerText()), 'B2 tile names the colourway');
    await page.screenshot({ path: join(OUT, 'details-open.png'), fullPage: true });
    await colours.locator('[aria-pressed]', { hasText: /^bone$/i }).click();
    await page.waitForTimeout(80);
    ck(
      JSON.stringify((await items(page))[0].colorwayIds) === '[21,22]',
      'B2 several may be on',
      JSON.stringify((await items(page))[0].colorwayIds),
    );
    await colours.locator('[aria-pressed]', { hasText: /^all$/i }).click();
    await page.waitForTimeout(80);
    ck((await items(page))[0].colorwayIds.length === 0, 'B2 all clears the limit');
    await colours.locator('[aria-pressed]', { hasText: /^black$/i }).click();
    await page.waitForTimeout(80);
    await openPicker(page);
    ck(
      !/added/i.test(await pickerTile(page, 'wooden hanger').innerText()),
      'B2 limited to a colourway: no longer dimmed in the picker',
    );
    await page.keyboard.press('Escape');
    await page.waitForSelector(DIALOG, { state: 'detached' });
  });

  await step(page, 'C', async () => {
    await chip(page, `${S} > div`, 'bone').first().click();
    await page.waitForTimeout(100);
    ck((await tile(page, 'wooden hanger').count()) === 0, 'C filter bone hides the black-only tile');
    ck((await tile(page, 'dust bag - cotton').count()) === 1, 'C filter bone keeps an all-colourways tile');
    const stale = await page.locator(`${S} button[aria-label="remove item"]`).count();
    ck(stale === 0, 'C details of a filtered-out tile do not stay open');
    await pickAndUse(page, 'care insert card');
    let rows = await items(page);
    const card = rows.find((r) => r.materialId === 305);
    ck(card?.key === 'insert_card', 'C kind guessed from the name', card?.key);
    ck(JSON.stringify(card?.colorwayIds) === '[22]', 'C new item takes the filter colourway', JSON.stringify(card?.colorwayIds));
    await page.locator(`${S} [aria-pressed]`, { hasText: /^all$/i }).first().click();
    await page.waitForTimeout(100);
    ck((await tile(page, 'wooden hanger').count()) === 1, 'C filter all shows every tile');

    await tile(page, 'dust bag - cotton').click();
    await page.waitForTimeout(80);
    const n = rows.length;
    await page.locator(`${S} button[aria-label="remove item"]`).click();
    await page.waitForTimeout(100);
    rows = await items(page);
    ck(
      rows.length === n - 1 && !rows.some((r) => r.materialId === 302),
      'C ✕ removes exactly that row',
      rows.map((r) => r.key).join(),
    );
    ck((await tile(page, 'dust bag - cotton').count()) === 0, 'C its tile is gone');
    // the same thing twice with different colourways
    await chip(page, `${S} > div`, 'bone').first().click();
    await page.waitForTimeout(80);
    await pickAndUse(page, 'wooden hanger');
    rows = await items(page);
    const twins = rows.filter((r) => r.materialId === 301);
    ck(
      twins.length === 2 && JSON.stringify(twins.map((r) => r.colorwayIds)) === '[[21],[22]]',
      'C the same hanger twice with different colourways',
      JSON.stringify(twins.map((r) => r.colorwayIds)),
    );
    await page.locator(`${S} [aria-pressed]`, { hasText: /^all$/i }).first().click();
    await page.waitForTimeout(80);
    // the new twin is open: patching it leaves the first alone
    await detail(page, 'quantity').locator('input').fill('2');
    await page.waitForTimeout(80);
    const after = (await items(page)).filter((r) => r.materialId === 301);
    ck(after[0].qtyPerGarment === 3 && after[1].qtyPerGarment === 2, 'C a twin is patched by its row');
  });

  await step(page, 'D', async () => {
    ck(
      (await chip(page, S, 'on hanger').getAttribute('aria-pressed')) === 'true',
      'D stored on a hanger reads as on hanger',
    );
    ck((await page.locator(`${S} [role="combobox"]`).count()) === 0, 'D no fold select on a hanger');
    await chip(page, S, 'folded').click();
    await page.waitForTimeout(100);
    let f = await page.evaluate(() => window.__ps.form());
    ck(f.packaging.foldingMethod === 'folded in half', 'D folded writes a fold', f.packaging.foldingMethod);
    await page.locator(`${S} [role="combobox"]`).first().click();
    const options = await page.locator('[role="option"]').allInnerTexts();
    ck(
      !options.some((o) => /hanger/i.test(o)) && options.length === 4,
      'D fold select: four folds',
      options.join(','),
    );
    await page.locator('[role="option"]', { hasText: /^rolled$/i }).click();
    await page.waitForTimeout(100);
    f = await page.evaluate(() => window.__ps.form());
    ck(f.packaging.foldingMethod === 'rolled', 'D fold select writes', f.packaging.foldingMethod);
    await chip(page, S, 'on hanger').click();
    await page.waitForTimeout(100);
    f = await page.evaluate(() => window.__ps.form());
    ck(f.packaging.foldingMethod === 'on a hanger', 'D back to hanger');
    await page.locator(S).getByLabel('packed size', { exact: true }).fill('60 × 40 × 5 cm');
    await page.waitForTimeout(80);
    f = await page.evaluate(() => window.__ps.form());
    ck(f.packaging.packedSize === '60 × 40 × 5 cm', 'D packed size written');
    ck(f.packaging.packedMediaId === 53, 'D packed photo id kept');
    ck(
      (await page.locator(`${S} img[alt="packed photo"]`).count()) === 1,
      'D the stored packed photo resolves from the card media',
    );
  });

  await step(page, 'E', async () => {
    const { parsed, insert } = await page.evaluate(() => window.__ps.wire());
    ck(parsed, 'E the form passes the card schema');
    ck(insert.packagingPicksAware === true, 'E write payload: packagingPicksAware true');
    ck(insert.labelsAware === true, 'E write payload: labelsAware true');
    const out = insert.packagingItems;
    const hanger = out.find((r) => r.materialId === 301);
    const aux = out.find((r) => r.auxTechCardId === 42);
    const legacy = out.find((r) => r.key === 'polybag');
    ck(
      hanger.usage === 'stored usage words' && JSON.stringify(hanger.mediaIds) === '[51]' && hanger.bomItemId === 17 && hanger.bomLineKey === 'BL-1',
      'E wire: usage, mediaIds, bomItemId, bomLineKey',
      JSON.stringify(hanger),
    );
    ck(JSON.stringify(hanger.colorwayIds) === '[21]', 'E wire: colorwayIds');
    ck(aux.perOrder === true && aux.materialId === 0, 'E wire: perOrder, one pick only');
    ck(
      legacy.usage === 'one per garment' && JSON.stringify(legacy.mediaIds) === '[52]' && legacy.bomLineKey === 'BL-2' && legacy.materialId === 0 && legacy.auxTechCardId === 0,
      'E wire: a stored item without a pick stays whole',
      JSON.stringify(legacy),
    );
    ck(
      out.every((r) => !('pickedName' in r) && !('pickedThumbnail' in r)),
      'E wire: output-only pickedName / pickedThumbnail not sent',
    );
    ck(
      out.every((r) => !(r.materialId && r.auxTechCardId)),
      'E wire: at most one of material and aux card',
    );
    ck(
      insert.packaging.packedSize === '60 × 40 × 5 cm' && insert.packaging.packedMediaId === 53,
      'E wire: packed size and packed photo',
      JSON.stringify(insert.packaging),
    );
  });

  await step(page, 'F', async () => {
    const recipe = page.locator('[data-recipe-block]');
    ck((await recipe.count()) === 0, 'F recipe block is gone');
    await page.mouse.move(0, 0);
    await page.screenshot({ path: join(OUT, 'shelf-desktop.png'), fullPage: true });
    const d = await noHScroll(page);
    ck(d.sw <= d.cw, 'F desktop: no horizontal scroll', `${d.sw}/${d.cw}`);
  });
  ck(errors.length === 0, 'main card: no page errors', errors.join(' | '));
  await page.close();
}

// ── 375 px ──
{
  const { page, errors } = await openShelf(baseCard(), { viewport: { width: 375, height: 812 } });
  await fontReady(page);
  await step(page, 'M', async () => {
    let d = await noHScroll(page);
    ck(d.sw <= d.cw, 'M 375: shelf has no horizontal scroll', `${d.sw}/${d.cw}`);
    await tile(page, 'wooden hanger').click();
    await page.waitForTimeout(150);
    d = await noHScroll(page);
    ck(d.sw <= d.cw, 'M 375: details open, no horizontal scroll', `${d.sw}/${d.cw}`);
    await page.screenshot({ path: join(OUT, 'shelf-375.png'), fullPage: true });
    await openPicker(page);
    d = await noHScroll(page);
    ck(d.sw <= d.cw, 'M 375: picker, no horizontal scroll', `${d.sw}/${d.cw}`);
    const box = await page.locator(DIALOG).boundingBox();
    ck(box.x >= 0 && box.x + box.width <= 375, 'M 375: picker fits the width', JSON.stringify(box));
    await page.screenshot({ path: join(OUT, 'picker-375.png') });
  });
  ck(errors.length === 0, 'M no page errors', errors.join(' | '));
  await page.close();
}

// ── one colourway, nothing chosen for how it ships ──
{
  const card = baseCard(
    { packaging: {}, packagingItems: [{ key: 'polybag', qtyPerGarment: 1, usage: 'x', mediaIds: [] }] },
    [COLOURS[0]],
  );
  const { page, errors } = await openShelf(card);
  await step(page, 'O', async () => {
    ck((await page.locator(`${S} [aria-pressed]`, { hasText: /^black$/i }).count()) === 0, 'O one colourway: no filter row');
    const pressed = await page
      .locator(`${S} [aria-pressed="true"]`)
      .evaluateAll((els) => els.map((e) => e.textContent.trim().toLowerCase()));
    ck(
      !pressed.includes('folded') && !pressed.includes('on hanger'),
      'O nothing stored: ships shows no answer the form does not hold',
      pressed.join(','),
    );
    ck((await page.locator(`${S} [role="combobox"]`).count()) === 0, 'O nothing stored: no fold select yet');
    const photo = page.locator(`${S} button`, { hasText: /^\+ photo$/i });
    const b = await photo.boundingBox();
    const inp = await page.locator(S).getByLabel('packed size', { exact: true }).boundingBox();
    ck(b && b.height === inp.height && b.width < 120, 'O + photo: a small chip, the same height as inputs', JSON.stringify(b));
    ck((await photo.evaluate((e) => getComputedStyle(e).borderTopStyle)) === 'dashed', 'O + photo is dashed');
    await page.screenshot({ path: join(OUT, 'shelf-empty.png'), fullPage: true });
    await tile(page, 'polybag').click();
    await page.waitForTimeout(100);
    ck((await detail(page, 'colourways').count()) === 0, 'O one colourway: no colourway chips in details');
  });
  ck(errors.length === 0, 'O no page errors', errors.join(' | '));
  await page.close();
}

// ── read-only ──
{
  const { page, errors } = await openShelf(baseCard(), { canEdit: false });
  await step(page, 'R', async () => {
    ck((await addDoor(page).count()) === 0, 'R no + item without rights');
    await tile(page, 'wooden hanger').click();
    await page.waitForTimeout(100);
    ck(await detail(page, 'size').locator('input').isDisabled(), 'R details are disabled');
    ck((await page.locator(`${S} button[aria-label="remove item"]`).count()) === 0, 'R no remove control');
  });
  ck(errors.length === 0, 'R no page errors', errors.join(' | '));
  await page.close();
}

// ── G: the PDF sheet ──
const pdfItem = (key, name, extra = {}) => ({
  key,
  pickedName: name,
  qtyPerGarment: 1,
  materialId: 1,
  colorwayIds: [],
  ...extra,
});
const ORDER = [
  pdfItem('hanger', 'wooden hanger', { size: '42 cm', packing: 'on the hanger, top button closed', pickedThumbnail: mediaFull(601, HANGER) }),
  pdfItem('tissue', 'tissue paper', { qtyPerGarment: 2, size: '50 × 70 cm', note: 'one in each sleeve' }),
  pdfItem('insert_card', 'care insert card', { packing: 'on top, face up' }),
  pdfItem('garment_case', 'garment bag', { pickedThumbnail: mediaFull(602, BAG) }),
  pdfItem('box', 'shipping box - standard', { perOrder: true, packing: 'flat', pickedThumbnail: mediaFull(603, BOX) }),
  pdfItem('tote_bag', 'octagon s', { perOrder: true }),
];
const LIMITED = ORDER.map((row, i) => (i === 4 ? { ...row, colorwayIds: [21] } : row));
const LONG = 'a very long operator note about how the thing goes into the pack, with a second clause';
const STRESS = Array.from({ length: 18 }, (_, i) =>
  pdfItem(['hanger', 'shirt_board', 'collar_support', 'spare_kit_bag', 'hangtag_string', 'garment_case'][i % 6], `catalog item with a long name number ${i + 1}`, {
    size: '62 × 40 × 6 cm',
    packing: 'garment folded inside, sealed with a sticker',
    note: LONG,
    colorwayIds: i % 2 ? [21, 22] : [],
    pickedThumbnail: mediaFull(601, HANGER),
  }),
);
const sheetFacts = (page) =>
  page.evaluate(() => {
    const ctx = document.createElement('canvas').getContext('2d');
    const split = [];
    document.querySelectorAll('.tp-sheet tbody td').forEach((c) => {
      const s = getComputedStyle(c);
      ctx.font = `${s.fontWeight} ${s.fontSize} ${s.fontFamily}`;
      const room = c.clientWidth - parseFloat(s.paddingLeft) - parseFloat(s.paddingRight);
      for (const w of c.textContent.trim().split(/\s+/))
        if (ctx.measureText(w).width > room + 0.5) split.push(w);
    });
    const rows = [...document.querySelectorAll('.tp-sheet tbody tr')].map((tr) =>
      [...tr.children].map((td) => td.textContent.trim()),
    );
    const heads = [...document.querySelectorAll('.tp-sheet thead th')].map((th) => th.textContent.trim().toLowerCase());
    const bodies = [...document.querySelectorAll('.tp-body')];
    const spill = bodies.map((body) => {
      const box = body.getBoundingClientRect();
      let worst = 0;
      body.querySelectorAll('*').forEach((el) => {
        const r = el.getBoundingClientRect();
        worst = Math.max(worst, r.right - box.right, r.bottom - box.bottom);
      });
      return Math.round(worst);
    });
    const cellCut = [...document.querySelectorAll('.tp-sheet td, .tp-sheet th')]
      .filter((c) => c.scrollWidth > c.clientWidth + 1)
      .map((c) => c.textContent.trim().slice(0, 24));
    return {
      sheets: document.querySelectorAll('.tp-sheet').length,
      clipped: bodies.map((b) => b.scrollHeight - b.clientHeight),
      wide: bodies.map((b) => b.scrollWidth - b.clientWidth),
      spill,
      cellCut,
      split,
      rows,
      heads,
    };
  });
async function openPdf(techCardOver, orient, lang) {
  const { page, errors } = await base(orient === 'land' ? { width: 1280, height: 900 } : { width: 900, height: 1250 });
  await page.evaluate((m) => window.__ps.mountPdf(m), { card: baseCard(techCardOver), orient, lang });
  await page.waitForSelector('.tp-sheet');
  await fontReady(page);
  await page.waitForTimeout(400);
  return { page, errors };
}
const fits = (name, f) => {
  ck(f.clipped.every((d) => d <= 1), `${name}: nothing clipped by height`, f.clipped.join(','));
  ck(f.wide.every((d) => d <= 1), `${name}: nothing clipped by width`, f.wide.join(','));
  ck(f.spill.every((d) => d <= 1), `${name}: nothing past the sheet body`, f.spill.join(','));
  ck(f.cellCut.length === 0, `${name}: no cell cut`, f.cellCut.slice(0, 6).join(' | '));
  ck(f.split.length === 0, `${name}: no word broken mid-word`, f.split.slice(0, 6).join(' | '));
};
const printed = async (page, name, sheets) => {
  const pdf = join(OUT, `${name}.pdf`);
  await page.pdf({ path: pdf, preferCSSPageSize: true, printBackground: true });
  let pages = -1;
  try {
    pages = Number(/Pages:\s+(\d+)/.exec(execFileSync('pdfinfo', [pdf], { encoding: 'utf8' }))?.[1]);
  } catch {
    console.log('  note pdfinfo missing, page count not read');
    return;
  }
  ck(pages === sheets, `${name}: one printed page per sheet`, `${pages}/${sheets}`);
};

for (const orient of ['port', 'land']) {
  const big = orient === 'port' ? 'pdf-portrait' : 'pdf-landscape';
  {
    const { page, errors } = await openPdf({ packagingItems: LIMITED }, orient);
    await step(page, `G-${orient}`, async () => {
      const f = await sheetFacts(page);
      fits(`G ${orient} limited`, f);
      const whats = f.rows.map((r) => r[3]);
      ck(whats.join() === ORDER.map((r) => r.pickedName).join(), `G ${orient}: printed in the picked order`, whats.join(' | '));
      ck(f.rows.map((r) => r[0]).join() === '1,2,3,4,5,6', `G ${orient}: numbered`);
      ck(f.heads.includes('colour'), `G ${orient}: colour column when something differs`, f.heads.join(','));
      const col = f.heads.indexOf('colour');
      ck(f.rows[4][col] === 'black', `G ${orient}: limited row names the colourway`, f.rows[4][col]);
      ck(f.rows[0][col] === 'all', `G ${orient}: others read all`, f.rows[0][col]);
      ck(/per order/i.test(f.rows[4].join(' ')) && /per garment/i.test(f.rows[0].join(' ')), `G ${orient}: per garment / per order`);
      ck(f.rows.every((r) => !/_/.test(r.join(' '))), `G ${orient}: no raw key with an underscore`, f.rows[2].join(' | '));
      const side = await page.locator('.tp-sheet aside').innerText();
      for (const w of ['62 × 40 × 6 cm', '310 g', '480 g', '60×40×30', 'style + qty'])
        ck(side.includes(w), `G ${orient}: packed and carton facts: ${w}`);
      ck((await page.locator('.tp-sheet aside img').count()) === 1, `G ${orient}: packed photo printed`);
      const inside = await page.locator('.tp-body').innerText();
      ck((inside.match(/inside first/gi) ?? []).length === 1, `G ${orient}: inside first printed once`);
      await page.screenshot({ path: join(OUT, `${big}.png`), fullPage: true });
      await printed(page, `${big}`, f.sheets);
    });
    ck(errors.length === 0, `G ${orient}: no page errors`, errors.join(' | '));
    await page.close();
  }
  {
    const { page } = await openPdf({ packagingItems: ORDER }, orient);
    await step(page, `G2-${orient}`, async () => {
      const f = await sheetFacts(page);
      ck(!f.heads.includes('colour'), `G ${orient}: nothing differs, no colour column`, f.heads.join(','));
      const body = await page.locator('.tp-sheet table').evaluate((tb) => tb.tBodies[0].rows[0].cells.length);
      ck(body === f.heads.length, `G ${orient}: header and row cells agree`, `${body}/${f.heads.length}`);
      fits(`G ${orient} plain`, f);
      await page.screenshot({ path: join(OUT, `${big}-plain.png`), fullPage: true });
    });
    await page.close();
  }
  {
    const { page } = await openPdf({ packagingItems: [] }, orient);
    await step(page, `G3-${orient}`, async () => {
      const f = await sheetFacts(page);
      const miss = page.getByText('no packaging chosen').first();
      const span = await page.locator('.tp-sheet tbody td').first().getAttribute('colspan');
      ck(Number(span) === f.heads.length, `G ${orient}: missing row spans the table`, `${span}/${f.heads.length}`);
      for (const c of ['size', 'how', 'note'])
        ck(!f.heads.includes(c), `G ${orient}: empty ${c} column dropped`);
      ck((await miss.count()) === 1 && f.sheets === 1, `G ${orient}: no items, page prints with the missing mark`);
      const colour = await miss.evaluate((e) => getComputedStyle(e).borderTopColor);
      const m = /(\d+)[, ]+(\d+)[, ]+(\d+)/.exec(colour);
      ck(m && +m[1] > 200 && +m[2] < 60 && +m[3] < 60, `G ${orient}: the mark has the red frame of every PDF gap`, colour);
      fits(`G ${orient} empty`, f);
      await page.screenshot({ path: join(OUT, `${big}-empty.png`), fullPage: true });
    });
    await page.close();
  }
  {
    const { page } = await openPdf({ packagingItems: STRESS }, orient);
    await step(page, `G4-${orient}`, async () => {
      const f = await sheetFacts(page);
      fits(`G ${orient} stress`, f);
      const printedRows = f.rows.filter((r) => /catalog item/.test(r.join(' '))).length;
      ck(printedRows === 18, `G ${orient} stress: every item printed once`, String(printedRows));
      ck(f.sheets > 1, `G ${orient} stress: flows over more sheets`, String(f.sheets));
      ck(f.rows.map((r) => r[0]).join() === STRESS.map((_, i) => i + 1).join(), `G ${orient} stress: numbering runs on`);
      ck((await page.locator('.tp-sheet aside').count()) === 1, `G ${orient} stress: packed facts on the first sheet only`);
      await page.screenshot({ path: join(OUT, `${big}-stress.png`), fullPage: true });
      await printed(page, `${big}-stress`, f.sheets);
    });
    await page.close();
  }
  for (const lang of ['de', 'cn']) {
    const { page, errors } = await openPdf({ packagingItems: LIMITED }, orient, lang);
    await step(page, `G5-${orient}-${lang}`, async () => {
      const f = await sheetFacts(page);
      fits(`G ${orient} ${lang}`, f);
      ck(f.rows.length === 6, `G ${orient} ${lang}: six rows`);
    });
    ck(errors.length === 0, `G ${orient} ${lang}: no page errors`, errors.join(' | '));
    await page.close();
  }
}

await browser.close();
const bad = results.filter((r) => !r).length;
console.log(bad ? `RED: ${bad} of ${results.length}, out ${OUT}` : `GREEN: ${results.length} checks, out ${OUT}`);
console.log('harness with a stubbed network, not beta');
process.exit(bad ? 1 : 0);
