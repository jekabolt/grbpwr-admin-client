import type { CSSProperties, JSX, ReactNode } from 'react';

import { Text } from 'ui';

const INK = 'var(--color-textColor)';
const LABEL = 'var(--color-labelColor)';
const ERROR = 'var(--color-error)';

const TABLE_LENGTH = 300;
const TABLE_Y = 150;
const GROUND_Y = 204;
const MAX_PICTURE_HEIGHT = 240;
const MIN_STACK_HEIGHT = 12;
const MIN_STACK_LINES = 3;

type Tone = 'ink' | 'label' | 'error';
type Anchor = 'left' | 'centre' | 'right';
type ViewBox = readonly [x: number, y: number, width: number, height: number];

type LabelOverlay = {
  key: string;
  x: number;
  y: number;
  content: ReactNode;
  tone?: Tone;
  anchor?: Anchor;
  backed?: boolean;
};

const toneColour: Record<Tone, string> = {
  ink: INK,
  label: LABEL,
  error: ERROR,
};

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function positive(value: number, fallback: number) {
  return Number.isFinite(value) && value > 0 ? value : fallback;
}

function nonNegative(value: number) {
  return Number.isFinite(value) ? Math.max(0, value) : 0;
}

function formatNumber(value: number) {
  if (!Number.isFinite(value)) return '0';
  return (Math.round(value * 10) / 10).toString();
}

function withMargin(
  bounds: { left: number; top: number; right: number; bottom: number },
  margin = 12,
): ViewBox {
  return [
    bounds.left - margin,
    bounds.top - margin,
    Math.max(1, bounds.right - bounds.left + margin * 2),
    Math.max(1, bounds.bottom - bounds.top + margin * 2),
  ];
}

function pointInViewBox(value: number, start: number, length: number) {
  return ((value - start) / length) * 100;
}

function SketchFrame({
  viewBox,
  overlays = [],
  children,
}: {
  viewBox: ViewBox;
  overlays?: LabelOverlay[];
  children: ReactNode;
}) {
  const [, , width, height] = viewBox;
  const renderedWidth = Math.min(720, Math.round((MAX_PICTURE_HEIGHT * width) / height));
  const frameStyle: CSSProperties = {
    aspectRatio: `${width} / ${height}`,
    width: `min(100%, ${renderedWidth}px)`,
  };

  return (
    <div className='relative mx-auto max-w-full' data-marker-picture='' style={frameStyle}>
      <svg
        aria-hidden='true'
        className='absolute inset-0 size-full overflow-visible'
        preserveAspectRatio='xMidYMid meet'
        viewBox={viewBox.join(' ')}
      >
        {children}
      </svg>
      {overlays.map((overlay) => {
        const anchorClass =
          overlay.anchor === 'left'
            ? ''
            : overlay.anchor === 'right'
              ? '-translate-x-full'
              : '-translate-x-1/2';
        const overlayStyle: CSSProperties = {
          color: toneColour[overlay.tone ?? 'ink'],
          left: `${pointInViewBox(overlay.x, viewBox[0], viewBox[2])}%`,
          top: `${pointInViewBox(overlay.y, viewBox[1], viewBox[3])}%`,
        };

        return (
          <Text
            key={overlay.key}
            component='span'
            variant='uppercase'
            className={`pointer-events-none absolute -translate-y-1/2 whitespace-nowrap ${anchorClass} ${
              overlay.backed ? 'bg-bgColor px-1' : ''
            }`}
            style={overlayStyle}
          >
            {overlay.content}
          </Text>
        );
      })}
    </div>
  );
}

function TableSketch({
  x,
  y,
  length,
  groundY,
}: {
  x: number;
  y: number;
  length: number;
  groundY: number;
}) {
  const leftLeg = x + Math.min(12, length / 4);
  const rightLeg = x + length - Math.min(12, length / 4);

  return (
    <g fill='none' stroke={INK} strokeWidth={1} vectorEffect='non-scaling-stroke'>
      <line x1={x - 6} y1={y} x2={x + length + 6} y2={y} vectorEffect='non-scaling-stroke' />
      <line
        x1={x - 6}
        y1={y + 4}
        x2={x + length + 6}
        y2={y + 4}
        vectorEffect='non-scaling-stroke'
      />
      <line x1={leftLeg} y1={y + 4} x2={leftLeg} y2={groundY} vectorEffect='non-scaling-stroke' />
      <line x1={rightLeg} y1={y + 4} x2={rightLeg} y2={groundY} vectorEffect='non-scaling-stroke' />
      <line
        x1={x - 20}
        y1={groundY}
        x2={x + length + 20}
        y2={groundY}
        stroke={LABEL}
        vectorEffect='non-scaling-stroke'
      />
    </g>
  );
}

