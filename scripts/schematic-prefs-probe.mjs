#!/usr/bin/env node
// ОСЬ ПОЛКИ ОБЯЗАНА ПЕРЕЖИТЬ ПЕРЕТАСКИВАНИЕ УЗЛА.
//
// Дефект, ради которого написана проба. `use-schematic-prefs` пересобирал хранимую запись РУКАМИ в
// каждом писателе (`read`, `move`, `reset`, `setMode`), и каждый из них знал ровно те поля, что
// существовали в день его написания. Любое поле, добавленное позже, стирается первым же чужим
// вызовом: человек переключает группировку полки на ткани, двигает один узел — и запись уходит в
// localStorage без `axis`. Ось возвращается к дефолту при следующем открытии карточки, а связь
// между «подвинул узел» и «сбросилась группировка» с места не видна вовсе: между причиной и
// следствием стоит перезагрузка страницы.
//
// Починка — не внимательность, а МЕХАНИЗМ: запись рождается ровно в одной чистой функции
// `buildStored(cur, patch)`, писатели дают ей только свой патч, остальные поля она берёт из
// текущего состояния. Поэтому проба стоит на трёх ногах:
//
//   СЕМАНТИКА  — builder и `parseStored` гоняются на строках JSON, как настоящее хранилище: смена
//                оси, драг, смена режима, сброс, старая запись без `axis`, мусор в поле.
//   СТРУКТУРА  — исходник хука читается текстом и проверяется на то, что другой дороги в хранилище
//                НЕТ: в теле хука не осталось ни литерала `v: 1`, ни `schedule({…})`, а каждый
//                писатель передаёт `commit` ровно своё поле. Без этой половины проба зелёная и на
//                коде, где `move` снова собирает объект сам, — то есть ровно на исходном дефекте.
//   ЖИВОЙ ХУК  — тот же сценарий прогоняется НАСТОЯЩИМ хуком в настоящем браузере: React, реальный
//                localStorage, реальный дебаунс 400ms, размонтирование как перезагрузка страницы.
//                Первые две ноги — модель и текст, а этот дефект в своё время прошёл и модель, и
//                чтение диффа; здесь он умирает от измерения. Проверено: с писателем, собирающим
//                запись руками, эта половина краснеет семью проверками из семнадцати.
//
// Playwright не в зависимостях проекта — третья нога ищет его в кэше npx и МОЛЧА ПРОПУСКАЕТСЯ,
// если не нашла: гейт, который нельзя выполнить, не должен красить сборку в красный. Две первые
// ноги при этом остаются, и канонический дефект ловит структурная.
//
// ЧЕГО ПРОБА НЕ ДОКАЗЫВАЕТ, и это не оговорка, а список для ревью диффа: жестов полотна тут нет —
// `move` зовётся напрямую, а не мышью по ноде; не проверяются ни hit-test, ни автоскролл, ни то,
// что орган переключения оси вообще выведен на экран. Проверяются ПИСАТЕЛИ предпочтений, и только.
//
//   node scripts/schematic-prefs-probe.mjs

import { build } from 'esbuild';
import { createRequire } from 'node:module';
import { execFileSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, resolve } from 'node:path';
import { existsSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { homedir, tmpdir } from 'node:os';

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, '..');
const SRC = resolve(root, 'src/components/managers/tech-card/components/use-schematic-prefs.ts');
const entry = resolve(root, 'scripts/schematic-prefs-probe-entry.ts');

const outfile = resolve(tmpdir(), `schematic-prefs-${process.pid}.mjs`);
await build({
  entryPoints: [entry],
  bundle: true,
  format: 'esm',
  platform: 'node',
  absWorkingDir: root,
  outfile,
  logLevel: 'silent',
  define: { 'process.env.NODE_ENV': '"production"' },
});
const { buildStored, parseStored } = await import(pathToFileURL(outfile).href);

