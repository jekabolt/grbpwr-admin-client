#!/usr/bin/env node
// ВТОРОЙ ⌘V, ОТПРАВКА ПАЧКОЙ И СВЁРНУТАЯ ЗАГРУЗКА — НА ЖИВЫХ КОМПОНЕНТАХ.
//
// Табличный зонд `intake-queue-probe` доказывает одну чистую функцию. Он НЕ доказывает ни того,
// что вторая вставка вообще доходит до неё (её глотал `accepts`), ни того, что после нажатия
// «upload all» страница остаётся живой. Это поведение, и мерить его надо в браузере.
//
//   node scripts/media-intake-probe.mjs                 прогон
//   node scripts/media-intake-probe.mjs --mutate=accepts вернуть `accepts: enabled && !busy`
//   node scripts/media-intake-probe.mjs --mutate=merge   вернуть замещение вместо добавления
//   node scripts/media-intake-probe.mjs --mutate=collapse отправка больше не сворачивает окно
//
// Мутации живут В ПАМЯТИ СБОРЩИКА: репозиторий не трогается. Зелёная мутация означает, что
// проверка ничего не держит.
//
// Playwright не в зависимостях проекта — ищется в кэше npx и МОЛЧА пропускается, если не найден.
import { createRequire } from 'node:module';
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { homedir, tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { build as esbuild } from 'esbuild';

const MUTATE = (process.argv.find((a) => a.startsWith('--mutate=')) ?? '').split('=')[1] ?? '';

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

const entryPath = resolvePlaywright();
if (!entryPath) { console.log('playwright не найден — проба пропущена (это не отказ)'); process.exit(0); }
const mod = await import(entryPath);
const chromium = mod.chromium ?? mod.default?.chromium;
if (!chromium) { console.log('playwright найден, но без chromium — проба пропущена'); process.exit(0); }

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = resolve(HERE, '..');
const outfile = resolve(tmpdir(), `media-intake-${process.pid}.js`);

// Каждая мутация возвращает РОВНО ту строку, которой была починка.
const MUTATIONS = {
  accepts: {
    file: /useMediaIntake\.tsx$/,
    loader: 'tsx',
    from: '      accepts: enabled,',
    to: '      accepts: enabled && !busy,',
  },
  merge: {
    file: /intake-queue\.ts$/,
    loader: 'ts',
    from: '  const room = limit == null ? incoming.length : Math.max(0, limit - prev.length);\n  const taken = incoming.slice(0, room);',
    to: '  const taken = limit == null ? incoming : incoming.slice(0, limit);\n  prev = [];',
  },
  collapse: {
    file: /media-intake-dialog\.tsx$/,
    loader: 'tsx',
    from: '    setCollapsed(true);\n    engine.handleUploadAll();',
    to: '    engine.handleUploadAll();',
  },
};
if (MUTATE && !MUTATIONS[MUTATE]) {
  console.log(`неизвестная мутация «${MUTATE}»; есть: ${Object.keys(MUTATIONS).join(', ')}`);
  process.exit(2);
}
const mutation = MUTATE && {
  name: `intake-mutation-${MUTATE}`,
  setup(b) {
    const m = MUTATIONS[MUTATE];
    b.onLoad({ filter: m.file }, async (args) => {
      const src = await readFile(args.path, 'utf8');
      if (!src.includes(m.from)) throw new Error(`мутация не нашла свою строку в ${args.path}`);
      return { contents: src.replace(m.from, m.to), loader: m.loader };
    });
  },
};

await esbuild({
  entryPoints: [resolve(HERE, 'media-intake-entry.tsx')],
  bundle: true, platform: 'browser', format: 'iife', target: 'es2020', outfile,
  logLevel: 'warning', absWorkingDir: REPO, jsx: 'automatic',
  loader: { '.svg': 'text', '.png': 'dataurl', '.woff2': 'dataurl' },
  plugins: mutation ? [mutation] : [],
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

// СТИЛИ АДМИНКИ — НЕ УКРАШЕНИЕ СТЕНДА. Без них `opacity-0` не существует вовсе, и проверка
// «кнопки проявляются по наведению» видела бы единицу до и после — то есть подтверждала бы
// работу того, чего на странице нет. Берётся собранный `dist`; нет его — проверка ЧЕСТНО
// пропускается, а не красится в зелёный.
function adminCss() {
  const dir = resolve(REPO, 'dist/assets');
  if (!existsSync(dir)) return null;
  const files = execFileSync('find', [dir, '-maxdepth', '1', '-name', '*.css'], { encoding: 'utf8' })
    .split('\n').filter(Boolean);
  if (!files.length) return null;
  return files.map((f) => readFileSync(f, 'utf8')).join('\n');
}
const CSS = adminCss();

let bad = 0;
const ck = (ok, what, d = '') => { if (!ok) bad++; console.log(`${ok ? '  ok  ' : '  FAIL'} ${what}${d ? `  — ${d}` : ''}`); };
const head = (s) => console.log(`\n${s}`);

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1400, height: 1000 } });
const pageErrors = [];
page.on('pageerror', (e) => pageErrors.push(String(e)));
await page.route('http://probe.local/**', (route) =>
  route.fulfill({ status: 200, contentType: 'text/html', body: '<div id="root"></div>' }),
);

