#!/usr/bin/env node
// Таблицы в задаче на настоящей странице: правка, конфликт, закрытие, таблица в описании, вставка.
// Сеть заглушена, файл — тестовый план пошива из тестов sheet-edit.
//
//   yarn build && node scripts/task-sheets-probe.mjs [--shots <dir>]
//
// 0 = прошло, 1 = не прошло, 2 = стенд не поднялся.
import { build as esbuild } from 'esbuild';
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync } from 'node:fs';
import { createRequire } from 'node:module';
import { homedir, tmpdir } from 'node:os';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = resolve(HERE, '..');
const req = createRequire(import.meta.url);
const die = (why) => {
  console.log(`\nNOT RUN: ${why}`);
  process.exit(2);
};
process.on('uncaughtException', (e) => die(e?.stack ?? String(e)));
process.on('unhandledRejection', (e) => die(e?.stack ?? String(e)));

function playwrightPath() {
  try {
    return req.resolve('playwright');
  } catch {
    /* кэш npx */
  }
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
}
const pwPath = playwrightPath();
if (!pwPath) die('no playwright');
const pw = await import(pwPath);
const chromium = pw.chromium ?? pw.default?.chromium;

const assets = resolve(REPO, 'dist/assets');
if (!existsSync(assets)) die('no dist/assets: run yarn build');
const cssName = readdirSync(assets).find((f) => /^index-.*\.css$/.test(f));
if (!cssName) die('no css in dist/assets');
const CSS = readFileSync(resolve(assets, cssName), 'utf8');
if (!CSS.includes('sheet-locked')) die('stale dist: no .sheet-locked');

const FIXTURES = resolve(REPO, 'src/components/managers/tasks/task-detail/file-view/__fixtures__');
const XLSX = readFileSync(resolve(FIXTURES, 'plan-poshiva.xlsx')).toString('base64');
const CSV_TEXT = 'a,b\n1,2\n3,4\n';

const STUB = `
const state = globalThis.__server;
const wrap = () => ({ id: 1, task: { ...state.task }, board: 'TASK_BOARD_DESIGN', status: 'TASK_STATUS_TODO', position: 0, media: [], checklist: [], createdBy: 'me', createdAt: '2026-08-01T00:00:00Z', updatedAt: '', startedAt: '', archivedAt: '' });
const count = (k) => { state.calls[k] = (state.calls[k] || 0) + 1; };
const table = {
  GetTask: () => {
    count('GetTask');
    const files = state.library
      .filter((f) => state.task.fileIds.includes(f.id))
      .map((f) => ({ ...f, downloadUrl: 'https://files.example/' + f.id + '?v=' + state.calls.GetTask }));
    return { task: wrap(), files };
  },
  UpdateTask: ({ task }) => { state.updates.push(JSON.parse(JSON.stringify(task))); state.task = { ...task }; return {}; },
  ListTaskComments: () => ({ comments: state.comments }),
  ListTasks: () => ({ tasks: [], total: 0 }),
  ListAdmins: () => ({ admins: [{ id: 1, username: 'nina' }] }),
  GetCurrentAccount: () => ({ account: { username: 'me', isSuper: false, permissions: [
    { section: 'tasks', access: state.readonly ? 'ACCESS_LEVEL_READ' : 'ACCESS_LEVEL_WRITE' },
    { section: 'files', access: 'ACCESS_LEVEL_WRITE' },
  ] } }),
  ListAccountSections: () => ({ sections: [] }),
  ListLibraryFiles: () => ({ files: state.library, total: state.library.length }),
  GetTaskFileContent: ({ fileId }) => {
    count('GetTaskFileContent');
    const c = state.contents[fileId];
    return { content: c.content, sha256: c.sha, lastEditedBy: c.by || '', lastEditedAt: c.at || '', tooLarge: !!c.tooLarge };
  },
  SaveTaskFileContent: (input) => {
    state.saves.push(input);
    if (state.failSave) return Promise.reject(new Error('down'));
    const c = state.contents[input.fileId];
    if (!input.force && input.baseSha256 !== c.sha) {
      return { conflict: true, currentSha256: c.sha, lastEditedBy: c.by || '', lastEditedAt: c.at || '' };
    }
    c.content = input.content; c.sha = 'sha-' + state.saves.length; c.by = 'me'; c.at = '2026-11-04T10:00:00Z';
    return { conflict: false, currentSha256: c.sha, lastEditedBy: 'me', lastEditedAt: c.at };
  },
};
const service = new Proxy({}, { get: (_t, k) => (typeof k === 'string'
  ? (r) => { try { return Promise.resolve((table[k] || (() => ({})))(r || {})); } catch (e) { return Promise.reject(e); } }
  : undefined) });
export const adminService = service;
export const authService = service;
export const frontendService = service;
export const requestHandler = () => Promise.reject(new Error('stub'));
`;
const stub = {
  name: 'stub-network',
  setup(b) {
    b.onResolve({ filter: /(^|\/)api\/api$/ }, () => ({ path: 'stub', namespace: 'probe' }));
    b.onLoad({ filter: /.*/, namespace: 'probe' }, () => ({ contents: STUB, loader: 'js' }));
  },
};
const outfile = resolve(tmpdir(), `task-sheets-${process.pid}.js`);
await esbuild({
  entryPoints: [resolve(HERE, 'task-detail-inline-probe-entry.tsx')],
  bundle: true,
  platform: 'browser',
  format: 'iife',
  target: 'es2020',
  absWorkingDir: REPO,
  nodePaths: [resolve(REPO, 'src'), resolve(REPO, 'node_modules')],
  jsx: 'automatic',
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
}).catch((e) => die(`build: ${e.message}`));
const bundle = readFileSync(outfile, 'utf8');
rmSync(outfile, { force: true });

