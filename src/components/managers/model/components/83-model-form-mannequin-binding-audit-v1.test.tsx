import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import process from 'node:process';

import type {
  common_GenderEnum,
  common_Model,
  common_ModelMeasurement,
} from 'api/proto-http/admin';
import { renderToStaticMarkup } from 'react-dom/server';
import { useForm } from 'react-hook-form';
import { describe, expect, it } from 'vitest';
import { Form } from 'ui';

import { modelKeys } from '../../models/components/useModelQuery';
import { MeasurementsFields } from './measurements-fields';
import { resolveModelOpenReferencePreviewInputV1 } from './model-open-reference-preview-input-v1';
import {
  mapFormToModelInsert,
  mapModelToForm,
  modelDefaultData,
  modelFormRevisionKeyV1,
  type ModelFormData,
} from './schema';
import { SheetMeasurementFocusProvider } from './sheet-measurement-focus';
import { MeasurementUnitProvider } from './units';

const REQUIRED_MEASUREMENTS: common_ModelMeasurement[] = [
  { name: 'BODY_MEASUREMENT_NAME_HEIGHT', valueMm: 1720, metadata: undefined },
  { name: 'BODY_MEASUREMENT_NAME_ACROSS_SHOULDER', valueMm: 420, metadata: undefined },
  { name: 'BODY_MEASUREMENT_NAME_CHEST', valueMm: 920, metadata: undefined },
  { name: 'BODY_MEASUREMENT_NAME_WAIST', valueMm: 740, metadata: undefined },
  { name: 'BODY_MEASUREMENT_NAME_HIP', valueMm: 980, metadata: undefined },
  { name: 'BODY_MEASUREMENT_NAME_SLEEVE_LENGTH', valueMm: 600, metadata: undefined },
  { name: 'BODY_MEASUREMENT_NAME_INSEAM', valueMm: 800, metadata: undefined },
];
const OPTIONAL_LIMB_MEASUREMENTS: common_ModelMeasurement[] = [
  { name: 'BODY_MEASUREMENT_NAME_BICEP', valueMm: 310, metadata: undefined },
  { name: 'BODY_MEASUREMENT_NAME_WRIST', valueMm: 170, metadata: undefined },
  { name: 'BODY_MEASUREMENT_NAME_THIGH', valueMm: 560, metadata: undefined },
  { name: 'BODY_MEASUREMENT_NAME_CALF', valueMm: 370, metadata: undefined },
  { name: 'BODY_MEASUREMENT_NAME_ANKLE', valueMm: 230, metadata: undefined },
];

function storedModel(options: {
  readonly id: number;
  readonly name: string;
  readonly gender?: 'GENDER_ENUM_FEMALE' | 'GENDER_ENUM_MALE';
  readonly measurements?: common_ModelMeasurement[];
}): common_Model {
  return {
    id: options.id,
    model: {
      name: options.name,
      comment: '',
      gender: options.gender ?? 'GENDER_ENUM_FEMALE',
      measurements: options.measurements ?? REQUIRED_MEASUREMENTS,
      thumbnailId: 0,
      mediaIds: [],
      defaultSizeIds: [],
      bodyMeasurementSchemaVersion: 1,
    },
    createdAt: '2026-11-13T00:00:00Z',
    updatedAt: '2026-11-13T00:00:00Z',
    thumbnail: undefined,
    media: [],
  };
}

function MeasurementHarness({ values }: { values: ModelFormData }) {
  const form = useForm<ModelFormData>({ defaultValues: values });
  return (
    <Form {...form}>
      <MeasurementUnitProvider>
        <SheetMeasurementFocusProvider>
          <MeasurementsFields showAudit={false} />
        </SheetMeasurementFocusProvider>
      </MeasurementUnitProvider>
    </Form>
  );
}

function source(path: string): string {
  return readFileSync(resolve(process.cwd(), path), 'utf8');
}

