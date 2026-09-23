// ГЕОМЕТРИЯ ЛИСТА — чистая часть раскладки обеих форм. Всё в миллиметрах бумаги.
//
// Компоненты листа МЕРЯЮТ DOM (высоты строк и карточек зависят от шрифта и от того, стоят ли в
// строке силуэты) и отдают сюда числа; здесь считаются полосы, коллекторы и провода — и здесь же
// живёт счётчик пересечений, которым проба и экранный ридаут проверяют обещание «0 по построению».
import type { PrintModel } from './model';

export type LaneSeg = { key: string; x: number; y1: number; y2: number };
export type Collector = { x1: number; x2: number; y: number };
export type RouteGeometry = {
  lanes: LaneSeg[];
  collectors: Collector[];
  /** ■ — шаг сделал или дополнил узел. */
  marks: { x: number; y: number }[];
  /** ─ — обработка узла на его полосе. */
  bars: { x: number; y: number }[];
  ends: { key: string; x: number; y: number; kind: 'garment' | 'open' }[];
};

/**
 * Полосы ROUTE: x по интервалу DFS (`laneX`), y по центрам строк (`rowY`, меряется у таблицы).
 * Полоса живёт от строки, что родила узел, до строки, что его съела (или до последней своей).
 */
export function routeGeometry(
  M: PrintModel,
  laneX: (key: string) => number,
  rowY: (index: number) => number,
): RouteGeometry {
  const g: RouteGeometry = { lanes: [], collectors: [], marks: [], bars: [], ends: [] };
  const spanOf = new Map<string, { y1: number; y2: number }>();
  for (const u of M.units) {
    const last = u.consumedAt ?? Math.max(...u.steps);
    const span = { y1: rowY(u.producedAt), y2: rowY(last) };
    spanOf.set(u.key, span);
    g.lanes.push({ key: u.key, x: laneX(u.key), ...span });
  }
  for (const r of M.rows) {
    const y = rowY(r.index);
    if (!r.workpiece) {
      // Обработка: чёрточка на КАЖДОМ узле, который шаг взял в работу; отвергнутый шаг — ничего.
      for (const k of r.unitInputs) g.bars.push({ x: laneX(k), y });
      continue;
    }
    const out = laneX(r.workpiece.key);
    const xs = [out, ...r.unitInputs.map(laneX)];
    if (xs.length > 1) g.collectors.push({ x1: Math.min(...xs), x2: Math.max(...xs), y });
    g.marks.push({ x: out, y });
  }
  for (const u of M.units) {
    const s = spanOf.get(u.key)!;
    const x = laneX(u.key);
    if (u.terminal) g.ends.push({ key: u.key, x, y: s.y2, kind: 'garment' });
    else if (u.open) g.ends.push({ key: u.key, x, y: s.y2, kind: 'open' });
  }
  return g;
}

/**
 * Пересечения ROUTE — геометрически: коллектор на высоте y режет полосу, если её x строго между
 * концами коллектора и её интервал y накрывает y. По построению таких быть не должно.
 */
export function routeCrossings(g: RouteGeometry): number {
  let n = 0;
  for (const c of g.collectors)
    for (const l of g.lanes)
      if (l.x > c.x1 + 0.01 && l.x < c.x2 - 0.01 && l.y1 < c.y - 0.01 && l.y2 > c.y + 0.01) n++;
  return n;
}

export type MapMetrics = {
  /** Левый край первой колонки, мм. */
  left: number;
  gutter: number;
  colW: number;
  gapY: number;
  /** Верх первой полосы (под шапкой), мм. */
  top: number;
};

export type CardMeasure = {
  /** Высота карточки, мм. */
  h: number;
  /** Центр шапки карточки от её верха, мм — сюда приходит провод. */
  headY: number;
  /** Строка шага внутри карточки: верх и высота от верха карточки, мм. */
  rowOf: (stepIndex: number) => { top: number; h: number } | null;
};

export type Wire = {
  from: string;
  to: string;
  d: string;
  /** Конец провода (стрелка). */
  x2: number;
  y2: number;
  /** Ломаная для счётчика пересечений. */
  pts: [number, number][];
};

export type MapLayout = {
  pos: Map<string, { x: number; y: number; h: number }>;
  wires: Wire[];
  /** Низ последней полосы, мм. */
  bottom: number;
};

function cubic(
  p0: [number, number],
  c1: [number, number],
  c2: [number, number],
  p1: [number, number],
  n: number,
): [number, number][] {
  const out: [number, number][] = [];
  for (let i = 1; i <= n; i++) {
    const t = i / n;
    const mt = 1 - t;
    out.push([
      mt * mt * mt * p0[0] + 3 * mt * mt * t * c1[0] + 3 * mt * t * t * c2[0] + t * t * t * p1[0],
      mt * mt * mt * p0[1] + 3 * mt * mt * t * c1[1] + 3 * mt * t * t * c2[1] + t * t * t * p1[1],
    ]);
  }
  return out;
}

