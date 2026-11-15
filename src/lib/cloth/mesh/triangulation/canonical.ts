import type { TriangulationAuditCandidate } from './types';

function canonicalPayload(result: TriangulationAuditCandidate): string {
  return JSON.stringify({
    vertices: result.vertices.map((vertex) => ({
      positionMm: vertex.positionMm,
      source: vertex.source,
    })),
    triangles: [...result.triangles],
    boundaryLoops: result.boundaryLoops.map((loop) => [
      loop.inputRingId,
      loop.role,
      [...loop.vertexIndices],
    ]),
    seamEndpoints: result.seamEndpoints.map((endpoint) => [
      endpoint.seamEndpointId,
      endpoint.vertexIndex,
    ]),
    triangleMaterialFrames2: [...result.triangleMaterialFrames2],
  });
}

/** Browser-stable FNV-1a-64 over the canonical mesh payload. Not a security hash. */
export function triangulationResultFingerprint(result: TriangulationAuditCandidate): string {
  let hash = 0xcbf29ce484222325n;
  for (const byte of new TextEncoder().encode(canonicalPayload(result))) {
    hash ^= BigInt(byte);
    hash = BigInt.asUintN(64, hash * 0x100000001b3n);
  }
  return 'fnv1a64:' + hash.toString(16).padStart(16, '0');
}
