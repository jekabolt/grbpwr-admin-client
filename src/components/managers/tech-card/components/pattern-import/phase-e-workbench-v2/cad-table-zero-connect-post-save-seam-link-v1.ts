import type { PieceGeom } from 'lib/assembly-skeleton/types';
import type { PatternImportDxfProductPhaseEAuthoringCatalogV1 } from 'lib/cloth/domain/pattern-import-dxf-product-phase-e-authoring-catalog-v1';
import type { PatternImportDxfProductPhaseEAssemblyProjectionV1 } from 'lib/pattern-import/dxf-product-phase-e-assembly-workbench-v1';
import type { StoredSeam, StoredSeamDirection } from 'lib/seams';

import { rowFromHand } from '../../assembly-seams/seam-actions';
import type { StrictSeamUpsertResult } from '../../assembly-seams/use-seam-decisions';
import type { PatternImportDxfPhaseECadTableZeroConnectCandidateV1 } from './cad-table-zero-connect-session-v1';
import {
  buildPatternImportDxfPhaseEZeroConnectStoredSeamCrosswalkV1,
  type PatternImportDxfPhaseEZeroConnectStoredSeamCrosswalkBlockerV1,
  type PatternImportDxfPhaseEZeroConnectStoredSeamCrosswalkReceiptV1,
} from './cad-table-zero-connect-stored-seam-crosswalk-v1';

export const PATTERN_IMPORT_DXF_PHASE_E_ZERO_CONNECT_POST_SAVE_SEAM_LINK_V1 =
  'pattern-import-dxf-phase-e-zero-connect-post-save-seam-link/1' as const;

export const PATTERN_IMPORT_DXF_PHASE_E_ZERO_CONNECT_POST_SAVE_SEAM_LINK_CLAIMS_V1 = Object.freeze({
  savedOperationNumberRequired: true,
  sameSessionHistoryCorrelationOnly: true,
  durableOperationIdAvailable: false,
  operationNumberIsDurableIdentity: false,
  currentCrosswalkRequired: true,
  storedSeamDirectionInferred: false,
  existingRowFromHandSemanticsReused: true,
  strictSeamEchoRequired: true,
  preWriteSeamKeyAcceptedAsFinal: false,
  existingOperationSeamKeysAttachRequired: true,
  operationAttachmentPerformed: false,
  exactSidecarCreated: false,
  operationAndSeamWritesAtomic: false,
  formMutationPerformed: false,
  networkWritePerformed: false,
  productionReady: false,
} as const);

/**
 * The only correlation the current operation writer can prove after a save. `historyKey` is local
 * form history and `operationNumber` is positional; neither field is represented as a durable
 * operation ID by this contract.
 */
export type PatternImportDxfPhaseEZeroConnectSavedDraftOperationReceiptV1 = Readonly<{
  status: 'same-session-saved-draft-operation';
  historyKey: string;
  operationNumber: number;
}>;

export type PatternImportDxfPhaseEZeroConnectPostSaveSeamLinkInputV1 = Readonly<{
  savedOperation: PatternImportDxfPhaseEZeroConnectSavedDraftOperationReceiptV1;
  candidate: PatternImportDxfPhaseECadTableZeroConnectCandidateV1;
  catalog: PatternImportDxfProductPhaseEAuthoringCatalogV1;
  projection: PatternImportDxfProductPhaseEAssemblyProjectionV1;
  geometry: readonly PieceGeom[];
  geometrySizeToken: string;
  direction: StoredSeamDirection;
  /** Explicit context required by the existing `rowFromHand` anchor path. */
  nameOf: (pieceLineKey: string) => string;
  /** Explicit context required by the existing `rowFromHand` anchor path. */
  grainDeg: ReadonlyMap<string, number> | null;
  toleranceMm?: number;
  note?: string;
}>;

export type PatternImportDxfPhaseEZeroConnectPostSaveCrosswalkReadyReceiptV1 = Readonly<{
  status: 'post-save-crosswalk-ready';
  operation: Readonly<{
    historyKey: string;
    operationNumber: number;
    durableOperationId: null;
  }>;
  crosswalk: PatternImportDxfPhaseEZeroConnectStoredSeamCrosswalkReceiptV1;
}>;

export type PatternImportDxfPhaseEZeroConnectStrictSeamUpsertCommandV1 = Readonly<{
  kind: 'strict-seam-upsert';
  rows: readonly [StoredSeam];
  requiredOutcome: 'verified-echo';
  acceptSubmittedKeyAsFinal: false;
}>;

