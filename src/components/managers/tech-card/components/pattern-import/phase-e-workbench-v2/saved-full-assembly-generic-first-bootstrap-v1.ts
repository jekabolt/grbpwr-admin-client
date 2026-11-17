import { buildPatternImportDxfProductPhaseEAuthoringCatalogV1 } from 'lib/cloth/domain/pattern-import-dxf-product-phase-e-authoring-catalog-v1';
import { readPatternImportDxfProductCompositeComponentBytesV3 } from 'lib/cloth/domain/pattern-import-dxf-product-composite-sidecar-v3';
import {
  DXF_PRODUCT_SAVED_NATIVE_COMPILER_SOURCE_OWNER_V1,
  DXF_PRODUCT_SAVED_NATIVE_COMPILER_SOURCE_REQUEST_V1,
  createDxfProductSavedNativeReprocessOwnerV1,
  type DxfProductSavedNativeCompilerSourceOwnerV1,
  type DxfProductSavedNativeCompilerSourceRequestV1,
} from 'lib/pattern-import/dxf-product-saved-native-reprocess-owner-v1';
import {
  DXF_PRODUCT_SAVED_REPROCESS_REQUEST_V1,
  type DxfProductSavedRowIdentityV1,
} from 'lib/pattern-import/dxf-product-saved-reprocess-owner-v1';

import {
  derivePatternImportDxfPhaseEDocumentAuthorityV1,
  type PatternImportDxfPhaseEDocumentAuthorityV1,
} from '../phase-e-workbench-document-authority-v1';
import { decodePatternImportDxfProductCompositeSidecarV6 } from './composite-sidecar-v6';
import {
  SAVED_FULL_ASSEMBLY_DIAGNOSTIC_PROFILES_V1,
  resolveSavedFullAssemblyDiagnosticProfileV1,
} from './saved-full-assembly-diagnostic-profile-v1';
import { createPatternImportDxfPhaseESavedAssemblySnapshotProductionRpcV1 } from './saved-assembly-snapshot-production-rpc-v1';
import { createPatternImportDxfPhaseESavedDxfReprocessHostV1 } from './saved-dxf-reprocess-host-v1';
import type { SavedFullAssemblyCompileRequestV1 } from './saved-full-assembly-compile-session-v1';
import {
  disposeSavedFullAssemblySnapshotV1,
  projectSavedFullAssemblySnapshotV1,
  readSavedFullAssemblySnapshotV1,
  type SavedFullAssemblySnapshotProjectionV1,
} from './saved-full-assembly-snapshot-production-v1';
import {
  createPatternImportDxfPhaseESavedRowCardProjectionResolverV1,
  type PatternImportDxfPhaseESavedRowCardProjectionV1,
} from './saved-row-production-runtime-v1';

export const SAVED_FULL_ASSEMBLY_GENERIC_FIRST_BOOTSTRAP_V1 =
  'saved-full-assembly-generic-first-bootstrap/1' as const;

export const SAVED_FULL_ASSEMBLY_GENERIC_FIRST_BOOTSTRAP_CLAIMS_V1 = Object.freeze({
  currentV6Required: true,
  freshFullAoReadRequired: true,
  genuineSavedNativeReplayRequired: true,
  exactCatalogAndWriterGrainRequired: true,
  seamTopologyInferred: false,
  materialSelectedFromDiagnosticCatalog: true,
  continuumMaterialInferred: false,
  compilePolicyInferred: false,
  placementInferred: false,
  v6ArrangementPromoted: false,
} as const);

type Catalog = Extract<
  Awaited<ReturnType<typeof buildPatternImportDxfProductPhaseEAuthoringCatalogV1>>,
  { ok: true }
>['catalog'];

export type SavedFullAssemblyGenericFirstBootstrapV1 = Readonly<{
  schemaVersion: typeof SAVED_FULL_ASSEMBLY_GENERIC_FIRST_BOOTSTRAP_V1;
  row: DxfProductSavedRowIdentityV1;
  sourceOwner: DxfProductSavedNativeCompilerSourceOwnerV1;
  sourceRequest: DxfProductSavedNativeCompilerSourceRequestV1;
  expected: SavedFullAssemblyCompileRequestV1['expected'];
  seedOperationNumber: number;
  catalog: Catalog;
  documentAuthority: PatternImportDxfPhaseEDocumentAuthorityV1;
  pieces: readonly Readonly<{
    pieceId: string;
    pieceLineKey: string;
    grainDegrees: number;
  }>[];
  operations: SavedFullAssemblySnapshotProjectionV1['operations'];
  seams: SavedFullAssemblySnapshotProjectionV1['seams'];
  existingExactSeamChoices: readonly SavedFullAssemblyGenericFirstCompileChoicesV1['seamChoices'][number][];
  diagnosticProfiles: readonly Readonly<{
    id: string;
    revision: string;
    label: string;
    description: string;
  }>[];
  claims: typeof SAVED_FULL_ASSEMBLY_GENERIC_FIRST_BOOTSTRAP_CLAIMS_V1;
}>;

