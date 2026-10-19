import { common_BodyMeasurementName, common_ModelMeasurement } from 'api/proto-http/admin';
import { cn } from 'lib/utility';
import { useMemo, useRef, useState } from 'react';
import { Text } from 'ui';

// The fit model's body measurements drawn on a front silhouette (FITTING-WORKSPACE mockup v7):
// girths as dashed rings, lengths as lines with end ticks, back-only lengths dotted. Hover / focus /
// tap a mark for its «CHEST 1120» hint. A measurement the model has no value for, or one this
// figure has no place for, is simply not drawn. Local to the fitting screen — not a primitive.

type Shape = { d: string; ax: number; ay: number };
type Kind = 'girth' | 'len' | 'back';

// Left half of the outline in the 200×420 view box; the right half is its mirror.
const HALF: [number, number][] = [
  [93, 48],
  [93, 60],
  [66, 66],
  [58, 80],
  [54, 140],
  [48, 196],
  [45, 212],
  [54, 215],
  [58, 198],
  [66, 142],
  [70, 96],
  [72, 120],
  [76, 150],
  [72, 175],
  [70, 195],
  [72, 250],
  [76, 300],
  [78, 350],
  [80, 392],
  [74, 404],
  [93, 404],
  [93, 390],
  [95, 350],
  [96, 300],
  [98, 240],
  [100, 214],
];
const BODY_PATH = (() => {
  const right = HALF.slice()
    .reverse()
    .map(([x, y]) => [200 - x, y]);
  return `M${[...HALF, ...right].map((p) => p.join(',')).join(' L')} Z`;
})();

function girth(cx: number, cy: number, rx: number): Shape {
  const ry = rx * 0.28;
  return {
    d: `M${cx - rx},${cy} A${rx},${ry} 0 1,0 ${cx + rx},${cy} A${rx},${ry} 0 1,0 ${cx - rx},${cy}`,
    ax: cx,
    ay: cy - ry,
  };
}

function line(x1: number, y1: number, x2: number, y2: number): Shape {
  const dx = x2 - x1;
  const dy = y2 - y1;
  const l = Math.hypot(dx, dy);
  const tx = (-dy / l) * 3;
  const ty = (dx / l) * 3;
  return {
    d: `M${x1},${y1} L${x2},${y2} M${x1 - tx},${y1 - ty} L${x1 + tx},${y1 + ty} M${x2 - tx},${y2 - ty} L${x2 + tx},${y2 + ty}`,
    ax: (x1 + x2) / 2,
    ay: Math.min(y1, y2) + (Math.abs(dy) < 4 ? 0 : Math.abs(dy) / 2),
  };
}

const MARKS: { name: common_BodyMeasurementName; label: string; kind: Kind; shape: Shape }[] = [
  {
    name: 'BODY_MEASUREMENT_NAME_NECK_BASE',
    label: 'neck base',
    kind: 'girth',
    shape: girth(100, 57, 8),
  },
  {
    name: 'BODY_MEASUREMENT_NAME_ACROSS_SHOULDER',
    label: 'across shoulder',
    kind: 'len',
    shape: line(66, 62, 134, 62),
  },
  {
    name: 'BODY_MEASUREMENT_NAME_ACROSS_BACK',
    label: 'across back',
    kind: 'back',
    shape: line(71, 82, 129, 82),
  },
  {
    name: 'BODY_MEASUREMENT_NAME_ACROSS_FRONT',
    label: 'across front',
    kind: 'len',
    shape: line(73, 88, 127, 88),
  },
  {
    name: 'BODY_MEASUREMENT_NAME_CHEST',
    label: 'chest',
    kind: 'girth',
    shape: girth(100, 100, 30),
  },
  {
    name: 'BODY_MEASUREMENT_NAME_UNDER_BUST',
    label: 'under bust',
    kind: 'girth',
    shape: girth(100, 117, 28),
  },
  {
    name: 'BODY_MEASUREMENT_NAME_WAIST',
    label: 'waist',
    kind: 'girth',
    shape: girth(100, 150, 24),
  },
  {
    name: 'BODY_MEASUREMENT_NAME_HIGH_HIP',
    label: 'high hip',
    kind: 'girth',
    shape: girth(100, 175, 28),
  },
  { name: 'BODY_MEASUREMENT_NAME_HIP', label: 'hip', kind: 'girth', shape: girth(100, 195, 30) },
  { name: 'BODY_MEASUREMENT_NAME_BICEP', label: 'bicep', kind: 'girth', shape: girth(137, 108, 7) },
  { name: 'BODY_MEASUREMENT_NAME_WRIST', label: 'wrist', kind: 'girth', shape: girth(146, 196, 6) },
  {
    name: 'BODY_MEASUREMENT_NAME_SLEEVE_LENGTH',
    label: 'sleeve length',
    kind: 'len',
    shape: line(140, 64, 158, 198),
  },
  {
    name: 'BODY_MEASUREMENT_NAME_HPS_TO_WAIST_FRONT',
    label: 'hps to waist',
    kind: 'len',
    shape: line(88, 56, 88, 150),
  },
  {
    name: 'BODY_MEASUREMENT_NAME_CB_NECK_TO_WAIST',
    label: 'cb neck to waist',
    kind: 'back',
    shape: line(100, 52, 100, 150),
  },
  {
    name: 'BODY_MEASUREMENT_NAME_INSEAM',
    label: 'inseam',
    kind: 'len',
    shape: line(103, 216, 109, 400),
  },
  { name: 'BODY_MEASUREMENT_NAME_THIGH', label: 'thigh', kind: 'girth', shape: girth(85, 226, 13) },
  { name: 'BODY_MEASUREMENT_NAME_KNEE', label: 'knee', kind: 'girth', shape: girth(86, 300, 10) },
  { name: 'BODY_MEASUREMENT_NAME_CALF', label: 'calf', kind: 'girth', shape: girth(87, 340, 9) },
  { name: 'BODY_MEASUREMENT_NAME_ANKLE', label: 'ankle', kind: 'girth', shape: girth(88, 388, 7) },
  {
    name: 'BODY_MEASUREMENT_NAME_HEIGHT',
    label: 'height',
    kind: 'len',
    shape: line(184, 14, 184, 404),
  },
];

