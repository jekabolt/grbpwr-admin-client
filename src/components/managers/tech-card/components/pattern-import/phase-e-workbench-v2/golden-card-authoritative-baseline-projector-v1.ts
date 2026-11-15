import type { DxfMaterialAssignmentV1, DxfSeamV1 } from 'lib/cloth/domain/dxf-assembly-handoff-v1';

import {
  PATTERN_IMPORT_DXF_PHASE_E_GOLDEN_CARD_FULL_EXACT_CAPTURE_CLAIMS_V1,
  PATTERN_IMPORT_DXF_PHASE_E_GOLDEN_CARD_FULL_EXACT_CAPTURE_GRAPH_V1,
  type PatternImportDxfPhaseEGoldenCardFullExactCaptureGraphV1,
  type PatternImportDxfPhaseEGoldenCardFullExactConnectionV1,
  type PatternImportDxfPhaseEGoldenCardFullExactOperationV1,
} from './golden-card-full-exact-capture-aggregator-v1';
import {
  PATTERN_IMPORT_DXF_PHASE_E_GOLDEN_CARD_RECONSTRUCTION_SNAPSHOT_V1,
  verifyPatternImportDxfPhaseEGoldenCardReconstructionV1,
  type PatternImportDxfPhaseEGoldenCardBomRefV1,
  type PatternImportDxfPhaseEGoldenCardCatalogV1,
  type PatternImportDxfPhaseEGoldenCardColorwayRefV1,
  type PatternImportDxfPhaseEGoldenCardConnectionV1,
  type PatternImportDxfPhaseEGoldenCardOperationV1,
  type PatternImportDxfPhaseEGoldenCardReconstructionSnapshotV1,
} from './golden-card-reconstruction-v1';
import {
  PATTERN_IMPORT_DXF_PHASE_E_GOLDEN_CARD_SUITE_PROFILES_V1,
  verifyPatternImportDxfPhaseEGoldenCardSuiteProfileV1,
  type PatternImportDxfPhaseEGoldenCardObservedFactsV1,
} from './golden-card-suite-profiles-v1';
import type { PatternImportDxfPhaseEGoldenWholeCardCurrentOperationV1 } from './golden-whole-card-baseline-v1';

export const PATTERN_IMPORT_DXF_PHASE_E_GOLDEN_CARD_AUTHORITATIVE_BASELINE_PROJECTOR_V1 =
  'pattern-import-dxf-phase-e-golden-card-authoritative-baseline-projector/1' as const;

