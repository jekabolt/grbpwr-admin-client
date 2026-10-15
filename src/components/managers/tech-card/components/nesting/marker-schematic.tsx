// СХЕМА МАРКЕРА ДО ЗАПУСКА (раунд 6). Холст до прогона не пустой: по умолчанию он показывает, как
// сложится настил (полоса ткани, оценка длины по площади деталей, блоки размеров, стол), а при
// наведении/фокусе на поле шапки — пиктограмму этого поля, где меняемый размер выделен синим и
// подписан значением из поля. Рисуется в ПИКСЕЛЯХ контейнера (viewBox = размер блока), поэтому
// подписи всегда 12px, а линии — ровно 1px на любой ширине модалки.
import { useLayoutEffect, useRef, useState, type ReactNode } from 'react';

import type { SpreadMode } from 'lib/nesting/spread';

import type { LayMode } from './use-lay-mode';

export type SchematicView =
  | 'compose'
  | 'garments'
  | 'width'
  | 'lay'
  | 'gap'
  | 'margin'
  | 'allowance'
  | 'rotate'
  | 'pieces'
  | 'table'
  | 'endLoss'
  | 'plies'
  | 'face'
  | 'stack'
  | 'thickness'
  | 'within'
  // Ховер ячейки размера: пиктограммы деталей этого размера (sizePieces).
  | 'size';

export type SchematicBlock = { label: string; qty: number; share: number };
export type SchematicPiece = {
  id: number;
  poly: ReadonlyArray<{ x: number; y: number }>;
  bboxW: number;
  bboxH: number;
  checked: boolean;
};

export type MarkerSchematicProps = {
  view: SchematicView;
  mode: LayMode;
  widthCm: number;
  gapCm: number;
  marginCm: number;
  allowanceMm: number;
  crossGrain: boolean;
  flipAllowed: boolean;
  estLengthCm: number | null;
  blocks: SchematicBlock[];
  pieces: SchematicPiece[];
  tableCm: number | null;
  endLossCm: number;
  usableCm: number | null;
  keepOnTable: boolean;
  plies: number;
  spreadMode: SpreadMode;
  stackLimitCm: number | null;
  thicknessMm: number | null;
  stackCm: number | null;
  maxPlies: number | null;
  // Ширина стола (0413), см; null — не задана: вид сверху рисует только длину.
  tableWidthCm?: number | null;
  // Ширина рулона (раскройная + 2 кромки), см — полоса ткани на виде стола сверху.
  clothRollCm?: number | null;
  // Перекрой настила по итогам (Σ plies·q − total) — четвёртая строка ограничений.
  extra?: number;
  // Ховер ячейки размера: детали размера и его подпись.
  sizePieces?: SchematicPiece[];
  sizeTitle?: string;
  className?: string;
};

const INK = 'var(--color-textColor)';
const EDGE = 'var(--color-borderColor)';
const RULE = 'var(--color-hairline)';
const LABEL = 'var(--color-labelColor)';
const BLUE = 'var(--color-blue)';
const RED = 'var(--color-error)';
const ZEBRA = 'var(--color-bgZebra)';
const WHITE = 'var(--color-bgColor)';

const CHAR = 7.2; // ширина знака моноширинного 12px
const NS = { vectorEffect: 'non-scaling-stroke' as const };

const TITLE: Record<SchematicView, string> = {
  compose: 'layout · estimate',
  garments: 'garments per size',
  width: 'cloth width',
  lay: 'lay',
  gap: 'gap',
  margin: 'margin',
  allowance: 'seam allowance',
  rotate: 'rotate 90°',
  pieces: 'pieces',
  table: 'table',
  endLoss: 'end loss',
  plies: 'plies',
  face: 'face',
  stack: 'max stack',
  thickness: 'thickness',
  within: 'within table',
  size: 'size pieces',
};

// ЧЕТЫРЕ ОГРАНИЧЕНИЯ НАСТИЛА (Fable 07) — строкой каждое; нарушенное — красным.
function limitLines(p: MarkerSchematicProps): Array<{ text: string; bad: boolean }> {
  const n = Math.max(1, Math.round(p.plies));
  const thick = p.thicknessMm != null && p.thicknessMm > 0 ? p.thicknessMm : null;
  const over =
    thick != null && p.stackLimitCm != null ? (n * thick) / 10 > p.stackLimitCm + 1e-9 : false;
  const ftf = p.spreadMode === 'face_to_face';
  const extra = p.extra ?? 0;
  return [
    { text: 'all plies same sizes', bad: false },
    { text: 'plies × thickness ≤ stack', bad: over },
    { text: 'face to face: even plies, no one-way fabric', bad: ftf && (n % 2 === 1 || !p.flipAllowed) },
    {
      text: extra > 0 ? `uneven totals → +${extra} extra` : 'uneven totals → +N extra',
      bad: false,
    },
  ];
}

const r1 = (v: number) => Math.round(v * 10) / 10;
const num = (v: number | null | undefined, unit: string) =>
  v == null || !Number.isFinite(v) ? '—' : `${r1(v)} ${unit}`;
// Ровная однопиксельная линия: координата в середину пикселя.
const px = (v: number) => Math.round(v) + 0.5;
// Малые величины (зазор 0.5 см) на схеме преувеличены, но растут со значением: подпись — точная.
const vis = (v: number, perUnit: number, min = 8, max = 48) =>
  v <= 0 ? 0 : Math.min(max, min + v * perUnit);

// ── примитивы ───────────────────────────────────────────────────────────────────────────────

function T({
  x,
  y,
  children,
  color = INK,
  anchor = 'middle',
  small = false,
  baseline = 'middle',
}: {
  x: number;
  y: number;
  children: ReactNode;
  color?: string;
  anchor?: 'start' | 'middle' | 'end';
  small?: boolean;
  baseline?: 'middle' | 'hanging' | 'auto';
}) {
  return (
    <text
      x={x}
      y={y}
      fill={color}
      textAnchor={anchor}
      dominantBaseline={
        baseline === 'auto' ? undefined : baseline === 'hanging' ? 'hanging' : 'central'
      }
      fontSize={small ? 10 : 12}
      fontFamily='inherit'
      letterSpacing={small ? '0.04em' : undefined}
      style={{ fontVariantNumeric: 'tabular-nums', textTransform: small ? 'uppercase' : undefined }}
    >
      {children}
    </text>
  );
}

