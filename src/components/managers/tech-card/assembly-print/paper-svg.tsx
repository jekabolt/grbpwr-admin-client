// ЛИСТ НА ЭКРАНЕ — тот же список примитивов, что уходит в PDF, нарисованный SVG в миллиметрах.
// Никакого текста в HTML: всё, что видно, — ровно то, что скачается.
import type { PaperDoc, Prim } from './paper';

const PT = 25.4 / 72;
const FONT = "FeatureMono, 'Inter', 'Helvetica Neue', Arial, sans-serif";

function PrimView({ p }: { p: Prim }) {
  switch (p.k) {
    case 'text':
      return (
        <text
          x={p.x}
          y={p.y}
          fontSize={p.size * PT}
          fontWeight={p.bold ? 700 : 400}
          textAnchor={p.align === 'right' ? 'end' : 'start'}
          fill='#000'
          style={{ whiteSpace: 'pre' }}
        >
          {p.s}
        </text>
      );
    case 'line':
      return <line x1={p.x1} y1={p.y1} x2={p.x2} y2={p.y2} stroke='#000' strokeWidth={p.w} />;
    case 'rect':
      return (
        <rect
          x={p.x}
          y={p.y}
          width={p.w}
          height={p.h}
          fill={p.fill ? '#000' : 'none'}
          stroke={p.sw > 0 ? '#000' : 'none'}
          strokeWidth={p.sw}
          strokeDasharray={p.dashed ? '1 1' : undefined}
        />
      );
    case 'poly':
      return p.closed ? (
        <polygon
          points={p.pts.map(([x, y]) => `${x},${y}`).join(' ')}
          fill={p.fill ? '#000' : 'none'}
          stroke={p.sw > 0 ? '#000' : 'none'}
          strokeWidth={p.sw}
          strokeLinejoin={p.join ?? 'miter'}
        />
      ) : (
        <polyline
          points={p.pts.map(([x, y]) => `${x},${y}`).join(' ')}
          fill='none'
          stroke='#000'
          strokeWidth={p.sw}
          strokeLinejoin='miter'
          strokeLinecap='butt'
        />
      );
    case 'circle':
      return (
        <circle
          cx={p.cx}
          cy={p.cy}
          r={p.r}
          fill={p.fill ? '#000' : '#fff'}
          stroke={p.sw > 0 ? '#000' : 'none'}
          strokeWidth={p.sw}
        />
      );
  }
}

/**
 * `page` — страница файла (свой размер или формат A): физический размер в мм, масштаб и сдвиг листа.
 * Лист масштабируется целиком через viewBox; поля формата вокруг листа — белые.
 */
export function PaperSvg({
  doc,
  page,
}: {
  doc: PaperDoc;
  page?: { w: number; h: number; scale: number; ox: number; oy: number };
}) {
  const p = page ?? { w: doc.w, h: doc.h, scale: 1, ox: 0, oy: 0 };
  return (
    <svg
      xmlns='http://www.w3.org/2000/svg'
      className='ap-sheet'
      width={`${p.w}mm`}
      height={`${p.h}mm`}
      viewBox={`${-p.ox / p.scale} ${-p.oy / p.scale} ${p.w / p.scale} ${p.h / p.scale}`}
      style={{ display: 'block', fontFamily: FONT, background: '#fff' }}
      role='img'
      aria-label='assembly order sheet'
    >
      <rect x={0} y={0} width={doc.w} height={doc.h} fill='#fff' />
      {doc.prims.map((p, i) => (
        <PrimView key={i} p={p} />
      ))}
    </svg>
  );
}