const STABLE_REF = /^[A-Za-z0-9][A-Za-z0-9._:/#-]{0,255}$/;
const MAX_ITEMS = 16_384;
const MAX_REVISION_BYTES = 512;
const encoder = new TextEncoder();

export const PATTERN_IMPORT_DXF_PHASE_E_GOLDEN_CARD_AUTHORITATIVE_BASELINE_PROJECTOR_CLAIMS_V1 =
  Object.freeze({
    selectedCardsPinnedToSixAndEleven: true,
    existingPreflightFactsRequired: true,
    existingGetTechCardOperationProjectionReused: true,
    existingBomColorwayAndStitchTypesReused: true,
    exactFullCardCaptureGraphRequired: true,
    expectedCardLockVersionRequired: true,
    expectedServerAssemblyRevisionRequired: true,
    oneUnifiedExactCatalogRequired: true,
    callerOwnedOperationBindingsRequired: true,
    callerOwnedConnectionRecipesRequired: true,
    completeMaterialBomColorwayProjectionRequired: true,
    completeDependencyAndOutputGraphRequired: true,
    missingEvidenceFailsClosed: true,
    fixturesUsedAsAuthority: false,
    networkUsed: false,
    networkWriteAvailable: false,
    createsTopologyAuthority: false,
    createsAssemblyAuthority: false,
    createsBomOrColorwayAuthority: false,
    createsPersistenceModel: false,
    productionReady: false,
  } as const);

/** Stable operation identity and semantics retained by the saved Assembly owner. */
export type PatternImportDxfPhaseEGoldenCardAuthoritativeOperationBindingV1 = Readonly<{
  operationNumber: number;
  operationRef: string;
  stage: number;
  kind: PatternImportDxfPhaseEGoldenCardOperationV1['assembly']['kind'];
}>;

/** Mapping data is not present in the full exact capture graph and therefore remains explicit. */
export type PatternImportDxfPhaseEGoldenCardAuthoritativeConnectionRecipeV1 = Readonly<{
  connectionRef: string;
  mapping: DxfSeamV1['mapping'];
  lengthRatio: number;
}>;

/**
 * Detached, sanitized projection of the already-held GetTechCard/catalog owners. The counts bind
 * the arrays to the full source projection so a truncated subset cannot become a golden baseline.
 */
export type PatternImportDxfPhaseEGoldenCardAuthoritativeCurrentCardV1 = Readonly<{
  techCardId: number;
  cardLockVersion: number;
  operationCount: number;
  materialAssignmentCount: number;
  bomRefCount: number;
  colorwayCount: number;
  catalog: PatternImportDxfPhaseEGoldenCardCatalogV1;
  currentOperations: readonly PatternImportDxfPhaseEGoldenWholeCardCurrentOperationV1[];
  operationBindings: readonly PatternImportDxfPhaseEGoldenCardAuthoritativeOperationBindingV1[];
  connectionRecipes: readonly PatternImportDxfPhaseEGoldenCardAuthoritativeConnectionRecipeV1[];
  materials: readonly DxfMaterialAssignmentV1[];
  bomRefs: readonly PatternImportDxfPhaseEGoldenCardBomRefV1[];
  colorways: readonly PatternImportDxfPhaseEGoldenCardColorwayRefV1[];
}>;

export type PatternImportDxfPhaseEGoldenCardAuthoritativeBaselineProjectorRequestV1 = Readonly<{
  observedFacts: PatternImportDxfPhaseEGoldenCardObservedFactsV1;
  expectedCardLockVersion: number;
  expectedServerAssemblyRevision: string;
  graph: PatternImportDxfPhaseEGoldenCardFullExactCaptureGraphV1;
  currentCard: PatternImportDxfPhaseEGoldenCardAuthoritativeCurrentCardV1;
}>;

export type PatternImportDxfPhaseEGoldenCardAuthoritativeBaselineProjectorBlockerCodeV1 =
  | 'invalid-request'
  | 'card-not-in-beta-suite'
  | 'profile-drift'
  | 'card-lock-mismatch'
  | 'server-assembly-revision-mismatch'
  | 'full-capture-graph-mismatch'
  | 'catalog-incomplete'
  | 'operation-authority-incomplete'
  | 'operation-graph-mismatch'
  | 'dependency-output-incomplete'
  | 'exact-connection-incomplete'
  | 'connection-recipe-incomplete'
  | 'material-evidence-incomplete'
  | 'bom-evidence-incomplete'
  | 'colorway-evidence-incomplete'
  | 'stitch-evidence-incomplete'
  | 'authoritative-baseline-invalid';

export type PatternImportDxfPhaseEGoldenCardAuthoritativeBaselineProjectorBlockerV1 = Readonly<{
  code: PatternImportDxfPhaseEGoldenCardAuthoritativeBaselineProjectorBlockerCodeV1;
  detail: string;
}>;

export type PatternImportDxfPhaseEGoldenCardAuthoritativeBaselineProjectorResultV1 =
  | Readonly<{
      ok: true;
      schemaVersion: typeof PATTERN_IMPORT_DXF_PHASE_E_GOLDEN_CARD_AUTHORITATIVE_BASELINE_PROJECTOR_V1;
      binding: Readonly<{
        cardRef: string;
        techCardId: number;
        cardLockVersion: number;
        serverAssemblyRevision: string;
      }>;
      baseline: PatternImportDxfPhaseEGoldenCardReconstructionSnapshotV1;
      blockers: readonly [];
      claims: typeof PATTERN_IMPORT_DXF_PHASE_E_GOLDEN_CARD_AUTHORITATIVE_BASELINE_PROJECTOR_CLAIMS_V1;
    }>
  | Readonly<{
      ok: false;
      schemaVersion: typeof PATTERN_IMPORT_DXF_PHASE_E_GOLDEN_CARD_AUTHORITATIVE_BASELINE_PROJECTOR_V1;
      binding: null;
      baseline: null;
      blockers: readonly [PatternImportDxfPhaseEGoldenCardAuthoritativeBaselineProjectorBlockerV1];
      claims: typeof PATTERN_IMPORT_DXF_PHASE_E_GOLDEN_CARD_AUTHORITATIVE_BASELINE_PROJECTOR_CLAIMS_V1;
    }>;

class ProjectionFailure extends Error {
  constructor(
    readonly code: PatternImportDxfPhaseEGoldenCardAuthoritativeBaselineProjectorBlockerCodeV1,
    detail: string,
  ) {
    super(detail);
    this.name = 'PatternImportDxfPhaseEGoldenCardAuthoritativeBaselineProjectionFailureV1';
  }
}

function fail(
  code: PatternImportDxfPhaseEGoldenCardAuthoritativeBaselineProjectorBlockerCodeV1,
  detail: string,
): never {
  throw new ProjectionFailure(code, detail);
}

function blocked(
  code: PatternImportDxfPhaseEGoldenCardAuthoritativeBaselineProjectorBlockerCodeV1,
  detail: string,
): PatternImportDxfPhaseEGoldenCardAuthoritativeBaselineProjectorResultV1 {
  return Object.freeze({
    ok: false as const,
    schemaVersion: PATTERN_IMPORT_DXF_PHASE_E_GOLDEN_CARD_AUTHORITATIVE_BASELINE_PROJECTOR_V1,
    binding: null,
    baseline: null,
    blockers: Object.freeze([Object.freeze({ code, detail })]) as readonly [
      PatternImportDxfPhaseEGoldenCardAuthoritativeBaselineProjectorBlockerV1,
    ],
    claims: PATTERN_IMPORT_DXF_PHASE_E_GOLDEN_CARD_AUTHORITATIVE_BASELINE_PROJECTOR_CLAIMS_V1,
  });
}

function deepFreeze<T>(value: T, seen = new Set<object>()): T {
  if (!value || typeof value !== 'object' || seen.has(value) || Object.isFrozen(value))
    return value;
  seen.add(value);
  for (const child of Object.values(value as Record<string, unknown>)) deepFreeze(child, seen);
  return Object.freeze(value);
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
  if (typeof value !== 'object' || seen.has(value)) return typeof value === 'object';
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

function sameOrdered(left: readonly string[], right: readonly string[]): boolean {
  return left.length === right.length && left.every((value, index) => value === right[index]);
}

function sameConnection(
  left: PatternImportDxfPhaseEGoldenCardFullExactConnectionV1,
  right: PatternImportDxfPhaseEGoldenCardFullExactConnectionV1,
): boolean {
  return (
    left.connectionRef === right.connectionRef &&
    left.operationNumber === right.operationNumber &&
    left.authoringOperationId === right.authoringOperationId &&
    left.serverTopologySha256 === right.serverTopologySha256 &&
    left.catalogCanonicalSha256 === right.catalogCanonicalSha256 &&
    left.sides.length === right.sides.length &&
    left.sides.every((side, index) => {
      const candidate = right.sides[index];
      return (
        side.seamId === candidate.seamId &&
        side.sideIndex === candidate.sideIndex &&
        side.pieceId === candidate.pieceId &&
        side.pieceLineKey === candidate.pieceLineKey &&
        side.contourId === candidate.contourId &&
        sameOrdered(side.boundaryVertexIds, candidate.boundaryVertexIds) &&
        side.direction === candidate.direction
      );
    })
  );
}

function validateRequestShape(
  request: PatternImportDxfPhaseEGoldenCardAuthoritativeBaselineProjectorRequestV1,
): void {
  if (!plainDataGraph(request))
    fail('invalid-request', 'The projection request must be plain data.');
  if (
    !request ||
    !Number.isSafeInteger(request.expectedCardLockVersion) ||
    request.expectedCardLockVersion < 0 ||
    typeof request.expectedServerAssemblyRevision !== 'string' ||
    request.expectedServerAssemblyRevision.length === 0 ||
    encoder.encode(request.expectedServerAssemblyRevision).byteLength > MAX_REVISION_BYTES ||
    !request.observedFacts ||
    !request.currentCard ||
    !request.graph
  )
    fail(
      'invalid-request',
      'Complete bounded lock, revision, facts, graph and card evidence are required.',
    );
}

function validateCardAndRevision(
  request: PatternImportDxfPhaseEGoldenCardAuthoritativeBaselineProjectorRequestV1,
): (typeof PATTERN_IMPORT_DXF_PHASE_E_GOLDEN_CARD_SUITE_PROFILES_V1)[number] {
  const profile = PATTERN_IMPORT_DXF_PHASE_E_GOLDEN_CARD_SUITE_PROFILES_V1.find(
    ({ facts }) => facts.techCardId === request.observedFacts.techCardId,
  );
  if (!profile)
    fail('card-not-in-beta-suite', 'Only pinned production cards 6 and 11 are admitted.');
  const profileResult = verifyPatternImportDxfPhaseEGoldenCardSuiteProfileV1(
    profile,
    request.observedFacts,
  );
  if (!profileResult.ok)
    fail(
      'profile-drift',
      `Pinned card facts drifted at ${profileResult.differences.map(({ path }) => path).join(', ')}.`,
    );
  if (
    request.expectedCardLockVersion !== request.observedFacts.cardVersion ||
    request.currentCard.cardLockVersion !== request.expectedCardLockVersion ||
    request.graph.cardLockVersion !== request.expectedCardLockVersion
  )
    fail(
      'card-lock-mismatch',
      'Preflight, GetTechCard and exact graph must share one pinned lock.',
    );
  if (
    request.graph.serverAssemblyRevision !== request.expectedServerAssemblyRevision ||
    request.graph.serverAssemblyRevision.length === 0
  )
    fail(
      'server-assembly-revision-mismatch',
      'The exact graph is not bound to the expected server Assembly revision.',
    );
  if (
    request.currentCard.techCardId !== profile.facts.techCardId ||
    request.graph.techCardId !== profile.facts.techCardId ||
    request.graph.cardRef !== profile.cardRef
  )
    fail(
      'full-capture-graph-mismatch',
      'Card identity differs across preflight, card and exact graph.',
    );
  if (
    request.graph.schemaVersion !==
      PATTERN_IMPORT_DXF_PHASE_E_GOLDEN_CARD_FULL_EXACT_CAPTURE_GRAPH_V1 ||
    Object.entries(PATTERN_IMPORT_DXF_PHASE_E_GOLDEN_CARD_FULL_EXACT_CAPTURE_CLAIMS_V1).some(
      ([key, value]) =>
        request.graph.claims?.[
          key as keyof typeof PATTERN_IMPORT_DXF_PHASE_E_GOLDEN_CARD_FULL_EXACT_CAPTURE_CLAIMS_V1
        ] !== value,
    )
  )
    fail('full-capture-graph-mismatch', 'The exact graph schema or capture claims are not valid.');
  return profile;
}

function validateCollectionCounts(
  request: PatternImportDxfPhaseEGoldenCardAuthoritativeBaselineProjectorRequestV1,
  listedPieceRefCount: number,
  operationCount: number,
): void {
  const card = request.currentCard;
  const boundedArrays = [
    card.catalog?.pieces,
    card.currentOperations,
    card.operationBindings,
    card.connectionRecipes,
    card.materials,
    card.bomRefs,
    card.colorways,
    request.graph.operations,
    request.graph.connections,
  ];
  if (
    boundedArrays.some((value) => !Array.isArray(value) || value.length > MAX_ITEMS) ||
    !Number.isSafeInteger(card.operationCount) ||
    !Number.isSafeInteger(card.materialAssignmentCount) ||
    !Number.isSafeInteger(card.bomRefCount) ||
    !Number.isSafeInteger(card.colorwayCount)
  )
    fail('invalid-request', 'All baseline collections and source counts must be bounded.');
  if (card.catalog.pieces.length !== listedPieceRefCount)
    fail('catalog-incomplete', 'The exact catalog does not contain every pinned card piece.');
  if (
    card.operationCount !== operationCount ||
    card.currentOperations.length !== operationCount ||
    card.operationBindings.length !== operationCount ||
    request.graph.operations.length !== operationCount
  )
    fail(
      'operation-authority-incomplete',
      'GetTechCard operations, saved identities and exact graph must cover every pinned operation.',
    );
  if (card.materialAssignmentCount < 1 || card.materials.length !== card.materialAssignmentCount)
    fail(
      'material-evidence-incomplete',
      'The complete non-empty GetTechCard material projection is required.',
    );
  if (card.bomRefCount < 1 || card.bomRefs.length !== card.bomRefCount)
    fail(
      'bom-evidence-incomplete',
      'The complete non-empty GetTechCard BOM projection is required.',
    );
  if (card.colorwayCount < 1 || card.colorways.length !== card.colorwayCount)
    fail(
      'colorway-evidence-incomplete',
      'The complete non-empty GetTechCard colourway projection is required.',
    );
  if (
    card.connectionRecipes.length !== request.graph.connections.length ||
    request.graph.connections.length === 0
  )
    fail(
      'connection-recipe-incomplete',
      'Every exact connection requires one authoritative mapping and length recipe.',
    );
}

function validateGraphConnections(
  graph: PatternImportDxfPhaseEGoldenCardFullExactCaptureGraphV1,
  catalog: PatternImportDxfPhaseEGoldenCardCatalogV1,
): Map<string, PatternImportDxfPhaseEGoldenCardFullExactConnectionV1> {
  const byRef = new Map<string, PatternImportDxfPhaseEGoldenCardFullExactConnectionV1>();
  for (const connection of graph.connections) {
    if (
      !connection ||
      !STABLE_REF.test(connection.connectionRef) ||
      byRef.has(connection.connectionRef) ||
      connection.catalogCanonicalSha256 !== catalog.canonicalSha256 ||
      connection.row.techCardId !== graph.techCardId ||
      connection.row.cardLockVersion !== graph.cardLockVersion ||
      connection.sides[0]?.seamId !== connection.connectionRef ||
      connection.sides[0]?.sideIndex !== 0 ||
      connection.sides[1]?.seamId !== connection.connectionRef ||
      connection.sides[1]?.sideIndex !== 1
    )
      fail(
        'exact-connection-incomplete',
        `Connection ${connection?.connectionRef ?? '(unknown)'} is not exact, unique and catalog-bound.`,
      );
    byRef.set(connection.connectionRef, connection);
  }
  const flattened = graph.operations.flatMap(({ exactConnections }) => exactConnections);
  if (
    flattened.length !== graph.connections.length ||
    flattened.some((connection, index) => !sameConnection(connection, graph.connections[index]))
  )
    fail(
      'full-capture-graph-mismatch',
      'Per-operation exact connections do not equal the ordered whole-card connection graph.',
    );
  return byRef;
}

function validateDependenciesAndOutputs(
  graphOperations: readonly PatternImportDxfPhaseEGoldenCardFullExactOperationV1[],
  pieceLineKeys: ReadonlySet<string>,
): void {
  const available = new Set(pieceLineKeys);
  const outputOwners = new Set<string>();
  for (const operation of graphOperations) {
    if (
      operation.inputKeys.some((input) => !available.has(input)) ||
      (operation.outputUnitKey && outputOwners.has(operation.outputUnitKey))
    )
      fail(
        'dependency-output-incomplete',
        `Operation ${operation.operationNumber} has an unresolved dependency or duplicate output.`,
      );
    if (operation.outputUnitKey) {
      outputOwners.add(operation.outputUnitKey);
      available.add(operation.outputUnitKey);
    }
  }
}

function projectOperations(
  request: PatternImportDxfPhaseEGoldenCardAuthoritativeBaselineProjectorRequestV1,
  connectionByRef: ReadonlyMap<string, PatternImportDxfPhaseEGoldenCardFullExactConnectionV1>,
): readonly PatternImportDxfPhaseEGoldenCardOperationV1[] {
  const currentByNumber = new Map(
    request.currentCard.currentOperations.map((operation) => [
      operation.operationNumber,
      operation,
    ]),
  );
  const bindingByNumber = new Map(
    request.currentCard.operationBindings.map((binding) => [binding.operationNumber, binding]),
  );
  if (
    currentByNumber.size !== request.currentCard.currentOperations.length ||
    bindingByNumber.size !== request.currentCard.operationBindings.length
  )
    fail(
      'operation-authority-incomplete',
      'Operation numbers and saved identities must be unique.',
    );

  return Object.freeze(
    request.graph.operations.map((graphOperation, order) => {
      const current = currentByNumber.get(graphOperation.operationNumber);
      const binding = bindingByNumber.get(graphOperation.operationNumber);
      if (!current || !binding || !STABLE_REF.test(binding.operationRef))
        fail(
          'operation-authority-incomplete',
          `Operation ${graphOperation.operationNumber} lacks current-card or saved identity evidence.`,
        );
      if (
        current.work !== graphOperation.work ||
        current.outputUnitKey !== graphOperation.outputUnitKey ||
        current.outputUnitName !== graphOperation.outputUnitName ||
        !sameOrdered(current.inputKeys, graphOperation.inputKeys) ||
        !sameOrdered(current.seamKeys, graphOperation.seamKeys)
      )
        fail(
          'operation-graph-mismatch',
          `Operation ${graphOperation.operationNumber} differs between GetTechCard and exact graph.`,
        );
      if (
        !Number.isSafeInteger(binding.stage) ||
        binding.stage < 0 ||
        !['place', 'stitch', 'release-support'].includes(binding.kind) ||
        (graphOperation.seamKeys.length > 0 && binding.kind !== 'stitch') ||
        (binding.kind === 'stitch' && !current.stitch)
      )
        fail(
          'stitch-evidence-incomplete',
          `Operation ${graphOperation.operationNumber} lacks authoritative kind or stitch styling.`,
        );
      if (
        graphOperation.exactConnections.length !== graphOperation.seamKeys.length ||
        graphOperation.seamKeys.some((seamKey, index) => {
          const exact = graphOperation.exactConnections[index];
          const wholeCardExact = connectionByRef.get(seamKey);
          return (
            exact?.connectionRef !== seamKey ||
            exact.operationNumber !== graphOperation.operationNumber ||
            exact.authoringOperationId !== binding.operationRef ||
            !wholeCardExact ||
            !sameConnection(wholeCardExact, exact)
          );
        })
      )
        fail(
          'exact-connection-incomplete',
          `Operation ${graphOperation.operationNumber} does not own every ordered exact connection.`,
        );

      return deepFreeze({
        operationRef: binding.operationRef,
        assembly: {
          id: binding.operationRef,
          stage: binding.stage,
          order,
          kind: binding.kind,
          seamIds: [...graphOperation.seamKeys],
        },
        card: {
          authoringOperationId: binding.operationRef,
          number: graphOperation.operationNumber,
          work: graphOperation.work,
          phaseEKind: binding.kind === 'stitch' ? ('stitch' as const) : null,
          inputKeys: [...graphOperation.inputKeys],
          outputUnitKey: graphOperation.outputUnitKey,
          outputUnitName: graphOperation.outputUnitName,
          seamKeys: [...graphOperation.seamKeys],
        },
        stitch: binding.kind === 'stitch' ? structuredClone(current.stitch) : null,
      });
    }),
  );
}

function projectConnections(
  request: PatternImportDxfPhaseEGoldenCardAuthoritativeBaselineProjectorRequestV1,
  operations: readonly PatternImportDxfPhaseEGoldenCardOperationV1[],
  connectionByRef: ReadonlyMap<string, PatternImportDxfPhaseEGoldenCardFullExactConnectionV1>,
): readonly PatternImportDxfPhaseEGoldenCardConnectionV1[] {
  const recipes = new Map(
    request.currentCard.connectionRecipes.map((recipe) => [recipe.connectionRef, recipe]),
  );
  if (recipes.size !== request.currentCard.connectionRecipes.length)
    fail('connection-recipe-incomplete', 'Connection mapping recipes must be unique.');
  const operationByNumber = new Map(
    operations.map((operation) => [operation.card.number, operation]),
  );
  return Object.freeze(
    request.graph.operations.flatMap((graphOperation) => {
      const operation = operationByNumber.get(graphOperation.operationNumber);
      if (!operation)
        fail('operation-authority-incomplete', 'An exact connection owner operation is missing.');
      return graphOperation.seamKeys.map((connectionRef) => {
        const exact = connectionByRef.get(connectionRef);
        const recipe = recipes.get(connectionRef);
        if (
          !exact ||
          !recipe ||
          !['equal', 'eased', 'gathered'].includes(recipe.mapping) ||
          !Number.isFinite(recipe.lengthRatio) ||
          recipe.lengthRatio <= 0 ||
          (recipe.mapping === 'equal' && recipe.lengthRatio !== 1)
        )
          fail(
            'connection-recipe-incomplete',
            `Connection ${connectionRef} lacks a valid authoritative seam recipe.`,
          );
        const side = (index: 0 | 1) => ({
          pieceId: exact.sides[index].pieceId,
          pieceLineKey: exact.sides[index].pieceLineKey,
          contourId: exact.sides[index].contourId,
          boundaryVertexIds: [
            exact.sides[index].boundaryVertexIds[0],
            exact.sides[index].boundaryVertexIds[1],
          ] as const,
          direction: exact.sides[index].direction,
        });
        return deepFreeze({
          connectionRef,
          operationRef: operation.operationRef,
          mapping: recipe.mapping,
          lengthRatio: recipe.lengthRatio,
          sides: [side(0), side(1)] as const,
        });
      });
    }),
  );
}

function validateMaterialCoverage(
  catalog: PatternImportDxfPhaseEGoldenCardCatalogV1,
  materials: readonly DxfMaterialAssignmentV1[],
): void {
  const covered = new Set(materials.flatMap(({ pieceIds }) => pieceIds));
  if (catalog.pieces.some(({ pieceId }) => !covered.has(pieceId)))
    fail(
      'material-evidence-incomplete',
      'Every exact catalog piece must be covered by the current material assignments.',
    );
}

/**
 * Pure projection only: every authority is supplied by an existing owner, then exact-matched. No
 * fixture, network call, persistence write, identity fallback or geometry inference exists here.
 */
export function projectPatternImportDxfPhaseEGoldenCardAuthoritativeBaselineV1(
  request: PatternImportDxfPhaseEGoldenCardAuthoritativeBaselineProjectorRequestV1,
): PatternImportDxfPhaseEGoldenCardAuthoritativeBaselineProjectorResultV1 {
  try {
    validateRequestShape(request);
    const profile = validateCardAndRevision(request);
    validateCollectionCounts(
      request,
      profile.facts.listedPieceRefCount,
      profile.facts.operationCount,
    );
    const connectionByRef = validateGraphConnections(request.graph, request.currentCard.catalog);
    validateDependenciesAndOutputs(
      request.graph.operations,
      new Set(request.currentCard.catalog.pieces.map(({ pieceLineKey }) => pieceLineKey)),
    );
    const operations = projectOperations(request, connectionByRef);
    const connections = projectConnections(request, operations, connectionByRef);
    validateMaterialCoverage(request.currentCard.catalog, request.currentCard.materials);

    const baseline = deepFreeze({
      schemaVersion: PATTERN_IMPORT_DXF_PHASE_E_GOLDEN_CARD_RECONSTRUCTION_SNAPSHOT_V1,
      cardRef: profile.cardRef,
      catalog: structuredClone(request.currentCard.catalog),
      connections,
      operations,
      materials: structuredClone(request.currentCard.materials),
      bomRefs: structuredClone(request.currentCard.bomRefs),
      colorways: structuredClone(request.currentCard.colorways),
    } satisfies PatternImportDxfPhaseEGoldenCardReconstructionSnapshotV1);
    const validation = verifyPatternImportDxfPhaseEGoldenCardReconstructionV1(baseline, baseline);
    if (!validation.ok) fail('authoritative-baseline-invalid', validation.blocker.detail);

    return Object.freeze({
      ok: true as const,
      schemaVersion: PATTERN_IMPORT_DXF_PHASE_E_GOLDEN_CARD_AUTHORITATIVE_BASELINE_PROJECTOR_V1,
      binding: Object.freeze({
        cardRef: profile.cardRef,
        techCardId: profile.facts.techCardId,
        cardLockVersion: request.expectedCardLockVersion,
        serverAssemblyRevision: request.expectedServerAssemblyRevision,
      }),
      baseline,
      blockers: Object.freeze([] as const),
      claims: PATTERN_IMPORT_DXF_PHASE_E_GOLDEN_CARD_AUTHORITATIVE_BASELINE_PROJECTOR_CLAIMS_V1,
    });
  } catch (error) {
    if (error instanceof ProjectionFailure) return blocked(error.code, error.message);
    return blocked(
      'invalid-request',
      'The authoritative baseline request could not be inspected safely.',
    );
  }
}
