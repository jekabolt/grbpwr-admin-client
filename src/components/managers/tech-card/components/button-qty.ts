/**
 * СКОЛЬКО ШТУК СЧЁТНОГО АРТИКУЛА СТАВЯТ ШАГИ — клиентское зеркало серверного правила
 * (entity/countable.go, базис `ops`). Одно место на клиенте: слоты материала, BOM по колорвеям,
 * операция и PDF читают число отсюда.
 *
 * Шаг вносит число в слот, только если он этот артикул СТАВИТ:
 *   - явное число шага на связи (bomQuantities, 0334) — всегда, у любого шага;
 *   - иначе REPEATS (placement_count; пусто читается как 1) — только у шага установки:
 *     глагол HARDWARE_SET, легаси BUTTON_ATTACH или MACHINE с машиной button_attach.
 * Петля, закрепка и прочие шаги без явного числа ничего не вносят: «обметать 6 петель»
 * повторяется шесть раз и не тратит ни одной пуговицы.
 */

export type QtyStep = {
  operationNumber?: number;
  operationType?: string;
  machineType?: string;
  /** REPEATS шага; 0 / пусто — «не указано», читается как 1. */
  placementCount?: number | null;
  bomLineKeys?: readonly (string | undefined)[];
  /** Явное число шага на связи с этой строкой, если есть. */
  explicitQty?: (lineKey: string) => number | null | undefined;
};

const ATTACH_VERBS = new Set([
  'TECH_CARD_OPERATION_TYPE_HARDWARE_SET',
  'TECH_CARD_OPERATION_TYPE_BUTTON_ATTACH',
]);

export function isAttachStep(step: QtyStep): boolean {
  const verb = step.operationType ?? '';
  if (ATTACH_VERBS.has(verb)) return true;
  return (
    verb === 'TECH_CARD_OPERATION_TYPE_MACHINE' &&
    step.machineType === 'TECH_CARD_MACHINE_TYPE_BUTTON_ATTACH'
  );
}

const key = (value?: string) => (value ?? '').trim();

/** Сколько штук строки `lineKey` ставит один шаг; null — шаг её не ставит или числа нет. */
export function stepQtyOfLine(step: QtyStep, lineKey: string): number | null {
  const k = key(lineKey);
  if (!k || !(step.bomLineKeys ?? []).some((item) => key(item) === k)) return null;
  const explicit = step.explicitQty?.(k);
  if (explicit != null && Number.isFinite(explicit)) return explicit;
  if (!isAttachStep(step)) return null;
  const count = step.placementCount ?? 0;
  return count > 0 ? count : 1;
}

export type SlotStepQty = { operationNumber?: number; qty: number };

/** Σ по шагам, которые ставят строку; qty = null, когда ни один шаг её не ставит. */
export function slotQtyFromSteps(
  steps: readonly QtyStep[],
  lineKey: string,
): { qty: number | null; steps: SlotStepQty[] } {
  const parts: SlotStepQty[] = [];
  for (const step of steps) {
    const qty = stepQtyOfLine(step, lineKey);
    if (qty != null) parts.push({ operationNumber: step.operationNumber, qty });
  }
  return {
    qty: parts.length ? parts.reduce((sum, part) => sum + part.qty, 0) : null,
    steps: parts,
  };
}
