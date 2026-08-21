#!/usr/bin/env node
// ВТО-ПОД-ГЛАГОЛ И НАПРАВЛЕНИЕ ПРИПУСКА — ЖИВОЙ РЕДАКТОР, А НЕ ТАБЛИЦЫ.
//
// Дыра, ради которой волна: подпись «press to one side» обещала сторону, а сказать её было нечем.
// Починка стоит на ЧЕТЫРЁХ разных механизмах, и каждый ломается врозь и молча:
//   1. пикер — семь ВТО-пунктов, каждый пишет СВОЙ под-глагол в строку формы;
//   2. рендер — направление появляется ТОЛЬКО при «press to one side»;
//   3. zod — там оно ОБЯЗАТЕЛЬНО, и отказ обязан встать НА КОНТРОЛЕ (иначе он придёт тостом);
//   4. мапперы — поле, потерянное на проводе, на экране не видно вовсе: терять нечего, потому
//      что показывать нечего.
//
// ЛОВУШКА СТЕНДА, ИЗ-ЗА КОТОРОЙ ПРОВЕРКА «ПОЛЯ НЕТ» ВСЕГДА СТОИТ В ПАРЕ. Закрытая створка (и
// невыбранный шаг) размонтирует содержимое: «контрола нет» одинаково правдиво и когда правило
// работает, и когда экран просто не отрисовался. Поэтому каждое «нет» доказывается рядом с
// «переключили — появилось» НА ТОМ ЖЕ смонтированном шаге, и порядок такой: нет → есть → нет.
//
// ОРГАНЫ ИЩУТСЯ ПО `data-field`, А НЕ ПО ТЕКСТУ СТРАНИЦЫ. Склейка соседних узлов через
// textContent уже давала здесь ложную зелень: подпись «press action» нашлась бы в комментарии
// соседней строки, а контрола бы не было.
//
//   node scripts/press-action-probe.mjs            прогон
//   node scripts/press-action-probe.mjs --mutate   ломает условие показа направления В БАНДЛЕ
//                                                  (репозиторий не трогается) — проба обязана
//                                                  покраснеть; зелёная мутация значит, что
//                                                  проверка ничего не держит
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
const outfile = resolve(tmpdir(), `press-action-${process.pid}.js`);

// МУТАЦИЯ ЖИВЁТ В ПАМЯТИ СБОРЩИКА, А НЕ В ФАЙЛЕ. Правка исходника ради проверки — это правка,
// которую однажды забудут откатить; здесь ломается ровно одна строка ровно на один прогон, и
// репозиторий её не видит.
const FIX = 'const showPressToward = showPressAction && pressAction === PRESS_TO_ONE_SIDE;';
const BROKEN = 'const showPressToward = showPressAction;';
const mutation = {
  name: 'press-toward-mutation',
  setup(b) {
    b.onLoad({ filter: /operations-field\.tsx$/ }, async (args) => {
      const src = await readFile(args.path, 'utf8');
      if (!src.includes(FIX)) throw new Error(`мутация не нашла свою строку в ${args.path}`);
      return { contents: src.replace(FIX, BROKEN), loader: 'tsx' };
    });
  },
};

