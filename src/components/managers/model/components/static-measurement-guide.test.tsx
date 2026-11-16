import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

import { MODEL_MEASUREMENTS } from './sheet-measurement-focus';
import {
  StaticMeasurementGuide,
  staticMeasurementGuideAssetCountV2,
  staticMeasurementGuideAssetV2,
  type StaticMeasurementGuideGenderV2,
  type StaticMeasurementGuideSourcesV2,
  staticMeasurementGuideGenderV2,
} from './static-measurement-guide';

const source = (gender: StaticMeasurementGuideGenderV2, measurementName: string) =>
  `/${gender}/${measurementName}.webp`;
const SOURCES: StaticMeasurementGuideSourcesV2 = Object.fromEntries(
  (['female', 'male', 'neutral'] as const).map((gender) => [
    gender,
    Object.fromEntries(
      MODEL_MEASUREMENTS.map(({ name }) => [name, source(gender, name as string)]),
    ),
  ]),
) as StaticMeasurementGuideSourcesV2;

describe('static measurement guide', () => {
  it('ships one baked image for every gender and model measurement', () => {
    expect(staticMeasurementGuideAssetCountV2()).toBe(MODEL_MEASUREMENTS.length * 3);
    for (const gender of ['female', 'male', 'neutral'] as const) {
      for (const { name } of MODEL_MEASUREMENTS) {
        expect(staticMeasurementGuideAssetV2(gender, name)).toMatch(/\.webp$/u);
      }
    }
  });

  it('uses different gender artwork while keeping an explicit neutral fallback', () => {
    expect(staticMeasurementGuideGenderV2('GENDER_ENUM_FEMALE')).toBe('female');
    expect(staticMeasurementGuideGenderV2('GENDER_ENUM_MALE')).toBe('male');
    expect(staticMeasurementGuideGenderV2('GENDER_ENUM_UNISEX')).toBe('neutral');
    expect(staticMeasurementGuideGenderV2(undefined)).toBe('neutral');

    const female = renderToStaticMarkup(
      <StaticMeasurementGuide
        measurementName='BODY_MEASUREMENT_NAME_CHEST'
        gender='GENDER_ENUM_FEMALE'
        sources={SOURCES}
      />,
    );
    const male = renderToStaticMarkup(
      <StaticMeasurementGuide
        measurementName='BODY_MEASUREMENT_NAME_CHEST'
        gender='GENDER_ENUM_MALE'
        sources={SOURCES}
      />,
    );

    expect(female).toContain('src="/female/BODY_MEASUREMENT_NAME_CHEST.webp"');
    expect(female).toContain('data-guide-gender="female"');
    expect(male).toContain('src="/male/BODY_MEASUREMENT_NAME_CHEST.webp"');
    expect(male).toContain('data-guide-gender="male"');
  });

  it('renders one baked active-measurement image without an SVG overlay', () => {
    const html = renderToStaticMarkup(
      <StaticMeasurementGuide
        measurementName='BODY_MEASUREMENT_NAME_INSEAM'
        gender='GENDER_ENUM_FEMALE'
        sources={SOURCES}
      />,
    );

    expect(html).toContain('data-guide-measurement="BODY_MEASUREMENT_NAME_INSEAM"');
    expect(html).toContain('data-guide-render="baked-image-v2"');
    expect(html).toContain('data-testid="static-measurement-image"');
    expect(html).not.toContain('<svg');
  });

  it('uses back and side artwork for measurements that cannot be explained from the front', () => {
    const back = renderToStaticMarkup(
      <StaticMeasurementGuide
        measurementName='BODY_MEASUREMENT_NAME_ACROSS_BACK'
        gender='GENDER_ENUM_MALE'
        sources={SOURCES}
      />,
    );
    const side = renderToStaticMarkup(
      <StaticMeasurementGuide
        measurementName='BODY_MEASUREMENT_NAME_CHEST_DEPTH'
        gender='GENDER_ENUM_UNISEX'
        sources={SOURCES}
      />,
    );

    expect(back).toContain('src="/male/BODY_MEASUREMENT_NAME_ACROSS_BACK.webp"');
    expect(back).toContain('data-guide-view="back"');
    expect(side).toContain('src="/neutral/BODY_MEASUREMENT_NAME_CHEST_DEPTH.webp"');
    expect(side).toContain('data-guide-gender="neutral"');
    expect(side).toContain('data-guide-view="side"');
  });
});
