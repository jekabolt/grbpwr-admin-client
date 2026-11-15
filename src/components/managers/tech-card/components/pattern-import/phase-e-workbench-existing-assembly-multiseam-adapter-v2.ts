import type { PatternImportDxfProductPhaseEMultiseamExistingAssemblyInputV2 } from 'lib/pattern-import/dxf-product-phase-e-multiseam-workbench-v2';
import type {
  AssemblyContext,
  AssemblySeamAnchorContext,
  AssemblySeamExactContext,
  AssemblySeamSummaryContext,
} from 'lib/pattern-import/types';

import { patternImportDxfPhaseEKindForWorkTokenV1 } from './phase-e-workbench-existing-assembly-adapter-v1';

export const PATTERN_IMPORT_DXF_PHASE_E_WORKBENCH_EXISTING_ASSEMBLY_MULTISEAM_ADAPTER_V2 =
  'pattern-import-dxf-phase-e-workbench-existing-assembly-multiseam-adapter/2' as const;

type PreservedAnchorV2 = Readonly<{
  pieceLineKey: string;
  edgeHint: string;
  range: readonly [number, number];
  lenMm: number;
  contourSig: string;
  samples: readonly (readonly [number, number])[];
  layer?: AssemblySeamAnchorContext['layer'];
}>;

type PreservedSeamV2 = Readonly<{
  seamKey: string;
  confirmed: boolean;
  stale: boolean;
  kind: AssemblySeamExactContext['kind'];
  direction: AssemblySeamExactContext['direction'];
  source: AssemblySeamExactContext['source'];
  anchoredSize: string;
  sideA: readonly PreservedAnchorV2[];
  sideB: readonly PreservedAnchorV2[];
}>;

export type PatternImportDxfPhaseEWorkbenchExistingAssemblyMultiseamInputV2 = Readonly<
  Omit<PatternImportDxfProductPhaseEMultiseamExistingAssemblyInputV2, 'seams'> & {
    /** Full StoredSeam evidence is retained, but never promoted to contour/vertex authority. */
    seams: readonly PreservedSeamV2[];
  }
>;

export type PatternImportDxfPhaseEWorkbenchExistingAssemblyMultiseamAdapterBlockerCodeV2 =
  | 'assembly-contract-invalid'
  | 'selected-operation-number-invalid'
  | 'selected-operation-number-ambiguous'
  | 'selected-operation-missing'
  | 'selected-operation-seams-unsupported'
  | 'selected-operation-kind-unsupported'
  | 'authoring-operation-id-invalid'
  | 'selected-seam-missing-or-ambiguous'
  | 'selected-seam-not-exact'
  | 'selected-seam-not-current'
  | 'selected-seam-shape-unsupported'
  | 'selected-seam-piece-set-mismatch'
  | 'selected-seam-owner-ambiguous';

export type PatternImportDxfPhaseEWorkbenchExistingAssemblyMultiseamAdapterResultV2 =
  | Readonly<{
      ok: true;
      selectedOperationNumber: number;
      existingAssembly: PatternImportDxfPhaseEWorkbenchExistingAssemblyMultiseamInputV2;
      blockers: readonly [];
    }>
  | Readonly<{
      ok: false;
      selectedOperationNumber: null;
      existingAssembly: null;
      blockers: readonly [
        Readonly<{
          code: PatternImportDxfPhaseEWorkbenchExistingAssemblyMultiseamAdapterBlockerCodeV2;
          detail: string;
        }>,
      ];
    }>;

export const PATTERN_IMPORT_DXF_PHASE_E_WORKBENCH_EXISTING_ASSEMBLY_MULTISEAM_ADAPTER_CONTRACT_V2 =
  Object.freeze({
    boundedPieceCount: 2,
    boundedSeamCount: 2,
    boundedOperationCount: 1,
    existingAssemblyOrderIsSoleTopologySource: true,
    exactStoredSeamFieldsProjected: true,
    fullStoredAnchorEvidencePreserved: true,
    edgeHintsRangesAndSamplesAreGeometryAuthority: false,
    createsSecondAssemblyOrder: false,
    nearestOrSnappingUsed: false,
    operationKindDerivedFromAuthoritativeWorkToken: true,
    unknownOrNonStitchWorkTokenAccepted: false,
    atomicTwoSeamAdmission: true,
    accessorBackedAssemblyInputAccepted: false,
    detachedSnapshotUsed: true,
    arbitraryGarmentSupported: false,
  } as const);

function blocked(
  code: PatternImportDxfPhaseEWorkbenchExistingAssemblyMultiseamAdapterBlockerCodeV2,
  detail: string,
): PatternImportDxfPhaseEWorkbenchExistingAssemblyMultiseamAdapterResultV2 {
  return Object.freeze({
    ok: false as const,
    selectedOperationNumber: null,
    existingAssembly: null,
    blockers: Object.freeze([Object.freeze({ code, detail })]) as readonly [
      Readonly<{ code: typeof code; detail: string }>,
    ],
  });
}

