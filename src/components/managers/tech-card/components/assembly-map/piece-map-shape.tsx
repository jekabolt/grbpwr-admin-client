// ДЕТАЛЬ НА КАРТЕ ШВОВ — контур, сшиваемые кромки 2.5px с номерами шагов снаружи у середины кромки,
// надсечки штрихами, несшиваемые кромки 1px (§4 zone 4). Активный шаг: его кромки 4px, остальные
// номера и кромки серые; цвет не несёт смысла — вес и число (D9).
//
// Номер — ДВЕРЬ: наведение светит шаг в рельсе, щелчок выбирает его (липко) и открывает в рельсе.
import type { PieceMapPicture } from 'lib/assembly-skeleton/map';
import { Fragment, memo } from 'react';

const NUM_PX = 9;
const NUM_GAP_PX = 8;
const NOTCH_PX = 6;
const GREY = '#999';

const ptsAttr = (pts: readonly [number, number][]) =>
  pts.map((p) => `${p[0].toFixed(1)},${p[1].toFixed(1)}`).join(' ');

export const PieceMapShape = memo(function PieceMapShape({
  picture,
  boxW,
  boxH,
  active,
  numberOf,
  onHoverStep,
  onPickStep,
  numbers = true,
  label,
}: {
  picture: PieceMapPicture;
  boxW: number;
  boxH: number;
  /** Индекс шага, который сейчас показан, или null. */
  active: number | null;
  /** Номер шага по индексу (позиционный: (i + 1) · 10). */
  numberOf: (index: number) => number;
  onHoverStep?: (index: number | null) => void;
  onPickStep?: (index: number) => void;
  /** Без номеров — плитка входа в STEP, где номера не нужны. */
  numbers?: boolean;
  label: string;
}) {
  // Поле под номера — в ПИКСЕЛЯХ, как у прототипа: тонкий воротник получает то же место, что полочка.
  const padPx = numbers ? 14 : 4;
  const px = Math.min(
    (boxW - 2 * padPx) / Math.max(picture.w, 1),
    (boxH - 2 * padPx) / Math.max(picture.h, 1),
  );
  const u = 1 / Math.max(px, 1e-6);
  const padX = padPx * u + (boxW * u - 2 * padPx * u - picture.w) / 2;
  const padY = padPx * u + (boxH * u - 2 * padPx * u - picture.h) / 2;
  const halo = {
    stroke: '#fff',
    strokeWidth: 3 * u,
    paintOrder: 'stroke' as const,
    strokeLinejoin: 'round' as const,
  };
  const outline = ptsAttr(picture.outline);
  // НОМЕРА НЕ ЛОЖАТСЯ ДРУГ НА ДРУГА И НЕ УХОДЯТ ЗА ПЛИТКУ. На тонкой детали (воротник, планка) две
  // соседние кромки дают два номера в одном месте: номер отходит дальше наружу, затем внутрь детали,
  // пока не встанет свободно; центр зажат в бокс плитки (svg режет всё, что за ним).
  const places: { x: number; y: number }[] = [];
  if (numbers) {
    const boxes: { x0: number; y0: number; x1: number; y1: number }[] = [];
    const vx0 = -padX;
    const vy0 = -padY;
    const vx1 = vx0 + boxW * u;
    const vy1 = vy0 + boxH * u;
    for (const e of picture.edges) {
      const chars = e.steps.reduce((n, st, k) => n + String(numberOf(st)).length + (k ? 1 : 0), 0);
      const hw = (chars * 0.6 * NUM_PX * u) / 2;
      const hh = (NUM_PX * u) / 2;
      const along = Math.abs(e.out[0]) * hw + Math.abs(e.out[1]) * hh;
      const tries = [0, NUM_PX, 2 * NUM_PX].map((k) => NUM_GAP_PX * u + k * u + along * 0.4);
      tries.push(-(NUM_GAP_PX * u + along));
      let chosen: { x: number; y: number } | null = null;
      for (const d of tries) {
        const x = Math.min(vx1 - hw, Math.max(vx0 + hw, e.mid[0] + e.out[0] * d));
        const y = Math.min(vy1 - hh, Math.max(vy0 + hh, e.mid[1] + e.out[1] * d));
        const b = { x0: x - hw, y0: y - hh, x1: x + hw, y1: y + hh };
        if (!chosen) chosen = { x, y };
        if (!boxes.some((o) => o.x0 < b.x1 && b.x0 < o.x1 && o.y0 < b.y1 && b.y0 < o.y1)) {
          chosen = { x, y };
          boxes.push(b);
          break;
        }
      }
      places.push(chosen!);
    }
  }
  return (
    <svg
      xmlns='http://www.w3.org/2000/svg'
      viewBox={`${-padX} ${-padY} ${boxW * u} ${boxH * u}`}
      width={boxW}
      height={boxH}
      className='block'
      role='img'
      aria-label={label}
    >
      <polygon points={outline} style={{ fill: '#e6e6e6', stroke: 'none' }} />
      <polygon
        points={outline}
        style={{ fill: 'none', stroke: '#fff', strokeWidth: 3 }}
        vectorEffect='non-scaling-stroke'
        strokeLinejoin='round'
      />
      <polygon
        points={outline}
        style={{ fill: 'none', stroke: '#000', strokeWidth: 1 }}
        vectorEffect='non-scaling-stroke'
        strokeLinejoin='round'
      />
      {picture.notches.map((n, i) => (
        <line
          key={i}
          x1={n.at[0]}
          y1={n.at[1]}
          x2={n.at[0] + n.inward[0] * NOTCH_PX * u}
          y2={n.at[1] + n.inward[1] * NOTCH_PX * u}
          style={{ stroke: '#000', strokeWidth: 1.5 }}
          vectorEffect='non-scaling-stroke'
        />
      ))}
      {picture.edges.map((e) => {
        const hot = active != null && e.steps.includes(active);
        const dim = active != null && !hot;
        return (
          <polyline
            key={e.id}
            points={ptsAttr(e.pts)}
            style={{ fill: 'none', stroke: dim ? GREY : '#000', strokeWidth: hot ? 4 : 2.5 }}
            vectorEffect='non-scaling-stroke'
            strokeLinecap='butt'
            strokeLinejoin='round'
            data-map-edge={e.id}
            data-map-hot={hot ? '1' : undefined}
          />
        );
      })}
      {numbers &&
        picture.edges.map((e, i) => {
          const { x, y } = places[i];
          return (
            <text
              key={`n-${e.id}`}
              x={x}
              y={y}
              textAnchor='middle'
              dominantBaseline='central'
              style={{ fontSize: NUM_PX * u, fontWeight: 700, ...halo }}
            >
              {e.steps.map((s, k) => {
                const hot = active === s;
                const dim = active != null && !hot;
                return (
                  <Fragment key={s}>
                    {k > 0 && <tspan style={{ fill: dim ? GREY : '#000' }}>·</tspan>}
                    <tspan
                      data-map-number={s}
                      style={{
                        fill: dim ? GREY : '#000',
                        cursor: onPickStep ? 'pointer' : undefined,
                      }}
                      onMouseEnter={onHoverStep ? () => onHoverStep(s) : undefined}
                      onMouseLeave={onHoverStep ? () => onHoverStep(null) : undefined}
                      onClick={onPickStep ? () => onPickStep(s) : undefined}
                    >
                      {numberOf(s)}
                    </tspan>
                  </Fragment>
                );
              })}
            </text>
          );
        })}
    </svg>
  );
});
