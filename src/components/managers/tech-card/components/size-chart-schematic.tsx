import { GARMENT_SCHEMATIC } from 'lib/pom/schematic';
import type { GarmentKind, PomCode } from 'lib/pom/types';
import { cn } from 'lib/utility';

type SchematicPoint = { position: number; pomCode?: PomCode };

export function SizeChartSchematic({
  kind,
  points,
  active,
  className,
  label,
}: {
  kind: GarmentKind;
  points: readonly SchematicPoint[];
  active?: PomCode | null;
  className?: string;
  label?: string;
}) {
  const schematic = GARMENT_SCHEMATIC[kind];
  const drawn = points.flatMap((point) => {
    const line = point.pomCode ? schematic.lines[point.pomCode] : undefined;
    return line && point.pomCode ? [{ point, line, code: point.pomCode }] : [];
  });

  return (
    <svg
      viewBox={schematic.viewBox}
      role='img'
      aria-label={label ?? `${kind} size chart`}
      className={cn('block w-full bg-bgColor', className)}
    >
      {schematic.outline.map((path, index) => (
        <path
          key={path}
          d={path}
          fill={index === 0 ? 'var(--color-bgColor)' : 'none'}
          stroke='var(--color-textColor)'
          strokeWidth={index === 0 ? 2.5 : 1}
          vectorEffect='non-scaling-stroke'
        />
      ))}
      {drawn.map(({ point, line, code }) => {
        const highlighted = active === code;
        const quiet = !!active && !highlighted;
        const color = quiet ? 'var(--color-borderColor)' : 'var(--color-warning)';
        return (
          <g key={`${point.position}:${code}`} data-pom={code}>
            <line
              x1={line.x1}
              y1={line.y1}
              x2={line.x2}
              y2={line.y2}
              stroke={color}
              strokeWidth={highlighted ? 5 : 2.5}
              vectorEffect='non-scaling-stroke'
            />
            <circle
              cx={line.label.x}
              cy={line.label.y}
              r='13'
              fill='var(--color-bgColor)'
              stroke={color}
              strokeWidth='2'
              vectorEffect='non-scaling-stroke'
            />
            <text
              x={line.label.x}
              y={line.label.y + 6}
              fill={color}
              fontSize='17'
              textAnchor='middle'
            >
              {point.position}
            </text>
          </g>
        );
      })}
    </svg>
  );
}
