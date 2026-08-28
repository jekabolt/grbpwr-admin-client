#!/usr/bin/env node
// ЗАГРУЗИЛ МЕДИА В МОДАЛКЕ — И ОНО ПРИКРЕПИЛОСЬ ОДИН РАЗ, ТУДА, КУДА ПРОСИЛИ.
//
//   node scripts/media-tray-probe.mjs                прогон
//   node scripts/media-tray-probe.mjs --mutate=twice  вернуть прежнее «загрузил = прикрепил»
//   node scripts/media-tray-probe.mjs --mutate=guard  снять проверку фокуса перед вставкой
//   node scripts/media-tray-probe.mjs --mutate=paste  снять перехват ⌘V в самом поле разметки
//
// Две претензии владельца, обе на одном экране:
//   1. «аплоуд медиа аттачит два раза — когда залил и когда нажал add»;
//   2. «в тасках ссылку может не в то поле закинуть».
//
// Первая проверяется счётом вызовов владельца, вторая — чтением ВСЕХ полей экрана после вставки:
// текст обязан оказаться ровно в одном из них.
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
const pw = resolvePlaywright();
if (!pw) { console.log('playwright не найден — проба пропущена (это не отказ)'); process.exit(0); }
const mod = await import(pw);
const chromium = mod.chromium ?? mod.default?.chromium;
if (!chromium) { console.log('playwright найден, но без chromium — проба пропущена'); process.exit(0); }

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = resolve(HERE, '..');
const outfile = resolve(tmpdir(), `media-tray-${process.pid}.js`);

const MUTATIONS = {
  // Прежнее поведение: приёмка отдаёт загруженное ВЛАДЕЛЬЦУ сразу, ещё в диалоге.
  twice: {
    file: /media-selector\.tsx$/,
    from: '      if (trayMode) {\n        setSelectedMedia((prev) => {',
    to: '      if (false) {\n        setSelectedMedia((prev) => {',
  },
  // Снять перехват вставки в самом поле разметки: ⌘V картинкой снова перестанет открывать приёмку.
  paste: {
    file: /format-bar\.tsx$/,
    from: "      if (!area || e.target !== area) return;",
    to: '      if (area) return;',
  },
  // Снять проверку «фокус действительно доехал»: команда вставки снова начнёт писать туда, где
  // осталось выделение документа, — то есть в чужое поле.
  guard: {
    file: /format-bar\.tsx$/,
    from: "      if (edit.text !== '' && document.activeElement === area) {",
    to: "      if (edit.text !== '') {",
  },
};
if (MUTATE && !MUTATIONS[MUTATE]) {
  console.log(`неизвестная мутация «${MUTATE}»; есть: ${Object.keys(MUTATIONS).join(', ')}`);
  process.exit(2);
}
const mutation = {
  name: 'media-tray-mutation',
  setup(b) {
    const m = MUTATIONS[MUTATE] ?? {};
    b.onLoad({ filter: m.file ?? /media-selector\.tsx$/ }, async (args) => {
      const src = await readFile(args.path, 'utf8');
      if (!src.includes(m.from)) throw new Error('мутация не нашла свою строку');
      return { contents: src.replace(m.from, m.to), loader: 'tsx' };
    });
  },
};

