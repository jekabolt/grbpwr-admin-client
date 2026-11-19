import type { AdminService } from 'api/proto-http/admin';
import {
  DXF_ASSEMBLY_HANDOFF_V1,
  buildDxfAssemblyHandoffV1,
} from 'lib/cloth/domain/dxf-assembly-handoff-v1';
import {
  DXF_EXACT_NATIVE_CROSS_ROW_SEAM_GRID_V1,
  type DxfExactNativeCrossRowSeamGridRequestV1,
  DXF_EXACT_NATIVE_EASED_SEAM_FEED_V1,
  buildDxfExactNativeCrossRowSeamGridV1,
} from 'lib/cloth/domain/dxf-exact-native-seam-grid-v1';
import {
  DXF_EXACT_NATIVE_SEAM_SPAN_V1,
  type DxfExactNativeSeamSpanRequestV1,
} from 'lib/cloth/domain/dxf-exact-native-seam-span-v1';
import { VISUAL_UNCALIBRATED_CLOTH_PRESETS } from 'lib/cloth/material/presets';
import { createPatternImportDxfProductCompositeSidecarStorageWriterV3 } from 'lib/cloth/domain/pattern-import-dxf-product-composite-sidecar-storage-client-v3';
import { consumeDxfProductSavedNativeCompilerSourceV1 } from 'lib/pattern-import/dxf-product-saved-native-reprocess-owner-v1';
import {
  DXF_SOURCE_NATIVE_STRAIGHT_EDGE_SELECTED_PATHS_REQUEST_V1,
  projectDxfSourceNativeStraightEdgeSelectedPathsV1,
} from 'lib/pattern-import/dxf-source-native-straight-edge-authority-v1';
import {
  completeSavedAssemblyRowIdentityV1,
  isVerifiedCompleteSavedAssemblySourceV1,
  readCompleteSavedAssemblySourceV1,
  type CompleteSavedAssemblySourceV1,
} from './saved-assembly-complete-source-rpc-v1';
import { canonicalizePatternImportDxfPhaseESavedAssemblyValueV1 as canonical } from './saved-assembly-topology-hash-v1';
import type { SavedAssemblyNativeSewingPathV1 } from './saved-full-assembly-native-boundaries-v1';
import { prepareSavedFullAssemblyCompleteNativeRowsV1 } from './saved-full-assembly-complete-native-rows-v1';
import { readSavedCompleteAssemblyPhysicalCutV8 } from './saved-complete-assembly-physical-cut-v8';
import { resolveSavedLegacyNativeStitchRunV8 } from './saved-legacy-native-stitch-run-v8';

export const SAVED_COMPLETE_ASSEMBLY_NATIVE_REVIEW_V8 =
  'pattern-import-dxf-product-composite-sidecar-document/8';
export const SAVED_COMPLETE_ASSEMBLY_NATIVE_MEDIA_V8 =
  'application/vnd.grbpwr.pattern-dxf-product-composite.v8+json';
export const SAVED_COMPLETE_ASSEMBLY_NATIVE_PROFILE_V1 =
  'saved-full-assembly/native-cross-row-stitch/1';

type CompletePreparation = typeof prepareSavedFullAssemblyCompleteNativeRowsV1;
type NativeSource = Extract<
  ReturnType<typeof consumeDxfProductSavedNativeCompilerSourceV1>,
  { ok: true }
>['value'];
type Registration = readonly [string, string];
type SourceSelection = Readonly<{
  sizeId: number;
  sizeToken: string;
  operationNumber: number;
}> &
  (
    | Readonly<{ registrations: readonly Registration[]; pairing?: never }>
    | Readonly<{ registrations?: never; pairing: 'start-to-start' | 'start-to-end' }>
  );

const encoder = new TextEncoder();
async function hash(text: string, signal: AbortSignal) {
  signal.throwIfAborted();
  const bytes = await crypto.subtle.digest('SHA-256', encoder.encode(text));
  signal.throwIfAborted();
  return Array.from(new Uint8Array(bytes), (byte) => byte.toString(16).padStart(2, '0')).join('');
}

