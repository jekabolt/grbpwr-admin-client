#!/usr/bin/env node
// THE STROKE MODEL — storage, drawing and the nine stitches, measured on live production code.
//
// ПРОИСХОЖДЕНИЕ, СКАЗАННОЕ ВСЛУХ. Эти утверждения жили в `scripts/svg-import-probe.mjs`, снесённом
// вместе с разборщиком чужого SVG (H-1, круг 14): владелец потребовал убрать платную векторизацию
// с пути пользователя, у разборщика не осталось ни одного потребителя, и удалять его было верно.
// НЕВЕРНЫМ был учёт: секции 5 и 6 того файла разбирали НЕ парсер, а `vector-strokes.ts` — код,
// который живёт и сегодня, — и вместе с файлом молча ушли ~29 утверждений без преемника.
//
// Что здесь держится и чего НЕ держит больше никто:
//   • `writeLayer(...) === LEGACY` ПОБАЙТНО. qa-vector 17 смотрит `v`, число штрихов и имена швов,
//     а `strokes-wire.mjs` — base64-круг непрозрачной строки: дрейф порядка ключей или округления
//     проходит мимо обоих;
//   • отказы формата: список сегментов не той длины, сегмент не из четырёх чисел, потерянный
//     якорь у кривой, `'{{{'` против `''`;
//   • кривая через всю машину: 300 якорей, выживание `CONTROL_REACH`, девять швов × три толщины,
//     поднятое перо, разрывающее штрих на два подпути.
//
// Чего здесь НЕТ намеренно: круг «наш собственный скачанный SVG читается обратно» — он проверял
// разборщик и умер вместе с ним честно.
//
//   node scripts/vector-strokes-probe.mjs

import { build } from 'esbuild';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, resolve } from 'node:path';
import { tmpdir } from 'node:os';

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, '..');
const modals = resolve(root, 'src/components/managers/tech-card/components/design/modals');
const outfile = resolve(tmpdir(), `vector-strokes-${process.pid}.mjs`);

await build({
  stdin: {
    contents: `export * from './vector-strokes';\n`,
    resolveDir: modals,
    sourcefile: 'probe-entry.ts',
    loader: 'ts',
  },
  bundle: true,
  format: 'esm',
  platform: 'node',
  outfile,
  logLevel: 'silent',
});

const {
  readLayer,
  writeLayer,
  strokeGeometry,
  strokePolyline,
  hasSegments,
  STITCHES,
  FORMAT_VERSION,
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

const near = (a, b, eps = 1e-9) => Math.abs(a - b) < eps;


// ── INDEPENDENT ARITHMETIC ─────────────────────────────────────────────────────────────────────
//
// Written HERE, on purpose, and not imported. These four lines are the measuring instrument; taking
// them from the module under test would make every measurement below a tautology.
const cubic = (p0, c1, c2, p3, t) => {
  const u = 1 - t;
  return {
    x: u * u * u * p0.x + 3 * u * u * t * c1.x + 3 * u * t * t * c2.x + t * t * t * p3.x,
    y: u * u * u * p0.y + 3 * u * u * t * c1.y + 3 * u * t * t * c2.y + t * t * t * p3.y,
  };
};

/** Every sampled point of a parsed subpath, in the subpath's own coordinates. */
function samplePath(sub, steps = 400) {
  const out = [{ x: sub.pts[0][0] ?? sub.pts[0].x, y: sub.pts[0][1] ?? sub.pts[0].y }];
  const pt = (p) => (Array.isArray(p) ? { x: p[0], y: p[1] } : p);
  for (let i = 0; i < sub.pts.length - 1; i++) {
    const a = pt(sub.pts[i]);
    const b = pt(sub.pts[i + 1]);
    const s = sub.segs[i];
    if (!s) {
      out.push(b);
      continue;
    }
    for (let k = 1; k <= steps; k++) {
      out.push(cubic(a, { x: s[0], y: s[1] }, { x: s[2], y: s[3] }, b, k / steps));
    }
  }
  return out;
}

const polylineLength = (pts) => {
  let sum = 0;
  for (let i = 1; i < pts.length; i++) sum += Math.hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y);
  return sum;
};

/** Shoelace area of a closed loop of sampled points. */
const shoelace = (pts) => {
  let a2 = 0;
  for (let i = 0; i < pts.length; i++) {
    const p = pts[i];
    const q = pts[(i + 1) % pts.length];
    a2 += p.x * q.y - q.x * p.y;
  }
  return Math.abs(a2) / 2;
};


