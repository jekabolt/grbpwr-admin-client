import {
  projectDxfPieceSpecContourBoundaryV1,
  type DxfPieceSpecContourBoundaryV1,
} from './dxf-piece-spec-provenance-bridge-v1';
import {
  attachDxfPipelineContentBindingV1,
  bridgeDxfPipelineProvenanceV1,
  computeDxfPipelineContentBindingV1,
  createDxfPipelineContourIdV1,
  dxfPipelineBlockerV1,
  phaseCBlockersToPipelineV1,
  type DxfCandidateLineageSidecarV1,
  type DxfPipelineProvenanceBlockerV1,
  type DxfPipelineProvenanceStageOutputV1,
  type DxfSemanticsProvenanceTraceV1,
} from './dxf-pipeline-provenance-v1';
import {
  buildDxfProductPhaseDReplayV1,
  type DxfProductPhaseDReplayStageOutputV1,
} from './dxf-product-phase-d-replay-v1';
import type { DxfSourceNativeStraightEdgeProjectionV1 } from './dxf-source-native-straight-edge-authority-v1';
import type { PieceSpec } from './types';

export const DXF_NATIVE_SEWING_REPLAY_REQUEST_V1 = 'dxf-native-sewing-replay-request/1' as const;
export const DXF_NATIVE_SEWING_REPLAY_V1 = 'dxf-native-sewing-replay/1' as const;
export type DxfNativeSewingReplayRequestV1 = Readonly<{
  schemaVersion: typeof DXF_NATIVE_SEWING_REPLAY_REQUEST_V1;
}>;
const CLAIMS = Object.freeze({
  sourceSurface: 'explicit-native-drawn-sewing' as const,
  successfulReplayExtraOriginalByteDecodePasses: 1 as const,
  nativeAuthorityMinted: false as const,
  writerExportShaBound: false as const,
  sourceGeometryInferred: false as const,
  offsetGeometryAccepted: false as const,
  storedSeamAuthorityUsed: false as const,
  productionReady: false as const,
});
const SCOPED_CLAIMS = Object.freeze({
  ...CLAIMS,
  successfulReplayExtraOriginalByteDecodePasses: 2 as const,
});
export type DxfNativeSewingReplayStageOutputV1 =
  | Readonly<{
      schemaVersion: typeof DXF_NATIVE_SEWING_REPLAY_V1;
      replayReady: true;
      pipeline: DxfPipelineProvenanceStageOutputV1;
      replay: Extract<DxfProductPhaseDReplayStageOutputV1, { replayReady: true }>;
      blockers: readonly [];
      claims: typeof CLAIMS | typeof SCOPED_CLAIMS;
    }>
  | Readonly<{
      schemaVersion: typeof DXF_NATIVE_SEWING_REPLAY_V1;
      replayReady: false;
      pipeline: null;
      replay: null;
      blockers: readonly DxfPipelineProvenanceBlockerV1[];
      claims: typeof CLAIMS;
    }>;

export function blockedDxfNativeSewingReplayV1(
  blockers: readonly DxfPipelineProvenanceBlockerV1[],
): DxfNativeSewingReplayStageOutputV1 {
  return Object.freeze({
    schemaVersion: DXF_NATIVE_SEWING_REPLAY_V1,
    replayReady: false,
    pipeline: null,
    replay: null,
    blockers: Object.freeze(
      blockers.length
        ? [...blockers].slice(0, 128)
        : [
            dxfPipelineBlockerV1(
              'invalid-input',
              'Native sewing replay failed without a diagnostic.',
            ),
          ],
    ),
    claims: CLAIMS,
  });
}

let requestCaptureClaimed = false;

