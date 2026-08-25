#!/usr/bin/env node
// УТВЕРЖДАЕТ: инлайн-правка карточки НЕ ТЕРЯЕТ чужой текст — наивный рецепт его теряет
// (положительный контроль), а `useInlineTaskPatch` сохраняет и отказывает при конфликте.
// КРАСНЕЕТ ОТ: --mutate-no-fresh-read (свежее чтение подменено копией со страницы).
// НЕ ПОКРЫВАЕТ: ОТКУДА страница берёт `base` — этот стенд сеет его сам и потому слеп к тому,
// взят ли он в начале правки или в момент записи. Это судит `task-detail-inline-probe.mjs`.
//
// ИНЛАЙН-ПРАВКА НЕ ТЕРЯЕТ ЧУЖОЙ ТЕКСТ — ЗАМЕРЕНО НА ЖИВОМ СТЕНДЕ.
//
// ПОЧЕМУ ЭТА ПРОБА ВАЖНЕЕ ОСТАЛЬНЫХ. `UpdateTask` — полная замена содержимого без маски полей.
// Запись по копии, взятой со страницы, НЕ ПАДАЕТ и ничего не говорит: она просто возвращает на
// сервер описание тридцатисекундной давности поверх чужого. Такой дефект нельзя поймать типом и
// нельзя увидеть глазами — только замером того, ЧТО УЕХАЛО НА ПРОВОД.
//
// ПРОБА СНАЧАЛА ПОКАЗЫВАЕТ ПОТЕРЮ. Случай 1 жмёт кнопку «наивно» — рецепт из разведки — и
// требует, чтобы чужое описание ПРОПАЛО. Если бы оно там выживало, зелень случая 2 не значила бы
// ничего: неизвестно было бы, умеет ли стенд вообще замечать потерю.
//
//   Ц1 — наивная запись (рецепт «{...task.task, поле}») ТЕРЯЕТ чужое описание: положительный контроль;
//   Ц2 — инлайн-запись через `useInlineTaskPatch` его СОХРАНЯЕТ, и своё поле записывает;
//   Ц3 — чужая правка ТОГО ЖЕ поля даёт отказ словами, и записи на провод НЕТ ВОВСЕ;
//   Ц4 — у чтения карточки `refetchOnWindowFocus: true` поверх глобального `false`.
//
//   node scripts/task-inline-patch-probe.mjs
//   node scripts/task-inline-patch-probe.mjs --mutate-no-fresh-read   запись по копии со страницы вместо свежего чтения

import { build as esbuild } from 'esbuild';
import { createRequire } from 'node:module';
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, rmSync } from 'node:fs';
import { homedir, tmpdir } from 'node:os';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = resolve(HERE, '..');
const req = createRequire(import.meta.url);

const dieNotRun = (why) => {
  console.log(`\nНЕ ЗАПУСКАЛАСЬ: ${why}`);
  console.log('зелёный или красный прогон в этом состоянии не доказывал бы ничего.');
  process.exit(2);
};
process.on('uncaughtException', (e) => dieNotRun(e?.stack ?? String(e)));
process.on('unhandledRejection', (e) => dieNotRun(e?.stack ?? String(e)));


