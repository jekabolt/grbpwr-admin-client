import type { GarmentPhase2InteriorRefinementArtifactV1 } from 'lib/cloth/mesh/garment-phase2-interior-refinement-v1';
import type { Phase2BoundarySamplingRequestV1 } from 'lib/cloth/mesh/triangulation/phase2-boundary-sampling-v1';
import { indexDxfGarmentObservedBoundaryFacesV1 } from './dxf-garment-observed-seam-edges-v1';

export type DxfGarmentObservedBoundaryEdgeV1 = Readonly<{
  contourId: string;
  boundaryVertexIds: readonly [string, string];
}>;

export type DxfGarmentObservedUnsewnEdgeV1 = DxfGarmentObservedBoundaryEdgeV1 &
  Readonly<{
    pieceId: string;
    vertexIndices: readonly number[];
  }>;

const occurrence = (pieceId: string, edgeId: string) => JSON.stringify([pieceId, edgeId]);

/** Recover native occurrences from those same boundary IDs that the compiler placed and refined.
 * Only an exact adjacent native anchor span with a complete, indexed boundary is inspectable. */
export function buildDxfGarmentObservedUnsewnEdgesV1(
  refinement: Pick<
    GarmentPhase2InteriorRefinementArtifactV1,
    'mesh' | 'boundaryRecoveryEvidence' | 'vertexProvenance'
  >,
  samplingRequest: Phase2BoundarySamplingRequestV1,
): readonly DxfGarmentObservedUnsewnEdgeV1[] {
  const boundary = indexDxfGarmentObservedBoundaryFacesV1(refinement.mesh);
  if (!boundary) return [];
  const sewn = new Set(
    samplingRequest.equalSeams.flatMap(({ sides }) =>
      sides.map(({ pieceId, edgeId }) => occurrence(pieceId, edgeId)),
    ),
  );
  const indices = new Map<string, number>();
  for (const { source, pieceId, globalVertexIndex } of refinement.vertexProvenance) {
    if (source.kind !== 'boundary-recovery') continue;
    const key = occurrence(pieceId, source.boundaryVertexId);
    if (indices.has(key)) return [];
    indices.set(key, globalVertexIndex);
  }

  return Object.freeze(
    samplingRequest.pieces.flatMap(({ input, edges }) => {
      if (
        samplingRequest.pieces.filter(({ input: candidate }) => candidate.pieceId === input.pieceId)
          .length !== 1
      )
        return [];
      const recovered = refinement.boundaryRecoveryEvidence.pieces.filter(
        ({ pieceId }) => pieceId === input.pieceId,
      );
      if (recovered.length !== 1) return [];
      return [input.shell, ...input.holes].flatMap((ring) => {
        const matches = recovered[0]!.loops.filter(({ contourId }) => contourId === ring.id);
        if (matches.length !== 1) return [];
        const { recoveredBoundaryVertexIds: recoveredIds } = matches[0]!;
        const recoveredOrdinals = new Map(recoveredIds.map((id, index) => [id, index]));
        const anchors = new Set(ring.vertices.map(({ id }) => id));
        if (recoveredOrdinals.size !== recoveredIds.length || anchors.size !== ring.vertices.length)
          return [];

        const ringEdges = edges.filter(({ ringId }) => ringId === ring.id);
        const countByOrdinal = new Map<number, number>();
        for (const { edgeIndex } of ringEdges)
          countByOrdinal.set(edgeIndex, (countByOrdinal.get(edgeIndex) ?? 0) + 1);
        return ringEdges.flatMap((edge) => {
          const { pieceId, ringId, edgeId, edgeIndex, startBoundaryVertexId, endBoundaryVertexId } =
            edge;
          if (
            pieceId !== input.pieceId ||
            countByOrdinal.get(edgeIndex) !== 1 ||
            sewn.has(occurrence(pieceId, edgeId)) ||
            ring.vertices[edgeIndex]?.id !== startBoundaryVertexId ||
            ring.vertices[(edgeIndex + 1) % ring.vertices.length]?.id !== endBoundaryVertexId
          )
            return [];
          const from = recoveredOrdinals.get(startBoundaryVertexId);
          const to = recoveredOrdinals.get(endBoundaryVertexId);
          if (from == null || to == null || from === to) return [];

          const vertexIndices: number[] = [];
          for (let offset = 0; offset < recoveredIds.length; offset++) {
            const ordinal = (from + offset) % recoveredIds.length;
            const id = recoveredIds[ordinal]!;
            if (offset > 0 && ordinal !== to && anchors.has(id)) return [];
            const index = indices.get(occurrence(pieceId, id));
            if (index == null) return [];
            const sample = boundary.samples.get(index);
            if (sample?.pieceId !== pieceId || sample.contourId !== ringId) return [];
            const previous = vertexIndices.at(-1);
            if (
              previous !== undefined &&
              (previous === index || boundary.faceOf(previous, index) == null)
            )
              return [];
            vertexIndices.push(index);
            if (ordinal === to)
              return [
                Object.freeze({
                  pieceId,
                  contourId: ringId,
                  boundaryVertexIds: Object.freeze([
                    startBoundaryVertexId,
                    endBoundaryVertexId,
                  ] as const),
                  vertexIndices: Object.freeze(vertexIndices),
                }),
              ];
          }
          return [];
        });
      });
    }),
  );
}
