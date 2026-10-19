#!/usr/bin/env node
// UI half of the PROD RUN: the proposal panel, the schematic and the print sheets of chosen cards,
// rendered from what prod-run.mjs wrote (<code>.stand.json, <code>-route.svg, <code>-map.svg).
// Headless chromium (playwright, as ui-probe.mjs), the built admin CSS (`yarn build` once).
//
//   node scripts/assembly-skeleton/prod-run-ui.mjs <code> [<code> …] [--out <dir>]
import { build as esbuild } from 'esbuild';
import { execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { homedir, tmpdir } from 'node:os';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = resolve(HERE, '../..');
const args = process.argv.slice(2);
const OUT = resolve(
  args.includes('--out')
    ? args[args.indexOf('--out') + 1]
    : resolve(REPO, '../tmp/plans/assembly-from-pattern/prod-run'),
);
const codes = args.filter((a, i) => !a.startsWith('--') && args[i - 1] !== '--out');

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
  console.log('playwright not found');
  process.exit(1);
}
const mod = await import(pw);
const chromium = mod.chromium ?? mod.default?.chromium;

const outfile = resolve(tmpdir(), `prod-run-ui-${process.pid}.js`);
await esbuild({
  entryPoints: [resolve(HERE, 'prod-run-ui-entry.tsx')],
  bundle: true,
  platform: 'browser',
  format: 'iife',
  target: 'es2020',
  outfile,
  logLevel: 'warning',
  absWorkingDir: REPO,
  jsx: 'automatic',
  loader: { '.svg': 'text', '.png': 'dataurl', '.woff2': 'dataurl' },
  define: {
    'import.meta.env.VITE_SERVER_URL': '"http://stub.invalid"',
    'import.meta.env': '{"VITE_SERVER_URL":"http://stub.invalid","MODE":"production"}',
    'process.env.NODE_ENV': '"production"',
  },
  alias: Object.fromEntries(
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
    ].map((a) => [a, resolve(REPO, 'src', a)]),
  ),
});
const bundle = readFileSync(outfile, 'utf8');
let css = '';
try {
  const dir = resolve(REPO, 'dist/assets');
  const name = readdirSync(dir).find((f) => /^index-.*\.css$/.test(f));
  if (name) css = readFileSync(resolve(dir, name), 'utf8');
} catch {
  /* no build */
}
if (!css) console.log('note: dist CSS missing — screenshots are unstyled (run `yarn build`)');

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1440, height: 1800 } });
const errors = [];
page.on('pageerror', (e) => errors.push(String(e)));
await page.route('http://probe.local/**', (route) =>
  route.fulfill({
    status: 200,
    contentType: 'text/html',
    body: `<!doctype html><html><head><style>${css}</style></head><body class="bg-pageBg"><div id="root"></div></body></html>`,
  }),
);
await page.route('http://stub.invalid/**', (route) =>
  route.fulfill({ status: 200, contentType: 'application/json', body: '{"works":[]}' }),
);

const shot = async (name, el) => {
  const path = resolve(OUT, `${name}.png`);
  if (el) await page.locator(el).first().screenshot({ path });
  else await page.screenshot({ path, fullPage: true });
  console.log(`  shot → ${path}`);
};

