#!/usr/bin/env node
// ДВЕРЬ СЛОТА ДЕТАЛИ (moodboard-flats-1003, T05 + T10).
//
// Владелец: «в FLAT SLOTS proposed DETAILS нельзя законфирмить никак» и «не понятно как удалять
// детейл кнопка REMOVE SLOT появляется только на ховер». Проба меряет в настоящем браузере с CSS
// собранного бандла:
//   · `remove` виден В ПОКОЕ, без наведения (не прозрачен ни он, ни его предки);
//   · первый щелчок НЕ сносит, а спрашивает; фокус встаёт на `no`; `no`, Esc и щелчок мимо гасят;
//   · `yes` сносит ровно один раз; отказ записи возвращает дверь в покой;
//   · у заполненного слота вопрос называет картинку;
//   · у предложенного слота есть `keep` (принятие) и `dismiss` (снос без второго шага).
//
// Запуск:  node scripts/detail-slot-door-probe.mjs [--mutate-instant] [--mutate-keep]
//   --mutate-instant  `remove` сносит с первого щелчка    → вопрос обязан покраснеть
//   --mutate-keep     `keep` ничего не делает              → принятие обязано покраснеть
// Сначала `yarn build` (нужен dist/assets/index-*.css).

import { build as esbuild } from 'esbuild';
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, readdirSync, rmSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { homedir, tmpdir } from 'node:os';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const MUT = {
  instant: process.argv.includes('--mutate-instant'),
  keep: process.argv.includes('--mutate-keep'),
};

