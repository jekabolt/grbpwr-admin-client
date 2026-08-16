#!/usr/bin/env node
// ДУГА ПРОХОДИТ ЧЕРЕЗ СВОЮ СРЕДНЮЮ ТОЧКУ — единственное утверждение этой пробы, и оно же
// единственное обещание, которое дуга даёт технологу.
//
// Технолог ставит три точки НА линии, которую видит: начало посадки оката, её вершину, конец.
// Управляющая точка Безье кривой НЕ ПРИНАДЛЕЖИТ, поэтому если формула C = 2·P1 − (P0+P2)/2
// однажды съедет (скажем, кто-то «упростит» её до середины хорды), кривая просто перестанет
// касаться поставленной вершины — и заметить это на глаз нельзя: она останется гладкой дугой,
// просто не той. Проба ловит ровно это.
//
//   node scripts/annotation-arc-probe.mjs

import { build } from 'esbuild';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, resolve } from 'node:path';
import { tmpdir } from 'node:os';

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, '..');
const entry = resolve(root, 'src/ui/components/annotation-geometry.ts');
const outfile = resolve(tmpdir(), `annotation-arc-${process.pid}.mjs`);
await build({ entryPoints: [entry], bundle: true, format: 'esm', platform: 'node', outfile, logLevel: 'silent' });
const { arcControlPoint, quadraticAt, arcPath } = await import(pathToFileURL(outfile).href);

let pass = 0;
let fail = 0;
const check = (name, ok, detail = '') => {
  if (ok) pass++;
  else {
    fail++;
    console.error(`✗ ${name}${detail ? ` — ${detail}` : ''}`);
  }
};

const EPS = 1e-9;
const near = (a, b) => Math.abs(a - b) < EPS;

// Набор нарочно разный: пологая дуга, крутая, «вершина» вне отрезка между концами (так рисуют
// закруглённый борт), вертикальная и вырожденная в прямую.
const cases = [
  { n: 'пологая', p0: { x: 0, y: 100 }, p1: { x: 50, y: 80 }, p2: { x: 100, y: 100 } },
  { n: 'крутая', p0: { x: 10, y: 200 }, p1: { x: 60, y: 20 }, p2: { x: 110, y: 200 } },
  { n: 'вершина сбоку', p0: { x: 0, y: 0 }, p1: { x: 90, y: 40 }, p2: { x: 100, y: 100 } },
  { n: 'вертикальная', p0: { x: 40, y: 0 }, p1: { x: 70, y: 50 }, p2: { x: 40, y: 100 } },
  { n: 'вырожденная в прямую', p0: { x: 0, y: 0 }, p1: { x: 50, y: 50 }, p2: { x: 100, y: 100 } },
  { n: 'дробные доли кадра', p0: { x: 0.12, y: 0.8 }, p1: { x: 0.4, y: 0.31 }, p2: { x: 0.77, y: 0.62 } },
];

for (const c of cases) {
  const ctrl = arcControlPoint(c.p0, c.p1, c.p2);
  const mid = quadraticAt(c.p0, ctrl, c.p2, 0.5);
  check(`${c.n}: кривая проходит через среднюю точку`, near(mid.x, c.p1.x) && near(mid.y, c.p1.y),
    `t=0.5 дал (${mid.x}, ${mid.y}), ожидалось (${c.p1.x}, ${c.p1.y})`);

  // Концы обязаны совпадать с поставленными: дуга начинается и кончается там, где показали.
  const at0 = quadraticAt(c.p0, ctrl, c.p2, 0);
  const at1 = quadraticAt(c.p0, ctrl, c.p2, 1);
  check(`${c.n}: начало на месте`, near(at0.x, c.p0.x) && near(at0.y, c.p0.y));
  check(`${c.n}: конец на месте`, near(at1.x, c.p2.x) && near(at1.y, c.p2.y));
}

// Вырожденный случай отдельно: три точки на прямой обязаны дать управляющую точку НА ней же,
// то есть отрезок, а не петлю.
const straight = arcControlPoint({ x: 0, y: 0 }, { x: 50, y: 50 }, { x: 100, y: 100 });
check('три точки на прямой дают прямую', near(straight.x, 50) && near(straight.y, 50),
  `управляющая (${straight.x}, ${straight.y})`);

// Путь — валидная квадратичная кривая с той же управляющей точкой, а не строка «на глазок».
const d = arcPath({ x: 0, y: 100 }, { x: 50, y: 80 }, { x: 100, y: 100 });
check('путь — M…Q…', /^M0,100 Q50,60 100,100$/.test(d), d);

console.log(`${pass} из ${pass + fail} проверок прошло`);
process.exit(fail === 0 ? 0 : 1);