async function readDirectedSpan(
  nativeSource: NativeSource,
  path: SavedAssemblyNativeSewingPathV1,
  orderedVertexIds: readonly string[],
  signal: AbortSignal,
) {
  const { row, sourceFileId, nativeRead } = nativeSource;
  if (canonical(row) !== canonical(path.row) || sourceFileId !== path.sourceFileId)
    throw new Error('The sewing contour differs from its fresh native source.');
  const read = await projectDxfSourceNativeStraightEdgeSelectedPathsV1(nativeRead.owner, {
    schemaVersion: DXF_SOURCE_NATIVE_STRAIGHT_EDGE_SELECTED_PATHS_REQUEST_V1,
    sourceFileId,
    sourceSha256: row.sha256,
    sourcePathIds: [path.nativePathId],
  });
  signal.throwIfAborted();
  if (!read.ok || !read.projection.complete)
    throw new Error('The complete native sewing path could not be verified as straight edges.');
  const raw = [...read.projection.descriptors].sort(
    (a, b) => a.path.startPointIndex - b.path.startPointIndex,
  );
  const points = new Map(path.vertexIds.map((id, i) => [id, path.nativePointsMm[i]!]));
  if (
    raw.length < 3 ||
    points.size !== raw.length ||
    raw.some((edge, i) => {
      const point = points.get(edge.startVertexId);
      return (
        edge.path.sourcePathId !== path.nativePathId ||
        edge.sourceFileId !== sourceFileId ||
        !point ||
        edge.startMm[0] !== point.x ||
        edge.startMm[1] !== point.y ||
        edge.endVertexId !== raw[(i + 1) % raw.length]!.startVertexId
      );
    })
  )
    throw new Error('The selected native path has mismatched vertices or ordering.');

  const counterclockwise =
    raw.reduce((sum, e) => sum + e.startMm[0] * e.endMm[1] - e.endMm[0] * e.startMm[1], 0) > 0;
  const edges = counterclockwise
    ? raw
    : raw
        .slice()
        .reverse()
        .map((edge) => ({
          ...edge,
          startMm: edge.endMm,
          endMm: edge.startMm,
          startVertexId: edge.endVertexId,
          endVertexId: edge.startVertexId,
          native: { ...edge.native, sourceCurveTRange: [1, 0] as const },
        }));
  const edgeIndex = new Map(edges.map((edge, i) => [edge.startVertexId, i]));
  const stations = orderedVertexIds.map((vertexId) => {
    const index = edgeIndex.get(vertexId);
    if (index === undefined)
      throw new Error('A selected station does not belong to its native contour.');
    return index;
  });
  const forward = stations
    .slice(1)
    .every((index, i) => index === (stations[i]! + 1) % edges.length);
  const reverse = stations
    .slice(1)
    .every((index, i) => index === (stations[i]! + edges.length - 1) % edges.length);
  if (stations.length < 2 || stations.length >= edges.length || forward === reverse)
    throw new Error('Select one contiguous native run for each seam side.');

  const lengths = edges.map((edge) =>
    Math.hypot(edge.endMm[0] - edge.startMm[0], edge.endMm[1] - edge.startMm[1]),
  );
  const perimeter = lengths.reduce((sum, value) => sum + value, 0);
  let walked = 0;
  const vertices = edges.map((edge, i) => {
    const normalizedArc = walked / perimeter;
    walked += lengths[i]!;
    return {
      id: edge.startVertexId,
      positionMm: edge.startMm,
      source: {
        sourceCurveId: edge.sourceCurveId,
        parameterSpace: edge.native.parameterSpace,
        sourceCurveT: edge.native.sourceCurveTRange[0],
        normalizedArc,
      },
    };
  });
  const { pieceId, contourId } = path;
  const material = VISUAL_UNCALIBRATED_CLOTH_PRESETS.find(({ id }) => id === 'visual-medium-woven');
  if (!material) throw new Error('The staged diagnostic material is unavailable.');
  const handoff = await buildDxfAssemblyHandoffV1({
    schemaVersion: DXF_ASSEMBLY_HANDOFF_V1,
    source: {
      format: 'DXF',
      units: 'mm',
      documentId: sourceFileId,
      revision: `lock${row.cardLockVersion}`,
      sourceSha256: row.sha256,
      exportSha256: row.sha256,
      exporterId: 'standalone-native-row',
      exporterVersion: '1',
      provenanceKind: 'untrusted-product',
      corpusEntryId: null,
    },
    physicalSurface: { mode: 'sewing-surface', seamAllowancePhysical: false },
    pieces: [
      {
        id: pieceId,
        name: `${path.blockName}_${path.sizeToken}`,
        cutCount: 1,
        grainDegrees: 0,
        contours: [{ id: contourId, role: 'sewing-boundary', closed: true, vertices }],
      },
    ],
    seams: [],
    operations: [{ id: `${pieceId}/source`, stage: 0, order: 0, kind: 'place', seamIds: [] }],
    materials: [{ id: material.id, materialRevision: material.revision, pieceIds: [pieceId] }],
  });
  signal.throwIfAborted();
  if (!handoff.ok) throw new Error(handoff.errors.join('; '));
  const ends = [orderedVertexIds[0]!, orderedVertexIds.at(-1)!] as const;
  const direction = forward ? 'forward' : 'reverse';
  const span = {
    schemaVersion: DXF_EXACT_NATIVE_SEAM_SPAN_V1,
    handoff: handoff.value,
    side: {
      pieceId,
      contourId,
      anchors: forward ? ends : [ends[1], ends[0]],
      direction,
    },
    sourceSampling: {
      sourceFileId,
      pieces: [
        {
          input: {
            pieceId,
            shell: {
              id: contourId,
              role: 'shell',
              vertices: vertices.map((vertex) => ({
                id: vertex.id,
                positionMm: vertex.positionMm,
                source: {
                  contourId,
                  sourceCurveId: vertex.source.sourceCurveId,
                  sourceCurveParameterSpace: vertex.source.parameterSpace,
                  sourceCurveT: vertex.source.sourceCurveT,
                  normalizedArc: vertex.source.normalizedArc,
                },
              })),
            },
            holes: [],
            grainDegrees: 0,
            seamEndpoints: [],
            options: {
              targetEdgeMm: 10,
              minInputEdgeMm: 1e-6,
              minTriangleAngleDegrees: 0.01,
              maxEdgeRatio: 1e9,
              maxRadiusEdgeRatio: 1e9,
              maxBoundaryErrorMm: 1e-9,
              collinearSinTolerance: 1e-12,
            },
          },
          edges: edges.map((edge, index) => ({
            edgeId: `${pieceId}/edge-${index}`,
            pieceId,
            ringId: contourId,
            edgeIndex: index,
            startBoundaryVertexId: edge.startVertexId,
            endBoundaryVertexId: edge.endVertexId,
            native: { sourceFileId, ...edge.native },
          })),
        },
      ],
    },
  } satisfies DxfExactNativeSeamSpanRequestV1;
  return { span, direction };
}

