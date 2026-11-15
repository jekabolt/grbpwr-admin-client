import { Text } from 'ui';

import {
  ModelOpenReferenceJointPoseControlV5,
  type ModelOpenReferenceJointPoseControlPropsV5,
} from './model-open-reference-joint-pose-control-v5';

export const MODEL_OPEN_REFERENCE_JOINT_POSE_CONTROL_V6 =
  'model-open-reference-joint-pose-control/v6' as const;

export function ModelOpenReferenceJointPoseControlV6(
  props: ModelOpenReferenceJointPoseControlPropsV5,
) {
  return (
    <div data-testid='model-open-reference-joint-pose-control-v6'>
      <Text component='p' size='micro' variant='label' className='mb-2'>
        The selected local rotation ring changes the draft only. Select APPLY POSE to rebuild the
        mannequin. This remains local FK, not IK.
      </Text>
      <ModelOpenReferenceJointPoseControlV5 {...props} rotationRingEnabled />
    </div>
  );
}
