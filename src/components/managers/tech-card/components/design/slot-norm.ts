import type { common_TechCardOperation } from 'api/proto-http/admin';
import { parseDecimalNumber } from 'utils/decimal';

import { slotQtyFromSteps, type QtyStep } from '../button-qty';
import { measured } from '../use-colourway-auto';

/**
 * СЧЁТНАЯ НОРМА СЛОТА НА ЭКРАНЕ (вариант A, 09.11). Чистые функции: слоты материала и матрица
 * колорвеев читают одно и то же. Число шагов — из `button-qty.ts`, здесь только адаптер формы и
 * то, что рисует ячейка.
 */

/** Поля шага формы, которые нужны правилу. Шаг формы плоский: REPEATS лежит в `placementCount`. */
export type FormQtyOperation = {
  operationNumber?: number;
  operationType?: string;
  machineType?: string;
  placementCount?: number | null;
  bomLineKeys?: readonly (string | undefined)[];
};

const clean = (value?: string) => (value ?? '').trim();

/**
 * Шаги формы → `QtyStep`. Явное число шага на связи (0334) форма не держит — оно приходит с
 * прочитанной карточки и сверяется по серверному `operationNumber`.
 */
export function formQtySteps(
  operations: readonly FormQtyOperation[] | undefined,
  readOperations?: readonly common_TechCardOperation[],
): QtyStep[] {
  const explicitByNumber = new Map<number, Map<string, number>>();
  for (const op of readOperations ?? []) {
    const number = op.operationNumber ?? 0;
    if (!number || !op.bomQuantities?.length) continue;
    const byKey = new Map<string, number>();
    for (const q of op.bomQuantities) {
      const value = parseDecimalNumber(q.qtyPerGarment?.value);
      if (clean(q.lineKey) && Number.isFinite(value)) byKey.set(clean(q.lineKey), value);
    }
    if (byKey.size) explicitByNumber.set(number, byKey);
  }
  return (operations ?? []).map((op) => {
    const explicit = op.operationNumber ? explicitByNumber.get(op.operationNumber) : undefined;
    return {
      operationNumber: op.operationNumber,
      operationType: op.operationType,
      machineType: op.machineType,
      placementCount: op.placementCount,
      bomLineKeys: op.bomLineKeys,
      explicitQty: explicit ? (key: string) => explicit.get(clean(key)) : undefined,
    };
  });
}

/** Счётная строка: не мерная секция и не режется в длину. */
export function isCountedLine(
  line: { section?: string; lineKey?: string },
  cutKeys: ReadonlySet<string>,
): boolean {
  return !measured(line.section) && !cutKeys.has(clean(line.lineKey));
}

export type SlotNorm =
  | { kind: 'none' }
  | { kind: 'ops'; qty: number; ops: number; opNumbers: number[] }
  | { kind: 'manual' };

/**
 * Что стоит в ячейке NORM. `none` — строка не счётная (прочерк / мерная норма); `ops` — число
 * ставят шаги, только чтение; `manual` — шаги строку не ставят, поле `qtyPerGarment` в руке.
 */
export function slotNorm(
  line: { section?: string; lineKey?: string },
  steps: readonly QtyStep[],
  cutKeys: ReadonlySet<string>,
): SlotNorm {
  if (!isCountedLine(line, cutKeys)) return { kind: 'none' };
  const fromSteps = slotQtyFromSteps(steps, clean(line.lineKey));
  if (fromSteps.qty == null) return { kind: 'manual' };
  return {
    kind: 'ops',
    qty: fromSteps.qty,
    ops: fromSteps.steps.length,
    opNumbers: fromSteps.steps.map((s) => s.operationNumber ?? 0).filter((n) => n > 0),
  };
}

const num = (raw?: string): number | null => {
  const value = parseDecimalNumber(raw);
  return Number.isFinite(value) ? value : null;
};

/** Сколько ставится на изделие: Σ шагов, иначе ручное число слота, иначе null (базиса нет). */
export function slotUsed(norm: SlotNorm, qtyPerGarment?: string): number | null {
  if (norm.kind === 'ops') return norm.qty;
  if (norm.kind === 'manual') return num(qtyPerGarment);
  return null;
}

export function slotSpare(spareQty?: string): number {
  return num(spareQty) ?? 0;
}

export type CountedCell = {
  used: number | null;
  spare: number;
  /** Σ явных quantity строк колорвея на этом слоте; null — явных нет. */
  explicit: number | null;
  hasArticle: boolean;
};

/**
 * TO BUY колорвея: на каждом слоте явные quantity колорвея главнее used, запас прибавляется один
 * раз; слот без базиса ничего не покупает. Слоты без артикула — отдельно (`missing`).
 */
export function colourwayToBuy(cells: readonly CountedCell[]): { total: number; missing: number } {
  let total = 0;
  let missing = 0;
  for (const cell of cells) {
    const qty = cell.explicit ?? cell.used;
    if (qty == null) continue;
    if (cell.hasArticle) total += qty + cell.spare;
    else missing += qty + cell.spare;
  }
  return { total, missing };
}

export { countedPairOut } from './counted-pair';