/** Rebuilds both native rows and their directed grid from the same verified Complete read. */
export async function prepareSavedCompleteAssemblyNativeStitchReviewV8(
  source: CompleteSavedAssemblySourceV1,
  projection: Parameters<CompletePreparation>[1],
  selected: SourceSelection,
  dictionary: NonNullable<Parameters<CompletePreparation>[3]>,
  signal: AbortSignal,
  includePhysicalCuts = false,
) {
  signal.throwIfAborted();
  const {
    sizeId,
    sizeToken,
    operationNumber,
    registrations: explicit,
    pairing,
  } = structuredClone(selected);
  if (
    !isVerifiedCompleteSavedAssemblySourceV1(source) ||
    dictionary.selectedSizeId !== sizeId ||
    projection.card.sizes.filter(({ sizeId: id, token }) => id === sizeId && token === sizeToken)
      .length !== 1 ||
    (explicit === undefined && pairing !== 'start-to-start' && pairing !== 'start-to-end') ||
    (explicit !== undefined && pairing !== undefined)
  )
    throw new Error('Select one exact current size and two directed native runs.');
  const operationOrdinal = source.operations.findIndex(
    (op) => op.operationNumber === operationNumber,
  );
  const operation = source.operations[operationOrdinal];
  const ownedSeamKeys = operation?.seamKeys;
  if (!operation || !ownedSeamKeys || ownedSeamKeys.length < 1 || ownedSeamKeys.length > 2)
    throw new Error(
      'This review requires one owned physical seam with its current recorded links.',
    );
  if (includePhysicalCuts && ownedSeamKeys.length !== 2)
    throw new Error('Physical preparation requires the recorded pose for this sewing operation.');
  const complete = await prepareSavedFullAssemblyCompleteNativeRowsV1(source, projection, signal, {
    ...dictionary,
    includeGeneratedCutGeometry: false,
  });
  const [physical] = complete.operationAnchors.physical.filter(
    (entry) => entry.operationNumber === operationNumber,
  );
  const [pose] = complete.operationAnchors.poses.filter(
    (entry) => entry.operationNumber === operationNumber,
  );
  const originalDirection = physical?.seam.direction;
  const savedDirection =
    originalDirection === 'TECH_CARD_SEAM_DIRECTION_SAME'
      ? 'same'
      : originalDirection === 'TECH_CARD_SEAM_DIRECTION_REVERSED'
        ? 'reversed'
        : null;
  if (
    !physical ||
    physical.seam.kind !== 'TECH_CARD_SEAM_KIND_EDGE' ||
    physical.seamKey !== ownedSeamKeys[0] ||
    pose?.seamKey !== ownedSeamKeys[1] ||
    !savedDirection ||
    (physical.seam.anchoredSize && physical.seam.anchoredSize !== sizeToken) ||
    physical.anchors.length !== 2
  )
    throw new Error('The current Assembly Order does not own this exact seam and pose.');

  const nativeSide = (index: 0 | 1) => {
    const anchor = physical.anchors[index]!;
    const path = anchor.source.kind === 'dxf' ? anchor.source.nativeSewingPath : null;
    const scopeKey = index === 0 ? 'main' : 'pocketing';
    const savedRow = source.rows.find((row) => row.scopeKey === scopeKey);
    const member = complete.nativeRows.find(({ row }) => row.scopeKey === scopeKey);
    if (
      !path ||
      !savedRow ||
      !member ||
      anchor.sideIndex !== index ||
      anchor.partOrdinal !== 0 ||
      path.sizeToken !== sizeToken ||
      canonical(completeSavedAssemblyRowIdentityV1(savedRow)) !== canonical(path.row)
    )
      throw new Error('An Assembly side no longer has its exact native member.');
    const captured = consumeDxfProductSavedNativeCompilerSourceV1(
      member.sourceOwner,
      member.sourceRequest,
    );
    if (!captured.ok) throw new Error(captured.blockers[0].detail);
    return { index, anchor, path, patternVersion: savedRow.patternVersion, native: captured.value };
  };
  const boundSides = [nativeSide(0), nativeSide(1)] as const;
  const seamOnly = ownedSeamKeys.length === 1;
  const completeRuns =
    seamOnly || explicit === undefined
      ? await Promise.all(
          boundSides.map(({ native, path, anchor }) =>
            resolveSavedLegacyNativeStitchRunV8(
              source,
              projection,
              native,
              path,
              anchor.anchor,
              signal,
            ),
          ),
        )
      : null;
  const registrations =
    explicit ??
    (() => {
      const [left, rightRaw] = completeRuns!;
      const right = pairing === 'start-to-end' ? rightRaw!.slice().reverse() : rightRaw!;
      if (seamOnly)
        return [
          [left![0]!, right[0]!],
          [left!.at(-1)!, right.at(-1)!],
        ] as const;
      if (left!.length !== right.length)
        throw new Error('The two saved runs have different native corner counts.');
      return left!.map((vertex, index) => [vertex, right[index]!] as const);
    })();
  if (registrations.length < 2 || registrations.length > 256)
    throw new Error('Select two native runs with a bounded number of registrations.');
  if (seamOnly && registrations.length !== 2)
    throw new Error('The saved edge review requires two exact endpoint registrations.');
  const side = async ({
    index,
    anchor,
    path,
    patternVersion,
    native,
  }: (typeof boundSides)[number]) => {
    const orderedVertexIds = registrations.map((pair) => pair[index]);
    if (new Set(orderedVertexIds).size !== orderedVertexIds.length)
      throw new Error('Native registrations must be distinct.');
    let spanVertexIds = orderedVertexIds;
    if (seamOnly) {
      // Original corners remain part of each native run even when only its endpoints are paired.
      const run = completeRuns![index]!;
      const [start, end] = orderedVertexIds;
      if (start === run[0] && end === run.at(-1)) spanVertexIds = [...run];
      else if (index === 1 && end === run[0] && start === run.at(-1))
        spanVertexIds = [...run].reverse();
      else throw new Error('The registrations do not match the complete saved native runs.');
    }
    const { span, direction } = await readDirectedSpan(native, path, spanVertexIds, signal);
    const row = { ...path.row, patternVersion };
    return {
      member: {
        row,
        sideIndex: index,
        partOrdinal: 0 as const,
        pieceLineKey: path.pieceLineKey,
        blockName: path.blockName,
        pieceId: path.pieceId,
        contourId: path.contourId,
        nativePathId: path.nativePathId,
        sourceFileId: path.sourceFileId,
        direction,
        orderedVertexIds,
        capturedSavedAnchorSha256: await hash(
          'tech-card-saved-assembly-native-anchor/1\0' + canonical(anchor.anchor),
          signal,
        ),
      },
      span,
      gridRow: {
        patternLineKey: row.patternLineKey,
        sourceFileId: path.sourceFileId,
        sourceSha256: row.sha256,
        pieceId: path.pieceId,
        pieceLineKey: path.pieceLineKey,
        contourId: path.contourId,
      },
    };
  };
  const [a, b] = await Promise.all([side(boundSides[0]), side(boundSides[1])]);
  const bindings = {
    anchorRow: { ...a.member.row },
    serverAssemblyRevision: source.serverAssemblyRevision,
    completeSourceSha256: source.sourceSha256,
  };
  const selection = {
    operationNumber,
    operationOrdinal,
    ownedSeamKeys,
    savedDirection,
    savedAnchoredSize: physical.seam.anchoredSize ?? '',
    sizeId,
    sizeToken,
    sizeBasis: 'operator-confirmed-native',
    members: [a.member, b.member] as const,
  };
  const decision = await hash(
    'tech-card-complete-source-native-selection/1\0' + canonical({ bindings, selection }),
    signal,
  );
  const gridRequest = {
    schemaVersion: DXF_EXACT_NATIVE_CROSS_ROW_SEAM_GRID_V1,
    seamId: physical.seamKey,
    rows: [a.gridRow, b.gridRow] as const,
    sourceDecisionSha256: decision,
    feedPolicy: DXF_EXACT_NATIVE_EASED_SEAM_FEED_V1,
    registrations,
    minSegmentMm: 2,
    maxSegmentMm: 40,
    sides: [a.span, b.span] as const,
  } satisfies DxfExactNativeCrossRowSeamGridRequestV1;
  // The in-process handoff vertices are also referenced by the sampling projection. The
  // persisted request is a JSON tree, so materialize that tree before replay and hashing.
  const gridWire: DxfExactNativeCrossRowSeamGridRequestV1 = JSON.parse(JSON.stringify(gridRequest));
  const grid = await buildDxfExactNativeCrossRowSeamGridV1(gridWire, signal);
  if (!grid.ok) throw new Error(grid.blockers[0].detail);
  const document = {
    schemaVersion: SAVED_COMPLETE_ASSEMBLY_NATIVE_REVIEW_V8,
    mediaType: SAVED_COMPLETE_ASSEMBLY_NATIVE_MEDIA_V8,
    encoding: 'canonical-json-utf8',
    profile: SAVED_COMPLETE_ASSEMBLY_NATIVE_PROFILE_V1,
    bindings,
    writeCas: { expectedPreviousSidecarSha256: null },
    selection,
    review: {
      sourceDecisionSha256: decision,
      boundSourceRequestSha256: await hash(canonical(gridWire), signal),
      gridSha256: grid.witness.canonicalSha256,
      stationCount: grid.witness.stitchGrid.length,
    },
  };
  const encoded = canonical(document);
  const cuts = includePhysicalCuts
    ? await Promise.all(
        boundSides.map(async ({ native, path }) => {
          const originals = complete.originalCutPaths.filter(
            (cut) =>
              cut.row.patternLineKey === path.row.patternLineKey &&
              cut.pieceId === path.pieceId &&
              cut.pieceLineKey === path.pieceLineKey &&
              cut.sizeToken === path.sizeToken,
          );
          if (originals.length !== 1)
            throw new Error('The saved seam requires one exact finished cut per original piece.');
          return readSavedCompleteAssemblyPhysicalCutV8(
            source,
            projection,
            native,
            path,
            originals[0]!,
            signal,
          );
        }),
      )
    : null;
  return {
    document,
    bytes: encoder.encode(encoded),
    sha256: await hash(encoded, signal),
    reviewReceiptSha256: await hash(
      'tech-card-complete-source-native-review/1\0' + encoded,
      signal,
    ),
    grid: grid.witness,
    gridRequest: gridWire,
    cuts,
  };
}
type ReviewClient = Pick<
  AdminService,
  | 'GetTechCardSavedAssemblySnapshot'
  | 'GetTechCardPatternSemanticSidecar'
  | 'PutTechCardPatternSemanticSidecar'
