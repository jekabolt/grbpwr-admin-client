#!/usr/bin/env node
// УТВЕРЖДАЕТ на НАСТОЯЩЕМ экране заметки просьбу владельца (2026-09-17): «когда нажимаешь cmd + a
// в md файле, чтобы выделялся только текст маркдауна, а не весь сайт».
//
//   С1 — в чтении ⌘A выделяет отрисованный документ и НЕ захватывает ни меню сайта, ни шапку
//        заметки (имя, кнопки);
//   С2 — в правке с фокусом в поле ⌘A — родное выделение ВСЕГО текста поля, показ не трогается;
//   С3 — в правке вне поля ⌘A выделяет показ, а поле не получает фокус и не выделяется;
//   С4 — в поле имени ⌘A выделяет имя (родное поведение не отнято);
//   С6 — двойной щелчок по документу в чтении открывает правку (просьба владельца);
//   С7 — ⌘A при ОТКРЫТОМ подтверждении выделяет подтверждение, а не всю страницу.
//
//   node scripts/note-select-all-probe.mjs
//   node scripts/note-select-all-probe.mjs --mutate-no-handler     ⌘A не перехватывается
//   node scripts/note-select-all-probe.mjs --mutate-no-field-guard ⌘A перехватывается и в поле
//   node scripts/note-select-all-probe.mjs --mutate-confirm-early-return ⌘A глушится при открытом подтверждении
//   node scripts/note-select-all-probe.mjs --mutate-no-dblclick    двойной щелчок не открывает правку

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

const STUB_MARKER = 'PROBE_STUB_NOTE_SELECT_ALL_NETWORK';
// Метка НАСТОЯЩЕГО `api/api.ts` — сборка его клиентов. Ни заголовок авторизации, ни «[BE]» для
// этого не годятся: экран заметки сам шлёт и то и другое в обход `requestHandler` (помощник
// разметки, загрузка файлов).
if (process.argv.includes('--dump'))
  globalThis.__dump = process.argv[process.argv.indexOf('--dump') + 1];
