import { cn } from 'lib/utility';

import { measurementLabel } from './sheet-measurement-focus';

export type StaticMeasurementGuideViewV2 = 'front' | 'back' | 'side';
export type StaticMeasurementGuideGenderV2 = 'female' | 'male' | 'neutral';
export type StaticMeasurementGuideSourcesV2 = Readonly<
  Record<StaticMeasurementGuideGenderV2, Readonly<Record<string, string>>>
>;

const STATIC_MEASUREMENT_GUIDE_ASSETS_V2 = import.meta.glob(
  '/src/assets/mannequin/measurement-guides-v2/**/*.webp',
  { eager: true, import: 'default' },
) as Readonly<Record<string, string>>;

const BACK_MEASUREMENTS = new Set([
  'BODY_MEASUREMENT_NAME_CB_NECK_TO_WAIST',
  'BODY_MEASUREMENT_NAME_ACROSS_BACK',
]);

const SIDE_MEASUREMENTS = new Set([
  'BODY_MEASUREMENT_NAME_CHEST_DEPTH',
  'BODY_MEASUREMENT_NAME_WAIST_DEPTH',
  'BODY_MEASUREMENT_NAME_HIP_DEPTH',
]);

export function staticMeasurementGuideViewV2(
  measurementName: string,
): StaticMeasurementGuideViewV2 {
  if (BACK_MEASUREMENTS.has(measurementName)) return 'back';
  if (SIDE_MEASUREMENTS.has(measurementName)) return 'side';
  return 'front';
}

export function staticMeasurementGuideGenderV2(
  gender: string | null | undefined,
): StaticMeasurementGuideGenderV2 {
  if (gender === 'GENDER_ENUM_FEMALE') return 'female';
  if (gender === 'GENDER_ENUM_MALE') return 'male';
  return 'neutral';
}

export function staticMeasurementGuideAssetV2(
  gender: StaticMeasurementGuideGenderV2,
  measurementName: string,
  sources?: StaticMeasurementGuideSourcesV2,
): string | undefined {
  if (sources) return sources[gender][measurementName];
  return STATIC_MEASUREMENT_GUIDE_ASSETS_V2[
    `/src/assets/mannequin/measurement-guides-v2/${gender}/${measurementName}.webp`
  ];
}

export function staticMeasurementGuideAssetCountV2(): number {
  return Object.keys(STATIC_MEASUREMENT_GUIDE_ASSETS_V2).length;
}

/**
 * One baked illustration per gender and measurement. The coral tape is part of the raster asset:
 * there is no independently scaled SVG overlay that can drift away from the mannequin.
 */
export function StaticMeasurementGuide({
  measurementName,
  gender,
  sources,
  className,
}: {
  measurementName: string;
  gender: string | null | undefined;
  sources?: StaticMeasurementGuideSourcesV2;
  className?: string;
}) {
  const resolvedGender = staticMeasurementGuideGenderV2(gender);
  const view = staticMeasurementGuideViewV2(measurementName);
  const src = staticMeasurementGuideAssetV2(resolvedGender, measurementName, sources);

  return (
    <figure
      className={cn(
        'relative mx-auto h-full max-h-full min-h-0 w-auto max-w-full overflow-hidden',
        'aspect-[2/3] bg-pageBg',
        className,
      )}
      data-testid='static-measurement-guide'
      data-guide-gender={resolvedGender}
      data-guide-measurement={measurementName}
      data-guide-render='baked-image-v2'
      data-guide-view={view}
    >
      {src ? (
        <img
          src={src}
          alt={`${resolvedGender} mannequin · ${view} view · ${measurementLabel(measurementName)}`}
          className='absolute inset-0 h-full w-full object-contain'
          draggable={false}
          data-testid='static-measurement-image'
        />
      ) : null}
    </figure>
  );
}
