import type { RegisteredSourceCutStitchV1 } from 'lib/cloth/compiler/source-cut-registered-stitch-pairs-v1';
import type { DxfExactAssemblyGraphV1 } from 'lib/cloth/domain/dxf-exact-assembly-graph-v1';
import {
  DXF_EXACT_NATIVE_SEAM_SPAN_V1,
  resolveDxfExactNativeSeamSpanV1,
} from 'lib/cloth/domain/dxf-exact-native-seam-span-v1';
import type { DxfGarmentAssemblyMaterialCompileStageRequestV1 } from 'lib/cloth/domain/dxf-garment-assembly-material-compile-stage-v1';
import type { DxfProductPhaseDNativeStraightEdgesProjectionV3 } from 'lib/cloth/domain/dxf-product-phase-d-native-straight-edge-binding-v1';
import type { Vec2Mm } from 'lib/cloth/domain/garment-assembly-ir';
import { segmentDxf } from 'lib/pattern-import/adapters/dxf/segment';
import type { DxfProductPhaseDReplayCarrierV1 } from 'lib/pattern-import/dxf-product-phase-d-replay-v1';
import type { DxfProductSavedNativeCompilerSourceProjectionV1 } from 'lib/pattern-import/dxf-product-saved-native-reprocess-owner-v1';
import {
  DXF_SOURCE_NATIVE_STRAIGHT_EDGE_SELECTED_PATHS_REQUEST_V1,
  projectDxfSourceNativeStraightEdgeSelectedPathsV1,
  readDxfWithSourceNativeStraightEdgeSelectedPathAuthorityV1,
} from 'lib/pattern-import/dxf-source-native-straight-edge-authority-v1';
import { PATIMPORT, type PtMm } from 'lib/pattern-import/types';
import { createPatternImportDxfPhaseESavedAssemblySnapshotProductionRpcV1 } from './saved-assembly-snapshot-production-rpc-v1';
import { createPatternImportDxfPhaseESavedDxfReprocessHostV1 } from './saved-dxf-reprocess-host-v1';

export type SavedFullAssemblyRegisteredCutSourceV1 = Readonly<{
  pieces: readonly Readonly<{
    pieceId: string;
    pieceLineKey: string;
    ringMm: readonly Vec2Mm[];
    nativePathId: number;
    vertexIds: readonly string[];
  }>[];
  stitches: readonly RegisteredSourceCutStitchV1[];
}>;

const only = <T>(items: readonly T[]) => (items.length === 1 ? items[0] : undefined);
const samePoint = (a: PtMm, b: PtMm) => a.x === b.x && a.y === b.y;
const pointMatches = (v: Vec2Mm, p: PtMm) => v[0] === p.x && v[1] === p.y;

export function supportsSavedFullAssemblyRegisteredCutV1(graph: DxfExactAssemblyGraphV1) {
  const [operation] = graph.operations;
  const [seam] = graph.seams;
  return (
    graph.profile === 'single-saved-row-size-adjacent-native-stitch' &&
    graph.source.handoffSource.exporterId === 'grbpwr.saved-native-drawn-sewing' &&
    graph.pieces.length === 2 &&
    graph.pieces.every(({ cutCount }) => cutCount === 1) &&
    new Set(graph.pieces.map(({ pieceId }) => pieceId)).size === 2 &&
    new Set(graph.pieces.map(({ pieceLineKey }) => pieceLineKey)).size === 2 &&
    graph.operations.length === 1 &&
    operation.kind === 'stitch' &&
    graph.seams.length === 1 &&
    seam.mapping === 'equal' &&
    seam.lengthRatio === 1 &&
    operation.seamIds.length === 1 &&
    operation.seamIds[0] === seam.id &&
    seam.clientOperationId === operation.clientOperationId &&
    seam.sides[0].pieceId !== seam.sides[1].pieceId &&
    seam.sides.every(({ pieceId, pieceLineKey }) =>
      graph.pieces.some(
        (piece) => piece.pieceId === pieceId && piece.pieceLineKey === pieceLineKey,
      ),
    )
  );
}

function originalPath(
  carrier: DxfProductPhaseDReplayCarrierV1,
  pieceId: string,
  sizeToken: string,
  role: 'cut-boundary' | 'sewing-boundary',
) {
  const candidates = carrier.contours.filter(
    (contour) => contour.pieceId === pieceId && contour.sizeToken === sizeToken,
  );
  if (candidates.some(({ role }) => role === 'hole')) return null;
  const contour = only(candidates.filter((candidate) => candidate.role === role));
  if (
    !contour?.closed ||
    contour.lineage.sourcePathIds.length !== 1 ||
    contour.lineage.mutations.length ||
    contour.lineage.uniformPositiveScale !== 1
  )
    return null;
  const path = only(
    carrier.source.paths.filter((entry) => entry.pathId === contour.lineage.sourcePathIds[0]),
  );
  if (
    !path?.closed ||
    path.pointsMm.length < 3 ||
    path.pointsMm.length !== contour.pointsMm.length ||
    path.provenance.samples.length !== path.pointsMm.length
  )
    return null;
  const { cyclicShift, direction } = contour.lineage;
  const count = path.pointsMm.length;
  if (!Number.isInteger(cyclicShift) || cyclicShift < 0 || cyclicShift >= count) return null;
  const sourceIndex = (index: number) =>
    (cyclicShift + (direction === 'forward' ? index : count - 1 - index)) % count;
  if (contour.pointsMm.some((point, i) => !samePoint(point, path.pointsMm[sourceIndex(i)]!)))
    return null;
  return { contour, path, sourceIndex };
}

