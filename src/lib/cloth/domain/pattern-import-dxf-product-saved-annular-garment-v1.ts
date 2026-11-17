import type { ClothBoundarySample, ClothMeshIR } from '../mesh/cloth-mesh-ir';
import {
  DXF_PRODUCT_TWO_PANEL_SKIRT_ANNULAR_AUTHORED_FRAME_MAPPING_V1,
  mapDxfProductTwoPanelSkirtAnnularToAuthoredFrameV1,
} from './dxf-product-two-panel-skirt-annular-authored-frame-mapping-v1';
import {
  DXF_PRODUCT_TWO_PANEL_SKIRT_CANONICAL_MEDIUM_SELF_ORIENTATION_REQUEST_V2,
  buildDxfProductTwoPanelSkirtCanonicalMediumSelfOrientationV2,
  disposeDxfProductTwoPanelSkirtCanonicalMediumSelfOrientationV2,
  projectDxfProductTwoPanelSkirtCanonicalMediumSelfOrientationV2,
  type DxfProductTwoPanelSkirtCanonicalMediumMappingSpecV2,
  type DxfProductTwoPanelSkirtCanonicalMediumSelfOrientationOwnerV2,
  type DxfProductTwoPanelSkirtCanonicalMediumSelfOrientationProjectionV2,
  type DxfProductTwoPanelSkirtCanonicalMediumSelfOrientationReportV2,
} from './dxf-product-two-panel-skirt-canonical-medium-self-orientation-v2';
import {
  DXF_PRODUCT_TWO_PANEL_SKIRT_CANONICAL_MEDIUM_NORMALIZED_V5_SOLVER_BRIDGE_REQUEST_V1,
  buildDxfProductTwoPanelSkirtCanonicalMediumNormalizedV5SolverBridgeV1,
  disposeDxfProductTwoPanelSkirtCanonicalMediumNormalizedV5SolverBridgeV1,
  projectDxfProductTwoPanelSkirtCanonicalMediumNormalizedV5SolverBridgeV1,
  type DxfProductTwoPanelSkirtCanonicalMediumNormalizedV5SolverBridgeOwnerV1,
  type DxfProductTwoPanelSkirtCanonicalMediumNormalizedV5SolverBridgeProjectionV1,
  type DxfProductTwoPanelSkirtCanonicalMediumNormalizedV5SolverBridgeReportV1,
} from './dxf-product-two-panel-skirt-canonical-medium-normalized-v5-solver-bridge-v1';
import {
  DXF_PRODUCT_TWO_PANEL_SKIRT_PLACEMENT_SEMANTICS_REQUEST_V1,
  buildDxfProductTwoPanelSkirtPlacementSemanticsV1,
  disposeDxfProductTwoPanelSkirtPlacementSemanticsV1,
  projectDxfProductTwoPanelSkirtPlacementSemanticsV1,
  type DxfProductTwoPanelSkirtPlacementSemanticsOwnerV1,
} from './dxf-product-two-panel-skirt-placement-semantics-v1';
import {
  projectPatternImportDxfProductGarmentMeshComposerV2,
  type PatternImportDxfProductGarmentMeshComposerOwnerV2,
  type PatternImportDxfProductGarmentMeshComposerProjectionV2,
} from './pattern-import-dxf-product-garment-mesh-composer-v2';
import {
  buildPatternImportDxfProductMultiseamMappingCompositionV2,
  type PatternImportDxfProductMultiseamMappingCompositionRequestV2,
} from './pattern-import-dxf-product-multiseam-mapping-composition-v2';
import {
  isPatternImportDxfProductMultiseamPlacementSidecarVerifiedReadOwnerV2,
  type PatternImportDxfProductMultiseamPlacementSidecarVerifiedReadOwnerV2,
} from './pattern-import-dxf-product-multiseam-placement-sidecar-read-v2';
import type { PatternImportDxfProductSavedAnnularWriterFrameReceiptV2 } from './pattern-import-dxf-product-saved-annular-local-frame-preflight-v2';
import {
  projectPatternImportDxfProductSavedLocalFrameGarmentMeshComposerV2,
  type PatternImportDxfProductSavedLocalFrameGarmentMeshComposerOwnerV2,
  type PatternImportDxfProductSavedLocalFrameGarmentMeshComposerProjectionV2,
} from './pattern-import-dxf-product-saved-local-frame-garment-mesh-composer-v2';

import {
  DXF_PRODUCT_TWO_PANEL_SKIRT_GARMENT_SEMANTICS_REQUEST_V1,
  buildDxfProductTwoPanelSkirtGarmentSemanticsV1,
  disposeDxfProductTwoPanelSkirtGarmentSemanticsV1,
  projectDxfProductTwoPanelSkirtGarmentSemanticsV1,
  type DxfProductTwoPanelSkirtGarmentSemanticsOwnerV1,
} from './dxf-product-two-panel-skirt-garment-semantics-v1';
import {
  isPatternImportDxfProductMultiseamPlacementSidecarVerifiedReadOwnerV3,
  type PatternImportDxfProductMultiseamPlacementSidecarVerifiedReadOwnerV3,
} from './pattern-import-dxf-product-multiseam-placement-sidecar-read-v3';

export const PATTERN_IMPORT_DXF_PRODUCT_SAVED_ANNULAR_GARMENT_V1 =
  'pattern-import-dxf-product-saved-annular-garment/1' as const;

export const PATTERN_IMPORT_DXF_PRODUCT_SAVED_ANNULAR_OBSERVED_PLACEMENT_GARMENT_V1 =
  'pattern-import-dxf-product-saved-annular-observed-placement-garment/1' as const;
type LegacyPlacement = PatternImportDxfProductMultiseamPlacementSidecarVerifiedReadOwnerV2;
type ObservedPlacement = PatternImportDxfProductMultiseamPlacementSidecarVerifiedReadOwnerV3;
type Placement = LegacyPlacement | ObservedPlacement;
type SourceKind = 'legacy' | 'observed';
type SelfOwner = DxfProductTwoPanelSkirtCanonicalMediumSelfOrientationOwnerV2;
type MaterialOwner = DxfProductTwoPanelSkirtCanonicalMediumNormalizedV5SolverBridgeOwnerV1;
type LocalProjection = PatternImportDxfProductSavedLocalFrameGarmentMeshComposerProjectionV2;

