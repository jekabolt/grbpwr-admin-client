#!/usr/bin/env node
// УТВЕРЖДАЕТ на НАСТОЯЩЕМ холсте файлов четыре просьбы владельца (2026-09-17) про проекты:
//
//   П1 — в ряду PROJECTS есть «+ new project»; в режиме чтения она на месте, но не нажимается;
//   П2 — заведение проекта делает ОБА вызова (CreateFileTopic + UpdateFileTopicMeta kind=project)
//        и сразу ставит холст в этот проект (?project=<новый id>);
//   П3 — внутри проекта ПЕРВЫМ блоком стоит плитка «+ add files»; вне проекта её нет; в режиме
//        чтения её нет;
//   П4 — плитка открывает модалку выбора из уже существующих файлов: мультивыбор, уже лежащий в
//        проекте файл не выбирается, «add» шлёт AssignLibraryFileTopics пачкой;
//   П5 — в сужении по роли та же модалка пишет SetLibraryFileRoles с этой ролью;
//   П6 — при выделении чекбоксами в полосе есть «add to a project»; диалог сужен до проекта
//        (блок тем не показан), «add» шлёт AssignLibraryFileTopics на выделенные файлы;
//   П7 — вставка (⌘V) внутри проекта: чип этого проекта в приёмной модалке НЕ снимается.
//
//   node scripts/files-projects-probe.mjs
//   node scripts/files-projects-probe.mjs --mutate-create-does-nothing   кнопка заведения не открывает диалог
//   node scripts/files-projects-probe.mjs --mutate-create-in-read-mode   кнопка заведения жива в режиме чтения
//   node scripts/files-projects-probe.mjs --mutate-create-ignores-canvas заведённый проект не выбирается
//   node scripts/files-projects-probe.mjs --mutate-tile-everywhere    плитка рисуется и вне проекта
//   node scripts/files-projects-probe.mjs --mutate-tile-in-read-mode  плитка рисуется в режиме чтения
//   node scripts/files-projects-probe.mjs --mutate-pick-inside        уже лежащий в проекте файл выбирается
//   node scripts/files-projects-probe.mjs --mutate-role-ignored       модалка пишет без роли даже в роли
//   node scripts/files-projects-probe.mjs --mutate-paste-no-project   вставка не наследует проект
//   node scripts/files-projects-probe.mjs --mutate-unpin-project      чип проекта при вставке снова снимается
//   node scripts/files-projects-probe.mjs --mutate-scope-ignored-role  в суженном диалоге снова виден выбор роли
//   node scripts/files-projects-probe.mjs --mutate-scope-ignored      «add to a project» открывает полный разбор

import { build as esbuild } from 'esbuild';
import { execFileSync } from 'node:child_process';
import { existsSync, readdirSync, readFileSync, rmSync } from 'node:fs';
import { createRequire } from 'node:module';
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
if (!pwPath) dieNotRun('playwright не найден — живого стенда нет');
const pw = await import(pwPath);
const chromium = pw.chromium ?? pw.default?.chromium;
if (!chromium) dieNotRun('playwright найден, но без chromium');

let cssDir = [];
try {
  cssDir = readdirSync(resolve(REPO, 'dist/assets'));
} catch {
  dieNotRun('нет dist/assets — сначала `yarn build`');
}
const cssName = cssDir.find((f) => /^index-.*\.css$/.test(f));
if (!cssName) dieNotRun('нет dist/assets/index-*.css — сначала `yarn build`');
const CSS = readFileSync(resolve(REPO, 'dist/assets', cssName), 'utf8');

