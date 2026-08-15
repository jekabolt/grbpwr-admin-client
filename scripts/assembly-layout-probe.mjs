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
  "шаг вне узлов: обработка по свободной детали (дельта T-28 — появится tail)": {
    "width": 384,
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
    "width": 0,
    "height": 0,
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

if (DUMP) {
  const out = {};
  for (const c of CASES) {
    const r = layoutOf(c);
    if (r.err) {
      console.error(`${c.name}: ${r.err}`);
      process.exitCode = 1;
      continue;
    }
    out[c.name] = snapshot(r.layout);
  }
  console.log(JSON.stringify(out, null, 2));
} else {
  for (const c of CASES) {
    const r = layoutOf(c);
    if (r.err) {
      fail(c.name, r.err);
      continue;
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
