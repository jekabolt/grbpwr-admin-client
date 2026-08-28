#!/usr/bin/env node
// ПОКАЗ ЗАМЕТКИ ЕДЕТ ЗА КАРЕТКОЙ — НА ЖИВОЙ ВЁРСТКЕ.
//
//   node scripts/note-preview-sync-probe.mjs                прогон
//   node scripts/note-preview-sync-probe.mjs --mutate=listen  снять подписку на движение каретки
//   node scripts/note-preview-sync-probe.mjs --mutate=guard   снять запрет двигать показ без фокуса
//   node scripts/note-preview-sync-probe.mjs --mutate=steady  снять проверку «блок и так виден»
//
// Мутации живут В БАНДЛЕ, репозиторий не трогается. Каждая обязана покраснить СВОЙ раздел — иначе
// раздел сторожит мёртвый код.
//
// Почему браузер: «показ переместился в то же место» — это прокрутка внутреннего контейнера
// относительно коробки блока. Ни одной из трёх величин вне вёрстки не существует, и таблицей
// входа-выхода тут доказывать нечего.
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
const outfile = resolve(tmpdir(), `note-preview-${process.pid}.js`);

const MUTATIONS = {
  // Обезвредить сам обработчик, а не одну подписку: подписок две (документ и поле — разные
  // браузеры сообщают о каретке по-разному), и снятие одной из них ничего бы не доказало.
  listen: {
    from: '    const onSelect = () => syncPreview();',
    to: '    const onSelect = () => {};',
  },
  guard: {
    from: '    if (document.activeElement !== area) return;',
    to: '    if (!area) return;',
  },
  steady: {
    from: '    if (r.top >= box.top + EDGE && r.bottom <= box.bottom - EDGE) return;',
    to: '    void EDGE;',
  },
};
if (MUTATE && !MUTATIONS[MUTATE]) {
  console.log(`неизвестная мутация «${MUTATE}»; есть: ${Object.keys(MUTATIONS).join(', ')}`);
  process.exit(2);
}
const mutation = {
  name: 'note-preview-mutation',
  setup(b) {
    const m = MUTATIONS[MUTATE] ?? {};
    b.onLoad({ filter: /note-editor\.tsx$/ }, async (args) => {
      const src = await readFile(args.path, 'utf8');
      if (!src.includes(m.from)) throw new Error('мутация не нашла свою строку');
      return { contents: src.replace(m.from, m.to), loader: 'tsx' };
    });
  },
};

await esbuild({
  entryPoints: [resolve(HERE, 'note-preview-sync-entry.tsx')],
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

// СТИЛИ АДМИНКИ — НЕ УКРАШЕНИЕ. Без них показ не прокручивается вовсе (`overflow-y-auto` не
// существует), и весь этот файл был бы зелёным ни о чём. Нет собранного `dist` — честный пропуск.
function adminCss() {
  const dir = resolve(REPO, 'dist/assets');
  if (!existsSync(dir)) return null;
  const files = execFileSync('find', [dir, '-maxdepth', '1', '-name', '*.css'], { encoding: 'utf8' })
    .split('\n').filter(Boolean);
  if (!files.length) return null;
  return files.map((f) => readFileSync(f, 'utf8')).join('\n');
}
const CSS = adminCss();
if (!CSS) {
  console.log('стили админки не собраны (нет dist/assets/*.css) — проба пропущена: без них показ');
  console.log('не прокручивается, и любой её ответ был бы ложным. соберите `yarn build`.');
  process.exit(0);
}

let bad = 0;
const ck = (ok, what, d = '') => { if (!ok) bad++; console.log(`${ok ? '  ok  ' : '  FAIL'} ${what}${d ? `  — ${d}` : ''}`); };
const head = (s) => console.log(`\n${s}`);

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1400, height: 1000 } });
const errors = [];
page.on('pageerror', (e) => errors.push(String(e)));
await page.route('http://probe.local/**', (route) =>
  route.fulfill({ status: 200, contentType: 'text/html', body: '<div id="root"></div>' }),
);
await page.route('http://stub.invalid/**', (route) =>
  route.fulfill({ status: 200, contentType: 'application/json', body: '{"list":[],"total":0}' }),
);

