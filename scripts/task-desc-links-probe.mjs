#!/usr/bin/env node
// УТВЕРЖДАЕТ на НАСТОЯЩЕЙ странице задачи три просьбы владельца (2026-09-17):
//
//   Ц1 — ссылка в описании КЛИКАБЕЛЬНА и открывается НОВОЙ ВКЛАДКОЙ: голый адрес, адрес в
//        угловых скобках, оформленная `[текст](адрес)`, внутренняя `/files/N` и адрес на строке
//        с чипом вложения; конечная пунктуация и непарная скобка в адрес не попадают; адрес в
//        `коде` ссылкой НЕ становится;
//   Ц2 — в COMMENTS нельзя выбрать медиа к комментарию: ряда «insert a link to attachment» под
//        полем нет, хотя вложения у карточки есть (положительный контроль — тот же ряд живёт в
//        редакторе описания); адрес в теле комментария — ссылка в новую вкладку;
//   Ц3 — двойной щелчок по описанию открывает инлайн-правку с фокусом в поле; двойной щелчок по
//        ссылке или чипу вложения правку НЕ открывает; пустое описание открывается так же;
//        без права на запись двойной щелчок ничего не делает.
//
//   node scripts/task-desc-links-probe.mjs
//   node scripts/task-desc-links-probe.mjs --mutate-no-autolink       адрес никогда не распознаётся
//   node scripts/task-desc-links-probe.mjs --mutate-keep-punct        конечная пунктуация остаётся в адресе
//   node scripts/task-desc-links-probe.mjs --mutate-internal-same-tab внутренняя ссылка — spa-навигацией
//   node scripts/task-desc-links-probe.mjs --mutate-no-dblclick       двойной щелчок не подключён
//   node scripts/task-desc-links-probe.mjs --mutate-no-dblclick-guard двойной щелчок по ссылке открывает правку
//   node scripts/task-desc-links-probe.mjs --mutate-dblclick-readonly двойной щелчок открывает правку без права
//   node scripts/task-desc-links-probe.mjs --mutate-no-autofocus      поле открывается без фокуса

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
const STUB_MARKER = 'PROBE_STUB_TASK_DESC_LINKS_NETWORK';
const REAL_API_MARKER = 'Grpc-Metadata-Authorization';
const STUB_SOURCE = `
globalThis.__PROBE_STUB = '${STUB_MARKER}';
const state = (globalThis.__server = globalThis.__server || { task: null, updates: [], comments: [] });
const wrap = () => ({ id: 1, task: { ...state.task }, board: 'TASK_BOARD_DESIGN', status: 'TASK_STATUS_TODO', position: 0, media: [], checklist: [], createdBy: 'me', createdAt: '2026-08-01T00:00:00Z', updatedAt: '', startedAt: '', archivedAt: '' });
const table = {
  GetTask: () => ({ task: wrap(), files: [] }),
  UpdateTask: ({ task }) => { state.updates.push(JSON.parse(JSON.stringify(task))); state.task = { ...task }; return {}; },
  ListTaskComments: () => ({ comments: state.comments || [] }),
  ListTasks: () => ({ tasks: [], total: 0 }),
  ListAdmins: () => ({ admins: [{ id: 1, username: 'nina' }] }),
  GetCurrentAccount: () => ({
    account: {
      username: 'me',
      isSuper: false,
      permissions: [{ section: 'tasks', access: state.readonly ? 'ACCESS_LEVEL_READ' : 'ACCESS_LEVEL_WRITE' }],
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
    b.onLoad({ filter: /.*/, namespace: 'probe-stub' }, () => ({
      contents: STUB_SOURCE,
      loader: 'js',
    }));
  },
};

const outfile = resolve(tmpdir(), `task-desc-links-${process.pid}.js`);
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
if (!bundle.includes(STUB_MARKER))
  dieNotRun(`в сборке нет «${STUB_MARKER}» — сетевой слой НЕ заглушен`);
if (bundle.includes(REAL_API_MARKER))
  dieNotRun(`в сборке есть «${REAL_API_MARKER}» — настоящий api-слой внутри`);

function mutate(name, needle, replacement) {
  const n = bundle.split(needle).length - 1;
  if (n !== 1) dieNotRun(`МУТАЦИЯ «${name}» НЕ ПРИМЕНИЛАСЬ: якорь найден ${n} раз вместо одного`);
  bundle = bundle.replace(needle, replacement);
  console.log(`  МУТАЦИЯ: ${name}`);
}
const flag = (f) => process.argv.includes(f);
if (flag('--mutate-no-autolink'))
  mutate(
    'адрес никогда не распознаётся',
    'if (!new URL(href2).hostname) return null;',
    'return null;',
  );
if (flag('--mutate-keep-punct'))
  mutate(
    'конечная пунктуация остаётся в адресе',
    `var TRAILING = /[.,:;!?'"*_~]/;`,
    'var TRAILING = /$^/;',
  );
