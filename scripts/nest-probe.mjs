#!/usr/bin/env node
// Раскладка probe — the engine's only measuring instrument.
//
// This repo has no test runner (see CLAUDE.md), and the nesting engine is the one piece of
// it whose output is a PHYSICAL promise: pieces clear each other by the gap, everything
// declared placed really is on the fabric, the same input yields the same marker, and the
// marker does not quietly get longer. None of that is visible from a type check, and every
// one of them has been broken at least once by a change that type-checked cleanly.
//
// Two rules this file lives by, both learned the hard way:
//
//   1. NEVER measure the engine with the engine's own geometry. The previous class of
//      overlap bugs survived because clipper's Difference agreed with the defect in
//      clipper's Union. The verification here (nest-probe-entry.ts) is written separately
//      and deliberately brute-force.
//   2. NEVER let a probe pass by not looking. Every probe below runs the verification, and
//      the synthetic ones assert LENGTH against a recorded number — an engine that spaced
//      every piece 30 % further apart would otherwise print «ВСЁ ЗЕЛЁНОЕ», since the
//      clearance check is one-sided by construction and can only catch «too tight».
//
// Usage:
//   node scripts/nest-probe.mjs                       # synthetic probes only (no fixtures needed)
//   node scripts/nest-probe.mjs <file.dxf> [...]      # + real files, КАЖДЫЙ в двух режимах:
//                                                     # как есть и с ЗЕРКАЛЬНЫМИ ПАРАМИ
//   NEST_PROBE_PIECES=45 node scripts/nest-probe.mjs ~/Downloads/'summer men.dxf'
//
// Env knobs: NEST_PROBE_PIECES (distinct pieces, default 20), NEST_PROBE_BUDGET_MS
// (default 20000), NEST_PROBE_LAYER (contour layer; default = the layer with most blocks),
// NEST_PROBE_GRAIN (grain layer, default none), NEST_PROBE_PER_PIECE (instances per piece),
// NEST_PROBE_MIRROR=1 (половина экземпляров ЗЕРКАЛЬНЫЕ — реальный файл как комплект парных
// деталей; предпросчёт NFP при этом ровно вдвое больше, что и есть цена зеркала).
import { build } from 'esbuild';
import { readFile } from 'node:fs/promises';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, resolve } from 'node:path';
import { tmpdir } from 'node:os';

const here = dirname(fileURLToPath(import.meta.url));
const outfile = resolve(tmpdir(), `nest-probe-${process.pid}.mjs`);

await build({
  entryPoints: [resolve(here, 'nest-probe-entry.ts')],
  bundle: true,
  platform: 'node',
  format: 'esm',
  target: 'node20',
  outfile,
  logLevel: 'warning',
});

const mod = await import(pathToFileURL(outfile).href);

const args = process.argv.slice(2);
const budgetMs = Number(process.env.NEST_PROBE_BUDGET_MS ?? 20_000);
const maxPieces = Number(process.env.NEST_PROBE_PIECES ?? 20);
// Экземпляров на деталь и сколько из них зеркальные: NEST_PROBE_MIRROR=1 меряет реальный файл
// как комплект парных деталей (кроится левая и правая) — тот режим, в котором предпросчёт NFP
// растёт, и растёт на настоящей геометрии.
const perPiece = Number(process.env.NEST_PROBE_PER_PIECE ?? (process.env.NEST_PROBE_MIRROR ? 2 : 1));
const mirrored = Number(process.env.NEST_PROBE_MIRROR ?? 0) ? Math.floor(perPiece / 2) : 0;

let failures = 0;
const check = (ok, label, detail) => {
  console.log(`${ok ? '  ok  ' : '  FAIL'} ${label}${detail ? ` — ${detail}` : ''}`);
  if (!ok) failures++;
};

const baseCfg = {
  fabricWidthCm: 140,
  gapCm: 0.5,
  edgeMarginCm: 0,
  allowCrossGrain: false,
  fabricDirection: 'any',
  grainLayer: '',
  seamAllowanceCm: 0,
  rdpEpsCm: 0.05,
};

// Every synthetic run goes through here, so no probe can pass by not looking at geometry.
function verify(pieces, res, cfg, label) {
  const v = mod.verifyPlacements(pieces, res, cfg);
  check(v.overlaps === 0, `${label}: ноль наложений`, `${v.overlaps}`);
  check(
    v.shortPairs === 0,
    `${label}: зазор выдержан по настоящим контурам`,
    `коротких пар ${v.shortPairs}, минимум ${v.minClearanceCm.toFixed(4)} см`,
  );
  check(v.outsideWidth === 0, `${label}: ничего не вылезло за полосу`, `${v.outsideWidth}`);
  return v;
}

// ДЕТЕРМИНИЗМ СРАВНИВАЕТСЯ ПОКОЛЕНИЕ В ПОКОЛЕНИЕ, а не по итогу двух прогонов.
//
// Обещание движка (nest/index.ts) условное: одинаковый вход даёт одинаковый маркер НА МАШИНЕ,
// которая успевает пройти те же поколения; часы — вторичный стоп, и на них детерминизм
// сознательно разменян на отзывчивость. Сравнение итогов двух прогонов с ОГРАНИЧИВАЮЩИМ
// бюджетом проверяет поэтому не движок, а ровность машины: замеры показали 66/79 и 330/278
// поколений в соседних запусках, и итоги законно расходились — проба падала на зелёном коде.
// Гонять её с заведомо избыточным бюджетом (оба прогона до конца) значит перестать проверять
// то, ради чего она есть.
//
// Прогресс отдаёт лучший маркер НА КАЖДОМ поколении, и это ответ: сравниваются траектории на
// общих поколениях. Расхождение хоть на одном — настоящая недетерминированность; разное число
// поколений — часы, и они больше ничего не портят.
const traceGenerations = (key) => {
  const seen = new Map();
  return {
    seen,
    onProgress: (p) => {
      if (p.phase === 'ga' && p.best && p.generation != null) seen.set(p.generation, key(p.best));
    },
  };
};

