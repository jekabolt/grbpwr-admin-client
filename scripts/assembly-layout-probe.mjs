#!/usr/bin/env node
// Прогон раскладки схемы сборки — ПРОБА-ХАРАКТЕРИЗАЦИЯ (T-27).
//
// ЧТО ЭТО ТАКОЕ И ЧЕМ ОТЛИЧАЕТСЯ ОТ ОСТАЛЬНЫХ ПРОБ. `assembly-cases` фиксирует КОНТРАКТ с
// сервером (те же кейсы лежат в Go, sha256 сверяется), `assembly-blocks` — задуманное поведение
// группировки. Эта проба не фиксирует ни то, ни другое: она снимает СЕГОДНЯШНИЕ ЧИСЛА живого
// `assembly-layout.ts` как есть — включая то, что в них случайно. Эталоны здесь не значат
// «так правильно», они значат «так было до правки».
//
// Зачем: Ф7 переписывает раскладку (T-28 добавляет плитки всех деталей и хвостовой бокс), и без
// снятого слепка любой сдвиг бокса прошёл бы молча — ни tsc, ни глаз на картинке его не поймают.
// Поэтому проба пишется ДО единой правки `assembly-layout.ts` и на нетронутом коде обязана быть
// зелёной. После T-28 зелёными обязаны остаться ВСЕ кейсы, кроме двух заявленных дельт
// (см. пометки `дельта T-28` ниже) — иначе раскладка поехала, и это надо объяснить, а не
// подогнать эталон.
//
// ЭТАЛОНЫ ПЕРЕСНЯТЫ 2026-08-16 под вариант узла «паспорт»: шапка стала двухстрочной (21→32) и
// появился постоянный подвал (+15), то есть каждый бокс вырос ровно на 26px, а вслед за ним
// поехали `y`, `stackTop` и габариты полотна. Проверено, что дельта именно такая и только такая:
// набор полей не изменился, `pieceInputs`, `unassigned`, `state`, `into`, `consumers` и порядок
// боксов совпали построчно, а из чисел изменились лишь высоты 42→68 и 57→83 и производные от них.
// Пере-снятие эталонов допустимо ТОЛЬКО так: сначала объяснить дельту, потом принять числа.
//
// ЭТАЛОНЫ ПЕРЕСНЯТЫ 2026-08-20 под Т9 (обработка детали живёт на плитке этой детали). Дельта
// ровно в двух кейсах — тех самых, где шаг вне узлов есть, и он оказался обработкой ОДНОЙ детали:
// плитка выросла на строку (48→60), следующая за ней в колонке уехала вниз на эту же строку
// (72→84), а хвостовой бокс исчез вместе со своим единственным содержимым — и вслед за ним
// поехала ширина полотна, которую держал он. Шесть остальных кейсов не изменились ни на число,
// включая тот, где обработка взята по узлу и детали: предмет у неё не один, и она осталась там,
// где была. Числа обоих переехавших кейсов помечены ниже словом `дельта Т9`.
//
//   node scripts/assembly-layout-probe.mjs           # сверка с эталонами
//   node scripts/assembly-layout-probe.mjs --dump    # печать фактических чисел для эталонов

import { build } from 'esbuild';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, resolve } from 'node:path';
import { tmpdir } from 'node:os';

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, '..');
const entry = resolve(root, 'scripts/assembly-layout-probe-entry.ts');

const outfile = resolve(tmpdir(), `assembly-layout-${process.pid}.mjs`);
await build({ entryPoints: [entry], bundle: true, format: 'esm', platform: 'node', outfile, logLevel: 'silent' });
const { assemblySweep, classifyAssemblyInputs, assemblyBlocks, assemblyLayout, SCHEMATIC_METRICS } =
  await import(pathToFileURL(outfile).href);

const DUMP = process.argv.includes('--dump');
const DUMP_F7 = process.argv.includes('--dump-f7');