// ─── СЕТЕВОЙ СЛОЙ ───────────────────────────────────────────────────────────────────────────
// Сервер ведёт себя как настоящий: список файлов отвечает НА ФИЛЬТР (по проекту и роли), а
// записи складываются в журнал — по нему проба и судит, что именно ушло на провод.
const STUB_MARKER = 'PROBE_STUB_FILES_PROJECTS_NETWORK';
const REAL_API_MARKER = 'createAdminServiceClient(';
const STUB_SOURCE = `
globalThis.__PROBE_STUB = '${STUB_MARKER}';
const state = (globalThis.__server = globalThis.__server || {});
state.calls = state.calls || [];
const log = (name, req) => { state.calls.push({ name, req: JSON.parse(JSON.stringify(req || {})) }); };
const fileRow = (f) => ({
  id: f.id,
  fileName: f.fileName,
  contentType: 'image/png',
  sizeBytes: 1024,
  topics: (f.topicIds || []).map((id) => ({ id, name: 'topic ' + id, kind: id === 5 ? 'project' : '' })),
  roles: f.roles || [],
  uploadedBy: 'me',
  createdAt: '2026-09-01T00:00:00Z',
});
const table = {
  ListLibraryFiles: (req) => {
    log('ListLibraryFiles', req);
    const project = Number(req.projectTopicId || 0);
    const roleId = Number(req.roleId || 0);
    const withoutRole = !!req.withoutRole;
    let rows = (state.files || []);
    if (project) rows = rows.filter((f) => (f.topicIds || []).includes(project));
    if (roleId) rows = rows.filter((f) => (f.roles || []).some((r) => Number(r.roleId) === roleId));
    if (withoutRole) rows = rows.filter((f) => !(f.roles || []).length);
    return { files: rows.map(fileRow), total: rows.length };
  },
  ListFileTopics: () => ({ topics: state.topics || [] }),
  ListFileRoles: (req) => { log('ListFileRoles', req); return { roles: state.roles || [] }; },
  ListFileTopicStyles: () => ({ styles: [] }),
  ListLibraryFileTasks: () => ({ tasks: [] }),
  ListTasks: () => ({ tasks: [], total: 0 }),
  CreateFileTopic: (req) => { log('CreateFileTopic', req); const id = 77; state.topics = [...(state.topics || []), { id, name: req.name, kind: '', filesCount: 0 }]; return { id }; },
  UpdateFileTopicMeta: (req) => {
    log('UpdateFileTopicMeta', req);
    state.topics = (state.topics || []).map((t) => (Number(t.id) === Number(req.topicId) ? { ...t, kind: req.kind } : t));
    return {};
  },
  AssignLibraryFileTopics: (req) => { log('AssignLibraryFileTopics', req); return { assigned: (req.fileIds || []).length }; },
  SetLibraryFileRoles: (req) => { log('SetLibraryFileRoles', req); return { rowsAffected: (req.fileIds || []).length }; },
  GetCurrentAccount: () => ({
    account: {
      username: 'me',
      isSuper: false,
      permissions: [{ section: 'files', access: state.readonly ? 'ACCESS_LEVEL_READ' : 'ACCESS_LEVEL_WRITE' }],
    },
  }),
  ListAccountSections: () => ({ sections: [] }),
  ListAdmins: () => ({ admins: [] }),
};
const service = new Proxy({}, {
  get: (_t, k) => (typeof k === 'string'
    ? (req) => { try { return Promise.resolve((table[k] || (() => ({})))(req || {})); } catch (e) { return Promise.reject(e); } }
    : undefined),
});
export const adminService = service;
export const authService = service;
export const frontendService = service;
export const requestHandler = () => Promise.reject(new Error('${STUB_MARKER}'));
`;
const stub = {
  name: 'stub-network-layer',
  setup(b) {
    b.onResolve({ filter: /(^|\/)api\/api$/ }, () => ({ path: 'stub', namespace: 'probe-stub' }));
    b.onLoad({ filter: /.*/, namespace: 'probe-stub' }, () => ({
      contents: STUB_SOURCE,
      loader: 'js',
    }));
  },
};

