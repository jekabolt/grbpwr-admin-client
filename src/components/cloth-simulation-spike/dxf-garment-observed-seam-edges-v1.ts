import type { DxfSeamV1 } from 'lib/cloth/domain/dxf-assembly-handoff-v1';
import type { ClothMeshIR } from 'lib/cloth/mesh/cloth-mesh-ir';

export type DxfGarmentObservedSeamEdgeV1 = Readonly<{
  runtimeSeamId: string;
  sideIndex: 0 | 1;
  pieceId: string;
  triangleIndex: number;
  vertexIndices: readonly [number, number];
}>;

export function indexDxfGarmentObservedBoundaryFacesV1(
  mesh: Pick<ClothMeshIR, 'boundarySamples' | 'triangles' | 'restPositions2Mm'>,
) {
  const vertexCount = mesh.restPositions2Mm.length / 2;
  const samples = new Map(mesh.boundarySamples.map((sample) => [sample.vertexIndex, sample]));
  if (samples.size !== mesh.boundarySamples.length) return null;
  const key = (a: number, b: number) => Math.min(a, b) * vertexCount + Math.max(a, b);
  const edgeFaces = new Map<number, number | null>();
  for (let index = 0; index < mesh.triangles.length; index += 3) {
    for (let corner = 0; corner < 3; corner++) {
      const a = mesh.triangles[index + corner]!;
      const b = mesh.triangles[index + ((corner + 1) % 3)]!;
      if (!samples.has(a) || !samples.has(b)) continue;
      const edge = key(a, b);
      edgeFaces.set(edge, edgeFaces.has(edge) ? null : index / 3);
    }
  }
  return { samples, faceOf: (a: number, b: number) => edgeFaces.get(key(a, b)) };
}

/** Read-only inspection of the compiler's exact recovered A/B order. The placement owner preserves
 * triangle and vertex ordinals. Unsupported or ambiguous paths produce no inspection edges. */
export function buildDxfGarmentObservedSeamEdgesV1(
  mesh: Pick<ClothMeshIR, 'boundarySamples' | 'seams' | 'triangles' | 'restPositions2Mm'>,
  handoffSeams: readonly DxfSeamV1[],
): readonly DxfGarmentObservedSeamEdgeV1[] {
  const boundary = indexDxfGarmentObservedBoundaryFacesV1(mesh);
  if (!boundary) return [];
  const { samples, faceOf } = boundary;
  return Object.freeze(
    handoffSeams.flatMap((seam) => {
      const compiled = mesh.seams.filter(({ seamId }) => seamId === seam.id);
      if (
        compiled.length !== 1 ||
        compiled[0]!.mapping !== 'equal' ||
        compiled[0]!.lengthRatio !== 1
      )
        return [];
      const { vertexPairs } = compiled[0]!;
      if (vertexPairs.length < 4 || vertexPairs.length % 2 !== 0) return [];
      const edges: DxfGarmentObservedSeamEdgeV1[] = [];
      for (const sideIndex of [0, 1] as const) {
        const side = seam.sides[sideIndex];
        const seen = new Set<number>();
        let last: number | null = null;
        for (let index = sideIndex; index < vertexPairs.length; index += 2) {
          const vertex = vertexPairs[index]!;
          const sample = samples.get(vertex);
          if (
            seen.has(vertex) ||
            sample?.pieceId !== side.pieceId ||
            sample.contourId !== side.contourId
          )
            return [];
          seen.add(vertex);
          if (last !== null) {
            const triangleIndex = faceOf(last, vertex);
            if (triangleIndex == null) return [];
            edges.push(
              Object.freeze({
                runtimeSeamId: seam.id,
                sideIndex,
                pieceId: side.pieceId,
                triangleIndex,
                vertexIndices: Object.freeze([last, vertex] as const),
              }),
            );
          }
          last = vertex;
        }
      }
      return edges;
    }),
  );
}
