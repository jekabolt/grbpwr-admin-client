import { common_MediaFull } from 'api/proto-http/admin';
import { MediaSelector } from 'components/managers/media/components/media-selector';
import { useMediaIntake } from 'components/managers/media/utils/useMediaIntake';
import { usePasteFiles } from 'components/managers/media/utils/usePasteFiles';
import {
  AnnotationDefs,
  CalloutShape,
  leaderTarget,
  simplifyToLimit,
  type ShapePoint,
} from 'components/managers/tech-card/annotation/shapes';
import {
  effectiveCaps,
  type AnnotationKindKey,
} from 'components/managers/tech-card/annotation/kinds';
import { cn } from 'lib/utility';
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { useFormContext, useWatch } from 'react-hook-form';
import {
  AddDoor,
  Close,
  ConfirmationModal,
  Media,
  Pin,
  Section,
  Text,
  Toolbar,
  ViewSwitch,
  type ViewSwitchOption,
} from 'ui';
import { nextEditNumber, type FormCallout } from './edit-rows';
import { FittingFormData } from './schema';
import { type PendingMark, useFittingWorkspace } from './workspace';

type DrawingTool = 'pin' | 'label' | 'dim' | 'arc' | 'polygon' | 'ink';

type Gesture = {
  mediaId: number;
  tool: DrawingTool;
  start: ShapePoint;
  points: ShapePoint[];
};

type FrameSize = { width: number; height: number };

const TOOL_OPTIONS: readonly ViewSwitchOption<DrawingTool>[] = [
  { value: 'pin', label: 'Pin' },
  { value: 'label', label: 'Leader' },
  { value: 'dim', label: 'Line' },
  { value: 'arc', label: 'Curve' },
  { value: 'polygon', label: 'Zone' },
  { value: 'ink', label: 'Freehand' },
];

const SAMPLE_DISTANCE = 0.008;
const MIN_DRAG_DISTANCE = 0.02;

const numberFromDecimal = (value?: string): number => {
  const parsed = Number((value ?? '').replace(',', '.'));
  return Number.isFinite(parsed) ? parsed : 0;
};

const clampUnit = (value: number): number => Math.min(1, Math.max(0, value));

const pointFromDecimal = (point: { x?: string; y?: string }): ShapePoint => ({
  x: clampUnit(numberFromDecimal(point.x)),
  y: clampUnit(numberFromDecimal(point.y)),
});

const pointToDecimal = (point: ShapePoint) => ({
  x: point.x.toFixed(4),
  y: point.y.toFixed(4),
});

const distance = (a: ShapePoint, b: ShapePoint): number => Math.hypot(b.x - a.x, b.y - a.y);

/** The mockup's one-drag curve, stored as the three on-curve points the shared renderer expects. */
function curveFrom(start: ShapePoint, end: ShapePoint): ShapePoint[] {
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  return [
    start,
    {
      x: clampUnit((start.x + end.x) / 2 + dy * 0.175),
      y: clampUnit((start.y + end.y) / 2 - dx * 0.175),
    },
    end,
  ];
}

function updateGesture(gesture: Gesture, point: ShapePoint): Gesture {
  if (gesture.tool === 'polygon' || gesture.tool === 'ink') {
    const last = gesture.points[gesture.points.length - 1];
    if (!last || distance(last, point) <= SAMPLE_DISTANCE) return gesture;
    return { ...gesture, points: [...gesture.points, point] };
  }
  if (gesture.tool === 'arc') {
    return { ...gesture, points: curveFrom(gesture.start, point) };
  }
  return { ...gesture, points: [gesture.start, point] };
}

