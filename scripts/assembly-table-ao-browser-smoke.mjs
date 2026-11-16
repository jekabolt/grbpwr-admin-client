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
if (!entry) throw new Error('Playwright is required for the Assembly Order browser smoke.');
const playwright = await import(entry);
const chromium = playwright.chromium ?? playwright.default?.chromium;
if (!chromium) throw new Error('Playwright Chromium is unavailable.');

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = resolve(HERE, '..');
const outfile = resolve(tmpdir(), `assembly-table-ao-browser-smoke-${process.pid}.js`);

await esbuild({
  entryPoints: [resolve(HERE, 'assembly-table-ao-browser-smoke-entry.tsx')],
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
const page = await browser.newPage({ viewport: { width: 900, height: 1000 } });
const pageErrors = [];
page.on('pageerror', (error) => pageErrors.push(String(error)));
await page.route('http://probe.local/**', (route) =>
  route.fulfill({ status: 200, contentType: 'text/html', body: '<div id="root"></div>' }),
);
await page.goto('http://probe.local/');
await page.addStyleTag({ content: css });
await page.addScriptTag({ content: bundle, type: 'module' });
await page.waitForSelector('[data-cad-draft-operations-panel-v1]', { timeout: 15_000 });

const failures = [];
const check = (condition, label, detail = '') => {
  if (!condition) failures.push(`${label}${detail ? `: ${detail}` : ''}`);
  console.log(`${condition ? '  ok  ' : '  FAIL'} ${label}${detail ? ` — ${detail}` : ''}`);
};

console.log('\nASSEMBLY ORDER PANEL BROWSER SMOKE');
const root = page.locator('[data-ao-browser-smoke-root]');
const title = page.locator('[data-cad-current-operation-title]');
check(
  (await title.textContent())?.trim() === 'Join side seams',
  'real selected AO operation renders',
);
check(
  (await page.locator('[data-cad-current-operation-summary]').textContent())?.includes(
    'Front + back',
  ) === true,
  'current operation summary uses supplied AO inputs',
);
check(
  (await page.locator('[data-cad-current-operation-summary]').textContent())?.includes(
    'THREAD_BLACK',
  ) === true,
  'current operation summary renders supplied stitch thread',
);

await page.getByRole('button', { name: 'Next operation' }).click();
check(
  (await root.getAttribute('data-selected-operation-index')) === '1' &&
    (await title.textContent())?.trim() === 'Topstitch side seams',
  'Next operation switches the caller-owned AO selection',
);
check(
  (await page.locator('[data-cad-current-operation-summary]').textContent())?.includes(
    'Body finished',
  ) === true,
  'operation switch refreshes the real AO context',
);

await page.getByRole('button', { name: 'Previous operation' }).click();
check(
  (await root.getAttribute('data-selected-operation-index')) === '0' &&
    (await title.textContent())?.trim() === 'Join side seams',
  'Previous operation returns to the first AO row',
);

const details = page.locator('details[data-cad-operation-details-pane]');
check((await details.getAttribute('open')) === null, 'Operation details starts collapsed');
await page.locator('[data-cad-edit-stitch-field="gauge"]').first().click();
check((await details.getAttribute('open')) !== null, 'stitch edit opens Operation details');
check(
  (await root.getAttribute('data-last-edit-field')) === 'gauge' &&
    (await page
      .locator('[data-ao-editor-focus-field]')
      .getAttribute('data-ao-editor-focus-field')) === 'gauge',
  'stitch edit intent reaches the one caller-owned editor',
);

check(pageErrors.length === 0, 'browser reports no runtime exceptions', pageErrors.join(' | '));

await browser.close();
if (failures.length) {
  console.error(`\n${failures.length} AO browser smoke failure(s):\n- ${failures.join('\n- ')}`);
  process.exit(1);
}
console.log('\nASSEMBLY ORDER PANEL BROWSER SMOKE PASSED');