for (const code of codes) {
  const safe = code.replace(/[^\w.~-]+/g, '_');
  const standFile = resolve(OUT, `${safe}.stand.json`);
  if (!existsSync(standFile)) {
    console.log(`${code}: no stand file (run prod-run.mjs first)`);
    continue;
  }
  const stand = JSON.parse(readFileSync(standFile, 'utf8'));
  console.log(`\n${code}`);
  await page.goto('http://probe.local/');
  await page.addScriptTag({ content: bundle });
  const t0 = Date.now();
  await page.evaluate((c) => window.__pr.mount(c), stand);
  await page.waitForSelector('[data-skeleton-door]', { timeout: 30000 });
  // the card's own unit pictures settle (400 ms + idle)
  await page.waitForTimeout(2500);
  const ops0 = await page.evaluate(() => window.__pr.ops());
  const glyphs = await page.locator('section svg[role="img"][aria-label*=" pieces · "]').count();
  console.log(`  form steps ${ops0}; unit glyphs on the schematic ${glyphs}`);
  await shot(`${safe}-schematic`, '[data-stand-section]');

  // ASSEMBLY MAP (the card's own order): STEP on the first machine step, on a join with read
  // edges, on a join with none; then PIECES
  if (await page.locator('[data-assembly-map]').count()) {
    const list = page.locator('[aria-label="sequence view"] [role="radio"]', { hasText: 'list' });
    if (await list.count()) await list.first().click();
    await page.waitForTimeout(300);
    await shot(`${safe}-map-step-first`, '[data-stand-map]');
    const pickOf = stand.mapPick ?? { withEdges: [], unread: [] };
    const showStep = async (i, tag) => {
      const row = page.locator(`[data-rail-step="${i}"]`);
      if (!(await row.count())) return console.log(`  map: no rail row ${i}`);
      await row.first().click();
      // the pointer off the rail: hover beats the sticky pick, and a re-layout can put another
      // row under a resting pointer
      await page.mouse.move(2, 2);
      await page.waitForTimeout(250);
      const shown = await page
        .locator('[data-map-step]')
        .first()
        .getAttribute('data-map-step')
        .catch(() => null);
      if (shown != null && Number(shown) !== i) console.log(`  map shows step index ${shown}, picked ${i}`);
      const facts = await page.locator('[data-map-facts]').allInnerTexts();
      const sides = await page.locator('[data-map-pair] [data-map-side]').count();
      console.log(
        `  map STEP ${(i + 1) * 10} (${tag}): sides ${sides}; facts «${facts.join(' / ').replace(/\s+/g, ' ').slice(0, 220)}»`,
      );
      await shot(`${safe}-map-step-${tag}`, '[data-stand-map]');
    };
    const w = pickOf.withEdges;
    if (w.length) await showStep(w[Math.floor(w.length / 2)], 'read');
    if (pickOf.unread.length) await showStep(pickOf.unread[0], 'unread');
    const pv = page.locator('[aria-label="assembly map view"] [role="radio"]', {
      hasText: 'pieces',
    });
    if (await pv.count()) {
      await pv.first().click();
      await page.waitForTimeout(400);
      const fam = await page.locator('[data-map-family]').count();
      const nums = await page.locator('[data-map-number]').count();
      console.log(`  map PIECES: ${fam} families, ${nums} edge numbers`);
      await shot(`${safe}-map-pieces`, '[data-stand-map]');
      const sv = page.locator('[aria-label="assembly map view"] [role="radio"]', {
        hasText: 'step',
      });
      if (await sv.count()) await sv.first().click();
    }
  } else console.log('  no assembly map on the stand');

  const door = page.locator('[data-skeleton-door="header"]');
  if (!(await door.count()) || !(await door.isEnabled())) {
    const why = await page.locator('[data-skeleton-why]').allInnerTexts();
    console.log(`  door shut: ${why.join(' / ')}`);
    continue;
  }
  await door.click();
  await page.waitForSelector(
    '[data-skeleton-step="0"], [data-skeleton-state="error"], [data-skeleton-modes="unchosen"]',
    { timeout: 30000 },
  );
  console.log(`  panel ready in ${Date.now() - t0} ms (incl. mount)`);
  const applyAll = page.locator('[data-skeleton-apply-all]');
  const report = async (tag) => {
    const headText = await page
      .locator('[data-skeleton-to-decide]')
      .first()
      .innerText()
      .catch(() => '');
    const n = await page.locator('[data-skeleton-step]').count();
    const viol = await page.locator('[data-skeleton-violation]').count();
    const outPics = await page.locator('[data-skeleton-unit] svg[role="img"]').count();
    const inPics = await page.locator('[data-skeleton-unit-input] svg[role="img"]').count();
    const applyEnabled = (await applyAll.count()) ? await applyAll.isEnabled() : null;
    const gaps = await page.locator('[data-skeleton-gaps]').allInnerTexts();
    const nothing = await page.locator('[data-skeleton-nothing-to-add]').allInnerTexts();
    console.log(
      `  [${tag}] header «${headText.replace(/\s+/g, ' ')}»; rows ${n}; violations ${viol}; unit pics out ${outPics} / in ${inPics}; apply-all enabled ${applyEnabled} («${((await applyAll.innerText().catch(() => '')) || '').trim()}»)`,
    );
    if (nothing.length) console.log(`  [${tag}] ${nothing.join(' ').replace(/\s+/g, ' ')}`);
    if (gaps.length) console.log(`  [${tag}] gaps: ${gaps.join(' / ').replace(/\s+/g, ' ')}`);
    for (const t of (await page.locator('[data-skeleton-violation]').allInnerTexts()).slice(0, 4))
      console.log(`    ! ${t}`);
    for (const w of (await page.locator('[data-skeleton-warning]').allInnerTexts()).slice(0, 6))
      console.log(`    · ${w}`);
  };
  const scrolledShot = async (name) => {
    await shot(name, '[data-skeleton-panel]');
    const full = await page.evaluate(() => {
      const p = document.querySelector('[data-skeleton-panel]');
      const sc =
        p &&
        [...p.querySelectorAll('*')].find(
          (e) =>
            e.scrollHeight > e.clientHeight + 20 && getComputedStyle(e).overflowY !== 'visible',
        );
      if (!sc) return null;
      const r = { h: sc.scrollHeight, c: sc.clientHeight };
      sc.scrollTop = sc.scrollHeight;
      return r;
    });
    if (full) {
      console.log(`  panel list scrolls: ${full.h}px content in ${full.c}px`);
      await shot(`${name}-end`, '[data-skeleton-panel]');
      await page.evaluate(() => {
        const p = document.querySelector('[data-skeleton-panel]');
        for (const e of p.querySelectorAll('*')) e.scrollTop = 0;
      });
    }
  };
  if (await page.locator('[data-skeleton-modes="unchosen"]').count()) {
    console.log(`  the card has steps: the panel asks add / replace first`);
    await shot(`${safe}-panel-choice`, '[data-skeleton-panel]');
    for (const mode of ['append', 'replace']) {
      await page.click(`[data-skeleton-mode="${mode}"]`);
      await page.waitForSelector('[data-skeleton-step="0"], [data-skeleton-nothing-to-add]', {
        timeout: 30000,
      });
      await page.waitForTimeout(400);
      await report(mode);
      await scrolledShot(`${safe}-panel-${mode}`);
    }
  } else {
    await report('fresh');
    await scrolledShot(`${safe}-panel`);
  }
  await page.keyboard.press('Escape');
  await page.waitForTimeout(300);
  const ops1 = await page.evaluate(() => window.__pr.ops());
  console.log(
    `  after look+close: form steps ${ops1} (was ${ops0}); autosave asked ${(await page.evaluate(() => window.__pr.requests())).length}`,
  );
}

// print sheets: the SVG files typeset by paper.ts, opened as they are
for (const code of codes) {
  const safe = code.replace(/[^\w.~-]+/g, '_');
  for (const form of ['route', 'map', 'seams']) {
    const f = resolve(OUT, `${safe}-${form}.svg`);
    if (!existsSync(f)) continue;
    const svg = readFileSync(f, 'utf8');
    await page.setContent(
      `<!doctype html><html><body style="margin:0;background:#fff">${svg}</body></html>`,
    );
    await page.waitForTimeout(200);
    await page.screenshot({ path: resolve(OUT, `${safe}-print-${form}.png`), fullPage: true });
    console.log(`  print ${form} → ${resolve(OUT, `${safe}-print-${form}.png`)}`);
  }
}
console.log(errors.length ? `\npage errors:\n${errors.join('\n')}` : '\nno page errors');
await browser.close();
