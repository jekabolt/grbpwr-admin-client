import { workerLoadFailed } from 'lib/stale-reload';
import { classifyWorkerError, WORKER_READY } from 'lib/worker-load';

import type { ModelGarmentStrainBandReadyV4 } from './beta-skirt-g3b2-preview-mannequin-contract-v1';
import {
  snapshotBetaSkirtRenderedBodyCollisionDiagnosticInputV1,
  type BetaSkirtRenderedBodyCollisionDiagnosticInputV1,
  type BetaSkirtRenderedBodyCollisionDiagnosticReportV1,
} from './beta-skirt-rendered-body-collision-diagnostic-v1';
import {
  BETA_SKIRT_RENDERED_BODY_COLLISION_WORKER_PROTOCOL_V1,
  snapshotBetaSkirtRenderedBodyCollisionWorkerResponseV1,
  type BetaSkirtRenderedBodyCollisionWorkerRequestV1,
} from './beta-skirt-rendered-body-collision-worker-protocol-v1';

export const BETA_SKIRT_RENDERED_BODY_COLLISION_WORKER_TIMEOUT_MS_V1 = 60_000;

export type BetaSkirtRenderedBodyCollisionWorkerClientErrorCodeV1 =
  | 'aborted'
  | 'busy'
  | 'crash'
  | 'load-failed'
  | 'protocol'
  | 'terminated'
  | 'timeout'
  | 'worker-failed';

export class BetaSkirtRenderedBodyCollisionWorkerClientErrorV1 extends Error {
  constructor(
    readonly code: BetaSkirtRenderedBodyCollisionWorkerClientErrorCodeV1,
    message: string,
  ) {
    super(message);
    this.name = 'BetaSkirtRenderedBodyCollisionWorkerClientErrorV1';
  }
}

export interface BetaSkirtRenderedBodyCollisionWorkerEvaluateOptionsV1 {
  readonly timeoutMs?: number;
  readonly signal?: AbortSignal;
}

type WorkerFactory = () => Worker;

interface ActiveEvaluation {
  readonly request: BetaSkirtRenderedBodyCollisionWorkerRequestV1;
  readonly resolve: (report: BetaSkirtRenderedBodyCollisionDiagnosticReportV1) => void;
  readonly reject: (error: Error) => void;
  readonly signal?: AbortSignal;
  timeout: ReturnType<typeof setTimeout> | null;
  abort: (() => void) | null;
}

export function betaSkirtRenderedBodyCollisionInputV1(
  composition: ModelGarmentStrainBandReadyV4,
): BetaSkirtRenderedBodyCollisionDiagnosticInputV1 {
  if (composition.status !== 'ready-a-rest-strain-band')
    throw new TypeError('Collision diagnostic composition binding is invalid.');
  const {
    generation,
    displayBinding,
    bodyMesh,
    selectedGarmentMesh,
    transform,
    candidate,
    claims,
  } = composition;
  const input = snapshotBetaSkirtRenderedBodyCollisionDiagnosticInputV1({
    binding: {
      compositionGeneration: generation,
      snapshotGeneration: displayBinding.generation,
      modelId: displayBinding.modelId,
      modelContentRevision: displayBinding.modelContentRevision,
      inputFingerprint: displayBinding.inputFingerprint,
      canonicalContentFingerprint: displayBinding.canonicalContentFingerprint,
      basisKind: displayBinding.basisKind,
      posePresetId: displayBinding.posePresetId,
      bodySourceRevision: displayBinding.sourceRevision,
      garmentPositionsSha256: candidate.positionsSha256,
    },
    bodyPositionsM: bodyMesh.positions,
    bodyTriangles: bodyMesh.triangles,
    garmentPositionsM: selectedGarmentMesh.positions,
    garmentTriangles: selectedGarmentMesh.triangles,
    garmentUniformScale: transform.uniformScale,
    garmentTranslationM: transform.translationM,
  });
  if (
    input.bodyPositionsM.length !== bodyMesh.vertexCount * 3 ||
    input.bodyTriangles.length !== bodyMesh.triangleCount * 3 ||
    input.garmentPositionsM.length !== selectedGarmentMesh.vertexCount * 3 ||
    input.garmentTriangles.length !== selectedGarmentMesh.triangleCount * 3 ||
    claims.renderedBodyIsClearanceAuthority !== false ||
    claims.initializationAdmitted !== false ||
    claims.fitAuthority !== false ||
    claims.collisionRuntimeAuthority !== false ||
    claims.productionAuthority !== false
  )
    throw new TypeError('Collision diagnostic geometry, transform, or authority boundary drifted.');
  return input;
}