export type SavedFullAssemblyGenericFirstCompileChoicesV1 = Readonly<{
  seamChoices: readonly Readonly<{
    sourceSeamKey: string;
    sides: readonly [
      Readonly<{
        pieceId: string;
        pieceLineKey: string;
        contourId: string;
        anchors: readonly [string, string];
        direction: 'forward' | 'reverse';
      }>,
      Readonly<{
        pieceId: string;
        pieceLineKey: string;
        contourId: string;
        anchors: readonly [string, string];
        direction: 'forward' | 'reverse';
      }>,
    ];
  }>[];
  diagnosticProfile: Readonly<{ id: string; revision: string }>;
}>;

export class SavedFullAssemblyGenericFirstBootstrapErrorV1 extends Error {
  constructor(
    readonly code:
      | 'cancelled'
      | 'current-v6-required'
      | 'genuine-stitch-required'
      | 'single-size-required'
      | 'native-reprocess-blocked'
      | 'native-source-invalid'
      | 'catalog-blocked'
      | 'document-authority-blocked'
      | 'writer-grain-missing'
      | 'saved-source-drift'
      | 'invalid-authoring-choices',
    detail: string,
  ) {
    super(detail.slice(0, 2_048));
    this.name = 'SavedFullAssemblyGenericFirstBootstrapErrorV1';
  }
}

const aborted = Object.getOwnPropertyDescriptor(AbortSignal.prototype, 'aborted')!.get!;
const add = EventTarget.prototype.addEventListener;
const remove = EventTarget.prototype.removeEventListener;
const stableId = /^[A-Za-z0-9][A-Za-z0-9._:/#-]{0,255}$/;

function fail(code: SavedFullAssemblyGenericFirstBootstrapErrorV1['code'], detail: string): never {
  throw new SavedFullAssemblyGenericFirstBootstrapErrorV1(code, detail);
}

function check(signal?: AbortSignal): void {
  if (signal !== undefined && aborted.call(signal))
    fail('cancelled', 'First physical authoring bootstrap was cancelled.');
}

function sameRow(left: DxfProductSavedRowIdentityV1, right: DxfProductSavedRowIdentityV1) {
  return (
    left.techCardId === right.techCardId &&
    left.scopeKey === right.scopeKey &&
    left.patternLineKey === right.patternLineKey &&
    left.revision === right.revision &&
    left.cardLockVersion === right.cardLockVersion &&
    left.url === right.url &&
    left.sizeBytes === right.sizeBytes &&
    left.sha256 === right.sha256
  );
}

function snapshotIdentity(value: SavedFullAssemblySnapshotProjectionV1) {
  return JSON.stringify({
    row: value.row,
    serverAssemblyRevision: value.serverAssemblyRevision,
    snapshotSha256: value.snapshotSha256,
    outer:
      value.outer.status === 'absent'
        ? value.outer
        : { mediaType: value.outer.mediaType, sha256: value.outer.sha256 },
  });
}

function nestedSemanticPatternVersion(
  decoded: Extract<
    Awaited<ReturnType<typeof decodePatternImportDxfProductCompositeSidecarV6>>,
    { ok: true }
  >,
): number {
  const bytes = readPatternImportDxfProductCompositeComponentBytesV3(
    decoded.nestedCompositeV5.nestedCompositeV4.nestedCompositeV3.owner,
    'semantic-product-v1',
  );
  if (!bytes)
    fail(
      'document-authority-blocked',
      'The authenticated V6 document has no preserved semantic pattern receipt.',
    );
  let parsed: unknown;
  try {
    parsed = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes));
  } catch {
    fail('document-authority-blocked', 'The authenticated V6 semantic pattern receipt is invalid.');
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed))
    fail('document-authority-blocked', 'The V6 semantic pattern receipt is not a record.');
  const persistence = (parsed as Record<string, unknown>).persistence;
  if (!persistence || typeof persistence !== 'object' || Array.isArray(persistence))
    fail('document-authority-blocked', 'The V6 semantic persistence receipt is absent.');
  const pattern = (persistence as Record<string, unknown>).pattern;
  if (!pattern || typeof pattern !== 'object' || Array.isArray(pattern))
    fail('document-authority-blocked', 'The V6 semantic pattern binding is absent.');
  const version = (pattern as Record<string, unknown>).version;
  if (!Number.isSafeInteger(version) || (version as number) < 1)
    fail('document-authority-blocked', 'The V6 semantic pattern version is invalid.');
  return version as number;
}

