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
          <MeasurementsQuiz
            preview={<div data-testid='preview-fixture'>mannequin</div>}
            onComplete={vi.fn()}
          />
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

  it('renders one real RHF measurement field with mannequin, progress and protocol context', () => {
    const html = renderToStaticMarkup(<Harness />);

    expect(html).toContain('data-testid="measurements-guided-entry"');
    expect(html).toContain('data-testid="preview-fixture"');
    expect(html).toContain('aria-label="measurement entry view"');
    expect(html).toContain('aria-checked="true"');
    expect(html).toContain('guided');
    expect(html).toContain('table');
    expect(html).toContain('chest');
    expect(html).toContain('1/34 · 2 filled');
    expect(html).toContain('value · mm');
    expect(html).toContain('two independent readings');
    expect(html.match(/data-model-measurement=/g)).toHaveLength(1);
    expect(html).toContain('data-model-measurement="BODY_MEASUREMENT_NAME_CHEST"');
    expect(html).toContain('value="920"');
    expect(html).toContain('data-testid="measurement-guided-reference-body-status"');
    expect(html).toContain('data-reference-required-missing="5"');
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
