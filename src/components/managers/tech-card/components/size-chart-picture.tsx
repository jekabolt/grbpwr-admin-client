import {
  normalizePicturePoint,
  normalizedLineSegment,
  parsePictureViewBox,
  iconLineSegment,
  type PicturePoint,
  type PictureSegment,
  type PictureViewBox,
  type SizeChartPictureDraft,
  type SizeChartPictureSource,
} from 'lib/pom/size-chart-picture';
import { SIZE_CHART_ICONS } from 'lib/pom/size-chart-icons';
import { cn } from 'lib/utility';
import {
  useLayoutEffect,
  useRef,
  useState,
  type MouseEvent as ReactMouseEvent,
  type PointerEvent as ReactPointerEvent,
} from 'react';
import {
  Button,
  Chip,
  Placeholder,
  Select,
  Tile,
  Tiles,
  ViewSwitch,
  type ViewSwitchOption,
} from 'ui';

export type SizeChartSketch = { id: number; url: string; label: string };

type LineFocus = { measurementNameId: number; position: number };

const ICON_OPTIONS = Object.entries(SIZE_CHART_ICONS)
  .map(([value, icon]) => ({ value, label: icon.label }))
  .sort((a, b) => String(a.label).localeCompare(String(b.label)));

const viewBoxText = (box: PictureViewBox) => `${box.x} ${box.y} ${box.width} ${box.height}`;
const humanName = (value: string) => value.replace(/[-_]+/g, ' ').trim();

export function isSizeChartPictureReady(picture: SizeChartPictureDraft): boolean {
  return picture.source === 'icon' ? !!SIZE_CHART_ICONS[picture.iconKey] : !!picture.mediaUrl;
}

function LineGraphic({
  segment,
  unit,
  label,
  value,
  active,
  dim,
  onEnter,
  onLeave,
}: {
  segment: PictureSegment;
  unit: number;
  label: string;
  value: string;
  active: boolean;
  dim: boolean;
  onEnter?: () => void;
  onLeave?: () => void;
}) {
  const { x, y, x2, y2 } = segment;
  const dx = x2 - x;
  const dy = y2 - y;
  const length = Math.hypot(dx, dy) || 1;
  const nx = (-dy / length) * unit * 0.4;
  const ny = (dx / length) * unit * 0.4;
  const cx = (x + x2) / 2;
  const cy = (y + y2) / 2;
  const shownLabel = humanName(label || 'point').toUpperCase();
  const shownValue = value || '—';
  const width = Math.max(shownLabel.length, shownValue.length) * unit * 0.62 + unit * 1.2;
  const height = unit * 2.6;

  return (
    <g
      className={cn(onEnter && 'cursor-pointer')}
      opacity={dim ? 0.2 : 1}
      onMouseEnter={onEnter}
      onMouseLeave={onLeave}
    >
      <path
        d={`M${x} ${y}L${x2} ${y2}`}
        fill='none'
        stroke='var(--color-highlightColor)'
        strokeWidth={active ? 2.5 : 1}
        vectorEffect='non-scaling-stroke'
      />
      <path
        d={`M${x + nx} ${y + ny}L${x - nx} ${y - ny}M${x2 + nx} ${y2 + ny}L${x2 - nx} ${y2 - ny}`}
        fill='none'
        stroke='var(--color-highlightColor)'
        strokeWidth={1}
        vectorEffect='non-scaling-stroke'
      />
      <rect
        x={cx - width / 2}
        y={cy - height / 2}
        width={width}
        height={height}
        fill='var(--color-highlightColor)'
      />
      <text
        x={cx}
        y={cy - unit * 0.15}
        fill='var(--color-bgColor)'
        fontFamily='var(--font-family-mono)'
        fontSize={unit}
        textAnchor='middle'
      >
        {shownLabel}
      </text>
      <text
        x={cx}
        y={cy + unit * 1.05}
        fill='var(--color-bgColor)'
        fontFamily='var(--font-family-mono)'
        fontSize={unit}
        textAnchor='middle'
      >
        {shownValue}
      </text>
    </g>
  );
}