function L({
  x1,
  y1,
  x2,
  y2,
  color = INK,
  dash,
  w = 1,
}: {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  color?: string;
  dash?: string;
  w?: number;
}) {
  return (
    <line
      x1={x1}
      y1={y1}
      x2={x2}
      y2={y2}
      stroke={color}
      strokeWidth={w}
      strokeDasharray={dash}
      shapeRendering={x1 === x2 || y1 === y2 ? 'crispEdges' : undefined}
      {...NS}
    />
  );
}

/** Горизонтальный размер: линия с засечками и подпись над ней. */
function HDim({
  x1,
  x2,
  y,
  label,
  color = INK,
  below = false,
}: {
  x1: number;
  x2: number;
  y: number;
  label: string;
  color?: string;
  below?: boolean;
}) {
  const yy = px(y);
  return (
    <g>
      <L x1={x1} y1={yy} x2={x2} y2={yy} color={color} />
      <L x1={px(x1)} y1={yy - 4} x2={px(x1)} y2={yy + 4} color={color} />
      <L x1={px(x2)} y1={yy - 4} x2={px(x2)} y2={yy + 4} color={color} />
      <T x={(x1 + x2) / 2} y={below ? yy + 12 : yy - 10} color={color}>
        {label}
      </T>
    </g>
  );
}

/** Вертикальный размер: линия с засечками, подпись сбоку горизонтально. */
function VDim({
  x,
  y1,
  y2,
  label,
  color = INK,
  side = 'left',
}: {
  x: number;
  y1: number;
  y2: number;
  label: string;
  color?: string;
  side?: 'left' | 'right';
}) {
  const xx = px(x);
  return (
    <g>
      <L x1={xx} y1={y1} x2={xx} y2={y2} color={color} />
      <L x1={xx - 4} y1={px(y1)} x2={xx + 4} y2={px(y1)} color={color} />
      <L x1={xx - 4} y1={px(y2)} x2={xx + 4} y2={px(y2)} color={color} />
      <T
        x={side === 'left' ? xx - 8 : xx + 8}
        y={(y1 + y2) / 2}
        color={color}
        anchor={side === 'left' ? 'end' : 'start'}
      >
        {label}
      </T>
    </g>
  );
}

type Pt = { x: number; y: number };
const pts = (p: Pt[]) => p.map((q) => `${r1(q.x)},${r1(q.y)}`).join(' ');

/** Наружный отступ выпуклого многоугольника на d (линии рёбер сдвигаются, углы — пересечения). */
function offsetConvex(poly: Pt[], d: number): Pt[] {
  if (d <= 0) return poly;
  const n = poly.length;
  let area = 0;
  for (let i = 0; i < n; i++) {
    const a = poly[i];
    const b = poly[(i + 1) % n];
    area += a.x * b.y - b.x * a.y;
  }
  const sgn = area > 0 ? 1 : -1;
  const lines = poly.map((a, i) => {
    const b = poly[(i + 1) % n];
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const len = Math.hypot(dx, dy) || 1;
    // наружная нормаль: для обхода с положительной площадью (по часовой на экране) — (dy, -dx)
    const nx = (sgn * dy) / len;
    const ny = (-sgn * dx) / len;
    return { a: { x: a.x + nx * d, y: a.y + ny * d }, dx, dy };
  });
  return lines.map((l1, i) => {
    const l0 = lines[(i - 1 + n) % n];
    const den = l0.dx * l1.dy - l0.dy * l1.dx;
    if (Math.abs(den) < 1e-9) return l1.a;
    const t = ((l1.a.x - l0.a.x) * l1.dy - (l1.a.y - l0.a.y) * l1.dx) / den;
    return { x: l0.a.x + l0.dx * t, y: l0.a.y + l0.dy * t };
  });
}

const shift = (p: Pt[], dx: number, dy: number, k = 1) =>
  p.map((q) => ({ x: dx + q.x * k, y: dy + q.y * k }));

// Условные детали: полочка со скосом плеча (левая) и спинка (правая), обе выпуклые, грани
// напротив друг друга вертикальные — так зазор читается как ровная полоса.
const PIECE_A: Pt[] = [
  { x: 24, y: 0 },
  { x: 110, y: 0 },
  { x: 110, y: 170 },
  { x: 0, y: 170 },
  { x: 0, y: 36 },
];
const PIECE_B: Pt[] = [
  { x: 0, y: 0 },
  { x: 86, y: 0 },
  { x: 110, y: 36 },
  { x: 110, y: 170 },
  { x: 0, y: 170 },
];
// Узкая длинная деталь (рукав) для поворота.
const SLEEVE: Pt[] = [
  { x: 10, y: 0 },
  { x: 50, y: 0 },
  { x: 60, y: 120 },
  { x: 0, y: 120 },
];

/** Полоса ткани: кромки сплошным чернилом, концы рулона пунктиром (полотно продолжается). */
function Strip({ x, y, len, wid }: { x: number; y: number; len: number; wid: number }) {
  return (
    <g>
      <rect x={x} y={y} width={Math.max(0, len)} height={Math.max(0, wid)} fill={ZEBRA} />
      <L x1={x} y1={px(y)} x2={x + len} y2={px(y)} />
      <L x1={x} y1={px(y + wid)} x2={x + len} y2={px(y + wid)} />
      <L x1={px(x)} y1={y} x2={px(x)} y2={y + wid} color={EDGE} dash='3 3' />
      <L x1={px(x + len)} y1={y} x2={px(x + len)} y2={y + wid} color={EDGE} dash='3 3' />
    </g>
  );
}

