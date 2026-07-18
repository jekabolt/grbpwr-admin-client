import { cn } from 'lib/utility';

// Hover/focus pictograms for the body-measurement labels in the model editor (admin #63) — a
// small line-art mannequin with the relevant line/band highlighted, so an operator can see at a
// glance *where* and *how* a measurement is taken without leaving the form.
//
// All pictograms share one base mannequin (front view, drawn faint) plus a single bold
// "highlight" primitive placed at the right spot, rather than 20 independent hand-drawn bodies —
// far less error-prone and keeps the set visually consistent. Everything uses `currentColor` so
// the icon follows the surrounding text color.
//
// Matching is robust on purpose: `MeasurementPictogram` takes both the raw
// `common_BodyMeasurementName` enum value (exact, preferred) and the display label (fallback,
// alias-tolerant) — see `resolveMeasurementGeometry`. Anything that doesn't resolve renders
// `FALLBACK_GEOMETRY` instead of throwing, so an unrecognised/new measurement never breaks the
// form.

type BandGeometry = { kind: 'band'; y: number; x1: number; x2: number; dashed?: boolean };
type VerticalBandGeometry = { kind: 'vband'; x: number; y1: number; y2: number; dashed?: boolean };
type RingGeometry = { kind: 'ring'; cx: number; cy: number; rx: number; ry: number };
type TraceGeometry = { kind: 'trace'; points: string };
type Geometry = BandGeometry | VerticalBandGeometry | RingGeometry | TraceGeometry;

// Front-view mannequin: torso + hips as one outline, limbs as short separate polylines, arms
// and legs spread slightly (croquis pose) so bands/rings drawn over a limb don't collide with
// the torso outline. Coordinates live in a 0..64 (w) / 0..96 (h) box — matches the root <svg>
// viewBox below.
const MANNEQUIN_LINES = [
  '16,22 23,47 17,58 32,60 47,58 41,47 48,22', // torso taper -> hip flare -> crotch
  '17,58 18,80 19,94', // left leg, outer
  '32,60 29,80 27,94', // left leg, inner
  '47,58 46,80 45,94', // right leg, outer
  '32,60 35,80 37,94', // right leg, inner
  '16,22 10,38 8,54', // left arm
  '48,22 54,38 56,56', // right arm
];

// canonical key (normalized measurement name — no prefix/underscores/case) -> highlight.
// Keys mirror `common_BodyMeasurementName` minus the `BODY_MEASUREMENT_NAME_` prefix, so the
// enum path below is an exact 1:1 lookup; the label-text path goes through ALIASES.
// Front-plane measurements are drawn solid; back-plane ones (across back, CB neck-to-waist)
// are dashed on the same spot, since the mannequin only has one (front) view.
const MEASUREMENT_GEOMETRY: Record<string, Geometry> = {
  chest: { kind: 'band', y: 34, x1: 19, x2: 45 },
  underbust: { kind: 'band', y: 39, x1: 21, x2: 43 },
  waist: { kind: 'band', y: 47, x1: 23, x2: 41 },
  highhip: { kind: 'band', y: 52, x1: 20, x2: 44 },
  hip: { kind: 'band', y: 58, x1: 17, x2: 47 },
  neckbase: { kind: 'band', y: 19, x1: 26, x2: 38 },
  acrossshoulder: { kind: 'band', y: 22, x1: 16, x2: 48 },
  sleevelength: { kind: 'trace', points: '48,22 54,38 56,56' },
  bicep: { kind: 'ring', cx: 51, cy: 30, rx: 4.5, ry: 2.6 },
  wrist: { kind: 'ring', cx: 56, cy: 55, rx: 4, ry: 2.4 },
  inseam: { kind: 'trace', points: '32,60 35,80 37,94' },
  thigh: { kind: 'ring', cx: 40, cy: 72, rx: 6.2, ry: 2.6 },
  knee: { kind: 'ring', cx: 40.5, cy: 80, rx: 5.5, ry: 2.4 },
  calf: { kind: 'ring', cx: 41, cy: 87, rx: 5.5, ry: 2.5 },
  ankle: { kind: 'ring', cx: 41, cy: 94, rx: 5.2, ry: 2.4 },
  height: { kind: 'vband', x: 60, y1: 3, y2: 96 },
  hpstowaistfront: { kind: 'vband', x: 21, y1: 22, y2: 47 },
  cbnecktowaist: { kind: 'vband', x: 32, y1: 19, y2: 47, dashed: true },
  acrossfront: { kind: 'band', y: 32, x1: 21, x2: 43 },
  acrossback: { kind: 'band', y: 32, x1: 21, x2: 43, dashed: true },
};

