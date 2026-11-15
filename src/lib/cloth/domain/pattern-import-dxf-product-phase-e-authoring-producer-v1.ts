import type { DxfAssemblyOperationV1, DxfMaterialAssignmentV1 } from './dxf-assembly-handoff-v1';
import {
  PATTERN_IMPORT_DXF_PRODUCT_PHASE_E_AUTHORING_CATALOG_V1,
  type PatternImportDxfProductPhaseEAuthoringCatalogV1,
} from './pattern-import-dxf-product-phase-e-authoring-catalog-v1';
import {
  PATTERN_IMPORT_DXF_PRODUCT_PHASE_E_AUTHORING_SUBMISSION_V1,
  type PatternImportDxfProductPhaseEAuthoringSubmissionV1,
} from './pattern-import-dxf-product-phase-e-authoring-compiler-v1';
import type { PatternImportDxfTwoSidedSeamToleranceV1 } from './pattern-import-dxf-two-sided-seam-mapping-v1';

export const PATTERN_IMPORT_DXF_PRODUCT_PHASE_E_AUTHORING_CHOICES_V1 =
  'pattern-import-dxf-product-phase-e-authoring-choices/1' as const;

export type PatternImportDxfProductPhaseEAuthoringChoicesV1 = Readonly<{
  schemaVersion: typeof PATTERN_IMPORT_DXF_PRODUCT_PHASE_E_AUTHORING_CHOICES_V1;
  expectedCatalogCanonicalSha256: string;
  /** Exact read-only Assembly Order proposal admitted by the explicit workbench open. */
  expectedProposalFingerprint: string;
  /** Monotonic confirmed-import registration that owns this authored record. */
  importGeneration: number;
  documentId: string;
  revision: string;
  physicalSurface:
    | Readonly<{ mode: 'sewing-surface'; seamAllowancePhysical: false }>
    | Readonly<{ mode: 'cut-surface'; seamAllowancePhysical: true }>;
  seam: Readonly<{
    id: string;
    operationId: string;
    mapping: 'equal';
    lengthRatio: 1;
    sides: readonly [
      Readonly<{
        pieceId: string;
        contourId: string;
        anchors: readonly [startBoundaryVertexId: string, endBoundaryVertexId: string];
        direction: 'forward' | 'reverse';
      }>,
      Readonly<{
        pieceId: string;
        contourId: string;
        anchors: readonly [startBoundaryVertexId: string, endBoundaryVertexId: string];
        direction: 'forward' | 'reverse';
      }>,
    ];
  }>;
  operations: readonly DxfAssemblyOperationV1[];
  materials: readonly DxfMaterialAssignmentV1[];
  tolerance: PatternImportDxfTwoSidedSeamToleranceV1;
}>;

type ProducerBlockerCode =
  | 'invalid-authoring-choices'
  | 'catalog-seal-mismatch'
  | 'piece-choice-mismatch'
  | 'contour-choice-mismatch'
  | 'anchor-choice-mismatch'
  | 'physical-surface-choice-mismatch';

export type PatternImportDxfProductPhaseEAuthoringProduceResultV1 =
  | Readonly<{
      ok: true;
      submission: PatternImportDxfProductPhaseEAuthoringSubmissionV1;
      blockers: readonly [];
      claims: typeof PATTERN_IMPORT_DXF_PRODUCT_PHASE_E_AUTHORING_PRODUCER_CLAIMS_V1;
    }>
  | Readonly<{
      ok: false;
      submission: null;
      blockers: readonly [Readonly<{ code: ProducerBlockerCode; detail: string }>];
      claims: typeof BLOCKED_CLAIMS;
    }>;

export const PATTERN_IMPORT_DXF_PRODUCT_PHASE_E_AUTHORING_PRODUCER_CLAIMS_V1 = Object.freeze({
  deliberateChoiceInputRequired: true,
  importGenerationCopiedFromExplicitChoices: true,
  pieceLineKeysProjectedFromExactCatalog: true,
  seamPairingInferred: false,
  contourInferred: false,
  anchorsInferred: false,
  directionInferred: false,
  physicalSurfaceInferred: false,
  operationOrderInferred: false,
  materialRevisionInferred: false,
  compilerExecuted: false,
  registryAdmissionPerformed: false,
  productionReady: false,
} as const);

