import type { ChangeEvent, CSSProperties, JSX, ReactNode } from 'react';

import { IsoPicture, type OverlayTone, type PictureData, type Point } from './iso';
import { Input } from 'ui';

export type FabricColours = { face: string; back: string };
export type PicInput = {
  value: number;
  onChange: (v: number) => void;
  unit: string;
  label: string;
};

const INK = 'var(--color-textColor)';
const BLUE = 'var(--color-blue)';
const RED = 'var(--color-error)';
const TABLE_TOP = 'var(--color-bgSecondary)';
const TABLE_SIDE = 'color-mix(in srgb, var(--color-borderColor) 72%, var(--color-bgColor))';
const TABLE_END = 'var(--color-borderColor)';
const TABLE_LEG = 'var(--color-labelColor)';
const STEEL = 'color-mix(in srgb, var(--color-labelColor) 45%, var(--color-bgColor))';
const STEEL_DARK = 'color-mix(in srgb, var(--color-labelColor) 75%, var(--color-bgColor))';
const PIECE = 'rgba(255,255,255,0.9)';
const NEUTRAL_FACE = 'var(--color-labelColor)';
const NEUTRAL_BACK = 'color-mix(in srgb, var(--color-labelColor) 50%, var(--color-bgColor))';
const WASTE = 'color-mix(in srgb, var(--color-error) 28%, transparent)';

const overlayClass: Record<OverlayTone, string> = {
  plain: '',
  dimension: 'bg-bgColor px-1 py-px font-bold text-blue',
  danger: 'bg-bgColor px-1 py-px font-bold text-error',
  size: 'bg-white/90 px-1 text-micro font-bold text-black',
  large: 'text-statBig',
  muted: 'text-labelColor',
};

function PictureFrame({ data }: { data: PictureData }) {
  const [, , viewWidth, viewHeight] = data.viewBox;
  const style: CSSProperties = {
    aspectRatio: `${viewWidth} / ${viewHeight}`,
    width: `min(100%, ${data.widthPx}px)`,
  };

  return (
    <div className='relative mx-auto max-w-full' data-marker-picture='' style={style}>
      <svg
        aria-hidden='true'
        className='absolute inset-0 size-full overflow-visible'
        preserveAspectRatio='xMidYMid meet'
        viewBox={data.viewBox.join(' ')}
      >
        {data.shapes.map((shape) =>
          shape.kind === 'polygon' ? (
            <polygon
              key={shape.key}
              fill={shape.fill}
              points={shape.points}
              stroke={shape.stroke}
              strokeLinejoin='round'
              strokeWidth={shape.strokeWidth}
              vectorEffect='non-scaling-stroke'
            />
          ) : (
            <line
              key={shape.key}
              x1={shape.x1}
              x2={shape.x2}
              y1={shape.y1}
              y2={shape.y2}
              stroke={shape.stroke}
              strokeDasharray={shape.dash}
              strokeLinecap='round'
              strokeWidth={shape.strokeWidth}
              vectorEffect='non-scaling-stroke'
            />
          ),
        )}
      </svg>
      {data.overlays.map((overlay) => (
        <div
          key={overlay.key}
          className={`pointer-events-none absolute -translate-x-1/2 -translate-y-1/2 whitespace-nowrap text-textBaseSize ${overlayClass[overlay.tone]}`}
          style={{ left: `${overlay.x}%`, top: `${overlay.y}%` }}
        >
          {overlay.content}
        </div>
      ))}
    </div>
  );
}

function NumberInput({ input }: { input: PicInput }) {
  const change = (event: ChangeEvent<HTMLInputElement>) => {
    const next = Number.parseFloat(event.currentTarget.value.replace(',', '.'));
    if (Number.isFinite(next)) input.onChange(next);
  };

  return (
    <span className='pointer-events-auto inline-flex items-baseline gap-1 border border-blue bg-bgColor px-1.5 py-0.5 text-blue focus-within:outline focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-blue'>
      <Input
        aria-label={input.label}
        className='min-h-0 w-[4.2ch] border-0 bg-transparent p-0 text-right text-lg font-bold text-blue tabular-nums focus:border-0'
        inputMode='decimal'
        onChange={change}
        type='text'
        value={Number.isFinite(input.value) ? input.value : ''}
      />
      {input.unit}
    </span>
  );
}