await page.goto('http://probe.local/');
await page.addStyleTag({ content: CSS });
await page.addScriptTag({ content: bundle });
await page.evaluate(() => window.__notePreview.mount());
await page.waitForSelector('textarea[name="noteContent"]', { timeout: 15000 });

// Заметка ЗАВЕДОМО ДЛИННЕЕ показа: раздел — заголовок, абзац из двух строк и пустая строка,
// то есть заголовок раздела k стоит на строке 4k. Ничего сетевого в тексте нет намеренно:
// карточка файла тянула бы запрос и меняла высоту показа уже после замера.
const SECTIONS = 60;
const NOTE = Array.from({ length: SECTIONS }, (_, k) =>
  `## section ${k}\nbody of section ${k}, first line\nbody of section ${k}, second line\n`,
).join('\n');
const DEEP = 4 * 40; // строка заголовка сорокового раздела

const pane = () => page.evaluate(() => window.__notePreview.pane());
const anchor = (line) => page.evaluate((l) => window.__notePreview.anchor(l), line);
const visible = () => page.evaluate(() => window.__notePreview.visible());
const caretTo = async (line) => {
  await page.evaluate((l) => window.__notePreview.caretTo(l), line);
  await page.waitForTimeout(150);
};
const setText = async (t) => {
  await page.evaluate((v) => window.__notePreview.set(v), t);
  await page.waitForTimeout(350);
};

await setText(NOTE);

head('0. прибор: показ вообще прокручивается');
const m0 = await pane();
ck(m0.room > 0, 'окно показа — настоящий скроллер, стили доехали', JSON.stringify(m0));
const lines = await page.evaluate(() => window.__notePreview.anchorLines());
ck(lines.length > SECTIONS, 'якорей в показе больше, чем разделов', `их ${lines.length}`);
ck(lines.includes(DEEP), `у строки ${DEEP} есть свой якорь`, `первые: ${lines.slice(0, 6).join(',')}`);

head('1. каретка уводит показ в то же место');
await caretTo(0);
const topM = await pane();
const deepBefore = await anchor(DEEP);
ck(topM.scrollTop === 0, 'каретка в начале — показ в начале', JSON.stringify(topM));
ck(
  deepBefore && !deepBefore.visible,
  `КОНТРОЛЬ: пока каретка в начале, строка ${DEEP} показа НЕ ВИДНА`,
  JSON.stringify(deepBefore),
);
await caretTo(DEEP);
const deepAfter = await anchor(DEEP);
const deepM = await pane();
ck(
  (await page.evaluate(() => window.__notePreview.caretLine())) === DEEP,
  'каретка действительно встала на нужную строку',
);
ck(deepAfter && deepAfter.visible, `показ подъехал: строка ${DEEP} видна целиком`, JSON.stringify(deepAfter));
ck(deepM.scrollTop > 0, 'и это именно прокрутка показа, а не перерисовка', `scrollTop ${deepM.scrollTop}`);
await caretTo(0);
const backHome = await anchor(0);
ck(backHome && backHome.visible, 'возврат каретки в начало возвращает и показ', JSON.stringify(backHome));

head('2. фокус НЕ в поле — показ не трогаем');
await caretTo(DEEP);
await page.evaluate(() => window.__notePreview.focusName());
await page.evaluate(() => window.__notePreview.paneScrollTo(0));
ck(
  (await page.evaluate(() => window.__notePreview.focused())) === false,
  'КОНТРОЛЬ: фокус ушёл из поля (в поле имени, оно тут же в шапке)',
);
await setText(`${NOTE}\ntail line\n`);
const idleM = await pane();
ck(
  idleM.scrollTop === 0,
  'перерисовка при фокусе снаружи НЕ утащила показ под каретку',
  `scrollTop ${idleM.scrollTop}`,
);

