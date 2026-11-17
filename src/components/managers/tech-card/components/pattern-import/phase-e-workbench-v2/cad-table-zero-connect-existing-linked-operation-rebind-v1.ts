import type { common_TechCard } from 'api/proto-http/admin';
import type { PieceGeom } from 'lib/assembly-skeleton/types';
import {
  anchorToWire,
  fromWire,
  splitWire,
  type EdgeAnchor,
  type StoredRow,
  type StoredSeam,
} from 'lib/seams';

import { rowFromHand } from '../../assembly-seams/seam-actions';
import { rowExactAnchorSig } from '../../assembly-seams/seams-store';
import type { StrictSeamAcceptResult } from '../../assembly-seams/use-seam-decisions';
import type { PatternImportDxfPhaseELinkedN1ProfileChoiceV1 } from './cad-table-existing-linked-n1-finalize-v1';
import type { PatternImportDxfPhaseEZeroConnectAuthoringHandoffRequestV1 } from './cad-table-zero-connect-authoring-handoff-v1';
import { isPatternImportDxfPhaseECadTableZeroConnectAuthoringRequestV1 } from './cad-table-zero-connect-controller-v1';
import { buildPatternImportDxfPhaseEZeroConnectExactAnchorGeometryV1 } from './cad-table-zero-connect-exact-anchor-geometry-v1';
import { buildPatternImportDxfPhaseEZeroConnectStoredSeamCrosswalkV1 } from './cad-table-zero-connect-stored-seam-crosswalk-v1';

export const PATTERN_IMPORT_DXF_PHASE_E_ZERO_CONNECT_EXISTING_LINKED_N1_REBIND_V1 =
  'pattern-import-dxf-phase-e-zero-connect-existing-linked-n1-rebind/1' as const;

export const PATTERN_IMPORT_DXF_PHASE_E_ZERO_CONNECT_EXISTING_LINKED_N1_REBIND_CLAIMS_V1 =
  Object.freeze({
    exactSavedLinkedN1OperationRequired: true,
    sameExistingSeamKeyRequired: true,
    sameOrderedInputsRequired: true,
    sameSourceSizeRequired: true,
    existingStrictAcceptWriterReused: true,
    operationsAppended: false,
    operationsRemoved: false,
    operationsReordered: false,
  } as const);

