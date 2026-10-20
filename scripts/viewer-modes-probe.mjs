#!/usr/bin/env node
// УТВЕРЖДАЕТ «один просмотрщик» (viewer-unify, мокап https://claude.ai/artifact/1PhkQ7Z6DSxXdapBBur5z3):
//
//   П1 — на телефоне полоса внизу ОДНА: adjust · crop · draw · info · more;
//   П2 — режим открывает панель ПОД снимком (снимок ужимается, ничего не висит поверх кадра), а
//        сверху `cancel · <режим> · save`; adjust — три чипа, один большой ползунок и reset;
//        draw — точки цвета, thin/thick, undo/clear; crop — чипы crop | expand и пропорции;
//   П3 — `cancel` возвращает просмотр; плавающей панели зума/пера на телефоне нет;
//   П4 — `save` при двери `onReplace` спрашивает replace here / save copy, и `replace here` отдаёт
//        хозяину запечённые байты;
//   П5 — десктоп: режимы — кнопки наверху, панель режима справа от снимка, как details;
//   П6 — окно указаний вложений задачи — тот же просмотрщик в режиме `callouts`.
//
//   node scripts/viewer-modes-probe.mjs                 (нужен `yarn build` — берётся его CSS)
//   node scripts/viewer-modes-probe.mjs --shots=<dir>   ещё и снимки экрана в каталог

import { build as esbuild } from 'esbuild';
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readdirSync, readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { homedir, tmpdir } from 'node:os';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { deflateSync } from 'node:zlib';

const SHOTS = (process.argv.find((a) => a.startsWith('--shots=')) ?? '').split('=')[1] ?? '';
if (SHOTS) mkdirSync(SHOTS, { recursive: true });

