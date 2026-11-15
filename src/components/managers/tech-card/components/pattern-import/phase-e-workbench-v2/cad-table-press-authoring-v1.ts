import type { PatternImportDxfProductPhaseEAssemblyProjectionV1 } from 'lib/pattern-import/dxf-product-phase-e-assembly-workbench-v1';

import type { WorkCatalog } from '../../operation-work';
import type { PatternImportDxfPhaseECadMaterialScopePreparationResultV1 } from './cad-material-scope-preparation-v1';

export const PATTERN_IMPORT_DXF_PHASE_E_CAD_TABLE_PRESS_AUTHORING_V1 =
  'pattern-import-dxf-phase-e-cad-table-press-authoring/1' as const;

export const PATTERN_IMPORT_DXF_PHASE_E_CAD_TABLE_PRESS_AUTHORING_CLAIMS_V1 = Object.freeze({
  exactPreparedSelectionRequired: true,
  globallyUnambiguousPieceLineKeysRequired: true,
  explicitPressActionRequired: true,
  explicitPressEquipmentRequired: true,
  existingWorkCatalogRequired: true,
  operationNumberPersisted: false,
  draftRowRequested: true,
  networkWriteRequested: false,
  autosaveRequested: false,
  formMutationPerformed: false,
} as const);

export const PATTERN_IMPORT_DXF_PHASE_E_CAD_TABLE_PRESS_ACTIONS_V1 = Object.freeze([
  'TECH_CARD_PRESS_ACTION_PRESS_FLAT',
  'TECH_CARD_PRESS_ACTION_STEAM',
  'TECH_CARD_PRESS_ACTION_FINAL',
  'TECH_CARD_PRESS_ACTION_EASE_IN',
  'TECH_CARD_PRESS_ACTION_STRETCH',
  'TECH_CARD_PRESS_ACTION_MOULD',
] as const);

export const PATTERN_IMPORT_DXF_PHASE_E_CAD_TABLE_PRESS_EQUIPMENT_V1 = Object.freeze([
  'TECH_CARD_PRESS_EQUIPMENT_IRON',
  'TECH_CARD_PRESS_EQUIPMENT_PRESS',
  'TECH_CARD_PRESS_EQUIPMENT_STEAM_DUMMY',
  'TECH_CARD_PRESS_EQUIPMENT_STEAMER',
] as const);

export type PatternImportDxfPhaseECadTablePressActionV1 =
  (typeof PATTERN_IMPORT_DXF_PHASE_E_CAD_TABLE_PRESS_ACTIONS_V1)[number];
export type PatternImportDxfPhaseECadTablePressEquipmentV1 =
  (typeof PATTERN_IMPORT_DXF_PHASE_E_CAD_TABLE_PRESS_EQUIPMENT_V1)[number];

const WORK_BY_ACTION: Readonly<Record<PatternImportDxfPhaseECadTablePressActionV1, string>> =
  Object.freeze({
    TECH_CARD_PRESS_ACTION_PRESS_FLAT: 'press_flat',
    TECH_CARD_PRESS_ACTION_STEAM: 'press_steam',
    TECH_CARD_PRESS_ACTION_FINAL: 'press_final',
    TECH_CARD_PRESS_ACTION_EASE_IN: 'press_ease_in',
    TECH_CARD_PRESS_ACTION_STRETCH: 'press_stretch',
    TECH_CARD_PRESS_ACTION_MOULD: 'press_mould',
  });

export type PatternImportDxfPhaseECadTablePressCandidateV1 = Readonly<{
  schemaVersion: typeof PATTERN_IMPORT_DXF_PHASE_E_CAD_TABLE_PRESS_AUTHORING_V1;
  techCardId: number;
  scopeKey: string;
  sourceFileId: string;
  catalogCanonicalSha256: string;
  sizeSelectionCanonicalSha256: string;
  inputKeys: readonly string[];
  pressAction: PatternImportDxfPhaseECadTablePressActionV1;
  pressEquipment: PatternImportDxfPhaseECadTablePressEquipmentV1;
  claims: typeof PATTERN_IMPORT_DXF_PHASE_E_CAD_TABLE_PRESS_AUTHORING_CLAIMS_V1;
}>;

export type PatternImportDxfPhaseECadTablePressBlockerV1 = Readonly<{
  code:
    | 'press-exact-selection-unavailable'
    | 'press-selection-ambiguous'
    | 'press-material-scope-ambiguous'
    | 'press-action-required'
    | 'press-equipment-required'
    | 'press-work-catalog-unavailable'
    | 'press-history-key-invalid'
    | 'press-authoring-owner-frozen'
    | 'press-authoring-owner-unavailable';
  detail: string;
}>;

