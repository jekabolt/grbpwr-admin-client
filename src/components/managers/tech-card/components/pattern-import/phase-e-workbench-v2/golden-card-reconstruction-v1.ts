import type {
  DxfAssemblyOperationV1,
  DxfMaterialAssignmentV1,
  DxfSeamV1,
} from 'lib/cloth/domain/dxf-assembly-handoff-v1';
import type { PatternImportDxfProductPhaseEAuthoringCatalogV1 } from 'lib/cloth/domain/pattern-import-dxf-product-phase-e-authoring-catalog-v1';
import type { PatternImportDxfProductPhaseEExactTopologySideBindingV1 } from 'lib/cloth/domain/pattern-import-dxf-product-phase-e-exact-topology-binding-v1';
import type { PatternImportDxfProductPhaseEExistingAssemblyOperationV1 } from 'lib/pattern-import/dxf-product-phase-e-assembly-workbench-v1';

import type { TopstitchBomLine } from '../../topstitch-lines';
import {
  PATTERN_IMPORT_DXF_PHASE_E_STITCH_VISUAL_V1,
  type PatternImportDxfPhaseEStitchVisualV1,
} from './stitch-visual-v1';

export const PATTERN_IMPORT_DXF_PHASE_E_GOLDEN_CARD_RECONSTRUCTION_SNAPSHOT_V1 =
  'pattern-import-dxf-phase-e-golden-card-reconstruction-snapshot/1' as const;
export const PATTERN_IMPORT_DXF_PHASE_E_GOLDEN_CARD_RECONSTRUCTION_REPORT_V1 =
  'pattern-import-dxf-phase-e-golden-card-reconstruction-report/1' as const;
export const PATTERN_IMPORT_DXF_PHASE_E_GOLDEN_CARD_RECONSTRUCTION_HARNESS_V1 =
  'pattern-import-dxf-phase-e-golden-card-reconstruction-harness/1' as const;

