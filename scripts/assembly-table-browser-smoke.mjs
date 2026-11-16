#!/usr/bin/env node

import { build as esbuild } from './probe-esbuild.mjs';
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, readdirSync, rmSync } from 'node:fs';
import { createRequire } from 'node:module';
import { homedir, tmpdir } from 'node:os';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

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
if (!entry) throw new Error('Playwright is required for the Assembly Table browser smoke.');
const playwright = await import(entry);
const chromium = playwright.chromium ?? playwright.default?.chromium;
if (!chromium) throw new Error('Playwright Chromium is unavailable.');

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = resolve(HERE, '..');
const outfile = resolve(tmpdir(), `assembly-table-browser-smoke-${process.pid}.js`);

await esbuild({
  entryPoints: [resolve(HERE, 'assembly-table-browser-smoke-entry.tsx')],
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
const page = await browser.newPage({ viewport: { width: 1920, height: 1200 } });
const pageErrors = [];
page.on('pageerror', (error) => pageErrors.push(String(error)));
await page.route('http://probe.local/**', (route) =>
  route.fulfill({ status: 200, contentType: 'text/html', body: '<div id="root"></div>' }),
);
await page.goto('http://probe.local/');
await page.addStyleTag({ content: css });
await page.addScriptTag({ content: bundle, type: 'module' });
await page.waitForSelector('[data-phase-e-multiseam-workbench-v2]', { timeout: 15_000 });
await page.waitForTimeout(250);

const failures = [];
const check = (condition, label, detail = '') => {
  if (!condition) failures.push(`${label}${detail ? `: ${detail}` : ''}`);
  console.log(`${condition ? '  ok  ' : '  FAIL'} ${label}${detail ? ` — ${detail}` : ''}`);
};

console.log('\nASSEMBLY TABLE BROWSER SMOKE');
const splitShell = page.locator('[data-cad-workbench-split-shell-v1]');
check((await splitShell.count()) === 1, 'integrated split shell renders');
check((await page.locator('[data-cad-desktop-zone]').count()) === 1, '2D desktop zone renders');
check((await page.locator('[data-cad-mannequin-zone]').count()) === 1, 'mannequin zone renders');
check(
  (await page.locator('[data-cad-operations-window="docked"]').count()) === 1,
  'Current operation starts docked',
);
check((await page.locator('[data-v2-piece-id]').count()) === 2, 'two exact DXF pieces render');
check(
  (await page.locator('[data-cad-object-sidebar="expanded"]').count()) === 1,
  'fixed object sidebar renders expanded',
);
check(
  (await page.getByRole('navigation', { name: 'Assembly tools' }).count()) === 1,
  '2D tool rail renders',
);

const canvas = page.getByRole('img', {
  name: 'Pattern pieces with bounded seam proposals and session-only table placement',
});
const canvasBox = await canvas.boundingBox();
check(
  Boolean(canvasBox && canvasBox.width > 700 && canvasBox.height > 700),
  'canvas uses the desktop work area',
  canvasBox ? `${Math.round(canvasBox.width)}×${Math.round(canvasBox.height)} px` : 'no box',
);

const layoutSummary = page.locator('[data-cad-layout-menu] > summary');
await layoutSummary.click();
await page.getByRole('button', { name: '2D table', exact: true }).click();
const focusedCanvasBox = await canvas.boundingBox();
check(
  (await page.locator('[data-cad-mannequin-zone]').count()) === 0 &&
    Boolean(focusedCanvasBox && focusedCanvasBox.width > 1200),
  'Layout focus gives the 2D canvas the full work area',
  focusedCanvasBox ? `${Math.round(focusedCanvasBox.width)} px wide` : 'no box',
);
await layoutSummary.click();
await page.getByRole('button', { name: '2D table + mannequin', exact: true }).click();
check(
  (await page.locator('[data-cad-mannequin-zone]').count()) === 1,
  'Layout restores the split mannequin zone',
);

const splitHandle = page.getByRole('button', { name: 'Resize 2D and mannequin zones' });
const splitBeforeHover = await splitHandle.getAttribute('aria-valuenow');
await splitHandle.hover();
check(
  (await splitHandle.getAttribute('aria-valuenow')) === splitBeforeHover,
  'split width does not change on hover',
);
const splitHandleBox = await splitHandle.boundingBox();
if (!splitHandleBox) {
  check(false, 'split resize handle has geometry');
} else {
  const startX = splitHandleBox.x + splitHandleBox.width / 2;
  const startY = splitHandleBox.y + splitHandleBox.height / 2;
  await page.mouse.move(startX, startY);
  await page.mouse.down();
  await page.mouse.move(startX + 140, startY, { steps: 4 });
  await page.mouse.up();
  check(
    Number(await splitHandle.getAttribute('aria-valuenow')) > Number(splitBeforeHover),
    'split width changes only after captured drag',
  );
  check(
    (await splitShell.getAttribute('data-active-drag')) === null,
    'split drag releases cleanly',
  );
}

await page.getByRole('button', { name: 'cm', exact: true }).click();
check(
  (await page.getByRole('button', { name: 'cm', exact: true }).getAttribute('aria-pressed')) ===
    'true',
  'measurement unit control switches to cm',
);

check(
  (await page
    .locator('[data-cad-mannequin-dxf-staging]')
    .getAttribute('data-cad-mannequin-dxf-piece-count')) === '2',
  'model-free mannequin zone stages every exact piece',
);
await page.getByRole('button', { name: 'Focus BACK' }).click();
check(
  (await splitShell.getAttribute('data-selected-piece')) === 'piece-back',
  'mannequin staged-piece selection reaches shared shell state',
);

await page.locator('[data-cad-object-piece="piece-back"]').click();
check(
  (await canvas.getAttribute('data-v2-selected-piece-count')) === '1',
  'sidebar selection reaches canvas',
);
await page.locator('[data-cad-object-piece="piece-front"]').click({ modifiers: ['Shift'] });
check(
  (await canvas.getAttribute('data-v2-selected-piece-count')) === '2',
  'shift-click creates a multi-selection',
);

const zoomBefore = Number(await canvas.getAttribute('data-v2-canvas-zoom'));
await canvas.hover();
await page.mouse.wheel(0, -450);
await page.waitForTimeout(100);
const zoomAfter = Number(await canvas.getAttribute('data-v2-canvas-zoom'));
check(
  zoomAfter > zoomBefore,
  'wheel zoom changes the canvas viewport',
  `${zoomBefore}% → ${zoomAfter}%`,
);

await page.getByRole('button', { name: 'Hide objects sidebar' }).click();
check(
  (await page.locator('[data-cad-object-sidebar="collapsed"]').count()) === 1,
  'object sidebar collapses',
);
await page.getByRole('button', { name: 'Show objects sidebar' }).click();

await page.getByRole('button', { name: 'View options' }).click();
check(
  (await page.locator('[data-v2-view-options]').count()) === 1,
  'view options open contextually',
);
await page.getByRole('button', { name: 'Close view options' }).click();

await page.getByRole('button', { name: 'Collapse Current operation' }).click();
const collapsedOperation = page.locator('[data-cad-operations-window="collapsed"]');
const collapsedOperationBox = await collapsedOperation.boundingBox();
check(
  Boolean(collapsedOperationBox && collapsedOperationBox.width <= 40),
  'Current operation collapses to a thin rail',
);
await page.getByRole('button', { name: 'Expand Current operation' }).click();
check(
  (await page.locator('[data-cad-operations-window="docked"]').count()) === 1,
  'Current operation expands back to docked mode',
);

await page.getByLabel('Measure tools').click();
await page.getByRole('button', { name: 'Measure line' }).click();
const vertexButtons = page.locator('[data-v2-exact-vertex-id]');
await vertexButtons.nth(0).click();
await vertexButtons.nth(1).click();
check(
  (await page.locator('[data-v2-measurement="line"]').count()) === 1,
  'line measurement is created from exact vertices',
);

check(
  pageErrors.length === 0,
  'browser reports no runtime exceptions',
  pageErrors.slice(0, 2).join(' | '),
);

await browser.close();
if (failures.length) {
  console.error(`\n${failures.length} browser smoke failure(s):\n- ${failures.join('\n- ')}`);
  process.exit(1);
}
console.log('\nASSEMBLY TABLE BROWSER SMOKE PASSED');