const BLOCKED_CLAIMS = Object.freeze({
  deliberateChoiceInputRequired: true as const,
  importGenerationCopiedFromExplicitChoices: false as const,
  pieceLineKeysProjectedFromExactCatalog: false as const,
  seamPairingInferred: false as const,
  contourInferred: false as const,
  anchorsInferred: false as const,
  directionInferred: false as const,
  physicalSurfaceInferred: false as const,
  operationOrderInferred: false as const,
  materialRevisionInferred: false as const,
  compilerExecuted: false as const,
  registryAdmissionPerformed: false as const,
  productionReady: false as const,
});

const SHA256 = /^[0-9a-f]{64}$/;
const MAX_DATA_NODES = 250_000;
const MAX_DATA_DEPTH = 48;

function blocked(
  code: ProducerBlockerCode,
  detail: string,
): PatternImportDxfProductPhaseEAuthoringProduceResultV1 {
  return Object.freeze({
    ok: false as const,
    submission: null,
    blockers: Object.freeze([Object.freeze({ code, detail })]) as readonly [
      Readonly<{ code: ProducerBlockerCode; detail: string }>,
    ],
    claims: BLOCKED_CLAIMS,
  });
}

/** Copies only bounded JSON-like data and refuses accessors, symbols, cycles and exotic objects. */
function cloneData<T>(input: T): T {
  let nodes = 0;
  const active = new Set<object>();
  const visit = (value: unknown, depth: number): unknown => {
    if (depth > MAX_DATA_DEPTH || ++nodes > MAX_DATA_NODES) throw new TypeError('data bound');
    if (
      value === null ||
      typeof value === 'string' ||
      typeof value === 'boolean' ||
      (typeof value === 'number' && Number.isFinite(value) && !Object.is(value, -0))
    )
      return value;
    if (!value || typeof value !== 'object' || active.has(value)) throw new TypeError('data shape');
    if (Object.getPrototypeOf(value) !== Object.prototype && !Array.isArray(value))
      throw new TypeError('data prototype');
    active.add(value);
    try {
      const descriptors = Object.getOwnPropertyDescriptors(value);
      if (Reflect.ownKeys(descriptors).some((key) => typeof key !== 'string'))
        throw new TypeError('symbol key');
      if (Array.isArray(value)) {
        const keys = Object.keys(descriptors).filter((key) => key !== 'length');
        if (
          keys.length !== value.length ||
          keys.some((key, index) => key !== String(index)) ||
          descriptors.length?.value !== value.length
        )
          throw new TypeError('sparse array');
        return keys.map((key) => {
          const descriptor = descriptors[key];
          if (
            !descriptor?.enumerable ||
            !Object.prototype.hasOwnProperty.call(descriptor, 'value') ||
            descriptor.get !== undefined ||
            descriptor.set !== undefined
          )
            throw new TypeError('array accessor');
          return visit(descriptor.value, depth + 1);
        });
      }
      const output: Record<string, unknown> = {};
      for (const key of Object.keys(descriptors)) {
        const descriptor = descriptors[key];
        if (
          !descriptor?.enumerable ||
          !Object.prototype.hasOwnProperty.call(descriptor, 'value') ||
          descriptor.get !== undefined ||
          descriptor.set !== undefined
        )
          throw new TypeError('object accessor');
        output[key] = visit(descriptor.value, depth + 1);
      }
      return output;
    } finally {
      active.delete(value);
    }
  };
  return visit(input, 0) as T;
}

function exactKeys(value: unknown, expected: readonly string[]): value is Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const keys = Object.keys(value).sort();
  const wanted = [...expected].sort();
  return keys.length === wanted.length && keys.every((key, index) => key === wanted[index]);
}

function deepFreeze<T>(value: T, seen = new Set<object>()): T {
  if (!value || typeof value !== 'object' || seen.has(value) || Object.isFrozen(value))
    return value;
  seen.add(value);
  for (const child of Object.values(value as Record<string, unknown>)) deepFreeze(child, seen);
  return Object.freeze(value);
}

