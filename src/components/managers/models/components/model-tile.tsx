import { common_MediaFull, common_Model } from 'api/proto-http/admin';
import { BODY_MEASUREMENT_GROUPS } from 'components/managers/model/components/measurements';
import { titleCase } from 'components/managers/model/components/measurements-fields';
import { readPins } from 'components/managers/model/components/model-pins';
import { MODEL_MEASUREMENTS } from 'components/managers/model/components/sheet-measurement-focus';
import {
  displayMeasurementValue,
  useMeasurementUnit,
} from 'components/managers/model/components/units';
import { useSizeNames } from 'components/managers/model/components/use-size-systems';
import { genderOptions } from 'constants/filter';
import { cn } from 'lib/utility';
import { type KeyboardEvent, type MouseEvent, type ReactNode, useMemo, useRef } from 'react';
import { Button, Iconoir, SelectWords } from 'ui';
import { ModelMeta } from './model-meta';

export type ModelTileState = 'default' | 'selected';

/** The pool card's box: 300 × 499, padding 8, no frame (Lekalo `.mk`). */
export const MODEL_TILE_BOX = 'h-124.75 w-75 shrink-0 p-2';
/** The compact card: a cell of the 4 × 2 page (Lekalo proportions while the screen is tall enough). */
// Always a quarter of the page's width; the height is 300:499 of that, capped so two rows fit the
// screen — on a short screen the photo area gives up the height, the card keeps its width.
const COMPACT_BOX =
  'w-[calc((100cqw-1.5rem)/4)] h-[min(calc((100cqw-1.5rem)/4*499/300),calc((100dvh-20rem)/2))] min-w-0 shrink-0 p-1.5';
/** Header and name of a card, by size: the compact one takes the 18px headline, not the 32px display. */
const HEAD = { full: 'min-h-26', compact: 'h-auto pb-2' } as const;
const NAME = {
  full: 'pt-3 pr-10 text-display leading-[1.15]',
  compact: 'pt-1.5 pr-7 text-lg leading-tight',
} as const;
/** The background fade between rest / hover / selected (Lekalo: 700ms soft). */
const TILE_FADE = 'transition-colors duration-700 ease-soft motion-reduce:transition-none';

const LABEL_BY_NAME = new Map(MODEL_MEASUREMENTS.map((m) => [m.name as string, m.label]));
const MEASUREMENT_ORDER = BODY_MEASUREMENT_GROUPS.flatMap((g) => g.measurements.map((m) => m.name));

export function genderLabel(gender?: string): string | null {
  if (!gender || gender === 'GENDER_ENUM_UNKNOWN') return null;
  const label = genderOptions.find((g) => g.value === gender)?.label;
  return label ? label.charAt(0).toUpperCase() + label.slice(1) : null;
}

/** `xs_44ta_m` → `XS`, `42.5` stays: the code before the system suffix. */
function shortSize(name: string) {
  return name.split('_')[0].toUpperCase();
}

/** `[S, M, 42.5]`, `[Size]` when none. */
export function useSizesShort(ids: number[] | undefined): string {
  const names = useSizeNames();
  const short = [...new Set((ids ?? []).map((id) => shortSize(names.get(id) ?? `#${id}`)))];
  return `[${short.length ? short.join(', ') : 'Size'}]`;
}

/** Thumbnail first, then the rest, in `mediaIds` order when given; `known` resolves fresh picks. */
export function orderedMedia(
  model: common_Model | undefined,
  mediaIds?: number[],
  known: common_MediaFull[] = [],
): common_MediaFull[] {
  const all = [...known, ...(model?.media ?? [])];
  const order = mediaIds?.length
    ? mediaIds
    : [model?.thumbnail?.id, ...(model?.media ?? []).map((m) => m.id)].filter(
        (id): id is number => !!id,
      );
  const byId = new Map(all.map((m) => [m.id, m]));
  const seen = new Set<number>();
  const out: common_MediaFull[] = [];
  for (const id of order) {
    const m = byId.get(id);
    if (m && !seen.has(id)) {
      seen.add(id);
      out.push(m);
    }
  }
  return out;
}

function stop(e: MouseEvent | KeyboardEvent) {
  e.stopPropagation();
}