const pointValue = (point: Point, index: number) => point[index] ?? 0;

function addPoints(a: Point, b: Point): [number, number, number] {
  return [
    pointValue(a, 0) + pointValue(b, 0),
    pointValue(a, 1) + pointValue(b, 1),
    pointValue(a, 2) + pointValue(b, 2),
  ];
}

function midpoint(a: Point, b: Point): [number, number, number] {
  return [
    (pointValue(a, 0) + pointValue(b, 0)) / 2,
    (pointValue(a, 1) + pointValue(b, 1)) / 2,
    (pointValue(a, 2) + pointValue(b, 2)) / 2,
  ];
}

function scaledPoint(point: Point, scale: number): [number, number, number] {
  return [pointValue(point, 0) * scale, pointValue(point, 1) * scale, pointValue(point, 2) * scale];
}

function finitePositive(value: number, fallback = 1) {
  return Number.isFinite(value) && value > 0 ? value : fallback;
}

function formatOne(value: number) {
  return (Math.round(value * 10) / 10).toString();
}

function formatMetres(cm: number) {
  return (Math.round(cm) / 100).toFixed(2);
}

function drawTable(picture: IsoPicture, length: number, width: number, legHeight = 75) {
  const thickness = 4;
  const inset = Math.min(6, length / 4, width / 4);
  const legs: ReadonlyArray<readonly [number, number]> = [
    [inset, inset],
    [length - inset, inset],
    [length - inset, width - inset],
    [inset, width - inset],
  ];

  for (const [x, y] of legs) {
    picture.line([x, y, -thickness], [x, y, -legHeight], TABLE_LEG, 3);
  }
  picture.polygon(
    [
      [0, 0, 0],
      [length, 0, 0],
      [length, width, 0],
      [0, width, 0],
    ],
    TABLE_TOP,
  );
  picture.polygon(
    [
      [0, width, 0],
      [length, width, 0],
      [length, width, -thickness],
      [0, width, -thickness],
    ],
    TABLE_SIDE,
  );
  picture.polygon(
    [
      [length, 0, 0],
      [length, width, 0],
      [length, width, -thickness],
      [length, 0, -thickness],
    ],
    TABLE_END,
  );
}

function drawSheets(
  picture: IsoPicture,
  p: {
    x: number;
    length: number;
    y: number;
    width: number;
    count: number;
    height: number;
    colour: (index: number) => string;
  },
) {
  const count = Math.max(1, Math.min(12, Math.round(p.count)));
  const height = Math.min(p.height, 16 / count);

  for (let index = 0; index < count; index += 1) {
    const z = index * height;
    const colour = p.colour(index);
    picture.polygon(
      [
        [p.x, p.y + p.width, z],
        [p.x + p.length, p.y + p.width, z],
        [p.x + p.length, p.y + p.width, z + height],
        [p.x, p.y + p.width, z + height],
      ],
      colour,
      INK,
      0.6,
    );
    picture.polygon(
      [
        [p.x + p.length, p.y, z],
        [p.x + p.length, p.y + p.width, z],
        [p.x + p.length, p.y + p.width, z + height],
        [p.x + p.length, p.y, z + height],
      ],
      colour,
      INK,
      0.6,
    );
  }

  const z = count * height;
  picture.polygon(
    [
      [p.x, p.y, z],
      [p.x + p.length, p.y, z],
      [p.x + p.length, p.y + p.width, z],
      [p.x, p.y + p.width, z],
    ],
    p.colour(count - 1),
  );
  return z;
}