// --- фикстуры ---------------------------------------------------------------------------------
//
// Первые пять — опорные графы БЕЗ шагов вне узлов: их эталоны неприкосновенны, T-28 не имеет
// права сдвинуть в них ни один бокс. Последние два содержат шаги вне узлов и/или не содержат
// блоков вовсе — это и есть две заявленные дельты T-28.

const CASES = [
  {
    name: 'цепочка: узел из деталей → узел из узла и детали',
    pieces: ['FR', 'BK', 'SL'],
    steps: [
      { in: ['FR', 'BK'], out: 'SHELL', name: 'корпус' },
      { in: ['SHELL', 'SL'], out: 'GARMENT', name: 'изделие' },
    ],
  },
  {
    name: 'ромб: два узла нулевой колонки сходятся в один',
    pieces: ['A', 'B', 'C', 'D'],
    steps: [
      { in: ['A', 'B'], out: 'L', name: 'левая' },
      { in: ['C', 'D'], out: 'R', name: 'правая' },
      { in: ['L', 'R'], out: 'TOP', name: 'верх' },
    ],
  },
  {
    name: 'поглощение: GARMENT + HEM → GARMENT (два шага в одном блоке)',
    pieces: ['FR', 'BK', 'HEM'],
    steps: [
      { in: ['FR', 'BK'], out: 'GARMENT', name: 'изделие' },
      { in: ['GARMENT', 'HEM'], out: 'GARMENT' },
    ],
  },
  {
    name: 'невалидный граф: вход уже съеден — раскладка обязана рисовать и его',
    pieces: ['FR', 'BK', 'SL'],
    steps: [
      { in: ['FR', 'BK'], out: 'SHELL', name: 'корпус' },
      // FR уже съеден шагом 0 — нарушение правила 2. Схема остаётся единственным местом, где
      // автор увидит, что именно он сломал, поэтому раскладка не имеет права сдаться.
      { in: ['FR', 'SL'], out: 'CUFF', name: 'манжета' },
    ],
    invalidOk: true,
  },
  {
    name: 'перекрёстный барицентр: равные барицентры, вторая колонка упирается в курсор',
    // Оба узла первой колонки имеют барицентр 1.5 — сортировка стабильна, порядок остаётся
    // авторским. Второй узел колонки притягивается ВВЕРХ, к середине своих входов, и упирается в
    // курсор-антинаезд: ветка `want < cursor`. Первые четыре кейса ходят только веткой
    // `want > cursor`, и без этого кейса половина третьего прохода осталась бы неснятой.
    pieces: ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H'],
    steps: [
      { in: ['A', 'B'], out: 'L', name: 'л' },
      { in: ['C', 'D'], out: 'M', name: 'м' },
      { in: ['E', 'F'], out: 'N', name: 'н' },
      { in: ['G', 'H'], out: 'O', name: 'о' },
      { in: ['L', 'O'], out: 'P', name: 'п' },
      { in: ['M', 'N'], out: 'Q', name: 'к' },
    ],
  },
  {
    // ДОБАВЛЕН В T-28, и его числа — не характеризация: «до» у этого кейса нет, он снят уже с
    // новой раскладки. Кейс держит главный вид дубля, который Ф7 схлопнула: деталь D входит
    // обработкой в блок ЧУЖОГО узла (шаг 1) и джойном — в свой (шаг 2), и до Ф7 рисовалась у
    // обоих боксов. Теперь место плитки следует из состояния: съедена узлом U3 — стоит у U3.
    name: 'деталь во входах двух блоков: обработка в чужом, джойн в своём',
    pieces: ['A', 'B', 'D', 'E'],
    steps: [
      { in: ['A', 'B'], out: 'U2', name: 'два' },
      { in: ['U2', 'D'] }, // обработка по узлу и детали — попадёт в блок U2
      { in: ['D', 'E'], out: 'U3', name: 'три' }, // D съедается сюда
    ],
    since: 'T-28',
  },
  {
    name: 'шаг вне узлов: обработка по свободной детали (дельта Т9 — уехала на плитку, tail исчез)',
    pieces: ['FR', 'BK', 'FLAP'],
    steps: [
      { in: ['FLAP'] }, // клапан обработан, но никуда не пришит
      { in: ['FR', 'BK'], out: 'SHELL', name: 'корпус' },
    ],
    delta: 'Т9: шаг 0 переехал на плитку FLAP, и хвост опустел — бокса больше нет',
  },
  {
    name: 'блоков нет, детали есть (дельта Т9 — обе обработки уехали на плитки, tail исчез)',
    pieces: ['FR', 'BK'],
    steps: [{ in: ['FR'] }, { in: ['BK'] }],
    delta: 'Т9: оба шага переехали на свои плитки, хвост опустел — бокса больше нет',
  },
];