function completedMark(gesture: Gesture): PendingMark | null {
  const first = gesture.points[0];
  const last = gesture.points[gesture.points.length - 1];
  if (!first || !last) return null;

  if (gesture.tool === 'polygon' || gesture.tool === 'ink') {
    if (gesture.points.length <= 4) return null;
  } else if (distance(first, last) <= MIN_DRAG_DISTANCE) {
    return null;
  }

  // A leader has one target point plus a separately stored label/marker position. Keeping the
  // drag's second point out of `points` is required by the shared LABEL wire shape (exactly one
  // anchor); rendering still shows the complete start-to-end gesture.
  const points =
    gesture.tool === 'label'
      ? [first]
      : gesture.tool === 'polygon'
        ? simplifyToLimit(gesture.points, 20)
        : gesture.tool === 'ink'
          ? simplifyToLimit(gesture.points, 200)
          : gesture.points;
  const marker = gesture.tool === 'label' ? last : first;

  return {
    mediaId: gesture.mediaId,
    kind: gesture.tool,
    posX: marker.x.toFixed(3),
    posY: marker.y.toFixed(3),
    points: points.map(pointToDecimal),
  };
}

function pinMark(mediaId: number, point: ShapePoint): PendingMark {
  return {
    mediaId,
    kind: 'pin',
    posX: point.x.toFixed(3),
    posY: point.y.toFixed(3),
    points: [],
  };
}

function mediaUrls(media?: common_MediaFull): string[] {
  const urls = [
    media?.media?.fullSize?.mediaUrl,
    media?.media?.compressed?.mediaUrl,
    media?.media?.thumbnail?.mediaUrl,
  ].filter((url): url is string => !!url);
  return [...new Set(urls)];
}

function thumbnailUrl(media?: common_MediaFull): string {
  return media?.media?.thumbnail?.mediaUrl || media?.media?.fullSize?.mediaUrl || '';
}

function markerOf(mark: {
  kind?: string;
  posX?: string;
  posY?: string;
  points?: { x?: string; y?: string }[];
}): ShapePoint {
  if ((mark.kind ?? 'pin') === 'pin' || mark.kind === 'label' || mark.kind === 'multi') {
    return {
      x: clampUnit(numberFromDecimal(mark.posX)),
      y: clampUnit(numberFromDecimal(mark.posY)),
    };
  }
  const first = mark.points?.[0];
  return first
    ? pointFromDecimal(first)
    : {
        x: clampUnit(numberFromDecimal(mark.posX)),
        y: clampUnit(numberFromDecimal(mark.posY)),
      };
}

function focusComposer() {
  requestAnimationFrame(() => {
    const composer = document.querySelector<HTMLElement>('[data-fitting-composer]');
    composer?.focus();
  });
}

function isTextEntry(target: EventTarget | null): boolean {
  const element = target as HTMLElement | null;
  if (!element) return false;
  return (
    element.tagName === 'INPUT' ||
    element.tagName === 'TEXTAREA' ||
    element.tagName === 'SELECT' ||
    element.isContentEditable
  );
}

function StageImage({ urls, alt, onLoad }: { urls: string[]; alt: string; onLoad: () => void }) {
  const [urlIndex, setUrlIndex] = useState(0);
  const urlKey = urls.join('|');

  useEffect(() => setUrlIndex(0), [urlKey]);

  const src = urls[urlIndex] ?? '';
  if (!src) {
    return (
      <div className='flex aspect-[3/4] max-h-[min(70vh,660px)] w-[min(100%,495px)] items-center justify-center border border-dashed border-borderColor bg-bgColor'>
        <Text size='micro' variant='label'>
          photo unavailable
        </Text>
      </div>
    );
  }

  return (
    <img
      src={src}
      alt={alt}
      draggable={false}
      onLoad={onLoad}
      onError={() => setUrlIndex((current) => Math.min(current + 1, urls.length))}
      className='block h-auto max-h-[min(70vh,660px)] max-w-full select-none max-[699px]:max-h-[62vh]'
    />
  );
}

