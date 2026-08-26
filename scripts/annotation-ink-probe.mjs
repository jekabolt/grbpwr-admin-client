#!/usr/bin/env node
// СЛЕД ФРИХЕНДА: РАЗДЕЛИТЕЛЬ ШТРИХОВ, БЮДЖЕТ ТОЧЕК И СЕРВЕРНЫЕ ПОТОЛКИ.
//
// Серия штрихов едет ОДНОЙ выноской, а поднятое перо кодируется ДУБЛИРОВАННОЙ ТОЧКОЙ
// (`…, P, P, Q, …`) — без изменения контракта провода. Отсюда три вещи, которые обязаны держаться
// зондом, потому что ни `tsc`, ни глаз их не ловят:
//   · прореживание идёт ПО ШТРИХУ и никогда через разрыв (RDP выкинул бы сам разделитель, две
//     совпавшие точки лежат на любой прямой — и штрихи слиплись бы мостом);
//   · склейка любой длины укладывается в СЕРВЕРНЫЕ 200 точек: перебор возвращает
//     `FieldViolation(".points", "wrong_count")` и отвергает сохранение ВСЕЙ карточки;
//   · старые следы без дублей рисуются БАЙТ В БАЙТ как раньше.
//
//   node scripts/annotation-ink-probe.mjs
//
// Жесты этим зондом не проверяются — они в `annotation-canvas-probe.mjs`.
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { build as esbuild } from 'esbuild';

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = resolve(HERE, '..');
const outfile = resolve(tmpdir(), `annotation-ink-${process.pid}.mjs`);

await esbuild({
  entryPoints: [resolve(HERE, 'annotation-ink-entry.ts')],
  bundle: true, platform: 'browser', format: 'esm', target: 'es2020', outfile,
  logLevel: 'error', absWorkingDir: REPO, jsx: 'automatic',
  loader: { '.svg': 'dataurl', '.png': 'dataurl', '.woff2': 'dataurl', '.css': 'css' },
  define: { 'process.env.NODE_ENV': '"development"', 'import.meta.env': '__STUB_ENV__' },
  banner: { js: 'var __STUB_ENV__ = {};' },
  alias: {
    components: resolve(REPO, 'src/components'), lib: resolve(REPO, 'src/lib'),
    api: resolve(REPO, 'src/api'), utils: resolve(REPO, 'src/utils'),
    ui: resolve(REPO, 'src/ui'), constants: resolve(REPO, 'src/constants'),
    store: resolve(REPO, 'src/store'), hooks: resolve(REPO, 'src/hooks'),
  },
});

const { inkPath, splitInkStrokes, joinInkStrokes, kindDef } = await import(outfile);

let pass = 0;
let fail = 0;
const out = [];
const check = (name, ok, detail = '') => {
  if (ok) pass += 1;
  else fail += 1;
  out.push(`${ok ? '  ok  ' : '  FAIL'} ${name}${detail ? ` — ${detail}` : ''}`);
};

const P = (x, y) => ({ x, y });
// 6. Разрыв в пути следа
{
  const A = P(0, 0), B = P(10, 10), C = P(30, 0), D = P(40, 10);
  const d = inkPath([A, B, B, C, D]);
  const ms = (d.match(/M/g) || []).length;
  check('6a inkPath([A,B,B,C,D]) даёт ДВА подпути', ms === 2, `M=${ms}: ${d}`);
  const second = d.slice(d.indexOf('M', 1));
  check('6b второй подпуть начинается с C, а не с B', second.startsWith('M30,0'), second.slice(0, 20));
  check('6c мост между B и C не рисуется', !/M0,0[^M]*30,0/.test(d.slice(0, d.indexOf('M', 1))), d);
}
// Легаси без дублей — путь БАЙТ В БАЙТ прежний (иначе правка тихо переписала бы каждый старый след)
{
  const legacy = [P(0, 0), P(10, 10), P(20, 5), P(30, 15)];
  const d = inkPath(legacy);
  const ms = (d.match(/M/g) || []).length;
  check('6d данные без дублей дают ровно один подпуть', ms === 1, d);
  const expected = (() => {
    // Тот же Catmull-Rom, выписанный здесь независимо — оракул, а не копия реализации.
    const pts = legacy;
    let s = `M${pts[0].x},${pts[0].y}`;
    for (let i = 0; i < pts.length - 1; i++) {
      const p0 = pts[i - 1] ?? pts[i], p1 = pts[i], p2 = pts[i + 1], p3 = pts[i + 2] ?? p2;
      const c1 = { x: p1.x + (p2.x - p0.x) / 6, y: p1.y + (p2.y - p0.y) / 6 };
      const c2 = { x: p2.x - (p3.x - p1.x) / 6, y: p2.y - (p3.y - p1.y) / 6 };
      s += ` C${c1.x},${c1.y} ${c2.x},${c2.y} ${p2.x},${p2.y}`;
    }
    return s;
  })();
  check('6e и он совпадает со старым сглаживанием байт в байт', d === expected, `${d}\n  vs\n  ${expected}`);
}
// splitInkStrokes: три подряд одинаковых, хвостовой дубль, пустой вход
{
  check('6f три одинаковые подряд не роняют разбивку', splitInkStrokes([P(1, 1), P(1, 1), P(1, 1)]).length === 2);
  check('6g пустой вход — пустая разбивка', splitInkStrokes([]).length === 0);
  check('6h дубль в конце закрывает последний штрих', JSON.stringify(splitInkStrokes([P(0,0), P(1,1), P(1,1)])) === JSON.stringify([[P(0,0),P(1,1)]]));
}