// ── сцены ───────────────────────────────────────────────────────────────────────────────────

type Box = { w: number; h: number };

function ComposeScene({
  p,
  b,
  highlightBlocks,
}: {
  p: MarkerSchematicProps;
  b: Box;
  highlightBlocks: boolean;
}) {
  const table = p.mode === 'table' && p.tableCm != null;
  const L0 = p.estLengthCm;
  const padL = 88;
  // В режиме стола справа — боковой разрез стопки (слои против ножа).
  const padR = p.mode === 'table' ? 168 : 32;
  const top = table ? 76 : 56;
  const bottom = table ? 80 : 40;
  const availW = Math.max(40, b.w - padL - padR);
  const availH = Math.max(40, b.h - top - bottom);
  const spanCm = Math.max(L0 ?? 0, table ? p.tableCm ?? 0 : 0, 1);
  const s = L0 == null && !table ? 0 : Math.min(availW / spanCm, availH / Math.max(1, p.widthCm));
  const wid = s > 0 ? p.widthCm * s : Math.min(availH, 120);
  const x0 = padL;
  const y0 = top + (availH - wid) / 2;
  const mx = table ? p.endLossCm * s : 0;
  const len = L0 != null && s > 0 ? L0 * s : availW;
  const marg = Math.min(wid / 4, p.marginCm * s);
  const over = table && p.usableCm != null && L0 != null && L0 > p.usableCm;
  const blockColor = highlightBlocks ? BLUE : INK;

  let cx = x0 + mx;
  const blocks = L0 != null && s > 0 ? p.blocks : [];
  return (
    <g>
      <Strip x={x0 + mx} y={y0} len={len} wid={wid} />
      {blocks.map((bl, i) => {
        const bw = bl.share * len;
        const x = cx;
        cx += bw;
        const full = `${bl.label} ×${bl.qty}`;
        const text =
          full.length * CHAR + 10 < bw ? full : bl.label.length * CHAR + 8 < bw ? bl.label : '';
        return (
          <g key={i}>
            <rect
              x={px(x)}
              y={px(y0 + marg)}
              width={Math.max(0, Math.round(bw) - 1)}
              height={Math.max(0, Math.round(wid - 2 * marg) - 1)}
              fill={WHITE}
              stroke={blockColor}
              strokeWidth={1}
              shapeRendering='crispEdges'
              {...NS}
            />
            {text && (
              <T x={x + bw / 2} y={y0 + wid / 2} color={blockColor}>
                {text}
              </T>
            )}
          </g>
        );
      })}
      <VDim x={x0 - 16} y1={y0} y2={y0 + wid} label={`${r1(p.widthCm)} cm`} />
      {table && p.tableCm != null && (
        <g>
          <rect
            x={px(x0)}
            y={px(y0 + wid + 14)}
            width={Math.round(p.tableCm * s)}
            height={8}
            fill={RULE}
            stroke={INK}
            shapeRendering='crispEdges'
            {...NS}
          />
          {p.usableCm != null && (
            <>
              <L
                x1={px(x0 + mx + p.usableCm * s)}
                y1={y0 - 40}
                x2={px(x0 + mx + p.usableCm * s)}
                y2={y0 + wid + 22}
                color={over ? RED : INK}
                dash='4 3'
              />
              <T x={x0 + mx + p.usableCm * s} y={y0 - 50} color={over ? RED : INK} anchor='end'>
                {`table ${r1(p.usableCm)} cm`}
              </T>
            </>
          )}
          <HDim
            x1={x0}
            x2={x0 + p.tableCm * s}
            y={y0 + wid + 44}
            label={`table ${r1(p.tableCm)} cm`}
            color={LABEL}
            below
          />
        </g>
      )}
      <HDim
        x1={x0 + mx}
        x2={x0 + mx + len}
        y={y0 - 20}
        label={L0 == null ? 'length —' : `≈ ${Math.round(L0)} cm`}
        color={over ? RED : INK}
      />
      {p.mode === 'table' && <StackInset p={p} x={b.w - 132} y={top} h={availH} />}
    </g>
  );
}

// БОКОВОЙ РАЗРЕЗ СТОПКИ, маленький: слои (до 10 линий), нож пунктиром, подписи слоёв и высоты.
// Пропорция стопки к ножу честная, когда известны толщина и предел; иначе слои условные.
function StackInset({ p, x, y, h }: { p: MarkerSchematicProps; x: number; y: number; h: number }) {
  const n = Math.max(1, Math.round(p.plies));
  const shown = Math.min(n, 10);
  const w = 96;
  const baseY = y + h;
  const thick = p.thicknessMm != null && p.thicknessMm > 0 ? p.thicknessMm : null;
  const stackMm = thick != null ? n * thick : null;
  const limitMm = p.stackLimitCm != null ? p.stackLimitCm * 10 : null;
  const ref = Math.max(stackMm ?? 0, limitMm ?? 0);
  const k = ref > 0 && stackMm != null ? (h * 0.7) / ref : 0;
  const stackPx = k > 0 && stackMm != null ? Math.max(shown * 2, stackMm * k) : shown * 6;
  const step = stackPx / shown;
  const limitPx = k > 0 && limitMm != null ? limitMm * k : null;
  const overStack = limitMm != null && stackMm != null && stackMm > limitMm;
  return (
    <g>
      <T x={x} y={y - 8} anchor='start' color={LABEL} small>
        stack · side view
      </T>
      <L x1={x - 6} y1={px(baseY)} x2={x + w + 6} y2={px(baseY)} />
      {Array.from({ length: shown }, (_, i) => (
        <L
          key={i}
          x1={x}
          y1={px(baseY - step * (i + 1))}
          x2={x + w}
          y2={px(baseY - step * (i + 1))}
          color={overStack ? RED : INK}
        />
      ))}
      {limitPx != null && (
        <L
          x1={x - 6}
          y1={px(baseY - limitPx)}
          x2={x + w + 6}
          y2={px(baseY - limitPx)}
          color={LABEL}
          dash='6 4'
        />
      )}
      <T x={x} y={baseY + 14} anchor='start' color={overStack ? RED : INK}>
        {`${n} ${n === 1 ? 'ply' : 'plies'} · ${num(p.stackCm, 'cm')}`}
      </T>
      <T x={x} y={baseY + 30} anchor='start' color={LABEL}>
        {`knife ${num(p.stackLimitCm, 'cm')}`}
      </T>
    </g>
  );
}

