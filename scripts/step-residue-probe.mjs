#!/usr/bin/env node
// ПОЛОСА ОСТАТКОВ — ЖИВОЙ РЕДАКТОР, А НЕ РАССУЖДЕНИЕ О ТОМ, ЧТО ОН НАРИСУЕТ.
//
// Проба `step-roundtrip-probe.mjs` доказывает две трети Ф4: маппер везёт всё, а в эффектах не
// осталось разрушающих записей. Обе проверки — про то, чего БОЛЬШЕ НЕТ. Оставшаяся треть — то, что
// ПОЯВИЛОСЬ, и она видна только на смонтированном шаге:
//   1. заполненное-но-чужое СТОИТ СТРОКОЙ в полосе, а не исчезает и не молчит;
//   2. [clear] действительно стирает — стирание переехало к человеку, а не пропало;
//   3. открытие шага НЕ ПАЧКАЕТ форму. Это единственная проверка, которая ловит возвращённый
//      эффект по ПОВЕДЕНИЮ, а не по разметке: «unsaved changes» на карточке, которую никто не
//      правил, и есть тот дефект, ради которого эффекты снимались.
//
// ОРГАНЫ ИЩУТСЯ ПО `data-field` ВНУТРИ `[data-residue-strip]`, а не по тексту страницы: склейка
// соседних узлов через textContent уже давала в этом репозитории ложную зелень.
//
//   node scripts/step-residue-probe.mjs            прогон
//   node scripts/step-residue-probe.mjs --mutate   переворачивает предикат остатка В БАНДЛЕ
//                                                  (`!f.shown` → `f.shown`) — проба обязана
//                                                  покраснеть
//
// РЕЗУЛЬТАТ ПРОГОНА МУТАЦИИ (2026-08-22, ветка feat/operation-kinds-ui): 12 провалов — ни одной
// строки остатка ни на одном шаге, [clear] нечего нажимать, и вдобавок «оборудование ВТО остатком
// не считается» переворачивается вместе с предикатом. Откатано.
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
const outfile = resolve(tmpdir(), `step-residue-${process.pid}.js`);

// МУТАЦИЯ ЖИВЁТ В ПАМЯТИ СБОРЩИКА, А НЕ В ФАЙЛЕ: правка исходника ради проверки — это правка,
// которую однажды забудут откатить.
const FIX = '.filter((f) => f.filled && !f.shown)';
const BROKEN = '.filter((f) => f.filled && f.shown)';
const mutation = {
  name: 'residue-predicate-mutation',
  setup(b) {
    b.onLoad({ filter: /operations-field\.tsx$/ }, async (args) => {
      const src = await readFile(args.path, 'utf8');
      if (!src.includes(FIX)) throw new Error(`мутация не нашла свою строку в ${args.path}`);
      return { contents: src.replace(FIX, BROKEN), loader: 'tsx' };
    });
  },
};

await esbuild({
  entryPoints: [resolve(HERE, 'step-residue-entry.tsx')],
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
rmSync(outfile, { force: true });

const T = {
  MACHINE: 'TECH_CARD_OPERATION_TYPE_MACHINE',
  PRESS: 'TECH_CARD_OPERATION_TYPE_PRESS',
  PACK: 'TECH_CARD_OPERATION_TYPE_PACK',
  ZONE: 'TECH_CARD_GARMENT_ZONE_FRONT',
  IRON: 'TECH_CARD_PRESS_EQUIPMENT_IRON',
  LOCKSTITCH: 'TECH_CARD_MACHINE_TYPE_LOCKSTITCH',
  JEANS: 'TECH_CARD_NEEDLE_TYPE_JEANS',
  EYELET: 'TECH_CARD_BUTTONHOLE_STYLE_EYELET',
};

let bad = 0;
const ck = (ok, what, d = '') => {
  if (!ok) bad++;
  console.log(`${ok ? '  ok  ' : '  FAIL'} ${what}${d ? `  — ${d}` : ''}`);
};
const head = (s) => console.log(`\n${s}`);

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1500, height: 3000 } });
const pageErrors = [];
page.on('pageerror', (e) => pageErrors.push(String(e)));
await page.route('http://probe.local/**', (route) =>
  route.fulfill({ status: 200, contentType: 'text/html', body: '<div id="root"></div>' }),
);

