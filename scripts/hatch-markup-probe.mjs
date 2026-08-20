#!/usr/bin/env node
// РАЗМЕТКА ШТРИХОВКИ: словарь → `<pattern>` (Ф1б, `cloth-hatch.tsx`).
//
// Числа словаря пинит `cloth:pieces`. То, что рендерер вообще ВЫПИСЫВАЕТ эти числа в разметку, не
// защищено ничем: `clothPatternDefs` — единственный порт знака ткани на четырёх поверхностях
// (плитка сборки, силуэт рецепта, полка фулскрина, печатный комплект), и ошибается он молча во все
// стороны сразу.
//
//   * забытый множитель `u` у дэшаррея — шаг едет, дэш остаётся @1×, перестаёт делить шаг и линия
//     рисуется СПЛОШНОЙ: mesh становится неотличим от lining, а картинка остаётся картинкой;
//   * класс, выведенный из вида знака вместо ЗНАКА угла, — `hx45` вместо `hx135`: решётка едет в
//     другую сторону, встречные семейства (лицо/изнанка) сливаются в одно;
//   * `strokeWidth` не равный `u` — штрих перестаёт быть одним CSS-пикселем и на крупной детали
//     перевешивает контур, а на мелкой исчезает;
//   * `flat`, отдающий пустой `<pattern>` вместо `null`, — у детали БЕЗ ткани появляется лишний
//     узел и заливка `url(#…)` вместо сегодняшней плоской;
//   * общий id вместо `useId()` на инстанс — `url(#id)` резолвится документо-глобально в ПЕРВЫЙ
//     подходящий def, и десятки силуэтов печатного листа получают решётку чужого масштаба.
//
// Ни одна из пяти не видна ни в `tsc`, ни на глаз: разница — в полпикселя и в один градус.
//
//   node scripts/hatch-markup-probe.mjs

import { build } from 'esbuild';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, resolve } from 'node:path';
import { readFileSync, rmSync } from 'node:fs';

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, '..');
const entry = resolve(root, 'scripts/hatch-markup-probe-entry.tsx');
// Вывод кладётся В РЕПОЗИТОРИЙ (и удаляется после): при внешних react/react-dom модуль разрешает
// их относительно СВОЕГО расположения, а из системной временной папки node_modules не виден вовсе.
const outfile = resolve(root, `scripts/.hatch-markup-${process.pid}.mjs`);
await build({
  entryPoints: [entry],
  bundle: true,
  format: 'esm',
  platform: 'node',
  jsx: 'automatic',
  absWorkingDir: root,
  outfile,
  logLevel: 'silent',
  // React и react-dom — ВНЕШНИЕ: их CJS-сборка тянет `require('util')`, а esbuild в ESM-выводе
  // такой require не умеет. Нам нужен не бандл React, а только модуль штриховки.
  external: ['react', 'react-dom', 'react-dom/server', 'react/jsx-runtime'],
});
const { CLOTH_GEOMETRY, CLOTH_RAMP, hatchId, patternIsNull, renderPattern, renderSwatchPair } =
  await import(pathToFileURL(outfile).href);
rmSync(outfile, { force: true });

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
/** Подстрока разметки — основная форма проверки: атрибут пишется буквально таким. */
const has = (name, svg, needle) => {
  checks++;
  if (!svg.includes(needle)) fail(name, `нет «${needle}» в ${svg}`);
};
const hasNot = (name, svg, needle) => {
  checks++;
  if (svg.includes(needle)) fail(name, `есть лишнее «${needle}» в ${svg}`);
};
const count = (svg, tag) => (svg.match(new RegExp(`<${tag}[ />]`, 'g')) ?? []).length;

// `u` — user units на CSS-пиксель, и он ДРОБНЫЙ на всех живых поверхностях: бокс плитки делится на
// bbox детали в сантиметрах. Целыми значениями проба ловила бы ровно половину арифметики.
const SCALES = [1, 2, 0.5, 1 / 3];

// --- 1. десять состояний словаря дают разметку, и ровно одно — null ----------------------------