let checks = 0;
const failed = new Set();
const fail = (name, msg) => {
  failed.add(name);
  console.log(`FAIL  ${name}\n      ${msg}`);
};
const j = (v) => JSON.stringify(v);
const is = (name, got, want) => {
  checks++;
  if (j(got) !== j(want)) fail(name, `${j(got)} ≠ ${j(want)}`);
};
const ok = (name, cond, msg) => {
  checks++;
  if (!cond) fail(name, msg);
};

// --- модель одной вкладки ------------------------------------------------------------------------
//
// `cell` — то самое, чем localStorage является на самом деле: одна строка. `session` — время жизни
// смонтированного хука: читает строку при старте, держит полное состояние и патчит его писателями.
// Перезагрузка страницы = новая сессия над той же строкой.

const cell = (raw = null) => ({ raw });
const load = (c) => parseStored(c.raw);

function session(c) {
  const s = load(c);
  let cur = { mode: s.mode, pos: s.pos, axis: s.axis };
  const commit = (patch) => {
    const next = buildStored(cur, patch);
    cur = { mode: next.mode, pos: next.pos, axis: next.axis };
    c.raw = JSON.stringify(next);
    return next;
  };
  return {
    // Патчи — дословно те, что стоят у писателей хука; за дословностью следит структурная половина.
    move: (key, at) => commit({ pos: { ...cur.pos, [key]: at } }),
    reset: () => commit({ pos: {} }),
    setMode: (m) => commit({ mode: m }),
    setAxis: (a) => commit({ axis: a }),
    state: () => cur,
  };
}

const P = { SHELL: { x: 120, y: 40 }, HOOD: { x: 300, y: 40 } };

// --- разбор исходника ----------------------------------------------------------------------------
//
// Регулярка тут не годится: у патча `{ pos: {} }` фигурные скобки вложены, и любое `[^}]*` режет
// вызов посередине — проверка молча становится тождеством. Поэтому скобки считаются честно.

/** Тела всех вызовов `commit({…})` без внешних скобок, в порядке появления. */
function* commitPatches(code) {
  const CALL = 'commit({';
  for (let i = code.indexOf(CALL); i >= 0; i = code.indexOf(CALL, i + 1)) {
    let depth = 0;
    for (let k = i + CALL.length - 1; k < code.length; k++) {
      if (code[k] === '{') depth++;
      else if (code[k] === '}' && --depth === 0) {
        yield code.slice(i + CALL.length, k).trim();
        break;
      }
    }
  }
}

/** Имена полей объектного литерала на верхнем уровне (вложенные объекты не в счёт). */
function topLevelKeys(body) {
  return splitTop(body).map((part) => {
    const m = /^\s*([A-Za-z_$][\w$]*)\s*:/.exec(part);
    return m ? m[1] : part.trim(); // без двоеточия — сокращённая запись `{ pos }`
  });
}

/** Разрезать тело литерала запятыми ВЕРХНЕГО уровня. */
function splitTop(body) {
  const out = [];
  let depth = 0;
  let start = 0;
  for (let i = 0; i < body.length; i++) {
    const c = body[i];
    if (c === '{' || c === '[' || c === '(') depth++;
    else if (c === '}' || c === ']' || c === ')') depth--;
    else if (c === ',' && depth === 0) {
      out.push(body.slice(start, i));
      start = i + 1;
    }
  }
  out.push(body.slice(start));
  return out.filter((s) => s.trim());
}

// --- 1. ось переживает драг ----------------------------------------------------------------------

{
  const name = 'ось пережила драг узла в той же сессии';
  const c = cell();
  const s = session(c);
  s.setMode('schematic');
  s.setAxis('cloth');
  s.move('SHELL', P.SHELL);
  const after = load(c);
  is(name, after.axis, 'cloth');
  is(name + ' (позиция записана)', after.pos, { SHELL: P.SHELL });
  is(name + ' (режим на месте)', after.mode, 'schematic');
}