function hasAuthorableCatalogShape(
  value: unknown,
): value is PatternImportDxfProductPhaseEAuthoringCatalogV1 {
  if (!value || typeof value !== 'object') return false;
  const candidate = value as Partial<PatternImportDxfProductPhaseEAuthoringCatalogV1>;
  return (
    Array.isArray(candidate.pieces) &&
    candidate.pieces.every(
      (piece: PatternImportDxfProductPhaseEAuthoringCatalogV1['pieces'][number]) =>
        !!piece &&
        typeof piece.pieceId === 'string' &&
        typeof piece.pieceLineKey === 'string' &&
        Array.isArray(piece.contours) &&
        piece.contours.every(
          (
            contour: PatternImportDxfProductPhaseEAuthoringCatalogV1['pieces'][number]['contours'][number],
          ) =>
            !!contour &&
            typeof contour.contourId === 'string' &&
            Array.isArray(contour.boundaryVertices) &&
            contour.boundaryVertices.every(
              (
                vertex: PatternImportDxfProductPhaseEAuthoringCatalogV1['pieces'][number]['contours'][number]['boundaryVertices'][number],
              ) => !!vertex && typeof vertex.vertexId === 'string',
            ),
        ),
    )
  );
}

/**
 * Converts deliberate UI/domain choices into the compiler submission. It projects only the exact
 * catalog-bound piece line keys; every assembly/material decision remains caller-authored.
 */
