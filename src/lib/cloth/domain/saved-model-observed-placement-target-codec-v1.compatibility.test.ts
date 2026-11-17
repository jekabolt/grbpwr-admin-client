import { describe, expect, it } from 'vitest';
import * as targetComponent from 'components/cloth-simulation-spike/saved-model-observed-placement-target-v1';
import * as targetDomain from './saved-model-observed-placement-target-codec-v1';
import * as poseV1Component from 'components/managers/model/components/model-mannequin-pose-document-v1';
import * as poseV1Domain from '../body/model-mannequin-pose-document-v1';
import * as poseV2Component from 'components/managers/model/components/model-mannequin-pose-document-v2';
import * as poseV2Domain from '../body/model-mannequin-pose-document-v2';
import { MODEL_OPEN_REFERENCE_FULL_BODY_POSE_LIMITS_V4 as componentLimits } from 'components/managers/model/components/model-open-reference-full-body-pose-control-v4';
import { MODEL_OPEN_REFERENCE_FULL_BODY_POSE_LIMITS_V4 as domainLimits } from '../body/model-open-reference-full-body-pose-contract-v4';

describe('isolated pure codec extraction compatibility', () => {
  it('retains the original target API and shares the exact codec rather than another validator', () => {
    expect(Object.keys(targetComponent).sort()).toEqual([
      'SAVED_MODEL_OBSERVED_PLACEMENT_TARGET_V1',
      'decodeSavedModelObservedPlacementTargetV1',
      'encodeSavedModelObservedPlacementTargetV1',
      'projectSavedModelObservedPlacementTargetV1',
      'validateSavedModelObservedPlacementTargetV1',
    ]);
    expect(targetComponent.validateSavedModelObservedPlacementTargetV1).toBe(
      targetDomain.validateSavedModelObservedPlacementTargetV1,
    );
    expect(targetComponent.encodeSavedModelObservedPlacementTargetV1).toBe(
      targetDomain.encodeSavedModelObservedPlacementTargetV1,
    );
    expect(targetComponent.decodeSavedModelObservedPlacementTargetV1).toBe(
      targetDomain.decodeSavedModelObservedPlacementTargetV1,
    );
    expect(targetDomain).not.toHaveProperty('projectSavedModelObservedPlacementTargetV1');
    expect(targetComponent).not.toHaveProperty('savedModelObservedPlacementTargetCodecInternalsV1');
  });

  it('legacy pose codec consumers and pure target metadata share identical validators and limits', () => {
    for (const [component, domain] of [
      [poseV1Component, poseV1Domain],
      [poseV2Component, poseV2Domain],
    ]) {
      expect(Object.keys(component).sort()).toEqual(Object.keys(domain).sort());
      for (const [key, value] of Object.entries(component))
        expect(Reflect.get(domain, key)).toBe(value);
    }
    expect(componentLimits).toBe(domainLimits);
  });
});