function WidthScene({ p, b }: { p: MarkerSchematicProps; b: Box }) {
  const wid = Math.min(b.h - 120, 200);
  const len = Math.min(b.w - 200, 520);
  const x = (b.w - len) / 2 + 30;
  const y = (b.h - wid) / 2 + 4;
  return (
    <g>
      <Strip x={x} y={y} len={len} wid={wid} />
      <T x={x + len / 2} y={y - 14} color={LABEL} small>
        selvedge
      </T>
      <T x={x + len / 2} y={y + wid + 16} color={LABEL} small>
        selvedge
      </T>
      <VDim x={x - 24} y1={y} y2={y + wid} label={`${r1(p.widthCm)} cm`} color={BLUE} />
      <L
        x1={x + 40}
        y1={px(y + wid / 2)}
        x2={x + len - 40}
        y2={px(y + wid / 2)}
        color={EDGE}
        dash='6 4'
      />
      <T x={x + len - 40} y={y + wid / 2 - 12} color={LABEL} anchor='end' small>
        length
      </T>
    </g>
  );
}

function LayScene({
  p,
  b,
  hl,
}: {
  p: MarkerSchematicProps;
  b: Box;
  hl: 'gap' | 'margin' | 'allowance' | 'lay';
}) {
  const on = (k: 'gap' | 'margin' | 'allowance') => hl === 'lay' || hl === k;
  const col = (k: 'gap' | 'margin' | 'allowance') => (on(k) ? BLUE : LABEL);
  const k = Math.min(1, (b.h - 150) / 190);
  const allowPx = vis(p.allowanceMm / 10, 10, 6, 28);
  const gapPx = vis(p.gapCm, 10, 8, 48);
  const marginPx = vis(p.marginCm, 8, 8, 40);
  const pw = 110 * k;
  const total = 2 * (pw + 2 * allowPx) + gapPx;
  const x0 = (b.w - total) / 2 + allowPx;
  const ySel = Math.max(48, (b.h - (170 * k + 2 * allowPx + marginPx + 30)) / 2);
  const yPiece = ySel + marginPx + allowPx;
  const A = shift(PIECE_A, x0, yPiece, k);
  const B = shift(PIECE_B, x0 + pw + 2 * allowPx + gapPx, yPiece, k);
  const cutA = offsetConvex(A, allowPx);
  const cutB = offsetConvex(B, allowPx);
  const aRight = x0 + pw + allowPx;
  const bLeft = aRight + gapPx;
  const midY = yPiece + 100 * k;
  const stripX = Math.max(16, x0 - allowPx - 80);
  const stripR = Math.min(b.w - 16, x0 + total + 80);
  const cutColor = on('allowance') ? BLUE : INK;
  return (
    <g>
      <rect x={stripX} y={ySel} width={stripR - stripX} height={b.h - ySel - 24} fill={ZEBRA} />
      <L x1={stripX} y1={px(ySel)} x2={stripR} y2={px(ySel)} />
      <T x={stripR} y={ySel - 12} color={LABEL} anchor='end' small>
        selvedge
      </T>
      {/* зазор */}
      {gapPx > 0 && (
        <rect
          x={aRight}
          y={yPiece + 40 * k}
          width={gapPx}
          height={130 * k}
          fill={on('gap') ? BLUE : EDGE}
          fillOpacity={on('gap') ? 0.14 : 0.3}
        />
      )}
      {[cutA, cutB].map((c, i) => (
        <polygon
          key={`c${i}`}
          points={pts(c)}
          fill={WHITE}
          stroke={cutColor}
          strokeWidth={1}
          {...NS}
        />
      ))}
      {p.allowanceMm > 0 &&
        [A, B].map((c, i) => (
          <polygon
            key={`s${i}`}
            points={pts(c)}
            fill='none'
            stroke={INK}
            strokeWidth={1}
            strokeDasharray='4 3'
            {...NS}
          />
        ))}
      {/* отступ от кромки */}
      <VDim
        x={x0 - allowPx - 16}
        y1={ySel}
        y2={ySel + Math.max(marginPx, 1)}
        label={`${r1(p.marginCm)} cm`}
        color={col('margin')}
        side='left'
      />
      {marginPx > 0 && (
        <rect
          x={stripX}
          y={ySel}
          width={stripR - stripX}
          height={marginPx}
          fill={on('margin') ? BLUE : EDGE}
          fillOpacity={on('margin') ? 0.1 : 0.25}
        />
      )}
      <HDim
        x1={aRight}
        x2={bLeft}
        y={yPiece + 170 * k + allowPx + 14}
        label={`${r1(p.gapCm)} cm`}
        color={col('gap')}
        below
      />
      {/* припуск: справа у второй детали */}
      <g>
        <L
          x1={x0 + total - 2 * allowPx}
          y1={px(midY)}
          x2={x0 + total - allowPx + 10}
          y2={px(midY)}
          color={col('allowance')}
        />
        <L
          x1={px(x0 + total - 2 * allowPx)}
          y1={midY - 4}
          x2={px(x0 + total - 2 * allowPx)}
          y2={midY + 4}
          color={col('allowance')}
        />
        <L
          x1={px(x0 + total - allowPx)}
          y1={midY - 4}
          x2={px(x0 + total - allowPx)}
          y2={midY + 4}
          color={col('allowance')}
        />
        <T x={x0 + total - allowPx + 16} y={midY} anchor='start' color={col('allowance')}>
          {`${r1(p.allowanceMm)} mm`}
        </T>
      </g>
      <g transform={`translate(${Math.round(stripX + 12)}, ${Math.round(b.h - 56)})`}>
        <L x1={0} y1={0.5} x2={18} y2={0.5} dash='4 3' />
        <T x={24} y={0} anchor='start' color={LABEL} small>
          seam
        </T>
        <L x1={0} y1={16.5} x2={18} y2={16.5} color={cutColor} />
        <T x={24} y={16} anchor='start' color={LABEL} small>
          cut
        </T>
      </g>
    </g>
  );
}