function existingExactSeamChoices(
  decoded: Extract<
    Awaited<ReturnType<typeof decodePatternImportDxfProductCompositeSidecarV6>>,
    { ok: true }
  >,
  snapshot: SavedFullAssemblySnapshotProjectionV1,
  catalog: Catalog,
): SavedFullAssemblyGenericFirstBootstrapV1['existingExactSeamChoices'] {
  const preserved = decoded.nestedCompositeV5.nestedCompositeV4.exactNSeam.restoreProjection.seams;
  const choices: SavedFullAssemblyGenericFirstCompileChoicesV1['seamChoices'][number][] = [];
  for (const stored of snapshot.seams) {
    const candidates = preserved.filter(({ seamId }) => seamId === stored.seamKey);
    if (candidates.length !== 1) continue;
    const sides = candidates[0]!.sides.map((side, index) => {
      if (side.pieceLineKey !== stored.pieceLineKeys[index] || side.boundaryVertexIds.length !== 2)
        return null;
      const piece = catalog.pieces.find(
        ({ pieceId, pieceLineKey }) =>
          pieceId === side.pieceId && pieceLineKey === side.pieceLineKey,
      );
      const contour = piece?.contours.find(
        ({ contourId, role }) => contourId === side.contourId && role === 'cut-boundary',
      );
      if (
        !contour ||
        side.boundaryVertexIds[0] === side.boundaryVertexIds[1] ||
        side.boundaryVertexIds.some(
          (vertexId) => !contour.boundaryVertices.some((vertex) => vertex.vertexId === vertexId),
        )
      )
        return null;
      return Object.freeze({
        pieceId: side.pieceId,
        pieceLineKey: side.pieceLineKey,
        contourId: side.contourId,
        anchors: Object.freeze([
          side.boundaryVertexIds[0]!,
          side.boundaryVertexIds[1]!,
        ]) as readonly [string, string],
        direction: side.direction,
      });
    });
    if (!sides[0] || !sides[1]) continue;
    choices.push(
      Object.freeze({
        sourceSeamKey: stored.seamKey,
        sides: Object.freeze([sides[0], sides[1]]) as readonly [
          NonNullable<(typeof sides)[0]>,
          NonNullable<(typeof sides)[1]>,
        ],
      }),
    );
  }
  return Object.freeze(choices);
}

function stitchSeed(snapshot: SavedFullAssemblySnapshotProjectionV1): number {
  const operation = snapshot.operations.find(
    ({ operationNumber, seamKeys }) => operationNumber > 0 && seamKeys.length > 0,
  );
  if (!operation)
    fail('genuine-stitch-required', 'A positive seam-bearing Assembly operation is required.');
  return operation.operationNumber;
}

function sizeToken(snapshot: SavedFullAssemblySnapshotProjectionV1): string {
  const values = [...new Set(snapshot.seams.map(({ anchoredSize }) => anchoredSize.trim()))];
  if (values.length !== 1 || !stableId.test(values[0] ?? ''))
    fail(
      'single-size-required',
      'All saved Assembly seams must bind one explicit DXF size before physical authoring.',
    );
  return values[0]!;
}

function exactPieces(
  bootstrapCatalog: Catalog,
  draft: DxfProductSavedNativeCompilerSourceRequestV1['draft'],
  selectedSize: string,
): SavedFullAssemblyGenericFirstBootstrapV1['pieces'] {
  const writerPieces = new Map(
    draft.scopes
      .flatMap(({ writerReplay }) => writerReplay?.job.pieces ?? [])
      .map((piece) => [piece.identity, piece]),
  );
  return Object.freeze(
    bootstrapCatalog.pieces.map(({ pieceId, pieceLineKey }) => {
      const writer = writerPieces.get(pieceId);
      const sizes = writer?.sizes.filter(({ sizeToken: token }) => token === selectedSize) ?? [];
      const grainDegrees = sizes[0]?.grain?.angleDeg;
      if (
        sizes.length !== 1 ||
        !Number.isFinite(grainDegrees) ||
        grainDegrees! < 0 ||
        grainDegrees! >= 360
      )
        fail(
          'writer-grain-missing',
          `Piece ${pieceId} has no single explicit writer grain in [0, 360) for ${selectedSize}.`,
        );
      return Object.freeze({ pieceId, pieceLineKey, grainDegrees: grainDegrees! });
    }),
  );
}

