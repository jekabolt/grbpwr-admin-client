import type { PieceGeom } from 'lib/assembly-skeleton/types';
import type { StoredSeam, StoredSeamDirection } from 'lib/seams';

import { rowFromHand } from '../../assembly-seams/seam-actions';
import type { StrictSeamUpsertResult } from '../../assembly-seams/use-seam-decisions';
import type { PatternImportDxfPhaseECadMaterialScopePreparationResultV1 } from './cad-material-scope-preparation-v1';
import {
  PATTERN_IMPORT_DXF_PHASE_E_CAD_TABLE_CROSS_SCOPE_CONNECT_CLAIMS_V1,
  PATTERN_IMPORT_DXF_PHASE_E_CAD_TABLE_CROSS_SCOPE_CONNECT_V1,
  buildPatternImportDxfPhaseECadTableCrossScopeConnectCandidateV1,
  type PatternImportDxfPhaseECadTableCrossScopeConnectCandidateV1,
  type PatternImportDxfPhaseECadTableCrossScopeConnectSourceV1,
} from './cad-table-cross-scope-connect-v1';
import {
  buildPatternImportDxfPhaseEStoredSeamExactSideCrosswalkV1,
  type PatternImportDxfPhaseEZeroConnectStoredSeamCrosswalkBlockerV1,
  type PatternImportDxfPhaseEZeroConnectStoredSeamCrosswalkSideV1,
} from './cad-table-zero-connect-stored-seam-crosswalk-v1';

export const PATTERN_IMPORT_DXF_PHASE_E_CAD_TABLE_CROSS_SCOPE_STORED_SEAM_OWNER_V1 =
  'pattern-import-dxf-phase-e-cad-table-cross-scope-stored-seam-owner/1' as const;

export const PATTERN_IMPORT_DXF_PHASE_E_CAD_TABLE_CROSS_SCOPE_STORED_SEAM_OWNER_CLAIMS_V1 =
  Object.freeze({
    explicitScopeKeyPerSideRequired: true,
    exactCurrentTwoAuthorityCandidateRevalidated: true,
    globallyUniquePieceLineKeyPerSideRequired: true,
    currentPieceGeomPerSideRequired: true,
    operationMustStoreBothExactInputKeys: true,
    scopeInferredFromPieceName: false,
    scopeDiscardedBeforeAuthorityCrosswalk: false,
    existingRowFromHandReused: true,
    existingStrictSeamWriterRequired: true,
    strictEchoRequired: true,
    submittedSeamKeyAcceptedAsFinal: false,
    formMutationPerformed: false,
    networkWritePerformed: false,
    fakePersistenceCreated: false,
    productionReady: false,
  } as const);

export type PatternImportDxfPhaseECadTableCrossScopeOperationV1 = Readonly<{
  historyKey: string;
  operationNumber: number;
  inputKeys: readonly string[];
  seamKeys?: readonly string[];
}>;

export type PatternImportDxfPhaseECadTableCrossScopeStoredSeamSideV1 = Readonly<{
  scopeKey: string;
  source: PatternImportDxfPhaseECadTableCrossScopeConnectSourceV1;
  crosswalk: PatternImportDxfPhaseEZeroConnectStoredSeamCrosswalkSideV1;
}>;

export type PatternImportDxfPhaseECadTableCrossScopeStoredSeamCrosswalkReceiptV1 = Readonly<{
  schemaVersion: typeof PATTERN_IMPORT_DXF_PHASE_E_CAD_TABLE_CROSS_SCOPE_STORED_SEAM_OWNER_V1;
  status: 'two-current-authorities-side-parts-ready';
  operation: Readonly<{
    historyKey: string;
    operationNumber: number;
    inputKeys: readonly [string, string];
  }>;
  sides: readonly [
    PatternImportDxfPhaseECadTableCrossScopeStoredSeamSideV1,
    PatternImportDxfPhaseECadTableCrossScopeStoredSeamSideV1,
  ];
  claims: typeof PATTERN_IMPORT_DXF_PHASE_E_CAD_TABLE_CROSS_SCOPE_STORED_SEAM_OWNER_CLAIMS_V1;
}>;