// --- эталоны ----------------------------------------------------------------------------------
// Сняты с живого `assembly-layout.ts` командой `--dump`. Не редактировать руками: если кейс
// покраснел, сначала объяснить, ПОЧЕМУ раскладка поехала.

const EXPECT = {
  "цепочка: узел из деталей → узел из узла и детали": {
    "width": 584,
    "height": 150,
    "unassigned": [],
    "boxes": [
      {
        "key": "SHELL",
        "x": 104,
        "y": 34,
        "w": 180,
        "h": 68,
        "col": 0,
        "stackTop": 16,
        "pieceInputs": [
          "FR",
          "BK"
        ]
      },
      {
        "key": "GARMENT",
        "x": 380,
        "y": 34,
        "w": 180,
        "h": 68,
        "col": 1,
        "stackTop": 44,
        "pieceInputs": [
          "SL"
        ]
      }
    ]
  },
  "ромб: два узла нулевой колонки сходятся в один": {
    "width": 584,
    "height": 272,
    "unassigned": [],
    "boxes": [
      {
        "key": "L",
        "x": 104,
        "y": 34,
        "w": 180,
        "h": 68,
        "col": 0,
        "stackTop": 16,
        "pieceInputs": [
          "A",
          "B"
        ]
      },
      {
        "key": "R",
        "x": 104,
        "y": 156,
        "w": 180,
        "h": 68,
        "col": 0,
        "stackTop": 138,
        "pieceInputs": [
          "C",
          "D"
        ]
      },
      {
        "key": "TOP",
        "x": 380,
        "y": 95,
        "w": 180,
        "h": 68,
        "col": 1,
        "stackTop": 129,
        "pieceInputs": []
      }
    ]
  },
  "поглощение: GARMENT + HEM → GARMENT (два шага в одном блоке)": {
    "width": 308,
    "height": 206,
    "unassigned": [],
    "boxes": [
      {
        "key": "GARMENT",
        "x": 104,
        "y": 54.5,
        "w": 180,
        "h": 83,
        "col": 0,
        "stackTop": 16,
        "pieceInputs": [
          "FR",
          "BK",
          "HEM"
        ]
      }
    ]
  },
  "невалидный граф: вход уже съеден — раскладка обязана рисовать и его": {
    "width": 384,
    "height": 206,
    "unassigned": [
      "SL"
    ],
    "boxes": [
      {
        "key": "SHELL",
        "x": 180,
        "y": 54.5,
        "w": 180,
        "h": 83,
        "col": 0,
        "stackTop": 16,
        "pieceInputs": [
          "FR",
          "BK",
          "SL"
        ]
      }
    ]
  },
  "перекрёстный барицентр: равные барицентры, вторая колонка упирается в курсор": {
    "width": 584,
    "height": 516,
    "unassigned": [],
    "boxes": [
      {
        "key": "L",
        "x": 104,
        "y": 34,
        "w": 180,
        "h": 68,
        "col": 0,
        "stackTop": 16,
        "pieceInputs": [
          "A",
          "B"
        ]
      },
      {
        "key": "M",
        "x": 104,
        "y": 156,
        "w": 180,
        "h": 68,
        "col": 0,
        "stackTop": 138,
        "pieceInputs": [
          "C",
          "D"
        ]
      },
      {
        "key": "N",
        "x": 104,
        "y": 278,
        "w": 180,
        "h": 68,
        "col": 0,
        "stackTop": 260,
        "pieceInputs": [
          "E",
          "F"
        ]
      },
      {
        "key": "O",
        "x": 104,
        "y": 400,
        "w": 180,
        "h": 68,
        "col": 0,
        "stackTop": 382,
        "pieceInputs": [
          "G",
          "H"
        ]
      },
      {
        "key": "P",
        "x": 380,
        "y": 217,
        "w": 180,
        "h": 68,
        "col": 1,
        "stackTop": 251,
        "pieceInputs": []
      },
      {
        "key": "Q",
        "x": 380,
        "y": 303,
        "w": 180,
        "h": 68,
        "col": 1,
        "stackTop": 337,
        "pieceInputs": []
      }
    ]
  },
  "деталь во входах двух блоков: обработка в чужом, джойн в своём": {
    "width": 308,
    "height": 328,
    "unassigned": [],
    "boxes": [
      {
        "key": "U2",
        "x": 104,
        "y": 54.5,
        "w": 180,
        "h": 83,
        "col": 0,
        "stackTop": 16,
        "pieceInputs": [
          "A",
          "B",
          "D"
        ]
      },
      {
        "key": "U3",
        "x": 104,
        "y": 212,
        "w": 180,
        "h": 68,
        "col": 0,
        "stackTop": 194,
        "pieceInputs": [
          "D",
          "E"
        ]
      }
    ]
  },
  // дельта Т9: ширину держал хвостовой бокс во второй колонке (456+180+24); он исчез, и полотно
  // сжалось до последнего узла (180+180+24). Бокс SHELL не сдвинулся ни на пиксель.
  "шаг вне узлов: обработка по свободной детали (дельта Т9 — уехала на плитку, tail исчез)": {
    "width": 384,
    "height": 150,
    "unassigned": [
      "FLAP"
    ],
    "boxes": [
      {
        "key": "SHELL",
        "x": 180,
        "y": 34,
        "w": 180,
        "h": 68,
        "col": 0,
        "stackTop": 16,
        "pieceInputs": [
          "FR",
          "BK"
        ]
      }
    ]
  },
  // дельта Т9: узлов нет вовсе, поэтому ширину держал тот же хвост (180+180+24); без него
  // остаётся колонка плиток (8+64+24). Высота выросла на две строки обработки: 152+30.
  "блоков нет, детали есть (дельта Т9 — обе обработки уехали на плитки, tail исчез)": {
    "width": 96,
    "height": 182,
    "unassigned": [],
    "boxes": []
  }
};