const outfile = resolve(tmpdir(), `files-projects-${process.pid}.js`);
await esbuild({
  entryPoints: [resolve(HERE, 'files-projects-probe-entry.tsx')],
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
  plugins: [stub],
  define: {
    'import.meta.env': '{"VITE_SERVER_URL":"http://stub.invalid","MODE":"production"}',
    'import.meta.env.VITE_SERVER_URL': '"http://stub.invalid"',
    'process.env.NODE_ENV': '"production"',
  },
}).catch((e) => dieNotRun(`сборка не собралась: ${e.message}`));

let bundle = readFileSync(outfile, 'utf8');
rmSync(outfile, { force: true });
if (!bundle.includes(STUB_MARKER))
  dieNotRun(`в сборке нет «${STUB_MARKER}» — сетевой слой НЕ заглушен`);
if (bundle.includes(REAL_API_MARKER))
  dieNotRun(`в сборке есть «${REAL_API_MARKER}» — настоящий api-слой внутри`);

if (process.argv.includes('--dump')) {
  const { writeFileSync } = await import('node:fs');
  writeFileSync(process.argv[process.argv.indexOf('--dump') + 1], bundle);
  process.exit(0);
}

function mutate(name, needle, replacement) {
  const n = bundle.split(needle).length - 1;
  if (n !== 1) dieNotRun(`МУТАЦИЯ «${name}» НЕ ПРИМЕНИЛАСЬ: якорь найден ${n} раз вместо одного`);
  bundle = bundle.replace(needle, replacement);
  console.log(`  МУТАЦИЯ: ${name}`);
}
const flag = (f) => process.argv.includes(f);
if (flag('--mutate-create-does-nothing'))
  mutate(
    'кнопка заведения ничего не открывает',
    'onClick: () => setCreating(true),\n            children: "+ new project"',
    'onClick: () => {},\n            children: "+ new project"',
  );
if (flag('--mutate-create-in-read-mode'))
  mutate(
    'кнопка заведения нажимается и в режиме чтения',
    'disabled: !writable,\n            title: writable ? void 0 : "right now it is read-only',
    'disabled: false,\n            title: writable ? void 0 : "right now it is read-only',
  );
if (flag('--mutate-create-ignores-canvas'))
  mutate(
    'заведённый проект не становится выбранным',
    'onDone: (id) => onChange(id)',
    'onDone: () => {}',
  );
if (flag('--mutate-tile-everywhere'))
  mutate(
    'плитка рисуется и вне проекта',
    '\n      projectId > 0 && writable && !narrowedRoleUnusable &&',
    '\n      writable && !narrowedRoleUnusable &&',
  );
if (flag('--mutate-tile-in-read-mode'))
  mutate(
    'плитка рисуется и в режиме чтения',
    '\n      projectId > 0 && writable && !narrowedRoleUnusable &&',
    '\n      projectId > 0 && !narrowedRoleUnusable &&',
  );
if (flag('--mutate-pick-inside'))
  mutate(
    'уже лежащий в проекте файл снова выбирается',
    'onClick: here ? void 0 : () => setPicked(',
    'onClick: () => setPicked(',
  );
if (flag('--mutate-role-ignored'))
  mutate('модалка пишет без роли даже в разделе роли', 'if (roleId > 0) {', 'if (false) {');
if (flag('--mutate-scope-ignored-role'))
  mutate(
    '«add to a project» показывает выбор роли',
    'className: sortScope === "project" ? "hidden" : "flex flex-col gap-1", children: [\n              /* @__PURE__ */ (0, import_jsx_runtime115.jsxs)("div", { className: "flex flex-wrap items-baseline gap-2"',
    'className: "flex flex-col gap-1", children: [\n              /* @__PURE__ */ (0, import_jsx_runtime115.jsxs)("div", { className: "flex flex-wrap items-baseline gap-2"',
  );
if (flag('--mutate-paste-no-project'))
  mutate(
    'вставка не наследует открытый проект',
    'const preset = presetProjectId > 0 ? [...presetTopicIds, presetProjectId] : presetTopicIds;',
    'const preset = presetTopicIds;',
  );
