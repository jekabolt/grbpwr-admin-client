#!/usr/bin/env node
// ДВА ХВОСТА ВОЛНЫ ВИДОВ ОПЕРАЦИЙ — ЖИВОЙ АРХИВ РЕЛИЗОВ И ЖИВОЙ РЕДАКТОР ШАГА.
//
//   1. ЗАМОРОЖЕННЫЙ РЕЛИЗ ПЕЧАТАЛ ПОДПИСЬ ПИКЕРА ВМЕСТО ПОД-ГЛАГОЛА. Ветка ВТО в
//      `releases-field.tsx` была единственной, не звавшей ни одного составителя фактов: архив
//      показывал `press (to one side / steam)` — подпись ТИПА, обещающую «на одну сторону» и не
//      умеющую сказать какую, — а приёма (приутюжить / заутюжить на сторону / отпарить / финишное)
//      не показывал вовсе. На печатном листе то же самое починено коммитом 04e4c748; здесь дороже:
//      лист перепечатывают, подписанную ревизию задним числом не чинят.
//
//   2. КЛИЕНТ НЕ ОТВЕРГАЛ ЗАМЕТКУ О НАТЯЖЕНИИ НА СВАРКЕ. Сервер отвергает `thread_tension_note` на
//      `seam_taping` / `ultrasonic_welder` тем же списком `firstPopulated`, что и остальные
//      ниточно-игольные поля, — а `refuseAtWeld` его пропускал: пара «шкала + заметка» отвергалась
//      наполовину, шкалу называл zod на контроле, заметку — сервер тостом после сохранения.
//
// ПОЧЕМУ СТЕНД УСТРОЕН ИМЕННО ТАК:
//  · снапшот собирается НАСТОЯЩИМ маппером записи (`mapFormToTechCardInsert`) и отдаётся архиву
//    ЧЕРЕЗ СЕТЬ, которую архив зовёт сам, — проба, зовущая `SnapshotOperations` напрямую, не
//    увидела бы, что читается именно замороженный блоб, а зовущая составитель фактов зеленела бы
//    при ровно том дефекте, который чинится (составитель был цел, его не звали);
//  · отказ на сварке проверяется НА СМОНТИРОВАННОМ ШАГЕ и требует, чтобы контрол с текстом БЫЛ НА
//    ЭКРАНЕ в тот же момент: отказ на невидимом месте карточку не спасает, а хоронит.
//
// ЛОВУШКИ СТЕНДА, КАЖДАЯ УЖЕ ДАВАЛА ЛОЖНУЮ ЗЕЛЕНЬ (см. соседний opkinds-review-probe.mjs):
//  · «поля нет» одинаково правдиво и когда правило работает, и когда экран не отрисовался —
//    поэтому каждое «нет» стоит в паре «нет → переключили → есть → вернули → нет»;
//  · Radix НЕ зовёт onValueChange на уже выбранном пункте — перед целевым выбирается соседний;
//  · подпись со скобками («press (to one side / steam)»), попав в `new RegExp` как есть, матчится
//    без них и находит что угодно — текст экранируется;
//  · склейка соседних узлов в textContent подтверждает наличие там, где органа нет — строка спеки
//    читается ОДНИМ листовым узлом, и проба требует, чтобы такой узел был РОВНО ОДИН.
//
//   node scripts/opkinds-tails-probe.mjs             прогон
//   node scripts/opkinds-tails-probe.mjs --mutate=N  ломает В БАНДЛЕ починку N (1..2), репозиторий
//                                                    не трогается; проба обязана покраснеть
//   node scripts/opkinds-tails-probe.mjs --mutate    то же по очереди для обеих
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
    what: 'починка 1: архив релизов снова не зовёт составитель ВТО-фактов',
    file: /releases-field\.tsx$/,
    from: '                stepPressText({ press: o.press }),\n',
    to: '',
  },
  2: {
    what: 'починка 2: zod снова не отвергает заметку о натяжении на сварочной машине',
    file: /schema\.ts$/,
    from: "      refuseAtWeld(stepTextSet(o.threadTensionNote), 'threadTensionNote', 'thread to tension');\n",
    to: '',
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
  const outfile = resolve(tmpdir(), `opkinds-tails-${process.pid}-${mutantId ?? 0}.js`);
  const m = mutantId ? MUTATIONS[mutantId] : null;
  if (mutantId && !m) throw new Error(`мутации ${mutantId} нет`);
  const plugin = m && {
    name: 'tails-mutation',
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
    entryPoints: [resolve(HERE, 'opkinds-tails-entry.tsx')],
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
  PRINT: 'TECH_CARD_OPERATION_TYPE_PRINT',
  ZONE: 'TECH_CARD_GARMENT_ZONE_FRONT',
  IRON: 'TECH_CARD_PRESS_EQUIPMENT_IRON',
  ONE_SIDE: 'TECH_CARD_PRESS_ACTION_TO_ONE_SIDE',
  FLAT: 'TECH_CARD_PRESS_ACTION_PRESS_FLAT',
  STEAM: 'TECH_CARD_PRESS_ACTION_STEAM',
  FINAL: 'TECH_CARD_PRESS_ACTION_FINAL',
  TOWARD_FRONT: 'TECH_CARD_PRESS_TOWARD_FRONT',
  LOCKSTITCH: 'TECH_CARD_MACHINE_TYPE_LOCKSTITCH',
  ULTRASONIC: 'TECH_CARD_MACHINE_TYPE_ULTRASONIC_WELDER',
  TIGHTER: 'TECH_CARD_THREAD_TENSION_TIGHTER',
  TRANSFER: 'TECH_CARD_PRINT_METHOD_HEAT_TRANSFER',
};

const TYPE_LABEL_PRESS = 'press (to one side / steam)';
const NOTE = '0.5 tighter, dial 4';

async function run(bundle) {
  let bad = 0;
  const log = [];
  const ck = (ok, what, d = '') => {
    if (!ok) bad++;
    log.push(`${ok ? '  ok  ' : '  FAIL'} ${what}${d ? `  — ${d}` : ''}`);
  };
  const head = (s) => log.push(`\n${s}`);

  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1500, height: 4200 } });
  const pageErrors = [];
  page.on('pageerror', (e) => pageErrors.push(String(e)));
  await page.route('http://probe.local/**', (route) =>
    route.fulfill({ status: 200, contentType: 'text/html', body: '<div id="root"></div>' }),
  );

  // СЕТЬ АРХИВА — НАСТОЯЩАЯ: `ReleasesField` сам зовёт список ревизий и снапшот выбранной, а
  // отвечает на них маршрут пробы. Блоб — тот, что собрал НАСТОЯЩИЙ маппер записи (см. ниже);
  // остальные запросы страницы (аккаунт, права, словарь) отвечают пустым телом, ровно как на
  // карточке, у которой их ещё не загрузили.
  let snapshot = null;
  let revision = 0;
  const meta = () => ({
    id: revision,
    techCardId: 1,
    releaseNumber: revision,
    releasedBy: 'probe',
    createdAt: '2026-08-21T09:00:00Z',
  });
  await page.route('http://stub.invalid/**', (route) => {
    const url = route.request().url();
    const json = /\/releases$/.test(url)
      ? { releases: [meta()] }
      : /\/tech-card\/release\/\d+$/.test(url)
        ? { release: meta(), snapshot: { id: revision, techCard: snapshot } }
        : {};
    return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(json) });
  });

  const F = (name) => `[data-field="operations.0.${name}"]`;
  const has = async (sel) => (await page.locator(sel).count()) > 0;
  const escapeRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

  async function load() {
    await page.goto('http://probe.local/');
    await page.addScriptTag({ content: bundle });
    await page.waitForFunction(() => !!window.__tails, { timeout: 15000 });
  }

  async function mount(op) {
    await page.evaluate((o) => window.__tails.mount(o), op);
    await page.waitForSelector(F('operationType'), { timeout: 15000 });
    // Эффект очистки скрытого — это эффект: он стреляет ПОСЛЕ коммита, и читать форму сразу после
    // появления контролов значило бы иногда успевать до него.
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
  const trigger = async () => {
    await page.evaluate(() => window.__tails.trigger());
    await page.waitForTimeout(150);
  };
  const messageIn = async (sel) => {
    const n = page.locator(`${sel} [id$="-form-item-message"]`);
    return (await n.count()) ? ((await n.first().textContent()) ?? '').trim() : '';
  };
  const validate = (op) => page.evaluate((o) => window.__tails.validate(o), op);

  // СТРОКА СПЕКИ ЗАМОРОЖЕННОГО ШАГА — ОДНИМ ЛИСТОВЫМ УЗЛОМ. Она рисуется вторым `Text` внутри
  // подписи строки («заголовок — спека»), то есть отдельным нано-спаном БЕЗ детей-элементов; читать
  // textContent строки целиком значило бы склеить её с заголовком и получить зелень на склейке.
  // Проба требует, чтобы таких узлов был РОВНО ОДИН: два — и «нашли не тот» становится молчаливым.
  async function releaseSpec(op) {
    snapshot = await page.evaluate((o) => window.__tails.insert(o), op);
    revision += 1;
    await page.evaluate(() => window.__tails.release());
    await page.waitForFunction(
      () => /operations \(frozen\)/i.test(document.getElementById('release')?.textContent ?? ''),
      { timeout: 15000 },
    );
    return page.evaluate(() => {
      const host = document.getElementById('release');
      const leaves = [...host.querySelectorAll('span.text-nano.text-labelColor')]
        .filter((n) => n.children.length === 0)
        .map((n) => (n.textContent ?? '').replace(/\s+/g, ' ').trim())
        .filter((t) => t.startsWith('—') && t.length > 2);
      return { count: leaves.length, text: (leaves[0] ?? '').replace(/^—\s*/, '') };
    });
  }

  await load();

  // ── 1. ЗАМОРОЖЕННЫЙ ВТО-ШАГ ПЕЧАТАЕТ ПОД-ГЛАГОЛ И НАПРАВЛЕНИЕ ─────────────────────────────────
  head('1. архив релизов: под-глагол ВТО и направление припуска ЧИТАЮТСЯ с подписанного снапшота');
  const one = await releaseSpec({
    operationType: T.PRESS,
    zone: T.ZONE,
    pressEquipment: T.IRON,
    pressAction: T.ONE_SIDE,
    pressToward: T.TOWARD_FRONT,
  });
  ck(pageErrors.length === 0, 'архив смонтировался без исключений', pageErrors[0] ?? '');
  ck(one.count === 1, 'строка спеки в архиве РОВНО ОДНА — читаем именно её', String(one.count));
  ck(/press to one side/i.test(one.text), 'приём НАПЕЧАТАН', one.text);
  ck(/toward the front/i.test(one.text), 'направление НАПЕЧАТАНО той же фразой', one.text);
  ck(
    /iron \(pressing table\)/i.test(one.text),
    'имя оборудования осталось на месте — приём его не вытеснил',
    one.text,
  );
  ck(
    one.text.indexOf('press to one side') < one.text.indexOf('iron'),
    'что делают — раньше, на чём — позже (то же правило, что на листе)',
    one.text,
  );
  ck(
    !new RegExp(escapeRe(TYPE_LABEL_PRESS), 'i').test(one.text),
    'подпись ТИПА больше не пересказывает названный приём худшими словами',
    one.text,
  );

  // ЧЕТЫРЕ РАЗНЫХ ПРИЁМА — ЧЕТЫРЕ РАЗНЫЕ СТРОКИ. Одинаковое слово на всех и было дефектом:
  // проверка «строка не пуста» его бы не поймала.
  const printed = new Map();
  for (const [token, word] of [
    [T.FLAT, 'press flat'],
    [T.STEAM, 'steam'],
    [T.FINAL, 'final press'],
    [T.ONE_SIDE, 'press to one side'],
  ]) {
    const r = await releaseSpec({
      operationType: T.PRESS,
      zone: T.ZONE,
      pressEquipment: T.IRON,
      pressAction: token,
    });
    printed.set(word, r.text);
    ck(r.text.toLowerCase().includes(word), `«${word}» напечатан замороженным релизом`, r.text);
  }
  ck(
    new Set(printed.values()).size === printed.size,
    'четыре приёма дали ЧЕТЫРЕ РАЗНЫЕ строки, а не одно слово «press»',
    [...printed.values()].join(' | '),
  );

  // РЕЛИЗ, ПОДПИСАННЫЙ ДО ВОЛНЫ, НЕ ЗАМОЛКАЕТ: под-глагола у него нет, и подпись типа — всё, что о
  // шаге было записано. Фолбэк обязан пережить починку.
  const preWave = await releaseSpec({ operationType: T.PRESS, zone: T.ZONE });
  ck(
    preWave.text === TYPE_LABEL_PRESS,
    'у релиза БЕЗ под-глагола и без оборудования подпись типа осталась',
    preWave.text,
  );

  // И СОСЕДНЕЕ СЕМЕЙСТВО ВОЛНЫ НЕ СЛОМАНО: дискриминатор печати архив звал и до починки, зовёт и
  // после — правка ВТО-ветки чужую ветку не задела.
  const print = await releaseSpec({
    operationType: T.PRINT,
    zone: T.ZONE,
    printMethod: T.TRANSFER,
  });
  ck(/transfer/i.test(print.text), 'дискриминатор печати по-прежнему печатается', print.text);

  // ── 2. СВАРОЧНАЯ МАШИНА: ЗАМЕТКА О НАТЯЖЕНИИ ОТВЕРГАЕТСЯ НА ВИДИМОМ КОНТРОЛЕ ──────────────────
  head('2. ультразвук: заметка о натяжении отвергается там, где её видно');
  await mount({
    operationType: T.MACHINE,
    machineType: T.LOCKSTITCH,
    zone: T.ZONE,
    threadTension: T.TIGHTER,
    threadTensionNote: NOTE,
  });
  // ШКАЛА ЗАДАНА ВМЕСТЕ С ЗАМЕТКОЙ НАРОЧНО: заметка БЕЗ шкалы отвергается ДРУГИМ правилом («сначала
  // назови натяжение»), и на нём проба зеленела бы под неработающей починкой.
  ck(await has(F('threadTensionNote')), 'на ниточной машине контрол заметки есть');
  await trigger();
  ck(
    (await messageIn(F('threadTensionNote'))) === '',
    'на ниточной машине пара «шкала + заметка» законна',
    await messageIn(F('threadTensionNote')),
  );

  ck(await pick(F('machineType'), 'ultrasonic welder'), 'машинка переключена на ультразвук');
  const vWeld = await page.evaluate(() => window.__tails.values());
  ck(vWeld.threadTensionNote === NOTE, 'заметка ПЕРЕЖИЛА переключение — она и есть теневое значение', String(vWeld.threadTensionNote));
  // ГЛАВНОЕ УТВЕРЖДЕНИЕ ПОЧИНКИ: контрол НА ЭКРАНЕ в тот самый момент, когда отказ на него встаёт.
  ck(await has(F('threadTensionNote')), 'на сварке контрол заметки ВИДЕН — отказу есть куда встать');
  await trigger();
  const weldMsg = await messageIn(F('threadTensionNote'));
  ck(weldMsg !== '', 'отказ ВСТАЛ на контроле заметки', weldMsg || '(пусто)');
  ck(
    /welding machine has no thread/i.test(weldMsg),
    'и это отказ ИМЕННО сварки, а не правило «сначала назови натяжение»',
    weldMsg || '(пусто)',
  );
  ck(
    /welding machine has no thread/i.test(await messageIn(F('threadTension'))),
    'шкала рядом отвергнута тем же правилом — пара названа целиком',
    await messageIn(F('threadTension')),
  );

  // ПАРА «ЕСТЬ → НЕТ» НА ТОМ ЖЕ СМОНТИРОВАННОМ ШАГЕ: отказ снимается возвратом на ниточную машину,
  // а не остаётся навсегда.
  ck(await pick(F('machineType'), 'lockstitch 301'), 'машинка возвращена на ниточную');
  await trigger();
  ck(
    (await messageIn(F('threadTensionNote'))) === '',
    'отказ СНЯТ вместе со сварочной машиной',
    await messageIn(F('threadTensionNote')),
  );

  // И ШАГ, ПРИШЕДШИЙ С ПРОВОДА МИМО РЕДАКТОРА, — тем же правилом и тем же путём.
  const issues = await validate({
    operationType: T.MACHINE,
    machineType: T.ULTRASONIC,
    zone: T.ZONE,
    threadTension: T.TIGHTER,
    threadTensionNote: NOTE,
  });
  const noteIssue = issues.find((i) => i.path.endsWith('threadTensionNote'));
  ck(!!noteIssue, 'zod отвергает заметку на сварке', issues.map((i) => i.path).join(' '));
  ck(
    /welding machine has no thread/i.test(noteIssue?.message ?? ''),
    'текст отказа называет причину словами цеха',
    noteIssue?.message ?? '—',
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
