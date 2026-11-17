import { announceWorkerReady } from 'lib/worker-load';

import {
  BetaSkirtRenderedBodyCollisionDiagnosticErrorV1,
  evaluateBetaSkirtRenderedBodyCollisionDiagnosticV1,
} from './beta-skirt-rendered-body-collision-diagnostic-v1';
import {
  BETA_SKIRT_RENDERED_BODY_COLLISION_WORKER_PROTOCOL_V1,
  snapshotBetaSkirtRenderedBodyCollisionWorkerRequestV1,
  type BetaSkirtRenderedBodyCollisionWorkerFailureV1,
  type BetaSkirtRenderedBodyCollisionWorkerRequestV1,
  type BetaSkirtRenderedBodyCollisionWorkerResponseV1,
} from './beta-skirt-rendered-body-collision-worker-protocol-v1';

const scope = globalThis as unknown as {
  onmessage: ((event: MessageEvent<unknown>) => void) | null;
  postMessage: (message: BetaSkirtRenderedBodyCollisionWorkerResponseV1) => void;
};

let busy = false;

function failure(
  jobId: string,
  code: BetaSkirtRenderedBodyCollisionWorkerFailureV1['code'],
  message: string,
): BetaSkirtRenderedBodyCollisionWorkerFailureV1 {
  return {
    version: BETA_SKIRT_RENDERED_BODY_COLLISION_WORKER_PROTOCOL_V1,
    type: 'failure',
    jobId,
    code,
    message: message.slice(0, 1_024) || 'Rendered-body collision diagnostic failed.',
  };
}

async function evaluate(request: BetaSkirtRenderedBodyCollisionWorkerRequestV1): Promise<void> {
  try {
    const report = await evaluateBetaSkirtRenderedBodyCollisionDiagnosticV1(request.input);
    scope.postMessage({
      version: BETA_SKIRT_RENDERED_BODY_COLLISION_WORKER_PROTOCOL_V1,
      type: 'success',
      jobId: request.jobId,
      report,
    });
  } catch (reason) {
    scope.postMessage(
      failure(
        request.jobId,
        reason instanceof BetaSkirtRenderedBodyCollisionDiagnosticErrorV1
          ? reason.code
          : 'unexpected-failure',
        reason instanceof Error ? reason.message : String(reason),
      ),
    );
  }
}

scope.onmessage = (event) => {
  let request: BetaSkirtRenderedBodyCollisionWorkerRequestV1;
  try {
    request = snapshotBetaSkirtRenderedBodyCollisionWorkerRequestV1(event.data);
  } catch {
    scope.postMessage(
      failure('invalid-request', 'invalid-request', 'Collision worker request is invalid.'),
    );
    return;
  }
  if (busy) {
    scope.postMessage(
      failure(request.jobId, 'invalid-request', 'Collision worker accepts one evaluation only.'),
    );
    return;
  }
  busy = true;
  void evaluate(request).catch(() => undefined);
};

announceWorkerReady();
