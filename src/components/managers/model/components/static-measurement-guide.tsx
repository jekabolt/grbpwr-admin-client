import { cn } from 'lib/utility';

import { measurementLabel } from './sheet-measurement-focus';

type GuidePoint = readonly [x: number, y: number];

export type StaticMeasurementGuideSpecV1 = {
  readonly path: string;
  readonly points?: readonly GuidePoint[];
};

const loop = (left: number, right: number, y: number, depth: number): string =>
  `M ${left} ${y} C ${left} ${y - depth} ${right} ${y - depth} ${right} ${y} C ${right} ${
    y + depth
  } ${left} ${y + depth} ${left} ${y}`;

/**
 * A deliberately static, display-only map. Coordinates target the shared 2:3 front-view artwork;
 * no body value is inferred from a marker and no marker changes the stored measurement.
 */
export const STATIC_MEASUREMENT_GUIDES_V1: Readonly<Record<string, StaticMeasurementGuideSpecV1>> =
  {
    BODY_MEASUREMENT_NAME_CHEST: {
      path: loop(74, 166, 88, 8),
      points: [
        [74, 88],
        [166, 88],
      ],
    },
    BODY_MEASUREMENT_NAME_UNDER_BUST: {
      path: loop(77, 163, 105, 7),
      points: [
        [77, 105],
        [163, 105],
      ],
    },
    BODY_MEASUREMENT_NAME_WAIST: {
      path: loop(83, 157, 137, 6),
      points: [
        [83, 137],
        [157, 137],
      ],
    },
    BODY_MEASUREMENT_NAME_HIGH_HIP: {
      path: loop(76, 164, 154, 7),
      points: [
        [76, 154],
        [164, 154],
      ],
    },
    BODY_MEASUREMENT_NAME_HIP: {
      path: loop(68, 172, 170, 9),
      points: [
        [68, 170],
        [172, 170],
      ],
    },
    BODY_MEASUREMENT_NAME_NECK_BASE: {
      path: loop(101, 139, 56, 5),
      points: [
        [101, 56],
        [139, 56],
      ],
    },
    BODY_MEASUREMENT_NAME_ACROSS_SHOULDER: {
      path: 'M 69 64 Q 120 51 171 64',
      points: [
        [69, 64],
        [171, 64],
      ],
    },
    BODY_MEASUREMENT_NAME_SLEEVE_LENGTH: {
      path: 'M 171 64 Q 190 103 198 142 Q 204 166 207 184',
      points: [
        [171, 64],
        [198, 142],
        [207, 184],
      ],
    },
    BODY_MEASUREMENT_NAME_BICEP: {
      path: loop(171, 192, 94, 5),
      points: [
        [171, 94],
        [192, 94],
      ],
    },
    BODY_MEASUREMENT_NAME_WRIST: {
      path: loop(198, 216, 181, 4),
      points: [
        [198, 181],
        [216, 181],
      ],
    },
    BODY_MEASUREMENT_NAME_INSEAM: {
      path: 'M 120 181 L 120 328',
      points: [
        [120, 181],
        [120, 328],
      ],
    },
    BODY_MEASUREMENT_NAME_THIGH: {
      path: loop(72, 118, 203, 6),
      points: [
        [72, 203],
        [118, 203],
      ],
    },
    BODY_MEASUREMENT_NAME_KNEE: {
      path: loop(79, 113, 238, 5),
      points: [
        [79, 238],
        [113, 238],
      ],
    },
    BODY_MEASUREMENT_NAME_CALF: {
      path: loop(82, 111, 275, 5),
      points: [
        [82, 275],
        [111, 275],
      ],
    },
    BODY_MEASUREMENT_NAME_ANKLE: {
      path: loop(86, 108, 325, 4),
      points: [
        [86, 325],
        [108, 325],
      ],
    },
    BODY_MEASUREMENT_NAME_HEIGHT: {
      path: 'M 44 4 L 44 352 M 37 4 L 51 4 M 37 352 L 51 352',
      points: [
        [44, 4],
        [44, 352],
      ],
    },
    BODY_MEASUREMENT_NAME_HPS_HEIGHT: {
      path: 'M 166 60 L 188 352 M 176 60 L 171 68 M 176 60 L 169 57',
      points: [
        [166, 60],
        [188, 352],
      ],
    },
    BODY_MEASUREMENT_NAME_HPS_TO_WAIST_FRONT: {
      path: 'M 158 60 Q 151 98 151 137',
      points: [
        [158, 60],
        [151, 137],
      ],
    },
    BODY_MEASUREMENT_NAME_CF_NECK_TO_WAIST: {
      path: 'M 120 55 L 120 137',
      points: [
        [120, 55],
        [120, 137],
      ],
    },
    BODY_MEASUREMENT_NAME_CB_NECK_TO_WAIST: {
      path: 'M 113 55 Q 106 96 111 137',
      points: [
        [113, 55],
        [111, 137],
      ],
    },
    BODY_MEASUREMENT_NAME_WAIST_HEIGHT: {
      path: 'M 64 137 L 64 352',
      points: [
        [64, 137],
        [64, 352],
      ],
    },
    BODY_MEASUREMENT_NAME_WAIST_TO_HIGH_HIP: {
      path: 'M 84 137 L 84 154',
      points: [
        [84, 137],
        [84, 154],
      ],
    },
    BODY_MEASUREMENT_NAME_WAIST_TO_HIP: {
      path: 'M 71 137 L 71 170',
      points: [
        [71, 137],
        [71, 170],
      ],
    },
    BODY_MEASUREMENT_NAME_ACROSS_FRONT: {
      path: 'M 82 84 Q 120 77 158 84',
      points: [
        [82, 84],
        [158, 84],
      ],
    },
    BODY_MEASUREMENT_NAME_ACROSS_BACK: {
      path: 'M 80 78 Q 120 68 160 78',
      points: [
        [80, 78],
        [160, 78],
      ],
    },
    BODY_MEASUREMENT_NAME_CHEST_DEPTH: {
      path: 'M 91 88 L 164 88 M 156 82 L 164 88 L 156 94',
      points: [
        [91, 88],
        [164, 88],
      ],
    },
    BODY_MEASUREMENT_NAME_WAIST_DEPTH: {
      path: 'M 86 137 L 158 137 M 150 131 L 158 137 L 150 143',
      points: [
        [86, 137],
        [158, 137],
      ],
    },
    BODY_MEASUREMENT_NAME_HIP_DEPTH: {
      path: 'M 73 170 L 170 170 M 162 164 L 170 170 L 162 176',
      points: [
        [73, 170],
        [170, 170],
      ],
    },
    BODY_MEASUREMENT_NAME_SHOULDER_LENGTH: {
      path: 'M 137 54 L 171 64',
      points: [
        [137, 54],
        [171, 64],
      ],
    },
    BODY_MEASUREMENT_NAME_SHOULDER_DROP: {
      path: 'M 137 54 L 137 64 L 171 64',
      points: [
        [137, 54],
        [137, 64],
        [171, 64],
      ],
    },
    BODY_MEASUREMENT_NAME_ARMSCYE_DEPTH: {
      path: 'M 162 64 L 162 108',
      points: [
        [162, 64],
        [162, 108],
      ],
    },
    BODY_MEASUREMENT_NAME_ARMSCYE_CIRCUMFERENCE: {
      path: loop(154, 176, 86, 14),
      points: [
        [154, 86],
        [176, 86],
      ],
    },
    BODY_MEASUREMENT_NAME_BUST_APEX_TO_APEX: {
      path: 'M 100 89 L 140 89',
      points: [
        [100, 89],
        [140, 89],
      ],
    },
    BODY_MEASUREMENT_NAME_HPS_TO_BUST_APEX: {
      path: 'M 157 60 Q 145 72 140 89',
      points: [
        [157, 60],
        [140, 89],
      ],
    },
  };

