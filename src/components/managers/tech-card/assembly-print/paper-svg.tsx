// ЛИСТ НА ЭКРАНЕ — тот же список примитивов, что уходит в PDF, нарисованный SVG в миллиметрах.
// Никакого текста в HTML: всё, что видно, — ровно то, что скачается.
import { useId } from 'react';
import type { PaperDoc, Prim } from './paper';
import type { PdfSize, Tile } from './paper-pdf';

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

/** Лист на экране в размере листа — стенд и всё, что не знает про страницы файла. */
export function PaperSvg({ doc }: { doc: PaperDoc }) {
  return <PaperPage doc={doc} page={{ w: doc.w, h: doc.h }} scale={1} tile={SHEET_TILE} />;
}

const SHEET_TILE: Tile = { tx: 0, ty: 0, clip: null, furniture: [] };

/**
 * Одна страница файла: лист в масштабе со сдвигом плитки, обрезанный её окном, и поля плитки
 * (подпись, уголки) поверх — та же геометрия, что в `exportPaperPdf`.
 */
function PaperPage({
  doc,
  page,
  scale,
  tile,
  clipId,
}: {
  doc: PaperDoc;
  page: { w: number; h: number };
  scale: number;
  tile: Tile;
  clipId?: string;
}) {
  return (
    <svg
      xmlns='http://www.w3.org/2000/svg'
      className='ap-sheet'
      width={`${page.w}mm`}
      height={`${page.h}mm`}
      viewBox={`0 0 ${page.w} ${page.h}`}
      style={{ display: 'block', fontFamily: FONT, background: '#fff' }}
      role='img'
      aria-label='assembly order sheet'
    >
      <rect x={0} y={0} width={page.w} height={page.h} fill='#fff' />
      {tile.clip && clipId && (
        <defs>
          <clipPath id={clipId} clipPathUnits='userSpaceOnUse'>
            <rect x={tile.clip[0]} y={tile.clip[1]} width={tile.clip[2]} height={tile.clip[3]} />
          </clipPath>
        </defs>
      )}
      <g clipPath={tile.clip && clipId ? `url(#${clipId})` : undefined}>
        <g transform={`translate(${tile.tx} ${tile.ty}) scale(${scale})`}>
          {doc.prims.map((p, i) => (
            <PrimView key={i} p={p} />
          ))}
        </g>
      </g>
      {tile.furniture.map((p, i) => (
        <PrimView key={`f${i}`} p={p} />
      ))}
    </svg>
  );
}

/** Файл на экране: страницы в раскладке сетки (как склеивать), на печати — по одной на лист. */
export function PaperPages({ doc, size, gapMm }: { doc: PaperDoc; size: PdfSize; gapMm: number }) {
  const id = useId().replace(/:/g, '');
  return (
    <div
      className='ap-pages'
      style={{
        display: 'grid',
        gridTemplateColumns: `repeat(${size.cols}, ${size.w}mm)`,
        gap: `${gapMm}mm`,
      }}
    >
      {size.tiles.map((t, i) => (
        <div key={i} className='ap-page'>
          <PaperPage doc={doc} page={size} scale={size.scale} tile={t} clipId={`${id}-c${i}`} />
        </div>
      ))}
    </div>
  );
}
