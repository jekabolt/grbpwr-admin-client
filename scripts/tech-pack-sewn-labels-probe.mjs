#!/usr/bin/env node
// TECH PACK PAGE 05, SEWN-IN LABELS: the real page in a real browser, printed to a real PDF.
//
//   A · golden card, both orientations: nothing clipped, every QR at least 17 mm on paper, every QR on
//       the rasterized PDF decodes to the file of its own colour and size, an empty cell has no QR.
//   B · stress card (12 rows, long words, 14 sizes), both orientations: flows to next sheets, nothing
//       clipped, every line printed once.
//
// Needs `yarn build` (reads the Tailwind CSS from dist/) and poppler + zbar on PATH.
//
//   node scripts/tech-pack-sewn-labels-probe.mjs [--out=DIR]
import { createRequire } from 'node:module';
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { homedir, tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { dirname, join, resolve } from 'node:path';
import { build as esbuild } from 'esbuild';

const OUT =
  (process.argv.find((a) => a.startsWith('--out=')) ?? '').split('=')[1] ||
  mkdtempSync(join(tmpdir(), 'sewn-labels-'));
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
    entryPoints: [resolve(HERE, 'tech-pack-sewn-labels-probe-entry.tsx')],
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
const SITE = 'https://backend-beta.grbpwr.com';
const token = (label, c, s) => `${label}-c${c}-s${s}`;
const file = (label, c, s) => ({
  colorwayId: c,
  sizeId: s,
  libraryFileId: 1000 * c + s + 1,
  sourceHash: '',
  publicUrl: `${SITE}/api/f/${token(label, c, s)}`,
});
const media = (id) => ({ fullSize: { mediaUrl: FLAT, width: 300, height: 340 }, id });
const colours = [
  { colorwayId: 11, devName: 'black' },
  { colorwayId: 22, devName: 'off white' },
];
const SIZES = { 1: 'xs', 2: 's', 3: 'm', 4: 'l', 5: 'xl' };
const callout = (number, x, y) => ({
  number,
  mediaId: 5,
  kind: 'pin',
  posX: { value: String(x) },
  posY: { value: String(y) },
});
const base = (techCard) => ({
  id: 7,
  colorways: colours,
  resolvedTechnicalMedia: [
    { kind: 'TECH_CARD_MEDIA_KIND_BACK', media: { id: 5, media: media(5) } },
  ],
  techCard: { name: 'probe coat', styleNumber: 'GR-1', ...techCard },
});

const each = (label, cs, ss, skip = []) =>
  cs.flatMap((c) => ss.filter((s) => !skip.includes(`${c}x${s}`)).map((s) => file(label, c, s)));

const GOLDEN = base({
  sizeIds: [1, 2, 3, 4, 5],
  bomItems: [
    { id: 9, lineKey: 'C', name: 'satin ribbon 30 mm', section: 'LABEL' },
    { id: 10, lineKey: 'S', name: 'printed size tag 15×20', section: 'LABEL' },
    { id: 11, lineKey: 'B', name: 'woven label black 60×20', section: 'LABEL' },
  ],
  callouts: [callout(1, 0.83, 0.8), callout(2, 0.5, 0.14), callout(3, 0.5, 0.2)],
  garmentLabels: [
    {
      key: 'composition',
      placement: 'left side seam',
      attachment: 'sewn into the seam',
      folding: 'flat',
      size: '30 × 60',
      qtyPerGarment: 1,
      calloutNumber: 1,
      bomLineKey: 'C',
      files: each('comp', [11, 22], [1, 2, 3, 4, 5], ['22x5']),
    },
    {
      key: 'size',
      placement: 'neckline, centre back',
      attachment: 'under brand label',
      folding: 'centre fold',
      size: '15 × 20',
      qtyPerGarment: 1,
      calloutNumber: 2,
      bomLineKey: 'S',
      artworkPerSize: true,
      files: each('size', [0], [1, 2, 3, 4, 5]),
    },
    {
      key: 'brand',
      placement: 'neckline, centre back',
      attachment: 'four sides',
      folding: 'end fold',
      size: '60 × 20',
      qtyPerGarment: 1,
      calloutNumber: 3,
      bomLineKey: 'B',
      note: 'keep the woven edge clear of the seam',
      files: each('brand', [0], [0]),
    },
    {
      key: 'patch',
      placement: 'under the back yoke, left',
      attachment: 'zigzag',
      qtyPerGarment: 2,
      artworkPerColorway: true,
      files: each('patch', [11, 22], [0]),
    },
  ],
});

const WIDE = Object.fromEntries(Array.from({ length: 14 }, (_, i) => [i + 1, `s${i + 1}`]));
const STRESS = base({
  sizeIds: Object.keys(WIDE).map(Number),
  bomItems: [],
  callouts: [],
  garmentLabels: Array.from({ length: 12 }, (_, i) => ({
    key: `other ${i + 1}`,
    placement: 'under the back yoke, on the left side, a long way from the collar seam',
    attachment: 'zigzag along every side with a tiny bar tack at each corner and one more',
    material: 'x',
    note: 'keep the woven edge clear of the seam allowance and press it before the bar tack goes on',
    artworkPerSize: true,
    files: each(`o${i}`, [0], [1, 2, 3, 4, 5, 6, 7]),
  })),
});

const results = [];
const ck = (ok, what, d = '') => {
  results.push(ok);
  console.log(`${ok ? '  ok  ' : '  FAIL'} ${what}${d ? `  — ${d}` : ''}`);
};

const code = await bundle();
const browser = await chromium.launch();

async function open(card, orient, sizeNames) {
  const page = await browser.newPage({ viewport: { width: 1280, height: 1200 } });
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  await page.route('http://probe.local/**', (r) =>
    r.fulfill({
      status: 200,
      contentType: 'text/html',
      body: '<!doctype html><html><body><div id="root"></div></body></html>',
    }),
  );
  await page.route('http://stub.invalid/**', (r) =>
    r.fulfill({ status: 200, contentType: 'application/json', body: '{}' }),
  );
  await page.goto('http://probe.local/');
  await page.addStyleTag({ path: join(assets, css) });
  await page.addScriptTag({ content: code });
  await page.evaluate((m) => window.__sewn.mount(m), { card, orient, sizeNames });
  await page.waitForSelector('.tp-sheet');
  await page.waitForTimeout(600);
  return { page, errors };
}

const facts = (page) =>
  page.evaluate(() => ({
    sheets: document.querySelectorAll('.tp-sheet').length,
    clipped: [...document.querySelectorAll('.tp-body')].map((b) => b.scrollHeight - b.clientHeight),
    wide: [...document.querySelectorAll('.tp-body')].map((b) => b.scrollWidth - b.clientWidth),
    tableRows: document.querySelectorAll('[data-label-row]').length,
    noted: [...document.querySelectorAll('[data-label-row]')].filter((r) =>
      /keep the woven edge/.test(r.textContent ?? ''),
    ).length,
    cells: document.querySelectorAll('[data-label-qr-cell]').length,
    noFile: document.querySelectorAll('[data-label-no-file]').length,
    qrPx: [
      ...document.querySelectorAll('[data-label-qr-cell] svg, [data-label-qr-cell] canvas'),
    ].map((q) => q.getBoundingClientRect().width),
    tableOverflow: [...document.querySelectorAll('[data-label-table]')].map(
      (t) => t.scrollWidth - t.clientWidth,
    ),
  }));

function decode(pdf, prefix, sheets) {
  const urls = [];
  execFileSync('pdftoppm', ['-r', '300', '-png', pdf, prefix]);
  const dir = dirname(prefix);
  const pngs = readdirSync(dir)
    .filter((f) => f.startsWith(prefix.split('/').pop()) && f.endsWith('.png'))
    .map((f) => join(dir, f));
  for (const png of pngs) {
    let out = '';
    try {
      out = execFileSync('zbarimg', ['-q', '--raw', '-Sdisable', '-Sqrcode.enable', png], {
        encoding: 'utf8',
      });
    } catch (e) {
      out = e.stdout?.toString() ?? '';
    }
    urls.push(...out.split('\n').filter(Boolean));
  }
  return { urls, pages: pngs.length };
}

// ── A ──
const expectedGolden = [
  ...each('comp', [11, 22], [1, 2, 3, 4, 5], ['22x5']),
  ...each('size', [0], [1, 2, 3, 4, 5]),
  ...each('brand', [0], [0]),
  ...each('patch', [11, 22], [0]),
].map((f) => f.publicUrl.replace(`${SITE}/api/f/`, 'https://admin.beta.grbpwr.com/f/'));

for (const orient of ['land', 'port']) {
  const { page, errors } = await open(GOLDEN, orient, SIZES);
  const f = await facts(page);
  ck(errors.length === 0, `A ${orient}: no page errors`, errors[0]);
  ck(
    f.clipped.every((d) => d <= 1),
    `A ${orient}: nothing clipped by height`,
    f.clipped.join(','),
  );
  ck(
    f.wide.every((d) => d <= 1),
    `A ${orient}: nothing clipped by width`,
    f.wide.join(','),
  );
  ck(
    f.tableOverflow.every((d) => d <= 1),
    `A ${orient}: table fits`,
    f.tableOverflow.join(','),
  );
  ck(f.tableRows === 4, `A ${orient}: 4 table rows`, String(f.tableRows));
  ck(f.noted === 1, `A ${orient}: the label note prints`, String(f.noted));
  ck(
    f.cells === expectedGolden.length,
    `A ${orient}: ${expectedGolden.length} QR`,
    String(f.cells),
  );
  ck(f.noFile === 1, `A ${orient}: one no file`, String(f.noFile));
  ck(
    f.qrPx.length > 0 && f.qrPx.every((w) => (w * 25.4) / 96 >= 17),
    `A ${orient}: QR at least 17 mm`,
    `${((Math.min(...f.qrPx) * 25.4) / 96).toFixed(1)} mm`,
  );
  await page.screenshot({ path: join(OUT, `golden-${orient}.png`), fullPage: true });
  const pdf = join(OUT, `golden-${orient}.pdf`);
  await page.pdf({ path: pdf, preferCSSPageSize: true, printBackground: true });
  const { urls, pages } = decode(pdf, join(OUT, `golden-${orient}-pdf`), f.sheets);
  ck(pages === f.sheets, `A ${orient}: one PDF page per sheet`, `${pages} / ${f.sheets}`);
  const got = new Set(urls);
  const missing = expectedGolden.filter((u) => !got.has(u));
  const stray = [...got].filter((u) => !expectedGolden.includes(u));
  ck(missing.length === 0, `A ${orient}: every QR decodes from the PDF`, missing.join(' '));
  ck(stray.length === 0, `A ${orient}: no QR to anything else`, stray.join(' '));
  await page.close();
}

// ── B ──
for (const orient of ['land', 'port']) {
  const { page, errors } = await open(STRESS, orient, WIDE);
  const f = await facts(page);
  ck(errors.length === 0, `B ${orient}: no page errors`, errors[0]);
  ck(f.sheets > 1, `B ${orient}: flows to next sheets`, String(f.sheets));
  ck(
    f.clipped.every((d) => d <= 1),
    `B ${orient}: nothing clipped by height`,
    f.clipped.join(','),
  );
  ck(
    f.wide.every((d) => d <= 1),
    `B ${orient}: nothing clipped by width`,
    f.wide.join(','),
  );
  ck(f.tableRows === 12, `B ${orient}: 12 table rows`, String(f.tableRows));
  ck(f.noted === 12, `B ${orient}: every label note prints`, String(f.noted));
  ck(f.cells === 84, `B ${orient}: 84 QR`, String(f.cells));
  ck(f.noFile === 84, `B ${orient}: 84 no file`, String(f.noFile));
  await page.screenshot({ path: join(OUT, `stress-${orient}.png`), fullPage: true });
  const pdf = join(OUT, `stress-${orient}.pdf`);
  await page.pdf({ path: pdf, preferCSSPageSize: true, printBackground: true });
  const { pages } = decode(pdf, join(OUT, `stress-${orient}-pdf`), f.sheets);
  ck(pages === f.sheets, `B ${orient}: one PDF page per sheet`, `${pages} / ${f.sheets}`);
  await page.close();
}

await browser.close();
const bad = results.filter((r) => !r).length;
console.log(
  bad ? `RED: ${bad} of ${results.length}` : `GREEN: ${results.length} checks, out ${OUT}`,
);
process.exit(bad ? 1 : 0);
