#!/usr/bin/env node
// РЕЕСТР ВИДОВ ТОТАЛЕН — и это утверждение про КЛАСС ОШИБОК, а не про одну.
//
// «undefined is not an object (evaluating 'F[e]')» на мультилидере — это словарь видов, у которого
// нет строки на пришедший ключ, и код, который индексирует его напрямую и тут же деструктурирует
// результат. Таких словарей было четыре в трёх файлах, каждый со своим набором ключей, и каждый
// новый вид требовал вспомнить про все четыре. Один забытый роняет ЭКРАН ЦЕЛИКОМ — не рисует
// фигуру неправильно, а показывает «Something went wrong» вместо тех-карты.
//
// Поэтому здесь проверяется не «полигон есть в словаре», а свойство: НИ ОДИН вход не даёт
// undefined и ни один не бросает. Включая null, пустую строку, ключ с провода новее клиента и
// счётчики точек, которых у вида не бывает.
//
//   node scripts/annotation-kinds-probe.mjs

import { build } from 'esbuild';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { rmSync } from 'node:fs';

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, '..');
const entry = resolve(root, 'src/ui/components/annotation/kinds.ts');
const outfile = resolve(tmpdir(), `annotation-kinds-${process.pid}.mjs`);
await build({ entryPoints: [entry], bundle: true, format: 'esm', platform: 'node', outfile, logLevel: 'silent' });
const {
  kindDef,
  PALETTE_KINDS,
  ALL_KIND_KEYS,
  labelKindForPoints,
  placingHint,
  ANNOTATION_COLOR_KEYS,
  COLOR_LABEL,
} = await import(pathToFileURL(outfile).href);
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

// --- ТОТАЛЬНОСТЬ ------------------------------------------------------------------------------
const junk = [
  undefined,
  null,
  '',
  'squiggle',
  'TECH_CARD_ANNOTATION_KIND_PIN', // ключ ПРОВОДА, а не формы: их путали и раньше
  'POLYGON',
  ' polygon ',
  '__proto__', // прямая индексация объекта-словаря отдала бы прототип, а не undefined
  'constructor',
  'toString',
  0,
  false,
];
for (const k of junk) {
  let d;
  let threw = false;
  try {
    d = kindDef(k);
  } catch {
    threw = true;
  }
  check(`kindDef(${JSON.stringify(k)}) не бросает`, !threw);
  check(`kindDef(${JSON.stringify(k)}) даёт пин`, !threw && d?.key === 'pin', JSON.stringify(d));
  check(
    `kindDef(${JSON.stringify(k)}) отдаёт пригодные точки`,
    !threw && Array.isArray(d?.points) && d.points.length === 2,
  );
}

// --- ФОРМА КАЖДОЙ ЗАПИСИ ----------------------------------------------------------------------
for (const key of ALL_KIND_KEYS) {
  const d = kindDef(key);
  check(`${key}: ключ совпадает`, d.key === key);
  const [min, max] = d.points;
  check(`${key}: минимум не больше максимума`, min >= 1 && min <= max, `${min}..${max}`);
  check(`${key}: есть подпись и подсказка`, !!d.label && !!d.hint);
  check(
    `${key}: штриховка только там, где есть площадь`,
    !d.fillable || key === 'polygon',
    `fillable=${d.fillable}`,
  );
  // Пунктир имеет смысл только у видов с собственным штрихом: у пина и подписи единственная линия
  // это лидер, а у лидера начертание конвенция.
  check(
    `${key}: пунктир только у видов со своим штрихом`,
    d.dashable === !['pin', 'label', 'multi'].includes(key),
    `dashable=${d.dashable}`,
  );
}

check('в панели ровно восемь видов', PALETTE_KINDS.length === 8, String(PALETTE_KINDS.length));
// МУЛЬТИЛИДЕР В ПАНЕЛИ, и это не украшение: добавить якорь ПОСТАВЛЕННОЙ подписи нечем (ручки-
// призраки рождаются рёбрами, а у подписи их нет), поэтому без своего чипа «одна подпись к трём
// местам» невыразима вовсе.
check('мультилидер в панели', PALETTE_KINDS.some((d) => d.key === 'multi'));
check(
  'у мультилидера плавающее число якорей — иначе «готово» нечего заканчивать',
  kindDef('multi').points[0] !== kindDef('multi').points[1],
);
check('пин в панели первым — он неприкасаем', PALETTE_KINDS[0].key === 'pin');
check(
  'липкий инструмент ровно один — маркер',
  ALL_KIND_KEYS.filter((k) => kindDef(k).sticky).join() === 'ink',
);

// --- ПОДПИСЬ ↔ МУЛЬТИЛИДЕР --------------------------------------------------------------------
//
// Панель знает один вид «подпись»; провод различает LABEL и MULTI. Различие — СЧЁТЧИК, и если
// правило съедет, добавленная вторая стрелка уедет на сервер видом, у которого одна точка, —
// и сохранение ВСЕЙ карточки отвергнется за число якорей.
check('одна стрелка — label', labelKindForPoints(1) === 'label');
check('две — multi', labelKindForPoints(2) === 'multi');
check('восемь — multi', labelKindForPoints(8) === 'multi');
check('ноль — всё ещё label', labelKindForPoints(0) === 'label');
check(
  'потолок мультилидера вмещает то, во что превращается подпись',
  kindDef('multi').points[1] >= 2 && kindDef('label').points[0] === 1,
);

// --- ПОДСКАЗКА ПОСТАНОВКИ ---------------------------------------------------------------------
//
// Она печатается на экране, поэтому «undefined» в ней — не падение, а надпись «undefined» под
// панелью. Проверяется на ВСЕХ видах и на счётчиках, которых у вида не бывает.
for (const k of [...ALL_KIND_KEYS, ...junk]) {
  for (const placed of [0, 1, 2, 3, 7, 21, 99]) {
    let h;
    let threw = false;
    try {
      h = placingHint(k, placed);
    } catch {
      threw = true;
    }
    check(
      `подсказка(${JSON.stringify(k)}, ${placed}) — строка`,
      !threw && typeof h === 'string' && h.length > 0 && !/undefined|NaN/.test(h),
      String(h),
    );
  }
}
// Подсказка дуги ведёт по НОВОМУ жесту: начало, конец, изгиб — а не «три точки».
check('дуга: первый шаг — начало', placingHint('arc', 0).includes('start'));
check('дуга: второй шаг — конец', placingHint('arc', 1).includes('the end'));
check('дуга: третий шаг — изгиб', placingHint('arc', 2).includes('bend'));
check('зона: подсказка про замыкание', placingHint('polygon', 3).includes('close it'));
check('зона: до минимума говорит, сколько нужно', placingHint('polygon', 1).includes('at least 3'));
check('маркер: подсказка про жест, а не про клики', placingHint('ink', 0).includes('drag'));

// --- ЦВЕТА ------------------------------------------------------------------------------------
check('шесть цветов вместе с чернилами', ANNOTATION_COLOR_KEYS.length === 6);
check('белый есть', ANNOTATION_COLOR_KEYS.includes('white'));
for (const c of ANNOTATION_COLOR_KEYS) {
  check(`у цвета «${c || 'чернила'}» есть подпись`, !!COLOR_LABEL[c]);
}

console.log(`${pass} из ${pass + fail} проверок прошло`);
process.exit(fail === 0 ? 0 : 1);
