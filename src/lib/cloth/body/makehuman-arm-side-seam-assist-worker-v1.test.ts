import { afterEach, describe, expect, it, vi } from 'vitest';

import type { MakeHumanCoreRigBundleV1 } from './makehuman-core-rig-pose-research-v1';
import {
  createMakeHumanArmSideSeamAssistOutcomeV1,
  MAKEHUMAN_ARM_SIDE_SEAM_ASSIST_OUTCOME_V1,
  MakeHumanArmSideSeamGeometryGateErrorV1,
  type MakeHumanArmSideSeamAssistResultV1,
  type MakeHumanArmSideSeamMetricsV1,
} from './makehuman-arm-side-seam-assist-v1';
import type {
  MakeHumanArmSideSeamAssistWorkerRequestV1,
  MakeHumanArmSideSeamAssistWorkerResponseV1,
  MakeHumanArmSideSeamAssistWorkerResultV1,
} from './makehuman-arm-side-seam-assist-worker-protocol-v1';
import {
  availableMakeHumanArmSideSeamAssistsV1,
  createMakeHumanArmSideSeamAssistsInWorkerV1,
} from './makehuman-arm-side-seam-assist-worker-v1';

const GEOMETRY_GATE_METRICS_FIXTURE = Object.freeze({
  verticality: 0.9714,
  straightness: 0.9921,
  wristOuterHipClearanceRatio: 0.3582,
  minimumOuterHipClearanceRatio: 0.1087,
  wristHipDepthErrorRatio: 0.0419,
  wristHipVerticalErrorRatio: 0.2513,
  sideSeamEligible: false,
}) satisfies MakeHumanArmSideSeamMetricsV1;

const GEOMETRY_GATE_LIMITS_FIXTURE = Object.freeze({
  minimumVerticality: 0.94,
  minimumStraightness: 0.9,
  minimumOuterHipClearanceRatio: 0.1,
  maximumDepthErrorRatio: 0.06,
  maximumVerticalErrorRatio: 0.25,
});

const outcomeOptions = Object.freeze({
  bundle: {} as MakeHumanCoreRigBundleV1,
  basisKind: 'female' as const,
  heads: Float32Array.from([0, 1, 2]),
  tails: Float32Array.from([3, 4, 5]),
  rollDirections: Float32Array.from([0, 0, 1]),
  side: 'left' as const,
  minimumOuterHipClearanceRatio: 0.1,
  maximumVerticalErrorRatio: 0.25,
});

class FakeWorker {
  readonly posted: Array<{
    request: MakeHumanArmSideSeamAssistWorkerRequestV1;
    transfer: Transferable[];
  }> = [];
  terminated = false;
  onmessage: ((event: MessageEvent<MakeHumanArmSideSeamAssistWorkerResponseV1>) => void) | null =
    null;
  onerror: ((event: ErrorEvent) => void) | null = null;

  postMessage(request: MakeHumanArmSideSeamAssistWorkerRequestV1, transfer: Transferable[]) {
    this.posted.push({ request, transfer });
  }

  terminate() {
    this.terminated = true;
  }

  say(response: MakeHumanArmSideSeamAssistWorkerResponseV1) {
    this.onmessage?.({ data: response } as MessageEvent);
  }
}

afterEach(() => vi.unstubAllGlobals());

