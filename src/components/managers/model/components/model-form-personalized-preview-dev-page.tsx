import type {
  common_BodyMeasurementName,
  common_Model,
  common_ModelMeasurement,
} from 'api/proto-http/admin';
import { useMemo, useState } from 'react';
import { Button, Text } from 'ui';

import { ModelForm, type ModelFormDevDependenciesV1 } from '.';
import { modelFormRevisionKeyV1 } from './schema';

const REQUIRED_MEASUREMENTS: readonly common_ModelMeasurement[] = Object.freeze(
  (
    [
      { name: 'BODY_MEASUREMENT_NAME_HEIGHT', valueMm: 1720 },
      { name: 'BODY_MEASUREMENT_NAME_ACROSS_SHOULDER', valueMm: 420 },
      { name: 'BODY_MEASUREMENT_NAME_CHEST', valueMm: 920 },
      { name: 'BODY_MEASUREMENT_NAME_WAIST', valueMm: 740 },
      { name: 'BODY_MEASUREMENT_NAME_HIP', valueMm: 980 },
      { name: 'BODY_MEASUREMENT_NAME_SLEEVE_LENGTH', valueMm: 600 },
      { name: 'BODY_MEASUREMENT_NAME_INSEAM', valueMm: 800 },
    ] satisfies readonly { name: common_BodyMeasurementName; valueMm: number }[]
  ).map((measurement) => ({ ...measurement, metadata: undefined })),
);

const OPTIONAL_LIMB_MEASUREMENTS: readonly common_ModelMeasurement[] = Object.freeze(
  (
    [
      { name: 'BODY_MEASUREMENT_NAME_BICEP', valueMm: 300 },
      { name: 'BODY_MEASUREMENT_NAME_WRIST', valueMm: 170 },
      { name: 'BODY_MEASUREMENT_NAME_CALF', valueMm: 370 },
      { name: 'BODY_MEASUREMENT_NAME_ANKLE', valueMm: 230 },
    ] satisfies readonly { name: common_BodyMeasurementName; valueMm: number }[]
  ).map((measurement) => ({ ...measurement, metadata: undefined })),
);

function syntheticModel(
  id: number,
  name: string,
  gender: 'GENDER_ENUM_FEMALE' | 'GENDER_ENUM_MALE',
  measurementOffsetMm: number,
): common_Model {
  return {
    id,
    model: {
      name,
      comment: `deterministic receipt 84 fixture ${id}`,
      gender,
      bodyMeasurementSchemaVersion: 1,
      measurements: [...REQUIRED_MEASUREMENTS, ...OPTIONAL_LIMB_MEASUREMENTS].map(
        (measurement) => ({
          ...measurement,
          valueMm: (measurement.valueMm ?? 0) + measurementOffsetMm,
        }),
      ),
      thumbnailId: 0,
      mediaIds: [],
      defaultSizeIds: [],
    },
    createdAt: '2026-11-13T00:00:00Z',
    updatedAt: '2026-11-13T00:00:00Z',
    thumbnail: undefined,
    media: [],
  };
}

export const MODEL_FORM_PERSONALIZED_PREVIEW_FIXTURES_V1 = Object.freeze({
  alpha: syntheticModel(8401, 'receipt 84 alpha', 'GENDER_ENUM_FEMALE', 0),
  beta: syntheticModel(8402, 'receipt 84 beta', 'GENDER_ENUM_MALE', 10),
});

type FixtureId = 'alpha' | 'beta' | 'create';

export function ModelFormPersonalizedPreviewDevPage() {
  const [fixtureId, setFixtureId] = useState<FixtureId>('alpha');
  const [mutationCalls, setMutationCalls] = useState(0);
  const model =
    fixtureId === 'alpha'
      ? MODEL_FORM_PERSONALIZED_PREVIEW_FIXTURES_V1.alpha
      : fixtureId === 'beta'
        ? MODEL_FORM_PERSONALIZED_PREVIEW_FIXTURES_V1.beta
        : undefined;

  const devDependencies = useMemo<ModelFormDevDependenciesV1>(
    () => ({
      canWriteModels: true,
      createModel: async () => {
        setMutationCalls((count) => count + 1);
        return { id: 8403 };
      },
      updateModel: async () => {
        setMutationCalls((count) => count + 1);
      },
      durableCreatePoseEnabled: false,
      saveCreatedModelPose: async () => undefined,
      leaveForm: () => undefined,
      renderMedia: () => (
        <div data-testid='model-form-smoke-media-slot' className='border border-dashed p-3'>
          <Text size='micro' variant='label'>
            DEV audit media boundary
          </Text>
        </div>
      ),
      renderDefaultSizes: () => (
        <div data-testid='model-form-smoke-sizes-slot'>
          <Text size='micro' variant='label'>
            DEV audit size boundary
          </Text>
        </div>
      ),
      renderFittings: (modelId) => (
        <Text data-testid='model-form-smoke-fittings-slot' size='micro' variant='label'>
          DEV audit fittings boundary · model {modelId}
        </Text>
      ),
    }),
    [],
  );

  return (
    <main
      className='min-h-screen bg-pageBg px-2.5 py-gutter lg:px-6'
      data-testid='model-form-personalized-preview-dev-page'
    >
      <div className='mb-gutter flex flex-wrap items-center gap-2 border border-hairline bg-bgColor p-2'>
        <Text component='h1' size='large' variant='uppercase' className='mr-auto'>
          real model form preview smoke
        </Text>
        <Text size='micro' variant='label'>
          fixture <output data-testid='model-form-smoke-fixture'>{fixtureId}</output> · model{' '}
          <output data-testid='model-form-smoke-model-id'>{model?.id ?? 'create'}</output> · local
          mutation calls{' '}
          <output data-testid='model-form-smoke-mutation-calls'>{mutationCalls}</output>
        </Text>
        <Button type='button' variant='secondary' size='sm' onClick={() => setFixtureId('alpha')}>
          switch to model alpha
        </Button>
        <Button type='button' variant='secondary' size='sm' onClick={() => setFixtureId('beta')}>
          switch to model beta
        </Button>
        <Button type='button' variant='secondary' size='sm' onClick={() => setFixtureId('create')}>
          show create form
        </Button>
      </div>

      <ModelForm
        key={modelFormRevisionKeyV1(model)}
        isEditMode={model != null}
        id={model?.id == null ? undefined : String(model.id)}
        model={model}
        devDependencies={devDependencies}
      />
    </main>
  );
}
