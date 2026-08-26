#!/usr/bin/env node
// УТВЕРЖДАЕТ: на НАСТОЯЩЕЙ странице задачи работают три пожелания очереди Б и маркдаун описания.
// КРАСНЕЕТ ОТ: девяти флагов --mutate-… ниже.
//
//   Б2 · НЕСКОЛЬКО ИСПОЛНИТЕЛЕЙ
//     Ц1 — выбор ДВОИХ уходит ОДНОЙ записью, списком, с выведенным алиасом;
//     Ц2 — открыть и закрыть пикер, ничего не тронув, — записи НЕТ вовсе;
//     Ц3 — «увиденное» берётся при ОТКРЫТИИ: чужая правка того же поля даёт отказ, а не гонку;
//     Ц4 — прочитанные с провода трое показаны все трое, а не один первый.
//
//   Б7 · САБТАСКИ И СВЯЗИ
//     Ц5 — «создать сабтаску» = ОДИН AddTask с parentTaskId и НИ ОДНОГО SetTaskParent;
//     Ц6 — открытый блокер зажигает «blocked», доделанный — нет; архивный недоделанный держит;
//     Ц7 — снятие связи зовёт DeleteTaskLink с видом, названным С ТОЧКИ ЗРЕНИЯ ЭТОЙ карточки;
//     Ц8 — сохранение содержимого НЕ НЕСЁТ ни связей, ни родителя: их пишут только свои RPC.
//
//   Б8 · УДАЛЕНИЕ РЕПЛИКИ
//     Ц9 — СУПЕРУ орган показан на любой реплике (так решает сервер), обычному аккаунту —
//          только на своей и только при живой ссылке на автора;
//     Ц9.8 — подтверждение РАЗЛИЧАЕТ свою реплику и чужую: над чужой оно называет автора;
//     Ц10 — подтверждение зовёт DeleteTaskComment ровно с тем id и убирает строку;
//     Ц10.3 — отказ сервера ВОЗВРАЩАЕТ строку откатом (перечитывание при этом заморожено).
//
//   Б6 · МАРКДАУН В ОПИСАНИИ
//     Ц11 — `## …` становится настоящим <h2>, а не строкой с решётками;
//     Ц12 — ссылка на вложение ОСТАЁТСЯ чипом, сырых `[[media:` на экране нет;
//     Ц13 — при правке описания есть панель форматирования заметок;
//     Ц14 — ШОВ, КОТОРОГО РАНЬШЕ НЕ БЫЛО: панель над примитивом `ui/components/text-area`.
//           Каретка после вставки в СЕРЕДИНУ длинного текста остаётся там, куда её ставит
//           панель, поле не подпрыгивает и не уносит прокрутку страницы. Плюс РЕПЕТИЦИЯ на
//           подставном автогроу — см. довод у самого случая.
//
//   ЦЖ — положительный контроль: обычное сохранение заголовка проходит (стенд умеет видеть запись).
//
//   node scripts/task-queue-b-probe.mjs
//   node scripts/task-queue-b-probe.mjs --mutate-write-per-toggle   Б2: запись на каждый щелчок
//   node scripts/task-queue-b-probe.mjs --mutate-commit-unchanged   Б2: закрытие пишет всегда
//   node scripts/task-queue-b-probe.mjs --mutate-seen-at-close      Б2: «увиденное» берётся при закрытии
//   node scripts/task-queue-b-probe.mjs --mutate-subtask-two-calls  Б7: сабтаска создаётся двумя вызовами
//   node scripts/task-queue-b-probe.mjs --mutate-parent-in-insert   Б7: родитель уезжает внутри содержимого
//   node scripts/task-queue-b-probe.mjs --mutate-super-blind-ui     Б8: ветка супера снята
//   node scripts/task-queue-b-probe.mjs --mutate-confirm-from-permission  Б8: текст модала из права, не из авторства
//   node scripts/task-queue-b-probe.mjs --mutate-plain-description  Б6: описание снова печатается сырым
//   node scripts/task-queue-b-probe.mjs --mutate-no-caret-restore   Б6: панель не возвращает каретку
//   node scripts/task-queue-b-probe.mjs --mutate-no-comment-rollback   Б8: отказ не возвращает реплику
//   node scripts/task-queue-b-probe.mjs --mutate-autogrow-scrolls-to-field Ц14: автогроу уводит прокрутку к полю

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
// Сервер ведёт себя как настоящий: UpdateTask заменяет содержимое ЦЕЛИКОМ, связи и родитель
// живут ОТДЕЛЬНО от содержимого (иначе проба не могла бы отличить «не прислали» от «прислали
// и совпало»), а КАЖДЫЙ вызов пишется в журнал. Журнал — главный инструмент этой пробы:
// «сабтаска создаётся одним вызовом» проверяется только по тому, каких вызовов НЕ БЫЛО.
const STUB_MARKER = 'PROBE_STUB_TASK_QUEUE_B_NETWORK';
const REAL_API_MARKER = 'Grpc-Metadata-Authorization';
const STUB_SOURCE = `
globalThis.__PROBE_STUB = '${STUB_MARKER}';
const state = (globalThis.__server = globalThis.__server || {});
const log = (m, req) => { (state.calls = state.calls || []).push({ m, req: JSON.parse(JSON.stringify(req || {})) }); };
const card = () => ({
  id: 1,
  task: { ...state.task },
  board: 'TASK_BOARD_DESIGN',
  status: 'TASK_STATUS_TODO',
  position: 0,
  media: [],
  checklist: [],
  createdBy: 'me',
  createdAt: '2026-08-01T00:00:00Z',
  updatedAt: '',
  startedAt: '',
  archivedAt: '',
  parentTaskId: state.parentTaskId || 0,
  links: state.links || [],
  subtaskTotal: state.subtaskTotal || 0,
  subtaskDone: state.subtaskDone || 0,
});
const other = (id) => ({
  id,
  task: { title: 'соседняя ' + id, assignees: [], assignee: '', labels: [], mediaIds: [], fileIds: [], mediaAnnotations: [] },
  board: 'TASK_BOARD_DESIGN', status: 'TASK_STATUS_TODO', position: 0, media: [], checklist: [],
  createdBy: 'me', createdAt: '', updatedAt: '', startedAt: '', archivedAt: '',
  parentTaskId: 0, links: [], subtaskTotal: 0, subtaskDone: 0,
});
const table = {
  GetTask: (r) => { log('GetTask', r); state.gets = (state.gets || 0) + 1; return { task: r.id === 1 ? card() : other(r.id), files: [] }; },
  UpdateTask: ({ task }) => {
    log('UpdateTask', { task });
    const apply = () => { (state.updates = state.updates || []).push(JSON.parse(JSON.stringify(task))); state.task = { ...task }; return {}; };
    if (!state.delayUpdate) return apply();
    return new Promise((res) => setTimeout(() => res(apply()), state.delayUpdate));
  },
  AddTask: (r) => { log('AddTask', r); return { id: 99 }; },
  SetTaskParent: (r) => { log('SetTaskParent', r); return {}; },
  AddTaskLink: (r) => { log('AddTaskLink', r); return {}; },
  DeleteTaskLink: (r) => { log('DeleteTaskLink', r); return {}; },
  DeleteTaskComment: (r) => {
    log('DeleteTaskComment', r);
    if (state.refuseDelete) return Promise.reject(new Error('forbidden: not your comment'));
    state.comments = (state.comments || []).filter((c) => c.id !== r.id);
    return {};
  },
  // blockComments — заморозка перечитывания ленты: вечный pending. Нужна пробе отката (Ц10.3):
  // без неё строку вернул бы рефетч onSettled, и отсутствие отката было бы невидимо.
  ListTaskComments: () => (state.blockComments ? new Promise(() => {}) : { comments: state.comments || [] }),
  ListTasks: (r) => { log('ListTasks', r); return { tasks: r && r.parentTaskId ? (state.children || []) : (state.allTasks || []), total: 0 }; },
  ListAdmins: () => ({ admins: [{ id: 1, username: 'nina' }, { id: 2, username: 'oleg' }, { id: 3, username: 'kir' }] }),
  GetCurrentAccount: () => ({
    account: {
      username: 'me',
      // СУПЕРНОСТЬ — СИД, А НЕ КОНСТАНТА. «Обычному аккаунту чужая реплика недоступна» и
      // «суперу доступна любая» — два РАЗНЫХ утверждения, и стенд, у которого супер зашит,
      // умеет проверить только одно из них, молча выдавая второе за первое.
      isSuper: state.isSuper !== false,
      // Обычному аккаунту право на раздел выдаётся ЯВНО: без него canWrite ложен, страница не
      // рисует ни кнопки «edit», ни рейки, и mount() ждал бы её до таймаута.
      // ОБРАТНЫХ КАВЫЧЕК ЗДЕСЬ БЫТЬ НЕ МОЖЕТ: весь стаб — это шаблонная строка, и первая же
      // такая кавычка обрывает её посреди комментария.
      permissions:
        state.isSuper === false ? [{ section: 'tasks', access: 'ACCESS_LEVEL_WRITE' }] : [],
    },
  }),
  ListAccountSections: () => ({ sections: [] }),
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
    b.onLoad({ filter: /.*/, namespace: 'probe-stub' }, () => ({ contents: STUB_SOURCE, loader: 'js' }));
  },
};

const outfile = resolve(tmpdir(), `task-queue-b-${process.pid}.js`);
await esbuild({
  // ТОТ ЖЕ ВХОД, ЧТО У ПРОБЫ ИНЛАЙН-ПРАВКИ: монтируется настоящая `TaskDetail` целиком. Свой
  // вход означал бы вторую сборку той же страницы, которая однажды разойдётся с первой.
  entryPoints: [resolve(HERE, 'task-detail-inline-probe-entry.tsx')],
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
  plugins: [stub], // ← без этой строки в сборку уехал бы настоящий api-слой
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

function mutate(name, needle, replacement) {
  const n = bundle.split(needle).length - 1;
  if (n !== 1) dieNotRun(`МУТАЦИЯ «${name}» НЕ ПРИМЕНИЛАСЬ: якорь найден ${n} раз вместо одного`);
  bundle = bundle.replace(needle, replacement);
  console.log(`  МУТАЦИЯ: ${name}`);
}
const flag = (n) => process.argv.includes(n);

if (flag('--mutate-write-per-toggle'))
  mutate(
    'Б2 запись уходит на КАЖДЫЙ щелчок, а не одна на жест',
    'setDraft((cur) => cur.includes(name) ? cur.filter((n) => n !== name) : [...cur, name]);',
    'setDraft((cur) => { const next = cur.includes(name) ? cur.filter((n) => n !== name) : [...cur, name]; onChange(next, seenRef.current); return next; });',
  );
if (flag('--mutate-commit-unchanged'))
  mutate(
    'Б2 закрытие пикера пишет карточку даже без изменений',
    'if (!sameList(next, seen)) onChange(next, seen);',
    'onChange(next, seen);',
  );
if (flag('--mutate-subtask-two-calls'))
  mutate(
    'Б7 сабтаска создаётся двумя вызовами вместо одного',
    'parentTaskId: task.id\n        });',
    'parentTaskId: 0\n        });\n        await setParent.mutateAsync({ id: 99, parentTaskId: task.id });',
  );
if (flag('--mutate-parent-in-insert'))
  mutate(
    'Б7 родитель уезжает ВНУТРИ содержимого карточки',
    'return {\n      ...rest,\n      // ПОЛЕ ПРОВОДА ПОЯВИЛОСЬ',
    'return {\n      parentTaskId: 1,\n      ...rest,\n      // ПОЛЕ ПРОВОДА ПОЯВИЛОСЬ',
  );
if (flag('--mutate-no-caret-restore')) {
  // ДВЕ ПОЛОВИНЫ ОДНОГО МЕХАНИЗМА, и снимать надо обе: панель ставит выделение сразу после
  // правки И ещё раз в `useLayoutEffect`, после того как react применил новое значение.
  // Снять одну — вторая вернёт каретку на место, и мутация окажется сторожем у мёртвого кода.
  mutate(
    'Б6 панель не возвращает каретку (сразу после правки)',
    'area.setSelectionRange(edit.sel[0], edit.sel[1]);',
    ';',
  );
  mutate(
    'Б6 панель не возвращает каретку (в useLayoutEffect)',
    'area.setSelectionRange(p.sel[0], p.sel[1]);',
    ';',
  );
}
if (flag('--mutate-super-blind-ui'))
  mutate(
    'Б8 ветка супера снята — интерфейс снова уже серверного права',
    'return isSuper || isOwnComment(c2, currentUser);',
    'return isOwnComment(c2, currentUser);',
  );
if (flag('--mutate-confirm-from-permission'))
  // САМЫЙ ПРАВДОПОДОБНЫЙ СПОСОБ ПОТЕРЯТЬ РАЗЛИЧИЕ: вывести формулировку подтверждения из того
  // же предиката, который решает про ДОСТУП. У супера он истинен всегда — и над чужими словами
  // модал скажет «удалить ВАШУ реплику», не назвав никого.
  mutate(
    'Б8 подтверждение выводится из права, а не из авторства',
    'pendingIsMine = !!pendingDelete && isOwnComment(pendingDelete, account?.username);',
    'pendingIsMine = !!pendingDelete && canDeleteComment(pendingDelete, account?.username, isSuper);',
  );
if (flag('--mutate-plain-description'))
  mutate(
    'Б6 описание снова печатается сырым текстом',
    'if (!MEDIA_REF_LINE.test(text)) return [{ kind: "md", text }];',
    'return [{ kind: "refs", text }];',
  );
// ПРАВКА РЕВЬЮЕРА: откат оптимистичного снятия реплики. Якорь — по соседней строке снекбара,
// потому что сам вызов setQueryData(key, ctx.previous) в сборке встречается у каждого
// оптимистичного хука.
if (flag('--mutate-no-comment-rollback'))
  mutate(
    'Б8 отказ сервера НЕ возвращает снятую реплику',
    'if (ctx?.previous) qc2.setQueryData(key, ctx.previous);\n        showMessage(e2 instanceof Error ? e2.message : "Failed to delete comment", "error");',
    'showMessage(e2 instanceof Error ? e2.message : "Failed to delete comment", "error");',
  );
// ПРАВКА РЕВЬЮЕРА: мутация детектора Ц14.6 правит ПОДСТАВНОЙ автогроу (стендовый код, не
// сборку): будущий автогроу, забывший вернуть прокрутку вокруг замера высоты.
if (flag('--mutate-autogrow-scrolls-to-field'))
  console.log('  МУТАЦИЯ: Ц14 подставной автогроу уводит прокрутку к верху поля');
// ПРАВКА РЕВЬЮЕРА: мутация «увиденное при закрытии» раньше подставляла НЕСУЩЕСТВУЮЩИЙ
// `valueRef` — close() падал ReferenceError, запись не уходила вовсе, и краснели Ц1.0-Ц1.1
// (по обрыву), а Ц3 — единственная проба, ради которой мутация существует, — оставалась
// ЗЕЛЁНОЙ (updates=0 от краха неотличимо от updates=0 от пойманного конфликта). Это ровно
// «ложная краснота: мутация ломает исполнение». Теперь дефект настоящий: `seenRef` каждый
// рендер пересаживается на живое значение, то есть к закрытию в нём лежит последнее
// отрисованное — и чужая правка сверяется сама с собой. Замерено: красна Ц3/Ц3.1, Ц1-Ц2 целы.
if (flag('--mutate-seen-at-close'))
  mutate(
    'Б2 «увиденное» въезжает живым на каждом рендере — к закрытию оно чужое',
    'draftRef.current = draft;',
    'draftRef.current = draft;\n    seenRef.current = value;',
  );

let bad = 0;
const ck = (ok, what, d = '') => {
  if (!ok) bad++;
  console.log(`${ok ? '  ok  ' : '  FAIL'} ${what}${d ? `  — ${d}` : ''}`);
};

const CARD = {
  title: 'вшить бирку',
  description: '## что сделать\nсмотри [[media:12]] тут\n- пришить\n- отпарить',
  assignee: 'nina',
  assignees: ['nina'],
  priority: 'TASK_PRIORITY_LOW',
  labels: ['fw26'],
  mediaIds: [12],
  fileIds: [],
  techCardId: 0,
  productId: 0,
  orderUuid: '',
  archiveId: 0,
  fittingId: 0,
  productionRunId: 0,
  sampleId: 0,
  projectTopicId: 0,
  mediaAnnotations: [],
};

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1400, height: 1000 } });
page.on('pageerror', (e) => console.log('  [страница]', String(e).slice(0, 300)));
page.on('console', (m) => {
  if (m.type() === 'error') console.log('  [консоль]', m.text().slice(0, 200));
});
await page.route('http://probe.local/**', (r) =>
  r.fulfill({ status: 200, contentType: 'text/html', body: '<div id="root"></div>' }),
);

async function mount(seed = {}) {
  await page.goto('http://probe.local/');
  await page.addStyleTag({ content: CSS });
  await page.evaluate(
    ([t, s]) => {
      globalThis.__server = {
        task: t,
        updates: [],
        calls: [],
        gets: 0,
        links: [],
        comments: [],
        children: [],
        allTasks: [],
        parentTaskId: 0,
        subtaskTotal: 0,
        subtaskDone: 0,
        ...s,
      };
    },
    [CARD, seed],
  );
  await page.addScriptTag({ content: bundle });
  await page.waitForSelector('[aria-label="edit title"]', { timeout: 8000 });
}
const server = () => page.evaluate(() => globalThis.__server);
const callsOf = async (m) => (await server()).calls.filter((c) => c.m === m);
const foreignEdit = (patch) =>
  page.evaluate((p) => {
    globalThis.__server.task = { ...globalThis.__server.task, ...p };
  }, patch);
const refetchLikeFocus = async () => {
  await page.evaluate(() => window.__qc.invalidateQueries({ queryKey: ['tasks', 'detail', 1] }));
  await page.waitForTimeout(250);
};
const trigger = () => page.locator('[data-assignees-trigger]');
const optionFor = (n) => page.locator(`[data-assignee-option="${n}"]`);

// ═══ Ц1 · ДВОЕ УХОДЯТ ОДНОЙ ЗАПИСЬЮ ══════════════════════════════════════════════════════════
console.log('\nЦ1 · выбор двоих: одна запись, настоящий список, выведенный алиас');
await mount();
// СЧИТАТЬ НАДО ПОПЫТКИ ЗАПИСИ, А НЕ УДАВШИЕСЯ ЗАПИСИ, и это ЗАМЕР, а не педантизм.
//
// Первая версия проверяла `updates.length === 1` — и мутация «писать на каждый щелчок» её НЕ
// РОНЯЛА (замерено: 1 и 1). Вторая запись делает своё свежее чтение, видит там уже применённую
// первую, ловит конфликт и до сервера не доходит. То есть сторож стоял у мёртвого места:
// человеку дефект виден (лишний отказ снекбаром и лишние рейсы), пробе — нет.
//
// РАЗЛИЧАЕТ ИХ ЦЕНА ЖЕСТА В ЧТЕНИЯХ КАРТОЧКИ. Одна инлайн-запись стоит ровно двух `GetTask`:
// одно свежее чтение ПЕРЕД записью (мимо кэша, `useInlineTaskPatch`) и одно перечитывание
// ПОСЛЕ неё (`onSettled` гасит ключ). Замерено: чистая сборка — 2, мутированная — 5.
const getsBefore = (await callsOf('GetTask')).length;
await trigger().click();
await optionFor('oleg').click();
await page.waitForTimeout(120);
await trigger().click(); // закрытие = сохранение
await page.waitForTimeout(700);
const afterTwo = await server();
const writeAttempts = (await callsOf('GetTask')).length - getsBefore;
ck(
  writeAttempts === 2,
  'Ц1.0 жест из двух щелчков стоил РОВНО ОДНОЙ записи: два чтения карточки, не больше',
  `чтений за жест ${writeAttempts} (ожидается 2 = одно перед записью + одно после)`,
);
ck(
  afterTwo.updates.length === 1,
  'Ц1.0.1 и ровно одну полную замену содержимого',
  `updates=${afterTwo.updates.length}`,
);
ck(
  JSON.stringify(afterTwo.updates[0]?.assignees) === '["nina","oleg"]',
  'Ц1 на провод уехал НАСТОЯЩИЙ список из двоих',
  JSON.stringify(afterTwo.updates[0]?.assignees),
);
ck(
  afterTwo.updates[0]?.assignee === 'nina',
  'Ц1.1 совместимый алиас ВЫВЕДЕН из списка, а не пронесён',
  JSON.stringify(afterTwo.updates[0]?.assignee),
);

// ═══ Ц2 · ОТКРЫЛ И ЗАКРЫЛ — ЗАПИСИ НЕТ ═══════════════════════════════════════════════════════
// Каждая запись здесь — ПОЛНАЯ ЗАМЕНА содержимого карточки. Пустое открытие-закрытие, которое
// пишет, означает, что простой взгляд в пикер откатывает чужую правку описания.
console.log('\nЦ2 · открыл пикер, ничего не тронул, закрыл');
await mount();
await trigger().click();
await page.waitForTimeout(120);
await trigger().click();
await page.waitForTimeout(400);
const afterNoop = await server();
ck(
  afterNoop.updates.length === 0,
  'Ц2 записи НЕ БЫЛО — взгляд в пикер не переписывает карточку',
  `updates=${afterNoop.updates.length}`,
);

// ═══ Ц3 · «УВИДЕННОЕ» БЕРЁТСЯ ПРИ ОТКРЫТИИ ═══════════════════════════════════════════════════
console.log('\nЦ3 · пока пикер был открыт, исполнителя сменил кто-то другой');
await mount();
await trigger().click();
await page.waitForTimeout(120);
// Коллега назначил задачу на kir, и возврат в окно принёс это В КЭШ — на экране мой черновик.
await foreignEdit({ assignees: ['kir'], assignee: 'kir' });
await refetchLikeFocus();
await optionFor('oleg').click();
await page.waitForTimeout(120);
await trigger().click();
await page.waitForTimeout(600);
const afterClash = await server();
ck(
  afterClash.updates.length === 0,
  'Ц3 записи НЕ БЫЛО — конфликт по тому же полю пойман, хотя кэш успел освежиться',
  `updates=${afterClash.updates.length}${afterClash.updates.length ? `, ушло ${JSON.stringify(afterClash.updates[0].assignees)}` : ''}`,
);
ck(
  JSON.stringify(afterClash.task.assignees) === '["kir"]',
  'Ц3.1 на сервере остался ЧУЖОЙ исполнитель',
  JSON.stringify(afterClash.task.assignees),
);

// ═══ Ц4 · ТРОЕ С ПРОВОДА ПОКАЗАНЫ ВСЕ ТРОЕ ═══════════════════════════════════════════════════
console.log('\nЦ4 · карточка, у которой на проводе трое');
await mount({ task: { ...CARD, assignee: 'nina', assignees: ['nina', 'oleg', 'kir'] } });
const summary = await trigger().innerText();
ck(
  /nina/.test(summary) && /oleg/.test(summary) && /kir/.test(summary),
  'Ц4 в рейке названы ВСЕ ТРОЕ, а не один первый',
  JSON.stringify(summary.replace(/\s+/g, ' ').trim()),
);

// ═══ Ц5 · САБТАСКА — ОДИН ВЫЗОВ ══════════════════════════════════════════════════════════════
console.log('\nЦ5 · «создать сабтаску» одним вызовом, а не создать-и-привязать');
await mount();
const subInput = page.locator('input[aria-label="new subtask title"]');
await subInput.waitFor({ timeout: 8000 });
await subInput.fill('отпарить шов');
await subInput.press('Enter');
await page.waitForTimeout(600);
const adds = await callsOf('AddTask');
const setParents = await callsOf('SetTaskParent');
ck(adds.length === 1, 'Ц5.0 сабтаска завелась ровно одним AddTask', `AddTask×${adds.length}`);
ck(
  adds[0]?.req?.parentTaskId === 1,
  'Ц5 родитель уехал ТЕМ ЖЕ вызовом',
  JSON.stringify(adds[0]?.req?.parentTaskId),
);
ck(
  setParents.length === 0,
  'Ц5.1 отдельного SetTaskParent НЕ БЫЛО — отказ на нём оставил бы карточку-сироту',
  `SetTaskParent×${setParents.length}`,
);
ck(
  adds[0]?.req?.task?.title === 'отпарить шов',
  'Ц5.2 у сабтаски то имя, которое набрали',
  JSON.stringify(adds[0]?.req?.task?.title),
);

// ═══ Ц6 · БЕЙДЖ «BLOCKED» ════════════════════════════════════════════════════════════════════
console.log('\nЦ6 · что зажигает «blocked»');
const link = (taskId, kind, status, archived = false) => ({
  taskId,
  kind,
  title: `связанная ${taskId}`,
  status,
  board: 'TASK_BOARD_DESIGN',
  archived,
});
const bodyText = () => page.locator('body').innerText();

// БЕЙДЖ ИЩЕТСЯ ТОЧНО, А НЕ СЛОВОМ. Первая версия спрашивала `/blocked/i` по всему тексту
// страницы — и краснела на двух случаях из четырёх ЛОЖНО: слово «blocked by» стоит подписью
// группы связей и пунктом селекта вида, то есть присутствует на экране всегда, независимо от
// того, зажжён бейдж или нет. Ровно тот класс ошибки, что «ложная зелень по textContent», но
// с другой стороны: проба сообщала о дефекте, которого нет. Различает их середина точка-число:
// «blocked · 1» — это бейдж, «blocked by» — подпись.
const blockedBadges = () => page.getByText(/^blocked · \d+$/).count();

await mount({ links: [link(2, 'TASK_LINK_KIND_BLOCKED_BY', 'TASK_STATUS_TODO')] });
ck((await blockedBadges()) >= 1, 'Ц6.1 открытый блокер зажигает бейдж');
// Положительный контроль на сам детектор: подпись группы «blocked by» на экране ЕСТЬ, и
// грубый поиск по слову зеленел бы всегда — здесь он бы не различил ничего.
ck(
  /blocked by/i.test(await bodyText()),
  'Ц6.0 подпись «blocked by» на экране есть — поиск по одному слову тут ничего не различает',
);

await mount({ links: [link(2, 'TASK_LINK_KIND_BLOCKED_BY', 'TASK_STATUS_DONE')] });
ck((await blockedBadges()) === 0, 'Ц6.2 доделанный блокер бейджа НЕ зажигает', `бейджей ${await blockedBadges()}`);

// Архив прячет карточку с доски, но не отменяет «сначала то, потом это».
await mount({ links: [link(2, 'TASK_LINK_KIND_BLOCKED_BY', 'TASK_STATUS_TODO', true)] });
ck((await blockedBadges()) >= 1, 'Ц6.3 ЗААРХИВИРОВАННЫЙ недоделанный блокер держит');

await mount({ links: [link(2, 'TASK_LINK_KIND_BLOCKS', 'TASK_STATUS_TODO')] });
ck((await blockedBadges()) === 0, 'Ц6.4 «я блокирую другого» меня не блокирует', `бейджей ${await blockedBadges()}`);

// ═══ Ц7 · СНЯТИЕ СВЯЗИ ═══════════════════════════════════════════════════════════════════════
console.log('\nЦ7 · снятие связи зовёт свой RPC, а не сохранение карточки');
await mount({ links: [link(2, 'TASK_LINK_KIND_BLOCKED_BY', 'TASK_STATUS_TODO')] });
await page.locator('[aria-label="remove link to связанная 2"]').click();
await page.waitForTimeout(500);
const dels = await callsOf('DeleteTaskLink');
ck(dels.length === 1, 'Ц7.0 позвался ровно один DeleteTaskLink', `×${dels.length}`);
ck(
  dels[0]?.req?.taskId === 1 &&
    dels[0]?.req?.otherTaskId === 2 &&
    dels[0]?.req?.kind === 'TASK_LINK_KIND_BLOCKED_BY',
  'Ц7 вид назван С ТОЧКИ ЗРЕНИЯ ЭТОЙ карточки, а не перевёрнут',
  JSON.stringify(dels[0]?.req),
);
ck(
  (await server()).updates.length === 0,
  'Ц7.1 содержимое карточки при этом НЕ переписывалось',
);

// ═══ Ц8 · СОДЕРЖИМОЕ НЕ НЕСЁТ НИ СВЯЗЕЙ, НИ РОДИТЕЛЯ ═════════════════════════════════════════
// Связь принадлежит ДВУМ карточкам. Уедь она внутри полной замены содержимого — сохранение
// формы A снесло бы связь, добавленную с карточки B, пока форма A была открыта.
console.log('\nЦ8 · сохранение содержимого не трогает связи и родителя');
await mount({ links: [link(2, 'TASK_LINK_KIND_RELATES', 'TASK_STATUS_TODO')], parentTaskId: 5 });
await page.click('[aria-label="edit title"]');
await page.locator('input[aria-label="task title"]').fill('переименовал');
await page.locator('input[aria-label="task title"]').press('Enter');
await page.waitForTimeout(600);
const saved = (await server()).updates[0];
ck(!!saved, 'Ц8.0 запись вообще произошла — иначе проверка ниже пуста', saved ? '' : 'записи нет');
ck(
  saved && !('links' in saved) && !('parentTaskId' in saved),
  'Ц8 в содержимом НЕТ ни `links`, ни `parentTaskId`',
  saved ? Object.keys(saved).filter((k) => /link|parent/i.test(k)).join(',') || '(ни одного)' : '—',
);

// ═══ Ц9 · КОМУ ПОКАЗАН ОРГАН УДАЛЕНИЯ ════════════════════════════════════════════════════════
//
// ДВЕ ПОЛИТИКИ — ДВА СТЕНДА, и это исправление прежней пробы, а не прибавка.
//
// Раньше здесь стоял ОДИН стенд, у которого стаб отдавал `isSuper: true`, и на нём же
// утверждалось «у чужой реплики органа удаления НЕТ». То есть узкая политика пинилась под
// аккаунтом, которому сервер (`mayEditTaskComment`: `FullAccess() → true`) разрешает как раз
// ЛЮБУЮ реплику. Проверка была зелёной и при этом описывала право неверно.
//
// Ц9.2 ниже ПЕРЕВЁРНУТА СОЗНАТЕЛЬНО. Узкая политика не отменена — она переехала на аккаунт, к
// которому относится (Ц9.5–Ц9.7), и там проверяется по-прежнему.
const FEED = [
  { id: 11, taskId: 1, author: 'me', authorId: 7, body: 'моя реплика', createdAt: '2026-08-01T00:00:00Z' },
  { id: 12, taskId: 1, author: 'nina', authorId: 8, body: 'чужая реплика', createdAt: '2026-08-01T00:00:00Z' },
  { id: 13, taskId: 1, author: 'me', authorId: 0, body: 'моё имя, мёртвая ссылка', createdAt: '2026-08-01T00:00:00Z' },
];
const deleteBtn = (id) => page.locator(`[aria-label="delete comment ${id}"]`).count();

console.log('\nЦ9 · СУПЕР-АДМИНИСТРАТОР: сервер разрешает ему любую реплику');
await mount({ comments: FEED, isSuper: true });
await page.waitForSelector('text=моя реплика', { timeout: 8000 });
ck((await deleteBtn(11)) === 1, 'Ц9.1 у СВОЕЙ реплики орган удаления есть');
ck(
  (await deleteBtn(12)) === 1,
  'Ц9.2 у ЧУЖОЙ — ТОЖЕ ЕСТЬ: интерфейс перестал отказывать в том, что сервер разрешает',
);
ck(
  (await deleteBtn(13)) === 1,
  'Ц9.3 и у реплики удалённого аккаунта — полный доступ решает раньше пары «имя при живой ссылке»',
);

console.log('\nЦ9 · ОБЫЧНЫЙ АККАУНТ: узкая политика на месте');
await mount({ comments: FEED, isSuper: false });
await page.waitForSelector('text=моя реплика', { timeout: 8000 });
ck((await deleteBtn(11)) === 1, 'Ц9.4 своя реплика — орган есть');
ck((await deleteBtn(12)) === 0, 'Ц9.5 ЧУЖАЯ — органа НЕТ');
ck(
  (await deleteBtn(13)) === 0,
  'Ц9.6 своя с МЁРТВОЙ ссылкой — органа НЕТ (ловушка однофамильца)',
);
// Положительный контроль на сам стенд: если бы `isSuper: false` не доезжал до страницы, оба
// стенда были бы одним и тем же, а Ц9.5/Ц9.6 «проходили» бы по совпадению.
ck(
  (await page.locator('[aria-label="edit title"]').count()) === 1,
  'Ц9.7 обычный аккаунт всё равно пишет в раздел — стенды различаются суперностью, а не правом',
);

// ═══ Ц9.8 · ПОДТВЕРЖДЕНИЕ НАЗЫВАЕТ АВТОРА ════════════════════════════════════════════════════
//
// УДАЛИТЬ СВОЮ РЕПЛИКУ И СТЕРЕТЬ ЧУЖИЕ СЛОВА — РАЗНЫЕ ПОСТУПКИ. Кнопка у них одна и та же, и
// значит различать обязано подтверждение. Право расширили — различие поступков расширение не
// отменяет, и именно его легче всего потерять: достаточно вывести формулировку из того же
// предиката, который решает про доступ.
console.log('\nЦ9.8 · подтверждение различает свою реплику и чужую');
await mount({ comments: FEED, isSuper: true });
await page.waitForSelector('text=моя реплика', { timeout: 8000 });

/**
 * ОТСУТСТВУЮЩАЯ КНОПКА ОБЯЗАНА ДАТЬ FAIL, А НЕ ОБОРВАТЬ ПРОГОН.
 *
 * Прямой `.click()` по несуществующему органу — это исключение, а исключение здесь роняет
 * бинарь: все проверки НИЖЕ не выполняются вовсе. Замерено на мутации `--mutate-super-blind-ui`:
 * 29 исходов вместо 59, то есть «провалов 2» значило не «мутация поймана дважды», а «дальше
 * просто не считали». Сравнивать такие прогоны с чистым нельзя — числа несопоставимы.
 */
async function dialogFor(id) {
  if ((await deleteBtn(id)) === 0) return null; // органа нет — открывать нечего
  await page.locator(`[aria-label="delete comment ${id}"]`).click();
  await page.waitForSelector('[role="dialog"]', { timeout: 8000 });
  const text = await page.locator('[role="dialog"]').innerText();
  await page.getByRole('button', { name: 'cancel', exact: true }).click();
  await page.waitForTimeout(200);
  return text;
}
const mineDialog = await dialogFor(11);
const otherDialog = await dialogFor(12);
const shortly = (t) => (t === null ? '(органа удаления нет)' : JSON.stringify(t.replace(/\s+/g, ' ').trim().slice(0, 110)));

ck(
  mineDialog !== null && /your comment/i.test(mineDialog) && !/nina/i.test(mineDialog),
  'Ц9.8 над СВОЕЙ репликой подтверждение говорит «your comment» и никого не называет',
  shortly(mineDialog),
);
ck(
  otherDialog !== null && /nina/i.test(otherDialog),
  'Ц9.9 над ЧУЖОЙ — НАЗЫВАЕТ АВТОРА',
  shortly(otherDialog),
);
ck(
  otherDialog !== null && /someone else/i.test(otherDialog) && !/your comment/i.test(otherDialog),
  'Ц9.10 и говорит, что слова чужие, а не «ваши»',
);
ck(
  mineDialog !== null && otherDialog !== null && mineDialog !== otherDialog,
  'Ц9.11 два жеста не выглядят одним — тексты подтверждения различны',
);

console.log('\nЦ10 · подтверждение действительно стирает');
await mount({ comments: FEED, isSuper: true });
await page.waitForSelector('text=моя реплика', { timeout: 8000 });
await page.locator('[aria-label="delete comment 11"]').click();
await page.getByRole('button', { name: 'delete', exact: true }).last().click();
await page.waitForTimeout(600);
const delComments = await callsOf('DeleteTaskComment');
ck(delComments.length === 1 && delComments[0].req.id === 11, 'Ц10 позвался DeleteTaskComment ровно с тем id', JSON.stringify(delComments.map((c) => c.req)));
ck(
  !(await bodyText()).includes('моя реплика'),
  'Ц10.1 строка ушла с экрана',
);
ck((await bodyText()).includes('чужая реплика'), 'Ц10.2 соседние реплики на месте');

// ═══ Ц10.3 · ОТКАЗ СЕРВЕРА ВОЗВРАЩАЕТ СТРОКУ (правка ревью) ══════════════════════════════════
// Право решает СЕРВЕР (имя ПРИ живой ссылке — mayEditTaskComment), и клиентская кнопка — не
// защита. Оптимистичное снятие без отката оставило бы человека уверенным, что слова стёрты,
// а они на месте. Это ЕДИНСТВЕННАЯ ветка Б8, которую не покрывал ни один стенд.
//
// Перечитывание ленты ЗАМОРАЖИВАЕТСЯ (blockComments) ПОСЛЕ первого чтения: иначе строку вернул
// бы рефетч из onSettled, и мутация «откат снят» была бы неотличима от починки — сторож у
// мёртвого кода, ровно тот же класс, что был у `updates.length === 1`.
console.log('\nЦ10.3 · сервер отказал в удалении — реплика обязана ВЕРНУТЬСЯ');
await mount({
  comments: [
    { id: 21, taskId: 1, author: 'me', authorId: 7, body: 'реплика, которую не отдадут', createdAt: '2026-08-01T00:00:00Z' },
    { id: 22, taskId: 1, author: 'nina', authorId: 8, body: 'соседняя реплика', createdAt: '2026-08-01T00:00:00Z' },
  ],
  refuseDelete: true,
});
await page.waitForSelector('text=реплика, которую не отдадут', { timeout: 8000 });
await page.evaluate(() => {
  globalThis.__server.blockComments = true;
});
await page.locator('[aria-label="delete comment 21"]').click();
await page.getByRole('button', { name: 'delete', exact: true }).last().click();
await page.waitForTimeout(600);
const refused = await callsOf('DeleteTaskComment');
ck(
  refused.length === 1 && refused[0].req.id === 21,
  'Ц10.3 попытка ушла на сервер — решал он, а не клиентская кнопка',
  JSON.stringify(refused.map((c) => c.req)),
);
ck(
  (await bodyText()).includes('реплика, которую не отдадут'),
  'Ц10.4 после отказа строка ВЕРНУЛАСЬ — вернул её откат, перечитывание заморожено',
);
ck(
  /forbidden: not your comment/i.test(await bodyText()),
  'Ц10.5 отказ назван человеку словами сервера, а не проглочен',
);

// ═══ Ц11-Ц13 · МАРКДАУН ══════════════════════════════════════════════════════════════════════
console.log('\nЦ11 · описание рисуется разметчиком заметок');
await mount();
const h2 = page.locator('h2', { hasText: 'что сделать' });
ck((await h2.count()) === 1, 'Ц11 `## …` стало настоящим <h2>', `<h2>×${await h2.count()}`);
ck(
  (await page.locator('li', { hasText: 'отпарить' }).count()) === 1,
  'Ц11.1 пункты списка стали настоящими <li>',
);
const shown = await bodyText();
ck(!shown.includes('## что сделать'), 'Ц11.2 сырых решёток на экране нет');
ck(!shown.includes('[[media:'), 'Ц12 сырого токена вложения на экране нет', shown.includes('[[media:') ? 'есть' : '');
ck(
  (await page.locator('text=attachment removed').count()) + (await page.locator('[title^="open attachment"]').count()) >= 1,
  'Ц12.1 ссылка на вложение осталась ЧИПОМ, а не текстом',
);