// --- прогон -----------------------------------------------------------------------------------

const failed = new Set();
const fail = (name, msg) => {
  failed.add(name);
  console.log(`FAIL  ${name}\n      ${msg}`);
};
const eq = (a, b) => JSON.stringify(a) === JSON.stringify(b);

// --- эталоны Ф7 -------------------------------------------------------------------------------
// Плитки и хвостовой бокс держатся ОТДЕЛЬНОЙ картой, а не подмешаны в снимок выше. Иначе
// добавление полей сделало бы стухшими все семь эталонов разом, и «пять кейсов не изменились»
// перестало бы читаться из диффа — а ровно это и есть доказательство, ради которого писался T-27.

const EXPECT_F7 = {
  "цепочка: узел из деталей → узел из узла и детали": {
    "tail": null,
    "tiles": [
      {
        "key": "FR",
        "x": 44,
        "y": 16,
        "w": 52,
        "h": 48,
        "state": "eaten",
        "into": "SHELL",
        "consumers": [
          0
        ]
      },
      {
        "key": "BK",
        "x": 44,
        "y": 72,
        "w": 52,
        "h": 48,
        "state": "eaten",
        "into": "SHELL",
        "consumers": [
          0
        ]
      },
      {
        "key": "SL",
        "x": 320,
        "y": 44,
        "w": 52,
        "h": 48,
        "state": "eaten",
        "into": "GARMENT",
        "consumers": [
          1
        ]
      }
    ]
  },
  "ромб: два узла нулевой колонки сходятся в один": {
    "tail": null,
    "tiles": [
      {
        "key": "A",
        "x": 44,
        "y": 16,
        "w": 52,
        "h": 48,
        "state": "eaten",
        "into": "L",
        "consumers": [
          0
        ]
      },
      {
        "key": "B",
        "x": 44,
        "y": 72,
        "w": 52,
        "h": 48,
        "state": "eaten",
        "into": "L",
        "consumers": [
          0
        ]
      },
      {
        "key": "C",
        "x": 44,
        "y": 138,
        "w": 52,
        "h": 48,
        "state": "eaten",
        "into": "R",
        "consumers": [
          1
        ]
      },
      {
        "key": "D",
        "x": 44,
        "y": 194,
        "w": 52,
        "h": 48,
        "state": "eaten",
        "into": "R",
        "consumers": [
          1
        ]
      }
    ]
  },
  "поглощение: GARMENT + HEM → GARMENT (два шага в одном блоке)": {
    "tail": null,
    "tiles": [
      {
        "key": "FR",
        "x": 44,
        "y": 16,
        "w": 52,
        "h": 48,
        "state": "eaten",
        "into": "GARMENT",
        "consumers": [
          0
        ]
      },
      {
        "key": "BK",
        "x": 44,
        "y": 72,
        "w": 52,
        "h": 48,
        "state": "eaten",
        "into": "GARMENT",
        "consumers": [
          0
        ]
      },
      {
        "key": "HEM",
        "x": 44,
        "y": 128,
        "w": 52,
        "h": 48,
        "state": "eaten",
        "into": "GARMENT",
        "consumers": [
          1
        ]
      }
    ]
  },
  "невалидный граф: вход уже съеден — раскладка обязана рисовать и его": {
    "tail": null,
    "tiles": [
      {
        "key": "FR",
        "x": 120,
        "y": 16,
        "w": 52,
        "h": 48,
        "state": "eaten",
        "into": "SHELL",
        "consumers": [
          0,
          1
        ]
      },
      {
        "key": "BK",
        "x": 120,
        "y": 72,
        "w": 52,
        "h": 48,
        "state": "eaten",
        "into": "SHELL",
        "consumers": [
          0
        ]
      },
      {
        "key": "SL",
        "x": 8,
        "y": 16,
        "w": 64,
        "h": 48,
        "state": "free",
        "into": "",
        "consumers": [
          1
        ]
      }
    ]
  },
  "перекрёстный барицентр: равные барицентры, вторая колонка упирается в курсор": {
    "tail": null,
    "tiles": [
      {
        "key": "A",
        "x": 44,
        "y": 16,
        "w": 52,
        "h": 48,
        "state": "eaten",
        "into": "L",
        "consumers": [
          0
        ]
      },
      {
        "key": "B",
        "x": 44,
        "y": 72,
        "w": 52,
        "h": 48,
        "state": "eaten",
        "into": "L",
        "consumers": [
          0
        ]
      },
      {
        "key": "C",
        "x": 44,
        "y": 138,
        "w": 52,
        "h": 48,
        "state": "eaten",
        "into": "M",
        "consumers": [
          1
        ]
      },
      {
        "key": "D",
        "x": 44,
        "y": 194,
        "w": 52,
        "h": 48,
        "state": "eaten",
        "into": "M",
        "consumers": [
          1
        ]
      },
      {
        "key": "E",
        "x": 44,
        "y": 260,
        "w": 52,
        "h": 48,
        "state": "eaten",
        "into": "N",
        "consumers": [
          2
        ]
      },
      {
        "key": "F",
        "x": 44,
        "y": 316,
        "w": 52,
        "h": 48,
        "state": "eaten",
        "into": "N",
        "consumers": [
          2
        ]
      },
      {
        "key": "G",
        "x": 44,
        "y": 382,
        "w": 52,
        "h": 48,
        "state": "eaten",
        "into": "O",
        "consumers": [
          3
        ]
      },
      {
        "key": "H",
        "x": 44,
        "y": 438,
        "w": 52,
        "h": 48,
        "state": "eaten",
        "into": "O",
        "consumers": [
          3
        ]
      }
    ]
  },
  "деталь во входах двух блоков: обработка в чужом, джойн в своём": {
    "tail": null,
    "tiles": [
      {
        "key": "A",
        "x": 44,
        "y": 16,
        "w": 52,
        "h": 48,
        "state": "eaten",
        "into": "U2",
        "consumers": [
          0
        ]
      },
      {
        "key": "B",
        "x": 44,
        "y": 72,
        "w": 52,
        "h": 48,
        "state": "eaten",
        "into": "U2",
        "consumers": [
          0
        ]
      },
      {
        "key": "D",
        "x": 44,
        "y": 194,
        "w": 52,
        "h": 48,
        "state": "eaten",
        "into": "U3",
        "consumers": [
          1,
          2
        ]
      },
      {
        "key": "E",
        "x": 44,
        "y": 250,
        "w": 52,
        "h": 48,
        "state": "eaten",
        "into": "U3",
        "consumers": [
          2
        ]
      }
    ]
  },
  // дельта Т9: единственный шаг хвоста уехал на плитку FLAP (48→60), и бокса не стало. Плитки
  // FR и BK обработок не имеют и не сдвинулись ни на пиксель — стопка у SHELL та же.
  "шаг вне узлов: обработка по свободной детали (дельта Т9 — уехала на плитку, tail исчез)": {
    "tail": null,
    "tiles": [
      {
        "key": "FR",
        "x": 120,
        "y": 16,
        "w": 52,
        "h": 48,
        "state": "eaten",
        "into": "SHELL",
        "consumers": [
          1
        ]
      },
      {
        "key": "BK",
        "x": 120,
        "y": 72,
        "w": 52,
        "h": 48,
        "state": "eaten",
        "into": "SHELL",
        "consumers": [
          1
        ]
      },
      {
        "key": "FLAP",
        "x": 8,
        "y": 16,
        "w": 64,
        "h": 60,
        "state": "free",
        "into": "",
        "consumers": [
          0
        ]
      }
    ]
  },
  // дельта Т9: обе детали выросли на свою строку (48→60), поэтому вторая уехала вниз на 12
  // (72→84), и хвост опустел целиком.
  "блоков нет, детали есть (дельта Т9 — обе обработки уехали на плитки, tail исчез)": {
    "tail": null,
    "tiles": [
      {
        "key": "FR",
        "x": 8,
        "y": 16,
        "w": 64,
        "h": 60,
        "state": "free",
        "into": "",
        "consumers": [
          0
        ]
      },
      {
        "key": "BK",
        "x": 8,
        "y": 84,
        "w": 64,
        "h": 60,
        "state": "free",
        "into": "",
        "consumers": [
          1
        ]
      }
    ]
  }
};

