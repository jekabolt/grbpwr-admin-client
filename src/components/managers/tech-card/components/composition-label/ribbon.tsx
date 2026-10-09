// ОДНА СТОРОНА ЛЕНТЫ КАК ПРЕДМЕТ (R-11). Белая лента в настоящих пропорциях 100 × 30 мм с линией
// реза, припуск шва 10 мм заштрихован (у лица справа, у изнанки слева — видно, что после переворота
// по короткой стороне они ложатся друг на друга), пунктир сгиба — тот, что рисует сам движок.
// Поверх — двери: каждая напечатанная величина есть кнопка ровно на своём месте. Всё, что здесь
// сверх `PaperSvg`, — только экран: в файл не идёт ни штрих.
import { cn } from 'lib/utility';
import { forwardRef, useId } from 'react';
import type { PaperDoc } from '../../assembly-print/paper';
import { PaperSvg } from '../../assembly-print/paper-svg';
import { L, type Seam } from '../../care-labels/layout';
import { pxOf, PX_PER_MM, seamRect, type Region } from './regions';

export type RegionView = Region & {
  /** Доступное имя: «colour name: OFF WHITE». */
  label: string;
  overridden?: boolean;
  hole?: 'block' | 'warn' | null;
  selected?: boolean;
  disabled?: boolean;
  title?: string;
  /** То, что экран дорисовывает в слоте (пустой `MADE IN`). */
  placeholder?: React.ReactNode;
};

export type RibbonSide = {
  /** `A-face`, `B2-back` … */
  key: string;
  /** Подпись над стороной: `face`, `back · printed blank`. */
  caption: string;
  doc: PaperDoc | null;
  seam: Seam;
  /** Сторона печатается чистой. */
  blank?: boolean;
  /** Что на ней написано (контуры не читаются) — для диктора и проб. */
  text?: string;
};

export function Ribbon({
  side,
  zoom,
  regions,
  onOpen,
  refFor,
}: {
  side: RibbonSide;
  zoom: number;
  regions: RegionView[];
  onOpen: (r: RegionView) => void;
  refFor?: (key: string) => (el: HTMLButtonElement | null) => void;
}) {
  const w = L.W * PX_PER_MM * zoom;
  const h = L.H * PX_PER_MM * zoom;
  const seam = pxOf(seamRect(side.seam), zoom);
  const hatch = useId().replace(/:/g, '');
  return (
    <figure className='m-0 flex min-w-0 flex-col gap-2' data-side={side.key}>
      <figcaption className='text-micro uppercase tracking-label text-labelColor'>
        {side.caption}
      </figcaption>
      <div
        data-ribbon={side.key}
        className='relative bg-bgColor outline outline-1 outline-labelColor'
        style={{ width: w, height: h }}
      >
        {side.doc ? (
          <div
            aria-hidden
            className='pointer-events-none'
            style={{ width: `${L.W}mm`, transform: `scale(${zoom})`, transformOrigin: 'top left' }}
          >
            <PaperSvg doc={side.doc} />
          </div>
        ) : null}
        <svg
          aria-hidden
          data-seam={side.seam}
          className='pointer-events-none absolute top-0'
          style={{ left: seam.left, width: seam.width, height: h }}
        >
          <defs>
            <pattern
              id={hatch}
              width={6}
              height={6}
              patternUnits='userSpaceOnUse'
              patternTransform='rotate(45)'
            >
              <line x1={0} y1={0} x2={0} y2={6} stroke='var(--color-borderColor)' strokeWidth={1} />
            </pattern>
          </defs>
          <rect x={0} y={0} width='100%' height='100%' fill={`url(#${hatch})`} />
        </svg>
        {side.blank ? (
          <span
            className='pointer-events-none absolute inset-y-0 flex items-center justify-center text-micro uppercase tracking-label text-labelColor'
            style={
              side.seam === 'left' ? { left: seam.width, right: 0 } : { left: 0, right: seam.width }
            }
          >
            printed blank
          </span>
        ) : null}
        {regions.map((r) => (
          <RegionDoor key={r.key} region={r} zoom={zoom} onOpen={onOpen} ref={refFor?.(r.key)} />
        ))}
      </div>
      {side.text ? (
        <span className='sr-only' data-side-text=''>
          {side.text}
        </span>
      ) : null}
    </figure>
  );
}

/**
 * Дверь значения. В покое её не видно (лента выглядит как печать); наведение на ленту показывает
 * пунктиром все двери этой ленты, наведённая — сплошная. Правленое — точечная рамка в покое, дыра —
 * красная (блок) или синяя (предупреждение) рамка со знаком `!`, открытая — сплошная чёрная.
 */
const RegionDoor = forwardRef<
  HTMLButtonElement,
  { region: RegionView; zoom: number; onOpen: (r: RegionView) => void }
>(function RegionDoor({ region: r, zoom, onOpen }, ref) {
  const box = pxOf(r.rect, zoom);
  const tone = r.selected
    ? 'outline outline-1 outline-textColor bg-textColor/5'
    : r.hole === 'block'
      ? 'outline outline-1 outline-error'
      : r.hole === 'warn'
        ? 'outline outline-1 outline-warning'
        : r.overridden
          ? 'outline outline-1 outline-dotted outline-textColor'
          : r.disabled
            ? ''
            : 'group-hover/bench:outline group-hover/bench:outline-1 group-hover/bench:outline-dashed group-hover/bench:outline-labelColor';
  return (
    <button
      ref={ref}
      type='button'
      data-region={r.line}
      data-region-key={r.key}
      data-part={r.part}
      data-overridden={r.overridden ? '' : undefined}
      data-hole-level={r.hole ?? undefined}
      data-selected={r.selected ? '' : undefined}
      aria-label={r.label}
      aria-expanded={r.disabled ? undefined : !!r.selected}
      title={r.title}
      disabled={r.disabled}
      onClick={() => onOpen(r)}
      className={cn(
        'absolute cursor-pointer disabled:cursor-default',
        tone,
        !r.disabled &&
          !r.selected &&
          'hover:outline hover:outline-1 hover:outline-solid hover:outline-textColor',
        'focus-visible:outline focus-visible:outline-2 focus-visible:outline-solid focus-visible:outline-textColor',
      )}
      style={box}
    >
      {r.placeholder}
      {r.hole && !r.placeholder ? (
        <span
          aria-hidden
          className={cn(
            'absolute -left-px -top-px flex h-3 w-3 items-center justify-center text-nano leading-none text-bgColor',
            r.hole === 'block' ? 'bg-error' : 'bg-warning',
          )}
        >
          !
        </span>
      ) : null}
    </button>
  );
});
