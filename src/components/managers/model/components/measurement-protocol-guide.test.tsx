import { renderToStaticMarkup } from 'react-dom/server';
import { useForm } from 'react-hook-form';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { Form } from 'ui';
import { MeasurementProtocolGuide, formatProtocolToleranceV1 } from './measurement-protocol-guide';
import { MeasurementsFields, MeasurementsHeaderActions } from './measurements-fields';
import { modelDefaultData, type ModelFormData } from './schema';
import { SheetMeasurementFocusProvider } from './sheet-measurement-focus';
import { MeasurementUnitProvider } from './units';

function GuideHarness() {
  return (
    <MeasurementUnitProvider>
      <SheetMeasurementFocusProvider>
        <MeasurementProtocolGuide />
      </SheetMeasurementFocusProvider>
    </MeasurementUnitProvider>
  );
}

function MeasurementsHarness({ showAudit }: { showAudit: boolean }) {
  const form = useForm<ModelFormData>({
    defaultValues: { ...modelDefaultData, name: 'protocol test', measurements: {} },
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

describe('measurement protocol v1 guide', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('renders an accessible compact disclosure with the active field instructions', () => {
    const html = renderToStaticMarkup(<GuideHarness />);

    expect(html).toContain('<details');
    expect(html).toContain('<summary');
    expect(html).toContain('data-fold-caret="details"');
    expect(html).toContain('data-measurement-protocol-guide="grbpwr-body-measurement-protocol-v1"');
    expect(html).toContain('measurement protocol v1 · 2 readings');
    expect(html).toContain('data-measurement-protocol-active-field="BODY_MEASUREMENT_NAME_CHEST"');
    expect(html).toContain('Horizontal torso circumference');
    expect(html).toContain('repeat tolerance 10 mm');
    expect(html).toContain('<b class="text-textColor">path</b>');
    expect(html).toContain('<b class="text-textColor">posture</b>');
    expect(html).toContain('readings unrecorded');
    expect(html).toContain('source and protocol metadata stays');
    expect(html).toContain('editing the number clears it');
    expect(html).toContain('does not infer protocol use');
    expect(html).not.toContain('aria-live=');
    expect(html).not.toContain('<input');
    expect(html).not.toContain('<textarea');
    expect(html).not.toMatch(/grade|verified|compliant/i);
  });

  it('converts only the displayed tolerance when the UI uses inches', () => {
    vi.stubGlobal('window', {
      localStorage: {
        getItem: () => 'in',
        setItem: vi.fn(),
      },
    });
    const html = renderToStaticMarkup(<GuideHarness />);

    expect(formatProtocolToleranceV1(10, 'mm')).toBe('10 mm');
    expect(formatProtocolToleranceV1(10, 'in')).toBe('0.4 in');
    expect(html).toContain('repeat tolerance 0.4 in');
    expect(html).not.toContain('repeat tolerance 10 mm');
  });

  it.each([
    ['create', false],
    ['edit', true],
  ])('shows the protocol disclosure and evidence caveat in %s mode', (_mode, showAudit) => {
    const html = renderToStaticMarkup(<MeasurementsHarness showAudit={showAudit} />);

    expect(html).toContain('protocol v1.1 · readings unrecorded');
    expect(html).toContain('data-measurement-protocol-guide');
    expect(html).toContain('raw readings or operator identity are not stored');
  });
});