function validateSide(
  bootstrap: SavedFullAssemblyGenericFirstBootstrapV1,
  side: SavedFullAssemblyGenericFirstCompileChoicesV1['seamChoices'][number]['sides'][number],
  expectedLine: string,
): void {
  if (side.pieceLineKey !== expectedLine || side.anchors[0] === side.anchors[1])
    fail('invalid-authoring-choices', 'A seam side differs from the current AO piece-line order.');
  const piece = bootstrap.catalog.pieces.filter(
    ({ pieceId, pieceLineKey }) => pieceId === side.pieceId && pieceLineKey === side.pieceLineKey,
  );
  const contour = piece[0]?.contours.filter(
    ({ contourId, role }) => contourId === side.contourId && role === 'cut-boundary',
  );
  const vertices = contour?.[0]?.boundaryVertices ?? [];
  if (
    piece.length !== 1 ||
    contour?.length !== 1 ||
    side.anchors.some((anchor) => !vertices.some(({ vertexId }) => vertexId === anchor))
  )
    fail(
      'invalid-authoring-choices',
      'A seam side must select exact cut contour and boundary vertex identities.',
    );
}

/**
 * Reads current V6 + complete AO, then reuses the existing saved-native downloader/ImportWorker
 * lane. It returns only authoring evidence. No topology, material physics, placement, or V6
 * presentation transform is manufactured here.
 */