const shotsAt = process.argv.indexOf('--shots');
const shots = shotsAt > 0 ? process.argv[shotsAt + 1] : null;
if (shots) mkdirSync(shots, { recursive: true });

let bad = 0;
let total = 0;
const ck = (ok, what, extra = '') => {
  total += 1;
  if (!ok) bad += 1;
  console.log(`${ok ? '  ok ' : 'FAIL '} ${what}${ok || !extra ? '' : ` :: ${extra}`}`);
};

const CARD = {
  title: 'sheets',
  description: 'before\n[[sheet:7]]\nmiddle\n[[sheet:7]]\n[[sheet:99]]\nafter',
  dueDate: '',
  assignees: [],
  priority: 'TASK_PRIORITY_LOW',
  labels: [],
  mediaIds: [],
  fileIds: [7, 8, 10],
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
const file = (id, fileName, contentType = 'application/octet-stream') => ({
  id,
  fileName,
  contentType,
  sizeBytes: 2048,
});
const LIBRARY = [
  file(7, 'plan.xlsx'),
  file(8, 'notes.csv', 'text/csv'),
  file(9, 'loose.csv', 'text/csv'),
  file(10, 'old.xls'),
  file(11, 'brief.txt', 'text/plain'),
];

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1280, height: 1000 } });
const pageErrors = [];
page.on('pageerror', (e) => pageErrors.push(String(e).slice(0, 300)));
await page.route('http://probe.local/**', (r) =>
  r.fulfill({ status: 200, contentType: 'text/html', body: '<div id="root"></div>' }),
);
await page.route(/^https?:\/\/(?!probe\.local)/, (r) => r.abort());

async function mount(over = {}) {
  await page.goto('http://probe.local/');
  await page.addStyleTag({ content: CSS });
  await page.evaluate(
    ({ card, library, xlsx, csv, over }) => {
      globalThis.__server = {
        task: { ...card, ...(over.card ?? {}) },
        library,
        updates: [],
        saves: [],
        calls: {},
        comments: over.comments ?? [],
        readonly: !!over.readonly,
        contents: {
          7: { content: xlsx, sha: 'sha-0' },
          8: { content: btoa(csv), sha: 'sha-c' },
          9: { content: btoa(csv), sha: 'sha-d' },
          10: { content: xlsx, sha: 'sha-x' },
        },
      };
    },
    { card: CARD, library: LIBRARY, xlsx: XLSX, csv: CSV_TEXT, over },
  );
  await page.addScriptTag({ content: bundle });
  await page.waitForSelector('text=comments', { timeout: 8000 });
  await page.waitForTimeout(400);
}
const server = (fn, arg) => page.evaluate(`(${fn})(globalThis.__server, ${JSON.stringify(arg)})`);
const shot = async (name) => {
  if (shots) await page.screenshot({ path: resolve(shots, `${name}.png`) });
};
const embeds = () => page.locator('[data-sheet-embed]');
const embed = (i = 0) => embeds().nth(i);
const cell = (root, addr) => root.locator(`td[data-a="${addr}"]`);
const word = (root, name) => root.getByRole('button', { name, exact: true });
const pause = (ms = 150) => page.waitForTimeout(ms);

