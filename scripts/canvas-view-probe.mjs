#!/usr/bin/env node
// Прогон математики вида полотна фулскрина (Ф3, дополнено Ф4).
//
// Проверяет чистые функции вида, каждая из которых ошибается ТИХО и одинаково правдоподобно на
// 100%: `toWorld` без деления на зум (дроп мимо ноды тем сильнее, чем ближе приближено), `fitView`
// без пола читаемости (0.3× вместо экрана), `zoomAt`, не удерживающий точку под курсором (мир
// уезжает из-под руки), лист-подложка, сжимающаяся посреди жеста, и кламп `--hk`, красящий
// штриховку жирнее контура на 2.5× — последнее видно только на бумаге.
//
// Ф4 добавила три: маркизу (касание против вложения), автопан (знак, противоположный scroll-модели
// инлайна, и деление на зум) и доводку панорамой минимальным сдвигом.
//
//   node scripts/canvas-view-probe.mjs

import { build } from 'esbuild';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, resolve } from 'node:path';
import { tmpdir } from 'node:os';

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, '..');
const entry = resolve(root, 'scripts/canvas-view-probe-entry.ts');

const outfile = resolve(tmpdir(), `canvas-view-${process.pid}.mjs`);
await build({
  entryPoints: [entry],
  bundle: true,
  format: 'esm',
  platform: 'node',
  outfile,
  logLevel: 'silent',
});
const {
  toWorld,
  fromWorld,
  fitView,
  zoomAt,
  hatchK,
  sheetRect,
  marqueeHits,
  autopanDelta,
  autopanTick,
  revealDelta,
  FIT_INSET,
  FIT_MIN,
  FIT_MAX,
  OPEN_FLOOR,
  SHEET_PAD,
  ZOOM_MIN,
  ZOOM_MAX,
  EDGE_PAN,
  PAN_SPEED,
  REVEAL_MARGIN,
} = await import(pathToFileURL(outfile).href);

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
/** Сравнение с допуском: пан считается делением и умножением, точного равенства ждать нельзя. */
const near = (name, got, want, eps = 1e-9) => {
  checks++;
  if (!(Math.abs(got - want) <= eps)) fail(name, `${got} ≠ ${want} (±${eps})`);
};
const nearPt = (name, got, want, eps = 1e-9) => {
  near(`${name}.x`, got.x, want.x, eps);
  near(`${name}.y`, got.y, want.y, eps);
};

const RECT = { left: 100, top: 40 };

// --- toWorld: (client − rect − pan) / zoom -------------------------------------------------------
console.log('toWorld — (client − rect − pan) / zoom');

// Нейтральный вид: мир совпадает с вьюпортом, остаётся только вычесть его угол.
nearPt('единичный вид', toWorld(150, 90, RECT, { pan: { x: 0, y: 0 }, zoom: 1 }), { x: 50, y: 50 });

// Панорама без зума: сдвиг вычитается один в один.
nearPt(
  'пан без зума',
  toWorld(150, 90, RECT, { pan: { x: 20, y: -10 }, zoom: 1 }),
  { x: 30, y: 60 },
);

// ЗУМ БЕЗ ПАНА — тот случай, который ловит забытое деление: без него ответ был бы {50,50}, то есть
// вдвое дальше от начала мира, чем на самом деле.
nearPt('зум без пана', toWorld(150, 90, RECT, { pan: { x: 0, y: 0 }, zoom: 2 }), { x: 25, y: 25 });
nearPt(
  'зум < 1 без пана',
  toWorld(150, 90, RECT, { pan: { x: 0, y: 0 }, zoom: 0.5 }),
  { x: 100, y: 100 },
);

// ПОРЯДОК ОПЕРАЦИЙ: пан вычитается ДО деления. Поделив сначала, получили бы {40,45} — ошибка,
// растущая с зумом и незаметная на 1×.
nearPt('пан и зум вместе', toWorld(150, 90, RECT, { pan: { x: 20, y: 10 }, zoom: 2 }), { x: 15, y: 20 });