await esbuild({
  entryPoints: [resolve(HERE, 'press-action-entry.tsx')],
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
  ONE_SIDE: 'TECH_CARD_PRESS_ACTION_TO_ONE_SIDE',
  ACTION_UNSET: 'TECH_CARD_PRESS_ACTION_UNKNOWN',
  TOWARD_UNSET: 'TECH_CARD_PRESS_TOWARD_UNKNOWN',
  ZONE: 'TECH_CARD_GARMENT_ZONE_FRONT',
  IRON: 'TECH_CARD_PRESS_EQUIPMENT_IRON',
};

let bad = 0;
const ck = (ok, what, d = '') => {
  if (!ok) bad++;
  console.log(`${ok ? '  ok  ' : '  FAIL'} ${what}${d ? `  — ${d}` : ''}`);
};
const head = (s) => console.log(`\n${s}`);

const browser = await chromium.launch();
// ВЫСОКОЕ ОКНО — НЕ КОСМЕТИКА. Список видов на 48 строк выпадает попперным блоком без
// max-height: в обычном окне нижние строки оказываются ЗА кадром, и клик по ним не проходит
// физически. Проба обязана дотягиваться до каждого пункта, иначе «не кликнулось» смешается с
// «пункта нет».
const page = await browser.newPage({ viewport: { width: 1500, height: 4200 } });
const pageErrors = [];
page.on('pageerror', (e) => pageErrors.push(String(e)));
await page.route('http://probe.local/**', (route) =>
  route.fulfill({ status: 200, contentType: 'text/html', body: '<div id="root"></div>' }),
);

async function mount(op) {
  await page.goto('http://probe.local/');
  await page.addScriptTag({ content: bundle });
  await page.evaluate((o) => window.__press.mount(o), op);
  await page.waitForSelector('[data-kind-picker="0"]', { timeout: 15000 });
}

// --- органы --------------------------------------------------------------------------------
const KIND = '[data-kind-picker="0"]';
const F = (name) => `[data-field="operations.0.${name}"]`;
const has = async (sel) => (await page.locator(sel).count()) > 0;

async function openList(sel) {
  // Прокрутка ДО открытия: Radix запирает прокрутку страницы, пока список открыт.
  await page.locator(`${sel} button`).first().scrollIntoViewIfNeeded();
  await page.locator(`${sel} button`).first().click();
  await page.waitForSelector('[role="option"]', { timeout: 5000 });
}
async function closeList() {
  await page.keyboard.press('Escape');
  await page
    .waitForSelector('[role="option"]', { state: 'detached', timeout: 5000 })
    .catch(() => {});
}
async function optionsOf(sel) {
  if (!(await has(sel))) return null;
  await openList(sel);
  const items = await page.$$eval('[role="option"]', (ns) =>
    ns.map((n) => (n.textContent ?? '').trim()),
  );
  await closeList();
  return items;
}
// Подпись пункта — ТЕКСТ, а не регулярка: «another method (see note)» со скобками матчился бы
// как «another method see note» и не находил ничего — молча, через `false`.
const escapeRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

async function pick(sel, text) {
  await openList(sel);
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
const values = () => page.evaluate(() => window.__press.values());
const messageIn = async (sel) => {
  const n = page.locator(`${sel} [id$="-form-item-message"]`);
  return (await n.count()) ? ((await n.first().textContent()) ?? '').trim() : '';
};

// ── 1. СЕМЬ ВТО-ПУНКТОВ РАЗЛИЧИМЫ И КАЖДЫЙ ПИШЕТ СВОЙ ПОД-ГЛАГОЛ ────────────────────────────────
head('1. пикер: семь ВТО-пунктов, каждый со своим под-глаголом');
await mount({ operationType: T.PRESS, zone: T.ZONE, pressEquipment: T.IRON });
ck(pageErrors.length === 0, 'редактор смонтировался без исключений', pageErrors[0] ?? '');

const offered = await page.evaluate(() => window.__press.offered());
const pressItems = offered.filter((k) => ['G1', 'G2', 'G4', 'G5', 'G6', 'G7', 'G8'].includes(k.id));
ck(offered.length === 53, 'в списке 53 пункта (было 47 до включения ВТО)', String(offered.length));
const pressLabels = pressItems.map((k) => k.label);
ck(pressItems.length === 7, 'семь ВТО-пунктов предлагаются', pressLabels.join(' | '));
ck(new Set(pressLabels).size === 7, 'все семь названы РАЗНЫМИ словами', pressLabels.join(' | '));
ck(!pressLabels.includes('Press'), 'схлопнутого «Press» в списке больше нет', pressLabels.join(' | '));

// ЯРУС 2 РАСКРЫВАЕТСЯ ЖИВОЙ СТРОКОЙ «ЕЩЁ», а её подпись несёт ЧИСЛО скрытых пунктов — выписать
// его константой значит сломать пробу на первом же добавленном редком виде.
const closedList = await optionsOf(KIND);
const moreRow = (closedList ?? []).find((s) => /more kinds/.test(s));
ck(!!moreRow, 'ярус «ещё» предлагается', moreRow ?? 'строки нет');
if (moreRow) await pick(KIND, moreRow);
const kindList = await optionsOf(KIND);
ck(
  (kindList ?? []).length > (closedList ?? []).length,
  'пикер вида раскрыт целиком',
  `${(closedList ?? []).length} → ${(kindList ?? []).length} строк`,
);
const seen = new Map();
for (const k of pressItems) {
  // СОСЕДНИЙ ПУНКТ ПЕРЕД КАЖДЫМ — не приборка, а условие проверки: Radix не зовёт onValueChange,
  // когда выбирают УЖЕ выбранное, и «Press flat» на шаге, который и так резолвится в него, был бы
  // не выбором, а щелчком в пустоту — с зелёной пробой поверх ничего не записавшего пикера.
  await pick(KIND, 'Press open');
  const picked = await pick(KIND, k.label);
  ck(picked, `пункт «${k.label}» есть в живом списке`);
  if (!picked) continue;
  const v = await values();
  seen.set(k.id, v.pressAction);
  ck(v.operationType === T.PRESS, `«${k.label}» оставил глагол PRESS`, String(v.operationType));
  ck(
    typeof v.pressAction === 'string' && v.pressAction !== T.ACTION_UNSET,
    `«${k.label}» записал свой под-глагол`,
    String(v.pressAction).replace('TECH_CARD_PRESS_ACTION_', ''),
  );
}
ck(
  new Set(seen.values()).size === seen.size && seen.size === 7,
  'семь пунктов записали СЕМЬ РАЗНЫХ под-глаголов',
  [...seen.entries()]
    .map(([id, v]) => `${id}=${String(v).replace('TECH_CARD_PRESS_ACTION_', '')}`)
    .join(' '),
);

// ── 2. НАПРАВЛЕНИЕ — ТОЛЬКО ПРИ «PRESS TO ONE SIDE», И ОБЯЗАТЕЛЬНО ТАМ ─────────────────────────
head('2. направление припуска: только на «to one side» — и там обязательно');
await mount({ operationType: T.PRESS, zone: T.ZONE, pressEquipment: T.IRON });
ck(await has(F('pressAction')), 'контрол под-глагола на экране — стенд действительно смонтирован');

await pick(F('pressAction'), 'press flat');
ck(!(await has(F('pressToward'))), 'при «press flat» направления НЕТ');
await pick(F('pressAction'), 'press to one side');
ck(await has(F('pressToward')), 'при «press to one side» направление ПОЯВИЛОСЬ');

const towardItems = await optionsOf(F('pressToward'));
ck(
  (towardItems ?? []).length === 14,
  'в списке направлений 14 строк (13 членов + «не указано»)',
  String((towardItems ?? []).length),
);
ck(
  (towardItems ?? []).includes('onto the body, toward the armhole'),
  'подписи — термины цеха, а не буквальный перевод токена',
  (towardItems ?? []).find((s) => /armhole/i.test(s)) ?? '—',
);

// ОТКАЗ СТОИТ НА КОНТРОЛЕ, а не тостом после сохранения шести вкладок.
await page.evaluate(() => window.__press.trigger());
await page.waitForTimeout(200);
const msg = await messageIn(F('pressToward'));
ck(/which way/i.test(msg), 'пустое направление отвергнуто НА СВОЁМ контроле', msg || 'сообщения нет');
await pick(F('pressToward'), 'toward the back');
await page.evaluate(() => window.__press.trigger());
await page.waitForTimeout(200);
ck(!/which way/i.test(await messageIn(F('pressToward'))), 'ответ снимает отказ');

// И обратно: контрол исчезает, а значение за ним не остаётся жить невидимым.
await pick(F('pressAction'), 'steam');
ck(!(await has(F('pressToward'))), 'при «steam» направление снова ИСЧЕЗЛО');
const afterSteam = await values();
ck(
  afterSteam.pressToward === T.TOWARD_UNSET,
  'скрытое направление ОЧИЩЕНО, а не оставлено невидимым',
  String(afterSteam.pressToward),
);

// ── 3. КРУГ «ФОРМА → ПРОВОД → ФОРМА» ──────────────────────────────────────────────────────────
head('3. круг форма → провод → форма держит оба поля');
const trip = (op) => page.evaluate((o) => window.__press.roundTrip(o), op);

const rt = await trip({
  operationType: T.PRESS,
  zone: T.ZONE,
  pressEquipment: T.IRON,
  pressAction: T.ONE_SIDE,
  pressToward: 'TECH_CARD_PRESS_TOWARD_BACK',
});
ck(!!rt.wire?.press, 'блок press доехал до провода', JSON.stringify(rt.wire?.press ?? null));
ck(rt.wire?.press?.action === T.ONE_SIDE, 'под-глагол на проводе', String(rt.wire?.press?.action));
ck(
  rt.wire?.press?.toward === 'TECH_CARD_PRESS_TOWARD_BACK',
  'направление на проводе',
  String(rt.wire?.press?.toward),
);
ck(rt.back?.pressAction === T.ONE_SIDE, 'под-глагол вернулся в форму', String(rt.back?.pressAction));
ck(
  rt.back?.pressToward === 'TECH_CARD_PRESS_TOWARD_BACK',
  'направление вернулось в форму',
  String(rt.back?.pressToward),
);

const rtSteam = await trip({
  operationType: T.PRESS,
  zone: T.ZONE,
  pressEquipment: T.IRON,
  pressAction: 'TECH_CARD_PRESS_ACTION_STEAM',
  pressToward: 'TECH_CARD_PRESS_TOWARD_BACK',
});
ck(
  rtSteam.wire?.press?.toward === T.TOWARD_UNSET,
  'при «steam» направление на провод НЕ уезжает (гейт стоит и в маппере)',
  String(rtSteam.wire?.press?.toward),
);
const rtSilent = await trip({ operationType: T.PRESS, zone: T.ZONE, pressEquipment: T.IRON });
ck(
  !rtSilent.wire?.press,
  'молчащий шаг не отращивает пустую обёртку — байты как до волны',
  JSON.stringify(rtSilent.wire?.press ?? null),
);
const rtFuse = await trip({
  operationType: 'TECH_CARD_OPERATION_TYPE_FUSING',
  zone: T.ZONE,
  pressEquipment: 'TECH_CARD_PRESS_EQUIPMENT_FUSING_PRESS',
  pressAction: 'TECH_CARD_PRESS_ACTION_STEAM',
});
ck(
  !rtFuse.wire?.press,
  'дублирование под-глагол ВТО на провод не берёт',
  JSON.stringify(rtFuse.wire?.press ?? null),
);

// ── 4. «ПРОЧЕЕ» У ШЕСТИ ОБЯЗАТЕЛЬНЫХ ДИСКРИМИНАТОРОВ ──────────────────────────────────────────
head('4. «прочее» выбирается и доезжает до провода у всех шести видов');
const SIX = [
  { verb: 'HARDWARE_SET', option: 'held on some other way (see note)', field: 'attachMethod', token: 'TECH_CARD_HARDWARE_ATTACH_METHOD_OTHER', unset: '— how —' },
  { verb: 'PRINT', option: 'another method (see note)', field: 'printMethod', token: 'TECH_CARD_PRINT_METHOD_OTHER', unset: '— method —' },
  { verb: 'TRIM', option: 'another cut (see note)', field: 'trimAction', token: 'TECH_CARD_TRIM_ACTION_OTHER', unset: '— which cut —' },
  { verb: 'CLEAN', option: 'something else (see note)', field: 'cleaningKind', token: 'TECH_CARD_CLEANING_KIND_OTHER', unset: '— what —' },
  { verb: 'INSPECT', option: 'another coverage (see note)', field: 'coverageMode', token: 'TECH_CARD_INSPECT_COVERAGE_OTHER', unset: '— how much —' },
  { verb: 'WET_PROCESS', option: 'another bath (see note)', field: 'wetProcessKind', token: 'TECH_CARD_WET_PROCESS_KIND_OTHER', unset: '— which bath —' },
];
for (const s of SIX) {
  const verb = `TECH_CARD_OPERATION_TYPE_${s.verb}`;
  await mount({ operationType: verb, zone: T.ZONE });
  const sel = F(s.field);
  const items = await optionsOf(sel);
  ck(!!items && items.includes(s.option), `${s.verb}: «прочее» есть в живом списке`, (items ?? []).join(' | '));
  // «Прочее» — ОТВЕТ, «не выбрано» — нет: они обязаны выглядеть по-разному.
  ck(!!items && items.includes(s.unset), `${s.verb}: «не выбрано» — отдельная строка`, s.unset);
  ck(s.option !== s.unset, `${s.verb}: две подписи различны`, `«${s.option}» ≠ «${s.unset}»`);
  ck(await pick(sel, s.option), `${s.verb}: «прочее» выбирается`);
  ck((await values())[s.field] === s.token, `${s.verb}: выбор записан в форму`, s.token);
  const t = await trip({ operationType: verb, zone: T.ZONE, [s.field]: s.token });
  ck(JSON.stringify(t.wire ?? {}).includes(s.token), `${s.verb}: «прочее» доехало до провода`);
  ck(t.back?.[s.field] === s.token, `${s.verb}: и вернулось в форму`, String(t.back?.[s.field]));
}

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