// Склейка: разделители, бюджет и серверный предел
{
  const id = (p) => p;
  const s1 = [P(0, 0), P(0.1, 0.1), P(0.2, 0)];
  const s2 = [P(0.3, 0.3), P(0.4, 0.4)];
  const j = joinInkStrokes([s1, s2], 200, id, id, 0.002);
  check('J1 склейка длиной sum+разделители', j.length === s1.length + s2.length + 1, `${j.length}`);
  let dups = 0;
  for (let i = 1; i < j.length; i++) if (j[i].x === j[i - 1].x && j[i].y === j[i - 1].y) dups++;
  check('J2 ровно один соседний дубль на два штриха', dups === 1, `${dups}`);
  check('J3 разделитель — последняя точка первого штриха', j[2].x === 0.2 && j[3].x === 0.2, JSON.stringify(j.slice(2, 5)));
  check('J4 разбивка возвращает исходные штрихи', JSON.stringify(splitInkStrokes(j)) === JSON.stringify([s1, s2]));
}
// Потолок: много длинных штрихов — склейка обязана влезть в серверные 200
{
  const id = (p) => p;
  const long = (o) => Array.from({ length: 300 }, (_, i) => P(o + i / 1000, Math.sin(i / 7) / 4 + 0.5));
  for (const n of [2, 5, 20, 67]) {
    const strokes = Array.from({ length: n }, (_, k) => long(k / 100));
    const j = joinInkStrokes(strokes, 200, id, id, 0.002);
    check(`L${n} ${n} штрихов укладываются в серверный предел 200`, j.length <= 200, `точек ${j.length}`);
    let d = 0;
    for (let i = 1; i < j.length; i++) if (j[i].x === j[i - 1].x && j[i].y === j[i - 1].y) d++;
    check(`L${n}s разделителей ровно n−1 (${n - 1}) и после прореживания`, d === n - 1, `дублей ${d}`);
  }
}
// Дубль переживает КЛИЕНТСКУЮ сторону: toFixed(4) → строка → обратно
{
  const id = (p) => p;
  const s1 = [P(0.123456, 0.234567), P(0.3333333, 0.4444444)];
  const s2 = [P(0.5555555, 0.6666666), P(0.777777, 0.888888)];
  const j = joinInkStrokes([s1, s2], 200, id, id, 0.002);
  const wire = j.map((p) => ({ x: p.x.toFixed(4), y: p.y.toFixed(4) }));
  const back = wire.map((p) => ({ x: Number(p.x), y: Number(p.y) }));
  let d = 0;
  for (let i = 1; i < back.length; i++) if (back[i].x === back[i - 1].x && back[i].y === back[i - 1].y) d++;
  check('W1 разделитель переживает toFixed(4) и обратный разбор', d === 1, `дублей ${d}: ${JSON.stringify(wire)}`);
  check('W2 и разбивка после круга даёт те же два штриха', splitInkStrokes(back).length === 2);
  check('W3 координаты остались в 0..1', back.every((p) => p.x >= 0 && p.x <= 1 && p.y >= 0 && p.y <= 1));
}

// Клиентские потолки — не шире серверных (сервер: pin/label 1, dim/bracket 2, arc 3, multi 2..8,
// polygon 3..40, ink 2..200; выход за них отвергает сохранение ВСЕЙ карточки)
{
  const server = {
    pin: [1, 1], label: [1, 1], dim: [2, 2], bracket: [2, 2],
    arc: [3, 3], multi: [2, 8], polygon: [3, 40], ink: [2, 200],
  };
  for (const [k, [lo, hi]] of Object.entries(server)) {
    const c = kindDef(k).points;
    check(`S:${k} клиентский диапазон [${c}] внутри серверного [${lo},${hi}]`, c[0] >= lo && c[1] <= hi);
  }
}

console.log(out.join('\n'));
console.log(`\nИСХОДЫ: ${pass} PASS, ${fail} FAIL (всего ${pass + fail})`);
process.exitCode = fail ? 1 : 0;
