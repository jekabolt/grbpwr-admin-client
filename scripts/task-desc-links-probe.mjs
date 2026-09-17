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
//   node scripts/task-desc-links-probe.mjs --mutate-trim-star         «*» на конце адреса отрезается
//   node scripts/task-desc-links-probe.mjs --mutate-quadratic-trim    баланс скобок пересчитывается на каждом шаге
//   node scripts/task-desc-links-probe.mjs --mutate-no-quote-trim     «» и … на конце остаются в адресе
//   node scripts/task-desc-links-probe.mjs --mutate-no-portal-guard   двойной щелчок из просмотрщика доходит до описания
//   node scripts/task-desc-links-probe.mjs --mutate-no-scroll-into-view  поле длинного описания открывается за экраном
//   node scripts/task-desc-links-probe.mjs --mutate-focus-at-mount-only  замороженное поле так и остаётся без фокуса
//
//   Ц1.9–Ц1.11 и Ц4 мутацией не закрываются: они написаны по дефектам ревью первой версии
//   (адрес искался наравне с токенами разметки), и их краснота проверена прогоном против неё.

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
  // Задержка — чтобы двойной щелчок успел прийти, ПОКА летит чужая инлайн-запись (Ц3.14).
  UpdateTask: ({ task }) => {
    const apply = () => { state.updates.push(JSON.parse(JSON.stringify(task))); state.task = { ...task }; return {}; };
    if (!state.delayUpdate) return apply();
    return new Promise((res) => setTimeout(() => res(apply()), state.delayUpdate));
  },
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
if (flag('--mutate-no-autolink'))
  mutate(
    'адрес никогда не распознаётся',
    'if (!new URL(href2).hostname) return null;',
    'return null;',
  );
if (flag('--mutate-keep-punct'))
  mutate(
    'конечная пунктуация остаётся в адресе',
    `var TRAILING = /[.,:;!?'"»”’…]/;`,
    'var TRAILING = /$^/;',
  );
if (flag('--mutate-trim-star'))
  mutate(
    'звёздочка на конце адреса снова отрезается (набор GFM)',
    `var TRAILING = /[.,:;!?'"»”’…]/;`,
    `var TRAILING = /[.,:;!?'"»”’…*_~]/;`,
  );
if (flag('--mutate-no-quote-trim'))
  mutate(
    'закрывающие ёлочки/лапки/многоточие остаются в адресе',
    `var TRAILING = /[.,:;!?'"»”’…]/;`,
    `var TRAILING = /[.,:;!?'"]/;`,
  );
if (flag('--mutate-no-portal-guard'))
  mutate(
    'двойной щелчок из портала (просмотрщик) доходит до описания',
    'if (!(e2.target instanceof Element) || !e2.currentTarget.contains(e2.target)) return;',
    'if (!(e2.target instanceof Element)) return;',
  );
if (flag('--mutate-no-scroll-into-view'))
  mutate('открытое поле не приводится в вид', 'el.scrollIntoView({ block: "nearest" });', '');
if (flag('--mutate-focus-at-mount-only'))
  mutate(
    'фокус пробуется один раз при монтировании, даже замороженного поля',
    'if (!autoFocus || focusedRef.current || disabled) return;',
    'if (!autoFocus || focusedRef.current) return;',
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
    `if (e2.target.closest('a, button, [role="button"], img, video, input, textarea, select'))`,
    'if (false)',
  );
if (flag('--mutate-no-autofocus'))
  mutate(
    'поле открывается без фокуса',
    'if (!autoFocus || focusedRef.current || disabled) return;',
    'return;',
  );

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
  'жирным **https://bold.example/b** и вплотную https://glued.example/**жирный**',
  'регистр HTTP://UPPER.example/x',
  'ёлочки «https://quoted.example/a» и дальше',
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
    body: 'посмотри https://comment.example/x, там всё; поиск https://search.example/q?sku=GRB*',
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
// Снимки для просмотрщика (Ц3.12) — настоящие картинки, иначе `NoteImage` откатится в ссылку и
// просмотрщику нечего открывать. Маршрут позже — значит проверяется раньше общего запрета.
const PIXEL = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  'base64',
);
await page.route('https://img.example/**', (r) =>
  r.fulfill({ status: 200, contentType: 'image/png', body: PIXEL }),
);