// БАКЕТ. Отвечает тем же, чем настоящий: `{media: common_MediaFull}`. Задержка — не для красоты:
// без неё «страница жива во время отправки» проверять не на чем, отправка кончается раньше клика.
let uploadN = 0;
let uploadFails = false;
let uploadDelayMs = 0;
await page.route('http://stub.invalid/**', async (route) => {
  uploadN += 1;
  if (uploadDelayMs) await new Promise((r) => setTimeout(r, uploadDelayMs));
  if (uploadFails) return route.fulfill({ status: 500, contentType: 'application/json', body: '{"message":"nope"}' });
  const id = 1000 + uploadN;
  return route.fulfill({
    status: 200, contentType: 'application/json',
    body: JSON.stringify({ media: { id, media: { fullSize: { mediaUrl: `https://cdn/${id}.jpg`, width: 2, height: 2 } } } }),
  });
});

// 2×2 PNG. Настоящий кадр нужен для того, чтобы движок ЗАМЕРИЛ его (`Image.onload`) и посчитал
// пределы: на битом файле обмер молча возвращает null, и «не пролезет» никогда бы не сработало.
const PNG_B64 = 'iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAYAAABytg0kAAAAFElEQVR4nGP8z8DAwMDAwMDEAAMADgIBAWiJ8fMAAAAASUVORK5CYII=';

async function mount(opts = {}) {
  await page.goto('http://probe.local/');
  if (CSS) await page.addStyleTag({ content: CSS });
  await page.addScriptTag({ content: bundle });
  await page.evaluate((o) => window.__intake.mount(o), opts);
  await page.waitForSelector('[data-slot]', { timeout: 15000 });
  // Очередь принадлежит тому, где указатель: без наведения приёмник даже не встаёт в стопку.
  await page.locator('[data-slot]').hover();
}

/** Вставка — настоящее событие `paste`, как из буфера. `into` задаёт цель (для текстового поля). */
async function paste({ count = 1, kind = 'image', into = null } = {}) {
  await page.evaluate(
    ({ count, kind, into, b64 }) => {
      const dt = new DataTransfer();
      for (let i = 0; i < count; i += 1) {
        let file;
        if (kind === 'text') {
          file = new File(['hello'], `note-${Date.now()}-${i}.txt`, { type: 'text/plain' });
        } else if (kind === 'video') {
          file = new File([new Uint8Array([0, 1, 2, 3])], `clip-${Date.now()}-${i}.mp4`, { type: 'video/mp4' });
        } else {
          const bin = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
          file = new File([bin], `shot-${Date.now()}-${i}.png`, { type: 'image/png' });
        }
        dt.items.add(file);
      }
      const ev = new ClipboardEvent('paste', { clipboardData: dt, bubbles: true, cancelable: true });
      const target = into ? document.querySelector(into) : document;
      target.dispatchEvent(ev);
    },
    { count, kind, into, b64: PNG_B64 },
  );
  await page.waitForTimeout(350);
}