export type PatternImportDxfPhaseECadTableCrossScopeStoredSeamBlockerV1 = Readonly<{
  code:
    | PatternImportDxfPhaseEZeroConnectStoredSeamCrosswalkBlockerV1['code']
    | 'cross-scope-candidate-stale'
    | 'cross-scope-mapping-unsupported'
    | 'cross-scope-piece-line-key-collision'
    | 'cross-scope-piece-scope-ambiguous'
    | 'cross-scope-operation-invalid'
    | 'cross-scope-operation-inputs-mismatch'
    | 'cross-scope-stored-seam-row-unavailable'
    | 'cross-scope-strict-seam-receipt-required'
    | 'cross-scope-strict-seam-write-refused'
    | 'cross-scope-strict-seam-receipt-mismatch'
    | 'cross-scope-operation-changed';
  detail: string;
}>;

export type PatternImportDxfPhaseECadTableCrossScopeStoredSeamCrosswalkResultV1 =
  | Readonly<{
      ok: true;
      receipt: PatternImportDxfPhaseECadTableCrossScopeStoredSeamCrosswalkReceiptV1;
      blocker: null;
    }>
  | Readonly<{
      ok: false;
      receipt: null;
      blocker: PatternImportDxfPhaseECadTableCrossScopeStoredSeamBlockerV1;
    }>;

export type PatternImportDxfPhaseECadTableCrossScopeStoredSeamPreparedReceiptV1 = Readonly<{
  schemaVersion: typeof PATTERN_IMPORT_DXF_PHASE_E_CAD_TABLE_CROSS_SCOPE_STORED_SEAM_OWNER_V1;
  status: 'cross-scope-stored-seam-row-ready-strict-upsert-required';
  crosswalk: PatternImportDxfPhaseECadTableCrossScopeStoredSeamCrosswalkReceiptV1;
  storedSeam: StoredSeam;
  nextCommand: Readonly<{
    kind: 'strict-seam-upsert';
    rows: readonly [StoredSeam];
    requiredOutcome: 'verified-echo';
    acceptSubmittedKeyAsFinal: false;
  }>;
  claims: typeof PATTERN_IMPORT_DXF_PHASE_E_CAD_TABLE_CROSS_SCOPE_STORED_SEAM_OWNER_CLAIMS_V1;
}>;

export type PatternImportDxfPhaseECadTableCrossScopeStoredSeamPrepareResultV1 =
  | Readonly<{
      ok: true;
      receipt: PatternImportDxfPhaseECadTableCrossScopeStoredSeamPreparedReceiptV1;
      blocker: null;
    }>
  | Readonly<{
      ok: false;
      receipt: null;
      blocker: PatternImportDxfPhaseECadTableCrossScopeStoredSeamBlockerV1;
    }>;

export type PatternImportDxfPhaseECadTableCrossScopeStoredSeamFinalReceiptV1 = Readonly<{
  schemaVersion: typeof PATTERN_IMPORT_DXF_PHASE_E_CAD_TABLE_CROSS_SCOPE_STORED_SEAM_OWNER_V1;
  status: 'cross-scope-final-echoed-seam-key-ready-for-operation-attach';
  operation: PatternImportDxfPhaseECadTableCrossScopeStoredSeamCrosswalkReceiptV1['operation'];
  echoedSeam: StoredSeam;
  finalSeamKey: string;
  claims: typeof PATTERN_IMPORT_DXF_PHASE_E_CAD_TABLE_CROSS_SCOPE_STORED_SEAM_OWNER_CLAIMS_V1;
}>;

export type PatternImportDxfPhaseECadTableCrossScopeStoredSeamCompleteResultV1 =
  | Readonly<{
      ok: true;
      receipt: PatternImportDxfPhaseECadTableCrossScopeStoredSeamFinalReceiptV1;
      blocker: null;
    }>
  | Readonly<{
      ok: false;
      receipt: null;
      blocker: PatternImportDxfPhaseECadTableCrossScopeStoredSeamBlockerV1;
    }>;

export type PatternImportDxfPhaseECadTableCrossScopeOperationAttachPlanV1 =
  | Readonly<{
      ok: true;
      operationIndex: number;
      seamKeys: readonly string[];
      changed: boolean;
      blocker: null;
    }>
  | Readonly<{
      ok: false;
      operationIndex: null;
      seamKeys: null;
      changed: false;
      blocker: PatternImportDxfPhaseECadTableCrossScopeStoredSeamBlockerV1;
    }>;