console.log('\nЦ13 · панель форматирования при правке описания');
await page.click('[aria-label="edit description"]');
await page.waitForSelector('textarea[aria-label="task description"]', { timeout: 8000 });
const boldBtn = page.getByRole('button', { name: 'bold', exact: true });
ck((await boldBtn.count()) >= 1, 'Ц13 панель форматирования заметок стоит над полем', `кнопок «bold» ${await boldBtn.count()}`);
await page.getByRole('button', { name: 'preview markdown' }).click();
await page.waitForTimeout(200);
ck(
  (await page.locator('h2', { hasText: 'что сделать' }).count()) >= 1,
  'Ц13.1 «preview» показывает свёрстанный маркдаун ДО сохранения',
);

// ═══ Ц14 · ПАНЕЛЬ ФОРМАТИРОВАНИЯ НАД ПРИМИТИВОМ ПОЛЯ ═════════════════════════════════════════
//
// ЭТОТ ШОВ РОЖДАЕТСЯ ЗДЕСЬ. До этой правки единственным потребителем `FormatBar` был редактор
// заметок, и под ней стоял СЫРОЙ `<textarea>` (`files/note/note-editor.tsx`). Описание задачи —
// первое место, где панель оказалась над примитивом `ui/components/text-area.tsx`.
//
// ЗАМЕР РАСХОДИТСЯ С ОЖИДАНИЕМ, И ЭТО НАДО СКАЗАТЬ ВСЛУХ: примитив в ЭТОЙ базе НЕ РАСТЁТ под
// текст. `src/ui/components/text-area.tsx` — обычная `<textarea>` с `min-h-[44px]` и `resize-y`,
// ни одного обращения к `scrollHeight` во всём `src/ui`. Значит столкновение «панель ставит
// каретку в useLayoutEffect ↔ автогроу схлопывает высоту и меряет в том же такте» на этой ветке
// произойти НЕ МОЖЕТ — второй половины шва тут просто нет. Она приедет мержем ветки тех-карт.
//
// Поэтому случаев два: сперва замер того, что есть СЕЙЧАС, а потом РЕПЕТИЦИЯ будущего — с
// подставным автогроу, повторяющим описанный механизм. Репетиция названа репетицией: она
// свидетельствует о механизме, а не о коде, которого в дереве нет.
console.log('\nЦ14 · панель форматирования над примитивом поля');
const LONG = Array.from({ length: 40 }, (_, i) => `строка ${i + 1} длинного описания задачи`).join('\n');
const MARK = 'ЯКОРЬ';

