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
//   node scripts/annotation-geometry-probe.mjs

import { build } from 'esbuild';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, resolve } from 'node:path';
import { tmpdir } from 'node:os';

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, '..');
const entry = resolve(root, 'src/ui/components/annotation/geometry.ts');
const outfile = resolve(tmpdir(), `annotation-geometry-${process.pid}.mjs`);
await build({ entryPoints: [entry], bundle: true, format: 'esm', platform: 'node', outfile, logLevel: 'silent' });
const {
  arcControlPoint,
  quadraticAt,
  arcPath,
  polygonPath,
  polygonCentroid,
  inkPath,
  projectOnSegment,
  nearestOnPolyline,
  simplifyPath,
  simplifyToLimit,
  squareToQuad,
  applyHomography,
  quadMatrix3d,
  quadPerspectiveParts,
  quadIsSound,
  clampQuadCorner,
  fitQuadToAspect,
} = await import(pathToFileURL(outfile).href);

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

// ── ЗОНА ───────────────────────────────────────────────────────────────────────────────────────
//
// ЗАМЫКАНИЕ — `Z`, А НЕ ПОВТОР ПЕРВОЙ ТОЧКИ. Копия координаты однажды разошлась бы с оригиналом:
// правка первой вершины не догнала бы копию, и контур размыкался бы на волосок — на экране
// незаметно, на печати видно.
const tri = [{ x: 10, y: 10 }, { x: 90, y: 10 }, { x: 90, y: 90 }];
check('зона — замкнутый путь', polygonPath(tri) === 'M10,10 L90,10 L90,90 Z', polygonPath(tri));
check('зона из одной точки не рисуется', polygonPath([{ x: 1, y: 1 }]) === '');

// ЦЕНТР ТЯЖЕСТИ, А НЕ СРЕДНЕЕ ВЕРШИН. У контура с частым краем и одной длинной стороной среднее
// уезжает туда, где вершин гуще, и маркер садится на край вместо середины.
const square = [{ x: 0, y: 0 }, { x: 100, y: 0 }, { x: 100, y: 100 }, { x: 0, y: 100 }];
const sc = polygonCentroid(square);
check('центр квадрата — его середина', near(sc.x, 50) && near(sc.y, 50), `(${sc.x}, ${sc.y})`);

// Тот же квадрат, но верхняя сторона размечена лишними вершинами: среднее вершин уехало бы вверх,
// центр тяжести — нет.
const dense = [
  { x: 0, y: 0 }, { x: 25, y: 0 }, { x: 50, y: 0 }, { x: 75, y: 0 }, { x: 100, y: 0 },
  { x: 100, y: 100 }, { x: 0, y: 100 },
];
const dc = polygonCentroid(dense);
const meanY = dense.reduce((s, p) => s + p.y, 0) / dense.length;
check('лишние вершины не тянут центр', Math.abs(dc.y - 50) < 1e-6 && Math.abs(meanY - 50) > 10,
  `центр y=${dc.y}, среднее y=${meanY}`);

// Вырожденный контур (все точки совпали) обязан дать точку, а не NaN от деления на нулевую площадь.
const degen = polygonCentroid([{ x: 5, y: 5 }, { x: 5, y: 5 }, { x: 5, y: 5 }]);
check('вырожденная зона не даёт NaN', Number.isFinite(degen.x) && Number.isFinite(degen.y),
  `(${degen.x}, ${degen.y})`);
check('пустая зона даёт ноль', polygonCentroid([]).x === 0);

// ── СЛЕД ───────────────────────────────────────────────────────────────────────────────────────
//
// СГЛАЖЕННАЯ КРИВАЯ ПРОХОДИТ ЧЕРЕЗ ЗАПИСАННЫЕ ТОЧКИ. Это и делает сглаживание совместимым с
// прореживанием: оно не двигает то, что человек нарисовал, — только убирает углы между отсчётами.
const stroke = [{ x: 0, y: 0 }, { x: 10, y: 20 }, { x: 30, y: 10 }, { x: 50, y: 40 }];
const sp = inkPath(stroke);
check('след начинается с первой точки', sp.startsWith('M0,0'), sp);
check('след кончается последней точкой', sp.endsWith('50,40'), sp);
check('след — кубические сегменты', (sp.match(/C/g) ?? []).length === stroke.length - 1, sp);
check('след из двух точек — отрезок', inkPath([{ x: 0, y: 0 }, { x: 1, y: 1 }]) === 'M0,0 L1,1');
check('след из одной точки — только M', inkPath([{ x: 2, y: 3 }]) === 'M2,3');
check('пустой след — пусто', inkPath([]) === '');