if (flag('--mutate-unpin-project'))
  mutate(
    'чип открытого проекта снова снимается при вставке',
    'const pinned = presetProjectId === id;',
    'const pinned = false;',
  );
if (flag('--mutate-scope-ignored'))
  // Блоков, которые прячет сужение, ДВА (темы и роль) — мутация снимает оба: одна снятая
  // половина оставила бы проверку зелёной по второй.
  mutate(
    '«add to a project» открывает полный разбор (темы)',
    'className: sortScope === "project" ? "hidden" : "flex flex-col gap-1", children: [\n              /* @__PURE__ */ (0, import_jsx_runtime115.jsx)(\n                Text,',
    'className: "flex flex-col gap-1", children: [\n              /* @__PURE__ */ (0, import_jsx_runtime115.jsx)(\n                Text,',
  );

let bad = 0;
const ck = (ok, what, d = '') => {
  if (!ok) bad++;
  console.log(`${ok ? '  ok  ' : '  FAIL'} ${what}${d ? `  — ${d}` : ''}`);
};

const TOPICS = [
  { id: 5, name: 'autumn shoot', kind: 'project', filesCount: 2, startsAt: '', endsAt: '' },
  { id: 6, name: 'packaging', kind: '', filesCount: 1 },
  // Пустой проект: «плитка стоит ВСЕГДА» проверяется там, где сетки нет вовсе.
  { id: 8, name: 'empty shoot', kind: 'project', filesCount: 0, startsAt: '', endsAt: '' },
];
const ROLES = [
  { id: 7, name: 'sources', projectTopicId: 5 },
  { id: 9, name: 'lookbook', projectTopicId: 5 },
];
const FILES = [
  // Лежит в проекте БЕЗ роли: в разделе роли его законно туда перенести, и «уже здесь» на него
  // распространяться не должно.
  { id: 104, fileName: 'no-role.png', topicIds: [5], roles: [] },
  // Лежит в проекте с ДРУГОЙ ролью: перенос законен, но он ЗАМЕНЯЕТ прежнюю роль — и об этом
  // обязано быть сказано на самой плитке.
  {
    id: 105,
    fileName: 'other-role.png',
    topicIds: [5],
    roles: [{ projectTopicId: 5, roleId: 9, roleName: 'lookbook' }],
  },
  {
    id: 101,
    fileName: 'in-project.png',
    topicIds: [5],
    roles: [{ projectTopicId: 5, roleId: 7, roleName: 'sources' }],
  },
  { id: 102, fileName: 'loose-one.png', topicIds: [6], roles: [] },
  { id: 103, fileName: 'loose-two.png', topicIds: [], roles: [] },
];

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1400, height: 1000 } });
page.on('pageerror', (e) => console.log('  [страница]', String(e).slice(0, 300)));
await page.route('http://probe.local/**', (r) =>
  r.fulfill({ status: 200, contentType: 'text/html', body: '<div id="root"></div>' }),
);
await page.route(/^https?:\/\/(?!probe\.local)/, (r) => r.abort());

async function mount({ start = '/files', readonly = false } = {}) {
  await page.goto('http://probe.local/');
  await page.addStyleTag({ content: CSS });
  await page.evaluate(
    ({ topics, roles, files, ro, url }) => {
      globalThis.__server = { topics, roles, files, readonly: ro, calls: [] };
      globalThis.__START = url;
    },
    { topics: TOPICS, roles: ROLES, files: FILES, ro: readonly, url: start },
  );
  await page.addScriptTag({ content: bundle });
  await page.waitForSelector('text=projects', { timeout: 8000 });
  await page.waitForTimeout(400);
}
const calls = (name) =>
  page.evaluate((n) => globalThis.__server.calls.filter((c) => c.name === n), name);
const createBtn = () => page.getByRole('button', { name: '+ new project' });
const addTile = () => page.getByRole('button', { name: /\+ add files/ });