/**
 * Раскладка MAP: колонка = высота поддерева, полоса поддерева непрерывна, дети — по наименьшему
 * номеру шага. Провод ребёнка: горизонталь внутри СОБСТВЕННОЙ полосы (там пусто), поворот только
 * в последней щели перед родителем; веер входов одного шага разведён по высоте строки в порядке
 * детей — общая точка входа считалась бы пересечением.
 */
export function mapLayout(
  M: PrintModel,
  m: MapMetrics,
  measureOf: (key: string) => CardMeasure,
): MapLayout {
  const colX = (c: number) => m.left + c * (m.colW + m.gutter);
  const kidsOf = (key: string) =>
    [...M.unitByKey.get(key)!.children].sort(
      (a, b) => M.unitByKey.get(a)!.minStep - M.unitByKey.get(b)!.minStep,
    );
  const subH = new Map<string, number>();
  const sub = (k: string): number => {
    const kids = kidsOf(k);
    const kidsH = kids.reduce((t, c) => t + sub(c), 0) + Math.max(0, kids.length - 1) * m.gapY;
    const h = Math.max(measureOf(k).h, kidsH);
    subH.set(k, h);
    return h;
  };
  const pos = new Map<string, { x: number; y: number; h: number }>();
  const place = (k: string, top: number) => {
    const u = M.unitByKey.get(k)!;
    const band = subH.get(k)!;
    const own = measureOf(k).h;
    pos.set(k, { x: colX(u.height), y: top + (band - own) / 2, h: own });
    const kids = kidsOf(k);
    const kidsH =
      kids.reduce((t, c) => t + subH.get(c)!, 0) + Math.max(0, kids.length - 1) * m.gapY;
    let cur = top + (band - kidsH) / 2;
    for (const c of kids) {
      place(c, cur);
      cur += subH.get(c)! + m.gapY;
    }
  };
  let top = m.top;
  for (const r of M.roots) {
    sub(r);
    place(r, top);
    top += subH.get(r)! + m.gapY * 2;
  }
  // Без единого узла низ содержимого — низ шапки, а не «на две щели выше неё».
  const bottom = M.roots.length ? top - m.gapY * 2 : m.top;

  const fan = new Map<string, string[]>();
  for (const u of M.units)
    for (const c of kidsOf(u.key)) {
      const k = `${u.key}:${M.unitByKey.get(c)!.parent!.step}`;
      fan.set(k, [...(fan.get(k) ?? []), c]);
    }
  const wires: Wire[] = [];
  for (const u of M.units) {
    if (!u.parent) continue;
    const from = pos.get(u.key)!;
    const to = pos.get(u.parent.key)!;
    const row = measureOf(u.parent.key).rowOf(u.parent.step);
    if (!row) continue;
    const y1 = from.y + measureOf(u.key).headY;
    const sib = fan.get(`${u.parent.key}:${u.parent.step}`) ?? [u.key];
    const rowTop = to.y + row.top;
    const y2 =
      sib.length === 1
        ? rowTop + row.h / 2
        : rowTop + (row.h * (sib.indexOf(u.key) + 1)) / (sib.length + 1);
    const xa = from.x + m.colW;
    const xb = to.x;
    const xTurn = xb - m.gutter;
    const half = m.gutter * 0.5;
    const pts: [number, number][] = [[xa, y1]];
    let d: string;
    if (xTurn > xa + 0.5) {
      pts.push([xTurn, y1]);
      pts.push(...cubic([xTurn, y1], [xTurn + half, y1], [xb - half, y2], [xb, y2], 24));
      d = `M${xa},${y1} H${xTurn} C${xTurn + half},${y1} ${xb - half},${y2} ${xb},${y2}`;
    } else {
      pts.push(...cubic([xa, y1], [xa + half, y1], [xb - half, y2], [xb, y2], 24));
      d = `M${xa},${y1} C${xa + half},${y1} ${xb - half},${y2} ${xb},${y2}`;
    }
    wires.push({ from: u.key, to: u.parent.key, d, x2: xb, y2, pts });
  }
  return { pos, wires, bottom };
}

/** Пары проводов MAP, у которых ломаные пересекаются хотя бы раз. По построению — ноль. */
export function mapCrossings(wires: Wire[]): number {
  const orient = (p: [number, number], q: [number, number], r: [number, number]) =>
    Math.sign((q[0] - p[0]) * (r[1] - p[1]) - (q[1] - p[1]) * (r[0] - p[0]));
  const cross = (
    a: [number, number],
    b: [number, number],
    c: [number, number],
    d: [number, number],
  ) => orient(a, b, c) !== orient(a, b, d) && orient(c, d, a) !== orient(c, d, b);
  let n = 0;
  for (let i = 0; i < wires.length; i++)
    for (let j = i + 1; j < wires.length; j++) {
      const A = wires[i].pts;
      const B = wires[j].pts;
      let hit = false;
      for (let a = 0; a < A.length - 1 && !hit; a++)
        for (let b = 0; b < B.length - 1 && !hit; b++)
          if (cross(A[a], A[a + 1], B[b], B[b + 1])) hit = true;
      if (hit) n++;
    }
  return n;
}