const REAL_API_MARKER = 'createAdminServiceClient(';
const STUB_SOURCE = `
globalThis.__PROBE_STUB = '${STUB_MARKER}';
const table = {
  GetLibraryFile: () => ({ file: { id: 7, fileName: 'spec.md', contentType: 'text/markdown', sizeBytes: 120, topics: [], uploadedBy: 'me', createdAt: '2026-09-01T00:00:00Z' } }),
  GetLibraryNoteContent: () => ({ content: globalThis.__NOTE, sha256: 'x', lastEditedBy: 'me', lastEditedAt: '2026-09-01T00:00:00Z' }),
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
    b.onLoad({ filter: /.*/, namespace: 'probe-stub' }, () => ({
      contents: STUB_SOURCE,
      loader: 'js',
    }));
  },
};

const outfile = resolve(tmpdir(), `note-select-all-${process.pid}.js`);
await esbuild({
  entryPoints: [resolve(HERE, 'note-select-all-probe-entry.tsx')],
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

if (globalThis.__dump) {
  const { writeFileSync } = await import('node:fs');
  writeFileSync(globalThis.__dump, bundle);
  process.exit(0);
}

function mutate(name, needle, replacement) {
  const n = bundle.split(needle).length - 1;
  if (n !== 1) dieNotRun(`МУТАЦИЯ «${name}» НЕ ПРИМЕНИЛАСЬ: якорь найден ${n} раз вместо одного`);
  bundle = bundle.replace(needle, replacement);
  console.log(`  МУТАЦИЯ: ${name}`);
}
const flag = (f) => process.argv.includes(f);
if (flag('--mutate-no-handler'))
  mutate(
    '⌘A не перехватывается вовсе',
    'if (isTextField(e.target)) return;\n          const layer',
    'if (true) return;\n          const layer',
  );
if (flag('--mutate-no-field-guard'))
  mutate(
    '⌘A перехватывается и в поле ввода',
    'if (isTextField(e.target)) return;\n          const layer',
    'if (false) return;\n          const layer',
  );

if (flag('--mutate-confirm-early-return'))
  mutate(
    '⌘A снова глушится вместе с ⌘S и ⌘E, пока открыто подтверждение',
    'if (isTextField(e.target)) return;\n          const layer',
    'if (confirmOverwrite || confirmRestore) return;\n          if (isTextField(e.target)) return;\n          const layer',
  );
if (flag('--mutate-no-dblclick'))
  mutate(
    'двойной щелчок по документу не открывает правку',
    'onDoubleClick: writable ? (e) => {',
    'onDoubleClick: false ? (e) => {',
  );

let bad = 0;
const ck = (ok, what, d = '') => {
  if (!ok) bad++;
  console.log(`${ok ? '  ok  ' : '  FAIL'} ${what}${d ? `  — ${d}` : ''}`);
};

const NOTE =
  '# Техзадание\n\nПервый абзац ТЕКСТ-ДОКУМЕНТА.\n\n- пункт один\n- пункт два\n\nПоследняя строка КОНЕЦ-ДОКУМЕНТА.';

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1400, height: 900 } });
page.on('pageerror', (e) => console.log('  [страница]', String(e).slice(0, 300)));
await page.route('http://probe.local/**', (r) =>
  r.fulfill({ status: 200, contentType: 'text/html', body: '<div id="root"></div>' }),
);
await page.route(/^https?:\/\/(?!probe\.local)/, (r) => r.abort());

await page.goto('http://probe.local/');
await page.addStyleTag({ content: CSS });
await page.evaluate((n) => {
  globalThis.__NOTE = n;
  // Черновик в браузере: он даёт баннер «an unsaved draft is left», а тот — подтверждение
  // восстановления. Только в этом состоянии проверяется, что ⌘A не проваливается мимо разбора
  // (обработчик глушит ⌘S и ⌘E, пока подтверждение открыто, и ⌘A когда-то глушился вместе с ними).
  localStorage.setItem(
    'files:note-draft:7',
    JSON.stringify({ content: '# ЧЕРНОВИК', base: '', at: Date.now() }),
  );
}, NOTE);
await page.addScriptTag({ content: bundle });
await page.waitForSelector('text=КОНЕЦ-ДОКУМЕНТА', { timeout: 8000 });
await page.waitForTimeout(200);

const selText = () => page.evaluate(() => String(window.getSelection() ?? ''));
/**
 * ДИАПАЗОН ВНУТРИ ДОКУМЕНТА — а не «в выделении есть слова документа». Родное «выделить всё»
 * тоже содержит слова документа (вместе со всей страницей), и проверка по тексту зеленела под
 * мутацией, снимающей перехват.
 */
const selInDoc = () =>
  page.evaluate(() => {
    const sel = window.getSelection();
    const doc = document.querySelector('[data-note-document]');
    if (!sel || !sel.rangeCount || !doc) return false;
    return doc.contains(sel.getRangeAt(0).commonAncestorContainer);
  });
// Сочетание — по системе стенда, как и в продукте: на маке ⌘, на прочих Ctrl.
const SELECT_ALL = 'ControlOrMeta+a';

// ═══ С1 · ЧТЕНИЕ ═══════════════════════════════════════════════════════════════════════════
console.log('\nС1 · в чтении ⌘A выделяет только документ');
{
  // Щелчок мимо любого поля — по меню сайта: фокус уходит на body, как у живого человека.
  await page.click('#site-chrome');
  await page.keyboard.press(SELECT_ALL);
  const t = await selText();
  ck(
    t.includes('ТЕКСТ-ДОКУМЕНТА') && t.includes('КОНЕЦ-ДОКУМЕНТА') && (await selInDoc()),
    'С1.1 выделен ровно документ — от начала до конца и диапазоном внутри него',
    JSON.stringify(t.slice(0, 80)),
  );
  ck(!t.includes('SITE MENU'), 'С1.2 меню сайта в выделение НЕ попало');
  ck(
    !t.includes('spec.md') && !t.includes('edit'),
    'С1.3 шапка заметки (имя, кнопки) в выделение НЕ попала',
    JSON.stringify(t.slice(0, 120)),
  );
}

// ═══ С6 · ДВОЙНОЙ ЩЕЛЧОК ОТКРЫВАЕТ ПРАВКУ ══════════════════════════════════════════════════
console.log('\nС6 · двойной щелчок по документу открывает правку');
{
  const area = () => page.locator('textarea[name="noteContent"]');
  ck((await area().count()) === 0, 'С6.0 до жеста мы в чтении');
  await page.getByText('ТЕКСТ-ДОКУМЕНТА', { exact: false }).first().dblclick();
  await page.waitForTimeout(300);
  ck((await area().count()) === 1, 'С6.1 двойной щелчок по тексту открыл правку');
  const value = (await area().count()) ? await area().inputValue() : '';
  ck(value === NOTE, 'С6.2 в поле тот же текст разметки');
  const sel = await selText();
  ck(sel === '', 'С6.3 выделения от двойного щелчка не осталось', JSON.stringify(sel));
  // ВОЗВРАТ В ЧТЕНИЕ — не проверка, а уборка: следующие случаи начинаются с того же состояния.
  // Под мутацией правка не открылась вовсе, и слать ⌘E было бы входом в неё, а не выходом.
  if ((await area().count()) > 0) {
    await page.evaluate(() => {
      window.dispatchEvent(
        new KeyboardEvent('keydown', { key: 'e', code: 'KeyE', metaKey: true, bubbles: true }),
      );
    });
    await page.waitForTimeout(300);
    ck((await area().count()) === 0, 'С6.4 (контроль) ⌘E вернул чтение — состояние стенда прежнее');
  }
}

// ═══ С7 · ⌘A ПРИ ОТКРЫТОМ ПОДТВЕРЖДЕНИИ ════════════════════════════════════════════════════
console.log('\nС7 · ⌘A при открытом подтверждении не выделяет всю страницу');
{
  const banner = page.getByRole('button', { name: 'restore' });
  ck((await banner.count()) === 1, 'С7.0 (контроль) баннер черновика на месте');
  // Подтверждение спрашивают только поверх НАБРАННОГО: делаем поле грязным.
  await page.evaluate(() => {
    window.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'e', code: 'KeyE', metaKey: true, bubbles: true }),
    );
  });
  const area = page.locator('textarea[name="noteContent"]');
  await area.waitFor({ timeout: 5000 });
  await area.click();
  await area.type(' и ещё строка');
  await page.evaluate(() => {
    window.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'e', code: 'KeyE', metaKey: true, bubbles: true }),
    );
  });
  await page.waitForTimeout(300);
  await page.getByRole('button', { name: 'restore' }).click();
  const dialog = page.locator('[role="dialog"]');
  const dialogOpen = await dialog
    .first()
    .waitFor({ timeout: 4000 })
    .then(() => true)
    .catch(() => false);
  ck(dialogOpen, 'С7.1 (контроль) подтверждение восстановления открылось');
  if (dialogOpen) {
    await page.evaluate(() => window.getSelection()?.removeAllRanges());
    const res = await page.evaluate(() => {
      const d = document.querySelector('[role="dialog"]');
      const target = d?.querySelector('button') ?? d;
      target?.dispatchEvent(
        new KeyboardEvent('keydown', {
          key: 'a',
          code: 'KeyA',
          metaKey: true,
          ctrlKey: true,
          bubbles: true,
        }),
      );
      const sel = window.getSelection();
      const range = sel && sel.rangeCount ? sel.getRangeAt(0) : null;
      return {
        inDialog: !!range && !!d && d.contains(range.commonAncestorContainer),
        text: String(sel ?? ''),
      };
    });
    ck(res.inDialog, 'С7.2 выделено само подтверждение', JSON.stringify(res.text.slice(0, 50)));
    ck(!res.text.includes('SITE MENU'), 'С7.3 меню сайта не выделено');
    // Возврат стенда в прежнее состояние: закрыть подтверждение и вернуть исходный текст.
    await page.keyboard.press('Escape');
    await page.waitForTimeout(200);
    await page.evaluate(() => {
      window.dispatchEvent(
        new KeyboardEvent('keydown', { key: 'e', code: 'KeyE', metaKey: true, bubbles: true }),
      );
    });
    const a2 = page.locator('textarea[name="noteContent"]');
    if (await a2.count()) {
      await a2.fill(NOTE);
      await page.evaluate(() => {
        window.dispatchEvent(
          new KeyboardEvent('keydown', { key: 'e', code: 'KeyE', metaKey: true, bubbles: true }),
        );
      });
      await page.waitForTimeout(200);
    }
  }
}

// ═══ С2 · ПРАВКА, ФОКУС В ПОЛЕ ═══════════════════════════════════════════════════════════════
console.log('\nС2 · в правке с фокусом в поле — родное выделение текста поля');
{
  await page.evaluate(() => window.getSelection()?.removeAllRanges());
  await page.getByRole('button', { name: /edit/ }).first().click();
  const area = page.locator('textarea[name="noteContent"]');
  await area.waitFor({ timeout: 5000 });
  await area.click();
  await page.keyboard.press(SELECT_ALL);
  const r = await area.evaluate((el) => ({
    s: el.selectionStart,
    e: el.selectionEnd,
    len: el.value.length,
    focused: document.activeElement === el,
  }));
  ck(
    r.focused && r.s === 0 && r.e === r.len,
    'С2.1 в поле выделен весь текст разметки',
    JSON.stringify(r),
  );
  // ПО УЗЛУ, А НЕ ПО ТЕКСТУ: при фокусе в поле `getSelection()` отдаёт выделенный текст САМОГО
  // поля — ту же разметку, — и сравнение строк не отличило бы поле от показа.
  const inDoc = await page.evaluate(() => {
    const sel = window.getSelection();
    const doc = document.querySelector('[data-note-document]');
    if (!sel || !sel.rangeCount || !doc) return false;
    return doc.contains(sel.getRangeAt(0).commonAncestorContainer);
  });
  ck(!inDoc, 'С2.2 диапазон выделения — не в показе рядом');
}

// ═══ С3 · ПРАВКА, ФОКУС ВНЕ ПОЛЯ ═══════════════════════════════════════════════════════════
console.log('\nС3 · в правке вне поля — выделяется показ, поле не трогается');
{
  const area = page.locator('textarea[name="noteContent"]');
  const before = await area.inputValue();
  await page.click('#site-chrome');
  await page.keyboard.press(SELECT_ALL);
  const t = await selText();
  const r = await area.evaluate((el) => ({ focused: document.activeElement === el }));
  ck(
    t.includes('ТЕКСТ-ДОКУМЕНТА') && t.includes('КОНЕЦ-ДОКУМЕНТА') && (await selInDoc()),
    'С3.1 выделен показ документа — диапазоном внутри него',
    JSON.stringify(t.slice(0, 80)),
  );
  ck(
    !t.includes('SITE MENU') && !t.includes('finish editing'),
    'С3.2 меню и полоса правки не выделены',
  );
  ck(
    !r.focused && (await area.inputValue()) === before,
    'С3.3 поле не получило фокус и не изменилось',
  );
}

// ═══ С3Б · РУССКАЯ РАСКЛАДКА И ОТКРЫТЫЙ СЛОЙ ═══════════════════════════════════════════════
console.log('\nС3Б · русская раскладка и открытый слой поверх страницы');
{
  await page.evaluate(() => window.getSelection()?.removeAllRanges());
  await page.click('#site-chrome');
  // На русской раскладке физическая A приходит как «ф»: ловится по `code`. Playwright шлёт
  // клавиши латиницей, поэтому такое нажатие собирается событием.
  await page.evaluate(() => {
    window.dispatchEvent(
      new KeyboardEvent('keydown', {
        key: 'ф',
        code: 'KeyA',
        metaKey: true,
        ctrlKey: true,
        bubbles: true,
      }),
    );
  });
  ck(await selInDoc(), 'С3Б.1 ⌘A на русской раскладке (key «ф», code KeyA) выделяет документ');

  await page.evaluate(() => window.getSelection()?.removeAllRanges());
  // СЛОЙ ПОВЕРХ СТРАНИЦЫ ВЫДЕЛЯЕТ СЕБЯ. Отдать жест браузеру здесь нельзя: он взял бы документ
  // целиком вместе с меню сайта — та самая жалоба владельца, только из другого места.
  const layer = await page.evaluate(() => {
    const el = document.createElement('div');
    el.setAttribute('role', 'listbox');
    el.textContent = 'ВАРИАНТ-ИЗ-СЛОЯ';
    document.body.appendChild(el);
    el.dispatchEvent(
      new KeyboardEvent('keydown', {
        key: 'a',
        code: 'KeyA',
        metaKey: true,
        ctrlKey: true,
        bubbles: true,
      }),
    );
    const sel = window.getSelection();
    const range = sel && sel.rangeCount ? sel.getRangeAt(0) : null;
    const doc = document.querySelector('[data-note-document]');
    const out = {
      inLayer: !!range && el.contains(range.commonAncestorContainer),
      inDoc: !!range && !!doc && doc.contains(range.commonAncestorContainer),
      text: String(sel ?? ''),
    };
    el.remove();
    return out;
  });
  ck(layer.inLayer, 'С3Б.2 при открытом слое ⌘A выделяет САМ слой', JSON.stringify(layer));
  ck(
    !layer.inDoc && !layer.text.includes('SITE MENU'),
    'С3Б.3 …и не трогает ни заметку под ним, ни меню сайта',
    JSON.stringify(layer.text.slice(0, 60)),
  );
}

// ═══ С5 · ПУСТАЯ ЗАМЕТКА ═══════════════════════════════════════════════════════════════════
console.log('\nС5 · в пустой заметке ⌘A не выделяет страницу');
{
  const area = page.locator('textarea[name="noteContent"]');
  await area.click();
  await area.fill('');
  await page.waitForTimeout(200);
  await page.click('#site-chrome');
  await page.keyboard.press(SELECT_ALL);
  const t = await selText();
  ck(!t.includes('SITE MENU'), 'С5.1 меню сайта не выделено', JSON.stringify(t.slice(0, 60)));
  ck(
    t.trim() === '',
    'С5.2 выделять нечего — и ничего не выделено',
    JSON.stringify(t.slice(0, 60)),
  );
}

// ═══ С4 · ПОЛЕ ИМЕНИ ═══════════════════════════════════════════════════════════════════════
console.log('\nС4 · в поле имени — родное выделение имени');
{
  const nameInput = page
    .locator('input')
    .filter({ hasNot: page.locator('[type="checkbox"]') })
    .first();
  if ((await nameInput.count()) === 0) {
    ck(false, 'С4.0 поле имени не найдено');
  } else {
    await nameInput.click();
    await page.keyboard.press(SELECT_ALL);
    const r = await nameInput.evaluate((el) => ({
      s: el.selectionStart,
      e: el.selectionEnd,
      len: el.value.length,
      v: el.value,
    }));
    ck(
      r.len > 0 && r.s === 0 && r.e === r.len,
      'С4.1 в поле имени выделено имя целиком',
      JSON.stringify(r),
    );
  }
}

await browser.close();
console.log(bad ? `\nКРАСНАЯ: провалов ${bad}` : '\nЗЕЛЁНАЯ: все проверки прошли');
process.exit(bad ? 1 : 0);
