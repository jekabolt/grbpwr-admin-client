import { useQuery } from '@tanstack/react-query';
import { adminService } from 'api/api';
import type { ModelOpenReferenceDirectPoseBindingV9 } from 'components/managers/model/components/model-open-reference-preview';
import type {
  ModelMannequinPoseLoadResultV1,
  StoredModelMannequinPoseV1,
} from 'components/managers/model/components/model-mannequin-pose-draft-owner-v1';
import {
  getModelMannequinPoseV1,
  modelMannequinPoseRpcEnabledV1,
  type ModelMannequinPoseAdminServiceV1,
} from 'components/managers/model/components/model-mannequin-pose-transport-v1';
import { modelMannequinPoseReadRetryV1 } from 'components/managers/model/components/use-model-mannequin-pose-transport-v1';
import { modelKeys } from './useModelQuery';

export type ModelCardMannequinPoseResourceV1 =
  | Readonly<{ status: 'disabled' | 'loading' | 'absent' | 'error'; binding: undefined }>
  | Readonly<{
      status: 'found';
      binding: ModelOpenReferenceDirectPoseBindingV9;
      revision: string;
    }>;

function readOnlyBindingV1(
  stored: StoredModelMannequinPoseV1,
): ModelOpenReferenceDirectPoseBindingV9 {
  const pose = stored.document.pose;
  return Object.freeze({
    document: stored.document,
    canonicalKey: `sha256:${stored.canonicalSha256}`,
    dirty: false,
    canUndo: false,
    onBeginGesture: () => undefined,
    onUpdateGesture: () => undefined,
    onFinishGesture: () => undefined,
    onDiscreteEdit: () => undefined,
    onUndo: () => pose,
    onReset: () => pose,
  });
}

export function resolveModelCardMannequinPoseResourceV1(options: {
  readonly enabled: boolean;
  readonly pending: boolean;
  readonly error: unknown;
  readonly result: ModelMannequinPoseLoadResultV1 | undefined;
}): ModelCardMannequinPoseResourceV1 {
  if (!options.enabled) return Object.freeze({ status: 'disabled', binding: undefined });
  if (options.error != null) return Object.freeze({ status: 'error', binding: undefined });
  if (options.result?.kind === 'found') {
    return Object.freeze({
      status: 'found',
      binding: readOnlyBindingV1(options.result.stored),
      revision: options.result.stored.revision,
    });
  }
  if (options.result?.kind === 'absent') {
    return Object.freeze({ status: 'absent', binding: undefined });
  }
  return Object.freeze({
    status: options.pending ? 'loading' : 'error',
    binding: undefined,
  });
}

export function useModelCardMannequinPoseV1(options: {
  readonly modelId: number;
  readonly service?: ModelMannequinPoseAdminServiceV1;
  readonly rpcEnabled?: boolean;
}): ModelCardMannequinPoseResourceV1 {
  const enabled = options.rpcEnabled ?? modelMannequinPoseRpcEnabledV1();
  const validModelId = Number.isSafeInteger(options.modelId) && options.modelId > 0;
  const service = options.service ?? adminService;
  const query = useQuery({
    queryKey: modelKeys.mannequinPose(options.modelId),
    enabled: enabled && validModelId,
    staleTime: Infinity,
    retry: modelMannequinPoseReadRetryV1,
    queryFn: () => getModelMannequinPoseV1(service, options.modelId),
  });

  return resolveModelCardMannequinPoseResourceV1({
    enabled: enabled && validModelId,
    pending: query.isPending,
    error: query.error,
    result: query.data,
  });
}
