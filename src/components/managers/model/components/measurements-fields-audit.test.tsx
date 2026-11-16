import { renderToStaticMarkup } from 'react-dom/server';
import { useForm } from 'react-hook-form';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { Form } from 'ui';
import {
  buildMeasurementHeaderWarnings,
  MeasurementsFields,
  MeasurementsHeaderActions,
} from './measurements-fields';
import { modelDefaultData, type ModelFormData } from './schema';
import { SheetMeasurementFocusProvider } from './sheet-measurement-focus';
import { MeasurementUnitProvider } from './units';

function Harness({
  measurements,
  showAudit = true,
}: {
  measurements: ModelFormData['measurements'];
  showAudit?: boolean;
}) {
  const form = useForm<ModelFormData>({
    defaultValues: { ...modelDefaultData, name: 'test', measurements },
  });
  return (
    <Form {...form}>
      <MeasurementUnitProvider>
        <SheetMeasurementFocusProvider>
          <MeasurementsHeaderActions showAudit={showAudit} />
          <MeasurementsFields showAudit={showAudit} />
        </SheetMeasurementFocusProvider>
      </MeasurementUnitProvider>
    </Form>
  );
}

describe('measurements field audit guidance', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('marks invalid fields and connects each input to value-free guidance', () => {
    const html = renderToStaticMarkup(
      <Harness
        measurements={{
          BODY_MEASUREMENT_NAME_HEIGHT: 170,
          BODY_MEASUREMENT_NAME_ACROSS_SHOULDER: 970,
          BODY_MEASUREMENT_NAME_CHEST: 920,
          BODY_MEASUREMENT_NAME_WAIST: 740,
          BODY_MEASUREMENT_NAME_HIP: 980,
          BODY_MEASUREMENT_NAME_SLEEVE_LENGTH: 600,
          BODY_MEASUREMENT_NAME_INSEAM: 800,
        }}
      />,
    );

    expect(html).not.toContain('aria-live=');
    expect(html).not.toContain('role="status"');
    expect(html).toContain('aria-invalid="true"');
    expect(html).toContain('role="button"');
    expect(html).toMatch(/aria-label="! [1-9][0-9]* errors?"/);
    expect(html).toContain(
      'aria-describedby="model-measurement-BODY_MEASUREMENT_NAME_HEIGHT-audit"',
    );
    expect(html).toContain('outside supported adult range');
  });

  it('renders the explicit protocol caveat when structural checks pass', () => {
    const html = renderToStaticMarkup(
      <Harness
        measurements={{
          BODY_MEASUREMENT_NAME_HEIGHT: 1720,
          BODY_MEASUREMENT_NAME_ACROSS_SHOULDER: 420,
          BODY_MEASUREMENT_NAME_CHEST: 920,
          BODY_MEASUREMENT_NAME_WAIST: 740,
          BODY_MEASUREMENT_NAME_HIP: 980,
          BODY_MEASUREMENT_NAME_SLEEVE_LENGTH: 600,
          BODY_MEASUREMENT_NAME_INSEAM: 800,
        }}
      />,
    );

    expect(html).toContain('structural checks pass');
    expect(html).toContain('protocol use is not verified');
  });

  it('keeps guidance unit-neutral when the active display unit is inches', () => {
    vi.stubGlobal('window', {
      localStorage: {
        getItem: () => 'in',
        setItem: vi.fn(),
      },
    });
    const html = renderToStaticMarkup(
      <Harness
        measurements={{
          BODY_MEASUREMENT_NAME_HEIGHT: 170,
          BODY_MEASUREMENT_NAME_ACROSS_SHOULDER: 970,
          BODY_MEASUREMENT_NAME_CHEST: 920,
          BODY_MEASUREMENT_NAME_WAIST: 740,
          BODY_MEASUREMENT_NAME_HIP: 980,
          BODY_MEASUREMENT_NAME_SLEEVE_LENGTH: 600,
          BODY_MEASUREMENT_NAME_INSEAM: 800,
        }}
      />,
    );

    expect(html).toContain('data-unit="in"');
    expect(html).toContain('outside supported adult range');
    expect(html).not.toContain('supported range 1300');
  });

  it('suppresses edit-only guidance in the create flow', () => {
    const html = renderToStaticMarkup(<Harness measurements={{}} showAudit={false} />);

    expect(html).not.toContain('measurement issue');
    expect(html).not.toContain('required for mannequin');
    expect(html).not.toContain('protocol use is not verified');
    expect(html).not.toContain('aria-invalid="true"');
  });

  it('gives HeaderWarnings an action that targets the affected measurement', () => {
    const focusMeasurement = vi.fn();
    const [warning] = buildMeasurementHeaderWarnings(
      {
        byMeasurementName: {
          BODY_MEASUREMENT_NAME_HEIGHT: [
            { code: 'invalid-value', message: 'outside supported adult range' },
          ],
        },
        errorCount: 1,
        fieldCount: 1,
        unassignedErrorCount: 0,
      },
      focusMeasurement,
    );

    expect(warning).toMatchObject({
      text: 'height: outside supported adult range',
      error: true,
      action: { label: 'focus height' },
    });
    if (warning && typeof warning !== 'string') warning.action?.onClick?.();
    expect(focusMeasurement).toHaveBeenCalledOnce();
    expect(focusMeasurement).toHaveBeenCalledWith('BODY_MEASUREMENT_NAME_HEIGHT');
  });
});