function Grain({
  x,
  y,
  len,
  horizontal,
  color,
}: {
  x: number;
  y: number;
  len: number;
  horizontal: boolean;
  color: string;
}) {
  const a = 5;
  if (horizontal) {
    return (
      <g>
        <L x1={x - len / 2} y1={px(y)} x2={x + len / 2} y2={px(y)} color={color} />
        <polyline
          points={`${x - len / 2 + a},${y - a} ${x - len / 2},${y} ${x - len / 2 + a},${y + a}`}
          fill='none'
          stroke={color}
          {...NS}
        />
        <polyline
          points={`${x + len / 2 - a},${y - a} ${x + len / 2},${y} ${x + len / 2 - a},${y + a}`}
          fill='none'
          stroke={color}
          {...NS}
        />
      </g>
    );
  }
  return (
    <g>
      <L x1={px(x)} y1={y - len / 2} x2={px(x)} y2={y + len / 2} color={color} />
      <polyline
        points={`${x - a},${y - len / 2 + a} ${x},${y - len / 2} ${x + a},${y - len / 2 + a}`}
        fill='none'
        stroke={color}
        {...NS}
      />
      <polyline
        points={`${x - a},${y + len / 2 - a} ${x},${y + len / 2} ${x + a},${y + len / 2 - a}`}
        fill='none'
        stroke={color}
        {...NS}
      />
    </g>
  );
}

function RotateScene({ p, b }: { p: MarkerSchematicProps; b: Box }) {
  // Длина полотна — по горизонтали; долевая детали ложится вдоль неё (0° / 180°), 90° — поперёк.
  const cell = Math.min(160, (b.w - 80) / 3);
  const x0 = (b.w - cell * 3) / 2;
  const cy = b.h / 2 + 8;
  const sk = Math.min(1, (b.h - 140) / 120);
  const slots: Array<{ deg: 0 | 180 | 90; ok: boolean; hl: boolean }> = [
    { deg: 0, ok: true, hl: false },
    { deg: 180, ok: p.flipAllowed, hl: false },
    { deg: 90, ok: p.crossGrain, hl: true },
  ];
  return (
    <g>
      <g>
        <L x1={x0 + 8} y1={px(44)} x2={x0 + cell * 3 - 8} y2={px(44)} color={LABEL} />
        <polyline
          points={`${x0 + cell * 3 - 14},38 ${x0 + cell * 3 - 8},44 ${x0 + cell * 3 - 14},50`}
          fill='none'
          stroke={LABEL}
          {...NS}
        />
        <T x={x0 + 8} y={30} anchor='start' color={LABEL} small>
          cloth length · warp
        </T>
      </g>
      {slots.map((sl, i) => {
        const cx = x0 + cell * i + cell / 2;
        const color = !sl.ok ? EDGE : sl.hl ? BLUE : INK;
        // 0° и 180°: деталь лежит длинной стороной вдоль полотна (горизонтально).
        const horiz = sl.deg !== 90;
        const w = (horiz ? 120 : 60) * sk;
        const h = (horiz ? 60 : 120) * sk;
        const base = SLEEVE.map((q) => (horiz ? { x: q.y, y: q.x } : q));
        const flipped = sl.deg === 180 ? base.map((q) => ({ x: 120 - q.x, y: q.y })) : base;
        const shape = shift(flipped, cx - w / 2, cy - h / 2, sk);
        return (
          <g key={sl.deg}>
            <polygon
              points={pts(shape)}
              fill={WHITE}
              stroke={color}
              strokeWidth={1}
              strokeDasharray={sl.ok ? undefined : '4 3'}
              {...NS}
            />
            <Grain x={cx} y={cy} len={(horiz ? 70 : 70) * sk} horizontal={horiz} color={color} />
            {!sl.ok && (
              <>
                <L
                  x1={cx - 10}
                  y1={cy - 10}
                  x2={cx + 10}
                  y2={cy + 10}
                  color={sl.hl ? BLUE : LABEL}
                />
                <L
                  x1={cx - 10}
                  y1={cy + 10}
                  x2={cx + 10}
                  y2={cy - 10}
                  color={sl.hl ? BLUE : LABEL}
                />
              </>
            )}
            <T x={cx} y={cy + 70 * sk + 18} color={sl.hl ? BLUE : sl.ok ? INK : LABEL}>
              {sl.deg === 90 ? `90° ${p.crossGrain ? 'on' : 'off'}` : `${sl.deg}°`}
            </T>
          </g>
        );
      })}
    </g>
  );
}