function checkSameTrajectory(ta, tb, label) {
  const common = [...ta.seen.keys()].filter((g) => tb.seen.has(g));
  const bad = common.filter((g) => ta.seen.get(g) !== tb.seen.get(g));
  check(
    common.length >= 3 && bad.length === 0,
    label,
    `общих поколений ${common.length}, разошлись на ${bad.length}${bad.length ? ` (первое ${bad[0]})` : ''}`,
  );
}

// ── probe 1: a piece that cannot fit the fabric width ──────────────────────────────────
// The engine must SAY it did not fit. Before Ф0 it silently dropped the piece from the gene
// list, and the only trace was placedCount < totalCount with no reason attached.
{
  console.log('\n── «не влезло»: деталь шире полосы ──');
  const pieces = mod.syntheticPieces([
    { w: 30, h: 30 },
    { w: 40, h: 200 }, // 200 cm across a 140 cm fabric — impossible in any rotation
    { w: 25, h: 25 },
  ]);
  const cfg = { ...baseCfg, pieces: pieces.map((p) => ({ pieceId: p.id, quantity: 1 })), timeBudgetMs: 3_000 };
  const res = await mod.nest(pieces, cfg, () => false, () => {});
  check(res.placedCount === 2, 'разместились только две детали', `placed=${res.placedCount}/${res.totalCount}`);
  check((res.unplaced ?? []).length === 1, 'непоместившаяся деталь названа', JSON.stringify(res.unplaced ?? []));
  check((res.unplaced ?? [])[0]?.reason === 'width', 'причина — ширина полосы', (res.unplaced ?? [])[0]?.reason);
  verify(pieces, res, cfg, 'не влезло');
}

// ── probe 2: determinism AND length ────────────────────────────────────────────────────
// The budget deliberately BINDS (the run stops on the clock, not on maxGenerations): two
// runs that both saturate MAX_GENERATIONS would agree for a reason that says nothing about
// the change under test.
{
  console.log('\n── детерминизм и длина ──');
  const pieces = mod.syntheticPieces(
    Array.from({ length: 12 }, (_, i) => ({ w: 20 + (i % 4) * 7, h: 30 + (i % 3) * 11 })),
  );
  const cfg = {
    ...baseCfg,
    pieces: pieces.map((p) => ({ pieceId: p.id, quantity: 6 })),
    timeBudgetMs: 4_000,
  };
  const key = (r) =>
    JSON.stringify(
      r.placements.map((p) => [p.pieceId, p.instance, p.rot, Math.round(p.x * 1000), Math.round(p.y * 1000)]),
    );
  const ta = traceGenerations(key);
  const tb = traceGenerations(key);
  const a = await mod.nest(pieces, cfg, () => false, ta.onProgress);
  const b = await mod.nest(pieces, cfg, () => false, tb.onProgress);
  check(
    a.generation < 399,
    'бюджет действительно ограничивал (иначе сравнение — тавтология)',
    `generation=${a.generation}`,
  );
  checkSameTrajectory(ta, tb, 'два прогона идут поколение в поколение одинаково');
  check(
    a.generation !== b.generation || key(a) === key(b),
    'при равном числе поколений совпадают и итоги',
    `gen ${a.generation}/${b.generation}`,
  );
  check(a.placedCount === a.totalCount, 'всё размещено', `${a.placedCount}/${a.totalCount}`);
  // Measured at 746.9 cm on the commit that added this probe; the ceiling sits ~7 % above it.
  // It exists to catch the ONE risk the eps ladder introduces — a coarser simplification
  // inflates the NFP octagon and spreads the marker out — which the clearance check cannot
  // see, being one-sided by construction (it only ever catches «too tight»).
  const LENGTH_CEILING_CM = 800;
  check(
    a.usedLengthCm <= LENGTH_CEILING_CM,
    'маркер не раздулся',
    `${a.usedLengthCm.toFixed(1)} см при потолке ${LENGTH_CEILING_CM}`,
  );
  verify(pieces, a, cfg, 'детерминизм');
}

// ── probe 3: cancellation reaches the tails ────────────────────────────────────────────
// The cancel flag is flipped BY A TIMER, not read from a clock. That distinction is the
// whole point: in the worker «стоп» arrives as a message, so a flag the engine can only
// observe after yielding is what production actually has. A clock-based flag would flip
// synchronously mid-loop and let this probe certify a responsiveness the worker cannot
// deliver — the instrument agreeing with the defect, one level up.
{
  console.log('\n── отмена: доходит до хвостов ──');
  const pieces = mod.syntheticPieces(
    Array.from({ length: 14 }, (_, i) => ({ w: 18 + (i % 5) * 6, h: 24 + (i % 4) * 9 })),
  );
  let stop = false;
  const timer = setTimeout(() => {
    stop = true;
  }, 700);
  const started = Date.now();
  const res = await mod.nest(
    pieces,
    {
      ...baseCfg,
      allowCrossGrain: true,
      pieces: pieces.map((p) => ({ pieceId: p.id, quantity: 3 })),
      timeBudgetMs: 60_000,
    },
    () => stop,
    () => {},
  );
  clearTimeout(timer);
  const elapsed = Date.now() - started;
  check(elapsed < 8_000, 'отмена вернула управление быстро', `${elapsed} ms`);
  check(res.cancelled === true, 'результат помечен отменённым', JSON.stringify({ cancelled: res.cancelled }));
}

