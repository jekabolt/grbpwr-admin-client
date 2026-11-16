import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { adminService } from 'api/api';
import { modelKeys } from 'components/managers/models/components/useModelQuery';
import { useCallback, useEffect, useRef, useState } from 'react';

import type { ModelMannequinPoseDraftOwnerV1 } from './model-mannequin-pose-draft-owner-v1';
import {
  getModelMannequinPoseV1,
  putModelMannequinPoseV1,
  type ModelMannequinPoseAdminServiceV1,
} from './model-mannequin-pose-transport-v1';

function statusOf(error: unknown): number | undefined {
  return (error as { status?: number } | null | undefined)?.status;
}

export function modelMannequinPoseReadRetryV1(failureCount: number, error: unknown): boolean {
  const status = statusOf(error);
  const transient = status === undefined || status === 408 || status === 429 || status >= 500;
  return transient && failureCount < 1;
}

function transientWriteFailure(error: unknown): boolean {
  const status = statusOf(error);
  return status === undefined || status === 408 || status === 429 || status >= 500;
}

export interface ModelMannequinPoseTransportControllerV1 {
  readonly enabled: boolean;
  readonly readPending: boolean;
  readonly readError: unknown;
  readonly retryRead: () => void;
  readonly savePending: boolean;
  readonly savePose: () => Promise<void>;
}

export function modelMannequinPoseReadErrorV1(options: {
  readonly hydrationFailure: {
    readonly owner: ModelMannequinPoseDraftOwnerV1;
    readonly error: unknown;
  } | null;
  readonly owner: ModelMannequinPoseDraftOwnerV1 | undefined;
  readonly enabled: boolean;
  readonly queryError: unknown;
}): unknown {
  const { hydrationFailure, owner, enabled, queryError } = options;
  if (hydrationFailure !== null && hydrationFailure.owner === owner) {
    return hydrationFailure.error;
  }
  return enabled ? queryError : null;
}

export function useModelMannequinPoseTransportV1(options: {
  readonly modelId: number | undefined;
  readonly owner: ModelMannequinPoseDraftOwnerV1 | undefined;
  readonly enabled: boolean;
  readonly service?: ModelMannequinPoseAdminServiceV1;
}): ModelMannequinPoseTransportControllerV1 {
  const { modelId, owner, enabled } = options;
  const service = options.service ?? adminService;
  const queryClient = useQueryClient();
  const validModelId =
    modelId !== undefined && Number.isSafeInteger(modelId) && modelId > 0 ? modelId : undefined;
  const query = useQuery({
    queryKey: modelKeys.mannequinPose(validModelId ?? 0),
    enabled: enabled && validModelId !== undefined,
    staleTime: Infinity,
    retry: modelMannequinPoseReadRetryV1,
    queryFn: () => getModelMannequinPoseV1(service, validModelId!),
  });
  const mutation = useMutation({
    mutationFn: (request: Parameters<typeof putModelMannequinPoseV1>[1]) =>
      putModelMannequinPoseV1(service, request),
    onSuccess: (result, request) => {
      queryClient.setQueryData(modelKeys.mannequinPose(request.modelId), {
        kind: 'found' as const,
        stored: result.kind === 'saved' ? result.stored : result.current,
      });
    },
  });
  const hydrationStartedRef = useRef<ModelMannequinPoseDraftOwnerV1 | null>(null);
  const [hydrationAttempt, setHydrationAttempt] = useState(0);
  const [hydrationFailure, setHydrationFailure] = useState<{
    readonly owner: ModelMannequinPoseDraftOwnerV1;
    readonly error: unknown;
  } | null>(null);

  useEffect(() => {
    if (!owner || owner.getSnapshot().phase !== 'unloaded') return;
    const remote = enabled ? query.data : ({ kind: 'absent' } as const);
    if (!remote || hydrationStartedRef.current === owner) return;
    hydrationStartedRef.current = owner;
    void owner.loadRemote(remote).catch((error: unknown) => {
      hydrationStartedRef.current = null;
      setHydrationFailure({ owner, error });
    });
  }, [enabled, hydrationAttempt, owner, query.data]);

  const retryRead = useCallback(() => {
    if (!enabled) return;
    hydrationStartedRef.current = null;
    setHydrationFailure(null);
    setHydrationAttempt((current) => current + 1);
    void query.refetch();
  }, [enabled, query]);

  const savePose = useCallback(async () => {
    if (!enabled || !owner) throw new Error('Durable mannequin pose transport is disabled.');
    const request = await owner.beginSave();
    let result: Awaited<ReturnType<typeof putModelMannequinPoseV1>>;
    try {
      result = await mutation.mutateAsync(request);
    } catch (error) {
      await owner.acceptSaveResult(request, {
        kind: 'rejected',
        failure: transientWriteFailure(error) ? 'transient' : 'permanent',
        message: error instanceof Error ? error.message : 'Mannequin pose save failed.',
      });
      throw error;
    }
    await owner.acceptSaveResult(request, result);
  }, [enabled, mutation, owner]);

  return Object.freeze({
    enabled,
    readPending: enabled && validModelId !== undefined && query.isPending,
    readError: modelMannequinPoseReadErrorV1({
      hydrationFailure,
      owner,
      enabled,
      queryError: query.error,
    }),
    retryRead,
    savePending: mutation.isPending,
    savePose,
  });
}