// ═══ П1 · КНОПКА ЗАВЕДЕНИЯ В РЯДУ ПРОЕКТОВ ═════════════════════════════════════════════════
console.log('\nП1 · «+ new project» в ряду PROJECTS');
await mount();
{
  ck((await createBtn().count()) === 1, 'П1.1 кнопка есть в ряду проектов');
  ck(await createBtn().isEnabled(), 'П1.2 в режиме записи она нажимается');
}
await mount({ readonly: true });
{
  ck((await createBtn().count()) === 1, 'П1.3 в режиме чтения кнопка на месте');
  ck(await createBtn().isDisabled(), 'П1.4 …но не нажимается');
}

// ═══ П2 · ЗАВЕДЕНИЕ — ДВА ВЫЗОВА И СРАЗУ В ПРОЕКТ ══════════════════════════════════════════
console.log('\nП2 · заведение проекта делает оба вызова и ставит холст в него');
await mount();
{
  await createBtn().click();
  // Диалог мог и не открыться (под мутацией): это провал проверки, а не падение стенда.
  const name = page.locator('input#newProjectName');
  const opened = await name
    .waitFor({ timeout: 3000 })
    .then(() => true)
    .catch(() => false);
  ck(opened, 'П2.0 нажатие открывает диалог заведения');
  if (opened) {
    await name.fill('winter shoot');
    await page.getByRole('button', { name: /start the project/ }).click();
    await page.waitForTimeout(600);
    const created = await calls('CreateFileTopic');
    const promoted = await calls('UpdateFileTopicMeta');
    ck(
      created.length === 1 && created[0].req.name === 'winter shoot',
      'П2.1 CreateFileTopic с набранным именем',
      JSON.stringify(created[0]?.req),
    );
    ck(
      promoted.length === 1 &&
        promoted[0].req.kind === 'project' &&
        Number(promoted[0].req.topicId) === 77,
      'П2.2 UpdateFileTopicMeta делает его ПРОЕКТОМ, а не обычной темой',
      JSON.stringify(promoted[0]?.req),
    );
    const url = await page.evaluate(() => window.__loc);
    ck(url.includes('project=77'), 'П2.3 холст сразу стоит в новом проекте', url);
  }
}

// ═══ П3 · ПЛИТКА ВНУТРИ ПРОЕКТА ════════════════════════════════════════════════════════════
console.log('\nП3 · «+ add files» первым блоком внутри проекта');
await mount({ start: '/files?project=5' });
{
  ck((await addTile().count()) === 1, 'П3.1 внутри проекта плитка есть');
  // ПО ПОРЯДКУ В ДОКУМЕНТЕ, а не по координатам: сетка перекладывает плитки по ширине окна.
  // Имя файла ищется среди ЛЮБЫХ листовых узлов — у плитки холста подпись живёт не в кнопке.
  const order = await page.evaluate(() => {
    const has = (el, text) => (el.textContent || '').includes(text);
    const tile = Array.from(document.querySelectorAll('button')).find((b) => has(b, '+ add files'));
    // Имя в плитке холста печатается БЕЗ расширения («in-project», не «in-project.png»), и
    // регистр ей задаёт css — сравнение идёт по нижнему регистру подстроки.
    const firstFile = Array.from(document.querySelectorAll('div,span,button,a')).find(
      (el) =>
        (el.textContent || '').toLowerCase().includes('in-project') && el.children.length === 0,
    );
    if (!tile) return 'плитки нет';
    if (!firstFile) return 'файла проекта на экране нет';
    return tile.compareDocumentPosition(firstFile) & Node.DOCUMENT_POSITION_FOLLOWING
      ? 'плитка раньше'
      : 'плитка позже';
  });
  ck(order === 'плитка раньше', 'П3.2 плитка стоит ПЕРВЫМ блоком — до файлов проекта', order);
}
// Роль из адреса, которой в словаре нет (старая ссылка, роль удалили): назначить её нельзя,
// и приглашение обещало бы жест с гарантированным отказом.
await mount({ start: '/files?project=5&frole=999' });
ck((await addTile().count()) === 0, 'П3.2.2 в разделе НЕИЗВЕСТНОЙ роли плитки нет');
await mount({ start: '/files?project=8' });
ck((await addTile().count()) === 1, 'П3.2.1 в ПУСТОМ проекте плитка тоже стоит');
await mount();
ck((await addTile().count()) === 0, 'П3.3 вне проекта плитки нет');
await mount({ start: '/files?project=5', readonly: true });
ck((await addTile().count()) === 0, 'П3.4 в режиме чтения плитки нет');