export function validateDxfNativeSewingReplayRequestV1(
  value: unknown,
): DxfPipelineProvenanceBlockerV1 | null {
  if (requestCaptureClaimed)
    return dxfPipelineBlockerV1(
      'invalid-input',
      'Reentrant native sewing request capture was refused.',
    );
  requestCaptureClaimed = true;
  try {
    if (!value || typeof value !== 'object' || Object.getPrototypeOf(value) !== Object.prototype)
      throw new TypeError();
    const fields = Object.getOwnPropertyDescriptors(value);
    const keys = Reflect.ownKeys(fields);
    if (
      keys.length !== 1 ||
      keys[0] !== 'schemaVersion' ||
      !fields.schemaVersion.enumerable ||
      !Object.hasOwn(fields.schemaVersion, 'value') ||
      fields.schemaVersion.value !== DXF_NATIVE_SEWING_REPLAY_REQUEST_V1
    )
      throw new TypeError();
    return null;
  } catch {
    return dxfPipelineBlockerV1(
      'invalid-input',
      'Native sewing request must be an exact getter-free schema record.',
    );
  } finally {
    requestCaptureClaimed = false;
  }
}

export type DxfNativeSewingTraceV1 = Readonly<{
  pieceId: string;
  sizeToken: string;
  trace: DxfSemanticsProvenanceTraceV1 | null;
}>;

/** Content-only composition used by Session. Structural arguments never create a native owner.
 * Session supplies a freshly consumed decoder projection; the final saved-source adapter must
 * independently bind its own genuine source-native capability before compiling this replay. */
