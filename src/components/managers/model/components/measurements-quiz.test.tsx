import { renderToStaticMarkup } from 'react-dom/server';
import { useForm } from 'react-hook-form';
import { describe, expect, it, vi } from 'vitest';

import { Form } from 'ui';
import {
  MODEL_GUIDED_MEASUREMENT_PREVIEW_REFERENCE_V1,
  resolveModelGuidedMeasurementPreviewInputV1,
} from './model-guided-measurement-preview-input-v1';
import {
  MeasurementsHeaderActions,
  MeasurementsQuiz,
  preferredMeasurementEntryModeV1,
} from './measurements-fields';
import { modelDefaultData, type ModelFormData } from './schema';
import { SheetMeasurementFocusProvider } from './sheet-measurement-focus';
import { MeasurementUnitProvider } from './units';

function Harness() {
  const form = useForm<ModelFormData>({
    defaultValues: {
      ...modelDefaultData,
      name: 'guided measurement fixture',
      measurements: {
        BODY_MEASUREMENT_NAME_CHEST: 920,
        BODY_MEASUREMENT_NAME_WAIST: 740,
      },
    },
  });
  return (
    <Form {...form}>
      <MeasurementUnitProvider>
        <SheetMeasurementFocusProvider>
          <MeasurementsHeaderActions mode='guided' onModeChange={vi.fn()} />
          <MeasurementsQuiz onComplete={vi.fn()} />
        </SheetMeasurementFocusProvider>
      </MeasurementUnitProvider>
    </Form>
  );
}

describe('guided model measurements', () => {
  it('defaults narrow screens to guided entry and keeps desktop on the dense table', () => {
    expect(preferredMeasurementEntryModeV1(390)).toBe('guided');
    expect(preferredMeasurementEntryModeV1(767)).toBe('guided');
    expect(preferredMeasurementEntryModeV1(768)).toBe('table');
    expect(preferredMeasurementEntryModeV1(undefined)).toBe('table');
  });

  it('renders one real RHF measurement field with a baked guide image and progress', () => {
    const html = renderToStaticMarkup(<Harness />);

    expect(html).toContain('data-testid="measurements-guided-entry"');
    expect(html).toContain('data-testid="static-measurement-guide"');
    expect(html).toContain('data-testid="static-measurement-image"');
    expect(html).toContain('data-guide-render="baked-image-v2"');
    expect(html).not.toContain('<svg');
    expect(html).toContain('data-guide-gender="neutral"');
    expect(html).toContain('aria-label="measurement entry view"');
    expect(html).toContain('aria-checked="true"');
    expect(html).toContain('guided');
    expect(html).toContain('table');
    expect(html).toContain('chest');
    expect(html).toContain('1/35 · 2 filled');
    expect(html).toContain('value · mm');
    expect(html).not.toContain('Horizontal torso circumference');
    expect(html).not.toContain('two independent readings');
    expect(html).not.toContain('follow the written measurement protocol');
    expect(html.match(/data-model-measurement=/g)).toHaveLength(1);
    expect(html).toContain('data-model-measurement="BODY_MEASUREMENT_NAME_CHEST"');
    expect(html).toContain('value="920"');
    expect(html).not.toContain('data-testid="measurement-guided-reference-body-status"');
  });

  it('uses an explicit display-only reference until captured required values replace it', () => {
    const empty = resolveModelGuidedMeasurementPreviewInputV1({
      gender: undefined,
      measurements: {},
    });
    expect(empty.usesReferenceBody).toBe(true);
    expect(empty.missingRequiredNames).toHaveLength(7);
    expect(empty.input.measurements).toEqual(MODEL_GUIDED_MEASUREMENT_PREVIEW_REFERENCE_V1);

    const chest = resolveModelGuidedMeasurementPreviewInputV1({
      gender: 'GENDER_ENUM_FEMALE',
      measurements: { BODY_MEASUREMENT_NAME_CHEST: 955 },
    });
    expect(chest.input.gender).toBe('GENDER_ENUM_FEMALE');
    expect(chest.input.measurements.BODY_MEASUREMENT_NAME_CHEST).toBe(955);
    expect(chest.missingRequiredNames).not.toContain('BODY_MEASUREMENT_NAME_CHEST');
  });
});