// Обратимость при любых пане и зуме: `fromWorld` — единственная проверка, не повторяющая формулу.
for (const view of [
  { pan: { x: 0, y: 0 }, zoom: 1 },
  { pan: { x: 137, y: -49 }, zoom: 0.35 },
  { pan: { x: -212.5, y: 88.25 }, zoom: 2.5 },
  { pan: { x: 13.7, y: 0.5 }, zoom: 1.6 },
]) {
  for (const p of [
    { x: 0, y: 0 },
    { x: 12.5, y: -300 },
    { x: 1840, y: 970 },
  ]) {
    const back = toWorld(...Object.values(fromWorld(p.x, p.y, RECT, view)), RECT, view);
    nearPt(`обратимость pan=${view.pan.x}/${view.pan.y} zoom=${view.zoom} @${p.x},${p.y}`, back, p, 1e-6);
  }
}

// --- fitView -------------------------------------------------------------------------------------
console.log('\nfitView — вписывание, кламп и пол читаемости');

is('inset — 56', FIT_INSET, 56);
is('кламп ручного fit — 0.35…1.6', [FIT_MIN, FIT_MAX], [0.35, 1.6]);
is('пол открытия — 0.5', OPEN_FLOOR, 0.5);

// Ровно вписывающийся контент: 888 = 1000 − 56*2, значит зум 1 и центрирование без сдвига.
{
  const v = fitView({ x: 0, y: 0, w: 888, h: 488 }, { w: 1000, h: 600 });
  near('точное вписывание: зум 1', v.zoom, 1);
  nearPt('точное вписывание: контент по центру', v.pan, { x: 56, y: 56 });
}

// Контент не в начале координат: его угол участвует в пане.
{
  const v = fitView({ x: 200, y: 100, w: 888, h: 488 }, { w: 1000, h: 600 });
  near('сдвинутый контент: зум 1', v.zoom, 1);
  nearPt('сдвинутый контент: пан учитывает угол', v.pan, { x: 56 - 200, y: 56 - 100 });
}

// КЛАМП СВЕРХУ: три плитки в углу не имеют права раздуться во весь экран.
{
  const v = fitView({ x: 0, y: 0, w: 100, h: 60 }, { w: 1000, h: 600 });
  near('крошечный контент: зум упёрся в 1.6', v.zoom, FIT_MAX);
  // Центрирование остаётся: контент влезает с запасом.
  nearPt('крошечный контент: центр', v.pan, { x: (1000 - 100 * 1.6) / 2, y: (600 - 60 * 1.6) / 2 });
}

// КЛАМП СНИЗУ у РУЧНОГО fit: без пола он и должен уйти в мелкое — «показать всё» просили явно.
{
  const v = fitView({ x: 0, y: 0, w: 10000, h: 6000 }, { w: 1000, h: 600 });
  near('огромный контент: ручной fit упёрся в 0.35', v.zoom, FIT_MIN);
}

// ПОЛ ЧИТАЕМОСТИ ПРИ ОТКРЫТИИ. 888/0.3 = 2960: нескламплённое вписывание даёт ровно 0.3×, и
// ручной fit сажает его на свой нижний упор 0.35 — а вход в фулскрин обязан подняться до 0.5.
{
  const content = { x: 0, y: 0, w: 2960, h: 1626.6666666666667 };
  const plain = fitView(content, { w: 1000, h: 600 });
  near('контрольный замер: fit 0.3 сел на нижний упор ручного 0.35', plain.zoom, FIT_MIN, 1e-9);
  const v = fitView(content, { w: 1000, h: 600 }, { floor: OPEN_FLOOR, anchorTopLeft: true });
  near('пол поднял зум до 0.5', v.zoom, 0.5);
  // Прижато к верхне-левому углу: начало сборки видно, срезано справа и снизу.
  nearPt('панорама к верхне-левому углу', v.pan, { x: FIT_INSET, y: FIT_INSET });
}