async function formatInTheMiddle({ autogrow }) {
  await mount({ task: { ...CARD, description: `${LONG}\n${MARK}\n${LONG}` } });
  await page.click('[aria-label="edit description"]');
  await page.waitForSelector('textarea[aria-label="task description"]', { timeout: 8000 });
  const sel = 'textarea[aria-label="task description"]';
  if (autogrow) {
    // ПОДСТАВНОЙ АВТОГРОУ — не копия чужого кода, а его ОПИСАННЫЙ механизм: схлопнуть высоту,
    // прочитать `scrollHeight`, поставить обратно, сохранив прокрутку предков вокруг замера.
    //
    // `scrollsToField` — мутация детектора Ц14.6: автогроу, доводящий прокрутку к верху поля
    // (класс scroll-into-view/фокус — тот самый, в котором прежняя Ц14.6 обвиняла панель).
    // Просто ЗАБЫТЫЙ возврат прокрутки замерить нельзя: в хроме зажим прокрутки при схлопнутой
    // высоте не происходит в синхронном layout, и «забывчивый» grow следа не оставляет
    // (замерено: без restore прокрутка не меняется).
    await page.evaluate(([s, scrollsToField]) => {
      const el = document.querySelector(s);
      const grow = () => {
        const keep = window.scrollY;
        el.style.height = '0px';
        const h = el.scrollHeight;
        el.style.height = `${h}px`;
        window.scrollTo(0, keep);
        if (scrollsToField) el.scrollIntoView();
      };
      globalThis.__trace = [];
      const T = (tag) => globalThis.__trace.push(`${tag}:${Math.round(window.scrollY)}`);
      globalThis.__T = T;
      el.addEventListener('input', () => { T('input-before-grow'); grow(); T('input-after-grow'); });
      el.addEventListener('focus', () => T('focus'));
      globalThis.__grow = grow;
      grow();
    }, [sel, flag('--mutate-autogrow-scrolls-to-field')]);
  }
  // Каретка ставится в СЕРЕДИНУ — на слово-якорь, а не в конец: правка в конце не различает
  // «каретка сохранена» и «каретка уехала в конец».
  const at = await page.evaluate(
    ([s, m]) => {
      const el = document.querySelector(s);
      const i = el.value.indexOf(m);
      el.focus();
      el.setSelectionRange(i, i + m.length);
      return i;
    },
    [sel, MARK],
  );
  // ПРОКРУТКА СТАВИТСЯ ПОСЛЕ ФОКУСА, И ЭТО ЗАМЕР, А НЕ ПОРЯДОК ПО ВКУСУ. Первая версия крутила
  // страницу ДО `focus()` — и фокус на поле тут же прокручивал её обратно к полю, так что в
  // репетиции (поле высотой во весь текст стоит у верха страницы) `scrollY` возвращался в 0.
  // Проверка «прокрутка не уехала» становилась слепой: 0 до, 0 после.
  //
  // КРУТИТСЯ К ПАНЕЛИ, А НЕ НА ФИКСИРОВАННЫЕ 240, — ЭТО ПРАВКА РЕВЬЮ, И У НЕЁ ЕСТЬ ИСТОРИЯ.
  // Прежняя версия ставила scrollY=240 — у высокого поля кнопка «bold» оказывалась ВЫШЕ экрана
  // (top −81.5, замерено), и стенд, прежде чем нажать, сам докручивал её в вид. Полученные
  // «240 → 0» были жестом СТЕНДА, а не продукта: человек не может нажать кнопку, которой не
  // видит. Жест «нажал bold» существует только при видимой панели — с неё и меряем.
  await page.evaluate(() => {
    const btn = [...document.querySelectorAll('button')].find((b) => b.textContent === 'bold');
    window.scrollTo(0, Math.max(0, btn.getBoundingClientRect().top + window.scrollY - 40));
  });
  await page.waitForTimeout(80);
  const before = await page.evaluate(
    ([s, i]) => {
      const el = document.querySelector(s);
      const btn = [...document.querySelectorAll('button')].find((b) => b.textContent === 'bold');
      return {
        at: i,
        height: el.getBoundingClientRect().height,
        pageScroll: window.scrollY,
        boxTop: el.getBoundingClientRect().top,
        btnTop: btn.getBoundingClientRect().top,
      };
    },
    [sel, at],
  );
  await page.getByRole('button', { name: 'bold', exact: true }).click();
  await page.waitForTimeout(300);
  const after = await page.evaluate(
    ([s, m]) => {
      const el = document.querySelector(s);
      return {
        value: el.value,
        selStart: el.selectionStart,
        selEnd: el.selectionEnd,
        selected: el.value.slice(el.selectionStart, el.selectionEnd),
        around: el.value.slice(Math.max(0, el.selectionStart - 2), el.selectionEnd + 2),
        height: el.getBoundingClientRect().height,
        scrollHeight: el.scrollHeight,
        pageScroll: window.scrollY,
        boxTop: el.getBoundingClientRect().top,
        trace: globalThis.__trace || null,
      };
    },
    [sel, MARK],
  );
  if (process.argv.includes('--diagnose') && after.trace)
    console.log('  [след прокрутки]', JSON.stringify(after.trace));
  return { before, after };
}

