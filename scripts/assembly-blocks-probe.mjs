#!/usr/bin/env node
// Прогон группировки в блоки подсборок.
//
// Отдельно от общих кейсов движка намеренно: те — контракт с СЕРВЕРОМ и обязаны совпадать с
// бэкендной копией побайтно. Группировка же чисто клиентская, сервер про блоки не знает, и
// подмешивать её в общий файл значило бы заставить бэкенд хранить кейсы того, чего у него нет.
//
//   node scripts/assembly-blocks-probe.mjs

import { build } from 'esbuild';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, resolve } from 'node:path';
import { tmpdir } from 'node:os';

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, '..');
const entry = resolve(root, 'scripts/assembly-blocks-probe-entry.ts');

const outfile = resolve(tmpdir(), `assembly-blocks-${process.pid}.mjs`);
await build({ entryPoints: [entry], bundle: true, format: 'esm', platform: 'node', outfile, logLevel: 'silent' });
const { assemblySweep, classifyAssemblyInputs, assemblyBlocks } = await import(pathToFileURL(outfile).href);

const failed = new Set();
const fail = (name, msg) => {
  failed.add(name);
  console.log(`FAIL  ${name}\n      ${msg}`);
};
const eq = (a, b) => JSON.stringify(a) === JSON.stringify(b);

function run(name, pieces, rawSteps, expect) {
  const p = pieces.map((k) => ({ lineKey: k, name: `деталь ${k}` }));
  const keys = new Set(pieces);
  const steps = rawSteps.map((s) => ({
    inputs: classifyAssemblyInputs(keys, s.in ?? []),
    outputUnitKey: s.out ?? '',
    outputUnitName: s.name ?? '',
  }));
  const res = assemblySweep(p, steps);
  if (res.violations.length > 0) {
    fail(name, `фикстура невалидна: ${res.violations.map((v) => v.detail).join(', ')}`);
    return;
  }
  const b = assemblyBlocks(steps, res);
  const gotOrder = b.blocks.map((x) => x.key);
  if (!eq(gotOrder, expect.order)) fail(name, `порядок блоков ${JSON.stringify(gotOrder)}, ожидался ${JSON.stringify(expect.order)}`);
  for (const [key, wantSteps] of Object.entries(expect.steps)) {
    const got = b.blocks.find((x) => x.key === key)?.steps ?? [];
    if (!eq(got, wantSteps)) fail(name, `блок ${key}: шаги ${JSON.stringify(got)}, ожидались ${JSON.stringify(wantSteps)}`);
  }
  if (expect.loose !== undefined && !eq(b.loose.steps, expect.loose)) {
    fail(name, `хвост «вне узлов»: ${JSON.stringify(b.loose.steps)}, ожидался ${JSON.stringify(expect.loose)}`);
  }
  if (expect.absorbedInto) {
    for (const [key, into] of Object.entries(expect.absorbedInto)) {
      const got = b.blocks.find((x) => x.key === key)?.absorbedInto ?? '';
      if (got !== into) fail(name, `узел ${key}: ушёл в «${got}», ожидалось «${into}»`);
    }
  }
}

// САМЫЙ ВАЖНЫЙ КЕЙС. Заготовительный шаг над ДЕТАЛЬЮ (обметать полочку) обязан лечь в блок узла,
// который эту деталь в итоге съест. Без транзитивной атрибуции он ушёл бы в хвост «вне узлов»,
// а таких шагов на реальном маршруте треть — досье превратилось бы в свалку, и технолог начал бы
// приклеивать фиктивные входы, чтобы получить блок.
run(
  'заготовительный шаг над деталью попадает в блок её узла',
  ['FR', 'BK'],
  [
    { in: ['FR'] }, // обметать полочку — ДО того, как она вошла в узел
    { in: ['FR', 'BK'], out: 'SHELL', name: 'корпус' },
  ],
  { order: ['SHELL'], steps: { SHELL: [0, 1] }, loose: [] },
);

run(
  'поглощающий шаг лежит в блоке своего узла',
  ['FR', 'BK', 'SL'],
  [
    { in: ['FR', 'BK'], out: 'SHELL', name: 'корпус' },
    { in: ['SHELL'] }, // обработка по узлу
    { in: ['SHELL', 'SL'], out: 'SHELL' }, // поглощение
  ],
  { order: ['SHELL'], steps: { SHELL: [0, 1, 2] }, loose: [] },
);

run(
  'два узла — два блока, порядок по производящему шагу',
  ['FR', 'BK', 'HD', 'LN'],
  [
    { in: ['HD', 'LN'], out: 'HOOD', name: 'капюшон' },
    { in: ['FR', 'BK'], out: 'SHELL', name: 'корпус' },
  ],
  { order: ['HOOD', 'SHELL'], steps: { HOOD: [0], SHELL: [1] }, loose: [] },
);

run(
  'съеденный узел знает, куда ушёл',
  ['FR', 'BK', 'HD', 'LN'],
  [
    { in: ['FR', 'BK'], out: 'SHELL', name: 'корпус' },
    { in: ['HD', 'LN'], out: 'HOOD', name: 'капюшон' },
    { in: ['SHELL', 'HOOD'], out: 'GARMENT', name: 'изделие' },
  ],
  {
    order: ['SHELL', 'HOOD', 'GARMENT'],
    steps: { SHELL: [0], HOOD: [1], GARMENT: [2] },
    loose: [],
    absorbedInto: { SHELL: 'GARMENT', HOOD: 'GARMENT', GARMENT: '' },
  },
);

run(
  'деталь, не достигшая ни одного узла, уводит свой шаг в хвост',
  ['FR', 'BK', 'FLAP'],
  [
    { in: ['FLAP'] }, // обработка клапана, который никуда не вошёл
    { in: ['FR', 'BK'], out: 'SHELL', name: 'корпус' },
  ],
  { order: ['SHELL'], steps: { SHELL: [1] }, loose: [0] },
);

run(
  'неразмеченная карточка — всё в хвосте, блоков нет',
  ['FR', 'BK'],
  [{ in: ['FR'] }, { in: ['BK'] }],
  { order: [], steps: {}, loose: [0, 1] },
);

console.log(`\n${6 - failed.size}/6 кейсов прошло`);
if (failed.size) process.exitCode = 1;
