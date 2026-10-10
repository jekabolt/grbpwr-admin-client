// КАРТИНКА ШАГА — входы шага, разведённые от шва; сшиваемые кромки жирные на ОБЕИХ деталях, надсечки
// штрихами внутрь, одно имя на ВХОД (D4), не на деталь. Язык рисования — `UnitShape`: серая заливка,
// белая обкладка 3px, чернильный контур 1px, штрихи non-scaling; размеры знаков — в CSS-пикселях.
//
// Координаты наружу не отдаются (01-PLAN §5): это пиктограмма, не чертёж.
import type { PairPicture } from 'lib/assembly-skeleton/map';
import { memo } from 'react';

const NAME_PX = 9;
const NOTCH_PX = 9;
const SEAM_PX = 4;

const ptsAttr = (pts: readonly [number, number][]) =>
  pts.map((p) => `${p[0].toFixed(1)},${p[1].toFixed(1)}`).join(' ');

export const PairShape = memo(function PairShape({
  picture,
  names,
  boxW,
  boxH,
  label,
}: {
  picture: PairPicture;
  /** Имя входа по его индексу (узел — одним словом). */
  names: readonly string[];
  /** Бокс рисования в CSS-пикселях — из него считается `u` (мм на пиксель). */
  boxW: number;
  boxH: number;
  label: string;
}) {
  const pad = Math.max(picture.w, picture.h, 1) * 0.08;
  const box = { x: -pad, y: -pad, w: picture.w + 2 * pad, h: picture.h + 2 * pad };
  const u = 1 / Math.min(boxW / box.w, boxH / box.h);
  const halo = {
    stroke: '#fff',
    strokeWidth: 3 * u,
    paintOrder: 'stroke' as const,
    strokeLinejoin: 'round' as const,
  };
  return (
    <svg
      xmlns='http://www.w3.org/2000/svg'
      viewBox={`${box.x} ${box.y} ${box.w} ${box.h}`}
      className='block h-full w-full'
      role='img'
      aria-label={label}
      data-map-pair=''
    >
      {picture.shapes.map((s) => {
        const points = ptsAttr(s.pts);
        return (
          <g key={s.pieceKey}>
            <polygon points={points} style={{ fill: '#dedede', stroke: 'none' }} />
            <polygon
              points={points}
              style={{ fill: 'none', stroke: '#fff', strokeWidth: 3 }}
              vectorEffect='non-scaling-stroke'
              strokeLinejoin='round'
            />
            <polygon
              points={points}
              style={{
                fill: 'none',
                stroke: '#000',
                strokeWidth: 1,
                ...(s.hung ? { strokeDasharray: '3 2' } : null),
              }}
              vectorEffect='non-scaling-stroke'
              strokeLinejoin='round'
            />
          </g>
        );
      })}
      {picture.sides.map((s) => (
        <g key={s.edgeId} data-map-side={s.edgeId}>
          <polyline
            points={ptsAttr(s.pts)}
            style={{ fill: 'none', stroke: '#000', strokeWidth: SEAM_PX }}
            vectorEffect='non-scaling-stroke'
            strokeLinecap='butt'
            strokeLinejoin='round'
          />
          {s.notches.map((n, i) => (
            <line
              key={i}
              x1={n.at[0] - n.inward[0] * u}
              y1={n.at[1] - n.inward[1] * u}
              x2={n.at[0] + n.inward[0] * NOTCH_PX * u}
              y2={n.at[1] + n.inward[1] * NOTCH_PX * u}
              style={{ stroke: '#000', strokeWidth: 2 }}
              vectorEffect='non-scaling-stroke'
            />
          ))}
        </g>
      ))}
      {picture.labels.map((l) => (
        <text
          key={l.input}
          x={l.at[0]}
          y={l.at[1]}
          textAnchor='middle'
          dominantBaseline='central'
          style={{
            fontSize: NAME_PX * u,
            fontWeight: 700,
            letterSpacing: '0.04em',
            fill: '#000',
            ...halo,
          }}
        >
          {(names[l.input] ?? '') + (l.pieces > 1 ? ` · ${l.pieces}` : '')}
        </text>
      ))}
    </svg>
  );
});