// Free-text synonyms -> canonical key above, for labels/dictionary strings that don't match a
// `common_BodyMeasurementName` 1:1 (a differently-worded label, or a garment-measurement
// dictionary elsewhere in the app). Keeps matching "tolerant of variants" rather than exact-only.
const ALIASES: Record<string, keyof typeof MEASUREMENT_GEOMETRY> = {
  bust: 'chest',
  bustcircumference: 'chest',
  underbustcircumference: 'underbust',
  bandmeasurement: 'underbust',
  waistline: 'waist',
  waistcircumference: 'waist',
  highhipcircumference: 'highhip',
  hips: 'hip',
  hipcircumference: 'hip',
  seat: 'hip',
  neck: 'neckbase',
  neckcircumference: 'neckbase',
  shoulder: 'acrossshoulder',
  shoulders: 'acrossshoulder',
  shoulderwidth: 'acrossshoulder',
  sleeve: 'sleevelength',
  sleevelengthfromshoulder: 'sleevelength',
  arm: 'sleevelength',
  armlength: 'sleevelength',
  biceps: 'bicep',
  upperarm: 'bicep',
  upperarmcircumference: 'bicep',
  wristcircumference: 'wrist',
  inseamlength: 'inseam',
  insideleg: 'inseam',
  insideleglength: 'inseam',
  thighcircumference: 'thigh',
  kneecircumference: 'knee',
  calfcircumference: 'calf',
  anklecircumference: 'ankle',
  bodyheight: 'height',
  totalheight: 'height',
  frontlength: 'hpstowaistfront',
  frontwaistlength: 'hpstowaistfront',
  hpstowaist: 'hpstowaistfront',
  backlength: 'cbnecktowaist',
  centrebacklength: 'cbnecktowaist',
  centerbacklength: 'cbnecktowaist',
  cbneck: 'cbnecktowaist',
  frontwidth: 'acrossfront',
  chestwidthfront: 'acrossfront',
  backwidth: 'acrossback',
  chestwidthback: 'acrossback',
};

// Generic "measure around here" mark for any measurement name we don't recognise — never
// crashes, just renders a plain dashed band on the torso.
const FALLBACK_GEOMETRY: Geometry = { kind: 'band', y: 41, x1: 18, x2: 46, dashed: true };

function normalizeKey(raw: string): string {
  return raw.toLowerCase().replace(/[^a-z0-9]/g, '');
}

// Exact enum match first (case-insensitively stripped of the proto prefix), then the label
// text through the alias table (also case-insensitive / punctuation-tolerant). Falls back to a
// generic pictogram rather than returning undefined, so callers never need a null-check.
export function resolveMeasurementGeometry(measurementName?: string, label?: string): Geometry {
  const candidates = [measurementName?.replace(/^BODY_MEASUREMENT_NAME_/i, ''), label].filter(
    (v): v is string => !!v && v.trim() !== '',
  );

  for (const candidate of candidates) {
    const key = normalizeKey(candidate);
    if (key in MEASUREMENT_GEOMETRY) return MEASUREMENT_GEOMETRY[key];
    const alias = ALIASES[key];
    if (alias) return MEASUREMENT_GEOMETRY[alias];
  }
  return FALLBACK_GEOMETRY;
}

const RING_STROKE = 1.8;
const BOLD_STROKE = 2.25;
const TICK = 2.5;

function Highlight({ geometry }: { geometry: Geometry }) {
  switch (geometry.kind) {
    case 'band': {
      const { y, x1, x2, dashed } = geometry;
      return (
        <g
          stroke='currentColor'
          strokeWidth={BOLD_STROKE}
          strokeLinecap='round'
          strokeDasharray={dashed ? '3 2' : undefined}
        >
          <line x1={x1} y1={y} x2={x2} y2={y} />
          <line x1={x1} y1={y - TICK} x2={x1} y2={y + TICK} />
          <line x1={x2} y1={y - TICK} x2={x2} y2={y + TICK} />
        </g>
      );
    }
    case 'vband': {
      const { x, y1, y2, dashed } = geometry;
      return (
        <g
          stroke='currentColor'
          strokeWidth={BOLD_STROKE}
          strokeLinecap='round'
          strokeDasharray={dashed ? '3 2' : undefined}
        >
          <line x1={x} y1={y1} x2={x} y2={y2} />
          <line x1={x - TICK} y1={y1} x2={x + TICK} y2={y1} />
          <line x1={x - TICK} y1={y2} x2={x + TICK} y2={y2} />
        </g>
      );
    }
    case 'ring':
      return (
        <ellipse
          stroke='currentColor'
          fill='none'
          strokeWidth={RING_STROKE}
          cx={geometry.cx}
          cy={geometry.cy}
          rx={geometry.rx}
          ry={geometry.ry}
        />
      );
    case 'trace':
      return (
        <polyline
          stroke='currentColor'
          fill='none'
          strokeWidth={BOLD_STROKE}
          strokeLinecap='round'
          strokeLinejoin='round'
          points={geometry.points}
        />
      );
  }
}

export function MeasurementPictogram({
  measurementName,
  label,
  className,
}: {
  // Preferred match key: the raw `common_BodyMeasurementName` value, e.g.
  // 'BODY_MEASUREMENT_NAME_CHEST'.
  measurementName?: string;
  // Fallback match key (and what ALIASES is keyed against) when no enum name is available —
  // the display label, e.g. "under bust".
  label?: string;
  className?: string;
}) {
  const geometry = resolveMeasurementGeometry(measurementName, label);
  return (
    <svg
      viewBox='0 0 64 96'
      className={cn('h-36 w-24', className)}
      aria-hidden='true'
      xmlns='http://www.w3.org/2000/svg'
    >
      <g
        fill='none'
        stroke='currentColor'
        strokeWidth={1.4}
        strokeLinecap='round'
        strokeLinejoin='round'
        opacity={0.35}
      >
        <circle cx={32} cy={10} r={6} />
        {MANNEQUIN_LINES.map((points) => (
          <polyline key={points} points={points} />
        ))}
      </g>
      <Highlight geometry={geometry} />
    </svg>
  );
}
