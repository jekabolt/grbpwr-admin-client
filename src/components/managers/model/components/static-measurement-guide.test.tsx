import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

import { MODEL_MEASUREMENTS } from './sheet-measurement-focus';
import {
  STATIC_MEASUREMENT_GUIDES_V1,
  StaticMeasurementGuide,
  staticMeasurementGuideGenderV1,
} from './static-measurement-guide';

describe('static measurement guide', () => {
  it('defines a visible marker for every model measurement', () => {
    expect(Object.keys(STATIC_MEASUREMENT_GUIDES_V1)).toHaveLength(MODEL_MEASUREMENTS.length);
    expect(
      MODEL_MEASUREMENTS.map(({ name }) => name).filter(
        (name) => !STATIC_MEASUREMENT_GUIDES_V1[name],
      ),
    ).toEqual([]);
  });

  it('uses different gender artwork while keeping an explicit neutral fallback', () => {
    expect(staticMeasurementGuideGenderV1('GENDER_ENUM_FEMALE')).toBe('female');
    expect(staticMeasurementGuideGenderV1('GENDER_ENUM_MALE')).toBe('male');
    expect(staticMeasurementGuideGenderV1('GENDER_ENUM_UNISEX')).toBe('neutral');
    expect(staticMeasurementGuideGenderV1(undefined)).toBe('neutral');

    const female = renderToStaticMarkup(
      <StaticMeasurementGuide
        measurementName='BODY_MEASUREMENT_NAME_CHEST'
        gender='GENDER_ENUM_FEMALE'
        femaleSrc='/female.png'
        maleSrc='/male.png'
      />,
    );
    const male = renderToStaticMarkup(
      <StaticMeasurementGuide
        measurementName='BODY_MEASUREMENT_NAME_CHEST'
        gender='GENDER_ENUM_MALE'
        femaleSrc='/female.png'
        maleSrc='/male.png'
      />,
    );

    expect(female).toContain('src="/female.png"');
    expect(female).toContain('data-guide-gender="female"');
    expect(male).toContain('src="/male.png"');
    expect(male).toContain('data-guide-gender="male"');
  });

  it('renders only the active measurement marker over the static image', () => {
    const html = renderToStaticMarkup(
      <StaticMeasurementGuide
        measurementName='BODY_MEASUREMENT_NAME_INSEAM'
        gender='GENDER_ENUM_FEMALE'
        femaleSrc='/female.png'
        maleSrc='/male.png'
      />,
    );

    expect(html).toContain('data-guide-measurement="BODY_MEASUREMENT_NAME_INSEAM"');
    expect(html).toContain('data-testid="static-measurement-marker"');
    expect(html).toContain('M 120 181 L 120 328');
    expect(html.match(/<svg/g)).toHaveLength(1);
  });
});
