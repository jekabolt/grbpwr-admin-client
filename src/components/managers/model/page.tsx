import { useModel } from 'components/managers/models/components/useModelQuery';
import { ROUTES } from 'constants/routes';
import { useMemo } from 'react';
import { useParams } from 'react-router-dom';
import { BackLink, Text } from 'ui';
import { ModelForm } from './components';
import { createModelMannequinPoseDraftOwnerV1 } from './components/model-mannequin-pose-draft-owner-v1';
import { MODEL_OPEN_REFERENCE_DIRECT_NEUTRAL_POSE_V9 } from './components/model-open-reference-direct-pose-v9';
import { modelMannequinPoseRpcEnabledV1 } from './components/model-mannequin-pose-transport-v1';
import { modelFormRevisionKeyV1 } from './components/schema';
import { useModelMannequinPoseTransportV1 } from './components/use-model-mannequin-pose-transport-v1';

export function Model() {
  const { id } = useParams<{ id: string }>();
  const isEditMode = !!id;
  const numId = id ? parseInt(id, 10) : undefined;
  const { data, isLoading, isError } = useModel(numId);
  const poseOwner = useMemo(
    () =>
      numId !== undefined && Number.isSafeInteger(numId) && numId > 0
        ? createModelMannequinPoseDraftOwnerV1({
            modelId: numId,
            neutralPose: MODEL_OPEN_REFERENCE_DIRECT_NEUTRAL_POSE_V9,
          })
        : undefined,
    [numId],
  );

  const poseTransport = useModelMannequinPoseTransportV1({
    modelId: numId,
    owner: poseOwner,
    enabled: isEditMode && modelMannequinPoseRpcEnabledV1(),
  });

  if (isEditMode && isLoading) {
    return (
      <div className='flex justify-center py-20'>
        <Text variant='inactive' className='animate-pulse'>
          loading model…
        </Text>
      </div>
    );
  }

  if (isEditMode && (isError || !data)) {
    return (
      <div className='flex flex-col items-center gap-4 py-20'>
        <Text variant='inactive' className='uppercase'>
          model not found
        </Text>
        <BackLink to={ROUTES.models}>models</BackLink>
      </div>
    );
  }

  return (
    <ModelForm
      key={modelFormRevisionKeyV1(data)}
      isEditMode={isEditMode}
      id={id}
      model={data}
      poseOwner={poseOwner}
      poseTransport={poseTransport}
    />
  );
}
