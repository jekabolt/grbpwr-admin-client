#!/usr/bin/env node
// Прогон математики вида полотна фулскрина (Ф3).
//
// Проверяет пять чистых функций, каждая из которых ошибается ТИХО и одинаково правдоподобно на
// 100%: `toWorld` без деления на зум (дроп мимо ноды тем сильнее, чем ближе приближено), `fitView`
// без пола читаемости (0.3× вместо экрана), `zoomAt`, не удерживающий точку под курсором (мир
// уезжает из-под руки), лист-подложка, сжимающаяся посреди жеста, и кламп `--hk`, красящий
// штриховку жирнее контура на 2.5× — последнее видно только на бумаге.
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
const { toWorld, fromWorld, fitView, zoomAt, hatchK, sheetRect, FIT_INSET, FIT_MIN, FIT_MAX, OPEN_FLOOR, SHEET_PAD, ZOOM_MIN, ZOOM_MAX } =
  await import(pathToFileURL(outfile).href);

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

// --- итог -----------------------------------------------------------------------------------------
console.log(
  failed.size === 0
    ? `\n${checks} из ${checks} проверок прошло`
    : `\n${failed.size} провалов из ${checks} проверок`,
);
process.exit(failed.size === 0 ? 0 : 1);