function SlashTick({ x, y, tone = 'ink' }: { x: number; y: number; tone?: Tone }) {
  return (
    <line
      x1={x - 4}
      y1={y + 4}
      x2={x + 4}
      y2={y - 4}
      stroke={toneColour[tone]}
      strokeWidth={1}
      vectorEffect='non-scaling-stroke'
    />
  );
}

function HorizontalDimension({
  x1,
  x2,
  y,
  extensionY,
  tone = 'ink',
}: {
  x1: number;
  x2: number;
  y: number;
  extensionY?: number;
  tone?: Tone;
}) {
  const colour = toneColour[tone];

  return (
    <g fill='none' stroke={colour} strokeWidth={1} vectorEffect='non-scaling-stroke'>
      {extensionY != null && (
        <>
          <line
            x1={x1}
            y1={y + 5}
            x2={x1}
            y2={extensionY}
            strokeDasharray='3 3'
            vectorEffect='non-scaling-stroke'
          />
          <line
            x1={x2}
            y1={y + 5}
            x2={x2}
            y2={extensionY}
            strokeDasharray='3 3'
            vectorEffect='non-scaling-stroke'
          />
        </>
      )}
      <line x1={x1} y1={y} x2={x2} y2={y} vectorEffect='non-scaling-stroke' />
      <SlashTick x={x1} y={y} tone={tone} />
      <SlashTick x={x2} y={y} tone={tone} />
    </g>
  );
}

function VerticalDimension({
  x,
  y1,
  y2,
  extensionX,
  tone = 'ink',
}: {
  x: number;
  y1: number;
  y2: number;
  extensionX?: number;
  tone?: Tone;
}) {
  const colour = toneColour[tone];

  return (
    <g fill='none' stroke={colour} strokeWidth={1} vectorEffect='non-scaling-stroke'>
      {extensionX != null && (
        <>
          <line
            x1={extensionX}
            y1={y1}
            x2={x - 5}
            y2={y1}
            strokeDasharray='3 3'
            vectorEffect='non-scaling-stroke'
          />
          <line
            x1={extensionX}
            y1={y2}
            x2={x - 5}
            y2={y2}
            strokeDasharray='3 3'
            vectorEffect='non-scaling-stroke'
          />
        </>
      )}
      <line x1={x} y1={y1} x2={x} y2={y2} vectorEffect='non-scaling-stroke' />
      <SlashTick x={x} y={y1} tone={tone} />
      <SlashTick x={x} y={y2} tone={tone} />
    </g>
  );
}

function StackLines({
  x,
  y,
  length,
  count,
  height,
  faceToFace = false,
  errorFrom,
}: {
  x: number;
  y: number;
  length: number;
  count: number;
  height: number;
  faceToFace?: boolean;
  errorFrom?: number;
}) {
  const shown = clamp(Math.round(count), 1, 12);
  const gap = shown === 1 ? 0 : height / (shown - 1);
  const end = x + length;
  const safeEnd = errorFrom == null ? end : clamp(errorFrom, x, end);

  return (
    <g fill='none' strokeWidth={1} vectorEffect='non-scaling-stroke'>
      {Array.from({ length: shown }, (_, index) => {
        const lineY = y - 1 - index * gap;
        const colour = faceToFace && index % 2 === 1 ? LABEL : INK;
        return (
          <g key={index}>
            {safeEnd > x && (
              <line
                x1={x}
                y1={lineY}
                x2={safeEnd}
                y2={lineY}
                stroke={colour}
                vectorEffect='non-scaling-stroke'
              />
            )}
            {errorFrom != null && end > safeEnd && (
              <line
                x1={safeEnd}
                y1={lineY}
                x2={end}
                y2={lineY}
                stroke={ERROR}
                vectorEffect='non-scaling-stroke'
              />
            )}
          </g>
        );
      })}
    </g>
  );
}

function stackHeight(stackCm: number, plies: number) {
  const byThickness = nonNegative(stackCm) * 10;
  const drawnLines = clamp(Math.round(nonNegative(plies)), MIN_STACK_LINES, 12);
  const byLines = (drawnLines - 1) * 3.2;
  return clamp(Math.max(byThickness, byLines, MIN_STACK_HEIGHT), MIN_STACK_HEIGHT, 42);
}

function scaledLength(value: number, tableLength: number, pixels = TABLE_LENGTH) {
  return (nonNegative(value) / positive(tableLength, 1)) * pixels;
}