const plain = await formatInTheMiddle({ autogrow: false });
// Положительный контроль на сами проверки прокрутки ниже: если страница не прокрутилась,
// «прокрутка не уехала» ничего не значит, и об этом надо сказать, а не радоваться зелени.
ck(
  plain.before.pageScroll > 0,
  'Ц14.-1 страница ДЕЙСТВИТЕЛЬНО прокручена — иначе проверки (б) слепые',
  `scrollY=${plain.before.pageScroll}`,
);
// Второй сторож замера: кнопка ВИДИМА до клика. Невидимую кнопку стенд докручивает в вид сам,
// и любое «прокрутка уехала» после этого — жест стенда, а не продукта.
ck(
  plain.before.btnTop >= 0 && plain.before.btnTop < 1000,
  'Ц14.-1.1 кнопка «bold» на экране ДО клика — жест человеческий, стенд не докручивал',
  `btnTop=${plain.before.btnTop}`,
);
ck(
  plain.after.value.includes(`**${MARK}**`),
  'Ц14.0 панель действительно правит текст в середине',
  JSON.stringify(plain.after.value.slice(plain.before.at - 4, plain.before.at + 12)),
);
ck(
  plain.after.selected === MARK && plain.after.around === `**${MARK}**`,
  'Ц14.1 (а) КАРЕТКА осталась на том же слове, а не уехала в конец',
  `выделено ${JSON.stringify(plain.after.selected)}, вокруг ${JSON.stringify(plain.after.around)}`,
);
ck(
  Math.abs(plain.after.pageScroll - plain.before.pageScroll) < 2,
  'Ц14.2 (б) прокрутка страницы не уехала',
  `${plain.before.pageScroll} → ${plain.after.pageScroll}`,
);
ck(
  Math.abs(plain.after.boxTop - plain.before.boxTop) < 2,
  'Ц14.3 (б) поле не подпрыгнуло',
  `top ${plain.before.boxTop} → ${plain.after.boxTop}`,
);
// (в) «высота соответствует новому тексту» — свойство АВТОГРОУ, а не сегодняшнего примитива.
// Здесь фиксируется то, что есть: высота задана рамкой и правка её не меняет.
ck(
  Math.abs(plain.after.height - plain.before.height) < 2,
  'Ц14.4 (в) сегодняшний примитив под текст НЕ растёт — высота от правки не меняется',
  `${plain.before.height} → ${plain.after.height}, scrollHeight=${plain.after.scrollHeight}`,
);

