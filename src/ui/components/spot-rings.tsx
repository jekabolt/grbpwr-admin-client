import { cn } from 'lib/utility';

/**
 * ═══ КОЛЬЦА МЕСТ НА КАРТИНКЕ (99-SPOTS §2) ═══════════════════════════════════════════════════════
 *
 * Место вопроса квиза — точка 0..1000 по кадру картинки. Кадр доски имеет пропорции самого снимка
 * (`preferNaturalAspect`, `object-cover` ничего не режет), поэтому доля кадра = доля снимка, как у
 * указаний. Рисуется ВНУТРИ `[data-annot-frame]` (слой `overlay` поверхности), размер — замер кадра.
 *
 * Кольцо — 1px чернил с 1px белым волосом снаружи (картографический двойной штрих: читается и на
 * тёмной ткани, это линия, не тень). Радиус — 9% длинной стороны кадра для `zone`, 5% для `detail`,
 * не меньше 14 и не больше 40 px. Номер — грамматика плашки указаний: цифра в белой коробке с 1px
 * чернил, у верхнего правого края кольца; у края кадра перекидывается внутрь.
 */
export type SpotRing = { label?: string; x?: number; y?: number; scale?: string };

const NUM_W = 12;
const NUM_H = 14;

export function spotRadius(scale: string | undefined, w: number, h: number) {
  const r = (scale === 'detail' ? 0.05 : 0.09) * Math.max(w, h);
  return Math.min(40, Math.max(14, r));
}

export function SpotRings({
  spots,
  size,
  hot,
  onHot,
}: {
  spots: SpotRing[];
  size: { w: number; h: number };
  /** Номер места под курсором (здесь или на слове вопроса) — его коробка встаёт в чернила. */
  hot?: number | null;
  onHot?: (n: number | null) => void;
}): JSX.Element | null {
  const { w, h } = size;
  if (!spots.length || w <= 0 || h <= 0) return null;
  const rings = spots.map((s, i) => {
    const cx = ((s.x ?? 0) / 1000) * w;
    const cy = ((s.y ?? 0) / 1000) * h;
    const r = spotRadius(s.scale, w, h);
    const d = r * Math.SQRT1_2;
    // Номер — на 45° вверх-вправо; не влезает справа — влево, сверху — вниз.
    const right = cx + d + NUM_W <= w;
    const up = cy - d - NUM_H >= 0;
    return {
      n: i + 1,
      label: (s.label ?? '').trim(),
      cx,
      cy,
      r,
      nx: right ? cx + d : cx - d,
      ny: up ? cy - d : cy + d,
      right,
      up,
    };
  });
  const enter = (n: number) => () => onHot?.(n);
  const leave = () => onHot?.(null);
  return (
    <div
      // Ключ — набор мест: следующий вопрос про ту же картинку проявляет СВОИ кольца, плитка не мигает.
      key={rings.map((r) => `${r.cx.toFixed(0)}:${r.cy.toFixed(0)}`).join('|')}
      data-spots={rings.length}
      className='pointer-events-none absolute inset-0 z-[6] overflow-hidden animate-[spotIn_150ms_ease-out] motion-reduce:animate-none'
    >
      <svg
        className='absolute inset-0 h-full w-full overflow-visible'
        viewBox={`0 0 ${w} ${h}`}
        aria-hidden
      >
        {rings.map((r) => (
          <g key={r.n} data-spot={r.n} data-cx={r.cx} data-cy={r.cy} data-r={r.r}>
            <circle
              cx={r.cx}
              cy={r.cy}
              r={r.r + 1}
              fill='none'
              stroke='var(--color-bgColor)'
              strokeWidth={1}
            />
            <circle
              cx={r.cx}
              cy={r.cy}
              r={r.r}
              fill='none'
              stroke='var(--color-textColor)'
              strokeWidth={1}
            />
            {/* Хит-путь — сам штрих кольца, толще видимого: центр снимка остаётся снимку. */}
            <circle
              cx={r.cx}
              cy={r.cy}
              r={r.r}
              fill='none'
              stroke='transparent'
              strokeWidth={10}
              pointerEvents='stroke'
              onPointerEnter={enter(r.n)}
              onPointerLeave={leave}
            >
              <title>{r.label}</title>
            </circle>
          </g>
        ))}
      </svg>
      {rings.map((r) => (
        <span
          key={r.n}
          data-spot-number={r.n}
          title={r.label}
          onPointerEnter={enter(r.n)}
          onPointerLeave={leave}
          className={cn(
            'pointer-events-auto absolute block min-w-3 border border-textColor px-[2px] py-px text-center text-micro leading-none tabular-nums',
            hot === r.n ? 'bg-textColor text-bgColor' : 'bg-bgColor text-textColor',
          )}
          style={{
            left: r.nx,
            top: r.ny,
            transform: `translate(${r.right ? '0' : '-100%'}, ${r.up ? '-100%' : '0'})`,
          }}
        >
          {r.n}
        </span>
      ))}
    </div>
  );
}