if (flag('--mutate-internal-same-tab'))
  mutate(
    'внутренняя ссылка — spa-навигацией в той же вкладке',
    '...newTab ? { target: "_blank", rel: "noopener" } : {},',
    '...{},',
  );
if (flag('--mutate-no-dblclick'))
  mutate(
    'двойной щелчок не подключён',
    'onDoubleClick: canWrite ? editDescriptionOnDoubleClick : void 0,',
    'onDoubleClick: void 0,',
  );
if (flag('--mutate-dblclick-readonly'))
  mutate(
    'двойной щелчок открывает правку и без права на запись',
    'onDoubleClick: canWrite ? editDescriptionOnDoubleClick : void 0,',
    'onDoubleClick: editDescriptionOnDoubleClick,',
  );
if (flag('--mutate-no-dblclick-guard'))
  mutate(
    'двойной щелчок по ссылке/чипу открывает правку',
    `if (e2.target instanceof Element && e2.target.closest('a, button, [role="button"], img, video, input, textarea, select'))`,
    'if (false)',
  );
if (flag('--mutate-no-autofocus'))
  mutate('поле открывается без фокуса', 'if (!autoFocus) return;', 'return;');

let bad = 0;
const ck = (ok, what, d = '') => {
  if (!ok) bad++;
  console.log(`${ok ? '  ok  ' : '  FAIL'} ${what}${d ? `  — ${d}` : ''}`);
};

const DESCRIPTION = [
  'спека тут https://example.com/spec?a=1. и ещё <https://grbpwr.com/x>',
  'оформленная [дока](https://example.org/doc) и файл [лекала](/files/77)',
  'в коде `https://in-code.example` не ссылка',
  'на снимке [[media:12]] (см. https://ref-line.example/a)',
].join('\n');