/** Снимок раскладки: только то, что обязано быть стабильным. */
function snapshot(layout) {
  return {
    width: layout.width,
    height: layout.height,
    unassigned: layout.unassigned,
    boxes: layout.boxes.map((b) => ({
      key: b.key,
      x: b.x,
      y: b.y,
      w: b.w,
      h: b.h,
      col: b.col,
      stackTop: b.stackTop,
      pieceInputs: b.pieceInputs,
    })),
  };
}

/** Снимок Ф7: ноды-плитки и хвостовой бокс. */
function snapshotF7(layout) {
  return {
    tail: layout.tail
      ? { x: layout.tail.x, y: layout.tail.y, w: layout.tail.w, h: layout.tail.h, col: layout.tail.col }
      : null,
    tiles: layout.tiles.map((t) => ({
      key: t.key,
      x: t.x,
      y: t.y,
      w: t.w,
      h: t.h,
      state: t.state,
      into: t.into,
      consumers: t.consumers,
    })),
  };
}

function layoutOf(c) {
  const pieces = c.pieces.map((k) => ({ lineKey: k, name: `деталь ${k}` }));
  const keys = new Set(c.pieces);
  const steps = c.steps.map((s) => ({
    inputs: classifyAssemblyInputs(keys, s.in ?? []),
    outputUnitKey: s.out ?? '',
    outputUnitName: s.name ?? '',
  }));
  const res = assemblySweep(pieces, steps);
  if (res.violations.length > 0 && !c.invalidOk) {
    return { err: `фикстура невалидна: ${res.violations.map((v) => v.detail).join(', ')}` };
  }
  const grouped = assemblyBlocks(steps, res);
  // Ровно то, что передаёт компонент: блоки плюс хвостовой псевдоблок (operations-field.tsx:572).
  const layout = assemblyLayout([...grouped.blocks, grouped.loose], steps, res);
  return { layout, loose: grouped.loose.steps };
}