// ── probe 4: compaction alone is interruptible ─────────────────────────────────────────
// Targeted at the tail probe 3 does NOT reach: with a generous budget the GA finishes and
// compaction is the only phase left, so a cancel raised after the GA has to be answered by
// compactPlacements itself. Before this it could not be: the poll sat in synchronous code,
// so the flag it read could never have been set.
{
  console.log('\n── отмена во время компакции ──');
  const pieces = mod.syntheticPieces(
    Array.from({ length: 10 }, (_, i) => ({ w: 16 + (i % 4) * 5, h: 22 + (i % 3) * 8 })),
  );
  let gaSeen = 0;
  let stop = false;
  const res = await mod.nest(
    pieces,
    { ...baseCfg, pieces: pieces.map((p) => ({ pieceId: p.id, quantity: 2 })), timeBudgetMs: 2_500 },
    () => stop,
    (p) => {
      // Arm the stop only once the search is under way, so the cancel lands late — in or
      // just before compaction — rather than during the prepass.
      if (p.phase === 'ga' && ++gaSeen === 3) setTimeout(() => (stop = true), 0);
    },
  );
  check(res.placements.length > 0 || res.cancelled, 'поздняя отмена не потеряла раскладку', JSON.stringify({ placed: res.placements.length, cancelled: res.cancelled }));
  if (res.placements.length > 0) verify(pieces, res, baseCfg, 'после поздней отмены');
}

// ── probe 5: направление ткани доходит до движка ───────────────────────────────────────
// Ф1's acceptance check. `fabric_direction` has existed on the BOM line since migration 0073
// and reached nothing but a digest: the раскладка flipped pieces 180° on napped cloth and
// nobody could see it, because a flipped contour looks identical on screen and only shows up
// as a two-tone garment under the lights.
{
  console.log('\n── направление ткани: one_way запрещает 180° ──');
  const pieces = mod.syntheticPieces(
    Array.from({ length: 8 }, (_, i) => ({ w: 22 + (i % 3) * 9, h: 28 + (i % 4) * 7 })),
  );
  const job = { pieces: pieces.map((p) => ({ pieceId: p.id, quantity: 3 })), timeBudgetMs: 3_000 };
  const oneWay = await mod.nest(pieces, { ...baseCfg, ...job, fabricDirection: 'one_way' }, () => false, () => {});
  const twoWay = await mod.nest(pieces, { ...baseCfg, ...job, fabricDirection: 'two_way' }, () => false, () => {});
  const flipped = (r) => r.placements.filter((p) => p.rot === 180).length;
  check(flipped(oneWay) === 0, 'на ворсовой ткани ни одного размещения на 180°', `${flipped(oneWay)} из ${oneWay.placements.length}`);
  check(oneWay.placedCount === oneWay.totalCount, 'при этом всё размещено', `${oneWay.placedCount}/${oneWay.totalCount}`);
  // two_way is the control: without it a zero above could mean «the search never picked 180»
  // rather than «the search was not allowed to», and the probe would pass on a broken rule.
  check(flipped(twoWay) > 0, 'на two_way переворот действительно используется (контроль)', `${flipped(twoWay)} из ${twoWay.placements.length}`);
  verify(pieces, oneWay, baseCfg, 'one_way');
}

// ── зеркало: инструменты пробы (независимые от движка) ─────────────────────────────────
//
// Разбор ОБОИХ выходных форматов и вся геометрия ниже написаны здесь заново. Спросить у
// движка, отзеркалил ли он деталь, — это не измерение: он ответит то же, что сделал, каким бы
// оно ни было. Отвечать обязана сама фигура.

// Знак площади (формула шнурков). Для хиральной детали это ПОДПИСЬ зеркала: отражение меняет
// обход контура на противоположный, и никакой поворот этого сделать не может.
function signedArea(pts) {
  let a = 0;
  for (let i = 0; i < pts.length; i++) {
    const p = pts[i];
    const q = pts[(i + 1) % pts.length];
    a += p.x * q.y - q.x * p.y;
  }
  return a / 2;
}

// Контуры со слоя CUT плоттерного DXF — по потоку групповых кодов, без всякой библиотеки.
function dxfCutContours(dxf) {
  const lines = dxf.split('\r\n');
  const out = [];
  let cur = null;
  let inVertex = false;
  let vx = 0;
  for (let i = 0; i + 1 < lines.length; i += 2) {
    const code = Number(lines[i]);
    const val = lines[i + 1];
    if (code === 0) {
      if (val === 'POLYLINE') cur = { layer: '', pts: [] };
      else if (val === 'VERTEX') inVertex = true;
      else if (val === 'SEQEND') {
        if (cur) out.push(cur);
        cur = null;
        inVertex = false;
      } else inVertex = false;
      continue;
    }
    if (inVertex) {
      if (code === 10) vx = Number(val);
      else if (code === 20 && cur) {
        cur.pts.push({ x: vx, y: Number(val) });
        inVertex = false;
      }
    } else if (cur && code === 8 && !cur.layer) cur.layer = val;
  }
  return out.filter((p) => p.layer === 'CUT').map((p) => p.pts);
}

