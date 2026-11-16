import { renderToStaticMarkup } from 'react-dom/server';
import { useForm } from 'react-hook-form';
import { describe, expect, it } from 'vitest';
import { Form } from 'ui';
import {
  firstMeasurementWithErrorV1,
  measurementGroupCountV1,
  measurementGroupTabTargetV1,
  MeasurementsGroupedTable,
} from './measurements-fields';
import { BODY_MEASUREMENT_GROUPS } from './measurements';
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
          <MeasurementsGroupedTable showAudit={showAudit} />
        </SheetMeasurementFocusProvider>
      </MeasurementUnitProvider>
    </Form>
  );
}

const names = (index: number) =>
  BODY_MEASUREMENT_GROUPS[index]!.measurements.map((measurement) => measurement.name as string);

describe('desktop measurement group switch', () => {
  it('renders one visible group, every group mounted, and a counter per segment', () => {
    const html = renderToStaticMarkup(
      <Harness
        measurements={{ BODY_MEASUREMENT_NAME_CHEST: 920, BODY_MEASUREMENT_NAME_WAIST: 740 }}
        showAudit={false}
      />,
    );
    const groups = html.match(/data-measurement-group="[^"]+"/g) ?? [];
    expect(groups).toHaveLength(BODY_MEASUREMENT_GROUPS.length);
    expect(html.match(/role="group"[^>]*hidden=""/g)).toHaveLength(
      BODY_MEASUREMENT_GROUPS.length - 1,
    );
    expect(html).toContain('data-model-measurement="BODY_MEASUREMENT_NAME_THIGH"');
    expect(html).toContain(`aria-label="torso 2/${names(0).length}"`);
    expect(html).toContain('aria-label="shoulder 0/4"');
    expect(html).toContain('aria-label="bust 0/2"');
    expect(html).toContain('grid-cols-4');
  });

  it('Tab leaves the last field into the next group, Shift+Tab the first into the previous', () => {
    const torso = names(0);
    const arms = names(1);
    expect(measurementGroupTabTargetV1(0, torso[torso.length - 1]!, false)).toEqual({
      groupIndex: 1,
      name: arms[0],
    });
    expect(measurementGroupTabTargetV1(1, arms[0]!, true)).toEqual({
      groupIndex: 0,
      name: torso[torso.length - 1],
    });
    expect(measurementGroupTabTargetV1(0, torso[0]!, false)).toBeNull();
    expect(measurementGroupTabTargetV1(0, torso[0]!, true)).toBeNull();
    const lastIndex = BODY_MEASUREMENT_GROUPS.length - 1;
    const last = names(lastIndex);
    expect(measurementGroupTabTargetV1(lastIndex, last[last.length - 1]!, false)).toBeNull();
  });

  it('an error in a hidden group shows on its counter and a submit opens it', () => {
    const legs = names(2);
    const hasError = (name: string) => name === 'BODY_MEASUREMENT_NAME_THIGH';
    expect(measurementGroupCountV1({ BODY_MEASUREMENT_NAME_THIGH: 5 }, legs, hasError)).toEqual({
      text: `1/${legs.length}`,
      tone: 'error',
    });
    expect(measurementGroupCountV1({}, names(0), () => false).tone).toBe('attention');
    const full = Object.fromEntries(names(5).map((name) => [name, 100]));
    expect(measurementGroupCountV1(full, names(5), () => false)).toEqual({
      text: `${names(5).length}/${names(5).length}`,
      tone: 'mut',
    });
    expect(firstMeasurementWithErrorV1(hasError)).toEqual({
      groupIndex: 2,
      name: 'BODY_MEASUREMENT_NAME_THIGH',
    });
    expect(firstMeasurementWithErrorV1(() => false)).toBeNull();
  });

  it('colours the hidden group counter red when the audit finds an error there', () => {
    const html = renderToStaticMarkup(
      <Harness
        measurements={{
          BODY_MEASUREMENT_NAME_HEIGHT: 170,
          BODY_MEASUREMENT_NAME_CHEST: 920,
        }}
      />,
    );
    const vertical = html.match(/role="radio"[^>]*aria-label="vertical [^"]*"[\s\S]*?role="radio"/);
    expect(vertical?.[0]).toContain('text-error');
    const torso = html.match(/role="radio"[^>]*aria-label="torso [^"]*"[\s\S]*?role="radio"/);
    expect(torso?.[0]).not.toContain('text-error');
    const torsoGroup = html.match(/<div[^>]*data-measurement-group="torso"[^>]*>/)?.[0] ?? '';
    expect(torsoGroup).not.toContain('hidden');
    const verticalGroup =
      html.match(/<div[^>]*data-measurement-group="vertical \/ lengths"[^>]*>/)?.[0] ?? '';
    expect(verticalGroup).toContain('hidden');
  });
});