// Пол между упорами ручного клампа: 888/0.4 = 2220 даёт вписывание 0.4 — оно проходит кламп
// нетронутым, и поднимает его именно ПОЛ, а не нижний упор.
{
  const content = { x: 0, y: 0, w: 2220, h: 1220 };
  near('контрольный замер: чистое вписывание 0.4', fitView(content, { w: 1000, h: 600 }).zoom, 0.4, 1e-9);
  const v = fitView(content, { w: 1000, h: 600 }, { floor: OPEN_FLOOR, anchorTopLeft: true });
  near('пол поднял 0.4 до 0.5', v.zoom, 0.5);
  nearPt('и прижал к верхне-левому углу', v.pan, { x: FIT_INSET, y: FIT_INSET });
}

// Тот же пол на контенте, СДВИНУТОМ от начала координат: якорь считается от угла контента.
{
  const v = fitView(
    { x: 120, y: 80, w: 2960, h: 1700 },
    { w: 1000, h: 600 },
    { floor: OPEN_FLOOR, anchorTopLeft: true },
  );
  near('сдвинутый контент под полом: зум 0.5', v.zoom, 0.5);
  nearPt('сдвинутый контент под полом: якорь от угла', v.pan, {
    x: FIT_INSET - 120 * 0.5,
    y: FIT_INSET - 80 * 0.5,
  });
}

// ЯКОРЬ НЕ СРАБАТЫВАЕТ, КОГДА КОНТЕНТ ВЛЕЗАЕТ. Иначе вход на маленькую карточку прижимал бы её
// в угол при живом свободном месте вокруг.
{
  const v = fitView(
    { x: 0, y: 0, w: 888, h: 488 },
    { w: 1000, h: 600 },
    { floor: OPEN_FLOOR, anchorTopLeft: true },
  );
  near('влезающий контент: зум 1, пол не при чём', v.zoom, 1);
  nearPt('влезающий контент: центрирование, а не угол', v.pan, { x: 56, y: 56 });
}

// Нулевой контент (карточка без деталей) не даёт ни NaN, ни Infinity.
{
  const v = fitView({ x: 0, y: 0, w: 0, h: 0 }, { w: 1000, h: 600 });
  checks++;
  if (!Number.isFinite(v.zoom) || !Number.isFinite(v.pan.x) || !Number.isFinite(v.pan.y)) {
    fail('пустой контент конечен', j(v));
  }
}

// ОТРИЦАТЕЛЬНОЕ НАЧАЛО КООРДИНАТ: assemblyLayout так не кладёт, но ручной драг узла влево — да.
// Формула линейна и знака не боится; замер держит это явным, а не подразумеваемым.
{
  const v = fitView({ x: -500, y: -300, w: 888, h: 488 }, { w: 1000, h: 600 });
  near('контент в минусе: зум 1', v.zoom, 1);
  nearPt('контент в минусе: пан компенсирует знак', v.pan, { x: 556, y: 356 });
  const anchored = fitView(
    { x: -500, y: -300, w: 2960, h: 1700 },
    { w: 1000, h: 600 },
    { floor: OPEN_FLOOR, anchorTopLeft: true },
  );
  near('контент в минусе под полом: зум 0.5', anchored.zoom, 0.5);
  nearPt('контент в минусе под полом: якорь от угла', anchored.pan, {
    x: FIT_INSET + 500 * 0.5,
    y: FIT_INSET + 300 * 0.5,
  });
}

// ВЫРОЖДЕННЫЙ ВЬЮПОРТ — уже, чем два inset (при живом гриде не случается, но нулевой rect до
// layout выглядит ровно так): вписывание обязано остаться конечным, а не уехать в NaN.
{
  for (const vp of [
    { w: 100, h: 80 },
    { w: 0, h: 0 },
  ]) {
    const v = fitView({ x: 0, y: 0, w: 400, h: 300 }, vp);
    checks++;
    if (!Number.isFinite(v.zoom) || !Number.isFinite(v.pan.x) || !Number.isFinite(v.pan.y)) {
      fail(`вьюпорт ${vp.w}×${vp.h} конечен`, j(v));
    }
  }
}

