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
//   ЦЖ — жесты настоящие: клик открывает редактор, Enter сохраняет.
//
//   node scripts/task-detail-inline-probe.mjs
//   node scripts/task-detail-inline-probe.mjs --mutate-key-on-description  вернуть key={t.description}
//   node scripts/task-detail-inline-probe.mjs --mutate-base-from-live      base — живое значение на момент save
//   node scripts/task-detail-inline-probe.mjs --mutate-no-assignee-lock    исполнитель не глохнет на время записи
//   node scripts/task-detail-inline-probe.mjs --mutate-modal-reseed        модалка пересеивается на каждое перечитывание

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
  mutate(
    'исполнитель не глохнет на время летящей записи',
    'placeholder: "unassigned",\n        items,\n        disabled,\n        fullWidth: true',
    'placeholder: "unassigned",\n        items,\n        disabled: false,\n        fullWidth: true',
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

const assignee = page.locator('button[role="combobox"]').filter({ hasText: 'nina' }).first();
const lockedAttr = await assignee.getAttribute('disabled');
const lockedAria = await assignee.getAttribute('data-disabled');
let interacted = false;
try {
  await assignee.click({ timeout: 1200 });
  await page.locator('[role="option"]', { hasText: 'oleg' }).first().click({ timeout: 1200 });
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