/** Rebind the original L1 paths with an independent decoder over the transaction-pinned bytes. */
export async function projectSavedFullAssemblyRegisteredCutSourceV1(
  source: DxfProductSavedNativeCompilerSourceProjectionV1,
  graph: DxfExactAssemblyGraphV1,
  request: DxfGarmentAssemblyMaterialCompileStageRequestV1,
  native: DxfProductPhaseDNativeStraightEdgesProjectionV3,
  signal: AbortSignal,
): Promise<SavedFullAssemblyRegisteredCutSourceV1 | null> {
  const cut = source.draft.dxfPhaseDReplay?.carrier;
  const sewing = source.nativeSewingReplay?.replay?.carrier;
  const { row, sourceFileId } = source;
  if (
    !supportsSavedFullAssemblyRegisteredCutV1(graph) ||
    !cut ||
    !sewing ||
    [cut, sewing].some(
      (carrier) => carrier.sourceFileId !== sourceFileId || carrier.sourceSha256 !== row.sha256,
    ) ||
    request.handoff.seal.canonicalSha256 !== graph.source.handoffCanonicalSha256 ||
    request.handoff.source.exportSha256 !== row.sha256 ||
    request.samplingRequest.sourceFileId !== sourceFileId
  )
    return null;

  const { read, provenance } = source.nativeRead;
  const blocks = segmentDxf(read).pieces;
  const rawPaths = read.doc.pages.flatMap(({ paths, styles }) =>
    paths.map((path) => ({
      path,
      layer: styles.find(({ id }) => id === path.style)?.layer,
    })),
  );
  const bindsRawPath = (value: NonNullable<ReturnType<typeof originalPath>>, layer: string) => {
    const { path } = value;
    const raw = only(rawPaths.filter((entry) => entry.path.id === path.pathId));
    const original = only(provenance.paths.filter(({ pathId }) => pathId === path.pathId));
    if (
      raw?.layer !== layer ||
      !raw.path.closed ||
      !raw.path.src.block ||
      raw.path.pts.length !== path.pointsMm.length ||
      raw.path.pts.some((point, i) => !samePoint(point, path.pointsMm[i]!)) ||
      !original ||
      JSON.stringify(original.provenance) !== JSON.stringify(path.provenance)
    )
      return null;
    return raw.path;
  };
  const [seam] = graph.seams;
  const [operation] = graph.operations;
  const joined: {
    pieceId: string;
    pieceLineKey: string;
    cut: NonNullable<ReturnType<typeof originalPath>>['path'];
    run: RegisteredSourceCutStitchV1['sections'][number]['sideA'];
    occurrenceIndex: number;
  }[] = [];
  for (const { pieceId, pieceLineKey, contourId, anchors, direction } of seam.sides) {
    const nativeCut = originalPath(cut, pieceId, graph.source.sizeToken, 'cut-boundary');
    const nativeSewing = originalPath(sewing, pieceId, graph.source.sizeToken, 'sewing-boundary');
    if (!nativeCut || nativeSewing?.contour.contourId !== contourId) return null;
    const rawCut = bindsRawPath(nativeCut, '1');
    const rawSewing = bindsRawPath(nativeSewing, '14');
    if (!rawCut || !rawSewing || rawCut.src.block !== rawSewing.src.block) return null;
    const occurrence = only(
      read.meta.groups.filter(
        ({ paths }) => paths.includes(rawCut.id) || paths.includes(rawSewing.id),
      ),
    );
    if (
      occurrence?.kind !== 'insert' ||
      occurrence.block !== rawCut.src.block ||
      !occurrence.paths.includes(rawCut.id) ||
      !occurrence.paths.includes(rawSewing.id)
    )
      return null;
    const candidate = only(blocks.filter(({ group }) => group === occurrence.index));
    if (
      candidate?.cut?.paths.length !== 1 ||
      candidate.cut.paths[0] !== rawCut.id ||
      candidate.seam?.paths.length !== 1 ||
      candidate.seam.paths[0] !== rawSewing.id ||
      candidate.seamSource !== 'L14' ||
      candidate.nested ||
      Object.values(candidate.roles).some(
        (role) => role === 'hole' || role === 'cut-extra' || role === 'seam-extra',
      )
    )
      return null;

    const resolved = await resolveDxfExactNativeSeamSpanV1(
      {
        schemaVersion: DXF_EXACT_NATIVE_SEAM_SPAN_V1,
        handoff: request.handoff,
        sourceSampling: { sourceFileId, pieces: request.samplingRequest.pieces },
        side: { pieceId, contourId, anchors, direction },
      },
      signal,
    );
    signal.throwIfAborted();
    if (
      !resolved.ok ||
      resolved.witness.edges.length !== 1 ||
      resolved.witness.corners.length !== 2
    )
      return null;
    const [span] = resolved.witness.edges;
    const edge = only(
      native.edges.filter(
        (entry) =>
          entry.pieceId === pieceId &&
          entry.contourId === contourId &&
          entry.edgeIndex === span.occurrence.edgeIndex,
      ),
    );
    if (
      edge?.sourcePathId !== rawSewing.id ||
      edge.descriptor.sourceCurveId !== span.occurrence.native.sourceCurveId ||
      resolved.witness.corners.some(({ vertex, contourVertexIndex }) => {
        const index = nativeSewing.sourceIndex(contourVertexIndex);
        return (
          nativeSewing.path.provenance.samples[index]?.vertexId !== vertex.id ||
          !pointMatches(vertex.positionMm, nativeSewing.path.pointsMm[index]!)
        );
      })
    )
      return null;
    const [start, end] = resolved.witness.corners;
    joined.push({
      pieceId,
      pieceLineKey,
      cut: nativeCut.path,
      run: {
        pieceId,
        intervals: [{ startMm: start.vertex.positionMm, endMm: end.vertex.positionMm }],
      },
      occurrenceIndex: occurrence.index,
    });
  }
  if (joined.length !== 2 || joined[0].occurrenceIndex === joined[1].occurrenceIndex) return null;

  const snapshot = createPatternImportDxfPhaseESavedAssemblySnapshotProductionRpcV1(
    operation.sourceOperationNumber,
  );
  const host = createPatternImportDxfPhaseESavedDxfReprocessHostV1({
    readAuthoritativeRow: snapshot.bridge.readAuthoritativeRow,
    async resolveCard() {
      throw new Error('Native cut verification uses only the exact saved-row byte reader.');
    },
  });
  let bytes: Uint8Array | undefined;
  let decoderBytes: Uint8Array<ArrayBuffer> | undefined;
  try {
    ({ bytes } = await host.readAuthoritativeRow(row, signal, () => {}));
    const pathRequest = {
      schemaVersion: DXF_SOURCE_NATIVE_STRAIGHT_EDGE_SELECTED_PATHS_REQUEST_V1,
      sourceFileId,
      sourceSha256: row.sha256,
      sourcePathIds: joined.map(({ cut }) => cut.pathId).sort((a, b) => a - b),
    } as const;
    decoderBytes = Uint8Array.from(bytes);
    const decoded = await readDxfWithSourceNativeStraightEdgeSelectedPathAuthorityV1(
      {
        id: sourceFileId,
        name: 'authoritative-saved-pattern.dxf',
        bytes: decoderBytes.buffer,
      },
      { sagittaMm: PATIMPORT.sagittaMm, keepFills: true },
      pathRequest,
    );
    signal.throwIfAborted();
    if (!decoded.ok) return null;
    const projected = await projectDxfSourceNativeStraightEdgeSelectedPathsV1(
      decoded.value.owner,
      pathRequest,
    );
    signal.throwIfAborted();
    if (!projected.ok || !projected.projection.complete) return null;

    const pieces: SavedFullAssemblyRegisteredCutSourceV1['pieces'][number][] = [];
    for (const { pieceId, pieceLineKey, cut } of joined) {
      const edges = projected.projection.descriptors
        .filter(({ path }) => path.sourcePathId === cut.pathId)
        .toSorted((a, b) => a.path.startPointIndex - b.path.startPointIndex);
      if (
        edges.length !== cut.pointsMm.length ||
        new Set(edges.map(({ startVertexId }) => startVertexId)).size !== edges.length ||
        edges.some((edge, i) => {
          const next = (i + 1) % edges.length;
          const sample = cut.provenance.samples[i];
          return (
            edge.path.startPointIndex !== i ||
            edge.path.endPointIndex !== next ||
            !edge.path.closed ||
            edge.startVertexId !== sample?.vertexId ||
            edge.sourceCurveId !== sample.sourceCurveId ||
            edge.endVertexId !== edges[next]!.startVertexId ||
            !pointMatches(edge.startMm, cut.pointsMm[i]!) ||
            !pointMatches(edge.endMm, cut.pointsMm[next]!)
          );
        })
      )
        return null;
      pieces.push({
        pieceId,
        pieceLineKey,
        nativePathId: cut.pathId,
        ringMm: edges.map(({ startMm }) => startMm),
        vertexIds: edges.map(({ startVertexId }) => startVertexId),
      });
    }
    return {
      pieces,
      stitches: [
        {
          operationOrder: operation.order,
          seamId: seam.id,
          sections: [{ sideA: joined[0].run, sideB: joined[1].run }],
        },
      ],
    };
  } finally {
    decoderBytes?.fill(0);
    bytes?.fill(0);
    host.dispose();
  }
}