function isExactSeam(
  seam: AssemblySeamSummaryContext | AssemblySeamExactContext,
): seam is AssemblySeamExactContext {
  return Object.prototype.hasOwnProperty.call(seam, 'seamKey');
}

function stableAuthoringOperationId(value: string): boolean {
  return /^(?=.*[A-Za-z])[A-Za-z0-9][A-Za-z0-9._:/-]*$/.test(value);
}

function descriptorSafeDataGraph(value: unknown, seen = new Set<object>()): boolean {
  if (
    value === null ||
    value === undefined ||
    typeof value === 'string' ||
    typeof value === 'number' ||
    typeof value === 'boolean'
  )
    return true;
  if (typeof value !== 'object' || seen.has(value)) return typeof value === 'object';
  seen.add(value);
  try {
    const array = Array.isArray(value);
    const prototype = Object.getPrototypeOf(value);
    if (!array && prototype !== Object.prototype && prototype !== null) return false;
    const descriptors = Object.getOwnPropertyDescriptors(value);
    for (const key of Reflect.ownKeys(descriptors)) {
      if (typeof key === 'symbol') return false;
      if (array && key === 'length') continue;
      const descriptor = descriptors[key];
      if (
        !descriptor ||
        !descriptor.enumerable ||
        !Object.prototype.hasOwnProperty.call(descriptor, 'value') ||
        !descriptorSafeDataGraph(descriptor.value, seen)
      )
        return false;
    }
    return true;
  } catch {
    return false;
  }
}

function anchorPiecePair(seam: AssemblySeamExactContext): readonly [string, string] | null {
  if (
    seam.sideA.length !== 1 ||
    seam.sideB.length !== 1 ||
    !seam.sideA[0].pieceLineKey ||
    !seam.sideB[0].pieceLineKey ||
    seam.sideA[0].pieceLineKey === seam.sideB[0].pieceLineKey
  )
    return null;
  return [seam.sideA[0].pieceLineKey, seam.sideB[0].pieceLineKey].sort() as [string, string];
}

function copyAnchor(anchor: AssemblySeamAnchorContext): PreservedAnchorV2 {
  return Object.freeze({
    pieceLineKey: anchor.pieceLineKey,
    edgeHint: anchor.edgeHint,
    range: Object.freeze([anchor.range[0], anchor.range[1]]) as readonly [number, number],
    lenMm: anchor.lenMm,
    contourSig: anchor.contourSig,
    samples: Object.freeze(
      anchor.samples.map(([u, v]) => Object.freeze([u, v]) as readonly [number, number]),
    ),
    ...(anchor.layer ? { layer: anchor.layer } : {}),
  });
}

/**
 * Copies one bounded two-seam Assembly Order row into the pure V2 proposal boundary. Stored edge
 * evidence remains diagnostic/prefill evidence; exact Phase-D contour and vertex choices still
 * belong to the explicit workbench.
 */
