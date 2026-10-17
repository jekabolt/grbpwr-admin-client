// MOOD-F1 — a legend row's real look: a stretch of the row's own drawing (chains/swatch.ts) shown
// 1:1 in CSS millimetres, every dash, dot, triangle and ring where the source put it. Mood draws
// 18 sizes in one colour and one width; a schematic dash sample would show half of them as the
// same plain line.
import type { LineSwatch } from 'lib/pattern-import/types';

import { DashSample } from './ui-bits';

const INK = '#000000';

/**
 * `widthMm` crops the stretch (the legend table shows the first 24 mm, the row detail all of it);
 * the scale stays 1:1. Without a swatch the row falls back to its dash sample. `minStrokeMm`
 * thickens hairline strokes (a 0.18 mm pen is under a screen pixel) without touching the rhythm.
 */
export function LineSwatchView({
  swatch,
  widthMm,
  fallbackDash,
  title,
  minStrokeMm = 0.1,
}: {
  swatch: LineSwatch | null | undefined;
  widthMm?: number;
  fallbackDash?: number[] | null;
  title?: string;
  minStrokeMm?: number;
}) {
  if (!swatch) return <DashSample dash={fallbackDash ?? null} width={48} />;
  const w = Math.min(widthMm ?? swatch.lengthMm, swatch.lengthMm);
  const h = 2 * swatch.halfMm;
  return (
    <svg
      width={`${w}mm`}
      height={`${h}mm`}
      viewBox={`0 ${-swatch.halfMm} ${w} ${h}`}
      className='inline-block align-middle'
      role='img'
      aria-label={title ?? 'the line as drawn'}
    >
      {title && <title>{title}</title>}
      {swatch.shapes.map((s, i) => {
        const pts = [];
        for (let k = 0; k + 1 < s.pts.length; k += 2) pts.push(`${s.pts[k]},${s.pts[k + 1]}`);
        const points = pts.join(' ');
        if (s.closed)
          return (
            <polygon
              key={i}
              points={points}
              fill={s.fill ? INK : 'none'}
              stroke={s.fill ? 'none' : INK}
              strokeWidth={s.fill ? undefined : Math.max(minStrokeMm, s.widthMm)}
            />
          );
        return (
          <polyline
            key={i}
            points={points}
            fill='none'
            stroke={INK}
            strokeWidth={Math.max(minStrokeMm, s.widthMm)}
            strokeDasharray={s.dash?.length ? s.dash.join(' ') : undefined}
            strokeDashoffset={s.dash?.length ? s.dashOffset : undefined}
          />
        );
      })}
    </svg>
  );
}