// ── ПРОЕКЦИЯ И БЛИЖАЙШЕЕ МЕСТО ─────────────────────────────────────────────────────────────────
//
// Расстояние до ОТРЕЗКА, а не до прямой: за концом отрезка прямая продолжается, а сторона фигуры —
// нет, и клик рядом с продолжением ребра вставлял бы вершину в невидимом месте.
const beyond = projectOnSegment({ x: 200, y: 0 }, { x: 0, y: 0 }, { x: 100, y: 0 });
check('за концом отрезка проекция упирается в конец', near(beyond.t, 1) && near(beyond.dist, 100),
  `t=${beyond.t}, dist=${beyond.dist}`);
const mid = projectOnSegment({ x: 50, y: 10 }, { x: 0, y: 0 }, { x: 100, y: 0 });
check('проекция на середину', near(mid.t, 0.5) && near(mid.dist, 10));
const zeroLen = projectOnSegment({ x: 5, y: 5 }, { x: 0, y: 0 }, { x: 0, y: 0 });
check('нулевой отрезок не делит на ноль', Number.isFinite(zeroLen.dist) && zeroLen.t === 0);

// ЗАМЫКАЮЩЕЕ РЕБРО — ТАКОЕ ЖЕ, КАК ВСЕ. Не давать вставить вершину на нём значило бы, что одну
// сторону контура из N поправить нельзя вовсе.
// Точка у ЗАМЫКАЮЩЕГО ребра (0,100)→(0,0) и далеко от всех прочих: разомкнутая ломаная обязана
// промахнуться на ближайшее из своих трёх рёбер, замкнутая — попасть в четвёртое.
const openHit = nearestOnPolyline({ x: 5, y: 40 }, square, false);
const closedHit = nearestOnPolyline({ x: 5, y: 40 }, square, true);
check('на разомкнутой ломаной замыкающего ребра нет', openHit.index === 0 && near(openHit.dist, 40),
  JSON.stringify(openHit));
check('на замкнутой оно есть', closedHit.index === 3 && near(closedHit.dist, 5),
  JSON.stringify(closedHit));
check('ломаная из одной точки не имеет рёбер', nearestOnPolyline({ x: 0, y: 0 }, [{ x: 1, y: 1 }]) === null);

// ── ПРОРЕЖИВАНИЕ ───────────────────────────────────────────────────────────────────────────────
//
// Сырой указатель отдаёт точку на каждое движение — сотни за росчерк, и все они уезжают в
// JSON-колонку, в отпечаток секции и в каждое чтение карточки.
const line = Array.from({ length: 50 }, (_, i) => ({ x: i * 2, y: 0 }));
check('прямая сводится к двум точкам', simplifyPath(line, 0.5).length === 2);
const kinked = [...line, { x: 100, y: 40 }, { x: 140, y: 0 }];
const keptKink = simplifyPath(kinked, 0.5);
check('излом переживает прореживание', keptKink.some((p) => p.x === 100 && p.y === 40),
  JSON.stringify(keptKink));
check('концы никогда не выкидываются', keptKink[0].x === 0 && keptKink[keptKink.length - 1].x === 140);
check('две точки не трогаются', simplifyPath([{ x: 0, y: 0 }, { x: 1, y: 1 }], 5).length === 2);