async function mount({
  description = DESCRIPTION,
  readonly = false,
  delayUpdate = 0,
  comments = COMMENTS,
} = {}) {
  await page.goto('http://probe.local/');
  await page.addStyleTag({ content: CSS });
  await page.evaluate(
    ({ t, c, ro, delay }) => {
      globalThis.__server = { task: t, updates: [], comments: c, readonly: ro, delayUpdate: delay };
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
    { t: { ...CARD, description }, c: comments, ro: readonly, delay: delayUpdate },
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
  const inBold = await page.locator('b > a[href="https://bold.example/b"]').count();
  ck(
    inBold === 1,
    'Ц1.9 адрес внутри **жирного** — ссылка внутри жирного',
    `ссылок в <b>: ${inBold}`,
  );
  const glued = await linkFacts('https://glued.example/');
  const gluedBold = await page.locator('b', { hasText: /^жирный$/ }).count();
  ck(
    glued.n === 1 && gluedBold === 1,
    'Ц1.10 адрес вплотную к разметке не глотает её: ссылка + жирный, а не одна длинная ссылка',
    `${JSON.stringify(glued)}, <b>жирный</b>: ${gluedBold}`,
  );
  const quoted = await linkFacts('https://quoted.example/a');
  ck(quoted.n === 1, 'Ц1.12 закрывающая «ёлочка» в адрес не попала', JSON.stringify(quoted));
  const upper = await linkFacts('HTTP://UPPER.example/x');
  ck(
    upper.n === 1 && upper.target === '_blank',
    'Ц1.11 схема в верхнем регистре — тоже ссылка',
    JSON.stringify(upper),
  );
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
  const star = await linkFacts('https://search.example/q?sku=GRB*');
  ck(
    star.n === 1,
    'Ц2.4 звёздочка на конце поискового адреса остаётся в адресе',
    JSON.stringify(star),
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
  // СОБЫТИЕМ, А НЕ ДВУМЯ ЩЕЛЧКАМИ: первый настоящий щелчок по чипу открывает просмотрщик, и
  // второй попадал бы уже в него, а не в чип, — проверка зеленела, не дойдя до правила о кнопках.
  await page.getByRole('button', { name: /▣ 1/ }).dispatchEvent('dblclick');
  await page.waitForTimeout(300);
  ck((await editor().count()) === 0, 'Ц3.8 двойной щелчок по чипу вложения правку не открывает');
}
console.log('\nЦ3В · портал, длинное описание, фокус во время чужой записи');
await mount({
  description:
    '![a](https://img.example/1.png) ![b](https://img.example/2.png)\nтекст под снимками',
});
{
  const pic = page.locator('button', { has: page.locator('img[src="https://img.example/1.png"]') });
  if (await act('Ц3.12', pic, (l) => l.click())) {
    const viewer = page.locator('[data-media-viewer]');
    await viewer.waitFor({ timeout: 5000 }).catch(() => {});
    ck((await viewer.count()) === 1, 'Ц3.12.0 (контроль) снимок из описания открыл просмотрщик');
    if (await viewer.count()) {
      await viewer.dispatchEvent('dblclick');
      await page.waitForTimeout(300);
      ck(
        (await editor().count()) === 0 && (await viewer.count()) === 1,
        'Ц3.12 двойной щелчок ВНУТРИ просмотрщика (портал) не открывает правку и не закрывает его',
        `редактор ${await editor().count()}, просмотрщик ${await viewer.count()}`,
      );
    }
  }
}
// ПРАВАЯ КОЛОНКА ДЛИННЕЕ ОПИСАНИЯ — не украшение. Без неё страница, у которой описание в
// несколько экранов сменилось полем в полэкрана, сама становится короткой, браузер поджимает
// прокрутку, и поле оказывается на экране БЕЗ всякой починки: проверка зеленела под мутацией.
// Так и выглядит живая карточка с длинным обсуждением.
await mount({
  description: Array.from({ length: 120 }, (_, i) => `строка ${i + 1}`).join('\n\n'),
  comments: Array.from({ length: 150 }, (_, i) => ({
    id: 100 + i,
    body: `реплика ${i + 1}`,
    author: 'nina',
    authorId: 1,
    createdAt: '2026-09-01T00:00:00Z',
  })),
});
{
  const far = page.getByText('строка 110', { exact: true });
  if (await act('Ц3.13', far, (l) => l.dblclick())) {
    await page.waitForTimeout(300);
    const box = (await editor().count()) ? await editor().boundingBox() : null;
    const vh = page.viewportSize().height;
    ck(!!box, 'Ц3.13.0 (контроль) двойной щелчок в хвосте длинного описания открыл редактор');
    const docH = await page.evaluate(() => document.documentElement.scrollHeight);
    ck(
      docH > 4000,
      'Ц3.13.1 (контроль) страница осталась длинной — прокрутке нечего поджимать',
      `scrollHeight=${docH}`,
    );
    ck(
      !!box && box.y < vh && box.y + box.height > 0,
      'Ц3.13 открытое поле видно на экране, а не над ним',
      box ? `top=${Math.round(box.y)} bottom=${Math.round(box.y + box.height)} vh=${vh}` : '',
    );
  }
}
await mount({ delayUpdate: 1500 });
{
  await page.click('[aria-label="edit title"]');
  await page.locator('input[aria-label="task title"]').fill('другой заголовок');
  await page.locator('input[aria-label="task title"]').press('Enter');
  await page.waitForTimeout(100);
  await page.getByText('в коде', { exact: false }).first().dblclick();
  await page.waitForTimeout(100);
  const frozen = (await editor().count()) === 1 && (await editor().isDisabled());
  ck(frozen, 'Ц3.14.0 (контроль) поле открылось ЗАМОРОЖЕННЫМ — чужая запись ещё летит');
  await page
    .waitForFunction(() => globalThis.__server.updates.length > 0, { timeout: 5000 })
    .catch(() => {});
  await page.waitForTimeout(500);
  const focused = await page.evaluate(() => document.activeElement?.getAttribute('aria-label'));
  ck(
    focused === 'task description',
    'Ц3.14 после разморозки фокус всё-таки в поле описания',
    `activeElement=${focused}`,
  );
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

// ═══ Ц4 · РАЗБОР АДРЕСА ЛИНЕЕН ═════════════════════════════════════════════════════════════
// Строка из десятков тысяч `)` за адресом: пересчёт баланса на каждом отрезанном символе делал
// разбор квадратичным и вешал вкладку (публичная страница заметки читает тот же разметчик).
console.log('\nЦ4 · обрезка хвостовых скобок не квадратична');
{
  const pureOut = resolve(tmpdir(), `autolink-pure-${process.pid}.mjs`);
  await esbuild({
    entryPoints: [resolve(REPO, 'src/ui/markdown/autolink.tsx')],
    bundle: true,
    platform: 'node',
    format: 'esm',
    jsx: 'automatic',
    absWorkingDir: REPO,
    nodePaths: [resolve(REPO, 'node_modules')],
    outfile: pureOut,
    logLevel: 'warning',
    define: { 'process.env.NODE_ENV': '"production"' },
  }).catch((e) => dieNotRun(`модуль адресов не собрался: ${e.message}`));
  let pure = readFileSync(pureOut, 'utf8');
  if (flag('--mutate-quadratic-trim')) {
    const needle = 'else if (ch === ")" && parens > 0) {';
    const n = pure.split(needle).length - 1;
    if (n !== 1) dieNotRun(`МУТАЦИЯ «квадратичная обрезка» НЕ ПРИМЕНИЛАСЬ: якорь найден ${n} раз`);
    pure = pure.replace(
      needle,
      'else if (ch === ")" && href.slice(0, end).split(")").length > href.slice(0, end).split("(").length) {',
    );
    console.log('  МУТАЦИЯ: баланс скобок пересчитывается на каждом отрезанном символе');
  }
  const { writeFileSync } = await import('node:fs');
  writeFileSync(pureOut, pure);
  const { readAutolink } = await import(pureOut);
  rmSync(pureOut, { force: true });
  const hostile = 'https://example.com/' + ')'.repeat(50000);
  const t0 = performance.now();
  const got = readAutolink(hostile);
  const ms = performance.now() - t0;
  ck(
    got?.href === 'https://example.com/',
    'Ц4.0 (контроль) все непарные «)» отрезаны',
    JSON.stringify(got?.href),
  );
  ck(ms < 200, 'Ц4.1 50 000 скобок разбираются быстрее 200 мс', `${ms.toFixed(1)} мс`);
}

await browser.close();
console.log(bad ? `\nКРАСНАЯ: провалов ${bad}` : '\nЗЕЛЁНАЯ: все проверки прошли');
process.exit(bad ? 1 : 0);