// Контуры деталей из SVG. Полосу рисует <rect>, линейку и выноски — <line>, подписи — <text>,
// так что <polygon> в этом файле бывает только контуром детали (у синтетических деталей нет
// внутренней геометрии) и идёт в порядке размещений — как и в DXF.
function svgContours(svg) {
  const out = [];
  for (const m of svg.matchAll(/<polygon points="([^"]+)"/g)) {
    out.push(
      m[1]
        .trim()
        .split(/\s+/)
        .map((pair) => {
          const [x, y] = pair.split(',').map(Number);
          return { x, y };
        }),
    );
  }
  return out;
}

// Фигура «с точностью до сдвига», как МНОЖЕСТВО вершин: обход при отражении переворачивается,
// поэтому сравнивать последовательности нельзя — сравнивается форма.
function shapeKey(pts) {
  const minX = Math.min(...pts.map((p) => p.x));
  const minY = Math.min(...pts.map((p) => p.y));
  return pts
    .map((p) => [p.x - minX, p.y - minY])
    .sort((a, b) => a[0] - b[0] || a[1] - b[1])
    .map(([x, y]) => `${x.toFixed(3)},${y.toFixed(3)}`)
    .join(' ');
}

function rot4(pts, deg) {
  switch (deg) {
    case 90:
      return pts.map((p) => ({ x: -p.y, y: p.x }));
    case 180:
      return pts.map((p) => ({ x: -p.x, y: -p.y }));
    case 270:
      return pts.map((p) => ({ x: p.y, y: -p.x }));
    default:
      return pts;
  }
}

// Совпадают ли фигуры с точностью до ПОВОРОТА и сдвига (зеркало НЕ разрешено). Это и есть
// вопрос цеха: «эти две детали — одинаковые или парные?».
function congruentByRotation(a, b) {
  const ka = shapeKey(a);
  return [0, 90, 180, 270].some((d) => ka === shapeKey(rot4(b, d)));
}

function mirrorPts(pts) {
  return pts.map((p) => ({ x: -p.x, y: p.y }));
}

// Точка внутри многоугольника (лучевой тест) — своя, как и всё остальное в этом файле.
function pointInPoly(poly, px, py) {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const yi = poly[i].y;
    const yj = poly[j].y;
    if (yi > py !== yj > py) {
      const x = poly[i].x + ((py - yi) / (yj - yi)) * (poly[j].x - poly[i].x);
      if (px < x) inside = !inside;
    }
  }
  return inside;
}

// Хиральные детали: у прямоугольника зеркало совпадает с ним самим, и любая проверка на нём
// проходит, ничего не проверив.
const CHIRAL = [
  { name: 'ПОЛОЧКА', poly: [{ x: 0, y: 0 }, { x: 34, y: 0 }, { x: 0, y: 23 }] },
  {
    name: 'БОЧОК',
    poly: [{ x: 0, y: 0 }, { x: 26, y: 0 }, { x: 26, y: 30 }, { x: 9, y: 30 }],
  },
];