export function Mannequin({ measurements }: { measurements?: common_ModelMeasurement[] }) {
  const boxRef = useRef<HTMLDivElement>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const [hot, setHot] = useState<number | null>(null);

  const drawn = useMemo(() => {
    const values = new Map<string, number>();
    for (const m of measurements ?? []) {
      if (m.name && m.valueMm) values.set(m.name, m.valueMm);
    }
    return MARKS.flatMap((m) => {
      const v = values.get(m.name);
      return v ? [{ ...m, value: v }] : [];
    });
  }, [measurements]);

  if (drawn.length === 0) {
    return <Text variant='label'>no measurements</Text>;
  }

  const hotMark = hot != null ? drawn[hot] : undefined;
  let tipPos: { left: number; top: number } | undefined;
  if (hotMark && svgRef.current && boxRef.current) {
    const sr = svgRef.current.getBoundingClientRect();
    const br = boxRef.current.getBoundingClientRect();
    const k = sr.width / 200;
    tipPos = {
      left: sr.left - br.left + hotMark.shape.ax * k,
      top: sr.top - br.top + hotMark.shape.ay * k,
    };
  }

  return (
    <div ref={boxRef} className='relative flex justify-center py-2'>
      <svg
        ref={svgRef}
        viewBox='0 0 200 420'
        role='img'
        aria-label='model measurements'
        className='h-auto w-full max-w-xs overflow-visible'
      >
        <ellipse
          cx='100'
          cy='31'
          rx='14'
          ry='17'
          className='fill-hairline stroke-labelColor'
          vectorEffect='non-scaling-stroke'
        />
        <path
          d={BODY_PATH}
          className='fill-hairline stroke-labelColor'
          vectorEffect='non-scaling-stroke'
        />
        {drawn.map((m, i) => {
          const on = hot === i;
          return (
            <g
              key={m.name}
              tabIndex={0}
              role='button'
              aria-label={`${m.label} ${m.value}`}
              className='cursor-pointer outline-none'
              onMouseEnter={() => setHot(i)}
              onMouseLeave={() => setHot(null)}
              onFocus={() => setHot(i)}
              onBlur={() => setHot(null)}
              onClick={() => setHot(i)}
            >
              <path d={m.shape.d} fill='none' stroke='transparent' strokeWidth={9} />
              <path
                d={m.shape.d}
                fill='none'
                vectorEffect='non-scaling-stroke'
                strokeWidth={on ? 2 : 1}
                strokeDasharray={
                  on
                    ? undefined
                    : m.kind === 'girth'
                      ? '3 2'
                      : m.kind === 'back'
                        ? '1 2'
                        : undefined
                }
                className={cn(on ? 'stroke-textColor' : 'stroke-labelColor')}
              />
            </g>
          );
        })}
      </svg>
      {hotMark && tipPos && (
        <div
          className='pointer-events-none absolute -mt-1.5 -translate-x-1/2 -translate-y-full whitespace-nowrap border border-borderColor bg-bgColor px-2 py-0.5 tabular-nums'
          style={{ left: tipPos.left, top: tipPos.top }}
        >
          <Text size='micro' variant='uppercase' tracking='label' component='span'>
            {hotMark.label} {hotMark.value}
          </Text>
        </div>
      )}
    </div>
  );
}
