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

type QtyValue = number | string | { value?: string } | null | undefined;

// Measured sections cost by length or weight. This is the one client mirror of the server's
// MeasuredSectionList; every counted reader goes through isCountedLine below.
export const MEASURED_SECTIONS = new Set([
  'TECH_CARD_BOM_SECTION_FABRIC',
  'TECH_CARD_BOM_SECTION_LINING',
  'TECH_CARD_BOM_SECTION_INTERLINING',
  'TECH_CARD_BOM_SECTION_INSULATION',
  'TECH_CARD_BOM_SECTION_THREAD',
  'TECH_CARD_BOM_SECTION_TRIM',
]);

/** A counted line is bought by the piece and is not cut to a requested length. */
export function isCountedLine({
  section,
  cutToLength,
}: {
  section?: string;
  cutToLength?: boolean;
}): boolean {
  return !MEASURED_SECTIONS.has(section ?? '') && !cutToLength;
}

type OperationQtySource = {
  operationNumber?: number;
  operationType?: string;
  machineType?: string;
  placementLayout?: { count?: number | null } | null;
  bomLineKeys?: readonly (string | undefined)[];
  bomQuantities?:
    | readonly {
        lineKey?: string;
        qtyPerGarment?: QtyValue;
      }[]
    | null;
};