// ─── Таблица в описании ───────────────────────────────────────────────────────────────
await mount({
  comments: [
    {
      id: 5,
      body: 'see [[sheet:7]] ok',
      author: 'nina',
      authorId: 1,
      createdAt: '2026-09-01T00:00:00Z',
    },
  ],
});
{
  const text = await page.locator('body').innerText();
  ck(!text.includes('[[sheet'), 'no raw token on the page');
  ck((await embeds().count()) === 3, 'two tables and one removed', String(await embeds().count()));
  ck(text.includes('file removed'), 'missing file says file removed');
  await embed(0).locator('table').waitFor();
  ck((await embed(1).locator('table').count()) === 1, 'second token of one file is a table too');
  const box = await embed(0).locator('table').locator('xpath=..').boundingBox();
  ck(box.height <= 318.5, 'embed scroller height at most 318', String(box.height));
  ck((await word(embed(0), 'edit').count()) === 1, 'bar: edit');
  ck((await word(embed(0), 'open').count()) === 1, 'bar: open');
  ck((await embed(0).getByRole('link', { name: 'download' }).count()) === 1, 'bar: download');
  await shot('1-embed');

  await embed(0).locator('table').dblclick();
  await pause();
  ck(
    (await page.locator('textarea[aria-label="task description"]').count()) === 0,
    'double click in a table does not open description edit',
  );
}

// ─── Правка, клавиши, живые итоги ─────────────────────────────────────────────────────
{
  const e = embed(0);
  await word(e, 'edit').click();
  await pause();
  ck((await e.getByText('no changes').count()) === 1, 'editing starts with no changes');
  ck(await word(e, 'save').isDisabled(), 'save disabled at zero');
  const j16before = await cell(e, 'J16').innerText();

  await cell(e, 'J12').click();
  await pause();
  ck((await e.locator('input').count()) === 0, 'formula cell opens no input');
  ck((await e.getByText('locked', { exact: true }).count()) === 1, 'formula bar says locked');
  ck((await e.getByText('=SUM', { exact: false }).count()) >= 1, 'formula bar shows the formula');

  await cell(e, 'D12').click();
  await pause();
  const input = e.locator('td[data-a="D12"] input');
  ck((await input.count()) === 1, 'editable cell opens input');
  await page.keyboard.type('7');
  await pause();
  ck(
    (await input.inputValue()) === '7',
    'typed one digit, selection replaced',
    await input.inputValue(),
  );
  ck((await e.getByText('1 changed').count()) === 1, '1 changed');
  ck(
    (await cell(e, 'J12').innerText()) === '7',
    'live row total J12 = 7',
    await cell(e, 'J12').innerText(),
  );
  ck(
    (await cell(e, 'J16').innerText()) === '215',
    'live grand total J16 = 215',
    `${j16before} -> ${await cell(e, 'J16').innerText()}`,
  );
  ck(
    (await cell(embed(1), 'J16').innerText()) === '215',
    'second table of the file shows the same draft',
  );
  ck((await embed(1).locator('input').count()) === 0, 'input lives in one table only');
  await shot('2-embed-editing');

  await page.keyboard.press('Enter');
  await pause();
  ck((await e.locator('td[data-a="D13"] input').count()) === 1, 'Enter moves down');
  await page.keyboard.press('Shift+Enter');
  await pause();
  ck((await e.locator('td[data-a="D12"] input').count()) === 1, 'Shift+Enter moves up');
  await page.keyboard.type('77');
  await page.keyboard.press('Tab');
  await pause();
  ck(
    (await e.locator('td[data-a="E12"] input').count()) === 1,
    'Tab moves right',
    await e
      .locator('td input')
      .first()
      .getAttribute('aria-label')
      .catch(() => ''),
  );
  await page.keyboard.press('Shift+Tab');
  await pause();
  await page.keyboard.press('Escape');
  await pause();
  ck((await e.locator('input').count()) === 0, 'Esc closes the cell');
  ck((await e.getByText('no changes').count()) === 1, 'Esc returns the cell to the file');
  ck((await cell(e, 'J16').innerText()) === j16before, 'totals return after Esc');
  ck((await page.getByRole('dialog').count()) === 0, 'Esc does not leave the page');

  // Фоновое чтение не трогает черновик, даже если файл на сервере другой.
  await cell(e, 'D12').click();
  await pause();
  await page.keyboard.type('7');
  await server((s) => {
    s.contents[7].sha = 'sha-other';
    s.contents[7].by = 'nina';
    s.contents[7].at = '2026-01-02T03:04:00Z';
  });
  await page.evaluate(() => window.__qc.invalidateQueries());
  await pause(300);
  ck((await e.getByText('1 changed').count()) === 1, 'background refetch keeps the draft');
  ck(
    (await e.locator('td[data-a="D12"] input').inputValue()) === '7',
    'background refetch keeps the input',
  );

  // Правка описания снимает таблицу, но не черновик.
  await page.evaluate(() => window.__nav('/tasks'));
  await pause(200);
  await page.evaluate(() => window.__nav('/tasks/1'));
  await page.waitForSelector('text=comments');
  await pause(300);
  ck((await embed(0).getByText('1 changed').count()) === 1, 'leaving the page keeps the draft');
}