/** One immutable exact-pair snapshot per Worker; every terminal path destroys the Worker. */
export class BetaSkirtRenderedBodyCollisionWorkerClientV1 {
  private worker: Worker | null = null;
  private active: ActiveEvaluation | null = null;
  private nextJobId = 1;

  constructor(
    private readonly workerFactory: WorkerFactory = () =>
      new Worker(new URL('./beta-skirt-rendered-body-collision.worker.ts', import.meta.url), {
        type: 'module',
      }),
  ) {}

  evaluate(
    composition: ModelGarmentStrainBandReadyV4,
    options: BetaSkirtRenderedBodyCollisionWorkerEvaluateOptionsV1 = {},
  ): Promise<BetaSkirtRenderedBodyCollisionDiagnosticReportV1> {
    if (this.active)
      return Promise.reject(
        new BetaSkirtRenderedBodyCollisionWorkerClientErrorV1(
          'busy',
          'Rendered-body collision diagnostic already has an active evaluation.',
        ),
      );
    const timeoutMs = options.timeoutMs ?? BETA_SKIRT_RENDERED_BODY_COLLISION_WORKER_TIMEOUT_MS_V1;
    if (!Number.isFinite(timeoutMs) || timeoutMs <= 0)
      return Promise.reject(
        new BetaSkirtRenderedBodyCollisionWorkerClientErrorV1(
          'protocol',
          'Rendered-body collision diagnostic timeout is invalid.',
        ),
      );
    if (options.signal?.aborted)
      return Promise.reject(
        new BetaSkirtRenderedBodyCollisionWorkerClientErrorV1(
          'aborted',
          'Rendered-body collision diagnostic was aborted.',
        ),
      );
    let input: BetaSkirtRenderedBodyCollisionDiagnosticInputV1;
    try {
      input = betaSkirtRenderedBodyCollisionInputV1(composition);
    } catch (reason) {
      return Promise.reject(
        new BetaSkirtRenderedBodyCollisionWorkerClientErrorV1(
          'protocol',
          reason instanceof Error ? reason.message : 'Collision diagnostic input is invalid.',
        ),
      );
    }
    const request: BetaSkirtRenderedBodyCollisionWorkerRequestV1 = {
      version: BETA_SKIRT_RENDERED_BODY_COLLISION_WORKER_PROTOCOL_V1,
      type: 'evaluate',
      jobId: `beta-skirt-rendered-body-collision-${this.nextJobId++}`,
      input,
    };
    return new Promise((resolve, reject) => {
      const active: ActiveEvaluation = {
        request,
        resolve,
        reject,
        signal: options.signal,
        timeout: null,
        abort: null,
      };
      this.active = active;
      active.abort = () =>
        this.fail(
          active,
          new BetaSkirtRenderedBodyCollisionWorkerClientErrorV1(
            'aborted',
            'Rendered-body collision diagnostic was aborted.',
          ),
        );
      options.signal?.addEventListener('abort', active.abort, { once: true });
      active.timeout = setTimeout(
        () =>
          this.fail(
            active,
            new BetaSkirtRenderedBodyCollisionWorkerClientErrorV1(
              'timeout',
              'Rendered-body collision diagnostic exceeded its bounded worker time.',
            ),
          ),
        timeoutMs,
      );
      this.spawn(active, false);
    });
  }