function drawPieces(
  picture: IsoPicture,
  p: {
    x: number;
    length: number;
    y: number;
    width: number;
    z: number;
    sizes: string[];
    labels?: boolean;
  },
) {
  if (!p.sizes.length || p.length <= 0 || p.width <= 0) return;
  const slotWidth = p.length / p.sizes.length;

  p.sizes.forEach((size, index) => {
    const x = p.x + index * slotWidth;
    const rectangle = (x1: number, x2: number, y1: number, y2: number) => {
      picture.polygon(
        [
          [x + x1 * slotWidth, p.y + y1 * p.width, p.z],
          [x + x2 * slotWidth, p.y + y1 * p.width, p.z],
          [x + x2 * slotWidth, p.y + y2 * p.width, p.z],
          [x + x1 * slotWidth, p.y + y2 * p.width, p.z],
        ],
        PIECE,
        INK,
        0.8,
      );
    };

    rectangle(0.06, 0.6, 0.05, 0.47);
    rectangle(0.06, 0.6, 0.53, 0.95);
    rectangle(0.66, 0.94, 0.05, 0.33);
    rectangle(0.66, 0.94, 0.39, 0.67);
    if (p.labels !== false) {
      picture.label(
        `piece-${index}`,
        [x + 0.33 * slotWidth, p.y + 0.5 * p.width, p.z],
        size,
        'size',
      );
    }
  });
}

function drawKnife(picture: IsoPicture, x: number, y: number, stackTop: number) {
  const bodyTop = stackTop + 14;
  picture.polygon(
    [
      [x, y - 5, -2],
      [x, y + 5, -2],
      [x, y + 5, bodyTop],
      [x, y - 5, bodyTop],
    ],
    STEEL,
    INK,
    1,
  );
  const left = x - 8;
  const right = x + 8;
  const front = y - 10;
  const back = y + 10;
  const headTop = bodyTop + 18;
  picture.polygon(
    [
      [left, back, bodyTop],
      [right, back, bodyTop],
      [right, back, headTop],
      [left, back, headTop],
    ],
    STEEL_DARK,
  );
  picture.polygon(
    [
      [right, front, bodyTop],
      [right, back, bodyTop],
      [right, back, headTop],
      [right, front, headTop],
    ],
    STEEL,
  );
  picture.polygon(
    [
      [left, front, headTop],
      [right, front, headTop],
      [right, back, headTop],
      [left, back, headTop],
    ],
    STEEL,
  );
  picture.line([x, y, headTop], [x - 6, y - 14, headTop + 14], INK, 3);
}

function dimension(
  picture: IsoPicture,
  key: string,
  from: Point,
  to: Point,
  offset: Point,
  label: ReactNode,
  tone: OverlayTone = 'dimension',
) {
  const start = addPoints(from, offset);
  const end = addPoints(to, offset);
  picture.line(start, end, BLUE, 1.4);
  picture.line(from, addPoints(from, scaledPoint(offset, 1.15)), BLUE, 0.8, '2 3');
  picture.line(to, addPoints(to, scaledPoint(offset, 1.15)), BLUE, 0.8, '2 3');
  picture.label(key, midpoint(start, end), label, tone);
}

function layerColour(fabric: FabricColours, faceToFace: boolean) {
  return (index: number) => (!faceToFace || index % 2 ? fabric.face : fabric.back);
}

export function SpreadChoicePicture(p: {
  kind: 'single' | 'table';
  fabric: FabricColours;
}): JSX.Element {
  const picture = new IsoPicture();
  const length = 220;
  const width = 120;
  const clothWidth = 96;
  const clothY = 12;
  drawTable(picture, length, width, 60);
  const count = p.kind === 'single' ? 1 : 8;
  const sheetHeight = p.kind === 'single' ? 2 : 3.2;
  const top = drawSheets(picture, {
    x: 20,
    length: 180,
    y: clothY,
    width: clothWidth,
    count,
    height: sheetHeight,
    colour: () => p.fabric.face,
  });
  drawPieces(picture, {
    x: 20,
    length: 180,
    y: clothY,
    width: clothWidth,
    z: top,
    sizes: ['', '', '', ''],
    labels: false,
  });

  if (p.kind === 'single') {
    picture.label('scissors', [120, clothY + clothWidth + 18, top], '✂', 'large');
  } else {
    drawKnife(picture, 150, clothY + clothWidth * 0.8, top);
    picture.label('layers', [0, clothY + clothWidth + 20, top], '8 layers', 'dimension');
  }

  return <PictureFrame data={picture.finish(200, 0.06)} />;
}