// Потолок — ЖЁСТКИЙ: сервер откажет в сохранении ВСЕЙ карточки за росчерк, который человек
// считает уже сделанным. Порог подбирается удвоением, а не угадывается.
const wiggly = Array.from({ length: 500 }, (_, i) => ({ x: i, y: (i % 7) * 3 }));
const capped = simplifyToLimit(wiggly, 64);
check('след укладывается в потолок', capped.length <= 64, `осталось ${capped.length}`);
check('концы следа на месте', capped[0].x === 0 && capped[capped.length - 1].x === 499);
check('короткий след не трогается', simplifyToLimit(stroke, 64).length === stroke.length);

// Патологический вход: 500 точек, каждая заметно в стороне от хорды соседей. Никакой порог их не
// сведёт, и функция обязана всё равно уложиться в потолок — равномерной выборкой.
const noise = Array.from({ length: 500 }, (_, i) => ({ x: i, y: i % 2 ? 1e6 : -1e6 }));
const forced = simplifyToLimit(noise, 40);
check('патологический след всё равно влезает', forced.length <= 40, `осталось ${forced.length}`);
check('и не теряет концы', forced[0].x === 0 && forced[forced.length - 1].x === 499);

// ── R20: ВАРП КАРТИНКИ АРТВОРКА НА ЧЕТЫРЕ РУЧКИ ─────────────────────────────────────────────────
// Углы картинки садятся РОВНО на ручки (TL, TR, BR, BL — порядок `rectCorners`), а середина — по
// проекции. Если формула однажды съедет (перепутаны g/h, порядок вершин), картинка перестанет
// сидеть в своих углах — на глаз это видно не сразу, а проба ловит сразу.
const NEAR = 1e-6;
const nearP = (p, q) => p && Math.abs(p.x - q.x) < NEAR && Math.abs(p.y - q.y) < NEAR;
const quads = [
  { n: 'прямоугольник', q: [{ x: 10, y: 20 }, { x: 110, y: 20 }, { x: 110, y: 80 }, { x: 10, y: 80 }] },
  { n: 'параллелограмм', q: [{ x: 20, y: 10 }, { x: 120, y: 30 }, { x: 100, y: 90 }, { x: 0, y: 70 }] },
  { n: 'трапеция-перспектива', q: [{ x: 40, y: 10 }, { x: 80, y: 10 }, { x: 120, y: 100 }, { x: 0, y: 100 }] },
  { n: 'косой (как у владельца)', q: [{ x: 80, y: 58 }, { x: 342, y: 43 }, { x: 290, y: 204 }, { x: 50, y: 204 }] },
];
for (const { n, q } of quads) {
  const H = squareToQuad(q);
  check(`${n}: гомография есть`, !!H);
  const corners = [[0, 0], [1, 0], [1, 1], [0, 1]].map(([u, v]) => applyHomography(H, u, v));
  check(`${n}: углы картинки ровно на ручках TL,TR,BR,BL`, corners.every((p, i) => nearP(p, q[i])), JSON.stringify(corners));
  // Середина квадрата — точка пересечения диагоналей четырёхугольника (проекция сохраняет прямые).
  const [a, b, c, d] = q;
  const den = (a.x - c.x) * (b.y - d.y) - (a.y - c.y) * (b.x - d.x);
  const t = ((a.x - b.x) * (b.y - d.y) - (a.y - b.y) * (b.x - d.x)) / den;
  const X = { x: a.x + t * (c.x - a.x), y: a.y + t * (c.y - a.y) };
  check(`${n}: центр картинки — пересечение диагоналей`, nearP(applyHomography(H, 0.5, 0.5), X), JSON.stringify([applyHomography(H, 0.5, 0.5), X]));
}
const par = quads[1].q;
const Hp = squareToQuad(par);
check('у параллелограмма проекция аффинна (g=h=0)', Hp.g === 0 && Hp.h === 0);
check(
  'центр параллелограмма — среднее вершин',
  nearP(applyHomography(Hp, 0.5, 0.5), { x: par.reduce((s, p) => s + p.x, 0) / 4, y: par.reduce((s, p) => s + p.y, 0) / 4 }),
);
check('вырожденная зона (три точки на прямой) не варпится', squareToQuad([{ x: 0, y: 0 }, { x: 50, y: 0 }, { x: 100, y: 0 }, { x: 0, y: 0 }]) === null);
check('не четыре точки — не варпится', squareToQuad(par.slice(0, 3)) === null);