export type PatternImportDxfPhaseECadTablePressCandidateResultV1 =
  | Readonly<{
      ok: true;
      candidate: PatternImportDxfPhaseECadTablePressCandidateV1;
      blocker: null;
    }>
  | Readonly<{
      ok: false;
      candidate: null;
      blocker: PatternImportDxfPhaseECadTablePressBlockerV1;
    }>;

export type PatternImportDxfPhaseECadTablePressDraftRowV1 = Readonly<{
  historyKey: string;
  operationNumber: 0;
  operationType: 'TECH_CARD_OPERATION_TYPE_PRESS';
  work: string;
  draft: true;
  inputKeys: readonly string[];
  pressAction: PatternImportDxfPhaseECadTablePressActionV1;
  pressEquipment: PatternImportDxfPhaseECadTablePressEquipmentV1;
}>;

export type PatternImportDxfPhaseECadTablePressDraftResultV1 =
  | Readonly<{
      ok: true;
      row: PatternImportDxfPhaseECadTablePressDraftRowV1;
      blocker: null;
    }>
  | Readonly<{
      ok: false;
      row: null;
      blocker: PatternImportDxfPhaseECadTablePressBlockerV1;
    }>;

export type PatternImportDxfPhaseECadTablePressAuthoringResultV1 =
  | Readonly<{
      ok: true;
      inserted: 1;
      historyKey: string;
      blocker: null;
    }>
  | Readonly<{
      ok: false;
      inserted: 0;
      historyKey: null;
      blocker: PatternImportDxfPhaseECadTablePressBlockerV1;
    }>;

export type PatternImportDxfPhaseECadTablePressAuthoringOwnerV1 =
  | Readonly<{
      status: 'available';
      ingest: (
        candidate: PatternImportDxfPhaseECadTablePressCandidateV1,
      ) => PatternImportDxfPhaseECadTablePressAuthoringResultV1;
    }>
  | Readonly<{
      status: 'unavailable';
      blocker: PatternImportDxfPhaseECadTablePressBlockerV1;
    }>;

function blocked(
  code: PatternImportDxfPhaseECadTablePressBlockerV1['code'],
  detail: string,
): Extract<PatternImportDxfPhaseECadTablePressCandidateResultV1, { ok: false }> {
  return Object.freeze({
    ok: false as const,
    candidate: null,
    blocker: Object.freeze({ code, detail }),
  });
}

/** Current prepared scope + selected exact projected pieces → detached Press candidate. */
export function planPatternImportDxfPhaseECadTablePressCandidateV1(
  input: Readonly<{
    preparation: PatternImportDxfPhaseECadMaterialScopePreparationResultV1 | null;
    projection: PatternImportDxfProductPhaseEAssemblyProjectionV1;
    techCardId: number;
    scopeKey: string;
    selectedPieceIds: readonly string[];
    pressAction: string;
    pressEquipment: string;
  }>,
): PatternImportDxfPhaseECadTablePressCandidateResultV1 {
  const preparation = input.preparation;
  const selectedIds = input.selectedPieceIds.map((pieceId) => pieceId.trim()).filter(Boolean);
  if (!selectedIds.length || new Set(selectedIds).size !== selectedIds.length)
    return blocked(
      'press-exact-selection-unavailable',
      'Select one or more exact pattern pieces before creating a Press draft.',
    );
  if (!PATTERN_IMPORT_DXF_PHASE_E_CAD_TABLE_PRESS_ACTIONS_V1.includes(input.pressAction as never))
    return blocked('press-action-required', 'Choose an explicit supported Press action.');
  if (
    !PATTERN_IMPORT_DXF_PHASE_E_CAD_TABLE_PRESS_EQUIPMENT_V1.includes(input.pressEquipment as never)
  )
    return blocked('press-equipment-required', 'Choose explicit Press equipment.');
  if (!preparation?.ok || preparation.catalog.techCardId !== input.techCardId)
    return blocked(
      'press-exact-selection-unavailable',
      'Current exact prepared material geometry is unavailable.',
    );
  const scopes = preparation.scopes.filter(({ scopeKey }) => scopeKey === input.scopeKey);
  if (scopes.length !== 1)
    return blocked(
      'press-material-scope-ambiguous',
      'The selected material scope must resolve to exactly one current DXF authority.',
    );
  const scope = scopes[0]!;
  if (
    scope.projection.sourceFileId !== input.projection.sourceFileId ||
    scope.projection.expectedCatalogCanonicalSha256 !==
      input.projection.expectedCatalogCanonicalSha256 ||
    scope.projection.sizeSelectionCanonicalSha256 !== input.projection.sizeSelectionCanonicalSha256
  )
    return blocked(
      'press-exact-selection-unavailable',
      'The selected projection changed before the Press draft was prepared.',
    );
  const pieces = selectedIds.map((pieceId) =>
    input.projection.pieces.filter((piece) => piece.pieceId === pieceId),
  );
  if (pieces.some((matches) => matches.length !== 1))
    return blocked(
      'press-selection-ambiguous',
      'Every selected piece must resolve once in the active exact projection.',
    );
  const inputKeys = pieces.map((matches) => matches[0]!.pieceLineKey.trim());
  if (!inputKeys.every(Boolean) || new Set(inputKeys).size !== inputKeys.length)
    return blocked(
      'press-selection-ambiguous',
      'Selected pieces must have distinct exact card piece keys.',
    );
  if (
    inputKeys.some((pieceLineKey) => {
      const scopeKeys = preparation.catalog.pieceScopeKeys[pieceLineKey] ?? [];
      return scopeKeys.length !== 1 || scopeKeys[0] !== input.scopeKey;
    })
  )
    return blocked(
      'press-material-scope-ambiguous',
      'Every selected piece key must belong to exactly the active material scope.',
    );
  return Object.freeze({
    ok: true as const,
    candidate: Object.freeze({
      schemaVersion: PATTERN_IMPORT_DXF_PHASE_E_CAD_TABLE_PRESS_AUTHORING_V1,
      techCardId: input.techCardId,
      scopeKey: input.scopeKey,
      sourceFileId: input.projection.sourceFileId,
      catalogCanonicalSha256: input.projection.expectedCatalogCanonicalSha256,
      sizeSelectionCanonicalSha256: input.projection.sizeSelectionCanonicalSha256,
      inputKeys: Object.freeze(inputKeys),
      pressAction: input.pressAction as PatternImportDxfPhaseECadTablePressActionV1,
      pressEquipment: input.pressEquipment as PatternImportDxfPhaseECadTablePressEquipmentV1,
      claims: PATTERN_IMPORT_DXF_PHASE_E_CAD_TABLE_PRESS_AUTHORING_CLAIMS_V1,
    }),
    blocker: null,
  });
}