await esbuild({
  entryPoints: [resolve(HERE, 'media-tray-probe-entry.tsx')],
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

const PNG_B64 =
  'iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAYAAABytg0kAAAAFElEQVR4nGP8z8DAwMDAwMDEAAMADgIBAWiJ8fMAAAAASUVORK5CYII=';
const PNG = Buffer.from(PNG_B64, 'base64');

// Библиотека отдаёт два готовых снимка, загрузка — третий. Пусто было бы не библиотекой, а
// пустым экраном: нажать в сетке стало бы нечего, и половина проверок исполнялась бы вхолостую.
const item = (id) => ({
  id,
  media: {
    fullSize: { mediaUrl: `https://cdn.example/${id}-full.png`, width: 2, height: 2 },
    thumbnail: { mediaUrl: `https://cdn.example/${id}-thumb.png`, width: 2, height: 2 },
    blurhash: '',
  },
});
let uploaded = 0;

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1400, height: 1000 } });
const errors = [];
page.on('pageerror', (e) => errors.push(String(e)));
await page.route('http://probe.local/**', (route) =>
  route.fulfill({ status: 200, contentType: 'text/html', body: '<div id="root"></div>' }),
);
await page.route('https://cdn.example/**', (route) =>
  route.fulfill({ status: 200, contentType: 'image/png', body: PNG }),
);
await page.route('http://stub.invalid/**', (route) => {
  const url = route.request().url();
  if (/content\/(image|video)/.test(url)) {
    uploaded += 1;
    return route.fulfill({
      status: 200, contentType: 'application/json',
      body: JSON.stringify({ media: item(900 + uploaded) }),
    });
  }
  if (/content\/usage/.test(url)) {
    return route.fulfill({ status: 200, contentType: 'application/json', body: '{"usage":[]}' });
  }
  // Список библиотеки: свежезагруженное встаёт первым, как на настоящем DESC-порядке.
  const list = [];
  for (let i = uploaded; i > 0; i -= 1) list.push(item(900 + i));
  list.push(item(11), item(12));
  return route.fulfill({
    status: 200, contentType: 'application/json',
    body: JSON.stringify({ list, total: list.length }),
  });
});

await page.goto('http://probe.local/');
await page.addScriptTag({ content: bundle });
await page.evaluate(() => window.__tray.mount());
await page.waitForSelector('[data-desc]', { timeout: 15000 });

const saves = () => page.evaluate(() => window.__tray.saves());
const fields = () => page.evaluate(() => window.__tray.fields());
const desc = () => page.evaluate(() => window.__tray.desc());
const title = () => page.evaluate(() => window.__tray.title());
const focused = () => page.evaluate(() => window.__tray.focused());

/** Вставка файла — настоящее событие `paste`, тем же путём, каким её ловит `usePasteFiles`. */
async function pasteFile() {
  await page.evaluate((b64) => {
    const dt = new DataTransfer();
    const bin = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
    dt.items.add(new File([bin], `shot-${Date.now()}.png`, { type: 'image/png' }));
    document.dispatchEvent(
      new ClipboardEvent('paste', { clipboardData: dt, bubbles: true, cancelable: true }),
    );
  }, PNG_B64);
  await page.waitForTimeout(400);
}

/**
 * Вставка В КОНКРЕТНОЕ ПОЛЕ. `kind='text'` кладёт в буфер и текст, и картинку разом — так и
 * выглядит буфер ворда или фигмы, и на нём проверяется, что текст выигрывает.
 */
async function pasteInto(selector, kind) {
  await page.evaluate(
    ({ selector, kind, b64 }) => {
      const el = document.querySelector(selector);
      if (!el) return;
      const dt = new DataTransfer();
      const bin = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
      dt.items.add(new File([bin], `shot-${Date.now()}.png`, { type: 'image/png' }));
      if (kind === 'text') dt.items.add('копипаста из чужого редактора', 'text/plain');
      el.dispatchEvent(
        new ClipboardEvent('paste', { clipboardData: dt, bubbles: true, cancelable: true }),
      );
    },
    { selector, kind, b64: PNG_B64 },
  );
  await page.waitForTimeout(500);
}

const btn = (re) => page.locator('button', { hasText: re });
const tryClick = async (locator, timeout = 4000) => {
  try {
    await locator.first().click({ timeout });
    return true;
  } catch {
    return false;
  }
};

head('0. прибор: диалог библиотеки открывается и в нём есть, что нажать');
ck(await tryClick(btn(/^attach media$/)), 'кнопка выбора медиа открыла диалог');
await page.waitForTimeout(700);
const tiles = await page.locator('[role="dialog"] img').count();
ck(tiles >= 2, 'в сетке есть плитки библиотеки', `их ${tiles}`);
ck((await saves()).length === 0, 'до единого нажатия владельцу ничего не отдали');