export function TablePicture(p: {
  lengthCm: number;
  widthCm: number;
  maxStackCm?: number | null;
  length?: PicInput;
  width?: PicInput;
}): JSX.Element {
  const picture = new IsoPicture();
  const length = Math.max(20, finitePositive(p.lengthCm, 20));
  const width = Math.max(20, finitePositive(p.widthCm, 20));
  drawTable(picture, length, width);
  dimension(
    picture,
    'length',
    [0, 0, 0],
    [length, 0, 0],
    [0, p.length ? -28 : -26, 0],
    p.length ? <NumberInput input={p.length} /> : `${formatOne(p.lengthCm)} cm`,
  );
  dimension(
    picture,
    'width',
    [length, 0, 0],
    [length, width, 0],
    [p.width ? 30 : 26, 0, 0],
    p.width ? <NumberInput input={p.width} /> : `${formatOne(p.widthCm)} cm`,
  );
  if (p.maxStackCm != null) {
    picture.label(
      'stack-limit',
      [length * 0.45, width * 0.5, 0],
      `stack ≤ ${formatOne(p.maxStackCm)} cm`,
      'muted',
    );
  }

  return <PictureFrame data={picture.finish()} />;
}

export function KnifePicture(p: { maxStackCm: PicInput; fabric: FabricColours }): JSX.Element {
  const picture = new IsoPicture(false);
  const stackHeight = Math.max(24, Math.min(96, finitePositive(p.maxStackCm.value) * 6));
  picture.polygon(
    [
      [-20, 0],
      [220, 0],
      [220, -6],
      [-20, -6],
    ],
    TABLE_SIDE,
  );
  picture.line([0, -6], [0, -70], TABLE_LEG, 3);
  picture.line([200, -6], [200, -70], TABLE_LEG, 3);

  const sheetCount = Math.max(4, Math.min(12, Math.round(stackHeight / 4)));
  for (let index = 0; index < sheetCount; index += 1) {
    const bottom = (index * stackHeight) / sheetCount;
    const top = ((index + 1) * stackHeight) / sheetCount;
    picture.polygon(
      [
        [10, bottom],
        [150, bottom],
        [150, top],
        [10, top],
      ],
      index % 2 ? p.fabric.face : p.fabric.back,
      INK,
      0.4,
    );
  }
  picture.polygon(
    [
      [160, 0],
      [166, 0],
      [166, stackHeight + 4],
      [160, stackHeight + 4],
    ],
    STEEL,
  );
  picture.polygon(
    [
      [150, stackHeight + 4],
      [176, stackHeight + 4],
      [176, stackHeight + 28],
      [150, stackHeight + 28],
    ],
    STEEL_DARK,
  );
  picture.line([176, stackHeight + 28], [196, stackHeight + 44], INK, 3);
  picture.polygon(
    [
      [146, 0],
      [180, 0],
      [180, 2],
      [146, 2],
    ],
    STEEL_DARK,
  );
  picture.line([190, 0], [190, stackHeight], BLUE, 1.4);
  picture.line([182, stackHeight], [198, stackHeight], BLUE, 1.4);
  picture.line([182, 0], [198, 0], BLUE, 1.4);
  picture.label('max-stack', [214, stackHeight / 2], <NumberInput input={p.maxStackCm} />);
  picture.label('fabric-stack', [80, stackHeight / 2], 'fabric stack', 'size');
  picture.label('knife', [163, stackHeight + 50], 'knife', 'muted');
  picture.label('side-view', [80, -50], 'side view', 'muted');

  return <PictureFrame data={picture.finish(320, 0.1)} />;
}

export function GarmentPile(p: { colour: string; qty: number }): JSX.Element {
  const count = Math.min(5, Math.max(1, Math.ceil(Math.max(0, p.qty) / 5)));
  const shirts = Array.from({ length: count }, (_, index) => count - index - 1);
  return (
    <svg aria-hidden='true' height='70' viewBox='-2 -20 62 62' width='70'>
      {shirts.map((index) => (
        <path
          key={index}
          d='M12 4 L4 9 L1 18 L8 20 L9 14 L9 38 L31 38 L31 14 L32 20 L39 18 L36 9 L28 4 Q20 9 12 4 Z'
          fill={p.colour}
          stroke={INK}
          strokeWidth={1}
          transform={`translate(${index * 4},${-index * 4})`}
          vectorEffect='non-scaling-stroke'
        />
      ))}
    </svg>
  );
}