function resolvePlaywright() {
  const req = createRequire(import.meta.url);
  try {
    return req.resolve('playwright');
  } catch {
    /* дальше — кэш npx */
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

const pwEntry = resolvePlaywright();
if (!pwEntry) {
  console.log('playwright не найден — проба пропущена (это не отказ)');
  process.exit(0);
}
const pw = await import(pwEntry);
const chromium = pw.chromium ?? pw.default?.chromium;
if (!chromium) {
  console.log('playwright найден, но без chromium — проба пропущена');
  process.exit(0);
}

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = resolve(HERE, '..');
const dieNotRun = (why) => {
  console.log(`ПРОБА НЕ ВЫПОЛНЕНА: ${why}`);
  process.exit(2);
};

// ── МУТАЦИИ ──────────────────────────────────────────────────────────────────────────────────────
const pairs = [];
if (MUT.instant) pairs.push([`onClick={() => setPhase('armed')}`, `onClick={run}`]);
if (MUT.keep) pairs.push([`onClick={onKeep}`, `onClick={() => {}}`]);
const plugins = pairs.length
  ? [
      {
        name: 'door-mutation',
        setup(b) {
          b.onLoad({ filter: /bench-slot\.tsx$/ }, async (args) => {
            let src = await readFile(args.path, 'utf8');
            for (const [fixed, broken] of pairs) {
              if (!src.includes(fixed)) throw new Error(`мутация не нашла строку: ${fixed}`);
              src = src.replace(fixed, broken);
            }
            return { contents: src, loader: 'tsx' };
          });
        },
      },
    ]
  : [];

const outfile = resolve(tmpdir(), `detail-slot-door-${process.pid}.js`);
await esbuild({
  entryPoints: [resolve(HERE, 'detail-slot-door-entry.tsx')],
  bundle: true,
  platform: 'browser',
  format: 'iife',
  target: 'es2020',
  outfile,
  logLevel: 'warning',
  absWorkingDir: REPO,
  jsx: 'automatic',
  loader: { '.svg': 'text', '.png': 'dataurl', '.woff2': 'dataurl' },
  plugins,
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
if (!bundle.includes('remove + picture?')) dieNotRun('в бандле нет двери слота — собралось не то');

let cssDir = [];
try {
  cssDir = readdirSync(resolve(REPO, 'dist/assets'));
} catch {
  dieNotRun('dist/assets нет — сначала `yarn build`');
}
const cssName = cssDir.find((f) => /^index-.*\.css$/.test(f));
if (!cssName) dieNotRun('dist/assets/index-*.css нет — сначала `yarn build`');
const CSS = readFileSync(resolve(REPO, 'dist/assets', cssName), 'utf8');

let bad = 0;
const ck = (ok, what, d = '') => {
  if (!ok) bad++;
  console.log(`${ok ? '  ok  ' : '  FAIL'} ${what}${d ? `  — ${d}` : ''}`);
};
const head = (s) => console.log(`\n${s}`);

const browser = await chromium.launch({ channel: 'chromium' });
const page = await browser.newPage({ viewport: { width: 600, height: 400 } });
const pageErrors = [];
page.on('pageerror', (e) => pageErrors.push(String(e)));
await page.route('http://127.0.0.1/**', (route) =>
  route.fulfill({ status: 200, contentType: 'text/html', body: '<div id="root"></div>' }),
);
await page.goto('http://127.0.0.1/');
await page.addStyleTag({ content: CSS });
await page.addScriptTag({ content: bundle });

const mount = async (cfg) => {
  await page.evaluate((c) => window.__door.mount(c), cfg);
  await page.waitForSelector('[data-detail-door]', { timeout: 5000 });
  await page.mouse.move(590, 390); // указатель далеко: никакого наведения
};
const door = () => page.getAttribute('[data-detail-door]', 'data-detail-door');
const log = () => page.evaluate(() => window.__door.log.slice());
const settle = () => page.waitForTimeout(60);
const visibleAtRest = (sel) =>
  page.evaluate((s) => {
    let n = document.querySelector(s);
    if (!n) return 'нет элемента';
    const r = n.getBoundingClientRect();
    if (r.width === 0 || r.height === 0) return 'нулевой размер';
    for (; n; n = n.parentElement) {
      const cs = getComputedStyle(n);
      if (cs.opacity !== '1' || cs.visibility !== 'visible' || cs.display === 'none')
        return `скрыт: opacity ${cs.opacity}`;
    }
    return 'ok';
  }, sel);

head('принятый пустой слот — remove виден и спрашивает');
await mount({ proposed: false, filled: false });
const rest = await visibleAtRest('[data-detail-door-remove]');
ck(rest === 'ok', '`remove` виден в покое без наведения', rest);
await page.click('[data-detail-door-remove]');
await settle();
ck((await log()).length === 0, 'первый щелчок ничего не сносит', JSON.stringify(await log()));
ck((await door()) === 'armed', 'дверь взведена: вопрос на месте', await door());
const prompt = await page.textContent('[data-detail-door]').catch(() => '');
ck(
  /remove\?/i.test(prompt ?? '') && !/picture/i.test(prompt ?? ''),
  'вопрос пустого слота — «remove?»',
  prompt,
);
const focused = await page.evaluate(() =>
  document.activeElement?.hasAttribute('data-detail-door-cancel'),
);
ck(focused === true, 'фокус встал на `no`');
if ((await door()) === 'armed') {
  await page.click('[data-detail-door-cancel]');
  await settle();
  ck((await door()) === 'rest', '`no` гасит взвод', await door());
  await page.click('[data-detail-door-remove]');
  await page.keyboard.press('Escape');
  await settle();
  ck((await door()) === 'rest', 'Esc гасит взвод', await door());
  await page.click('[data-detail-door-remove]');
  await page.click('[data-outside]');
  await settle();
  ck((await door()) === 'rest', 'щелчок мимо гасит взвод', await door());
  ck((await log()).length === 0, 'ни один отказ не снёс слот', JSON.stringify(await log()));
  await page.click('[data-detail-door-remove]');
  await page.click('[data-detail-door-confirm]');
  await settle();
  ck(
    JSON.stringify(await log()) === '["remove"]',
    '`yes` сносит ровно один раз',
    JSON.stringify(await log()),
  );
  ck((await door()) === 'removing', 'пока запись идёт — «removing…»', await door());
}

head('отказ записи');
await mount({ proposed: false, filled: false, fail: true });
await page.click('[data-detail-door-remove]');
if ((await door()) === 'armed') await page.click('[data-detail-door-confirm]');
await settle();
ck((await door()) === 'rest', 'отказ возвращает дверь в покой', await door());

head('заполненный слот');
await mount({ proposed: false, filled: true });
await page.click('[data-detail-door-remove]');
await settle();
const p2 = await page.textContent('[data-detail-door]');
ck(/remove \+ picture\?/i.test(p2 ?? ''), 'вопрос называет картинку', p2);

head('предложенный слот — keep / dismiss');
await mount({ proposed: true, filled: false });
const keepRest = await visibleAtRest('[data-detail-door-keep]');
ck(keepRest === 'ok', '`keep` виден в покое', keepRest);
const dismissRest = await visibleAtRest('[data-detail-door-dismiss]');
ck(dismissRest === 'ok', '`dismiss` виден в покое', dismissRest);
await page.click('[data-detail-door-keep]');
await settle();
ck(JSON.stringify(await log()) === '["keep"]', '`keep` принимает', JSON.stringify(await log()));
await mount({ proposed: true, filled: false });
await page.click('[data-detail-door-dismiss]');
await settle();
ck(
  JSON.stringify(await log()) === '["remove"]',
  '`dismiss` сносит пустое предложение сразу',
  JSON.stringify(await log()),
);

head('исполнение');
ck(pageErrors.length === 0, 'страница не бросила ошибок', pageErrors.join(' | ').slice(0, 200));
await browser.close();

const mutating = MUT.instant || MUT.keep;
console.log(`\nпровалов: ${bad}`);
if (mutating) {
  console.log(
    bad > 0 ? 'мутация уронила пробу — стенд меряет предмет' : 'МУТАЦИЯ НЕ УРОНИЛА ПРОБУ',
  );
  process.exit(bad > 0 ? 0 : 3);
}
process.exit(bad === 0 ? 0 : 1);