{
  // Настоящий сценарий дефекта: ось переключили вчера, сегодня открыли карточку и подвинули узел.
  // Писатель `move` в новой сессии ничего не знает про ось — и обязан её сохранить.
  const name = 'ось пережила драг в СЛЕДУЮЩЕЙ сессии (перезагрузка между)';
  const c = cell();
  session(c).setAxis('cloth');
  const s2 = session(c);
  is(name + ' (прочиталась при старте)', s2.state().axis, 'cloth');
  s2.move('HOOD', P.HOOD);
  is(name, load(c).axis, 'cloth');
  // И третья сессия — драг не «донашивает» ось до первой записи, а переносит её каждый раз.
  const s3 = session(c);
  s3.move('SHELL', P.SHELL);
  is(name + ' (и через две перезагрузки)', load(c).axis, 'cloth');
  is(name + ' (обе позиции целы)', load(c).pos, { HOOD: P.HOOD, SHELL: P.SHELL });
}

// --- 2. смена режима не трогает ось --------------------------------------------------------------

{
  const name = 'setMode не стирает ось';
  const c = cell();
  const s = session(c);
  s.setAxis('cloth');
  s.move('SHELL', P.SHELL);
  s.setMode('list');
  const after = load(c);
  is(name, after.axis, 'cloth');
  is(name + ' (режим сменился)', after.mode, 'list');
  is(name + ' (позиции целы)', after.pos, { SHELL: P.SHELL });
}

{
  const name = 'setAxis не стирает режим и позиции';
  const c = cell();
  const s = session(c);
  s.setMode('schematic');
  s.move('SHELL', P.SHELL);
  s.setAxis('unit');
  const after = load(c);
  is(name, [after.mode, after.axis], ['schematic', 'unit']);
  is(name + ' (позиции целы)', after.pos, { SHELL: P.SHELL });
  // Ось перекладывается, а не дописывается: второе переключение видно в записи.
  s.setAxis('cloth');
  is(name + ' (переключается обратно)', load(c).axis, 'cloth');
}

// --- 3. сброс раскладки --------------------------------------------------------------------------

{
  // «Расставь заново» — про расстановку нод. Режим и ось — про то, КАК человек смотрит на карточку;
  // забыть их вместе с позициями значило бы наказать за нажатие соседней кнопки.
  const name = 'reset чистит позиции и не трогает ось и режим';
  const c = cell();
  const s = session(c);
  s.setMode('list');
  s.setAxis('cloth');
  s.move('SHELL', P.SHELL);
  s.move('HOOD', P.HOOD);
  s.reset();
  const after = load(c);
  is(name, after.pos, {});
  is(name + ' (ось жива)', after.axis, 'cloth');
  is(name + ' (режим жив)', after.mode, 'list');
  // И следующий драг после сброса всё ещё несёт ось.
  s.move('SHELL', P.SHELL);
  is(name + ' (драг после сброса)', load(c).axis, 'cloth');
}

// --- 4. back-compat: старая запись без axis ------------------------------------------------------

{
  const name = 'старая запись без axis читается';
  const old = { v: 1, mode: 'list', pos: { SHELL: { x: 10, y: 20 } } };
  const s = parseStored(JSON.stringify(old));
  is(name, s.axis, undefined);
  is(name + ' (версия не поднялась)', s.v, 1);
  is(name + ' (режим прочитан)', s.mode, 'list');
  is(name + ' (позиции прочитаны)', s.pos, { SHELL: { x: 10, y: 20 } });
  is(name + ' (ключа axis в записи нет вовсе)', Object.keys(s), ['v', 'mode', 'pos']);

  // Запись, прочитанная старым форматом, не обязана обрасти пустой осью при первом же драге.
  const c = cell(JSON.stringify(old));
  session(c).move('HOOD', P.HOOD);
  is(name + ' (драг не дописал пустую ось)', Object.keys(load(c)), ['v', 'mode', 'pos']);
  is(name + ' (старая позиция цела)', load(c).pos, { SHELL: { x: 10, y: 20 }, HOOD: P.HOOD });
}

// --- 5. мусор в хранилище ------------------------------------------------------------------------

