#!/usr/bin/env node
// Прогон слоя ручных позиций и жестов схемы (T-29).
//
// Проверяет три чистые функции, каждая из которых ошибается ТИХО: оверрайд, потерявший ноду за
// краем полотна; hit-test, отдающий не ту цель; вердикт, разрешающий соединить уже съеденное.
// Ни одну из трёх ошибок не видно ни в tsc, ни на картинке — видно только в неверном поведении
// руки, и то не сразу.
//
//   node scripts/assembly-positions-probe.mjs

import { build } from 'esbuild';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, resolve } from 'node:path';
import { tmpdir } from 'node:os';

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, '..');
const entry = resolve(root, 'scripts/assembly-positions-probe-entry.ts');

const outfile = resolve(tmpdir(), `assembly-positions-${process.pid}.mjs`);
await build({ entryPoints: [entry], bundle: true, format: 'esm', platform: 'node', outfile, logLevel: 'silent' });
const { assemblySweep, classifyAssemblyInputs, assemblyBlocks, assemblyLayout, applyOverrides, hitNode, combineVerdict } =
  await import(pathToFileURL(outfile).href);

let checks = 0;
const failed = new Set();
const fail = (name, msg) => {
  failed.add(name);
  console.log(`FAIL  ${name}\n      ${msg}`);
};
const j = (v) => JSON.stringify(v);
const eq = (a, b) => j(a) === j(b);
const is = (name, got, want) => {
  checks++;
  if (!eq(got, want)) fail(name, `${j(got)} ≠ ${j(want)}`);
};

/** Собрать раскладку из описания графа — тем же путём, что компонент. */
function fixture(pieces, rawSteps) {
  const p = pieces.map((k) => ({ lineKey: k, name: `деталь ${k}` }));
  const keys = new Set(pieces);
  const steps = rawSteps.map((s) => ({
    inputs: classifyAssemblyInputs(keys, s.in ?? []),
    outputUnitKey: s.out ?? '',
    outputUnitName: s.name ?? '',
  }));
  const res = assemblySweep(p, steps);
  const grouped = assemblyBlocks(steps, res);
  const layout = assemblyLayout([...grouped.blocks, grouped.loose], steps, res);
  return { layout, res, steps };
}

// --- фикстуры -----------------------------------------------------------------------------------

// Один узел, свободная деталь и шаг вне узлов: на полотне есть бокс, хвост и плитки обоих
// состояний — то есть все три вида нод разом.
const A = fixture(
  ['FR', 'BK', 'FLAP'],
  [{ in: ['FLAP'] }, { in: ['FR', 'BK'], out: 'SHELL', name: 'корпус' }],
);
// Два живых узла и две свободные детали — фикстура вердиктов.
const B = fixture(
  ['FR', 'BK', 'HD', 'LN', 'SL', 'CF'],
  [
    { in: ['FR', 'BK'], out: 'SHELL', name: 'корпус' },
    { in: ['HD', 'LN'], out: 'HOOD', name: 'капюшон' },
  ],
);

// --- applyOverrides ------------------------------------------------------------------------------

{
  const name = 'пустой набор оверрайдов — точное тождество';
  const before = j(A.layout);
  const out = applyOverrides(A.layout, {});
  is(name, j(out.boxes), j(A.layout.boxes));
  is(name + ' (плитки)', j(out.tiles), j(A.layout.tiles));
  is(name + ' (хвост)', j(out.tail), j(A.layout.tail));
  is(name + ' (габариты)', [out.width, out.height], [A.layout.width, A.layout.height]);
  is('applyOverrides не мутирует вход', j(A.layout), before);
}

{
  const name = 'сдвиг бокса: едет он и его стопка, плитки и хвост на месте';
  const box = A.layout.boxes[0];
  const before = j(A.layout);
  const out = applyOverrides(A.layout, { [box.key]: { x: 500, y: 300 } });
  const moved = out.byKey.get(box.key);
  is(name, [moved.x, moved.y], [500, 300]);
  is(name + ' (stackTop едет вместе)', moved.stackTop, box.stackTop + (300 - box.y));
  is(name + ' (плитки не тронуты)', j(out.tiles), j(A.layout.tiles));
  is(name + ' (хвост не тронут)', j(out.tail), j(A.layout.tail));
  checks++;
  if (out.width < 500 + box.w + 24) fail(name, `полотно не выросло: width ${out.width}`);
  is(name + ' (вход не мутирован)', j(A.layout), before);
}

{
  const name = 'сдвиг плитки: бокс не шелохнулся';
  const tile = A.layout.tiles[0];
  const out = applyOverrides(A.layout, { [tile.key]: { x: 700, y: 400 } });
  const moved = out.tileByKey.get(tile.key);
  is(name, [moved.x, moved.y], [700, 400]);
  is(name + ' (боксы не тронуты)', j(out.boxes), j(A.layout.boxes));
  checks++;
  if (out.height < 400 + tile.h + 30) fail(name, `полотно не выросло: height ${out.height}`);
}

{
  const name = 'сдвиг хвостового бокса по зарезервированному ключу';
  const out = applyOverrides(A.layout, { '': { x: 640, y: 220 } });
  is(name, [out.tail.x, out.tail.y], [640, 220]);
  is(name + ' (узлы на месте)', j(out.boxes), j(A.layout.boxes));
}