/**
 * ИНВАРИАНТЫ, а не эталоны: они держат обещание T-28 «одна деталь — ровно одна плитка при любом
 * графе» сильнее, чем перечисление известных видов дубля. Список видов конечен ровно до тех пор,
 * пока кто-нибудь не изобретёт новый.
 */
function invariants(c, layout, loose) {
  const msgs = [];
  const keys = layout.tiles.map((t) => t.key);
  const uniq = new Set(keys);
  if (uniq.size !== keys.length) {
    const dup = keys.filter((k, i) => keys.indexOf(k) !== i);
    msgs.push(`деталь нарисована дважды: ${JSON.stringify([...new Set(dup)])}`);
  }
  const missing = c.pieces.filter((k) => !uniq.has(k));
  if (missing.length) msgs.push(`деталь без плитки: ${JSON.stringify(missing)}`);
  const alien = keys.filter((k) => !c.pieces.includes(k));
  if (alien.length) msgs.push(`плитка не детали: ${JSON.stringify(alien)}`);
  for (const t of layout.tiles) {
    if (t.state === 'eaten' && !t.into) msgs.push(`плитка ${t.key}: съедена, но узел не назван`);
    if (t.state === 'free' && t.into) msgs.push(`плитка ${t.key}: свободна, но названа съевшей ${t.into}`);
    // Обработка детали — всегда шаг, берущий эту деталь входом. Разойдись два списка, и на
    // плитке появилась бы строка, к которой не идёт ни один провод.
    for (const i of t.processing) {
      if (!t.consumers.includes(i)) msgs.push(`плитка ${t.key}: обработка ${i} не среди потребителей`);
    }
    // РОСТ И СТРОКИ — ОДНО И ТО ЖЕ СОБЫТИЕ. Не формула (её копия здесь удостоверяла бы сама
    // себя), а связь: строки есть ⇔ плитка выше головы. Плитка, выросшая без строк, оставила бы
    // на полотне дыру; строки без роста легли бы на голову следующей детали.
    if (t.processing.length > 0 !== t.h > SCHEMATIC_METRICS.TILE) {
      msgs.push(`плитка ${t.key}: обработок ${t.processing.length}, а высота ${t.h}`);
    }
  }
  // ПЛИТКИ НЕ НАЕЗЖАЮТ ДРУГ НА ДРУГА. Сравниваются только стоящие в одной вертикали — колонка у
  // левого края и стопка у бокса; это и есть те два места, где рост плитки двигает соседей.
  const byX = new Map();
  for (const t of layout.tiles) byX.set(t.x, [...(byX.get(t.x) ?? []), t]);
  for (const column of byX.values()) {
    const sorted = [...column].sort((a, b) => a.y - b.y);
    for (let i = 1; i < sorted.length; i++) {
      const prev = sorted[i - 1];
      if (prev.y + prev.h > sorted[i].y) {
        msgs.push(`плитки наехали: ${prev.key} (${prev.y}+${prev.h}) на ${sorted[i].key} (${sorted[i].y})`);
      }
    }
  }
  // Хвостовой бокс существует тогда и только тогда, когда ему есть что рисовать. Считается по
  // `tailSteps`, а не по шагам вне узлов: после Т9 это разные списки.
  const wantTail = layout.tailSteps.length > 0;
  if (wantTail && !layout.tail) {
    msgs.push(`хвосту есть что рисовать (${JSON.stringify(layout.tailSteps)}), а tail не эмитится`);
  }
  if (!wantTail && layout.tail) msgs.push('tail эмитится, хотя рисовать в нём нечего');
  // НИ ОДИН ШАГ НЕ ТЕРЯЕТ ПРЕДСТАВЛЕНИЯ — только на этом обещании переезд и был безопасен. Шаг
  // вне узлов обязан быть либо строкой хвоста, либо строкой ровно одной плитки; и то и другое
  // сразу — это та же куча, только вид сбоку.
  const onTile = new Map();
  for (const t of layout.tiles) for (const i of t.processing) onTile.set(i, [...(onTile.get(i) ?? []), t.key]);
  for (const [i, keys] of onTile) {
    if (keys.length > 1) msgs.push(`шаг ${i} нарисован сразу на плитках ${JSON.stringify(keys)}`);
  }
  for (const i of loose) {
    if (layout.tailSteps.includes(i) && onTile.has(i)) msgs.push(`шаг ${i} нарисован и в хвосте, и на плитке`);
    if (!layout.tailSteps.includes(i) && !onTile.has(i)) {
      msgs.push(`шаг ${i} потерял представление: ни в хвосте, ни на плитке`);
    }
  }
  // Обратное направление: хвост не вправе показывать чужое. Шаг, принадлежащий блоку, рисуется
  // строкой блока, и вторая строка в хвосте была бы враньём о том, где живёт работа.
  for (const i of layout.tailSteps) {
    if (!loose.includes(i)) msgs.push(`шаг ${i} попал в хвост, хотя принадлежит блоку`);
  }
  return msgs;
}

