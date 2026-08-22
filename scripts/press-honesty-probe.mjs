#!/usr/bin/env node
// ЭКРАН ПЕРЕСТАЁТ УТВЕРЖДАТЬ ПОД-ГЛАГОЛ, КОТОРОГО В ЗАПИСИ НЕТ (Т-7).
//
// ДЕФЕКТ, РАДИ КОТОРОГО ПРОБА. Колонки `press_action` не существовало до 0325, поэтому каждая
// сохранённая до неё строка ВТО молчит о приёме. Резолв отвечал на такую строку пунктом G1, и
// пикер писал над шагом «Press flat» — утверждение о факте, которого в записи нет ни в каком
// виде. От записанного человеком оно ничем не отличалось, а снять его было нечем: «поменяй на
// Press flat» на шаге, который уже назван Press flat, — не жест.
//
// ПОЧЕМУ ПРОБА ЖИВАЯ, А НЕ ТАБЛИЧНАЯ. Резолв можно починить и оставить экран прежним: значение
// пикера, которому не соответствует ни одна строка списка, Radix рисует ПУСТЫМ триггером — то
// есть «вид не назван» на шаге, у которого вид назван. Поэтому подпись читается С ТРИГГЕРА
// живого редактора, а не из возврата функции, и рядом стоит вторая половина: строка есть в
// списке и НЕ выбирается (отсутствие приёма не записывают).
//
//   node scripts/press-honesty-probe.mjs            прогон
//   node scripts/press-honesty-probe.mjs --mutate   возвращает В БАНДЛЕ старую ветку резолва
//                                                   (репозиторий не трогается) — проба обязана
//                                                   покраснеть; зелёная мутация значит, что
//                                                   проверка ничего не держит
//
// Playwright не в зависимостях проекта — ищется в кэше npx и МОЛЧА пропускается, если не найден:
// гейт, который нельзя выполнить, не красит сборку в красный.