  terminate(): void {
    if (this.active) {
      this.fail(
        this.active,
        new BetaSkirtRenderedBodyCollisionWorkerClientErrorV1(
          'terminated',
          'Rendered-body collision diagnostic worker was terminated.',
        ),
      );
      return;
    }
    this.destroyWorker();
  }

  private spawn(active: ActiveEvaluation, retried: boolean): void {
    let worker: Worker;
    try {
      worker = this.workerFactory();
    } catch {
      this.fail(
        active,
        new BetaSkirtRenderedBodyCollisionWorkerClientErrorV1(
          'crash',
          'Rendered-body collision diagnostic worker could not be created.',
        ),
      );
      return;
    }
    this.worker = worker;
    let ran = false;
    let ready = false;
    worker.onmessage = (event: MessageEvent<unknown>) => {
      if (this.worker !== worker || this.active !== active) return;
      ran = true;
      if (event.data === WORKER_READY) {
        if (ready) return;
        ready = true;
        try {
          worker.postMessage(active.request);
        } catch {
          this.fail(
            active,
            new BetaSkirtRenderedBodyCollisionWorkerClientErrorV1(
              'protocol',
              'Rendered-body collision diagnostic request could not be cloned.',
            ),
          );
        }
        return;
      }
      if (!ready) {
        this.fail(
          active,
          new BetaSkirtRenderedBodyCollisionWorkerClientErrorV1(
            'protocol',
            'Rendered-body collision diagnostic replied before readiness.',
          ),
        );
        return;
      }
      try {
        const response = snapshotBetaSkirtRenderedBodyCollisionWorkerResponseV1(
          event.data,
          active.request,
        );
        if (response.type === 'failure') {
          this.fail(
            active,
            new BetaSkirtRenderedBodyCollisionWorkerClientErrorV1(
              'worker-failed',
              `${response.code}: ${response.message}`,
            ),
          );
        } else this.succeed(active, response.report);
      } catch {
        this.fail(
          active,
          new BetaSkirtRenderedBodyCollisionWorkerClientErrorV1(
            'protocol',
            'Rendered-body collision diagnostic returned stale or invalid evidence.',
          ),
        );
      }
    };
    worker.onmessageerror = () => {
      if (this.worker === worker && this.active === active)
        this.fail(
          active,
          new BetaSkirtRenderedBodyCollisionWorkerClientErrorV1(
            'protocol',
            'Rendered-body collision diagnostic response could not be cloned.',
          ),
        );
    };
    worker.onerror = (event) => {
      if (this.worker !== worker || this.active !== active) return;
      const classification = classifyWorkerError(event, ran, retried);
      if (classification === 'retry') {
        this.destroyWorker();
        this.spawn(active, true);
        return;
      }
      this.fail(
        active,
        classification === 'load'
          ? workerLoadFailed()
          : new BetaSkirtRenderedBodyCollisionWorkerClientErrorV1(
              'crash',
              'Rendered-body collision diagnostic worker crashed.',
            ),
      );
    };
  }

  private succeed(
    active: ActiveEvaluation,
    report: BetaSkirtRenderedBodyCollisionDiagnosticReportV1,
  ): void {
    if (this.active !== active) return;
    this.retire(active);
    active.resolve(report);
  }

  private fail(active: ActiveEvaluation, error: Error): void {
    if (this.active !== active) return;
    this.retire(active);
    active.reject(error);
  }

  private retire(active: ActiveEvaluation): void {
    if (active.timeout !== null) clearTimeout(active.timeout);
    if (active.abort) active.signal?.removeEventListener('abort', active.abort);
    active.timeout = null;
    active.abort = null;
    this.active = null;
    this.destroyWorker();
  }

  private destroyWorker(): void {
    const worker = this.worker;
    this.worker = null;
    if (!worker) return;
    worker.onmessage = null;
    worker.onmessageerror = null;
    worker.onerror = null;
    worker.terminate();
  }
}