function PiecesScene({
  p,
  b,
  only,
}: {
  p: MarkerSchematicProps;
  b: Box;
  only?: SchematicPiece[];
}) {
  const all = only ?? p.pieces;
  const list = all.slice(0, 32);
  const checked = all.filter((q) => q.checked).length;
  if (list.length === 0) {
    return (
      <T x={b.w / 2} y={b.h / 2} color={LABEL}>
        —
      </T>
    );
  }
  const top = 56;
  const availW = b.w - 64;
  const availH = b.h - top - 24;
  // Сетка: столько колонок, чтобы клетки были как можно крупнее.
  let best = { cols: 1, cell: 0 };
  for (let cols = 1; cols <= list.length; cols++) {
    const rows = Math.ceil(list.length / cols);
    const cell = Math.min(availW / cols, availH / rows, 120);
    if (cell > best.cell) best = { cols, cell };
  }
  const { cols, cell } = best;
  const rows = Math.ceil(list.length / cols);
  const gx = (b.w - cols * cell) / 2;
  const gy = top + (availH - rows * cell) / 2;
  return (
    <g>
      <T x={32} y={36} anchor='start' color={BLUE}>
        {`${checked} / ${all.length}`}
      </T>
      {all.length > list.length && (
        <T x={b.w - 32} y={36} anchor='end' color={LABEL}>
          {`+${all.length - list.length}`}
        </T>
      )}
      {list.map((q, i) => {
        const c = i % cols;
        const r = Math.floor(i / cols);
        const inner = cell - 16;
        const sc = inner / Math.max(q.bboxW, q.bboxH, 1e-6);
        const ox = gx + c * cell + 8 + (inner - q.bboxW * sc) / 2;
        const oy = gy + r * cell + 8 + (inner - q.bboxH * sc) / 2;
        const d = q.poly
          .map((v) => `${r1(ox + v.x * sc)},${r1(oy + (q.bboxH - v.y) * sc)}`)
          .join(' ');
        return (
          <polygon
            key={q.id}
            points={d}
            fill={q.checked ? WHITE : 'none'}
            stroke={q.checked ? BLUE : EDGE}
            strokeWidth={1}
            strokeDasharray={q.checked ? undefined : '3 3'}
            {...NS}
          />
        );
      })}
    </g>
  );
}

function TableScene({
  p,
  b,
  hl,
}: {
  p: MarkerSchematicProps;
  b: Box;
  hl: 'table' | 'endLoss' | 'within';
}) {
  const padX = 56;
  const availW = b.w - 2 * padX;
  const T0 = p.tableCm;
  const L0 = p.estLengthCm;
  const span = Math.max(T0 ?? 0, (L0 ?? 0) + p.endLossCm, 1);
  const s = availW / span;
  const x0 = padX;
  const tableY = b.h / 2 + (hl === 'within' ? 30 : 0);
  const th = 44;
  if (T0 == null) {
    return (
      <g>
        <rect
          x={px(x0)}
          y={px(tableY - th / 2)}
          width={Math.round(availW)}
          height={th}
          fill='none'
          stroke={EDGE}
          strokeDasharray='4 3'
          {...NS}
        />
        <T x={b.w / 2} y={tableY} color={hl === 'table' ? BLUE : LABEL}>
          table —
        </T>
      </g>
    );
  }
  if (p.tableWidthCm != null && p.tableWidthCm > 0 && hl !== 'within') {
    return <TableTopScaled p={p} b={b} hl={hl} T0={T0} W0={p.tableWidthCm} />;
  }
  const tw = T0 * s;
  const el = p.endLossCm * s;
  const elColor = hl === 'endLoss' ? BLUE : LABEL;
  const U = p.usableCm;
  const uEnd = x0 + el + (U ?? 0) * s;
  const markerY = tableY - th / 2 - 40;
  const mh = 28;
  return (
    <g>
      <defs>
        <pattern
          id='sch-hatch'
          width='6'
          height='6'
          patternUnits='userSpaceOnUse'
          patternTransform='rotate(45)'
        >
          <line x1='0' y1='0' x2='0' y2='6' stroke={BLUE} strokeWidth='1' />
        </pattern>
      </defs>
      {hl !== 'within' && (
        <T x={x0} y={tableY - th / 2 - 12} anchor='start' color={LABEL} small>
          table · top view
        </T>
      )}
      <rect
        x={px(x0)}
        y={px(tableY - th / 2)}
        width={Math.round(tw)}
        height={th}
        fill={ZEBRA}
        stroke={hl === 'table' ? BLUE : INK}
        shapeRendering='crispEdges'
        {...NS}
      />
      {el > 0 &&
        [x0, x0 + tw - el].map((x, i) => (
          <rect
            key={i}
            x={px(x)}
            y={px(tableY - th / 2)}
            width={Math.max(1, Math.round(el))}
            height={th}
            fill={hl === 'endLoss' ? BLUE : EDGE}
            fillOpacity={hl === 'endLoss' ? 0.18 : 0.5}
            shapeRendering='crispEdges'
          />
        ))}
      <HDim
        x1={x0}
        x2={x0 + tw}
        y={tableY + th / 2 + 20}
        label={`${r1(T0)} cm`}
        color={hl === 'table' ? BLUE : INK}
        below
      />
      {U != null && hl !== 'within' && (
        <HDim x1={x0 + el} x2={uEnd} y={tableY} label={`usable ${r1(U)} cm`} />
      )}
      {hl === 'endLoss' && (
        <>
          <T x={x0 + el / 2} y={tableY - th / 2 - 30} color={elColor}>
            {`${r1(p.endLossCm)} cm`}
          </T>
          <T x={x0 + tw - el / 2} y={tableY - th / 2 - 30} color={elColor}>
            {`${r1(p.endLossCm)} cm`}
          </T>
        </>
      )}
      {hl === 'within' && L0 != null && (
        <g>
          {/* маркер над столом: при «within» всё за концом стола — отрезано */}
          <rect
            x={px(x0 + el)}
            y={px(markerY)}
            width={Math.round(L0 * s)}
            height={mh}
            fill={WHITE}
            stroke={INK}
            shapeRendering='crispEdges'
            {...NS}
          />
          {U != null && L0 > U && p.keepOnTable && (
            <rect
              x={uEnd}
              y={markerY}
              width={Math.max(0, x0 + el + L0 * s - uEnd)}
              height={mh}
              fill='url(#sch-hatch)'
            />
          )}
          <T x={x0 + el + 8} y={markerY + mh / 2} anchor='start'>
            {`≈ ${Math.round(L0)} cm`}
          </T>
          {U != null && (
            <>
              <L
                x1={px(uEnd)}
                y1={markerY - 16}
                x2={px(uEnd)}
                y2={tableY + th / 2}
                color={BLUE}
                dash='4 3'
              />
              <T x={uEnd} y={markerY - 26} color={BLUE}>
                {`${r1(U)} cm · ${p.keepOnTable ? 'on' : 'off'}`}
              </T>
            </>
          )}
        </g>
      )}
    </g>
  );
}