/** Candidate → one complete ordinary draft row; no form or network mutation. */
export function preparePatternImportDxfPhaseECadTablePressDraftRowV1(
  input: Readonly<{
    candidate: PatternImportDxfPhaseECadTablePressCandidateV1;
    historyKey: string;
    existingHistoryKeys: readonly string[];
    workCatalog: WorkCatalog;
  }>,
): PatternImportDxfPhaseECadTablePressDraftResultV1 {
  const { candidate } = input;
  const inputKeys = candidate?.inputKeys.map((pieceLineKey) => pieceLineKey.trim()) ?? [];
  if (
    candidate?.schemaVersion !== PATTERN_IMPORT_DXF_PHASE_E_CAD_TABLE_PRESS_AUTHORING_V1 ||
    candidate.claims !== PATTERN_IMPORT_DXF_PHASE_E_CAD_TABLE_PRESS_AUTHORING_CLAIMS_V1 ||
    !inputKeys.length ||
    inputKeys.some((pieceLineKey) => !/^[A-Za-z0-9][A-Za-z0-9._:/#-]{0,255}$/.test(pieceLineKey)) ||
    new Set(inputKeys).size !== inputKeys.length ||
    !PATTERN_IMPORT_DXF_PHASE_E_CAD_TABLE_PRESS_ACTIONS_V1.includes(
      candidate.pressAction as never,
    ) ||
    !PATTERN_IMPORT_DXF_PHASE_E_CAD_TABLE_PRESS_EQUIPMENT_V1.includes(
      candidate.pressEquipment as never,
    )
  )
    return Object.freeze({
      ok: false as const,
      row: null,
      blocker: Object.freeze({
        code: 'press-exact-selection-unavailable' as const,
        detail: 'The exact Press selection candidate is stale or incomplete.',
      }),
    });
  if (
    !/^[A-Za-z0-9][A-Za-z0-9._:/#-]{0,255}$/.test(input.historyKey) ||
    input.existingHistoryKeys.includes(input.historyKey)
  )
    return Object.freeze({
      ok: false as const,
      row: null,
      blocker: Object.freeze({
        code: 'press-history-key-invalid' as const,
        detail: 'The Press draft needs one stable unique in-form history key.',
      }),
    });
  const work = WORK_BY_ACTION[candidate.pressAction];
  const catalogItem = input.workCatalog.byToken.get(work);
  if (!catalogItem || catalogItem.retired || catalogItem.verb !== 'press')
    return Object.freeze({
      ok: false as const,
      row: null,
      blocker: Object.freeze({
        code: 'press-work-catalog-unavailable' as const,
        detail: 'The current work catalog has no active work matching this Press action.',
      }),
    });
  return Object.freeze({
    ok: true as const,
    row: Object.freeze({
      historyKey: input.historyKey,
      operationNumber: 0 as const,
      operationType: 'TECH_CARD_OPERATION_TYPE_PRESS' as const,
      work,
      draft: true as const,
      inputKeys: Object.freeze(inputKeys),
      pressAction: candidate.pressAction,
      pressEquipment: candidate.pressEquipment,
    }),
    blocker: null,
  });
}