export type StaticMeasurementGuideGenderV1 = 'female' | 'male' | 'neutral';

export function staticMeasurementGuideGenderV1(
  gender: string | null | undefined,
): StaticMeasurementGuideGenderV1 {
  if (gender === 'GENDER_ENUM_FEMALE') return 'female';
  if (gender === 'GENDER_ENUM_MALE') return 'male';
  return 'neutral';
}

export function StaticMeasurementGuide({
  measurementName,
  gender,
  femaleSrc,
  maleSrc,
  neutralSrc,
  className,
}: {
  measurementName: string;
  gender: string | null | undefined;
  femaleSrc: string;
  maleSrc: string;
  neutralSrc?: string;
  className?: string;
}) {
  const guide = STATIC_MEASUREMENT_GUIDES_V1[measurementName];
  const resolvedGender = staticMeasurementGuideGenderV1(gender);
  const src =
    resolvedGender === 'female'
      ? femaleSrc
      : resolvedGender === 'male'
        ? maleSrc
        : neutralSrc ?? femaleSrc;

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
    >
      <img
        src={src}
        alt={`${resolvedGender} mannequin · ${measurementLabel(measurementName)}`}
        className={cn(
          'absolute inset-0 h-full w-full object-contain',
          resolvedGender === 'neutral' && 'grayscale',
        )}
        draggable={false}
      />

      {guide ? (
        <svg
          viewBox='0 0 240 360'
          className='pointer-events-none absolute inset-0 h-full w-full overflow-visible text-highlightColor'
          aria-hidden='true'
          data-testid='static-measurement-marker'
        >
          <path
            d={guide.path}
            fill='none'
            stroke='currentColor'
            strokeWidth='3'
            strokeLinecap='round'
            strokeLinejoin='round'
            vectorEffect='non-scaling-stroke'
          />
          {guide.points?.map(([x, y]) => (
            <circle
              key={`${x}:${y}`}
              cx={x}
              cy={y}
              r='3.5'
              fill='currentColor'
              stroke='white'
              strokeWidth='1.5'
              vectorEffect='non-scaling-stroke'
            />
          ))}
        </svg>
      ) : null}
    </figure>
  );
}