type FormOperationQtySource = Omit<OperationQtySource, 'placementLayout'> & {
  placementCount?: number | null;
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

const qtyNumber = (value: QtyValue): number | null => {
  const raw =
    typeof value === 'object' && value !== null
      ? value.value
      : typeof value === 'number'
        ? value
        : value;
  if (raw == null || raw === '') return null;
  const number = typeof raw === 'number' ? raw : Number(raw.replace(',', '.'));
  return Number.isFinite(number) ? number : null;
};

const explicitQtyOf = (quantities: OperationQtySource['bomQuantities']): QtyStep['explicitQty'] => {
  const byLine = new Map<string, number>();
  for (const quantity of quantities ?? []) {
    const lineKey = key(quantity.lineKey);
    const qty = qtyNumber(quantity.qtyPerGarment);
    if (lineKey && qty != null) byLine.set(lineKey, qty);
  }
  return (lineKey) => byLine.get(key(lineKey));
};

/** Wire operation → the one quantity-rule shape shared by editor and PDF. */
export function qtyStepFromOperation(operation: OperationQtySource): QtyStep {
  return {
    operationNumber: operation.operationNumber,
    operationType: operation.operationType,
    machineType: operation.machineType,
    placementCount: operation.placementLayout?.count,
    bomLineKeys: operation.bomLineKeys,
    explicitQty: explicitQtyOf(operation.bomQuantities),
  };
}

/** Form operation → the same rule; the editor keeps REPEATS as a flat field. */
export function qtyStepFromFormOperation(
  operation: FormOperationQtySource,
  readOperation?: OperationQtySource,
): QtyStep {
  const saved =
    operation.operationNumber != null &&
    readOperation?.operationNumber === operation.operationNumber
      ? readOperation
      : undefined;
  return {
    operationNumber: operation.operationNumber,
    operationType: operation.operationType,
    machineType: operation.machineType,
    placementCount: operation.placementCount,
    bomLineKeys: operation.bomLineKeys,
    explicitQty: explicitQtyOf(saved?.bomQuantities ?? operation.bomQuantities),
  };
}

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

export type CountedPairBasis = 'rows' | 'steps' | 'slot' | null;

export type CountedPairLine = {
  id?: number | string;
  lineKey?: string;
  section?: string;
  qtyPerGarment?: QtyValue;
  spareQty?: QtyValue;
};

export type CountedPairUsage = {
  bomItemId?: number | string | null;
  bomLineKey?: string | null;
  bomItemIndex?: number | null;
  pieceId?: number | string | null;
  pieceLineKey?: string | null;
  pieceIndex?: number | null;
  quantity?: QtyValue;
};

export type CountedPairResolution = {
  /** At least one direct, garment-level row names this colourway x slot pair. */
  mentioned: boolean;
  basis: CountedPairBasis;
  /** Pair quantity before spare; legacy positional rows are separate. */
  pairUsed: number | null;
  /** Quantity carried by positional rows outside the pair. */
  legacyUsed: number;
  /** Per-garment quantity printed for the slot, including positional legacy rows. */
  used: number | null;
  /** Spare applied once to a resolved direct pair, never to legacy-only quantity. */
  spare: number;
  /** Purchase quantity for this colourway and slot. */
  toBuy: number | null;
};

const refNumber = (value: number | string | null | undefined): number => {
  const number = Number(value ?? 0);
  return Number.isFinite(number) && number > 0 ? number : 0;
};

const pieceBound = (usage: CountedPairUsage): boolean =>
  !!key(usage.pieceLineKey ?? undefined) ||
  refNumber(usage.pieceId) > 0 ||
  usage.pieceIndex != null;

const directBomRef = (usage: CountedPairUsage): boolean =>
  refNumber(usage.bomItemId) > 0 || !!key(usage.bomLineKey ?? undefined);

/**
 * Resolve one colourway x counted slot exactly as the server does.
 *
 * Direct garment rows form one pair. Any explicit row quantities replace step and slot bases;
 * spare is added once. Piece rows do not carry a norm. Positional legacy rows remain outside the
 * pair and add only their own quantity.
 */
export function resolveCountedPair({
  line,
  lineIndex,
  usages,
  stepQty,
  cutToLength = false,
}: {
  line: CountedPairLine;
  lineIndex: number;
  usages: readonly CountedPairUsage[];
  stepQty: number | null;
  cutToLength?: boolean;
}): CountedPairResolution {
  const none = (): CountedPairResolution => ({
    mentioned: false,
    basis: null,
    pairUsed: null,
    legacyUsed: 0,
    used: null,
    spare: 0,
    toBuy: null,
  });
  if (!isCountedLine({ section: line.section, cutToLength })) return none();

  const lineId = refNumber(line.id);
  const lineKey = key(line.lineKey);
  const garmentRows = usages.filter((usage) => !pieceBound(usage));
  const pair = garmentRows.filter((usage) => {
    if (!directBomRef(usage)) return false;
    const usageId = refNumber(usage.bomItemId);
    const usageKey = key(usage.bomLineKey ?? undefined);
    return (lineId > 0 && usageId === lineId) || (!!lineKey && usageKey === lineKey);
  });
  const legacy = garmentRows.filter(
    (usage) => !directBomRef(usage) && usage.bomItemIndex === lineIndex,
  );

  const explicit = pair
    .map((usage) => qtyNumber(usage.quantity))
    .filter((quantity): quantity is number => quantity != null);
  let basis: CountedPairBasis = null;
  let pairUsed: number | null = null;
  if (pair.length) {
    if (explicit.length) {
      pairUsed = explicit.reduce((sum, quantity) => sum + quantity, 0);
      basis = 'rows';
    } else if (stepQty != null && Number.isFinite(stepQty)) {
      pairUsed = stepQty;
      basis = 'steps';
    } else {
      const slotQty = qtyNumber(line.qtyPerGarment);
      if (slotQty != null) {
        pairUsed = slotQty;
        basis = 'slot';
      }
    }
  }

  const legacyQuantities = legacy
    .map((usage) => qtyNumber(usage.quantity))
    .filter((quantity): quantity is number => quantity != null);
  const legacyUsed = legacyQuantities.reduce((sum, quantity) => sum + quantity, 0);
  const hasLegacyUsed = legacyQuantities.length > 0;
  const used = pairUsed == null && !hasLegacyUsed ? null : (pairUsed ?? 0) + legacyUsed;
  const spare = pairUsed == null ? 0 : qtyNumber(line.spareQty) ?? 0;

  return {
    mentioned: pair.length > 0,
    basis,
    pairUsed,
    legacyUsed,
    used,
    spare,
    toBuy: used == null ? null : used + spare,
  };
}