{
  is('рампа — десять состояний', CLOTH_RAMP.length, 10);
  const flat = CLOTH_RAMP.filter((s) => CLOTH_GEOMETRY[s].kind === 'flat');
  is('плоское состояние ровно одно — unbound', flat, ['unbound']);

  for (const u of SCALES) {
    // `null`, а НЕ пустой паттерн: у детали без ткани не должно появиться ни одного лишнего узла,
    // иначе «плитка как была» перестаёт быть буквальным.
    is(`unbound → null (u=${u})`, patternIsNull('unbound', u), true);
    is(`unbound → пустая разметка (u=${u})`, renderPattern('unbound', u), '');
  }

  for (const state of CLOTH_RAMP) {
    if (state === 'unbound') continue;
    is(`${state} → не null`, patternIsNull(state, 1), false);
    has(`${state} несёт переданный id`, renderPattern(state, 1), 'id="probe"');
    has(
      `${state} — паттерн в координатах пользователя`,
      renderPattern(state, 1),
      'patternUnits="userSpaceOnUse"',
    );
  }
}

// --- 2. словарь → атрибуты: шаг, толщина, дэш, угол, класс -------------------------------------

// Ожидания считаются ИЗ СЛОВАРЯ, а не переписаны вторым литералом: числа пинит cloth:pieces, здесь
// проверяется только то, что рендерер выписывает в разметку именно их, домноженные на `u`.
for (const state of CLOTH_RAMP) {
  const g = CLOTH_GEOMETRY[state];
  if (g.kind === 'flat') continue;
  for (const u of SCALES) {
    const svg = renderPattern(state, u);
    const t = g.tile * u;
    const tag = `${state} @${u}×`;

    // ШАГ РЕШЁТКИ — `tile * u` по обеим осям. Ячейка не квадрат = знак растянут по одной оси, и
    // «одна ткань» на двух поверхностях читается как две разные.
    has(`${tag}: width = tile×u`, svg, `width="${t}"`);
    has(`${tag}: height = tile×u`, svg, `height="${t}"`);

    // КЛАСС ВЫВОДИТСЯ ИЗ ЗНАКА УГЛА, а не из вида знака: класс несёт кламп `--hk`, и `hx45` на
    // паттерне, повёрнутом на −45°, увёл бы решётку во встречное семейство.
    const cls = g.kind === 'dot' ? 'hx0' : g.rot > 0 ? 'hx45' : 'hx135';
    has(`${tag}: класс ${cls} по знаку rot`, svg, `class="${cls}"`);

    if (g.kind === 'dot') {
      // Точке поворот не нужен и не пишется: `rotate(0)` был бы ложным утверждением о том, что у
      // знака есть ориентация.
      hasNot(`${tag}: у точки нет patternTransform`, svg, 'patternTransform');
      is(`${tag}: одна точка`, count(svg, 'circle'), 1);
      is(`${tag}: у точки нет линий`, count(svg, 'line'), 0);
      has(`${tag}: точка в центре ячейки`, svg, `cx="${t / 2}" cy="${t / 2}"`);
      has(`${tag}: радиус = r×u`, svg, `r="${g.r * u}"`);
      has(`${tag}: точка чернильная`, svg, 'fill="#000"');
      continue;
    }

    has(`${tag}: patternTransform = rotate(rot)`, svg, `patternTransform="rotate(${g.rot})"`);
    // КРЕСТ — ДВЕ ЛИНИИ, одно семейство — одна. Крест, выродившийся в одну линию, читается как
    // лицевая ткань: клеевая деталь уходит в цех знаком основной.
    is(`${tag}: линий ${g.kind === 'cross' ? 2 : 1}`, count(svg, 'line'), g.kind === 'cross' ? 2 : 1);
    is(`${tag}: без точек`, count(svg, 'circle'), 0);

    // ТОЛЩИНА ШТРИХА ВСЕГДА `u` — ровно один CSS-пиксель независимо от габарита детали. Проверяется
    // на КАЖДОЙ линии: у креста вторую легко оставить с чужой толщиной.
    const widths = [...svg.matchAll(/stroke-width="([^"]+)"/g)].map((m) => m[1]);
    is(`${tag}: strokeWidth = u на каждой линии`, widths, Array(widths.length || 1).fill(String(u)));
    is(`${tag}: линий с толщиной столько же`, widths.length, g.kind === 'cross' ? 2 : 1);
    has(`${tag}: штрих чернильный`, svg, 'stroke="#000"');

    // Семейство рисуется ГОРИЗОНТАЛЬНЫМ и разворачивается трансформом: угол, зашитый в координаты,
    // разошёлся бы с классом-клампом, который вращает паттерн ещё раз.
    has(`${tag}: линия семейства по центру ячейки`, svg, `x1="0" y1="${t / 2}" x2="${t}" y2="${t / 2}"`);
    if (g.kind === 'cross') {
      has(`${tag}: вторая линия креста поперёк`, svg, `x1="${t / 2}" y1="0" x2="${t / 2}" y2="${t}"`);
    }

    if (g.dash) {
      // ДЭШ ДОМНОЖАЕТСЯ НА `u` ВМЕСТЕ С ШАГОМ. Забытый множитель — самая тихая ошибка этого файла:
      // дэш перестаёт делить шаг, SVG рисует СПЛОШНУЮ линию, и «рваное полотно» становится
      // подкладкой. На картинке разница в полпикселя.
      has(`${tag}: дэш = {${g.dash[0]}u} {${g.dash[1]}u}`, svg, `stroke-dasharray="${g.dash[0] * u} ${g.dash[1] * u}"`);
      is(`${tag}: дэш делит шаг нацело`, (g.dash[0] + g.dash[1]) * u, t);
    } else {
      // Обратная сторона той же ловушки: дэшаррей, появившийся у сплошной роли, рвёт основную
      // ткань в сетку.
      hasNot(`${tag}: у сплошной роли нет дэша`, svg, 'stroke-dasharray');
    }
  }
}