>;
type CreateReviewClient = (signal: AbortSignal) => ReviewClient;

const storageRequest = 'pattern-import-dxf-product-composite-sidecar-storage-request/8';
const storageReceipt = 'pattern-import-dxf-product-composite-sidecar-storage-receipt/8';

/** Uses the established pattern-sidecar writer and its separate PUT and GET byte proofs. */
export async function persistSavedCompleteAssemblyNativeStitchReviewV8(
  createClient: CreateReviewClient,
  source: CompleteSavedAssemblySourceV1,
  projection: Parameters<CompletePreparation>[1],
  selected: SourceSelection,
  dictionary: NonNullable<Parameters<CompletePreparation>[3]>,
  signal: AbortSignal,
  expectedReviewSha256?: string,
) {
  const prepared = await prepareSavedCompleteAssemblyNativeStitchReviewV8(
    source,
    projection,
    selected,
    dictionary,
    signal,
  );
  if (expectedReviewSha256 !== undefined && prepared.sha256 !== expectedReviewSha256)
    throw new Error('The reviewed sewing runs changed. Review the current runs before saving.');
  const { anchorRow, serverAssemblyRevision, completeSourceSha256 } = prepared.document.bindings;
  const row = completeSavedAssemblyRowIdentityV1(anchorRow);
  const target = {
    row,
    serverAssemblyRevision,
    // V8 binds the Complete Source seal in the existing assembly CAS field.
    assemblyTopologySha256: completeSourceSha256,
  };
  const pinned = {
    expectedServerAssemblyRevision: serverAssemblyRevision,
    expectedCompleteSourceSha256: completeSourceSha256,
  };
  const expectedText = new TextDecoder('utf-8', { fatal: true }).decode(prepared.bytes);
  const writer = createPatternImportDxfProductCompositeSidecarStorageWriterV3(
    { createClient },
    {
      requestSchemaVersion: storageRequest,
      receiptSchemaVersion: storageReceipt,
      mediaType: SAVED_COMPLETE_ASSEMBLY_NATIVE_MEDIA_V8,
      acceptedCurrentMediaTypes: [],
      label: 'Complete native Assembly review',
      async prepare(request, current) {
        if (current.status !== 'absent')
          throw new Error('The MAIN pattern row already has a saved carrier.');
        return {
          authority: request.currentAuthority,
          transport: {
            patternVersion: anchorRow.patternVersion,
            postSaveReceiptSha256: prepared.reviewReceiptSha256,
            selectedOperationNumber: prepared.document.selection.operationNumber,
          },
          previousSidecarSha256: null,
          sidecarSha256: prepared.sha256,
          byteLength: prepared.bytes.byteLength,
          bytes: prepared.bytes,
          mediaType: SAVED_COMPLETE_ASSEMBLY_NATIVE_MEDIA_V8,
        };
      },
      async beforeRequest(_request, _planned, active) {
        const current = await readCompleteSavedAssemblySourceV1(
          createClient(active),
          row,
          pinned,
          active,
        );
        if (current.priorCarrier !== null)
          throw new Error('The MAIN pattern row already has a saved carrier.');
      },
      async verifyCanonical(bytes) {
        return new TextDecoder('utf-8', { fatal: true }).decode(bytes) === expectedText;
      },
    },
  );
  const saved = await writer.persist(
    { schemaVersion: storageRequest, currentAuthority: target },
    signal,
  );
  if (!saved.ok)
    throw new Error(saved.blockers[0]?.detail ?? 'The Assembly review could not be saved.');
  const current = await readCompleteSavedAssemblySourceV1(
    createClient(signal),
    row,
    pinned,
    signal,
  );
  const carrier = current.priorCarrier;
  if (
    !carrier ||
    carrier.cardLockVersion !== row.cardLockVersion ||
    carrier.mediaType !== SAVED_COMPLETE_ASSEMBLY_NATIVE_MEDIA_V8 ||
    carrier.sidecarSha256 !== prepared.sha256 ||
    carrier.postSaveReceiptSha256 !== prepared.reviewReceiptSha256
  )
    throw new Error('The fresh Complete Source did not return the verified saved review.');
  return { receipt: saved.receipt, current, review: prepared.document };
}