describe('MakeHuman arm side-seam assist worker v1', () => {
  it('keeps exact gate metrics while making only the failed side-seam snap unavailable', () => {
    const geometryGateError = new MakeHumanArmSideSeamGeometryGateErrorV1({
      side: 'left',
      metrics: GEOMETRY_GATE_METRICS_FIXTURE,
      limits: GEOMETRY_GATE_LIMITS_FIXTURE,
    });
    const left = createMakeHumanArmSideSeamAssistOutcomeV1(outcomeOptions, () => {
      throw geometryGateError;
    });
    const rightAssist = {
      side: 'right',
      metrics: Object.freeze({ ...GEOMETRY_GATE_METRICS_FIXTURE, sideSeamEligible: true }),
    } as unknown as MakeHumanArmSideSeamAssistResultV1;
    const right = Object.freeze({
      version: MAKEHUMAN_ARM_SIDE_SEAM_ASSIST_OUTCOME_V1,
      status: 'available' as const,
      side: 'right' as const,
      assist: rightAssist,
      metrics: rightAssist.metrics,
    });

    expect(left).toEqual({
      version: MAKEHUMAN_ARM_SIDE_SEAM_ASSIST_OUTCOME_V1,
      status: 'unavailable',
      side: 'left',
      reason: 'geometry-gate-failed',
      metrics: GEOMETRY_GATE_METRICS_FIXTURE,
      limits: GEOMETRY_GATE_LIMITS_FIXTURE,
      claims: {
        authenticatedRigGeometryEvaluated: true,
        sideSeamSnapAvailable: false,
        productInteractionEnvelopeApplied: true,
        clinicalAnatomicalRangeAuthority: false,
        garmentPairEvaluated: false,
        fitClaimEligible: false,
        productionAuthority: false,
      },
    });
    expect(availableMakeHumanArmSideSeamAssistsV1({ left, right })).toEqual({
      left: null,
      right: rightAssist,
    });
  });

  it('keeps rig, resource, and integrity errors fatal', () => {
    const rigFailure = new Error('Side-seam assist requires authenticated rig bone wrist.L.');

    expect(() =>
      createMakeHumanArmSideSeamAssistOutcomeV1(outcomeOptions, () => {
        throw rigFailure;
      }),
    ).toThrow(rigFailure);

    expect(() =>
      createMakeHumanArmSideSeamAssistOutcomeV1(outcomeOptions, () => {
        throw new MakeHumanArmSideSeamGeometryGateErrorV1({
          side: 'left',
          metrics: { ...GEOMETRY_GATE_METRICS_FIXTURE, sideSeamEligible: true },
          limits: GEOMETRY_GATE_LIMITS_FIXTURE,
        });
      }),
    ).toThrow('Side-seam geometry-gate result failed its integrity envelope.');
  });

  it('keeps live-session anchors attached while transferring private copies', async () => {
    vi.stubGlobal('Worker', class {});
    const worker = new FakeWorker();
    const heads = Float32Array.from([0, 1, 2]);
    const tails = Float32Array.from([3, 4, 5]);
    const rollDirections = Float32Array.from([0, 0, 1]);
    const pending = createMakeHumanArmSideSeamAssistsInWorkerV1(
      {
        bundle: {} as MakeHumanCoreRigBundleV1,
        basisKind: 'female',
        heads,
        tails,
        rollDirections,
      },
      () => worker as unknown as Worker,
    );

    expect(worker.posted).toHaveLength(1);
    expect(worker.posted[0].transfer).toHaveLength(3);
    expect(worker.posted[0].request.options.heads).not.toBe(heads);
    expect(worker.posted[0].request.options.tails).not.toBe(tails);
    expect(worker.posted[0].request.options.rollDirections).not.toBe(rollDirections);
    expect(heads.byteLength).toBeGreaterThan(0);
    expect(tails.byteLength).toBeGreaterThan(0);
    expect(rollDirections.byteLength).toBeGreaterThan(0);

    const result = {
      left: { side: 'left' },
      right: { side: 'right' },
    } as unknown as MakeHumanArmSideSeamAssistWorkerResultV1;
    worker.say({ id: 1, type: 'result', value: result, durationMs: 12 });

    await expect(pending).resolves.toBe(result);
    expect(worker.terminated).toBe(true);
  });

  it('terminates an aborted stale calibration', async () => {
    vi.stubGlobal('Worker', class {});
    const worker = new FakeWorker();
    const controller = new AbortController();
    const pending = createMakeHumanArmSideSeamAssistsInWorkerV1(
      {
        bundle: {} as MakeHumanCoreRigBundleV1,
        basisKind: 'female',
        heads: Float32Array.from([0, 1, 2]),
        tails: Float32Array.from([3, 4, 5]),
        rollDirections: Float32Array.from([0, 0, 1]),
        signal: controller.signal,
      },
      () => worker as unknown as Worker,
    );

    controller.abort();

    await expect(pending).rejects.toMatchObject({ name: 'AbortError' });
    expect(worker.terminated).toBe(true);
  });
});