head('1. ЗАГРУЗКА В ДИАЛОГЕ НЕ ПРИКРЕПЛЯЕТ САМА ПО СЕБЕ');
await pasteFile();
// Приёмка опознаётся своей кнопкой отправки: модалка формы сама по себе `role="dialog"`, и счёт
// диалогов был бы зелёным и без неё.
ck(
  (await btn(/^upload( all)?( \(\d+\))?$/i).count()) === 1,
  'приёмка вставленного открылась',
);
const sent = await tryClick(btn(/^upload( all)?( \(1\))?$/i));
ck(sent, 'нажата отправка вставленного');
await page.waitForTimeout(1200);
ck(uploaded === 1, 'файл действительно ушёл в бакет — загрузка настоящая', `загрузок ${uploaded}`);
const afterUpload = await saves();
ck(
  afterUpload.length === 0,
  'ЗАГРУЗКА НИЧЕГО НЕ ПРИКРЕПИЛА: дверь одна — «add all»',
  `вызовов ${afterUpload.length}: ${JSON.stringify(afterUpload)}`,
);
const trayCount = await page.locator('[role="dialog"] >> text=/in the tray/').count();
ck(trayCount === 1, 'зато загруженное лежит в лотке', `лотков ${trayCount}`);

head('2. «add all» отдаёт всё набранное РОВНО ОДИН РАЗ');
// Клик по готовой плитке ПОСЛЕ загрузки — проверка, что набор общий: пока сетка вела свой
// список, выбор мышью затирал загруженное, и «add all» отдавал бы одно вместо двух.
// ПЛИТКА ИМЕННО В СЕТКЕ, а не в лотке: в лотке тоже `img`, и «последняя картинка диалога» — это
// как раз миниатюра лотка, по которой нажатие ничего не выбирает.
const libTile = page.locator('[role="dialog"] img[src*="11-thumb"]');
ck(await tryClick(libTile), 'выбрана ещё и готовая плитка библиотеки');
await page.waitForTimeout(300);
ck(await tryClick(btn(/^add all/i)), 'нажато «add all»');
await page.waitForTimeout(500);
const after = await saves();
const flat = after.flat();
ck(after.length === 1, 'владельца позвали один раз', `вызовов ${after.length}: ${JSON.stringify(after)}`);
ck(
  flat.length === 2 && flat.includes(901),
  'и отдали ОБА — загруженное не затёрлось выбором мышью',
  JSON.stringify(flat),
);

// ── ДИАГНОСТИКА (временная): кто был в фокусе в момент вставки текста ──────────────────────
await page.evaluate(() => {
  window.__trace = [];
  const orig = document.execCommand.bind(document);
  document.execCommand = (cmd, ui, val) => {
    const el = document.activeElement;
    window.__trace.push({
      cmd,
      active: `${el?.tagName?.toLowerCase()}${el?.id ? '#' + el.id : ''}${el?.getAttribute?.('name') ? '[' + el.getAttribute('name') + ']' : ''}`,
      val: String(val ?? '').slice(0, 30),
    });
    const r = orig(cmd, ui, val);
    const el2 = document.activeElement;
    window.__trace.push({ after: `${el2?.tagName?.toLowerCase()}${el2?.id ? '#' + el2.id : ''}`, ok: r });
    return r;
  };
});

