import type {
  PutModelMannequinPoseRequest,
  common_BodyMeasurementName,
  common_Model,
} from 'api/proto-http/admin';
import { useMemo, useState } from 'react';
import { Button, Text } from 'ui';

import { ModelForm, type ModelFormDevDependenciesV1 } from '.';
import { saveCreatedModelMannequinPoseV1 } from './model-create-pose-handoff-v1';
import { createModelMannequinPoseDraftOwnerV1 } from './model-mannequin-pose-draft-owner-v1';
import {
  MODEL_OPEN_REFERENCE_DIRECT_NEUTRAL_POSE_V9,
  type ModelOpenReferenceDirectPoseV9,
} from './model-open-reference-direct-pose-v9';
import type { ModelMannequinPoseAdminServiceV1 } from './model-mannequin-pose-transport-v1';

type Scenario = 'dirty-success' | 'neutral' | 'pose-retry';

const MEASUREMENTS = (
  [
    ['BODY_MEASUREMENT_NAME_HEIGHT', 1720],
    ['BODY_MEASUREMENT_NAME_ACROSS_SHOULDER', 420],
    ['BODY_MEASUREMENT_NAME_CHEST', 920],
    ['BODY_MEASUREMENT_NAME_WAIST', 740],
    ['BODY_MEASUREMENT_NAME_HIP', 980],
    ['BODY_MEASUREMENT_NAME_SLEEVE_LENGTH', 600],
    ['BODY_MEASUREMENT_NAME_INSEAM', 800],
  ] satisfies readonly (readonly [common_BodyMeasurementName, number])[]
).map(([name, valueMm]) => ({ name, valueMm, metadata: undefined }));

const CREATE_MODEL_FIXTURE: common_Model = Object.freeze({
  id: undefined,
  model: Object.freeze({
    name: 'durable create pose fixture',
    comment: 'browser receipt for create pose handoff',
    gender: 'GENDER_ENUM_FEMALE',
    bodyMeasurementSchemaVersion: 1,
    measurements: MEASUREMENTS,
    thumbnailId: 0,
    mediaIds: [],
    defaultSizeIds: [],
  }),
  createdAt: undefined,
  updatedAt: undefined,
  thumbnail: undefined,
  media: [],
});

const DIRTY_POSE: ModelOpenReferenceDirectPoseV9 = Object.freeze({
  ...MODEL_OPEN_REFERENCE_DIRECT_NEUTRAL_POSE_V9,
  headYawDeg: 12,
});

function createSession(scenario: Scenario, revision: number) {
  const owner = createModelMannequinPoseDraftOwnerV1({
    neutralPose: MODEL_OPEN_REFERENCE_DIRECT_NEUTRAL_POSE_V9,
  });
  void owner.loadRemote({ kind: 'absent' });
  if (scenario !== 'neutral') owner.applyEdit(DIRTY_POSE);
  return Object.freeze({ scenario, revision, owner });
}

export function ModelCreatePoseHandoffDevPage() {
  const [session, setSession] = useState(() => createSession('dirty-success', 1));
  const [createCalls, setCreateCalls] = useState(0);
  const [putCalls, setPutCalls] = useState(0);
  const [leaveCalls, setLeaveCalls] = useState(0);

  function selectScenario(scenario: Scenario) {
    setCreateCalls(0);
    setPutCalls(0);
    setLeaveCalls(0);
    setSession((current) => createSession(scenario, current.revision + 1));
  }

  const devDependencies = useMemo<ModelFormDevDependenciesV1>(() => {
    let putAttempt = 0;
    const service: ModelMannequinPoseAdminServiceV1 = {
      GetModelMannequinPose: async () => ({ storedPose: undefined }),
      PutModelMannequinPose: async (request: PutModelMannequinPoseRequest) => {
        putAttempt += 1;
        setPutCalls((count) => count + 1);
        if (session.scenario === 'pose-retry' && putAttempt === 1) {
          throw new Error('mock pose gateway unavailable');
        }
        return {
          storedPose: {
            modelId: request.modelId,
            pose: request.pose,
            revision: '1',
            updatedAt: '2026-11-16T00:00:00Z',
            updatedBy: 'browser-fixture',
          },
        };
      },
    };
    return {
      canWriteModels: true,
      createModel: async () => {
        setCreateCalls((count) => count + 1);
        return { id: 8801 };
      },
      updateModel: async () => undefined,
      durableCreatePoseEnabled: true,
      saveCreatedModelPose: (owner, modelId) =>
        saveCreatedModelMannequinPoseV1({ service, owner, modelId }),
      leaveForm: () => setLeaveCalls((count) => count + 1),
      renderMedia: () => (
        <Text size='micro' variant='label'>
          create fixture media
        </Text>
      ),
      renderDefaultSizes: () => null,
      renderFittings: () => null,
    };
  }, [session]);

  return (
    <main
      className='min-h-screen bg-pageBg px-2.5 py-gutter lg:px-6'
      data-testid='model-create-pose-handoff-dev-page'
    >
      <div className='mb-gutter flex flex-wrap items-center gap-2 border border-borderColor bg-bgColor p-2'>
        <Text component='h1' size='large' variant='uppercase' className='mr-auto'>
          create pose handoff
        </Text>
        <Text size='micro' variant='label'>
          scenario <output data-testid='create-pose-scenario'>{session.scenario}</output> · AddModel{' '}
          <output data-testid='create-pose-add-calls'>{createCalls}</output> · Put{' '}
          <output data-testid='create-pose-put-calls'>{putCalls}</output> · leave{' '}
          <output data-testid='create-pose-leave-calls'>{leaveCalls}</output>
        </Text>
        <Button
          type='button'
          variant='secondary'
          size='sm'
          onClick={() => selectScenario('dirty-success')}
        >
          dirty success
        </Button>
        <Button
          type='button'
          variant='secondary'
          size='sm'
          onClick={() => selectScenario('neutral')}
        >
          neutral pose
        </Button>
        <Button
          type='button'
          variant='secondary'
          size='sm'
          onClick={() => selectScenario('pose-retry')}
        >
          pose retry
        </Button>
      </div>

      <ModelForm
        key={session.revision}
        isEditMode={false}
        model={CREATE_MODEL_FIXTURE}
        poseOwner={session.owner}
        devDependencies={devDependencies}
      />
    </main>
  );
}