const STABLE_ID = /^[A-Za-z0-9][A-Za-z0-9._:/#-]{0,255}$/;

function blocked(
  code: PatternImportDxfPhaseECadTableCrossScopeStoredSeamBlockerV1['code'],
  detail: string,
): Readonly<{
  ok: false;
  receipt: null;
  blocker: PatternImportDxfPhaseECadTableCrossScopeStoredSeamBlockerV1;
}> {
  return Object.freeze({
    ok: false as const,
    receipt: null,
    blocker: Object.freeze({ code, detail }),
  });
}

function sameSource(
  left: PatternImportDxfPhaseECadTableCrossScopeConnectSourceV1,
  right: PatternImportDxfPhaseECadTableCrossScopeConnectSourceV1,
): boolean {
  return (
    left.techCardId === right.techCardId &&
    left.importGeneration === right.importGeneration &&
    left.sizeToken === right.sizeToken &&
    left.scopeKey === right.scopeKey &&
    left.sourceFileId === right.sourceFileId &&
    left.selectedGeometrySha256 === right.selectedGeometrySha256 &&
    left.sizeSelectionCanonicalSha256 === right.sizeSelectionCanonicalSha256 &&
    left.catalogCanonicalSha256 === right.catalogCanonicalSha256 &&
    left.projectionExpectedCatalogCanonicalSha256 ===
      right.projectionExpectedCatalogCanonicalSha256 &&
    left.projectionSizeSelectionCanonicalSha256 === right.projectionSizeSelectionCanonicalSha256 &&
    left.documentId === right.documentId &&
    left.documentRevision === right.documentRevision
  );
}

function sameSide(
  left: PatternImportDxfPhaseECadTableCrossScopeConnectCandidateV1['sides'][number],
  right: PatternImportDxfPhaseECadTableCrossScopeConnectCandidateV1['sides'][number],
): boolean {
  return (
    left.scopeKey === right.scopeKey &&
    left.pieceId === right.pieceId &&
    left.pieceLineKey === right.pieceLineKey &&
    left.contourId === right.contourId &&
    left.direction === right.direction &&
    left.boundaryVertexIds[0] === right.boundaryVertexIds[0] &&
    left.boundaryVertexIds[1] === right.boundaryVertexIds[1]
  );
}

function exactInputKeys(
  operation: PatternImportDxfPhaseECadTableCrossScopeOperationV1,
  expected: readonly [string, string],
): boolean {
  const inputKeys = operation.inputKeys.map((key) => key.trim()).filter(Boolean);
  return (
    inputKeys.length === 2 &&
    new Set(inputKeys).size === 2 &&
    [...inputKeys].sort().join('\u0000') === [...expected].sort().join('\u0000')
  );
}

/**
 * Revalidates both exact DXF authorities and proves that their globally unique card-piece keys map
 * to two current PieceGeom rows and to both inputs of one already-saved operation.
 */
export function buildPatternImportDxfPhaseECadTableCrossScopeStoredSeamCrosswalkV1(
  input: Readonly<{
    candidate: PatternImportDxfPhaseECadTableCrossScopeConnectCandidateV1;
    preparation: PatternImportDxfPhaseECadMaterialScopePreparationResultV1 | null;
    operation: PatternImportDxfPhaseECadTableCrossScopeOperationV1;
    geometry: readonly PieceGeom[];
    geometrySizeToken: string;
    toleranceMm?: number;
  }>,
): PatternImportDxfPhaseECadTableCrossScopeStoredSeamCrosswalkResultV1 {
  try {
    const { candidate, preparation, operation } = input;
    if (
      candidate?.schemaVersion !== PATTERN_IMPORT_DXF_PHASE_E_CAD_TABLE_CROSS_SCOPE_CONNECT_V1 ||
      candidate.status !== 'exact-cross-scope-draft-candidate' ||
      candidate.claims !== PATTERN_IMPORT_DXF_PHASE_E_CAD_TABLE_CROSS_SCOPE_CONNECT_CLAIMS_V1 ||
      !Array.isArray(candidate.sources) ||
      candidate.sources.length !== 2 ||
      !Array.isArray(candidate.sides) ||
      candidate.sides.length !== 2
    )
      return blocked(
        'cross-scope-candidate-stale',
        'A current exact two-authority cross-scope candidate is required.',
      );
    if (candidate.mapping !== 'equal' || candidate.lengthRatio !== 1)
      return blocked(
        'cross-scope-mapping-unsupported',
        'The StoredSeam cross-scope owner currently accepts explicit equal mapping with ratio 1.',
      );
    const revalidated = buildPatternImportDxfPhaseECadTableCrossScopeConnectCandidateV1({
      preparation,
      techCardId: candidate.techCardId,
      importGeneration: candidate.importGeneration,
      sizeToken: candidate.sizeToken,
      mapping: candidate.mapping,
      lengthRatio: candidate.lengthRatio,
      sides: candidate.sides,
    });
    if (
      !revalidated.ok ||
      revalidated.candidate.sources.some(
        (source, index) => !sameSource(source, candidate.sources[index]!),
      ) ||
      revalidated.candidate.sides.some((side, index) => !sameSide(side, candidate.sides[index]!))
    )
      return blocked(
        'cross-scope-candidate-stale',
        revalidated.ok
          ? 'A material authority changed after this cross-scope candidate was prepared.'
          : revalidated.blocker.detail,
      );
    const lineKeys = candidate.sides.map(({ pieceLineKey }) => pieceLineKey) as [string, string];
    if (lineKeys[0] === lineKeys[1])
      return blocked(
        'cross-scope-piece-line-key-collision',
        'StoredSeam anchors carry card piece_line_key without scope; both scopes cannot share it.',
      );
    if (
      !preparation?.ok ||
      candidate.sides.some((side) => {
        const scopes = preparation.catalog.pieceScopeKeys[side.pieceLineKey] ?? [];
        return scopes.length !== 1 || scopes[0] !== side.scopeKey;
      })
    )
      return blocked(
        'cross-scope-piece-scope-ambiguous',
        'Each StoredSeam piece_line_key must resolve to exactly its explicit material scope.',
      );
    if (
      !operation ||
      !STABLE_ID.test(operation.historyKey ?? '') ||
      !Number.isSafeInteger(operation.operationNumber) ||
      operation.operationNumber <= 0 ||
      !Array.isArray(operation.inputKeys)
    )
      return blocked(
        'cross-scope-operation-invalid',
        'Cross-scope seam linking requires one saved operation with stable history correlation.',
      );
    if (!exactInputKeys(operation, lineKeys))
      return blocked(
        'cross-scope-operation-inputs-mismatch',
        'The saved operation must still contain both and only the two exact cross-scope piece inputs.',
      );
    if (!Array.isArray(input.geometry) || input.geometrySizeToken !== candidate.sizeToken)
      return blocked(
        'crosswalk-size-mismatch',
        'Both current skeleton pieces must be available at the candidate size.',
      );
    const preparedScopes = candidate.sides.map((side) =>
      preparation.scopes.filter(({ scopeKey }) => scopeKey === side.scopeKey),
    );
    if (preparedScopes.some((matches) => matches.length !== 1))
      return blocked(
        'cross-scope-candidate-stale',
        'Each explicit side scope must still resolve to one prepared authority.',
      );
    const sideResults = candidate.sides.map((side, index) => {
      const scope = preparedScopes[index]![0]!;
      return buildPatternImportDxfPhaseEStoredSeamExactSideCrosswalkV1({
        side,
        catalog: scope.catalog,
        projection: scope.projection,
        geometry: input.geometry,
        geometrySizeToken: input.geometrySizeToken,
        ...(input.toleranceMm === undefined ? {} : { toleranceMm: input.toleranceMm }),
      });
    });
    const failed = sideResults.find(
      (result): result is Extract<(typeof sideResults)[number], { ok: false }> => !result.ok,
    );
    if (failed) return blocked(failed.blocker.code, failed.blocker.detail);
    const sideA = sideResults[0]!;
    const sideB = sideResults[1]!;
    if (!sideA.ok || !sideB.ok)
      return blocked('crosswalk-envelope-invalid', 'Both exact side crosswalks are required.');
    return Object.freeze({
      ok: true as const,
      receipt: Object.freeze({
        schemaVersion: PATTERN_IMPORT_DXF_PHASE_E_CAD_TABLE_CROSS_SCOPE_STORED_SEAM_OWNER_V1,
        status: 'two-current-authorities-side-parts-ready' as const,
        operation: Object.freeze({
          historyKey: operation.historyKey,
          operationNumber: operation.operationNumber,
          inputKeys: Object.freeze([...lineKeys]) as readonly [string, string],
        }),
        sides: Object.freeze([
          Object.freeze({
            scopeKey: candidate.sides[0].scopeKey,
            source: candidate.sources[0],
            crosswalk: sideA.side,
          }),
          Object.freeze({
            scopeKey: candidate.sides[1].scopeKey,
            source: candidate.sources[1],
            crosswalk: sideB.side,
          }),
        ]) as readonly [
          PatternImportDxfPhaseECadTableCrossScopeStoredSeamSideV1,
          PatternImportDxfPhaseECadTableCrossScopeStoredSeamSideV1,
        ],
        claims: PATTERN_IMPORT_DXF_PHASE_E_CAD_TABLE_CROSS_SCOPE_STORED_SEAM_OWNER_CLAIMS_V1,
      }),
      blocker: null,
    });
  } catch {
    return blocked(
      'cross-scope-candidate-stale',
      'The cross-scope StoredSeam envelope must be readable current authority data.',
    );
  }
}

/** Converts the proved two-authority crosswalk through the existing manual StoredSeam constructor. */
export function preparePatternImportDxfPhaseECadTableCrossScopeStoredSeamV1(
  input: Readonly<{
    candidate: PatternImportDxfPhaseECadTableCrossScopeConnectCandidateV1;
    preparation: PatternImportDxfPhaseECadMaterialScopePreparationResultV1 | null;
    operation: PatternImportDxfPhaseECadTableCrossScopeOperationV1;
    geometry: readonly PieceGeom[];
    geometrySizeToken: string;
    direction: StoredSeamDirection;
    nameOf: (pieceLineKey: string) => string;
    grainDeg: ReadonlyMap<string, number> | null;
    toleranceMm?: number;
    note?: string;
  }>,
): PatternImportDxfPhaseECadTableCrossScopeStoredSeamPrepareResultV1 {
  const crosswalk = buildPatternImportDxfPhaseECadTableCrossScopeStoredSeamCrosswalkV1(input);
  if (!crosswalk.ok) return blocked(crosswalk.blocker.code, crosswalk.blocker.detail);
  if (!['same', 'reversed', 'unknown'].includes(input.direction))
    return blocked(
      'cross-scope-stored-seam-row-unavailable',
      'Choose one explicit StoredSeam direction at the existing operation owner.',
    );
  const geometryByPiece = new Map(input.geometry.map((piece) => [piece.pieceKey, piece]));
  const row = rowFromHand(
    crosswalk.receipt.sides[0].crosswalk.parts,
    crosswalk.receipt.sides[1].crosswalk.parts,
    geometryByPiece,
    {
      pieces: input.geometry,
      grainDeg: input.grainDeg,
      nameOf: input.nameOf,
      size: input.geometrySizeToken,
    },
    { direction: input.direction, note: input.note },
  );
  const expected = crosswalk.receipt.operation.inputKeys;
  if (
    !row ||
    row.sideA.some(({ piece }) => piece !== expected[0]) ||
    row.sideB.some(({ piece }) => piece !== expected[1])
  )
    return blocked(
      'cross-scope-stored-seam-row-unavailable',
      'The exact two-authority SideParts could not produce one current rowFromHand StoredSeam.',
    );
  return Object.freeze({
    ok: true as const,
    receipt: Object.freeze({
      schemaVersion: PATTERN_IMPORT_DXF_PHASE_E_CAD_TABLE_CROSS_SCOPE_STORED_SEAM_OWNER_V1,
      status: 'cross-scope-stored-seam-row-ready-strict-upsert-required' as const,
      crosswalk: crosswalk.receipt,
      storedSeam: row,
      nextCommand: Object.freeze({
        kind: 'strict-seam-upsert' as const,
        rows: Object.freeze([row]) as readonly [StoredSeam],
        requiredOutcome: 'verified-echo' as const,
        acceptSubmittedKeyAsFinal: false as const,
      }),
      claims: PATTERN_IMPORT_DXF_PHASE_E_CAD_TABLE_CROSS_SCOPE_STORED_SEAM_OWNER_CLAIMS_V1,
    }),
    blocker: null,
  });
}

function rowSignature(row: StoredSeam): string {
  const side = (anchors: StoredSeam['sideA']) =>
    anchors
      .map((anchor) => `${anchor.piece}:${anchor.edgeHint}@${anchor.range[0]}-${anchor.range[1]}`)
      .sort()
      .join('+');
  return `${row.kind}|${[side(row.sideA), side(row.sideB)].sort().join('~')}`;
}

/** Accepts only the existing strict writer's single semantics-preserving echoed row. */
export function completePatternImportDxfPhaseECadTableCrossScopeStoredSeamV1(
  prepared: PatternImportDxfPhaseECadTableCrossScopeStoredSeamPreparedReceiptV1,
  strictReceipt: StrictSeamUpsertResult | null | undefined,
): PatternImportDxfPhaseECadTableCrossScopeStoredSeamCompleteResultV1 {
  if (!strictReceipt)
    return blocked(
      'cross-scope-strict-seam-receipt-required',
      'The existing strict seam writer must return a verified echo.',
    );
  if (!strictReceipt.ok)
    return blocked(
      'cross-scope-strict-seam-write-refused',
      `Strict seam upsert did not produce a verified echo: ${strictReceipt.blocker.detail}`,
    );
  if (
    strictReceipt.outcome !== 'verified-echo' ||
    strictReceipt.rows.length !== 1 ||
    strictReceipt.seamKeys.length !== 1
  )
    return blocked(
      'cross-scope-strict-seam-receipt-mismatch',
      'Strict seam upsert must echo exactly one persisted seam row and one final key.',
    );
  const expected = prepared.storedSeam;
  const echoed = strictReceipt.rows[0]!;
  if (
    echoed.kind === 'pose' ||
    !STABLE_ID.test(echoed.seamKey ?? '') ||
    strictReceipt.seamKeys[0] !== echoed.seamKey ||
    echoed.status !== 'confirmed' ||
    echoed.source !== 'manual' ||
    echoed.direction !== expected.direction ||
    echoed.anchoredSize !== expected.anchoredSize ||
    echoed.note !== expected.note ||
    echoed.stale === true ||
    rowSignature(echoed) !== rowSignature(expected)
  )
    return blocked(
      'cross-scope-strict-seam-receipt-mismatch',
      'The verified echo is not the prepared cross-scope StoredSeam semantics.',
    );
  return Object.freeze({
    ok: true as const,
    receipt: Object.freeze({
      schemaVersion: PATTERN_IMPORT_DXF_PHASE_E_CAD_TABLE_CROSS_SCOPE_STORED_SEAM_OWNER_V1,
      status: 'cross-scope-final-echoed-seam-key-ready-for-operation-attach' as const,
      operation: prepared.crosswalk.operation,
      echoedSeam: echoed,
      finalSeamKey: echoed.seamKey,
      claims: PATTERN_IMPORT_DXF_PHASE_E_CAD_TABLE_CROSS_SCOPE_STORED_SEAM_OWNER_CLAIMS_V1,
    }),
    blocker: null,
  });
}

/** Rechecks operation number, history and both inputs before attaching the final echoed seam key. */
export function planPatternImportDxfPhaseECadTableCrossScopeOperationAttachV1(
  operations: readonly PatternImportDxfPhaseECadTableCrossScopeOperationV1[],
  finalReceipt: PatternImportDxfPhaseECadTableCrossScopeStoredSeamFinalReceiptV1,
): PatternImportDxfPhaseECadTableCrossScopeOperationAttachPlanV1 {
  const matches = operations.flatMap((operation, operationIndex) =>
    operation.historyKey === finalReceipt.operation.historyKey
      ? [{ operation, operationIndex }]
      : [],
  );
  const match = matches[0];
  if (
    matches.length !== 1 ||
    !match ||
    match.operation.operationNumber !== finalReceipt.operation.operationNumber ||
    !exactInputKeys(match.operation, finalReceipt.operation.inputKeys)
  )
    return Object.freeze({
      ok: false as const,
      operationIndex: null,
      seamKeys: null,
      changed: false as const,
      blocker: Object.freeze({
        code: 'cross-scope-operation-changed' as const,
        detail:
          'The operation number, correlation or exact two cross-scope inputs changed after the seam write.',
      }),
    });
  const current = (match.operation.seamKeys ?? []).map((key) => key.trim()).filter(Boolean);
  const seamKeys = current.includes(finalReceipt.finalSeamKey)
    ? current
    : [...current, finalReceipt.finalSeamKey];
  return Object.freeze({
    ok: true as const,
    operationIndex: match.operationIndex,
    seamKeys: Object.freeze(seamKeys),
    changed: seamKeys.length !== current.length,
    blocker: null,
  });
}