const tiles = () => page.locator('[role="listitem"]').count();
const dialogOpen = () => page.locator('[role="dialog"]').count();
const pillText = async () => {
  const n = await page.locator('[role="dialog"]').count();
  if (n) return '';
  const b = page.locator('body > div > button').filter({ hasText: /upload/i });
  return (await b.count()) ? ((await b.first().textContent()) ?? '').trim() : '';
};
const said = () => page.evaluate(() => window.__intake.said());
const calls = () => page.evaluate(() => window.__intake.calls());
const delivered = () => page.evaluate(() => window.__intake.delivered());
const clicks = () => page.evaluate(() => window.__intake.clicks());
const busy = () => page.evaluate(() => window.__intake.busy());

// ── 1. ВТОРОЙ ⌘V КОПИТ ─────────────────────────────────────────────────────────────────────────
head('1. второй ⌘V добавляет кадр, а не проглатывается');
await mount({});
ck(pageErrors.length === 0, 'стенд смонтировался без исключений', pageErrors[0] ?? '');
await paste({ count: 1 });
ck((await tiles()) === 1, 'первая вставка: РОВНО одна миниатюра', `их ${await tiles()}`);
await paste({ count: 1 });
ck((await tiles()) === 2, 'вторая вставка: РОВНО две миниатюры', `их ${await tiles()}`);
ck(await busy(), 'слот сообщает «идёт приёмка»');

// НЕГАТИВНЫЕ КОНТРОЛИ. Без них «счётчик растёт» не отличим от «растёт на что угодно».
await paste({ count: 1, kind: 'text' });
ck((await tiles()) === 2, 'вставка .txt очередь НЕ трогает', `их ${await tiles()}`);
await paste({ count: 1, into: '[data-text-field]' });
ck((await tiles()) === 2, 'вставка при фокусе в текстовом поле уходит в поле, не в слот', `их ${await tiles()}`);

// ── 2. ПОТОЛОК СЛОТА ───────────────────────────────────────────────────────────────────────────
head('2. потолок слота: лишнее отбрасывается и НАЗЫВАЕТСЯ');
await mount({ limit: 3 });
await paste({ count: 2 });
ck((await tiles()) === 2, 'две вставленные встали', `их ${await tiles()}`);
await paste({ count: 3 });
ck((await tiles()) === 3, 'третья вставка добила до потолка и не выше', `их ${await tiles()}`);
const msg = await said();
ck(/took 1 of 3/i.test(msg), 'про отброшенное сказано вслух', `«${msg}»`);

// одиночный слот замещает — сегодняшнее правило, оно же в mergeQueue
await mount({ limit: 1 });
await paste({ count: 1 });
await paste({ count: 1 });
ck((await tiles()) === 1, 'слот на одну картинку держит РОВНО один кадр', `их ${await tiles()}`);