export type PatternImportDxfProductSavedAnnularGarmentRequestV1 = Readonly<{
  schemaVersion: typeof PATTERN_IMPORT_DXF_PRODUCT_SAVED_ANNULAR_GARMENT_V1;
  composerV2Owner: PatternImportDxfProductGarmentMeshComposerOwnerV2;
  savedLocalFrameOwner: PatternImportDxfProductSavedLocalFrameGarmentMeshComposerOwnerV2;
  compositionRequest: PatternImportDxfProductMultiseamMappingCompositionRequestV2;
  writerFrameReceipt: PatternImportDxfProductSavedAnnularWriterFrameReceiptV2;
  /** Invoke the existing fresh sidecar reader. A remembered DTO is not a fresh read. */
  readCurrentPlacement: (signal?: AbortSignal) => Promise<LegacyPlacement | null>;
}>;

const CLAIMS = Object.freeze({
  genuineSavedLocalFrameBound: true,
  verifiedPersistedPlacementConsumed: true,
  exactD0BoundaryRolesValidated: true,
  waistPinsFromExplicitRolesOnly: true,
  kernelPinsUsedForEqualityCheckOnly: true,
  bodyIndependentMapping: true,
  geometryInferenceAsTopologyAuthority: false,
  bodyTargetConsumed: false,
  bodyAdmissionAuthority: false,
  worldPlacementAuthority: false,
  runtimeAuthority: false,
  persistenceAuthority: false,
  sourceAuthenticityAccepted: false,
} as const);

export type PatternImportDxfProductSavedAnnularGarmentReportV1 = Readonly<{
  schemaVersion: typeof PATTERN_IMPORT_DXF_PRODUCT_SAVED_ANNULAR_GARMENT_V1;
  status: 'garment-local-diagnostic-complete';
  decision: 'garment-local-material-qualified' | 'garment-local-physical-blocked';
  bindings: Readonly<{
    composerV2CanonicalSha256: string;
    savedLocalFrameCanonicalSha256: string;
    composerV3CanonicalSha256: string;
    writerFrameReceiptCanonicalSha256: string;
    placementSidecarSha256: string;
    selectedGeometrySha256: string;
    semanticsCanonicalSha256: string;
  }>;
  /** The persisted A-target is historical intent, never admission of a selected V9 body. */
  persistedPlacement: Readonly<{
    bindings: LegacyPlacement['document']['bindings'];
    authoring: LegacyPlacement['placementAuthoring'];
  }>;
  mappingFrame: 'garment-local-waist-origin';
  mappingSpec: DxfProductTwoPanelSkirtCanonicalMediumMappingSpecV2;
  maximumDiscreteChordRelativeError: number;
  selfOrientation: DxfProductTwoPanelSkirtCanonicalMediumSelfOrientationReportV2;
  normalizedMaterial: DxfProductTwoPanelSkirtCanonicalMediumNormalizedV5SolverBridgeReportV1 | null;
  materialBlocker: Readonly<{ code: string; detail: string }> | null;
  claims: typeof CLAIMS;
  canonicalSha256: string;
}>;

declare const garmentBrand: unique symbol;
export type PatternImportDxfProductSavedAnnularGarmentOwnerV1 = Readonly<{
  schemaVersion: typeof PATTERN_IMPORT_DXF_PRODUCT_SAVED_ANNULAR_GARMENT_V1;
  report: PatternImportDxfProductSavedAnnularGarmentReportV1;
  readonly [garmentBrand]: never;
}>;
export type PatternImportDxfProductSavedAnnularGarmentProjectionV1 = Readonly<{
  report: PatternImportDxfProductSavedAnnularGarmentReportV1;
  mapping: DxfProductTwoPanelSkirtCanonicalMediumSelfOrientationProjectionV2;
  normalizedMaterial: DxfProductTwoPanelSkirtCanonicalMediumNormalizedV5SolverBridgeProjectionV1 | null;
  callerOwnedMutableCopies: true;
  claims: typeof CLAIMS;
}>;
export type PatternImportDxfProductSavedAnnularObservedPlacementGarmentRequestV1 = Omit<
  PatternImportDxfProductSavedAnnularGarmentRequestV1,
  'schemaVersion' | 'readCurrentPlacement'
> &
  Readonly<{
    schemaVersion: typeof PATTERN_IMPORT_DXF_PRODUCT_SAVED_ANNULAR_OBSERVED_PLACEMENT_GARMENT_V1;
    readCurrentPlacement: (signal?: AbortSignal) => Promise<ObservedPlacement | null>;
  }>;
export type PatternImportDxfProductSavedAnnularObservedPlacementGarmentReportV1 = Omit<
  PatternImportDxfProductSavedAnnularGarmentReportV1,
  'schemaVersion' | 'persistedPlacement'
> &
  Readonly<{
    schemaVersion: typeof PATTERN_IMPORT_DXF_PRODUCT_SAVED_ANNULAR_OBSERVED_PLACEMENT_GARMENT_V1;
    /** Actual V3 target is retained as intent; this garment owner does not admit any body. */
    persistedPlacement: Readonly<{
      bindings: ObservedPlacement['document']['bindings'];
      authoring: ObservedPlacement['placementAuthoring'];
    }>;
  }>;
declare const observedGarmentBrand: unique symbol;
export type PatternImportDxfProductSavedAnnularObservedPlacementGarmentOwnerV1 = Readonly<{
  schemaVersion: typeof PATTERN_IMPORT_DXF_PRODUCT_SAVED_ANNULAR_OBSERVED_PLACEMENT_GARMENT_V1;
  report: PatternImportDxfProductSavedAnnularObservedPlacementGarmentReportV1;
  readonly [observedGarmentBrand]: never;
}>;
export type PatternImportDxfProductSavedAnnularObservedPlacementGarmentProjectionV1 = Omit<
  PatternImportDxfProductSavedAnnularGarmentProjectionV1,
  'report'