function DrawingMarks({
  start,
  cursor,
  viewBox,
  unit,
}: {
  start: PicturePoint | null;
  cursor: PicturePoint | null;
  viewBox: PictureViewBox;
  unit: number;
}) {
  if (!start) return null;
  const x = viewBox.x + start.x * viewBox.width;
  const y = viewBox.y + start.y * viewBox.height;
  const x2 = viewBox.x + (cursor?.x ?? start.x) * viewBox.width;
  const y2 = viewBox.y + (cursor?.y ?? start.y) * viewBox.height;
  return (
    <g pointerEvents='none'>
      <circle cx={x} cy={y} r={unit * 0.22} fill='var(--color-highlightColor)' />
      {cursor && (
        <line
          x1={x}
          y1={y}
          x2={x2}
          y2={y2}
          fill='none'
          stroke='var(--color-highlightColor)'
          strokeDasharray='4 4'
          strokeWidth={1}
          vectorEffect='non-scaling-stroke'
        />
      )}
    </g>
  );
}

function PictureLines({
  picture,
  viewBox,
  unit,
  measurementNameById,
  measurementNameIdOf,
  valueFor,
  activeMeasurementNameId,
  activeFreeLinePosition,
  onFocus,
  onBlur,
  drawingStart,
  drawingCursor,
  includeIconLines,
}: {
  picture: SizeChartPictureDraft;
  viewBox: PictureViewBox;
  unit: number;
  measurementNameById: ReadonlyMap<number, string>;
  measurementNameIdOf: (name: string) => number;
  valueFor: (measurementNameId: number) => string;
  activeMeasurementNameId: number | null;
  activeFreeLinePosition: number | null;
  onFocus?: (focus: LineFocus) => void;
  onBlur?: () => void;
  drawingStart?: PicturePoint | null;
  drawingCursor?: PicturePoint | null;
  includeIconLines: boolean;
}) {
  const icon = SIZE_CHART_ICONS[picture.iconKey];
  const anyActive = activeMeasurementNameId != null || activeFreeLinePosition != null;
  return (
    <>
      {includeIconLines &&
        icon?.lines.map((line, index) => {
          const measurementNameId = measurementNameIdOf(line.name);
          const active = measurementNameId > 0 && activeMeasurementNameId === measurementNameId;
          return (
            <LineGraphic
              key={`icon:${index}:${line.name}`}
              segment={iconLineSegment(line)}
              unit={unit}
              label={line.name}
              value={measurementNameId ? valueFor(measurementNameId) : ''}
              active={active}
              dim={anyActive && !active}
              onEnter={
                onFocus && measurementNameId
                  ? () => onFocus({ measurementNameId, position: 0 })
                  : undefined
              }
              onLeave={onBlur}
            />
          );
        })}
      {picture.lines.map((line) => {
        const active = line.measurementNameId
          ? activeMeasurementNameId === line.measurementNameId
          : activeFreeLinePosition === line.position;
        return (
          <LineGraphic
            key={`free:${line.position}`}
            segment={normalizedLineSegment(line, viewBox)}
            unit={unit}
            label={measurementNameById.get(line.measurementNameId) ?? 'point'}
            value={line.measurementNameId ? valueFor(line.measurementNameId) : ''}
            active={active}
            dim={anyActive && !active}
            onEnter={onFocus ? () => onFocus(line) : undefined}
            onLeave={onBlur}
          />
        );
      })}
      <DrawingMarks
        start={drawingStart ?? null}
        cursor={drawingCursor ?? null}
        viewBox={viewBox}
        unit={unit}
      />
    </>
  );
}

