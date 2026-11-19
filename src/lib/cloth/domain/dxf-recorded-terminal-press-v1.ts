/** A saved production step lacking a physical target. It is retained in manufacturing order. */
export const RECORDED_TERMINAL_PRESS_PROFILE =
  'single-saved-row-size-adjacent-native-stitch-with-recorded-terminal-press' as const;

export type RecordedAssemblyOrder = readonly [
  Readonly<{ role: 'simulated-stitch'; sourceOperationNumber: number }>,
  Readonly<{
    role: 'recorded-terminal-press';
    sourceOperationNumber: number;
    canonicalSourceOperation: string;
  }>,
];

// The gateway emits all fields, including protobuf defaults. Unknown, omitted or changed
// manufacturing fields must not acquire an automatic interpretation in the physical graph.
const emptyPressFields = {
  operationType: 'TECH_CARD_OPERATION_TYPE_PRESS',
  zone: 'TECH_CARD_GARMENT_ZONE_OTHER',
  pieceLineKeys: [],
  bomLineKeys: [],
  smv: null,
  calloutNumber: 0,
  stitchesPerCm: null,
  seamClass: 'TECH_CARD_SEAM_CLASS_UNKNOWN',
  topstitch: null,
  attachmentKind: 'TECH_CARD_ATTACHMENT_KIND_UNKNOWN',
  machineType: 'TECH_CARD_MACHINE_TYPE_UNKNOWN',
  machineProfileKey: '',
  threadCount: 0,
  needleType: 'TECH_CARD_NEEDLE_TYPE_UNKNOWN',
  needleSizeNm: 0,
  threadTension: 'TECH_CARD_THREAD_TENSION_UNKNOWN',
  threadTensionNote: '',
  stitchWidthMm: null,
  pressEquipment: 'TECH_CARD_PRESS_EQUIPMENT_IRON',
  pressProfileKey: '',
  pressTemperatureC: 0,
  pressDwellSec: 0,
  pressPressureNCm2: null,
  pressCloth: 'TECH_CARD_PRESS_CLOTH_UNKNOWN',
  pieceIds: [],
  bomItemIds: [],
  inputKeys: [],
  outputUnitKey: '',
  outputUnitName: '',
  media: [],
  printMethod: 'TECH_CARD_PRINT_METHOD_UNKNOWN',
  stitching: null,
  placementLayout: null,
  hardware: null,
  print: null,
  weld: null,
  trim: null,
  threadTrim: null,
  clean: null,
  inspect: null,
  wetProcessKind: 'TECH_CARD_WET_PROCESS_KIND_UNKNOWN',
  fastening: null,
  press: null,
  work: 'press_flat',
  bomQuantities: [],
  draft: false,
  review: '',
  assemblyBlockDetached: false,
  seamKeys: [],
  seamKind: '',
  workVariant: '',
  foldKeys: [],
  layerOrder: [],
  seamToleranceMm: null,
  labelKeys: [],
  topstitchLines: [],
} as const;

function canonical(value: unknown, depth = 0): string {
  if (depth > 24) throw new TypeError('Assembly source depth exceeds the saved snapshot limit.');
  if (Array.isArray(value))
    return '[' + value.map((item) => canonical(item, depth + 1)).join(',') + ']';
  if (value !== null && typeof value === 'object') {
    const values = value as Record<string, unknown>;
    return (
      '{' +
      Object.keys(values)
        .sort()
        .map((key) => JSON.stringify(key) + ':' + canonical(values[key], depth + 1))
        .join(',') +
      '}'
    );
  }
  return JSON.stringify(value);
}

type AssemblyOperation = Readonly<{
  operationNumber: number;
  work: string;
  seamKeys: readonly string[];
  inputKeys: readonly string[];
  outputUnitKey: string;
  outputUnitName: string;
}>;

export function readRecordedAssemblyOrder(
  operations: readonly AssemblyOperation[],
  canonicalWire?: string,
): RecordedAssemblyOrder | null {
  if (operations.length !== 2 || !canonicalWire || canonicalWire.length > 65_536) return null;
  const [stitch, press] = operations;
  if (
    !Number.isSafeInteger(stitch.operationNumber) ||
    stitch.operationNumber < 1 ||
    stitch.work !== 'join_lockstitch' ||
    stitch.seamKeys.length !== 1 ||
    stitch.inputKeys.length !== 2 ||
    new Set(stitch.inputKeys).size !== 2 ||
    !Number.isSafeInteger(press.operationNumber) ||
    press.operationNumber <= stitch.operationNumber ||
    press.work !== 'press_flat' ||
    press.inputKeys.length ||
    press.outputUnitKey ||
    press.outputUnitName ||
    press.seamKeys.length
  )
    return null;
  let rows;
  try {
    rows = JSON.parse(canonicalWire);
    if (!Array.isArray(rows) || rows.length !== 2 || canonical(rows) !== canonicalWire) return null;
  } catch {
    return null;
  }
  const [first, last] = rows;
  if (
    !first ||
    !last ||
    first.operationType !== 'TECH_CARD_OPERATION_TYPE_MACHINE' ||
    first.operationNumber !== stitch.operationNumber ||
    first.work !== stitch.work ||
    canonical(first.seamKeys) !== canonical(stitch.seamKeys) ||
    canonical(first.inputKeys) !== canonical(stitch.inputKeys) ||
    first.outputUnitKey !== stitch.outputUnitKey ||
    first.outputUnitName !== stitch.outputUnitName
  )
    return null;
  if (
    last.operationNumber !== press.operationNumber ||
    typeof last.note !== 'string' ||
    new TextEncoder().encode(last.note).length > 2048
  )
    return null;
  const wire = canonical(last);
  if (
    wire !==
    canonical({ ...emptyPressFields, operationNumber: press.operationNumber, note: last.note })
  )
    return null;
  return [
    { role: 'simulated-stitch', sourceOperationNumber: stitch.operationNumber },
    {
      role: 'recorded-terminal-press',
      sourceOperationNumber: press.operationNumber,
      canonicalSourceOperation: wire,
    },
  ];
}

export function equalRecordedAssemblyOrder(
  left: unknown,
  right: RecordedAssemblyOrder | null,
): boolean {
  return !!right && canonical(left) === canonical(right);
}