head('3. правка текста пропом тоже доезжает до показа');
await caretTo(DEEP);
await page.evaluate(() => window.__notePreview.paneScrollTo(0));
ck((await page.evaluate(() => window.__notePreview.focused())) === true, 'КОНТРОЛЬ: фокус в поле');
ck((await pane()).scrollTop === 0, 'КОНТРОЛЬ: показ сброшен в начало руками');
await setText(`${NOTE}\nsecond tail line\n`);
const typedM = await pane();
const typedLine = await page.evaluate(() => window.__notePreview.caretLine());
const typedAnchor = await anchor(typedLine <= DEEP ? DEEP : lines.filter((l) => l <= typedLine).pop());
ck(typedM.scrollTop > 0, 'после правки показ сам вернулся к месту каретки', `scrollTop ${typedM.scrollTop}, каретка на строке ${typedLine}`);
ck(typedAnchor && typedAnchor.visible, 'и место каретки видно целиком', JSON.stringify(typedAnchor));

head('4. видимый блок не дёргаем');
await setText(NOTE);
await caretTo(DEEP);
const steadyBefore = await pane();
// Блок берётся НЕ ЛЮБОЙ ВИДИМЫЙ, а видимый С ЗАПАСОМ ОТ КРОМОК: у самой кромки «виден» у пробы и
// «виден» у редактора расходятся на его отступ (EDGE), и раздел ловил бы это расхождение вместо
// дрожания. И не у верхней трети: туда блок ставит сама подводка, там сдвиг был бы нулевым и без
// проверки «и так виден» — то есть мутация осталась бы незамеченной.
const seen = [];
for (const l of (await visible()).filter((l) => l > DEEP)) {
  const b = await anchor(l);
  if (b && b.top > 260 && b.bottom < steadyBefore.clientHeight - 40) seen.push(l);
}
ck(seen.length > 0, 'КОНТРОЛЬ: ниже места каретки на экране показа есть блоки с запасом от кромок', `годятся ${seen.slice(0, 8).join(',')}`);
const near = seen[seen.length - 1];
await caretTo(near);
const steadyAfter = await pane();
ck(
  steadyAfter.scrollTop === steadyBefore.scrollTop,
  `каретка на строку ${near}, которая и так видна, — прокрутка не сдвинулась`,
  `${steadyBefore.scrollTop} → ${steadyAfter.scrollTop}`,
);

head('5. набор В КОНЦЕ заметки: показ догоняет НОВЫЙ блок');
// РАДИ ЧЕГО ЗДЕСЬ НАСТОЯЩИЕ КЛАВИШИ. Показ отстаёт от набора на кадр (`useDeferredValue`), и это
// самое место, где отставание видно: набирают В КОНЦЕ, а конца документа в разметке ещё нет.
// Замерено, что к концу набора показ всё равно стоит на последнем блоке — то есть отставание
// съедается следующим же движением каретки, и отдельного пересчёта по обновлению показа не нужно.
await setText(NOTE);
await page.evaluate(() => {
  const a = document.querySelector('textarea[name="noteContent"]');
  a.focus();
  a.setSelectionRange(a.value.length, a.value.length);
});
await page.waitForTimeout(200);
await page.keyboard.type('\n## brand new tail\ntail body one\ntail body two\ntail body three\n', { delay: 12 });
await page.waitForTimeout(600);
const tailLines = await page.evaluate(() => window.__notePreview.anchorLines());
const lastLine = tailLines[tailLines.length - 1];
const tailBox = await anchor(lastLine);
ck(
  tailLines.length > lines.length,
  'КОНТРОЛЬ: набранное доехало до показа — блоков стало больше',
  `${lines.length} → ${tailLines.length}`,
);
ck(tailBox && tailBox.visible, 'последний, только что набранный блок виден целиком', JSON.stringify(tailBox));

head('6. исключения');
ck(errors.length === 0, 'ни одного исключения на странице', errors.slice(0, 2).join(' | '));

await browser.close();
console.log(bad ? `\nПРОВАЛОВ: ${bad}` : '\nВСЁ ЗЕЛЁНОЕ');
process.exit(bad ? 1 : 0);
