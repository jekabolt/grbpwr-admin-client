#!/usr/bin/env node
// ЧЕТЫРЕ НАХОДКИ РЕВЬЮ — ЖИВОЙ РЕДАКТОР И ЖИВОЙ ПЕЧАТНЫЙ ЛИСТ, А НЕ ТАБЛИЦЫ.
//
//   1. свойства ВТО не печатались: `wireStepFacts` не переносила блок `press`, а `StepFacts` его
//      члена не имела — компилятор молчал, и семь приёмов уезжали в цех словом «press»;
//   2. «Topstitch» переигрывал выбор человека: оставшийся `seam_class` перехватывал резолв, пункт
//      не брался вовсе, и шаг продолжал называться отстрочкой ВЕЗДЕ, включая лист;
//   3. гейт записи ВТО побеждался очисткой скрытого: `PRESS_OPEN` терял под-глагол при открытии
//      шага, а мимо редактора тот же шаг отдавал его на провод;
//   4. открытая зона рисовала на сварочной машине иглы, калибр, закрепку и шаг между рядами —
//      четыре поля, которые сервер отвергает по имени.
//
// ЧЕГО НЕ ПОКРЫВАЛА ПРЕЖНЯЯ ПРОБА, И ПОЧЕМУ ЭТА УСТРОЕНА ИНАЧЕ:
//  · пикер видов не был покрыт вовсе — здесь каждый переход делается КЛИКОМ по живому списку;
//  · `roundTrip` редактор НЕ монтировал, только мапперы, — поэтому находка №3 сквозь неё
//    проходила: она живёт ровно в разнице «через редактор» и «мимо редактора». Здесь круг
//    катается ИЗ ЖИВОЙ ФОРМЫ (`__review.wire`) на СМОНТИРОВАННОМ шаге;
//  · печать проверяется НАСТОЯЩИМ `TechPackDocument`, собранным настоящим маппером записи: проба,
//    зовущая композитор фактов напрямую, зеленела бы при ровно том дефекте, который чинится.
//
// ТРИ ЛОВУШКИ СТЕНДА, КАЖДАЯ УЖЕ ДАВАЛА ЛОЖНУЮ ЗЕЛЕНЬ:
//  · закрытая створка (и невыбранный шаг) РАЗМОНТИРУЕТ содержимое — «поля нет» одинаково правдиво
//    и когда правило работает, и когда экран не отрисовался; поэтому каждое «нет» стоит в паре
//    «нет → переключили → есть → вернули → нет» на ОДНОМ смонтированном шаге;
//  · Radix НЕ зовёт onValueChange при выборе УЖЕ выбранного пункта — перед целевым выбирается
//    соседний, иначе клик в пустоту зеленел бы под неработающим пикером;
//  · подпись со скобками, попав в `new RegExp` как есть, матчится без них и не находит ничего —
//    молча, через `false`; поэтому текст экранируется.
//
//   node scripts/opkinds-review-probe.mjs             прогон
//   node scripts/opkinds-review-probe.mjs --mutate=N  ломает В БАНДЛЕ починку N (1..5), репозиторий
//                                                     не трогается; проба обязана покраснеть
//   node scripts/opkinds-review-probe.mjs --mutate    то же по очереди для всех пяти
//
// Playwright не в зависимостях проекта — ищется в кэше npx и МОЛЧА пропускается, если не найден.