// ─── Полный экран: тот же черновик, закрытие с вопросом ───────────────────────────────
{
  await word(embed(0), 'open').click();
  await pause(300);
  const d = page.getByRole('dialog');
  ck((await d.count()) === 1, 'open shows full screen');
  ck((await d.getByText('1 changed').count()) === 1, 'full screen shares the draft');
  await shot('3-full-editing');
  await word(d, 'close').click();
  await pause();
  ck((await d.getByText('1 unsaved').count()) === 1, 'close with changes asks');
  for (const w of ['save', 'discard', 'keep editing'])
    ck((await word(d, w).count()) >= 1, `closing: ${w}`);
  await shot('4-full-closing');
  await word(d, 'keep editing').click();
  await pause();
  ck((await d.getByText('1 unsaved').count()) === 0, 'keep editing returns');
  await page.keyboard.press('Escape');
  await pause();
  ck((await d.getByText('1 unsaved').count()) === 1, 'Esc outside a cell asks too');
  await word(d, 'keep editing').click();
  await pause();

  // Конфликт: версия сменилась выше.
  await word(d, 'save').first().click();
  await pause(300);
  ck((await d.getByText('changed by nina', { exact: false }).count()) === 1, 'conflict names who');
  ck(
    (await d.getByText('03.01', { exact: false }).count()) +
      (await d.getByText('02.01', { exact: false }).count()) >=
      1,
    'conflict says when',
  );
  for (const w of ['use theirs', 'save as copy', 'overwrite'])
    ck((await word(d, w).count()) === 1, `conflict: ${w}`);
  ck((await d.getByText('1 changed').count()) === 1, 'conflict keeps the draft');
  await shot('5-full-conflict');

  // Падение записи не теряет черновик.
  await server((s) => {
    s.failSave = true;
  });
  await word(d, 'overwrite').click();
  await pause(300);
  ck((await d.getByText('not saved').count()) === 1, 'failed save shows an error');
  ck((await d.getByText('1 changed').count()) === 1, 'failed save keeps the draft');
  await server((s) => {
    s.failSave = false;
  });

  const before = await server((s) => s.calls.GetTask);
  await word(d, 'overwrite').click();
  await pause(400);
  const last = await server((s) => s.saves[s.saves.length - 1]);
  ck(last.force === true, 'overwrite sends force');
  ck(last.baseSha256 === 'sha-0', 'overwrite keeps the base read', last.baseSha256);
  ck((await d.getByText(/\d+ changed/).count()) === 0, 'after save editing ends');
  ck(
    (await d.getByText('edited me', { exact: false }).count()) === 1,
    'after save shows editor name',
  );
  ck((await server((s) => s.calls.GetTask)) > before, 'after save the task is read again');
  ck(
    (await cell(d, 'J16').innerText()).replace(/\D/g, '').startsWith('215'),
    'saved bytes rendered',
    await cell(d, 'J16').innerText(),
  );
  const href = await d.getByRole('link', { name: 'download' }).getAttribute('href');
  ck(href.endsWith(`v=${await server((s) => s.calls.GetTask)}`), 'download link is fresh', href);
  await word(d, 'close').click();
  await pause();
  ck((await d.count()) === 0, 'close without changes closes');
  await shot('6-embed-after-save');
}

// ─── use theirs, имя пустое, закрытие сохранением ─────────────────────────────────────
{
  const e = embed(0);
  await word(e, 'edit').click();
  await pause();
  await cell(e, 'D13').click();
  await pause();
  await page.keyboard.type('3');
  await pause();
  await server((s, x) => {
    s.contents[7].sha = 'sha-z';
    s.contents[7].by = '';
    s.contents[7].content = x;
    s.contents[7].at = '';
  }, XLSX);
  await word(e, 'save').click();
  await pause(300);
  ck((await e.getByText('changed', { exact: true }).count()) === 1, 'empty name and time: changed');
  await word(e, 'use theirs').click();
  await pause(400);
  ck((await e.getByText('no changes').count()) === 1, 'use theirs clears the draft');
  ck((await word(e, 'use theirs').count()) === 0, 'use theirs closes the banner');
  ck((await word(e, 'save').count()) === 1, 'use theirs stays in editing');
  await word(e, 'cancel').click();
  await pause();
  ck((await word(e, 'edit').count()) === 1, 'cancel ends editing');
}