// ── probe 6: зеркало доходит до ткани — и до ОБОИХ файлов одинаково ────────────────────
// Самая дорогая ошибка этой фазы: деталь отражена на экране и не отражена в DXF (или
// наоборот). Обе картинки при этом выглядят нормально, маркер сохраняется, а цех получает крой,
// из которого изделие не собрать. Поэтому здесь три независимых вопроса: перевернулась ли
// фигура вообще, ту ли пару дал движок (левая + правая, а не две левых), и совпали ли файлы.
{
  console.log('\n── зеркало: контур, плоттер и экран ──');
  const pieces = mod.syntheticPolyPieces(CHIRAL);
  const cfg = {
    ...baseCfg,
    fabricDirection: 'two_way',
    pieces: [
      { pieceId: 1, quantity: 4, flippedQuantity: 2 },
      { pieceId: 2, quantity: 2, flippedQuantity: 1 },
    ],
    timeBudgetMs: 3_000,
  };
  const res = await mod.nest(pieces, cfg, () => false, () => {});
  const flipped = res.placements.filter((p) => p.flipped);
  check(res.placedCount === res.totalCount, 'всё размещено', `${res.placedCount}/${res.totalCount}`);
  check(flipped.length === 3, 'зеркальных ровно столько, сколько заказано', `${flipped.length} из ${res.placements.length}`);
  verify(pieces, res, cfg, 'зеркало');

  const byId = new Map(pieces.map((p) => [p.id, p]));
  let chiralityOk = 0;
  let congruenceOk = 0;
  for (const pl of res.placements) {
    const src = byId.get(pl.pieceId).poly;
    const emitted = mod.placeIndependently(src, pl);
    const wantSign = pl.flipped ? -1 : 1;
    if (Math.sign(signedArea(emitted)) === wantSign * Math.sign(signedArea(src))) chiralityOk++;
    if (Math.abs(Math.abs(signedArea(emitted)) - Math.abs(signedArea(src))) < 1e-9) congruenceOk++;
  }
  check(chiralityOk === res.placements.length, 'у зеркальных размещений знак площади обратный', `${chiralityOk}/${res.placements.length}`);
  check(congruenceOk === res.placements.length, 'площадь при этом та же (фигура конгруэнтна)', `${congruenceOk}/${res.placements.length}`);

  const svg = mod.renderLayoutSvg(res, pieces, cfg.fabricWidthCm);
  const dxf = mod.renderLayoutDxf(res, pieces, cfg.fabricWidthCm);
  const svgC = svgContours(svg);
  const dxfC = dxfCutContours(dxf);
  check(svgC.length === res.placements.length, 'SVG нарисовал все контуры', `${svgC.length}/${res.placements.length}`);
  check(dxfC.length === res.placements.length, 'DXF выдал все контуры на слой CUT', `${dxfC.length}/${res.placements.length}`);

  let agree = 0;
  let sameChirality = 0;
  let worstDev = 0;
  for (let i = 0; i < Math.min(svgC.length, dxfC.length); i++) {
    const a = svgC[i];
    const b = dxfC[i];
    if (a.length === b.length) {
      let dev = 0;
      for (let k = 0; k < a.length; k++) {
        dev = Math.max(dev, Math.abs(a[k].x - b[k].x), Math.abs(a[k].y - b[k].y));
      }
      worstDev = Math.max(worstDev, dev);
      // SVG печатает 2 знака, DXF — 4; 0.006 см это разрешение экранного файла, не расхождение.
      if (dev <= 0.006) agree++;
    }
    if (Math.sign(signedArea(a)) === Math.sign(signedArea(b))) sameChirality++;
  }
  check(agree === res.placements.length, 'DXF и SVG рисуют один и тот же контур', `совпало ${agree}/${res.placements.length}, худшее расхождение ${worstDev.toFixed(4)} см`);
  check(sameChirality === res.placements.length, 'ХИРАЛЬНОСТЬ в плоттерном файле и на экране одна', `${sameChirality}/${res.placements.length}`);

  // Подписи планируются по КОНТУРУ, и зеркало должно доехать и до них: имя, посчитанное по
  // незеркальной детали, ложится мимо своей детали (часто — на соседнюю). Согласие DXF с SVG
  // это не поймает: планировщик у них ОДИН, и промах будет одинаковым в обоих файлах.
  {
    // Берётся точка, которая ПРЕТЕНДУЕТ лежать на детали: у вместившейся подписи это она сама,
    // у выноски — её точка на детали (плановый якорь). Проверять только вместившиеся нельзя:
    // планировщик, считающий по НЕзеркальному контуру, просто перестаёт находить место и
    // уходит в выноску — и проба, смотрящая лишь на вместившиеся, зазеленела бы на трёх
    // оставшихся вместо шести.
    let inside = 0;
    let total = 0;
    for (const lab of mod.planLayoutLabels(res, pieces, cfg.fabricWidthCm)) {
      total++;
      const own = mod.placeIndependently(byId.get(lab.placement.pieceId).poly, lab.placement);
      const on = lab.plan.leader
        ? { x: lab.plan.leader.dotX, y: lab.plan.leader.dotY }
        : { x: lab.plan.x, y: lab.plan.y };
      if (pointInPoly(own, on.x, on.y)) inside++;
    }
    check(
      total === res.placements.length && inside === total,
      'подписи спланированы по ЗЕРКАЛЬНОМУ контуру (имя стоит на своей детали)',
      `${inside}/${total}`,
    );
  }

  // Физический вопрос, заданный без единой ссылки на договор о преобразовании: получил ли цех
  // ПАРУ (левая + правая), а не две одинаковых детали. Проверяется по эмитированным контурам
  // плоттерного файла — того самого, по которому режут.
  const idxByPlacement = res.placements.map((pl, i) => ({ pl, i }));
  const left = idxByPlacement.find((it) => it.pl.pieceId === 1 && !it.pl.flipped);
  const right = idxByPlacement.find((it) => it.pl.pieceId === 1 && it.pl.flipped);
  check(!!left && !!right, 'на маркере есть и обычный, и зеркальный экземпляр детали 1');
  if (left && right) {
    const L = dxfC[left.i];
    const R = dxfC[right.i];
    check(!congruentByRotation(L, R), 'левая и правая НЕ совмещаются поворотом — это пара, а не две левых');
    check(congruentByRotation(L, mirrorPts(R)), 'зато совмещаются после отражения — значит это одна и та же деталь, вывернутая');
  }
}

// ── probe 7: NFP зеркальной пары против ЧЕСТНОГО пересчёта ─────────────────────────────
// Движок не пересчитывает то, что можно получить отражением уже посчитанного (nest/nfp.ts), и
// вся конструкция держится на двух тождествах со знаками поворота. Ошибка в знаке не роняет
// ничего: NFP остаётся правдоподобной областью, детали просто встают не туда — и ловится это
// только сравнением с честно посчитанным NFP по УЖЕ преобразованным частям. Перебираются все
// комбинации: порядок id × повороты × хиральности.
{
  console.log('\n── NFP зеркала: сокращение против честного пересчёта ──');
  const aParts = [
    [{ x: 0, y: 0 }, { x: 11, y: 0 }, { x: 11, y: 4 }],
    [{ x: 0, y: 0 }, { x: 11, y: 4 }, { x: 2, y: 9 }],
  ];
  const bParts = [
    [{ x: 0, y: 0 }, { x: 7, y: 0 }, { x: 6, y: 5 }, { x: 1, y: 6 }],
    [{ x: 0, y: 0 }, { x: 6, y: 5 }, { x: -3, y: 4 }],
  ];
  const audit = mod.nfpFlipAudit({ aParts, bParts, gapCm: 0.5, rots: [0, 90, 180, 270] });
  // Единица = 1/SCALE = 1e-4 см = 1 микрон (geom/clipper.ts). Ошибка в порядке величины здесь
  // дороже, чем кажется: этим числом отчитываются о точности тождеств.
  console.log(`  комбинаций ${audit.cases}, худшее расхождение ${audit.worstDevUnits} ед. (1 ед. = 1 мкм)`);
  check(
    audit.mismatched === 0,
    'каждая ветвь сокращения совпала с честным NFP',
    audit.firstBad || `${audit.cases} комбинаций`,
  );
}

