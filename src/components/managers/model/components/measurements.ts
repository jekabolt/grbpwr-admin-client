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
      { name: 'BODY_MEASUREMENT_NAME_NECK', label: 'neck' },
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
      { name: 'BODY_MEASUREMENT_NAME_HPS_HEIGHT', label: 'hps height' },
      { name: 'BODY_MEASUREMENT_NAME_HPS_TO_WAIST_FRONT', label: 'hps to waist (front)' },
      { name: 'BODY_MEASUREMENT_NAME_CF_NECK_TO_WAIST', label: 'cf neck to waist' },
      { name: 'BODY_MEASUREMENT_NAME_CB_NECK_TO_WAIST', label: 'cb neck to waist' },
      { name: 'BODY_MEASUREMENT_NAME_WAIST_HEIGHT', label: 'waist height' },
      { name: 'BODY_MEASUREMENT_NAME_WAIST_TO_HIGH_HIP', label: 'waist to high hip' },
      { name: 'BODY_MEASUREMENT_NAME_WAIST_TO_HIP', label: 'waist to hip' },
    ],
  },
  {
    title: 'widths (front / back)',
    measurements: [
      { name: 'BODY_MEASUREMENT_NAME_ACROSS_FRONT', label: 'across front' },
      { name: 'BODY_MEASUREMENT_NAME_ACROSS_BACK', label: 'across back' },
    ],
  },
  {
    title: 'depths',
    measurements: [
      { name: 'BODY_MEASUREMENT_NAME_CHEST_DEPTH', label: 'chest depth' },
      { name: 'BODY_MEASUREMENT_NAME_WAIST_DEPTH', label: 'waist depth' },
      { name: 'BODY_MEASUREMENT_NAME_HIP_DEPTH', label: 'hip depth' },
    ],
  },
  {
    title: 'shoulder / armscye',
    measurements: [
      { name: 'BODY_MEASUREMENT_NAME_SHOULDER_LENGTH', label: 'shoulder length' },
      { name: 'BODY_MEASUREMENT_NAME_SHOULDER_DROP', label: 'shoulder drop' },
      { name: 'BODY_MEASUREMENT_NAME_ARMSCYE_DEPTH', label: 'armscye depth' },
      { name: 'BODY_MEASUREMENT_NAME_ARMSCYE_CIRCUMFERENCE', label: 'armscye circumference' },
    ],
  },
  {
    title: 'bust landmarks',
    measurements: [
      { name: 'BODY_MEASUREMENT_NAME_BUST_APEX_TO_APEX', label: 'bust apex to apex' },
      { name: 'BODY_MEASUREMENT_NAME_HPS_TO_BUST_APEX', label: 'hps to bust apex' },
    ],
  },
];
