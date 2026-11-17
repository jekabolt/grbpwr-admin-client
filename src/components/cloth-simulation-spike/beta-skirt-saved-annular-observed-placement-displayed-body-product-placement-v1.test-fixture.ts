import { buildModelDisplayedTriangleBodyInputV1 } from './model-displayed-triangle-body-input-v1';
import {
  adoptSavedModelDisplayedTriangleBodyV2,
  createSavedModelDisplayedTriangleBodyOwnerV2,
  disposeSavedModelDisplayedTriangleBodyOwnerV2,
} from 'components/managers/models/components/saved-model-displayed-triangle-body-owner-v2';
import { sessionFixture } from 'components/managers/models/components/saved-model-displayed-triangle-body-session-v2.test-fixture';
import { withObservedPlacementGarmentSourceV1 } from 'lib/cloth/domain/pattern-import-dxf-product-saved-annular-observed-placement-garment-v1.test-fixture';
import {
  buildPatternImportDxfProductSavedAnnularObservedPlacementGarmentV1,
  disposePatternImportDxfProductSavedAnnularObservedPlacementGarmentV1,
} from 'lib/cloth/domain/pattern-import-dxf-product-saved-annular-observed-placement-garment-v1';
import { projectSavedModelObservedPlacementTargetV1 } from './saved-model-observed-placement-target-v1';
import {
  BETA_SKIRT_SAVED_ANNULAR_OBSERVED_PLACEMENT_DISPLAYED_BODY_PRODUCT_PLACEMENT_V1,
  type BetaSkirtSavedAnnularObservedPlacementDisplayedBodyProductPlacementRequestV1,
} from './beta-skirt-saved-annular-observed-placement-displayed-body-product-placement-v1';

/** Genuine producer/adopter, explicitly synthetic cube host observation and model reader.
 * This fixture never qualifies a real viewport, actual V9 mesh, persisted transport, or runtime.
 */
export async function createObservedPlacementPairCubeBodyFixtureV1(id = 731) {
  const observed = await sessionFixture(id);
  observed.input.dispose();
  const positions = new Float32Array([
    -0.1, 0, -0.1, 0.1, 0, -0.1, 0.1, 2, -0.1, -0.1, 2, -0.1, -0.1, 0, 0.1, 0.1, 0, 0.1, 0.1, 2,
    0.1, -0.1, 2, 0.1,
  ]);
  const indices = new Uint32Array([
    0, 2, 1, 0, 3, 2, 4, 5, 6, 4, 6, 7, 0, 1, 5, 0, 5, 4, 3, 7, 6, 3, 6, 2, 0, 4, 7, 0, 7, 3, 1, 2,
    6, 1, 6, 5,
  ]);
  observed.state.observation = {
    ...observed.state.observation!,
    displayMesh: {
      positions,
      indices,
      vertexCount: 8,
      triangleCount: 12,
      byteLength: positions.byteLength + indices.byteLength,
    },
  };
  const hooks = {
    beforeReadObservation: undefined as (() => void) | undefined,
    beforeReadModel: undefined as (() => Promise<void>) | undefined,
  };
  const inputResult = await buildModelDisplayedTriangleBodyInputV1({
    readCurrentSnapshot: () => {
      hooks.beforeReadObservation?.();
      return observed.state.observation;
    },
    expected: observed.state.observation,
  });
  if (!inputResult.ok) throw new Error(inputResult.detail);
  const bodyOwner = createSavedModelDisplayedTriangleBodyOwnerV2();
  const readCurrentModel = async () => {
    await hooks.beforeReadModel?.();
    return structuredClone(observed.state.model);
  };
  const adopted = await adoptSavedModelDisplayedTriangleBodyV2(bodyOwner, {
    displayedInput: inputResult.input,
    expectedDisplayedIdentity: inputResult.input.project()!.identity,
    expectedPersistedModel: {
      id: observed.state.model!.id!,
      updatedAt: observed.state.model!.updatedAt!,
    },
    readCurrentModel,
  });
  if (adopted.status !== 'committed') {
    disposeSavedModelDisplayedTriangleBodyOwnerV2(bodyOwner);
    inputResult.input.dispose();
    throw new Error(JSON.stringify(adopted));
  }
  return {
    bodyOwner,
    binding: adopted.snapshot.binding,
    input: inputResult.input,
    state: observed.state,
    readCurrentModel,
    hooks,
    dispose() {
      disposeSavedModelDisplayedTriangleBodyOwnerV2(bodyOwner);
      inputResult.input.dispose();
    },
  };
}

type SourceContext = Parameters<Parameters<typeof withObservedPlacementGarmentSourceV1>[0]>[0];
type BodyFixture = Awaited<ReturnType<typeof createObservedPlacementPairCubeBodyFixtureV1>>;
type TargetResult = Extract<
  Awaited<ReturnType<typeof projectSavedModelObservedPlacementTargetV1>>,
  { ok: true }
>;
type GarmentResult = Extract<
  Awaited<ReturnType<typeof buildPatternImportDxfProductSavedAnnularObservedPlacementGarmentV1>>,
  { ok: true }
>;

/** All DXF/AO/D0/mapping/V5/read registries execute; only transport/body observation are fixtures. */
export async function withObservedPlacementDisplayedBodyPairSourceV1<T>(
  consume: (input: {
    body: BodyFixture;
    target: TargetResult;
    garmentRequest: SourceContext['request'];
    historicalRequest: SourceContext['historicalRequest'];
    state: SourceContext['state'];
    garmentOwner: GarmentResult['owner'];
    pairRequest: BetaSkirtSavedAnnularObservedPlacementDisplayedBodyProductPlacementRequestV1;
  }) => Promise<T>,
): Promise<T> {
  return withObservedPlacementGarmentSourceV1(async (source) => {
    const body = await createObservedPlacementPairCubeBodyFixtureV1();
    try {
      const target = await projectSavedModelObservedPlacementTargetV1(body.bodyOwner, body.binding);
      if (!target.ok) throw new Error(target.detail);
      source.state.current = {
        ...source.state.current,
        placementAuthoring: {
          ...source.state.current.placementAuthoring,
          observedTarget: {
            target: target.target,
            canonicalSha256: target.canonicalSha256,
          },
        },
      };
      const garment = await buildPatternImportDxfProductSavedAnnularObservedPlacementGarmentV1(
        source.request,
      );
      if (!garment.ok) throw new Error(JSON.stringify(garment));
      try {
        return await consume({
          body,
          target,
          garmentRequest: source.request,
          historicalRequest: source.historicalRequest,
          state: source.state,
          garmentOwner: garment.owner,
          pairRequest: {
            schemaVersion:
              BETA_SKIRT_SAVED_ANNULAR_OBSERVED_PLACEMENT_DISPLAYED_BODY_PRODUCT_PLACEMENT_V1,
            savedAnnularObservedPlacementGarmentOwner: garment.owner,
            displayedBodyOwner: body.bodyOwner,
            displayedBodyBinding: body.binding,
            hostCompileGeneration: 17,
          },
        });
      } finally {
        disposePatternImportDxfProductSavedAnnularObservedPlacementGarmentV1(garment.owner);
      }
    } finally {
      body.dispose();
    }
  });
}