function resolvePlaywright() {
  const require = createRequire(import.meta.url);
  try {
    return require.resolve('playwright');
  } catch {}
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
const pw = resolvePlaywright();
if (!pw) {
  console.log('playwright не найден — проба пропущена (это не отказ)');
  process.exit(0);
}
const mod = await import(pw);
const chromium = mod.chromium ?? mod.default?.chromium;
if (!chromium) {
  console.log('playwright найден, но без chromium — проба пропущена');
  process.exit(0);
}

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = resolve(HERE, '..');
let cssName;
try {
  cssName = readdirSync(resolve(REPO, 'dist/assets')).find((f) => /^index-.*\.css$/.test(f));
} catch {}
if (!cssName) {
  console.log('НЕ ЗАПУСКАЛАСЬ: нет dist/assets/index-*.css — сначала `yarn build`');
  process.exit(2);
}
const CSS = readFileSync(resolve(REPO, 'dist/assets', cssName), 'utf8');

const outfile = resolve(tmpdir(), `viewer-modes-${process.pid}.js`);
await esbuild({
  entryPoints: [resolve(HERE, 'viewer-modes-probe-entry.tsx')],
  bundle: true,
  platform: 'browser',
  format: 'iife',
  target: 'es2020',
  outfile,
  logLevel: 'warning',
  absWorkingDir: REPO,
  jsx: 'automatic',
  loader: { '.svg': 'text', '.png': 'dataurl', '.woff2': 'dataurl', '.css': 'empty' },
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
// Свой CSS у редактора кадра — отдельным файлом рядом (esbuild выше его пропускает).
const FRAME_CSS = readFileSync(
  resolve(REPO, 'src/components/shared/media-viewer/frame-editor.css'),
  'utf8',
);

// 800×1000 градиент — снимок 4:5, по которому видно, где он кончается.
function png(w, h) {
  const raw = Buffer.alloc((w * 3 + 1) * h);
  for (let y = 0; y < h; y++) {
    raw[y * (w * 3 + 1)] = 0;
    for (let x = 0; x < w; x++) {
      const o = y * (w * 3 + 1) + 1 + x * 3;
      raw[o] = (x * 255) / w;
      raw[o + 1] = (y * 255) / h;
      raw[o + 2] = 160;
    }
  }
  const crcT = Array.from({ length: 256 }, (_, n) => {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    return c >>> 0;
  });
  const crc = (b) => {
    let c = 0xffffffff;
    for (const x of b) c = crcT[(c ^ x) & 0xff] ^ (c >>> 8);
    return (c ^ 0xffffffff) >>> 0;
  };
  const chunk = (type, data) => {
    const len = Buffer.alloc(4);
    len.writeUInt32BE(data.length);
    const td = Buffer.concat([Buffer.from(type), data]);
    const c = Buffer.alloc(4);
    c.writeUInt32BE(crc(td));
    return Buffer.concat([len, td, c]);
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0);
  ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8;
  ihdr[9] = 2;
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw)),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}
const PNG = png(800, 1000);

let bad = 0;
const ck = (ok, what, d = '') => {
  if (!ok) bad++;
  console.log(`${ok ? '  ok  ' : '  FAIL'} ${what}${d ? `  — ${d}` : ''}`);
};
const head = (s) => console.log(`\n${s}`);

const browser = await chromium.launch();
async function stand(viewport, mobile) {
  const page = await browser.newPage({ viewport, isMobile: mobile, hasTouch: mobile });
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  await page.route('**/*', (route) => {
    const url = route.request().url();
    // До страницы: `/media-proxy?url=…cdn.example…` живёт на том же origin.
    if (url.includes('cdn.example')) {
      return route.fulfill({
        status: 200,
        contentType: 'image/png',
        body: PNG,
        headers: { 'access-control-allow-origin': '*' },
      });
    }
    if (url.startsWith('http://probe.local')) {
      return route.fulfill({
        status: 200,
        contentType: 'text/html',
        body: '<meta name="viewport" content="width=device-width, initial-scale=1"><div id="root"></div>',
      });
    }
    return route.fulfill({ status: 200, contentType: 'application/json', body: '{}' });
  });
  await page.goto('http://probe.local/');
  await page.addStyleTag({ content: CSS + FRAME_CSS });
  await page.addScriptTag({ content: bundle });
  return { page, errors };
}
const shot = async (page, name) => {
  if (SHOTS) await page.screenshot({ path: `${SHOTS}/${name}.png` });
};
const rect = (page, sel) =>
  page.$eval(sel, (el) => {
    const r = el.getBoundingClientRect();
    return { top: r.top, bottom: r.bottom, left: r.left, right: r.right };
  });
const mode = (page) =>
  page.$eval('[data-media-viewer]', (el) => el.getAttribute('data-viewer-mode'));
const words = (page, sel) =>
  page.$$eval(sel, (els) => els.map((e) => (e.textContent ?? '').trim().toLowerCase()));

// ─── ТЕЛЕФОН ────────────────────────────────────────────────────────────────────────────────
{
  head('телефон 390×844');
  const { page, errors } = await stand({ width: 390, height: 844 }, true);
  await page.evaluate(() => window.__viewer.mountViewer({ slot: true }));
  await page.waitForSelector('[data-probe=viewer-image]');
  await page.waitForTimeout(300);
  await shot(page, 'phone-1-view');

  const strip = await words(page, '[role=toolbar][aria-label="Media tools"] button');
  ck(strip.join(' · ') === 'adjust · crop · draw · info · more', 'П1 полоса', strip.join(' · '));

  await page.click('[role=toolbar] button:has-text("adjust")');
  await page.waitForSelector('[data-probe=viewer-mode-panel]');
  await page.waitForTimeout(300);
  await shot(page, 'phone-2-adjust');
  ck((await mode(page)) === 'adjust', 'П2 adjust открыт');
  const img = await rect(page, '[data-probe=viewer-image]');
  const panel = await rect(page, '[data-probe=viewer-mode-panel]');
  ck(
    img.bottom <= panel.top + 1,
    'П2 снимок над панелью, не под ней',
    `img ${img.bottom | 0} / panel ${panel.top | 0}`,
  );
  const top = await words(page, '[data-media-viewer] button');
  ck(top.includes('cancel') && top.includes('save'), 'П2 cancel · save наверху');
  const chips = await page.$$eval('[data-probe=viewer-mode-panel] [role=radio]', (e) => e.length);
  const sliders = await page.$$eval(
    '[data-probe=viewer-mode-panel] input[type=range]',
    (e) => e.length,
  );
  ck(chips === 3 && sliders === 1, 'П2 adjust: 3 чипа и один ползунок', `${chips} / ${sliders}`);
  ck(!!(await page.$('[data-probe=adjust-reset]')), 'П2 adjust: reset');

  await page.click('button:has-text("cancel")');
  ck((await mode(page)) === 'view', 'П3 cancel → просмотр');

  await page.click('[role=toolbar] button:has-text("crop")');
  await page.waitForSelector('[data-probe=viewer-mode-panel]');
  await page.waitForTimeout(600);
  await shot(page, 'phone-3-crop');
  ck((await mode(page)) === 'frame', 'П2 crop открыт');
  const frameWords = await words(page, '[data-probe=viewer-mode-panel] button');
  ck(
    ['crop', 'expand', 'free', '3:4', '4:5', '1:1'].every((w) => frameWords.includes(w)),
    'П2 crop: crop | expand и пропорции',
    frameWords.join(' '),
  );
  await page.click('[data-probe=viewer-mode-panel] button:has-text("expand")');
  await page.waitForTimeout(400);
  await shot(page, 'phone-3b-expand');
  await page.click('button:has-text("cancel")');

  await page.click('[role=toolbar] button:has-text("draw")');
  await page.waitForSelector('canvas[aria-label="Drawing surface"]');
  await page.waitForTimeout(300);
  const dw = await words(page, '[data-probe=viewer-mode-panel] button');
  ck(
    ['thin', 'thick', 'undo', 'clear'].every((w) => dw.includes(w)),
    'П2 draw: thin/thick, undo/clear',
    dw.join(' '),
  );
  const c = await rect(page, 'canvas[aria-label="Drawing surface"]');
  await page.mouse.move(c.left + 40, c.top + 40);
  await page.mouse.down();
  await page.mouse.move(c.left + 140, c.top + 120, { steps: 8 });
  await page.mouse.up();
  await shot(page, 'phone-4-draw');
  await page.click('[data-probe=viewer-save]');
  await page.waitForSelector('[data-probe=viewer-replace]', { timeout: 5000 }).catch(() => {});
  await page.waitForTimeout(300);
  await shot(page, 'phone-5-save-sheet');
  ck(
    !!(await page.$('[data-probe=viewer-replace]')) &&
      !!(await page.$('[data-probe=viewer-save-copy]')),
    'П4 лист replace here / save copy',
  );
  await page.click('[data-probe=viewer-replace]');
  await page.waitForTimeout(400);
  const rep = await page.evaluate(() => window.__viewer.replaces());
  ck(
    rep.length === 1 && rep[0].head.startsWith('data:image/png'),
    'П4 replace here отдал байты',
    JSON.stringify(rep),
  );
  ck((await mode(page)) === 'view', 'П4 после сохранения — просмотр');

  ck(errors.length === 0, 'нет ошибок страницы', errors.join(' | '));
  await page.close();
}

// ─── ДЕСКТОП ────────────────────────────────────────────────────────────────────────────────
{
  head('десктоп 1400×900');
  const { page, errors } = await stand({ width: 1400, height: 900 }, false);
  await page.evaluate(() => window.__viewer.mountViewer({ slot: false }));
  await page.waitForSelector('[data-probe=viewer-image]');
  await page.waitForTimeout(300);
  await shot(page, 'desk-1-view');
  for (const k of ['adjust', 'crop', 'expand', 'draw']) {
    ck(!!(await page.$(`[data-probe=viewer-mode-${k}]`)), `П5 кнопка режима ${k} наверху`);
  }
  await page.click('[data-probe=viewer-mode-adjust]');
  await page.waitForSelector('aside[data-probe=viewer-mode-panel]');
  await page.waitForTimeout(300);
  await shot(page, 'desk-2-adjust');
  const img = await rect(page, '[data-probe=viewer-image]');
  const aside = await rect(page, 'aside[data-probe=viewer-mode-panel]');
  ck(
    img.right <= aside.left + 1,
    'П5 панель справа от снимка',
    `img ${img.right | 0} / aside ${aside.left | 0}`,
  );
  ck(
    await page.$eval('[data-probe=viewer-mode-crop]', (b) => b.disabled),
    'П5 в режиме чужие режимы ждут',
  );
  await page.click('aside button:has-text("cancel")');
  await page.click('[data-probe=viewer-mode-expand]');
  await page.waitForTimeout(600);
  await shot(page, 'desk-3-expand');
  ck((await mode(page)) === 'frame', 'П5 expand открыт');
  ck(errors.length === 0, 'нет ошибок страницы', errors.join(' | '));
  await page.close();
}

// ─── УКАЗАНИЯ ───────────────────────────────────────────────────────────────────────────────
for (const [name, vp, mobile] of [
  ['phone', { width: 390, height: 844 }, true],
  ['desk', { width: 1400, height: 900 }, false],
]) {
  head(`указания вложений задачи · ${name}`);
  const { page, errors } = await stand(vp, mobile);
  await page.evaluate(() => window.__viewer.mountCallouts());
  await page.waitForSelector('[data-media-viewer]');
  await page.waitForTimeout(500);
  await shot(page, `${name}-6-callouts`);
  ck((await mode(page)) === 'callouts', 'П6 открылся в режиме callouts');
  const all = await words(page, '[data-media-viewer] button');
  const chip = await page.evaluate(() => /callouts\s·\s\d/i.test(document.body.innerText));
  ck(chip, 'П6 чип «callouts · N»');
  ck(
    all.some((w) => w.includes('1 / 2')) ||
      (await page.$eval('[data-media-viewer]', (e) => e.textContent.includes('1 / 2'))),
    'П6 положение в ряду 1 / 2',
  );
  ck(errors.length === 0, 'нет ошибок страницы', errors.join(' | '));
  await page.close();
}

await browser.close();
console.log(bad ? `\n${bad} FAIL` : '\nвсё зелёное');
process.exit(bad ? 1 : 0);