const STABLE_ID = /^[A-Za-z0-9][A-Za-z0-9._:/#-]{0,255}$/;

type AnchorMetadata = Readonly<Pick<EdgeAnchor, 'layer' | 'placement'>>;

type OperationLike = Readonly<{
  historyKey?: string;
  operationNumber?: number;
  seamKeys?: readonly string[];
  inputKeys?: readonly string[];
}>;

export type PatternImportDxfPhaseEZeroConnectExistingLinkedN1TargetV1 = Readonly<{
  schemaVersion: typeof PATTERN_IMPORT_DXF_PHASE_E_ZERO_CONNECT_EXISTING_LINKED_N1_REBIND_V1;
  status: 'existing-linked-n1-target-current';
  techCardId: number;
  capturedCardLockVersion: number;
  historyKey: string;
  operationNumber: number;
  seamKey: string;
  orderedInputKeys: readonly [string, string];
  orderedRowKeys: readonly string[];
  originalSeamFingerprint: string;
  originalSeamKind: StoredSeam['kind'];
  originalSeamNote: string;
  originalAnchorMetadata: readonly [readonly AnchorMetadata[], readonly AnchorMetadata[]];
  operationsTopologyFingerprint: string;
  operationCount: number;
}>;

export type PatternImportDxfPhaseEZeroConnectExistingLinkedN1PendingV1 = Readonly<{
  schemaVersion: typeof PATTERN_IMPORT_DXF_PHASE_E_ZERO_CONNECT_EXISTING_LINKED_N1_REBIND_V1;
  status: 'existing-linked-n1-awaiting-direction-and-atomic-rebind';
  target: PatternImportDxfPhaseEZeroConnectExistingLinkedN1TargetV1;
  sourceSizeToken: string;
  request: PatternImportDxfPhaseEZeroConnectAuthoringHandoffRequestV1;
}>;

export type PatternImportDxfPhaseEZeroConnectExistingLinkedN1BlockerV1 = Readonly<{
  code:
    | 'existing-linked-n1-request-invalid'
    | 'existing-linked-n1-card-mismatch'
    | 'existing-linked-n1-writer-stale'
    | 'existing-linked-n1-selection-mismatch'
    | 'existing-linked-n1-operation-ambiguous'
    | 'existing-linked-n1-operation-not-n1'
    | 'existing-linked-n1-input-mismatch'
    | 'existing-linked-n1-seam-ambiguous'
    | 'existing-linked-n1-seam-row-mismatch'
    | 'existing-linked-n1-source-size-invalid'
    | 'existing-linked-n1-exact-geometry-unavailable'
    | 'existing-linked-n1-crosswalk-unavailable'
    | 'existing-linked-n1-row-unavailable'
    | 'existing-linked-n1-row-kind-mismatch'
    | 'existing-linked-n1-readback-mismatch'
    | 'existing-linked-n1-finalize-blocked';
  detail: string;
}>;

export type PatternImportDxfPhaseEZeroConnectExistingLinkedN1TargetResultV1 =
  | Readonly<{
      ok: true;
      target: PatternImportDxfPhaseEZeroConnectExistingLinkedN1TargetV1;
      blocker: null;
    }>
  | Readonly<{
      ok: false;
      target: null;
      blocker: PatternImportDxfPhaseEZeroConnectExistingLinkedN1BlockerV1;
    }>;

export type PatternImportDxfPhaseEZeroConnectExistingLinkedN1CaptureResultV1 =
  | Readonly<{
      ok: true;
      pending: PatternImportDxfPhaseEZeroConnectExistingLinkedN1PendingV1;
      operationIndex: number;
      blocker: null;
    }>
  | Readonly<{
      ok: false;
      pending: null;
      operationIndex: null;
      blocker: PatternImportDxfPhaseEZeroConnectExistingLinkedN1BlockerV1;
    }>;

export type PatternImportDxfPhaseEZeroConnectExistingLinkedN1PreparedV1 = Readonly<{
  schemaVersion: typeof PATTERN_IMPORT_DXF_PHASE_E_ZERO_CONNECT_EXISTING_LINKED_N1_REBIND_V1;
  status: 'existing-linked-n1-exact-row-ready';
  pending: PatternImportDxfPhaseEZeroConnectExistingLinkedN1PendingV1;
  storedSeam: StoredSeam;
}>;

export type PatternImportDxfPhaseEZeroConnectExistingLinkedN1PrepareResultV1 =
  | Readonly<{
      ok: true;
      receipt: PatternImportDxfPhaseEZeroConnectExistingLinkedN1PreparedV1;
      blocker: null;
    }>
  | Readonly<{
      ok: false;
      receipt: null;
      blocker: PatternImportDxfPhaseEZeroConnectExistingLinkedN1BlockerV1;
    }>;

export type PatternImportDxfPhaseEZeroConnectExistingLinkedN1ReadbackResultV1 =
  | Readonly<{
      ok: true;
      seamKey: string;
      operationNumber: number;
      cardLockVersion: number;
      blocker: null;
    }>
  | Readonly<{
      ok: false;
      seamKey: null;
      operationNumber: null;
      cardLockVersion: null;
      blocker: PatternImportDxfPhaseEZeroConnectExistingLinkedN1BlockerV1;
    }>;

export type PatternImportDxfPhaseEZeroConnectExistingLinkedN1OwnerResultV1 =
  | Readonly<{
      ok: true;
      status: 'existing-linked-n1-rebound-exact';
      durablePatternMetadata: boolean;
      historyKey: string;
      operationNumber: number;
      seamKey: string;
      blocker: null;
      claims: typeof PATTERN_IMPORT_DXF_PHASE_E_ZERO_CONNECT_EXISTING_LINKED_N1_REBIND_CLAIMS_V1;
    }>
  | Readonly<{
      ok: false;
      status: 'blocked';
      historyKey: string | null;
      operationNumber: number | null;
      seamKey: string | null;
      seamWriteConfirmed?: boolean;
      blocker: PatternImportDxfPhaseEZeroConnectExistingLinkedN1BlockerV1;
      claims: typeof PATTERN_IMPORT_DXF_PHASE_E_ZERO_CONNECT_EXISTING_LINKED_N1_REBIND_CLAIMS_V1;
    }>;

export type PatternImportDxfPhaseEZeroConnectExistingLinkedN1OwnerV1 =
  | Readonly<{
      status: 'available';
      rebind: (
        pending: PatternImportDxfPhaseEZeroConnectExistingLinkedN1PendingV1,
        direction: 'same' | 'reversed',
        profile?: PatternImportDxfPhaseELinkedN1ProfileChoiceV1,
      ) => Promise<PatternImportDxfPhaseEZeroConnectExistingLinkedN1OwnerResultV1>;
      cancel: (pending: PatternImportDxfPhaseEZeroConnectExistingLinkedN1PendingV1) => boolean;
    }>
  | Readonly<{
      status: 'unavailable';
      blocker: PatternImportDxfPhaseEZeroConnectExistingLinkedN1BlockerV1;
    }>;

function blockedTarget(
  code: PatternImportDxfPhaseEZeroConnectExistingLinkedN1BlockerV1['code'],
  detail: string,
): Extract<PatternImportDxfPhaseEZeroConnectExistingLinkedN1TargetResultV1, { ok: false }> {
  return Object.freeze({
    ok: false as const,
    target: null,
    blocker: Object.freeze({ code, detail }),
  });
}

function blockedCapture(
  code: PatternImportDxfPhaseEZeroConnectExistingLinkedN1BlockerV1['code'],
  detail: string,
): Extract<PatternImportDxfPhaseEZeroConnectExistingLinkedN1CaptureResultV1, { ok: false }> {
  return Object.freeze({
    ok: false as const,
    pending: null,
    operationIndex: null,
    blocker: Object.freeze({ code, detail }),
  });
}

function blockedPrepare(
  code: PatternImportDxfPhaseEZeroConnectExistingLinkedN1BlockerV1['code'],
  detail: string,
): Extract<PatternImportDxfPhaseEZeroConnectExistingLinkedN1PrepareResultV1, { ok: false }> {
  return Object.freeze({
    ok: false as const,
    receipt: null,
    blocker: Object.freeze({ code, detail }),
  });
}

function blockedReadback(
  code: PatternImportDxfPhaseEZeroConnectExistingLinkedN1BlockerV1['code'],
  detail: string,
): Extract<PatternImportDxfPhaseEZeroConnectExistingLinkedN1ReadbackResultV1, { ok: false }> {
  return Object.freeze({
    ok: false as const,
    seamKey: null,
    operationNumber: null,
    cardLockVersion: null,
    blocker: Object.freeze({ code, detail }),
  });
}

function exactStrings(actual: readonly string[] | undefined, expected: readonly string[]): boolean {
  return (
    Array.isArray(actual) &&
    actual.length === expected.length &&
    actual.every((value, index) => value === expected[index])
  );
}

function operationTopologyFingerprint(operations: readonly OperationLike[]): string {
  return JSON.stringify(
    operations.map((operation) => [
      operation.operationNumber ?? null,
      [...(operation.inputKeys ?? [])],
      [...(operation.seamKeys ?? [])],
    ]),
  );
}

function seamFingerprint(seam: StoredRow): string {
  return JSON.stringify([
    seam.seamKey,
    seam.status,
    seam.kind,
    seam.direction,
    seam.source,
    seam.sideA,
    seam.sideB,
    seam.anchoredSize,
    seam.note,
    Boolean(seam.stale),
  ]);
}

function anchorMetadata(anchors: readonly EdgeAnchor[]): readonly AnchorMetadata[] {
  return Object.freeze(
    anchors.map(({ layer, placement }) =>
      Object.freeze({
        ...(layer ? { layer } : {}),
        ...(placement ? { placement: Object.freeze({ ...placement }) } : {}),
      }),
    ),
  );
}

function sidePiece(seam: StoredSeam, side: 'sideA' | 'sideB'): string | null {
  const pieces = [...new Set(seam[side].map(({ piece }) => piece.trim()).filter(Boolean))];
  return pieces.length === 1 ? pieces[0]! : null;
}

export function resolvePatternImportDxfPhaseEZeroConnectExistingLinkedN1TargetV1(input: {
  techCardId: number | undefined;
  selectedIndex: number;
  liveOperations: readonly OperationLike[];
  savedCard: common_TechCard | null | undefined;
  currentRows: readonly StoredRow[];
  seamWriterCardId: number | undefined;
  seamWriterLockVersion: number | null | undefined;
}): PatternImportDxfPhaseEZeroConnectExistingLinkedN1TargetResultV1 {
  const techCardId = input.techCardId ?? 0;
  const cardLockVersion = input.savedCard?.lockVersion ?? -1;
  if (!Number.isSafeInteger(techCardId) || techCardId <= 0 || input.savedCard?.id !== techCardId)
    return blockedTarget(
      'existing-linked-n1-card-mismatch',
      'The selected operation does not belong to the current saved tech card.',
    );
  if (
    input.seamWriterCardId !== techCardId ||
    !Number.isSafeInteger(cardLockVersion) ||
    cardLockVersion < 0 ||
    input.seamWriterLockVersion !== cardLockVersion
  )
    return blockedTarget(
      'existing-linked-n1-writer-stale',
      'The saved card or seam writer moved before this existing connection was selected.',
    );

  const selected = input.liveOperations[input.selectedIndex];
  const operationNumber = selected?.operationNumber ?? 0;
  const historyKey = selected?.historyKey ?? '';
  if (
    !selected ||
    !Number.isSafeInteger(operationNumber) ||
    operationNumber <= 0 ||
    !STABLE_ID.test(historyKey)
  )
    return blockedTarget(
      'existing-linked-n1-selection-mismatch',
      'Select one saved Assembly Order operation before reconnecting exact edges.',
    );
  const liveMatches = input.liveOperations.filter(
    (operation) =>
      operation.operationNumber === operationNumber && operation.historyKey === historyKey,
  );
  const savedOperations = input.savedCard?.techCard?.operations ?? [];
  const savedMatches = savedOperations.filter(
    (operation) => operation.operationNumber === operationNumber,
  );
  if (liveMatches.length !== 1 || savedMatches.length !== 1)
    return blockedTarget(
      'existing-linked-n1-operation-ambiguous',
      'The saved Assembly Order operation identity is missing or ambiguous.',
    );
  const liveSeamKeys = selected.seamKeys ?? [];
  const savedSeamKeys = savedMatches[0]!.seamKeys ?? [];
  if (
    liveSeamKeys.length < 1 ||
    !exactStrings(liveSeamKeys, savedSeamKeys) ||
    new Set(liveSeamKeys).size !== liveSeamKeys.length ||
    liveSeamKeys.some((key) => !STABLE_ID.test(key))
  )
    return blockedTarget(
      'existing-linked-n1-operation-not-n1',
      'Exact reconnect requires one current saved operation with unchanged unique row keys.',
    );
  const orderedInputKeys = [...(selected.inputKeys ?? [])] as string[];
  if (
    orderedInputKeys.length !== 2 ||
    orderedInputKeys[0] === orderedInputKeys[1] ||
    orderedInputKeys.some((key) => !STABLE_ID.test(key)) ||
    !exactStrings(savedMatches[0]!.inputKeys, orderedInputKeys)
  )
    return blockedTarget(
      'existing-linked-n1-input-mismatch',
      'The selected saved operation must keep the same two distinct ordered piece inputs.',
    );

  const savedSplit = splitWire(input.savedCard?.seams);
  if (savedSplit.unreadable > 0)
    return blockedTarget(
      'existing-linked-n1-seam-ambiguous',
      'The current saved card contains an unreadable seam or placement row.',
    );
  const savedRows: StoredRow[] = [...savedSplit.seams, ...savedSplit.poses];
  const liveLinkedRows = liveSeamKeys.flatMap((key) =>
    input.currentRows.filter((row) => row.seamKey === key),
  );
  const savedLinkedRows = savedSeamKeys.flatMap((key) =>
    savedRows.filter((row) => row.seamKey === key),
  );
  if (
    liveLinkedRows.length !== liveSeamKeys.length ||
    savedLinkedRows.length !== savedSeamKeys.length
  )
    return blockedTarget(
      'existing-linked-n1-seam-ambiguous',
      'Every linked seam and placement key must resolve to one unique current saved row.',
    );
  const livePhysical = liveLinkedRows.filter((row): row is StoredSeam => row.kind !== 'pose');
  const savedPhysical = savedLinkedRows.filter((row): row is StoredSeam => row.kind !== 'pose');
  if (livePhysical.length !== 1 || savedPhysical.length !== 1)
    return blockedTarget(
      'existing-linked-n1-operation-not-n1',
      'Exact reconnect requires exactly one physical seam; placement rows are preserved separately.',
    );
  const liveSeam = livePhysical[0]!;
  const savedSeam = savedPhysical[0]!;
  const seamKey = savedSeam.seamKey;
  if (liveSeam.seamKey !== seamKey)
    return blockedTarget(
      'existing-linked-n1-seam-row-mismatch',
      'The live and saved physical seam keys differ.',
    );
  if (
    liveLinkedRows.some((row) => {
      const saved = savedLinkedRows.find(({ seamKey: key }) => key === row.seamKey);
      return !saved || seamFingerprint(row) !== seamFingerprint(saved);
    })
  )
    return blockedTarget(
      'existing-linked-n1-seam-row-mismatch',
      'A linked seam or placement row differs from its current saved row.',
    );
  if (seamFingerprint(liveSeam) !== seamFingerprint(savedSeam))
    return blockedTarget(
      'existing-linked-n1-seam-row-mismatch',
      'The live seam row differs from the current saved seam row.',
    );
  if (
    sidePiece(savedSeam, 'sideA') !== orderedInputKeys[0] ||
    sidePiece(savedSeam, 'sideB') !== orderedInputKeys[1]
  )
    return blockedTarget(
      'existing-linked-n1-seam-row-mismatch',
      'The saved seam sides do not exact-match the operation ordered piece inputs.',
    );

  return Object.freeze({
    ok: true as const,
    target: Object.freeze({
      schemaVersion: PATTERN_IMPORT_DXF_PHASE_E_ZERO_CONNECT_EXISTING_LINKED_N1_REBIND_V1,
      status: 'existing-linked-n1-target-current' as const,
      techCardId,
      capturedCardLockVersion: cardLockVersion,
      historyKey,
      operationNumber,
      seamKey,
      orderedInputKeys: Object.freeze([...orderedInputKeys]) as readonly [string, string],
      orderedRowKeys: Object.freeze([...savedSeamKeys]),
      originalSeamFingerprint: seamFingerprint(savedSeam),
      originalSeamKind: savedSeam.kind,
      originalSeamNote: savedSeam.note,
      originalAnchorMetadata: Object.freeze([
        anchorMetadata(savedSeam.sideA),
        anchorMetadata(savedSeam.sideB),
      ] as const),
      operationsTopologyFingerprint: operationTopologyFingerprint(savedOperations),
      operationCount: savedOperations.length,
    }),
    blocker: null,
  });
}

export function capturePatternImportDxfPhaseEZeroConnectExistingLinkedN1PendingV1(input: {
  request: PatternImportDxfPhaseEZeroConnectAuthoringHandoffRequestV1;
  techCardId: number | undefined;
  selectedIndex: number;
  liveOperations: readonly OperationLike[];
  savedCard: common_TechCard | null | undefined;
  currentRows: readonly StoredRow[];
  seamWriterCardId: number | undefined;
  seamWriterLockVersion: number | null | undefined;
}): PatternImportDxfPhaseEZeroConnectExistingLinkedN1CaptureResultV1 {
  if (!isPatternImportDxfPhaseECadTableZeroConnectAuthoringRequestV1(input.request))
    return blockedCapture(
      'existing-linked-n1-request-invalid',
      'The exact edge selection request is absent or stale.',
    );
  const target = resolvePatternImportDxfPhaseEZeroConnectExistingLinkedN1TargetV1(input);
  if (!target.ok) return blockedCapture(target.blocker.code, target.blocker.detail);
  const sourceSizeToken = input.request.catalog.sizeToken.trim();
  if (
    !sourceSizeToken ||
    input.request.projection.sizeToken !== sourceSizeToken ||
    input.request.authoringAuthority.row.techCardId !== target.target.techCardId ||
    input.request.authoringAuthority.row.cardLockVersion !== target.target.capturedCardLockVersion
  )
    return blockedCapture(
      'existing-linked-n1-source-size-invalid',
      'The selected exact edges must come from one current saved DXF size on this card.',
    );
  const candidateInputs = input.request.candidate.connection.sides.map(({ pieceLineKey }) =>
    pieceLineKey.trim(),
  );
  if (!exactStrings(candidateInputs, target.target.orderedInputKeys))
    return blockedCapture(
      'existing-linked-n1-input-mismatch',
      'Choose the two exact edges in the saved operation input order.',
    );
  return Object.freeze({
    ok: true as const,
    pending: Object.freeze({
      schemaVersion: PATTERN_IMPORT_DXF_PHASE_E_ZERO_CONNECT_EXISTING_LINKED_N1_REBIND_V1,
      status: 'existing-linked-n1-awaiting-direction-and-atomic-rebind' as const,
      target: target.target,
      sourceSizeToken,
      request: input.request,
    }),
    operationIndex: input.selectedIndex,
    blocker: null,
  });
}

export function revalidatePatternImportDxfPhaseEZeroConnectExistingLinkedN1PendingV1(
  pending: PatternImportDxfPhaseEZeroConnectExistingLinkedN1PendingV1,
  input: Parameters<typeof resolvePatternImportDxfPhaseEZeroConnectExistingLinkedN1TargetV1>[0],
): PatternImportDxfPhaseEZeroConnectExistingLinkedN1TargetResultV1 {
  const current = resolvePatternImportDxfPhaseEZeroConnectExistingLinkedN1TargetV1(input);
  if (!current.ok) return current;
  const left = pending.target;
  const right = current.target;
  if (
    left.techCardId !== right.techCardId ||
    left.capturedCardLockVersion !== right.capturedCardLockVersion ||
    left.historyKey !== right.historyKey ||
    left.operationNumber !== right.operationNumber ||
    left.seamKey !== right.seamKey ||
    !exactStrings(left.orderedInputKeys, right.orderedInputKeys) ||
    !exactStrings(left.orderedRowKeys, right.orderedRowKeys) ||
    left.originalSeamFingerprint !== right.originalSeamFingerprint ||
    left.operationsTopologyFingerprint !== right.operationsTopologyFingerprint ||
    pending.sourceSizeToken !== pending.request.catalog.sizeToken
  )
    return blockedTarget(
      'existing-linked-n1-selection-mismatch',
      'The selected saved operation, seam row or source size changed after the exact gesture.',
    );
  return current;
}

export function preparePatternImportDxfPhaseEZeroConnectExistingLinkedN1RebindV1(
  pending: PatternImportDxfPhaseEZeroConnectExistingLinkedN1PendingV1,
  direction: 'same' | 'reversed',
  context: Readonly<{
    nameOf: (pieceLineKey: string) => string;
    grainDeg: ReadonlyMap<string, number> | null;
  }>,
): PatternImportDxfPhaseEZeroConnectExistingLinkedN1PrepareResultV1 {
  const exactGeometry = buildPatternImportDxfPhaseEZeroConnectExactAnchorGeometryV1({
    candidate: pending.request.candidate,
    catalog: pending.request.catalog,
    projection: pending.request.projection,
  });
  if (!exactGeometry.ok)
    return blockedPrepare(
      'existing-linked-n1-exact-geometry-unavailable',
      exactGeometry.blocker.detail,
    );
  if (exactGeometry.geometry.geometrySizeToken !== pending.sourceSizeToken)
    return blockedPrepare(
      'existing-linked-n1-source-size-invalid',
      'Exact anchor geometry moved to another source size.',
    );
  const crosswalk = buildPatternImportDxfPhaseEZeroConnectStoredSeamCrosswalkV1({
    candidate: pending.request.candidate,
    catalog: pending.request.catalog,
    projection: pending.request.projection,
    geometry: exactGeometry.geometry.pieces,
    geometrySizeToken: exactGeometry.geometry.geometrySizeToken,
  });
  if (!crosswalk.ok)
    return blockedPrepare('existing-linked-n1-crosswalk-unavailable', crosswalk.blocker.detail);
  const geometryByPiece = new Map<string, PieceGeom>(
    exactGeometry.geometry.pieces.map((piece) => [piece.pieceKey, piece]),
  );
  const storedSeam = rowFromHand(
    crosswalk.receipt.sides[0].parts,
    crosswalk.receipt.sides[1].parts,
    geometryByPiece,
    {
      pieces: exactGeometry.geometry.pieces,
      grainDeg: context.grainDeg,
      nameOf: context.nameOf,
      size: pending.sourceSizeToken,
    },
    {
      direction,
      seamKey: pending.target.seamKey,
      note: pending.target.originalSeamNote,
    },
  );
  if (!storedSeam)
    return blockedPrepare(
      'existing-linked-n1-row-unavailable',
      'The exact selected edges could not be serialized as one stored seam row.',
    );
  if (
    storedSeam.seamKey !== pending.target.seamKey ||
    storedSeam.anchoredSize !== pending.sourceSizeToken ||
    storedSeam.kind !== pending.target.originalSeamKind ||
    storedSeam.sideA.length !== pending.target.originalAnchorMetadata[0].length ||
    storedSeam.sideB.length !== pending.target.originalAnchorMetadata[1].length ||
    sidePiece(storedSeam, 'sideA') !== pending.target.orderedInputKeys[0] ||
    sidePiece(storedSeam, 'sideB') !== pending.target.orderedInputKeys[1]
  )
    return blockedPrepare(
      'existing-linked-n1-row-kind-mismatch',
      'The exact gesture would change the saved seam identity, kind, source size or ordered pieces.',
    );
  return Object.freeze({
    ok: true as const,
    receipt: Object.freeze({
      schemaVersion: PATTERN_IMPORT_DXF_PHASE_E_ZERO_CONNECT_EXISTING_LINKED_N1_REBIND_V1,
      status: 'existing-linked-n1-exact-row-ready' as const,
      pending,
      storedSeam: {
        ...storedSeam,
        sideA: storedSeam.sideA.map((anchor, index) => ({
          ...anchor,
          ...pending.target.originalAnchorMetadata[0][index],
        })),
        sideB: storedSeam.sideB.map((anchor, index) => ({
          ...anchor,
          ...pending.target.originalAnchorMetadata[1][index],
        })),
      },
    }),
    blocker: null,
  });
}

function storedSemanticsMatch(expected: StoredSeam, actual: StoredSeam): boolean {
  return (
    expected.seamKey === actual.seamKey &&
    expected.status === actual.status &&
    expected.kind === actual.kind &&
    expected.direction === actual.direction &&
    expected.source === actual.source &&
    expected.anchoredSize === actual.anchoredSize &&
    expected.note === actual.note &&
    JSON.stringify(expected.sideA.map(anchorToWire)) ===
      JSON.stringify(actual.sideA.map(anchorToWire)) &&
    JSON.stringify(expected.sideB.map(anchorToWire)) ===
      JSON.stringify(actual.sideB.map(anchorToWire)) &&
    rowExactAnchorSig(expected) === rowExactAnchorSig(actual)
  );
}

export function verifyPatternImportDxfPhaseEZeroConnectExistingLinkedN1ReadbackV1(input: {
  pending: PatternImportDxfPhaseEZeroConnectExistingLinkedN1PendingV1;
  accepted: StrictSeamAcceptResult;
  expectedSeam: StoredSeam;
  freshCard: common_TechCard | null | undefined;
}): PatternImportDxfPhaseEZeroConnectExistingLinkedN1ReadbackResultV1 {
  const { pending, accepted, expectedSeam, freshCard } = input;
  const target = pending.target;
  const lockVersion = freshCard?.lockVersion ?? -1;
  const operations = freshCard?.techCard?.operations ?? [];
  const operationMatches = operations.filter(
    ({ operationNumber }) => operationNumber === target.operationNumber,
  );
  const storedMatches = (freshCard?.seams ?? [])
    .map((wire) => fromWire(wire))
    .filter((row): row is StoredSeam => row?.seamKey === target.seamKey);
  const stored = storedMatches.length === 1 ? storedMatches[0]! : null;
  if (
    freshCard?.id !== target.techCardId ||
    !Number.isSafeInteger(lockVersion) ||
    lockVersion <= target.capturedCardLockVersion ||
    (accepted.ok &&
      (accepted.seamKey !== target.seamKey || accepted.lockVersion !== lockVersion)) ||
    operationMatches.length !== 1 ||
    !exactStrings(operationMatches[0]!.inputKeys, target.orderedInputKeys) ||
    !exactStrings(operationMatches[0]!.seamKeys, target.orderedRowKeys) ||
    operations.length !== target.operationCount ||
    operationTopologyFingerprint(operations) !== target.operationsTopologyFingerprint ||
    !stored ||
    !storedSemanticsMatch(expectedSeam, stored)
  )
    return blockedReadback(
      'existing-linked-n1-readback-mismatch',
      'Fresh readback did not preserve the Assembly Order while replacing the same exact seam row.',
    );
  return Object.freeze({
    ok: true as const,
    seamKey: target.seamKey,
    operationNumber: target.operationNumber,
    cardLockVersion: lockVersion,
    blocker: null,
  });
}

type RetainedWrite = {
  direction: 'same' | 'reversed';
  promise: Promise<StrictSeamAcceptResult>;
  settled: boolean;
};

const writes = new WeakMap<
  PatternImportDxfPhaseEZeroConnectExistingLinkedN1PendingV1,
  RetainedWrite
>();

export function readPatternImportDxfPhaseEZeroConnectExistingLinkedN1WriteOnceV1(
  pending: PatternImportDxfPhaseEZeroConnectExistingLinkedN1PendingV1,
  direction: 'same' | 'reversed',
): Promise<StrictSeamAcceptResult> | null | undefined {
  const retained = writes.get(pending);
  if (!retained) return undefined;
  return retained.direction === direction ? retained.promise : null;
}

export function canReleasePatternImportDxfPhaseEZeroConnectExistingLinkedN1V1(
  pending: PatternImportDxfPhaseEZeroConnectExistingLinkedN1PendingV1,
): boolean {
  return writes.get(pending)?.settled !== false;
}

export function executePatternImportDxfPhaseEZeroConnectExistingLinkedN1WriteOnceV1(
  pending: PatternImportDxfPhaseEZeroConnectExistingLinkedN1PendingV1,
  direction: 'same' | 'reversed',
  write: () => Promise<StrictSeamAcceptResult>,
): Promise<StrictSeamAcceptResult> | null {
  const retained = writes.get(pending);
  if (retained) return retained.direction === direction ? retained.promise : null;
  const promise = Promise.resolve().then(write);
  const entry = { direction, promise, settled: false };
  writes.set(pending, entry);
  void promise.then(
    (result) => {
      entry.settled = true;
      if (!result.ok && result.outcome === 'not-attempted' && writes.get(pending) === entry)
        writes.delete(pending);
    },
    () => {
      entry.settled = true;
    },
  );
  return promise;
}