/** The restored grid comes from freshly verified original DXFs, using only saved native IDs. */
export async function restoreSavedCompleteAssemblyNativeStitchReviewV8(
  source: CompleteSavedAssemblySourceV1,
  projection: Parameters<CompletePreparation>[1],
  dictionary: NonNullable<Parameters<CompletePreparation>[3]>,
  signal: AbortSignal,
  includePhysicalCuts = false,
) {
  const carrier = source.priorCarrier;
  if (
    !isVerifiedCompleteSavedAssemblySourceV1(source) ||
    carrier?.mediaType !== SAVED_COMPLETE_ASSEMBLY_NATIVE_MEDIA_V8 ||
    !carrier.sidecarBytes ||
    carrier.cardLockVersion !== projection.cardLockVersion
  )
    throw new Error('A current saved Complete Assembly review is required.');
  const binary = atob(carrier.sidecarBytes);
  const text = new TextDecoder('utf-8', { fatal: true }).decode(
    Uint8Array.from(binary, (character) => character.charCodeAt(0)),
  );
  const rebuilt = await rebuildSavedCompleteAssemblyNativeStitchReviewFromExactBytesV8(
    source,
    projection,
    dictionary,
    { text, sha256: carrier.sidecarSha256 ?? '' },
    signal,
    includePhysicalCuts,
  );
  if (rebuilt.reviewReceiptSha256 !== carrier.postSaveReceiptSha256)
    throw new Error('The saved review receipt differs from the fresh complete native preparation.');
  return rebuilt;
}