// --- zoomAt --------------------------------------------------------------------------------------
console.log('\nzoomAt — точка под курсором остаётся на месте');

is('кламп зума — 0.25…2.5', [ZOOM_MIN, ZOOM_MAX], [0.25, 2.5]);

// ГЛАВНОЕ СВОЙСТВО: мировая точка под курсором после зума лежит под тем же курсором.
for (const [z0, factor] of [
  [1, 1.2],
  [1, 1 / 1.2],
  [0.5, 2],
  [2, 0.5],
  [1.3, 1.05],
]) {
  const view = { pan: { x: 37, y: -19 }, zoom: z0 };
  const px = 420;
  const py = 260;
  const before = toWorld(RECT.left + px, RECT.top + py, RECT, view);
  const next = zoomAt(view, factor, px, py);
  const after = toWorld(RECT.left + px, RECT.top + py, RECT, next);
  nearPt(`точка под курсором zoom ${z0}×${factor}`, after, before, 1e-9);
}

near('зум вверх упирается в 2.5', zoomAt({ pan: { x: 0, y: 0 }, zoom: 2.4 }, 4, 100, 100).zoom, 2.5);
near('зум вниз упирается в 0.25', zoomAt({ pan: { x: 0, y: 0 }, zoom: 0.3 }, 0.1, 100, 100).zoom, 0.25);
{
  // На упоре пан не имеет права дёрнуться: жест ничего не изменил.
  const at = { pan: { x: 11, y: 22 }, zoom: 2.5 };
  is('на упоре вид не меняется', zoomAt(at, 2, 100, 100), at);
}

// --- sheetRect -----------------------------------------------------------------------------------
console.log('\nsheetRect — во время жеста лист только растёт');

is('ground вокруг работы — 280', SHEET_PAD, 280);
{
  const first = sheetRect({ x: 0, y: 0, w: 400, h: 300 }, null, false);
  is('первый лист — контент плюс ground', first, { x: -280, y: -280, w: 960, h: 860 });
  // Контент сжался посреди жеста: лист остаётся прежним.
  const shrunk = sheetRect({ x: 0, y: 0, w: 100, h: 100 }, first, false);
  is('во время жеста лист не сжимается', shrunk, first);
  // Контент вырос — лист растёт.
  const grown = sheetRect({ x: 0, y: 0, w: 600, h: 300 }, first, false);
  is('во время жеста лист растёт', grown, { x: -280, y: -280, w: 1160, h: 860 });
  // Жест кончился — лист садится на честный габарит.
  const settled = sheetRect({ x: 0, y: 0, w: 100, h: 100 }, grown, true);
  is('settle возвращает честный габарит', settled, { x: -280, y: -280, w: 660, h: 660 });
}

// --- hatchK --------------------------------------------------------------------------------------
console.log('\nhatchK — штриховка никогда не грубее, чем на 1×');

is('hatchK(0.5) === 1  (ниже 1× решётка едет с миром)', hatchK(0.5), 1);
is('hatchK(1) === 1', hatchK(1), 1);
is('hatchK(2.5) === 0.4  (на 2.5× решётка придержана)', hatchK(2.5), 0.4);
is('hatchK(2) === 0.5', hatchK(2), 0.5);
is('hatchK(0.25) === 1', hatchK(0.25), 1);
{
  // Монотонность: приближая, штриховку никогда не делаем плотнее предыдущего шага.
  let prev = Infinity;
  let ok = true;
  for (let z = 0.25; z <= 2.5001; z += 0.05) {
    const k = hatchK(z);
    if (k > prev + 1e-12) ok = false;
    prev = k;
  }
  checks++;
  if (!ok) fail('hatchK монотонно не растёт', 'нашёлся зум, на котором штриховка стала плотнее');
}

