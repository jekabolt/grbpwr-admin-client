#!/usr/bin/env node
// ОТПЕЧАТОК ФОРМЫ ЧЕРНОВИКА ДОСТАЁТ ДО ОПАСНЫХ ПОЛЕЙ.
//
// Черновик тех-карты восстанавливается через `form.reset` МИМО маппера чтения, поэтому поле,
// которого в черновике нет, получает zod-дефолт и уезжает на сервер КОМАНДОЙ СТЕРЕТЬ. У деталей и
// выносок это лечится переносом с карточки по ключу; у ОПЕРАЦИЙ ключа нет, и единственная защита —
// не предлагать черновик, записанный формой другого состава.
//
// Отличать составы должен отпечаток, и вся его ценность — в ГЛУБИНЕ обхода. Он уже однажды не
// сработал бы: забытое поле `pieceLineKey` живёт на четвёртом уровне
// (operations → media → annotations → pieceLineKey), и обход, обрывающийся выше, его не заметит.
// Проба фиксирует, что обход туда доходит, и что интроспекция схемы вообще работает — если zod
// сменит форму `_def`, отпечаток молча выродится в константу и перестанет различать что-либо.
//
//   node scripts/draft-shape-probe.mjs

import { build } from 'esbuild';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, resolve } from 'node:path';
import { rmSync } from 'node:fs';

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, '..');
const outfile = resolve(root, `scripts/.draft-shape-${process.pid}.mjs`);
await build({
  entryPoints: [resolve(root, 'scripts/draft-shape-probe-entry.ts')],
  bundle: true,
  format: 'esm',
  platform: 'node',
  absWorkingDir: root,
  outfile,
  logLevel: 'silent',
});
const { __draftShapeForTest } = await import(pathToFileURL(outfile).href);
rmSync(outfile, { force: true });

let pass = 0;
let fail = 0;
const check = (name, ok, detail = '') => {
  if (ok) pass++;
  else {
    fail++;
    console.error(`✗ ${name}${detail ? ` — ${detail}` : ''}`);
  }
};

const { shape, paths } = __draftShapeForTest();

check('интроспекция схемы работает', shape !== 'introspection-unavailable', shape);
check('отпечаток непустой и короткий', /^[0-9a-z]{4,10}$/.test(shape), shape);
check('обход собрал сотни путей', paths.length > 150, `путей: ${paths.length}`);
check('отпечаток стабилен между вызовами', __draftShapeForTest().shape === shape);

// Классы полей, которые молча терялись и ради которых отпечаток заведён.
const must = [
  // операции: у них нет стабильного ключа, переносить нечем
  'operations.media',
  'operations.media.mediaId',
  'operations.media.annotations',
  'operations.media.annotations.kind',
  'operations.media.annotations.pieceLineKey', // ← ровно то поле, которое забыли
  'operations.inputKeys',
  'operations.outputUnitKey',
  'operations.machineType',
  'operations.pressEquipment',
  // геометрия карточных указаний
  'callouts.kind',
  'callouts.points',
  'callouts.color',
  // разметка детали
  'pieces.fusingMode',
  'pieces.cutSymmetry',
  'pieces.ungraded',
  // парк оборудования
  'construction.equipmentDefaults',
];
for (const p of must) {
  check(`отпечаток видит ${p}`, paths.includes(p));
}

// Дубликатов быть не должно: они не ломают хэш, но означают, что обход ходит кругами.
const dupes = paths.filter((p, i) => paths.indexOf(p) !== i);
check('в путях нет дубликатов', dupes.length === 0, dupes.slice(0, 3).join(', '));

console.log(`${pass} из ${pass + fail} проверок прошло`);
process.exit(fail === 0 ? 0 : 1);