export async function buildDxfNativeSewingReplayV1(
  lineage: DxfCandidateLineageSidecarV1,
  pieces: readonly PieceSpec[],
  traces: readonly DxfNativeSewingTraceV1[],
  native: Pick<
    DxfSourceNativeStraightEdgeProjectionV1,
    'sourceFileId' | 'sourceSha256' | 'descriptors' | 'blockers'
  >,
  sourceDecodePasses: 1 | 2 = 1,
): Promise<DxfNativeSewingReplayStageOutputV1> {
  const refuse = (detail: string) =>
    blockedDxfNativeSewingReplayV1([dxfPipelineBlockerV1('candidate-lineage-missing', detail)]);
  if (
    lineage.source.sourceFileId !== native.sourceFileId ||
    !/^[a-f0-9]{64}$/.test(native.sourceSha256)
  )
    return refuse('The private lineage and fresh original-byte native source differ.');
  if (
    !lineage.entries.length ||
    lineage.entries.length > 4096 ||
    traces.length !== lineage.entries.length
  )
    return refuse('Native sewing candidate/trace cardinality differs or exceeds its bound.');
  const byCandidate = new Map(
    lineage.entries.map((entry) => [`${entry.seed}:${entry.rank}`, entry]),
  );
  if (byCandidate.size !== lineage.entries.length)
    return refuse('Native sewing candidate identity is duplicated.');
  const paths = new Map(lineage.source.paths.map((path) => [path.pathId, path]));
  const descriptorsByPath = new Map<number, (typeof native.descriptors)[number][]>();
  for (const descriptor of native.descriptors) {
    const list = descriptorsByPath.get(descriptor.path.sourcePathId) ?? [];
    list.push(descriptor);
    descriptorsByPath.set(descriptor.path.sourcePathId, list);
  }
  if (native.blockers.some((blocker) => blocker.sourcePathId === null))
    return refuse('Fresh native extraction has an unscoped source identity blocker.');
  const used = new Set<string>(),
    identities = new Set<string>();
  const boundaries: DxfPieceSpecContourBoundaryV1[] = [];
  for (const item of traces) {
    const trace = item.trace;
    if (!trace || trace.geometry !== 'seam' || trace.mutations.length || trace.cyclicShift !== 0)
      return refuse(
        `Native sewing ${item.pieceId}/${item.sizeToken} is absent, derived or changed by semantics.`,
      );
    const key = `${trace.seed}:${trace.rank}`,
      candidate = byCandidate.get(key);
    if (
      !candidate ||
      candidate.sourceGeometry !== 'seam' ||
      candidate.sourcePathIds.length !== 1 ||
      used.has(key)
    )
      return refuse('Native sewing requires one exact path per unique candidate.');
    used.add(key);
    const pathId = candidate.sourcePathIds[0],
      path = paths.get(pathId);
    const edges = descriptorsByPath.get(pathId) ?? [];
    if (
      !path ||
      !path.closed ||
      path.pointsMm.length < 3 ||
      edges.length !== path.pointsMm.length ||
      native.blockers.some((blocker) => blocker.sourcePathId === pathId)
    )
      return refuse(
        `Selected seam PathId ${pathId} is not a complete closed straight-native path.`,
      );
    const starts = new Set<number>();
    for (const edge of edges) {
      const start = edge.path.startPointIndex,
        end = edge.path.endPointIndex;
      const a = path.pointsMm[start],
        b = path.pointsMm[end],
        sample = path.provenance.samples[start];
      if (
        starts.has(start) ||
        !edge.path.closed ||
        !a ||
        !b ||
        !sample ||
        end !== (start + 1) % path.pointsMm.length ||
        edge.sourceFileId !== native.sourceFileId ||
        edge.sourceCurveId !== sample.sourceCurveId ||
        edge.startVertexId !== sample.vertexId ||
        edge.endVertexId !== path.provenance.samples[end].vertexId ||
        edge.startMm[0] !== a.x ||
        edge.startMm[1] !== a.y ||
        edge.endMm[0] !== b.x ||
        edge.endMm[1] !== b.y ||
        edge.native.curveKind !== 'line'
      )
        return refuse(
          `Selected seam PathId ${pathId} has incomplete exact native edge/sample binding.`,
        );
      starts.add(start);
    }
    const matches = pieces.filter((piece) => piece.identity === item.pieceId);
    const identity = `${item.pieceId}\0${item.sizeToken}`;
    if (matches.length !== 1 || identities.has(identity))
      return refuse('Final seam piece/size identity is ambiguous.');
    identities.add(identity);
    const contourId = createDxfPipelineContourIdV1(item.pieceId, item.sizeToken, 'seam');
    if (!contourId) return refuse('Native sewing contour identity exceeds the existing bound.');
    const projected = projectDxfPieceSpecContourBoundaryV1(matches[0], item.sizeToken, {
      contourId,
      role: 'sewing-boundary',
      geometry: { kind: 'seam' },
      lineage: {
        sourcePathIds: candidate.sourcePathIds,
        uniformPositiveScale: lineage.uniformPositiveScale,
        cyclicShift: 0,
        direction: trace.direction,
        mutations: [],
      },
    });
    if (!projected.ok)
      return blockedDxfNativeSewingReplayV1(phaseCBlockersToPipelineV1(projected.blockers));
    boundaries.push(projected.value);
  }
  if (pieces.reduce((count, piece) => count + piece.sizes.length, 0) !== traces.length)
    return refuse('Every final piece and size must have an exact native sewing trace.');
  Object.freeze(boundaries);
  const carried = bridgeDxfPipelineProvenanceV1(lineage.source, boundaries);
  if (!carried.pipelineIntegrated || !carried.carrier)
    return blockedDxfNativeSewingReplayV1(carried.blockers);
  const content = await computeDxfPipelineContentBindingV1(
    carried.carrier,
    pieces,
    native.sourceSha256,
  );
  if (!content.ok) return blockedDxfNativeSewingReplayV1([content.blocker]);
  const pipeline = attachDxfPipelineContentBindingV1(carried, content.value);
  const replay = await buildDxfProductPhaseDReplayV1(lineage.source, boundaries, pieces, pipeline);
  if (!replay.replayReady) return blockedDxfNativeSewingReplayV1(replay.blockers);
  return Object.freeze({
    schemaVersion: DXF_NATIVE_SEWING_REPLAY_V1,
    replayReady: true,
    pipeline,
    replay,
    blockers: Object.freeze([] as const),
    claims: sourceDecodePasses === 2 ? SCOPED_CLAIMS : CLAIMS,
  });
}
