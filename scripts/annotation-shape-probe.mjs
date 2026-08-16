#!/usr/bin/env node
// ФИГУРЫ УКАЗАНИЙ РИСУЮТСЯ ТЕМ, ЧЕМ ОБЕЩАНО, — и не рисуются вовсе там, где точек не хватает.
//
// `CalloutShape` — единственная отрисовка выносок на ПЯТИ поверхностях: снимок шага, технический
// эскиз, мудборд, увеличенный просмотр и печатный тех-пак. Ошибка здесь тиражируется на все пять
// сразу, а видна только глазами и только на той поверхности, куда человек в тот день зашёл.
//
// Проверяются две вещи, каждая — про молчаливый отказ:
//   1. У каждого вида на месте ИМЕННО его признаки: у мерки — засечки (без них это просто отрезок,
//      и швея прочтёт её как линию строчки), у дуги — квадратичная кривая, у мультилидера — по
//      лидеру на каждый якорь.
//   2. Недостаточный набор точек даёт ПУСТО, а не NaN в координатах. NaN в SVG не падает и не
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
const { render } = await import(pathToFileURL(outfile).href);
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

// --- у каждого вида на месте его собственные признаки ------------------------------------------
const pin = render({ kind: 'pin', pts: [P(10, 20)], label });
check('пин — одна точка привязки', count(pin, 'circle') === 1, pin);

const lbl = render({ kind: 'label', pts: [P(10, 20)], label });
check('подпись — точка и лидер со стрелкой', count(lbl, 'circle') === 1 && count(lbl, 'line') === 1 && lbl.includes('marker-end'), lbl);

const dim = render({ kind: 'dim', pts: [P(10, 20), P(90, 20)], label });
// Размерная линия + ДВЕ засечки + пунктир к подписи. Без засечек это просто отрезок.
check('мерка — линия, две засечки и пунктир', count(dim, 'line') === 4 && dim.includes('stroke-dasharray'), dim);

const bracket = render({ kind: 'bracket', pts: [P(10, 20), P(90, 20)], label });
check('скобка — путь и пунктир', count(bracket, 'path') === 1 && count(bracket, 'line') === 1, bracket);

const arc = render({ kind: 'arc', pts: [P(0, 100), P(50, 80), P(100, 100)], label });
check('дуга — квадратичная кривая', /d="M0,100 Q50,60 100,100"/.test(arc), arc);
check('дуга — концы отмечены', count(arc, 'circle') === 2, arc);

const multi = render({ kind: 'multi', pts: [P(10, 20), P(50, 40), P(80, 60)], label });
check('мультилидер — по лидеру на якорь', count(multi, 'circle') === 3 && count(multi, 'line') === 3, multi);

// --- цвет доезжает, а неизвестный не роняет ----------------------------------------------------
const red = render({ kind: 'label', pts: [P(10, 20)], label, color: 'red' });
check('цвет из словаря доезжает', red.includes('#d02b2b'), red);
const odd = render({ kind: 'label', pts: [P(10, 20)], label, color: 'fuchsia' });
check('неизвестный цвет падает в чернильный', odd.includes('currentColor'), odd);

// --- НЕДОСТАТОЧНЫЙ НАБОР ТОЧЕК ДАЁТ ПУСТО, А НЕ NaN --------------------------------------------
const noNaN = (svg) => !/NaN/.test(svg);
for (const [kind, pts] of [
  ['dim', [P(10, 20)]],
  ['bracket', [P(10, 20)]],
  ['arc', [P(10, 20)]],
  ['arc', [P(10, 20), P(50, 40)]],
]) {
  const svg = render({ kind, pts, label });
  check(`${kind} с ${pts.length} точк(ой/ами) — пусто, без NaN`, svg === '<svg></svg>' && noNaN(svg), svg);
}
const empty = render({ kind: 'dim', pts: [], label });
check('пустой набор точек — пусто', empty === '<svg></svg>', empty);
const unknown = render({ kind: 'squiggle', pts: [P(1, 2)], label });
check('неизвестный вид не рисуется', unknown === '<svg></svg>', unknown);

// --- ни одна фигура не роняет NaN на законных входах -------------------------------------------
for (const svg of [pin, lbl, dim, bracket, arc, multi]) {
  check('нет NaN в координатах', noNaN(svg), svg.slice(0, 120));
}
// Вырожденная мерка (две совпавшие точки): деления на ноль быть не должно.
const degenerate = render({ kind: 'dim', pts: [P(40, 40), P(40, 40)], label });
check('мерка нулевой длины не даёт NaN', noNaN(degenerate), degenerate);
const flatArc = render({ kind: 'arc', pts: [P(0, 0), P(0, 0), P(0, 0)], label });
check('вырожденная дуга не даёт NaN', noNaN(flatArc), flatArc);

console.log(`${pass} из ${pass + fail} проверок прошло`);
process.exit(fail === 0 ? 0 : 1);