import { createRequire } from 'node:module';
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, rmSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { homedir, tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { build as esbuild } from 'esbuild';

const arg = process.argv.find((a) => a.startsWith('--mutate'));
const MUTANT = arg ? Number((arg.split('=')[1] ?? '0').trim()) || 0 : null;

// МУТАЦИИ ЖИВУТ В ПАМЯТИ СБОРЩИКА, А НЕ В ФАЙЛЕ. Правка исходника ради проверки — это правка,
// которую однажды забудут откатить; здесь ломается ровно одна строка ровно на один прогон.
const MUTATIONS = {
  1: {
    what: 'находка 1: блок press снова не доезжает до композиторов листа',
    file: /tech-pack-document\.tsx$/,
    from: '  press: o.press && { action: o.press.action, toward: o.press.toward },\n',
    to: '',
  },
  2: {
    what: 'находка 2: выбор пункта снова ничего не снимает',
    file: /operation-kinds\.ts$/,
    from: '  if (answers(kindOf(step)?.id)) return out;',
    to: '  return out;',
  },
  3: {
    what: 'находка 3: очистка скрытого снова гасит под-глагол на PRESS_OPEN',
    file: /operations-field\.tsx$/,
    from: "      opType === 'TECH_CARD_OPERATION_TYPE_PRESS_OPEN';",
    to: '      false;',
  },
  4: {
    what: 'находка 4: игольная четвёрка снова рисуется на сварочной машине',
    file: /operations-field\.tsx$/,
    from: 'const showNeedleFacts = showStitching && !isWeldStep;',
    to: 'const showNeedleFacts = showStitching;',
  },
  5: {
    what: 'находка 4: zod снова не отвергает игольную четвёрку на сварке',
    file: /schema\.ts$/,
    from: `      refuseAtWeld(stepTextSet(o.needleGaugeMm), 'needleGaugeMm', 'needle');
      refuseAtWeld(!!o.needleCount, 'needleCount', 'needle');
      refuseAtWeld(stepEnumSet(o.seamSecuring), 'seamSecuring', 'stitch to secure');
      refuseAtWeld(stepTextSet(o.rowSpacingMm), 'rowSpacingMm', 'row of stitching');`,
    to: '',
  },
  // ── ОТСТУП ОТСТРОЧКИ: ПОДПИСЬ И ПЕЧАТЬ НАЗЫВАЮТ ЛИНИЮ ────────────────────────────────────────
  // Пятая находка пришла не из диффа, а от владельца-технолога: «у нас в топстиче есть row
  // spacing, но нет отступа от края». Отступ был — под подписью «topstitch width, mm», то есть
  // владелец смотрел ровно на нужное поле и не узнал его. Мутации ниже ломают каждую половину
  // починки по отдельности, потому что зелень одной ничего не говорит о другой.
  6: {
    what: 'находка 5: оба режима снова меряют «от края» — датум один на два разных отсчёта',
    file: /operation-options\.ts$/,
    from: "    datum: 'the seam line',",
    to: "    datum: 'the edge',",
  },
  7: {
    what: 'находка 5: подпись отступа снова константа и не зависит от режима',
    file: /operations-field\.tsx$/,
    from: 'label={topstitchWidthLabel(topstitchMode)}',
    to: "label='topstitch width, mm'",
  },
  8: {
    what: 'находка 5: лист снова печатает «from edge» при любом режиме',
    file: /tech-pack-document\.tsx$/,
    from: '  return `topstitch ${rows}${topstitchPhrase(t.mode, dec(t.widthMm))}`.trim();',
    to: "  return `topstitch ${rows}${dec(t.widthMm) ? dec(t.widthMm) + ' mm from edge' : ''}`.trim();",
  },
  9: {
    what: 'находка 5: соседи снова не говорят, между чем меряют (калибр и шаг рядов)',
    file: /operations-field\.tsx$/,
    from: "label='gauge between needles, mm'",
    to: "label='needle gauge, mm'",
  },
  10: {
    what: 'находка 5: лист снова печатает «rows N apart» и «gauge N» — рядом с размером иглы',
    file: /operation-options\.ts$/,
    from: "    mm(s?.rowSpacingMm) ? `stitch rows ${mm(s?.rowSpacingMm)} apart` : '',",
    to: "    mm(s?.rowSpacingMm) ? `rows ${mm(s?.rowSpacingMm)} apart` : '',",
  },
  // ── СВЕДЕНИЕ СПИСКА К ТРЁМ: ОДИН ПРИЁМ, ЧИСЛО НЕОБЯЗАТЕЛЬНО ─────────────────────────────────
  // Шестая находка — тоже от владельца и тем же вопросом: чем «at the edge» отличается от «at
  // width from the edge», если это тот же приём без числа. Ничем; `WIDTH` снят из контракта, а
  // отступ переехал к `EDGE` необязательным. Каждая половина ломается отдельно: то, что список
  // короткий, ничего не говорит о том, что число у края доезжает до провода, и наоборот.
  11: {
    what: 'находка 6: снятый режим снова предлагается в списке',
    file: /operation-options\.ts$/,
    from: '  TECH_CARD_TOPSTITCH_MODE_WIDTH: null,',
    to: "  TECH_CARD_TOPSTITCH_MODE_WIDTH: { label: 'at width from the edge', need: 'optional', datum: 'the edge' },",
  },
  12: {
    what: 'находка 6: zod снова требует число у края — форма спорит с сервером',
    file: /operation-options\.ts$/,
    from: "  topstitchSpec(mode)?.need === 'required';",
    to: "  topstitchSpec(mode)?.need !== 'none';",
  },
  13: {
    what: 'находка 6: у края снова нет отступа — контрол прячется, а число стирается',
    file: /operation-options\.ts$/,
    from: "  TECH_CARD_TOPSTITCH_MODE_EDGE: { label: 'at the edge', need: 'optional', datum: 'the edge' },",
    to: "  TECH_CARD_TOPSTITCH_MODE_EDGE: { label: 'at the edge', need: 'none' },",
  },
  14: {
    what: 'находка 6: маппер снова роняет отступ края по дороге на провод',
    file: /schema\.ts$/,
    from: '                widthMm: topstitchModeRefusesWidth(topstitchMode)',
    to: '                widthMm: !topstitchModeNeedsWidth(topstitchMode)',
  },
  15: {
    what: 'находка 6: лист и схема снова молчат про режим без числа («in the ditch»)',
    file: /operation-options\.ts$/,
    from: '  return topstitchDistanceText(mode, widthMm) || spec.label;',
    to: '  return topstitchDistanceText(mode, widthMm);',
  },
};

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

const entryPath = resolvePlaywright();
if (!entryPath) {
  console.log('playwright не найден — проба пропущена (это не отказ)');
  process.exit(0);
}
const mod = await import(entryPath);
const chromium = mod.chromium ?? mod.default?.chromium;
if (!chromium) {
  console.log('playwright найден, но без chromium — проба пропущена');
  process.exit(0);
}

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = resolve(HERE, '..');

async function bundleWith(mutantId) {
  const outfile = resolve(tmpdir(), `opkinds-review-${process.pid}-${mutantId ?? 0}.js`);
  const m = mutantId ? MUTATIONS[mutantId] : null;
  if (mutantId && !m) throw new Error(`мутации ${mutantId} нет`);
  const plugin = m && {
    name: 'review-mutation',
    setup(b) {
      b.onLoad({ filter: m.file }, async (args) => {
        const src = await readFile(args.path, 'utf8');
        if (!src.includes(m.from)) throw new Error(`мутация не нашла свою строку в ${args.path}`);
        return {
          contents: src.replace(m.from, m.to),
          loader: args.path.endsWith('.tsx') ? 'tsx' : 'ts',
        };
      });
    },
  };
  await esbuild({
    entryPoints: [resolve(HERE, 'opkinds-review-entry.tsx')],
    bundle: true,
    platform: 'browser',
    format: 'iife',
    target: 'es2020',
    outfile,
    logLevel: 'warning',
    absWorkingDir: REPO,
    jsx: 'automatic',
    loader: { '.svg': 'text', '.png': 'dataurl', '.woff2': 'dataurl' },
    plugins: plugin ? [plugin] : [],
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
  const code = readFileSync(outfile, 'utf8');
  rmSync(outfile, { force: true });
  return code;
}

const T = {
  MACHINE: 'TECH_CARD_OPERATION_TYPE_MACHINE',
  PRESS: 'TECH_CARD_OPERATION_TYPE_PRESS',
  PRESS_OPEN: 'TECH_CARD_OPERATION_TYPE_PRESS_OPEN',
  ZONE: 'TECH_CARD_GARMENT_ZONE_FRONT',
  IRON: 'TECH_CARD_PRESS_EQUIPMENT_IRON',
  ONE_SIDE: 'TECH_CARD_PRESS_ACTION_TO_ONE_SIDE',
  OPEN: 'TECH_CARD_PRESS_ACTION_OPEN',
  ACTION_UNSET: 'TECH_CARD_PRESS_ACTION_UNKNOWN',
  TOWARD_FRONT: 'TECH_CARD_PRESS_TOWARD_FRONT',
  TOWARD_UNSET: 'TECH_CARD_PRESS_TOWARD_UNKNOWN',
  LOCKSTITCH: 'TECH_CARD_MACHINE_TYPE_LOCKSTITCH',
  COVERSTITCH: 'TECH_CARD_MACHINE_TYPE_COVERSTITCH',
  ULTRASONIC: 'TECH_CARD_MACHINE_TYPE_ULTRASONIC_WELDER',
  TOPSTITCH: 'TECH_CARD_SEAM_CLASS_OS_TOPSTITCH',
  SEAM_UNSET: 'TECH_CARD_SEAM_CLASS_UNKNOWN',
  SECURING: 'TECH_CARD_SEAM_SECURING_BACKTACK',
};

async function run(bundle) {
  let bad = 0;
  const log = [];
  const ck = (ok, what, d = '') => {
    if (!ok) bad++;
    log.push(`${ok ? '  ok  ' : '  FAIL'} ${what}${d ? `  — ${d}` : ''}`);
  };
  const head = (s) => log.push(`\n${s}`);

  const browser = await chromium.launch();
  // ВЫСОКОЕ ОКНО — НЕ КОСМЕТИКА: список видов выпадает попперным блоком без max-height, и в обычном
  // окне нижние строки оказываются ЗА кадром — клик по ним не проходит физически.
  const page = await browser.newPage({ viewport: { width: 1500, height: 4200 } });
  const pageErrors = [];
  page.on('pageerror', (e) => pageErrors.push(String(e)));
  await page.route('http://probe.local/**', (route) =>
    route.fulfill({ status: 200, contentType: 'text/html', body: '<div id="root"></div>' }),
  );

  const KIND = '[data-kind-picker="0"]';
  const F = (name) => `[data-field="operations.0.${name}"]`;
  const has = async (sel) => (await page.locator(sel).count()) > 0;
  const escapeRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

  async function mount(op) {
    await page.goto('http://probe.local/');
    await page.addScriptTag({ content: bundle });
    await page.evaluate((o) => window.__review.mount(o), op);
    await page.waitForSelector(KIND, { timeout: 15000 });
    // Эффект очистки скрытого — это эффект: он стреляет ПОСЛЕ коммита, и читать форму сразу после
    // появления пикера значило бы иногда успевать до него.
    await page.waitForTimeout(150);
  }

  async function openList(sel) {
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
  async function pick(sel, text) {
    if (!(await has(sel))) return false;
    await openList(sel);
    const opt = page
      .locator('[role="option"]')
      .filter({ hasText: new RegExp(`^${escapeRe(text)}$`) });
    if ((await opt.count()) === 0) {
      await closeList();
      return false;
    }
    await opt.first().click();
    await page
      .waitForSelector('[role="option"]', { state: 'detached', timeout: 5000 })
      .catch(() => {});
    await page.waitForTimeout(120);
    return true;
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
  // ПУНКТ ВИДА ВЫБИРАЕТСЯ ЧЕРЕЗ СОСЕДНИЙ: Radix не зовёт onValueChange на уже выбранном, и клик по
  // текущему пункту был бы щелчком в пустоту — с зелёной пробой поверх ничего не записавшего пикера.
  async function pickKind(text, via = 'Overlock / serge') {
    const cur = await kindLabel();
    if (cur === text) await pick(KIND, via);
    return pick(KIND, text);
  }
  const kindLabel = async () =>
    ((await page.locator(`${KIND} button`).first().textContent()) ?? '').trim();
  const values = () => page.evaluate(() => window.__review.values());
  const wire = () => page.evaluate(() => window.__review.wire());
  const validate = (op) => page.evaluate((o) => window.__review.validate(o), op);
  const messageIn = async (sel) => {
    const n = page.locator(`${sel} [id$="-form-item-message"]`);
    return (await n.count()) ? ((await n.first().textContent()) ?? '').trim() : '';
  };
  // ПОДПИСЬ ПОЛЯ — ЧИТАЕТСЯ С ЖИВОГО `<label>`, а не из карты слов: карту можно прочитать и правильно
  // при подписи, прибитой константой рядом с контролом, — ровно тот дефект, который здесь чинится.
  // Регистр берётся исходный: `uppercase` в этой форме — CSS, до textContent он не доходит.
  const labelOf = async (sel) => {
    const n = page.locator(`${sel} label`);
    return (await n.count()) ? ((await n.first().textContent()) ?? '').trim() : '';
  };
  const typeInto = async (sel, text) => {
    if (!(await has(sel))) return false;
    await page.fill(`${sel} input`, text);
    await page.waitForTimeout(120);
    return true;
  };

  // ЯЧЕЙКИ СТРОКИ ЛИСТА — из НАСТОЯЩЕЙ таблицы операций напечатанного документа. Таблица ищется по
  // своей шапке, а не по порядку среди прочих таблиц листа; строка — та, у которой девять ячеек
  // (у заголовка узла одна на всю ширину, у снимков шага тоже).
  async function sheetRow(op) {
    await page.evaluate((o) => window.__review.sheet(o ?? undefined), op ?? null);
    await page
      .waitForFunction(
        () =>
          [...document.querySelectorAll('#sheet table')].some((t) =>
            /machine \/ mode/i.test(t.querySelector('thead')?.textContent ?? ''),
          ),
        { timeout: 15000 },
      )
      .catch(() => {});
    return page.evaluate(() => {
      const t = [...document.querySelectorAll('#sheet table')].find((tb) =>
        /machine \/ mode/i.test(tb.querySelector('thead')?.textContent ?? ''),
      );
      if (!t) return null;
      const row = [...t.querySelectorAll('tbody tr')].find((r) => r.children.length === 9);
      if (!row) return null;
      const cells = [...row.children].map((c) => (c.textContent ?? '').replace(/\s+/g, ' ').trim());
      return { operation: cells[1], machineMode: cells[2], zone: cells[3], seam: cells[6] };
    });
  }

  // ── 1. СВОЙСТВА ВТО ПОПАДАЮТ НА ЛИСТ ──────────────────────────────────────────────────────────
  head('1. под-глагол ВТО и направление припуска ПЕЧАТАЮТСЯ');
  await mount({ operationType: T.PRESS, zone: T.ZONE, pressEquipment: T.IRON });
  ck(pageErrors.length === 0, 'редактор смонтировался без исключений', pageErrors[0] ?? '');
  ck(await has(F('pressAction')), 'контрол под-глагола на экране — стенд действительно смонтирован');

  // Значения ставятся КЛИКАМИ по живым контролам, а не записью в форму мимо органов.
  ck(await pick(F('pressAction'), 'press to one side'), 'выбран приём «press to one side»');
  ck(await pick(F('pressToward'), 'toward the front'), 'выбрано направление «toward the front»');
  const vPress = await values();
  ck(vPress.pressAction === T.ONE_SIDE, 'приём записан в форму', String(vPress.pressAction));
  ck(vPress.pressToward === T.TOWARD_FRONT, 'направление записано в форму', String(vPress.pressToward));

  const rowPress = await sheetRow();
  ck(!!rowPress, 'таблица операций напечаталась', JSON.stringify(rowPress));
  const mm = rowPress?.machineMode ?? '';
  ck(/press to one side/i.test(mm), 'приём НАПЕЧАТАН в колонке «machine / mode»', mm);
  ck(/toward the front/i.test(mm), 'направление НАПЕЧАТАНО там же', mm);
  ck(
    /iron \(pressing table\)/i.test(mm),
    'имя оборудования осталось на месте — приём его не вытеснил',
    mm,
  );
  ck(
    mm.indexOf('press to one side') < mm.indexOf('iron'),
    'что делают — раньше, на чём — позже (правило колонки)',
    mm,
  );

  // ЧЕТЫРЕ РАЗНЫХ ПРИЁМА — ЧЕТЫРЕ РАЗНЫХ ЛИСТА. Одинаковое слово «press» на всех было ровно
  // дефектом: проверка «строка не пуста» его бы не поймала.
  const printed = new Map();
  for (const a of ['press flat', 'steam', 'final press', 'stretch the edge']) {
    await pick(F('pressAction'), a);
    const r = await sheetRow();
    printed.set(a, r?.machineMode ?? '');
    ck((r?.machineMode ?? '').toLowerCase().includes(a.toLowerCase()), `«${a}» напечатан`, r?.machineMode ?? '');
  }
  ck(
    new Set(printed.values()).size === printed.size,
    'четыре приёма дали ЧЕТЫРЕ РАЗНЫЕ строки, а не одно слово «press»',
    [...printed.values()].join(' | '),
  );

  // Молчащий ВТО-шаг не отращивает на листе слов, которых в записи нет.
  const rowSilent = await sheetRow({ operationType: T.PRESS, zone: T.ZONE, pressEquipment: T.IRON });
  ck(
    !/press flat|to one side|steam/i.test(rowSilent?.machineMode ?? ''),
    'не названный приём НЕ выдумывается на листе',
    rowSilent?.machineMode ?? '',
  );

  // ── 2. ВЫБОР ПУНКТА ПОБЕЖДАЕТ ОСТАВШИЙСЯ ЯКОРЬ ────────────────────────────────────────────────
  head('2. пикер: переход с «Topstitch», когда резолв держится за класс шва');
  const A2 = { operationType: T.MACHINE, machineType: T.LOCKSTITCH, seamClass: T.TOPSTITCH, zone: T.ZONE };
  await mount(A2);
  ck((await kindLabel()) === 'Topstitch', 'исходный шаг резолвится в «Topstitch»', await kindLabel());

  const MOVES = [
    { label: 'Join — lockstitch', machine: T.LOCKSTITCH },
    { label: 'Coverstitch', machine: T.COVERSTITCH },
    { label: 'Chainstitch', machine: 'TECH_CARD_MACHINE_TYPE_CHAINSTITCH' },
    { label: 'AMF hand-stitch imitation', machine: 'TECH_CARD_MACHINE_TYPE_HANDSTITCH_IMITATION' },
    { label: 'Attach label', machine: T.LOCKSTITCH },
  ];
  for (const mv of MOVES) {
    await mount(A2);
    // ЯРУС «ЕЩЁ» РАСКРЫВАЕТСЯ ЖИВОЙ СТРОКОЙ, а её подпись несёт ЧИСЛО скрытых пунктов — выписать
    // его константой значит сломать пробу на первом же добавленном редком виде. Без раскрытия
    // «AMF hand-stitch imitation» в списке просто нет, и «пункт не выбрался» смешалось бы с
    // «пункта нет».
    const list = await optionsOf(KIND);
    const more = (list ?? []).find((s) => /more kinds/.test(s));
    if (more) await pick(KIND, more);
    ck(await pickKind(mv.label), `пункт «${mv.label}» выбран`);
    const got = await kindLabel();
    ck(got === mv.label, `пикер ПОКАЗЫВАЕТ «${mv.label}», а не откатился к «Topstitch»`, got);
    const v = await values();
    ck(v.machineType === mv.machine, `«${mv.label}» записал свою машинку`, String(v.machineType));
    ck(
      v.seamClass === T.SEAM_UNSET,
      `«${mv.label}» снял чужой якорь (класс шва)`,
      String(v.seamClass),
    );
    // И ЭТО ДОЛЖНО ДОЕХАТЬ ДО ЦЕХА: заголовок шага берётся ТОЙ ЖЕ функцией, что и лист.
    const row = await sheetRow();
    ck(
      !/topstitch/i.test(row?.operation ?? ''),
      `лист больше не зовёт шаг отстрочкой после «${mv.label}»`,
      row?.operation ?? '',
    );
  }

  // ОБРАТНАЯ ПОЛОВИНА: пункт, который якорь ЗАЯВЛЯЕТ, его не снимает, а ставит.
  await mount({ operationType: T.MACHINE, machineType: T.LOCKSTITCH, zone: T.ZONE });
  ck((await kindLabel()) === 'Join — lockstitch', 'шаг без якоря — «Join — lockstitch»', await kindLabel());
  ck(await pickKind('Topstitch'), 'пункт «Topstitch» выбран');
  const vTop = await values();
  ck(vTop.seamClass === T.TOPSTITCH, '«Topstitch» ПОСТАВИЛ свой якорь', String(vTop.seamClass));
  const rowTop = await sheetRow();
  ck(/topstitch/i.test(rowTop?.operation ?? ''), 'и лист зовёт шаг отстрочкой', rowTop?.operation ?? '');

  // ── 3. КРУГ PRESS_OPEN ЧЕРЕЗ СМОНТИРОВАННЫЙ РЕДАКТОР ──────────────────────────────────────────
  head('3. PRESS_OPEN: открытие шага не стирает прочитанный под-глагол');
  await mount({
    operationType: T.PRESS_OPEN,
    zone: T.ZONE,
    pressEquipment: T.IRON,
    pressAction: T.OPEN,
  });
  const vOpen = await values();
  ck(
    vOpen.pressAction === T.OPEN,
    'смонтированный редактор ОСТАВИЛ под-глагол как есть',
    String(vOpen.pressAction),
  );
  const wOpen = await wire();
  ck(
    wOpen?.press?.action === T.OPEN,
    'и он уехал на провод ИЗ ЖИВОЙ ФОРМЫ (круг «загрузил → сохранил»)',
    JSON.stringify(wOpen?.press ?? null),
  );
  // ПАРА «НЕТ → ЕСТЬ → НЕТ»: контрола у разутюжки нет ПО ПРАВИЛУ, а не потому, что экран пуст.
  ck(!(await has(F('pressAction'))), 'у PRESS_OPEN контрола под-глагола НЕТ');
  ck(await pick(F('operationType'), 'press (to one side / steam)'), 'глагол переключён на PRESS');
  ck(await has(F('pressAction')), 'у PRESS контрол под-глагола ПОЯВИЛСЯ');
  ck(await pick(F('operationType'), 'press open'), 'глагол возвращён на PRESS_OPEN');
  ck(!(await has(F('pressAction'))), 'и контрол снова ИСЧЕЗ');
  const vBack = await values();
  ck(
    vBack.pressAction === T.OPEN,
    'под-глагол пережил оба переключения — форма не канонизирует написание',
    String(vBack.pressAction),
  );
  // А ВОТ ЧУЖОЙ ГЛАГОЛ ЕГО СНИМАЕТ — иначе гейт бы вообще ничего не гейтил.
  ck(await pick(F('operationType'), 'fusing'), 'глагол переключён на дублирование');
  const vFuse = await values();
  ck(
    vFuse.pressAction === T.ACTION_UNSET,
    'на не-ВТО глаголе под-глагол ОЧИЩЕН',
    String(vFuse.pressAction),
  );

  // ── 4. СВАРОЧНАЯ МАШИНА: ИГЛЫ НЕТ, И ПОЛЕЙ ИГЛЫ ТОЖЕ ──────────────────────────────────────────
  head('4. ультразвук: игольная четвёрка не рисуется, не хранится и отвергается');
  await mount({
    operationType: T.MACHINE,
    machineType: T.ULTRASONIC,
    zone: T.ZONE,
    needleCount: 4,
    seamSecuring: T.SECURING,
    rowSpacingMm: '3.2',
    needleGaugeMm: '6.4',
    fullnessRatio: '1.4',
  });
  const NEEDLE = ['needleCount', 'seamSecuring', 'rowSpacingMm'];
  for (const f of NEEDLE) ck(!(await has(F(f))), `на сварке контрола «${f}» НЕТ`);
  ck(!(await has(F('needleGaugeMm'))), 'на сварке контрола «needleGaugeMm» НЕТ');
  ck(await has(F('fullnessRatio')), 'посадка на сварке ОСТАЛАСЬ — она про подачу, а не про иглу');

  const vWeld = await values();
  ck(vWeld.needleCount === 0, 'число игл ОЧИЩЕНО, а не оставлено невидимым', String(vWeld.needleCount));
  ck(
    vWeld.seamSecuring === 'TECH_CARD_SEAM_SECURING_UNKNOWN',
    'закрепка ОЧИЩЕНА',
    String(vWeld.seamSecuring),
  );
  ck(vWeld.rowSpacingMm === '', 'шаг между рядами ОЧИЩЕН', JSON.stringify(vWeld.rowSpacingMm));
  ck(vWeld.needleGaugeMm === '', 'калибр ОЧИЩЕН', JSON.stringify(vWeld.needleGaugeMm));
  ck(vWeld.fullnessRatio === '1.4', 'посадка НЕ тронута', String(vWeld.fullnessRatio));
  const wWeld = await wire();
  ck(
    !wWeld?.stitching?.needleCount && !wWeld?.stitching?.rowSpacingMm,
    'и на провод игольные поля не уехали',
    JSON.stringify(wWeld?.stitching ?? null),
  );

  // ПАРА «НЕТ → ЕСТЬ → НЕТ» НА ТОМ ЖЕ СМОНТИРОВАННОМ ШАГЕ.
  ck(await pick(F('machineType'), 'lockstitch 301'), 'машинка переключена на ниточную');
  for (const f of NEEDLE) ck(await has(F(f)), `на ниточной машине контрол «${f}» ПОЯВИЛСЯ`);
  ck(await pick(F('machineType'), 'ultrasonic welder'), 'машинка возвращена на ультразвук');
  for (const f of NEEDLE) ck(!(await has(F(f))), `на сварке контрол «${f}» снова ИСЧЕЗ`);

  // ОТКАЗ zod — НА КАЖДОМ ПОЛЕ ОТДЕЛЬНО: шаг, пришедший с провода мимо редактора, чинится там, где
  // стоит число, а не тостом после сохранения шести вкладок.
  const issues = await validate({
    operationType: T.MACHINE,
    machineType: T.ULTRASONIC,
    zone: T.ZONE,
    needleCount: 4,
    seamSecuring: T.SECURING,
    rowSpacingMm: '3.2',
    needleGaugeMm: '6.4',
    fullnessRatio: '1.4',
  });
  const paths = new Set(issues.map((i) => i.path.split('.').pop()));
  for (const f of ['needleCount', 'seamSecuring', 'rowSpacingMm', 'needleGaugeMm'])
    ck(paths.has(f), `zod отвергает «${f}» на сварке`, [...paths].join(' '));
  ck(!paths.has('fullnessRatio'), 'и НЕ отвергает посадку', [...paths].join(' '));
  ck(
    issues.some((i) => /welding machine has no needle/i.test(i.message)),
    'текст отказа называет причину словами цеха',
    issues.find((i) => /welding/i.test(i.message))?.message ?? '—',
  );

  // ── 5. ОТСТРОЧКА: ТРИ ПРИЁМА, ЧИСЛО У КРАЯ НЕОБЯЗАТЕЛЬНО, ЛИНИЮ НАЗЫВАЮТ ВСЕ ────────────────
  // Владелец-технолог прочитал список и спросил, чем «at the edge» отличается от «at width from the
  // edge», если «по краю» — тот же приём, просто без числа. Ничем: это была одна клетка сетки,
  // записанная дважды. `WIDTH` снят из контракта, у `EDGE` отступ стал НЕОБЯЗАТЕЛЬНЫМ (пусто —
  // вплотную, заполнено — столько-то мм от края), у `PARALLEL_TO_SEAM` — обязательным и от ЛИНИИ
  // ШВА, у `IN_DITCH` его нет вовсе. Проба ниже держит каждое из этих четырёх утверждений
  // отдельно: короткий список ничего не говорит о том, что число у края доезжает до провода.
  head('5. отстрочка: три приёма, отступ у края необязателен, линия названа везде одинаково');
  const TS = {
    EDGE: 'TECH_CARD_TOPSTITCH_MODE_EDGE',
    DITCH: 'TECH_CARD_TOPSTITCH_MODE_IN_DITCH',
    PARALLEL: 'TECH_CARD_TOPSTITCH_MODE_PARALLEL_TO_SEAM',
    RETIRED: 'TECH_CARD_TOPSTITCH_MODE_WIDTH',
    UNSET: 'TECH_CARD_TOPSTITCH_MODE_UNKNOWN',
  };
  const STEP = { operationType: T.MACHINE, machineType: T.LOCKSTITCH, zone: T.ZONE };
  const roundTrip = (op) => page.evaluate((o) => window.__review.roundTrip(o), op);
  // Подсказка про пустое поле живёт РЯДОМ с контролом, а не внутри него: ищется по своим словам.
  const hintShown = async () =>
    (await page.locator('#root').getByText('leave empty and the stitch runs flush').count()) > 0;

  await mount(STEP);
  ck(await has(F('topstitchMode')), 'блок отстрочки смонтирован — пикер режима на экране');
  ck(!(await has(F('topstitchWidthMm'))), 'без режима контрола отступа НЕТ');

  // СПИСОК — РОВНО ТРИ ПРИЁМА ПЛЮС «нет». Снятый режим не предлагается: ни как пункт, ни как слово.
  const modes = await optionsOf(F('topstitchMode'));
  ck(
    JSON.stringify(modes) ===
      JSON.stringify(['— none —', 'at the edge', 'in the ditch', 'parallel to the seam']),
    'в списке РОВНО три приёма и «нет» — не четыре приёма',
    JSON.stringify(modes),
  );
  ck(
    !(modes ?? []).some((s) => /width/i.test(s)),
    'снятого «at width from the edge» в списке НЕТ',
    JSON.stringify(modes),
  );

  // ── КРАЙ БЕЗ ЧИСЛА: контрол ЕСТЬ, пустым он законен, и это сказано словами ────────────────────
  ck(await pick(F('topstitchMode'), 'at the edge'), 'режим — «at the edge»');
  ck(
    await has(F('topstitchWidthMm')),
    'у КРАЯ контрол отступа ЕСТЬ — прежде он здесь прятался, и ради него держали второй пункт',
  );
  const lblEdge = await labelOf(F('topstitchWidthMm'));
  ck(/from the edge/i.test(lblEdge), 'подпись называет КРАЙ', lblEdge);
  ck(!/^topstitch width, mm$/i.test(lblEdge), 'и это уже не безымянная «topstitch width, mm»', lblEdge);
  ck(await hintShown(), 'сказано, что значит ПУСТОЕ поле — иначе оно читается как «забыли»');

  await page.evaluate(() => window.__review.trigger());
  await page.waitForTimeout(150);
  ck(
    (await messageIn(F('topstitchWidthMm'))) === '',
    'пустой отступ у края НЕ отвергается — сервер его принимает, и форма с ним не спорит',
    await messageIn(F('topstitchWidthMm')),
  );
  const wBare = await wire();
  ck(
    wBare?.topstitch?.mode === TS.EDGE && !wBare?.topstitch?.widthMm,
    'на провод: EDGE и НИ ОДНОГО числа',
    JSON.stringify(wBare?.topstitch ?? null),
  );
  const rBare = await sheetRow();
  ck(
    /topstitch at the edge/i.test(rBare?.seam ?? ''),
    'лист: «topstitch at the edge» — пустое поле это ОТВЕТ, а не пропуск',
    rBare?.seam ?? '',
  );

  // ── КРАЙ С ЧИСЛОМ: ТОТ ЖЕ ТОКЕН, но число доезжает и возвращается ────────────────────────────
  ck(await typeInto(F('topstitchWidthMm'), '6'), 'отступ набран числом в живой контрол');
  ck(!(await hintShown()), 'при набранном числе подсказка про пустоту снята — состояния этого нет');
  const wNum = await wire();
  ck(
    wNum?.topstitch?.mode === TS.EDGE,
    'на провод: ТОТ ЖЕ EDGE — второго написания у края нет',
    JSON.stringify(wNum?.topstitch ?? null),
  );
  ck(
    wNum?.topstitch?.widthMm?.value === '6',
    'и число уехало ВМЕСТЕ с ним',
    JSON.stringify(wNum?.topstitch ?? null),
  );
  const rNum = await sheetRow();
  ck(/6 mm from the edge/i.test(rNum?.seam ?? ''), 'лист: «6 mm from the edge»', rNum?.seam ?? '');
  ck(
    (rBare?.seam ?? '') !== (rNum?.seam ?? ''),
    'край с числом и без дали РАЗНЫЕ строки листа',
    `${rBare?.seam ?? ''} | ${rNum?.seam ?? ''}`,
  );

  // КРУГ «ЗАГРУЗИЛ → СОХРАНИЛ»: мимо редактора число у края тоже не теряется.
  const rt = await roundTrip({ ...STEP, topstitchMode: TS.EDGE, topstitchWidthMm: '6', topstitchRows: 2 });
  ck(rt.wire?.topstitch?.mode === TS.EDGE, 'круг: на проводе EDGE', JSON.stringify(rt.wire?.topstitch ?? null));
  ck(rt.wire?.topstitch?.widthMm?.value === '6', 'круг: число на проводе', JSON.stringify(rt.wire?.topstitch ?? null));
  ck(
    rt.back?.topstitchMode === TS.EDGE && rt.back?.topstitchWidthMm === '6',
    'круг: и то и другое вернулось в форму',
    `${rt.back?.topstitchMode} / ${rt.back?.topstitchWidthMm}`,
  );

  // ── ПАРАЛЛЕЛЬ: та же величина, ДРУГАЯ линия, и число ОБЯЗАТЕЛЬНО ─────────────────────────────
  ck(await pick(F('topstitchMode'), 'parallel to the seam'), 'режим переключён на «parallel to the seam»');
  const lblSeam = await labelOf(F('topstitchWidthMm'));
  ck(/from the seam line/i.test(lblSeam), 'подпись переехала на ЛИНИЮ ШВА', lblSeam);
  ck(!/from the edge/i.test(lblSeam), 'и про край больше не говорит', lblSeam);
  ck(lblEdge !== lblSeam, 'ПОДПИСЬ ИЗМЕНИЛАСЬ вместе с режимом', `${lblEdge} → ${lblSeam}`);
  ck(!(await hintShown()), 'у параллели пустое поле НЕ ответ — подсказки про пустоту нет');
  const vKeep = await values();
  ck(vKeep.topstitchWidthMm === '6', 'число пережило смену режима — оба режима его несут', String(vKeep.topstitchWidthMm));
  const rSeam = await sheetRow();
  ck(/6 mm from the seam line/i.test(rSeam?.seam ?? ''), 'лист: «6 mm from the seam line»', rSeam?.seam ?? '');
  ck(!/from the edge/i.test(rSeam?.seam ?? ''), 'лист БОЛЬШЕ НЕ зовёт край при отсчёте от шва', rSeam?.seam ?? '');
  ck(
    (rNum?.seam ?? '') !== (rSeam?.seam ?? ''),
    'два числовых режима дали ДВЕ РАЗНЫЕ строки листа, а не одно «from edge»',
    `${rNum?.seam ?? ''} | ${rSeam?.seam ?? ''}`,
  );

  // ПАРА «ОТКАЗ → НЕТ ОТКАЗА» НА ОДНОМ СМОНТИРОВАННОМ ШАГЕ: без неё «не отвергается» одинаково
  // правдиво и когда правило работает, и когда его нет вовсе.
  ck(await typeInto(F('topstitchWidthMm'), ''), 'отступ стёрт');
  await page.evaluate(() => window.__review.trigger());
  await page.waitForTimeout(150);
  const msgSeam = await messageIn(F('topstitchWidthMm'));
  ck(/from the seam line/i.test(msgSeam), 'у параллели пустой отступ ОТВЕРГНУТ, и отказ называет линию', msgSeam);
  ck(await pick(F('topstitchMode'), 'at the edge'), 'режим возвращён на край — поле по-прежнему пусто');
  await page.evaluate(() => window.__review.trigger());
  await page.waitForTimeout(150);
  ck(
    (await messageIn(F('topstitchWidthMm'))) === '',
    'у КРАЯ то же пустое поле отказа НЕ вызывает',
    await messageIn(F('topstitchWidthMm')),
  );

  // ── В ШОВ: ЧИСЛА НЕТ ВООБЩЕ ─────────────────────────────────────────────────────────────────
  ck(await typeInto(F('topstitchWidthMm'), '4'), 'у края снова набрано число');
  ck(await pick(F('topstitchMode'), 'in the ditch'), 'режим переключён на «in the ditch»');
  ck(!(await has(F('topstitchWidthMm'))), 'у «in the ditch» контрола отступа НЕТ');
  const vDitch = await values();
  ck(vDitch.topstitchWidthMm === '', 'и число ОЧИЩЕНО, а не оставлено невидимым', JSON.stringify(vDitch.topstitchWidthMm));
  const wDitch = await wire();
  ck(
    wDitch?.topstitch?.mode === TS.DITCH && !wDitch?.topstitch?.widthMm,
    'на провод: IN_DITCH и никакого числа',
    JSON.stringify(wDitch?.topstitch ?? null),
  );
  const rDitch = await sheetRow();
  ck(/topstitch in the ditch/i.test(rDitch?.seam ?? ''), 'лист называет и режим БЕЗ числа', rDitch?.seam ?? '');
  ck(await pick(F('topstitchMode'), 'at the edge'), 'режим снова край');
  ck(await has(F('topstitchWidthMm')), 'контрол отступа снова ЕСТЬ — пара «есть → нет → есть» замкнута');

  // ── ТРИ ПРАВИЛА ОДНОЙ ТАБЛИЦЕЙ, мимо редактора: шаг, пришедший с провода, чинится там же ─────
  const refuses = async (op) => {
    const issues = await validate({ ...STEP, ...op });
    return issues.filter((i) => i.path.endsWith('topstitchWidthMm')).map((i) => i.message);
  };
  ck((await refuses({ topstitchMode: TS.EDGE, topstitchWidthMm: '' })).length === 0, 'zod: край без числа — можно');
  ck((await refuses({ topstitchMode: TS.EDGE, topstitchWidthMm: '6' })).length === 0, 'zod: край с числом — можно');
  const parBare = await refuses({ topstitchMode: TS.PARALLEL, topstitchWidthMm: '' });
  ck(parBare.length === 1, 'zod: параллель без числа — НЕЛЬЗЯ', parBare.join(' | '));
  ck(/the seam line/i.test(parBare[0] ?? ''), 'и отказ называет ту же линию, что подпись', parBare[0] ?? '—');
  const ditchNum = await refuses({ topstitchMode: TS.DITCH, topstitchWidthMm: '6' });
  ck(ditchNum.length === 1, 'zod: число в шов — НЕЛЬЗЯ', ditchNum.join(' | '));

  // ── СНЯТЫЙ РЕЖИМ НЕ ПИШЕТСЯ И НЕ ПРЕДЛАГАЕТСЯ ───────────────────────────────────────────────
  // Ни один из проездов выше не выдал `WIDTH` — а он и не мог: пункта нет. Обратная половина —
  // запись, которая его уже несёт: пикер обязан не онеметь (пустой триггер читается как «отстрочки
  // нет» на шаге, где она есть, а редактор пишет форму обратно при сохранении), и пунктом приёма
  // снятый токен всё равно не становится. После бампа прото член исчезнет из типов и попадёт сюда
  // же — как токен, о котором бандл не слышал; проба от этого не изменится.
  const seen = [wBare, wNum, wDitch, rt.wire].map((w) => w?.topstitch?.mode ?? '');
  ck(!seen.includes(TS.RETIRED), 'снятый WIDTH не уехал на провод НИ РАЗУ', seen.join(' '));
  await mount({ ...STEP, topstitchMode: TS.RETIRED, topstitchWidthMm: '6' });
  const trigRetired = ((await page.locator(`${F('topstitchMode')} button`).first().textContent()) ?? '').trim();
  ck(trigRetired !== '', 'запись со снятым режимом НЕ онемела в пикере', trigRetired);
  ck(/unknown to this app version/i.test(trigRetired), 'и подписана как неизвестная этой версии', trigRetired);
  const retiredList = await optionsOf(F('topstitchMode'));
  ck(
    !(retiredList ?? []).some((s) => /^at width from the edge$/i.test(s)),
    'ПРИЁМОМ «at width from the edge» он не предлагается даже здесь',
    JSON.stringify(retiredList),
  );
  ck(
    (retiredList ?? [])
      .filter((s) => /width/i.test(s))
      .every((s) => /unknown to this app version/i.test(s)),
    'единственное упоминание снятого токена — пометка «неизвестен этой версии», а не пункт списка',
    JSON.stringify(retiredList),
  );
  ck(
    (retiredList ?? []).length === (modes ?? []).length + 1,
    'предложенных приёмов по-прежнему три — добавилось РОВНО то, что лежит в записи',
    `${(modes ?? []).length} → ${(retiredList ?? []).length}`,
  );

  // ── СОСЕДИ ПО ТОЙ ЖЕ БОЛЕЗНИ: КАЛИБР И ШАГ МЕЖДУ РЯДАМИ ──────────────────────────────────────
  head('5b. соседи: «между иглами» и «между рядами строчек» — на экране и на листе');
  await mount({
    operationType: T.MACHINE,
    machineType: T.LOCKSTITCH,
    zone: T.ZONE,
    needleCount: 2,
    needleGaugeMm: '6.4',
    rowSpacingMm: '6',
  });
  const lblGauge = await labelOf(F('needleGaugeMm'));
  const lblRows = await labelOf(F('rowSpacingMm'));
  ck(/between needles/i.test(lblGauge), 'калибр говорит «между иглами»', lblGauge);
  ck(/between stitch rows/i.test(lblRows), 'шаг говорит «между рядами строчек»', lblRows);
  ck(!/^needle gauge, mm$/i.test(lblGauge), 'и это уже не «needle gauge, mm»', lblGauge);
  ck(!/^row spacing, mm$/i.test(lblRows), 'и это уже не «row spacing, mm»', lblRows);
  const rowNeedles = await sheetRow();
  ck(
    /2 needles, 6\.4 mm apart/i.test(rowNeedles?.machineMode ?? ''),
    'лист: «2 needles, 6.4 mm apart» — миллиметры сказали, что они меряют',
    rowNeedles?.machineMode ?? '',
  );
  ck(
    /stitch rows 6 mm apart/i.test(rowNeedles?.seam ?? ''),
    'лист: «stitch rows 6 mm apart» — не голое «rows»',
    rowNeedles?.seam ?? '',
  );

  ck(pageErrors.length === 0, 'ни одного исключения за весь прогон', pageErrors.join(' | ').slice(0, 200));

  await browser.close();
  return { bad, log };
}

if (MUTANT === null) {
  const { bad, log } = await run(await bundleWith(0));
  console.log(log.join('\n'));
  console.log(bad === 0 ? '\nвсё сошлось' : `\nрасхождений: ${bad}`);
  process.exit(bad === 0 ? 0 : 1);
}

const ids = MUTANT ? [MUTANT] : Object.keys(MUTATIONS).map(Number);
let escaped = 0;
for (const id of ids) {
  const { bad, log } = await run(await bundleWith(id));
  const ok = bad > 0;
  if (!ok) escaped++;
  console.log(
    `\n=== мутация ${id} — ${MUTATIONS[id].what}\n${ok ? `поймана: расхождений ${bad}` : 'ПРОШЛА ЗЕЛЁНОЙ — проверка ничего не держит'}`,
  );
  if (!ok) console.log(log.join('\n'));
  else console.log(log.filter((l) => l.startsWith('  FAIL')).join('\n'));
}
process.exit(escaped === 0 ? 0 : 1);
