import type { prepareSourceCutContactMeshV1 } from 'lib/cloth/runtime/cpu/source-cut-contact-mesh-v1';

import { queryActualBodySignedVerticesV1 } from './actual-body-signed-vertex-query-v1';
import { captureActualBodyTriangleGeometryV1 } from './actual-body-triangle-nearest-index-v1';
import { auditActualBodyClosedSurfaceForContactV1 } from './beta-skirt-rendered-body-collision-diagnostic-v1';
import { BETA_SKIRT_RENDERED_BODY_COLLISION_DIAGNOSTIC_POLICY_V2 } from './beta-skirt-rendered-body-collision-diagnostic-v2';

/** Owns one closed body snapshot for continuous CPU checks of successive exact-cut frames. */
export function prepareActualBodySourceCutContactV1(
  inputPositionsM: Float32Array,
  inputTriangles: Uint32Array,
  signedPointWorkBudget: number,
) {
  const body = captureActualBodyTriangleGeometryV1(inputPositionsM, inputTriangles);
  const bodyAudit = auditActualBodyClosedSurfaceForContactV1(body.positions, body.triangles);
  if (!bodyAudit.passed)
    throw new RangeError('Signed cut contact requires a closed body without self-intersections.');
  const minimumClearanceM =
    BETA_SKIRT_RENDERED_BODY_COLLISION_DIAGNOSTIC_POLICY_V2.unsafeClearanceMarginM;
  return {
    bodyAudit,
    validateFrame(
      mesh: ReturnType<typeof prepareSourceCutContactMeshV1>,
      currentPositionsMInvMass: Float32Array,
    ) {
      const surface = mesh.validateReferenceClearance(
        currentPositionsMInvMass,
        body.positions,
        body.triangles,
        minimumClearanceM,
      );
      // A connected component cannot change inside/outside without touching the body surface.
      const signed = surface.clearance.passed
        ? queryActualBodySignedVerticesV1({
            bodyPositionsM: body.positions,
            bodyTriangles: body.triangles,
            pointsM: surface.componentSamples.map(({ positionM }) => positionM),
            workBudget: signedPointWorkBudget,
          })
        : null;
      const componentSign =
        signed?.signedDistancesM.map((signedDistanceM, i) => ({
          ...surface.componentSamples[i],
          signedDistanceM,
        })) ?? [];
      return {
        version: 'actual-body-source-cut-contact/1' as const,
        passed:
          signed !== null &&
          componentSign.length > 0 &&
          componentSign.every(
            ({ signedDistanceM }) =>
              signedDistanceM !== null && signedDistanceM >= minimumClearanceM,
          ),
        surface: surface.clearance,
        connectedComponentCount: surface.componentSamples.length,
        componentSign,
        signedPointUsage: signed?.usage ?? null,
      };
    },
  };
}
