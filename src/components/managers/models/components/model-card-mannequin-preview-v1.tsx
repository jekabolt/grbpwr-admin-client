import type { common_Model } from 'api/proto-http/admin';
import { useMemo } from 'react';
import { ModelOpenReferencePreviewFromInput } from '../../model/components/model-open-reference-preview';
import {
  modelCardMannequinInputV1,
  modelCardMannequinRevisionV1,
} from './model-card-mannequin-input-v1';
import {
  useModelCardMannequinPoseV1,
  type ModelCardMannequinPoseResourceV1,
} from './model-card-mannequin-pose-v1';

export function ModelCardMannequinPreviewWithSavedPoseV1({
  model,
  label,
}: {
  readonly model: common_Model;
  readonly label: string;
}) {
  const poseResource = useModelCardMannequinPoseV1({ modelId: model.id ?? 0 });
  return <ModelCardMannequinPreviewV1 model={model} label={label} poseResource={poseResource} />;
}

export function ModelCardMannequinPreviewV1({
  model,
  label,
  poseResource = Object.freeze({ status: 'disabled', binding: undefined }),
}: {
  readonly model: common_Model;
  readonly label: string;
  readonly poseResource?: ModelCardMannequinPoseResourceV1;
}) {
  const input = useMemo(() => modelCardMannequinInputV1(model), [model]);
  const revision = useMemo(() => modelCardMannequinRevisionV1(model), [model]);
  const id = model.id ?? 0;

  return (
    <div
      aria-label={`3D preview for ${label}`}
      className='aspect-[3/4] min-h-0 w-full overflow-hidden bg-bgColor'
      role='group'
      data-testid='model-card-mannequin-preview'
      data-model-id={id}
      data-pose-resource-status={poseResource.status}
      data-pose-display={poseResource.status === 'found' ? 'saved' : 'a-rest'}
    >
      <ModelOpenReferencePreviewFromInput
        input={input}
        modelId={`models-card:model:${id}`}
        modelContentRevision={`${revision};pose=${
          poseResource.status === 'found' ? poseResource.revision : poseResource.status
        }`}
        poseControls={poseResource.status === 'found' ? 'full-body-v9' : 'linked-v2'}
        directPoseBindingV9={poseResource.binding}
        directPoseViewportEditingEnabledV9={false}
        hideDirectPoseControlV9
        variant='card'
      />
    </div>
  );
}