function DrawingShape({
  mark,
  frameSize,
  hot,
  pending,
}: {
  mark: {
    kind?: string;
    posX?: string;
    posY?: string;
    points?: { x?: string; y?: string }[];
    color?: string;
    dashed?: boolean;
    filled?: boolean;
    caps?: string;
  };
  frameSize: FrameSize;
  hot?: boolean;
  pending?: boolean;
}) {
  const kind = mark.kind ?? 'pin';
  if (kind === 'pin') return null;

  const normalPoints = (mark.points ?? []).map(pointFromDecimal);
  const points = normalPoints.map((point) => ({
    x: point.x * frameSize.width,
    y: point.y * frameSize.height,
  }));
  const marker = markerOf(mark);
  const markerPx = { x: marker.x * frameSize.width, y: marker.y * frameSize.height };
  const caps = effectiveCaps(kind, mark.caps);
  const shapeLabel =
    kind === 'label' || kind === 'multi' ? markerPx : leaderTarget(kind, points, caps) ?? markerPx;

  return (
    <g className={hot ? 'text-error' : pending ? 'text-warning' : undefined}>
      <CalloutShape
        kind={kind}
        pts={points}
        label={shapeLabel}
        color={hot || pending ? '' : mark.color}
        dashed={pending || !!mark.dashed}
        filled={!!mark.filled}
        caps={mark.caps}
        halo
      />
    </g>
  );
}

function PhotoThumbnail({
  media,
  index,
  current,
  onSelect,
  onRemove,
}: {
  media?: common_MediaFull;
  index: number;
  current: boolean;
  onSelect: () => void;
  onRemove?: () => void;
}) {
  const url = thumbnailUrl(media);
  return (
    <div className='relative h-20 w-16 shrink-0 max-[699px]:h-[60px] max-[699px]:w-12'>
      <button
        type='button'
        aria-label={`photo ${index + 1}`}
        aria-current={current ? 'true' : undefined}
        onClick={onSelect}
        className={cn(
          'relative block h-full w-full overflow-hidden border bg-pageBg focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-textColor',
          current ? 'border-textColor outline outline-1 outline-textColor' : 'border-borderColor',
        )}
      >
        {url ? (
          <Media
            type='image'
            src={url}
            alt=''
            blurhash={media?.media?.blurhash}
            aspectRatio='auto'
            fit='cover'
          />
        ) : (
          <span className='flex h-full items-center justify-center text-borderColor'>×</span>
        )}
        <Text
          component='span'
          size='nano'
          className='absolute left-0 top-0 bg-textColor px-1 py-0.5 leading-none text-bgColor'
        >
          {index + 1}
        </Text>
      </button>
      {current && onRemove && (
        <Close
          size='sm'
          aria-label={`remove photo ${index + 1}`}
          onClick={onRemove}
          className='absolute right-0 top-0 bg-bgColor'
        />
      )}
    </div>
  );
}

