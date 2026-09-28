// ЛИСТ НА ЭКРАНЕ — тот же список примитивов, что уходит в PDF, нарисованный SVG в миллиметрах.
// Никакого текста в HTML: всё, что видно, — ровно то, что скачается.
//
// Разметку примитива решает ОДНА функция `primAttrs`: её читают и React (`PaperSvg`, экран), и
// строковый сериализатор `paperSvgString` (файлы `svg/` архива составников). Так файл и экран не
// могут разойтись в атрибутах: второй раз их никто не перечисляет.
import { createElement, useId } from 'react';
import type { PaperDoc, PathCmd, Prim } from './paper';
import type { PdfSize, Tile } from './paper-pdf';

const PT = 25.4 / 72;
const FONT = "FeatureMono, 'Inter', 'Helvetica Neue', Arial, sans-serif";

type AttrValue = string | number | undefined;

/** Разметка одного примитива: тег, атрибуты в React-именах (порядок = порядок вывода), текст. */
export type PrimMarkup = {
  tag: 'text' | 'line' | 'rect' | 'polygon' | 'polyline' | 'circle' | 'path';
  attrs: Record<string, AttrValue>;
  style?: Record<string, string>;
  text?: string;
};

/** Число в `d`: 0,1 мкм — ниже любой печати, а файл не тащит 17 знаков на координату. */
const num = (n: number) => String(Math.round(n * 1e4) / 1e4);

function pathD(cmds: PathCmd[]): string {
  let d = '';
  for (const c of cmds) {
    switch (c[0]) {
      case 'M':
      case 'L':
        d += `${c[0]}${num(c[1])} ${num(c[2])}`;
        break;
      case 'C':
        d += `C${num(c[1])} ${num(c[2])} ${num(c[3])} ${num(c[4])} ${num(c[5])} ${num(c[6])}`;
        break;
      case 'Z':
        d += 'Z';
        break;
    }
  }
  return d;
}

export function primAttrs(p: Prim): PrimMarkup {
  switch (p.k) {
    case 'text':
      return {
        tag: 'text',
        attrs: {
          x: p.x,
          y: p.y,
          fontSize: p.size * PT,
          fontWeight: p.bold ? 700 : 400,
          textAnchor: p.align === 'right' ? 'end' : 'start',
          fill: '#000',
        },
        style: { whiteSpace: 'pre' },
        text: p.s,
      };
    case 'line':
      return {
        tag: 'line',
        attrs: { x1: p.x1, y1: p.y1, x2: p.x2, y2: p.y2, stroke: '#000', strokeWidth: p.w },
      };
    case 'rect':
      return {
        tag: 'rect',
        attrs: {
          x: p.x,
          y: p.y,
          width: p.w,
          height: p.h,
          fill: p.fill ? '#000' : 'none',
          stroke: p.sw > 0 ? '#000' : 'none',
          strokeWidth: p.sw,
          strokeDasharray: p.dashed ? '1 1' : undefined,
        },
      };
    case 'poly': {
      const points = p.pts.map(([x, y]) => `${x},${y}`).join(' ');
      return p.closed
        ? {
            tag: 'polygon',
            attrs: {
              points,
              fill: p.fill ? '#000' : 'none',
              stroke: p.sw > 0 ? '#000' : 'none',
              strokeWidth: p.sw,
              strokeLinejoin: p.join ?? 'miter',
            },
          }
        : {
            tag: 'polyline',
            attrs: {
              points,
              fill: 'none',
              stroke: '#000',
              strokeWidth: p.sw,
              strokeLinejoin: 'miter',
              strokeLinecap: 'butt',
            },
          };
    }
    case 'circle':
      return {
        tag: 'circle',
        attrs: {
          cx: p.cx,
          cy: p.cy,
          r: p.r,
          fill: p.fill ? '#000' : '#fff',
          stroke: p.sw > 0 ? '#000' : 'none',
          strokeWidth: p.sw,
        },
      };
    case 'path': {
      const sw = p.sw ?? 0;
      return {
        tag: 'path',
        attrs: {
          d: pathD(p.d),
          fill: p.fill ? '#000' : 'none',
          fillRule: p.fill ? p.fillRule : undefined,
          stroke: sw > 0 ? '#000' : 'none',
          strokeWidth: sw > 0 ? sw : undefined,
          strokeLinejoin: sw > 0 ? p.join ?? 'miter' : undefined,
        },
      };
    }
  }
}

function PrimView({ p }: { p: Prim }) {
  const m = primAttrs(p);
  return createElement(m.tag, { ...m.attrs, style: m.style }, m.text);
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

// ---------- строковый сериализатор (файлы архива) ----------

/** React-имя → имя атрибута SVG. Незнакомое имя — ошибка, а не молча «camelCase в файле». */
const SVG_NAME: Record<string, string> = {
  x: 'x',
  y: 'y',
  x1: 'x1',
  y1: 'y1',
  x2: 'x2',
  y2: 'y2',
  cx: 'cx',
  cy: 'cy',
  r: 'r',
  width: 'width',
  height: 'height',
  points: 'points',
  d: 'd',
  fill: 'fill',
  fillRule: 'fill-rule',
  stroke: 'stroke',
  strokeWidth: 'stroke-width',
  strokeDasharray: 'stroke-dasharray',
  strokeLinejoin: 'stroke-linejoin',
  strokeLinecap: 'stroke-linecap',
  fontSize: 'font-size',
  fontWeight: 'font-weight',
  textAnchor: 'text-anchor',
};

/** Экранирование как у React (`escapeTextForBrowser`): файл и экран совпадают побайтно. */
const esc = (v: string) =>
  v.replace(/["&'<>]/g, (c) =>
    c === '"' ? '&quot;' : c === '&' ? '&amp;' : c === "'" ? '&#x27;' : c === '<' ? '&lt;' : '&gt;',
  );

const hyphen = (k: string) => k.replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`);

function primString(p: Prim): string {
  const m = primAttrs(p);
  let s = `<${m.tag}`;
  for (const [k, v] of Object.entries(m.attrs)) {
    if (v === undefined) continue;
    const name = SVG_NAME[k];
    if (!name) throw new Error(`paperSvgString: no SVG name for attribute ${k}`);
    s += ` ${name}="${esc(String(v))}"`;
  }
  if (m.style) {
    const css = Object.entries(m.style)
      .map(([k, v]) => `${hyphen(k)}:${v}`)
      .join(';');
    s += ` style="${esc(css)}"`;
  }
  return `${s}>${m.text === undefined ? '' : esc(m.text)}</${m.tag}>`;
}

/** Лист как самостоятельный SVG-файл: те же примитивы и атрибуты, что `PaperSvg` на экране. */
export function paperSvgString(doc: PaperDoc): string {
  const head =
    `<svg xmlns="http://www.w3.org/2000/svg" width="${doc.w}mm" height="${doc.h}mm"` +
    ` viewBox="0 0 ${doc.w} ${doc.h}" font-family="${esc(FONT)}">`;
  const bg = `<rect x="0" y="0" width="${doc.w}" height="${doc.h}" fill="#fff"></rect>`;
  return head + bg + doc.prims.map(primString).join('') + '</svg>';
}