/**
 * The photo area of a card: `placeholder` grey with a white `+` when empty; photos page sideways
 * inside it (scroll-snap), prev / next arrows on hover, `n photos` bottom-right. The pager is marked
 * `data-step-row-inner`, so a sideways wheel over it pages the photos, not the pool.
 */
export function TilePhotos({ media, empty }: { media: common_MediaFull[]; empty?: ReactNode }) {
  const pager = useRef<HTMLDivElement>(null);
  const page = (dir: 1 | -1) => (e: MouseEvent) => {
    e.stopPropagation();
    const node = pager.current;
    if (node) node.scrollBy({ left: dir * node.clientWidth, behavior: 'smooth' });
  };

  if (!media.length) {
    return (
      <div className='relative grid min-h-20 flex-1 place-items-center bg-placeholder text-bgColor'>
        {empty ?? <Iconoir name='plus' className='size-4' strokeWidth={1.6} />}
      </div>
    );
  }

  return (
    <div className='group/photos relative min-h-20 flex-1 overflow-hidden bg-bgColor'>
      <div
        ref={pager}
        data-step-row-inner=''
        className='flex h-full snap-x snap-mandatory overflow-x-auto scroll-smooth'
      >
        {media.map((m, i) => {
          const url =
            m.media?.compressed?.mediaUrl ||
            m.media?.thumbnail?.mediaUrl ||
            m.media?.fullSize?.mediaUrl ||
            '';
          return (
            <img
              key={m.id ?? i}
              src={url}
              alt=''
              loading='lazy'
              draggable={false}
              className='h-full w-full flex-none snap-start object-cover'
            />
          );
        })}
      </div>
      {media.length > 1 && (
        <>
          {(
            [
              [-1, 'previous photo', 'nav-arrow-left', 'left-1.5'],
              [1, 'next photo', 'nav-arrow-right', 'right-1.5'],
            ] as const
          ).map(([dir, label, icon, side]) => (
            <Button
              key={dir}
              type='button'
              variant='default'
              aria-label={label}
              onClick={page(dir)}
              onDoubleClick={stop}
              className={cn(
                'absolute top-1/2 grid size-6.5 -translate-y-1/2 place-items-center bg-bgColor/80 text-labelDark opacity-0 transition-opacity duration-500 group-hover/photos:opacity-100 hover:bg-bgColor hover:text-ink focus-visible:opacity-100 [@media(hover:none)]:opacity-100',
                side,
              )}
            >
              <Iconoir name={icon} />
            </Button>
          ))}
          <span className='pointer-events-none absolute right-2 bottom-1.5 text-nano text-bgColor/90'>
            {media.length} photos
          </span>
        </>
      )}
    </div>
  );
}

/** Pinned measurements of a stored model that carry a value: `label value unit` chips. */
function PinChips({ model }: { model: common_Model }) {
  const { unit } = useMeasurementUnit();
  const pins = useMemo(() => new Set(readPins(String(model.id ?? ''))), [model.id]);
  const values = new Map(
    (model.model?.measurements ?? []).map((m) => [m.name as string, m.valueMm]),
  );
  const chips = MEASUREMENT_ORDER.filter((name) => pins.has(name))
    .map((name) => ({ name, value: displayMeasurementValue(values.get(name), unit) }))
    .filter((c) => c.value);
  if (!chips.length) return null;
  return (
    <div className='mt-2.5 flex min-h-0 flex-wrap content-start gap-1 overflow-hidden'>
      {chips.map((c) => (
        <span
          key={c.name}
          className='max-w-35 truncate bg-textColor/[0.035] px-1.75 py-1 text-control text-ink'
        >
          <span className='text-labelDark'>{titleCase(LABEL_BY_NAME.get(c.name) ?? c.name)}</span>{' '}
          {c.value} {unit}
        </span>
      ))}
    </div>
  );
}

/**
 * One card of the models pool (Lekalo `.mk`): 300 × 499, `fieldFill` at rest, `pageBg` on hover,
 * `cardOn` when selected (ink name); no frame. Header: the 32px name, the meta row (`ModelMeta`:
 * gender and sizes, editable in place), the pinned measurements as chips; the photos fill the rest.
 * THE TASKBOARD SELECTION: one click selects (the words «Edit» / «Delete» come in above the card,
 * at the right), a click on it again or outside lets it go, double click / Enter opens.
 */