/** Replays exact historical V8 bytes after the containing carrier has been verified. */
export async function rebuildSavedCompleteAssemblyNativeStitchReviewFromExactBytesV8(
  source: CompleteSavedAssemblySourceV1,
  projection: Parameters<CompletePreparation>[1],
  dictionary: NonNullable<Parameters<CompletePreparation>[3]>,
  storedReview: Readonly<{ text: string; sha256: string }>,
  signal: AbortSignal,
  includePhysicalCuts = false,
) {
  const { text, sha256 } = storedReview;
  const stored = JSON.parse(text) as Awaited<
    ReturnType<typeof prepareSavedCompleteAssemblyNativeStitchReviewV8>
  >['document'];
  const { sizeId, sizeToken, operationNumber, members } = stored.selection;
  const left = members[0]?.orderedVertexIds;
  const right = members[1]?.orderedVertexIds;
  if (
    stored.schemaVersion !== SAVED_COMPLETE_ASSEMBLY_NATIVE_REVIEW_V8 ||
    !Array.isArray(members) ||
    members.length !== 2 ||
    !Array.isArray(left) ||
    !Array.isArray(right) ||
    left.length !== right.length ||
    left.length > 256 ||
    !left.every((value, i) => typeof value === 'string' && typeof right[i] === 'string')
  )
    throw new Error('The saved native registrations are invalid.');
  const rebuilt = await prepareSavedCompleteAssemblyNativeStitchReviewV8(
    source,
    projection,
    {
      sizeId,
      sizeToken,
      operationNumber,
      registrations: left.map((value, i) => [value, right[i]!]),
    },
    dictionary,
    signal,
    includePhysicalCuts,
  );
  if (rebuilt.sha256 !== sha256 || canonical(rebuilt.document) !== text)
    throw new Error('The saved V8 bytes differ from the fresh complete native preparation.');
  return rebuilt;
}

