import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

import { MODEL_MEASUREMENTS } from './sheet-measurement-focus';
import {
  STATIC_MEASUREMENT_GUIDES_V1,
  StaticMeasurementGuide,
  type StaticMeasurementGuideSourcesV1,
  staticMeasurementGuideGenderV1,
} from './static-measurement-guide';

const SOURCES: StaticMeasurementGuideSourcesV1 = {
  female: { front: '/female.png', back: '/female-back.png', side: '/female-side.png' },
  male: { front: '/male.png', back: '/male-back.png', side: '/male-side.png' },
  neutral: { front: '/neutral.png', back: '/neutral-back.png', side: '/neutral-side.png' },
};

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
        sources={SOURCES}
      />,
    );

    expect(html).toContain('data-guide-measurement="BODY_MEASUREMENT_NAME_INSEAM"');
    expect(html).toContain('data-testid="static-measurement-marker"');
    expect(html).toContain('M 120 181 L 120 328');
    expect(html.match(/<svg/g)).toHaveLength(1);
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

    expect(back).toContain('src="/male-back.png"');
    expect(back).toContain('data-guide-view="back"');
    expect(side).toContain('src="/neutral-side.png"');
    expect(side).toContain('data-guide-gender="neutral"');
    expect(side).toContain('data-guide-view="side"');
  });
});