{
  const name = 'мусорная ось отбрасывается при чтении';
  is(name, parseStored(j({ v: 1, pos: {}, axis: 'banana' })).axis, undefined);
  is(name + ' (число)', parseStored(j({ v: 1, pos: {}, axis: 7 })).axis, undefined);
  is(name + ' (null)', parseStored(j({ v: 1, pos: {}, axis: null })).axis, undefined);
  is(name + ' (объект)', parseStored(j({ v: 1, pos: {}, axis: { unit: true } })).axis, undefined);
  is(
    name + ' (обе законные оси проходят)',
    [
      parseStored(j({ v: 1, pos: {}, axis: 'unit' })).axis,
      parseStored(j({ v: 1, pos: {}, axis: 'cloth' })).axis,
    ],
    ['unit', 'cloth'],
  );
  is(
    name + ' (мусорный режим — тем же путём)',
    parseStored(j({ v: 1, pos: {}, mode: 'grid' })).mode,
    undefined,
  );
  // Испорченная ось не должна утаскивать за собой позиции: раскладка стоит дороже группировки.
  is(
    name + ' (позиции уцелели)',
    parseStored(j({ v: 1, pos: { SHELL: P.SHELL }, axis: 'banana' })).pos,
    {
      SHELL: P.SHELL,
    },
  );
}

{
  const name = 'битая строка и пустое хранилище — пустая запись';
  is(name + ' (нет ключа)', parseStored(null), { v: 1, pos: {} });
  is(name + ' (пустая строка)', parseStored(''), { v: 1, pos: {} });
  is(name + ' (не JSON)', parseStored('{не json'), { v: 1, pos: {} });
  is(name + ' (JSON, но не объект)', parseStored('42'), { v: 1, pos: {} });
  is(name + ' (нет pos)', parseStored(j({ v: 1, axis: 'cloth' })), {
    v: 1,
    pos: {},
    axis: 'cloth',
  });
  is(
    name + ' (кривая координата отброшена)',
    parseStored(j({ v: 1, pos: { A: { x: 'нет', y: 1 }, B: { x: 1, y: 2 } } })).pos,
    {
      B: { x: 1, y: 2 },
    },
  );
}

// --- 6. форма записи -----------------------------------------------------------------------------

{
  const name = 'форма записи — ровно {v, mode?, pos, axis?}';
  is(name + ' (пусто)', Object.keys(buildStored({ pos: {} })), ['v', 'pos']);
  is(name + ' (только режим)', Object.keys(buildStored({ pos: {}, mode: 'list' })), [
    'v',
    'mode',
    'pos',
  ]);
  is(name + ' (только ось)', Object.keys(buildStored({ pos: {}, axis: 'cloth' })), [
    'v',
    'pos',
    'axis',
  ]);
  is(name + ' (всё)', Object.keys(buildStored({ pos: {}, mode: 'list', axis: 'unit' })), [
    'v',
    'mode',
    'pos',
    'axis',
  ]);
  is(name + ' (версия всегда 1)', buildStored({ pos: {}, axis: 'cloth' }).v, 1);
  // Ключ со значением undefined — тоже лишний ключ: он переживает JSON.stringify как отсутствие, но
  // ломает любое сравнение снимков и читается ревью как «поле есть».
  const c = cell();
  session(c).setAxis('cloth');
  is(name + ' (после писателя, через JSON)', Object.keys(JSON.parse(c.raw)), ['v', 'pos', 'axis']);
  ok(
    name + ' (в записи нет чужих ключей)',
    !/"(shelf|panels|v2|undefined)"/.test(c.raw),
    `запись: ${c.raw}`,
  );
}

{
  const name = 'builder не мутирует вход';
  const cur = { pos: { SHELL: P.SHELL }, mode: 'list', axis: 'cloth' };
  const before = j(cur);
  const out = buildStored(cur, { pos: {} });
  is(name, j(cur), before);
  is(name + ' (патч применён к копии)', out.pos, {});
  is(name + ' (остальное перенесено)', [out.mode, out.axis], ['list', 'cloth']);
}

