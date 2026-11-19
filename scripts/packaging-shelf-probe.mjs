#!/usr/bin/env node
// PACKAGING SHELF + PDF SHEET 05b: the real components in a real browser with production CSS and the
// real webfont. THE NETWORK IS STUBBED: this is a harness, not beta. No server validates anything here.
//
//   A stock pickers for pack, hanger and box: role tabs, search, confirm, owned catalog picks
//   B desk layout, kind order, exact row ownership, quantity and packed photo undo
//   C duplicate guard and preserving distinct rows of the same kind
//   D folded dimensions, shipping mode, box quantity and full-box weight
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
  {
    ...pkg(303, 'shipping box - standard', mediaFull(603, BOX)),
    packagingAttrs: { dimensions: '58×41×32' },
  },
  pkg(304, 'kraft sheet 40'),
  pkg(305, 'care insert card'),
  pkg(307, 'dust bag - linen'),
  { ...pkg(306, 'silk lining'), materialClass: 'MATERIAL_CLASS_FABRIC' },
];
const AUX = [
  {
    id: 41,
    name: 'garment bag',
    auxSubtype: 'TECH_CARD_AUX_SUBTYPE_GARMENT_CASE',
    outputMaterialId: 0,
  },
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
    { media: mediaFull(54, BOX) },
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
const shelf = (page) => page.locator(S);
const shelfButton = (page, name) => shelf(page).getByRole('button', { name, exact: true });
const addDoor = (page) => shelfButton(page, '+ item');
const removeItem = (page, name) => shelfButton(page, `remove ${name}`);
const packRow = (page, name) =>
  shelf(page).locator('div:has(> input[aria-label="per garment"])').filter({
    has: page.getByText(name, { exact: true }),
  });
const quantity = (page, name) =>
  packRow(page, name).getByRole('spinbutton', { name: 'per garment' });
const packedPhoto = (page, index) =>
  shelf(page).getByRole('img', { name: `packed photo ${index}`, exact: true });
const openPicker = async (page, trigger = addDoor(page)) => {
  await trigger.click();
  await page.waitForSelector(DIALOG);
};
const pickerTile = (page, name) => page.locator(`${DIALOG} [title="${name}"]`);
const done = (page) => page.getByRole('dialog').getByRole('button', { name: 'done', exact: true });
const closePicker = (page) => page.waitForSelector(DIALOG, { state: 'detached' });
const pickAndUse = async (page, trigger, name) => {
  await openPicker(page, trigger);
  await pickerTile(page, name).click();
  await done(page).click();
  await closePicker(page);
};
const form = (page) => page.evaluate(() => window.__ps.form());
const noHScroll = (page) =>
  page.evaluate(() => {
    const d = document.documentElement;
    return { sw: d.scrollWidth, cw: d.clientWidth };
  });
// ── A–F, main card ──
let exitSetup = false;
const savedCard = baseCard();
savedCard.techCard.packaging.packedMediaIds = [53, 54];
savedCard.techCard.packagingItems = [{ ...HANGER_ROW, colorwayIds: [21] }, LEGACY_ROW];
const main = await openShelf(savedCard).catch((e) => {
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
    const heights = async (selectors) =>
      page.evaluate((selectors) => selectors.map((selector) =>
        Math.round(document.querySelector(selector)?.getBoundingClientRect().height ?? 0)
      ), selectors.map((selector) => `${S} ${selector}`));
    const base = await heights(['[aria-pressed]', 'input[aria-label="per box"]']);
    ck(base.every((h) => h > 0 && h === base[0]), 'P shipping chips and per-box control align', base.join());
    const photo1 = await packedPhoto(page, 1).boundingBox();
    const photo2 = await packedPhoto(page, 2).boundingBox();
    ck(
      photo1 && photo2 && photo1.y === photo2.y && photo1.width === photo2.width &&
        photo1.height === photo2.height && photo1.x + photo1.width < photo2.x,
      'P saved photos occupy equally sized separate gallery tiles',
      JSON.stringify([photo1, photo2]),
    );
    await chip(page, S, 'folded').click();
    const folded = await heights([
      '[role="combobox"]', 'input[aria-label="folded width cm"]', 'input[aria-label="folded height cm"]',
    ]);
    ck(folded.every((h) => h > 0 && h === base[0]), 'P fold preset and dimensions share a control height', folded.join());
    await chip(page, S, 'on hanger').click();
  });

  await step(page, 'A0', async () => {
    const photo = packRow(page, 'polybag').getByRole('img', { name: 'polybag' });
    ck(
      (await photo.count()) === 1 && (await photo.getAttribute('src')) === pic(POLY).thumbnail.mediaUrl,
      'A0 a stored item without a catalog pick shows its own exact versioned mockup',
    );
    const before = await items(page);
    ck(before.map((row) => row.key).join() === 'hanger,polybag', 'A0 stored rows read in order');
    ck(
      (await shelf(page).getByRole('spinbutton', { name: 'per box' }).isDisabled()),
      'A0 a stored per-box number is disabled until a box is picked',
    );
  });

  await step(page, 'A1', async () => {
    await page.screenshot({ path: join(OUT, 'shelf-desktop-initial.png'), fullPage: true });
    await openPicker(page);
    await pickerTile(page, 'dust bag - cotton').waitFor();
    await pickerTile(page, 'garment bag').waitFor();
    const words = await page
      .locator(`${DIALOG} [aria-pressed]:not([title])`)
      .evaluateAll((els) => els.map((e) => e.textContent.trim().toLowerCase()));
    ck(
      words.join() === [
        'all', 'shirt board', 'collar support', 'tissue paper', 'silica gel', 'insert card',
        'spare kit bag', 'hangtag string', 'dust bag', 'garment case', 'polybag', 'sticker',
        'mailer', 'tote bag',
      ].join(),
      'A1 pack tabs list the exact pack roles in order',
      words.join(),
    );
    for (const name of ['dust bag - cotton', 'garment bag', 'octagon tote s', 'kraft sheet 40'])
      ck((await pickerTile(page, name).count()) === 1, `A1 listed: ${name}`);
    for (const name of [
      'wooden hanger', 'shipping box - standard', 'silk lining', 'Brand Label (PLM seed)',
      'Care Label (PLM seed)', 'Size Label (PLM seed)', 'Hangtag (PLM seed)',
    ]) ck((await pickerTile(page, name).count()) === 0, `A1 excluded from this stock picker: ${name}`);
    const warn = pickerTile(page, 'garment bag').getByText('no output material', { exact: true });
    ck((await warn.count()) === 1, 'A1 aux card without output has the warning');
    ck(
      (await pickerTile(page, 'octagon tote s').getByText('no output material', { exact: true }).count()) === 0,
      'A1 an aux with output has no missing-output warning',
    );
    const warnings = await warn.boundingBox();
    const tile = await pickerTile(page, 'garment bag').boundingBox();
    ck(
      warnings && tile && warnings.x >= tile.x && warnings.x + warnings.width <= tile.x + tile.width,
      'A1 warning fits inside its own catalog tile',
      JSON.stringify({ warning: warnings, tile }),
    );
    const search = page.getByRole('dialog').getByRole('textbox', { name: 'search' });
    await search.fill('octagon');
    ck(
      (await pickerTile(page, 'octagon tote s').count()) === 1 &&
        (await pickerTile(page, 'garment bag').count()) === 0,
      'A1 search narrows the list',
    );
    await search.fill('zzz');
    ck((await page.getByRole('dialog').getByText('no items', { exact: true }).count()) === 1, 'A1 no result is explicit');
    await search.fill('');
    await chip(page, DIALOG, 'collar support').click();
    ck((await page.getByRole('dialog').getByText('no items', { exact: true }).count()) === 1, 'A1 empty role remains empty');
    await chip(page, DIALOG, 'insert card').click();
    ck(
      (await pickerTile(page, 'care insert card').count()) === 1 &&
        (await pickerTile(page, 'kraft sheet 40').count()) === 0,
      'A1 a classified role lists only matching stock',
    );
    await pickerTile(page, 'care insert card').click();
    ck(
      (await pickerTile(page, 'care insert card').getAttribute('aria-pressed')) === 'true' &&
        (await items(page)).length === 2,
      'A1 a tentative selection does not write the form',
    );
    await page.screenshot({ path: join(OUT, 'picker.png') });
    await done(page).click();
    await closePicker(page);
    const rows = await items(page);
    const inserted = rows[1];
    ck(rows.map((row) => row.key).join() === 'hanger,insert_card,polybag', 'A2 pack item inserted by kind rank');
    ck(
      inserted.materialId === 305 && inserted.auxTechCardId === 0 && inserted.perOrder === false &&
        !!inserted.bomLineKey,
      'A2 confirmed catalog item binds its material and owned BOM line',
    );
  });

  await step(page, 'B1', async () => {
    await openPicker(page);
    for (const name of ['octagon tote s', 'dust bag - cotton', 'garment bag'])
      await pickerTile(page, name).click();
    ck((await items(page)).length === 3, 'B1 multiple tentative choices stay local to picker');
    await done(page).click();
    await closePicker(page);
    await openPicker(page, shelfButton(page, '+ box'));
    ck(
      (await pickerTile(page, 'shipping box - standard').count()) === 1 &&
        (await pickerTile(page, 'dust bag - cotton').count()) === 0,
      'B1 dedicated box picker separates packaging roles',
    );
    await pickerTile(page, 'shipping box - standard').click();
    await done(page).click();
    await closePicker(page);
    const rows = await items(page);
    const by = (kind) => rows.find((row) => row.key === kind);
    ck(
      rows.map((row) => row.key).join() === 'hanger,insert_card,dust_bag,garment_case,polybag,box,tote_bag',
      'B1 persisted rows keep rank across pack, hanger and carton',
      rows.map((row) => row.key).join(),
    );
    const names = ['care insert card', 'dust bag - cotton', 'garment bag', 'polybag', 'octagon tote s'];
    const tops = await Promise.all(names.map(async (name) => (await packRow(page, name).boundingBox())?.y));
    ck(tops.every((top, index) => top > (tops[index - 1] ?? 0)), 'B1 only pack items use the ordered quantity rows', tops.join());
    ck(by('box')?.perOrder === true && by('tote_bag')?.perOrder === true, 'B1 box and tote default to per order');
    ck(by('dust_bag')?.perOrder === false, 'B1 dust bag defaults to per garment');
    ck(by('tote_bag')?.auxTechCardId === 42 && by('tote_bag')?.materialId === 0, 'B1 aux pick sets only auxTechCardId');
    ck(
      by('box')?.pickedName === 'shipping box - standard' &&
        !!by('box')?.pickedThumbnail?.media?.thumbnail?.mediaUrl &&
        (await shelf(page).getByRole('img', { name: 'shipping box - standard', exact: true }).count()) === 1,
      'B1 dedicated carton shows the exact stored picking metadata',
    );
    const group = shelf(page).locator('[data-group-label]').filter({ hasText: 'in the pack' });
    ck((await group.getByText('5', { exact: true }).count()) === 1, 'B1 group count represents pack items only');
  });

  await step(page, 'B2', async () => {
    const before = await items(page);
    await quantity(page, 'dust bag - cotton').fill('3');
    const after = await items(page);
    const index = before.findIndex((item) => item.materialId === 302);
    ck(
      index >= 0 && JSON.stringify(after) === JSON.stringify(
        before.map((row, rowIndex) => rowIndex === index ? { ...row, qtyPerGarment: 3 } : row)
      ),
      'B2 quantity changes exactly one pack row, preserving other facts and the saved colour limit',
    );
    await shelfButton(page, 'remove photo 1').click();
    let saved = (await form(page)).packaging;
    ck(saved.packedMediaIds.join() === '54' && saved.packedMediaId === 54, 'B2 photo remove promotes the next cover');
    await shelfButton(page, 'undo').click();
    saved = (await form(page)).packaging;
    ck(
      saved.packedMediaIds.join() === '53,54' && saved.packedMediaId === 53,
      'B2 photo undo preserves exact ordered IDs and the cover',
    );
  });

  await step(page, 'C', async () => {
    const before = await items(page);
    await openPicker(page);
    const existing = pickerTile(page, 'dust bag - cotton');
    ck(
      /in pack/i.test(await existing.innerText()) &&
        (await existing.evaluate((e) => e.tagName)) !== 'BUTTON' &&
        Number(await existing.evaluate((e) => getComputedStyle(e).opacity)) < 1,
      'C the exact chosen catalog item is dimmed and cannot be picked again',
    );
    await done(page).click();
    await closePicker(page);
    ck(JSON.stringify(await items(page)) === JSON.stringify(before), 'C closing with no choice preserves the form');

    await pickAndUse(page, addDoor(page), 'dust bag - linen');
    await quantity(page, 'dust bag - linen').fill('2');
    const twins = (await items(page)).filter((row) => row.key === 'dust_bag');
    ck(
      twins.length === 2 && twins[0].materialId === 302 && twins[0].qtyPerGarment === 3 &&
        twins[1].materialId === 307 && twins[1].qtyPerGarment === 2 &&
        twins[0].bomLineKey && twins[1].bomLineKey && twins[0].bomLineKey !== twins[1].bomLineKey,
      'C distinct materials of the same role keep separate quantity and BOM identity',
    );
    await removeItem(page, 'dust bag - linen').click();
    const after = await form(page);
    ck(
      JSON.stringify(after.packagingItems) === JSON.stringify(before) &&
        !after.bomItems.some((row) => row.lineKey === twins[1].bomLineKey) &&
        after.bomItems.some((row) => row.lineKey === twins[0].bomLineKey),
      'C removal preserves the neighbouring same-kind row and its BOM line',
    );
    ck((await packRow(page, 'dust bag - linen').count()) === 0, 'C deleted row is absent from the shelf');
  });

  await step(page, 'D', async () => {
    ck((await chip(page, S, 'on hanger').getAttribute('aria-pressed')) === 'true', 'D stored on a hanger is selected');
    const foldPreset = shelf(page).getByRole('combobox');
    ck((await foldPreset.count()) === 0, 'D folded controls are absent on a hanger');
    await chip(page, S, 'folded').click();
    ck((await form(page)).packaging.foldingMethod === 'folded', 'D folded state asks for an actual fold preset');
    await foldPreset.click();
    const options = await page.getByRole('option').allInnerTexts();
    ck(options.map((option) => option.toLowerCase()).join() === 'in half,in thirds,tri-fold,rolled', 'D exact fold presets', options.join());
    await page.getByRole('option', { name: 'rolled', exact: true }).click();
    const width = shelf(page).getByRole('spinbutton', { name: 'folded width cm' });
    const height = shelf(page).getByRole('spinbutton', { name: 'folded height cm' });
    ck((await width.inputValue()) === '62' && (await height.inputValue()) === '40', 'D legacy packed string opens as exact dimensions');
    await width.fill('60');
    await height.fill('41');
    let saved = (await form(page)).packaging;
    ck(saved.foldingMethod === 'rolled' && saved.packedSize === '60 × 41', 'D preset and dimensions write canonical values');
    await chip(page, S, 'on hanger').click();
    saved = (await form(page)).packaging;
    ck(
      saved.foldingMethod === 'on a hanger' && saved.packedSize === '60 × 41' &&
        (await width.count()) === 0,
      'D changing shipping mode keeps the saved fold dimensions',
    );
    await shelf(page).getByRole('spinbutton', { name: 'per box' }).fill('24');
    saved = (await form(page)).packaging;
    ck(
      saved.unitsPerBox === 24 && saved.boxDimensions === '58×41×32' &&
        (await shelf(page).getByText('11.52 kg', { exact: true }).count()) === 1,
      'D picked carton allows quantity and shows the current calculated full-box weight',
      JSON.stringify(saved),
    );
    ck(
      (await packedPhoto(page, 1).getAttribute('src')) === pic(PACK).thumbnail.mediaUrl &&
        (await packedPhoto(page, 2).getAttribute('src')) === pic(BOX).thumbnail.mediaUrl,
      'D saved photos resolve from the exact card media in order',
    );
  });

  await step(page, 'E', async () => {
    const { parsed, insert } = await page.evaluate(() => window.__ps.wire());
    ck(parsed, 'E the form passes the card schema');
    ck(insert.packagingPicksAware === true, 'E write payload: packagingPicksAware true');
    ck(insert.labelsAware === true, 'E write payload: labelsAware true');
    const out = insert.packagingItems;
    const hanger = out.find((row) => row.materialId === 301);
    const aux = out.find((row) => row.auxTechCardId === 42);
    const legacy = out.find((row) => row.key === 'polybag');
    ck(
      hanger?.usage === 'stored usage words' && hanger?.size === '42 cm' &&
        JSON.stringify(hanger?.mediaIds) === '[51]' && hanger?.bomItemId === 17 &&
        hanger?.bomLineKey === 'BL-1' && JSON.stringify(hanger?.colorwayIds) === '[21]',
      'E wire preserves the saved hanger usage, size, media, BOM and colour scope',
      JSON.stringify(hanger),
    );
    ck(aux?.perOrder === true && aux?.materialId === 0, 'E wire: per order, one pick only');
    ck(
      legacy?.usage === 'one per garment' && legacy?.packing === 'flat' &&
        legacy?.size === '30 × 40 cm' && JSON.stringify(legacy?.mediaIds) === '[52]' &&
        legacy?.bomLineKey === 'BL-2' && legacy?.materialId === 0 && legacy?.auxTechCardId === 0,
      'E wire preserves the whole stored item without a pick',
      JSON.stringify(legacy),
    );
    ck(
      out.every((row) => !('pickedName' in row) && !('pickedThumbnail' in row)),
      'E wire: output-only pickedName and pickedThumbnail are absent',
    );
    ck(out.every((row) => !(row.materialId && row.auxTechCardId)), 'E wire: at most one of material and aux card');
    ck(
      insert.packaging.packedSize === '60 × 41' && insert.packaging.packedMediaId === 53 &&
        insert.packaging.packedMediaIds.join() === '53,54' && insert.packaging.unitsPerBox === 24 &&
        insert.packaging.boxDimensions === '58×41×32',
      'E wire packs exact dimensions, ordered gallery, cover and carton facts',
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
    await chip(page, S, 'folded').click();
    await shelf(page).getByRole('combobox').waitFor();
    d = await noHScroll(page);
    ck(d.sw <= d.cw, 'M 375: folded controls fit without horizontal scroll', `${d.sw}/${d.cw}`);
    await page.screenshot({ path: join(OUT, 'shelf-375.png'), fullPage: true });
    await openPicker(page);
    d = await noHScroll(page);
    ck(d.sw <= d.cw, 'M 375: picker, no horizontal scroll', `${d.sw}/${d.cw}`);
    const box = await page.locator(DIALOG).boundingBox();
    ck(box && box.x >= 0 && box.x + box.width <= 375, 'M 375: picker fits the width', JSON.stringify(box));
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
    const photo = shelfButton(page, '+ photo');
    const bounds = await photo.boundingBox();
    ck(
      bounds && bounds.width > 0 && bounds.width <= 120 && bounds.height > bounds.width,
      'O empty gallery has one photo tile',
      JSON.stringify(bounds),
    );
    ck((await photo.evaluate((e) => getComputedStyle(e).borderTopStyle)) === 'dashed', 'O photo add tile is dashed');
    ck((await packedPhoto(page, 1).count()) === 0, 'O empty gallery shows no saved image');
    await page.screenshot({ path: join(OUT, 'shelf-empty.png'), fullPage: true });
  });
  ck(errors.length === 0, 'O no page errors', errors.join(' | '));
  await page.close();
}

// ── read-only ──
{
  const { page, errors } = await openShelf(baseCard(), { canEdit: false });
  await step(page, 'R', async () => {
    ck((await addDoor(page).count()) === 0, 'R no pack add door without rights');
    ck(await shelfButton(page, /wooden hanger/).isDisabled(), 'R saved hanger cannot open the picker');
    ck(await quantity(page, 'polybag').isDisabled(), 'R visible pack quantity cannot be edited');
    ck(await shelfButton(page, '+ box').isDisabled(), 'R carton picker is disabled');
    ck(
      (await shelf(page).getByRole('button', { name: /^(remove|replace|unpick) / }).count()) === 0 &&
        (await shelfButton(page, '+ photo').count()) === 0 &&
        (await packedPhoto(page, 1).count()) === 1,
      'R saved photo remains visible with no shelf mutation controls',
    );
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
    const mailer = pdfItem('mailer', 'domestic shipping mailer only', { perOrder: true });
    const { page, errors } = await openPdf({ packagingItems: [...LIMITED, mailer] }, orient);
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
      for (const fact of ['62 × 40 × 6 cm', '310 g', '480 g'])
        ck(side.includes(fact), `G ${orient}: packed garment fact: ${fact}`);
      ck(
        !side.includes('60×40×30') && !side.includes('style + qty'),
        `G ${orient}: shipping carton metadata stays off the printed sidebar`,
      );
      ck(!whats.includes(mailer.pickedName), `G ${orient}: shipping-only mailer stays off the table`);
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