// --- marqueeHits ----------------------------------------------------------------------------------
console.log('\nmarqueeHits — касание = попадание');

// Три ноды в ряд: рамка по первой и краю второй обязана взять обе.
const NODES = [
  { key: 'FR', x: 0, y: 0, w: 100, h: 60 },
  { key: 'BK', x: 140, y: 0, w: 100, h: 60 },
  { key: 'SL', x: 0, y: 200, w: 100, h: 60 },
];

is('рамка вокруг одной ноды', marqueeHits({ x: -10, y: -10, w: 130, h: 90 }, NODES), ['FR']);
is('рамка мимо всех', marqueeHits({ x: 300, y: 300, w: 50, h: 50 }, NODES), []);

// КАСАНИЕ, А НЕ ВЛОЖЕНИЕ: рамка заходит на 10px в каждую из двух — обе взяты. При правиле
// вложения ответ был бы пуст, и жест читался бы как промах.
is(
  'касание краями берёт обе',
  marqueeHits({ x: 90, y: 10, w: 60, h: 20 }, NODES),
  ['FR', 'BK'],
);

// Рамка целиком ВНУТРИ ноды — тоже касание: короткий росчерк по крупному боксу берёт бокс.
is('рамка внутри ноды', marqueeHits({ x: 20, y: 20, w: 10, h: 10 }, NODES), ['FR']);

// КЛИК ПО ПУСТОМУ МЕСТУ БЕЗ ДВИЖЕНИЯ — рамка нулевой площади на пустой земле. Маркиза только с
// пустой земли и начинается, поэтому этот случай и есть весь «вырожденный»: он обязан дать пусто,
// иначе клик мимо всего сбрасывал бы выделение НЕ в пустое.
is('вырожденная рамка на пустой земле', marqueeHits({ x: 120, y: 100, w: 0, h: 0 }, NODES), []);
// Общая только КРОМКА: площадь пересечения нулевая, значит ещё не касание.
is('кромка в кромку — не касание', marqueeHits({ x: 100, y: 0, w: 40, h: 60 }, NODES), []);

// Рамка через весь мир — все ноды, в порядке раскладки.
is('рамка по всему миру', marqueeHits({ x: -50, y: -50, w: 500, h: 500 }, NODES), ['FR', 'BK', 'SL']);

// ЗУМ ≠ 1 МАРКИЗЕ БЕЗРАЗЛИЧЕН — и это ровно то, что делает её проверяемой: она живёт в МИРЕ, а
// перевод экранных углов в мировые делает `toWorld`. Замер держит связку явной: два экранных угла
// на 150% дают мировую рамку, попадающую по обеим соседним нодам.
{
  const view = { pan: { x: 30, y: -20 }, zoom: 1.5 };
  const a = toWorld(RECT.left + 30, RECT.top + 10, RECT, view);
  const b = toWorld(RECT.left + 260, RECT.top + 100, RECT, view);
  const rect = {
    x: Math.min(a.x, b.x),
    y: Math.min(a.y, b.y),
    w: Math.abs(b.x - a.x),
    h: Math.abs(b.y - a.y),
  };
  is('маркиза на 150% (углы через toWorld)', marqueeHits(rect, NODES), ['FR', 'BK']);
}

// --- autopanDelta ---------------------------------------------------------------------------------
console.log('\nautopanDelta — знак ПРОТИВОПОЛОЖЕН scroll-модели инлайна');

is('кромка автопана — 52', EDGE_PAN, 52);
is('скорость автопана — 14', PAN_SPEED, 14);

const VP = { left: 100, top: 40, right: 1100, bottom: 640 };