export function SpreadChoicePicture(p: { kind: 'single' | 'table' }): JSX.Element {
  const x = 30;
  const y = 110;
  const length = 210;
  const groundY = 162;
  const count = p.kind === 'single' ? 1 : 8;
  const height = p.kind === 'single' ? 2 : 24;
  const viewBox = withMargin({
    left: x - 20,
    top: y - 24 - 2,
    right: x + length + 20,
    bottom: groundY,
  });

  return (
    <SketchFrame viewBox={viewBox}>
      <TableSketch x={x} y={y} length={length} groundY={groundY} />
      <StackLines x={x + 8} y={y} length={length - 16} count={count} height={height} />
    </SketchFrame>
  );
}

export function TablePicture(p: {
  lengthCm: number;
  widthCm: number | null;
  maxStackCm?: number | null;
}): JSX.Element {
  const x = 30;
  const length = 280;
  const dimensionY = 94;
  const width = p.widthCm != null && p.widthCm > 0 ? p.widthCm : null;
  const insetLength = width == null ? 0 : clamp(scaledLength(width, p.lengthCm, length), 64, 100);
  const insetX = x + length + 50;
  const right = width == null ? x + length + 20 : insetX + insetLength + 20;
  const viewBox = withMargin({ left: x - 20, top: dimensionY - 12, right, bottom: GROUND_Y });
  const overlays: LabelOverlay[] = [
    {
      key: 'length',
      x: x + length / 2,
      y: dimensionY,
      content: `length ${formatNumber(p.lengthCm)} cm`,
      backed: true,
    },
  ];

  if (width != null) {
    overlays.push({
      key: 'width',
      x: insetX + insetLength / 2,
      y: dimensionY,
      content: `width ${formatNumber(width)} cm`,
      backed: true,
    });
  }

  return (
    <SketchFrame viewBox={viewBox} overlays={overlays}>
      <TableSketch x={x} y={TABLE_Y} length={length} groundY={GROUND_Y} />
      <HorizontalDimension x1={x - 6} x2={x + length + 6} y={dimensionY} extensionY={TABLE_Y - 6} />
      {width != null && (
        <>
          <TableSketch x={insetX} y={TABLE_Y} length={insetLength} groundY={GROUND_Y} />
          <HorizontalDimension
            x1={insetX - 6}
            x2={insetX + insetLength + 6}
            y={dimensionY}
            extensionY={TABLE_Y - 6}
          />
        </>
      )}
    </SketchFrame>
  );
}

export function KnifePicture(p: { maxStackCm: number; stackCm?: number }): JSX.Element {
  const x = 30;
  const stackX = x + 20;
  const stackLength = 210;
  const limitHeight = 70;
  const limitY = TABLE_Y - limitHeight;
  const shownStackHeight = clamp(
    p.stackCm == null ? 24 : (nonNegative(p.stackCm) / positive(p.maxStackCm, 30)) * limitHeight,
    10,
    limitHeight - 10,
  );
  const knifeX = stackX + stackLength + 16;
  const dimensionX = x + TABLE_LENGTH + 24;
  const labelX = dimensionX + 12;
  const viewBox = withMargin({
    left: x - 20,
    top: limitY - 20,
    right: labelX + 112,
    bottom: GROUND_Y,
  });

  return (
    <SketchFrame
      viewBox={viewBox}
      overlays={[
        {
          key: 'maximum',
          x: labelX,
          y: (limitY + TABLE_Y) / 2,
          content: `max ${formatNumber(p.maxStackCm)} cm`,
          anchor: 'left',
        },
      ]}
    >
      <TableSketch x={x} y={TABLE_Y} length={TABLE_LENGTH} groundY={GROUND_Y} />
      <StackLines x={stackX} y={TABLE_Y} length={stackLength} count={8} height={shownStackHeight} />
      <g fill='none' stroke={INK} strokeWidth={1} vectorEffect='non-scaling-stroke'>
        <rect
          x={knifeX - 7}
          y={limitY - 18}
          width={14}
          height={18}
          vectorEffect='non-scaling-stroke'
        />
        <line
          x1={knifeX - 12}
          y1={limitY - 18}
          x2={knifeX + 12}
          y2={limitY - 18}
          vectorEffect='non-scaling-stroke'
        />
        <line
          x1={knifeX - 1}
          y1={limitY}
          x2={knifeX - 1}
          y2={TABLE_Y}
          vectorEffect='non-scaling-stroke'
        />
        <line
          x1={knifeX + 1}
          y1={limitY}
          x2={knifeX + 1}
          y2={TABLE_Y}
          vectorEffect='non-scaling-stroke'
        />
      </g>
      <VerticalDimension x={dimensionX} y1={limitY} y2={TABLE_Y} extensionX={knifeX + 10} />
    </SketchFrame>
  );
}