// --- 3. якоря буквой: ровно та разметка, которую увидит браузер --------------------------------

// Формулы выше выведены из словаря — эти четыре кейса написаны числами. Если разъедутся оба
// словаря сразу (правка спеки), формулы останутся зелёными, а якоря скажут об этом вслух.
is(
  'якорь: main @2× — разметка целиком',
  renderPattern('main', 2),
  '<svg><pattern id="probe" class="hx45" patternUnits="userSpaceOnUse" width="12" height="12" ' +
    'patternTransform="rotate(45)"><line x1="0" y1="6" x2="12" y2="6" stroke="#000" ' +
    'stroke-width="2"></line></pattern></svg>',
);
has('якорь: mesh @2× — дэш уехал вместе с шагом', renderPattern('mesh', 2), 'stroke-dasharray="6 4"');
has('якорь: unsorted @2× — точка радиуса 1.24', renderPattern('unsorted', 2), 'r="1.24"');
is('якорь: interfacing @2× — две линии', count(renderPattern('interfacing', 2), 'line'), 2);

// ДЭШ ПРОТИВ ШАГА — ЧИТАЯ ЧИСЛА ОБРАТНО ИЗ РАЗМЕТКИ, а не из словаря: это единственная проверка,
// которой всё равно, откуда рендерер взял числа. Дэш, не попавший в шаг, рисуется СПЛОШНОЙ линией,
// и «рваное полотно» молча становится подкладкой — на живых плитках `u` дробный, так что сойтись
// эти два числа обязаны и в плавающей запятой, а не только в арифметике на бумаге.
for (const state of CLOTH_RAMP) {
  if (!CLOTH_GEOMETRY[state].dash) continue;
  for (const u of SCALES) {
    const svg = renderPattern(state, u);
    const step = parseFloat(/width="([^"]+)"/.exec(svg)[1]);
    const [on, off] = /stroke-dasharray="([^ ]+) ([^"]+)"/
      .exec(svg)
      .slice(1)
      .map(parseFloat);
    is(`${state} @${u}×: дэш из разметки равен шагу из разметки`, on + off, step);
  }
}

// --- 4. id — НА ИНСТАНС, а не на роль ----------------------------------------------------------

