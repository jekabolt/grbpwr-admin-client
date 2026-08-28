#!/usr/bin/env node
// ПУБЛИЧНАЯ ССЫЛКА ПОКАЗЫВАЕТ ДОКУМЕНТ — И НЕ ХОДИТ ПОД ЧУЖИМИ ПРАВАМИ.
//
//   node scripts/share-view-probe.mjs                 прогон
//   node scripts/share-view-probe.mjs --mutate=notext  игнорировать поле text — раздел 1 краснеет
//   node scripts/share-view-probe.mjs --mutate=noembed убрать встроенный просмотр — раздел 2
//   node scripts/share-view-probe.mjs --mutate=admin   рисовать АДМИНСКИМ разметчиком — раздел 3
//
// Три раздела, и третий — главный. Страницу открывает подрядчик без аккаунта, НО открывает её и
// свой человек в живой сессии админки, у которого в localStorage лежит JWT. Разметчик, умеющий
// резолвить `/files/{id}`, сходил бы за файлом ЕГО правами и показал бы то, чего ссылка не
// отдавала. Поэтому проба поднимает страницу С ТОКЕНОМ В ХРАНИЛИЩЕ и считает запросы.
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
const outfile = resolve(tmpdir(), `share-view-${process.pid}.js`);

const MUTATIONS = {
  notext: {
    from: "  const text = typeof meta.text === 'string' ? meta.text : '';",
    to: "  const text = '';",
  },
  noembed: {
    from: "  const embedSrc = (isPdf || isVideo) && !previewFailed ? inlineSrc : '';",
    to: "  const embedSrc = '';",
  },
  // Подмена разметчика на АДМИНСКИЙ — то, что однажды сделают «чтобы картинки показывались».
  admin: {
    from: '            <MarkdownDoc blocks={parseMarkdown(text)} />',
    to: '            <AdminMarkdownView source={text} />',
    also: [
      [
        "import { MarkdownDoc, parse as parseMarkdown } from 'ui/markdown/doc';",
        "import { MarkdownDoc, parse as parseMarkdown } from 'ui/markdown/doc';\nimport { MarkdownView as AdminMarkdownView } from 'components/managers/files/note/markdown-view';",
      ],
    ],
  },
};
if (MUTATE && !MUTATIONS[MUTATE]) {
  console.log(`неизвестная мутация «${MUTATE}»; есть: ${Object.keys(MUTATIONS).join(', ')}`);
  process.exit(2);
}
const mutation = {
  name: 'share-view-mutation',
  setup(b) {
    const m = MUTATIONS[MUTATE] ?? {};
    b.onLoad({ filter: /file-share-viewer\/page\.tsx$/ }, async (args) => {
      let src = await readFile(args.path, 'utf8');
      if (!src.includes(m.from)) throw new Error('мутация не нашла свою строку');
      src = src.replace(m.from, m.to);
      for (const [from, to] of m.also ?? []) {
        if (!src.includes(from)) throw new Error('мутация не нашла свой импорт');
        src = src.replace(from, to);
      }
      return { contents: src, loader: 'tsx' };
    });
  },
};

await esbuild({
  entryPoints: [resolve(HERE, 'share-view-probe-entry.tsx')],
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

const NOTE = [
  '# спецификация полотна',
  '',
  'плотность 240 г/м², усадка не более двух процентов.',
  '',
  '| столбец | второй |',
  '| ---     | ---:   |',
  '| ячейка  | 12     |',
  '',
  '![фото ткани](/files/12)',
  '',
  '[карточка файла](/files/13)',
  '',
].join('\n');

const SIGNED_PDF = 'https://bucket.example/files-library/doc.pdf?signed=1';
const SIGNED_PREVIEW = 'https://bucket.example/files-library/preview.png?signed=1';

const META = {
  note: {
    url: 'https://bucket.example/files-library/note.md?signed=1',
    expires_at: new Date(Date.now() + 600000).toISOString(),
    file_name: 'спецификация.md',
    content_type: 'text/markdown',
    size_bytes: 421,
    download: true,
    text: NOTE,
  },
  pdf: {
    url: SIGNED_PDF,
    expires_at: new Date(Date.now() + 600000).toISOString(),
    file_name: 'договор.pdf',
    content_type: 'application/pdf',
    size_bytes: 91234,
    download: false,
    preview_url: SIGNED_PREVIEW,
  },
  zip: {
    url: 'https://bucket.example/files-library/pack.zip?signed=1',
    expires_at: new Date(Date.now() + 600000).toISOString(),
    file_name: 'лекала.zip',
    content_type: 'application/zip',
    size_bytes: 5120,
    download: true,
    preview_url: SIGNED_PREVIEW,
  },
};

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1200, height: 900 } });
const errors = [];
page.on('pageerror', (e) => errors.push(String(e)));

// ВСЕ запросы к бэкенду записываются С ЗАГОЛОВКАМИ: «сколько раз сходили и с чем» — это и есть
// предмет третьего раздела.
const calls = [];
await page.route('http://probe.local/**', (route) =>
  route.fulfill({ status: 200, contentType: 'text/html', body: '<div id="root"></div>' }),
);
// БАКЕТ ОТВЕЧАЕТ НАСТОЯЩИМИ БАЙТАМИ. Без этого `<img>` миниатюры падает в onError, страница
// ЧЕСТНО прячет блок показа — и раздел про миниатюру проверял бы не то, что рисует страница, а
// то, что стенд не дал ей картинки.
const PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAYAAABytg0kAAAAFElEQVR4nGP8z8DAwMDAwMDEAAMADgIBAWiJ8fMAAAAASUVORK5CYII=',
  'base64',
);
await page.route('https://bucket.example/**', (route) =>
  route.fulfill({ status: 200, contentType: 'image/png', body: PNG }),
);