// ═══ П4 · МОДАЛКА ВЫБОРА ИЗ СУЩЕСТВУЮЩИХ ═══════════════════════════════════════════════════
console.log('\nП4 · модалка: мультивыбор из библиотеки, уже лежащий файл не выбирается');
await mount({ start: '/files?project=5' });
{
  await addTile().click();
  const dialogFile = (name) =>
    page.locator('[role="dialog"] button').filter({ hasText: name }).first();
  await dialogFile('loose-one.png').waitFor({ timeout: 5000 });
  await dialogFile('loose-one.png').click();
  await dialogFile('loose-two.png').click();
  const addBtn = page.getByRole('button', { name: /^add 2$/ });
  ck((await addBtn.count()) === 1, 'П4.1 кнопка называет число выбранного');
  // УЖЕ ЛЕЖАЩИЙ В ПРОЕКТЕ — НЕ ОРГАН ВОВСЕ. Проверяется именно это: «нажал, и ничего не
  // изменилось» одинаково выглядит и у невыбираемой плитки, и у сломанного обработчика.
  const already = await page.evaluate(() => {
    const dialog = document.querySelector('[role="dialog"]');
    if (!dialog) return 'нет диалога';
    const node = Array.from(dialog.querySelectorAll('*')).find(
      (el) => (el.textContent || '').includes('in-project.png') && el.children.length === 0,
    );
    if (!node) return 'файла нет в списке';
    return node.closest('button') ? 'кнопка' : 'не кнопка';
  });
  ck(already === 'не кнопка', 'П4.2 уже лежащий в проекте файл показан, но не выбирается', already);
  const hereWord = await page
    .locator('[role="dialog"]')
    .filter({ hasText: 'already here' })
    .count();
  ck(hereWord === 1, 'П4.2.1 и назван словом «already here», а не только оттенком');
  await page.getByRole('button', { name: /^add 2$/ }).click();
  await page.waitForTimeout(500);
  const assigned = await calls('AssignLibraryFileTopics');
  ck(
    assigned.length === 1 &&
      JSON.stringify(assigned[0].req.fileIds) === JSON.stringify([102, 103]) &&
      JSON.stringify(assigned[0].req.topicIds) === JSON.stringify([5]),
    'П4.3 на провод ушла ПАЧКА файлов и id проекта',
    JSON.stringify(assigned[0]?.req),
  );
  ck((await calls('SetLibraryFileRoles')).length === 0, 'П4.4 без роли ролевой вызов не делается');
}

