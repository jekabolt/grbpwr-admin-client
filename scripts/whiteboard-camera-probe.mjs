#!/usr/bin/env node
// КАМЕРА ДОСКИ: точка под курсором остаётся под курсором. Это единственное обещание зума, которое
// человек проверяет рукой, и единственное, которое тихо ломается: перепутанный знак или деление на
// старый zoom вместо нового дают зум «к углу», а гладкость остаётся — на глаз в первую секунду не
// видно. Проба держит и остальную алгебру `model/camera.ts`, через которую пойдут все инструменты.
//
//   node scripts/whiteboard-camera-probe.mjs

import { build } from 'esbuild';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, resolve } from 'node:path';
import { tmpdir } from 'node:os';

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, '..');
const entry = resolve(root, 'src/components/managers/whiteboards/model/camera.ts');
const outfile = resolve(tmpdir(), `whiteboard-camera-${process.pid}.mjs`);
await build({
  entryPoints: [entry],
  bundle: true,
  format: 'esm',
  platform: 'node',
  outfile,
  logLevel: 'silent',
});
const {
  screenToWorld,
  worldToScreen,
  panBy,
  zoomAt,
  zoomStop,
  clampZoom,
  fitBounds,
  wheelZoomFactor,
  gridStep,
  MIN_ZOOM,
  MAX_ZOOM,
  FIT_PADDING,
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
const nearP = (a, b, eps) => near(a.x, b.x, eps) && near(a.y, b.y, eps);
const fmt = (p) => `(${p.x}, ${p.y})`;

const cams = [
  { x: 0, y: 0, zoom: 1 },
  { x: -640, y: -380, zoom: 1 },
  { x: 1234.5, y: -98.25, zoom: 0.25 },
  { x: -50, y: 700, zoom: 3.2 },
];
const points = [
  { x: 0, y: 0 },
  { x: 640, y: 380 },
  { x: 17, y: 901 },
];

for (const c of cams) {
  for (const p of points) {
    const back = worldToScreen(c, screenToWorld(c, p));
    check(`экран→мир→экран ${fmt(p)} @${c.zoom}`, nearP(back, p, 1e-9), fmt(back));
  }
}

// Зум под курсором: мировая точка под якорем до и после — одна и та же.
for (const c of cams) {
  for (const anchor of points) {
    for (const z of [0.1, 0.5, 1, 2.75, 4]) {
      const before = screenToWorld(c, anchor);
      const next = zoomAt(c, anchor, z);
      const after = screenToWorld(next, anchor);
      check(
        `зум к ${fmt(anchor)} ${c.zoom}→${z}`,
        nearP(before, after, 1e-9),
        `${fmt(before)} ≠ ${fmt(after)}`,
      );
    }
  }
}

// Зум за пределы — в пределах, и точка под курсором всё равно стоит.
{
  const c = { x: 10, y: 20, zoom: 1 };
  const a = { x: 300, y: 200 };
  const hi = zoomAt(c, a, 50);
  check('зум упирается в MAX', hi.zoom === MAX_ZOOM, String(hi.zoom));
  check('при упоре точка стоит', nearP(screenToWorld(c, a), screenToWorld(hi, a), 1e-9));
  check('зум упирается в MIN', zoomAt(c, a, 0.001).zoom === MIN_ZOOM);
  check('clampZoom', clampZoom(-1) === MIN_ZOOM && clampZoom(9) === MAX_ZOOM && clampZoom(1) === 1);
}

// Перетаскивание: мир едет вместе с рукой на любом зуме.
for (const c of cams) {
  const p = { x: 100, y: 100 };
  const w = screenToWorld(c, p);
  const moved = panBy(c, 37, -12);
  const s = worldToScreen(moved, w);
  check(`пан @${c.zoom}`, nearP(s, { x: 137, y: 88 }, 1e-9), fmt(s));
}

// Колесо: симметрично (+d, затем −d — тот же зум), вниз = отдалить, строки ≈ 16px.
check('колесо симметрично', near(wheelZoomFactor(120) * wheelZoomFactor(-120), 1, 1e-12));
check('колесо вниз отдаляет', wheelZoomFactor(10) < 1 && wheelZoomFactor(-10) > 1);
check('колесо в строках', near(wheelZoomFactor(3, 1), wheelZoomFactor(48, 0), 1e-12));

// Ступени кнопок: всегда двигают, никогда не стоят на месте.
check('ступень вверх от 1', zoomStop(1, 1) === 1.5);
check('ступень вниз от 1', zoomStop(1, -1) === 0.75);
check('ступень вверх от промежуточного', zoomStop(1.2, 1) === 1.5);
check('ступень вниз от промежуточного', zoomStop(1.2, -1) === 1);
check('ступень вверх от MAX', zoomStop(MAX_ZOOM, 1) === MAX_ZOOM);
check('ступень вниз от MIN', zoomStop(MIN_ZOOM, -1) === MIN_ZOOM);

// Fit: пустая доска — начало координат в центре на 100%; содержимое — по центру, с полями,
// не крупнее 100%.
{
  const vp = { width: 1280, height: 720 };
  const empty = fitBounds(null, vp);
  check('fit пустой: 100%', empty.zoom === 1);
  check(
    'fit пустой: начало в центре',
    nearP(worldToScreen(empty, { x: 0, y: 0 }), { x: 640, y: 360 }, 1e-9),
  );

  const big = { x: -2000, y: 500, width: 4000, height: 1000 };
  const f = fitBounds(big, vp);
  const tl = worldToScreen(f, { x: big.x, y: big.y });
  const br = worldToScreen(f, { x: big.x + big.width, y: big.y + big.height });
  check(
    'fit большой: влезает с полями',
    tl.x >= FIT_PADDING - 1e-9 &&
      br.x <= vp.width - FIT_PADDING + 1e-9 &&
      tl.y >= -1e-9 &&
      br.y <= vp.height + 1e-9,
    `${fmt(tl)} ${fmt(br)}`,
  );
  check(
    'fit большой: по центру',
    near((tl.x + br.x) / 2, 640, 1e-9) && near((tl.y + br.y) / 2, 360, 1e-9),
  );

  const small = { x: 10, y: 10, width: 200, height: 200 };
  check('fit маленький: не крупнее 100%', fitBounds(small, vp).zoom === 1);
}

// Сетка: шаг на экране не мельче 12px, на 100% — 24.
check('сетка 100%', gridStep(1) === 24);
for (const z of [0.1, 0.17, 0.25, 0.5])
  check(`сетка @${z} ≥ 12`, gridStep(z) >= 12, String(gridStep(z)));

console.log(`whiteboard-camera: ${pass} ok, ${fail} fail`);
process.exit(fail ? 1 : 0);
