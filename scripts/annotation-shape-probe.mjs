#!/usr/bin/env node
// ФИГУРЫ УКАЗАНИЙ РИСУЮТСЯ ТЕМ, ЧЕМ ОБЕЩАНО, — и не рисуются вовсе там, где точек не хватает.
//
// `CalloutShape` — единственная отрисовка выносок на ПЯТИ поверхностях: снимок шага, технический
// эскиз, мудборд, увеличенный просмотр и печатный тех-пак. Ошибка здесь тиражируется на все пять
// сразу, а видна только глазами и только на той поверхности, куда человек в тот день зашёл.
//
// Проверяются четыре вещи, и каждая — про молчаливый отказ:
//   1. У каждого вида на месте ИМЕННО его признаки: у мерки — засечки (без них это просто отрезок,
//      и швея прочтёт её как линию строчки), у дуги — квадратичная кривая, у зоны — замыкание.
//   2. ЦВЕТ КРАСИТ ВЕСЬ ГЛИФ, включая наконечник стрелки. Наконечник — отдельное определение
//      `<marker>`, а `currentColor` внутри него разрешается в контексте ОПРЕДЕЛЕНИЯ, не линии:
//      именно поэтому стрелка годами оставалась чёрной у цветной выноски, и именно поэтому здесь
//      проверяется ССЫЛКА на цветной маркер, а не цвет линии.
//   3. Пунктир и штриховка рисуются ТОЛЬКО там, где имеют смысл, даже если флаг пришёл поднятым:
//      данные приходят и мимо сегодняшнего сервера (архив релиза, клон сезона).
//   4. Недостаточный набор точек даёт ПУСТО, а не NaN в координатах. NaN в SVG не падает и не
//      логируется — фигура просто исчезает, и отличить «её тут нет» от «её стёрли» нечем.
//
//   node scripts/annotation-shape-probe.mjs

import { build } from 'esbuild';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, resolve } from 'node:path';
import { rmSync } from 'node:fs';

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, '..');
const entry = resolve(root, 'scripts/annotation-shape-probe-entry.tsx');
// Вывод кладётся В РЕПОЗИТОРИЙ (и удаляется после): при внешних react/react-dom модуль
// разрешает их относительно СВОЕГО расположения, а из системной временной папки node_modules не
// виден вовсе.
const outfile = resolve(root, `scripts/.annotation-shape-${process.pid}.mjs`);
await build({
  entryPoints: [entry],
  bundle: true,
  format: 'esm',
  platform: 'node',
  jsx: 'automatic',
  absWorkingDir: root,
  outfile,
  logLevel: 'silent',
  // React и react-dom оставляем ВНЕШНИМИ: их CJS-сборка тянет `require('util')`, а esbuild в
  // ESM-выводе такой require не умеет. Node подгрузит их сам из node_modules — нам нужен не
  // бандл React, а только наш модуль фигур.
  external: ['react', 'react-dom', 'react-dom/server', 'react/jsx-runtime'],
});
const { render, renderDefs } = await import(pathToFileURL(outfile).href);
rmSync(outfile, { force: true });

let pass = 0;
let fail = 0;
const check = (name, ok, detail = '') => {
  if (ok) pass++;
  else {
    fail++;
    console.error(`✗ ${name}${detail ? ` — ${detail}` : ''}`);
  }
};

const P = (x, y) => ({ x, y });
const label = P(50, 10);
const count = (svg, tag) => (svg.match(new RegExp(`<${tag}[ />]`, 'g')) ?? []).length;
const noNaN = (svg) => !/NaN/.test(svg);

// --- у каждого вида на месте его собственные признаки ------------------------------------------
const pin = render({ kind: 'pin', pts: [P(10, 20)], label });
check('пин — одна точка привязки', count(pin, 'circle') === 1, pin);

const lbl = render({ kind: 'label', pts: [P(10, 20)], label });
check(
  'подпись — точка и лидер со стрелкой',
  count(lbl, 'circle') === 1 && lbl.includes('marker-end'),
  lbl,
);

