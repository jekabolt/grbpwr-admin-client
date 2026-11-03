#!/usr/bin/env node
// SEWN-IN LABEL ROWS: the real block in a real browser, RPCs stubbed, the form read back.
//
//   1 the door offers the seven kinds; hangtag and barcode are gone from it, old rows still show
//   2 a new row starts with attachment, folding and quantity; missing things are pills
//   3 location from the list, `other` opens a text input, the words land in placement
//   4 material from the catalogue becomes one BOM line of section LABEL, linked by line key, with price;
//     another material moves the row's own line, no second line
//   5 the pin: a callout on the flat, ACCEPT only after a click, the tile shows it
//   6 artwork: one for all, per size, per colour are independent; upload lands in its cell with the
//     public link; an old colourless file stays apart until every cell it covered has its own
//   7 one colour on the card hides `per colour`
//   8 no files rights: a clear word, no upload
//   9 ✕ removes the row and its pin, the BOM line stays
//  10 composition never shows as a normal row
//
// Needs `yarn build` (reads the Tailwind CSS from dist/).
//
//   node scripts/sewn-label-row-probe.mjs [--out=DIR]
import { createRequire } from 'node:module';
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { homedir, tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { dirname, join, resolve } from 'node:path';
import { build as esbuild } from 'esbuild';

const OUT =
  (process.argv.find((a) => a.startsWith('--out=')) ?? '').split('=')[1] ||
  mkdtempSync(join(tmpdir(), 'sewn-row-'));
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
if (!pw) {
  console.log('DID NOT RUN: playwright not found');
  process.exit(2);
}
const mod = await import(pw);
const chromium = mod.chromium ?? mod.default?.chromium;

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = resolve(HERE, '..');
const assets = resolve(REPO, 'dist/assets');
const css = existsSync(assets)
  ? readdirSync(assets)
      .filter((f) => f.endsWith('.css'))
      .sort((a, b) => statSync(join(assets, b)).size - statSync(join(assets, a)).size)[0]
  : null;
if (!css) {
  console.log('DID NOT RUN: no dist/assets css, run yarn build first');
  process.exit(2);
}

async function bundle() {
  const outfile = join(OUT, 'entry.js');
  await esbuild({
    entryPoints: [resolve(HERE, 'sewn-label-row-probe-entry.tsx')],
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

const FLAT =
  'data:image/svg+xml,' +
  encodeURIComponent(
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 300 340" width="300" height="340"><path fill="#fff" stroke="#000" d="M120 30h60l40 20 65 120-30 15-40-90v225H85V95l-40 90-30-15L80 50z"/><path fill="none" stroke="#000" d="M120 30q30 16 60 0M85 80h130"/></svg>',
  );
const DICT = {
  languages: [{ id: 1, code: 'en', name: 'English', isDefault: true, isActive: true }],
  sizes: [
    { id: 11, name: 's', skuOrd: 3 },
    { id: 12, name: 'm', skuOrd: 4 },
  ],
};
const MATERIALS = [
  {
    id: 301,
    name: 'satin ribbon 30 mm',
    section: 'TECH_CARD_BOM_SECTION_LABEL',
    unit: 'pcs',
    latestPrice: { price: { value: '0.04' }, currency: 'EUR' },
  },
  {
    id: 302,
    name: 'woven label black',
    section: 'TECH_CARD_BOM_SECTION_LABEL',
    unit: 'pcs',
    latestPrice: { price: { value: '0.18' }, currency: 'EUR' },
  },
];
const COLOURS = [
  { colorwayId: 21, devName: 'black' },
  { colorwayId: 22, devName: 'bone' },
];
const card = (colorways = COLOURS) => ({
  id: 7,
  colorways,
  resolvedTechnicalMedia: [
    {
      kind: 'TECH_CARD_MEDIA_KIND_BACK',
      media: { id: 5, media: { fullSize: { mediaUrl: FLAT, width: 300, height: 340 } } },
    },
  ],
  techCard: { name: 'probe', sizeIds: [11, 12] },
});
const FORM = {
  sizeIds: [11, 12],
  technicalMedia: [{ mediaId: 5, kind: 'TECH_CARD_MEDIA_KIND_BACK' }],
  bomItems: [],
  callouts: [],
  garmentLabels: [],
};

const b64 = (o) => Buffer.from(JSON.stringify(o)).toString('base64').replace(/=+$/, '');
const TOKEN = `${b64({ alg: 'none' })}.${b64({ exp: 4102444800 })}.x`;

const results = [];
const ck = (ok, what, d = '') => {
  results.push(ok);
  console.log(`${ok ? '  ok  ' : '  FAIL'} ${what}${d ? `  — ${d}` : ''}`);
};

const code = await bundle();
const browser = await chromium.launch();

async function open(cardValue, form, { account = {} } = {}) {
  const page = await browser.newPage({ viewport: { width: 1180, height: 1000 } });
  page.setDefaultTimeout(5000);
  const errors = [];
  const counts = { uploads: 0, access: 0 };
  page.on('pageerror', (e) => errors.push(String(e)));
  await page.route('http://probe.local/**', (r) =>
    r.fulfill({
      status: 200,
      contentType: 'text/html',
      body: '<!doctype html><html><body><div id="root"></div></body></html>',
    }),
  );
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
    if (/api\/files\/upload/.test(url)) {
      counts.uploads += 1;
      return json({ file: { id: 900 + counts.uploads } });
    }
    if (/api\/admin\/files\/access\/set/.test(url)) {
      counts.access += 1;
      const body = JSON.parse(r.request().postData() ?? '{}');
      return json({
        access: { link: { url: `https://backend-beta.grbpwr.com/api/f/tok${body.fileId}` } },
      });
    }
    if (/accounts\/me/.test(url)) return json(account);
    if (/accounts\/sections/.test(url))
      return json({ sections: [{ key: 'tech_cards' }, { key: 'files' }] });
    return json({});
  });
  await page.goto('http://probe.local/');
  await page.evaluate((t) => localStorage.setItem('authToken', t), TOKEN);
  await page.addStyleTag({ path: join(assets, css) });
  await page.addScriptTag({ content: code });
  await page.evaluate(([c, f]) => window.__sr.mount(c, f), [cardValue, form]);
  await page.waitForSelector('[data-labels-rows]');
  await page.waitForTimeout(300);
  return { page, errors, counts };
}

const form = (page) => page.evaluate(() => window.__sr.form());
const rowOf = async (page, key) => (await form(page)).garmentLabels.find((l) => l.key === key);
const pick = async (page, scope, name, option) => {
  await page
    .locator(`${scope} div.min-w-0:has(> span:text-is("${name}")) [role="combobox"]`)
    .first()
    .click();
  await page
    .locator('[role="option"]', { hasText: new RegExp(`^${option}$`) })
    .first()
    .click();
  await page.waitForTimeout(80);
};
const addKind = async (page, kind) => {
  await page.locator('[data-labels-rows] button', { hasText: /label/i }).last().click();
  await page.locator(`[data-label-kind="${kind}"]`).click();
  await page.waitForTimeout(80);
};
const upload = async (page, key, cell) => {
  const tile = page.locator(`[data-artwork-tile="${key}:${cell}"]`);
  const chooser = page.waitForEvent('filechooser', { timeout: 1500 }).catch(() => null);
  await tile.click();
  await chooser;
  await page.locator(`[data-label-file-input="${key}"]`).setInputFiles({
    name: `${key}-${cell.replace(':', 'x')}.pdf`,
    mimeType: 'application/pdf',
    buffer: Buffer.from('%PDF-1.4 probe'),
  });
  await page.waitForFunction(
    ([k, c]) =>
      document
        .querySelector(`[data-artwork-tile="${k}:${c}"]`)
        ?.getAttribute('data-artwork-full') === '1',
    [key, cell],
  );
};

// ── main card ──
const { page, errors, counts } = await open(card(), {
  ...FORM,
  garmentLabels: [
    { key: 'composition', placement: 'hem' },
    { key: 'hangtag', placement: 'left side seam', size: '50 × 90' },
  ],
});
try {
  const R = '[data-labels-rows]';
  ck(
    (await page.locator('[data-sewn-label="composition"]').count()) === 0,
    '10 composition is not a normal row',
  );
  ck(
    (await page.locator('[data-sewn-label="hangtag"]').count()) === 1,
    '1 an old hangtag row still shows',
  );
  await page.locator(`${R} button`, { hasText: /label/i }).last().click();
  const kinds = await page
    .locator('[data-label-kind]')
    .evaluateAll((els) => els.map((e) => e.getAttribute('data-label-kind')));
  ck(
    JSON.stringify(kinds) ===
      JSON.stringify(['brand', 'size', 'flag', 'hanger_loop', 'patch', 'neck_tape', 'other']),
    '1 the door offers seven kinds',
    kinds.join(','),
  );
  await page.locator('[data-label-kind="brand"]').click();
  await page.waitForTimeout(80);

  const brand = '[data-sewn-label="brand"]';
  const born = await rowOf(page, 'brand');
  ck(
    !!born?.attachment && !!born?.folding && born?.qtyPerGarment === 1,
    '2 born facts',
    JSON.stringify(born),
  );
  const pills = await page.locator(`${brand} > div`).first().innerText();
  ck(/no material/i.test(pills) && /1 file/i.test(pills), '2 pills', pills.replace(/\s+/g, ' '));

  await pick(page, brand, 'location', 'left side seam');
  ck((await rowOf(page, 'brand')).placement === 'left side seam', '3 location from the list');
  await pick(page, brand, 'location', 'other');
  const otherInput = page.locator(`${brand} div.min-w-0:has(> label:text-is("other")) input`);
  ck((await otherInput.count()) === 1, '3 other opens a text input');
  await otherInput.fill('under the back yoke, left');
  ck(
    (await rowOf(page, 'brand')).placement === 'under the back yoke, left',
    '3 the words in placement',
  );

  await page.locator(`[data-label-material="brand"]`).click();
  await page.locator('[data-mp-tile] button', { hasText: 'satin ribbon' }).first().click();
  await page.waitForTimeout(200);
  let f = await form(page);
  let lines = f.bomItems.filter((b) => b.section === 'TECH_CARD_BOM_SECTION_LABEL');
  let row = f.garmentLabels.find((l) => l.key === 'brand');
  ck(
    lines.length === 1 && lines[0].name === 'satin ribbon 30 mm',
    '4 one BOM line',
    JSON.stringify(lines.map((l) => l.name)),
  );
  ck(!!row.bomLineKey && row.bomLineKey === lines[0].lineKey, '4 linked by line key');
  const shown = await page.locator(`[data-label-material="brand"]`).inputValue();
  ck(/satin ribbon/.test(shown) && /0\.04/.test(shown), '4 name and price in the row', shown);
  ck(!/no material/i.test(await page.locator(`${brand} > div`).first().innerText()), '4 pill gone');
  await page.locator(`[data-label-material="brand"]`).click();
  await page.locator('[data-mp-tile] button', { hasText: 'woven label' }).first().click();
  await page.waitForTimeout(200);
  f = await form(page);
  lines = f.bomItems.filter((b) => b.section === 'TECH_CARD_BOM_SECTION_LABEL');
  ck(
    lines.length === 1 && lines[0].name === 'woven label black',
    '4 the same line follows',
    JSON.stringify(lines.map((l) => l.name)),
  );

  await page.locator(`${brand} [data-label-flat]`).first().click();
  const accept = page.locator('[role="dialog"] button', { hasText: /^accept$/i });
  ck(await accept.isDisabled(), '5 accept waits for a click');
  const box = await page.locator('[role="dialog"] [data-label-flat]').boundingBox();
  await page.mouse.click(box.x + box.width * 0.5, box.y + box.height * 0.25);
  await page.waitForTimeout(80);
  await page.screenshot({ path: join(OUT, 'pin-dialog.png') });
  await accept.click();
  await page.waitForTimeout(150);
  f = await form(page);
  row = f.garmentLabels.find((l) => l.key === 'brand');
  const callout = f.callouts.find((c) => c.number === row.calloutNumber);
  ck(
    !!callout &&
      callout.kind === 'pin' &&
      callout.mediaId === 5 &&
      Math.abs(callout.posX - 0.5) < 0.01 &&
      Math.abs(callout.posY - 0.25) < 0.01,
    '5 the pin is a callout on the flat',
    JSON.stringify(callout),
  );
  ck(
    (await page
      .locator(`${brand} [data-label-flat] [data-pin], ${brand} [data-label-flat] > :not(img)`)
      .count()) >= 1,
    '5 the tile shows the pin',
  );

  await upload(page, 'brand', '0:0');
  row = await rowOf(page, 'brand');
  ck(
    row.files.length === 1 &&
      row.files[0].publicUrl.endsWith('/api/f/tok901') &&
      row.files[0].libraryFileId === 901,
    '6 upload lands in the cell with the link',
    JSON.stringify(row.files),
  );
  ck(counts.access === 1, '6 the file was opened by link');

  const chip = (name) =>
    page.locator(`${brand} [aria-pressed]`, { hasText: new RegExp(`^${name}$`) });
  await chip('per size').click();
  await page.waitForTimeout(80);
  ck(
    (await page.locator(`[data-artwork-tile="brand:0:11"]`).count()) === 1 &&
      (await page.locator(`[data-artwork-tile="brand:0:12"]`).count()) === 1,
    '6 per size: one tile per size',
  );
  ck(
    (await page.locator('[data-label-old-files="brand"]').count()) === 1,
    '6 the old file stays apart',
  );
  ck(
    (await page.locator('[data-artwork-tile="brand:0:11"]').innerText()).trim() === 'S',
    '6 tiles say the size',
    await page.locator('[data-artwork-tile="brand:0:11"]').innerText(),
  );
  await chip('per colour').click();
  await page.waitForTimeout(80);
  ck(
    (await page.locator(`[data-artwork-tile^="brand:"]`).count()) === 4,
    '6 per colour and size: four tiles',
    String(await page.locator(`[data-artwork-tile^="brand:"]`).count()),
  );
  ck(/4 files/i.test(await page.locator(`${brand} > div`).first().innerText()), '6 four missing');
  await upload(page, 'brand', '21:11');
  await upload(page, 'brand', '21:12');
  await upload(page, 'brand', '22:11');
  ck(
    (await page.locator('[data-label-old-files="brand"]').count()) === 1,
    '6 old file kept while a cell is empty',
  );
  await page.screenshot({ path: join(OUT, 'row-partial.png'), fullPage: true });
  await upload(page, 'brand', '22:12');
  ck(
    (await page.locator('[data-label-old-files="brand"]').count()) === 0,
    '6 old file goes when all cells are full',
  );
  row = await rowOf(page, 'brand');
  ck(
    row.files.length === 4 && row.files.every((x) => x.colorwayId > 0 && x.sizeId > 0),
    '6 four files, each with colour and size',
    JSON.stringify(row.files.map((x) => [x.colorwayId, x.sizeId])),
  );
  await chip('per colour').click();
  await chip('per size').click();
  await page.waitForTimeout(80);
  ck(
    (await page.locator(`[data-artwork-tile="brand:0:0"]`).count()) === 1,
    '6 both off: one for all',
  );
  ck((await rowOf(page, 'brand')).files.length === 4, '6 turning modes off deletes nothing');
  await chip('per colour').click();
  await chip('per size').click();
  await page.waitForTimeout(80);
  await page.screenshot({ path: join(OUT, 'row-full.png'), fullPage: true });

  const number = (await rowOf(page, 'brand')).calloutNumber;
  await page.locator(`${brand} button[aria-label="remove brand label"]`).click();
  await page.waitForTimeout(120);
  f = await form(page);
  ck(!f.garmentLabels.some((l) => l.key === 'brand'), '9 ✕ removes the row');
  ck(!f.callouts.some((c) => c.number === number), '9 and its pin');
  ck(f.bomItems.length === 1, '9 the BOM line stays');
  ck(errors.length === 0, 'no page errors', errors.join(' | '));
} catch (e) {
  ck(false, 'main card threw', String(e).split('\n').slice(0, 3).join(' '));
  await page.screenshot({ path: join(OUT, 'threw.png'), fullPage: true }).catch(() => {});
}
await page.close();

// ── one colour ──
{
  const { page: p2 } = await open(card([COLOURS[0]]), FORM);
  await addKind(p2, 'size');
  const words = await p2.locator('[data-sewn-label="size"] [aria-pressed]').allInnerTexts();
  ck(
    !words.some((w) => /per colour/i.test(w)) && words.some((w) => /per size/i.test(w)),
    '7 one colour hides per colour',
    words.join(' | '),
  );
  await p2.close();
}

// ── no files rights ──
{
  const { page: p3, counts: c3 } = await open(card(), FORM, {
    account: {
      account: { id: 2, isSuper: false, permissions: [{ section: 'tech_cards', access: 2 }] },
    },
  });
  await addKind(p3, 'brand');
  await p3.waitForTimeout(300);
  const chooser = p3.waitForEvent('filechooser', { timeout: 800 }).catch(() => null);
  await p3.locator('[data-artwork-tile="brand:0:0"]').click();
  ck((await chooser) === null && c3.uploads === 0, '8 no files rights: no file dialog, no upload');
  await p3.close();
}

await browser.close();
const bad = results.filter((r) => !r).length;
console.log(
  bad ? `RED: ${bad} of ${results.length}` : `GREEN: ${results.length} checks, out ${OUT}`,
);
process.exit(bad ? 1 : 0);