function resolvePlaywright() {
  try {
    return req.resolve('playwright');
  } catch {
    /* ниже — кэш npx */
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
const pwPath = resolvePlaywright();
if (!pwPath) dieNotRun('playwright не найден — живого стенда нет, и доказывать нечем');
const pw = await import(pwPath);
const chromium = pw.chromium ?? pw.default?.chromium;
if (!chromium) dieNotRun('playwright найден, но без chromium');

// ─── СЕТЕВОЙ СЛОЙ ───────────────────────────────────────────────────────────────────────────
// СЕРВЕР ВЕДЁТ СЕБЯ КАК НАСТОЯЩИЙ: `UpdateTask` заменяет содержимое ЦЕЛИКОМ (маски полей нет).
// Именно из-за этого и возможна потеря — заглушка, «сливающая» поля, спрятала бы весь дефект.
const STUB_MARKER = 'PROBE_STUB_INLINE_PATCH_NETWORK';
const REAL_API_MARKER = 'Grpc-Metadata-Authorization';
const STUB_SOURCE = `
// МАРКЕР — ПОБОЧНЫЙ ЭФФЕКТ, А НЕ КОММЕНТАРИЙ: комментарии esbuild выбрасывает, и проверка
// «заглушка в сборке» молча вырождалась бы в ложь о самой себе.
globalThis.__PROBE_STUB = '${STUB_MARKER}';
const state = (globalThis.__server = globalThis.__server || { task: null, updates: [], gets: 0 });
export const adminService = {
  GetTask: ({ id }) => {
    state.gets++;
    return Promise.resolve({ task: { id, task: { ...state.task }, board: 'TASK_BOARD_DESIGN', status: 'TASK_STATUS_TODO', position: 0, media: [], checklist: [], createdBy: 'me', createdAt: '', updatedAt: '', startedAt: '', archivedAt: '' }, files: [] });
  },
  UpdateTask: ({ id, task }) => {
    state.updates.push(JSON.parse(JSON.stringify(task)));
    // ПОЛНАЯ ЗАМЕНА — ровно как на сервере.
    state.task = { ...task };
    return Promise.resolve({});
  },
};
export const authService = adminService;
export const frontendService = adminService;
export const requestHandler = () => Promise.reject(new Error('${STUB_MARKER}'));
`;
const stub = {
  name: 'stub-network-layer',
  setup(b) {
    b.onResolve({ filter: /(^|\/)api\/api$/ }, () => ({ path: 'stub', namespace: 'probe-stub' }));
    b.onLoad({ filter: /.*/, namespace: 'probe-stub' }, () => ({ contents: STUB_SOURCE, loader: 'js' }));
  },
};

const outfile = resolve(tmpdir(), `inline-patch-${process.pid}.js`);
await esbuild({
  entryPoints: [resolve(HERE, 'task-inline-patch-probe-entry.tsx')],
  bundle: true,
  platform: 'browser',
  format: 'iife',
  target: 'es2020',
  absWorkingDir: REPO,
  nodePaths: [resolve(REPO, 'src'), resolve(REPO, 'node_modules')],
  jsx: 'automatic',
  minify: false,
  outfile,
  logLevel: 'warning',
  loader: { '.svg': 'text', '.png': 'dataurl', '.woff2': 'dataurl', '.css': 'empty' },
  alias: { '@': resolve(REPO, 'src') },
  plugins: [stub], // ← забыть эту строку = документированная ловушка ложной зелени
  define: {
    'import.meta.env': '{"VITE_SERVER_URL":"http://stub.invalid","MODE":"production"}',
    'import.meta.env.VITE_SERVER_URL': '"http://stub.invalid"',
    'process.env.NODE_ENV': '"production"',
  },
}).catch((e) => dieNotRun(`сборка не собралась: ${e.message}`));

let bundle = readFileSync(outfile, 'utf8');
rmSync(outfile, { force: true });
if (!bundle.includes(STUB_MARKER)) dieNotRun(`в сборке нет «${STUB_MARKER}» — сетевой слой НЕ заглушен`);
if (bundle.includes(REAL_API_MARKER)) dieNotRun(`в сборке есть «${REAL_API_MARKER}» — настоящий api-слой внутри`);

if (process.argv.includes('--mutate-no-fresh-read')) {
  const needle = 'const fresh = await tasksService.getTask(taskId);';
  const n = bundle.split(needle).length - 1;
  if (n !== 1) dieNotRun(`МУТАЦИЯ НЕ ПРИМЕНИЛАСЬ: якорь найден ${n} раз вместо одного`);
  // Ровно тот рецепт, который план отверг: «свежим» объявляется копия со страницы.
  bundle = bundle.replace(needle, 'const fresh = { task: vars.base };');
  console.log('  МУТАЦИЯ: свежее чтение заменено копией со страницы');
}

let bad = 0;
const ck = (ok, what, d = '') => {
  if (!ok) bad++;
  console.log(`${ok ? '  ok  ' : '  FAIL'} ${what}${d ? `  — ${d}` : ''}`);
};

const MY = 'МОЁ описание, каким я открыл страницу';
const THEIRS = 'ЧУЖОЕ описание, написанное пока моя страница была открыта';

const browser = await chromium.launch();
const page = await browser.newPage();
page.on('pageerror', (e) => console.log('  [страница]', String(e).slice(0, 400)));
page.on('console', (m) => {
  if (m.type() === 'error') console.log('  [консоль]', m.text().slice(0, 240));
});
await page.route('http://probe.local/**', (route) =>
  route.fulfill({ status: 200, contentType: 'text/html', body: '<div id="root"></div>' }),
);

// Один прогон = свежая страница со своим сервером. Кэш react-query между случаями не течёт.
async function mount(serverTask) {
  await page.goto('http://probe.local/');
  await page.evaluate((t) => {
    globalThis.__server = { task: t, updates: [], gets: 0 };
  }, serverTask);
  await page.addScriptTag({ content: bundle });
  await page.waitForSelector('#state:not(:empty)');
  await page.waitForFunction(() => document.getElementById('state')?.textContent === 'ready', {
    timeout: 5000,
  });
}
const server = () => page.evaluate(() => globalThis.__server);

const CARD = {
  title: 'вшить бирку',
  description: MY,
  assignee: 'nina',
  priority: 'TASK_PRIORITY_LOW',
  labels: ['fw26'],
  mediaIds: [],
  fileIds: [],
  mediaAnnotations: [],
};

// Чужая правка происходит МИМО этой вкладки — как из второго окна.
const foreignEdit = (patch) =>
  page.evaluate((p) => {
    globalThis.__server.task = { ...globalThis.__server.task, ...p };
  }, patch);

// ─── Ц1 · ПОЛОЖИТЕЛЬНЫЙ КОНТРОЛЬ: НАИВНАЯ ЗАПИСЬ ТЕРЯЕТ ЧУЖОЕ ────────────────────────────────
console.log('\nЦ1 · рецепт «{...task.task, поле}» — потеря, которую проба обязана видеть');
await mount({ ...CARD });
await page.waitForFunction((my) => document.getElementById('seen-description')?.textContent === my, MY);
await foreignEdit({ description: THEIRS });
await page.click('#naive');
await page.waitForFunction(() => globalThis.__server.updates.length > 0, { timeout: 5000 });
const afterNaive = await server();
ck(
  afterNaive.task.description === MY,
  'Ц1 наивная запись ВЕРНУЛА моё устаревшее описание — чужой текст потерян',
  JSON.stringify(afterNaive.task.description),
);
ck(afterNaive.updates.length === 1, 'Ц1.1 запись была ровно одна', `updates=${afterNaive.updates.length}`);

// ─── Ц2 · ИНЛАЙН-ЗАПИСЬ СОХРАНЯЕТ ЧУЖОЕ ─────────────────────────────────────────────────────
console.log('\nЦ2 · та же гонка, но запись через useInlineTaskPatch');
await mount({ ...CARD });
await page.waitForFunction((my) => document.getElementById('seen-description')?.textContent === my, MY);
await foreignEdit({ description: THEIRS });
await page.click('#inline');
await page.waitForFunction(() => globalThis.__server.updates.length > 0, { timeout: 5000 });
const afterInline = await server();
ck(
  afterInline.task.description === THEIRS,
  'Ц2 ЧУЖОЕ ОПИСАНИЕ ВЫЖИЛО — на провод уехало оно, а не моя копия',
  JSON.stringify(afterInline.task.description),
);
ck(
  afterInline.updates[0]?.priority === 'TASK_PRIORITY_URGENT',
  'Ц2.1 и моё поле при этом записалось',
  JSON.stringify(afterInline.updates[0]?.priority),
);
ck(
  afterInline.gets >= 2,
  'Ц2.2 перед записью было СВОЁ чтение карточки (не одно только чтение страницы)',
  `GetTask вызван ${afterInline.gets} раз(а)`,
);

// ─── Ц3 · КОНФЛИКТ ПО ТОМУ ЖЕ ПОЛЮ ──────────────────────────────────────────────────────────
console.log('\nЦ3 · чужая правка ТОГО ЖЕ поля');
await mount({ ...CARD });
await page.waitForFunction((my) => document.getElementById('seen-description')?.textContent === my, MY);
await foreignEdit({ priority: 'TASK_PRIORITY_HIGH' });
await page.click('#inline');
await page.waitForFunction(() => !!globalThis.window.__lastError, { timeout: 5000 }).catch(() => {});
const afterClash = await server();
const clashError = await page.evaluate(() => window.__lastError);
ck(
  afterClash.updates.length === 0,
  'Ц3 записи НЕ БЫЛО ВОВСЕ — чужая правка того же поля не проигрывает по времени нажатия',
  `updates=${afterClash.updates.length}`,
);
ck(
  afterClash.task.priority === 'TASK_PRIORITY_HIGH',
  'Ц3.1 на сервере осталось чужое значение',
  JSON.stringify(afterClash.task.priority),
);
ck(
  /changed by someone else/.test(clashError),
  'Ц3.2 человеку сказали словами, что случилось',
  JSON.stringify(clashError),
);

// ─── Ц4 · ОКНО НЕСВЕЖЕСТИ СЖАТО ─────────────────────────────────────────────────────────────
console.log('\nЦ4 · точечная отмена глобального refetchOnWindowFocus');
const focusOpt = await page.evaluate(() => {
  const q = window.__qc
    .getQueryCache()
    .getAll()
    .find((x) => x.queryKey[1] === 'detail');
  return { key: q?.queryKey, focus: q?.options?.refetchOnWindowFocus };
});
ck(
  focusOpt.focus === true,
  'Ц4 у чтения карточки refetchOnWindowFocus === true поверх глобального false',
  JSON.stringify(focusOpt),
);

await browser.close();
console.log(bad ? `\nКРАСНАЯ: провалов ${bad}` : '\nЗЕЛЁНАЯ: все проверки прошли');
process.exit(bad ? 1 : 0);
