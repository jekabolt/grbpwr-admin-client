import { ChevronLeftIcon, ChevronRightIcon } from '@radix-ui/react-icons';
import * as Tooltip from '@radix-ui/react-tooltip';
import { common_MediaFull } from 'api/proto-http/admin';
import { MediaSelector } from 'components/managers/media/components/media-selector';
import { cn } from 'lib/utility';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useController, useFieldArray, useFormContext, useWatch } from 'react-hook-form';
import Text from 'ui/components/text';
import { FittingFormData } from './schema';

const clamp01 = (n: number) => Math.min(1, Math.max(0, n));
const SLIDE_STEP = 176; // ~ one card + gap, keeps the ‹ › buttons in sync with card width

type FormCallout = {
  number?: number;
  note?: string;
  mediaId?: number;
  posX?: string;
  posY?: string;
};

// The fitting's photos, shown as a horizontal carousel (task 5). Fit-note callouts are pinned
// directly on their photo — always-visible numbered markers, full note text on hover/focus —
// so a reviewer reads "what's wrong" in place instead of cross-referencing a separate list.
// The resolved-media map (saved fitting.media + freshly-picked) is owned by the parent
// FittingForm and shared with FittingCallouts' notes list, so a just-picked photo can be
// annotated without a save/reload.
export function FittingMedia({
  mediaById,
  onPicked,
}: {
  mediaById: Map<number, common_MediaFull>;
  onPicked: (items: common_MediaFull[]) => void;
}) {
  const { control, setValue } = useFormContext<FittingFormData>();
  const { field } = useController({ control, name: 'mediaIds' });
  const { fields, append } = useFieldArray({ control, name: 'callouts' });
  const callouts = (useWatch({ control, name: 'callouts' }) ?? []) as FormCallout[];

  const mediaIds = field.value ?? [];
  const mediaLinks = mediaIds
    .map((id) => mediaById.get(id))
    .filter((m): m is common_MediaFull => m != null);

  const scrollerRef = useRef<HTMLDivElement>(null);
  const scrollBy = (dir: 1 | -1) =>
    scrollerRef.current?.scrollBy({ left: dir * SLIDE_STEP, behavior: 'smooth' });

  function handleAdd(picked: common_MediaFull[]) {
    if (!picked.length) return;
    const unique = picked.filter((m) => !(field.value ?? []).includes(m.id || 0));
    if (!unique.length) return;
    onPicked(unique);
    const ids = unique.map((m) => m.id).filter((id): id is number => id != null);
    field.onChange([...(field.value ?? []), ...ids]);
  }

  function handleDelete(id: number) {
    field.onChange((field.value ?? []).filter((v) => v !== id));
  }

  // When a photo is removed from the fitting, un-pin any fit note that was on it — keep the
  // note text but drop the now-dead pin + coords so it isn't saved pointing at a media no
  // longer attached (which could never be shown/repositioned again).
  const prevMediaIdsRef = useRef<number[]>(mediaIds);
  useEffect(() => {
    const prev = prevMediaIdsRef.current;
    prevMediaIdsRef.current = mediaIds;
    const removed = prev.filter((id) => !mediaIds.includes(id));
    if (!removed.length) return;
    callouts.forEach((c, i) => {
      if (c.mediaId && removed.includes(c.mediaId)) {
        setValue(`callouts.${i}.mediaId`, 0, { shouldDirty: true });
        setValue(`callouts.${i}.posX`, '', { shouldDirty: true });
        setValue(`callouts.${i}.posY`, '', { shouldDirty: true });
      }
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mediaIds]);

  function addPinTo(mediaId: number, x: number, y: number) {
    append({ number: fields.length + 1, note: '', mediaId, posX: x.toFixed(3), posY: y.toFixed(3) });
  }

  // Stable reference: it's a dependency of PhotoSlide's window pointermove/pointerup
  // listeners, so a fresh function on every keystroke elsewhere in this long form would
  // otherwise tear down and re-attach those listeners on every unrelated re-render.
  const movePin = useCallback(
    (index: number, x: number, y: number) => {
      setValue(`callouts.${index}.posX`, x.toFixed(3), { shouldDirty: true });
      setValue(`callouts.${index}.posY`, y.toFixed(3), { shouldDirty: true });
    },
    [setValue],
  );

  return (
    <Tooltip.Provider delayDuration={150}>
      <div className='space-y-2'>
        <div className='flex items-center justify-between gap-2'>
          <Text variant='inactive' size='small'>
            {mediaLinks.length
              ? `${mediaLinks.length} photo${mediaLinks.length === 1 ? '' : 's'} · click one to pin a fit note`
              : 'add a photo to start pinning fit notes'}
          </Text>
          {mediaLinks.length > 1 && (
            <div className='flex shrink-0 gap-1'>
              <button
                type='button'
                aria-label='scroll photos left'
                onClick={() => scrollBy(-1)}
                className='flex size-6 items-center justify-center border border-textInactiveColor hover:bg-highlightColor/5'
              >
                <ChevronLeftIcon />
              </button>
              <button
                type='button'
                aria-label='scroll photos right'
                onClick={() => scrollBy(1)}
                className='flex size-6 items-center justify-center border border-textInactiveColor hover:bg-highlightColor/5'
              >
                <ChevronRightIcon />
              </button>
            </div>
          )}
        </div>

        <div
          ref={scrollerRef}
          className='flex snap-x snap-mandatory gap-3 overflow-x-auto scroll-smooth pb-2'
        >
          {mediaLinks.map((m) => {
            const id = m.id || 0;
            const pins = callouts
              .map((c, index) => ({ ...c, index }))
              .filter((c) => c.mediaId === id);
            return (
              <PhotoSlide
                key={id}
                media={m}
                pins={pins}
                onAddPin={(x, y) => addPinTo(id, x, y)}
                onMovePin={movePin}
                onDelete={() => handleDelete(id)}
              />
            );
          })}

          <div
            className='relative flex w-40 shrink-0 snap-start flex-col items-center justify-center gap-2 border border-dashed border-textInactiveColor sm:w-48'
            style={{ aspectRatio: '3/4' }}
          >
            <MediaSelector
              label='+ add photo'
              purpose='fitting photos'
              aspectRatio={['3:4']}
              allowMultiple
              showVideos
              saveSelectedMedia={handleAdd}
              triggerClassName='px-3 py-1.5 cursor-pointer'
            />
            <Text variant='inactive' size='small'>
              any ratio
            </Text>
          </div>
        </div>
      </div>
    </Tooltip.Provider>
  );
}

// One photo's slide: the image, its delete control, and its own pin markers/drag handling.
// Coordinates are scoped to this slide's own bounding box, so multiple photos in the carousel
// never fight over a single "active image" the way the old tab-switcher did.
function PhotoSlide({
  media,
  pins,
  onAddPin,
  onMovePin,
  onDelete,
}: {
  media: common_MediaFull;
  pins: Array<FormCallout & { index: number }>;
  onAddPin: (x: number, y: number) => void;
  onMovePin: (index: number, x: number, y: number) => void;
  onDelete: () => void;
}) {
  const url = media.media?.thumbnail?.mediaUrl || media.media?.fullSize?.mediaUrl || '';
  const wrapRef = useRef<HTMLDivElement>(null);
  const dragIdxRef = useRef<number | null>(null);
  const dragPosRef = useRef<{ x: number; y: number } | null>(null);
  const [dragPos, setDragPos] = useState<{ idx: number; x: number; y: number } | null>(null);

  function coords(clientX: number, clientY: number) {
    const rect = wrapRef.current?.getBoundingClientRect();
    if (!rect || rect.width === 0) return { x: 0, y: 0 };
    return {
      x: clamp01((clientX - rect.left) / rect.width),
      y: clamp01((clientY - rect.top) / rect.height),
    };
  }

  useEffect(() => {
    function move(e: PointerEvent) {
      if (dragIdxRef.current == null) return;
      const p = coords(e.clientX, e.clientY);
      dragPosRef.current = p;
      setDragPos({ idx: dragIdxRef.current, ...p });
    }
    function up() {
      const idx = dragIdxRef.current;
      const p = dragPosRef.current;
      if (idx != null && p) onMovePin(idx, p.x, p.y);
      dragIdxRef.current = null;
      dragPosRef.current = null;
      setDragPos(null);
    }
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
    return () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [onMovePin]);

  function handleClick(e: React.MouseEvent) {
    if (dragIdxRef.current != null) return;
    const { x, y } = coords(e.clientX, e.clientY);
    onAddPin(x, y);
  }

  return (
    <div className='relative shrink-0 snap-start'>
      <div
        ref={wrapRef}
        className='relative w-40 touch-none overflow-hidden border border-textInactiveColor sm:w-48'
        style={{ aspectRatio: '3/4' }}
      >
        <img
          src={url}
          alt=''
          onClick={handleClick}
          className='absolute inset-0 h-full w-full cursor-crosshair select-none object-cover'
          draggable={false}
        />
        {pins.map((c) => {
          const dragging = dragPos?.idx === c.index;
          const x = dragging ? dragPos!.x : parseFloat(c.posX ?? '');
          const y = dragging ? dragPos!.y : parseFloat(c.posY ?? '');
          if (Number.isNaN(x) || Number.isNaN(y)) return null;
          const label = c.number ?? c.index + 1;
          return (
            <Tooltip.Root key={c.index} delayDuration={150}>
              <Tooltip.Trigger asChild>
                <button
                  type='button'
                  onPointerDown={(e) => {
                    e.stopPropagation();
                    dragIdxRef.current = c.index;
                    const p = coords(e.clientX, e.clientY);
                    dragPosRef.current = p;
                    setDragPos({ idx: c.index, ...p });
                  }}
                  onClick={(e) => e.stopPropagation()}
                  className={cn(
                    'absolute flex size-5 -translate-x-1/2 -translate-y-1/2 items-center justify-center',
                    'rounded-full border-2 border-bgColor bg-textColor text-[10px] leading-none text-bgColor',
                    'cursor-move shadow transition-transform hover:scale-125',
                  )}
                  style={{ left: `${x * 100}%`, top: `${y * 100}%` }}
                  aria-label={`fit note ${label}${c.note ? `: ${c.note}` : ' (no note yet)'}`}
                >
                  {label}
                </button>
              </Tooltip.Trigger>
              <Tooltip.Portal>
                <Tooltip.Content
                  side='top'
                  sideOffset={6}
                  className='z-[var(--z-popover)] max-w-56 border border-textInactiveColor bg-bgColor px-2 py-1 text-textBaseSize text-textColor shadow'
                >
                  {c.note?.trim() || 'no note yet — see fit notes below'}
                </Tooltip.Content>
              </Tooltip.Portal>
            </Tooltip.Root>
          );
        })}
      </div>
      <button
        type='button'
        aria-label='remove photo'
        onClick={onDelete}
        className='absolute right-1 top-1 z-20 cursor-pointer border border-textInactiveColor bg-bgColor px-1 leading-none hover:bg-textColor hover:text-bgColor'
      >
        [x]
      </button>
    </div>
  );
}