is('центр — автопана нет', autopanDelta(VP, { x: 600, y: 300 }), { x: 0, y: 0 });
// У ЛЕВОГО КРАЯ ПАН РАСТЁТ: мир едет вправо, открывая то, что слева. В scroll-модели тот же край
// даёт `scrollLeft -=`, то есть противоположный знак — это и есть ловушка дословного переноса.
is('левый край — pan.x растёт', autopanDelta(VP, { x: 120, y: 300 }), { x: PAN_SPEED, y: 0 });
is('правый край — pan.x падает', autopanDelta(VP, { x: 1080, y: 300 }), { x: -PAN_SPEED, y: 0 });
is('верхний край — pan.y растёт', autopanDelta(VP, { x: 600, y: 60 }), { x: 0, y: PAN_SPEED });
is('нижний край — pan.y падает', autopanDelta(VP, { x: 600, y: 620 }), { x: 0, y: -PAN_SPEED });
is('угол — обе оси разом', autopanDelta(VP, { x: 110, y: 630 }), { x: PAN_SPEED, y: -PAN_SPEED });
// Ровно на пороге автопана ещё нет: `< EDGE_PAN`, а не `<=`.
is('ровно на пороге — покоя', autopanDelta(VP, { x: 100 + EDGE_PAN, y: 300 }), { x: 0, y: 0 });
// Палец УШЁЛ за кромку (указатель захвачен) — пан продолжается, а не выключается.
is('за левым краем — пан продолжается', autopanDelta(VP, { x: 20, y: 300 }), { x: PAN_SPEED, y: 0 });

// --- autopanTick ----------------------------------------------------------------------------------
console.log('\nautopanTick — pan += δ, мировая точка −= δ/zoom');

// N ТИКОВ: пан ушёл на N·δ, а мировая точка прицела — на −N·δ/zoom. Вторая половина и есть та,
// без которой дроп «на подъехавший узел» молча становится перемещением.
for (const zoom of [1, 1.5, 0.5, 2.5]) {
  const delta = { x: PAN_SPEED, y: -PAN_SPEED };
  let view = { pan: { x: 37, y: -19 }, zoom };
  let ptr = { x: 320, y: 210 };
  const N = 7;
  for (let i = 0; i < N; i++) {
    const next = autopanTick(view, ptr, delta);
    view = next.view;
    ptr = next.ptrWorld;
  }
  near(`zoom ${zoom}: pan.x ушёл на N·δ`, view.pan.x, 37 + N * delta.x, 1e-9);
  near(`zoom ${zoom}: pan.y ушёл на N·δ`, view.pan.y, -19 + N * delta.y, 1e-9);
  near(`zoom ${zoom}: мир прицела −N·δ/zoom по x`, ptr.x, 320 - (N * delta.x) / zoom, 1e-9);
  near(`zoom ${zoom}: мир прицела −N·δ/zoom по y`, ptr.y, 210 - (N * delta.y) / zoom, 1e-9);
  near(`zoom ${zoom}: тик зум не трогает`, view.zoom, zoom);
}

// ГЛАВНОЕ СВОЙСТВО, не повторяющее формулу: палец НЕ ДВИГАЛСЯ, мир уехал — мировая точка под ним
// обязана совпасть с той, что посчитает `toWorld` от нового вида.
for (const zoom of [1, 1.5, 0.35, 2.5]) {
  const view0 = { pan: { x: 12, y: 44 }, zoom };
  const client = { x: RECT.left + 480, y: RECT.top + 260 };
  const ptr0 = toWorld(client.x, client.y, RECT, view0);
  const delta = { x: -PAN_SPEED, y: PAN_SPEED };
  const step = autopanTick(view0, ptr0, delta);
  nearPt(
    `zoom ${zoom}: точка под неподвижным пальцем совпала с toWorld`,
    step.ptrWorld,
    toWorld(client.x, client.y, RECT, step.view),
    1e-9,
  );
}

// Нулевая дельта — тождество: кадр без движения не имеет права шевельнуть ни вид, ни прицел.
{
  const view = { pan: { x: 5, y: 6 }, zoom: 1.3 };
  const r = autopanTick(view, { x: 1, y: 2 }, { x: 0, y: 0 });
  is('нулевая дельта не меняет пан', r.view.pan, view.pan);
  is('нулевая дельта не меняет зум', r.view.zoom, view.zoom);
  is('нулевая дельта не меняет прицел', r.ptrWorld, { x: 1, y: 2 });
}

