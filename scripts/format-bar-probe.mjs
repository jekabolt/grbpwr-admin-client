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

const MUTATE = process.argv.includes('--mutate')
  ? 'code'
  : ((process.argv.find((a) => a.startsWith('--mutate=')) ?? '').split('=')[1] ?? '');

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

// МУТАЦИИ ЖИВУТ В ПАМЯТИ СБОРЩИКА и возвращают РОВНО те строки, которыми была починка.
//   code — дефект Д2: без среза хвостовых переводов тройной клик даёт ограду вместо бэктиков.
//   pad  — отбивка одним переводом строки вместо пустой строки (F3): снимки перестают быть
//          галереей и ложатся столбцом внутри текста.
//   focus — вернуть ГОЛЫЙ `area.focus()` в `apply`: прокрутка страницы обязана снова прыгнуть.
const MUTATIONS = {
  focus: {
    file: /format-bar\.tsx$/,
    loader: 'tsx',
    from: '      area.focus({ preventScroll: true });\n      let done = false;',
    to: '      area.focus();\n      let done = false;',
  },
  code: {
    from: "  let e = end;\n  while (e > start && text[e - 1] === '\\n') e -= 1;",
    to: '  const e = end;',
  },
  pad: {
    from: "  const next = `${leadPad(text.slice(0, s))}${body}${tailPad(text.slice(e))}`;",
    to:
      "  const next = `${s > 0 && text[s - 1] !== '\\n' ? '\\n' : ''}${body}" +
      "${e < text.length && text[e] !== '\\n' ? '\\n' : ''}`;",
  },
};
if (MUTATE && !MUTATIONS[MUTATE]) {
  console.log(`неизвестная мутация «${MUTATE}»; есть: ${Object.keys(MUTATIONS).join(', ')}`);
  process.exit(2);
}
const mutation = {
  name: 'format-bar-mutation',
  setup(b) {
    const m = MUTATIONS[MUTATE] ?? {};
    b.onLoad({ filter: m.file ?? /format-edits\.ts$/ }, async (args) => {
      const src = await readFile(args.path, 'utf8');
      if (!src.includes(m.from)) throw new Error('мутация не нашла свою строку');
      return { contents: src.replace(m.from, m.to), loader: m.loader ?? 'ts' };
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
const PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAYAAABytg0kAAAAFElEQVR4nGP8z8DAwMDAwMDEAAMADgIBAWiJ8fMAAAAASUVORK5CYII=',
  'base64',
);
await page.route('http://probe.local/pix*.png', (route) =>
  route.fulfill({ status: 200, contentType: 'image/png', body: PNG }),
);
// Библиотека медиа за пикером ОТВЕЧАЕТ ПУСТО, а не молчит: неотвеченный запрос дал бы окно в
// вечной загрузке, и «пикер открылся» смешалось бы с «пикер завис».
await page.route('http://stub.invalid/**', (route) =>
  route.fulfill({ status: 200, contentType: 'application/json', body: '{"list":[],"total":0}' }),
);

await page.goto('http://probe.local/');
await page.addScriptTag({ content: bundle });
await page.evaluate(() => window.__formatBar.mount({ heightPx: 300 }));
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
// Диалог обязан закрыться: Radix держит на странице `pointer-events: none`, пока он открыт, и
// оставленный открытым он ломает ВСЕ последующие секции — а выглядело бы это как их дефект.
await page.keyboard.press('Escape');
await page.waitForTimeout(400);
ck((await page.locator('[role="dialog"]').count()) === 0, 'пикер закрылся по Esc');

head('4. галерея: отбивка проверяется ОТРИСОВКОЙ, а не строкой');
// ДВА КАДРА ДАННЫМИ, А НЕ ССЫЛКОЙ: внешний адрес в стенде не загрузится, и `NoteImage` честно
// покажет вместо снимка ссылку — тогда «ряд или столбец» мерить было бы не на чем.
// Адрес именно http: разметчик показывает картинкой ВНЕШНИЙ адрес (`/^https?:\/\//`), а не
// data-url — тот законно уходит в плашку. Снимок отдаётся стендом настоящими байтами: не
// загрузившийся кадр `NoteImage` заменит ссылкой, и мерить «ряд или столбец» стало бы нечем.
const PIX = 'http://probe.local/pix.png';
const layout = async (source) => {
  await page.evaluate((src) => window.__formatBar.render(src), source);
  await page.waitForTimeout(400);
  return page.evaluate(() => {
    const imgs = [...document.querySelectorAll('[data-note] img')];
    if (imgs.length < 2) return { imgs: imgs.length };
    const a = imgs[0].getBoundingClientRect();
    const b = imgs[1].getBoundingClientRect();
    return { imgs: imgs.length, sameRow: Math.abs(a.top - b.top) < 2, apart: b.left - a.left };
  });
};

// Каретка на пустой строке СРАЗУ ПОД текстом — тот самый случай F3.
const base = 'a photo of the sleeve\n';
const withMedia = await page.evaluate(
  ([t, pix]) => window.__formatBar.insertMedia(t, t.length, [{ id: 1, url: pix }, { id: 2, url: pix }]),
  [base, PIX],
);
const good = await layout(withMedia);
ck(good.imgs === 2, 'разметчик показал оба снимка картинками', `их ${good.imgs}`);
ck(good.sameRow === true && good.apart > 0, 'и положил их В РЯД — это галерея', JSON.stringify(good));

// НЕГАТИВНЫЙ КОНТРОЛЬ — старая отбивка одним переводом строки. Без него зелень выше не отличима
// от «разметчик кладёт в ряд что угодно».
const oldWay = `${base}![media 1](${PIX})\n![media 2](${PIX})`;
const column = await layout(oldWay);
ck(column.imgs === 2, 'в контроле тоже два снимка', `их ${column.imgs}`);
ck(column.sameRow === false, 'с одним переводом строки они ложатся СТОЛБЦОМ — прибор различает', JSON.stringify(column));

// ── 5. ПРОКРУТКА СТРАНИЦЫ ПРИ НАЖАТИИ КНОПКИ ──────────────────────────────────────────────────
//
// `apply()` зовёт `area.focus()`, а `focus()` ПО УМОЛЧАНИЮ подтягивает элемент в зону видимости и
// утаскивает за собой скроллер страницы. Мерится САМА ПРОКРУТКА, а не каретка: каретку ставит
// `useLayoutEffect`, и по ней дефект не виден вовсе.
//
// ДВЕ ГЕОМЕТРИИ, и разница между ними — весь ответ:
//   A. полоса В ПОТОКЕ прямо над полем — так собран редактор заметки (`note-editor.tsx:291-293`:
//      один блок, `<FormatBar>` и `<textarea>` подряд). Кнопка достижима, только пока верх поля
//      на экране, — а `focus()` не прокручивает к тому, чей верхний край уже виден.
//   B. полоса ЛИПКАЯ — кнопка достижима и тогда, когда поле ушло верхом выше вьюпорта.
//
// ПОЛОЖИТЕЛЬНЫЙ КОНТРОЛЬ ОБЯЗАТЕЛЕН: «прокрутка не изменилась» одинаково верно и когда починка
// работает, и когда кнопка вообще не нажалась. Поэтому у каждого замера проверяется, что текст
// РЕАЛЬНО изменился, и отдельно — что кнопка была достижима мышью.
head('5. прокрутка страницы при нажатии кнопки');

const LONG = Array.from({ length: 120 }, (_, i) => `line ${i + 1} of the note text`).join('\n');

async function stand({ heightPx, spacerPx = 1200, stickyBar = false }) {
  await page.evaluate(
    ([h, sp, st]) => window.__formatBar.mount({ heightPx: h, spacerPx: sp, stickyBar: st }),
    [heightPx, spacerPx, stickyBar],
  );
  await page.waitForSelector('[data-area]', { timeout: 15000 });
  const pos = Math.floor(LONG.length / 2);
  await page.evaluate(([t, p]) => window.__formatBar.set(t, p, p + 4), [LONG, pos]);
}

/**
 * НАСТОЯЩЕЕ НАЖАТИЕ МЫШЬЮ по координатам вьюпорта.
 *
 * Не локатором Playwright: тот перед кликом сам «scrolling into view if needed» — прибор двигал бы
 * ровно ту величину, которую мерит. Но и не `el.click()`: у всех кнопок панели стоит
 * `onMouseDown={e => e.preventDefault()}` (`format-bar.tsx:219,231,242,266`), то есть НАСТОЯЩЕЕ
 * нажатие фокус из поля не уводит, а синтетический `click()` вообще не трогает фокус — разницу
 * между «фокус остался» и «фокус не двигался» на нём не увидеть, а весь дефект именно про неё:
 * `focus()` на УЖЕ сфокусированном элементе не прокручивает ничего.
 */
async function pressMouse({ keepFocus }) {
  if (!keepFocus) await page.evaluate(() => window.__formatBar.blur());
  await page.waitForTimeout(80);
  const box = await page.evaluate(() => {
    const b = [...document.querySelectorAll('button')].find((x) => (x.textContent ?? '').trim() === 'bold');
    if (!b) return null;
    const r = b.getBoundingClientRect();
    const a = document.querySelector('[data-area]').getBoundingClientRect();
    return {
      x: r.left + r.width / 2,
      y: r.top + r.height / 2,
      reachable: r.top >= 0 && r.bottom <= window.innerHeight && r.left >= 0,
      top: Math.round(a.top),
      height: Math.round(a.height),
      vh: window.innerHeight,
    };
  });
  const before = await page.evaluate(() => window.__formatBar.scrollY());
  const wasFocused = await page.evaluate(() => window.__formatBar.focused());
  const textBefore = await text();
  if (!box || !box.reachable) return { ...box, before, after: before, changed: false, wasFocused };
  await page.mouse.click(box.x, box.y);
  await page.waitForTimeout(250);
  const after = await page.evaluate(() => window.__formatBar.scrollY());
  return { ...box, before, after, changed: (await text()) !== textBefore, wasFocused };
}

const parkAtButtonTop = () =>
  page.evaluate(() => {
    const b = [...document.querySelectorAll('button')].find((x) => (x.textContent ?? '').trim() === 'bold');
    window.scrollTo(0, Math.round(b.getBoundingClientRect().top + window.scrollY));
  });

const parkPastFieldTop = (px) =>
  page.evaluate((over) => {
    const a = document.querySelector('[data-area]');
    window.scrollTo(0, Math.round(a.getBoundingClientRect().top + window.scrollY + over));
  }, px);

// ── 5.A ГЕОМЕТРИЯ РЕДАКТОРА ЗАМЕТКИ. Полоса в потоке; прокрутка уведена в САМОЕ НИЖНЕЕ положение,
//      при котором кнопку ещё можно нажать. Высоты: 300 — узкая заметка; 540 — те самые `60vh`
//      при вьюпорте 900; 1800 и 3600 — поле, растянутое мышью (`resize-y`) вдвое и вчетверо выше
//      экрана. Если дефект живёт в заметке, он обязан быть виден хоть на одной из этих высот.
for (const h of [300, 540, 1800, 3600]) {
  await stand({ heightPx: h });
  await parkAtButtonTop();
  await page.waitForTimeout(120);
  const hot = await pressMouse({ keepFocus: true });
  ck(hot.reachable && hot.changed,
    `ПОЛОЖИТЕЛЬНЫЙ КОНТРОЛЬ h=${h}: кнопка достижима мышью и текст изменился`,
    `достижима=${hot.reachable} изменился=${hot.changed}`);
  ck(hot.top >= 0,
    `h=${h}: когда кнопка достижима, верх поля НА ЭКРАНЕ — прокручивать focus() не к чему`,
    `верх поля ${hot.top}, высота ${hot.height}, вьюпорт ${hot.vh}`);
  ck(hot.after === hot.before,
    `h=${h}, фокус в поле: прокрутка не сдвинулась`,
    `${hot.before} → ${hot.after}`);

  await parkAtButtonTop();
  await page.waitForTimeout(120);
  const cold = await pressMouse({ keepFocus: false });
  ck(cold.reachable && cold.changed,
    `ПОЛОЖИТЕЛЬНЫЙ КОНТРОЛЬ h=${h} (фокус снаружи): кнопка сработала`,
    `достижима=${cold.reachable} изменился=${cold.changed}`);
  ck(!cold.wasFocused, `h=${h}: фокус действительно был СНАРУЖИ поля перед нажатием`);
  ck(cold.after === cold.before,
    `h=${h}, фокус снаружи: прокрутка не сдвинулась`,
    `${cold.before} → ${cold.after}`);
}

// ── 5.Б ЛИПКАЯ ПОЛОСА — конфигурация соседней ветки. Кнопка достижима, а верх поля уведён ВЫШЕ
//      кромки вьюпорта: ровно то положение, из которого `focus()` обязан тянуть поле в вид.
//      ФОКУС СНАРУЖИ: `focus()` на уже сфокусированном элементе не делает ничего по устройству,
//      поэтому дефект живёт только там, где фокус ушёл (закрылась модалка, кликнули в показ).
for (const over of [200, 800]) {
  await stand({ heightPx: 2400, stickyBar: true });
  await parkPastFieldTop(over);
  await page.waitForTimeout(120);
  const cold = await pressMouse({ keepFocus: false });
  ck(cold.reachable && cold.changed,
    `ПОЛОЖИТЕЛЬНЫЙ КОНТРОЛЬ липкая/${over}: кнопка сработала`,
    `достижима=${cold.reachable} изменился=${cold.changed}`);
  ck(cold.top < 0, `липкая/${over}: верх поля выше кромки вьюпорта`, `верх поля ${cold.top}`);
  ck(cold.after === cold.before,
    `ЛИПКАЯ ПОЛОСА, верх поля на ${over} выше кромки, фокус снаружи: прокрутка не сдвинулась`,
    `${cold.before} → ${cold.after} (сдвиг ${cold.after - cold.before})`);
}

// ── 5.В ТА ЖЕ ЛИПКАЯ ПОЛОСА, НО ФОКУС В ПОЛЕ. Так выглядит обычный жест: текст выделен мышью,
//      значит фокус в поле, и `onMouseDown` кнопки его оттуда не отпускает.
await stand({ heightPx: 2400, stickyBar: true });
await parkPastFieldTop(800);
await page.waitForTimeout(120);
const stickyHot = await pressMouse({ keepFocus: true });
ck(stickyHot.reachable && stickyHot.changed,
  'ПОЛОЖИТЕЛЬНЫЙ КОНТРОЛЬ липкая/фокус в поле: кнопка сработала');
ck(stickyHot.wasFocused, 'липкая/фокус в поле: фокус действительно стоял в поле');
ck(stickyHot.after === stickyHot.before,
  'ЛИПКАЯ ПОЛОСА, фокус В ПОЛЕ: прокрутка не сдвинулась',
  `${stickyHot.before} → ${stickyHot.after} (сдвиг ${stickyHot.after - stickyHot.before})`);

// ── 5.Г КТО ИМЕННО ДВИГАЕТ ПРОКРУТКУ И С КАКОЙ ВЫСОТЫ ПОЛЯ ───────────────────────────────────
//
// `apply()` делает подряд две вещи, и обе умеют прокручивать: `area.focus()` тянет элемент в вид,
// `setSelectionRange()` тянет в вид КАРЕТКУ. Починка `preventScroll` лечит только первую, поэтому
// разделить их обязательно — иначе «починил» окажется словом, а не фактом.
//
// Заодно — с какой высоты поля это начинается. Геометрия редактора заметки, вьюпорт 900.
const sweep = [];
for (const h of [300, 540, 900, 1200, 1400, 1600, 1700, 1750, 1800, 1900, 2400, 3600]) {
  await stand({ heightPx: h });
  await parkAtButtonTop();
  await page.waitForTimeout(80);
  const pos = Math.floor(LONG.length / 2);
  const r = await page.evaluate(async ([caret]) => {
    const settle = () => new Promise((res) => requestAnimationFrame(() => requestAnimationFrame(res)));
    const a = document.querySelector('[data-area]');
    const b = [...document.querySelectorAll('button')].find((x) => (x.textContent ?? '').trim() === 'bold');
    const park = async () => {
      a.blur();
      window.scrollTo(0, Math.round(b.getBoundingClientRect().top + window.scrollY));
      await settle();
    };
    const shot = async (act) => {
      await park();
      const before = Math.round(window.scrollY);
      act(a);
      await settle();
      return Math.round(window.scrollY) - before;
    };
    return {
      bare: await shot((el) => el.focus()),
      guard: await shot((el) => el.focus({ preventScroll: true })),
      guardSel: await shot((el) => { el.focus({ preventScroll: true }); el.setSelectionRange(caret, caret + 4); }),
      // может ли поле прокрутиться ВНУТРИ СЕБЯ: пока может — каретку показывает оно само и
      // страницу трогать незачем; как только текст помещается целиком, показывать каретку
      // приходится странице
      inner: a.scrollHeight - a.clientHeight,
      vh: window.innerHeight,
    };
  }, [pos]);
  sweep.push({ h, ...r });
}
console.log(`  ··· сдвиг прокрутки, вьюпорт ${sweep[0].vh}: ` +
  sweep.map((r) => `h=${String(r.h).padStart(4)}: голый ${String(r.bare).padStart(4)} / защищённый ${r.guard} / +каретка ${r.guardSel} / запас прокрутки внутри поля ${r.inner}`).join('\n      '));

const jumps = sweep.filter((r) => r.bare !== 0);
ck(jumps.length > 0,
  'КОНТРОЛЬ МЕХАНИЗМА: голый focus() хотя бы на одной высоте ДВИГАЕТ прокрутку — ломаться есть чему',
  jumps.length ? `начиная с h=${jumps[0].h} (сдвиг ${jumps[0].bare})` : 'ни на одной');
ck(sweep.every((r) => r.guard === 0),
  'ПРИЧИНА — ИМЕННО focus(): с preventScroll прокрутка стоит на ВСЕХ высотах',
  sweep.map((r) => `${r.h}:${r.guard}`).join(' '));
ck(sweep.every((r) => r.guardSel === 0),
  'setSelectionRange страницу НЕ двигает — второго источника нет, одного слова хватает',
  sweep.map((r) => `${r.h}:${r.guardSel}`).join(' '));
ck(sweep.filter((r) => r.h <= sweep[0].vh).every((r) => r.bare === 0),
  'на поле НЕ ВЫШЕ вьюпорта дефекта нет ни при каком фокусе',
  sweep.filter((r) => r.h <= sweep[0].vh).map((r) => `${r.h}:${r.bare}`).join(' '));

// ── 5.Д ПОЛЕ НИЖЕ ФОЛЬДА ПРИ ОБЫЧНОЙ ВЫСОТ�Е. Все замеры выше ставили кнопку к ВЕРХНЕЙ кромке —
//      это лучший случай для НИЗА поля: 60vh целиком помещается на экране. В жизни страница стоит
//      как угодно: кнопка у нижней кромки — и поле уходит низом за фольд, а каретка вместе с ним.
//      Если дефект ловится и здесь, дергать `resize-y` не нужно вовсе, и он куда ближе к обычному
//      дню, чем «поле, растянутое вдвое выше экрана».
//
//      Заметка КОРОТКАЯ и помещается в поле целиком: именно тогда у поля нет запаса прокрутки
//      внутри себя и показать каретку может только страница (см. 5.Г).
const SHORT = Array.from({ length: 14 }, (_, i) => `short note line ${i + 1}`).join('\n');
for (const h of [540, 300]) {
  await stand({ heightPx: h });
  await page.evaluate(([t]) => window.__formatBar.set(t, t.length, t.length), [SHORT]);
  const parked = await page.evaluate(() => {
    const b = [...document.querySelectorAll('button')].find((x) => (x.textContent ?? '').trim() === 'bold');
    const abs = b.getBoundingClientRect().top + window.scrollY;
    // кнопка у НИЖНЕЙ кромки вьюпорта — самое низкое положение страницы, при котором её ещё жмут
    window.scrollTo(0, Math.round(abs - (window.innerHeight - 60)));
    const a = document.querySelector('[data-area]').getBoundingClientRect();
    return { areaBottom: Math.round(a.bottom), vh: window.innerHeight,
             inner: (() => { const el = document.querySelector('[data-area]'); return el.scrollHeight - el.clientHeight; })() };
  });
  await page.waitForTimeout(120);
  const cold = await pressMouse({ keepFocus: false });
  ck(cold.reachable && cold.changed,
    `ПОЛОЖИТЕЛЬНЫЙ КОНТРОЛЬ низ/h=${h}: кнопка достижима и текст изменился`,
    `достижима=${cold.reachable} изменился=${cold.changed}`);
  ck(parked.areaBottom > parked.vh,
    `низ/h=${h}: низ поля действительно ЗА ФОЛЬДОМ`,
    `низ поля ${parked.areaBottom}, вьюпорт ${parked.vh}, запас прокрутки внутри поля ${parked.inner}`);
  ck(cold.after === cold.before,
    `НИЗ ПОЛЯ ЗА ФОЛЬДОМ, h=${h}, короткая заметка, фокус снаружи: прокрутка не сдвинулась`,
    `${cold.before} → ${cold.after} (сдвиг ${cold.after - cold.before})`);

  // ТОТ ЖЕ ЖЕСТ, НО ФОКУС В ПОЛЕ. Так выглядит обычное форматирование: текст выделили мышью,
  // значит фокус в поле, а `onMouseDown` кнопки его оттуда не отпускает. `focus()` на УЖЕ
  // сфокусированном элементе не делает ничего — граница дефекта проходит ровно здесь.
  await page.evaluate(() => {
    const b = [...document.querySelectorAll('button')].find((x) => (x.textContent ?? '').trim() === 'bold');
    const abs = b.getBoundingClientRect().top + window.scrollY;
    window.scrollTo(0, Math.round(abs - (window.innerHeight - 60)));
  });
  await page.waitForTimeout(120);
  const hot = await pressMouse({ keepFocus: true });
  ck(hot.reachable && hot.changed && hot.wasFocused,
    `ПОЛОЖИТЕЛЬНЫЙ КОНТРОЛЬ низ/h=${h}/фокус в поле: кнопка сработала при фокусе в поле`,
    `достижима=${hot.reachable} изменился=${hot.changed} фокус=${hot.wasFocused}`);
  ck(hot.after === hot.before,
    `НИЗ ПОЛЯ ЗА ФОЛЬДОМ, h=${h}, ФОКУС В ПОЛЕ: прокрутка не сдвинулась`,
    `${hot.before} → ${hot.after} (сдвиг ${hot.after - hot.before})`);
}

// ── 5.6 КОНТРОЛЬ ПРИБОРА: прокрутка вообще подвижна в этой конфигурации. Без него все три
//      зелёные строки выше были бы одинаково зелёными на странице, которая не прокручивается.
const movable = await page.evaluate(() => {
  window.__formatBar.scrollTo(0);
  const zero = window.__formatBar.scrollY();
  window.__formatBar.scrollTo(900);
  const nine = window.__formatBar.scrollY();
  window.__formatBar.scrollTo(0);
  return { zero, nine };
});
ck(movable.zero === 0 && movable.nine === 900,
  'КОНТРОЛЬ ПРИБОРА: страница в этой конфигурации прокручивается на 900',
  JSON.stringify(movable));

ck(errors.length === 0, 'ни одного исключения на странице', errors[0] ?? '');
await browser.close();
console.log(bad === 0 ? '\nВСЁ ЗЕЛЁНОЕ' : `\nПРОВАЛОВ: ${bad}`);
process.exit(bad === 0 ? 0 : 1);