export function adaptPatternImportDxfPhaseEWorkbenchExistingAssemblyMultiseamV2(
  assembly: AssemblyContext,
  selectedOperationNumber: number,
  authoringOperationId: string | null = null,
): PatternImportDxfPhaseEWorkbenchExistingAssemblyMultiseamAdapterResultV2 {
  if (!descriptorSafeDataGraph(assembly))
    return blocked(
      'assembly-contract-invalid',
      'Assembly Order evidence must be a detached plain data graph without accessors.',
    );
  let assemblySnapshot: AssemblyContext;
  try {
    assemblySnapshot = structuredClone(assembly);
  } catch {
    return blocked(
      'assembly-contract-invalid',
      'Assembly Order evidence could not be detached before admission.',
    );
  }
  if (!Number.isSafeInteger(selectedOperationNumber) || selectedOperationNumber <= 0)
    return blocked(
      'selected-operation-number-invalid',
      'The selected Assembly Order operation must expose one explicit positive saved operation number.',
    );
  const selectedOperations = assemblySnapshot.ops.filter(
    ({ number }) => number === selectedOperationNumber,
  );
  if (selectedOperations.length > 1)
    return blocked(
      'selected-operation-number-ambiguous',
      'The selected saved operation number must identify exactly one Assembly Order row.',
    );
  if (selectedOperations.length !== 1)
    return blocked(
      'selected-operation-missing',
      'The selected Assembly Order operation must still resolve exactly once.',
    );
  if (authoringOperationId !== null && !stableAuthoringOperationId(authoringOperationId))
    return blocked(
      'authoring-operation-id-invalid',
      'The optional authoring operation ID must be one explicit stable persisted identity.',
    );

  const selectedOperation = selectedOperations[0];
  const seamKeys = selectedOperation.seamKeys ?? [];
  if (seamKeys.length !== 2 || new Set(seamKeys).size !== 2 || seamKeys.some((seamKey) => !seamKey))
    return blocked(
      'selected-operation-seams-unsupported',
      'Bounded V2 requires exactly two distinct existing seam keys on the selected operation.',
    );
  const selectedOperationKind = patternImportDxfPhaseEKindForWorkTokenV1(selectedOperation.work);
  if (!selectedOperationKind)
    return blocked(
      'selected-operation-kind-unsupported',
      'The selected operation must use one recognized structural stitch work token.',
    );
  if (
    assemblySnapshot.ops.some(
      (operation) =>
        operation !== selectedOperation &&
        (operation.seamKeys ?? []).some((seamKey) => seamKeys.includes(seamKey)),
    )
  )
    return blocked(
      'selected-seam-owner-ambiguous',
      'Neither selected seam may be owned by another Assembly Order operation.',
    );

  const exactSeams = assemblySnapshot.seams.filter(isExactSeam);
  const selectedSeams: AssemblySeamExactContext[] = [];
  for (const seamKey of seamKeys) {
    const allMatches = assemblySnapshot.seams.filter(
      (seam) => isExactSeam(seam) && seam.seamKey === seamKey,
    );
    if (allMatches.length !== 1)
      return blocked(
        'selected-seam-missing-or-ambiguous',
        `Selected seam ${seamKey} must resolve exactly once.`,
      );
    const seam = allMatches[0] as AssemblySeamExactContext;
    if (!isExactSeam(seam))
      return blocked(
        'selected-seam-not-exact',
        `Selected seam ${seamKey} must expose one full StoredSeam row.`,
      );
    if (!seam.confirmed || seam.stale)
      return blocked(
        'selected-seam-not-current',
        `Selected seam ${seamKey} must be confirmed and non-stale.`,
      );
    if (!seam.anchoredSize || seam.direction === 'unknown')
      return blocked(
        'selected-seam-shape-unsupported',
        `Selected seam ${seamKey} must retain an anchored size and explicit direction.`,
      );
    const pair = anchorPiecePair(seam);
    if (!pair)
      return blocked(
        'selected-seam-shape-unsupported',
        `Selected seam ${seamKey} must expose one exact anchor on each of two distinct pieces.`,
      );
    const declaredPieces = [...new Set(seam.pieces)].sort();
    if (
      declaredPieces.length !== 2 ||
      declaredPieces[0] !== pair[0] ||
      declaredPieces[1] !== pair[1]
    )
      return blocked(
        'selected-seam-shape-unsupported',
        `Selected seam ${seamKey} piece identities must exact-match its two stored anchors.`,
      );
    selectedSeams.push(seam);
  }

  const firstPair = anchorPiecePair(selectedSeams[0])!;
  const secondPair = anchorPiecePair(selectedSeams[1])!;
  if (firstPair[0] !== secondPair[0] || firstPair[1] !== secondPair[1])
    return blocked(
      'selected-seam-piece-set-mismatch',
      'Both selected seams must bind the exact same two distinct piece line identities.',
    );

  const operations = assemblySnapshot.ops.map((operation) =>
    Object.freeze({
      authoringOperationId:
        operation.number === selectedOperationNumber ? authoringOperationId : null,
      number: operation.number,
      work: operation.work,
      phaseEKind:
        operation.number === selectedOperationNumber
          ? selectedOperationKind
          : patternImportDxfPhaseEKindForWorkTokenV1(operation.work),
      inputKeys: Object.freeze([...(operation.inputKeys ?? [])]),
      outputUnitKey: operation.outputUnitKey,
      outputUnitName: operation.outputUnitName,
      seamKeys: Object.freeze([...(operation.seamKeys ?? [])]),
    }),
  );
  const selectedKeySet = new Set(seamKeys);
  const seams = exactSeams
    .filter(({ seamKey }) => selectedKeySet.has(seamKey))
    .map((seam) =>
      Object.freeze({
        seamKey: seam.seamKey,
        confirmed: seam.confirmed,
        stale: seam.stale,
        kind: seam.kind,
        direction: seam.direction,
        source: seam.source,
        anchoredSize: seam.anchoredSize,
        sideA: Object.freeze(seam.sideA.map(copyAnchor)),
        sideB: Object.freeze(seam.sideB.map(copyAnchor)),
      }),
    );

  return Object.freeze({
    ok: true as const,
    selectedOperationNumber,
    existingAssembly: Object.freeze({
      operations: Object.freeze(operations),
      seams: Object.freeze(seams),
      selectedOperationNumber,
    }),
    blockers: Object.freeze([]) as readonly [],
  });
}