export function ModelTile({
  model,
  state,
  canEdit,
  onSelect,
  onOpen,
  onDelete,
  onPatch,
  busy,
  compact,
}: {
  model: common_Model;
  state: ModelTileState;
  canEdit: boolean;
  onSelect: () => void;
  onOpen: () => void;
  onDelete: () => void;
  /** Gender / sizes changed in place on the card: written to the model at once. */
  onPatch?: (change: { gender?: string; defaultSizeIds?: number[] }) => void;
  /** A write of this card is in flight: its editors wait. */
  busy?: boolean;
  /** A cell of the compact 4 × 2 view. */
  compact?: boolean;
}) {
  const size = compact ? 'compact' : 'full';
  const insert = model.model;
  const name = insert?.name || `Model #${model.id}`;
  const selected = state === 'selected';
  const media = orderedMedia(model);
  const words = [
    { key: 'edit', label: 'Edit', onClick: onOpen },
    ...(canEdit ? [{ key: 'delete', label: 'Delete', onClick: onDelete }] : []),
  ];

  return (
    <div className='flex shrink-0 flex-col' data-model-tile={model.id}>
      {/* The words of the selection stand above the card, at the right; their row is always there,
          so selecting a card moves nothing. */}
      <SelectWords
        shown={selected}
        items={words}
        className={selected ? undefined : 'pointer-events-none'}
      />
      <div
        role='option'
        aria-selected={selected}
        aria-label={name}
        tabIndex={0}
        onClick={onSelect}
        onDoubleClick={onOpen}
        onKeyDown={(e) => {
          if (e.target !== e.currentTarget) return;
          if (e.key === 'Enter') {
            e.preventDefault();
            onOpen();
          } else if (e.key === ' ') {
            e.preventDefault();
            onSelect();
          }
        }}
        className={cn(
          compact ? COMPACT_BOX : MODEL_TILE_BOX,
          TILE_FADE,
          'group flex cursor-pointer flex-col select-none focus-visible:outline focus-visible:outline-1 focus-visible:-outline-offset-1 focus-visible:outline-ink',
          selected ? 'bg-cardOn' : 'bg-fieldFill hover:bg-pageBg',
        )}
      >
        <div className={cn('relative flex shrink-0 flex-col', HEAD[size])}>
          <span
            className={cn(
              'shrink-0 truncate',
              NAME[size],
              TILE_FADE,
              selected ? 'text-ink' : 'text-titleMuted',
            )}
          >
            {name}
          </span>
          <ModelMeta
            className='mt-1.5'
            gender={insert?.gender}
            sizeIds={insert?.defaultSizeIds}
            busy={busy}
            onGender={canEdit && onPatch ? (gender) => onPatch({ gender }) : undefined}
            onSizes={canEdit && onPatch ? (ids) => onPatch({ defaultSizeIds: ids }) : undefined}
          />
          {!compact && <PinChips model={model} />}
        </div>
        <TilePhotos media={media} />
      </div>
    </div>
  );
}

/** The last card of the pool for writers: the door to a new model. */
export function NewModelTile({ onOpen, compact }: { onOpen: () => void; compact?: boolean }) {
  const size = compact ? 'compact' : 'full';
  return (
    <div
      role='button'
      tabIndex={0}
      aria-label='new model'
      onClick={onOpen}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onOpen();
        }
      }}
      className={cn(
        compact ? COMPACT_BOX : MODEL_TILE_BOX,
        TILE_FADE,
        'group mt-7 flex cursor-pointer flex-col bg-fieldFill select-none hover:bg-pageBg focus-visible:outline focus-visible:outline-1 focus-visible:-outline-offset-1 focus-visible:outline-ink',
      )}
    >
      <div className={cn('relative flex shrink-0 flex-col', HEAD[size])}>
        <span className={cn('shrink-0 truncate text-titleMuted', NAME[size])}>New Model</span>
        <span
          className={cn(
            'absolute right-0 grid size-7 place-items-center text-titleMuted group-hover:text-ink',
            compact ? 'top-0.5' : 'top-3.5',
          )}
        >
          <Iconoir name='plus' className='size-4.5' />
        </span>
        <div className='mt-1.5 flex justify-between gap-3 text-control text-labelDark'>
          <span>Gender</span>
          <span>[Size]</span>
        </div>
      </div>
      <TilePhotos media={[]} />
    </div>
  );
}
