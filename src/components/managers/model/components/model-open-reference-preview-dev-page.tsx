import { loadMakeHumanOpenReferenceBasisV1 } from 'lib/cloth/body/measurement-open-reference-display-v1';
import type { MeasurementOpenReferenceDisplayPosePresetIdV1 } from 'lib/cloth/body/measurement-open-reference-display-pose-v1';
import { loadMeasurementOpenReferenceLimbSubsetRuntimeModuleV1 } from 'lib/cloth/body/measurement-open-reference-limb-subset-runtime-loader-v1';
import { createMakeHumanFullBodyJointOverlayRuntimeV4 } from 'lib/cloth/body/makehuman-full-body-joint-overlay-runtime-v4';
import { useCallback, useMemo, useRef, useState } from 'react';
import { useForm } from 'react-hook-form';
import { Button, Form, Section, SectionStack, Text } from 'ui';

import {
  buildModelOpenReferenceLimbDisplayV1,
  buildModelOpenReferencePoseDisplayV1,
  buildModelOpenReferenceProxyRuntimeV1,
  loadModelOpenReferencePoseRuntimeV1,
  ModelOpenReferencePreview,
  type ModelOpenReferencePreviewBuildDependenciesV1,
} from './model-open-reference-preview';
import { modelDefaultData, type ModelFormData } from './schema';

const DEV_PREVIEW_MEASUREMENTS = Object.freeze({
  BODY_MEASUREMENT_NAME_HEIGHT: 1720,
  BODY_MEASUREMENT_NAME_ACROSS_SHOULDER: 420,
  BODY_MEASUREMENT_NAME_CHEST: 920,
  BODY_MEASUREMENT_NAME_WAIST: 740,
  BODY_MEASUREMENT_NAME_HIP: 980,
  BODY_MEASUREMENT_NAME_SLEEVE_LENGTH: 600,
  BODY_MEASUREMENT_NAME_INSEAM: 800,
});

const DEV_PREVIEW_LIMB_MEASUREMENTS = Object.freeze({
  BODY_MEASUREMENT_NAME_BICEP: 300,
  BODY_MEASUREMENT_NAME_WRIST: 170,
  BODY_MEASUREMENT_NAME_CALF: 370,
  BODY_MEASUREMENT_NAME_ANKLE: 230,
});

