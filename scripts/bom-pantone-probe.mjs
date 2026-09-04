#!/usr/bin/env node
// ПАНТОН СТРОКИ BOM ПЕРЕЖИВАЕТ КРУГ «ПРОВОД → ФОРМА → ПРОВОД».
//
// Зачем проба вообще. Бэкенд `50a1fb2` (миграция 0363) завёл `TechCardBomItem.pantone`, а клиент
// его не знал: ни в `bomItemSchema`, ни в маппере чтения, ни в маппере записи, который перечисляет
// поля строки ПОИМЁННО. BOM пишется upsert'ом полной заменой по `line_key`, значит ЛЮБОЕ
// сохранение тех-карты из этого клиента затирало цвет, поставленный где угодно ещё. Потеря на
// проводе — там, где её нечем увидеть глазами: экран показывал бы ровно то же самое.
//
// ЧТО ЗДЕСЬ ПРОВЕРЯЕТСЯ:
//   цитата А — провод → форма → провод: прочитанное значение уезжает обратно ТЕМ ЖЕ токеном;
//   цитата Б — два полных оборота ничего не меняют (круг устойчив, а не «повезло на первом»);
//   цитата В — ОЧИСТКА ВЫРАЗИМА: пустой пантон уходит на провод ПРИСУТСТВУЮЩИМ ключом ''.
//              Отсутствие ключа под upsert'ом значит «не трогай», то есть цвет было бы нельзя
//              снять никогда — тихий отказ, который выглядит как сохранённая правка;
//   контроль  — соседнее поле той же породы (`color`) обязано вести себя точно так же. Если
//              позеленел он один, значит стенд собрал не то, что думает.
//
// МУТАЦИИ ЖИВУТ В ПАМЯТИ, А НЕ В ФАЙЛЕ (приём step-roundtrip-probe): правка исходника ради
// проверки — это правка, которую однажды забудут откатить.
//   node scripts/bom-pantone-probe.mjs                прогон
//   node scripts/bom-pantone-probe.mjs --mutate       снимает `pantone` из МАППЕРА ЗАПИСИ в бандле
//                                                     (ровно состояние до этой правки) — А/Б/В
//                                                     обязаны покраснеть, контроль остаться зелёным
//   node scripts/bom-pantone-probe.mjs --mutate-read  снимает `pantone` из МАППЕРА ЧТЕНИЯ — круг
//                                                     рвётся с другого конца
//
// РЕЗУЛЬТАТ ПРОГОНА МУТАЦИЙ (2026-09-04, ветка feat/design-band-ui):
//   чистый прогон  → 12 / 12, провалов 0;
//   --mutate       → 6 провалов (А, Б и вся В: пустота уходит отсутствием ключа), контроль `color`
//                    и line_key остались зелёными — защита точечная, а не «стенд лёг целиком»;
//   --mutate-read  → 4 провала (А, Б, Г). Цитата В при этом ЗЕЛЁНАЯ, и это честно: маппер записи
//                    сам подставляет '', так что снять цвет по-прежнему можно — рвётся именно
//                    чтение. Обе мутации откатаны (жили только в бандле).
//
// Проба СЧИТАЕТ ПРОВАЛЫ и печатает их число: ноль провалов при упавшей сборке — это не зелень, а
// молчание, поэтому число исходов печатается всегда и сверяется с ожидаемым.