/** Photos workspace: one active fitting photo, its marks, drawing tools, and the stored filmstrip. */
export function PhotoStage() {
  const { control, getValues, setValue } = useFormContext<FittingFormData>();
  const mediaIds = useWatch({ control, name: 'mediaIds' }) ?? [];
  const callouts = (useWatch({ control, name: 'callouts' }) ?? []) as FormCallout[];
  const {
    readOnly,
    mediaById,
    addPicked,
    changeRequests,
    currentMediaId,
    setCurrentMediaId,
    hotNumber,
    setHotNumber,
    pendingMark,
    setPendingMark,
  } = useFittingWorkspace();
  const [tool, setTool] = useState<DrawingTool>('pin');
  const [gesture, setGesture] = useState<Gesture | null>(null);
  const gestureRef = useRef<Gesture | null>(null);
  const frameRef = useRef<HTMLDivElement>(null);
  const [frameSize, setFrameSize] = useState<FrameSize>({ width: 0, height: 0 });
  const [removeId, setRemoveId] = useState<number | null>(null);

  const setLiveGesture = useCallback((next: Gesture | null) => {
    gestureRef.current = next;
    setGesture(next);
  }, []);

  const selectPhoto = useCallback(
    (mediaId: number) => {
      setCurrentMediaId(mediaId);
      setHotNumber(null);
    },
    [setCurrentMediaId, setHotNumber],
  );

  useEffect(() => {
    if (mediaIds.length === 0) {
      if (currentMediaId !== 0) setCurrentMediaId(0);
      return;
    }
    if (!mediaIds.includes(currentMediaId)) setCurrentMediaId(mediaIds[0]);
  }, [currentMediaId, mediaIds, setCurrentMediaId]);

  const measureFrame = useCallback(() => {
    const rect = frameRef.current?.getBoundingClientRect();
    if (!rect) return;
    setFrameSize({ width: rect.width, height: rect.height });
  }, []);

  useLayoutEffect(() => {
    const frame = frameRef.current;
    if (!frame) return;
    measureFrame();
    const observer = new ResizeObserver(measureFrame);
    observer.observe(frame);
    return () => observer.disconnect();
  }, [currentMediaId, measureFrame]);

  const addMedia = useCallback(
    (items: common_MediaFull[]) => {
      const valid = items.filter((item) => item.id != null);
      if (!valid.length) return;
      addPicked(valid);

      const existing = getValues('mediaIds') ?? [];
      const fresh = valid
        .map((item) => item.id)
        .filter((id): id is number => id != null && !existing.includes(id));
      if (fresh.length) {
        setValue('mediaIds', [...existing, ...fresh], { shouldDirty: true });
      }
      const nextCurrent = fresh[0] ?? valid[0]?.id;
      if (nextCurrent != null) selectPhoto(nextCurrent);
    },
    [addPicked, getValues, selectPhoto, setValue],
  );

  const pasteIntake = useMediaIntake({
    enabled: false,
    accept: 'image',
    purpose: 'fitting photos',
    onMedia: addMedia,
  });
  usePasteFiles({ claims: !readOnly, accepts: !readOnly, accept: 'image' }, pasteIntake.openFiles);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setLiveGesture(null);
        setPendingMark(null);
        return;
      }
      if (event.defaultPrevented || isTextEntry(event.target) || mediaIds.length < 2) return;
      if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return;
      const currentIndex = Math.max(0, mediaIds.indexOf(currentMediaId));
      const direction = event.key === 'ArrowLeft' ? -1 : 1;
      const nextIndex = (currentIndex + direction + mediaIds.length) % mediaIds.length;
      event.preventDefault();
      selectPhoto(mediaIds[nextIndex]);
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [currentMediaId, mediaIds, selectPhoto, setLiveGesture, setPendingMark]);

  const currentMedia = mediaById.get(currentMediaId);
  const currentUrls = useMemo(() => mediaUrls(currentMedia), [currentMedia]);
  const currentCallouts = callouts
    .map((callout, index) => ({ callout, index }))
    .filter(({ callout }) => callout.mediaId === currentMediaId);
  const pendingNumber = nextEditNumber(callouts, changeRequests);

  const gestureMark = gesture ? completedMarkForPreview(gesture) : null;
  const visiblePending =
    gestureMark ?? (pendingMark?.mediaId === currentMediaId ? pendingMark : null);

  const pointFromPointer = useCallback((event: React.PointerEvent): ShapePoint | null => {
    const rect = frameRef.current?.getBoundingClientRect();
    if (!rect?.width || !rect.height) return null;
    return {
      x: clampUnit((event.clientX - rect.left) / rect.width),
      y: clampUnit((event.clientY - rect.top) / rect.height),
    };
  }, []);

  const handlePointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
    if (
      readOnly ||
      !currentMediaId ||
      (event.pointerType === 'mouse' && event.button !== 0) ||
      (event.target as HTMLElement).closest('button')
    ) {
      return;
    }
    const point = pointFromPointer(event);
    if (!point) return;
    event.preventDefault();
    if (tool === 'pin') {
      setPendingMark(pinMark(currentMediaId, point));
      focusComposer();
      return;
    }
    event.currentTarget.setPointerCapture(event.pointerId);
    setLiveGesture({ mediaId: currentMediaId, tool, start: point, points: [point] });
  };

  const handlePointerMove = (event: React.PointerEvent<HTMLDivElement>) => {
    const active = gestureRef.current;
    if (!active) return;
    const point = pointFromPointer(event);
    if (!point) return;
    event.preventDefault();
    setLiveGesture(updateGesture(active, point));
  };

  const handlePointerUp = (event: React.PointerEvent<HTMLDivElement>) => {
    const active = gestureRef.current;
    if (!active) return;
    const point = pointFromPointer(event);
    const finalGesture = point ? updateGesture(active, point) : active;
    const mark = completedMark(finalGesture);
    setLiveGesture(null);
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
    if (!mark) return;
    setPendingMark(mark);
    focusComposer();
  };

  const removePhoto = useCallback(
    (mediaId: number) => {
      const previous = getValues('mediaIds') ?? [];
      const removedIndex = previous.indexOf(mediaId);
      const nextMediaIds = previous.filter((id) => id !== mediaId);
      setValue('mediaIds', nextMediaIds, { shouldDirty: true });

      const current = (getValues('callouts') ?? []) as FormCallout[];
      const nextCallouts = current.map((callout) =>
        callout.mediaId === mediaId
          ? {
              ...callout,
              mediaId: 0,
              posX: '',
              posY: '',
              kind: 'pin' as const,
              points: [],
              dashed: false,
              filled: false,
              caps: undefined,
            }
          : callout,
      );
      if (nextCallouts.some((callout, index) => callout !== current[index])) {
        setValue('callouts', nextCallouts, { shouldDirty: true });
      }
      if (pendingMark?.mediaId === mediaId) setPendingMark(null);

      if (currentMediaId === mediaId) {
        const fallbackIndex = Math.min(Math.max(removedIndex, 0), nextMediaIds.length - 1);
        selectPhoto(nextMediaIds[fallbackIndex] ?? 0);
      }
      setRemoveId(null);
    },
    [currentMediaId, getValues, pendingMark?.mediaId, selectPhoto, setPendingMark, setValue],
  );

  const requestRemove = (mediaId: number) => {
    const hasDrawing = callouts.some(
      (callout) =>
        callout.mediaId === mediaId &&
        (callout.kind ?? 'pin') !== 'pin' &&
        (callout.points?.length ?? 0) > 0,
    );
    if (hasDrawing) setRemoveId(mediaId);
    else removePhoto(mediaId);
  };

  const removalDrawingCount = callouts.filter(
    (callout) =>
      callout.mediaId === removeId &&
      (callout.kind ?? 'pin') !== 'pin' &&
      (callout.points?.length ?? 0) > 0,
  ).length;

  return (
    <>
      <Section title='Photos' className='min-w-0 lg:flex-[1.5]'>
        <Toolbar className='max-[699px]:flex-nowrap max-[699px]:overflow-x-auto'>
          <ViewSwitch
            value={tool}
            options={TOOL_OPTIONS}
            onChange={setTool}
            label='drawing tool'
            disabled={readOnly}
            className='shrink-0'
          />
        </Toolbar>

        <div className='flex min-h-[420px] items-center justify-center bg-pageBg max-[699px]:-mx-block max-[699px]:min-h-0'>
          {currentMediaId ? (
            <div
              ref={frameRef}
              onPointerDown={handlePointerDown}
              onPointerMove={handlePointerMove}
              onPointerUp={handlePointerUp}
              onPointerCancel={() => setLiveGesture(null)}
              className={cn(
                'relative inline-block max-w-full touch-none select-none leading-none',
                readOnly ? 'cursor-default' : 'cursor-crosshair',
              )}
            >
              <StageImage urls={currentUrls} alt='fitting photo' onLoad={measureFrame} />
              {frameSize.width > 0 && frameSize.height > 0 && (
                <svg
                  viewBox={`0 0 ${frameSize.width} ${frameSize.height}`}
                  preserveAspectRatio='none'
                  aria-hidden='true'
                  className='pointer-events-none absolute inset-0 h-full w-full overflow-visible'
                >
                  <defs>
                    <AnnotationDefs />
                  </defs>
                  {currentCallouts.map(({ callout, index }) => (
                    <DrawingShape
                      key={`${callout.number ?? 0}:${index}`}
                      mark={callout}
                      frameSize={frameSize}
                      hot={(callout.number ?? 0) === hotNumber}
                    />
                  ))}
                  {visiblePending && (
                    <DrawingShape mark={visiblePending} frameSize={frameSize} pending />
                  )}
                </svg>
              )}

              {currentCallouts.map(({ callout, index }) => {
                const marker = markerOf(callout);
                const number = callout.number ?? index + 1;
                return (
                  <Pin
                    key={`pin:${number}:${index}`}
                    x={marker.x * 100}
                    y={marker.y * 100}
                    label={number}
                    highlighted={number === hotNumber}
                    title={`edit ${number}`}
                    onMouseEnter={() => setHotNumber(number)}
                    onMouseLeave={() => setHotNumber(null)}
                    onClick={() => setHotNumber(number)}
                  />
                );
              })}
              {visiblePending && (
                <span className='[&>span]:!bg-warning'>
                  <Pin
                    x={markerOf(visiblePending).x * 100}
                    y={markerOf(visiblePending).y * 100}
                    label={pendingNumber}
                    title='pending mark'
                  />
                </span>
              )}
            </div>
          ) : (
            <Text size='micro' variant='label'>
              no photo
            </Text>
          )}
        </div>

        <div className='flex gap-2 overflow-x-auto p-0.5'>
          {mediaIds.map((mediaId, index) => (
            <PhotoThumbnail
              key={mediaId}
              media={mediaById.get(mediaId)}
              index={index}
              current={mediaId === currentMediaId}
              onSelect={() => selectPhoto(mediaId)}
              onRemove={readOnly ? undefined : () => requestRemove(mediaId)}
            />
          ))}
          {!readOnly && (
            <MediaSelector
              label='add fitting photo'
              purpose='fitting photos'
              aspectRatio={['Custom']}
              allowMultiple
              showVideos={false}
              saveSelectedMedia={addMedia}
              trigger={
                <AddDoor
                  shape='tile'
                  className='h-20 w-16 shrink-0 max-[699px]:h-[60px] max-[699px]:w-12'
                >
                  photo
                </AddDoor>
              }
            />
          )}
        </div>
      </Section>

      {pasteIntake.dialog}

      <ConfirmationModal
        open={removeId != null}
        onOpenChange={(open) => !open && setRemoveId(null)}
        title='Remove photo?'
        confirmLabel='Remove photo'
        cancelLabel='Keep photo'
        onConfirm={() => removeId != null && removePhoto(removeId)}
        onCancel={() => setRemoveId(null)}
        width='sm'
      >
        <Text>{`${removalDrawingCount} drawing${removalDrawingCount === 1 ? '' : 's'} become points.`}</Text>
      </ConfirmationModal>
    </>
  );
}

function completedMarkForPreview(gesture: Gesture): PendingMark {
  const first = gesture.points[0] ?? gesture.start;
  const last = gesture.points[gesture.points.length - 1] ?? first;
  const marker = gesture.tool === 'label' ? last : first;
  const points = gesture.tool === 'label' ? [first] : gesture.points;
  return {
    mediaId: gesture.mediaId,
    kind: gesture.tool as AnnotationKindKey,
    posX: marker.x.toFixed(3),
    posY: marker.y.toFixed(3),
    points: points.map(pointToDecimal),
  };
}