const dim = render({ kind: 'dim', pts: [P(10, 20), P(90, 20)], label });
// Размерная линия + ДВЕ засечки — три штриха; плюс волосяной пунктирный лидер к подписи.
// Без засечек это просто отрезок, и швея прочтёт её как линию строчки.
check(
  'мерка — линия, две засечки и лидер',
  count(dim, 'path') === 3 && count(dim, 'line') === 1 && dim.includes('stroke-dasharray="2 2"'),
  dim,
);

const bracket = render({ kind: 'bracket', pts: [P(10, 20), P(90, 20)], label });
check('скобка — путь и лидер', count(bracket, 'path') === 1 && count(bracket, 'line') === 1, bracket);

const arc = render({ kind: 'arc', pts: [P(0, 100), P(50, 80), P(100, 100)], label });
check('дуга — квадратичная кривая', /d="M0,100 Q50,60 100,100"/.test(arc), arc);
check('дуга — концы отмечены', count(arc, 'circle') === 2, arc);

const multi = render({ kind: 'multi', pts: [P(10, 20), P(50, 40), P(80, 60)], label });
check('мультилидер — по лидеру на якорь', count(multi, 'circle') === 3 && count(multi, 'path') === 3, multi);

// ЗОНА ЗАМЫКАЕТСЯ ПУТЁМ, А НЕ ПОВТОРОМ ПЕРВОЙ ТОЧКИ: копия координаты однажды разошлась бы с
// оригиналом, и контур размыкался бы на волосок — незаметно на экране, предательски на печати.
const poly = render({ kind: 'polygon', pts: [P(10, 10), P(90, 10), P(90, 90)], label });
check('зона — замкнутый путь', /d="M10,10 L90,10 L90,90 Z"/.test(poly), poly);
check('зона без заливки не штрихуется', !poly.includes('ann-hatch'), poly);

// След СГЛАЖЕН кубическими сегментами: ломаная выглядела бы рублеными звеньями ровно там, где
// прореживание сработало лучше всего, и читалась бы как «нарисовано роботом».
const ink = render({ kind: 'ink', pts: [P(0, 0), P(10, 20), P(30, 10), P(50, 40)], label });
check('след — сглаженная кривая', /C/.test(ink) && count(ink, 'path') === 1, ink);

// --- ЦВЕТ КРАСИТ ВЕСЬ ГЛИФ, ВКЛЮЧАЯ НАКОНЕЧНИК -------------------------------------------------
const redLabel = render({ kind: 'label', pts: [P(10, 20)], label, color: 'red' });
check('цвет из словаря доезжает до линии', redLabel.includes('#d02b2b'), redLabel);
check(
  'наконечник ссылается на СВОЙ цветной маркер',
  redLabel.includes('url(#ann-arrow-red)'),
  redLabel,
);
const inkLabel = render({ kind: 'label', pts: [P(10, 20)], label });
check('чернильная подпись — чернильный маркер', inkLabel.includes('url(#ann-arrow)'), inkLabel);

const defs = renderDefs();
for (const c of ['', 'red', 'blue', 'green', 'orange', 'white']) {
  const id = c ? `ann-arrow-${c}` : 'ann-arrow';
  check(`определение стрелки «${c || 'чернила'}» есть`, defs.includes(`id="${id}"`), '');
  const hid = c ? `ann-hatch-${c}` : 'ann-hatch';
  check(`определение штриховки «${c || 'чернила'}» есть`, defs.includes(`id="${hid}"`), '');
}

const odd = render({ kind: 'label', pts: [P(10, 20)], label, color: 'fuchsia' });
check('неизвестный цвет падает в чернильный', odd.includes('currentColor'), odd);

// БЕЛЫЙ ДВУХСЛОЕН ПО ОПРЕДЕЛЕНИЮ: без чернильной подложки он исчезает и на светлом снимке, и на
// белой бумаге, то есть ровно там, где его печатают.
const white = render({ kind: 'dim', pts: [P(10, 20), P(90, 20)], label, color: 'white' });
check('белая линия несёт чернильную подложку', white.includes('stroke="currentColor"'), white);
check('белая линия сама белая', white.includes('#ffffff'), white);