// ── probe 8: сокращение против ЧЕСТНО УДВОЕННОГО набора деталей ────────────────────────
// Второй, независимый от probe 7 угол: то же задание, но зеркальная деталь заведена ОТДЕЛЬНОЙ
// деталью с заранее отражённым контуром — то есть ровно тот дорогой путь, от которого
// сокращение и спасает. Зерно поиска намеренно не знает про зеркала (nest/index.ts), поэтому
// оба прогона идут одним потоком случайных чисел и сравнимы ген в ген.
{
  console.log('\n── зеркало против честно удвоенного набора ──');
  const base = mod.syntheticPolyPieces([...CHIRAL, ...CHIRAL]);
  // Зеркальный контур БЕЗ переноса в свой bbox: у зеркального варианта движка контур уезжает
  // из [0,w] в [−w,0], и деталь с заранее отражённым контуром обязана лежать там же. Иначе
  // сравнивались бы два прогона с разной точкой отсчёта: раскладка та же, а числа x разные —
  // и, что хуже, умножения вида (x+34)·10000 и x·10000+340000 расходятся в последнем бите, чего
  // хватает, чтобы GA выбрал другую (столь же хорошую) перестановку.
  const mirroredSet = base.map((p, i) =>
    i < 2 ? p : { ...p, poly: p.poly.map((q) => ({ x: -q.x, y: q.y })) },
  );
  const job = (flip) => ({
    ...baseCfg,
    fabricDirection: 'two_way',
    // ПОВОРОТЫ ТОЛЬКО {0,180}, и это ограничение самой пробы, а не движка. Сравнение «точь-в-точь»
    // законно лишь там, где у обоих прогонов совпадает НАБОР КАНДИДАТОВ, а он совпадает не
    // всегда: кандидаты берутся с границы объединения NFP, а её прореживание (decimateOneSided)
    // считается в КАНОНИЧЕСКОЙ системе и потом отражается — иначе прореживание, увидев
    // перевёрнутый обход, срезало бы запретную область ВНУТРЬ. Отражённый вариант поэтому
    // предлагает чуть другие (столь же законные) точки, и на 90/270 два прогона расходятся на
    // проценты длины, оба оставаясь верными. Знак rel при этом здесь не проверяется вовсе
    // (−180 ≡ 180) — его проверяет проба «NFP зеркала», перебирающая все четыре поворота.
    pieces: base.map((p, i) => ({
      pieceId: p.id,
      quantity: 2,
      flippedQuantity: flip && i >= 2 ? 2 : 0,
    })),
    // Бюджет заведомо избыточен НАРОЧНО: сравнивать имеет смысл два поиска, дошедших до
    // одного и того же конца (maxGenerations), а не два, обрезанных часами по-разному.
    timeBudgetMs: 15_000,
  });
  const withFlip = await mod.nest(base, job(true), () => false, () => {});
  const doubled = await mod.nest(mirroredSet, job(false), () => false, () => {});
  // Сравниваются НЕ x/y размещений, а КОНТУРЫ НА ПОЛОСЕ. У зеркального варианта локальное
  // начало координат уезжает на другой край детали (контур из [0,w] переходит в [−w,0]), так
  // что одна и та же фигура на одном и том же месте законно записывается разными x. Вопрос,
  // который здесь задаётся, — «легла ли ткань одинаково», а не «совпали ли числа».
  const geomKey = (pieces, r) => {
    const byId = new Map(pieces.map((p) => [p.id, p]));
    return JSON.stringify(
      r.placements
        .map((pl) =>
          mod
            .placeIndependently(byId.get(pl.pieceId).poly, pl)
            .map((p) => [Math.round(p.x * 1000), Math.round(p.y * 1000)])
            .sort((a, b) => a[0] - b[0] || a[1] - b[1]),
        )
        .sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b))),
    );
  };
  check(
    withFlip.placedCount === doubled.placedCount && withFlip.placedCount === withFlip.totalCount,
    'оба прогона разместили всё',
    `${withFlip.placedCount}/${withFlip.totalCount} и ${doubled.placedCount}/${doubled.totalCount}`,
  );
  check(
    withFlip.generation >= 399 && doubled.generation >= 399,
    'оба поиска дошли до конца — сравниваются одинаковые поиски, а не одинаковые часы',
    `${withFlip.generation} и ${doubled.generation}`,
  );
  check(
    geomKey(base, withFlip) === geomKey(mirroredSet, doubled),
    'сокращение дало ТУ ЖЕ раскладку, что честный пересчёт',
    `длина ${withFlip.usedLengthCm.toFixed(3)} против ${doubled.usedLengthCm.toFixed(3)} см`,
  );
  check(
    withFlip.placements.filter((p) => p.flipped).length === 4,
    'и при этом зеркальные экземпляры остались зеркальными',
    `${withFlip.placements.filter((p) => p.flipped).length}`,
  );
  verify(base, withFlip, job(true), 'зеркало+удвоение');
}

