#!/usr/bin/env node

import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, rmSync } from 'node:fs';
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
if (!entry) throw new Error('Playwright is required for the Patterns reimport browser smoke.');
const playwright = await import(entry);
const chromium = playwright.chromium ?? playwright.default?.chromium;
if (!chromium) throw new Error('Playwright Chromium is unavailable.');

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = resolve(HERE, '..');
const outfile = resolve(tmpdir(), `assembly-table-patterns-reimport-smoke-${process.pid}.js`);

await esbuild({
  entryPoints: [resolve(HERE, 'assembly-table-patterns-reimport-browser-smoke-entry.tsx')],
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
    'import.meta.env': JSON.stringify({
      VITE_SERVER_URL: 'http://stub.invalid',
      VITE_PATTERN_IMPORT_STUB: '1',
      VITE_PATTERN_IMPORT_AI: 'stub',
      DEV: true,
      MODE: 'test',
    }),
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

const browser = await chromium.launch({
  args: ['--disable-gpu', '--disable-software-rasterizer', '--disable-webgl'],
});
try {
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  const pageErrors = [];
  const requestsAfterHandoff = [];
  let handoffStarted = false;
  page.on('pageerror', (error) => pageErrors.push(String(error)));
  page.on('request', (request) => {
    if (handoffStarted) requestsAfterHandoff.push(`${request.method()} ${request.url()}`);
  });
  await page.route('http://probe.local/**', (route) =>
    route.fulfill({ status: 200, contentType: 'text/html', body: '<div id="root"></div>' }),
  );
  await page.route('http://stub.invalid/**', (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: '{}' }),
  );
  await page.goto('http://probe.local/');
  await page.addScriptTag({ content: bundle, type: 'module' });

  const root = page.locator('[data-patterns-reimport-smoke]');
  await root.waitFor({ timeout: 20_000 });
  await page.waitForFunction(
    () =>
      document
        .querySelector('[data-patterns-reimport-smoke]')
        ?.getAttribute('data-owner-available') === 'true',
    undefined,
    { timeout: 20_000 },
  );
  await page.waitForLoadState('networkidle');

  const failures = [];
  const check = (condition, label, detail = '') => {
    if (!condition) failures.push(`${label}${detail ? `: ${detail}` : ''}`);
    console.log(`${condition ? '  ok  ' : '  FAIL'} ${label}${detail ? ` — ${detail}` : ''}`);
  };

  console.log('\nASSEMBLY TABLE REAL PATTERNS REIMPORT SMOKE');
  check(
    (await root.getAttribute('data-owner-available')) === 'true',
    'production PatternsField registers the compiled-reimport owner',
  );
  handoffStarted = true;
  await page.locator('[data-open-compiled-lining-review]').click();
  const wizard = page.getByTestId('pattern-import-wizard');
  await wizard.waitFor({ timeout: 20_000 });
  await page.waitForTimeout(250);

  check(
    (await root.getAttribute('data-handoff-status')) === 'review-opened',
    'secondary saved scope handoff opens review',
  );
  check(
    (await wizard.getAttribute('data-initial-scope-key')) === 'TECH_CARD_BOM_PURPOSE_LINING',
    'real ImportWizard receives the exact LINING scope',
  );
  check(
    (await wizard.getAttribute('data-initial-file-count')) === '1' &&
      (await wizard
        .getByText('TECH_CARD_BOM_PURPOSE_LINING-cad-compiled.dxf', { exact: true })
        .count()) >= 1,
    'real ImportWizard receives the compiled DXF File',
  );
  check(
    (await wizard.getAttribute('data-step')) === 'files',
    'compiled output stops at review before apply',
  );
  check(
    (await root.getAttribute('data-pattern-count')) === '0' &&
      (await root.getAttribute('data-alias-count')) === '0',
    'opening review does not mutate card patterns or aliases',
  );
  check(
    requestsAfterHandoff.length === 0,
    'opening review performs no network request',
    requestsAfterHandoff.join(' | '),
  );
  check(pageErrors.length === 0, 'browser reports no runtime exceptions', pageErrors.join(' | '));

  if (failures.length) {
    throw new Error(
      `\n${failures.length} Patterns reimport smoke failure(s):\n- ${failures.join('\n- ')}`,
    );
  }
  console.log('\nASSEMBLY TABLE REAL PATTERNS REIMPORT SMOKE PASSED');
} finally {
  await browser.close();
}