// Гало — только по запросу поверхности: на штриховом эскизе белая подложка перекрыла бы чертёж.
const haloed = render({ kind: 'dim', pts: [P(10, 20), P(90, 20)], label, halo: true });
check('гало включается пропом', haloed.includes('stroke="#fff"'), haloed);
const plain = render({ kind: 'dim', pts: [P(10, 20), P(90, 20)], label });
check('без гало подложки нет', !plain.includes('stroke="#fff"'), plain);

// --- пунктир и штриховка только там, где имеют смысл -------------------------------------------
const dashedDim = render({ kind: 'dim', pts: [P(10, 20), P(90, 20)], label, dashed: true });
check('пунктирная мерка пунктирна', dashedDim.includes('stroke-dasharray="6 4"'), dashedDim);
check(
  'пунктир фигуры отличим от пунктира лидера',
  dashedDim.includes('stroke-dasharray="2 2"'),
  dashedDim,
);
const dashedLabel = render({ kind: 'label', pts: [P(10, 20)], label, dashed: true });
check(
  'подпись не пунктирится: её единственная линия — лидер',
  !dashedLabel.includes('stroke-dasharray="6 4"'),
  dashedLabel,
);
const filledPoly = render({ kind: 'polygon', pts: [P(10, 10), P(90, 10), P(90, 90)], label, filled: true });
check('заштрихованная зона ссылается на паттерн', filledPoly.includes('url(#ann-hatch)'), filledPoly);
const filledRed = render({
  kind: 'polygon',
  pts: [P(10, 10), P(90, 10), P(90, 90)],
  label,
  filled: true,
  color: 'red',
});
check('штриховка своего цвета', filledRed.includes('url(#ann-hatch-red)'), filledRed);
const filledDim = render({ kind: 'dim', pts: [P(10, 20), P(90, 20)], label, filled: true });
check('у линии нет площади — штриховки нет', !filledDim.includes('ann-hatch'), filledDim);

// --- НЕДОСТАТОЧНЫЙ НАБОР ТОЧЕК ДАЁТ ПУСТО, А НЕ NaN --------------------------------------------
for (const [kind, pts] of [
  ['dim', [P(10, 20)]],
  ['bracket', [P(10, 20)]],
  ['arc', [P(10, 20)]],
  ['arc', [P(10, 20), P(50, 40)]],
  ['polygon', [P(10, 20)]],
]) {
  const svg = render({ kind, pts, label });
  check(`${kind} с ${pts.length} точк(ой/ами) — пусто, без NaN`, svg === '<svg></svg>' && noNaN(svg), svg);
}
const empty = render({ kind: 'dim', pts: [], label });
check('пустой набор точек — пусто', empty === '<svg></svg>', empty);

// НЕИЗВЕСТНЫЙ ВИД РИСУЕТСЯ ТОЧКОЙ, А НЕ ИСЧЕЗАЕТ. Провод бывает новее клиента, и потерянная точка
// хуже неточной фигуры: технолог поставил указание, а на чужом экране его нет вовсе.
const unknown = render({ kind: 'squiggle', pts: [P(1, 2)], label });
check('неизвестный вид падает в точку', count(unknown, 'circle') === 1, unknown);

// --- ни одна фигура не роняет NaN на законных входах -------------------------------------------
for (const svg of [pin, lbl, dim, bracket, arc, multi, poly, ink, white, filledPoly]) {
  check('нет NaN в координатах', noNaN(svg), svg.slice(0, 120));
}
// Вырожденная мерка (две совпавшие точки): деления на ноль быть не должно.
const degenerate = render({ kind: 'dim', pts: [P(40, 40), P(40, 40)], label });
check('мерка нулевой длины не даёт NaN', noNaN(degenerate), degenerate);
const flatArc = render({ kind: 'arc', pts: [P(0, 0), P(0, 0), P(0, 0)], label });
check('вырожденная дуга не даёт NaN', noNaN(flatArc), flatArc);
const flatPoly = render({ kind: 'polygon', pts: [P(5, 5), P(5, 5), P(5, 5)], label });
check('вырожденная зона не даёт NaN', noNaN(flatPoly), flatPoly);

console.log(`${pass} из ${pass + fail} проверок прошло`);
process.exit(fail === 0 ? 0 : 1);
