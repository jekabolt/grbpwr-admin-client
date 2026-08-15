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
const { assemblySweep, classifyAssemblyInputs, assemblyBlocks, assemblyLayout } = await import(
  pathToFileURL(outfile).href
);

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
    name: 'шаг вне узлов: обработка по свободной детали (дельта T-28 — появится tail)',
    pieces: ['FR', 'BK', 'FLAP'],
    steps: [
      { in: ['FLAP'] }, // клапан обработан, но никуда не пришит
      { in: ['FR', 'BK'], out: 'SHELL', name: 'корпус' },
    ],
    delta: 'T-28: шаг 0 получит представление в хвостовом боксе tail',
  },
  {
    name: 'блоков нет, детали есть (дельта T-28 — появятся tiles и tail)',
    pieces: ['FR', 'BK'],
    steps: [{ in: ['FR'] }, { in: ['BK'] }],
    delta: 'T-28: появятся tiles всех деталей и хвостовой бокс tail',
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
        "y": 47,
        "w": 180,
        "h": 42,
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
        "y": 47,
        "w": 180,
        "h": 42,
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
        "y": 47,
        "w": 180,
        "h": 42,
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
        "y": 169,
        "w": 180,
        "h": 42,
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
        "y": 108,
        "w": 180,
        "h": 42,
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
        "y": 67.5,
        "w": 180,
        "h": 57,
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
        "y": 67.5,
        "w": 180,
        "h": 57,
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
        "y": 47,
        "w": 180,
        "h": 42,
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
        "y": 169,
        "w": 180,
        "h": 42,
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
        "y": 291,
        "w": 180,
        "h": 42,
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
        "y": 413,
        "w": 180,
        "h": 42,
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
        "y": 230,
        "w": 180,
        "h": 42,
        "col": 1,
        "stackTop": 251,
        "pieceInputs": []
      },
      {
        "key": "Q",
        "x": 380,
        "y": 290,
        "w": 180,
        "h": 42,
        "col": 1,
        "stackTop": 311,
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
        "y": 67.5,
        "w": 180,
        "h": 57,
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
        "y": 225,
        "w": 180,
        "h": 42,
        "col": 0,
        "stackTop": 194,
        "pieceInputs": [
          "D",
          "E"
        ]
      }
    ]
  },
  "шаг вне узлов: обработка по свободной детали (дельта T-28 — появится tail)": {
    "width": 660,
    "height": 150,
    "unassigned": [
      "FLAP"
    ],
    "boxes": [
      {
        "key": "SHELL",
        "x": 180,
        "y": 47,
        "w": 180,
        "h": 42,
        "col": 0,
        "stackTop": 16,
        "pieceInputs": [
          "FR",
          "BK"
        ]
      }
    ]
  },
  "блоков нет, детали есть (дельта T-28 — появятся tiles и tail)": {
    "width": 384,
    "height": 158,
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
  "шаг вне узлов: обработка по свободной детали (дельта T-28 — появится tail)": {
    "tail": {
      "x": 456,
      "y": 16,
      "w": 180,
      "h": 42,
      "col": 1
    },
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
        "h": 48,
        "state": "free",
        "into": "",
        "consumers": [
          0
        ]
      }
    ]
  },
  "блоков нет, детали есть (дельта T-28 — появятся tiles и tail)": {
    "tail": {
      "x": 180,
      "y": 16,
      "w": 180,
      "h": 57,
      "col": 0
    },
    "tiles": [
      {
        "key": "FR",
        "x": 8,
        "y": 16,
        "w": 64,
        "h": 48,
        "state": "free",
        "into": "",
        "consumers": [
          0
        ]
      },
      {
        "key": "BK",
        "x": 8,
        "y": 72,
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
  }
  // Хвостовой бокс существует тогда и только тогда, когда есть шаги вне узлов.
  const wantTail = loose.length > 0;
  if (wantTail && !layout.tail) msgs.push(`шаги вне узлов есть (${JSON.stringify(loose)}), а tail не эмитится`);
  if (!wantTail && layout.tail) msgs.push('tail эмитится, хотя шагов вне узлов нет');
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
