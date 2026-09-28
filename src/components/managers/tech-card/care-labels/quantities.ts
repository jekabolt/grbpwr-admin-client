// КОЛИЧЕСТВА ЛЕНТ — чистые функции сетки колорвей × размер (план §9.4, дизайн §8).
//
// Источник — прогон (`planned_qty` строки прогона по `product_id == colorway_id` и `size_id`) или
// ручной ввод («всем = N»). Запас % — округление ВВЕРХ на ячейку: лишняя лента дешевле перешива.
// Считается в ЦЕЛЫХ: `ceil(q × (100 + p) / 100)`, а не `ceil(q × 1.1)` — `100 × 1.1` в плавающей
// точке равно 110,00000000000001 и дало бы 111 (замерено: 11 таких q до 300 при 10 %).
//
// Ячейка 0 — вариант не в ZIP; колорвей с нулевой строкой — не в ZIP (предупреждение
// `colorway-excluded`); все нули — БЛОК `nothing-to-export`. Копии A(колорвей, размер) = ячейка;
// копии B(колорвей) = Σ строки на КАЖДЫЙ файл B колорвея. Итоги лент на экране — по плану печати
// (`planLabelsB`), ровно как README: перелив состава на B2 / B3 — ещё этикетки, в simplex лицо и
// изнанка — две ленты, а пустая изнанка B файла не даёт.
import type { common_ProductionRunStatus } from 'api/proto-http/admin';
import type { CareLabelRun } from './adapter';
import { hole, type Hole } from './holes';

/** Сетка: колорвей → размер → число лент (до запаса или после — по месту). */
export type QtyGrid = Record<number, Record<number, number>>;

export const emptyGrid = (colorwayIds: readonly number[], sizeIds: readonly number[]): QtyGrid =>
  Object.fromEntries(colorwayIds.map((c) => [c, Object.fromEntries(sizeIds.map((s) => [s, 0]))]));

/** Всем ячейкам одно N («всем = N» ручного режима). */
export const allEqual = (
  colorwayIds: readonly number[],
  sizeIds: readonly number[],
  n: number,
): QtyGrid => {
  const v = toQty(n);
  return Object.fromEntries(
    colorwayIds.map((c) => [c, Object.fromEntries(sizeIds.map((s) => [s, v]))]),
  );
};

/** Число ячейки: целое ≥ 0; мусор — 0. */
export const toQty = (n: unknown): number => {
  const v = typeof n === 'string' ? Number(n.trim()) : (n as number);
  return typeof v === 'number' && Number.isFinite(v) && v > 0 ? Math.floor(v) : 0;
};

/**
 * Сетка из прогона: `planned_qty` по (колорвей, размер); колорвея или размера нет в прогоне — 0;
 * несколько строк одной пары суммируются. Размеры вне ряда карточки игнорируются.
 */
export function fromRun(
  run: Pick<CareLabelRun, 'lines'>,
  colorwayIds: readonly number[],
  sizeIds: readonly number[],
): QtyGrid {
  const grid = emptyGrid(colorwayIds, sizeIds);
  for (const l of run.lines) {
    const row = grid[l.productId];
    if (!row || !(l.sizeId in row)) continue;
    row[l.sizeId] += toQty(l.plannedQty);
  }
  return grid;
}

/** Файлы плана печати колорвея — ровно то, что нужно для счёта лент (`PrintSet.files`). */
export type PlanFiles = ReadonlyMap<
  number,
  { files: readonly { label: string; sizeId?: number }[] }
>;

/**
 * Лент B по плану печати — то же правило, что `archiveCounts` README: КАЖДЫЙ файл B колорвея (B, B2
 * …; в simplex — лицо и непустая изнанка) несёт Σ строки колорвея. План — полный (`planAll`): файлы
 * в нём те же, что в архиве, копии берутся из сетки. Колорвей с лентами, но без плана (вёрстка ещё
 * идёт или упала) — число неизвестно: `null`, а не догадка.
 */
