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
if (!entry) throw new Error('Playwright is required for the Assembly Table mannequin smoke.');
const playwright = await import(entry);
const chromium = playwright.chromium ?? playwright.default?.chromium;
if (!chromium) throw new Error('Playwright Chromium is unavailable.');

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = resolve(HERE, '..');
const outfile = resolve(tmpdir(), `assembly-table-mannequin-browser-smoke-${process.pid}.js`);

await esbuild({
  entryPoints: [resolve(HERE, 'assembly-table-mannequin-browser-smoke-entry.tsx')],
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
const page = await browser.newPage({ viewport: { width: 1200, height: 1000 } });
const pageErrors = [];
page.on('pageerror', (error) => pageErrors.push(String(error)));
await page.route('http://probe.local/**', (route) =>
  route.fulfill({ status: 200, contentType: 'text/html', body: '<div id="root"></div>' }),
);
await page.goto('http://probe.local/');
await page.addStyleTag({ content: css });
await page.addScriptTag({ content: bundle, type: 'module' });
await page.waitForSelector('[data-cad-mannequin-model-picker]', { timeout: 20_000 });

const failures = [];
const check = (condition, label, detail = '') => {
  if (!condition) failures.push(`${label}${detail ? `: ${detail}` : ''}`);
  console.log(`${condition ? '  ok  ' : '  FAIL'} ${label}${detail ? ` — ${detail}` : ''}`);
};

console.log('\nASSEMBLY TABLE MANNEQUIN BROWSER SMOKE');
const root = page.locator('[data-mannequin-browser-smoke-root]');
const picker = page.locator('[data-cad-mannequin-model-picker]');
check(
  (await picker.getAttribute('data-cad-mannequin-model-state')) === 'empty',
  'model picker starts in the honest no-model state',
);
check(
  (await page
    .locator('[data-cad-mannequin-unbound-pattern-stage]')
    .getAttribute('data-cad-mannequin-unbound-pattern-count')) === '2',
  'all exact DXF pieces remain staged before model selection',
);
check(
  (await picker.getAttribute('data-cad-mannequin-scene-overlay-edge-count')) === '2' &&
    (await picker.getAttribute('data-cad-mannequin-scene-overlay-thread-count')) === '1',
  'exact seam edges and sewing thread guides are exposed',
);
check(
  (await picker.getAttribute('data-cad-mannequin-scene-overlay-threads')) ===
    'side-seam:THREAD_BLACK:#111111',
  'thread overlay reuses the bounded BOM line and colour',
);

await page.getByRole('button', { name: 'FRONT', exact: true }).click();
check(
  (await root.getAttribute('data-selected-piece-id')) === 'front' &&
    (await page
      .locator('[data-cad-mannequin-unbound-pattern-piece]')
      .first()
      .getAttribute('data-selected')) === 'true',
  'staged pattern selection reaches the caller-owned scene selection',
);

const modelPicker = page.getByRole('combobox').first();
await modelPicker.click();
await page.getByRole('option', { name: /Vera/ }).click();
await page.waitForSelector('[data-cad-mannequin-model-state="selected"]', { timeout: 10_000 });
check(
  (await root.getAttribute('data-selected-model-id')) === '1',
  'real model picker selects the saved measurement model',
);

const poseToggle = page.locator('[data-cad-mannequin-change-pose]');
await poseToggle.waitFor({ state: 'visible', timeout: 20_000 });
check((await poseToggle.count()) === 1, 'one Change pose checkbox is exposed');
check(
  (await page
    .getByRole('button', { name: /A-REST|RELAXED|NEAR-T|RELAX ARMS|RAISE ARMS/ })
    .count()) === 0,
  'legacy pose and arm button groups stay hidden',
);
await page.waitForFunction(
  () => !(document.querySelector('[data-cad-mannequin-change-pose]')?.disabled ?? true),
  null,
  { timeout: 20_000 },
);
await poseToggle.check();
check(await poseToggle.isChecked(), 'Change pose checkbox enables direct viewport posing');

await page.getByRole('button', { name: 'side', exact: true }).click();
check(
  (await page.getByRole('button', { name: 'side', exact: true }).getAttribute('aria-pressed')) ===
    'true',
  'mannequin view toolbar changes the existing renderer preset',
);
check(pageErrors.length === 0, 'browser reports no runtime exceptions', pageErrors.join(' | '));

await browser.close();
if (failures.length) {
  console.error(`\n${failures.length} mannequin smoke failure(s):\n- ${failures.join('\n- ')}`);
  process.exit(1);
}
console.log('\nASSEMBLY TABLE MANNEQUIN BROWSER SMOKE PASSED');
