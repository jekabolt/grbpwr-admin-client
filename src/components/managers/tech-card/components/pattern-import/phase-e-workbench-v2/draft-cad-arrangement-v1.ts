export const PATTERN_IMPORT_DXF_PHASE_E_DRAFT_CAD_ARRANGEMENT_V1 =
  'pattern-import-dxf-phase-e-draft-cad-arrangement/1' as const;

export type PatternImportDxfPhaseEDraftCadArrangementTransformV1 = Readonly<{
  x: number;
  y: number;
  quarterTurns: 0 | 1 | 2 | 3;
  flipX: boolean;
}>;

export type PatternImportDxfPhaseEDraftCadArrangementScopeV1 = Readonly<{
  schemaVersion: typeof PATTERN_IMPORT_DXF_PHASE_E_DRAFT_CAD_ARRANGEMENT_V1;
  scopeKey: string;
  selectedPieceIds: readonly string[];
  transforms: Readonly<Record<string, PatternImportDxfPhaseEDraftCadArrangementTransformV1>>;
}>;

export type PatternImportDxfPhaseEDraftCadArrangementByScopeV1 = Readonly<
  Record<string, PatternImportDxfPhaseEDraftCadArrangementScopeV1>
>;

export type PatternImportDxfPhaseEDraftCadArrangementActionV1 =
  | 'rotate-90'
  | 'flip-horizontal'
  | 'reset';

export const PATTERN_IMPORT_DXF_PHASE_E_DRAFT_CAD_IDENTITY_TRANSFORM_V1 = Object.freeze({
  x: 0,
  y: 0,
  quarterTurns: 0 as const,
  flipX: false,
});

const STABLE_SCOPE = /^[A-Za-z0-9][A-Za-z0-9._:/-]{0,255}$/;

function finite(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

function validTransform(
  value: PatternImportDxfPhaseEDraftCadArrangementTransformV1 | undefined,
): value is PatternImportDxfPhaseEDraftCadArrangementTransformV1 {
  return (
    !!value &&
    finite(value.x) &&
    finite(value.y) &&
    (value.quarterTurns === 0 ||
      value.quarterTurns === 1 ||
      value.quarterTurns === 2 ||
      value.quarterTurns === 3) &&
    typeof value.flipX === 'boolean'
  );
}

function uniqueKnown(
  pieceIds: readonly string[],
  available: ReadonlySet<string>,
): readonly string[] {
  return Object.freeze([...new Set(pieceIds.filter((pieceId) => available.has(pieceId)))]);
}

export function createPatternImportDxfPhaseEDraftCadArrangementScopeV1(
  scopeKey: string,
): PatternImportDxfPhaseEDraftCadArrangementScopeV1 {
  if (!STABLE_SCOPE.test(scopeKey)) throw new TypeError('A stable material scope key is required.');
  return Object.freeze({
    schemaVersion: PATTERN_IMPORT_DXF_PHASE_E_DRAFT_CAD_ARRANGEMENT_V1,
    scopeKey,
    selectedPieceIds: Object.freeze([]),
    transforms: Object.freeze({}),
  });
}

export function reconcilePatternImportDxfPhaseEDraftCadArrangementScopeV1(
  current: PatternImportDxfPhaseEDraftCadArrangementScopeV1 | null | undefined,
  scopeKey: string,
  pieceIds: readonly string[],
): PatternImportDxfPhaseEDraftCadArrangementScopeV1 {
  const available = new Set(pieceIds);
  if (
    !current ||
    current.schemaVersion !== PATTERN_IMPORT_DXF_PHASE_E_DRAFT_CAD_ARRANGEMENT_V1 ||
    current.scopeKey !== scopeKey
  )
    return createPatternImportDxfPhaseEDraftCadArrangementScopeV1(scopeKey);
  const transforms = Object.fromEntries(
    Object.entries(current.transforms).filter(
      ([pieceId, transform]) => available.has(pieceId) && validTransform(transform),
    ),
  );
  return Object.freeze({
    ...current,
    selectedPieceIds: uniqueKnown(current.selectedPieceIds, available),
    transforms: Object.freeze(transforms),
  });
}

export function selectPatternImportDxfPhaseEDraftCadArrangementPiecesV1(
  current: PatternImportDxfPhaseEDraftCadArrangementScopeV1,
  pieceIds: readonly string[],
  availablePieceIds: readonly string[],
): PatternImportDxfPhaseEDraftCadArrangementScopeV1 {
  return Object.freeze({
    ...current,
    selectedPieceIds: uniqueKnown(pieceIds, new Set(availablePieceIds)),
  });
}

export function movePatternImportDxfPhaseEDraftCadArrangementPiecesV1(
  current: PatternImportDxfPhaseEDraftCadArrangementScopeV1,
  origins: Readonly<
    Record<string, Pick<PatternImportDxfPhaseEDraftCadArrangementTransformV1, 'x' | 'y'>>
  >,
  delta: Readonly<{ x: number; y: number }>,
): PatternImportDxfPhaseEDraftCadArrangementScopeV1 {
  if (!finite(delta.x) || !finite(delta.y)) return current;
  const transforms = { ...current.transforms };
  for (const [pieceId, origin] of Object.entries(origins)) {
    if (!finite(origin.x) || !finite(origin.y)) continue;
    const previous =
      transforms[pieceId] ?? PATTERN_IMPORT_DXF_PHASE_E_DRAFT_CAD_IDENTITY_TRANSFORM_V1;
    transforms[pieceId] = Object.freeze({
      ...previous,
      x: origin.x + delta.x,
      y: origin.y + delta.y,
    });
  }
  return Object.freeze({ ...current, transforms: Object.freeze(transforms) });
}

export function applyPatternImportDxfPhaseEDraftCadArrangementActionV1(
  current: PatternImportDxfPhaseEDraftCadArrangementScopeV1,
  action: PatternImportDxfPhaseEDraftCadArrangementActionV1,
): PatternImportDxfPhaseEDraftCadArrangementScopeV1 {
  if (!current.selectedPieceIds.length) return current;
  const transforms = { ...current.transforms };
  for (const pieceId of current.selectedPieceIds) {
    const previous =
      transforms[pieceId] ?? PATTERN_IMPORT_DXF_PHASE_E_DRAFT_CAD_IDENTITY_TRANSFORM_V1;
    if (action === 'reset') {
      delete transforms[pieceId];
      continue;
    }
    transforms[pieceId] = Object.freeze({
      ...previous,
      quarterTurns:
        action === 'rotate-90'
          ? (((previous.quarterTurns + 1) % 4) as 0 | 1 | 2 | 3)
          : previous.quarterTurns,
      flipX: action === 'flip-horizontal' ? !previous.flipX : previous.flipX,
    });
  }
  return Object.freeze({ ...current, transforms: Object.freeze(transforms) });
}

export function updatePatternImportDxfPhaseEDraftCadArrangementScopeMapV1(
  current: PatternImportDxfPhaseEDraftCadArrangementByScopeV1,
  scope: PatternImportDxfPhaseEDraftCadArrangementScopeV1,
): PatternImportDxfPhaseEDraftCadArrangementByScopeV1 {
  return Object.freeze({ ...current, [scope.scopeKey]: scope });
}