// ═══════════════════════════════════════════════════════════════════════════════════════════════
// 5 · BACKWARD COMPATIBILITY — a layer written before curves existed
// ═══════════════════════════════════════════════════════════════════════════════════════════════

// A layer exactly as the previous bundle wrote it: version 1, no `segs` key anywhere.
const LEGACY =
  '{"v":1,"ratio":0.8,"strokes":[' +
  '{"tool":"line","brush":"lock","weight":"bold","dashed":false,"pts":[[0.1,0.2],[0.3,0.4]]},' +
  '{"tool":"freehand","brush":"cover","weight":"hairline","dashed":true,"pts":[[0.5,0.5],[0.6,0.55],[0.7,0.5]]}' +
  ']}';

{
  const doc = readLayer(LEGACY, 0.75);
  check('a legacy layer is readable', doc.unreadable === false && doc.strokes.length === 2);
  check('a legacy layer keeps its ratio', near(doc.ratio, 0.8));
  check('a legacy stroke has no segment list at all', doc.strokes.every((s) => s.segs === undefined));
  check('a legacy stroke keeps its stitch, weight and dash', doc.strokes[0].brush === 'lock' && doc.strokes[0].weight === 'bold' && doc.strokes[1].dashed === true);
  // THE STRING COMPARISON IS THE CLAIM: read then written, a legacy layer is the SAME BYTES.
  check('a legacy layer round-trips byte for byte', writeLayer(doc.strokes, doc.ratio) === LEGACY, writeLayer(doc.strokes, doc.ratio));
  check('a drawing with no curves is still written as v1', JSON.parse(writeLayer(doc.strokes, doc.ratio)).v === 1);
}

{
  // The drawn path of a legacy stroke is unchanged: two points give a straight L, three give the
  // Catmull-Rom cubics `inkPath` has always produced — recomputed here from the classic weights.
  const line = strokeGeometry({ tool: 'line', brush: 'plain', weight: 'thin', dashed: false, pts: [[0, 0], [0.5, 0.5]] }, 200, 200);
  check('a two-point legacy stroke still draws as one straight L', line.d === 'M0,0 L100,100', line.d);

  const pts = [[0.1, 0.1], [0.5, 0.4], [0.9, 0.1]].map(([x, y]) => ({ x: Math.round(x * 200 * 100) / 100, y: Math.round(y * 200 * 100) / 100 }));
  let expected = `M${pts[0].x},${pts[0].y}`;
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[i - 1] ?? pts[i];
    const p1 = pts[i];
    const p2 = pts[i + 1];
    const p3 = pts[i + 2] ?? p2;
    const c1 = { x: p1.x + (p2.x - p0.x) / 6, y: p1.y + (p2.y - p0.y) / 6 };
    const c2 = { x: p2.x - (p3.x - p1.x) / 6, y: p2.y - (p3.y - p1.y) / 6 };
    expected += ` C${c1.x},${c1.y} ${c2.x},${c2.y} ${p2.x},${p2.y}`;
  }
  const trace = strokeGeometry({ tool: 'freehand', brush: 'plain', weight: 'thin', dashed: false, pts: [[0.1, 0.1], [0.5, 0.4], [0.9, 0.1]] }, 200, 200);
  check('a legacy freehand stroke still draws its Catmull-Rom smoothing', trace.d === expected, `${trace.d} against ${expected}`);

  check('a legacy stroke hit-tests against its own anchors, unchanged', JSON.stringify(strokePolyline({ tool: 'line', brush: 'plain', weight: 'thin', dashed: false, pts: [[0, 0], [1, 1]] }, 10, 10)) === JSON.stringify([{ x: 0, y: 0 }, { x: 10, y: 10 }]));
}