export function SizeChartPictureGraphic({
  picture,
  measurementNameById,
  measurementNameIdOf,
  valueFor,
  activeMeasurementNameId = null,
  activeFreeLinePosition = null,
  onFocus,
  onBlur,
  drawingStart,
  drawingCursor,
  onPictureClick,
  onPictureMove,
  className,
}: {
  picture: SizeChartPictureDraft;
  measurementNameById: ReadonlyMap<number, string>;
  measurementNameIdOf: (name: string) => number;
  valueFor: (measurementNameId: number) => string;
  activeMeasurementNameId?: number | null;
  activeFreeLinePosition?: number | null;
  onFocus?: (focus: LineFocus) => void;
  onBlur?: () => void;
  drawingStart?: PicturePoint | null;
  drawingCursor?: PicturePoint | null;
  onPictureClick?: (point: PicturePoint) => void;
  onPictureMove?: (point: PicturePoint) => void;
  className?: string;
}) {
  const icon = SIZE_CHART_ICONS[picture.iconKey];
  const initialViewBox = parsePictureViewBox(icon?.viewBox ?? '0 0 1000 1000');
  const [iconViewBox, setIconViewBox] = useState(initialViewBox);
  const fitRef = useRef<SVGGElement>(null);
  const fallbackKey = icon?.viewBox ?? '0 0 1000 1000';

  useLayoutEffect(() => {
    setIconViewBox(parsePictureViewBox(fallbackKey));
  }, [fallbackKey]);

  useLayoutEffect(() => {
    if (!fitRef.current || picture.source !== 'icon') return;
    const bounds = fitRef.current.getBBox();
    if (!bounds.width || !bounds.height) return;
    const padding = Math.max(bounds.width, bounds.height) * 0.04;
    const next = {
      x: bounds.x - padding,
      y: bounds.y - padding,
      width: bounds.width + padding * 2,
      height: bounds.height + padding * 2,
    };
    setIconViewBox((previous) =>
      Math.abs(previous.x - next.x) < 0.01 &&
      Math.abs(previous.y - next.y) < 0.01 &&
      Math.abs(previous.width - next.width) < 0.01 &&
      Math.abs(previous.height - next.height) < 0.01
        ? previous
        : next,
    );
  });

  const pointFromEvent = (event: ReactMouseEvent<Element> | ReactPointerEvent<Element>) =>
    normalizePicturePoint(
      event.clientX,
      event.clientY,
      event.currentTarget.getBoundingClientRect(),
    );
  const click = onPictureClick
    ? (event: ReactMouseEvent<Element>) => onPictureClick(pointFromEvent(event))
    : undefined;
  const move = onPictureMove
    ? (event: ReactPointerEvent<Element>) => onPictureMove(pointFromEvent(event))
    : undefined;

  if (picture.source === 'icon') {
    if (!icon) return <Placeholder aspect='4/3' label='Pick icon' />;
    const sourceBox = parsePictureViewBox(icon.viewBox);
    const unit = Math.max(sourceBox.width, sourceBox.height) / 40;
    return (
      <svg
        viewBox={viewBoxText(iconViewBox)}
        fill='none'
        aria-label='Size chart picture'
        className={cn(
          'block h-auto w-full border border-borderColor bg-bgColor touch-none',
          onPictureClick && 'cursor-crosshair border-highlightColor',
          className,
        )}
        onClick={click}
        onPointerMove={move}
      >
        <g ref={fitRef}>
          <g
            className='text-textColor [&_*]:stroke-current'
            dangerouslySetInnerHTML={{ __html: icon.inner }}
          />
          <PictureLines
            picture={{ ...picture, lines: [] }}
            viewBox={iconViewBox}
            unit={unit}
            measurementNameById={measurementNameById}
            measurementNameIdOf={measurementNameIdOf}
            valueFor={valueFor}
            activeMeasurementNameId={activeMeasurementNameId}
            activeFreeLinePosition={activeFreeLinePosition}
            onFocus={onFocus}
            onBlur={onBlur}
            includeIconLines
          />
        </g>
        <PictureLines
          picture={{ ...picture, iconKey: '' }}
          viewBox={iconViewBox}
          unit={unit}
          measurementNameById={measurementNameById}
          measurementNameIdOf={measurementNameIdOf}
          valueFor={valueFor}
          activeMeasurementNameId={activeMeasurementNameId}
          activeFreeLinePosition={activeFreeLinePosition}
          onFocus={onFocus}
          onBlur={onBlur}
          drawingStart={drawingStart}
          drawingCursor={drawingCursor}
          includeIconLines={false}
        />
      </svg>
    );
  }

  if (!picture.mediaUrl) {
    return (
      <Placeholder aspect='4/3' label={picture.source === 'sketch' ? 'Pick sketch' : 'Upload'} />
    );
  }
  const mediaViewBox = { x: 0, y: 0, width: 1000, height: 1000 };
  return (
    <div
      aria-label='Size chart picture'
      className={cn(
        'relative border border-borderColor bg-bgColor',
        onPictureClick && 'cursor-crosshair border-highlightColor',
        className,
      )}
      onClick={click}
      onPointerMove={move}
    >
      <img
        src={picture.mediaUrl}
        alt=''
        className='block h-auto max-h-[32rem] w-full object-contain'
      />
      <svg
        viewBox='0 0 1000 1000'
        preserveAspectRatio='none'
        className='pointer-events-none absolute inset-0 h-full w-full overflow-visible'
      >
        <g className='pointer-events-auto'>
          <PictureLines
            picture={picture}
            viewBox={mediaViewBox}
            unit={25}
            measurementNameById={measurementNameById}
            measurementNameIdOf={measurementNameIdOf}
            valueFor={valueFor}
            activeMeasurementNameId={activeMeasurementNameId}
            activeFreeLinePosition={activeFreeLinePosition}
            onFocus={onFocus}
            onBlur={onBlur}
            drawingStart={drawingStart}
            drawingCursor={drawingCursor}
            includeIconLines={false}
          />
        </g>
      </svg>
    </div>
  );
}