> &
  Readonly<{ report: PatternImportDxfProductSavedAnnularObservedPlacementGarmentReportV1 }>;
export type PatternImportDxfProductSavedAnnularObservedPlacementGarmentResultV1 =
  | Readonly<{
      ok: true;
      owner: PatternImportDxfProductSavedAnnularObservedPlacementGarmentOwnerV1;
      report: PatternImportDxfProductSavedAnnularObservedPlacementGarmentReportV1;
    }>
  | Extract<PatternImportDxfProductSavedAnnularGarmentResultV1, { ok: false }>;
type Request =
  | PatternImportDxfProductSavedAnnularGarmentRequestV1
  | PatternImportDxfProductSavedAnnularObservedPlacementGarmentRequestV1;
type Owner =
  | PatternImportDxfProductSavedAnnularGarmentOwnerV1
  | PatternImportDxfProductSavedAnnularObservedPlacementGarmentOwnerV1;
type Report =
  | PatternImportDxfProductSavedAnnularGarmentReportV1
  | PatternImportDxfProductSavedAnnularObservedPlacementGarmentReportV1;
type Projection = Omit<PatternImportDxfProductSavedAnnularGarmentProjectionV1, 'report'> &
  Readonly<{ report: Report }>;
type Result =
  | Readonly<{ ok: true; owner: Owner; report: Report }>
  | Extract<PatternImportDxfProductSavedAnnularGarmentResultV1, { ok: false }>;

type Code =
  | 'invalid-input'
  | 'cancelled'
  | 'source-owner-unavailable'
  | 'source-binding-mismatch'
  | 'placement-read-blocked'
  | 'placement-binding-mismatch'
  | 'composition-rebuild-blocked'
  | 'receipt-binding-mismatch'
  | 'explicit-semantics-blocked'
  | 'annular-profile-incompatible'
  | 'boundary-provenance-mismatch'
  | 'explicit-pin-mismatch'
  | 'mapping-blocked'
  | 'self-orientation-blocked';
export type PatternImportDxfProductSavedAnnularGarmentResultV1 =
  | Readonly<{
      ok: true;
      owner: PatternImportDxfProductSavedAnnularGarmentOwnerV1;
      report: PatternImportDxfProductSavedAnnularGarmentReportV1;
    }>
  | Readonly<{ ok: false; owner: null; code: Code; detail: string }>;

type Sources = Readonly<{
  v2: PatternImportDxfProductGarmentMeshComposerProjectionV2;
  local: LocalProjection;
}>;
type RecordV1 = {
  request: Request;
  kind: SourceKind;
  v2Sha: string;
  localSha: string;
  placementSha: string;
  controller: AbortController;
  unlink: () => void;
  selfOwner: SelfOwner;
  materialOwner: MaterialOwner | null;
  owner: Owner;
};
const owners = new WeakMap<object, RecordV1>();
const encoder = new TextEncoder();
const subtle = globalThis.crypto?.subtle;
const digest = subtle?.digest.bind(subtle);

class Failure extends Error {
  constructor(
    readonly code: Code,
    detail: string,
  ) {
    super(detail);
  }
}
function fail(code: Code, detail: string): never {
  throw new Failure(code, detail);
}
function signalCheck(signal?: AbortSignal): void {
  if (signal?.aborted) fail('cancelled', 'Garment source lifetime was cancelled.');
}
function freezePlain<T>(value: T): T {
  if (value && typeof value === 'object') {
    for (const entry of Object.values(value)) freezePlain(entry);
    Object.freeze(value);
  }
  return value;
}