let served = META.note;
await page.route('http://stub.invalid/**', (route) => {
  const req = route.request();
  calls.push({ url: req.url(), headers: req.headers() });
  // Ответ ОДИН на любой путь: если страница вдруг сходит не туда (за файлом библиотеки), запрос
  // всё равно будет записан — молчаливый висяк спрятал бы ровно то, что проверяется.
  return route.fulfill({
    status: 200, contentType: 'application/json', body: JSON.stringify(served),
  });
});

await page.goto('http://probe.local/');
// ЖИВАЯ СЕССИЯ АДМИНКИ В ТОЙ ЖЕ ВКЛАДКЕ — обычное дело: свой человек открывает присланную
// подрядчику ссылку у себя. Токен обязан остаться неиспользованным.
await page.evaluate(() => localStorage.setItem('authToken', 'header.payload.signature'));
await page.addScriptTag({ content: bundle });

const mount = async (which) => {
  served = META[which];
  calls.length = 0;
  await page.evaluate(() => {
    const host = document.getElementById('root');
    if (host) host.innerHTML = '';
  });
  await page.evaluate(() => window.__shareView.mount('f7abc'));
  await page.waitForTimeout(700);
  return page.evaluate(() => window.__shareView.facts());
};

head('1. текстовый документ показан ЦЕЛИКОМ и разметкой');
let facts = await mount('note');
const text = await page.evaluate(() => window.__shareView.text());
ck(facts.h1.includes('спецификация полотна'), 'заголовок стал заголовком, а не строкой с решёткой', facts.h1.join(' | '));
ck(!/^#\s|\n#\s/.test(text), 'решётки в тексте страницы не осталось');
ck(/плотность 240/.test(text), 'тело документа на странице');
ck((await page.locator('table').count()) === 1, 'таблица разметки нарисована таблицей');
ck(/спецификация\.md/.test(text), 'имя файла и кнопки остались на месте');
ck(
  (await page.locator('a', { hasText: /^download$/ }).count()) === 1,
  'кнопка «скачать» никуда не делась — показ её не отменяет',
);
ck(
  /shown above in full/.test(text),
  'строка про «только скачиванием» заменена честной: документ показан выше',
  text.split('\n').filter((l) => /download|browser/.test(l)).join(' | ').slice(0, 140),
);

head('2. pdf — сам документ, а не первая страница картинкой');
facts = await mount('pdf');
ck(facts.iframes.length === 1 && facts.iframes[0] === SIGNED_PDF, 'встроен подписанный адрес файла', facts.iframes.join(' | '));
ck(
  !facts.images.includes(SIGNED_PREVIEW),
  'миниатюра ПЕРВОЙ СТРАНИЦЫ больше не рисуется рядом — иначе документ показан дважды',
  facts.images.join(' | '),
);
ck(
  (await page.locator('a', { hasText: /^open$/ }).count()) === 1,
  'кнопка «open» на месте: на телефоне рамка показывает только первую страницу',
);

// РЕГРЕСС: у файла, который браузер не открывает, миниатюра остаётся единственным лицом.
facts = await mount('zip');
ck(facts.iframes.length === 0, 'zip ничем не встраивается', facts.iframes.join(' | '));
ck(facts.images.includes(SIGNED_PREVIEW), 'зато миниатюра у него осталась', facts.images.join(' | '));

head('3. ни одного запроса под правами админа');
facts = await mount('note');
ck(calls.length === 1, 'страница сходила на бэкенд РОВНО ОДИН раз — за метаданными', calls.map((c) => c.url).join(' | '));
ck(/\/api\/f\/f7abc\?mode=json/.test(calls[0]?.url ?? ''), 'и это адрес токена', calls[0]?.url ?? '');
const authed = calls.filter((c) =>
  Object.keys(c.headers).some((h) => /authorization/i.test(h)),
);
ck(authed.length === 0, 'ни один запрос не нёс заголовка авторизации', authed.map((c) => c.url).join(' | '));
ck(
  facts.plates.some((p) => /picture/i.test(p)),
  'картинка файла библиотеки показана ПЛАШКОЙ — ссылка её не отдавала',
  facts.plates.join(' | '),
);
ck(
  !facts.images.some((src) => src.includes('/files/')),
  'и ни один <img> не смотрит на админский адрес',
  facts.images.join(' | '),
);
ck(
  !facts.links.some((href) => (href ?? '').startsWith('/files/')),
  'внутренняя ссылка на карточку осталась текстом: публично она вела бы на форму входа',
  facts.links.join(' | '),
);

head('4. исключения');
ck(errors.length === 0, 'ни одного исключения на странице', errors.slice(0, 2).join(' | '));

await browser.close();
console.log(bad ? `\nПРОВАЛОВ: ${bad}` : '\nВСЁ ЗЕЛЁНОЕ');
process.exit(bad ? 1 : 0);