// --- revealDelta ----------------------------------------------------------------------------------
console.log('\nrevealDelta — доводка МИНИМАЛЬНЫМ сдвигом');

is('поле доводки — 64', REVEAL_MARGIN, 64);

const SCREEN = { w: 1000, h: 600 };
const V1 = { pan: { x: 0, y: 0 }, zoom: 1 };

// Уже видно с запасом — руки прочь. Центрирование здесь увезло бы экран ради нуля информации.
is('нода в центре — сдвига нет', revealDelta({ x: 400, y: 250, w: 120, h: 60 }, SCREEN, V1), {
  x: 0,
  y: 0,
});
// За левой/верхней кромкой — подтянуть ровно до поля.
is('за левым краем', revealDelta({ x: -200, y: 250, w: 120, h: 60 }, SCREEN, V1), {
  x: REVEAL_MARGIN + 200,
  y: 0,
});
is('за верхним краем', revealDelta({ x: 400, y: -40, w: 120, h: 60 }, SCREEN, V1), {
  x: 0,
  y: REVEAL_MARGIN + 40,
});
// За правой кромкой — сдвинуть влево ровно настолько, чтобы КОНЕЦ бокса зашёл за поле.
is('за правым краем', revealDelta({ x: 960, y: 250, w: 120, h: 60 }, SCREEN, V1), {
  x: 1000 - REVEAL_MARGIN - 1080,
  y: 0,
});
// Ровно на границе поля — сдвига нет.
is('впритык к полю', revealDelta({ x: REVEAL_MARGIN, y: REVEAL_MARGIN, w: 100, h: 50 }, SCREEN, V1), {
  x: 0,
  y: 0,
});

// ЗУМ УЧАСТВУЕТ В ОБЕИХ ПОЛОВИНАХ: и в положении угла, и в размере. На 2× бокс 120px занимает 240,
// и та же мировая координата стоит вдвое дальше.
{
  const v = { pan: { x: 0, y: 0 }, zoom: 2 };
  // По x: угол 500 стоит на экране в 1000, конец — в 1240, надо подтянуть влево.
  // По y: угол 10 стоит в 20, то есть выше поля 64, — подтянуть вниз на 44.
  is('на 200% сдвиг считает и угол, и размер', revealDelta({ x: 500, y: 10, w: 120, h: 60 }, SCREEN, v), {
    x: 1000 - REVEAL_MARGIN - (1000 + 240),
    y: REVEAL_MARGIN - 20,
  });
}

// Панорама уже сдвинута — доводка считает от ЭКРАННОГО положения, а не от мирового.
{
  const v = { pan: { x: -900, y: 0 }, zoom: 1 };
  is('панорама учтена', revealDelta({ x: 500, y: 250, w: 120, h: 60 }, SCREEN, v), {
    x: REVEAL_MARGIN + 400,
    y: 0,
  });
}

// НОДА ШИРЕ ВЬЮПОРТА: гнаться за её концом значит увезти начало за кромку. Тогда единственная
// забота — чтобы начало было видно, и уже видное начало не двигается вовсе.
{
  const wide = { x: -300, y: 250, w: 2000, h: 60 };
  is('гигантская нода: начало подтянуто', revealDelta(wide, SCREEN, V1), { x: REVEAL_MARGIN + 300, y: 0 });
  is(
    'гигантская нода с видимым началом: покой',
    revealDelta({ x: 100, y: 250, w: 2000, h: 60 }, SCREEN, V1),
    { x: 0, y: 0 },
  );
}

// --- итог -----------------------------------------------------------------------------------------
console.log(
  failed.size === 0
    ? `\n${checks} из ${checks} проверок прошло`
    : `\n${failed.size} провалов из ${checks} проверок`,
);
process.exit(failed.size === 0 ? 0 : 1);
