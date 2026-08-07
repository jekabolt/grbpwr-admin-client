#!/usr/bin/env node
// ЗОНД ХИРАЛЬНОСТИ. Two independent questions, neither answered by the code under test:
//
//   A. Does a mirrored placement SURVIVE save → wire → reopen?
//   B. Does the layout editor's SVG transform string compose to the SAME geometry as the
//      engine's placedPoly — at a rotation where a wrong composition order is visible?
//
// (B) is deliberately NOT checked with variantPt/rotatePt. The reference here is 2×3 affine
// matrix algebra written out from the SVG spec, and the SUBJECT is the repo's placedPoly. The
// repo's standing scar is a library whose Union agreed with its own Difference; a check that
// asks the transform to confirm itself would reproduce it exactly.
//
// The transform string is not restated either — it is EXTRACTED from layout-editor.tsx and
// evaluated as the template literal it is, so this probe fails if that line ever changes shape.
import { build as esbuild } from 'esbuild';
import { readFile } from 'node:fs/promises';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, resolve } from 'node:path';
import { tmpdir } from 'node:os';

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = resolve(HERE, '..');
const outfile = resolve(tmpdir(), `marker-chirality-${process.pid}.mjs`);

await esbuild({
  entryPoints: [resolve(HERE, 'marker-chirality-entry.ts')],
  bundle: true,
  platform: 'node',
  format: 'esm',
  target: 'node20',
  outfile,
  logLevel: 'warning',
  absWorkingDir: REPO,
});
const m = await import(pathToFileURL(outfile).href);

let failures = 0;
const check = (ok, what, detail = '') => {
  if (!ok) failures++;
  console.log(`${ok ? '  ok  ' : '  FAIL'} ${what}${detail ? `  — ${detail}` : ''}`);
};
const EPS = 1e-9;
const maxDev = (a, b) =>
  a.length !== b.length
    ? Infinity
    : Math.max(...a.map((p, i) => Math.max(Math.abs(p.x - b[i].x), Math.abs(p.y - b[i].y))));

// ── 0. The probe piece must actually be chiral ───────────────────────────────────────────
// If some rotation reproduced the mirror, every assertion below would be vacuous: dropping
// `flipped` would land the piece exactly where it belonged and nothing could tell.
console.log('\n0 · деталь действительно хиральна (зеркало не воспроизводится поворотом)');
{
  const mirrored = m.variantPoly(m.PIECE.poly, 0, true);
  for (const rot of [0, 90, 180, 270]) {
    const plain = m.variantPoly(m.PIECE.poly, rot, false);
    // Compare as point SETS (rotation may permute nothing here, but be strict about intent):
    const key = (poly) =>
      poly
        .map((p) => `${p.x.toFixed(6)},${p.y.toFixed(6)}`)
        .sort()
        .join('|');
    check(key(plain) !== key(mirrored), `поворот ${rot}° не даёт зеркала`);
  }
}

// ── A. Round trip ────────────────────────────────────────────────────────────────────────
console.log('\nA · save → провод → reopen сохраняет хиральность');
const layout = m.build();
check(layout.schemaVersion === 3, 'блоб заявляет схему 3');
check(
  layout.placements.filter((p) => p.flipped === true).length === 4,
  'в блобе ровно 4 зеркальных размещения',
  `${layout.placements.filter((p) => p.flipped === true).length}`,
);

// THE WIRE, as the server really behaves: protojson omits proto3 default values, so
// `flipped:false`, `rotDeg:0`, `instance:0` and `xCm:0` are NOT in the stored string. A reader
// that needed the key present would break here and only here.
const protojson = (v) => {
  if (Array.isArray(v)) return v.map(protojson);
  if (v && typeof v === 'object') {
    const out = {};
    for (const [k, x] of Object.entries(v)) {
      if (x === false || x === 0 || x === '' || x === undefined) continue;
      out[k] = protojson(x);
    }
    return out;
  }
  return v;
};
const onWire = JSON.parse(JSON.stringify(protojson(layout)));
check(
  !('flipped' in onWire.placements[1]) && onWire.placements[0].flipped === true,
  'провод роняет flipped:false и несёт flipped:true (как protojson)',
);

const view = m.read(onWire);
const pieceAfter = view.pieces.find((p) => p.id === 7);
check(!!pieceAfter, 'деталь вернулась');