export function SizeChartPictureEditor({
  picture,
  sketches,
  size,
  sizeOptions,
  disabled,
  uploading,
  measurementNameById,
  measurementNameIdOf,
  valueFor,
  activeMeasurementNameId,
  activeFreeLinePosition,
  onSizeChange,
  onSourceChange,
  onIconChange,
  onSketchChange,
  onUpload,
  onAddLine,
  onFocus,
  onBlur,
}: {
  picture: SizeChartPictureDraft;
  sketches: readonly SizeChartSketch[];
  size: string;
  sizeOptions: readonly ViewSwitchOption<string>[];
  disabled: boolean;
  uploading: boolean;
  measurementNameById: ReadonlyMap<number, string>;
  measurementNameIdOf: (name: string) => number;
  valueFor: (measurementNameId: number) => string;
  activeMeasurementNameId: number | null;
  activeFreeLinePosition: number | null;
  onSizeChange: (size: string) => void;
  onSourceChange: (source: SizeChartPictureSource) => void;
  onIconChange: (key: string) => void;
  onSketchChange: (sketch: SizeChartSketch) => void;
  onUpload: (file: File) => Promise<void>;
  onAddLine: (start: PicturePoint, end: PicturePoint) => void;
  onFocus: (focus: LineFocus) => void;
  onBlur: () => void;
}) {
  const [drawing, setDrawing] = useState(false);
  const [start, setStart] = useState<PicturePoint | null>(null);
  const [cursor, setCursor] = useState<PicturePoint | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const ready = isSizeChartPictureReady(picture);

  const chooseSource = (source: SizeChartPictureSource) => {
    setDrawing(false);
    setStart(null);
    setCursor(null);
    onSourceChange(source);
  };
  const pickPoint = (point: PicturePoint) => {
    if (!drawing) return;
    if (!start) {
      setStart(point);
      setCursor(point);
      return;
    }
    onAddLine(start, point);
    setDrawing(false);
    setStart(null);
    setCursor(null);
  };
  const upload = async (file: File) => {
    await onUpload(file);
    if (inputRef.current) inputRef.current.value = '';
  };

  return (
    <div className='flex min-w-0 flex-col gap-2'>
      <div className='flex flex-wrap items-center gap-1'>
        <Chip
          selected={picture.source === 'icon'}
          pressed={picture.source === 'icon'}
          onClick={() => chooseSource('icon')}
          disabled={disabled}
        >
          Icon
        </Chip>
        <Chip
          selected={picture.source === 'sketch'}
          pressed={picture.source === 'sketch'}
          onClick={() => chooseSource('sketch')}
          disabled={disabled || sketches.length === 0}
        >
          Sketch
        </Chip>
        <Chip
          selected={picture.source === 'upload'}
          pressed={picture.source === 'upload'}
          onClick={() => chooseSource('upload')}
          disabled={disabled}
        >
          Upload
        </Chip>
        <Button
          type='button'
          variant='secondary'
          size='xs'
          className='ml-auto'
          aria-pressed={drawing}
          disabled={disabled || !ready}
          onClick={() => {
            setDrawing((value) => !value);
            setStart(null);
            setCursor(null);
          }}
        >
          + Line
        </Button>
      </div>

      <div className='flex min-w-0 flex-wrap items-center gap-2'>
        {picture.source === 'icon' && (
          <Select
            name='size-chart-icon'
            value={picture.iconKey || undefined}
            placeholder='Icon'
            items={ICON_OPTIONS}
            onValueChange={onIconChange}
            readOnly={disabled}
            size='sm'
            className='min-w-44 flex-1'
          />
        )}
        {picture.source === 'upload' && picture.mediaUrl && (
          <Button
            type='button'
            variant='underline'
            size='xs'
            disabled={disabled || uploading}
            onClick={() => inputRef.current?.click()}
          >
            Replace
          </Button>
        )}
        {sizeOptions.length > 0 && (
          <ViewSwitch
            value={size}
            options={sizeOptions}
            label='Size'
            onChange={onSizeChange}
            className='ml-auto max-w-full overflow-x-auto'
          />
        )}
      </div>

      {picture.source === 'sketch' && (
        <Tiles min={64} className='grid-cols-[repeat(auto-fill,minmax(4rem,1fr))]'>
          {sketches.map((sketch) => (
            <Tile
              key={sketch.id}
              selected={picture.mediaId === sketch.id}
              pressed={picture.mediaId === sketch.id}
              onClick={disabled ? undefined : () => onSketchChange(sketch)}
              title={sketch.label}
              className='p-1'
              media={
                <img
                  src={sketch.url}
                  alt={sketch.label}
                  className='aspect-[4/3] w-full object-contain'
                />
              }
            />
          ))}
        </Tiles>
      )}

      {picture.source === 'upload' && !picture.mediaUrl ? (
        <Placeholder aspect='4/3' dashed>
          <Button
            type='button'
            variant='secondary'
            size='sm'
            loading={uploading}
            disabled={disabled || uploading}
            onClick={() => inputRef.current?.click()}
          >
            Upload
          </Button>
        </Placeholder>
      ) : (
        <SizeChartPictureGraphic
          picture={picture}
          measurementNameById={measurementNameById}
          measurementNameIdOf={measurementNameIdOf}
          valueFor={valueFor}
          activeMeasurementNameId={activeMeasurementNameId}
          activeFreeLinePosition={activeFreeLinePosition}
          onFocus={onFocus}
          onBlur={onBlur}
          drawingStart={start}
          drawingCursor={cursor}
          onPictureClick={drawing ? pickPoint : undefined}
          onPictureMove={drawing && start ? setCursor : undefined}
        />
      )}

      <span className='min-h-4 text-control text-highlightColor'>
        {drawing ? (start ? 'Pick end' : 'Pick start') : ''}
      </span>
      <input
        ref={inputRef}
        type='file'
        accept='image/*'
        className='sr-only'
        disabled={disabled || uploading}
        onChange={(event) => {
          const file = event.target.files?.[0];
          if (file) void upload(file);
        }}
      />
    </div>
  );
}
