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

/** Bold 9px caps run ~0.62 em per character. */
const CHAR_PX = NAME_PX * 0.62;

/** A name never runs longer than a piece tile's caption holds (PieceTile cuts at the tile). */
const LABEL_MAX_CHARS = 16;

/**
 * An input's name fitted to the width of its own group and to LABEL_MAX_CHARS: cut with «…» like
 * a piece tile's caption, the count kept, the full name in the <title>. A long name used to run
 * across the next input's shapes and over its name.
 */
export function fitLabel(name: string, count: string, groupPx: number): string {
  const fits = Math.min(
    LABEL_MAX_CHARS + count.length,
    Math.max(6, Math.floor(Math.max(groupPx, 48) / CHAR_PX)),
  );
  if ((name + count).length <= fits) return name + count;
  const room = Math.max(3, fits - count.length - 1);
  return `${name.slice(0, room).trimEnd()}…${count}`;
}

/**
 * Label anchors moved apart: two names whose boxes would overlap are stacked, the later one a line
 * lower (or higher, if that runs off the picture), so neither is printed over the other.
 */
function placeLabels(
  items: { at: [number, number]; chars: number }[],
  u: number,
  h: number,
): [number, number][] {
  const lineH = NAME_PX * 1.6 * u;
  const placed: { x: number; y: number; w: number }[] = [];
  return items.map(({ at, chars }) => {
    const w = chars * CHAR_PX * u;
    let y = at[1];
    for (let guard = 0; guard < 8; guard++) {
      const hit = placed.find(
        (p) => Math.abs(p.y - y) < lineH && Math.abs(p.x - at[0]) < (p.w + w) / 2,
      );
      if (!hit) break;
      y = hit.y + lineH <= h ? hit.y + lineH : hit.y - lineH;
    }
    placed.push({ x: at[0], y, w });
    return [at[0], y];
  });
}

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
      {(() => {
        const texts = picture.labels.map((l) => {
          const full = names[l.input] ?? '';
          const count = l.pieces > 1 ? ` · ${l.pieces}` : '';
          return { full: full + count, text: fitLabel(full, count, l.w / u) };
        });
        const at = placeLabels(
          picture.labels.map((l, i) => ({ at: l.at, chars: texts[i].text.length })),
          u,
          picture.h,
        );
        return picture.labels.map((l, i) => (
          <text
            key={l.input}
            x={at[i][0]}
            y={at[i][1]}
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
            {texts[i].text !== texts[i].full && <title>{texts[i].full}</title>}
            {texts[i].text}
          </text>
        ));
      })()}
    </svg>
  );
});