// ═══ П5 · В СУЖЕНИИ ПО РОЛИ — ЗАПИСЬ С РОЛЬЮ ═══════════════════════════════════════════════
console.log('\nП5 · в разделе роли добавленное получает эту роль');
await mount({ start: '/files?project=5&frole=7' });
{
  ck((await addTile().count()) === 1, 'П5.0 (контроль) в сужении по роли плитка на месте');
  await addTile().click();
  const f = page.locator('[role="dialog"] button').filter({ hasText: 'loose-one.png' }).first();
  await f.waitFor({ timeout: 5000 });
  // ФАЙЛ, УЖЕ ЛЕЖАЩИЙ В ПРОЕКТЕ, НО БЕЗ ЭТОЙ РОЛИ, — законная цель: перенести его в раздел и
  // есть то, ради чего диалог открыли из самого раздела.
  const other = await page.evaluate(() => {
    const d = document.querySelector('[role="dialog"]');
    const node = Array.from(d?.querySelectorAll('*') || []).find(
      (el) => (el.textContent || '').includes('no-role') && el.children.length === 0,
    );
    if (!node) return 'файла нет в списке';
    return node.closest('button') ? 'выбирается' : 'не выбирается';
  });
  ck(other === 'выбирается', 'П5.0.1 файл проекта без этой роли можно выбрать', other);
  // ЗАМЕНА РОЛИ НАЗВАНА НА САМОЙ ПЛИТКЕ. Перенос из «lookbook» в «sources» стирает прежнюю
  // роль, и молчаливая замена здесь была бы тем же дефектом, что и в полосе выделения.
  const moving = await page.evaluate(() => {
    const d = document.querySelector('[role="dialog"]');
    const node = Array.from(d?.querySelectorAll('*') || []).find(
      (el) => (el.textContent || '').includes('other-role') && el.children.length === 0,
    );
    const tile = node?.closest('button');
    return tile ? tile.textContent || '' : 'плитки нет';
  });
  ck(
    /lookbook/.test(moving) && /moves/.test(moving),
    'П5.0.2 у файла с другой ролью сказано, что он ПЕРЕЕДЕТ и какая роль на нём сейчас',
    JSON.stringify(moving.slice(0, 60)),
  );
  await f.click();
  await page.getByRole('button', { name: /^add 1$/ }).click();
  await page.waitForTimeout(500);
  const roled = await calls('SetLibraryFileRoles');
  ck(
    roled.length === 1 &&
      Number(roled[0].req.roleId) === 7 &&
      Number(roled[0].req.projectTopicId) === 5,
    'П5.1 ушёл SetLibraryFileRoles с ролью текущего раздела',
    JSON.stringify(roled[0]?.req),
  );
}

// ═══ П6 · ПОЛОСА ВЫДЕЛЕНИЯ ═════════════════════════════════════════════════════════════════
console.log('\nП6 · «add to a project» при выделении чекбоксами');
await mount();
{
  // Отметка выделения — КНОПКА с `aria-pressed`, а не `input[type=checkbox]`: плитка держит
  // внутри свои органы, и настоящий чекбокс внутри кнопки был бы невалидной разметкой.
  const checks = page.getByRole('button', { name: /^select / });
  const n = await checks.count();
  ck(n > 0, 'П6.0 (контроль) на холсте есть отметки выделения', `отметок ${n}`);
  await checks.nth(0).click();
  await checks.nth(0).click();
  const addToProject = page.getByRole('button', { name: 'add to a project' });
  ck((await addToProject.count()) === 1, 'П6.1 в полосе есть отдельная кнопка «add to a project»');
  await addToProject.click();
  await page.waitForTimeout(300);
  const topicsBlockVisible = await page.evaluate(() => {
    const dialog = document.querySelector('[role="dialog"]');
    if (!dialog) return 'нет диалога';
    const label = Array.from(dialog.querySelectorAll('p')).find(
      (el) => (el.textContent || '').trim() === 'topics',
    );
    if (!label) return 'блока тем нет вовсе';
    return label.getBoundingClientRect().height > 0 ? 'виден' : 'скрыт';
  });
  ck(topicsBlockVisible === 'скрыт', 'П6.2 диалог сужен: блок тем не показан', topicsBlockVisible);
  const roleBlockVisible = await page.evaluate(() => {
    const dialog = document.querySelector('[role="dialog"]');
    if (!dialog) return 'нет диалога';
    const label = Array.from(dialog.querySelectorAll('p')).find(
      (el) => (el.textContent || '').trim() === 'role',
    );
    if (!label) return 'блока роли нет вовсе';
    return label.getBoundingClientRect().height > 0 ? 'виден' : 'скрыт';
  });
  ck(
    roleBlockVisible === 'скрыт',
    'П6.2.1 блок роли тоже скрыт: «add» ничего не заменяет, а роль — заменяет',
    roleBlockVisible,
  );
  await page.locator('[role="dialog"] button').filter({ hasText: 'autumn shoot' }).first().click();
  await page.getByRole('button', { name: /^add$/ }).click();
  await page.waitForTimeout(600);
  const assigned = await calls('AssignLibraryFileTopics');
  ck(
    assigned.length === 1 &&
      (assigned[0].req.fileIds || []).length === 2 &&
      JSON.stringify(assigned[0].req.topicIds) === JSON.stringify([5]),
    'П6.3 на провод ушли оба выделенных файла и id проекта',
    JSON.stringify(assigned[0]?.req),
  );
}