const SHA256 = /^[0-9a-f]{64}$/;
const STABLE_REF = /^[A-Za-z0-9][A-Za-z0-9._:/#-]{0,255}$/;
const LIMITS = Object.freeze({
  pieces: 512,
  contoursPerPiece: 128,
  verticesPerContour: 32_768,
  connections: 8_192,
  operations: 8_192,
  materials: 1_024,
  bomRefs: 4_096,
  colorways: 1_024,
  usagesPerColorway: 16_384,
});

export type PatternImportDxfPhaseEGoldenCardCatalogV1 = Readonly<
  Pick<
    PatternImportDxfProductPhaseEAuthoringCatalogV1,
    'canonicalSha256' | 'sizeSelectionCanonicalSha256' | 'sourceFileId' | 'pieces'
  >
>;

export type PatternImportDxfPhaseEGoldenCardConnectionSideV1 = Readonly<
  Pick<
    PatternImportDxfProductPhaseEExactTopologySideBindingV1,
    'pieceId' | 'pieceLineKey' | 'contourId' | 'boundaryVertexIds' | 'direction'
  >
>;

export type PatternImportDxfPhaseEGoldenCardConnectionV1 = Readonly<{
  connectionRef: string;
  operationRef: string;
  mapping: DxfSeamV1['mapping'];
  lengthRatio: number;
  sides: readonly [
    PatternImportDxfPhaseEGoldenCardConnectionSideV1,
    PatternImportDxfPhaseEGoldenCardConnectionSideV1,
  ];
}>;

export type PatternImportDxfPhaseEGoldenCardOperationV1 = Readonly<{
  operationRef: string;
  assembly: DxfAssemblyOperationV1;
  card: PatternImportDxfProductPhaseEExistingAssemblyOperationV1;
  stitch: PatternImportDxfPhaseEStitchVisualV1 | null;
}>;

/** A sanitized stable key projection of an existing BOM row; no server PK or material ID. */
export type PatternImportDxfPhaseEGoldenCardBomRefV1 = Readonly<{
  lineKey: string;
  section: TopstitchBomLine['section'];
  kind: TopstitchBomLine['kind'];
  materialAssignmentRef: string | null;
}>;

/** Caller-owned opaque colourway identity and durable recipe references only. */
export type PatternImportDxfPhaseEGoldenCardColorwayRefV1 = Readonly<{
  colorwayRef: string;
  usages: readonly Readonly<{
    bomLineKey: string;
    pieceLineKey: string | null;
    materialAssignmentRef: string | null;
  }>[];
}>;

export type PatternImportDxfPhaseEGoldenCardReconstructionSnapshotV1 = Readonly<{
  schemaVersion: typeof PATTERN_IMPORT_DXF_PHASE_E_GOLDEN_CARD_RECONSTRUCTION_SNAPSHOT_V1;
  /** Caller-sanitized opaque identity. Production numeric IDs are outside this contract. */
  cardRef: string;
  catalog: PatternImportDxfPhaseEGoldenCardCatalogV1;
  connections: readonly PatternImportDxfPhaseEGoldenCardConnectionV1[];
  operations: readonly PatternImportDxfPhaseEGoldenCardOperationV1[];
  materials: readonly DxfMaterialAssignmentV1[];
  bomRefs: readonly PatternImportDxfPhaseEGoldenCardBomRefV1[];
  colorways: readonly PatternImportDxfPhaseEGoldenCardColorwayRefV1[];
}>;

export const PATTERN_IMPORT_DXF_PHASE_E_GOLDEN_CARD_RECONSTRUCTION_CLAIMS_V1 = Object.freeze({
  callerSuppliedSanitizedSnapshotsRequired: true,
  productionFixtureBundled: false,
  productionIdsRequired: false,
  networkUsed: false,
  pureComparisonOnly: true,
  exactCatalogTopologyCompared: true,
  exactEdgeIdentityCompared: true,
  operationGraphCompared: true,
  seamRecipeCompared: true,
  stitchVisualCompared: true,
  materialBomColorwayRefsCompared: true,
  catalogHashRecomputed: false,
  createsTopologyAuthority: false,
  createsAssemblyAuthority: false,
  createsBomOrColorwayAuthority: false,
  createsPersistenceModel: false,
  sessionReplayHarnessAvailable: true,
  replayCreatesAuthority: false,
  productionReady: false,
} as const);

export type PatternImportDxfPhaseEGoldenCardReconstructionSectionV1 =
  | 'pieces-contours'
  | 'exact-edge-connections'
  | 'operation-graph'
  | 'seam-mapping-direction'
  | 'stitch-gauge-offset-thread'
  | 'material-bom-colorway-refs';

export type PatternImportDxfPhaseEGoldenCardReconstructionDifferenceV1 = Readonly<{
  section: PatternImportDxfPhaseEGoldenCardReconstructionSectionV1;
  path: string;
  kind: 'missing' | 'unexpected' | 'changed';
}>;

export type PatternImportDxfPhaseEGoldenCardReconstructionSectionReportV1 = Readonly<{
  section: PatternImportDxfPhaseEGoldenCardReconstructionSectionV1;
  status: 'match' | 'mismatch';
  differenceCount: number;
  differences: readonly PatternImportDxfPhaseEGoldenCardReconstructionDifferenceV1[];
}>;

export type PatternImportDxfPhaseEGoldenCardReconstructionReportV1 = Readonly<{
  schemaVersion: typeof PATTERN_IMPORT_DXF_PHASE_E_GOLDEN_CARD_RECONSTRUCTION_REPORT_V1;
  cardRef: string;
  status: 'match' | 'mismatch';
  differenceCount: number;
  sections: readonly PatternImportDxfPhaseEGoldenCardReconstructionSectionReportV1[];
  claims: typeof PATTERN_IMPORT_DXF_PHASE_E_GOLDEN_CARD_RECONSTRUCTION_CLAIMS_V1;
}>;

export type PatternImportDxfPhaseEGoldenCardReconstructionBlockerV1 = Readonly<{
  code: 'invalid-baseline' | 'invalid-candidate' | 'card-ref-mismatch';
  detail: string;
}>;

export type PatternImportDxfPhaseEGoldenCardReconstructionResultV1 =
  | Readonly<{
      ok: true;
      report: PatternImportDxfPhaseEGoldenCardReconstructionReportV1;
      blocker: null;
    }>
  | Readonly<{
      ok: false;
      report: null;
      blocker: PatternImportDxfPhaseEGoldenCardReconstructionBlockerV1;
    }>;

export type PatternImportDxfPhaseEGoldenCardReconstructionHarnessV1 = Readonly<{
  schemaVersion: typeof PATTERN_IMPORT_DXF_PHASE_E_GOLDEN_CARD_RECONSTRUCTION_HARNESS_V1;
  status: 'session-only-replay';
  revision: number;
  cardRef: string;
  catalog: PatternImportDxfPhaseEGoldenCardCatalogV1;
  connections: readonly PatternImportDxfPhaseEGoldenCardConnectionV1[];
  operations: readonly PatternImportDxfPhaseEGoldenCardOperationV1[];
  materials: readonly DxfMaterialAssignmentV1[];
  bomRefs: readonly PatternImportDxfPhaseEGoldenCardBomRefV1[];
  colorways: readonly PatternImportDxfPhaseEGoldenCardColorwayRefV1[];
}>;

export type PatternImportDxfPhaseEGoldenCardReconstructionHarnessBlockerV1 = Readonly<{
  code: 'invalid-baseline' | 'invalid-session' | 'invalid-operation-replay';
  detail: string;
}>;

export type PatternImportDxfPhaseEGoldenCardReconstructionHarnessResultV1 =
  | Readonly<{
      ok: true;
      session: PatternImportDxfPhaseEGoldenCardReconstructionHarnessV1;
      blocker: null;
    }>
  | Readonly<{
      ok: false;
      session: PatternImportDxfPhaseEGoldenCardReconstructionHarnessV1 | null;
      blocker: PatternImportDxfPhaseEGoldenCardReconstructionHarnessBlockerV1;
    }>;

type EntryMap = ReadonlyMap<string, string>;

function deepFreeze<T>(value: T, seen = new Set<object>()): T {
  if (!value || typeof value !== 'object' || seen.has(value) || Object.isFrozen(value))
    return value;
  seen.add(value);
  for (const child of Object.values(value as Record<string, unknown>)) deepFreeze(child, seen);
  return Object.freeze(value);
}

function stableRef(value: unknown): value is string {
  return typeof value === 'string' && STABLE_REF.test(value);
}

function plainDataGraph(value: unknown, seen = new Set<object>()): boolean {
  if (
    value === null ||
    value === undefined ||
    typeof value === 'string' ||
    typeof value === 'number' ||
    typeof value === 'boolean'
  )
    return true;
  if (typeof value !== 'object') return false;
  if (seen.has(value)) return true;
  seen.add(value);
  const array = Array.isArray(value);
  const prototype = Object.getPrototypeOf(value);
  if (!array && prototype !== Object.prototype && prototype !== null) return false;
  const descriptors = Object.getOwnPropertyDescriptors(value);
  for (const [key, descriptor] of Object.entries(descriptors)) {
    if (array && key === 'length') continue;
    if (
      !descriptor.enumerable ||
      !Object.prototype.hasOwnProperty.call(descriptor, 'value') ||
      !plainDataGraph(descriptor.value, seen)
    )
      return false;
  }
  return Reflect.ownKeys(descriptors).every((key) => typeof key === 'string');
}

function canonical(value: unknown): string {
  if (value === null || typeof value === 'boolean' || typeof value === 'string')
    return JSON.stringify(value);
  if (typeof value === 'number') {
    if (!Number.isFinite(value) || Object.is(value, -0)) throw new TypeError('invalid number');
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  if (!value || typeof value !== 'object') throw new TypeError('invalid value');
  const record = value as Record<string, unknown>;
  return `{${Object.keys(record)
    .filter((key) => record[key] !== undefined)
    .sort()
    .map((key) => `${JSON.stringify(key)}:${canonical(record[key])}`)
    .join(',')}}`;
}

function pathRef(value: string): string {
  return encodeURIComponent(value).replaceAll('%3A', ':');
}

function unique(values: readonly string[]): boolean {
  return new Set(values).size === values.length;
}

function sameOrdered(left: readonly string[], right: readonly string[]): boolean {
  return left.length === right.length && left.every((value, index) => value === right[index]);
}

function exactSide(
  catalog: PatternImportDxfPhaseEGoldenCardCatalogV1,
  side: PatternImportDxfPhaseEGoldenCardConnectionSideV1,
): boolean {
  if (
    !side ||
    !stableRef(side.pieceId) ||
    !stableRef(side.pieceLineKey) ||
    !stableRef(side.contourId) ||
    (side.direction !== 'forward' && side.direction !== 'reverse') ||
    !Array.isArray(side.boundaryVertexIds) ||
    side.boundaryVertexIds.length !== 2 ||
    !side.boundaryVertexIds.every(stableRef) ||
    side.boundaryVertexIds[0] === side.boundaryVertexIds[1]
  )
    return false;
  const pieces = catalog.pieces.filter(
    ({ pieceId, pieceLineKey }) => pieceId === side.pieceId && pieceLineKey === side.pieceLineKey,
  );
  const contours = pieces[0]?.contours.filter(({ contourId }) => contourId === side.contourId);
  if (pieces.length !== 1 || contours?.length !== 1) return false;
  const contour = contours[0];
  const indexes = side.boundaryVertexIds.map((vertexId) =>
    contour.boundaryVertices.findIndex((vertex) => vertex.vertexId === vertexId),
  );
  if (indexes.some((index) => index < 0)) return false;
  const delta = Math.abs(indexes[0] - indexes[1]);
  return (
    delta === 1 ||
    (contour.closed &&
      contour.boundaryVertices.length > 2 &&
      delta === contour.boundaryVertices.length - 1)
  );
}

function catalogIssue(catalog: PatternImportDxfPhaseEGoldenCardCatalogV1): string | null {
  if (
    !catalog ||
    !SHA256.test(catalog.canonicalSha256 ?? '') ||
    !SHA256.test(catalog.sizeSelectionCanonicalSha256 ?? '') ||
    !stableRef(catalog.sourceFileId) ||
    !Array.isArray(catalog.pieces) ||
    !catalog.pieces.length ||
    catalog.pieces.length > LIMITS.pieces
  )
    return 'catalog identity or piece bounds are invalid';
  const pieceIds: string[] = [];
  const pieceLineKeys: string[] = [];
  for (const piece of catalog.pieces) {
    if (
      !piece ||
      !stableRef(piece.pieceId) ||
      !stableRef(piece.pieceLineKey) ||
      !Array.isArray(piece.contours) ||
      !piece.contours.length ||
      piece.contours.length > LIMITS.contoursPerPiece
    )
      return 'piece or contour identity is invalid';
    pieceIds.push(piece.pieceId);
    pieceLineKeys.push(piece.pieceLineKey);
    const contourIds: string[] = [];
    for (const contour of piece.contours) {
      if (
        !contour ||
        !stableRef(contour.contourId) ||
        !['sewing-boundary', 'cut-boundary', 'hole'].includes(contour.role) ||
        typeof contour.closed !== 'boolean' ||
        !Array.isArray(contour.boundaryVertices) ||
        contour.boundaryVertices.length < 2 ||
        contour.boundaryVertices.length > LIMITS.verticesPerContour
      )
        return 'contour topology is invalid';
      contourIds.push(contour.contourId);
      const vertexIds: string[] = [];
      for (const [index, vertex] of contour.boundaryVertices.entries()) {
        if (
          !vertex ||
          vertex.ordinal !== index ||
          !stableRef(vertex.vertexId) ||
          !Number.isFinite(vertex.normalizedArc) ||
          vertex.normalizedArc < 0 ||
          vertex.normalizedArc > 1
        )
          return 'ordered boundary vertex identity is invalid';
        vertexIds.push(vertex.vertexId);
      }
      if (!unique(vertexIds)) return 'boundary vertex identities are duplicated';
    }
    if (!unique(contourIds)) return 'contour identities are duplicated within a piece';
  }
  return unique(pieceIds) && unique(pieceLineKeys) ? null : 'piece identities are duplicated';
}

function snapshotIssue(
  snapshot: PatternImportDxfPhaseEGoldenCardReconstructionSnapshotV1,
  allowEmptyOperationGraph = false,
): string | null {
  if (!plainDataGraph(snapshot)) return 'snapshot must be one detached plain data graph';
  if (
    snapshot?.schemaVersion !== PATTERN_IMPORT_DXF_PHASE_E_GOLDEN_CARD_RECONSTRUCTION_SNAPSHOT_V1 ||
    !stableRef(snapshot?.cardRef)
  )
    return 'snapshot schema or sanitized card reference is invalid';
  const invalidCatalog = catalogIssue(snapshot.catalog);
  if (invalidCatalog) return invalidCatalog;
  if (
    !Array.isArray(snapshot.connections) ||
    snapshot.connections.length > LIMITS.connections ||
    !Array.isArray(snapshot.operations) ||
    (!allowEmptyOperationGraph && !snapshot.operations.length) ||
    snapshot.operations.length > LIMITS.operations ||
    !Array.isArray(snapshot.materials) ||
    snapshot.materials.length > LIMITS.materials ||
    !Array.isArray(snapshot.bomRefs) ||
    snapshot.bomRefs.length > LIMITS.bomRefs ||
    !Array.isArray(snapshot.colorways) ||
    snapshot.colorways.length > LIMITS.colorways
  )
    return 'snapshot collection bounds are invalid';

  const pieceIds = new Set(snapshot.catalog.pieces.map(({ pieceId }) => pieceId));
  const pieceLineKeys = new Set(snapshot.catalog.pieces.map(({ pieceLineKey }) => pieceLineKey));
  const connectionRefs = snapshot.connections.map(({ connectionRef }) => connectionRef);
  if (!connectionRefs.every(stableRef) || !unique(connectionRefs))
    return 'connection references must be unique stable refs';
  const operationRefs = snapshot.operations.map(({ operationRef }) => operationRef);
  if (!operationRefs.every(stableRef) || !unique(operationRefs))
    return 'operation references must be unique stable refs';
  const operationRefSet = new Set(operationRefs);
  for (const connection of snapshot.connections) {
    if (
      !operationRefSet.has(connection.operationRef) ||
      !['equal', 'eased', 'gathered'].includes(connection.mapping) ||
      !Number.isFinite(connection.lengthRatio) ||
      connection.lengthRatio <= 0 ||
      (connection.mapping === 'equal' && connection.lengthRatio !== 1) ||
      !Array.isArray(connection.sides) ||
      connection.sides.length !== 2 ||
      !exactSide(snapshot.catalog, connection.sides[0]) ||
      !exactSide(snapshot.catalog, connection.sides[1]) ||
      connection.sides[0].pieceId === connection.sides[1].pieceId
    )
      return 'connection must bind one operation and two exact current catalog edges';
  }

  const operationNumbers: number[] = [];
  const operationOrders: number[] = [];
  const outputOwners = new Map<string, number>();
  for (const operation of snapshot.operations) {
    const assembly = operation.assembly;
    const card = operation.card;
    if (
      !assembly ||
      !card ||
      assembly.id !== operation.operationRef ||
      card.authoringOperationId !== operation.operationRef ||
      !Number.isSafeInteger(assembly.stage) ||
      assembly.stage < 0 ||
      !Number.isSafeInteger(assembly.order) ||
      assembly.order < 0 ||
      !['place', 'stitch', 'release-support'].includes(assembly.kind) ||
      !Array.isArray(assembly.seamIds) ||
      !assembly.seamIds.every(stableRef) ||
      !unique(assembly.seamIds) ||
      !Number.isSafeInteger(card.number) ||
      card.number <= 0 ||
      typeof card.work !== 'string' ||
      !card.work.trim() ||
      !Array.isArray(card.inputKeys) ||
      !card.inputKeys.every(stableRef) ||
      typeof card.outputUnitKey !== 'string' ||
      (!!card.outputUnitKey && !stableRef(card.outputUnitKey)) ||
      typeof card.outputUnitName !== 'string' ||
      !Array.isArray(card.seamKeys) ||
      !sameOrdered(card.seamKeys, assembly.seamIds) ||
      (assembly.kind === 'stitch' &&
        operation.stitch?.schemaVersion !== PATTERN_IMPORT_DXF_PHASE_E_STITCH_VISUAL_V1) ||
      (assembly.kind !== 'stitch' && operation.stitch !== null)
    )
      return 'operation graph or stitch reference is invalid';
    operationNumbers.push(card.number);
    operationOrders.push(assembly.order);
    if (card.outputUnitKey) {
      if (outputOwners.has(card.outputUnitKey)) return 'operation output keys are duplicated';
      outputOwners.set(card.outputUnitKey, assembly.order);
    }
  }
  if (!unique(operationNumbers.map(String)) || !unique(operationOrders.map(String)))
    return 'operation number or order is duplicated';
  for (const operation of snapshot.operations) {
    const validInputs = new Set(pieceLineKeys);
    for (const [output, ownerOrder] of outputOwners)
      if (ownerOrder < operation.assembly.order) validInputs.add(output);
    if (operation.card.inputKeys.some((input: string) => !validInputs.has(input)))
      return 'operation input must reference a piece or an earlier operation output';
    const ownedConnections = snapshot.connections
      .filter(({ operationRef }) => operationRef === operation.operationRef)
      .map(({ connectionRef }) => connectionRef);
    if (!sameOrdered(operation.assembly.seamIds, ownedConnections))
      return 'operation connection refs must match the ordered connection set';
  }

  const materialIds = snapshot.materials.map(({ id }) => id);
  if (!materialIds.every(stableRef) || !unique(materialIds)) return 'material refs are invalid';
  for (const material of snapshot.materials)
    if (
      !stableRef(material.materialRevision) ||
      !Array.isArray(material.pieceIds) ||
      !material.pieceIds.length ||
      !unique(material.pieceIds) ||
      material.pieceIds.some((pieceId: string) => !pieceIds.has(pieceId))
    )
      return 'material assignment references are invalid';
  const materialSet = new Set(materialIds);
  const bomKeys = snapshot.bomRefs.map(({ lineKey }) => lineKey);
  if (!bomKeys.every(stableRef) || !unique(bomKeys)) return 'BOM refs are invalid';
  for (const bom of snapshot.bomRefs)
    if (
      typeof bom.section !== 'string' ||
      typeof bom.kind !== 'string' ||
      (bom.materialAssignmentRef !== null && !materialSet.has(bom.materialAssignmentRef))
    )
      return 'BOM reference targets are invalid';
  const bomSet = new Set(bomKeys);
  for (const operation of snapshot.operations) {
    const threadKey = operation.stitch?.thread.bomLineKey;
    if (threadKey !== null && threadKey !== undefined && !bomSet.has(threadKey))
      return 'stitch thread must reference an existing sanitized BOM line';
  }

  const colorwayRefs = snapshot.colorways.map(({ colorwayRef }) => colorwayRef);
  if (!colorwayRefs.every(stableRef) || !unique(colorwayRefs)) return 'colourway refs are invalid';
  for (const colorway of snapshot.colorways) {
    if (!Array.isArray(colorway.usages) || colorway.usages.length > LIMITS.usagesPerColorway)
      return 'colourway usage bounds are invalid';
    const usageKeys: string[] = [];
    for (const usage of colorway.usages) {
      if (
        !usage ||
        !bomSet.has(usage.bomLineKey) ||
        (usage.pieceLineKey !== null && !pieceLineKeys.has(usage.pieceLineKey)) ||
        (usage.materialAssignmentRef !== null && !materialSet.has(usage.materialAssignmentRef))
      )
        return 'colourway usage references are invalid';
      usageKeys.push(`${usage.bomLineKey}\u0000${usage.pieceLineKey ?? ''}`);
    }
    if (!unique(usageKeys)) return 'colourway usage refs are duplicated';
  }
  try {
    canonical(snapshot);
  } catch {
    return 'snapshot contains a non-canonical value';
  }
  return null;
}

function piecesEntries(
  snapshot: PatternImportDxfPhaseEGoldenCardReconstructionSnapshotV1,
): EntryMap {
  const entries = new Map<string, string>();
  entries.set('source/catalogCanonicalSha256', canonical(snapshot.catalog.canonicalSha256));
  entries.set(
    'source/sizeSelectionCanonicalSha256',
    canonical(snapshot.catalog.sizeSelectionCanonicalSha256),
  );
  entries.set('source/sourceFileId', canonical(snapshot.catalog.sourceFileId));
  for (const piece of snapshot.catalog.pieces) {
    const piecePath = `pieces/${pathRef(piece.pieceId)}`;
    entries.set(`${piecePath}/pieceLineKey`, canonical(piece.pieceLineKey));
    for (const contour of piece.contours) {
      const contourPath = `${piecePath}/contours/${pathRef(contour.contourId)}`;
      entries.set(
        contourPath,
        canonical({
          role: contour.role,
          geometry: contour.geometry,
          closed: contour.closed,
          boundaryVertices: contour.boundaryVertices,
        }),
      );
    }
  }
  return entries;
}

function connectionEntries(
  snapshot: PatternImportDxfPhaseEGoldenCardReconstructionSnapshotV1,
): EntryMap {
  return new Map(
    snapshot.connections.map((connection) => [
      `connections/${pathRef(connection.connectionRef)}`,
      canonical({
        operationRef: connection.operationRef,
        sides: connection.sides.map(({ pieceId, pieceLineKey, contourId, boundaryVertexIds }) => ({
          pieceId,
          pieceLineKey,
          contourId,
          boundaryVertexIds,
        })),
      }),
    ]),
  );
}

function operationEntries(
  snapshot: PatternImportDxfPhaseEGoldenCardReconstructionSnapshotV1,
): EntryMap {
  return new Map(
    snapshot.operations.map((operation) => [
      `operations/${pathRef(operation.operationRef)}`,
      canonical({
        stage: operation.assembly.stage,
        order: operation.assembly.order,
        kind: operation.assembly.kind,
        seamIds: operation.assembly.seamIds,
        sourceOperationNumber: operation.card.number,
        work: operation.card.work,
        phaseEKind: operation.card.phaseEKind,
        inputKeys: operation.card.inputKeys,
        outputUnitKey: operation.card.outputUnitKey,
        outputUnitName: operation.card.outputUnitName,
        seamKeys: operation.card.seamKeys,
      }),
    ]),
  );
}

function seamEntries(snapshot: PatternImportDxfPhaseEGoldenCardReconstructionSnapshotV1): EntryMap {
  return new Map(
    snapshot.connections.map((connection) => [
      `connections/${pathRef(connection.connectionRef)}/recipe`,
      canonical({
        mapping: connection.mapping,
        lengthRatio: connection.lengthRatio,
        directions: connection.sides.map(({ direction }) => direction),
      }),
    ]),
  );
}

function stitchEntries(
  snapshot: PatternImportDxfPhaseEGoldenCardReconstructionSnapshotV1,
): EntryMap {
  return new Map(
    snapshot.operations.map((operation) => [
      `operations/${pathRef(operation.operationRef)}/stitch`,
      canonical(operation.stitch),
    ]),
  );
}

function referenceEntries(
  snapshot: PatternImportDxfPhaseEGoldenCardReconstructionSnapshotV1,
): EntryMap {
  const entries = new Map<string, string>();
  for (const material of snapshot.materials)
    entries.set(`materials/${pathRef(material.id)}`, canonical(material));
  for (const bom of snapshot.bomRefs) entries.set(`bom/${pathRef(bom.lineKey)}`, canonical(bom));
  for (const colorway of snapshot.colorways)
    entries.set(
      `colorways/${pathRef(colorway.colorwayRef)}`,
      canonical({
        usages: [...colorway.usages].sort((left, right) =>
          `${left.bomLineKey}\u0000${left.pieceLineKey ?? ''}`.localeCompare(
            `${right.bomLineKey}\u0000${right.pieceLineKey ?? ''}`,
          ),
        ),
      }),
    );
  return entries;
}

const SECTION_ENTRIES: Readonly<
  Record<
    PatternImportDxfPhaseEGoldenCardReconstructionSectionV1,
    (snapshot: PatternImportDxfPhaseEGoldenCardReconstructionSnapshotV1) => EntryMap
  >
> = Object.freeze({
  'pieces-contours': piecesEntries,
  'exact-edge-connections': connectionEntries,
  'operation-graph': operationEntries,
  'seam-mapping-direction': seamEntries,
  'stitch-gauge-offset-thread': stitchEntries,
  'material-bom-colorway-refs': referenceEntries,
});

function compareSection(
  section: PatternImportDxfPhaseEGoldenCardReconstructionSectionV1,
  baseline: PatternImportDxfPhaseEGoldenCardReconstructionSnapshotV1,
  candidate: PatternImportDxfPhaseEGoldenCardReconstructionSnapshotV1,
): PatternImportDxfPhaseEGoldenCardReconstructionSectionReportV1 {
  const expected = SECTION_ENTRIES[section](baseline);
  const actual = SECTION_ENTRIES[section](candidate);
  const paths = [...new Set([...expected.keys(), ...actual.keys()])].sort();
  const differences = paths.flatMap(
    (path): PatternImportDxfPhaseEGoldenCardReconstructionDifferenceV1[] => {
      if (!actual.has(path)) return [{ section, path, kind: 'missing' }];
      if (!expected.has(path)) return [{ section, path, kind: 'unexpected' }];
      return expected.get(path) === actual.get(path) ? [] : [{ section, path, kind: 'changed' }];
    },
  );
  return deepFreeze({
    section,
    status: differences.length ? ('mismatch' as const) : ('match' as const),
    differenceCount: differences.length,
    differences,
  });
}

function blocked(
  code: PatternImportDxfPhaseEGoldenCardReconstructionBlockerV1['code'],
  detail: string,
): PatternImportDxfPhaseEGoldenCardReconstructionResultV1 {
  return Object.freeze({
    ok: false as const,
    report: null,
    blocker: Object.freeze({ code, detail }),
  });
}

export function verifyPatternImportDxfPhaseEGoldenCardReconstructionV1(
  baseline: PatternImportDxfPhaseEGoldenCardReconstructionSnapshotV1,
  candidate: PatternImportDxfPhaseEGoldenCardReconstructionSnapshotV1,
): PatternImportDxfPhaseEGoldenCardReconstructionResultV1 {
  const baselineIssue = snapshotIssue(baseline);
  if (baselineIssue)
    return blocked('invalid-baseline', `Golden baseline blocked: ${baselineIssue}.`);
  const candidateIssue = snapshotIssue(candidate, true);
  if (candidateIssue)
    return blocked('invalid-candidate', `Reconstruction candidate blocked: ${candidateIssue}.`);
  if (baseline.cardRef !== candidate.cardRef)
    return blocked(
      'card-ref-mismatch',
      'Golden baseline and reconstruction candidate must use the same sanitized card reference.',
    );

  const sections = (
    Object.keys(SECTION_ENTRIES) as PatternImportDxfPhaseEGoldenCardReconstructionSectionV1[]
  ).map((section) => compareSection(section, baseline, candidate));
  const differenceCount = sections.reduce((sum, section) => sum + section.differenceCount, 0);
  return Object.freeze({
    ok: true as const,
    report: deepFreeze({
      schemaVersion: PATTERN_IMPORT_DXF_PHASE_E_GOLDEN_CARD_RECONSTRUCTION_REPORT_V1,
      cardRef: baseline.cardRef,
      status: differenceCount ? ('mismatch' as const) : ('match' as const),
      differenceCount,
      sections,
      claims: PATTERN_IMPORT_DXF_PHASE_E_GOLDEN_CARD_RECONSTRUCTION_CLAIMS_V1,
    }),
    blocker: null,
  });
}

function harnessBlocked(
  code: PatternImportDxfPhaseEGoldenCardReconstructionHarnessBlockerV1['code'],
  detail: string,
  session: PatternImportDxfPhaseEGoldenCardReconstructionHarnessV1 | null = null,
): PatternImportDxfPhaseEGoldenCardReconstructionHarnessResultV1 {
  return Object.freeze({
    ok: false as const,
    session,
    blocker: Object.freeze({ code, detail }),
  });
}

function harnessCandidate(
  session: PatternImportDxfPhaseEGoldenCardReconstructionHarnessV1,
): PatternImportDxfPhaseEGoldenCardReconstructionSnapshotV1 {
  return {
    schemaVersion: PATTERN_IMPORT_DXF_PHASE_E_GOLDEN_CARD_RECONSTRUCTION_SNAPSHOT_V1,
    cardRef: session.cardRef,
    catalog: session.catalog,
    connections: session.connections,
    operations: session.operations,
    materials: session.materials,
    bomRefs: session.bomRefs,
    colorways: session.colorways,
  };
}

/**
 * Starts a blank reconstruction attempt while retaining only caller-sanitized non-operation refs.
 * The golden baseline itself is not retained by the session and must be supplied again at finalize.
 */
export function startPatternImportDxfPhaseEGoldenCardReconstructionHarnessV1(
  baseline: PatternImportDxfPhaseEGoldenCardReconstructionSnapshotV1,
): PatternImportDxfPhaseEGoldenCardReconstructionHarnessResultV1 {
  const issue = snapshotIssue(baseline);
  if (issue) return harnessBlocked('invalid-baseline', `Golden baseline blocked: ${issue}.`);
  const detached = structuredClone(baseline);
  return Object.freeze({
    ok: true as const,
    session: deepFreeze({
      schemaVersion: PATTERN_IMPORT_DXF_PHASE_E_GOLDEN_CARD_RECONSTRUCTION_HARNESS_V1,
      status: 'session-only-replay' as const,
      revision: 0,
      cardRef: detached.cardRef,
      catalog: detached.catalog,
      connections: [],
      operations: [],
      materials: detached.materials,
      bomRefs: detached.bomRefs,
      colorways: detached.colorways,
    }),
    blocker: null,
  });
}

/** Appends exactly one operation and its already-existing exact owned connections in graph order. */
export function appendPatternImportDxfPhaseEGoldenCardReconstructionOperationV1(
  current: PatternImportDxfPhaseEGoldenCardReconstructionHarnessV1,
  operation: PatternImportDxfPhaseEGoldenCardOperationV1,
  ownedConnections: readonly PatternImportDxfPhaseEGoldenCardConnectionV1[],
): PatternImportDxfPhaseEGoldenCardReconstructionHarnessResultV1 {
  if (
    current?.schemaVersion !== PATTERN_IMPORT_DXF_PHASE_E_GOLDEN_CARD_RECONSTRUCTION_HARNESS_V1 ||
    snapshotIssue(harnessCandidate(current), true)
  )
    return harnessBlocked(
      'invalid-session',
      'Golden reconstruction replay requires one valid current session.',
      current ?? null,
    );
  const expectedConnections = operation?.assembly?.seamIds ?? [];
  const suppliedConnections = ownedConnections.map(({ connectionRef }) => connectionRef);
  const lastOperation = current.operations.at(-1);
  if (
    !plainDataGraph({ operation, ownedConnections }) ||
    current.operations.some(({ operationRef }) => operationRef === operation.operationRef) ||
    current.connections.some(({ connectionRef }) => suppliedConnections.includes(connectionRef)) ||
    ownedConnections.some(({ operationRef }) => operationRef !== operation.operationRef) ||
    !sameOrdered(expectedConnections, suppliedConnections) ||
    (lastOperation !== undefined && operation.assembly.order <= lastOperation.assembly.order)
  )
    return harnessBlocked(
      'invalid-operation-replay',
      'Replay must append one new operation and its exact owned connections in explicit graph order.',
      current,
    );

  const candidate: PatternImportDxfPhaseEGoldenCardReconstructionSnapshotV1 = {
    ...harnessCandidate(current),
    connections: [...current.connections, ...structuredClone(ownedConnections)],
    operations: [...current.operations, structuredClone(operation)],
  };
  const issue = snapshotIssue(candidate, true);
  if (issue)
    return harnessBlocked(
      'invalid-operation-replay',
      `Replayed operation is not a valid sanitized reconstruction step: ${issue}.`,
      current,
    );
  return Object.freeze({
    ok: true as const,
    session: deepFreeze({
      ...current,
      revision: current.revision + 1,
      connections: candidate.connections,
      operations: candidate.operations,
    }),
    blocker: null,
  });
}

/** Final comparison only; it performs no save, topology minting or production-card read. */
export function finalizePatternImportDxfPhaseEGoldenCardReconstructionHarnessV1(
  current: PatternImportDxfPhaseEGoldenCardReconstructionHarnessV1,
  baseline: PatternImportDxfPhaseEGoldenCardReconstructionSnapshotV1,
): PatternImportDxfPhaseEGoldenCardReconstructionResultV1 {
  return verifyPatternImportDxfPhaseEGoldenCardReconstructionV1(
    baseline,
    harnessCandidate(current),
  );
}
