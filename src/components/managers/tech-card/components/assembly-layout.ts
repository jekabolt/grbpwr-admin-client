import type { AssemblyBlock } from './assembly-blocks';
import type { AssemblyResult, AssemblyStep } from './assembly-frontier';

// Раскладка схемы сборки: где на полотне стоит каждая подсборка.
//
// ПОРТ `schemCanvasC` ИЗ ПРОТОТИПА, А НЕ `api.layout`. Последний выглядит как готовая раскладка
// и написан подробнее — но он МЁРТВЫЙ КОД, оставшийся от удалённых вариантов B и D: в
// прототипе его никто не вызывает. План велел портировать именно его, и порт по букве плана дал
// бы неработающий модуль. Живая раскладка варианта C — schemCanvasC, и портирована она.
//
// Три прохода, в порядке:
//   1. КОЛОНКИ ПО ГЛУБИНЕ. Узел, собранный только из деталей, — колонка 0; узел, берущий узлы, —
//      на единицу правее самого глубокого своего входа. Так провода идут слева направо и время
//      читается как ось.
//   2. ДВА ПРОХОДА БАРИЦЕНТРА. Внутри колонки узлы сортируются по среднему положению своих
//      входов в предыдущих колонках. Два, а не один: после первой сортировки положения входов
//      меняются, и второй проход снимает большую часть пересечений. Третий уже почти ничего не
//      даёт — прототип на этом и остановился.
//   3. КУРСОР-АНТИНАЕЗД. Узел тянется к середине своих входов, но не выше нижней границы
//      предыдущего в колонке. Без курсора притяжение к середине укладывает узлы друг на друга.
//
// Модуль ЧИСТЫЙ: ни React, ни SVG, ни DOM. Раскладку можно проверить пробой, картинку — нет.

export type BoxLayout = {
  key: string;
  x: number;
  y: number;
  w: number;
  h: number;
  /** Колонка (глубина по узловым входам). */
  col: number;
  /** Верх стопки плиток деталей-входов слева от блока. */
  stackTop: number;
  /** Ключи деталей, входящих в блок напрямую — точки входа чертежа. */
  pieceInputs: string[];
};

export type SchematicLayout = {
  boxes: BoxLayout[];
  byKey: Map<string, BoxLayout>;
  width: number;
  height: number;
  /** Детали, не вошедшие ни в один узел: колонка плиток у левого края. */
  unassigned: string[];
};

// Размеры взяты из прототипа: 180×15px строки под шапкой 21px, зазоры 96×18, плитка 48.
const W = 180;
const LINE_H = 15;
const HEAD_H = 21;
const GAP_X = 96;
const GAP_Y = 18;
const TILE = 48;
const TILE_GAP = 8;

