#!/usr/bin/env node
// КНОПКА «CODE» НА ЖИВОМ ПОЛЕ — И КНОПКА «MEDIA», КОТОРОЙ НЕ БЫЛО.
//
//   node scripts/format-bar-probe.mjs           прогон
//   node scripts/format-bar-probe.mjs --mutate  вернуть В БАНДЛЕ старую развилку кнопки code
//                                               (репозиторий не трогается) — проба обязана
//                                               покраснеть
//
// Зачем проба, когда есть таблица: таблица знает только про чистые функции. Что кнопка зовёт
// ИМЕННО ИХ и что правка доезжает до поля через execCommand — вопрос браузера.
import { createRequire } from 'node:module';
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { homedir, tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { build as esbuild } from 'esbuild';

const MUTATE = process.argv.includes('--mutate');

function resolvePlaywright() {
  const require = createRequire(import.meta.url);
  try { return require.resolve('playwright'); } catch {}
  try {
    const root = `${homedir()}/.npm/_npx`;
    if (!existsSync(root)) return null;
    const found = execFileSync('find',
      [root, '-maxdepth', '4', '-type', 'd', '-name', 'playwright', '-path', '*node_modules*'],
      { encoding: 'utf8' }).split('\n').filter(Boolean)[0];
    return found ? `${found}/index.js` : null;
  } catch { return null; }
}
const pw = resolvePlaywright();
if (!pw) { console.log('playwright не найден — проба пропущена (это не отказ)'); process.exit(0); }
const mod = await import(pw);
const chromium = mod.chromium ?? mod.default?.chromium;
if (!chromium) { console.log('playwright найден, но без chromium — проба пропущена'); process.exit(0); }

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = resolve(HERE, '..');
const outfile = resolve(tmpdir(), `format-bar-${process.pid}.js`);

// МУТАЦИЯ ВОЗВРАЩАЕТ ДЕФЕКТ Д2: срез хвостовых переводов строки, из-за которого тройной клик по
// строке давал ограду вместо бэктиков. Она живёт в памяти сборщика.
const mutation = {
  name: 'format-bar-mutation',
  setup(b) {
    b.onLoad({ filter: /format-edits\.ts$/ }, async (args) => {
      const src = await readFile(args.path, 'utf8');
      const from = "  let e = end;\n  while (e > start && text[e - 1] === '\\n') e -= 1;";
      if (!src.includes(from)) throw new Error('мутация не нашла свою строку');
      return { contents: src.replace(from, '  const e = end;'), loader: 'ts' };
    });
  },
};

await esbuild({
  entryPoints: [resolve(HERE, 'format-bar-entry.tsx')],
  bundle: true, platform: 'browser', format: 'iife', target: 'es2020', outfile,
  logLevel: 'warning', absWorkingDir: REPO, jsx: 'automatic',
  loader: { '.svg': 'text', '.png': 'dataurl', '.woff2': 'dataurl' },
  plugins: MUTATE ? [mutation] : [],
  define: {
    'import.meta.env.VITE_SERVER_URL': '"http://stub.invalid"',
    'import.meta.env': '{"VITE_SERVER_URL":"http://stub.invalid","MODE":"production"}',
    'process.env.NODE_ENV': '"production"',
  },
  alias: {
    components: resolve(REPO, 'src/components'), lib: resolve(REPO, 'src/lib'),
    api: resolve(REPO, 'src/api'), utils: resolve(REPO, 'src/utils'),
    ui: resolve(REPO, 'src/ui'), constants: resolve(REPO, 'src/constants'),
    store: resolve(REPO, 'src/store'), hooks: resolve(REPO, 'src/hooks'),
  },
});
const bundle = readFileSync(outfile, 'utf8');

let bad = 0;
const ck = (ok, what, d = '') => { if (!ok) bad++; console.log(`${ok ? '  ok  ' : '  FAIL'} ${what}${d ? `  — ${d}` : ''}`); };
const head = (s) => console.log(`\n${s}`);
const show = (s) => JSON.stringify(s);

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1200, height: 900 } });
const errors = [];
page.on('pageerror', (e) => errors.push(String(e)));
await page.route('http://probe.local/**', (route) =>
  route.fulfill({ status: 200, contentType: 'text/html', body: '<div id="root"></div>' }),
);
// Библиотека медиа за пикером ОТВЕЧАЕТ ПУСТО, а не молчит: неотвеченный запрос дал бы окно в
// вечной загрузке, и «пикер открылся» смешалось бы с «пикер завис».
await page.route('http://stub.invalid/**', (route) =>
  route.fulfill({ status: 200, contentType: 'application/json', body: '{"list":[],"total":0}' }),
);

