import type { JSX } from 'react';
import { BAR_BASE, ICONS, OVERLAYS, type Shape } from './icons.gen';
import type { IconChip, OpIcon } from './op-icon';

type OpIconArtProps = {
  icon: OpIcon;
  w?: number | string;
  h?: number | string;
  className?: string;
  title?: string;
};

function shapeElement(shape: Shape, key: string): JSX.Element {
  const dashed =
    (shape[0] === 'p' && shape[2] === 1) ||
    (shape[0] === 'c' && shape[4] === 1) ||
    (shape[0] === 'r' && shape[6] === 1);
  const common = {
    key,
    className: dashed ? 'd' : undefined,
    strokeDasharray: dashed ? '3 3' : undefined,
    vectorEffect: 'non-scaling-stroke' as const,
  };
  if (shape[0] === 'p') return <path {...common} d={shape[1]} />;
  if (shape[0] === 'c') return <circle {...common} cx={shape[1]} cy={shape[2]} r={shape[3]} />;
  return (
    <rect {...common} x={shape[1]} y={shape[2]} width={shape[3]} height={shape[4]} rx={shape[5]} />
  );
}

const shapes = (items: readonly Shape[], prefix: string): JSX.Element[] =>
  items.map((shape, index) => shapeElement(shape, `${prefix}-${index}`));

function genericChip(chip: Extract<IconChip, 'CTR' | 'LAP' | 'EXP' | 'FLY'>) {
  return (
    <g data-op-icon-chip={chip}>
      <rect x={18.5} y={2} width={12} height={9} rx={1.5} vectorEffect='non-scaling-stroke' />
      <text x={24.5} y={7.5} fill='currentColor' stroke='none' fontSize={3.2} textAnchor='middle'>
        {chip}
      </text>
    </g>
  );
}

export function OpIconArt({ icon, w = 32, h = 24, className, title }: OpIconArtProps) {
  const barBase = icon.bars ? BAR_BASE[icon.key] : undefined;
  const baseShapes: readonly Shape[] = barBase?.shapes ?? ICONS[icon.key];
  const barShapes =
    barBase && icon.bars
      ? (OVERLAYS.bars[barBase.family][icon.bars] as readonly Shape[])
      : undefined;
  const mode = barBase?.family === 'topstitch' && icon.at ? OVERLAYS.mode[icon.at] : undefined;
  const pressArrow = icon.arrow ? (OVERLAYS.arrow[icon.arrow] as readonly Shape[]) : undefined;
  const pressChip =
    icon.chip && icon.chip in OVERLAYS.chip
      ? (OVERLAYS.chip[icon.chip as keyof typeof OVERLAYS.chip] as readonly Shape[])
      : undefined;
  const zipChip =
    icon.chip === 'CTR' || icon.chip === 'LAP' || icon.chip === 'EXP' || icon.chip === 'FLY'
      ? icon.chip
      : undefined;

  return (
    <svg
      viewBox='0 0 32 24'
      width={w}
      height={h}
      fill='none'
      stroke='currentColor'
      strokeWidth={1.5}
      strokeLinecap='round'
      strokeLinejoin='round'
      className={['opi', className].filter(Boolean).join(' ')}
      aria-hidden={title ? undefined : true}
      role={title ? 'img' : undefined}
      data-op-icon={icon.key}
    >
      {title ? <title>{title}</title> : null}
      {shapes(baseShapes, 'base')}
      {barShapes ? (
        <g transform={mode?.dx ? `translate(${mode.dx} 0)` : undefined}>
          {shapes(barShapes, 'bar')}
        </g>
      ) : null}
      {mode ? shapes(mode.shapes as readonly Shape[], 'mode') : null}
      {icon.more ? (
        <text
          x={OVERLAYS.moreAnchor[0]}
          y={OVERLAYS.moreAnchor[1]}
          fill='currentColor'
          stroke='none'
          fontSize={4}
        >
          ×{icon.more}
        </text>
      ) : null}
      {pressArrow ? shapes(pressArrow, 'arrow') : null}
      {pressChip ? shapes(pressChip, 'chip') : null}
      {zipChip ? genericChip(zipChip) : null}
    </svg>
  );
}
