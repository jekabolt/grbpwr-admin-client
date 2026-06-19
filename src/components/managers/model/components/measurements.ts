import { common_BodyMeasurementName } from 'api/proto-http/admin';

// Body-measurement layout mirrors the grouping in common/model.proto. Values are
// captured and stored in millimetres (int). The UNKNOWN sentinel is never shown.
export type BodyMeasurementDef = {
  name: common_BodyMeasurementName;
  label: string;
};

export type BodyMeasurementGroup = {
  title: string;
  measurements: BodyMeasurementDef[];
};

export const BODY_MEASUREMENT_GROUPS: BodyMeasurementGroup[] = [
  {
    title: 'torso',
    measurements: [
      { name: 'BODY_MEASUREMENT_NAME_CHEST', label: 'chest' },
      { name: 'BODY_MEASUREMENT_NAME_UNDER_BUST', label: 'under bust' },
      { name: 'BODY_MEASUREMENT_NAME_WAIST', label: 'waist' },
      { name: 'BODY_MEASUREMENT_NAME_HIGH_HIP', label: 'high hip' },
      { name: 'BODY_MEASUREMENT_NAME_HIP', label: 'hip' },
      { name: 'BODY_MEASUREMENT_NAME_NECK_BASE', label: 'neck base' },
    ],
  },
  {
    title: 'arms',
    measurements: [
      { name: 'BODY_MEASUREMENT_NAME_ACROSS_SHOULDER', label: 'across shoulder' },
      { name: 'BODY_MEASUREMENT_NAME_SLEEVE_LENGTH', label: 'sleeve length' },
      { name: 'BODY_MEASUREMENT_NAME_BICEP', label: 'bicep' },
      { name: 'BODY_MEASUREMENT_NAME_WRIST', label: 'wrist' },
    ],
  },
  {
    title: 'legs',
    measurements: [
      { name: 'BODY_MEASUREMENT_NAME_INSEAM', label: 'inseam' },
      { name: 'BODY_MEASUREMENT_NAME_THIGH', label: 'thigh' },
      { name: 'BODY_MEASUREMENT_NAME_KNEE', label: 'knee' },
      { name: 'BODY_MEASUREMENT_NAME_CALF', label: 'calf' },
      { name: 'BODY_MEASUREMENT_NAME_ANKLE', label: 'ankle' },
    ],
  },
  {
    title: 'vertical / lengths',
    measurements: [
      { name: 'BODY_MEASUREMENT_NAME_HEIGHT', label: 'height' },
      { name: 'BODY_MEASUREMENT_NAME_HPS_TO_WAIST_FRONT', label: 'hps to waist (front)' },
      { name: 'BODY_MEASUREMENT_NAME_CB_NECK_TO_WAIST', label: 'cb neck to waist' },
    ],
  },
  {
    title: 'widths (front / back)',
    measurements: [
      { name: 'BODY_MEASUREMENT_NAME_ACROSS_FRONT', label: 'across front' },
      { name: 'BODY_MEASUREMENT_NAME_ACROSS_BACK', label: 'across back' },
    ],
  },
];