/** Own plain data only; prevents getter execution and detaches inputs before the first await. */
function plainCopy<T>(value: T): T {
  let nodes = 0;
  const visit = (item: unknown, depth: number): unknown => {
    if (++nodes > 1_000_000 || depth > 96)
      fail('invalid-input', 'Plain input exceeds the bounded tree.');
    if (item === null || item === undefined || typeof item === 'boolean') return item;
    if (typeof item === 'string') {
      if (item.length > 8_000_000) fail('invalid-input', 'Plain input string is too large.');
      return item;
    }
    if (typeof item === 'number' && Number.isFinite(item)) return item;
    if (!item || typeof item !== 'object')
      fail('invalid-input', 'Plain input contains unsupported data.');
    const array = Array.isArray(item);
    const prototype = Object.getPrototypeOf(item);
    if (
      prototype !== (array ? Array.prototype : Object.prototype) &&
      !(prototype === null && !array)
    )
      fail('invalid-input', 'Plain input has a foreign prototype.');
    const descriptors = Object.getOwnPropertyDescriptors(item);
    const keys = Reflect.ownKeys(descriptors).filter((key) => !(array && key === 'length'));
    const result: Record<string, unknown> = {};
    const values: unknown[] = [];
    if (
      array &&
      (keys.length !== descriptors.length?.value ||
        keys.some((key, index) => key !== String(index)))
    )
      fail('invalid-input', 'Plain arrays must be dense.');
    for (const key of keys) {
      if (typeof key !== 'string') fail('invalid-input', 'Plain input contains a symbol.');
      const descriptor = descriptors[key]!;
      if (!descriptor.enumerable || !('value' in descriptor))
        fail('invalid-input', 'Plain input contains an accessor or hidden field.');
      const copied = visit(descriptor.value, depth + 1);
      if (array) values.push(copied);
      else
        Object.defineProperty(result, key, {
          value: copied,
          enumerable: true,
          writable: true,
          configurable: true,
        });
    }
    return array ? values : result;
  };
  return visit(value, 0) as T;
}
function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  if (value && typeof value === 'object')
    return `{${Object.keys(value)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${canonical((value as Record<string, unknown>)[key])}`)
      .join(',')}}`;
  const encoded = JSON.stringify(value);
  if (encoded === undefined) fail('invalid-input', 'Canonical data contains undefined.');
  return encoded;
}
async function hash(domain: string, value: unknown): Promise<string> {
  if (!digest) fail('invalid-input', 'Native SHA-256 is unavailable.');
  const bytes = new Uint8Array(
    await digest('SHA-256', encoder.encode(`${domain}\0${canonical(value)}`)),
  );
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');
}
function same(a: unknown, b: unknown): boolean {
  return canonical(a) === canonical(b);
}
function input(value: unknown, kind: SourceKind): Request {
  const schemaVersion =
    kind === 'legacy'
      ? PATTERN_IMPORT_DXF_PRODUCT_SAVED_ANNULAR_GARMENT_V1
      : PATTERN_IMPORT_DXF_PRODUCT_SAVED_ANNULAR_OBSERVED_PLACEMENT_GARMENT_V1;
  if (!value || typeof value !== 'object')
    fail('invalid-input', 'An exact request record is required.');
  const descriptors = Object.getOwnPropertyDescriptors(value);
  const keys = [
    'schemaVersion',
    'composerV2Owner',
    'savedLocalFrameOwner',
    'compositionRequest',
    'writerFrameReceipt',
    'readCurrentPlacement',
  ];
  if (
    Reflect.ownKeys(descriptors).length !== keys.length ||
    keys.some((key) => !descriptors[key]?.enumerable || !('value' in descriptors[key]!))
  )
    fail('invalid-input', 'The garment request requires exact own data fields.');
  if (
    descriptors.schemaVersion!.value !== schemaVersion ||
    typeof descriptors.readCurrentPlacement!.value !== 'function'
  )
    fail('invalid-input', 'The garment schema or fresh placement reader is invalid.');
  return {
    schemaVersion,
    composerV2Owner: descriptors.composerV2Owner!.value,
    savedLocalFrameOwner: descriptors.savedLocalFrameOwner!.value,
    compositionRequest: plainCopy(descriptors.compositionRequest!.value),
    writerFrameReceipt: plainCopy(descriptors.writerFrameReceipt!.value),
    readCurrentPlacement: descriptors.readCurrentPlacement!.value,
  } as Request;
}
function current(
  request: Request,
  signal: AbortSignal,
  expected?: Readonly<{ v2Sha: string; localSha: string }>,
): Sources {
  signalCheck(signal);
  const v2 = projectPatternImportDxfProductGarmentMeshComposerV2(request.composerV2Owner);
  const local = projectPatternImportDxfProductSavedLocalFrameGarmentMeshComposerV2(
    request.savedLocalFrameOwner,
  );
  if (!v2 || !local)
    fail('source-owner-unavailable', 'Both genuine saved source owners must remain live.');
  const snapshot = request.composerV2Owner.snapshot;
  if (
    snapshot.origin !== 'verified-saved-row' ||
    v2.composerCanonicalSha256 !== snapshot.seal.canonicalSha256 ||
    local.snapshot.bindings.composerV2CanonicalSha256 !== v2.composerCanonicalSha256 ||
    local.composerV3.phase2ArtifactSha256 !== v2.phase2ArtifactSha256 ||
    (expected &&
      (expected.v2Sha !== v2.composerCanonicalSha256 ||
        expected.localSha !== local.snapshot.seal.canonicalSha256))
  )
    fail('source-binding-mismatch', 'Saved V2 and local-frame V3 bindings differ.');
  signalCheck(signal);
  return { v2, local };
}
async function freshPlacement(
  request: Request,
  signal: AbortSignal,
  expected?: string,
): Promise<Placement> {
  signalCheck(signal);
  let placement: unknown;
  try {
    placement = await request.readCurrentPlacement(signal);
  } catch (error) {
    signalCheck(signal);
    fail(
      'placement-read-blocked',
      error instanceof Error ? error.message : 'Fresh placement read failed.',
    );
  }
  signalCheck(signal);
  if (request.schemaVersion === PATTERN_IMPORT_DXF_PRODUCT_SAVED_ANNULAR_GARMENT_V1) {
    if (!isPatternImportDxfProductMultiseamPlacementSidecarVerifiedReadOwnerV2(placement))
      fail('placement-read-blocked', 'A fresh genuine Placement V2 read owner is required.');
  } else if (!isPatternImportDxfProductMultiseamPlacementSidecarVerifiedReadOwnerV3(placement))
    fail('placement-read-blocked', 'A fresh genuine Placement V3 read owner is required.');
  const verified = placement as Placement;
  if (expected && verified.seal.canonicalSha256 !== expected)
    fail('placement-binding-mismatch', 'Persisted placement changed during the garment lifetime.');
  return verified;
}
function bindPlacement(
  placement: Placement,
  request: Request,
  selectedGeometrySha256: string,
): void {
  const { row, source, topology } = placement.document.bindings;
  const snapshot = request.composerV2Owner.snapshot;
  const expectedSource = {
    sourceFileSha256: snapshot.seals.sourceFileSha256,
    writerExportSha256: snapshot.seals.productExportSha256,
    handoffSourceAggregateSha256: snapshot.seals.handoffSourceAggregateSha256,
    selectedGeometrySha256,
    sizeSelectionSha256: snapshot.seals.sizeSelectionSha256,
    catalogCanonicalSha256: snapshot.seals.catalogCanonicalSha256,
    proposalFingerprint: snapshot.seals.proposalFingerprint,
    phaseEPlanSha256: snapshot.seals.phaseEPlanSha256,
    mappingCompositionSha256: snapshot.seals.compositionCanonicalSha256,
    handoffCanonicalSha256: snapshot.seals.handoffCanonicalSha256,
    aggregateCanonicalSha256: snapshot.seals.aggregateCanonicalSha256,
    phase2ArtifactSha256: snapshot.seals.phase2ArtifactSha256,
  };
  const assembly = snapshot.assembly;
  const lineKeys = assembly.pieceIds.map(
    (pieceId) =>
      request.compositionRequest.catalog.pieces.find((piece) => piece.pieceId === pieceId)
        ?.pieceLineKey,
  );
  if (
    row.techCardId !== snapshot.row.techCardId ||
    row.scopeKey !== snapshot.row.scopeKey ||
    row.patternLineKey !== snapshot.row.patternLineKey ||
    row.revision !== snapshot.row.patternVersion ||
    row.cardLockVersion !== snapshot.row.cardLockVersion ||
    row.dxfSha256 !== snapshot.row.dxfSha256 ||
    !same(source, expectedSource) ||
    topology.documentId !== assembly.documentId ||
    topology.revision !== assembly.revision ||
    topology.sourceOperationNumber !== assembly.sourceOperationNumber ||
    topology.localOperationOrder !== assembly.localOperationOrder ||
    !same(topology.pieceIds, assembly.pieceIds) ||
    !same(topology.seamIds, assembly.seamIds) ||
    !same(topology.seamKeys, assembly.seamIds) ||
    !same(topology.pieceLineKeys, lineKeys) ||
    placement.placementAuthoring.authoredOrigin !== 'verified-saved-row' ||
    placement.placementAuthoring.authoredImportGeneration !== snapshot.row.importGeneration
  )
    fail(
      'placement-binding-mismatch',
      'Persisted placement differs from the exact saved row, source or two-seam Assembly Order.',
    );
}
function mappingSpec(
  placement: Placement,
  receipt: PatternImportDxfProductSavedAnnularWriterFrameReceiptV2,
  local: LocalProjection,
): DxfProductTwoPanelSkirtCanonicalMediumMappingSpecV2 {
  const { garment } = placement.placementAuthoring.semantics;
  const parameters = placement.placementAuthoring.annular.parameters;
  if (
    garment.frontPieceId !== 'FRONT' ||
    garment.backPieceId !== 'BACK' ||
    garment.circumferentialOrder.direction !== 'clockwise-seen-from-above' ||
    !same(garment.circumferentialOrder.pieceIds, ['FRONT', 'BACK']) ||
    parameters.seamAnchor.seamId !== garment.leftSeamId ||
    parameters.seamAnchor.bodyAngleRad !== 0 ||
    parameters.acceptance.parameterResidualMm !== 0.01 ||
    parameters.acceptance.parameterResidualRad !== 0.000001
  )
    fail(
      'annular-profile-incompatible',
      'Only the explicitly authored qualified two-panel annular profile is supported.',
    );
  const piece = (pieceId: 'FRONT' | 'BACK', mirror: 1 | -1, angular: 1 | -1) => {
    const authored = parameters.pieces.find((entry) => entry.pieceId === pieceId);
    const source = receipt.pieces.find((entry) => entry.pieceId === pieceId);
    const written = local.localFramePreflight.pieces.find((entry) => entry.pieceId === pieceId);
    const roles = garment.boundaries.find((entry) => entry.pieceId === pieceId);
    if (
      !authored ||
      !source ||
      !written ||
      !roles ||
      !same(authored.planarApexMm, [0, 0]) ||
      !same(authored.planarApexMm, source.sourceApexMm) ||
      !same(authored.planarStartRayUnit2, [mirror * Math.cos(0.64), mirror * Math.sin(0.64)]) ||
      authored.planarAngularDirection !== -1 ||
      authored.planarStartSeamId !== garment.leftSeamId ||
      authored.waistSlantRadiusMm !== 700 ||
      authored.hemSlantRadiusMm !== 900 ||
      authored.sectorSpanRad !== 0.64 ||
      roles.waist.sourceCurveIds.length !== 40 ||
      roles.hem.sourceCurveIds.length !== 50 ||
      roles.leftSeam.sourceCurveIds.length !== 1 ||
      roles.rightSeam.sourceCurveIds.length !== 1
    )
      fail(
        'annular-profile-incompatible',
        'Persisted annular parameters, receipt or exact role partition differs from the qualified profile.',
      );
    return {
      pieceId,
      planarApexMm: written.writtenApexMm,
      planarMirrorSign: mirror,
      bodyAngularSign: angular,
    };
  };
  return freezePlain({
    pieces: [piece('FRONT', 1, -1), piece('BACK', -1, 1)],
    waistSlantRadiusMm: 700,
    hemSlantRadiusMm: 900,
    sectorSpanRadPerPiece: 0.64,
    waistCenterM: [0, 0, 0],
    seamAnchorAngleRad: 0,
    parameterResidualMm: 0.01,
    parameterResidualRad: 0.000001,
  });
}
function boundaryKey(sample: ClothBoundarySample): string {
  // Coordinates cannot disambiguate this identity or select a role/target vertex.
  return JSON.stringify([
    sample.pieceId,
    sample.contourId,
    sample.sourceCurveId,
    sample.sourceCurveT,
    sample.normalizedArc,
  ]);
}
function explicitPins(
  v2: Sources['v2'],
  local: LocalProjection,
  garment: Placement['placementAuthoring']['semantics']['garment'],
): Uint32Array {
  const v3 = local.composerV3;
  const keyed = new Map<string, number>();
  for (const sample of v3.mesh.boundarySamples) {
    const key = boundaryKey(sample);
    if (keyed.has(key) && keyed.get(key) !== sample.vertexIndex)
      fail('boundary-provenance-mismatch', 'V3 provenance is not unique.');
    keyed.set(key, sample.vertexIndex);
  }
  const remap = new Map<number, number>();
  for (const sample of v2.mesh.boundarySamples) {
    const target = keyed.get(boundaryKey(sample));
    if (
      target === undefined ||
      (remap.has(sample.vertexIndex) && remap.get(sample.vertexIndex) !== target)
    )
      fail('boundary-provenance-mismatch', 'V2 boundary has no unique exact V3 provenance match.');
    if (
      v2.mesh.restPositions2Mm[sample.vertexIndex * 2] !== v3.mesh.restPositions2Mm[target * 2] ||
      v2.mesh.restPositions2Mm[sample.vertexIndex * 2 + 1] !==
        v3.mesh.restPositions2Mm[target * 2 + 1]
    )
      fail(
        'boundary-provenance-mismatch',
        'The provenance-selected boundary vertex has different rest coordinates.',
      );
    remap.set(sample.vertexIndex, target);
  }
  const sourceVertices = new Set(v2.mesh.boundarySamples.map((sample) => sample.vertexIndex));
  const targetVertices = new Set(v3.mesh.boundarySamples.map((sample) => sample.vertexIndex));
  const recovered = new Set(
    v3.vertexProvenance
      .filter(({ source }) => source.kind === 'boundary-recovery')
      .map(({ globalVertexIndex }) => globalVertexIndex),
  );
  if (
    remap.size !== sourceVertices.size ||
    remap.size !== targetVertices.size ||
    new Set(remap.values()).size !== remap.size ||
    recovered.size !== targetVertices.size ||
    [...targetVertices].some((vertex) => !recovered.has(vertex))
  )
    fail('boundary-provenance-mismatch', 'Boundary recovery is not an exact complete bijection.');
  const pins = new Set<number>();
  for (const roles of garment.boundaries)
    for (const vertex of roles.waist.boundaryVertexIndices) {
      const target = remap.get(vertex);
      if (target === undefined)
        fail('boundary-provenance-mismatch', 'An explicit D0 waist endpoint has no V3 provenance.');
      pins.add(target);
    }
  return Uint32Array.from([...pins].sort((a, b) => a - b));
}
function chordError(mesh: ClothMeshIR, mapped: Float32Array): number {
  let maximum = 0;
  for (let i = 0; i < mesh.triangles.length; i += 3)
    for (let edge = 0; edge < 3; edge += 1) {
      const a = mesh.triangles[i + edge]!;
      const b = mesh.triangles[i + ((edge + 1) % 3)]!;
      const rest =
        Math.hypot(
          mesh.restPositions2Mm[a * 2]! - mesh.restPositions2Mm[b * 2]!,
          mesh.restPositions2Mm[a * 2 + 1]! - mesh.restPositions2Mm[b * 2 + 1]!,
        ) / 1_000;
      if (!(rest > 0)) fail('mapping-blocked', 'A rest edge is degenerate.');
      const length = Math.hypot(
        mapped[a * 3]! - mapped[b * 3]!,
        mapped[a * 3 + 1]! - mapped[b * 3 + 1]!,
        mapped[a * 3 + 2]! - mapped[b * 3 + 2]!,
      );
      maximum = Math.max(maximum, Math.abs(length / rest - 1));
    }
  if (maximum > 0.002)
    fail('mapping-blocked', 'Discrete annular chord error exceeds the existing 0.002 bound.');
  return maximum;
}

async function buildSavedGarment(
  value: unknown,
  kind: SourceKind,
  signal?: AbortSignal,
): Promise<Result> {
  const controller = new AbortController();
  let record: RecordV1 | null = null;
  let disposeD0: (() => void) | null = null;
  let selfOwner: SelfOwner | null = null;
  let materialOwner: MaterialOwner | null = null;
  const cancel = () => {
    controller.abort();
    if (record) disposeGarment(record.owner, record.kind);
  };
  const unlink = () => signal?.removeEventListener('abort', cancel);
  signal?.addEventListener('abort', cancel, { once: true });
  try {
    signalCheck(signal);
    const request = input(value, kind);
    let sources = current(request, controller.signal);
    const expected = {
      v2Sha: sources.v2.composerCanonicalSha256,
      localSha: sources.local.snapshot.seal.canonicalSha256,
    };
    const sync = () => current(request, controller.signal, expected);
    const placement = await freshPlacement(request, controller.signal);
    sources = sync();
    const composition = await buildPatternImportDxfProductMultiseamMappingCompositionV2(
      request.compositionRequest,
    );
    sources = sync();
    if (!composition.ok) fail('composition-rebuild-blocked', composition.blockers[0].detail);
    const snapshot = request.composerV2Owner.snapshot;
    if (
      composition.compositionSeal.canonicalSha256 !== snapshot.seals.compositionCanonicalSha256 ||
      composition.aggregateSeal.canonicalSha256 !== snapshot.seals.aggregateCanonicalSha256 ||
      composition.evidence.productExportSha256 !== snapshot.row.dxfSha256 ||
      composition.evidence.sourceFileSha256 !== snapshot.seals.sourceFileSha256 ||
      composition.evidence.importGeneration !== snapshot.row.importGeneration
    )
      fail('source-binding-mismatch', 'Fresh composition differs from the genuine saved source.');
    const selectedGeometrySha256 = composition.aggregate.sourceBinding.baseFinalCoordinateSha256;
    bindPlacement(placement, request, selectedGeometrySha256);
    const receiptSha = await hash(
      'saved-local-frame-writer-receipt-v2',
      request.writerFrameReceipt,
    );
    sources = sync();
    if (receiptSha !== sources.local.snapshot.bindings.writerFrameReceiptCanonicalSha256)
      fail(
        'receipt-binding-mismatch',
        'Receipt is not the exact carrier receipt consumed by the live saved-local-frame owner.',
      );
    const semantics = placement.placementAuthoring.semantics;
    const commonD0 = {
      origin: 'verified-saved-row' as const,
      expectedComposerCanonicalSha256: expected.v2Sha,
      composerOwner: request.composerV2Owner,
      garment: semantics.garment,
      policy: semantics.policy,
    };
    const builtD0 =
      kind === 'legacy'
        ? await buildDxfProductTwoPanelSkirtPlacementSemanticsV1({
            schemaVersion: DXF_PRODUCT_TWO_PANEL_SKIRT_PLACEMENT_SEMANTICS_REQUEST_V1,
            ...commonD0,
            body: (placement as LegacyPlacement).placementAuthoring.semantics.body,
          })
        : await buildDxfProductTwoPanelSkirtGarmentSemanticsV1({
            schemaVersion: DXF_PRODUCT_TWO_PANEL_SKIRT_GARMENT_SEMANTICS_REQUEST_V1,
            ...commonD0,
          });
    if (builtD0.ok)
      disposeD0 =
        kind === 'legacy'
          ? () => {
              disposeDxfProductTwoPanelSkirtPlacementSemanticsV1(builtD0.owner);
            }
          : () => {
              disposeDxfProductTwoPanelSkirtGarmentSemanticsV1(builtD0.owner);
            };
    sources = sync();
    if (!builtD0.ok) fail('explicit-semantics-blocked', builtD0.blockers[0].detail);
    const authored =
      kind === 'legacy'
        ? projectDxfProductTwoPanelSkirtPlacementSemanticsV1(
            builtD0.owner as DxfProductTwoPanelSkirtPlacementSemanticsOwnerV1,
          )
        : projectDxfProductTwoPanelSkirtGarmentSemanticsV1(
            builtD0.owner as DxfProductTwoPanelSkirtGarmentSemanticsOwnerV1,
          );
    if (!authored) fail('explicit-semantics-blocked', 'The genuine D0 owner could not project.');
    const spec = mappingSpec(placement, request.writerFrameReceipt, sources.local);
    const pins = explicitPins(sources.v2, sources.local, authored.garment);
    const mapped = mapDxfProductTwoPanelSkirtAnnularToAuthoredFrameV1({
      schemaVersion: DXF_PRODUCT_TWO_PANEL_SKIRT_ANNULAR_AUTHORED_FRAME_MAPPING_V1,
      mesh: sources.local.composerV3.mesh,
      ...spec,
    });
    if (
      pins.length !== 82 ||
      pins.length !== mapped.pinnedWaistVertexIndices.length ||
      pins.some((pin, index) => pin !== mapped.pinnedWaistVertexIndices[index])
    )
      fail(
        'explicit-pin-mismatch',
        'Kernel pins differ from the explicit persisted D0 waist boundary, including its terminal endpoints.',
      );
    const maximumDiscreteChordRelativeError = chordError(
      sources.local.composerV3.mesh,
      mapped.positions3M,
    );
    const builtSelf = await buildDxfProductTwoPanelSkirtCanonicalMediumSelfOrientationV2({
      schemaVersion: DXF_PRODUCT_TWO_PANEL_SKIRT_CANONICAL_MEDIUM_SELF_ORIENTATION_REQUEST_V2,
      expected: {
        composerV2CanonicalSha256: expected.v2Sha,
        composerV3CanonicalSha256: sources.local.composerV3.composerCanonicalSha256,
        phase2ArtifactSha256: sources.v2.phase2ArtifactSha256,
        refinedArtifactSha256: sources.local.composerV3.refinedArtifactSha256,
      },
      composerV2Owner: request.composerV2Owner,
      composerV3Owner: request.savedLocalFrameOwner,
      mappingSpec: spec,
      mappingSnapshot: {
        positions3M: mapped.positions3M,
        positionsInvMass: mapped.positionsInvMass,
        triangles: mapped.triangles,
        seamPairs: mapped.seamPairs,
        pinnedWaistVertexIndices: mapped.pinnedWaistVertexIndices,
      },
    });
    if (builtSelf.ok) selfOwner = builtSelf.owner;
    sources = sync();
    if (!builtSelf.ok) fail('self-orientation-blocked', builtSelf.blockers[0].detail);
    let materialBlocker: Readonly<{ code: string; detail: string }> | null = null;
    if (builtSelf.report.claims.sourceSelfOrientationNoOpQualified) {
      const material = await buildDxfProductTwoPanelSkirtCanonicalMediumNormalizedV5SolverBridgeV1({
        schemaVersion:
          DXF_PRODUCT_TWO_PANEL_SKIRT_CANONICAL_MEDIUM_NORMALIZED_V5_SOLVER_BRIDGE_REQUEST_V1,
        expected: {
          composerV3CanonicalSha256: sources.local.composerV3.composerCanonicalSha256,
          phase2ArtifactSha256: sources.v2.phase2ArtifactSha256,
          refinedArtifactSha256: sources.local.composerV3.refinedArtifactSha256,
          selfOrientationReportSha256: builtSelf.report.seal.canonicalSha256,
        },
        composerV3Owner: request.savedLocalFrameOwner,
        selfOrientationOwner: builtSelf.owner,
      });
      if (material.ok) materialOwner = material.owner;
      sources = sync();
      if (!material.ok) materialBlocker = { code: material.code, detail: material.detail };
    } else
      materialBlocker = {
        code: 'self-orientation-not-qualified',
        detail: builtSelf.report.decision,
      };
    const payload = {
      schemaVersion: request.schemaVersion,
      status: 'garment-local-diagnostic-complete' as const,
      decision: materialOwner
        ? ('garment-local-material-qualified' as const)
        : ('garment-local-physical-blocked' as const),
      bindings: {
        composerV2CanonicalSha256: expected.v2Sha,
        savedLocalFrameCanonicalSha256: expected.localSha,
        composerV3CanonicalSha256: sources.local.composerV3.composerCanonicalSha256,
        writerFrameReceiptCanonicalSha256: receiptSha,
        placementSidecarSha256: placement.seal.canonicalSha256,
        selectedGeometrySha256,
        semanticsCanonicalSha256: builtD0.snapshot.seal.canonicalSha256,
      },
      persistedPlacement: {
        bindings: plainCopy(placement.document.bindings),
        authoring: plainCopy(placement.placementAuthoring),
      },
      mappingFrame: 'garment-local-waist-origin' as const,
      mappingSpec: spec,
      maximumDiscreteChordRelativeError,
      selfOrientation: builtSelf.report,
      normalizedMaterial: materialOwner?.report ?? null,
      materialBlocker,
      claims: CLAIMS,
    };
    const canonicalSha256 = await hash(request.schemaVersion, payload);
    sync();
    await freshPlacement(request, controller.signal, placement.seal.canonicalSha256);
    sync();
    const report = freezePlain({ ...payload, canonicalSha256 }) as Report;
    const owner = Object.freeze({
      schemaVersion: request.schemaVersion,
      report,
    }) as Owner;
    record = {
      request,
      kind,
      ...expected,
      placementSha: placement.seal.canonicalSha256,
      controller,
      unlink,
      selfOwner: builtSelf.owner,
      materialOwner,
      owner,
    };
    owners.set(owner, record);
    selfOwner = null;
    materialOwner = null;
    return Object.freeze({ ok: true, owner, report });
  } catch (error) {
    cancel();
    const failure =
      error instanceof Failure
        ? error
        : new Failure(
            'invalid-input',
            error instanceof Error ? error.message : 'Garment build failed closed.',
          );
    return Object.freeze({
      ok: false,
      owner: null,
      code: failure.code,
      detail: failure.message.slice(0, 2_048),
    });
  } finally {
    disposeD0?.();
    if (selfOwner) disposeDxfProductTwoPanelSkirtCanonicalMediumSelfOrientationV2(selfOwner);
    if (materialOwner)
      disposeDxfProductTwoPanelSkirtCanonicalMediumNormalizedV5SolverBridgeV1(materialOwner);
    if (!record) unlink();
  }
}

function recordOf(owner: unknown, kind: SourceKind): RecordV1 | undefined {
  const record = owner && typeof owner === 'object' ? owners.get(owner) : undefined;
  return record?.kind === kind ? record : undefined;
}
/** Synchronously polls genuine source owners. Host replacement must also abort the build signal. */
function getGarmentLifetime(owner: unknown, kind: SourceKind): AbortSignal | null {
  const record = recordOf(owner, kind);
  if (!record) return null;
  try {
    current(record.request, record.controller.signal, record);
    return record.controller.signal;
  } catch {
    disposeGarment(owner, kind);
    return null;
  }
}
async function projectGarment(
  owner: unknown,
  kind: SourceKind,
  signal?: AbortSignal,
): Promise<Projection | null> {
  const record = recordOf(owner, kind);
  if (!record) return null;
  const abortRead = new AbortController();
  const cancelRead = () => abortRead.abort();
  signal?.addEventListener('abort', cancelRead, { once: true });
  record.controller.signal.addEventListener('abort', cancelRead, { once: true });
  try {
    signalCheck(signal);
    current(record.request, record.controller.signal, record);
    await freshPlacement(record.request, abortRead.signal, record.placementSha);
    signalCheck(signal);
    current(record.request, record.controller.signal, record);
    if (owners.get(record.owner) !== record) return null;
    const mapping = projectDxfProductTwoPanelSkirtCanonicalMediumSelfOrientationV2(
      record.selfOwner,
    );
    const normalizedMaterial = record.materialOwner
      ? projectDxfProductTwoPanelSkirtCanonicalMediumNormalizedV5SolverBridgeV1(
          record.materialOwner,
        )
      : null;
    if (!mapping || (record.materialOwner && !normalizedMaterial))
      fail('source-owner-unavailable', 'A retained diagnostic child is unavailable.');
    return Object.freeze({
      report: record.owner.report,
      mapping,
      normalizedMaterial,
      callerOwnedMutableCopies: true,
      claims: CLAIMS,
    });
  } catch {
    // Cancelling a read alone does not revoke a still-current shared garment owner.
    if (!signal?.aborted) disposeGarment(owner, kind);
    return null;
  } finally {
    signal?.removeEventListener('abort', cancelRead);
    record.controller.signal.removeEventListener('abort', cancelRead);
  }
}
function disposeGarment(owner: unknown, kind: SourceKind): boolean {
  const record = recordOf(owner, kind);
  if (!record) return false;
  owners.delete(record.owner);
  record.controller.abort();
  record.unlink();
  disposeDxfProductTwoPanelSkirtCanonicalMediumSelfOrientationV2(record.selfOwner);
  if (record.materialOwner)
    disposeDxfProductTwoPanelSkirtCanonicalMediumNormalizedV5SolverBridgeV1(record.materialOwner);
  return true;
}

/** Fixed legacy entry: its schema, owner registry partition and report bytes remain unchanged. */
export function buildPatternImportDxfProductSavedAnnularGarmentV1(
  value: unknown,
  signal?: AbortSignal,
): Promise<PatternImportDxfProductSavedAnnularGarmentResultV1> {
  return buildSavedGarment(
    value,
    'legacy',
    signal,
  ) as Promise<PatternImportDxfProductSavedAnnularGarmentResultV1>;
}
export function projectPatternImportDxfProductSavedAnnularGarmentV1(
  owner: unknown,
  signal?: AbortSignal,
): Promise<PatternImportDxfProductSavedAnnularGarmentProjectionV1 | null> {
  return projectGarment(
    owner,
    'legacy',
    signal,
  ) as Promise<PatternImportDxfProductSavedAnnularGarmentProjectionV1 | null>;
}
export function getPatternImportDxfProductSavedAnnularGarmentLifetimeV1(owner: unknown) {
  return getGarmentLifetime(owner, 'legacy');
}
export function disposePatternImportDxfProductSavedAnnularGarmentV1(owner: unknown) {
  return disposeGarment(owner, 'legacy');
}
/** Observed placement supplies body-free garment intent; no A target is manufactured. */
export function buildPatternImportDxfProductSavedAnnularObservedPlacementGarmentV1(
  value: unknown,
  signal?: AbortSignal,
): Promise<PatternImportDxfProductSavedAnnularObservedPlacementGarmentResultV1> {
  return buildSavedGarment(
    value,
    'observed',
    signal,
  ) as Promise<PatternImportDxfProductSavedAnnularObservedPlacementGarmentResultV1>;
}
export function projectPatternImportDxfProductSavedAnnularObservedPlacementGarmentV1(
  owner: unknown,
  signal?: AbortSignal,
): Promise<PatternImportDxfProductSavedAnnularObservedPlacementGarmentProjectionV1 | null> {
  return projectGarment(
    owner,
    'observed',
    signal,
  ) as Promise<PatternImportDxfProductSavedAnnularObservedPlacementGarmentProjectionV1 | null>;
}
export function getPatternImportDxfProductSavedAnnularObservedPlacementGarmentLifetimeV1(
  owner: unknown,
) {
  return getGarmentLifetime(owner, 'observed');
}
export function disposePatternImportDxfProductSavedAnnularObservedPlacementGarmentV1(
  owner: unknown,
) {
  return disposeGarment(owner, 'observed');
}