{
  // Два образца ОДНОЙ роли в одном документе. Общий id молча подставил бы обоим первый попавшийся
  // в DOM def — в печатном комплекте с десятками силуэтов это решётка чужого масштаба у всех, и
  // выглядит дефект как «шаг штриховки почему-то разный», а не как ошибка идентификатора.
  const pair = renderSwatchPair('main');
  const ids = [...pair.matchAll(/<pattern id="([^"]+)"/g)].map((m) => m[1]);
  is('два образца — два паттерна', ids.length, 2);
  is('id образцов различны', ids[0] !== ids[1], true);
  const fills = [...pair.matchAll(/fill:url\(#([^)]+)\)/g)].map((m) => m[1]);
  is('каждый образец ссылается на СВОЙ паттерн', fills, ids);

  // Роль без знака заливается плоским серым, а не ссылкой в никуда.
  const flat = renderSwatchPair('unbound');
  is('образец unbound — без паттерна', count(flat, 'pattern'), 0);
  has('образец unbound — плоская заливка', flat, 'fill:#dedede');
}

{
  // `url(#id)` разбирается как CSS-значение, а `useId` в React 19 отдаёт id в гильеметах. В
  // браузере такой url() валиден, но тот же id уезжает в печатный комплект и в чужие разборщики
  // SVG, где не-ASCII в неквотированном url-токене — лотерея.
  is('hatchId сводит id к ASCII', hatchId('hatch', '«R1»'), 'hatch-R1');
  is('hatchId сохраняет цифры и буквы', hatchId('sw', 'R2:1'), 'sw-R21');
  is('hatchId не теряет префикс на пустом вводе', hatchId('hatch', '»«'), 'hatch-');
}

// --- 5. CSS-половина знака: классы `.hx*` и печатный кламп в global.css ------------------------
//
// Разметка выше пинит только ИМЕНА классов. Их ТЕЛА живут в src/global.css, и до этой секции их не
// держало ничто: убери `scale(var(--hk, 1))` — кламп читаемости исчезает на всех зумах; поменяй
// знак угла у `.hx135` — встречные семейства (лицо/изнанка) сливаются в одно, а проба разметки
// остаётся зелёной, потому что класс в атрибуте тот же. Печатный кламп — та же история: без
// `@media print { :root { --hk: 1 } }` (и `.world` с `!important` поверх инлайнового писателя
// applyView) бумага уносит экранную плотность.
{
  const css = readFileSync(resolve(root, 'src/global.css'), 'utf8');
  const rule = (name, body) =>
    new RegExp(`\\.${name}\\s*\\{\\s*${body}\\s*\\}`);

  checks++;
  if (!rule('hx45', String.raw`transform:\s*rotate\(45deg\)\s*scale\(var\(--hk,\s*1\)\);`).test(css))
    fail('css: .hx45 = rotate(45deg) + кламп', 'тело .hx45 в global.css не совпало со знаком');
  checks++;
  if (!rule('hx135', String.raw`transform:\s*rotate\(-45deg\)\s*scale\(var\(--hk,\s*1\)\);`).test(css))
    fail('css: .hx135 = rotate(-45deg) + кламп', 'тело .hx135 в global.css не совпало со знаком');
  checks++;
  if (!rule('hx0', String.raw`transform:\s*scale\(var\(--hk,\s*1\)\);`).test(css))
    fail('css: .hx0 = только кламп, без поворота', 'тело .hx0 в global.css не совпало со знаком');
  checks++;
  if (/\.hx0\s*\{[^}]*rotate/.test(css))
    fail('css: у .hx0 нет поворота', 'в .hx0 появился rotate — точка получила ложную ориентацию');

  // Печатный кламп: ищется ВНУТРИ блока @media print, а не по всему файлу, — правило вне печати
  // прибило бы кламп и на экране.
  const printBlocks = [];
  for (let i = css.indexOf('@media print'); i >= 0; i = css.indexOf('@media print', i + 1)) {
    const open = css.indexOf('{', i);
    let depth = 0;
    for (let k = open; k < css.length; k++) {
      if (css[k] === '{') depth++;
      else if (css[k] === '}' && --depth === 0) {
        printBlocks.push(css.slice(open, k));
        break;
      }
    }
  }
  checks++;
  if (!printBlocks.some((b) => /:root\s*\{\s*--hk:\s*1;\s*\}/.test(b)))
    fail('css: печать сбрасывает --hk на :root', 'в @media print нет `:root { --hk: 1; }`');
  checks++;
  if (!printBlocks.some((b) => /\.world\s*\{\s*--hk:\s*1 !important;\s*\}/.test(b)))
    fail(
      'css: печать перебивает инлайнового писателя .world',
      'в @media print нет `.world { --hk: 1 !important; }` — applyView пишет --hk инлайновым ' +
        'стилем, и правило без !important его не перебьёт',
    );
}

console.log(`\n${checks - failed.size} из ${checks} проверок прошло`);
if (failed.size) process.exitCode = 1;