export function producePatternImportDxfProductPhaseEAuthoringSubmissionV1(
  suppliedCatalog: PatternImportDxfProductPhaseEAuthoringCatalogV1,
  suppliedChoices: PatternImportDxfProductPhaseEAuthoringChoicesV1,
): PatternImportDxfProductPhaseEAuthoringProduceResultV1 {
  let catalog: PatternImportDxfProductPhaseEAuthoringCatalogV1;
  let choices: PatternImportDxfProductPhaseEAuthoringChoicesV1;
  try {
    catalog = cloneData(suppliedCatalog);
    choices = cloneData(suppliedChoices);
  } catch {
    return blocked(
      'invalid-authoring-choices',
      'Catalog and choices must be bounded accessor-free data.',
    );
  }
  if (!hasAuthorableCatalogShape(catalog))
    return blocked(
      'invalid-authoring-choices',
      'The producer requires an exact authorable V1 catalog shape.',
    );
  if (
    !exactKeys(choices, [
      'schemaVersion',
      'expectedCatalogCanonicalSha256',
      'expectedProposalFingerprint',
      'importGeneration',
      'documentId',
      'revision',
      'physicalSurface',
      'seam',
      'operations',
      'materials',
      'tolerance',
    ]) ||
    choices.schemaVersion !== PATTERN_IMPORT_DXF_PRODUCT_PHASE_E_AUTHORING_CHOICES_V1 ||
    typeof choices.expectedProposalFingerprint !== 'string' ||
    !choices.expectedProposalFingerprint ||
    choices.expectedProposalFingerprint.length > 256 ||
    !Number.isSafeInteger(choices.importGeneration) ||
    choices.importGeneration <= 0 ||
    !exactKeys(choices.physicalSurface, ['mode', 'seamAllowancePhysical']) ||
    !exactKeys(choices.seam, ['id', 'operationId', 'mapping', 'lengthRatio', 'sides']) ||
    !Array.isArray(choices.seam.sides) ||
    choices.seam.sides.length !== 2 ||
    choices.seam.sides.some(
      (side) =>
        !exactKeys(side, ['pieceId', 'contourId', 'anchors', 'direction']) ||
        !Array.isArray(side.anchors) ||
        side.anchors.length !== 2,
    ) ||
    !Array.isArray(choices.operations) ||
    choices.operations.some(
      (operation) =>
        !exactKeys(operation, ['id', 'stage', 'order', 'kind', 'seamIds']) ||
        !Array.isArray(operation.seamIds),
    ) ||
    !Array.isArray(choices.materials) ||
    choices.materials.some(
      (material) =>
        !exactKeys(material, ['id', 'pieceIds', 'materialRevision']) ||
        !Array.isArray(material.pieceIds),
    ) ||
    !exactKeys(choices.tolerance, ['endpointMm', 'fullLengthMm', 'fullLengthRelative'])
  )
    return blocked(
      'invalid-authoring-choices',
      'The producer requires one exact explicit V1 choice record without extra fields.',
    );
  if (
    catalog.schemaVersion !== PATTERN_IMPORT_DXF_PRODUCT_PHASE_E_AUTHORING_CATALOG_V1 ||
    !SHA256.test(catalog.canonicalSha256 ?? '') ||
    choices.expectedCatalogCanonicalSha256 !== catalog.canonicalSha256
  )
    return blocked(
      'catalog-seal-mismatch',
      'The choices must bind the exact current authoring catalog SHA.',
    );
  const expectedRole =
    choices.physicalSurface.mode === 'sewing-surface'
      ? choices.physicalSurface.seamAllowancePhysical === false
        ? 'sewing-boundary'
        : null
      : choices.physicalSurface.mode === 'cut-surface' &&
          choices.physicalSurface.seamAllowancePhysical === true
        ? 'cut-boundary'
        : null;
  if (!expectedRole)
    return blocked(
      'physical-surface-choice-mismatch',
      'Physical surface and seam-allowance ownership must be an exact explicit pair.',
    );
  if (
    catalog.pieces.length !== 2 ||
    choices.seam.mapping !== 'equal' ||
    choices.seam.lengthRatio !== 1
  )
    return blocked(
      'piece-choice-mismatch',
      'V1 requires exactly two catalog pieces and one deliberately chosen equal seam.',
    );

  const projectedSides: PatternImportDxfProductPhaseEAuthoringSubmissionV1['seam']['sides'][number][] =
    [];
  const seenPieces = new Set<string>();
  for (const side of choices.seam.sides) {
    const pieces = catalog.pieces.filter(({ pieceId }) => pieceId === side.pieceId);
    if (pieces.length !== 1 || seenPieces.has(side.pieceId))
      return blocked(
        'piece-choice-mismatch',
        'Each deliberate side must choose one distinct exact catalog piece.',
      );
    seenPieces.add(side.pieceId);
    const contours = pieces[0].contours.filter(({ contourId }) => contourId === side.contourId);
    if (contours.length !== 1)
      return blocked(
        'contour-choice-mismatch',
        'Each deliberate side must choose one exact catalog contour.',
      );
    if (contours[0].role !== expectedRole)
      return blocked(
        'physical-surface-choice-mismatch',
        `The chosen ${choices.physicalSurface.mode} requires ${expectedRole} contours.`,
      );
    if (
      side.anchors[0] === side.anchors[1] ||
      side.anchors.some(
        (anchor: string) =>
          contours[0].boundaryVertices.filter(({ vertexId }) => vertexId === anchor).length !== 1,
      ) ||
      !['forward', 'reverse'].includes(side.direction)
    )
      return blocked(
        'anchor-choice-mismatch',
        'Each deliberate side needs two distinct exact catalog vertices and a direction.',
      );
    projectedSides.push({
      pieceLineKey: pieces[0].pieceLineKey,
      pieceId: side.pieceId,
      contourId: side.contourId,
      anchors: [side.anchors[0], side.anchors[1]],
      direction: side.direction,
    });
  }
  if (seenPieces.size !== 2 || projectedSides.length !== 2)
    return blocked('piece-choice-mismatch', 'Both exact catalog pieces must be chosen once.');

  return deepFreeze({
    ok: true as const,
    submission: {
      schemaVersion: PATTERN_IMPORT_DXF_PRODUCT_PHASE_E_AUTHORING_SUBMISSION_V1,
      expectedCatalogCanonicalSha256: choices.expectedCatalogCanonicalSha256,
      importGeneration: choices.importGeneration,
      documentId: choices.documentId,
      revision: choices.revision,
      physicalSurface:
        choices.physicalSurface.mode === 'sewing-surface'
          ? { mode: 'sewing-surface' as const, seamAllowancePhysical: false as const }
          : { mode: 'cut-surface' as const, seamAllowancePhysical: true as const },
      seam: {
        id: choices.seam.id,
        operationId: choices.seam.operationId,
        sides: [projectedSides[0], projectedSides[1]],
        mapping: 'equal' as const,
        lengthRatio: 1 as const,
      },
      operations: choices.operations.map(({ id, stage, order, kind, seamIds }) => ({
        id,
        stage,
        order,
        kind,
        seamIds: [...seamIds],
      })),
      materials: choices.materials.map(({ id, pieceIds, materialRevision }) => ({
        id,
        pieceIds: [...pieceIds],
        materialRevision,
      })),
      tolerance: {
        endpointMm: choices.tolerance.endpointMm,
        fullLengthMm: choices.tolerance.fullLengthMm,
        fullLengthRelative: choices.tolerance.fullLengthRelative,
      },
    },
    blockers: [] as const,
    claims: PATTERN_IMPORT_DXF_PRODUCT_PHASE_E_AUTHORING_PRODUCER_CLAIMS_V1,
  });
}