const beforePlaced = m.PLACEMENTS.map((pl) => m.placedPoly(m.PIECE.poly, pl));
const afterPlaced = view.result.placements.map((pl) => m.placedPoly(pieceAfter.poly, pl));
for (let i = 0; i < m.PLACEMENTS.length; i++) {
  const pl = m.PLACEMENTS[i];
  const d = maxDev(beforePlaced[i], afterPlaced[i]);
  check(
    d <= EPS,
    `размещение ${i} (rot ${pl.rot}°, ${pl.flipped ? 'ЗЕРКАЛО' : 'обычное'}) — геометрия совпала`,
    `откл ${d.toExponential(2)} см`,
  );
  check(
    view.result.placements[i].flipped === (pl.flipped === true),
    `размещение ${i} — флаг зеркала прочитан как записан`,
  );
}

// НЕГАТИВНЫЙ КОНТРОЛЬ: без этой правки (писатель не пишет flipped) 90° уезжает. Без него
// «геометрия совпала» ничего не доказывает — она совпала бы и у зонда, который не смотрит.
console.log('\nA′ · контроль: писатель БЕЗ flipped даёт другую геометрию');
{
  const crippled = JSON.parse(JSON.stringify(onWire));
  for (const p of crippled.placements) delete p.flipped;
  const bad = m.read(crippled);
  const badPiece = bad.pieces.find((p) => p.id === 7);
  for (let i = 0; i < m.PLACEMENTS.length; i++) {
    const pl = m.PLACEMENTS[i];
    const d = maxDev(beforePlaced[i], m.placedPoly(badPiece.poly, bad.result.placements[i]));
    if (pl.flipped) {
      check(d > 1, `rot ${pl.rot}° зеркальное — потеря флага ВИДНА`, `сдвиг ${d.toFixed(2)} см`);
    } else {
      check(d <= EPS, `rot ${pl.rot}° обычное — не затронуто`);
    }
  }
}

// ── B. The editor's SVG transform vs the engine's placedPoly ─────────────────────────────
console.log('\nB · строка transform редактора == placedPoly движка');