await page.goto('http://probe.local/');
await page.addScriptTag({ content: bundle });
await page.evaluate(() => window.__formatBar.mount());
await page.waitForSelector('[data-area]', { timeout: 15000 });

const setText = (t, s, e) => page.evaluate(([t, s, e]) => window.__formatBar.set(t, s, e), [t, s, e]);
const text = () => page.evaluate(() => window.__formatBar.text());
const value = () => page.evaluate(() => window.__formatBar.value());
const press = async (label) => {
  await page.locator('button', { hasText: new RegExp(`^${label}$`) }).first().click();
  await page.waitForTimeout(120);
};

head('1. кнопка code на живом поле');
await setText('alpha\n', 0, 6);
await press('code');
const triple = await text();
ck(triple === '`alpha`\n', 'тройной клик по строке даёт бэктики, а не ограду', show(triple));
ck((await value()) === triple, 'страница узнала о правке — проп совпал с полем', show(await value()));

await setText('', 0, 0);
await press('code');
const one = await text();
ck(one === '``', 'пустая каретка даёт ПАРУ', show(one));
// Каретка уводится ЗА пару — ровно то, что делает и стрелка вправо, и досрочный выход
// восстановления каретки. Это и есть тот случай, в котором пара учетверялась.
await page.evaluate(() => window.__formatBar.select(2, 2));
await press('code');
const two = await text();
ck(two === '', 'второе нажатие рядом с парой её СНИМАЕТ, а не учетверяет', show(two));

await setText('a\nb', 0, 3);
await press('code');
const fenced = await text();
ck(fenced === '```\na\nb\n```', 'две строки дают ограду', show(fenced));
// После ограды выделено только ТЕЛО — повтор обязан её снять, а не вложить вторую.
await press('code');
const unfenced = await text();
ck(unfenced === 'a\nb', 'повтор на теле свежей ограды её снимает', show(unfenced));

head('2. соседние кнопки не поехали (вынос был пустым)');
await setText('word', 0, 4);
await press('bold');
ck((await text()) === '**word**', 'bold', show(await text()));
await setText('word', 0, 4);
await press('italic');
ck((await text()) === '*word*', 'italic', show(await text()));
await setText('word', 0, 4);
await press('list');
ck((await text()) === '- word', 'list', show(await text()));
await setText('word', 0, 4);
await press('quote');
ck((await text()) === '> word', 'quote', show(await text()));
await setText('word', 0, 4);
await press('heading');
ck((await text()) === '# word', 'heading', show(await text()));
await setText('word', 0, 4);
await press('link');
ck((await text()) === '[word](url)', 'link', show(await text()));

head('3. кнопка media');
const mediaBtn = page.locator('button', { hasText: /^media$/ });
ck((await mediaBtn.count()) === 1, 'кнопка media стоит в панели', `их ${await mediaBtn.count()}`);
await mediaBtn.first().click();
await page.waitForTimeout(600);
ck((await page.locator('[role="dialog"]').count()) === 1, 'клик открывает пикер медиатеки');
const dlg = ((await page.locator('[role="dialog"]').first().innerText()) ?? '').toLowerCase();
ck(/add all/.test(dlg), 'и это МУЛЬТИВЫБОР — в подвале «add all»', dlg.slice(0, 120).replace(/\n/g, ' | '));

ck(errors.length === 0, 'ни одного исключения на странице', errors[0] ?? '');
await browser.close();
console.log(bad === 0 ? '\nВСЁ ЗЕЛЁНОЕ' : `\nПРОВАЛОВ: ${bad}`);
process.exit(bad === 0 ? 0 : 1);