export function ModelOpenReferencePreviewDevPage() {
  const parameters = useMemo(() => new URLSearchParams(globalThis.location.search), []);
  const requestedBasis = parameters.get('basis');
  const fixtureGender: ModelFormData['gender'] =
    requestedBasis === 'male'
      ? 'GENDER_ENUM_MALE'
      : requestedBasis === 'neutral'
        ? 'GENDER_ENUM_UNISEX'
        : 'GENDER_ENUM_FEMALE';
  const fixtureBasis =
    requestedBasis === 'male' || requestedBasis === 'neutral' ? requestedBasis : 'female';
  const requestedPose = parameters.get('pose');
  const fixturePose: MeasurementOpenReferenceDisplayPosePresetIdV1 =
    requestedPose === 'near-t' || requestedPose === 'relaxed-symmetric' ? requestedPose : 'a-rest';
  const linkedPoseControls = parameters.get('controls') === 'linked-v2';
  const fullBodyPoseControls = parameters.get('controls') === 'full-body-v3';
  const fullBodyPoseControlsV4 = parameters.get('controls') === 'full-body-v4';
  const fullBodyPoseControlsV5 = parameters.get('controls') === 'full-body-v5';
  const fullBodyPoseControlsV6 = parameters.get('controls') === 'full-body-v6';
  const fullBodyPoseControlsV7 = parameters.get('controls') === 'full-body-v7';
  const fullBodyPoseControlsV8 = parameters.get('controls') === 'full-body-v8';
  const fullBodyPoseControlsV9 = parameters.get('controls') === 'full-body-v9';
  const rejectJointOverlay = parameters.get('jointOverlay') === 'reject';
  const cardPreview = parameters.get('variant') === 'card';
  const staleRig = parameters.get('staleRig');
  const fixtureHasLimbMeasurements =
    parameters.get('limbs') === 'all' || staleRig === 'limb-loader' || staleRig === 'limb-solve';
  const settleMode = parameters.get('settle') === 'reject' ? 'reject' : 'resolve';
  const [previewMounted, setPreviewMounted] = useState(true);
  const [awaitBoundary, setAwaitBoundary] = useState('idle');
  const [sourceStatus, setSourceStatus] = useState('idle');
  const [fakeTimerStatus, setFakeTimerStatus] = useState('idle');
  const releaseRef = useRef<(() => void) | null>(null);
  const fakeTimerRef = useRef<(() => void) | null>(null);
  const form = useForm<ModelFormData>({
    defaultValues: {
      ...modelDefaultData,
      name: `open-reference ${fixtureBasis} preview fixture`,
      gender: fixtureGender,
      measurements: DEV_PREVIEW_MEASUREMENTS,
      ...(fixtureHasLimbMeasurements
        ? { measurements: { ...DEV_PREVIEW_MEASUREMENTS, ...DEV_PREVIEW_LIMB_MEASUREMENTS } }
        : {}),
    },
  });
  const deferAtBoundary = useCallback(
    <Result,>(
      source: Promise<Result>,
      boundary:
        | 'basis'
        | 'joint-overlay'
        | 'limb-loader'
        | 'limb-solve'
        | 'proxy'
        | 'pose-loader'
        | 'pose-solve',
    ): Promise<Result> =>
      new Promise<Result>((resolve, reject) => {
        let releaseRequested = false;
        let releaseResolvedSource: (() => void) | null = null;
        setSourceStatus('pending');
        source.then(
          (value) => {
            setSourceStatus('ready');
            releaseResolvedSource = () => resolve(value);
            if (releaseRequested && settleMode === 'resolve') releaseResolvedSource();
          },
          (reason: unknown) => {
            setSourceStatus('failed');
            releaseResolvedSource = () => reject(reason);
            if (releaseRequested && settleMode === 'resolve') releaseResolvedSource();
          },
        );
        releaseRef.current = () => {
          releaseRequested = true;
          if (settleMode === 'reject') {
            reject(new Error(`deferred ${boundary} test rejection`));
          } else {
            releaseResolvedSource?.();
          }
          setAwaitBoundary('settled');
        };
        setAwaitBoundary(boundary);
      }),
    [settleMode],
  );
  const buildDependencies = useMemo<Partial<ModelOpenReferencePreviewBuildDependenciesV1>>(() => {
    const fakeTimer = {
      scheduleBuild: (callback: () => void) => {
        fakeTimerRef.current = callback;
        setFakeTimerStatus('scheduled');
        return 0 as unknown as ReturnType<typeof setTimeout>;
      },
    };
    if (staleRig === 'basis') {
      return {
        ...fakeTimer,
        loadBasis: (kind) => deferAtBoundary(loadMakeHumanOpenReferenceBasisV1(kind), 'basis'),
      };
    }
    if (staleRig === 'proxy') {
      return {
        ...fakeTimer,
        buildProxyRuntime: (options) =>
          deferAtBoundary(buildModelOpenReferenceProxyRuntimeV1(options), 'proxy'),
      };
    }
    if (staleRig === 'limb-loader') {
      return {
        ...fakeTimer,
        loadLimbRuntime: () =>
          deferAtBoundary(loadMeasurementOpenReferenceLimbSubsetRuntimeModuleV1(), 'limb-loader'),
      };
    }
    if (staleRig === 'limb-solve') {
      return {
        ...fakeTimer,
        buildLimbDisplay: (options) =>
          deferAtBoundary(buildModelOpenReferenceLimbDisplayV1(options), 'limb-solve'),
      };
    }
    if (staleRig === 'pose-loader') {
      return {
        ...fakeTimer,
        loadPoseRuntime: () =>
          deferAtBoundary(loadModelOpenReferencePoseRuntimeV1(), 'pose-loader'),
      };
    }
    if (staleRig === 'pose-solve') {
      return {
        ...fakeTimer,
        buildPoseDisplay: (options) =>
          deferAtBoundary(buildModelOpenReferencePoseDisplayV1(options), 'pose-solve'),
      };
    }
    if (staleRig === 'joint-overlay') {
      return {
        ...fakeTimer,
        buildFullBodyJointOverlay: (options) =>
          deferAtBoundary(createMakeHumanFullBodyJointOverlayRuntimeV4(options), 'joint-overlay'),
      };
    }
    if (rejectJointOverlay) {
      return {
        buildFullBodyJointOverlay: () =>
          Promise.reject(new Error('injected joint overlay rejection')),
      };
    }
    return {};
  }, [deferAtBoundary, rejectJointOverlay, staleRig]);
  const staleTestRigEnabled =
    staleRig === 'basis' ||
    staleRig === 'proxy' ||
    staleRig === 'limb-loader' ||
    staleRig === 'limb-solve' ||
    staleRig === 'pose-loader' ||
    staleRig === 'pose-solve' ||
    staleRig === 'joint-overlay';

  return (
    <Form {...form}>
      <main className='min-h-screen bg-pageBg px-2.5 py-gutter lg:px-6'>
        <div className='mx-auto flex w-full max-w-5xl flex-col gap-gutter'>
          <div>
            <Text component='h1' size='large' variant='uppercase'>
              model body preview
            </Text>
            <Text component='p' size='micro' variant='label' className='mt-1'>
              Production component fixture · requested basis{' '}
              <span data-testid='model-open-reference-fixture-basis'>{fixtureBasis}</span> · use
              OrbitControls wheel zoom for the repaired-region close-up · pose{' '}
              <span data-testid='model-open-reference-fixture-pose'>{fixturePose}</span>. Limb
              inputs{' '}
              <span data-testid='model-open-reference-fixture-limbs'>
                {fixtureHasLimbMeasurements ? 'all' : 'none'}
              </span>
              . Controls{' '}
              <span data-testid='model-open-reference-fixture-controls'>
                {fullBodyPoseControlsV9
                  ? 'full-body-v9'
                  : fullBodyPoseControlsV8
                    ? 'full-body-v8'
                    : fullBodyPoseControlsV7
                      ? 'full-body-v7'
                      : fullBodyPoseControlsV6
                        ? 'full-body-v6'
                        : fullBodyPoseControlsV5
                          ? 'full-body-v5'
                          : fullBodyPoseControlsV4
                            ? 'full-body-v4'
                            : fullBodyPoseControls
                              ? 'full-body-v3'
                              : linkedPoseControls
                                ? 'linked-v2'
                                : 'presets-v1'}
              </span>
              .
            </Text>
          </div>
          <SectionStack>
            <Section title='body preview'>
              {previewMounted && (
                <ModelOpenReferencePreview
                  buildDependencies={buildDependencies}
                  initialPosePreset={fixturePose}
                  poseControls={
                    fullBodyPoseControlsV9
                      ? 'full-body-v9'
                      : fullBodyPoseControlsV8
                        ? 'full-body-v8'
                        : fullBodyPoseControlsV7
                          ? 'full-body-v7'
                          : fullBodyPoseControlsV6
                            ? 'full-body-v6'
                            : fullBodyPoseControlsV5
                              ? 'full-body-v5'
                              : fullBodyPoseControlsV4
                                ? 'full-body-v4'
                                : fullBodyPoseControls
                                  ? 'full-body-v3'
                                  : linkedPoseControls
                                    ? 'linked-v2'
                                    : 'presets-v1'
                  }
                  variant={cardPreview ? 'card' : 'form'}
                />
              )}
              {staleTestRigEnabled && (
                <div className='sr-only' data-testid='model-open-reference-stale-test-controls'>
                  <output data-testid='model-open-reference-await-boundary'>{awaitBoundary}</output>
                  <output data-testid='model-open-reference-source-status'>{sourceStatus}</output>
                  <output data-testid='model-open-reference-fake-timer-status'>
                    {fakeTimerStatus}
                  </output>
                  <Button
                    type='button'
                    onClick={() => {
                      const callback = fakeTimerRef.current;
                      fakeTimerRef.current = null;
                      setFakeTimerStatus('ran');
                      callback?.();
                    }}
                    data-testid='model-open-reference-run-fake-timer'
                  >
                    run fake timer
                  </Button>
                  <Button
                    type='button'
                    onClick={() =>
                      form.setValue('measurements.BODY_MEASUREMENT_NAME_HEIGHT', 1730, {
                        shouldDirty: true,
                      })
                    }
                    data-testid='model-open-reference-invalidate-input'
                  >
                    invalidate input
                  </Button>
                  <Button
                    type='button'
                    onClick={() => setPreviewMounted(false)}
                    data-testid='model-open-reference-unmount'
                  >
                    unmount preview
                  </Button>
                  <Button
                    type='button'
                    onClick={() => releaseRef.current?.()}
                    data-testid='model-open-reference-settle-deferred'
                  >
                    settle deferred
                  </Button>
                </div>
              )}
            </Section>
          </SectionStack>
        </div>
      </main>
    </Form>
  );
}