export type PatternImportDxfPhaseEZeroConnectPostSaveSeamPreparedReceiptV1 = Readonly<{
  schemaVersion: typeof PATTERN_IMPORT_DXF_PHASE_E_ZERO_CONNECT_POST_SAVE_SEAM_LINK_V1;
  status: 'stored-seam-row-ready-strict-upsert-required';
  crosswalkReady: PatternImportDxfPhaseEZeroConnectPostSaveCrosswalkReadyReceiptV1;
  storedSeam: StoredSeam;
  nextCommand: PatternImportDxfPhaseEZeroConnectStrictSeamUpsertCommandV1;
  claims: typeof PATTERN_IMPORT_DXF_PHASE_E_ZERO_CONNECT_POST_SAVE_SEAM_LINK_CLAIMS_V1;
}>;

export type PatternImportDxfPhaseEZeroConnectPostSaveSeamLinkBlockerV1 = Readonly<{
  code:
    | PatternImportDxfPhaseEZeroConnectStoredSeamCrosswalkBlockerV1['code']
    | 'post-save-envelope-invalid'
    | 'saved-operation-receipt-invalid'
    | 'saved-operation-correlation-mismatch'
    | 'stored-seam-direction-invalid'
    | 'stored-seam-row-unavailable'
    | 'strict-seam-receipt-required'
    | 'strict-seam-write-refused'
    | 'strict-seam-receipt-mismatch';
  detail: string;
}>;

export type PatternImportDxfPhaseEZeroConnectPostSaveSeamPrepareResultV1 =
  | Readonly<{
      ok: true;
      receipt: PatternImportDxfPhaseEZeroConnectPostSaveSeamPreparedReceiptV1;
      blocker: null;
    }>
  | Readonly<{
      ok: false;
      receipt: null;
      blocker: PatternImportDxfPhaseEZeroConnectPostSaveSeamLinkBlockerV1;
    }>;

export type PatternImportDxfPhaseEZeroConnectOperationSeamKeyAttachCommandV1 = Readonly<{
  kind: 'attach-existing-operation-seam-key';
  operationNumber: number;
  historyKey: string;
  durableOperationId: null;
  seamKey: string;
}>;

export type PatternImportDxfPhaseEZeroConnectPostSaveSeamFinalReceiptV1 = Readonly<{
  schemaVersion: typeof PATTERN_IMPORT_DXF_PHASE_E_ZERO_CONNECT_POST_SAVE_SEAM_LINK_V1;
  status: 'final-echoed-seam-key-ready-for-operation-attach';
  operation: PatternImportDxfPhaseEZeroConnectPostSaveCrosswalkReadyReceiptV1['operation'];
  echoedSeam: StoredSeam;
  finalSeamKey: string;
  nextCommand: PatternImportDxfPhaseEZeroConnectOperationSeamKeyAttachCommandV1;
  claims: typeof PATTERN_IMPORT_DXF_PHASE_E_ZERO_CONNECT_POST_SAVE_SEAM_LINK_CLAIMS_V1;
}>;

export type PatternImportDxfPhaseEZeroConnectPostSaveSeamCompleteResultV1 =
  | Readonly<{
      ok: true;
      receipt: PatternImportDxfPhaseEZeroConnectPostSaveSeamFinalReceiptV1;
      blocker: null;
    }>
  | Readonly<{
      ok: false;
      receipt: null;
      blocker: PatternImportDxfPhaseEZeroConnectPostSaveSeamLinkBlockerV1;
    }>;