const CARD = {
  title: 'вшить бирку',
  description: DESCRIPTION,
  assignee: 'nina',
  assignees: ['nina'],
  priority: 'TASK_PRIORITY_LOW',
  labels: [],
  // Вложение ЕСТЬ: иначе ряд выбора медиа не рисуется ни у кого (`media.length === 0`), и
  // «в комментариях ряда нет» было бы зелёным по неверной причине.
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
const COMMENTS = [
  {
    id: 5,
    body: 'посмотри https://comment.example/x, там всё',
    author: 'nina',
    authorId: 1,
    createdAt: '2026-09-01T00:00:00Z',
  },
];

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
page.on('pageerror', (e) => console.log('  [страница]', String(e).slice(0, 300)));
page.on('console', (m) => {
  if (m.type() === 'error') console.log('  [консоль]', m.text().slice(0, 200));
});
await page.route('http://probe.local/**', (r) =>
  r.fulfill({ status: 200, contentType: 'text/html', body: '<div id="root"></div>' }),
);
// Никаких внешних запросов со стенда (миниатюры, переходы).
await page.route(/^https?:\/\/(?!probe\.local)/, (r) => r.abort());

async function mount({ description = DESCRIPTION, readonly = false } = {}) {
  await page.goto('http://probe.local/');
  await page.addStyleTag({ content: CSS });
  await page.evaluate(
    ({ t, c, ro }) => {
      globalThis.__server = { task: t, updates: [], comments: c, readonly: ro };
      // Переход по ссылке стенду не нужен: щелчок по <a> гасится ДО браузера, но всплытие и
      // dblclick остаются настоящими — React слушает их на корне.
      document.addEventListener(
        'click',
        (e) => {
          if (e.target instanceof Element && e.target.closest('a')) e.preventDefault();
        },
        true,
      );
    },
    { t: { ...CARD, description }, c: COMMENTS, ro: readonly },
  );
  await page.addScriptTag({ content: bundle });
  await page.waitForSelector('text=comments', { timeout: 8000 });
  await page.waitForTimeout(300);
}
const editor = () => page.locator('textarea[aria-label="task description"]');
const anchor = (href) => page.locator(`a[href="${href}"]`);
// Жест по элементу, которого может не быть (под мутацией): отсутствие — провал проверки, а не
// падение стенда на таймауте, после которого остальные проверки не прогнались бы вовсе.
async function act(what, locator, fn) {
  if ((await locator.count()) === 0) {
    ck(false, `${what}: элемента для жеста нет`);
    return false;
  }
  await fn(locator.first());
  return true;
}
async function linkFacts(href) {
  const a = anchor(href);
  const n = await a.count();
  if (!n) return { n };
  return {
    n,
    target: await a.first().getAttribute('target'),
    rel: await a.first().getAttribute('rel'),
    text: await a.first().textContent(),
  };
}

// ═══ Ц1 · ССЫЛКИ В ОПИСАНИИ ════════════════════════════════════════════════════════════════
console.log('\nЦ1 · ссылки в описании кликабельны и открываются новой вкладкой');
await mount();
{
  const bare = await linkFacts('https://example.com/spec?a=1');
  ck(
    bare.n === 1 && bare.target === '_blank' && /noopener/.test(bare.rel ?? ''),
    'Ц1.1 голый адрес — <a target=_blank rel=noopener>',
    JSON.stringify(bare),
  );
  const punct = await anchor('https://example.com/spec?a=1.').count();
  ck(punct === 0, 'Ц1.2 точка, закрывающая фразу, в адрес не попала', `ссылок с точкой: ${punct}`);
  const angled = await linkFacts('https://grbpwr.com/x');
  ck(
    angled.n === 1 && angled.target === '_blank' && angled.text === 'https://grbpwr.com/x',
    'Ц1.3 адрес в <угловых скобках> — ссылка без скобок',
    JSON.stringify(angled),
  );
  const styled = await linkFacts('https://example.org/doc');
  ck(
    styled.n === 1 && styled.target === '_blank' && styled.text === 'дока',
    'Ц1.4 (контроль) оформленная [текст](адрес) — ссылка в новую вкладку',
    JSON.stringify(styled),
  );
  const internal = await linkFacts('/files/77');
  ck(
    internal.n === 1 && internal.target === '_blank',
    'Ц1.5 внутренняя [лекала](/files/77) — тоже новой вкладкой',
    JSON.stringify(internal),
  );
  const inCode = await anchor('https://in-code.example').count();
  const codeText = await page
    .locator('code')
    .filter({ hasText: 'https://in-code.example' })
    .count();
  ck(
    inCode === 0 && codeText === 1,
    'Ц1.6 адрес в `коде` остаётся кодом, не ссылкой',
    `ссылок ${inCode}, code ${codeText}`,
  );
  const refLine = await linkFacts('https://ref-line.example/a');
  ck(
    refLine.n === 1 && refLine.target === '_blank',
    'Ц1.7 адрес на строке с чипом вложения — ссылка, непарная «)» отрезана',
    JSON.stringify(refLine),
  );
  const chip = await page.getByRole('button', { name: /▣ 1/ }).count();
  ck(chip === 1, 'Ц1.8 (контроль) чип вложения на той же строке жив', `чипов ${chip}`);
}

// ═══ Ц2 · КОММЕНТАРИИ ══════════════════════════════════════════════════════════════════════
console.log('\nЦ2 · в комментариях нет выбора медиа; адрес в комментарии — ссылка');
{
  // По подсказке, а не по `name`: примитив `Textarea` имя в DOM не пробрасывает.
  const composer = page.getByPlaceholder('add a comment…');
  ck((await composer.count()) === 1, 'Ц2.0 (контроль) поле комментария на месте');
  const rowInComments = await page.locator('[aria-label^="insert a link to attachment"]').count();
  ck(
    rowInComments === 0,
    'Ц2.1 под полем комментария НЕТ ряда выбора медиа',
    `кнопок вставки на странице: ${rowInComments}`,
  );
  const c = await linkFacts('https://comment.example/x');
  ck(
    c.n === 1 && c.target === '_blank' && c.text === 'https://comment.example/x',
    'Ц2.2 адрес в комментарии — ссылка в новую вкладку, запятая отрезана',
    JSON.stringify(c),
  );
  await page.click('[aria-label="edit description"]');
  await editor()
    .waitFor({ timeout: 5000 })
    .catch(() => {});
  const rowInDesc = await page.locator('[aria-label^="insert a link to attachment"]').count();
  ck(
    rowInDesc === 1,
    'Ц2.3 (положительный контроль) в редакторе ОПИСАНИЯ ряд с тем же вложением есть',
    `кнопок: ${rowInDesc}`,
  );
}

// ═══ Ц3 · ДВОЙНОЙ ЩЕЛЧОК ═══════════════════════════════════════════════════════════════════
console.log('\nЦ3 · двойной щелчок по описанию открывает инлайн-правку');
await mount();
{
  ck((await editor().count()) === 0, 'Ц3.0 до жеста редактор закрыт');
  await page.getByText('в коде', { exact: false }).first().dblclick();
  await page.waitForTimeout(200);
  const open = await editor().count();
  const focused = await page.evaluate(() => document.activeElement?.getAttribute('aria-label'));
  const value = open ? await editor().inputValue() : '';
  ck(open === 1, 'Ц3.1 двойной щелчок по тексту открыл редактор');
  ck(focused === 'task description', 'Ц3.2 фокус — в поле описания', `activeElement=${focused}`);
  ck(value === DESCRIPTION, 'Ц3.3 в поле исходный текст описания');
  const sel = await page.evaluate(() => String(window.getSelection() ?? ''));
  ck(sel === '', 'Ц3.4 выделения от двойного щелчка не осталось', JSON.stringify(sel));
  if (await act('Ц3.5', editor(), (l) => l.press('Escape'))) {
    await page.waitForTimeout(150);
    ck((await editor().count()) === 0, 'Ц3.5 Esc закрывает, как и раньше');
  }
}
{
  if (await act('Ц3.6', anchor('https://example.com/spec?a=1'), (l) => l.dblclick())) {
    await page.waitForTimeout(200);
    ck((await editor().count()) === 0, 'Ц3.6 двойной щелчок ПО ССЫЛКЕ правку не открывает');
  }
  if ((await editor().count()) > 0) await editor().press('Escape');
  if (await act('Ц3.7', anchor('/files/77'), (l) => l.dblclick())) {
    await page.waitForTimeout(200);
    ck((await editor().count()) === 0, 'Ц3.7 двойной щелчок по внутренней ссылке — тоже нет');
  }
}
await mount();
{
  await page.getByRole('button', { name: /▣ 1/ }).dblclick();
  await page.waitForTimeout(300);
  ck((await editor().count()) === 0, 'Ц3.8 двойной щелчок по чипу вложения правку не открывает');
}
await mount({ description: '' });
{
  await page.getByText('No description.').dblclick();
  await page.waitForTimeout(200);
  ck(
    (await editor().count()) === 1,
    'Ц3.9 пустое описание: двойной щелчок по «No description.» открывает редактор',
  );
}
console.log('\nЦ3Б · без права на запись');
await mount({ readonly: true });
{
  const editBtn = await page.locator('[aria-label="edit description"]').count();
  ck(
    editBtn === 0,
    'Ц3.10 (контроль) аккаунт действительно без записи — кнопки edit нет',
    `кнопок ${editBtn}`,
  );
  await page.getByText('в коде', { exact: false }).first().dblclick();
  await page.waitForTimeout(200);
  ck(
    (await editor().count()) === 0,
    'Ц3.11 без права на запись двойной щелчок ничего не открывает',
  );
}

await browser.close();
console.log(bad ? `\nКРАСНАЯ: провалов ${bad}` : '\nЗЕЛЁНАЯ: все проверки прошли');
process.exit(bad ? 1 : 0);
