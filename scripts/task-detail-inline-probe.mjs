#!/usr/bin/env node
// УТВЕРЖДАЕТ: на НАСТОЯЩЕЙ странице задачи открытый инлайн-редактор переживает фоновое
// перечитывание карточки, а «то, что человек видел» берётся в НАЧАЛЕ правки, а не в момент
// сохранения. КРАСНЕЕТ ОТ: --mutate-key-on-description и --mutate-base-from-live.
//
//   Ц1 — набранное в открытом редакторе описания ПЕРЕЖИВАЕТ приход чужого текста по refetch;
//   Ц2 — правка того же поля, начатая ДО чужой правки, при сохранении ОТКАЗЫВАЕТ словами,
//        даже если кэш успел освежиться чужим значением (то есть `base` — из начала правки);
//   Ц3 — после отказа на сервере остался чужой заголовок, записи не было;
//   Ц4 — пока летит одна инлайн-запись, исполнитель НЕ ПРИНИМАЕТ вторую: иначе её свежее
//        чтение вернуло бы карточку без первой правки, и та молча откатилась бы;
//   Ц5 — набранное в ОТКРЫТОЙ модалке правки переживает фоновое перечитывание карточки;
//   Ц6 — то же, что Ц2, но на ОПИСАНИИ: захват «увиденного» там структурно такой же, и без
//        своего случая он держался на сходстве с заголовком, а не на замере;
//   Ц7 — ТОТ ЖЕ КЛАСС, ЧТО Ц4, НО НА КНОПКЕ «SAVE» У ОПИСАНИЯ: пока летит запись приоритета,
//        кнопка описания ЗАПЕРТА. До этой правки `loading` рисовал крутилку, но кнопку не
//        запирал — и второе нажатие уносило приоритет обратно;
//   Ц8 — ДВА ЖЕСТА В ОДНОМ ТАКТЕ (Enter по заголовку + клик «save» у описания). Перерисовки
//        между ними нет, значит ни одна блокировка по `isPending` ещё НЕ ВЗВЕДЕНА, и держит
//        только синхронный засов в самой двери;
//   Ц9 — засов отпускает: когда первая запись долетела, второй жест проходит;
//   Ц10 — «сохранил, ничего не изменив» НЕ ПИШЕТ ВОВСЕ: полная замена содержимого не бывает
//        бесплатной;
//   Ц11 — ОТКАЗ ОТПУСКАЕТ засов так же, как успех: конфликт не запирает карточку до перезагрузки;
//   Ц12 — УХОД СО СТРАНИЦЫ И ВОЗВРАТ не снимают засова, пока запись ещё летит. Ровно этот случай
//        отличает засов в кэше записей от засова в экземпляре хука;
//   ЦЖ — жесты настоящие: клик открывает редактор, Enter сохраняет.
//
//   node scripts/task-detail-inline-probe.mjs
//   node scripts/task-detail-inline-probe.mjs --mutate-key-on-description  вернуть key={t.description}
//   node scripts/task-detail-inline-probe.mjs --mutate-base-from-live      base — живое значение на момент save
//   node scripts/task-detail-inline-probe.mjs --mutate-no-assignee-lock    исполнитель не глохнет на время записи
//   node scripts/task-detail-inline-probe.mjs --mutate-modal-reseed        модалка пересеивается на каждое перечитывание
//   node scripts/task-detail-inline-probe.mjs --mutate-desc-base-from-live  ОПИСАНИЕ: base — живое значение на момент save
//   node scripts/task-detail-inline-probe.mjs --mutate-loading-not-disabled кнопка с крутилкой снова нажимаема (Ц7)
//   node scripts/task-detail-inline-probe.mjs --mutate-no-inline-write-lock засова в двери нет — две записи в полёте (Ц8, Ц12)
//   node scripts/task-detail-inline-probe.mjs --mutate-busy-from-observer   «занято» от наблюдателя, не из кэша (Ц12.0)
//   node scripts/task-detail-inline-probe.mjs --mutate-desc-writes-noop     пустое сохранение описания снова пишет (Ц10)

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
// Сервер ведёт себя как настоящий: UpdateTask заменяет содержимое ЦЕЛИКОМ. Неизвестный вызов
// не висит и не падает — отвечает пусто, чтобы страница смонтировалась целиком.
const STUB_MARKER = 'PROBE_STUB_TASK_DETAIL_NETWORK';
const REAL_API_MARKER = 'Grpc-Metadata-Authorization';
const STUB_SOURCE = `
globalThis.__PROBE_STUB = '${STUB_MARKER}';
const state = (globalThis.__server = globalThis.__server || { task: null, updates: [], gets: 0 });
const wrap = () => ({ id: 1, task: { ...state.task }, board: 'TASK_BOARD_DESIGN', status: 'TASK_STATUS_TODO', position: 0, media: [], checklist: [], createdBy: 'me', createdAt: '2026-08-01T00:00:00Z', updatedAt: '', startedAt: '', archivedAt: '' });
const table = {
  GetTask: () => { state.gets++; return { task: wrap(), files: [] }; },
  // Задержка — не украшение: без неё две записи никогда не окажутся в полёте одновременно,
  // и наложение, ради которого заведён случай Ц4, не воспроизводится в принципе.
  UpdateTask: ({ task }) => {
    const apply = () => { state.updates.push(JSON.parse(JSON.stringify(task))); state.task = { ...task }; return {}; };
    if (!state.delayUpdate) return apply();
    return new Promise((res) => setTimeout(() => res(apply()), state.delayUpdate));
  },
  ListTaskComments: () => ({ comments: [] }),
  ListTasks: () => ({ tasks: [], total: 0 }),
  ListAdmins: () => ({ admins: [{ username: 'nina' }, { username: 'oleg' }] }),
  GetCurrentAccount: () => ({ account: { username: 'me', isSuper: true, permissions: [] } }),
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

const outfile = resolve(tmpdir(), `task-detail-inline-${process.pid}.js`);
await esbuild({
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
  plugins: [stub],
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
if (process.argv.includes('--mutate-key-on-description'))
  mutate(
    'редактор описания снова пересаживается на серверное значение',
    'InlineDescription,\n                  {\n                    value: t2.description,',
    'InlineDescription,\n                  {\n                    key: t2.description,\n                    value: t2.description,',
  );
if (process.argv.includes('--mutate-base-from-live'))
  mutate('base берётся живым на момент сохранения', 'onSave(next, baseRef.current)', 'onSave(next, value)');
if (process.argv.includes('--mutate-modal-reseed'))
  mutate(
    'модалка пересеивается на каждое перечитывание карточки',
    'if (open) reset(initial);\n    }, [open]);',
    'if (open) reset(initial);\n    }, [open, initial]);',
  );
if (process.argv.includes('--mutate-no-assignee-lock'))
  // ЯКОРЬ ПЕРЕЕХАЛ ВМЕСТЕ С КОНТРОЛОМ. В рейке стоял одиночный `AssigneeSelect` (Radix Select);
  // теперь там пикер НЕСКОЛЬКИХ исполнителей со своим триггером. Свойство проверяется то же —
  // «на время летящей записи контрол не принимает жеста», — и мутация снимает ровно его.
  mutate(
    'исполнитель не глохнет на время летящей записи',
    '"data-assignees-trigger": true,\n          disabled,',
    '"data-assignees-trigger": true,\n          disabled: false,',
  );
if (process.argv.includes('--mutate-desc-base-from-live'))
  mutate(
    'ОПИСАНИЕ: base берётся живым на момент сохранения',
    'onSave(draft, baseRef.current);',
    'onSave(draft, value);',
  );
// ТРИ СЛОЯ — ТРИ МУТАЦИИ, И КАЖДАЯ СНИМАЕТ РОВНО ОДИН. Одна общая мутация была бы удобнее и
// лживее: защита здесь эшелонированная, и общий флаг не показал бы, который из слоёв ещё жив.
if (process.argv.includes('--mutate-loading-not-disabled'))
  // ПРИМИТИВ: `loading` снова только рисует крутилку. Дверь при этом цела, поэтому данные не
  // портятся — краснеет ровно то, что этот слой и обещает: кнопка не принимает жеста.
  mutate(
    'кнопка с крутилкой снова нажимаема',
    'const busyProps = loading ? { disabled: true } : {};',
    'const busyProps = {};',
  );
if (process.argv.includes('--mutate-no-inline-write-lock'))
  // ДВЕРЬ: засова нет вовсе. Виден только на жестах, обогнавших перерисовку, — на медленных его
  // подменяет запертая кнопка, и Ц7 остаётся зелёным.
  mutate(
    'засова в двери нет',
    'if (qc2.isMutating({ mutationKey: inlinePatchKey(taskId) }) > 0) {',
    'if (false) {',
  );
if (process.argv.includes('--mutate-busy-from-observer'))
  // «ЗАНЯТО» ДЛЯ КОНТРОЛОВ — СНОВА ОТ НАБЛЮДАТЕЛЯ. Дверь при этом цела, поэтому данные не
  // портятся: краснеет ровно то, что этот слой обещает, — после возврата на страницу контролы
  // заперты, пока заперта дверь. Мутация снимает ИМЕННО кэш-версию флага, не трогая засов, —
  // поэтому она отличима от `--mutate-no-inline-write-lock`, а не повторяет его.
  mutate(
    '«занято» для контролов взято у наблюдателя, а не из кэша записей',
    'const isPending = useIsMutating({ mutationKey: inlinePatchKey(taskId) }) > 0;',
    'const isPending = mutation.isPending;',
  );
if (process.argv.includes('--mutate-desc-writes-noop'))
  mutate(
    'пустое сохранение описания снова пишет',
    'if (draft === baseRef.current) {',
    'if (false) {',
  );

let bad = 0;
const ck = (ok, what, d = '') => {
  if (!ok) bad++;
  console.log(`${ok ? '  ok  ' : '  FAIL'} ${what}${d ? `  — ${d}` : ''}`);
};

const MY_DESC = 'МОЁ описание, каким я открыл страницу';
const CARD = {
  title: 'вшить бирку',
  description: MY_DESC,
  assignee: 'nina',
  assignees: ['nina'],
  priority: 'TASK_PRIORITY_LOW',
  labels: ['fw26'],
  mediaIds: [],
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
const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
page.on('pageerror', (e) => console.log('  [страница]', String(e).slice(0, 300)));
page.on('console', (m) => {
  if (m.type() === 'error') console.log('  [консоль]', m.text().slice(0, 200));
});
await page.route('http://probe.local/**', (r) =>
  r.fulfill({ status: 200, contentType: 'text/html', body: '<div id="root"></div>' }),
);

async function mount() {
  await page.goto('http://probe.local/');
  await page.addStyleTag({ content: CSS });
  await page.evaluate((t) => {
    globalThis.__server = { task: t, updates: [], gets: 0 };
  }, CARD);
  await page.addScriptTag({ content: bundle });
  await page.waitForSelector('[aria-label="edit title"]', { timeout: 8000 });
}
const server = () => page.evaluate(() => globalThis.__server);
const foreignEdit = (patch) =>
  page.evaluate((p) => {
    globalThis.__server.task = { ...globalThis.__server.task, ...p };
  }, patch);
/**
 * ПРИОРИТЕТ — НАСТОЯЩИЙ RADIX-СПИСОК: триггер, пункт, закрытие. Триггер ищется по ОТДЕЛЬНОМУ
 * span с подписью, а не по тексту `<label>`: сам label читается как «prioritylow» (подпись плюс
 * текущее значение), и поиск по нему привязался бы к выбранному значению.
 */
const pickPriority = async (label) => {
  await page
    .locator('label')
    .filter({ has: page.locator('span', { hasText: /^priority$/ }) })
    .locator('button[role="combobox"]')
    .first()
    .click();
  await page.waitForSelector('[role="option"]', { timeout: 5000 });
  await page.locator('[role="option"]').filter({ hasText: label }).first().click();
  await page
    .waitForSelector('[role="option"]', { state: 'detached', timeout: 5000 })
    .catch(() => {});
};
// Возврат в окно: ровно то, что делает refetchOnWindowFocus, который добавила эта же ветка.
const refetchLikeFocus = async () => {
  await page.evaluate(() => window.__qc.invalidateQueries({ queryKey: ['tasks', 'detail', 1] }));
  await page.waitForTimeout(250);
};

// ═══ Ц1 · НАБРАННОЕ В ОТКРЫТОМ РЕДАКТОРЕ ОПИСАНИЯ ═════════════════════════════════════════════
console.log('\nЦ1 · открытый редактор описания и чужой текст, приехавший по refetch');
await mount();
await page.click('[aria-label="edit description"]');
await page.waitForSelector('textarea[aria-label="task description"]', { timeout: 8000 });
const area = page.locator('textarea[aria-label="task description"]');
await area.fill('Я НАБРАЛ ЭТО И НЕ СОХРАНИЛ');
await foreignEdit({ description: 'ЧУЖОЕ описание, приехавшее пока я печатал' });
await refetchLikeFocus();
const stillOpen = await area.count();
const draft = stillOpen ? await area.inputValue() : '(редактор размонтирован)';
ck(stillOpen === 1, 'Ц1.0 редактор описания остался открыт после перечитывания');
ck(draft === 'Я НАБРАЛ ЭТО И НЕ СОХРАНИЛ', 'Ц1 набранное пережило приход чужого текста', JSON.stringify(draft));

// ═══ Ц2 · BASE ИЗ НАЧАЛА ПРАВКИ, А НЕ ИЗ МОМЕНТА СОХРАНЕНИЯ ═══════════════════════════════════
console.log('\nЦ2 · правку начал ДО чужой, кэш успел освежиться чужим значением');
await mount();
await page.click('[aria-label="edit title"]');
await page.waitForSelector('input[aria-label="task title"]');
const title = page.locator('input[aria-label="task title"]');
await title.fill('МОЙ новый заголовок');
// Коллега переименовал задачу, и возврат в окно принёс его заголовок В КЭШ — на экране его не
// видно, там мой input.
await foreignEdit({ title: 'ЧУЖОЙ новый заголовок' });
await refetchLikeFocus();
await title.press('Enter');
await page.waitForTimeout(400);
const afterClash = await server();
ck(
  afterClash.updates.length === 0,
  'Ц2 записи НЕ БЫЛО — конфликт по тому же полю пойман, хотя кэш успел освежиться',
  `updates=${afterClash.updates.length}${afterClash.updates.length ? `, ушёл title=${JSON.stringify(afterClash.updates[0].title)}` : ''}`,
);
ck(
  afterClash.task.title === 'ЧУЖОЙ новый заголовок',
  'Ц3 на сервере остался чужой заголовок',
  JSON.stringify(afterClash.task.title),
);
const stillEditing = await page.locator('input[aria-label="task title"]').count();
ck(stillEditing === 1, 'Ц2.1 после отказа редактор открыт и набранное на месте');

// ═══ Ц4 · ДВЕ ЗАПИСИ В ПОЛЁТЕ ════════════════════════════════════════════════════════════════
// Конфликт-проверка смотрит ТОЛЬКО на правленое поле. Значит вторая запись, начатая пока летит
// первая, проходит её насквозь и уносит на сервер соседнее поле таким, каким его вернуло её
// собственное свежее чтение, — то есть ДО первой правки. Лечится не проверкой, а тем, что
// контрол не принимает второго жеста, пока первый не долетел.
console.log('\nЦ4 · исполнитель не принимает жеста, пока летит запись заголовка');
await mount();
await page.evaluate(() => {
  globalThis.__server.delayUpdate = 1500;
});
await page.click('[aria-label="edit title"]');
await page.locator('input[aria-label="task title"]').fill('НОВЫЙ заголовок');
await page.locator('input[aria-label="task title"]').press('Enter');
await page.waitForTimeout(250); // запись пошла и висит

// Контрол сменился (пикер НЕСКОЛЬКИХ исполнителей вместо одиночного селекта), свойство — нет.
const assignee = page.locator('[data-assignees-trigger]').first();
const lockedAttr = await assignee.getAttribute('disabled');
const lockedAria = await assignee.getAttribute('data-disabled');
let interacted = false;
try {
  await assignee.click({ timeout: 1200 });
  await page.locator('[data-assignee-option="oleg"]').first().click({ timeout: 1200 });
  // Пикер пишет НА ЗАКРЫТИИ — без него жест не закончен и записи бы не было даже без замка.
  await assignee.click({ timeout: 1200 });
  interacted = true;
} catch {
  /* контрол не принял жеста — это и есть починка */
}
await page.waitForTimeout(2500); // обе записи, если их две, успевают долететь
const afterRace = await server();
ck(
  lockedAttr !== null || lockedAria !== null,
  'Ц4.0 на время полёта исполнитель заглушен',
  `disabled=${JSON.stringify(lockedAttr)} data-disabled=${JSON.stringify(lockedAria)}`,
);
ck(!interacted, 'Ц4.1 жест по исполнителю не прошёл', interacted ? 'прошёл — вторая запись стартовала' : '');
ck(
  afterRace.task.title === 'НОВЫЙ заголовок',
  'Ц4 заголовок НЕ ОТКАТИЛСЯ — второй записи с устаревшим полем не было',
  `title=${JSON.stringify(afterRace.task.title)}, записей ${afterRace.updates.length}`,
);

// ═══ Ц5 · ОТКРЫТАЯ МОДАЛКА ПРАВКИ ════════════════════════════════════════════════════════════
// Тот же класс потери, что Ц1, но этажом выше: `reset(initial)` под открытой модалкой стирает
// ВСЮ набранную форму. Люк был и до этой ветки, но срабатывал редко — карточка почти не
// перечитывалась сама. `refetchOnWindowFocus` сделал «отошёл и вернулся» обычным поводом.
console.log('\nЦ5 · набранное в открытой модалке и чужая правка, приехавшая по refetch');
await mount();
await page.getByRole('button', { name: 'edit', exact: true }).first().click();
await page.waitForSelector('[role="dialog"] input[aria-label="task title"]', { timeout: 8000 });
const modalTitle = page.locator('[role="dialog"] input[aria-label="task title"]');
await modalTitle.fill('НАБРАНО В МОДАЛКЕ И НЕ СОХРАНЕНО');
await foreignEdit({ description: 'чужая правка описания, пока модалка открыта' });
await refetchLikeFocus();
const modalStillOpen = await modalTitle.count();
const modalDraft = modalStillOpen ? await modalTitle.inputValue() : '(модалка пересеяна)';
ck(modalStillOpen === 1, 'Ц5.0 модалка осталась открытой');
ck(
  modalDraft === 'НАБРАНО В МОДАЛКЕ И НЕ СОХРАНЕНО',
  'Ц5 набранное в модалке пережило перечитывание карточки',
  JSON.stringify(modalDraft),
);

// ═══ Ц6 · ТО ЖЕ, ЧТО Ц2, НО НА ОПИСАНИИ ══════════════════════════════════════════════════════
// Захват «увиденного» у описания (`baseRef` в `InlineDescription`) устроен так же, как у
// заголовка, — но «так же устроен» это не замер. Пока своего случая не было, мутация,
// возвращающая описанию живое значение на момент сохранения, оставляла пробу ЗЕЛЁНОЙ.
console.log('\nЦ6 · правку описания начал ДО чужой, кэш успел освежиться чужим текстом');
await mount();
await page.click('[aria-label="edit description"]');
await page.waitForSelector('textarea[aria-label="task description"]', { timeout: 8000 });
const descArea = page.locator('textarea[aria-label="task description"]');
await descArea.fill('МОЁ новое описание');
await foreignEdit({ description: 'ЧУЖОЕ новое описание' });
await refetchLikeFocus();
await page.getByRole('button', { name: 'save', exact: true }).first().click();
await page.waitForTimeout(500);
const descClash = await server();
ck(
  descClash.updates.length === 0,
  'Ц6 записи НЕ БЫЛО — конфликт по описанию пойман так же, как по заголовку',
  `updates=${descClash.updates.length}${descClash.updates.length ? `, ушло ${JSON.stringify(descClash.updates[0].description)}` : ''}`,
);
ck(
  descClash.task.description === 'ЧУЖОЕ новое описание',
  'Ц6.1 на сервере осталось чужое описание',
  JSON.stringify(descClash.task.description),
);
ck(
  (await page.locator('textarea[aria-label="task description"]').count()) === 1 &&
    (await descArea.inputValue()) === 'МОЁ новое описание',
  'Ц6.2 после отказа редактор открыт и набранное на месте — чужая гонка не стоила мне моего текста',
);

// ═══ Ц7 · ЗАЯВЛЕННЫЙ ПОВТОР: ПРИОРИТЕТ В ПОЛЁТЕ, А Я ЖМУ «SAVE» У ОПИСАНИЯ ═══════════════════
// Тот же класс, что Ц4, но через дверь, которую Ц4 не трогал. Контролы рейки глохли на время
// полёта (`disabled={inlinePatch.isPending}`), а кнопка «save» у описания — НЕТ: ей передавали
// `loading`, а примитив кнопки на `loading` не запирался вовсе. Нажатие проходило, вторая запись
// делала СВОЁ свежее чтение — карточку ДО правки приоритета, — и садилась последней, вернув
// приоритет на прежний. Оба действия при этом рапортовали успехом.
console.log('\nЦ7 · пока летит запись приоритета, кнопка «save» у описания заперта');
await mount();
await page.evaluate(() => {
  globalThis.__server.delayUpdate = 2500;
});
await page.click('[aria-label="edit description"]');
await page.waitForSelector('textarea[aria-label="task description"]', { timeout: 8000 });
await page.locator('textarea[aria-label="task description"]').fill('МОЁ новое описание');

await pickPriority(/^high$/i);
await page.waitForTimeout(300); // перерисовка прошла, запись висит

const descSave = page.locator('[data-inline-save="description"]');
const descLocked = await descSave.getAttribute('disabled');
let descInteracted = false;
try {
  await descSave.click({ timeout: 1000 });
  descInteracted = true;
} catch {
  /* кнопка не приняла жеста — это и есть починка */
}
await page.waitForTimeout(3500); // обе записи, если их две, успевают долететь
const afterDesc = await server();
ck(descLocked !== null, 'Ц7.0 на время полёта кнопка «save» у описания заперта', `disabled=${JSON.stringify(descLocked)}`);
ck(!descInteracted, 'Ц7.1 жест по кнопке не прошёл', descInteracted ? 'прошёл — вторая запись стартовала' : '');
ck(
  afterDesc.updates.length === 1,
  'Ц7.2 запись была ровно одна',
  `updates=${afterDesc.updates.length}`,
);
ck(
  afterDesc.task.priority === 'TASK_PRIORITY_HIGH',
  'Ц7 ПРИОРИТЕТ НЕ ОТКАТИЛСЯ — второй записи с устаревшим полем не было',
  `priority=${JSON.stringify(afterDesc.task.priority)}`,
);
ck(
  afterDesc.task.description === MY_DESC,
  'Ц7.3 описание на сервере прежнее — его никто не сохранял',
  JSON.stringify(afterDesc.task.description),
);

// ═══ Ц8 · ДВА ЖЕСТА В ОДНОМ ТАКТЕ ════════════════════════════════════════════════════════════
// САМЫЙ ВАЖНЫЙ СЛУЧАЙ ЭТОЙ ПРАВКИ. Всё, что запирается по `isPending`, — состояние: оно
// становится истинным только ПОСЛЕ перерисовки. Два жеста, прошедшие в одном такте (двойной
// ⌘Enter, клик сразу за выбором в рейке), перерисовку обгоняют, и ни одна кнопка ещё не заперта.
// Держать в этот момент может только синхронный засов в самой двери.
//
// Оба редактора открыты СПЕЦИАЛЬНО: правятся РАЗНЫЕ поля, и потеря видна прямо в данных —
// вторая запись уносит заголовок таким, каким его вернуло её собственное чтение, то есть до
// первой правки.
console.log('\nЦ8 · Enter по заголовку и клик «save» у описания в ОДНОМ такте');
await mount();
await page.evaluate(() => {
  globalThis.__server.delayUpdate = 2000;
});
await page.click('[aria-label="edit description"]');
await page.waitForSelector('textarea[aria-label="task description"]', { timeout: 8000 });
await page.locator('textarea[aria-label="task description"]').fill('НОВОЕ описание');
await page.click('[aria-label="edit title"]');
await page.waitForSelector('input[aria-label="task title"]', { timeout: 8000 });
await page.locator('input[aria-label="task title"]').fill('НОВЫЙ заголовок');

// ОДИН ТАКТ: между двумя жестами нет ни микрозадачи, значит React заведомо не перерисовался.
// `sawEnabled` — это НЕ проверка свойства, а проверка того, что случай вообще состоялся: если
// кнопка к моменту клика уже успела запереться, то замерять было нечего, и зелёный прогон ничего
// не значил бы.
const sameTick = await page.evaluate(() => {
  const input = document.querySelector('input[aria-label="task title"]');
  const save = document.querySelector('[data-inline-save="description"]');
  if (!input || !save) return { mounted: false };
  input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
  const sawEnabled = !save.disabled;
  save.click();
  return { mounted: true, sawEnabled };
});
if (!sameTick.mounted) dieNotRun('Ц8: не нашлись оба контрола — случай не состоялся');
if (!sameTick.sawEnabled)
  dieNotRun(
    'Ц8: кнопка описания успела запереться ДО второго жеста — такт разъехался, и засов не проверялся',
  );
await page.waitForTimeout(3500);
const afterSameTick = await server();
ck(
  afterSameTick.updates.length === 1,
  'Ц8 в полёте была РОВНО ОДНА запись — вторую дверь не пустила',
  `updates=${afterSameTick.updates.length}`,
);
ck(
  afterSameTick.task.title === 'НОВЫЙ заголовок',
  'Ц8.1 ЗАГОЛОВОК НЕ ОТКАТИЛСЯ',
  `title=${JSON.stringify(afterSameTick.task.title)}`,
);
ck(
  afterSameTick.task.description === MY_DESC,
  'Ц8.2 описание не записалось — отказ, а не тихая запись поверх',
  JSON.stringify(afterSameTick.task.description),
);
ck(
  (await page.locator('textarea[aria-label="task description"]').count()) === 1 &&
    (await page.locator('textarea[aria-label="task description"]').inputValue()) ===
      'НОВОЕ описание',
  'Ц8.3 после отказа редактор открыт и набранное на месте — отказ не стоил мне текста',
);

// ═══ Ц9 · ЗАСОВ ОТПУСКАЕТ ════════════════════════════════════════════════════════════════════
// Отказ ради отказа — это заклиненный редактор, а не починка. Случай СВОЙ, а не продолжение Ц8:
// продолжение проверяло бы засов только там, где предыдущий случай уже зелёный, и под мутацией,
// ломающей Ц8, молча меняло бы смысл.
//
// Проверяются сразу две половины освобождения: жест снова проходит И проходит по СВЕЖЕМУ чтению —
// то есть не откатывает приоритет, записанный первой записью.
console.log('\nЦ9 · первая запись долетела — тот же жест проходит и ничего не откатывает');
await mount();
await page.evaluate(() => {
  globalThis.__server.delayUpdate = 600;
});
await page.click('[aria-label="edit description"]');
await page.waitForSelector('textarea[aria-label="task description"]', { timeout: 8000 });
await page.locator('textarea[aria-label="task description"]').fill('ОПИСАНИЕ ПОСЛЕ ЗАСОВА');
await pickPriority(/^high$/i);
await page.waitForFunction(() => globalThis.__server.updates.length >= 1, { timeout: 8000 });
// Ждём именно СНЯТИЯ замка, а не таймаута: «подождал и получилось» не отличает освобождение от
// везения.
await page
  .waitForSelector('[data-inline-save="description"]:not([disabled])', { timeout: 8000 })
  .catch(() => {});
await page.locator('[data-inline-save="description"]').click({ timeout: 3000 });
await page
  .waitForFunction(() => globalThis.__server.updates.length >= 2, { timeout: 8000 })
  .catch(() => {});
const afterRelease = await server();
ck(
  afterRelease.updates.length === 2,
  'Ц9 после того как первая запись долетела, вторая ПРОШЛА',
  `updates=${afterRelease.updates.length}`,
);
ck(
  afterRelease.task.description === 'ОПИСАНИЕ ПОСЛЕ ЗАСОВА',
  'Ц9.1 описание сохранено',
  JSON.stringify(afterRelease.task.description),
);
ck(
  afterRelease.task.priority === 'TASK_PRIORITY_HIGH',
  'Ц9.2 и приоритет первой записи уцелел — вторая писала по свежему чтению',
  `priority=${JSON.stringify(afterRelease.task.priority)}`,
);
ck(
  (await page.locator('textarea[aria-label="task description"]').count()) === 0,
  'Ц9.3 редактор закрылся — запись прошла, а не была проглочена',
);

// ═══ Ц10 · ПУСТОЕ СОХРАНЕНИЕ ОПИСАНИЯ НЕ ПИШЕТ ВОВСЕ ═════════════════════════════════════════
// «Открыл, посмотрел, нажал save» не должно стоить полной замены содержимого: такая запись
// способна и чужую правку соседнего поля откатить, и снекбар конфликта вызвать на ровном месте —
// за жест, которым человек ничего не менял.
console.log('\nЦ10 · открыл редактор описания, ничего не изменил, нажал save');
await mount();
await page.click('[aria-label="edit description"]');
await page.waitForSelector('textarea[aria-label="task description"]', { timeout: 8000 });
await page.locator('[data-inline-save="description"]').click();
await page.waitForTimeout(500);
const afterNoop = await server();
ck(
  afterNoop.updates.length === 0,
  'Ц10 записи НЕ БЫЛО — писать было нечего',
  `updates=${afterNoop.updates.length}`,
);
ck(
  (await page.locator('textarea[aria-label="task description"]').count()) === 0,
  'Ц10.1 редактор при этом закрылся — жест завершён, а не проглочен',
);

// ═══ Ц11 · ОТКАЗ ОТПУСКАЕТ ЗАСОВ ════════════════════════════════════════════════════════════
// Засов не снимается руками: запись перестаёт быть `pending`, когда долетела ИЛИ отказала. Разница
// между «и» и «или» здесь ценой в заклиненную карточку, поэтому она замеряется, а не выводится.
console.log('\nЦ11 · после КОНФЛИКТА следующая правка проходит');
await mount();
// ПОВТОР ЗАПИСИ — КАК В ПРОДЕ, И ТОЛЬКО В ЭТОМ СЛУЧАЕ. `src/index.tsx` ставит `mutations.retry: 1`,
// а значит отказ остаётся `pending` весь промежуток до повторной попытки и всю её саму: карточка
// заперта дольше, чем длится один запрос. Без этой строки случай мерил бы освобождение на
// интервале, которого в проде не бывает. Общему энтри повтор не отдан — см. довод там.
await page.evaluate(() => {
  const d = window.__qc.getDefaultOptions();
  window.__qc.setDefaultOptions({ ...d, mutations: { ...d.mutations, retry: 1 } });
});
await page.click('[aria-label="edit title"]');
await page.locator('input[aria-label="task title"]').fill('МОЙ новый заголовок');
await foreignEdit({ title: 'ЧУЖОЙ новый заголовок' });
await refetchLikeFocus();
const getsBeforeRefusal = (await server()).gets;
await page.locator('input[aria-label="task title"]').press('Enter');
// ЖДЁМ САМУ ДВЕРЬ, А НЕ СЕКУНДОМЕР. Отказ остаётся `pending` весь промежуток до повторной попытки
// и всю её саму (`mutations.retry: 1`, как в проде), поэтому фиксированная пауза мерила бы не
// освобождение, а удачно подобранное число.
const doorFreed = await page
  .waitForFunction(
    () => window.__qc.isMutating({ mutationKey: ['task-inline-patch', 1] }) === 0,
    { timeout: 15000 },
  )
  .then(() => true)
  .catch(() => false);
const afterRefusal = await server();
ck(
  afterRefusal.updates.length === 0,
  'Ц11.0 (контроль) отказ действительно случился — иначе освобождение проверять не на чем',
  `updates=${afterRefusal.updates.length}`,
);
ck(doorFreed, 'Ц11.1 дверь отпустила карточку после отказа, а не осталась запертой');
// БЕЗ ЭТОГО ПРЕДЫДУЩАЯ СТРОКА БЫЛА БЫ ПРО ДРУГОЙ ИНТЕРВАЛ: если бы `setDefaultOptions` выше не
// доехал, засов держал бы ОДИН заход, а случай зеленел бы, утверждая в комментарии повтор.
//
// ЗАМЕРЕНО НА ЭТОМ ЖЕ СЛУЧАЕ, оба числа — прогоном: один заход стоит ТРЁХ чтений карточки
// (своё свежее чтение записи, перечитывание по конфликту, перечитывание из `onSettled`), два
// захода — ПЯТИ. Граница взята по нижнему краю замера, а не по равенству: она отделяет один
// заход от двух и не ломается от лишнего фонового перечитывания.
ck(
  afterRefusal.gets - getsBeforeRefusal >= 4,
  'Ц11.1.1 (контроль) отказ и правда ходил ДВАЖДЫ — повтор как в проде, а не один заход',
  `GetTask за время отказа: ${afterRefusal.gets - getsBeforeRefusal} (один заход даёт 3, два — 5)`,
);
await pickPriority(/^high$/i);
await page.waitForFunction(() => globalThis.__server.updates.length >= 1, { timeout: 8000 }).catch(() => {});
const afterRefusalRelease = await server();
ck(
  afterRefusalRelease.updates.length === 1,
  'Ц11 следующая запись ПРОШЛА — отказ не запер карточку',
  `updates=${afterRefusalRelease.updates.length}`,
);
ck(
  afterRefusalRelease.task.priority === 'TASK_PRIORITY_HIGH',
  'Ц11.2 и записала именно то, что просили',
  `priority=${JSON.stringify(afterRefusalRelease.task.priority)}`,
);

// ═══ Ц12 · УХОД СО СТРАНИЦЫ И ВОЗВРАТ ═══════════════════════════════════════════════════════
// СЛУЧАЙ, РАДИ КОТОРОГО ЗАСОВ ЖИВЁТ В КЭШЕ ЗАПИСЕЙ, А НЕ В ЭКЗЕМПЛЯРЕ ХУКА. Ушёл на доску и
// вернулся, пока запись ещё летит: страница смонтирована ЗАНОВО, и всё, что она знает о полёте из
// собственного состояния, — ничего. `isPending` у нового экземпляра ложен ПО ПОСТРОЕНИЮ (у его
// наблюдателя нет текущей записи), поэтому кнопка «save» у описания не заперта и жест проходит.
// Удержать может только засов, который пережил размонтирование.
//
// Уход делается маршрутизатором, а не перезагрузкой стенда: перезагрузка унесла бы и `QueryClient`.
console.log('\nЦ12 · ушёл на доску и вернулся, пока летит запись приоритета');
await mount();
await page.evaluate(() => {
  // ПОЛЁТ ОБЯЗАН ПЕРЕЖИТЬ ВЕСЬ КРУГ «ушёл — вернулся — открыл редактор». Круг стоит около
  // полусекунды, запас взят десятикратный: задержка впритык означала бы не «засов не удержал», а
  // «держать было уже нечего», и случай зеленел бы по самой скучной из возможных причин. Что
  // запас не съеден, проверяется ниже отдельно — иначе эта строка была бы обещанием, а не мерой.
  globalThis.__server.delayUpdate = 5000;
});
const flightStartedAt = Date.now();
await pickPriority(/^high$/i);
await page.waitForTimeout(200); // запись пошла и висит
await page.evaluate(() => window.__nav('/tasks'));
await page.waitForSelector('[data-board-stub]', { timeout: 5000 });
await page.evaluate(() => window.__nav('/tasks/1'));
await page.waitForSelector('[aria-label="edit description"]', { timeout: 8000 });
await page.click('[aria-label="edit description"]');
await page.waitForSelector('textarea[aria-label="task description"]', { timeout: 8000 });
const stillFlying = await page.evaluate(
  () => window.__qc.isMutating({ mutationKey: ['task-inline-patch', 1] }) > 0,
);
if (!stillFlying)
  dieNotRun(
    `Ц12: запись успела долететь за ${Date.now() - flightStartedAt} мс — держать было нечего, и засов не проверялся`,
  );

// ДВА РАЗНЫХ УТВЕРЖДЕНИЯ, И ИХ НЕЛЬЗЯ ПУТАТЬ.
//  Ц12.0 — ЭКРАН: контролы заперты и после возврата. Держится на том, что «занято» взято из КЭША
//          записей; у наблюдателя нового экземпляра текущей записи нет, и он сказал бы «свободно»,
//          отперев и поле, и кнопку, и «edit», открывающую модалку.
//  Ц12   — ИТОГ: второй записи нет и приоритет не откачен — сколько бы слоёв ни сняли.
const remountLocked =
  (await page.locator('textarea[aria-label="task description"]').getAttribute('disabled')) !== null &&
  (await page.locator('[data-inline-save="description"]').getAttribute('disabled')) !== null;

// ЖЕСТ ПРОТАЛКИВАЕТСЯ МИМО `disabled` — ОДИНАКОВО В ОБОИХ МИРАХ. Если бы проба просто «печатала и
// жала», то на ПОЧИНЕННОМ коде она уперлась бы в запертое поле и молча ничего не проверила, а на
// сломанном прошла бы насквозь: один и тот же случай мерил бы разное. Снимая замок руками, проба
// спрашивает у обоих миров один вопрос — «что будет, если жест всё-таки случится».
await page.evaluate(() => {
  const area = document.querySelector('textarea[aria-label="task description"]');
  if (!area) return;
  area.disabled = false;
  // Контролируемое поле React не замечает присваивания `.value` — нужен родной сеттер и событие.
  const setValue = Object.getOwnPropertyDescriptor(
    HTMLTextAreaElement.prototype,
    'value',
  )?.set;
  setValue?.call(area, 'ОПИСАНИЕ ПОСЛЕ ВОЗВРАТА');
  area.dispatchEvent(new Event('input', { bubbles: true }));
});
await page.evaluate(() => {
  const b = document.querySelector('[data-inline-save="description"]');
  if (!b) return;
  b.disabled = false;
  b.click();
});
await page
  .waitForFunction(() => window.__qc.isMutating() === 0, { timeout: 20000 })
  .catch(() => {});
await page.waitForTimeout(300); // вторая запись, если она стартовала, успевает долететь
const afterRemount = await server();
ck(
  remountLocked,
  'Ц12.0 после возврата и поле, и кнопка ЗАПЕРТЫ — «занято» пережило размонтирование',
  remountLocked ? '' : 'не заперты — экран и дверь разошлись',
);
ck(
  afterRemount.updates.length === 1,
  'Ц12 запись была ровно одна — засов пережил размонтирование',
  `updates=${afterRemount.updates.length}`,
);
ck(
  afterRemount.task.priority === 'TASK_PRIORITY_HIGH',
  'Ц12.1 ПРИОРИТЕТ НЕ ОТКАТИЛСЯ',
  `priority=${JSON.stringify(afterRemount.task.priority)}`,
);

// ═══ ЦЖ · ЧТО ЖЕСТЫ ВООБЩЕ РАБОТАЮТ ══════════════════════════════════════════════════════════
console.log('\nЦЖ · положительный контроль: без чужой правки Enter сохраняет');
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