const STABLE_ID = /^[A-Za-z0-9][A-Za-z0-9._:/#-]{0,255}$/;
const SAVED_OPERATION_KEYS = Object.freeze(['historyKey', 'operationNumber', 'status']);
const DIRECTIONS: ReadonlySet<StoredSeamDirection> = new Set(['reversed', 'same', 'unknown']);

function record(value: unknown): value is Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function exactKeys(value: unknown, expected: readonly string[]): boolean {
  return (
    record(value) &&
    Object.keys(value).sort().join('\u0000') === [...expected].sort().join('\u0000')
  );
}

function blocked<
  T extends
    | PatternImportDxfPhaseEZeroConnectPostSaveSeamPrepareResultV1
    | PatternImportDxfPhaseEZeroConnectPostSaveSeamCompleteResultV1,
>(
  code: PatternImportDxfPhaseEZeroConnectPostSaveSeamLinkBlockerV1['code'],
  detail: string,
): Extract<T, { ok: false }> {
  return Object.freeze({
    ok: false as const,
    receipt: null,
    blocker: Object.freeze({ code, detail }),
  }) as Extract<T, { ok: false }>;
}

function savedOperationValid(
  receipt: PatternImportDxfPhaseEZeroConnectSavedDraftOperationReceiptV1,
): boolean {
  return (
    exactKeys(receipt, SAVED_OPERATION_KEYS) &&
    receipt.status === 'same-session-saved-draft-operation' &&
    STABLE_ID.test(receipt.historyKey ?? '') &&
    Number.isSafeInteger(receipt.operationNumber) &&
    receipt.operationNumber > 0
  );
}

function pairRangeSignature(row: StoredSeam): string {
  const side = (anchors: StoredSeam['sideA']) =>
    anchors
      .map((anchor) => `${anchor.piece}:${anchor.edgeHint}@${anchor.range[0]}-${anchor.range[1]}`)
      .sort()
      .join('+');
  return `${row.kind}|${[side(row.sideA), side(row.sideB)].sort().join('~')}`;
}

function echoedSemanticsMatch(expected: StoredSeam, echoed: StoredSeam): boolean {
  return (
    echoed.status === expected.status &&
    echoed.status === 'confirmed' &&
    echoed.source === expected.source &&
    echoed.source === 'manual' &&
    echoed.direction === expected.direction &&
    echoed.anchoredSize === expected.anchoredSize &&
    echoed.note === expected.note &&
    echoed.stale !== true &&
    pairRangeSignature(echoed) === pairRangeSignature(expected)
  );
}

/**
 * Revalidates current authority and geometry, then uses the existing manual seam constructor. The
 * returned command is data only: its caller must use the existing strict seam writer and provide
 * that writer's verified echo to the completion transition below.
 */
export function preparePatternImportDxfPhaseEZeroConnectPostSaveSeamLinkV1(
  input: PatternImportDxfPhaseEZeroConnectPostSaveSeamLinkInputV1,
): PatternImportDxfPhaseEZeroConnectPostSaveSeamPrepareResultV1 {
  try {
    if (
      !input ||
      !Array.isArray(input.geometry) ||
      typeof input.geometrySizeToken !== 'string' ||
      !input.geometrySizeToken ||
      typeof input.nameOf !== 'function' ||
      (input.grainDeg !== null && typeof input.grainDeg?.get !== 'function')
    )
      return blocked(
        'post-save-envelope-invalid',
        'Post-save seam linking requires current geometry and explicit rowFromHand name/grain context.',
      );
    if (!savedOperationValid(input.savedOperation))
      return blocked(
        'saved-operation-receipt-invalid',
        'A same-session save receipt with one positive positional operation number is required.',
      );
    if (
      input.savedOperation.historyKey !== input.candidate?.operation?.sessionOperationId ||
      input.candidate.operation.operationNumber !== 0 ||
      input.candidate.operation.authoringOperationId !== null
    )
      return blocked(
        'saved-operation-correlation-mismatch',
        'The saved operation receipt does not correlate to this session-only zero-connect candidate.',
      );
    if (!DIRECTIONS.has(input.direction))
      return blocked(
        'stored-seam-direction-invalid',
        'StoredSeam direction must be an explicit caller-owned reversed, same or unknown decision.',
      );

    const crosswalk = buildPatternImportDxfPhaseEZeroConnectStoredSeamCrosswalkV1({
      candidate: input.candidate,
      catalog: input.catalog,
      projection: input.projection,
      geometry: input.geometry,
      geometrySizeToken: input.geometrySizeToken,
      ...(input.toleranceMm === undefined ? {} : { toleranceMm: input.toleranceMm }),
    });
    if (!crosswalk.ok) return blocked(crosswalk.blocker.code, crosswalk.blocker.detail);

    const geometryByPiece = new Map(input.geometry.map((piece) => [piece.pieceKey, piece]));
    const storedSeam = rowFromHand(
      crosswalk.receipt.sides[0].parts,
      crosswalk.receipt.sides[1].parts,
      geometryByPiece,
      {
        pieces: input.geometry,
        grainDeg: input.grainDeg,
        nameOf: input.nameOf,
        size: input.geometrySizeToken,
      },
      { direction: input.direction, note: input.note },
    );
    if (!storedSeam)
      return blocked(
        'stored-seam-row-unavailable',
        'The admitted crosswalk could not produce one current rowFromHand StoredSeam.',
      );

    const operation = Object.freeze({
      historyKey: input.savedOperation.historyKey,
      operationNumber: input.savedOperation.operationNumber,
      durableOperationId: null,
    });
    const crosswalkReady = Object.freeze({
      status: 'post-save-crosswalk-ready' as const,
      operation,
      crosswalk: crosswalk.receipt,
    });
    const rows = Object.freeze([storedSeam]) as readonly [StoredSeam];
    return Object.freeze({
      ok: true as const,
      receipt: Object.freeze({
        schemaVersion: PATTERN_IMPORT_DXF_PHASE_E_ZERO_CONNECT_POST_SAVE_SEAM_LINK_V1,
        status: 'stored-seam-row-ready-strict-upsert-required' as const,
        crosswalkReady,
        storedSeam,
        nextCommand: Object.freeze({
          kind: 'strict-seam-upsert' as const,
          rows,
          requiredOutcome: 'verified-echo' as const,
          acceptSubmittedKeyAsFinal: false as const,
        }),
        claims: PATTERN_IMPORT_DXF_PHASE_E_ZERO_CONNECT_POST_SAVE_SEAM_LINK_CLAIMS_V1,
      }),
      blocker: null,
    });
  } catch {
    return blocked(
      'post-save-envelope-invalid',
      'The post-save seam-link envelope must be readable current data.',
    );
  }
}

/**
 * Accepts only the strict writer's single verified echoed seam. The submitted key is deliberately
 * ignored: `reuseKeys` or the server may have selected another final key for this geometric pair.
 */
export function completePatternImportDxfPhaseEZeroConnectPostSaveSeamLinkV1(
  prepared: PatternImportDxfPhaseEZeroConnectPostSaveSeamPreparedReceiptV1,
  strictReceipt: StrictSeamUpsertResult | null | undefined,
): PatternImportDxfPhaseEZeroConnectPostSaveSeamCompleteResultV1 {
  try {
    if (
      !prepared ||
      prepared.schemaVersion !== PATTERN_IMPORT_DXF_PHASE_E_ZERO_CONNECT_POST_SAVE_SEAM_LINK_V1 ||
      prepared.status !== 'stored-seam-row-ready-strict-upsert-required'
    )
      return blocked(
        'post-save-envelope-invalid',
        'A current prepared zero-connect seam-link receipt is required.',
      );
    if (!strictReceipt)
      return blocked(
        'strict-seam-receipt-required',
        'The existing operation cannot be linked before the strict seam writer returns a receipt.',
      );
    if (!strictReceipt.ok)
      return blocked(
        'strict-seam-write-refused',
        `Strict seam upsert did not produce a verified echo: ${strictReceipt.blocker.detail}`,
      );
    if (
      strictReceipt.outcome !== 'verified-echo' ||
      strictReceipt.rows.length !== 1 ||
      strictReceipt.seamKeys.length !== 1
    )
      return blocked(
        'strict-seam-receipt-mismatch',
        'Strict seam upsert must echo exactly one persisted seam row and one final key.',
      );
    const echoed = strictReceipt.rows[0]!;
    if (
      echoed.kind === 'pose' ||
      !STABLE_ID.test(echoed.seamKey ?? '') ||
      strictReceipt.seamKeys[0] !== echoed.seamKey ||
      !echoedSemanticsMatch(prepared.storedSeam, echoed)
    )
      return blocked(
        'strict-seam-receipt-mismatch',
        'The verified echo is not the same current StoredSeam semantics as the prepared row.',
      );

    const operation = prepared.crosswalkReady.operation;
    const nextCommand = Object.freeze({
      kind: 'attach-existing-operation-seam-key' as const,
      operationNumber: operation.operationNumber,
      historyKey: operation.historyKey,
      durableOperationId: null,
      seamKey: echoed.seamKey,
    });
    return Object.freeze({
      ok: true as const,
      receipt: Object.freeze({
        schemaVersion: PATTERN_IMPORT_DXF_PHASE_E_ZERO_CONNECT_POST_SAVE_SEAM_LINK_V1,
        status: 'final-echoed-seam-key-ready-for-operation-attach' as const,
        operation,
        echoedSeam: echoed,
        finalSeamKey: echoed.seamKey,
        nextCommand,
        claims: PATTERN_IMPORT_DXF_PHASE_E_ZERO_CONNECT_POST_SAVE_SEAM_LINK_CLAIMS_V1,
      }),
      blocker: null,
    });
  } catch {
    return blocked(
      'strict-seam-receipt-mismatch',
      'The strict seam receipt must be readable and correlate to the prepared row.',
    );
  }
}