// ── probe 9: направленная ткань запрещает зеркало, как и полуоборот ────────────────────
// Сервер откажет в сохранении маркера, где на one_way лежит перевёрнутая деталь, — значит
// движок, который её туда кладёт, делает маркер, который некому сохранить. Молча положить
// вместо зеркала обычную копию было бы хуже: это те самые сорок четыре левые полочки.
{
  console.log('\n── зеркало и направление ткани ──');
  const pieces = mod.syntheticPolyPieces(CHIRAL);
  const job = {
    pieces: [
      { pieceId: 1, quantity: 4, flippedQuantity: 2 },
      { pieceId: 2, quantity: 2, flippedQuantity: 1 },
    ],
    timeBudgetMs: 3_000,
  };
  const oneWay = await mod.nest(pieces, { ...baseCfg, ...job, fabricDirection: 'one_way' }, () => false, () => {});
  const twoWay = await mod.nest(pieces, { ...baseCfg, ...job, fabricDirection: 'two_way' }, () => false, () => {});
  check(
    oneWay.placements.filter((p) => p.flipped).length === 0,
    'на направленной ткани ни одного зеркального размещения',
    `${oneWay.placements.filter((p) => p.flipped).length}`,
  );
  check(
    oneWay.unplaced.length === 3 && oneWay.unplaced.every((u) => u.reason === 'mirror'),
    'зеркальные экземпляры НАЗВАНЫ непоместившимися, а не подменены обычными',
    JSON.stringify(oneWay.unplaced),
  );
  check(
    oneWay.placedCount + oneWay.unplaced.length === oneWay.totalCount,
    'размещённые + непоместившиеся = всего',
    `${oneWay.placedCount}+${oneWay.unplaced.length}/${oneWay.totalCount}`,
  );
  check(
    oneWay.warnings.some((w) => w.includes('ворс')),
    'и объяснены словами, а не только кодом причины',
    JSON.stringify(oneWay.warnings),
  );
  // Контроль: без него ноль выше мог бы значить «движок вообще не умеет зеркалить».
  check(
    twoWay.placements.filter((p) => p.flipped).length === 3 && twoWay.unplaced.length === 0,
    'на two_way те же зеркала кладутся все (контроль)',
    `${twoWay.placements.filter((p) => p.flipped).length}, не влезло ${twoWay.unplaced.length}`,
  );
  verify(pieces, oneWay, baseCfg, 'one_way + зеркала');
}

// ── probe 10: детерминизм с зеркалами ──────────────────────────────────────────────────
{
  console.log('\n── детерминизм с зеркалами ──');
  const pieces = mod.syntheticPolyPieces([
    ...CHIRAL,
    { name: 'РУКАВ', poly: [{ x: 0, y: 0 }, { x: 44, y: 6 }, { x: 40, y: 24 }, { x: 3, y: 19 }] },
    { name: 'ОБТАЧКА', poly: [{ x: 0, y: 0 }, { x: 31, y: 4 }, { x: 27, y: 13 }, { x: 2, y: 8 }] },
    { name: 'КОКЕТКА', poly: [{ x: 0, y: 0 }, { x: 38, y: 0 }, { x: 33, y: 11 }] },
  ]);
  const cfg = {
    ...baseCfg,
    fabricDirection: 'two_way',
    // ПОПЕРЁК ДОЛЕВОЙ — здесь, а не в пробе выше: это единственная проба, где зеркальные детали
    // реально ложатся на 90 и 270, то есть где разнохиральные NFP работают на всех четырёх
    // относительных углах, и где за ними следит полная проверка геометрии (наложения, зазор,
    // полоса). Детерминизму разница наборов кандидатов не мешает: вход один и тот же дважды.
    allowCrossGrain: true,
    pieces: pieces.map((p) => ({ pieceId: p.id, quantity: 6, flippedQuantity: 3 })),
    timeBudgetMs: 4_000,
  };
  const key = (r) =>
    JSON.stringify(
      r.placements.map((p) => [p.pieceId, p.instance, p.rot, p.flipped === true, Math.round(p.x * 1000), Math.round(p.y * 1000)]),
    );
  const ta = traceGenerations(key);
  const tb = traceGenerations(key);
  const a = await mod.nest(pieces, cfg, () => false, ta.onProgress);
  const b = await mod.nest(pieces, cfg, () => false, tb.onProgress);
  check(a.generation < 399, 'бюджет ограничивал (иначе сравнение — тавтология)', `generation=${a.generation}`);
  checkSameTrajectory(ta, tb, 'поколение в поколение совпадают размещения ВМЕСТЕ с зеркальностью');
  check(
    a.generation !== b.generation || key(a) === key(b),
    'при равном числе поколений совпадают и итоги (с зеркалами)',
    `gen ${a.generation}/${b.generation}`,
  );
  check(a.placedCount === a.totalCount, 'всё размещено', `${a.placedCount}/${a.totalCount}`);
  check(
    a.placements.filter((p) => p.flipped).length === pieces.length * 3,
    'зеркал ровно половина',
    `${a.placements.filter((p) => p.flipped).length} из ${a.placements.length}`,
  );
  verify(pieces, a, cfg, 'детерминизм с зеркалами');
}