// CSS matrix3d (T27, R35): углы элемента w×h с transform-origin 0 0 садятся ровно на ручки, центр —
// на пересечение диагоналей. Умножение — как у браузера: столбцы, затем деление на w.
const m3 = (m, x, y) => {
  const X = m[0] * x + m[4] * y + m[12];
  const Y = m[1] * x + m[5] * y + m[13];
  const W = m[3] * x + m[7] * y + m[15];
  return { x: X / W, y: Y / W, w: W };
};
for (const { n, q } of quads) {
  const w = 137;
  const h = 59;
  const M3 = quadMatrix3d(q, w, h);
  check(`${n}: matrix3d есть, 16 чисел`, Array.isArray(M3) && M3.length === 16);
  const cs = [[0, 0], [w, 0], [w, h], [0, h]].map(([x, y]) => m3(M3, x, y));
  check(`${n}: matrix3d — углы элемента ровно на ручках`, cs.every((p, i) => nearP(p, q[i])), JSON.stringify(cs));
  check(`${n}: matrix3d — центр как у проекции`, nearP(m3(M3, w / 2, h / 2), applyHomography(squareToQuad(q), 0.5, 0.5)));
  // Выпуклая зона: знаменатель положителен по всему элементу — картинка не уходит за горизонт.
  let minW = Infinity;
  for (let i = 0; i <= 20; i++) for (let j = 0; j <= 20; j++) minW = Math.min(minW, m3(M3, (w * i) / 20, (h * j) / 20).w);
  check(`${n}: matrix3d — w > 0 по всей картинке`, minW > 0, `${minW}`);
  // Разложение для печати: translate(tx,ty)·perspective(d)·matrix3d(m) — та же проекция, и при
  // равномерном масштабе кадра k (длины tx, ty, d и размер элемента ×k) — та же проекция ×k.
  const P = quadPerspectiveParts(q, w, h);
  const viaParts = (k, x, y) => {
    const m = P.m;
    const X = m[0] * x + m[4] * y;
    const Y = m[1] * x + m[5] * y;
    const Z = m[2] * x + m[6] * y;
    const W = 1 - Z / (P.d * k);
    return { x: (X + P.tx * k * W) / W, y: (Y + P.ty * k * W) / W };
  };
  for (const k of [1, 0.62, 1.7]) {
    const cs2 = [[0, 0], [w, 0], [w, h], [0, h]].map(([x, y]) => viaParts(k, x * k, y * k));
    check(`${n}: разложение ×${k} — углы на ручках ×${k}`, cs2.every((p, i) => nearP(p, { x: q[i].x * k, y: q[i].y * k })), JSON.stringify(cs2));
  }
  const c1 = viaParts(1, w * 0.3, h * 0.8);
  check(`${n}: разложение = matrix3d внутри картинки`, nearP(c1, m3(M3, w * 0.3, h * 0.8)));
}