async function mount(op) {
  await page.goto('http://probe.local/');
  await page.addScriptTag({ content: bundle });
  await page.evaluate((o) => window.__residue.mount(o), op);
  await page.waitForSelector('[data-kind-picker="0"]', { timeout: 15000 });
}

// СТРОКА ПОЛОСЫ — ТОЛЬКО ВНУТРИ ПОЛОСЫ. Тот же `data-field` стоит и на настоящих контролах:
// запрос без префикса нашёл бы контрол и позеленел бы на шаге, где полосы нет вовсе.
const RES = (name) => `[data-residue-strip] [data-field="operations.0.${name}"]`;
const CTRL = (name) => `[data-field="operations.0.${name}"]`;
const has = async (sel) => (await page.locator(sel).count()) > 0;
const textOf = async (sel) =>
  (await has(sel)) ? ((await page.locator(sel).first().textContent()) ?? '').trim() : '';
const values = () => page.evaluate(() => window.__residue.values());
const dirty = () => page.evaluate(() => window.__residue.dirty());

// ── 1. ЧУЖОЕ-НО-ЗАПОЛНЕННОЕ ВИДНО СТРОКОЙ ──────────────────────────────────────────────────────
head('1. ВТО-шаг с машинными фактами: строки полосы вместо тишины');
await mount({
  operationType: T.PRESS,
  zone: T.ZONE,
  pressEquipment: T.IRON,
  threadCount: 3,
  needleType: T.JEANS,
  buttonholeStyle: T.EYELET,
});
ck(pageErrors.length === 0, 'редактор смонтировался без исключений', pageErrors[0] ?? '');
ck(await has('[data-residue-strip]'), 'полоса остатков нарисована');
ck(await has(RES('threadCount')), 'число ниток стоит строкой остатка');
ck((await textOf(RES('threadCount'))).includes('3'), 'строка называет значение', await textOf(RES('threadCount')));
ck(
  (await textOf(RES('threadCount'))).toLowerCase().includes('threads'),
  'строка называет ПОЛЕ теми же словами, что контрол',
  await textOf(RES('threadCount')),
);
ck(await has(RES('needleType')), 'тип иглы стоит строкой остатка');
ck(await has(RES('buttonholeStyle')), 'стиль петли стоит строкой остатка');
ck(
  !(await has(`[data-residue-strip] [data-field="operations.0.pressEquipment"]`)),
  'оборудование ВТО остатком НЕ считается — у него есть свой контрол на этом шаге',
);

// ── 2. ОТКРЫТИЕ НЕ ПАЧКАЕТ ФОРМУ ───────────────────────────────────────────────────────────────
head('2. открытие шага с остатками не делает форму грязной');
{
  const d = await dirty();
  ck(d.isDirty === false, 'форма чистая после монтирования', JSON.stringify(d));
  ck(d.fields.length === 0, 'ни одно поле шага не помечено правленым', d.fields.join(', '));
  const v = await values();
  ck(v.threadCount === 3, 'значение на месте, его никто не стёр', String(v.threadCount));
  ck(v.needleType === T.JEANS, 'тип иглы на месте', String(v.needleType));
}

