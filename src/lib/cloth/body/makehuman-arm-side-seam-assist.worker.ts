/// <reference lib="webworker" />

import { createMakeHumanArmSideSeamAssistV1 } from './makehuman-arm-side-seam-assist-v1';
import type {
  MakeHumanArmSideSeamAssistWorkerRequestV1,
  MakeHumanArmSideSeamAssistWorkerResponseV1,
} from './makehuman-arm-side-seam-assist-worker-protocol-v1';
import { createMakeHumanDisplayPoseResourceLoaderV1 } from './measurement-open-reference-display-pose-runtime-v1';

const context = self as DedicatedWorkerGlobalScope;
const loadResources = createMakeHumanDisplayPoseResourceLoaderV1();

context.onmessage = async (event: MessageEvent<MakeHumanArmSideSeamAssistWorkerRequestV1>) => {
  const request = event.data;
  const startedAt = performance.now();
  try {
    if (request.type !== 'solve') throw new Error('Unsupported side-seam worker request.');
    const resources = await loadResources();
    const shared = { ...request.options, bundle: resources.rig };
    const value = Object.freeze({
      left: createMakeHumanArmSideSeamAssistV1({ ...shared, side: 'left' }),
      right: createMakeHumanArmSideSeamAssistV1({ ...shared, side: 'right' }),
    });
    const response: MakeHumanArmSideSeamAssistWorkerResponseV1 = {
      id: request.id,
      type: 'result',
      value,
      durationMs: performance.now() - startedAt,
    };
    context.postMessage(response);
  } catch (reason: unknown) {
    const response: MakeHumanArmSideSeamAssistWorkerResponseV1 = {
      id: request.id,
      type: 'error',
      message: reason instanceof Error ? reason.message : String(reason),
      durationMs: performance.now() - startedAt,
    };
    context.postMessage(response);
  }
};

export {};