if (DUMP || DUMP_F7) {
  const out = {};
  for (const c of CASES) {
    const r = layoutOf(c);
    if (r.err) {
      console.error(`${c.name}: ${r.err}`);
      process.exitCode = 1;
      continue;
    }
    out[c.name] = DUMP_F7 ? snapshotF7(r.layout) : snapshot(r.layout);
  }
  console.log(JSON.stringify(out, null, 2));
} else {
  for (const c of CASES) {
    const r = layoutOf(c);
    if (r.err) {
      fail(c.name, r.err);
      continue;
    }
    for (const m of invariants(c, r.layout, r.loose)) fail(c.name, m);
    const wantF7 = EXPECT_F7[c.name];
    if (!wantF7) {
      fail(c.name, 'эталон Ф7 не снят — прогоните `--dump-f7` и впишите');
    } else {
      const gotF7 = snapshotF7(r.layout);
      if (!eq(gotF7.tail, wantF7.tail)) {
        fail(c.name, `tail: ${JSON.stringify(gotF7.tail)} ≠ ${JSON.stringify(wantF7.tail)}`);
      }
      const n = Math.max(gotF7.tiles.length, wantF7.tiles.length);
      for (let i = 0; i < n; i++) {
        if (!eq(gotF7.tiles[i], wantF7.tiles[i])) {
          fail(c.name, `плитка ${i}: ${JSON.stringify(gotF7.tiles[i])} ≠ ${JSON.stringify(wantF7.tiles[i])}`);
        }
      }
    }
    const want = EXPECT[c.name];
    if (!want) {
      fail(c.name, 'эталон не снят — прогоните `--dump` и впишите');
      continue;
    }
    const got = snapshot(r.layout);
    if (!eq(got, want)) {
      const diffs = [];
      for (const k of ['width', 'height', 'unassigned']) {
        if (!eq(got[k], want[k])) diffs.push(`${k}: ${JSON.stringify(got[k])} ≠ ${JSON.stringify(want[k])}`);
      }
      const n = Math.max(got.boxes.length, want.boxes.length);
      for (let i = 0; i < n; i++) {
        if (!eq(got.boxes[i], want.boxes[i])) {
          diffs.push(`бокс ${i}: ${JSON.stringify(got.boxes[i])} ≠ ${JSON.stringify(want.boxes[i])}`);
        }
      }
      fail(c.name, diffs.join('\n      '));
    }
  }

  console.log(`\n${CASES.length - failed.size}/${CASES.length} кейсов прошло`);
  if (failed.size) process.exitCode = 1;
}