{
  const name = 'оверрайд по неизвестному ключу игнорируется';
  const out = applyOverrides(A.layout, { 'КЛЮЧ-КОТОРОГО-НЕТ': { x: 9999, y: 9999 } });
  is(name, j(out.boxes), j(A.layout.boxes));
  is(name + ' (плитки)', j(out.tiles), j(A.layout.tiles));
  is(name + ' (габариты не выросли)', [out.width, out.height], [A.layout.width, A.layout.height]);
}

{
  // Испорченное или устаревшее хранилище иначе спрятало бы ноду навсегда: `overflow: auto` в
  // минус не прокручивается, и достать её нечем.
  const name = 'отрицательный оверрайд клампится в ноль';
  const box = A.layout.boxes[0];
  const out = applyOverrides(A.layout, { [box.key]: { x: -500, y: -20 } });
  const moved = out.byKey.get(box.key);
  is(name, [moved.x, moved.y], [0, 0]);
}

// --- hitNode --------------------------------------------------------------------------------------

{
  const box = A.layout.boxes[0];
  const tile = A.layout.tiles[0];
  is('hit: центр бокса', hitNode(A.layout, box.x + box.w / 2, box.y + box.h / 2), { kind: 'box', key: box.key });
  is('hit: центр плитки', hitNode(A.layout, tile.x + tile.w / 2, tile.y + tile.h / 2), {
    kind: 'tile',
    key: tile.key,
  });
  is('hit: хвостовой бокс — обычная цель с пустым ключом', hitNode(A.layout, A.layout.tail.x + 5, A.layout.tail.y + 5), {
    kind: 'box',
    key: '',
  });
  is('hit: пустое место — ничего', hitNode(A.layout, 5, A.layout.height - 5), null);
  // Границы включительны с обеих сторон: рука, попавшая ровно в край, попала в ноду.
  is('hit: левый верхний угол плитки', hitNode(A.layout, tile.x, tile.y), { kind: 'tile', key: tile.key });
  is('hit: правый нижний угол плитки', hitNode(A.layout, tile.x + tile.w, tile.y + tile.h), {
    kind: 'tile',
    key: tile.key,
  });
  is('hit: на пиксель левее плитки — уже не она', hitNode(A.layout, tile.x - 1, tile.y + 1), null);
}

{
  // Наложение возможно только ручными позициями — авто-раскладка ноды не пересекает. Меньшая
  // цель побеждает: большая под курсором почти всегда фон.
  const name = 'hit: при наложении плитка побеждает бокс';
  const box = A.layout.boxes[0];
  const tile = A.layout.tiles[0];
  const out = applyOverrides(A.layout, { [tile.key]: { x: box.x + 10, y: box.y + 10 } });
  is(name, hitNode(out, box.x + 20, box.y + 20), { kind: 'tile', key: tile.key });
}

{
  // Во время драга тащимая нода едет под курсором и перекрыла бы любую цель под собой —
  // без исключения жест «бросить одну на другую» был бы невыразим вовсе.
  const name = 'hit: исключённый ключ не может быть целью';
  const tile = A.layout.tiles[0];
  const cx = tile.x + tile.w / 2;
  const cy = tile.y + tile.h / 2;
  is(name + ' (без исключения — она)', hitNode(A.layout, cx, cy), { kind: 'tile', key: tile.key });
  is(name, hitNode(A.layout, cx, cy, tile.key), null);
  // Исключение снимает ТОЛЬКО её: то, что лежит под ней, целью остаётся.
  const box = A.layout.boxes[0];
  const over = applyOverrides(A.layout, { [tile.key]: { x: box.x + 10, y: box.y + 10 } });
  is(name + ' (под ней остаётся бокс)', hitNode(over, box.x + 20, box.y + 20, tile.key), {
    kind: 'box',
    key: box.key,
  });
}

// --- combineVerdict ---------------------------------------------------------------------------------

{
  const v = (a, b) => combineVerdict(a, b, B.res, B.steps);
  is('вердикт: две свободные детали — сшить', v('SL', 'CF'), { ok: true });
  is('вердикт: деталь на живой узел — поглощение узлом', v('SL', 'SHELL'), { ok: true, absorbInto: 'SHELL' });
  is('вердикт: узел на деталь — новый узел, не поглощение', v('SHELL', 'SL'), { ok: true });
  is('вердикт: узел на узел — поглощение ЦЕЛЬЮ', v('SHELL', 'HOOD'), { ok: true, absorbInto: 'HOOD' });
  is('вердикт: тащим съеденное — отказ с причиной', v('FR', 'SL'), {
    ok: false,
    reason: '«FR» уже съеден шагом 10 и лежит внутри узла SHELL',
  });
  is('вердикт: цель съедена — отказ с причиной', v('SL', 'HD'), {
    ok: false,
    reason: '«HD» уже съеден шагом 20 и лежит внутри узла HOOD',
  });
  // Не отказ, а отсутствие жеста: объяснять нечего, и снекбар был бы шумом.
  is('вердикт: нода сама на себя — жеста нет', v('SL', 'SL'), null);
  is('вердикт: дроп в хвостовой бокс — жеста нет', v('SL', ''), null);
  is('вердикт: тащим хвостовой бокс — жеста нет', v('', 'SL'), null);
}

console.log(`\n${checks - failed.size} из ${checks} проверок прошло`);
if (failed.size) process.exitCode = 1;
