import type { common_BodyMeasurementName } from 'api/proto-http/admin';

/**
 * Which drawn guide is an approximate picture (`limited`) rather than the line the mesh honours
 * (`visible`), as `buildMeasurementSurfaceActiveMeasurementGuideV1` returns it on the HM08
 * reference bases in the neutral pose. The builder's status depends only on the field there, so
 * the form rows read this table instead of building guides per row. The visibility unit test
 * builds every form field on the female, male and neutral bases and keeps this table equal to the
 * builder's status.
 */
const APPROXIMATE_GUIDE_FIELDS: ReadonlySet<common_BodyMeasurementName> = new Set([
  'BODY_MEASUREMENT_NAME_NECK_BASE',
  'BODY_MEASUREMENT_NAME_SHOULDER_LENGTH',
  'BODY_MEASUREMENT_NAME_SHOULDER_DROP',
  'BODY_MEASUREMENT_NAME_ACROSS_SHOULDER',
  'BODY_MEASUREMENT_NAME_ACROSS_FRONT',
  'BODY_MEASUREMENT_NAME_ACROSS_BACK',
  'BODY_MEASUREMENT_NAME_ARMSCYE_DEPTH',
  'BODY_MEASUREMENT_NAME_ARMSCYE_CIRCUMFERENCE',
  'BODY_MEASUREMENT_NAME_SLEEVE_LENGTH',
  'BODY_MEASUREMENT_NAME_HPS_TO_BUST_APEX',
  'BODY_MEASUREMENT_NAME_BUST_APEX_TO_APEX',
  'BODY_MEASUREMENT_NAME_HPS_TO_WAIST_FRONT',
  'BODY_MEASUREMENT_NAME_CF_NECK_TO_WAIST',
  'BODY_MEASUREMENT_NAME_CB_NECK_TO_WAIST',
  'BODY_MEASUREMENT_NAME_WAIST_TO_HIGH_HIP',
  'BODY_MEASUREMENT_NAME_WAIST_TO_HIP',
  'BODY_MEASUREMENT_NAME_CHEST_DEPTH',
  'BODY_MEASUREMENT_NAME_WAIST_DEPTH',
  'BODY_MEASUREMENT_NAME_HIP_DEPTH',
  'BODY_MEASUREMENT_NAME_INSEAM',
]);

/** True when the field's line on the mannequin is approximate; the row shows `approx.`. */
export function measurementSurfaceGuideIsApproximateV1(measurementName: string): boolean {
  return APPROXIMATE_GUIDE_FIELDS.has(measurementName as common_BodyMeasurementName);
}