// Годность зоны (R34): выпуклая — да; вогнутая (угол утянут внутрь, как у владельца), перекрученная
// («бантик»), три точки на прямой, почти прямой угол (> 175°), крошечная — нет.
const sq = [{ x: 0, y: 0 }, { x: 100, y: 0 }, { x: 100, y: 100 }, { x: 0, y: 100 }];
const owner = [{ x: 340, y: 548 }, { x: 547, y: 344 }, { x: 547, y: 548 }, { x: 505, y: 505 }]; // shots/owner-ref-warp-explode.png, переставлено в TL,TR,BR,BL обхода
const concave = [{ x: 0, y: 0 }, { x: 100, y: 0 }, { x: 40, y: 40 }, { x: 0, y: 100 }];
const bowtie = [{ x: 0, y: 0 }, { x: 100, y: 100 }, { x: 100, y: 0 }, { x: 0, y: 100 }];
const collinear = [{ x: 0, y: 0 }, { x: 50, y: 0 }, { x: 100, y: 0 }, { x: 0, y: 100 }];
const flat = [{ x: 0, y: 0 }, { x: 100, y: 0 }, { x: 52, y: 52 }, { x: 0, y: 100 }]; // угол в TR/BL ≈ 177°
const tiny = [{ x: 0, y: 0 }, { x: 2, y: 0 }, { x: 2, y: 2 }, { x: 0, y: 2 }];
check('квадрат годен', quadIsSound(sq, 16));
check('квадрат годен и в обратном обходе', quadIsSound(sq.slice().reverse(), 16));
check('косой (как у владельца) годен', quadIsSound(quads[3].q, 16));
check('вогнутая — нет', !quadIsSound(concave));
check('вогнутая (как на снимке владельца) — нет', !quadIsSound(owner));
check('перекрученная — нет', !quadIsSound(bowtie));
check('три точки на прямой — нет', !quadIsSound(collinear));
check('почти прямой угол (177°) — нет при 175°', !quadIsSound(flat, 0, 175));
check('почти прямой угол (177°) — да при 179° (отрисовка мягче ручки)', quadIsSound(flat, 0, 179));
check('крошечная (4 px²) — нет при полу 16 px²', !quadIsSound(tiny, 16));
check('не четыре точки — нет', !quadIsSound(sq.slice(0, 3)));
check('matrix3d у вогнутой — null', quadMatrix3d(concave, 10, 10) === null);
check('matrix3d у перекрученной — null', quadMatrix3d(bowtie, 10, 10) === null);

// Ручка упирается: угол BR тянут за диагональ — он встаёт на границу (годная, у самой границы),
// а не остаётся на старте и не перепрыгивает.
const okQ = (q) => quadIsSound(q, 16);
const clamped = clampQuadCorner(sq, 2, { x: -20, y: -20 }, okQ);
const withC = sq.map((p, i) => (i === 2 ? clamped : p));
check('упор: зона годна', okQ(withC), JSON.stringify(clamped));
check('упор: угол сдвинулся к руке', clamped.x < 100 - 30, JSON.stringify(clamped));
check('упор: угол у границы (шаг дальше — негодно)', !okQ(sq.map((p, i) => (i === 2 ? { x: clamped.x - 1, y: clamped.y - 1 } : p))), JSON.stringify(clamped));
check('годная цель — ровно туда', (() => { const t = clampQuadCorner(sq, 2, { x: 80, y: 120 }, okQ); return t.x === 80 && t.y === 120; })());
check('старт негоден (старая запись) — цель как есть', (() => { const t = clampQuadCorner(concave, 2, { x: 30, y: 30 }, okQ); return t.x === 30 && t.y === 30; })());

// Зона под пропорции картинки при первом прикреплении.
const wide = fitQuadToAspect([{ x: 0, y: 0 }, { x: 100, y: 0 }, { x: 100, y: 100 }, { x: 0, y: 100 }], 2);
check(
  'квадратная зона под картинку 2:1 → 100×50 по центру, порядок TL,TR,BR,BL',
  nearP(wide[0], { x: 0, y: 25 }) && nearP(wide[1], { x: 100, y: 25 }) && nearP(wide[2], { x: 100, y: 75 }) && nearP(wide[3], { x: 0, y: 75 }),
  JSON.stringify(wide),
);
const rot = [{ x: 50, y: 0 }, { x: 100, y: 50 }, { x: 50, y: 100 }, { x: 0, y: 50 }]; // ромб под 45°
const fitted = fitQuadToAspect(rot, 0.5);
const len = (p, q) => Math.hypot(p.x - q.x, p.y - q.y);
check(
  'повёрнутая зона сохраняет поворот и центр, стороны 1:2',
  Math.abs(len(fitted[0], fitted[1]) / len(fitted[1], fitted[2]) - 0.5) < 1e-9 &&
    nearP({ x: fitted.reduce((s, p) => s + p.x, 0) / 4, y: fitted.reduce((s, p) => s + p.y, 0) / 4 }, { x: 50, y: 50 }) &&
    Math.abs((fitted[1].y - fitted[0].y) / (fitted[1].x - fitted[0].x) - 1) < 1e-9,
  JSON.stringify(fitted),
);

console.log(`${pass} из ${pass + fail} проверок прошло`);
process.exit(fail === 0 ? 0 : 1);