export const prepareSavedFullAssemblyGenericFirstBootstrapV1 = Object.freeze(
  async function prepareSavedFullAssemblyGenericFirstBootstrapV1(
    row: DxfProductSavedRowIdentityV1,
    cardProjection: PatternImportDxfPhaseESavedRowCardProjectionV1,
    signal?: AbortSignal,
  ): Promise<SavedFullAssemblyGenericFirstBootstrapV1> {
    check(signal);
    let receipt: Awaited<ReturnType<typeof readSavedFullAssemblySnapshotV1>> | null = null;
    let owner: ReturnType<typeof createDxfProductSavedNativeReprocessOwnerV1> | null = null;
    try {
      // The card projection chooses only a positive transport anchor. The generated bounded reader
      // authenticates the complete current operation/seam payload and independently rejects drift.
      const cardOperation = cardProjection.card.assembly?.ops.find(
        ({ number, seamKeys }) => number > 0 && (seamKeys?.length ?? 0) > 0,
      );
      if (!cardOperation)
        throw new SavedFullAssemblyGenericFirstBootstrapErrorV1(
          'genuine-stitch-required',
          'A positive seam-bearing Assembly operation is required.',
        );
      receipt = await readSavedFullAssemblySnapshotV1(
        { row, seedOperationNumber: cardOperation.number },
        signal,
      );
      const snapshot = projectSavedFullAssemblySnapshotV1(receipt);
      const seedOperationNumber = stitchSeed(snapshot);
      if (
        snapshot.outer.status !== 'present' ||
        snapshot.outer.mediaType !==
          'application/vnd.grbpwr.pattern-dxf-product-composite.v6+json' ||
        !snapshot.outer.currentRowBound
      )
        fail('current-v6-required', 'First physical authoring requires the current saved V6 row.');
      const decodedV6 = await decodePatternImportDxfProductCompositeSidecarV6(snapshot.outer.bytes);
      if (
        !decodedV6.ok ||
        !sameRow(decodedV6.document.bindings.row, row) ||
        decodedV6.document.bindings.serverAssemblyRevision !== snapshot.serverAssemblyRevision
      )
        fail(
          'current-v6-required',
          decodedV6.ok
            ? 'Saved V6 bindings differ from the current row or Assembly revision.'
            : decodedV6.blockers[0].detail,
        );
      const selectedSize = sizeToken(snapshot);
      const sourceSnapshot =
        createPatternImportDxfPhaseESavedAssemblySnapshotProductionRpcV1(seedOperationNumber);
      const resolveCard =
        createPatternImportDxfPhaseESavedRowCardProjectionResolverV1(cardProjection);
      const host = createPatternImportDxfPhaseESavedDxfReprocessHostV1({
        resolveCard,
        readAuthoritativeRow: sourceSnapshot.bridge.readAuthoritativeRow,
      });
      owner = createDxfProductSavedNativeReprocessOwnerV1(host);
      const cancel = () => owner?.cancel();
      if (signal) add.call(signal, 'abort', cancel, { once: true });
      let replay: Awaited<ReturnType<typeof owner.run>>;
      try {
        replay = await owner.run({
          schemaVersion: DXF_PRODUCT_SAVED_REPROCESS_REQUEST_V1,
          row,
        });
      } finally {
        if (signal) remove.call(signal, 'abort', cancel);
      }
      check(signal);
      if (!replay.ok)
        fail(
          'native-reprocess-blocked',
          replay.blockers[0]?.detail ?? 'The genuine saved native replay was blocked.',
        );
      if (
        replay.sourceOwner.version !== DXF_PRODUCT_SAVED_NATIVE_COMPILER_SOURCE_OWNER_V1 ||
        !sameRow(replay.row, row)
      )
        fail('native-source-invalid', 'The native compiler source differs from the saved V6 row.');
      const sourceRequest = Object.freeze({
        schemaVersion: DXF_PRODUCT_SAVED_NATIVE_COMPILER_SOURCE_REQUEST_V1,
        sourceFileId: replay.sourceFileId,
        sourceSha256: replay.row.sha256,
        techCardId: replay.row.techCardId,
        scopeKey: replay.row.scopeKey,
        patternLineKey: replay.row.patternLineKey,
        cardLockVersion: replay.row.cardLockVersion,
        draft: replay.draft,
      }) satisfies DxfProductSavedNativeCompilerSourceRequestV1;
      if (sourceRequest.draft !== replay.draft)
        fail('native-source-invalid', 'The original replay draft identity was not preserved.');
      const catalogResult = await buildPatternImportDxfProductPhaseEAuthoringCatalogV1(
        replay.draft,
        row.scopeKey,
        selectedSize,
      );
      if (!catalogResult.ok) fail('catalog-blocked', catalogResult.blockers[0].detail);
      const document = await derivePatternImportDxfPhaseEDocumentAuthorityV1(
        {
          techCardId: row.techCardId,
          scopeKey: row.scopeKey,
          patternLineKey: row.patternLineKey,
          dxfSha256: row.sha256,
          // `row.revision` is the saved-row CAS revision, not the human pattern version. The
          // preserved semantic receipt is already authenticated by the decoded current V6 chain.
          patternVersion: nestedSemanticPatternVersion(decodedV6),
          cardLockVersion: row.cardLockVersion,
        },
        catalogResult.catalog.sizeSelectionCanonicalSha256,
        catalogResult.catalog.canonicalSha256,
      );
      if (!document.ok) fail('document-authority-blocked', document.blockers[0].detail);
      const confirmed = projectSavedFullAssemblySnapshotV1(receipt);
      if (snapshotIdentity(snapshot) !== snapshotIdentity(confirmed))
        fail('saved-source-drift', 'Saved V6/AO evidence changed during native preparation.');
      return Object.freeze({
        schemaVersion: SAVED_FULL_ASSEMBLY_GENERIC_FIRST_BOOTSTRAP_V1,
        row,
        sourceOwner: replay.sourceOwner,
        sourceRequest,
        expected: Object.freeze({
          row,
          serverAssemblyRevision: snapshot.serverAssemblyRevision,
          fullAssemblySnapshotSha256: snapshot.snapshotSha256,
        }),
        seedOperationNumber,
        catalog: catalogResult.catalog,
        documentAuthority: document.authority,
        pieces: exactPieces(catalogResult.catalog, replay.draft, selectedSize),
        operations: snapshot.operations,
        seams: snapshot.seams,
        existingExactSeamChoices: existingExactSeamChoices(
          decodedV6,
          snapshot,
          catalogResult.catalog,
        ),
        diagnosticProfiles: Object.freeze(
          SAVED_FULL_ASSEMBLY_DIAGNOSTIC_PROFILES_V1.map(({ id, revision, label, description }) =>
            Object.freeze({ id, revision, label, description }),
          ),
        ),
        claims: SAVED_FULL_ASSEMBLY_GENERIC_FIRST_BOOTSTRAP_CLAIMS_V1,
      });
    } finally {
      if (receipt) disposeSavedFullAssemblySnapshotV1(receipt);
      owner?.dispose();
    }
  },
);