const grown = await formatInTheMiddle({ autogrow: true });
ck(
  grown.before.pageScroll > 0,
  'Ц14.4.1 и в репетиции страница тоже прокручена',
  `scrollY=${grown.before.pageScroll}`,
);
ck(
  grown.before.btnTop >= 0 && grown.before.btnTop < 1000,
  'Ц14.4.2 и в репетиции кнопка «bold» на экране ДО клика',
  `btnTop=${grown.before.btnTop}`,
);
ck(
  grown.after.selected === MARK && grown.after.around === `**${MARK}**`,
  'Ц14.5 РЕПЕТИЦИЯ: с подставным автогроу каретка ТОЖЕ остаётся на слове',
  `выделено ${JSON.stringify(grown.after.selected)}, вокруг ${JSON.stringify(grown.after.around)}`,
);
/*
 * ═══ ИСТОРИЯ ОДНОГО ЛОЖНОГО ДЕФЕКТА (правка ревью) ══════════════════════════════════════════
 *
 * Прежняя Ц14.6 УТВЕРЖДАЛА дефект: «у высокого поля панель уносит прокрутку 240 → 0, причина —
 * `area.focus()` в format-bar». Ревью замерило иначе, и все три опоры того вывода рухнули:
 *
 *   1. При scrollY=240 кнопка «bold» стояла ВЫШЕ экрана (top −81.5, замерено) — и «240 → 0»
 *      делал сам стенд, докручивая невидимую кнопку перед кликом. Человек этого жеста не имеет:
 *      невидимую кнопку не нажать.
 *   2. `area.focus()` в этом жесте — no-op: кнопки панели глушат mousedown (`preventDefault`),
 *      поле фокуса НЕ ТЕРЯЕТ, и фокусировать сфокусированное браузеру незачем. «focus:0» в
 *      старом следе — это фокус САМОГО СТЕНДА при постановке каретки, до scrollTo.
 *   3. Репетиция починки — `focus({ preventScroll: true })` на оба вызова — не меняла в следе
 *      НИ БАЙТА. Проба была зелёной и «до починки», и «после» — то есть не была пробой.
 *
 * Поэтому теперь утверждается СВОЙСТВО, а не миф: при ВИДИМОЙ панели (единственный случай, когда
 * жест существует) клик по «bold» прокрутку страницы не трогает — даже у высокого поля с
 * автогроу. Красный исход снова возможен: его даёт автогроу, забывший вернуть прокрутку вокруг
 * замера высоты (`--mutate-autogrow-scrolls-to-field`), — ровно тот будущий сосед, ради которого
 * репетиция и существует.
 */
