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
await build({
  entryPoints: [entry],
  bundle: true,
  format: 'esm',
  platform: 'node',
  outfile,
  logLevel: 'silent',
});
const {
  assemblySweep,
  classifyAssemblyInputs,
  assemblyBlocks,
  compactAssemblyBlockOrder,
  assemblyLayout,
  mapFormToTechCardInsert,
  techCardDefaultData,
} = await import(pathToFileURL(outfile).href);

const failed = new Set();
const fail = (name, msg) => {
  failed.add(name);
  console.log(`FAIL  ${name}\n      ${msg}`);
};
const eq = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const ck = (ok, name, msg) => {
  if (!ok) fail(name, msg);
};

function run(name, pieces, rawSteps, expect) {
  const p = pieces.map((k) => ({ lineKey: k, name: `деталь ${k}` }));
  const keys = new Set(pieces);
  const steps = rawSteps.map((s) => ({
    inputs: classifyAssemblyInputs(keys, s.in ?? []),
    outputUnitKey: s.out ?? '',
    outputUnitName: s.name ?? '',
    assemblyBlockDetached: !!s.detached,
  }));
  const res = assemblySweep(p, steps);
  if (res.violations.length > 0) {
    fail(name, `фикстура невалидна: ${res.violations.map((v) => v.detail).join(', ')}`);
    return;
  }
  const b = assemblyBlocks(steps, res);
  const gotOrder = b.blocks.map((x) => x.key);
  if (!eq(gotOrder, expect.order))
    fail(
      name,
      `порядок блоков ${JSON.stringify(gotOrder)}, ожидался ${JSON.stringify(expect.order)}`,
    );
  for (const [key, wantSteps] of Object.entries(expect.steps)) {
    const got = b.blocks.find((x) => x.key === key)?.steps ?? [];
    if (!eq(got, wantSteps))
      fail(
        name,
        `блок ${key}: шаги ${JSON.stringify(got)}, ожидались ${JSON.stringify(wantSteps)}`,
      );
  }
  if (expect.loose !== undefined && !eq(b.loose.steps, expect.loose)) {
    fail(
      name,
      `хвост «вне узлов»: ${JSON.stringify(b.loose.steps)}, ожидался ${JSON.stringify(expect.loose)}`,
    );
  }
  if (expect.standalone !== undefined && !eq(b.standalone, expect.standalone)) {
    fail(
      name,
      `отдельные шаги: ${JSON.stringify(b.standalone)}, ожидались ${JSON.stringify(expect.standalone)}`,
    );
  }
  for (const index of b.standalone) {
    if (b.blockOfStep.has(index)) {
      fail(name, `отдельный шаг ${index} получил блок «${b.blockOfStep.get(index)}»`);
    }
  }
  if (expect.tileProcessing) {
    const layout = assemblyLayout([...b.blocks, b.loose], steps, res);
    for (const [key, want] of Object.entries(expect.tileProcessing)) {
      const got = layout.tileByKey.get(key)?.processing ?? [];
      if (!eq(got, want))
        fail(
          name,
          `обработки плитки ${key}: ${JSON.stringify(got)}, ожидались ${JSON.stringify(want)}`,
        );
    }
    if (layout.tailSteps.some((i) => b.standalone.includes(i))) {
      fail(name, `отдельный шаг попал в хвост схемы: ${JSON.stringify(layout.tailSteps)}`);
    }
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

run(
  'отделённая обработка остаётся на плитке и не попадает ни в блок, ни в хвост',
  ['A', 'B', 'C', 'D'],
  [
    { in: ['A', 'B'], out: 'FIRST', name: 'первый узел' },
    { in: ['A'], detached: true },
    { in: ['C', 'D'], out: 'SECOND', name: 'второй узел' },
  ],
  {
    order: ['FIRST', 'SECOND'],
    steps: { FIRST: [0], SECOND: [2] },
    standalone: [1],
    loose: [],
    tileProcessing: { A: [1] },
  },
);

console.log('\nзапись собирает операции юнита подряд и перевозит ссылку дефекта');
{
  const pieces = ['A', 'B', 'C', 'D'].map((lineKey) => ({ lineKey, name: `piece ${lineKey}` }));
  const raw = [
    { id: 'collar-fuse', in: ['A'] },
    { id: 'sleeve-fuse', in: ['C'] },
    { id: 'collar-gather', in: ['B'] },
    { id: 'sleeve-join', in: ['C', 'D'], out: 'SLEEVE' },
    { id: 'collar-join', in: ['A', 'B'], out: 'COLLAR' },
    { id: 'collar-press', in: ['COLLAR'] },
    { id: 'garment-join', in: ['COLLAR', 'SLEEVE'], out: 'GARMENT' },
  ];
  const keys = new Set(pieces.map((piece) => piece.lineKey));
  const steps = raw.map((step) => ({
    inputs: classifyAssemblyInputs(keys, step.in),
    outputUnitKey: step.out ?? '',
    outputUnitName: '',
  }));
  const res = assemblySweep(pieces, steps);
  const order = compactAssemblyBlockOrder(assemblyBlocks(steps, res), steps.length);
  ck(
    eq(order, [0, 2, 4, 5, 1, 3, 6]),
    'COLLAR 10/30/50/60 становится непрерывным 10/20/30/40',
    JSON.stringify(order),
  );

  const operation = (step) => ({
    operationType: 'TECH_CARD_OPERATION_TYPE_MACHINE',
    zone: 'TECH_CARD_GARMENT_ZONE_OUTER',
    inputKeys: step.in,
    outputUnitKey: step.out ?? '',
    outputUnitName: '',
    note: step.id,
  });
  const sent = mapFormToTechCardInsert({
    ...techCardDefaultData,
    pieces,
    operations: raw.map(operation),
    issues: [{ operationNumber: 50, description: 'join issue' }],
  });
  ck(
    eq(
      (sent.operations ?? []).map((step) => step.note),
      order.map((index) => raw[index].id),
    ),
    'маппер пишет настоящий payload в порядке блоков',
    JSON.stringify((sent.operations ?? []).map((step) => step.note)),
  );
  ck(
    sent.issues?.[0]?.operationNumber === 30,
    'issue с прежней операции 50 следует за collar-join на 30',
    JSON.stringify(sent.issues?.[0]),
  );

  const dependentRaw = [
    { in: ['C'] },
    { in: ['A'] },
    { in: ['A', 'B'], out: 'CHILD' },
    { in: ['C', 'CHILD'], out: 'PARENT' },
  ];
  const dependentSteps = dependentRaw.map((step) => ({
    inputs: classifyAssemblyInputs(keys, step.in),
    outputUnitKey: step.out ?? '',
    outputUnitName: '',
  }));
  const dependentResult = assemblySweep(pieces, dependentSteps);
  const dependentOrder = compactAssemblyBlockOrder(
    assemblyBlocks(dependentSteps, dependentResult),
    dependentSteps.length,
  );
  const reordered = dependentOrder.map((index) => dependentSteps[index]);
  ck(
    eq(dependentOrder, [1, 2, 0, 3]) && assemblySweep(pieces, reordered).violations.length === 0,
    'дочерний юнит целиком идёт раньше зависимого родителя',
    JSON.stringify(dependentOrder),
  );
}

console.log('\nзапись сохраняет локальный следующий номер детали и блока');
{
  const operation = (
    note,
    inputKeys,
    outputUnitKey = '',
    operationType = 'TECH_CARD_OPERATION_TYPE_PRESS',
  ) => ({
    operationType,
    zone: 'TECH_CARD_GARMENT_ZONE_OUTER',
    inputKeys,
    outputUnitKey,
    outputUnitName: '',
    note,
  });

  const pieceOperations = [
    operation('sleeve-fusing', ['SLEEVE'], '', 'TECH_CARD_OPERATION_TYPE_FUSING'),
    operation('sleeve-press', ['SLEEVE']),
    operation('body-join', ['A', 'B'], 'BODY'),
    ...Array.from({ length: 66 }, (_, i) => operation(`body-${i}`, ['BODY'])),
  ];
  const pieceSent = mapFormToTechCardInsert({
    ...techCardDefaultData,
    pieces: ['SLEEVE', 'A', 'B'].map((lineKey) => ({ lineKey, name: lineKey })),
    operations: pieceOperations,
  });
  const piecePress = pieceSent.operations?.find((step) => step.note === 'sleeve-press');
  ck(
    pieceOperations.length === 69 && piecePress?.operationNumber === 20,
    'owner: standalone sleeve fusing 10 + press сохраняется как 20',
    JSON.stringify(piecePress?.operationNumber),
  );

  const blockOperations = [
    ...Array.from({ length: 13 }, (_, i) => operation(`other-${i}`, ['OTHER'])),
    operation('sleeve-join', ['A', 'B'], 'SLEEVE'),
    operation('sleeve-press', ['SLEEVE']),
    ...Array.from({ length: 53 }, (_, i) => operation(`tail-${i}`, ['OTHER'])),
  ];
  const blockSent = mapFormToTechCardInsert({
    ...techCardDefaultData,
    pieces: ['A', 'B', 'OTHER'].map((lineKey) => ({ lineKey, name: lineKey })),
    operations: blockOperations,
  });
  const blockPress = blockSent.operations?.find((step) => step.note === 'sleeve-press');
  ck(
    blockOperations.length === 68 && blockPress?.operationNumber === 150,
    'owner: block ending 140 + press сохраняется как 150',
    JSON.stringify(blockPress?.operationNumber),
  );
}

console.log(`\n${13 - failed.size}/13 кейсов прошло`);
if (failed.size) process.exitCode = 1;