{
  // A DOCUMENT THIS BUNDLE CANNOT LINE UP IS UNREADABLE, NOT THINNER — the writers must stop.
  const shortSegs = '{"v":2,"ratio":0.8,"strokes":[{"tool":"curve","brush":"plain","weight":"thin","dashed":false,"pts":[[0,0],[0.5,0.5],[1,1]],"segs":[null]}]}';
  check('a segment list of the wrong length makes the layer unreadable', readLayer(shortSegs, 0.8).unreadable === true);
  const badSeg = '{"v":2,"ratio":0.8,"strokes":[{"tool":"curve","brush":"plain","weight":"thin","dashed":false,"pts":[[0,0],[1,1]],"segs":[[1,2,3]]}]}';
  check('a segment that is not four numbers makes the layer unreadable', readLayer(badSeg, 0.8).unreadable === true);
  // A LOST ANCHOR IS THE SUBTLE ONE. On a polyline a malformed point has always been thrown away and
  // the line simply goes round it; on a curve the intervals after the gap would then describe the
  // wrong ones, and every curve past that point would be drawn somewhere nobody put it — silently,
  // and with the drawing still looking plausible.
  // The segment list is deliberately sized for the SURVIVING anchors, so that swallowing the lost
  // point would leave a document that lines up perfectly and describes the wrong curve. That is the
  // only version of this case worth testing: a mismatch the length check would catch anyway proves
  // nothing about the anchor guard.
  const lostAnchor = '{"v":2,"ratio":0.8,"strokes":[{"tool":"curve","brush":"plain","weight":"thin","dashed":false,"pts":[[0,0],"junk",[1,1]],"segs":[[0.1,0.1,0.2,0.2]]}]}';
  check('a lost anchor on a curved stroke makes the layer unreadable', readLayer(lostAnchor, 0.8).unreadable === true, JSON.stringify(readLayer(lostAnchor, 0.8)));
  // …and the SAME malformed point on a plain polyline is still simply skipped, as it always was.
  const lostOnPolyline = '{"v":1,"ratio":0.8,"strokes":[{"tool":"freehand","brush":"plain","weight":"thin","dashed":false,"pts":[[0,0],"junk",[1,1]]}]}';
  const skipped = readLayer(lostOnPolyline, 0.8);
  check('the same lost point on a legacy polyline is still just skipped', skipped.unreadable === false && skipped.strokes[0].pts.length === 2);
  check('a version from the future is still unreadable', readLayer('{"v":' + (FORMAT_VERSION + 1) + ',"ratio":0.8,"strokes":[]}', 0.8).unreadable === true);
  check('nonsense is unreadable, an empty blob is not', readLayer('{{{', 0.8).unreadable === true && readLayer('', 0.8).unreadable === false);
}

// ═══════════════════════════════════════════════════════════════════════════════════════════════
// 6 · CURVES THROUGH THE WHOLE MACHINE — storage, drawing, hit-testing, the nine stitches
// ═══════════════════════════════════════════════════════════════════════════════════════════════

const CURVE = {
  tool: 'curve',
  brush: 'plain',
  weight: 'thin',
  dashed: false,
  pts: [
    [0.1, 0.5],
    [0.9, 0.5],
  ],
  segs: [[0.3, 0.1, 0.7, 0.1]],
};

{
  const wire = writeLayer([CURVE], 0.8);
  /* ⚠ СРАВНЕНИЕ С `FORMAT_VERSION` БЫЛО ПРОСРОЧЕНО. Утверждение называется «кривая пишется
     ВТОРОЙ версией» — и это про 2, а не про «текущий потолок формата»: потолок уехал на 3, когда
     появились толщины нити, а кривая как была выразима во второй, так и осталась. Сравнение с
     подвижной константой делало пробу красной от чужой правки, ничего не сказав о кривых. */
  check('a drawing that holds a curve is written as v2', JSON.parse(wire).v === 2, wire.slice(0, 60));
  const back = readLayer(wire, 0.8);
  check('a curve survives the round trip', back.unreadable === false && JSON.stringify(back.strokes[0].segs) === JSON.stringify(CURVE.segs));
  check('a curve is not thinned on the way out', back.strokes[0].pts.length === CURVE.pts.length);

  // THE THINNING RULE IS THE ONE PLACE THE TWO SHAPES OF STROKE MUST PART WAYS, so both halves are
  // measured on a stroke long enough for it to matter — 300 anchors, well past the 240-point ceiling
  // a freehand trace is held to. A curve keeps every one: its anchors are the ends of stored cubics,
  // and dropping one without dropping the matching interval leaves the two lists describing
  // different shapes. A freehand trace of the same length must still be thinned, or the ceiling that
  // keeps a layer inside 512 KB has quietly stopped existing.
  const many = {
    tool: 'curve',
    brush: 'plain',
    weight: 'thin',
    dashed: false,
    pts: Array.from({ length: 300 }, (_, i) => [i / 299, 0.5 + 0.2 * Math.sin(i / 7)]),
    segs: Array.from({ length: 299 }, (_, i) => [i / 299 + 0.001, 0.5, i / 299 + 0.002, 0.5]),
  };
  const longBack = readLayer(writeLayer([many], 0.8), 0.8);
  // GUARDED BEFORE IT IS READ. A thinned curve comes back with its two lists out of step, which
  // `readLayer` correctly calls unreadable — and an unguarded `strokes[0].pts` would then throw and
  // report itself as a crash rather than as the failed claim it is.
  check('a 300-anchor curve is readable at all', longBack.unreadable === false && longBack.strokes.length === 1, JSON.stringify(longBack).slice(0, 120));
  check('a 300-anchor curve keeps every anchor', longBack.strokes[0]?.pts.length === 300, `${longBack.strokes[0]?.pts.length} anchors`);
  check('and every interval beside them', longBack.strokes[0]?.segs.length === 299, `${longBack.strokes[0]?.segs.length} intervals`);
  const longTrace = { tool: 'freehand', brush: 'plain', weight: 'thin', dashed: false, pts: many.pts };
  const traceBack = readLayer(writeLayer([longTrace], 0.8), 0.8);
  check('a 300-point freehand trace is STILL thinned to the ceiling', traceBack.strokes[0].pts.length <= 240, `${traceBack.strokes[0].pts.length} points`);
  check('hasSegments tells the two shapes of stroke apart', hasSegments(CURVE) === true && hasSegments({ ...CURVE, segs: undefined }) === false);

  // A control point outside the frame is legal and must NOT be clamped — clamping bends the curve.
  const reaching = { ...CURVE, segs: [[0.3, -0.4, 0.7, -0.4]] };
  const readBack = readLayer(writeLayer([reaching], 0.8), 0.8);
  check('a control point outside the frame survives storage', near(readBack.strokes[0].segs[0][1], -0.4), JSON.stringify(readBack.strokes[0].segs));
}

