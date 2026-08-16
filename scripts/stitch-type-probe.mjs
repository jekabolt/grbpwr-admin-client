#!/usr/bin/env node
// Вывод типа стежка по ISO 4915 из «машинка + число ниток».
//
// Проба существует потому, что эти строки УХОДЯТ НА БУМАГУ ДЛЯ ФАБРИКИ. Ошибка здесь не роняет
// экран и не видна в диффе — она выглядит как правдоподобный номер и приезжает к оператору,
// который по нему заправит машину.
//
//   node scripts/stitch-type-probe.mjs

import { build } from 'esbuild';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, resolve } from 'node:path';
import { tmpdir } from 'node:os';

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, '..');
const outfile = resolve(tmpdir(), `stitch-type-${process.pid}.mjs`);
await build({
  entryPoints: [resolve(root, 'scripts/stitch-type-probe-entry.ts')],
  bundle: true,
  format: 'esm',
  platform: 'node',
  outfile,
  logLevel: 'silent',
});
const { stitchTypeNumber, machineTypeLabelWithStitch, machineTypeLabel } = await import(
  pathToFileURL(outfile).href
);

let checks = 0;
const failed = [];
const is = (name, got, want) => {
  checks++;
  if (got !== want) failed.push(`${name}\n      «${got}» ≠ «${want}»`);
};
const M = (t) => `TECH_CARD_MACHINE_TYPE_${t}`;

// Классы с одним стежком: число ниток на номер не влияет вовсе.
is('челночная — 301', stitchTypeNumber(M('LOCKSTITCH')), '301');
is('челночная с любым числом ниток — всё равно 301', stitchTypeNumber(M('LOCKSTITCH'), 4), '301');
is('двухигольная кладёт два ряда ОДНОГО стежка', stitchTypeNumber(M('LOCKSTITCH_DOUBLE_NEEDLE')), '301');
is('цепная — 401', stitchTypeNumber(M('CHAINSTITCH')), '401');
is('потайная — 103', stitchTypeNumber(M('BLINDSTITCH')), '103');
is('зигзаг — 304', stitchTypeNumber(M('ZIGZAG')), '304');

// Обмёточная: номер определяется числом ниток — ради этого случая всё и затевалось.
is('оверлок 3 нитки — 504', stitchTypeNumber(M('OVERLOCK'), 3), '504');
is('оверлок 4 нитки — 514', stitchTypeNumber(M('OVERLOCK'), 4), '514');
is('оверлок 5 ниток — 516', stitchTypeNumber(M('OVERLOCK'), 5), '516');
// Пусто честнее догадки: ниток не назвали — номера нет.
is('оверлок без числа ниток — номера нет', stitchTypeNumber(M('OVERLOCK')), '');
is('оверлок 0 ниток — номера нет', stitchTypeNumber(M('OVERLOCK'), 0), '');
is('оверлок 6 ниток — вне таблицы, номера нет', stitchTypeNumber(M('OVERLOCK'), 6), '');

// Распошивальная сознательно не выводится: 602/604/605 не однозначны по числу ниток.
is('распошивалка не выводится ни при каком числе ниток', stitchTypeNumber(M('COVERSTITCH'), 3), '');
is('распошивалка, 5 ниток — по-прежнему пусто', stitchTypeNumber(M('COVERSTITCH'), 5), '');
is('автомат кармана стежка не определяет', stitchTypeNumber(M('PATCH_POCKET_AUTO'), 4), '');
is('машинка не выбрана', stitchTypeNumber(undefined, 4), '');

// Подпись: перечисление заменяется тем одним номером, который шаг и означает.
is('перечисление уступает конкретному номеру', machineTypeLabelWithStitch(M('OVERLOCK'), 4), 'overlock 514');
is('оверлок без ниток сохраняет честный слэш', machineTypeLabelWithStitch(M('OVERLOCK')), machineTypeLabel(M('OVERLOCK')));
is('челночная не меняется', machineTypeLabelWithStitch(M('LOCKSTITCH'), 2), 'lockstitch 301');
is('двухигольная получает свой номер', machineTypeLabelWithStitch(M('LOCKSTITCH_DOUBLE_NEEDLE')), 'twin-needle lockstitch 301');
is('распошивалка остаётся словарной', machineTypeLabelWithStitch(M('COVERSTITCH'), 5), machineTypeLabel(M('COVERSTITCH')));
is('машинка без номера в словаре не портится', machineTypeLabelWithStitch(M('BARTACK'), 4), machineTypeLabel(M('BARTACK')));

for (const f of failed) console.log(`FAIL  ${f}`);
console.log(`\n${checks - failed.length} из ${checks} проверок прошло`);
if (failed.length) process.exitCode = 1;