// СТОЛ СВЕРХУ В МАСШТАБЕ (ширина задана): прямоугольник W×L, на нём полоса полотна (рулон),
// запас на концах — синим с обеих сторон, полезная длина U подписана; полотно шире стола — красным.
function TableTopScaled({
  p,
  b,
  hl,
  T0,
  W0,
}: {
  p: MarkerSchematicProps;
  b: Box;
  hl: 'table' | 'endLoss';
  T0: number;
  W0: number;
}) {
  const padX = 72;
  const top = 64;
  const bottom = 56;
  const roll = p.clothRollCm != null && p.clothRollCm > 0 ? p.clothRollCm : null;
  const spanW = Math.max(W0, roll ?? 0, 1);
  const s = Math.min((b.w - 2 * padX) / Math.max(T0, 1), (b.h - top - bottom) / spanW);
  const x0 = padX;
  const tw = T0 * s;
  const th = W0 * s;
  const y0 = top + (b.h - top - bottom - th) / 2;
  const el = Math.min(tw / 2, p.endLossCm * s);
  const cw = roll != null ? roll * s : 0;
  const cy = y0 + (th - cw) / 2;
  const wider = roll != null && roll > W0 + 0.05;
  const U = p.usableCm;
  return (
    <g>
      <T x={x0} y={y0 - 28} anchor='start' color={hl === 'table' ? BLUE : INK}>
        {`table ${r1(W0)} × ${r1(T0)} cm`}
      </T>
      <rect
        x={px(x0)}
        y={px(y0)}
        width={Math.round(tw)}
        height={Math.round(th)}
        fill={ZEBRA}
        stroke={hl === 'table' ? BLUE : INK}
        shapeRendering='crispEdges'
        {...NS}
      />
      {roll != null && (
        <rect
          x={px(x0)}
          y={px(cy)}
          width={Math.round(tw)}
          height={Math.max(1, Math.round(cw))}
          fill={WHITE}
          stroke={wider ? RED : EDGE}
          shapeRendering='crispEdges'
          {...NS}
        />
      )}
      {el > 0 &&
        [x0, x0 + tw - el].map((x, i) => (
          <rect
            key={i}
            x={px(x)}
            y={px(roll != null ? cy : y0)}
            width={Math.max(1, Math.round(el))}
            height={Math.max(1, Math.round(roll != null ? cw : th))}
            fill={BLUE}
            fillOpacity={0.18}
            shapeRendering='crispEdges'
          />
        ))}
      {U != null && (
        <HDim
          x1={x0 + el}
          x2={x0 + el + U * s}
          y={roll != null ? cy + cw / 2 : y0 + th / 2}
          label={`usable ${r1(U)} cm`}
        />
      )}
      {el > 0 && (
        <T x={x0 + el / 2} y={y0 + th + 14} color={hl === 'endLoss' ? BLUE : LABEL}>
          {`${r1(p.endLossCm)}`}
        </T>
      )}
      {el > 0 && (
        <T x={x0 + tw - el / 2} y={y0 + th + 14} color={hl === 'endLoss' ? BLUE : LABEL}>
          {`${r1(p.endLossCm)}`}
        </T>
      )}
      <VDim x={x0 - 16} y1={y0} y2={y0 + th} label={`${r1(W0)}`} color={LABEL} />
      {roll != null && (
        <VDim
          x={x0 + tw + 16}
          y1={cy}
          y2={cy + cw}
          label={`cloth ${r1(roll)}`}
          color={wider ? RED : INK}
          side='right'
        />
      )}
    </g>
  );
}

