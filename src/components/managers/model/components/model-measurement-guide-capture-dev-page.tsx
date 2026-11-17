import type { common_BodyMeasurementName, common_GenderEnum } from 'api/proto-http/admin';

import { ModelOpenReferencePreviewFromInput } from './model-open-reference-preview';

const CAPTURE_MEASUREMENTS = Object.freeze({
  BODY_MEASUREMENT_NAME_HEIGHT: 1720,
  BODY_MEASUREMENT_NAME_ACROSS_SHOULDER: 420,
  BODY_MEASUREMENT_NAME_CHEST: 920,
  BODY_MEASUREMENT_NAME_UNDER_BUST: 820,
  BODY_MEASUREMENT_NAME_WAIST: 740,
  BODY_MEASUREMENT_NAME_HIGH_HIP: 870,
  BODY_MEASUREMENT_NAME_HIP: 980,
  BODY_MEASUREMENT_NAME_SLEEVE_LENGTH: 600,
  BODY_MEASUREMENT_NAME_INSEAM: 800,
  BODY_MEASUREMENT_NAME_BICEP: 300,
  BODY_MEASUREMENT_NAME_WRIST: 170,
  BODY_MEASUREMENT_NAME_THIGH: 560,
  BODY_MEASUREMENT_NAME_KNEE: 390,
  BODY_MEASUREMENT_NAME_CALF: 370,
  BODY_MEASUREMENT_NAME_ANKLE: 230,
});

function captureGender(value: string | null): common_GenderEnum {
  if (value === 'male') return 'GENDER_ENUM_MALE';
  if (value === 'neutral') return 'GENDER_ENUM_UNISEX';
  return 'GENDER_ENUM_FEMALE';
}

function captureView(value: string | null): 'front' | 'side' | 'back' {
  if (value === 'side' || value === 'back') return value;
  return 'front';
}

export function ModelMeasurementGuideCaptureDevPage() {
  const query = new URLSearchParams(window.location.search);
  const measurementName =
    (query.get('measurement') as common_BodyMeasurementName | null) ??
    'BODY_MEASUREMENT_NAME_CHEST';
  const gender = captureGender(query.get('gender'));
  const viewPreset = captureView(query.get('view'));

  // The capture route is development-only. Set the token before the Three stage mounts so the
  // screenshot uses the same restrained coral as the baked mobile guides. Hex, because
  // THREE.Color does not parse the space-separated rgb() form and silently draws white.
  document.documentElement.style.setProperty('--color-highlightColor', '#e85d4a');

  return (
    <>
      <style>{'.tsqd-open-btn-container { display: none !important; }'}</style>
      <main
        className='h-screen w-screen overflow-hidden bg-pageBg [&_[data-testid=measurement-surface-active-guide-label]]:hidden'
        data-testid='model-measurement-guide-capture-dev-page'
      >
        <ModelOpenReferencePreviewFromInput
          activeMeasurementName={measurementName}
          directPoseViewportEditingEnabledV9={false}
          hideDirectPoseControlV9
          input={{ gender, measurements: CAPTURE_MEASUREMENTS }}
          measurementGuidePresentation='capture'
          modelContentRevision={`measurement-guide-capture:${gender}`}
          modelId={`measurement-guide-capture:${gender}`}
          poseControls='full-body-v9'
          variant='workbench'
          viewPreset={viewPreset}
        />
      </main>
    </>
  );
}