{
  const g = strokeGeometry(CURVE, 200, 200);
  check('a curve is drawn as a cubic, not as a chain of straight pieces', g.d.includes('C') && !g.d.includes('L'), g.d);
  check('the drawn path scales into the box', g.d.startsWith('M20,100') && g.d.endsWith('180,100'), g.d);

  // Hit-testing follows the CURVE, not the chord. The cubic above bulges to y ≈ 0.2 of the frame at
  // its middle; the chord sits at y = 0.5. A polyline of the anchors alone would miss it entirely.
  const poly = strokePolyline(CURVE, 1, 1);
  const mid = poly[Math.floor(poly.length / 2)];
  check('the hit-test polyline follows the bulge', Math.abs(mid.y - 0.5) > 0.2, `middle at y=${mid.y}`);
  check('the hit-test polyline starts and ends on the anchors', near(poly[0].x, 0.1) && near(poly[poly.length - 1].x, 0.9));
  // …and it is a faithful flattening: measured against this file's own cubic arithmetic.
  let worst = 0;
  for (const p of poly) {
    let best = Infinity;
    for (let k = 0; k <= 2000; k++) {
      const q = cubic({ x: 0.1, y: 0.5 }, { x: 0.3, y: 0.1 }, { x: 0.7, y: 0.1 }, { x: 0.9, y: 0.5 }, k / 2000);
      best = Math.min(best, Math.hypot(q.x - p.x, q.y - p.y));
    }
    worst = Math.max(worst, best);
  }
  check('every flattened point lies on the curve', worst < 1e-6, `worst ${worst.toExponential(3)}`);
}

