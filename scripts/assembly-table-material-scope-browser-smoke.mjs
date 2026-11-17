#!/usr/bin/env node

import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, readdirSync, rmSync } from 'node:fs';
import { createRequire } from 'node:module';
import { homedir, tmpdir } from 'node:os';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { build as esbuild } from './probe-esbuild.mjs';

function resolvePlaywright() {
  const req = createRequire(import.meta.url);
  try {
    return req.resolve('playwright');
  } catch {
    // Fall through to the shared npx cache used by repository browser probes.
  }
  try {
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
  } catch {
    return null;
  }
}

const entry = resolvePlaywright();
if (!entry) throw new Error('Playwright is required for the material-scope browser smoke.');
const playwright = await import(entry);
const chromium = playwright.chromium ?? playwright.default?.chromium;
if (!chromium) throw new Error('Playwright Chromium is unavailable.');

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = resolve(HERE, '..');
const outfile = resolve(tmpdir(), `assembly-table-material-scope-smoke-${process.pid}.js`);

await esbuild({
  entryPoints: [resolve(HERE, 'assembly-table-material-scope-browser-smoke-entry.tsx')],
  bundle: true,
  platform: 'browser',
  format: 'esm',
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
  alias: {
    components: resolve(REPO, 'src/components'),
    lib: resolve(REPO, 'src/lib'),
    api: resolve(REPO, 'src/api'),
    utils: resolve(REPO, 'src/utils'),
    ui: resolve(REPO, 'src/ui'),
    constants: resolve(REPO, 'src/constants'),
    store: resolve(REPO, 'src/store'),
    hooks: resolve(REPO, 'src/hooks'),
  },
});

const bundle = readFileSync(outfile, 'utf8');
rmSync(outfile, { force: true });
const cssName = readdirSync(resolve(REPO, 'dist/assets')).find((name) =>
  /^index-.*\.css$/.test(name),
);
if (!cssName) throw new Error('Production CSS is unavailable; run yarn build:check first.');
const css = readFileSync(resolve(REPO, 'dist/assets', cssName), 'utf8');

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1100, height: 800 } });
const pageErrors = [];
page.on('pageerror', (error) => pageErrors.push(String(error)));
await page.route('http://probe.local/**', (route) =>
  route.fulfill({ status: 200, contentType: 'text/html', body: '<div id="root"></div>' }),
);
await page.goto('http://probe.local/');
await page.addStyleTag({ content: css });
await page.addScriptTag({ content: bundle, type: 'module' });
await page.waitForSelector('[data-material-scope-browser-smoke]', { timeout: 15_000 });

const failures = [];
const check = (condition, label, detail = '') => {
  if (!condition) failures.push(`${label}${detail ? `: ${detail}` : ''}`);
  console.log(`${condition ? '  ok  ' : '  FAIL'} ${label}${detail ? ` — ${detail}` : ''}`);
};

console.log('\nASSEMBLY TABLE MATERIAL-SCOPE BROWSER SMOKE');
const root = page.locator('[data-material-scope-browser-smoke]');
const staging = page.locator('[data-cad-mannequin-dxf-staging]');
check(
  (await root.getAttribute('data-active-scope')) === 'TECH_CARD_BOM_PURPOSE_MAIN',
  'MAIN starts as the active prepared scope',
);
check(
  (await staging.getAttribute('data-cad-mannequin-dxf-piece-count')) === '4',
  'all prepared material scopes remain staged',
);
await page.locator('[data-smoke-edit-active]').click();
await page.locator('[data-smoke-arrange-active]').click();
await page.locator('[data-smoke-topology-active]').click();
check(
  (await root.getAttribute('data-main-session-cursor')) === '1' &&
    (await root.getAttribute('data-main-arrangement-quarter-turns')) === '1' &&
    (await root.getAttribute('data-main-topology-callouts')) === '1',
  'MAIN owns its Draft CAD session, arrangement and topology state',
);
check(
  (await page.locator('[data-cad-mannequin-staged-scope="TECH_CARD_BOM_PURPOSE_MAIN"]').count()) ===
    2 &&
    (await page
      .locator('[data-cad-mannequin-staged-scope="TECH_CARD_BOM_PURPOSE_POCKETING"]')
      .count()) === 1 &&
    (await page
      .locator('[data-cad-mannequin-staged-scope="TECH_CARD_BOM_PURPOSE_LINING"]')
      .count()) === 1,
  'MAIN, POCKETING and LINING preserve their exact piece counts',
);