// ─── Правка описания и вставка из окна файлов ─────────────────────────────────────────
{
  await page.locator('text=before').first().dblclick();
  await pause(300);
  const area = page.locator('textarea[aria-label="task description"]');
  ck((await area.count()) === 1, 'description edit opens outside tables');
  await area.evaluate((a) => a.setSelectionRange(6, 6));
  await page.getByRole('button', { name: 'more formatting' }).click();
  await pause();
  const fileDoor = page.getByRole('button', { name: 'file', exact: true });
  await fileDoor.first().click();
  await pause(400);
  const picker = page.getByRole('dialog');
  await picker.getByText('brief.txt', { exact: false }).first().click();
  await pause();
  ck((await word(picker, 'as table').count()) === 0, 'other file has no as table');
  ck((await word(picker, 'as link').count()) === 1, 'other file has as link');
  await shot('7-picker-other');
  await picker.getByText('loose.csv', { exact: false }).first().click();
  await pause();
  ck((await word(picker, 'as table').count()) === 1, 'table file offers as table');
  await shot('8-picker-table');
  await word(picker, 'as table').click();
  await pause(500);
  ck(
    (await area.inputValue()).includes('[[sheet:9]]'),
    'token in the text',
    await area.inputValue(),
  );
  ck(
    (await area.inputValue()).split('\n').includes('[[sheet:9]]'),
    'token on its own line',
    await area.inputValue(),
  );
  const up = await server((s) => s.updates[s.updates.length - 1]);
  ck(up?.fileIds.includes(9), 'file attached to the task', JSON.stringify(up?.fileIds));
  await word(page.locator('body'), 'save')
    .first()
    .click()
    .catch(() => {});
  await pause(500);
  const description = await server((s) => s.task.description);
  ck(
    description.includes('[[sheet:9]]') && description.includes('[[sheet:7]]'),
    'tokens survive save',
    description,
  );
  ck((await page.locator('body').innerText()).includes('[[sheet') === false, 'still no raw token');
  await shot('9-after-insert');
}

// ─── Только чтение и старый формат ────────────────────────────────────────────────────
await mount({ readonly: true });
{
  await embed(0).locator('table').waitFor();
  ck((await word(embed(0), 'edit').count()) === 0, 'no edit without tasks write');
}
await mount({ card: { description: '[[sheet:10]]' } });
{
  await pause(300);
  ck((await word(embed(0), 'edit').count()) === 0, 'xls has no edit');
  ck((await embed(0).getByText('view only').count()) === 1, 'xls says view only');
}

// ─── Телефон ──────────────────────────────────────────────────────────────────────────
await page.setViewportSize({ width: 375, height: 812 });
await mount();
{
  await embed(0).locator('table').waitFor();
  const e = embed(0);
  await word(e, 'edit').click();
  await pause();
  await cell(e, 'D12').click();
  await pause();
  await page.keyboard.type('7');
  await pause();
  const m = await page.evaluate(() => ({
    doc: document.documentElement.scrollWidth,
    win: window.innerWidth,
    scroller: [...document.querySelectorAll('[data-sheet-embed] table')].map(
      (t) => t.parentElement.scrollWidth > t.parentElement.clientWidth,
    )[0],
    pageX: window.scrollX,
  }));
  ck(m.doc <= m.win, 'phone: no page scroll sideways', JSON.stringify(m));
  ck(m.scroller === true, 'phone: table scrolls inside itself', JSON.stringify(m));
  await shot('10-phone-embed');
  await word(e, 'open').click();
  await pause(300);
  const d = page.getByRole('dialog');
  await shot('11-phone-full');
  const box = await d.boundingBox();
  ck(box.width <= 375, 'phone: full screen fits', JSON.stringify(box));
  const inner = await d.evaluate((el) => el.scrollWidth <= el.clientWidth);
  ck(inner, 'phone: full screen bar does not overflow');
}

ck(pageErrors.length === 0, 'no page errors', pageErrors.join(' | '));
await browser.close();
console.log(`\n${total - bad}/${total} ${bad ? 'FAIL' : 'PASS'}`);
process.exit(bad ? 1 : 0);