// ═══ П7 · ВСТАВКА ВНУТРИ ПРОЕКТА ═══════════════════════════════════════════════════════════
console.log('\nП7 · вставка внутри проекта уходит в этот проект');
await mount({ start: '/files?project=5' });
{
  // НАСТОЯЩАЯ ВСТАВКА: событие с файлом в буфере, как от ⌘V. Приёмник раздела слушает
  // `document` и сам решает, его ли очередь.
  await page.evaluate(() => {
    const dt = new DataTransfer();
    dt.items.add(new File([new Uint8Array([1, 2, 3])], 'pasted.png', { type: 'image/png' }));
    document.dispatchEvent(new ClipboardEvent('paste', { clipboardData: dt, bubbles: true }));
  });
  const dialog = page.locator('[role="dialog"]');
  const opened = await dialog
    .first()
    .waitFor({ timeout: 4000 })
    .then(() => true)
    .catch(() => false);
  ck(opened, 'П7.0 (контроль) вставка открыла приёмную модалку');
  if (opened) {
    // Сам чип — первый по документу `span`/`button` с этим именем: обёртки ряда сюда не
    // попадают, а `Chip` рисуется `span`-ом, когда нажимать его нельзя, и `button`-ом, когда можно.
    const chip = await page.evaluate(() => {
      const d = document.querySelector('[role="dialog"]');
      if (!d) return 'нет диалога';
      const host = Array.from(d.querySelectorAll('span,button')).find((el) =>
        (el.textContent || '').trim().toLowerCase().startsWith('autumn shoot'),
      );
      if (!host) return 'чипа проекта нет';
      return {
        tag: host.tagName.toLowerCase(),
        pressed: host.getAttribute('aria-pressed'),
        title: host.getAttribute('title') || '',
      };
    });
    ck(
      typeof chip === 'object' && chip.tag !== 'button',
      'П7.1 чип открытого проекта не переключается — вставка идёт в него',
      JSON.stringify(chip),
    );
    ck(
      typeof chip === 'object' && /open right now/.test(chip.title),
      'П7.2 и сказано словами, почему он не снимается',
      typeof chip === 'object' ? chip.title : '',
    );
    // И ГЛАВНОЕ — ЧТО УХОДИТ НА ПРОВОД. Чип на месте, но отправку решает не он: заливка идёт
    // мимо gRPC, своим multipart, и темы едут внутри поля `meta`.
    const upload = page
      .waitForRequest((r) => r.url().includes('/api/files/upload'), { timeout: 8000 })
      .then((r) => r.postData() || '')
      .catch(() => '');
    await page.getByRole('button', { name: 'upload' }).first().click();
    const meta = await upload;
    ck(!!meta, 'П7.3.0 (контроль) заливка вообще ушла — есть что читать');
    if (meta) {
      const ids = /"topic_ids":\s*\[([^\]]*)\]/.exec(meta)?.[1] ?? '';
      ck(
        ids
          .split(',')
          .map((x) => x.trim())
          .includes('5'),
        'П7.3 в заливку ушёл id открытого проекта',
        `topic_ids=[${ids}]`,
      );
    }
  }
}

await browser.close();
console.log(bad ? `\nКРАСНАЯ: провалов ${bad}` : '\nЗЕЛЁНАЯ: все проверки прошли');
process.exit(bad ? 1 : 0);