export function LayersPicture(p: {
  tableLengthCm: number;
  tableWidthCm: number;
  clothWidthCm: number;
  layCm: number;
  endLossCm: number;
  plies: number;
  plySizes: string[];
  faceToFace: boolean;
  fabric: FabricColours;
  stackCm: number;
  stackOk: boolean;
}): JSX.Element {
  const picture = new IsoPicture();
  const tableLength = finitePositive(p.tableLengthCm, 20);
  const tableWidth = finitePositive(p.tableWidthCm, 20);
  const clothWidth = Math.max(
    1,
    Math.min(finitePositive(p.clothWidthCm), Math.max(1, tableWidth - 10)),
  );
  const clothY = (tableWidth - clothWidth) / 2;
  const endLoss = Math.max(0, p.endLossCm);
  const sheetX = endLoss + 4;
  const sheetLength = Math.max(1, Math.min(finitePositive(p.layCm), tableLength + 80));
  drawTable(picture, tableLength, tableWidth);
  const top = drawSheets(picture, {
    x: sheetX,
    length: sheetLength,
    y: clothY,
    width: clothWidth,
    count: p.plies,
    height: 3,
    colour: layerColour(p.fabric, p.faceToFace),
  });
  drawPieces(picture, {
    x: sheetX + endLoss,
    length: Math.max(1, sheetLength - endLoss * 2),
    y: clothY,
    width: clothWidth,
    z: top,
    sizes: p.plySizes,
  });
  drawKnife(picture, sheetX + sheetLength * 0.85, clothY + clothWidth + 16, top);
  picture.label(
    'layers',
    [sheetX, clothY + clothWidth + 10, top / 2],
    `${p.plies} layers`,
    'dimension',
  );
  picture.label(
    'stack-height',
    [sheetX + sheetLength, clothY + clothWidth + 30, top / 2],
    `${formatOne(p.stackCm)} cm high`,
    p.stackOk ? 'muted' : 'danger',
  );

  return <PictureFrame data={picture.finish()} />;
}

export function EndsPicture(p: { endLoss: PicInput; fabric: FabricColours }): JSX.Element {
  const picture = new IsoPicture();
  const length = 200;
  const width = 150;
  const clothWidth = 120;
  const clothY = 15;
  const wasteWidth = Math.max(6, Math.min(70, Math.max(0, p.endLoss.value) * 5));
  drawTable(picture, length, width);
  const top = drawSheets(picture, {
    x: 10,
    length: 180,
    y: clothY,
    width: clothWidth,
    count: 1,
    height: 2,
    colour: () => p.fabric.face,
  });
  picture.polygon(
    [
      [10, clothY, top],
      [10 + wasteWidth, clothY, top],
      [10 + wasteWidth, clothY + clothWidth, top],
      [10, clothY + clothWidth, top],
    ],
    WASTE,
    RED,
    1,
  );
  picture.polygon(
    [
      [190 - wasteWidth, clothY, top],
      [190, clothY, top],
      [190, clothY + clothWidth, top],
      [190 - wasteWidth, clothY + clothWidth, top],
    ],
    WASTE,
    RED,
    1,
  );
  drawPieces(picture, {
    x: 10 + wasteWidth,
    length: 180 - wasteWidth * 2,
    y: clothY,
    width: clothWidth,
    z: top,
    sizes: ['', '', ''],
    labels: false,
  });
  picture.label(
    'end-loss-input',
    [10 + wasteWidth / 2, clothY + clothWidth + 22, top],
    <NumberInput input={p.endLoss} />,
  );
  picture.label(
    'end-loss-value',
    [190 - wasteWidth / 2, clothY + clothWidth + 22, top],
    `${formatOne(p.endLoss.value)} cm`,
    'danger',
  );
  picture.label('waste-caption', [100, -40, top], 'cut off, thrown away', 'muted');

  return <PictureFrame data={picture.finish()} />;
}

