import { queryActualBodyNearestBatchV1 } from './actual-body-nearest-batch-v1';
import { type BodyQueryPoint, captureBodyQueryPointsV1 } from './actual-body-query-partition-v1';
import { queryActualBodyRayBatchV1 } from './actual-body-ray-batch-v1';
import { ACTUAL_BODY_SIGN_RAYS_V1, unanimousBodyRayVoteV1 } from './actual-body-sign-vote-v1';
import {
  ACTUAL_BODY_TRIANGLE_NEAREST_INDEX_LIMITS_V1 as bodyLimits,
  captureActualBodyTriangleGeometryV1,
} from './actual-body-triangle-nearest-index-v1';
import { BETA_SKIRT_RENDERED_BODY_COLLISION_DIAGNOSTIC_POLICY_V2 as clearancePolicy } from './beta-skirt-rendered-body-collision-diagnostic-v2';

export const ACTUAL_BODY_SIGNED_VERTEX_QUERY_V1 = 'actual-body-signed-vertex-query/1' as const;

type UnsafeVertex = Readonly<{
  vertexIndex: number;
  classification: 'penetrating' | 'unsafe-outside';
  bodyTriangleIndex: number;
  bodyVertexIndices: BodyQueryPoint;
  bodySurfacePointM: BodyQueryPoint;
  outwardBodyNormal: BodyQueryPoint;
  signedDistanceM: number;
}>;

/** Independent point queries. Body topology and surface intersection must be verified upstream. */
export function queryActualBodySignedVerticesV1(
  input: Readonly<{
    bodyPositionsM: Float32Array;
    bodyTriangles: Uint32Array;
    pointsM: readonly BodyQueryPoint[];
    workBudget: number;
  }>,
) {
  const { workBudget } = input;
  const { positions: bodyPositionsM, triangles: bodyTriangles } =
    captureActualBodyTriangleGeometryV1(input.bodyPositionsM, input.bodyTriangles);
  const pointsM = captureBodyQueryPointsV1(
    input.pointsM,
    clearancePolicy.maxGarmentVertices,
    bodyLimits.maximumAbsoluteCoordinateM,
  );
  let boundMinimum = Infinity,
    boundMaximum = -Infinity;
  for (const coordinate of bodyPositionsM) {
    boundMinimum = Math.min(boundMinimum, coordinate);
    boundMaximum = Math.max(boundMaximum, coordinate);
  }
  const epsilonM = Math.max(
    clearancePolicy.absoluteEpsilonM,
    (boundMaximum - boundMinimum) * clearancePolicy.relativeEpsilon,
  );
  const minimumClearanceM = clearancePolicy.unsafeClearanceMarginM;
  const nearestResult = queryActualBodyNearestBatchV1({
    bodyPositionsM,
    bodyTriangles,
    pointsM,
    workBudget,
    triangleTestBudget: clearancePolicy.maxDistanceTriangleTests,
  });
  const distances = nearestResult.nearest.map(({ distanceSquared }) => Math.sqrt(distanceSquared));
  const rays: (boolean | null)[][] = [];
  const rayOrigins: BodyQueryPoint[] = [];
  const originIndices: number[] = [];
  for (const [i, distance] of distances.entries()) {
    if (distance <= epsilonM) continue;
    rayOrigins.push(pointsM[i]);
    originIndices.push(i);
  }
  const nearestWork =
    nearestResult.trianglePreparations + nearestResult.nodeVisits + nearestResult.triangleTests;
  let rayPreparationCount = 0,
    rayIntervalTests = 0,
    rayTriangleTests = 0;
  for (const direction of ACTUAL_BODY_SIGN_RAYS_V1) {
    if (rayOrigins.length === 0) break;
    const result = queryActualBodyRayBatchV1({
      bodyPositionsM,
      bodyTriangles,
      pointsM: rayOrigins,
      direction,
      epsilonM,
      workBudget:
        workBudget - nearestWork - rayPreparationCount - rayIntervalTests - rayTriangleTests,
      triangleTestBudget: clearancePolicy.maxRayTriangleTests - rayTriangleTests,
    });
    rays.push(result.parity);
    rayPreparationCount += result.trianglePreparations;
    rayIntervalTests += result.intervalTests;
    rayTriangleTests += result.exactTests;
  }

  const signedDistancesM: (number | null)[] = distances.map(() => null);
  const contacts: UnsafeVertex[] = [];
  let minimumSignedClearanceM = Infinity,
    penetratingVertexCount = 0;
  let ambiguousSignVertexCount = distances.length - rayOrigins.length;
  const minimumUnsignedClearanceM = Math.min(...distances);
  const belowUnsignedMarginVertexCount = distances.filter(
    (distance) => distance < minimumClearanceM,
  ).length;
  for (const [rayIndex, vertexIndex] of originIndices.entries()) {
    const inside = unanimousBodyRayVoteV1(rays.map((ray) => ray[rayIndex]));
    if (inside === null) {
      ambiguousSignVertexCount++;
      continue;
    }
    const signedDistanceM = inside ? -distances[vertexIndex] : distances[vertexIndex];
    signedDistancesM[vertexIndex] = signedDistanceM;
    minimumSignedClearanceM = Math.min(minimumSignedClearanceM, signedDistanceM);
    if (signedDistanceM < 0) penetratingVertexCount++;
    if (signedDistanceM >= minimumClearanceM) continue;
    const nearest = nearestResult.nearest[vertexIndex];
    const [px, py, pz] = pointsM[vertexIndex];
    const dx = inside ? nearest.x - px : px - nearest.x;
    const dy = inside ? nearest.y - py : py - nearest.y;
    const dz = inside ? nearest.z - pz : pz - nearest.z;
    const normalLength = Math.hypot(dx, dy, dz);
    if (!Number.isFinite(normalLength) || normalLength <= epsilonM)
      throw new RangeError('Unsafe vertex has no defensible outward normal.');
    const triangleOffset = nearest.triangleIndex * 3;
    contacts.push({
      vertexIndex,
      classification: inside ? 'penetrating' : 'unsafe-outside',
      bodyTriangleIndex: nearest.triangleIndex,
      bodyVertexIndices: [
        bodyTriangles[triangleOffset],
        bodyTriangles[triangleOffset + 1],
        bodyTriangles[triangleOffset + 2],
      ],
      bodySurfacePointM: [nearest.x, nearest.y, nearest.z],
      outwardBodyNormal: [dx / normalLength, dy / normalLength, dz / normalLength],
      signedDistanceM,
    });
  }
  return {
    version: ACTUAL_BODY_SIGNED_VERTEX_QUERY_V1,
    epsilonM,
    signedDistancesM,
    contacts,
    clearance: {
      minimumUnsignedClearanceM,
      minimumSignedClearanceM,
      minimumClearanceM,
      belowUnsignedMarginVertexCount,
      penetratingVertexCount,
      ambiguousSignVertexCount,
      unsafeVertexCount: contacts.length,
    },
    usage: {
      nearestTrianglePreparations: nearestResult.trianglePreparations,
      nearestNodeVisits: nearestResult.nodeVisits,
      nearestTriangleTests: nearestResult.triangleTests,
      rayPreparationCount,
      rayIntervalTests,
      rayTriangleTests,
      pointsTestedForSign: rayOrigins.length,
      totalWork: nearestWork + rayPreparationCount + rayIntervalTests + rayTriangleTests,
    },
  };
}