// ── 3. КРОП ПО НАВЕДЕНИЮ ───────────────────────────────────────────────────────────────────────
head('3. кроп и удаление на плитке');
await mount({});
await paste({ count: 1 });
const cropBtn = page.locator('[role="listitem"] button', { hasText: /^crop$/ }).first();
const opacityOf = async (loc) => loc.evaluate((n) => getComputedStyle(n.parentElement).opacity);
ck((await cropBtn.count()) === 1, 'у картинки есть кнопка crop');
if (!CSS) {
  console.log('  скип  стили админки не собраны (нет dist/assets/*.css) — про наведение сказать нечего');
} else {
  const before = await opacityOf(cropBtn);
  await page.locator('[role="listitem"]').first().hover();
  await page.waitForTimeout(250);
  const after = await opacityOf(cropBtn);
  ck(before === '0' && after === '1', 'кнопки проявляются по наведению', `${before} → ${after}`);
  // ВТОРАЯ ПОЛОВИНА: та же кнопка обязана быть достижима БЕЗ наведения — с клавиатуры.
  // Указатель уводится в угол, а не на слот: слот накрыт оверлеем модалки.
  await page.mouse.move(2, 2);
  await page.waitForTimeout(250);
  ck((await opacityOf(cropBtn)) === '0', 'без наведения кнопки спрятаны — есть чему проявляться');
  await cropBtn.focus();
  await page.waitForTimeout(200);
  ck((await opacityOf(cropBtn)) === '1', 'и по фокусу с клавиатуры — тоже');
}

await mount({ accept: 'media' });
await paste({ count: 1, kind: 'video' });
ck((await tiles()) === 1, 'ролик встаёт в очередь', `их ${await tiles()}`);
ck((await page.locator('[role="listitem"] button', { hasText: /^crop$/ }).count()) === 0,
  'у ролика кнопки crop НЕТ — кроп видео это перекодирование');

// ── 4. «НАЖАЛИ АПЛОУД — ОНИ В ТОМ ВИДЕ И ОТПРАВЛЯЮТСЯ» ─────────────────────────────────────────
head('4. отправка пачкой, сворачивание, живая страница');
uploadN = 0; uploadFails = false; uploadDelayMs = 700;
await mount({});
await paste({ count: 3 });
ck((await tiles()) === 3, 'в очереди три кадра', `их ${await tiles()}`);
await page.locator('button', { hasText: /^upload all \(3\)$/i }).first().click();
await page.waitForTimeout(400);
ck((await dialogOpen()) === 0, 'модалка ушла с экрана сразу после нажатия');
const pill = await pillText();
ck(/uploading/i.test(pill), 'внизу стоит пилюля с ходом отправки', `«${pill}»`);
// ГЛАВНОЕ: СТРАНИЦА ПОД ОТПРАВКОЙ ЖИВАЯ.
//
// Одного клика по соседнему полю тут МАЛО, и это замерено: с мутацией «не сворачивать» клик
// всё равно проходит — Playwright дотягивается до кнопки под оверлеем, а человек нет. Поэтому
// меряется сам барьер: что лежит в точке кнопки, погашены ли указатели на теле страницы и не
// спрятана ли она от чтения с экрана.
const barrier = await page.evaluate(() => {
  const b = document.querySelector('[data-neighbour]');
  const r = b.getBoundingClientRect();
  const top = document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2);
  let hidden = false;
  for (let n = b; n; n = n.parentElement) {
    if (n.hasAttribute('aria-hidden') || n.hasAttribute('inert')) hidden = true;
  }
  return {
    topIsButton: top === b || b.contains(top),
    topTag: top ? `${top.tagName.toLowerCase()}.${top.className}`.slice(0, 60) : 'none',
    bodyPointerEvents: getComputedStyle(document.body).pointerEvents,
    hidden,
  };
});
ck(barrier.topIsButton, 'в точке соседнего поля лежит ОНО САМО, а не оверлей', barrier.topTag);
ck(barrier.bodyPointerEvents !== 'none', 'указатели на странице не погашены', barrier.bodyPointerEvents);
ck(!barrier.hidden, 'страница не спрятана от чтения с экрана (aria-hidden / inert)');
await page.locator('[data-neighbour]').click();
ck((await clicks()) === 1, 'и клик по нему доходит ВО ВРЕМЯ отправки', `кликов ${await clicks()}`);