describe('receipt 83 model-form mannequin binding audit v1', () => {
  it('maps a generated GetModel response deterministically into the preview basis and measurements', () => {
    const model = storedModel({
      id: 41,
      name: 'female fit model',
      measurements: [...OPTIONAL_LIMB_MEASUREMENTS, ...REQUIRED_MEASUREMENTS].reverse(),
    });
    const form = mapModelToForm(model);
    const preview = resolveModelOpenReferencePreviewInputV1({
      gender: form.gender as common_GenderEnum | undefined,
      measurements: form.measurements ?? {},
    });

    expect(preview.ok).toBe(true);
    expect(preview.basis.basisKind).toBe('female');
    if (!preview.ok) throw new Error('Expected a complete preview input.');
    expect(preview.measurements).toMatchObject({
      heightMm: 1720,
      shoulderBreadthMm: 420,
      chestCircumferenceMm: 920,
      waistCircumferenceMm: 740,
      hipCircumferenceMm: 980,
      armLengthMm: 600,
      inseamMm: 800,
      bicepCircumferenceMm: 310,
      wristCircumferenceMm: 170,
      thighCircumferenceMm: 560,
      calfCircumferenceMm: 370,
      ankleCircumferenceMm: 230,
    });
  });

  it('gives create and every distinct editable model snapshot a distinct form instance', () => {
    const first = storedModel({ id: 41, name: 'first' });
    const reordered = storedModel({
      id: 41,
      name: 'first',
      measurements: [...REQUIRED_MEASUREMENTS].reverse(),
    });
    const second = storedModel({ id: 42, name: 'second', gender: 'GENDER_ENUM_MALE' });
    const reloaded = storedModel({
      id: 41,
      name: 'first reloaded',
      measurements: REQUIRED_MEASUREMENTS.map((measurement) =>
        measurement.name === 'BODY_MEASUREMENT_NAME_WAIST'
          ? { ...measurement, valueMm: 760 }
          : measurement,
      ),
    });

    expect(modelFormRevisionKeyV1(undefined)).toBe('model-form:new');
    expect(modelFormRevisionKeyV1(reordered)).toBe(modelFormRevisionKeyV1(first));
    expect(modelFormRevisionKeyV1(second)).not.toBe(modelFormRevisionKeyV1(first));
    expect(modelFormRevisionKeyV1(reloaded)).not.toBe(modelFormRevisionKeyV1(first));
    expect(modelKeys.detail(41)).not.toEqual(modelKeys.detail(42));
    expect(modelKeys.mannequinPose(41).slice(0, 2)).not.toEqual(modelKeys.detail(41).slice(0, 2));
  });

  it('renders every optional limb input consumed by the preview adapter', () => {
    const values = mapModelToForm(
      storedModel({
        id: 41,
        name: 'limb fields',
        measurements: [...REQUIRED_MEASUREMENTS, ...OPTIONAL_LIMB_MEASUREMENTS],
      }),
    );
    const html = renderToStaticMarkup(<MeasurementHarness values={values} />);

    for (const label of ['bicep', 'wrist', 'thigh', 'calf', 'ankle']) {
      expect(html).toContain(`aria-label="${label}"`);
    }
  });

  it('renders all P0 fields and preserves optional source/protocol metadata through the form', () => {
    const p0: common_ModelMeasurement = {
      name: 'BODY_MEASUREMENT_NAME_CHEST_DEPTH',
      valueMm: 240,
      metadata: {
        schemaVersion: 1,
        source: 'BODY_MEASUREMENT_SOURCE_MANUAL_TAPE',
        protocolId: 'grbpwr-body-measurement-protocol-v1@1.1.0',
      },
    };
    const form = mapModelToForm(
      storedModel({ id: 41, name: 'P0 fields', measurements: [...REQUIRED_MEASUREMENTS, p0] }),
    );
    const html = renderToStaticMarkup(<MeasurementHarness values={form} />);

    for (const label of [
      'hps height',
      'cf neck to waist',
      'waist height',
      'waist to high hip',
      'waist to hip',
      'chest depth',
      'waist depth',
      'hip depth',
      'shoulder length',
      'shoulder drop',
      'armscye depth',
      'armscye circumference',
      'bust apex to apex',
      'hps to bust apex',
    ]) {
      expect(html).toContain(`aria-label="${label}"`);
    }
    expect(form.measurementMetadata?.BODY_MEASUREMENT_NAME_CHEST_DEPTH).toEqual({
      ...p0.metadata,
      boundValueMm: 240,
    });
    expect(mapFormToModelInsert(form)).toMatchObject({
      bodyMeasurementSchemaVersion: 1,
      measurements: expect.arrayContaining([p0]),
    });
    const edited = mapFormToModelInsert({
      ...form,
      measurements: { ...form.measurements, BODY_MEASUREMENT_NAME_CHEST_DEPTH: 241 },
    });
    expect(
      edited.measurements?.find(({ name }) => name === 'BODY_MEASUREMENT_NAME_CHEST_DEPTH')
        ?.metadata,
    ).toBeUndefined();
  });

  it('keeps body measurements separate from the garment dictionary and present without inference', () => {
    const generated = source('src/api/proto-http/admin/index.ts');
    const measurements = source('src/components/managers/model/components/measurements.ts');

    expect(generated).toContain(
      'It is intentionally separate from the garment MeasurementName dictionary.',
    );
    for (const name of [
      'BODY_MEASUREMENT_NAME_BICEP',
      'BODY_MEASUREMENT_NAME_WRIST',
      'BODY_MEASUREMENT_NAME_THIGH',
      'BODY_MEASUREMENT_NAME_CALF',
      'BODY_MEASUREMENT_NAME_ANKLE',
    ]) {
      expect(measurements).toContain(name);
    }
  });

  it('keeps pose in its dedicated resource and excludes it from AddModel/UpdateModel payloads', () => {
    const form = mapModelToForm(storedModel({ id: 41, name: 'payload' }));
    const payload = mapFormToModelInsert(form);

    expect(payload).toEqual({
      name: 'payload',
      comment: '',
      gender: 'GENDER_ENUM_FEMALE',
      measurements: REQUIRED_MEASUREMENTS,
      thumbnailId: 0,
      mediaIds: [],
      defaultSizeIds: [],
      bodyMeasurementSchemaVersion: 1,
    });
    expect(payload).not.toHaveProperty('posePresetId');
    expect(payload).not.toHaveProperty('mesh');
    expect(payload).not.toHaveProperty('displayMesh');
    expect(source('src/api/proto-http/admin/index.ts')).not.toMatch(
      /export type common_ModelInsert = \{[^}]*\b(?:pose|mesh)\b/s,
    );
  });

  it('places the production preview inside the same React Hook Form without mutation dependencies', () => {
    const formSource = source('src/components/managers/model/components/index.tsx');
    const previewSource = source(
      'src/components/managers/model/components/model-open-reference-preview.tsx',
    );
    const pageSource = source('src/components/managers/model/page.tsx');

    expect(formSource.indexOf('<Form {...form}>')).toBeLessThan(
      formSource.indexOf('<ActiveMeasurementBodyPreview'),
    );
    expect(formSource).toMatch(/modelId=\{[\s\S]*model\?\.id == null \? 'model-form:create'/u);
    expect(formSource).toContain('modelContentRevision={');
    expect(formSource).toContain('modelFormRevisionKeyV1(model)');
    expect(previewSource).not.toContain('adminService');
    expect(previewSource).not.toContain('useCreateModel');
    expect(previewSource).not.toContain('useUpdateModel');
    expect(pageSource).toContain('key={modelFormRevisionKeyV1(data)}');
    expect(pageSource).toContain('createModelMannequinPoseDraftOwnerV1');
    expect(pageSource).toContain('poseOwner={poseOwner}');
    expect(pageSource).toContain('useModelMannequinPoseTransportV1');
    expect(pageSource).toContain('modelMannequinPoseRpcEnabledV1()');
    expect(formSource).toContain('directPoseBindingV9={directPoseBindingV9}');
    expect(formSource).not.toContain('beginSave(');
    expect(formSource).toContain('poseTransport.savePose()');
    expect(previewSource).toContain(
      "buildFullBodyPreview(draftPoseRef.current, 'measurement-change')",
    );
    expect(previewSource).toContain(
      "!(editor.version === 'full-body-v9' && directPoseBindingRef.current)",
    );
    expect(previewSource).toMatch(
      /const handleDraftChange = \(nextPose: Pose\)[\s\S]*binding\.onDiscreteEdit/u,
    );
    const directControlSource = source(
      'src/components/managers/model/components/model-open-reference-direct-pose-control-v9.tsx',
    );
    expect(directControlSource).toMatch(
      /onClick=\{\(\) =>\s*applyImmediately\(modelOpenReferenceDirectToggleSymmetryV9\(draftPose\)\)\}/u,
    );
    expect(directControlSource).toContain('if (props.sessionPose)');
    expect(directControlSource).toContain('previousApplied: lastTemporaryAppliedRef.current');
    expect(directControlSource).toContain('nextApplied: props.appliedPose');
  });

  it('uses the live mannequin as the measurement guide instead of a separate pictogram', () => {
    const formSource = source('src/components/managers/model/components/index.tsx');
    const focusSource = source(
      'src/components/managers/model/components/sheet-measurement-focus.tsx',
    );

    expect(formSource).not.toContain('SheetMeasurementDiagram');
    expect(focusSource).not.toContain('MeasurementPictogram');
    expect(formSource).toContain(
      'activeMeasurementName={(active as common_BodyMeasurementName) || undefined}',
    );
    expect(formSource).toContain('<SheetMeasurementMobileStrip />');
    expect(focusSource).toContain('{measurementLabel(focused)}');
  });

  it('keeps create defaults empty and therefore unable to inherit a prior mannequin', () => {
    expect(modelDefaultData).toEqual({
      name: '',
      comment: '',
      gender: '',
      defaultSizeIds: [],
      measurements: {},
      measurementMetadata: {},
      mediaIds: [],
    });
    expect(
      resolveModelOpenReferencePreviewInputV1({
        gender: modelDefaultData.gender as common_GenderEnum | undefined,
        measurements: modelDefaultData.measurements ?? {},
      }).ok,
    ).toBe(false);
  });
});
