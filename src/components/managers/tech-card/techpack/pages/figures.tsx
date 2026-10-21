import { type ReactNode } from 'react';
import { PatternQR } from 'components/managers/tech-card/patterns/pattern-qr';
import type { MeasurementView } from '../derive-measurements';

export function QrFigure({
  value,
  label,
  sub,
  size = 96,
}: {
  value?: string;
  label: string;
  sub?: ReactNode;
  size?: number;
}) {
  return (
    <figure className='flex flex-col items-center border border-textColor p-1.5 text-center'>
      {value ? (
        <PatternQR value={value} size={size} />
      ) : (
        <div
          className='flex items-center justify-center font-bold uppercase text-error'
          style={{ width: size, height: size }}
        >
          ! qr
        </div>
      )}
      <figcaption
        className='mt-1 text-micro uppercase leading-tight'
        style={{ maxWidth: size + 24, overflowWrap: 'anywhere' }}
      >
        <div className='font-semibold'>{label}</div>
        {sub && <div className='text-labelColor'>{sub}</div>}
      </figcaption>
    </figure>
  );
}

/** Width / height from a CSS «w / h» ratio; a square when unknown. */
function ratioOf(aspect?: string): number {
  const [w, h] = (aspect ?? '').split('/').map((part) => Number(part.trim()));
  return w > 0 && h > 0 ? w / h : 1;
}

/** The flat at `height`, narrower when its column is; the box keeps the ratio the lines live in. */
export function TechnicalDrawing({ view, height }: { view: MeasurementView; height: number }) {
  const ratio = ratioOf(view.aspectRatio);
  return (
    <figure className='flex min-w-0 max-w-full flex-col items-center'>
      <div
        className='relative max-w-full'
        style={{ width: Math.round(height * ratio), aspectRatio: String(ratio) }}
      >
        <img src={view.src} alt={view.side} className='h-full w-full object-contain' />
        {view.lines.length > 0 && (
          <svg
            className='absolute inset-0 h-full w-full overflow-visible text-textColor'
            viewBox='0 0 100 100'
            preserveAspectRatio='none'
            aria-hidden='true'
          >
            {view.lines.map((line) => {
              const x1 = line.x1 * 100;
              const y1 = line.y1 * 100;
              const x2 = line.x2 * 100;
              const y2 = line.y2 * 100;
              const tx = (x1 + x2) / 2;
              const ty = (y1 + y2) / 2 - 4;
              return (
                <g key={line.label}>
                  <line
                    x1={x1}
                    y1={y1}
                    x2={x2}
                    y2={y2}
                    stroke='currentColor'
                    strokeWidth='0.65'
                    vectorEffect='non-scaling-stroke'
                  />
                  <circle
                    cx={x1}
                    cy={y1}
                    r='0.8'
                    className='fill-bgColor stroke-textColor'
                    strokeWidth='0.55'
                    vectorEffect='non-scaling-stroke'
                  />
                  <circle
                    cx={x2}
                    cy={y2}
                    r='0.8'
                    className='fill-bgColor stroke-textColor'
                    strokeWidth='0.55'
                    vectorEffect='non-scaling-stroke'
                  />
                  <line
                    x1={tx}
                    y1={(y1 + y2) / 2}
                    x2={tx}
                    y2={ty}
                    stroke='currentColor'
                    strokeWidth='0.5'
                    vectorEffect='non-scaling-stroke'
                  />
                  <rect x={tx - 2.5} y={ty - 2.5} width='5' height='5' className='fill-textColor' />
                  <text
                    x={tx}
                    y={ty}
                    className='fill-bgColor font-mono font-bold'
                    fontSize='3.2'
                    textAnchor='middle'
                    dominantBaseline='central'
                  >
                    {line.label}
                  </text>
                </g>
              );
            })}
          </svg>
        )}
      </div>
      <figcaption className='text-micro uppercase tracking-label text-labelColor'>
        {view.caption}
      </figcaption>
    </figure>
  );
}