// ── probe 11: real files, В ОБОИХ РЕЖИМАХ ─────────────────────────────────────────────
//
// Зеркальный режим гоняется НАРЯДУ с обычным и по умолчанию, а не по переменной окружения.
// Причина ровно та, по которой этот файл вообще существует: парные детали удваивают число
// записей NFP, то есть меняют самую дорогую фазу прогона — и первый же замер этого режима
// (25 с, «summer men.dxf», 20 деталей ×2) дал НОЛЬ поколений и предпросчёт на 21.8 с из 25,
// провалив собственные проверки этой пробы «бюджет соблюдён» и «поиск успел начаться». Пока
// режим включался руками, отчитаться можно было половиной, которая проходит. Теперь обе
// половины в одном выводе, и обе — с проверками.
async function runFile(path, bytes, mirroredHalf) {
  const per = mirroredHalf ? 2 : perPiece;
  const flip = mirroredHalf ? 1 : mirrored;
  console.log(`\n── ${path}${mirroredHalf ? ' · ЗЕРКАЛЬНЫЕ ПАРЫ' : ''} ──`);
  const out = await mod.probe({
    sheets: [{ name: path.split('/').pop(), open: async () => bytes }],
    maxPieces,
    contourLayer: process.env.NEST_PROBE_LAYER,
    grainLayer: process.env.NEST_PROBE_GRAIN,
    perPiece: per,
    flippedPerPiece: flip,
    config: { timeBudgetMs: budgetMs, fabricDirection: flip ? 'two_way' : 'any' },
  });
  const r = out.result;
  if (!mirroredHalf) {
    console.log(
      `  слои: ${out.layers.slice(0, 6).map((l) => `${l.layer}(${l.blocks})`).join(' ')}${out.layers.length > 6 ? ' …' : ''}`,
    );
  }
  console.log(`  деталей: разобрано ${out.parsed}, взято ${out.used}, экземпляров ${out.instances}`);
  console.log(
    `  nfp ${out.progress.nfpDone}/${out.progress.nfpTotal} | поколений ${r.generation} | ${r.elapsedMs} ms (бюджет ${budgetMs}) | размещено ${r.placedCount}/${r.totalCount} | длина ${r.usedLengthCm.toFixed(1)} см | эфф ${(r.efficiency * 100).toFixed(1)}%`,
  );
  console.log(`  блоб ${out.blobHash} | зеркальных ${r.placements.filter((p) => p.flipped).length} | телеметрия ${JSON.stringify(r.telemetry ?? null)}`);
  const tag = mirroredHalf ? ' (зеркальные пары)' : '';
  check(r.elapsedMs <= budgetMs + 2_000, `бюджет соблюдён (+2 с)${tag}`, `${r.elapsedMs} ms`);
  // Предпросчёт обязан оставить поиску его долю. Проверяется ИМЕННО здесь, а не только через
  // «≥1 поколение»: ноль поколений и съеденный бюджет — одно и то же событие, но названное
  // числом, по которому видно, насколько промахнулась оценка (телеметрия выше печатает и
  // предсказание, и факт).
  const prep = r.telemetry?.prepassMs ?? 0;
  check(
    prep <= budgetMs * 0.6,
    `предпросчёт не съел бюджет${tag}`,
    `${(prep / 1000).toFixed(1)} с из ${(budgetMs / 1000).toFixed(0)}, предсказано ${((r.telemetry?.predictedPrepassMs ?? 0) / 1000).toFixed(1)} с`,
  );
  check(r.generation >= 1, `поиск успел начаться (≥1 поколение)${tag}`, `generation=${r.generation}`);
  check(out.overlaps === 0, `ноль наложений${tag}`, `${out.overlaps}`);
  check(
    out.shortPairs === 0,
    `зазор выдержан по настоящим контурам${tag}`,
    `коротких пар ${out.shortPairs}, минимум ${out.minClearanceCm.toFixed(4)} см`,
  );
  check(out.outsideWidth === 0, `ничего не вылезло за полосу${tag}`, `${out.outsideWidth}`);
  // Only a FINISHED run owes this: a cancelled one makes no claim about pieces it never
  // reached. Nothing cancels this probe, so reaching the else branch is itself a finding.
  check(
    r.cancelled || r.placedCount + (r.unplaced?.length ?? 0) === r.totalCount,
    `размещённые + непоместившиеся = всего${tag}`,
    `${r.placedCount}+${r.unplaced?.length ?? 0}/${r.totalCount}${r.cancelled ? ' (отменён?!)' : ''}`,
  );
  if (mirroredHalf) {
    check(
      r.placements.filter((p) => p.flipped).length === out.used,
      'зеркальных ровно половина экземпляров (иначе мерился не тот режим)',
      `${r.placements.filter((p) => p.flipped).length} из ${r.placements.length}`,
    );
  }
}

for (const arg of args) {
  const path = resolve(process.cwd(), arg.replace(/^~/, process.env.HOME ?? '~'));
  const buf = await readFile(path);
  const bytes = buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength);
  await runFile(path, bytes, false);
  // Явно заданный NEST_PROBE_MIRROR — это ручной режим, второй проход тогда не нужен.
  if (!process.env.NEST_PROBE_MIRROR) await runFile(path, bytes, true);
}

console.log(`\n${failures === 0 ? 'ВСЁ ЗЕЛЁНОЕ' : `ПРОВАЛОВ: ${failures}`}`);
process.exit(failures === 0 ? 0 : 1);
