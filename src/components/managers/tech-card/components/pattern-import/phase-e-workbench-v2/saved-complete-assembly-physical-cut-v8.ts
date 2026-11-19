import {
  DXF_SOURCE_NATIVE_STRAIGHT_EDGE_SELECTED_PATHS_REQUEST_V1,
  projectDxfSourceNativeStraightEdgeSelectedPathsV1,
  readDxfWithSourceNativeStraightEdgeSelectedPathAuthorityV1,
} from 'lib/pattern-import/dxf-source-native-straight-edge-authority-v1';
import type { DxfProductSavedNativeCompilerSourceProjectionV1 } from 'lib/pattern-import/dxf-product-saved-native-reprocess-owner-v1';
import { PATIMPORT } from 'lib/pattern-import/types';
import type { CompleteSavedAssemblySourceV1 } from './saved-assembly-complete-source-rpc-v1';
import { createSavedFullAssemblyCompleteDxfHostsV1 } from './saved-full-assembly-complete-dxf-host-v1';
import { canonicalizePatternImportDxfPhaseESavedAssemblyValueV1 as canonical } from './saved-assembly-topology-hash-v1';
import type {
  bindSavedFullAssemblyNativeCutPathsV1,
  SavedAssemblyNativeSewingPathV1,
} from './saved-full-assembly-native-boundaries-v1';

type Cut = Awaited<ReturnType<typeof bindSavedFullAssemblyNativeCutPathsV1>>[number];

/** Authenticates the original L1 cut and its block occurrence independently from the L14 run. */
export async function readSavedCompleteAssemblyPhysicalCutV8(
  complete: CompleteSavedAssemblySourceV1,
  projection: Parameters<typeof createSavedFullAssemblyCompleteDxfHostsV1>[1],
  source: DxfProductSavedNativeCompilerSourceProjectionV1,
  sewing: SavedAssemblyNativeSewingPathV1,
  cut: Cut,
  signal: AbortSignal,
) {
  const { nativeRead, sourceFileId, row } = source;
  const phaseD = source.draft.dxfPhaseDReplay?.carrier;
  if (
    !phaseD ||
    phaseD.sourceFileId !== sourceFileId ||
    phaseD.sourceSha256 !== row.sha256 ||
    sourceFileId !== sewing.sourceFileId ||
    canonical(row) !== canonical(cut.row) ||
    canonical(row) !== canonical(sewing.row) ||
    cut.pieceId !== sewing.pieceId ||
    cut.pieceLineKey !== sewing.pieceLineKey ||
    cut.blockName !== sewing.blockName ||
    cut.sizeToken !== sewing.sizeToken ||
    cut.nativePathId === sewing.nativePathId
  )
    throw new Error(
      'The finished cut and the saved sewing run must come from the same native piece.',
    );

  if (
    phaseD.contours.some(
      ({ pieceId, role, sizeToken }) =>
        pieceId === cut.pieceId && role === 'hole' && sizeToken === cut.sizeToken,
    )
  )
    throw new Error('This staged cloth preview requires an original cut outline without holes.');

  const rawPaths = nativeRead.read.doc.pages.flatMap(({ paths, styles }) =>
    paths
      .filter(({ id }) => id === cut.nativePathId || id === sewing.nativePathId)
      .map((path) => ({ path, layer: styles.find(({ id }) => id === path.style)?.layer })),
  );
  const rawCut = rawPaths.find(({ path }) => path.id === cut.nativePathId);
  const rawSewing = rawPaths.find(({ path }) => path.id === sewing.nativePathId);
  if (
    rawPaths.length !== 2 ||
    rawCut?.layer !== '1' ||
    rawSewing?.layer !== '14' ||
    !rawCut.path.closed ||
    !rawSewing.path.closed ||
    !rawCut.path.src.block ||
    rawCut.path.src.block !== rawSewing.path.src.block
  )
    throw new Error('The saved cut and sewing runs do not identify one original L1/L14 DXF block.');

  // The sewing owner has already served its single L14 claim. Read the selected
  // original L1 path from the same durable row through its own verified fetch.
  const host = createSavedFullAssemblyCompleteDxfHostsV1(complete, projection).createCanonical();
  let bytes: Uint8Array | undefined;
  const request = {
    schemaVersion: DXF_SOURCE_NATIVE_STRAIGHT_EDGE_SELECTED_PATHS_REQUEST_V1,
    sourceFileId,
    sourceSha256: row.sha256,
    sourcePathIds: [cut.nativePathId],
  } as const;
  const exact = await (async () => {
    try {
      ({ bytes } = await host.readAuthoritativeRow(row, signal, () => {}));
      const file = new Uint8Array(bytes);
      try {
        const read = await readDxfWithSourceNativeStraightEdgeSelectedPathAuthorityV1(
          { id: sourceFileId, name: `${cut.blockName}.dxf`, bytes: file.buffer },
          { sagittaMm: PATIMPORT.sagittaMm, keepFills: true },
          request,
        );
        signal.throwIfAborted();
        if (!read.ok)
          throw new Error(read.blockers[0]?.detail ?? 'The original cut could not be verified.');
        return await projectDxfSourceNativeStraightEdgeSelectedPathsV1(read.value.owner, request);
      } finally {
        file.fill(0);
      }
    } finally {
      bytes?.fill(0);
      host.dispose();
    }
  })();
  signal.throwIfAborted();
  if (!exact.ok || !exact.projection.complete)
    throw new Error('The original cut cannot be replayed as exact source edges.');
  const edges = [...exact.projection.descriptors].sort(
    (a, b) => a.path.startPointIndex - b.path.startPointIndex,
  );
  if (
    edges.length < 3 ||
    edges.length !== cut.nativePointsMm.length ||
    new Set(edges.map(({ startVertexId }) => startVertexId)).size !== edges.length ||
    edges.some(
      (edge, i) =>
        edge.sourceFileId !== sourceFileId ||
        edge.path.sourcePathId !== cut.nativePathId ||
        edge.startMm[0] !== cut.nativePointsMm[i]!.x ||
        edge.startMm[1] !== cut.nativePointsMm[i]!.y ||
        edge.endVertexId !== edges[(i + 1) % edges.length]!.startVertexId,
    )
  )
    throw new Error('The original cut edges disagree with the sealed native outline.');

  return Object.freeze({
    row,
    sourceFileId,
    sizeToken: cut.sizeToken,
    pieceId: cut.pieceId,
    pieceLineKey: cut.pieceLineKey,
    blockName: rawCut.path.src.block,
    nativePathId: cut.nativePathId,
    vertexIds: Object.freeze(edges.map(({ startVertexId }) => startVertexId)),
    ringMm: Object.freeze(edges.map(({ startMm: [x, y] }) => Object.freeze([x, y] as const))),
  });
}