export function LayersPicture(p: {
  tableLengthCm: number;
  layCm: number;
  plies: number;
  plySizes: string[];
  stackCm: number;
  stackOk: boolean;
  faceToFace: boolean;
}): JSX.Element {
  const x = 30;
  const stackX = x + 20;
  const length = clamp(scaledLength(p.layCm, p.tableLengthCm), 28, TABLE_LENGTH * 1.3);
  const height = stackHeight(p.stackCm, p.plies);
  const drawnPlies = Math.max(MIN_STACK_LINES, Math.round(nonNegative(p.plies)));
  const stackTop = TABLE_Y - 1 - height;
  const dimensionX = stackX + length + 10;
  const dimensionTone: Tone = p.stackOk ? 'ink' : 'error';
  const sizes = [...new Set(p.plySizes.map((size) => size.trim()).filter(Boolean))].join(' · ');
  const sizeY = stackTop - 20;
  const labelX = dimensionX + 14;
  const thicknessLabel =
    Number.isFinite(p.stackCm) && p.stackCm > 0 ? ` · ${formatNumber(p.stackCm)} cm` : '';
  const right = Math.max(x + TABLE_LENGTH + 20, labelX + 155);
  const viewBox = withMargin({ left: x - 20, top: sizeY - 10, right, bottom: GROUND_Y });
  const overlays: LabelOverlay[] = [
    {
      key: 'layers',
      x: labelX,
      y: (stackTop + TABLE_Y - 1) / 2,
      content: `${formatNumber(p.plies)} ${p.plies === 1 ? 'layer' : 'layers'}${thicknessLabel}`,
      tone: dimensionTone,
      anchor: 'left',
      backed: true,
    },
  ];

  if (sizes) {
    overlays.push({
      key: 'sizes',
      x: stackX + length / 2,
      y: sizeY,
      content: sizes,
      tone: 'label',
      backed: true,
    });
  }

  return (
    <SketchFrame viewBox={viewBox} overlays={overlays}>
      <TableSketch x={x} y={TABLE_Y} length={TABLE_LENGTH} groundY={GROUND_Y} />
      <StackLines
        x={stackX}
        y={TABLE_Y}
        length={length}
        count={drawnPlies}
        height={height}
        faceToFace={p.faceToFace}
      />
      <VerticalDimension
        x={dimensionX}
        y1={stackTop}
        y2={TABLE_Y - 1}
        extensionX={stackX + length}
        tone={dimensionTone}
      />
    </SketchFrame>
  );
}

export function EndsPicture(p: {
  endLossCm: number;
  layCm: number;
  tableLengthCm: number;
}): JSX.Element {
  const x = 30;
  const stackX = x + 20;
  const length = clamp(scaledLength(p.layCm, p.tableLengthCm), 36, TABLE_LENGTH * 1.3);
  const height = 24;
  const stackTop = TABLE_Y - 1 - height;
  const rawEndWidth = scaledLength(p.endLossCm, p.tableLengthCm);
  const endWidth = p.endLossCm > 0 ? clamp(rawEndWidth * 4, 8, length / 4) : 0;
  const dimensionY = stackTop - 14;
  const labelX = stackX + Math.max(endWidth, 4) + 10;
  const viewBox = withMargin({
    left: x - 20,
    top: dimensionY - 10,
    right: Math.max(x + TABLE_LENGTH + 20, labelX + 120),
    bottom: GROUND_Y,
  });

  return (
    <SketchFrame
      viewBox={viewBox}
      overlays={[
        {
          key: 'end-loss',
          x: labelX,
          y: dimensionY,
          content: `${formatNumber(p.endLossCm)} cm each end`,
          tone: 'error',
          anchor: 'left',
          backed: true,
        },
      ]}
    >
      <TableSketch x={x} y={TABLE_Y} length={TABLE_LENGTH} groundY={GROUND_Y} />
      <StackLines x={stackX} y={TABLE_Y} length={length} count={8} height={height} />
      {endWidth > 0 && (
        <>
          <rect
            x={stackX}
            y={stackTop}
            width={endWidth}
            height={height + 1}
            fill={ERROR}
            fillOpacity={0.85}
          />
          <rect
            x={stackX + length - endWidth}
            y={stackTop}
            width={endWidth}
            height={height + 1}
            fill={ERROR}
            fillOpacity={0.85}
          />
          <HorizontalDimension
            x1={stackX}
            x2={stackX + endWidth}
            y={dimensionY}
            extensionY={stackTop - 3}
            tone='error'
          />
        </>
      )}
    </SketchFrame>
  );
}