head('3. ССЫЛКА ЛОЖИТСЯ В СВОЁ ПОЛЕ, А НЕ В СОСЕДНЕЕ');
// ЗАГОЛОВОК НАБИРАЕТСЯ КЛАВИАТУРОЙ — и это не декорация сценария, а его причина: выделение
// документа остаётся в том поле, где последний раз печатали, и `execCommand` пишет ИМЕННО ТУДА,
// сколько бы раз мы ни звали `focus()` на другом поле. Ровно так и бывает: набрал имя задачи,
// полез прикладывать снимок, описания не трогал.
await page.locator('#title').click();
await page.keyboard.type('sample task');
await page.waitForTimeout(100);
const titleBefore = await title();
ck(titleBefore === 'sample task', 'КОНТРОЛЬ: в заголовке набран текст, выделение осталось в нём', titleBefore);
ck(await tryClick(btn(/^media$/)), 'нажата кнопка media панели форматирования');
await page.waitForTimeout(700);
const firstTile = page.locator('[role="dialog"] img').first();
ck(await tryClick(firstTile), 'выбран снимок в сетке');
await page.waitForTimeout(300);
ck(await tryClick(btn(/^add all/i)), 'нажато «add all» в панели');
await page.waitForTimeout(600);
const d = await desc();
ck(/!\[/.test(d), 'разметка снимка попала в ОПИСАНИЕ', JSON.stringify(d.slice(0, 80)));
ck((await title()) === titleBefore, 'поле заголовка не изменилось', JSON.stringify(await title()));
const dirty = (await fields()).filter(
  (f) => !/description/.test(f.where) && f.value && /!\[|https?:\/\//.test(f.value),
);
ck(
  dirty.length === 0,
  'и НИ ОДНО другое поле экрана не получило ни куска ссылки',
  JSON.stringify(dirty),
);

// СЛЕД ВСТАВКИ — не диагностика ради лога, а инвариант: команда `insertText` пишет ТУДА, ГДЕ
// ВЫДЕЛЕНИЕ, поэтому звать её позволено только с фокусом в своём поле. Пустой след законен: в
// диалоговом случае фокус не доезжает вовсе, и правка идёт запасным путём, адресованным узлу.
const trace = await page.evaluate(() => window.__trace);
ck(
  trace.filter((t) => t.cmd).every((t) => /textarea/.test(t.active)),
  'команда вставки звалась только с фокусом в поле описания (или не звалась вовсе)',
  JSON.stringify(trace),
);

head('4. ⌘V КАРТИНКОЙ ПРЯМО В ПОЛЕ РАЗМЕТКИ');
// Просьба владельца: «⌘V картинкой в маркдауне — сразу модалка аплоуда и сразу инлайн, без
// кнопки медиа». Проверяется весь путь: вставка в поле → приёмка → загрузка → разметка в тексте.
await page.locator('[data-desc]').click();
// Поле уже не пустое (раздел 3 положил в него разметку), а каретка после клика встаёт ТУДА, КУДА
// попал курсор. Чтобы проверять место вставки, поле сначала очищается целиком.
await page.keyboard.press('ControlOrMeta+a');
await page.keyboard.type('before ');
const uploadsBefore = uploaded;
await pasteInto('[data-desc]', 'image');
// ПРИЁМКА ОПОЗНАЁТСЯ КНОПКОЙ ОТПРАВКИ, а не числом диалогов: модалка формы сама по себе
// `role="dialog"`, и счёт «больше нуля» был бы зелёным всегда.
const upload = () => btn(/^upload( all)?( \(\d+\))?$/i).count();
ck((await upload()) === 1, 'вставка картинки В ПОЛЕ открыла приёмку — кнопку медиа нажимать не пришлось');
ck(await tryClick(btn(/^upload( all)?( \(1\))?$/i)), 'нажата отправка вставленного');
await page.waitForTimeout(1200);
ck(uploaded === uploadsBefore + 1, 'файл ушёл в бакет', `загрузок ${uploaded}`);
const pasted = await desc();
ck(/!\[media 90\d\]\(https:\/\/cdn\.example\//.test(pasted), 'разметка снимка встала в текст', JSON.stringify(pasted));
ck(pasted.startsWith('before'), 'и встала ПОСЛЕ набранного, а не вместо него', JSON.stringify(pasted.slice(0, 24)));
ck((await title()) === 'sample task', 'заголовок по-прежнему цел', JSON.stringify(await title()));

// ТЕКСТ ОСТАЁТСЯ ТЕКСТОМ. Это не придирка: буфер ворда и фигмы несёт текст И картинку разом, и
// перехват «по наличию картинки» отнял бы обычную вставку у всех, кто копирует оттуда.
const uploadsAfter = uploaded;
ck((await upload()) === 0, 'КОНТРОЛЬ: после отправки приёмка закрылась');
await pasteInto('[data-desc]', 'text');
await page.waitForTimeout(400);
ck((await upload()) === 0, 'вставка текста приёмку НЕ открывает');
ck(uploaded === uploadsAfter, 'и ничего не грузит', `загрузок ${uploaded}`);

head('5. исключения');
ck(errors.length === 0, 'ни одного исключения на странице', errors.slice(0, 2).join(' | '));

await browser.close();
console.log(bad ? `\nПРОВАЛОВ: ${bad}` : '\nВСЁ ЗЕЛЁНОЕ');
process.exit(bad ? 1 : 0);
