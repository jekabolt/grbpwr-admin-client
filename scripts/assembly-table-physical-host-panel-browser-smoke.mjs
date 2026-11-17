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
if (!entry) throw new Error('Playwright is required for the physical-host layout smoke.');
const playwright = await import(entry);
const chromium = playwright.chromium ?? playwright.default?.chromium;
if (!chromium) throw new Error('Playwright Chromium is unavailable.');

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = resolve(HERE, '..');
const outfile = resolve(tmpdir(), `assembly-table-physical-host-panel-${process.pid}.js`);

await esbuild({
  entryPoints: [resolve(HERE, 'assembly-table-physical-host-panel-browser-smoke-entry.tsx')],
  bundle: true,
  platform: 'browser',
  format: 'esm',
  target: 'es2020',
  outfile,
  logLevel: 'warning',
  absWorkingDir: REPO,
  jsx: 'automatic',
  define: { 'process.env.NODE_ENV': '"production"' },
  alias: {
    components: resolve(REPO, 'src/components'),
    lib: resolve(REPO, 'src/lib'),
    api: resolve(REPO, 'src/api'),
    utils: resolve(REPO, 'src/utils'),
    ui: resolve(REPO, 'src/ui'),
    constants: resolve(REPO, 'src/constants'),
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
await page.waitForSelector('[data-physical-host-layout-smoke]', { timeout: 15_000 });

const metrics = await page.evaluate(() => {
  const root = document.querySelector('[data-physical-host-layout-smoke]');
  const viewport = document.querySelector('[data-physical-host-mannequin-viewport]');
  const panel = document.querySelector('[data-cad-physical-host-panel]');
  const action = document.querySelector('[data-physical-host-bottom-action]');
  if (!(root instanceof HTMLElement)) throw new Error('Layout root is missing.');
  if (!(viewport instanceof HTMLElement)) throw new Error('Mannequin viewport is missing.');
  if (!(panel instanceof HTMLElement)) throw new Error('Physical panel is missing.');
  if (!(action instanceof HTMLElement)) throw new Error('Bottom authoring action is missing.');
  const beforePanel = panel.getBoundingClientRect();
  const beforeAction = action.getBoundingClientRect();
  panel.scrollTop = panel.scrollHeight;
  const afterPanel = panel.getBoundingClientRect();
  const afterAction = action.getBoundingClientRect();
  return {
    rootHeight: root.getBoundingClientRect().height,
    viewportHeight: viewport.getBoundingClientRect().height,
    panelHeight: panel.clientHeight,
    panelScrollHeight: panel.scrollHeight,
    panelScrollTop: panel.scrollTop,
    actionInitiallyBelowPanel: beforeAction.bottom > beforePanel.bottom,
    actionReachable:
      afterAction.top >= afterPanel.top - 1 && afterAction.bottom <= afterPanel.bottom + 1,
  };
});

const checks = [
  [metrics.rootHeight === 720, 'ordinary workbench pane keeps its requested height'],
  [metrics.viewportHeight >= 300, 'mannequin viewport retains useful visible height'],
  [metrics.panelHeight <= metrics.rootHeight * 0.51, 'physical controls use at most half the pane'],
  [metrics.panelScrollHeight > metrics.panelHeight, 'open authoring controls scroll internally'],
  [
    metrics.actionInitiallyBelowPanel,
    'bottom action starts inside the overflowed authoring content',
  ],
  [
    metrics.panelScrollTop > 0 && metrics.actionReachable,
    'bottom action is reachable after scrolling',
  ],
  [pageErrors.length === 0, 'browser reports no runtime exceptions'],
];

console.log('\nASSEMBLY TABLE PHYSICAL-HOST PANEL BROWSER SMOKE');
const failures = [];
for (const [ok, label] of checks) {
  console.log(`${ok ? '  ok  ' : '  FAIL'} ${label}`);
  if (!ok) failures.push(label);
}
await browser.close();
if (failures.length)
  throw new Error(
    `${failures.length} physical-host layout check(s) failed: ${failures.join(', ')}`,
  );
console.log('\nASSEMBLY TABLE PHYSICAL-HOST PANEL BROWSER SMOKE PASSED');