await page.waitForFunction(() => window.__intake.calls() > 0, null, { timeout: 20000 });
await page.waitForTimeout(400);
const ids = await delivered();
ck((await calls()) === 1, 'владелец слота позван РОВНО ОДИН раз на всю пачку', `вызовов ${await calls()}`);
ck(ids.length === 3, 'доставлено РОВНО три кадра', `их ${ids.length}: ${ids.join(',')}`);
ck(new Set(ids).size === 3, 'и все три разные — повторной доставки нет');
ck((await pillText()) === '', 'пилюля погасла: очередь пуста');
ck(!(await busy()), 'слот больше не занят');
ck(uploadN === 3, 'бакет получил РОВНО три запроса', `их ${uploadN}`);

// ── 5. ESC ВО ВРЕМЯ ОТПРАВКИ СВОРАЧИВАЕТ, А НЕ ТЕРЯЕТ ──────────────────────────────────────────
head('5. Esc во время отправки');
uploadN = 0; uploadDelayMs = 700;
await mount({});
await paste({ count: 2 });
await page.locator('button', { hasText: /^upload all \(2\)$/i }).first().click();
await page.waitForTimeout(200);
await page.keyboard.press('Escape');
await page.waitForTimeout(200);
ck((await dialogOpen()) === 0, 'Esc свернул окно');
await page.waitForFunction(() => window.__intake.delivered().length >= 2, null, { timeout: 20000 });
await page.waitForTimeout(400);
ck((await delivered()).length === 2, 'пачка доехала целиком, Esc её не отменил', `их ${(await delivered()).length}`);
ck((await calls()) === 1, 'и одним вызовом', `вызовов ${await calls()}`);

// ── 6. ОТМЕНА ДО ОТПРАВКИ НЕ ДОСТАВЛЯЕТ НИЧЕГО ─────────────────────────────────────────────────
head('6. отмена до отправки');
uploadN = 0; uploadDelayMs = 0;
await mount({});
await paste({ count: 2 });
await page.locator('button', { hasText: /^cancel$/i }).first().click();
await page.waitForTimeout(300);
ck((await dialogOpen()) === 0, 'окно закрылось');
ck((await calls()) === 0, 'владельцу слота не досталось ничего', `вызовов ${await calls()}`);
ck(uploadN === 0, 'и в бакет не ушло ни одного запроса', `запросов ${uploadN}`);

// ── 7. ОТКАЗ НЕ МОЛЧИТ ─────────────────────────────────────────────────────────────────────────
head('7. отказ бакета');
uploadN = 0; uploadFails = true; uploadDelayMs = 0;
await mount({});
await paste({ count: 2 });
await page.locator('button', { hasText: /^upload all \(2\)$/i }).first().click();
await page.waitForFunction(() => !/uploading/i.test(document.body.innerText), null, { timeout: 20000 }).catch(() => {});
await page.waitForTimeout(600);
const failPill = await pillText();
ck(/failed/i.test(failPill), 'пилюля говорит про отказ словом', `«${failPill}»`);
ck((await calls()) === 0, 'ничего не доставлено — отказ не выдан за успех', `вызовов ${await calls()}`);
if (failPill) await page.locator('body > div > button').filter({ hasText: /failed/i }).first().click();
await page.waitForTimeout(300);
ck((await dialogOpen()) === 1, 'разворот возвращает окно');
ck((await page.locator('button', { hasText: /^retry failed \(2\)$/i }).count()) === 1,
  'и в нём стоит повтор на две строки');
uploadFails = false;
await page.locator('button', { hasText: /^retry failed \(2\)$/i }).first().click();
await page.waitForFunction(() => window.__intake.delivered().length >= 2, null, { timeout: 20000 });
await page.waitForTimeout(400);
ck((await delivered()).length === 2, 'повтор довёз обе', `их ${(await delivered()).length}`);

ck(pageErrors.length === 0, 'за весь прогон ни одного исключения на странице', pageErrors[0] ?? '');

await browser.close();
console.log(bad === 0 ? '\nВСЁ ЗЕЛЁНОЕ' : `\nПРОВАЛОВ: ${bad}`);
process.exit(bad === 0 ? 0 : 1);