export function LayOnTablePicture(p: {
  mode: 'single' | 'table';
  tableLengthCm: number;
  tableWidthCm: number;
  clothWidthCm: number;
  markerLengthCm: number;
  endLossCm: number;
  plies: number;
  plySizes: string[];
  faceToFace: boolean;
  fabric: FabricColours;
  fits: boolean;
}): JSX.Element {
  const picture = new IsoPicture();
  const markerLength = finitePositive(p.markerLengthCm);
  const clothWidth = Math.max(1, Math.min(finitePositive(p.clothWidthCm), 140));
  const colour = layerColour(p.fabric, p.faceToFace);

  if (p.mode === 'single') {
    const shownLength = Math.min(markerLength, 520);
    const top = drawSheets(picture, {
      x: 0,
      length: shownLength,
      y: 0,
      width: clothWidth,
      count: 1,
      height: 2,
      colour,
    });
    const visibleCount = Math.max(
      1,
      Math.min(p.plySizes.length, Math.floor((p.plySizes.length * shownLength) / markerLength)),
    );
    drawPieces(picture, {
      x: 0,
      length: shownLength,
      y: 0,
      width: clothWidth,
      z: top,
      sizes: p.plySizes.slice(0, visibleCount),
    });
    dimension(
      picture,
      'marker-length',
      [0, 0, top],
      [shownLength, 0, top],
      [0, -30, 0],
      `≈ ${formatMetres(p.markerLengthCm)} m${shownLength < markerLength ? ' (cut short)' : ''}`,
    );
    dimension(
      picture,
      'cloth-width',
      [shownLength, 0, top],
      [shownLength, clothWidth, top],
      [30, 0, 0],
      `${formatOne(p.clothWidthCm)} cm`,
    );
    return <PictureFrame data={picture.finish()} />;
  }

  const tableLength = finitePositive(p.tableLengthCm, 20);
  const tableWidth = finitePositive(p.tableWidthCm, 20);
  const tableClothWidth = clothWidth;
  const clothY = (tableWidth - tableClothWidth) / 2;
  const sheetX = 4;
  const endLoss = Math.max(0, p.endLossCm);
  const layLength = markerLength + endLoss * 2;
  drawTable(picture, tableLength, tableWidth);
  const top = drawSheets(picture, {
    x: sheetX,
    length: layLength,
    y: clothY,
    width: tableClothWidth,
    count: p.plies,
    height: 3,
    colour,
  });
  if (!p.fits && sheetX + layLength > tableLength) {
    picture.polygon(
      [
        [tableLength, clothY, top + 0.5],
        [sheetX + layLength, clothY, top + 0.5],
        [sheetX + layLength, clothY + tableClothWidth, top + 0.5],
        [tableLength, clothY + tableClothWidth, top + 0.5],
      ],
      WASTE,
      RED,
      1.4,
    );
  }
  drawPieces(picture, {
    x: sheetX + endLoss,
    length: markerLength,
    y: clothY,
    width: tableClothWidth,
    z: top,
    sizes: p.plySizes,
  });
  dimension(
    picture,
    'table-length',
    [0, 0, 0],
    [tableLength, 0, 0],
    [0, -60, 0],
    `table ${formatMetres(p.tableLengthCm)} m`,
  );
  dimension(
    picture,
    'marker-length',
    [sheetX, clothY + tableClothWidth, top],
    [sheetX + layLength, clothY + tableClothWidth, top],
    [0, 32, 0],
    `marker ${formatMetres(layLength)} m`,
    p.fits ? 'dimension' : 'danger',
  );

  return <PictureFrame data={picture.finish()} />;
}

function expandHex(hex: string) {
  if (/^#[\da-f]{3}$/i.test(hex)) {
    return `#${hex
      .slice(1)
      .split('')
      .map((digit) => digit + digit)
      .join('')}`;
  }
  return /^#[\da-f]{6}$/i.test(hex) ? hex : null;
}

function lighterHex(hex: string) {
  const expanded = expandHex(hex);
  if (!expanded) return NEUTRAL_BACK;
  const mixed = [1, 3, 5]
    .map((index) => {
      const channel = Number.parseInt(expanded.slice(index, index + 2), 16);
      return Math.round(channel * 0.5 + 255 * 0.5)
        .toString(16)
        .padStart(2, '0');
    })
    .join('');
  return `#${mixed}`;
}

export function fabricColours(hex: string | null | undefined): FabricColours {
  const candidate = hex?.trim() ?? '';
  if (!expandHex(candidate)) return { face: NEUTRAL_FACE, back: NEUTRAL_BACK };
  return { face: candidate, back: lighterHex(candidate) };
}