function StackScene({
  p,
  b,
  hl,
}: {
  p: MarkerSchematicProps;
  b: Box;
  hl: 'plies' | 'face' | 'stack' | 'thickness';
}) {
  const n = Math.max(1, Math.round(p.plies));
  const shown = Math.min(n, 12);
  const baseY = b.h - 64;
  const x0 = Math.max(96, b.w * 0.2);
  const x1 = b.w - Math.max(200, b.w * 0.24);
  const availH = baseY - 72;
  const thick = p.thicknessMm != null && p.thicknessMm > 0 ? p.thicknessMm : null;
  const stackMm = thick != null ? n * thick : null;
  const limitMm = p.stackLimitCm != null ? p.stackLimitCm * 10 : null;
  const ref = Math.max(stackMm ?? 0, limitMm ?? 0);
  const k = ref > 0 && stackMm != null ? (availH * 0.85) / ref : 0;
  const over = limitMm != null && stackMm != null && stackMm > limitMm;
  // Пропорция стопки к ножу честная только на видах stack; на plies/face/thickness слои
  // разведены так, чтобы читались метки лица и толщина одного слоя.
  const minStep = hl === 'stack' ? 3 : hl === 'thickness' ? 16 : 11;
  const stackPx = Math.min(
    availH * 0.8,
    k > 0 && stackMm != null
      ? Math.max(shown * minStep, stackMm * k)
      : shown * Math.max(minStep, 12),
  );
  const step = stackPx / shown;
  const rawLimit = k > 0 && limitMm != null ? limitMm * k : limitMm != null ? stackPx + 32 : null;
  const limitPx =
    rawLimit == null
      ? null
      : over
        ? Math.min(rawLimit, stackPx - 8)
        : Math.min(availH, Math.max(rawLimit, stackPx + 24));
  const faceColor = hl === 'face' ? BLUE : LABEL;
  const lines: Array<{ y: number; i: number }> = [];
  for (let i = 0; i < shown; i++) {
    // при n > 12 предпоследняя линия — разрыв «…», последняя — верхний слой
    const plyIndex = n > 12 && i === shown - 1 ? n - 1 : i;
    lines.push({ y: baseY - step * (i + 1), i: plyIndex });
  }
  const tri = (x: number, y: number, up: boolean) =>
    up
      ? `${x - 4},${y + 1} ${x + 4},${y + 1} ${x},${y - 5}`
      : `${x - 4},${y - 1} ${x + 4},${y - 1} ${x},${y + 5}`;
  return (
    <g>
      <T x={x0} y={baseY + 22} anchor='start' color={LABEL} small>
        side view
      </T>
      <L x1={x0 - 24} y1={px(baseY)} x2={x1 + 24} y2={px(baseY)} w={2} />
      {lines.map((ln, idx) => {
        const gap = n > 12 && idx === shown - 2;
        if (gap) {
          return (
            <T key={idx} x={(x0 + x1) / 2} y={ln.y} color={LABEL}>
              …
            </T>
          );
        }
        const up = p.spreadMode === 'face_up' ? true : ln.i % 2 === 0;
        return (
          <g key={idx}>
            <L x1={x0} y1={px(ln.y)} x2={x1} y2={px(ln.y)} color={hl === 'plies' ? BLUE : INK} />
            {(hl === 'face' || hl === 'plies') && step >= 8 && (
              <polygon points={tri(x0 - 10, ln.y + (up ? -1 : 1), up)} fill={faceColor} />
            )}
          </g>
        );
      })}
      <T x={x0 - 24} y={baseY - stackPx / 2} anchor='end' color={hl === 'plies' ? BLUE : INK}>
        {`${n} ${n === 1 ? 'ply' : 'plies'}`}
      </T>
      {hl === 'face' && (
        <T x={x0} y={baseY - stackPx - 22} anchor='start' color={BLUE}>
          {p.spreadMode === 'face_up' ? 'face up' : 'face to face'}
        </T>
      )}
      {hl !== 'thickness' && (
        <VDim
          x={x1 + 20}
          y1={baseY - stackPx}
          y2={baseY}
          label={`stack ${num(p.stackCm, 'cm')}`}
          color={over ? RED : hl === 'stack' ? INK : LABEL}
          side='right'
        />
      )}
      {limitPx != null && (
        <g>
          <L
            x1={x0 - 24}
            y1={px(baseY - limitPx)}
            x2={x1 + 24}
            y2={px(baseY - limitPx)}
            color={hl === 'stack' ? BLUE : LABEL}
            dash='6 4'
          />
          <T x={x1 + 28} y={baseY - limitPx} anchor='start' color={hl === 'stack' ? BLUE : LABEL}>
            {`knife ${num(p.stackLimitCm, 'cm')}${p.maxPlies != null ? ` · max ${p.maxPlies}` : ''}`}
          </T>
        </g>
      )}
      {hl === 'stack' && limitPx == null && (
        <T x={x1 + 28} y={baseY - stackPx - 20} anchor='start' color={BLUE}>
          knife —
        </T>
      )}
      {hl === 'thickness' && (
        <g>
          <VDim
            x={x1 + 20}
            y1={baseY - step}
            y2={baseY}
            label={thick != null ? `${thick} mm` : '—'}
            color={BLUE}
            side='right'
          />
        </g>
      )}
    </g>
  );
}

function useBoxSize<T extends HTMLElement>(): [React.RefObject<T | null>, Box] {
  const ref = useRef<T | null>(null);
  const [box, setBox] = useState<Box>({ w: 800, h: 320 });
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const read = () => {
      const r = el.getBoundingClientRect();
      if (r.width > 0 && r.height > 0) setBox({ w: Math.round(r.width), h: Math.round(r.height) });
    };
    read();
    if (typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(read);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return [ref, box];
}

export function MarkerSchematic(props: MarkerSchematicProps) {
  const { view, mode, className } = props;
  const [ref, box] = useBoxSize<HTMLDivElement>();
  // В режиме стола ячейки — итоги, а схема рисует ОДИН слой (состав маркера).
  const title =
    view === 'garments' && mode === 'table'
      ? 'marker · one ply'
      : view === 'size' && props.sizeTitle
        ? `${props.sizeTitle} pieces`
        : TITLE[view];
  let scene: ReactNode;
  switch (view) {
    case 'compose':
      scene = <ComposeScene p={props} b={box} highlightBlocks={false} />;
      break;
    case 'garments':
      scene = <ComposeScene p={props} b={box} highlightBlocks />;
      break;
    case 'width':
      scene = <WidthScene p={props} b={box} />;
      break;
    case 'lay':
    case 'gap':
    case 'margin':
    case 'allowance':
      scene = <LayScene p={props} b={box} hl={view} />;
      break;
    case 'rotate':
      scene = <RotateScene p={props} b={box} />;
      break;
    case 'pieces':
      scene = <PiecesScene p={props} b={box} />;
      break;
    case 'size':
      scene = <PiecesScene p={props} b={box} only={props.sizePieces ?? []} />;
      break;
    case 'table':
    case 'endLoss':
    case 'within':
      scene = <TableScene p={props} b={box} hl={view} />;
      break;
    default:
      scene = <StackScene p={props} b={box} hl={view} />;
  }
  return (
    <div
      className={`flex flex-col border border-borderColor bg-bgColor ${className ?? ''}`}
      aria-label={`schematic: ${title}`}
      role='img'
    >
      <div ref={ref} className='relative min-h-0 flex-1'>
        <svg
          className='absolute inset-0 block h-full w-full'
          viewBox={`0 0 ${box.w} ${box.h}`}
          preserveAspectRatio='xMidYMid meet'
        >
          <T x={16} y={18} anchor='start' color={view === 'compose' ? LABEL : BLUE} small>
            {title}
          </T>
          {scene}
        </svg>
      </div>
      {mode === 'table' && (
        <ul className='border-t border-hairline px-4 py-1.5 text-micro uppercase tracking-label'>
          {limitLines(props).map((l) => (
            <li key={l.text} className={l.bad ? 'text-error' : 'text-labelColor'}>
              {l.text}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