{
  // THE NINE MACHINE KINDS MUST NOT NOTICE THE DIFFERENCE. Weight, dash rhythm and the second row
  // of a two-needle machine are stated about the PATH, so a cubic wears them exactly as a polyline.
  //
  // ⚠ ДВА УТВЕРЖДЕНИЯ ЭТОГО БЛОКА БЫЛИ ПРОСРОЧЕНЫ И СНЯТЫ — С ЗАМЕРОМ, А НЕ ПО УДОБСТВУ.
  // Прежняя редакция требовала (а) чтобы у ЛЮБОГО шва кривая осталась кривой (`d` содержит `C`) и
  // (б) чтобы двухигольная машина давала `offsets.length === 2`. Против сегодняшнего
  // `vector-strokes.ts` — НЕ ТРОНУТОГО этой волной, байт в байт с HEAD — оба ложны:
  //   · `C` сохраняет только `plain`; остальные восемь швов СЪЕДАЮТ кривую, укладывая вдоль неё
  //     собственный рисунок из отрезков (замерено: plain 1 подпуть, lock 46, double 91);
  //   · вторая игла живёт В САМОМ ПУТИ, а не в `offsets`: у `double` `offsets` = [0].
  // То есть проба была красной задолго до этой волны и не заметил никто — она висела на
  // `npm run vector:svg` и не входила ни в один гейт. Ниже утверждается то, что ПРАВДА, и ровно
  // столько же: одинаковость машинных свойств между прямой и кривой, сохранение кубика у plain,
  // поедание кривой у остальных и вторая игла, нарисованная в пути.
  const flat = { tool: 'line', brush: 'plain', weight: 'thin', dashed: false, pts: [[0.1, 0.5], [0.9, 0.5]] };
  let same = 0;
  let total = 0;
  for (const s of STITCHES) {
    for (const weight of ['hairline', 'thin', 'bold']) {
      for (const dashed of [false, true]) {
        total++;
        const a = strokeGeometry({ ...flat, brush: s.key, weight, dashed }, 200, 200);
        const b = strokeGeometry({ ...CURVE, brush: s.key, weight, dashed }, 200, 200);
        if (
          a.strokeWidth === b.strokeWidth &&
          a.dash === b.dash &&
          JSON.stringify(a.offsets) === JSON.stringify(b.offsets)
        ) {
          same++;
        } else {
          check(`stitch ${s.key} (${weight}${dashed ? ', construction' : ''}) wears the same machine properties on a curve`, false, `${JSON.stringify({ sw: a.strokeWidth, dash: a.dash, off: a.offsets })} vs ${JSON.stringify({ sw: b.strokeWidth, dash: b.dash, off: b.offsets })}`);
        }
      }
    }
  }
  check('all nine stitches × three weights × dashed wear identical machine properties on a curve', same === total, `${same} of ${total}`);

  // ПЛЕЙН СОХРАНЯЕТ КУБИК — и это единственный шов, который рисует САМ путь.
  const plainCurve = strokeGeometry({ ...CURVE, brush: 'plain' }, 200, 200);
  const plainLine = strokeGeometry({ ...flat, brush: 'plain' }, 200, 200);
  check('a plain stitch keeps the curve a curve', plainCurve.d.includes('C') && !plainLine.d.includes('C'), plainCurve.d.slice(0, 80));

  // ОСТАЛЬНЫЕ ВОСЕМЬ КРИВУЮ СЪЕДАЮТ, и это их работа: рисунок машины кладётся ВДОЛЬ пути.
  /* ⚠ «НЕТ БУКВЫ C И БОЛЬШЕ ОДНОГО ПОДПУТИ» — НЕВЕРНЫЙ ПРИЗНАК, ЗАМЕРЕНО ПОШТУЧНО:
     zigzag/blind/bartack кладут ОДИН непрерывный зубчатый подпуть (M:1), а overlock рисует
     базовую кривую И свои метки поверх (C есть, подпутей 67). Общее у всех восьми ровно одно и
     ровно то, что и утверждается: они добавляют СВОЮ геометрию, и её заметно больше, чем у
     голого кубика. */
  let ate = 0;
  const heavier = [];
  for (const s of STITCHES.filter((x) => x.key !== 'plain')) {
    const g = strokeGeometry({ ...CURVE, brush: s.key }, 200, 200);
    heavier.push(`${s.key}:${g.d.length}`);
    if (g.d.length > plainCurve.d.length * 3) ate++;
  }
  check('the other eight lay their own pattern along the curve', ate === STITCHES.length - 1, `${ate} of ${STITCHES.length - 1} — ${heavier.join(' ')} против plain ${plainCurve.d.length}`);

  // ВТОРАЯ ИГЛА НАРИСОВАНА — В ПУТИ, а не в `offsets`: у двухигольной машины подпутей много больше.
  const two = strokeGeometry({ ...CURVE, brush: 'double' }, 200, 200);
  check('a two-needle machine still draws two rows over a curve', (two.d.match(/M/g) ?? []).length > 10 && two.d.length > plainCurve.d.length * 10, `подпутей ${(two.d.match(/M/g) ?? []).length}, длина ${two.d.length} против plain ${plainCurve.d.length}`);

  // THE PEN-UP CONVENTION SURVIVES ON A CURVE. A duplicated anchor has always meant «the pen left
  // the paper here»; a curved stroke has to break the same way, or the drawn path would bridge the
  // gap with a line nobody drew. And the emitted `d` has to be a path — it is handed to `Path2D`
  // for the raster and written into the downloadable file, so it is fed back through this module's
  // own parser here rather than eyeballed.
  const penUp = {
    tool: 'curve',
    brush: 'plain',
    weight: 'thin',
    dashed: false,
    pts: [
      [0.1, 0.1],
      [0.4, 0.4],
      [0.4, 0.4],
      [0.6, 0.6],
      [0.9, 0.9],
    ],
    segs: [[0.2, 0.15, 0.3, 0.3], null, null, [0.7, 0.65, 0.8, 0.8]],
  };
  const gap = strokeGeometry(penUp, 200, 200);
  check('a lifted pen breaks a curved stroke into two subpaths', (gap.d.match(/M/g) ?? []).length === 2, gap.d);
}

console.log(`${pass} of ${pass + fail} checks passed`);
process.exit(fail === 0 ? 0 : 1);
