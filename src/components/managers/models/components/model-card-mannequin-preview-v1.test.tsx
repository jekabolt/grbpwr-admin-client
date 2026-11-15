import type { common_Model } from 'api/proto-http/admin';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { ModelCardMannequinPreviewV1 } from './model-card-mannequin-preview-v1';
import { createModelMannequinPoseDocumentV2 } from '../../model/components/model-mannequin-pose-document-v2';
import { MODEL_OPEN_REFERENCE_DIRECT_NEUTRAL_POSE_V9 } from '../../model/components/model-open-reference-direct-pose-v9';

type ModelMeasurement = NonNullable<NonNullable<common_Model['model']>['measurements']>[number];
type MeasurementFixture = Omit<ModelMeasurement, 'metadata'> & {
  readonly metadata?: ModelMeasurement['metadata'];
};

function model(measurements: MeasurementFixture[]) {
  return {
    id: 9,
    model: {
      name: 'Alex',
      comment: undefined,
      gender: 'GENDER_ENUM_MALE' as const,
      bodyMeasurementSchemaVersion: 1,
      measurements: measurements.map((measurement) => ({
        ...measurement,
        metadata: measurement.metadata,
      })),
      thumbnailId: undefined,
      mediaIds: undefined,
      defaultSizeIds: undefined,
    },
    createdAt: undefined,
    updatedAt: undefined,
    thumbnail: undefined,
    media: undefined,
  } satisfies common_Model;
}

describe('model card mannequin preview v1', () => {
  it('fails closed with a visible compact state when required measurements are incomplete', () => {
    const html = renderToStaticMarkup(
      <ModelCardMannequinPreviewV1
        model={model([{ name: 'BODY_MEASUREMENT_NAME_HEIGHT', valueMm: 1800 }])}
        label='Alex'
      />,
    );

    expect(html).toContain('visual reference only · not proof of garment fit');
    expect(html).toContain('3D preview unavailable · required measurements are incomplete');
    expect(html).toContain('data-preview-variant="card"');
    expect(html).not.toContain('<button');
    expect(html).not.toContain('<canvas');
  });

  it('uses the linked on-demand card contract without embedding interactive controls', () => {
    const html = renderToStaticMarkup(
      <ModelCardMannequinPreviewV1
        model={model([
          { name: 'BODY_MEASUREMENT_NAME_HEIGHT', valueMm: 1800 },
          { name: 'BODY_MEASUREMENT_NAME_ACROSS_SHOULDER', valueMm: 460 },
          { name: 'BODY_MEASUREMENT_NAME_CHEST', valueMm: 990 },
          { name: 'BODY_MEASUREMENT_NAME_WAIST', valueMm: 820 },
          { name: 'BODY_MEASUREMENT_NAME_HIP', valueMm: 980 },
          { name: 'BODY_MEASUREMENT_NAME_SLEEVE_LENGTH', valueMm: 640 },
          { name: 'BODY_MEASUREMENT_NAME_INSEAM', valueMm: 830 },
        ])}
        label='Alex'
      />,
    );

    expect(html).toContain('data-model-id="9"');
    expect(html).toContain('data-pose-controls="linked-v2"');
    expect(html).toContain('data-preview-variant="card"');
    expect(html).toContain('data-render-mode="on-demand"');
    expect(html).toContain('Building the measurement-driven preview.');
    expect(html).not.toContain('<button');
    expect(html).not.toContain('role="slider"');
  });

  it('renders a stored V9 pose read-only when the on-demand resource is found', () => {
    const html = renderToStaticMarkup(
      <ModelCardMannequinPreviewV1
        model={model([
          { name: 'BODY_MEASUREMENT_NAME_HEIGHT', valueMm: 1800 },
          { name: 'BODY_MEASUREMENT_NAME_ACROSS_SHOULDER', valueMm: 460 },
          { name: 'BODY_MEASUREMENT_NAME_CHEST', valueMm: 990 },
          { name: 'BODY_MEASUREMENT_NAME_WAIST', valueMm: 820 },
          { name: 'BODY_MEASUREMENT_NAME_HIP', valueMm: 980 },
          { name: 'BODY_MEASUREMENT_NAME_SLEEVE_LENGTH', valueMm: 640 },
          { name: 'BODY_MEASUREMENT_NAME_INSEAM', valueMm: 830 },
        ])}
        label='Alex'
        poseResource={{
          status: 'found',
          revision: '4',
          binding: {
            document: createModelMannequinPoseDocumentV2({
              ...MODEL_OPEN_REFERENCE_DIRECT_NEUTRAL_POSE_V9,
              headYawDeg: 10,
            }),
            canonicalKey: 'test-pose',
            dirty: false,
            canUndo: false,
            onBeginGesture: () => undefined,
            onUpdateGesture: () => undefined,
            onFinishGesture: () => undefined,
            onDiscreteEdit: () => undefined,
            onUndo: () => MODEL_OPEN_REFERENCE_DIRECT_NEUTRAL_POSE_V9,
            onReset: () => MODEL_OPEN_REFERENCE_DIRECT_NEUTRAL_POSE_V9,
          },
        }}
      />,
    );

    expect(html).toContain('data-pose-resource-status="found"');
    expect(html).toContain('data-pose-display="saved"');
    expect(html).toContain('data-pose-controls="full-body-v9"');
    expect(html).toContain('data-pose-viewport-editing="disabled"');
    expect(html).not.toContain('<button');
    expect(html).not.toContain('role="slider"');
  });
});