const materialPicker = page.locator('[data-cad-material-scope-browser] button').first();
check((await materialPicker.count()) === 1, 'prepared material picker renders');
await materialPicker.click();
check(
  (await page.getByRole('option').count()) === 3 &&
    (await page.getByRole('option', { name: 'Lining', exact: true }).count()) === 1,
  'picker exposes only bounded prepared scopes',
);
await page.getByRole('option', { name: 'Pocketing', exact: true }).click();
check(
  (await root.getAttribute('data-active-scope')) === 'TECH_CARD_BOM_PURPOSE_POCKETING' &&
    (await staging.getAttribute('data-cad-mannequin-dxf-active-scope')) ===
      'TECH_CARD_BOM_PURPOSE_POCKETING',
  'switching scope updates the caller-owned active material slot',
);
check(
  (await root.getAttribute('data-pocketing-session-cursor')) === '0' &&
    (await root.getAttribute('data-pocketing-arrangement-quarter-turns')) === '0' &&
    (await root.getAttribute('data-pocketing-topology-callouts')) === '0',
  'POCKETING starts with an independent Draft CAD lifecycle',
);
await page.locator('[data-smoke-edit-active]').click();
await page.locator('[data-smoke-arrange-active]').click();
await page.locator('[data-smoke-topology-active]').click();
check(
  (await root.getAttribute('data-pocketing-session-cursor')) === '1' &&
    (await root.getAttribute('data-pocketing-arrangement-quarter-turns')) === '1' &&
    (await root.getAttribute('data-pocketing-topology-callouts')) === '1',
  'POCKETING edits stay in its own session, arrangement and topology state',
);
check(
  (await staging.getAttribute('data-cad-mannequin-dxf-piece-count')) === '4',
  'switching material scope does not drop staged geometry',
);

await page.getByRole('button', { name: 'Focus PCK_L' }).click();
check(
  (await root.getAttribute('data-selected-scope')) === 'TECH_CARD_BOM_PURPOSE_POCKETING' &&
    (await root.getAttribute('data-selected-piece')) === 'pocket',
  'staged pocket selection retains its material-scope identity',
);

await materialPicker.click();
await page.getByRole('option', { name: 'Lining', exact: true }).click();
check(
  (await root.getAttribute('data-active-scope')) === 'TECH_CARD_BOM_PURPOSE_LINING' &&
    (await root.getAttribute('data-lining-session-cursor')) === '0' &&
    (await root.getAttribute('data-lining-arrangement-quarter-turns')) === '0' &&
    (await root.getAttribute('data-lining-topology-callouts')) === '0',
  'LINING starts with an independent Draft CAD lifecycle',
);
await page.locator('[data-smoke-edit-active]').click();
await page.locator('[data-smoke-arrange-active]').click();
await page.locator('[data-smoke-topology-active]').click();
check(
  (await root.getAttribute('data-lining-session-cursor')) === '1' &&
    (await root.getAttribute('data-lining-arrangement-quarter-turns')) === '1' &&
    (await root.getAttribute('data-lining-topology-callouts')) === '1',
  'LINING edits stay in its own session, arrangement and topology state',
);

await materialPicker.click();
await page.getByRole('option', { name: 'Main', exact: true }).click();
check(
  (await root.getAttribute('data-active-scope')) === 'TECH_CARD_BOM_PURPOSE_MAIN' &&
    (await staging.getAttribute('data-cad-mannequin-dxf-piece-count')) === '4',
  'returning to MAIN preserves the all-scope staging set',
);
check(
  (await root.getAttribute('data-main-session-cursor')) === '1' &&
    (await root.getAttribute('data-main-arrangement-quarter-turns')) === '1' &&
    (await root.getAttribute('data-main-topology-callouts')) === '1' &&
    (await root.getAttribute('data-pocketing-session-cursor')) === '1' &&
    (await root.getAttribute('data-pocketing-arrangement-quarter-turns')) === '1' &&
    (await root.getAttribute('data-pocketing-topology-callouts')) === '1' &&
    (await root.getAttribute('data-lining-session-cursor')) === '1' &&
    (await root.getAttribute('data-lining-arrangement-quarter-turns')) === '1' &&
    (await root.getAttribute('data-lining-topology-callouts')) === '1',
  'MAIN, POCKETING and LINING caller-owned Draft CAD state survives switching without transfer',
);
await page.locator('[data-smoke-compile-secondary]').click();
check(
  (await root.getAttribute('data-compiled-review-scope')) === 'TECH_CARD_BOM_PURPOSE_LINING' &&
    (await root.getAttribute('data-compiled-review-file')) ===
      'TECH_CARD_BOM_PURPOSE_LINING-cad-compiled.dxf',
  'secondary saved scope compile opens the existing pattern import review route',
);
check(pageErrors.length === 0, 'browser reports no runtime exceptions', pageErrors.join(' | '));

await browser.close();
if (failures.length) {
  console.error(
    `\n${failures.length} material-scope smoke failure(s):\n- ${failures.join('\n- ')}`,
  );
  process.exit(1);
}
console.log('\nASSEMBLY TABLE MATERIAL-SCOPE BROWSER SMOKE PASSED');