/** Rebuild the physical inputs only from a fresh saved review, and recheck their source seal. */
export async function readSavedCompleteAssemblyNativePhysicalSourceV8(
  createClient: CreateReviewClient,
  source: CompleteSavedAssemblySourceV1,
  projection: Parameters<CompletePreparation>[1],
  dictionary: NonNullable<Parameters<CompletePreparation>[3]>,
  expected: Readonly<{ sha256: string; operationNumber: number }>,
  signal: AbortSignal,
  retained?: Readonly<{ review: { text: string; sha256: string }; placementSha256: string }>,
) {
  const restored = retained
    ? await rebuildSavedCompleteAssemblyNativeStitchReviewFromExactBytesV8(
        source,
        projection,
        dictionary,
        retained.review,
        signal,
        true,
      )
    : await restoreSavedCompleteAssemblyNativeStitchReviewV8(
        source,
        projection,
        dictionary,
        signal,
        true,
      );
  const { document, gridRequest, grid, cuts, sha256 } = restored;
  if (
    sha256 !== expected.sha256 ||
    document.selection.operationNumber !== expected.operationNumber ||
    cuts?.length !== 2
  )
    throw new Error('The active saved review no longer owns both original cuts.');
  const { anchorRow, serverAssemblyRevision, completeSourceSha256 } = document.bindings;
  const current = await readCompleteSavedAssemblySourceV1(
    createClient(signal),
    completeSavedAssemblyRowIdentityV1(anchorRow),
    {
      expectedServerAssemblyRevision: serverAssemblyRevision,
      expectedCompleteSourceSha256: completeSourceSha256,
    },
    signal,
  );
  if (current.priorCarrier?.sidecarSha256 !== (retained?.placementSha256 ?? sha256))
    throw new Error('The saved review changed while preparing the staged cloth.');
  return Object.freeze({
    document,
    gridRequest,
    grid,
    cuts: Object.freeze([cuts[0]!, cuts[1]!] as const),
    sha256,
  });
}