export function planLabelsB(plans: PlanFiles, cells: QtyGrid): number | null {
  let labelsB = 0;
  for (const [cwKey, row] of Object.entries(cells)) {
    const rowTotal = Object.values(row).reduce((a, v) => a + v, 0);
    if (rowTotal === 0) continue;
    const plan = plans.get(Number(cwKey));
    if (!plan) return null;
    labelsB += plan.files.filter((f) => f.label !== 'A').length * rowTotal;
  }
  return labelsB;
}

/** Запас: `ceil(q × (100 + pct) / 100)` в целых; 0 остаётся 0. */
export const withOverage = (q: number, pct: number): number =>
  q <= 0 ? 0 : Math.ceil((q * (100 + Math.max(0, Math.round(pct)))) / 100);

/** Прогон, чьи планы уже не план: получен, закрыт или отменён. */
const STALE: ReadonlySet<common_ProductionRunStatus> = new Set<common_ProductionRunStatus>([
  'PRODUCTION_RUN_STATUS_RECEIVED',
  'PRODUCTION_RUN_STATUS_CLOSED',
  'PRODUCTION_RUN_STATUS_CANCELLED',
]);

export type Quantities = {
  /** Итоговые копии (с запасом) по включённым колорвеям; у исключённых чекбоксом — нули. */
  cells: QtyGrid;
  rowTotals: Record<number, number>;
  colTotals: Record<number, number>;
  /** Лент A всего (Σ ячеек); в simplex ×2 — у A всегда две стороны (QR), файлов ровно столько. */
  labelsA: number;
  /** Лент B всего по плану печати (каждая B, B2 …); `null` — план ещё не свёрстан, число неизвестно. */
  labelsB: number | null;
  /** Колорвеи, у которых строка нулевая: в архив не идут. */
  zeroColorways: Set<number>;
  holes: Hole[];
};

export function computeQuantities(input: {
  base: QtyGrid;
  colorways: readonly { id: number; label: string }[];
  sizeIds: readonly number[];
  overagePct: number;
  mode: 'duplex' | 'simplex';
  /** Колорвеи, снятые чекбоксом: их строка не считается вовсе. */
  excluded?: readonly number[];
  /** Выбранный прогон (для `run-stale`). */
  run?: Pick<CareLabelRun, 'id' | 'status' | 'label'> | null;
  /** Полный план печати по колорвею (`planAll().sets`); нет — лент B не знаем. */
  plans?: PlanFiles | null;
}): Quantities {
  const { base, colorways, sizeIds, overagePct, mode } = input;
  const excluded = new Set(input.excluded ?? []);
  const k = mode === 'simplex' ? 2 : 1;
  const cells: QtyGrid = {};
  const rowTotals: Record<number, number> = {};
  const colTotals: Record<number, number> = Object.fromEntries(sizeIds.map((s) => [s, 0]));
  const zeroColorways = new Set<number>();
  const holes: Hole[] = [];
  let total = 0;

  for (const cw of colorways) {
    cells[cw.id] = {};
    let row = 0;
    for (const s of sizeIds) {
      const v = excluded.has(cw.id) ? 0 : withOverage(toQty(base[cw.id]?.[s]), overagePct);
      cells[cw.id][s] = v;
      row += v;
      colTotals[s] += v;
    }
    rowTotals[cw.id] = row;
    total += row;
    if (row === 0) {
      zeroColorways.add(cw.id);
      if (!excluded.has(cw.id)) {
        holes.push(
          hole('colorway-excluded', `${cw.label}: 0 labels — not in the zip`, {
            colorwayId: cw.id,
          }),
        );
      }
    }
  }

  if (input.run && input.run.status && STALE.has(input.run.status)) {
    holes.push(
      hole(
        'run-stale',
        `${input.run.label}: the run is no longer a plan — its planned quantities may be out of date`,
      ),
    );
  }
  if (total === 0 && colorways.some((c) => !excluded.has(c.id))) {
    holes.push(hole('nothing-to-export', 'every quantity is 0 — nothing to put into the zip'));
  }

  return {
    cells,
    rowTotals,
    colTotals,
    labelsA: total * k,
    // Ноль лент — ноль и без плана; иначе B только по плану (перелив B2, пустая изнанка в simplex).
    labelsB: total === 0 ? 0 : input.plans ? planLabelsB(input.plans, cells) : null,
    zeroColorways,
    holes,
  };
}