import { createRequire } from 'node:module';
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, rmSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { homedir, tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { build as esbuild } from 'esbuild';

const MUTATE = process.argv.includes('--mutate');

function resolvePlaywright() {
  const require = createRequire(import.meta.url);
  try {
    return require.resolve('playwright');
  } catch {}
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

const entry = resolvePlaywright();
if (!entry) {
  console.log('playwright не найден — проба пропущена (это не отказ)');
  process.exit(0);
}
const mod = await import(entry);
const chromium = mod.chromium ?? mod.default?.chromium;
if (!chromium) {
  console.log('playwright найден, но без chromium — проба пропущена');
  process.exit(0);
}

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = resolve(HERE, '..');
const outfile = resolve(tmpdir(), `press-honesty-${process.pid}.js`);

// МУТАЦИЯ ЖИВЁТ В ПАМЯТИ СБОРЩИКА, А НЕ В ФАЙЛЕ, и возвращает РОВНО ту пару строк, которой
// починка и была: таблица отвечала на «приём не назван» пустотой, а ветка резолва подставляла
// вместо неё приутюживание. Обе половины возвращаются вместе — вернуть одну значит проверить
// полуфабрикат, которого в истории не было.
const PATCHES = [
  {
    fixed: "  TECH_CARD_PRESS_ACTION_UNKNOWN: 'G0',",
    broken: "  TECH_CARD_PRESS_ACTION_UNKNOWN: '',",
  },
  {
    fixed: "    if (!a) return byId('G0');",
    broken: "    if (!a || a === 'TECH_CARD_PRESS_ACTION_UNKNOWN') return byId('G1');",
  },
];
const mutation = {
  name: 'press-honesty-mutation',
  setup(b) {
    b.onLoad({ filter: /operation-kinds\.ts$/ }, async (args) => {
      let src = await readFile(args.path, 'utf8');
      for (const p of PATCHES) {
        if (!src.includes(p.fixed)) throw new Error(`мутация не нашла свою строку в ${args.path}`);
        src = src.replace(p.fixed, p.broken);
      }
      return { contents: src, loader: 'ts' };
    });
  },
};

await esbuild({
  entryPoints: [resolve(HERE, 'press-honesty-entry.tsx')],
  bundle: true,
  platform: 'browser',
  format: 'iife',
  target: 'es2020',
  outfile,
  logLevel: 'warning',
  absWorkingDir: REPO,
  jsx: 'automatic',
  loader: { '.svg': 'text', '.png': 'dataurl', '.woff2': 'dataurl' },
  plugins: MUTATE ? [mutation] : [],
  define: {
    'import.meta.env.VITE_SERVER_URL': '"http://stub.invalid"',
    'import.meta.env': '{"VITE_SERVER_URL":"http://stub.invalid","MODE":"production"}',
    'process.env.NODE_ENV': '"production"',
  },
  alias: {
    components: resolve(REPO, 'src/components'),
    lib: resolve(REPO, 'src/lib'),
    api: resolve(REPO, 'src/api'),
    utils: resolve(REPO, 'src/utils'),
    ui: resolve(REPO, 'src/ui'),
    constants: resolve(REPO, 'src/constants'),
    store: resolve(REPO, 'src/store'),
    hooks: resolve(REPO, 'src/hooks'),
  },
});
const bundle = readFileSync(outfile, 'utf8');

const T = {
  PRESS: 'TECH_CARD_OPERATION_TYPE_PRESS',
  PRESS_OPEN: 'TECH_CARD_OPERATION_TYPE_PRESS_OPEN',
  FLAT: 'TECH_CARD_PRESS_ACTION_PRESS_FLAT',
  ACTION_UNSET: 'TECH_CARD_PRESS_ACTION_UNKNOWN',
  ZONE: 'TECH_CARD_GARMENT_ZONE_FRONT',
  IRON: 'TECH_CARD_PRESS_EQUIPMENT_IRON',
};
const FLAT_LABEL = 'Press flat';

let bad = 0;
const ck = (ok, what, d = '') => {
  if (!ok) bad++;
  console.log(`${ok ? '  ok  ' : '  FAIL'} ${what}${d ? `  — ${d}` : ''}`);
};
const head = (s) => console.log(`\n${s}`);

const browser = await chromium.launch();
// ВЫСОКОЕ ОКНО — НЕ КОСМЕТИКА: список видов на полсотни строк выпадает попперным блоком, и в
// обычном окне нижние строки оказываются за кадром — «пункта нет» смешалось бы с «не дотянулись».
const page = await browser.newPage({ viewport: { width: 1500, height: 4200 } });
const pageErrors = [];
page.on('pageerror', (e) => pageErrors.push(String(e)));
await page.route('http://probe.local/**', (route) =>
  route.fulfill({ status: 200, contentType: 'text/html', body: '<div id="root"></div>' }),
);

async function mount(op) {
  await page.goto('http://probe.local/');
  await page.addScriptTag({ content: bundle });
  await page.evaluate((o) => window.__pressHonesty.mount(o), op);
  await page.waitForSelector('[data-kind-picker="0"]', { timeout: 15000 });
}

const KIND = '[data-kind-picker="0"]';
// ПОДПИСЬ ЧИТАЕТСЯ С ЖИВОГО ТРИГГЕРА, а не из возврата функции: чинится здесь именно то, что
// экран УТВЕРЖДАЕТ, и «функция вернула правильное» этого не доказывает.
const kindLabel = async () =>
  ((await page.locator(`${KIND} button`).first().textContent()) ?? '').trim();

async function openList() {
  await page.locator(`${KIND} button`).first().scrollIntoViewIfNeeded();
  await page.locator(`${KIND} button`).first().click();
  await page.waitForSelector('[role="option"]', { timeout: 5000 });
}
async function closeList() {
  await page.keyboard.press('Escape');
  await page
    .waitForSelector('[role="option"]', { state: 'detached', timeout: 5000 })
    .catch(() => {});
}
// Строки списка ЖИВЫЕ, вместе с их «выбираемостью»: `aria-disabled` — то, что читает и человек с
// клавиатуры, и Radix, решая, звать ли `onValueChange`.
async function listRows() {
  await openList();
  const rows = await page.$$eval('[role="option"]', (ns) =>
    ns.map((n) => ({
      label: (n.textContent ?? '').trim(),
      disabled: n.getAttribute('aria-disabled') === 'true' || n.hasAttribute('data-disabled'),
    })),
  );
  await closeList();
  return rows;
}
const escapeRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
async function pick(text) {
  await openList();
  const opt = page.locator('[role="option"]').filter({ hasText: new RegExp(`^${escapeRe(text)}$`) });
  if ((await opt.count()) === 0) {
    await closeList();
    return false;
  }
  await opt.first().click();
  await page
    .waitForSelector('[role="option"]', { state: 'detached', timeout: 5000 })
    .catch(() => {});
  return true;
}
const values = () => page.evaluate(() => window.__pressHonesty.values());
const resolveKind = (step) => page.evaluate((s) => window.__pressHonesty.resolve(s), step);
const rowsFor = (id) => page.evaluate((i) => window.__pressHonesty.rows(i), id);
const offered = () => page.evaluate(() => window.__pressHonesty.offered());
const headingOf = (op) => page.evaluate((o) => window.__pressHonesty.heading(o), op);
const wireOf = (op) => page.evaluate((o) => window.__pressHonesty.wire(o), op);

// ── 1. ЭКРАН НАД ЗАПИСЬЮ БЕЗ ПРИЁМА ────────────────────────────────────────────────────────────
head('1. шаг ВТО, в записи которого приёма нет: что утверждает пикер');
await mount({ operationType: T.PRESS, zone: T.ZONE, pressEquipment: T.IRON });
ck(pageErrors.length === 0, 'редактор смонтировался без исключений', pageErrors[0] ?? '');

const bare = await values();
ck(
  bare.pressAction === T.ACTION_UNSET || !bare.pressAction,
  'исходная запись действительно молчит о приёме — стенд про то самое',
  String(bare.pressAction),
);
const bareLabel = await kindLabel();
ck(/not recorded/i.test(bareLabel), 'пикер говорит «приём не записан»', bareLabel);
ck(bareLabel !== FLAT_LABEL, 'и это НЕ «Press flat»', bareLabel);
ck(bareLabel !== '', 'триггер не пуст — «вид не назван» тоже было бы ложью', `«${bareLabel}»`);

// ── 2. ЗАПИСАННЫЙ ПРИЁМ НАЗЫВАЕТСЯ СВОИМ ИМЕНЕМ ────────────────────────────────────────────────
head('2. шаг, где приём ЗАПИСАН: подпись прежняя');
await mount({ operationType: T.PRESS, zone: T.ZONE, pressEquipment: T.IRON, pressAction: T.FLAT });
const flatLabel = await kindLabel();
ck(flatLabel === FLAT_LABEL, 'записанное приутюживание названо «Press flat»', flatLabel);
ck(flatLabel !== bareLabel, 'две записи названы РАЗНЫМИ словами', `«${bareLabel}» ≠ «${flatLabel}»`);

// Строка-состояние принадлежит ЗАПИСИ, а не списку: на шаге с названным приёмом её в списке нет.
const rowsFlat = await listRows();
ck(
  !rowsFlat.some((r) => /not recorded/i.test(r.label)),
  'на шаге с названным приёмом строки «не записан» в списке НЕТ',
  rowsFlat.filter((r) => /press/i.test(r.label)).map((r) => r.label).join(' | '),
);

// ── 3. СОСТОЯНИЕ УТВЕРЖДАЕТ ТРИГГЕР, А НЕ ПОГАШЕННАЯ СТРОКА СПИСКА ─────────────────────────────
//
// ПЕРЕПИСАНО ПОД R6, И ЭТО УЖЕСТОЧЕНИЕ, А НЕ ПОСЛАБЛЕНИЕ. Погашенная строка «Press (action not
// recorded)» стояла в списке по ЧИСТО МЕХАНИЧЕСКОЙ причине: Radix берёт текст триггера у того
// `Select.Item`, чьё значение выбрано, — не было строки, и триггер рисовался ПУСТЫМ, то есть врал
// «вид не назван». Комбобокс рисует подпись сам (`valueLabel`), поэтому подпорка не нужна, и
// правильный ответ теперь строже: строки-состояния в списке нет ВОВСЕ. «Не выбирается» перестало
// зависеть от атрибута — выбрать нечего.
//
// Само утверждение экрана над молчащей записью при этом никуда не делось: его проверяет цитата 1
// ВЫШЕ, на живом триггере, и она обязана быть зелёной ровно с тем же текстом.
head('3. строка «не записан»: состояние на триггере, в списке её нет, выход есть');
await mount({ operationType: T.PRESS, zone: T.ZONE, pressEquipment: T.IRON });
ck(/not recorded/i.test(await kindLabel()), 'триггер по-прежнему называет состояние', await kindLabel());
const rowsBare = await listRows();
ck(
  !rowsBare.some((r) => /not recorded/i.test(r.label)),
  'строки-состояния в списке НЕТ — отсутствие приёма не предлагают выбрать',
  rowsBare.filter((r) => /press/i.test(r.label)).map((r) => r.label).join(' | '),
);
ck(
  rowsBare.some((r) => r.label === FLAT_LABEL),
  'пункты авторинга на месте — из состояния есть выход',
);

ck(await pick(FLAT_LABEL), '«Press flat» выбирается с такого шага');
const afterPick = await values();
ck(
  afterPick.pressAction === T.FLAT,
  'выбор ЗАПИСАЛ приём — то, чего на молчащем шаге сделать было нельзя',
  String(afterPick.pressAction),
);
ck((await kindLabel()) === FLAT_LABEL, 'и подпись стала «Press flat»', await kindLabel());
const rowsAfter = await listRows();
ck(
  !rowsAfter.some((r) => /not recorded/i.test(r.label)),
  'строка-состояние ушла из списка вместе с состоянием',
);

// ── 4. САМ РЕЗОЛВ: ТРИ ЗАПИСИ — ТРИ ОТВЕТА ────────────────────────────────────────────────────
head('4. резолв: «поля нет» и «поле пусто» — одно незнание, один ответ');
const rBare = await resolveKind({ operationType: T.PRESS });
const rUnset = await resolveKind({ operationType: T.PRESS, pressAction: T.ACTION_UNSET });
const rFlat = await resolveKind({ operationType: T.PRESS, pressAction: T.FLAT });
ck(/not recorded/i.test(rBare?.label ?? ''), 'запись без поля вовсе', JSON.stringify(rBare));
ck(/not recorded/i.test(rUnset?.label ?? ''), 'запись с пустым полем', JSON.stringify(rUnset));
ck(rBare?.id === rUnset?.id, 'оба незнания дали ОДИН пункт', `${rBare?.id} / ${rUnset?.id}`);
ck(rFlat?.label === FLAT_LABEL, 'названный приём дал «Press flat»', JSON.stringify(rFlat));
ck(rBare?.id !== rFlat?.id, 'молчание и приутюживание — РАЗНЫЕ пункты', `${rBare?.id} ≠ ${rFlat?.id}`);

// Разутюжка стоит на своём глаголе и этой правкой не задета.
const rOpen = await resolveKind({ operationType: T.PRESS_OPEN });
ck(rOpen?.label === 'Press open', 'разутюжка по-прежнему называется собой', JSON.stringify(rOpen));

// ── 5. СПИСОК АВТОРИНГА НЕ ВЫРОС ──────────────────────────────────────────────────────────────
head('5. пункт-состояние не пролез в список выбора');
const off = await offered();
ck(off.length === 53, 'в списке авторинга по-прежнему 53 пункта', String(off.length));
ck(
  !off.some((k) => /not recorded/i.test(k.label)),
  'строки-состояния среди предлагаемых нет',
  off.filter((k) => /press/i.test(k.label)).map((k) => k.label).join(' | '),
);
// И второй экран (диалог создания) её не видит: он спрашивает список БЕЗ активного пункта.
const dialogRows = await rowsFor(undefined);
ck(
  !dialogRows.some((r) => /not recorded/i.test(r.label)),
  'диалог создания шага строку-состояние не предлагает',
  String(dialogRows.length),
);

// ── 6. ПОЧИНКА DISPLAY-ONLY: ЗАПИСЬ И ЗАГОЛОВОК НЕ ТРОНУТЫ ────────────────────────────────────
head('6. запись, провод и заголовок — как были');
const wireBare = await wireOf({ operationType: T.PRESS, zone: T.ZONE, pressEquipment: T.IRON });
ck(!wireBare?.press, 'молчащий шаг не отрастил ВТО-обёртку на проводе', JSON.stringify(wireBare?.press ?? null));
const wireFlat = await wireOf({
  operationType: T.PRESS,
  zone: T.ZONE,
  pressEquipment: T.IRON,
  pressAction: T.FLAT,
});
ck(wireFlat?.press?.action === T.FLAT, 'записанный приём уезжает тем же токеном', String(wireFlat?.press?.action));
const hBare = await headingOf({ operationType: T.PRESS, zone: T.ZONE });
const hFlat = await headingOf({ operationType: T.PRESS, zone: T.ZONE, pressAction: T.FLAT });
ck(/^press\b/.test(hBare), 'заголовок молчащего шага — «press», без выдуманного приёма', hBare);
ck(hBare === hFlat, 'заголовок собирается по-прежнему и приёма не печатает', `${hBare} / ${hFlat}`);

ck(pageErrors.length === 0, 'ни одного исключения за весь прогон', pageErrors.join(' | ').slice(0, 160));

await browser.close();
rmSync(outfile, { force: true });

if (MUTATE) {
  console.log(
    bad === 0
      ? '\nМУТАЦИЯ ПРОШЛА ЗЕЛЁНОЙ — проверка ничего не держит'
      : `\nмутация поймана: расхождений ${bad} (так и должно быть)`,
  );
  process.exit(bad === 0 ? 1 : 0);
}
console.log(bad === 0 ? '\nвсё сошлось' : `\nрасхождений: ${bad}`);
process.exit(bad === 0 ? 0 : 1);