export function assemblyLayout(
  blocks: AssemblyBlock[],
  steps: AssemblyStep[],
  res: AssemblyResult,
  collapsed: Set<string> = new Set(),
): SchematicLayout {
  const real = blocks.filter((b) => b.key !== '');
  if (real.length === 0) {
    return { boxes: [], byKey: new Map(), width: 0, height: 0, unassigned: [] };
  }

  // --- 1. глубина -------------------------------------------------------------------------------
  // Узловые входы узла собираются по ВСЕМ его шагам — производящему и поглощающим: узел,
  // вобравший другой узел позже, стоит правее него, иначе провод пошёл бы назад.
  const unitInputsOf = new Map<string, string[]>();
  for (const b of real) {
    const acc: string[] = [];
    for (const i of b.steps) {
      for (const input of steps[i]?.inputs ?? []) {
        if (input.kind === 'unit' && input.key !== b.key && res.units.has(input.key)) acc.push(input.key);
      }
    }
    unitInputsOf.set(b.key, acc);
  }
  const depth = new Map<string, number>();
  const depthOf = (key: string, guard: Set<string> = new Set()): number => {
    const known = depth.get(key);
    if (known !== undefined) return known;
    // Цикл невозможен при живых правилах (вход обязан существовать раньше), но раскладка
    // рисует и НЕВАЛИДНУЮ карточку — иначе автор не увидел бы, что именно сломал.
    if (guard.has(key)) return 0;
    guard.add(key);
    const ins = unitInputsOf.get(key) ?? [];
    const d = ins.length === 0 ? 0 : 1 + Math.max(...ins.map((k) => depthOf(k, guard)));
    depth.set(key, d);
    return d;
  };
  real.forEach((b) => depthOf(b.key));
  const maxCol = Math.max(...real.map((b) => depth.get(b.key) ?? 0));

  const cols: AssemblyBlock[][] = [];
  for (let c = 0; c <= maxCol; c++) cols[c] = real.filter((b) => (depth.get(b.key) ?? 0) === c);

  // --- 2. барицентр, два прохода ----------------------------------------------------------------
  for (let pass = 0; pass < 2; pass++) {
    for (let c = 1; c <= maxCol; c++) {
      const rank = new Map<string, number>();
      for (let cc = 0; cc < c; cc++) cols[cc].forEach((b, i) => rank.set(b.key, i));
      cols[c].sort((a, b) => bary(a, rank, unitInputsOf) - bary(b, rank, unitInputsOf));
    }
  }

  // --- детали-входы блока: точки входа чертежа --------------------------------------------------
  const pieceInputsOf = new Map<string, string[]>();
  for (const b of real) {
    const seen = new Set<string>();
    const acc: string[] = [];
    for (const i of b.steps) {
      for (const input of steps[i]?.inputs ?? []) {
        if (input.kind !== 'piece' || seen.has(input.key)) continue;
        seen.add(input.key);
        acc.push(input.key);
      }
    }
    pieceInputsOf.set(b.key, acc);
  }

  // Детали, не вошедшие никуда: отдельная колонка у левого края, чтобы «ещё не пришито» было
  // видно как состояние, а не как отсутствие.
  const unassigned = res.frontier.filter((k) => !res.units.has(k));
  const x0 = (unassigned.length ? 76 : 0) + 104;

  // --- 3. вертикаль: притяжение к середине входов, курсор против наездов ------------------------
  const boxes: BoxLayout[] = [];
  const byKey = new Map<string, BoxLayout>();
  let height = 0;

  for (let c = 0; c <= maxCol; c++) {
    let cursor = 16;
    for (const b of cols[c]) {
      const isCollapsed = collapsed.has(b.key);
      const boxH = isCollapsed ? HEAD_H : HEAD_H + 2 + b.steps.length * LINE_H + 4;
      const pieces = pieceInputsOf.get(b.key) ?? [];
      const stackH = pieces.length ? pieces.length * TILE + (pieces.length - 1) * TILE_GAP : 0;
      const effH = Math.max(boxH, stackH);

      let want: number | null = null;
      if (c > 0) {
        let sum = 0;
        let n = 0;
        for (const key of unitInputsOf.get(b.key) ?? []) {
          const q = byKey.get(key);
          if (q) {
            sum += q.y + q.h / 2;
            n++;
          }
        }
        if (n) want = sum / n - effH / 2;
      }
      const y = Math.max(cursor, want ?? cursor);
      const box: BoxLayout = {
        key: b.key,
        x: x0 + c * (W + GAP_X),
        y: y + (effH - boxH) / 2,
        w: W,
        h: boxH,
        col: c,
        stackTop: y + (effH - stackH) / 2,
        pieceInputs: pieces,
      };
      boxes.push(box);
      byKey.set(b.key, box);
      cursor = y + effH + GAP_Y;
      if (y + effH > height) height = y + effH;
    }
  }

  const tilesH = 16 + unassigned.length * (TILE + 8);
  if (tilesH > height) height = tilesH;

  return {
    boxes,
    byKey,
    width: x0 + maxCol * (W + GAP_X) + W + 24,
    height: height + 30,
    unassigned,
  };
}

function bary(b: AssemblyBlock, rank: Map<string, number>, ins: Map<string, string[]>): number {
  const keys = (ins.get(b.key) ?? []).filter((k) => rank.has(k));
  if (keys.length === 0) return Number.MAX_SAFE_INTEGER; // без входов — в конец колонки
  return keys.reduce((s, k) => s + (rank.get(k) ?? 0), 0) / keys.length;
}

export const SCHEMATIC_METRICS = { W, LINE_H, HEAD_H, TILE, TILE_GAP };
