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
//   node scripts/assembly-layout-probe.mjs             # сверка с эталонами
//   node scripts/assembly-layout-probe.mjs --dump      # числа боксов и полотна
//   node scripts/assembly-layout-probe.mjs --dump-f7   # плитки и хвостовой бокс
//   node scripts/assembly-layout-probe.mjs --dump-t9   # обработки плиток и строки хвоста

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
const DUMP_T9 = process.argv.includes('--dump-t9');

// --- фикстуры ---------------------------------------------------------------------------------
//
// Первые пять — опорные графы БЕЗ шагов вне узлов: их эталоны неприкосновенны, ни T-28, ни Т9 не
// имеют права сдвинуть в них ни один бокс и ни одну плитку. Дальше идут кейсы с шагами вне узлов
// и без блоков вовсе — на них и пришлись обе дельты T-28, а потом обе дельты Т9. Последние два
// заведены в Т9 и сняты уже с новой раскладки: «до» у них нет.

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
  {
    // ДОБАВЛЕН В Т9. Три детали одного узла: у первой три обработки, у второй одна, у третьей ни
    // одной. Кейс держит главное обещание раскладки: место под плитку в стопке зарезервировано
    // под ГОЛУЮ плитку, и без сдвига на рост предыдущей вторая легла бы на строки первой. Заодно
    // это единственный кейс, где стопка уходит НИЖЕ своего бокса, и полотно обязано её вместить.
    name: 'обработки на съеденных деталях: три, одна и ни одной',
    pieces: ['FR', 'BK', 'SL'],
    steps: [
      { in: ['FR'] },
      { in: ['FR'] },
      { in: ['FR'] },
      { in: ['BK'] },
      { in: ['FR', 'BK', 'SL'], out: 'SHELL', name: 'корпус' },
    ],
    since: 'Т9',
  },
  {
    // ДОБАВЛЕН В Т9. Хвост не исчезает — он сжимается до того, что в нём действительно уместно.
    // Уезжает только обработка ОДНОЙ детали (шаг 0). Обработка двух деталей (шаг 1) остаётся:
    // одного предмета у неё нет, и приписать её одному значило бы соврать. Обработка узла
    // (шаг 3) на плитках не появляется вовсе — она уже живёт строкой своего блока.
    name: 'хвост сжимается: уехала обработка детали, остались обработки двух деталей и узла',
    pieces: ['A', 'B', 'C', 'D'],
    steps: [
      { in: ['C'] },
      { in: ['C', 'D'] },
      { in: ['A', 'B'], out: 'U', name: 'узел' },
      { in: ['U'] },
    ],
    since: 'Т9',
    invalidOk: true, // C и D до изделия не доходят — правило 4; раскладка обязана рисовать и это
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
  },
  // Снят уже с новой раскладки: «до» у кейса нет. Высота 254 — это НЕ бокс: бокс кончается на
  // 160, а полотно тянет до 224 стопка, ушедшая ниже него на строки обработок FR и BK.
  "обработки на съеденных деталях: три, одна и ни одной": {
    "width": 308,
    "height": 254,
    "unassigned": [],
    "boxes": [
      {
        "key": "SHELL",
        "x": 104,
        "y": 32,
        "w": 180,
        "h": 128,
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
  "хвост сжимается: уехала обработка детали, остались обработки двух деталей и узла": {
    "width": 660,
    "height": 170,
    "unassigned": [
      "C",
      "D"
    ],
    "boxes": [
      {
        "key": "U",
        "x": 180,
        "y": 26.5,
        "w": 180,
        "h": 83,
        "col": 0,
        "stackTop": 16,
        "pieceInputs": [
          "A",
          "B"
        ]
      }
    ]
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
  },
  // Стопка держит обещание раскладки построчно: FR (три обработки) 16+84 кончается на 100, и BK
  // начинается на 108 — тот же зазор 8, что между голыми плитками. SL обработок не имеет и стоит
  // ровно там, куда его сдвинул рост двух предыдущих: 176 = 16 + 2·56 + 36 + 12.
  "обработки на съеденных деталях: три, одна и ни одной": {
    "tail": null,
    "tiles": [
      {
        "key": "FR",
        "x": 44,
        "y": 16,
        "w": 52,
        "h": 84,
        "state": "eaten",
        "into": "SHELL",
        "consumers": [
          0,
          1,
          2,
          4
        ]
      },
      {
        "key": "BK",
        "x": 44,
        "y": 108,
        "w": 52,
        "h": 60,
        "state": "eaten",
        "into": "SHELL",
        "consumers": [
          3,
          4
        ]
      },
      {
        "key": "SL",
        "x": 44,
        "y": 176,
        "w": 52,
        "h": 48,
        "state": "eaten",
        "into": "SHELL",
        "consumers": [
          4
        ]
      }
    ]
  },
  // Хвост остался, но в одну строку (h 68 — та же формула, что у узлов): в нём ровно шаг 1,
  // обработка двух деталей. Плитка D выросла НЕ от неё — D стоит голой (h 48), сдвинутой вниз
  // ростом соседки C.
  "хвост сжимается: уехала обработка детали, остались обработки двух деталей и узла": {
    "tail": {
      "x": 456,
      "y": 16,
      "w": 180,
      "h": 68,
      "col": 1
    },
    "tiles": [
      {
        "key": "A",
        "x": 120,
        "y": 16,
        "w": 52,
        "h": 48,
        "state": "eaten",
        "into": "U",
        "consumers": [
          2
        ]
      },
      {
        "key": "B",
        "x": 120,
        "y": 72,
        "w": 52,
        "h": 48,
        "state": "eaten",
        "into": "U",
        "consumers": [
          2
        ]
      },
      {
        "key": "C",
        "x": 8,
        "y": 16,
        "w": 64,
        "h": 60,
        "state": "free",
        "into": "",
        "consumers": [
          0,
          1
        ]
      },
      {
        "key": "D",
        "x": 8,
        "y": 84,
        "w": 64,
        "h": 48,
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

// --- эталоны Т9 -------------------------------------------------------------------------------
// Кто где живёт: строки хвоста и обработки каждой плитки. Пустой список у плитки — не пустая
// строка отчёта, а утверждение: на эту деталь не переехало НИЧЕГО. Ради него карта и перечисляет
// все детали всех кейсов, включая пять опорных, где обработок нет вовсе.

const EXPECT_T9 = {
  "цепочка: узел из деталей → узел из узла и детали": {
    "tailSteps": [],
    "processing": { "FR": [], "BK": [], "SL": [] }
  },
  "ромб: два узла нулевой колонки сходятся в один": {
    "tailSteps": [],
    "processing": { "A": [], "B": [], "C": [], "D": [] }
  },
  "поглощение: GARMENT + HEM → GARMENT (два шага в одном блоке)": {
    "tailSteps": [],
    "processing": { "FR": [], "BK": [], "HEM": [] }
  },
  "невалидный граф: вход уже съеден — раскладка обязана рисовать и его": {
    "tailSteps": [],
    "processing": { "FR": [], "BK": [], "SL": [] }
  },
  "перекрёстный барицентр: равные барицентры, вторая колонка упирается в курсор": {
    "tailSteps": [],
    "processing": { "A": [], "B": [], "C": [], "D": [], "E": [], "F": [], "G": [], "H": [] }
  },
  // ГЛАВНОЕ УТВЕРЖДЕНИЕ ЭТОЙ КАРТЫ: шаг 1 — обработка по узлу U2 и детали D, и у D он пуст.
  // Предмет у такой обработки не один, приписать её одному значило бы соврать, и она осталась
  // строкой блока U2 — ровно там, где была до Т9.
  "деталь во входах двух блоков: обработка в чужом, джойн в своём": {
    "tailSteps": [],
    "processing": { "A": [], "B": [], "D": [], "E": [] }
  },
  "шаг вне узлов: обработка по свободной детали (дельта Т9 — уехала на плитку, tail исчез)": {
    "tailSteps": [],
    "processing": { "FR": [], "BK": [], "FLAP": [0] }
  },
  "блоков нет, детали есть (дельта Т9 — обе обработки уехали на плитки, tail исчез)": {
    "tailSteps": [],
    "processing": { "FR": [0], "BK": [1] }
  },
  // Съеденность на переезд не влияет: FR и BK давно внутри SHELL, а строки всё равно у них.
  "обработки на съеденных деталях: три, одна и ни одной": {
    "tailSteps": [],
    "processing": { "FR": [0, 1, 2], "BK": [3], "SL": [] }
  },
  // Шаг 3 — обработка узла U: на плитках его нет вовсе, он живёт строкой своего блока и потому
  // не значится и в хвосте. Шаг 1 — обработка двух деталей: остался в хвосте.
  "хвост сжимается: уехала обработка детали, остались обработки двух деталей и узла": {
    "tailSteps": [1],
    "processing": { "A": [], "B": [], "C": [0], "D": [] }
  }
};

/**
 * Снимок Т9: кто где живёт. Третья карта, а не поля в снимке Ф7, — по той же причине, по которой
 * Ф7 не подмешалась в первый: подмешайся она, и все десять эталонов протухли бы разом, а «кейс не
 * изменился» перестало бы читаться из диффа именно тогда, когда это и есть доказательство.
 */
function snapshotT9(layout) {
  return {
    tailSteps: layout.tailSteps,
    processing: Object.fromEntries(layout.tiles.map((t) => [t.key, t.processing])),
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

/**
 * ПАРА, А НЕ ЭТАЛОН: две карточки, отличающиеся ровно одним шагом — во второй FP1 уходит в
 * GARMENT. Доказывает не число, а СОВПАДЕНИЕ: правило «строка живёт на детали с момента создания
 * и навсегда» ломается тихо, если вывести его из фронтира (свободна — показываем, съели —
 * потеряли), и на отдельно взятой карточке такая поломка не видна вовсе.
 */
const STABILITY = {
  name: 'представление стабильно: обработка та же на свободной и на съеденной детали',
  free: {
    pieces: ['FP1', 'FR', 'BK'],
    steps: [{ in: ['FP1'] }, { in: ['FR', 'BK'], out: 'SHELL', name: 'корпус' }],
    invalidOk: true, // FP1 никуда не пришит и до изделия не доходит — правило 4
  },
  eaten: {
    pieces: ['FP1', 'FR', 'BK'],
    steps: [
      { in: ['FP1'] },
      { in: ['FR', 'BK'], out: 'SHELL', name: 'корпус' },
      { in: ['SHELL', 'FP1'], out: 'GARMENT', name: 'изделие' },
    ],
  },
};

function stability() {
  const msgs = [];
  const a = layoutOf(STABILITY.free);
  const b = layoutOf(STABILITY.eaten);
  if (a.err || b.err) return [`фикстура невалидна: ${a.err ?? ''} ${b.err ?? ''}`.trim()];
  const free = a.layout.tileByKey.get('FP1');
  const eaten = b.layout.tileByKey.get('FP1');
  if (!free || !eaten) return ['плитки FP1 нет в одной из карточек'];
  // Сначала — что карточки всё ещё отличаются тем, ради чего пара и заведена. Сравнение двух
  // одинаковых состояний сошлось бы всегда и не значило бы ничего.
  if (free.state !== 'free' || eaten.state !== 'eaten') {
    msgs.push(`пара выродилась: состояния ${free.state} и ${eaten.state}`);
  }
  if (!eq(free.processing, eaten.processing)) {
    msgs.push(`обработки разошлись: ${JSON.stringify(free.processing)} ≠ ${JSON.stringify(eaten.processing)}`);
  }
  if (free.h !== eaten.h) msgs.push(`высота разошлась: ${free.h} ≠ ${eaten.h}`);
  if (a.layout.tailSteps.length || b.layout.tailSteps.length) {
    msgs.push('шаг остался в хвосте, хотя у него есть своя плитка');
  }
  return msgs;
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

if (DUMP || DUMP_F7 || DUMP_T9) {
  const out = {};
  for (const c of CASES) {
    const r = layoutOf(c);
    if (r.err) {
      console.error(`${c.name}: ${r.err}`);
      process.exitCode = 1;
      continue;
    }
    out[c.name] = DUMP_T9 ? snapshotT9(r.layout) : DUMP_F7 ? snapshotF7(r.layout) : snapshot(r.layout);
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
    const wantT9 = EXPECT_T9[c.name];
    if (!wantT9) {
      fail(c.name, 'эталон Т9 не снят — прогоните `--dump-t9` и впишите');
    } else {
      const gotT9 = snapshotT9(r.layout);
      if (!eq(gotT9.tailSteps, wantT9.tailSteps)) {
        fail(c.name, `tailSteps: ${JSON.stringify(gotT9.tailSteps)} ≠ ${JSON.stringify(wantT9.tailSteps)}`);
      }
      if (!eq(gotT9.processing, wantT9.processing)) {
        fail(c.name, `обработки: ${JSON.stringify(gotT9.processing)} ≠ ${JSON.stringify(wantT9.processing)}`);
      }
    }
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

  for (const m of stability()) fail(STABILITY.name, m);

  const total = CASES.length + 1; // фикстуры плюс парная проверка стабильности
  console.log(`\n${total - failed.size}/${total} кейсов прошло`);
  if (failed.size) process.exitCode = 1;
}