/** Converts only complete, explicit authoring choices into the one-shot compile request. */
export function buildSavedFullAssemblyGenericFirstCompileRequestV1(
  bootstrap: SavedFullAssemblyGenericFirstBootstrapV1,
  choices: SavedFullAssemblyGenericFirstCompileChoicesV1,
): SavedFullAssemblyCompileRequestV1 {
  const activeOperations = bootstrap.operations.filter(({ seamKeys }) => seamKeys.length > 0);
  if (choices.seamChoices.length !== bootstrap.seams.length)
    fail(
      'invalid-authoring-choices',
      'Every current Assembly seam requires one explicit pair of exact DXF edges.',
    );
  const profile = resolveSavedFullAssemblyDiagnosticProfileV1(
    choices.diagnosticProfile.id,
    choices.diagnosticProfile.revision,
  );
  if (!profile)
    fail('invalid-authoring-choices', 'Select one exact versioned diagnostic preview profile.');
  const operations = activeOperations.map((operation, order) => {
    const seamIds = operation.seamKeys.map((sourceSeamKey) => {
      const seam = choices.seamChoices.filter((choice) => choice.sourceSeamKey === sourceSeamKey);
      if (seam.length !== 1 || !stableId.test(sourceSeamKey))
        fail('invalid-authoring-choices', 'Every current AO seam needs one exact edge pair.');
      return sourceSeamKey;
    });
    return Object.freeze({
      clientOperationId: `ao-operation:${operation.operationNumber}`,
      sourceOperationNumber: operation.operationNumber,
      inputKeys: operation.inputKeys,
      outputUnitKey: operation.outputUnitKey,
      stage: operation.operationNumber,
      order,
      kind: 'stitch' as const,
      seamIds: Object.freeze(seamIds),
    });
  });
  const seams = bootstrap.seams.map((stored) => {
    const choice = choices.seamChoices.filter(
      ({ sourceSeamKey }) => sourceSeamKey === stored.seamKey,
    );
    const operation = operations.find(
      ({ sourceOperationNumber }) => sourceOperationNumber === stored.sourceOperationNumber,
    );
    if (choice.length !== 1 || !operation)
      fail('invalid-authoring-choices', 'Seam operation ownership differs from the current AO.');
    validateSide(bootstrap, choice[0]!.sides[0], stored.pieceLineKeys[0]);
    validateSide(bootstrap, choice[0]!.sides[1], stored.pieceLineKeys[1]);
    return Object.freeze({
      id: stored.seamKey,
      sourceSeamKey: stored.seamKey,
      clientOperationId: operation.clientOperationId,
      mapping: 'equal' as const,
      lengthRatio: 1 as const,
      sides: Object.freeze(
        choice[0]!.sides.map((side) => Object.freeze({ ...side })),
      ) as (typeof choice)[0]['sides'],
    });
  });
  const material = structuredClone(profile.material);
  const continuumMaterial = structuredClone(profile.continuumMaterial);
  const pieces = bootstrap.pieces.map((piece) =>
    Object.freeze({
      ...piece,
      cutCount: 1 as const,
      materialId: material.id,
      materialRevision: material.revision,
    }),
  );
  return Object.freeze({
    sourceOwner: bootstrap.sourceOwner,
    sourceRequest: bootstrap.sourceRequest,
    expected: bootstrap.expected,
    seedOperationNumber: bootstrap.seedOperationNumber,
    intent: Object.freeze({
      documentId: bootstrap.documentAuthority.documentId,
      revision: bootstrap.documentAuthority.revision,
      sizeToken: bootstrap.catalog.sizeToken,
      physicalSurface: Object.freeze({
        mode: 'sewing-surface' as const,
        seamAllowancePhysical: false as const,
      }),
      pieces: Object.freeze(pieces),
      operations: Object.freeze(operations),
      seams: Object.freeze(seams),
      compile: Object.freeze({
        targetEdgeMm: profile.targetEdgeMm,
        exactSeamToleranceMm: profile.exactSeamToleranceMm,
        materialPolicy: profile.materialPolicy,
        materials: Object.freeze([material]),
        continuumMaterials: Object.freeze([continuumMaterial]),
        materialSolver: profile.materialSolver,
      }),
    }),
  });
}
