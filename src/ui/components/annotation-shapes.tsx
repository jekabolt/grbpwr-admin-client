// КАК ВЫГЛЯДИТ УКАЗАНИЕ — один файл на все поверхности.
//
// Мерку между двумя точками, скобку над участком и дугу по окату рисуют в двух местах карточки:
// на снимке шага (холст выносок) и на карточном эскизе с мудбордом (аннотируемая картинка). Вторая
// копия этих семи фигур разошлась бы с первой первой же правкой — одна и та же мерка получила бы на
// двух экранах разные засечки, и заметить это было бы нечем.
//
// ФАЙЛ ЧИСТО ОТРИСОВОЧНЫЙ. Он не знает ни формы карточки, ни словаря видов (тот живёт в schema.ts
// рядом с зеркалом серверных правил), ни того, откуда взялись точки: принимает ПИКСЕЛИ кадра и
// отдаёт SVG-группу. Поэтому им одинаково пользуются и доменный холст, и примитив из ui/.

export { arcPath, type ShapePoint } from './annotation-geometry';
import { arcPath } from './annotation-geometry';
import type { ShapePoint } from './annotation-geometry';

export const CALLOUT_COLOR_HEX: Record<string, string> = {
  red: '#d02b2b',
  blue: '#2323ff',
  green: '#0f7a34',
  orange: '#d97a00',
};

export const calloutInk = (color?: string) =>
  (color && CALLOUT_COLOR_HEX[color]) || 'currentColor';

/** Толщина линий и размеры фигур в пикселях кадра — не масштабируются вместе с картинкой. */
const TICK = 7;
const BRACKET_DROP = 10;

/** Стрелка лидера. Определение общее, поэтому и id общий — оба холста кладут его в свой <defs>. */
export const ARROW_MARKER_ID = 'ann-arrow';

export function ArrowMarkerDef() {
  return (
    <marker
      id={ARROW_MARKER_ID}
      viewBox='0 0 8 8'
      refX={7}
      refY={4}
      markerWidth={5}
      markerHeight={5}
      orient='auto-start-reverse'
    >
      <path d='M0,1 L7,4 L0,7 z' fill='currentColor' />
    </marker>
  );
}

/**
 * Геометрия одного указания в ПИКСЕЛЯХ кадра.
 *
 * `label` — куда тянуть лидер (плашка на снимке шага, нумерованный маркер на эскизе). Лидер не
 * хранится нигде: он производное, и хранить его значило бы дать ему разойтись с якорем.
 *
 * `pin` здесь НЕ РИСУЕТСЯ фигурой — только точка привязки: сам кружок с номером живёт HTML-слоем
 * выше, иначе цифра тонула бы в контуре снимка.
 */
export function CalloutShape({
  kind,
  pts,
  label,
  color,
  strokeWidth = 1.5,
}: {
  kind: string;
  pts: ShapePoint[];
  label: ShapePoint;
  color?: string;
  strokeWidth?: number;
}) {
  if (pts.length === 0) return null;
  const ink = calloutInk(color);
  const w = strokeWidth;

  switch (kind) {
    case 'pin':
      return <circle cx={pts[0].x} cy={pts[0].y} r={2} fill={ink} />;
    case 'label':
      return (
        <g stroke={ink} fill='none' strokeWidth={w}>
          <circle cx={pts[0].x} cy={pts[0].y} r={3} fill={ink} />
          <line
            x1={label.x}
            y1={label.y}
            x2={pts[0].x}
            y2={pts[0].y}
            markerEnd={`url(#${ARROW_MARKER_ID})`}
          />
        </g>
      );
    case 'dim': {
      const [p, q] = pts;
      if (!q) return null;
      // Засечки перпендикулярны линии — как в чертеже: они и делают линию РАЗМЕРНОЙ, а не просто
      // отрезком между двумя точками.
      const dx = q.x - p.x;
      const dy = q.y - p.y;
      const len = Math.hypot(dx, dy) || 1;
      const nx = (-dy / len) * TICK;
      const ny = (dx / len) * TICK;
      return (
        <g stroke={ink} strokeWidth={w} fill='none'>
          <line x1={p.x} y1={p.y} x2={q.x} y2={q.y} />
          <line x1={p.x - nx} y1={p.y - ny} x2={p.x + nx} y2={p.y + ny} />
          <line x1={q.x - nx} y1={q.y - ny} x2={q.x + nx} y2={q.y + ny} />
          <line
            x1={label.x}
            y1={label.y}
            x2={(p.x + q.x) / 2}
            y2={(p.y + q.y) / 2}
            strokeDasharray='2 2'
          />
        </g>
      );
    }
    case 'bracket': {
      const [p, q] = pts;
      if (!q) return null;
      const dx = q.x - p.x;
      const dy = q.y - p.y;
      const len = Math.hypot(dx, dy) || 1;
      const nx = (-dy / len) * BRACKET_DROP;
      const ny = (dx / len) * BRACKET_DROP;
      return (
        <g stroke={ink} strokeWidth={w} fill='none'>
          <path d={`M${p.x},${p.y} L${p.x + nx},${p.y + ny} L${q.x + nx},${q.y + ny} L${q.x},${q.y}`} />
          <line
            x1={label.x}
            y1={label.y}
            x2={(p.x + q.x) / 2 + nx}
            y2={(p.y + q.y) / 2 + ny}
            strokeDasharray='2 2'
          />
        </g>
      );
    }
    case 'arc': {
      const [p, mid, q] = pts;
      if (!mid || !q) return null;
      return (
        <g stroke={ink} strokeWidth={w} fill='none'>
          <path d={arcPath(p, mid, q)} />
          {/* Концы отмечены точками: без них «где кривая начинается» читается только по изгибу, а
              на пологой дуге его нет. */}
          <circle cx={p.x} cy={p.y} r={2.5} fill={ink} />
          <circle cx={q.x} cy={q.y} r={2.5} fill={ink} />
          <line x1={label.x} y1={label.y} x2={mid.x} y2={mid.y} strokeDasharray='2 2' />
        </g>
      );
    }
    case 'multi':
      return (
        <g stroke={ink} strokeWidth={w} fill='none'>
          {pts.map((p, i) => (
            <g key={i}>
              <circle cx={p.x} cy={p.y} r={3} fill={ink} />
              <line
                x1={label.x}
                y1={label.y}
                x2={p.x}
                y2={p.y}
                markerEnd={`url(#${ARROW_MARKER_ID})`}
              />
            </g>
          ))}
        </g>
      );
    default:
      return null;
  }
}

/** Незавершённая постановка: точки уже кликнуты, фигура ещё не создана. */
export function PlacingShape({ kind, pts }: { kind: string; pts: ShapePoint[] }) {
  return (
    <g stroke='currentColor' strokeWidth={1.5} fill='none' opacity={0.7}>
      {pts.map((p, i) => (
        <circle key={i} cx={p.x} cy={p.y} r={3} fill='currentColor' />
      ))}
      {pts.length > 1 && (
        <polyline
          points={pts.map((p) => `${p.x},${p.y}`).join(' ')}
          strokeDasharray={kind === 'multi' || kind === 'arc' ? '3 3' : undefined}
        />
      )}
    </g>
  );
}