// The transform template, taken OUT OF THE SOURCE and evaluated as-is.
const src = await readFile(resolve(REPO, 'src/components/managers/tech-card/components/nesting/layout-editor.tsx'), 'utf8');
const mt = src.match(/transform=\{`(translate\([^`]*?)`\}/);
if (!mt) {
  console.log('  FAIL не нашёл строку transform в layout-editor.tsx');
  process.exit(1);
}
console.log(`     шаблон из исходника: ${mt[1]}`);
// eslint-disable-next-line no-new-func
const renderTransform = new Function('live', 'pl', 'return `' + mt[1] + '`');

// SVG affine algebra, written from the spec. [a c e / b d f / 0 0 1], point-column convention.
const MUL = (A, B) => ({
  a: A.a * B.a + A.c * B.b,
  b: A.b * B.a + A.d * B.b,
  c: A.a * B.c + A.c * B.d,
  d: A.b * B.c + A.d * B.d,
  e: A.a * B.e + A.c * B.f + A.e,
  f: A.b * B.e + A.d * B.f + A.f,
});
const ID = { a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 };
const apply = (M, p) => ({ x: M.a * p.x + M.c * p.y + M.e, y: M.b * p.x + M.d * p.y + M.f });
// A transform LIST is applied left-to-right as matrix products (SVG 1.1 §7.4), so the leftmost
// entry is the outermost operation on the point.
const parseTransform = (s) => {
  let M = ID;
  const re = /(translate|rotate|scale|matrix)\s*\(([^)]*)\)/g;
  let hit;
  while ((hit = re.exec(s))) {
    const n = hit[2].trim().split(/[\s,]+/).map(Number);
    let T;
    if (hit[1] === 'translate') T = { ...ID, e: n[0], f: n[1] ?? 0 };
    else if (hit[1] === 'scale') T = { ...ID, a: n[0], d: n[1] ?? n[0] };
    else if (hit[1] === 'rotate') {
      const r = (n[0] * Math.PI) / 180;
      const cs = Math.cos(r), sn = Math.sin(r);
      T = { a: cs, b: sn, c: -sn, d: cs, e: 0, f: 0 };
    } else T = { a: n[0], b: n[1], c: n[2], d: n[3], e: n[4], f: n[5] };
    M = MUL(M, T);
  }
  return M;
};

for (const pl of m.PLACEMENTS) {
  const str = renderTransform({ x: pl.x, y: pl.y }, pl);
  const M = parseTransform(str);
  const drawn = m.PIECE.poly.map((p) => apply(M, p));
  const cut = m.placedPoly(m.PIECE.poly, pl);
  const d = maxDev(drawn, cut);
  check(
    d < 1e-9,
    `rot ${pl.rot}°${pl.flipped ? ' ЗЕРКАЛО' : '       '} · «${str}»`,
    `откл ${d.toExponential(2)} см`,
  );
}

// НЕГАТИВНЫЕ КОНТРОЛИ ДЛЯ (B). Обе ошибки рисуют правдоподобную деталь; проверка обязана их
// ловить, иначе она не проверка.
console.log('\nB′ · контроль: неверный ПОРЯДОК расходится на 2θ (и молчит на 0°/180°)');
for (const pl of m.PLACEMENTS.filter((p) => p.flipped)) {
  const wrong = parseTransform(`translate(${pl.x} ${pl.y}) scale(-1 1) rotate(${pl.rot})`);
  const cut = m.placedPoly(m.PIECE.poly, pl);
  const d = maxDev(m.PIECE.poly.map((p) => apply(wrong, p)), cut);
  const visible = pl.rot % 180 !== 0;
  check(
    visible ? d > 1 : d <= 1e-9,
    `rot ${pl.rot}° — ${visible ? 'РАСХОЖДЕНИЕ видно' : 'расхождения НЕТ (ровно как предупреждал договор)'}`,
    `откл ${d.toFixed(3)} см`,
  );
}
console.log('\nB″ · контроль: неверная ОСЬ (scale(1 -1)) = верная, повёрнутая на 180°');
for (const pl of m.PLACEMENTS.filter((p) => p.flipped)) {
  const wrongAxis = parseTransform(`translate(${pl.x} ${pl.y}) rotate(${pl.rot}) scale(1 -1)`);
  const cut = m.placedPoly(m.PIECE.poly, pl);
  const d = maxDev(m.PIECE.poly.map((p) => apply(wrongAxis, p)), cut);
  // M_x = R(180)·M_y, so the wrong axis equals the right one under an extra half turn.
  const halfTurned = parseTransform(`translate(${pl.x} ${pl.y}) rotate(${(pl.rot + 180) % 360}) scale(-1 1)`);
  const dHalf = maxDev(m.PIECE.poly.map((p) => apply(wrongAxis, p)), m.PIECE.poly.map((p) => apply(halfTurned, p)));
  check(d > 1 && dHalf <= 1e-9, `rot ${pl.rot}° — иная деталь, ровно в полуобороте`, `откл ${d.toFixed(2)} см, до полуоборота ${dHalf.toExponential(1)}`);
}

// ── C. Политика переворота ───────────────────────────────────────────────────────────────
console.log('\nC · политика переворота (H1)');
check(m.allowsFlip('any') && m.allowsFlip('two_way'), 'any / two_way разрешают переворот');
check(!m.allowsFlip('one_way'), 'one_way запрещает');
check(!m.allowsFlip('unknown'), 'unknown ЗАПРЕЩАЕТ — сервер иначе откажет после прогона');
check(
  JSON.stringify(m.allowedRotations('unknown', false)) === '[0]',
  'unknown без cross-grain → [0]',
  JSON.stringify(m.allowedRotations('unknown', false)),
);
check(
  JSON.stringify(m.allowedRotations('unknown', true)) === '[0,90,270]',
  'unknown с cross-grain → [0,90,270] (90/270 по-прежнему за allowCrossGrain)',
  JSON.stringify(m.allowedRotations('unknown', true)),
);
check(
  JSON.stringify(m.allowedRotations('any', false)) === '[0,180]' &&
    JSON.stringify(m.allowedRotations('two_way', true)) === '[0,90,180,270]' &&
    JSON.stringify(m.allowedRotations('one_way', true)) === '[0,90,270]',
  'остальная матрица не тронута',
);

console.log(failures === 0 ? '\nВСЁ ЗЕЛЁНОЕ\n' : `\n${failures} ПРОВАЛОВ\n`);
process.exit(failures === 0 ? 0 : 1);
