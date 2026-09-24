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

export function PaperSvg({ doc }: { doc: PaperDoc }) {
  return (
    <svg
      xmlns='http://www.w3.org/2000/svg'
      className='ap-sheet'
      width={`${doc.w}mm`}
      height={`${doc.h}mm`}
      viewBox={`0 0 ${doc.w} ${doc.h}`}
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
