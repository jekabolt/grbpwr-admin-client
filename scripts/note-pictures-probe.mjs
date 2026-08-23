#!/usr/bin/env node
// КАРТИНКА В ЗАМЕТКЕ ПОКАЗЫВАЕТСЯ КАРТИНКОЙ, А НАЖАТИЕ НА НЕЁ ОТКРЫВАЕТ УВЕЛИЧЕННЫЙ ВИД.
//
// Проба стоит на двух ногах, и вторая важнее. Первая — что ссылка на снимок становится снимком.
// Вторая, АНТИ-ЛОЖНАЯ, — что снимком становится не всё подряд: ссылка на pdf остаётся ссылкой,
// текст внутри ограды кода остаётся текстом, а адрес, который на картинку только ПОХОЖ и не
// открылся, возвращает на своё место ровно ту ссылку, что стояла бы там без правила. Без второй
// ноги реализация «рисуем <img> на каждую ссылку» проходит первую целиком и зелёным.
//
// ЧТО ПРОВЕРЯЕТСЯ:
//   Ц1 — `[фото](https://…/a.jpg)` БЕЗ восклицательного знака рисуется <img> (собственно починка);
//   Ц2 — `![подпись](https://…/b.png)` рисуется <img> (не сломано прежнее);
//   Ц3 — `[спецификация](https://…/doc.pdf)` остаётся ссылкой <a>;
//   Ц4 — адрес, похожий на картинку, но НЕ ОТКРЫВШИЙСЯ (404), возвращается ссылкой, а не битым
//        значком: страховка правила;
//   Ц5 — токен внутри ограды кода не рисуется ни картинкой, ни ссылкой;
//   Ц6 — один и тот же адрес, встреченный дважды, — ОДНО место в ряду просмотрщика;
//   Ц7 — нажатие на картинку открывает увеличенный вид, и на его сцене тот же самый адрес.
//
// МУТАЦИИ ЖИВУТ В ПАМЯТИ СБОРЩИКА, А НЕ В ФАЙЛЕ: правка исходника ради проверки — это правка,
// которую однажды забудут откатить. Каждая обязана покраснеть, и проба сама проверяет, что
// мутация ВООБЩЕ ПРИМЕНИЛАСЬ, — иначе зелёный после неё не значил бы ничего.
//   node scripts/note-pictures-probe.mjs                     прогон
//   node scripts/note-pictures-probe.mjs --mutate-no-rule     правило «похоже на картинку» снято
//   node scripts/note-pictures-probe.mjs --mutate-no-fallback неудача загрузки не возвращает ссылку
import { createRequire } from 'node:module';
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, rmSync } from 'node:fs';
import { homedir, tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { build as esbuild } from 'esbuild';

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

const entry = resolvePlaywright();
if (!entry) {
  console.log('playwright не найден — проба пропущена (это не отказ)');
  process.exit(0);
}
const mod = await import(entry);
const chromium = mod.chromium ?? mod.default?.chromium;
if (!chromium) {
  console.log('playwright найден, но без chromium — проба пропущена');
  process.exit(0);
}

const MUT_RULE = process.argv.includes('--mutate-no-rule');
const MUT_FALLBACK = process.argv.includes('--mutate-no-fallback');

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = resolve(HERE, '..');
const outfile = resolve(tmpdir(), `note-pictures-${process.pid}.js`);
await esbuild({
  entryPoints: [resolve(HERE, 'note-pictures-entry.tsx')],
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
    // `import.meta` в формате iife пуст, и getCropped читает у него поле — без этой подмены
    // модуль падает на загрузке, а документ не рисуется вовсе.
    'import.meta.env': '{"VITE_SERVER_URL":"http://stub.invalid"}',
    'import.meta.env.VITE_SERVER_URL': '"http://stub.invalid"',
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
let bundle = readFileSync(outfile, 'utf8');
rmSync(outfile, { force: true });

let bad = 0;
const ck = (ok, what, d = '') => {
  if (!ok) bad++;
  console.log(`${ok ? '  ok  ' : '  FAIL'} ${what}${d ? `  — ${d}` : ''}`);
};

// ─── МУТАЦИИ ────────────────────────────────────────────────────────────────────────────────
if (MUT_RULE) {
  const needle = '/\\.(png|jpe?g|gif|webp|avif|bmp|ico)$/i';
  const n = bundle.split(needle).length - 1;
  if (n !== 1) {
    console.log(`МУТАЦИЯ НЕ ПРИМЕНИЛАСЬ: правило найдено ${n} раз вместо одного`);
    process.exit(2);
  }
  bundle = bundle.replace(needle, '/^\\b$/');
  console.log('  мутация: правило «похоже на картинку» снято');
}
if (MUT_FALLBACK) {
  const needle = 'setFailed(true);';
  const n = bundle.split(needle).length - 1;
  if (n !== 1) {
    console.log(`МУТАЦИЯ НЕ ПРИМЕНИЛАСЬ: обработчик найден ${n} раз вместо одного`);
    process.exit(2);
  }
  bundle = bundle.replace(needle, ';');
  console.log('  мутация: неудача загрузки больше не возвращает ссылку');
}

// 1×1 png — настоящий байт, а не заглушка: <img> обязан ДЕКОДИРОВАТЬСЯ, иначе onError сработает
// сам собой и проба зеленела бы по неправильной причине.
const PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  'base64',
);

const browser = await chromium.launch();
const page = await browser.newPage();
page.on('console', (m) => { if (m.type() === 'error') console.log('  [консоль]', m.text().slice(0, 300)); });
page.on('pageerror', (e) => console.log('  [страница]', String(e).slice(0, 400)));
await page.route('http://probe.local/**', (route) =>
  route.fulfill({ status: 200, contentType: 'text/html', body: '<div id="root"></div>' }),
);
await page.route('https://pics.local/**', (route) => {
  const url = route.request().url();
  if (url.includes('missing')) return route.fulfill({ status: 404, body: '' });
  return route.fulfill({ status: 200, contentType: 'image/png', body: PNG });
});
await page.goto('http://probe.local/');
await page.addScriptTag({ content: bundle });
await page.waitForSelector('h1');
// Дать битой картинке дойти до onError: без ожидания Ц4 читал бы состояние до отказа сети.
await page.waitForTimeout(400);

const shot = await page.evaluate(() => {
  const root = document.getElementById('root');
  const imgs = [...root.querySelectorAll('img')].map((i) => i.getAttribute('src'));
  const links = [...root.querySelectorAll('a')].map((a) => a.getAttribute('href'));
  return { imgs, links, text: root.textContent ?? '' };
});

console.log('\nЦИТАТА · что документ показал');
ck(shot.imgs.includes('https://pics.local/a.jpg'), 'Ц1 ссылка без «!» на .jpg стала картинкой', `img: ${shot.imgs.length}`);
ck(shot.imgs.includes('https://pics.local/b.png'), 'Ц2 объявленная «!» картинка осталась картинкой');
ck(
  shot.links.includes('https://pics.local/doc.pdf') && !shot.imgs.includes('https://pics.local/doc.pdf'),
  'Ц3 ссылка на pdf осталась ссылкой',
);
ck(
  shot.links.includes('https://pics.local/missing.jpg') &&
    !shot.imgs.includes('https://pics.local/missing.jpg'),
  'Ц4 не открывшийся адрес вернулся ссылкой, а не битым значком',
);
ck(
  !shot.imgs.includes('https://pics.local/c.jpg') && !shot.links.includes('https://pics.local/c.jpg'),
  'Ц5 токен внутри ограды кода остался текстом',
  shot.text.includes('[код](https://pics.local/c.jpg)') ? 'и виден дословно' : 'дословного текста нет',
);

// ─── ЗУМ ────────────────────────────────────────────────────────────────────────────────────
console.log('\nЗУМ · нажатие открывает увеличенный вид');
const before = await page.locator('[role="dialog"]').count();
// НАЖИМАЕМ ТОЛЬКО ЕСЛИ ЕСТЬ ЧТО: мутация, снимающая правило, оставляет документ без этой
// картинки, и `click()` по несуществующему узлу уронил бы пробу ИСКЛЮЧЕНИЕМ — то есть дал бы
// красноту, которая ничего не проверяет. Провал должен быть напечатан строкой, а не трассой.
const target = page.locator('#root img[src="https://pics.local/a.jpg"]');
const clickable = (await target.count()) > 0;
ck(clickable, 'есть на что нажать', clickable ? '' : 'картинки в документе нет — зум не проверен');
if (clickable) {
  await target.first().click();
  await page.waitForTimeout(300);
}
const stage = await page.evaluate(() => {
  const d = document.querySelector('[role="dialog"]');
  if (!d) return null;
  return { srcs: [...d.querySelectorAll('img')].map((i) => i.getAttribute('src')) };
});
ck(before === 0, 'до нажатия увеличенного вида нет');
ck(!!stage, 'Ц7 после нажатия он открылся');
ck(!!stage && stage.srcs.includes('https://pics.local/a.jpg'), 'и на сцене тот же самый адрес', stage ? stage.srcs.join(', ') : '—');

// Ряд собран по документу: один и тот же адрес встречается дважды, а место в ряду у него одно.
const strip = await page.evaluate(() => {
  const d = document.querySelector('[role="dialog"]');
  if (!d) return null;
  return [...new Set([...d.querySelectorAll('img')].map((i) => i.getAttribute('src')))].sort();
});
// Ряд РОВНО из двух: `a.jpg` стоит в документе дважды и места не удваивает, а `missing.jpg`
// из ряда выпал — не открывшийся адрес не занимает кадр, обещая снимок, которого нет.
ck(
  !!strip && strip.length === 2,
  'Ц6 в ряду ровно два снимка: повтор не удвоил, не открывшийся выпал',
  strip ? strip.join(', ') : '—',
);

await browser.close();
console.log(bad ? `\nКРАСНАЯ: ${bad}` : '\nЗЕЛЁНАЯ');
process.exit(bad ? 1 : 0);