// --- 7. структура: другой дороги в хранилище нет -------------------------------------------------
//
// Семантика выше проверяет ФУНКЦИИ. Эта половина проверяет, что хук ходит только через них: без неё
// проба остаётся зелёной ровно на том коде, из-за которого написана.

{
  const src = readFileSync(SRC, 'utf8');
  // Комментарии вычёркиваются: в шапке файла про `v: 1` и про сборку руками написано как раз то,
  // почему их тут больше нет.
  const code = src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '');
  const at = code.indexOf('export function useSchematicPrefs');
  ok('структура: хук найден в исходнике', at > 0, 'не нашёл `export function useSchematicPrefs`');
  const hook = code.slice(at);

  ok(
    'структура: тело хука не собирает запись руками',
    !/\bv:\s*1\b/.test(hook),
    'в теле хука остался литерал `v: 1` — писатель снова строит запись сам, минуя builder',
  );
  ok(
    'структура: schedule не зовётся с литералом объекта',
    !/schedule\(\s*\{/.test(hook),
    'найден `schedule({…})` — запись уходит в хранилище мимо builder',
  );
  // Проверка выше смотрит на ЛИТЕРАЛ, и её обходит одна индирекция: писатель оставляет честный
  // `commit({pos})`, а рядом кладёт `schedule(bareRecord(...))`, где хелпер с `v: 1` объявлен ВЫШЕ
  // хука — вне окна, которое читают обе проверки. Тогда семантика и структура зелены, а ловит
  // только браузерная половина, которая на машине без кэша npx молча пропускается: проба печатает
  // «прошло», а драг стирает ось. Поэтому вызов планировщика в теле хука обязан быть ровно один —
  // тот, что внутри `commit`. Это закрывает весь класс индирекций текстуально, без браузера.
  ok(
    'структура: schedule в теле хука зовётся ровно один раз — внутри commit',
    (hook.match(/\bschedule\(/g) ?? []).length === 1,
    'вызовов `schedule(` в хуке не один: запись уходит в хранилище мимо единственного писателя',
  );
  ok(
    'структура: builder экспортирован ровно один',
    (code.match(/export function buildStored\b/g) ?? []).length === 1,
    'buildStored объявлен не один раз или не экспортирован',
  );
  ok(
    'структура: версия формата осталась 1',
    !/\bv:\s*(?!1\b)\d+/.test(code) && /v:\s*1\b/.test(code),
    'в модуле появилась запись версии, отличной от 1 — старые раскладки будут отброшены',
  );
  ok(
    'структура: axis в типе записи опционален',
    /axis\?:\s*SchematicAxis/.test(code),
    'axis объявлен обязательным — старые записи без него не пройдут тип',
  );

  // Каждый писатель передаёт РОВНО своё поле: на этом стоит верность модели сессии выше.
  const writers = [
    ['move', /commit\(\{\s*pos:\s*cleaned\s*\}\)/],
    ['reset', /commit\(\{\s*pos:\s*\{\}\s*\}\)/],
    ['setMode', /commit\(\{\s*mode:\s*next\s*\}\)/],
    ['setAxis', /commit\(\{\s*axis:\s*next\s*\}\)/],
  ];
  for (const [who, re] of writers) {
    ok(
      `структура: писатель ${who} патчит только своё поле`,
      re.test(hook),
      `не нашёл в хуке ${re}`,
    );
  }
  // …и никто не подмешивает соседние поля в свой патч — это и есть исходный дефект в новой одежде:
  // писатель, перечисляющий чужие поля, снова обязан помнить их все.
  const patches = [...commitPatches(hook)];
  ok(
    'структура: вызовы commit найдены',
    patches.length === writers.length,
    `нашёл ${patches.length}`,
  );
  for (const p of patches) {
    ok(
      `структура: патч \`${p}\` состоит из одного поля`,
      topLevelKeys(p).length === 1,
      'в вызове `commit` больше одного поля — писатель снова знает про чужие поля',
    );
  }

  // Инвариант шапки: презентация мимо RHF. Форма тут не появляется даже случайно.
  ok(
    'структура: файл по-прежнему не знает про RHF',
    !/react-hook-form|useFormContext|setValue\(/.test(code),
    'в файл заехала форма — драг начнёт взводить isDirty',
  );
}

// --- 8. живой хук: React + настоящий localStorage + настоящий дебаунс ----------------------------
//
// Модель и текст выше проверяют ЗАМЫСЕЛ. Здесь проверяется РЕАЛИЗАЦИЯ: хук монтируется по-честному,
// пишет в настоящее хранилище и перечитывает его после размонтирования — то есть ровно тот путь,
// на котором ось терялась. Мини-приложение генерируется во временную папку, а не лежит в репе: это
// стенд одной пробы, и держать его как исходник значило бы завести файл, который никто не
// импортирует.

function resolvePlaywright() {
  const require = createRequire(import.meta.url);
  try {
    return require.resolve('playwright');
  } catch {}
  try {
    const cache = `${homedir()}/.npm/_npx`;
    if (!existsSync(cache)) return null;
    const found = execFileSync(
      'find',
      [cache, '-maxdepth', '4', '-type', 'd', '-name', 'playwright', '-path', '*node_modules*'],
      { encoding: 'utf8' },
    )
      .split('\n')
      .filter(Boolean)[0];
    return found ? `${found}/index.js` : null;
  } catch {
    return null;
  }
}

/** Мини-приложение вокруг хука: JSX нет намеренно — лишний синтаксис ради двух вызовов не нужен. */
const STAND = `
import { createElement } from 'react';
import { createRoot } from 'react-dom/client';
import { useSchematicPrefs } from ${JSON.stringify(SRC)};

const live = () => new Set(['SHELL', 'HOOD', 'FR', 'BK']);
let cardId = 0;
function Stand() {
  window.__api = useSchematicPrefs(cardId, live);
  return null;
}
let root = null;
const host = document.createElement('div');
document.body.appendChild(host);
window.__mount = (id) => {
  cardId = id;
  root = createRoot(host);
  root.render(createElement(Stand));
};
window.__unmount = () => {
  root.unmount();
  root = null;
};
`;

const pw = resolvePlaywright();
const chromium = pw ? (await import(pw)).chromium ?? (await import(pw)).default?.chromium : null;
if (!chromium) {
  console.log('playwright не найден — половина «живой хук» пропущена (это не отказ)');
} else {
  const standTs = resolve(tmpdir(), `schematic-prefs-stand-${process.pid}.ts`);
  const standJs = resolve(tmpdir(), `schematic-prefs-stand-${process.pid}.js`);
  writeFileSync(standTs, STAND, 'utf8');
  await build({
    entryPoints: [standTs],
    bundle: true,
    format: 'iife',
    platform: 'browser',
    absWorkingDir: root,
    // Стенд лежит во временной папке, откуда node_modules не видны вовсе — путь показывается явно.
    nodePaths: [resolve(root, 'node_modules')],
    define: { 'process.env.NODE_ENV': '"development"' },
    outfile: standJs,
    logLevel: 'silent',
  });

  const browser = await chromium.launch();
  const page = await browser.newPage();
  // about:blank — непрозрачный origin, localStorage в нём запрещён политикой. Нужен настоящий
  // адрес, и любой перехваченный годится: сеть тут ни при чём.
  await page.route('http://schematic-prefs.probe/**', (r) =>
    r.fulfill({ contentType: 'text/html', body: '<!doctype html><html><body></body></html>' }),
  );
  await page.goto('http://schematic-prefs.probe/');
  await page.addScriptTag({ content: readFileSync(standJs, 'utf8') });

  const KEY = (id) => `plm.techcard.schematic.${id}`;
  const run = (fn, arg) => page.evaluate(fn, arg);
  const stored = (id) => run((k) => JSON.parse(localStorage.getItem(k)), KEY(id));
  /** Дождаться записи: дебаунс 400ms, и торопить его нечем — он и есть часть проверяемого. */
  const settle = () => page.waitForTimeout(600);

  await run(() => {
    localStorage.clear();
    window.__mount(77);
  });
  await run(() => {
    window.__api.setMode('schematic');
    window.__api.setAxis('cloth');
  });
  await run(() => window.__api.move('SHELL', { x: 120, y: 40 }));
  await settle();
  let rec = await stored(77);
  is('живой хук: ось пережила драг узла', rec.axis, 'cloth');
  is('живой хук: позиция записана', rec.pos, { SHELL: { x: 120, y: 40 } });
  is('живой хук: режим записан', rec.mode, 'schematic');
  is('живой хук: форма записи', Object.keys(rec), ['v', 'mode', 'pos', 'axis']);

  // Размонтирование и монтирование заново — это перезагрузка страницы: новая сессия читает то, что
  // осталось в хранилище, и её писатели про ось уже ничего не знают.
  await run(() => {
    window.__unmount();
    window.__mount(77);
  });
  is('живой хук: ось прочиталась при монтировании', await run(() => window.__api.axis), 'cloth');
  await run(() => window.__api.move('HOOD', { x: 300, y: 40 }));
  await settle();
  rec = await stored(77);
  is('живой хук: драг в новой сессии не стёр ось', rec.axis, 'cloth');
  is('живой хук: обе позиции целы', rec.pos, { SHELL: { x: 120, y: 40 }, HOOD: { x: 300, y: 40 } });

  await run(() => window.__api.setMode('list'));
  await settle();
  rec = await stored(77);
  is('живой хук: setMode не стёр ось', [rec.axis, rec.mode], ['cloth', 'list']);
  is('живой хук: setMode не стёр позиции', Object.keys(rec.pos).sort(), ['HOOD', 'SHELL']);

  await run(() => window.__api.reset());
  await settle();
  rec = await stored(77);
  is('живой хук: reset очистил раскладку', rec.pos, {});
  is('живой хук: reset не тронул ось и режим', [rec.axis, rec.mode], ['cloth', 'list']);

  // Размонтирование В ОКНЕ дебаунса: без flush последнее переключение потерялось бы — то есть ровно
  // то, которое человек только что сделал и пошёл проверять.
  await run(() => {
    window.__api.setAxis('unit');
    window.__unmount();
  });
  is('живой хук: размонтирование сбросило отложенную запись', (await stored(77)).axis, 'unit');

  // Старая запись без оси — та самая, что уже лежит у людей в браузере.
  await run((k) => {
    localStorage.setItem(k, JSON.stringify({ v: 1, mode: 'list', pos: { FR: { x: 5, y: 6 } } }));
    window.__mount(88);
  }, KEY(88));
  is('живой хук: старая запись — ось пуста', await run(() => window.__api.axis), null);
  is('живой хук: старая запись — позиции прочитаны', await run(() => window.__api.pos), {
    FR: { x: 5, y: 6 },
  });
  await run(() => window.__api.move('BK', { x: 9, y: 9 }));
  await settle();
  rec = await stored(88);
  is('живой хук: драг не дописал пустую ось', Object.keys(rec), ['v', 'mode', 'pos']);
  is('живой хук: старая позиция цела', rec.pos, { FR: { x: 5, y: 6 }, BK: { x: 9, y: 9 } });

  // Ключ — на карточку: соседняя карточка не должна донашивать чужую ось.
  await run(() => window.__unmount());
  await run(
    (k) => localStorage.setItem(k, JSON.stringify({ v: 1, pos: {}, axis: 'cloth' })),
    KEY(99),
  );
  await run(() => window.__mount(99));
  is('живой хук: у другой карточки своя ось', await run(() => window.__api.axis), 'cloth');

  await browser.close();
  for (const f of [standTs, standJs]) rmSync(f, { force: true });
}

rmSync(outfile, { force: true });

console.log(`\n${checks - failed.size} из ${checks} проверок прошло`);
if (failed.size) process.exitCode = 1;