// ── 3. [CLEAR] СТИРАЕТ — И ЭТО ЕДИНСТВЕННОЕ МЕСТО, ГДЕ ФОРМА СТИРАЕТ ────────────────────────────
head('3. [clear] снимает значение и убирает строку');
{
  // Кнопки может не быть — ровно это и происходит под мутацией. Тогда пункт красный, а проба
  // доходит до конца и печатает счёт: упавший стенд и провалившаяся проверка читаются одинаково
  // только до тех пор, пока никто не смотрит на вывод.
  const clearable = await has(`${RES('threadCount')} button`);
  ck(clearable, 'у строки остатка есть [clear]');
  if (clearable) {
    await page.locator(`${RES('threadCount')} button`).first().click();
    await page.waitForTimeout(150);
    const v = await values();
    ck(v.threadCount === 0, 'после [clear] число ниток пусто', String(v.threadCount));
    ck(!(await has(RES('threadCount'))), 'строка ушла вместе со значением');
    ck(await has(RES('needleType')), 'соседние остатки [clear] не тронул');
    const d = await dirty();
    ck(d.isDirty === true, 'ТЕПЕРЬ форма грязная — правку сделал человек', JSON.stringify(d));
  }
}

// ── 4. ОТСТРОЧКА: ШИРИНА БЕЗ РЕЖИМА (шов Ф3↔Ф4, строка 4 матрицы) ──────────────────────────────
head('4. ширина отстрочки при незаданном режиме');
await mount({
  operationType: T.MACHINE,
  zone: T.ZONE,
  machineType: T.LOCKSTITCH,
  topstitchWidthMm: '4',
});
ck(await has(CTRL('topstitchMode')), 'контрол режима на экране — отказ Ф3 ляжет на него');
ck(await has(RES('topstitchWidthMm')), 'ширина без режима стоит строкой остатка');
ck(
  (await textOf(RES('topstitchWidthMm'))).includes('4'),
  'строка называет число',
  await textOf(RES('topstitchWidthMm')),
);

// КЛЕТКА, КОТОРОЙ В МАТРИЦЕ ПЛАНА НЕ БЫЛО: одни РЯДЫ без отступа. Серверное правило Ф3 стреляет и
// на них, значит и видно их должно быть — иначе отказ «назови режим» пришёл бы на шаг, где на
// экране нет ни одной причины его получить.
head('4-бис. одни ряды отстрочки, режим не задан');
await mount({
  operationType: T.MACHINE,
  zone: T.ZONE,
  machineType: T.LOCKSTITCH,
  topstitchRows: 2,
});
ck(await has(CTRL('topstitchMode')), 'контрол режима на экране и здесь — отказу Ф3 есть куда лечь');
ck(await has(RES('topstitchRows')), 'ряды без режима стоят строкой остатка');
ck(
  (await textOf(RES('topstitchRows'))).includes('2'),
  'строка называет число рядов',
  await textOf(RES('topstitchRows')),
);
if (await has(`${RES('topstitchRows')} button`)) {
  // [CLEAR] ПО РЯДАМ ДОЛЖЕН ЗАКРЫВАТЬ ОТКАЗ ЦЕЛИКОМ: после него у шага не остаётся ни одного
  // факта отстрочки, обёртка не едет вовсе, и серверу не на что отвечать «назови режим».
  await page.locator(`${RES('topstitchRows')} button`).first().click();
  await page.waitForTimeout(150);
  const v = await values();
  ck(v.topstitchRows === 0, 'после [clear] рядов не осталось', String(v.topstitchRows));
  ck(v.topstitchWidthMm === '', 'отступ так и остался пустой строкой, а не «пустым значением»', JSON.stringify(v.topstitchWidthMm));
}

// ── 5. ШАГ БЕЗ ОСТАТКОВ ПОЛОСЫ НЕ ПОКАЗЫВАЕТ ──────────────────────────────────────────────────
head('5. чистый шаг: полосы нет вовсе');
await mount({ operationType: T.MACHINE, zone: T.ZONE, machineType: T.LOCKSTITCH, threadCount: 4 });
ck(!(await has('[data-residue-strip]')), 'у машинного шага с машинными фактами полосы нет');
ck(await has(CTRL('threadCount')), 'число ниток стоит своим контролом');
ck((await dirty()).isDirty === false, 'и здесь открытие не пачкает форму');

await browser.close();
console.log(`\n${bad === 0 ? 'проба зелёная' : `провалов: ${bad}`}`);
process.exit(bad === 0 ? 0 : 1);