ck(
  Math.abs(grown.after.pageScroll - grown.before.pageScroll) < 2,
  'Ц14.6 у ВЫСОКОГО поля видимая панель прокрутку тоже не трогает',
  `${grown.before.pageScroll} → ${grown.after.pageScroll}`,
);
// Потолок высоты — то единственное в этом шве, что лежит в МОИХ файлах. Он обязан работать
// против inline-`height`, которым автогроу выставляет размер: `max-height` его побеждает.
ck(
  grown.after.height < grown.after.scrollHeight && grown.after.height <= 620,
  'Ц14.7 потолок высоты держит поле: автогроу просит 1464, поле остаётся в пределах 60vh',
  `height=${grown.after.height}, просил scrollHeight=${grown.after.scrollHeight}`,
);

// ═══ ЦЖ · ПОЛОЖИТЕЛЬНЫЙ КОНТРОЛЬ ═════════════════════════════════════════════════════════════
console.log('\nЦЖ · положительный контроль: обычное сохранение проходит');
await mount();
await page.click('[aria-label="edit title"]');
await page.locator('input[aria-label="task title"]').fill('спокойный заголовок');
await page.locator('input[aria-label="task title"]').press('Enter');
await page.waitForFunction(() => globalThis.__server.updates.length > 0, { timeout: 5000 }).catch(() => {});
const calm = await server();
ck(
  calm.updates.length === 1 && calm.task.title === 'спокойный заголовок',
  'ЦЖ настоящий Enter действительно сохраняет — проба умеет видеть и запись',
  `updates=${calm.updates.length}, title=${JSON.stringify(calm.task.title)}`,
);

await browser.close();
console.log(bad ? `\nКРАСНАЯ: провалов ${bad}` : '\nЗЕЛЁНАЯ: все проверки прошли');
process.exit(bad ? 1 : 0);