import { build as esbuild } from 'esbuild';
import { rmSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const MUTATE_WRITE = process.argv.includes('--mutate');
const MUTATE_READ = process.argv.includes('--mutate-read');

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = resolve(HERE, '..');

let bad = 0;
let total = 0;
const ck = (ok, what, detail = '') => {
  total++;
  if (!ok) bad++;
  console.log(`${ok ? '  ok  ' : '  FAIL'} ${what}${detail ? `  — ${detail}` : ''}`);
};
const head = (s) => console.log(`\n${s}`);

// ─── мутации: одна строка маппера исчезает из БАНДЛА ─────────────────────────────────────────
const WRITE_LINE = "      pantone: b.pantone?.trim() || '',";
const READ_LINE = "    pantone: b.pantone || '',";
const dropLine = (name, needle) => ({
  name,
  setup(b) {
    b.onLoad({ filter: /tech-card\/components\/schema\.ts$/ }, async (args) => {
      const src = await readFile(args.path, 'utf8');
      if (!src.includes(needle)) throw new Error(`мутация не нашла свою строку в ${args.path}`);
      return { contents: src.replace(needle, ''), loader: 'ts' };
    });
  },
});

const plugins = [];
if (MUTATE_WRITE) plugins.push(dropLine('drop-write-pantone', WRITE_LINE));
if (MUTATE_READ) plugins.push(dropLine('drop-read-pantone', READ_LINE));

const outfile = resolve(REPO, `scripts/.bom-pantone-${process.pid}.mjs`);
await esbuild({
  entryPoints: [resolve(HERE, 'bom-pantone-entry.ts')],
  bundle: true,
  format: 'esm',
  platform: 'node',
  absWorkingDir: REPO,
  outfile,
  logLevel: 'silent',
  plugins,
});
const { fromWire, toWire, readBack } = await import(pathToFileURL(outfile).href);
rmSync(outfile, { force: true });

const KEY = '01HZZBOMLINEPANTONE00001';
const CODE = '19-4005 TCX';
const wireLine = (over = {}) => ({
  lineKey: KEY,
  name: 'main fabric',
  materialId: 0,
  ...over,
});

// ─── ЦИТАТА А: провод → форма → провод ───────────────────────────────────────────────────────
head('цитата А — прочитанное значение уезжает обратно тем же токеном');
{
  const form = fromWire(wireLine({ pantone: CODE, color: 'off white' }));
  ck(form.pantone === CODE, 'маппер чтения кладёт пантон в строку формы', String(form.pantone));
  const w = toWire([form]).bomItems[0];
  ck(w.pantone === CODE, 'маппер записи возвращает его на провод', String(w.pantone));
  ck(w.color === 'off white', 'КОНТРОЛЬ: соседний `color` ведёт себя так же', String(w.color));
  ck(w.lineKey === KEY, 'КОНТРОЛЬ: строка осталась той же (line_key не перевыпущен)', String(w.lineKey));
}

// ─── ЦИТАТА Б: два оборота ───────────────────────────────────────────────────────────────────
head('цитата Б — круг устойчив: второй оборот ничего не меняет');
{
  const one = toWire([fromWire(wireLine({ pantone: CODE }))]);
  const two = toWire(readBack(one));
  ck(two.bomItems[0].pantone === CODE, 'после второго оборота пантон на месте', String(two.bomItems[0].pantone));
  ck(
    JSON.stringify(one.bomItems[0]) === JSON.stringify(two.bomItems[0]),
    'строка байт-в-байт та же на обоих оборотах',
  );
}

// ─── ЦИТАТА В: очистка выразима ──────────────────────────────────────────────────────────────
head('цитата В — снять пантон можно: пустота едет ПРИСУТСТВУЮЩИМ ключом');
{
  // Сервер прислал цвет, человек его стёр. Под upsert'ом по line_key отсутствие ключа значит
  // «сохрани что было», то есть очистка молча не случилась бы.
  const form = { ...fromWire(wireLine({ pantone: CODE })), pantone: '' };
  const w = toWire([form]).bomItems[0];
  ck('pantone' in w, 'ключ `pantone` присутствует в payload при пустом значении');
  ck(w.pantone === '', 'и он именно пустая строка, а не undefined', JSON.stringify(w.pantone));
  ck(
    JSON.stringify(w).includes('"pantone":""'),
    'пустота переживает JSON.stringify (undefined выбросило бы ключ)',
  );
  // Читаемость обратно: пустой пантон возвращается пустым, а не исчезает из строки формы.
  ck(readBack({ ...toWire([form]) }).length === 1, 'КОНТРОЛЬ: строка не потерялась на обратном чтении');
}

// ─── ЦИТАТА Г: строка, сохранённая ДО 0363 ───────────────────────────────────────────────────
head('цитата Г — строка без ключа с провода не роняет форму и уезжает пустой');
{
  const form = fromWire(wireLine());
  ck(form.pantone === '', 'нет ключа с провода → пустая строка в форме', JSON.stringify(form.pantone));
  ck(toWire([form]).bomItems[0].pantone === '', 'и пустая строка на проводе');
}

console.log(
  `\n${bad === 0 ? 'ЗЕЛЕНО' : 'КРАСНО'}: ${total - bad} / ${total} проверок прошло, провалов ${bad}` +
    (MUTATE_WRITE || MUTATE_READ ? ' (прогон С МУТАЦИЕЙ — провалы ожидаются)' : ''),
);
process.exit(bad === 0 ? 0 : 1);
