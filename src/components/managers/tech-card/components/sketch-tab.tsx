import { common_MediaFull, common_TechCard, common_TechCardMediaKind } from 'api/proto-http/admin';
import { MediaSelector } from 'components/managers/media/components/media-selector';
import { techCardMediaKindOptions } from 'constants/filter';
import { cn } from 'lib/utility';
import { useId, useMemo, useState } from 'react';
import { useController, useFieldArray, useFormContext, useWatch } from 'react-hook-form';
import { AnnotatedImage, type AnnotatedCallout } from 'ui/components/annotated-image';
import { Button } from 'ui/components/button';
import Text from 'ui/components/text';
import { ToggleSwitch } from 'ui/components/toggle-switch';
import ComboField from 'ui/form/fields/combo-field';
import InputField from 'ui/form/fields/input-field';
import SelectField from 'ui/form/fields/select-field';
import TextareaField from 'ui/form/fields/textarea-field';
import { pieceCodeOptions } from './piece-codes';
import { TechCardFormData } from './schema';

const kindLabels: Record<string, string> = Object.fromEntries(
  techCardMediaKindOptions.map((o) => [o.value, o.label]),
);

const TECHNICAL_KINDS: common_TechCardMediaKind[] = [
  'TECH_CARD_MEDIA_KIND_FRONT',
  'TECH_CARD_MEDIA_KIND_BACK',
  'TECH_CARD_MEDIA_KIND_DETAIL',
  'TECH_CARD_MEDIA_KIND_LINING',
  'TECH_CARD_MEDIA_KIND_PREVIEW',
];
const MOODBOARD_KINDS: common_TechCardMediaKind[] = [
  'TECH_CARD_MEDIA_KIND_MOODBOARD',
  'TECH_CARD_MEDIA_KIND_REFERENCE',
  'TECH_CARD_MEDIA_KIND_SWATCH',
];

type MediaListName = 'moodboardMedia' | 'technicalMedia';

type FormCallout = {
  number?: number;
  part?: string;
  description?: string;
  dimensions?: string;
  mediaId?: number;
  posX?: string;
  posY?: string;
};

function Section({
  title,
  className,
  children,
}: {
  title: string;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <section className={cn('space-y-4 border border-textInactiveColor p-4', className)}>
      <Text variant='uppercase' size='large'>
        {title}
      </Text>
      {children}
    </section>
  );
}

// Frame the tile to the media's own aspect ratio so the picture fills it exactly (no crop,
// no letterbox) — which keeps every pin mapped 1:1 onto the image it was placed on.
function mediaAspect(full?: common_MediaFull): string {
  const dim = full?.media?.fullSize ?? full?.media?.thumbnail;
  const w = dim?.width;
  const h = dim?.height;
  return w && h ? `${w}/${h}` : '4/5';
}

const mediaUrl = (full?: common_MediaFull): string =>
  full?.media?.fullSize?.mediaUrl || full?.media?.thumbnail?.mediaUrl || '';

// The editable body of a callout's sticky note: just its text. The structured fields (part,
// dimensions, number, which image it's pinned to) live in the collapsed "all callouts" list
// below, so the note that pops on a pin stays small and legible — a place to write, not a form.
function CalloutNoteBody({ index }: { index: number }) {
  const { control } = useFormContext<TechCardFormData>();
  const { field } = useController({ control, name: `callouts.${index}.description` });
  return (
    <textarea
      {...field}
      value={field.value ?? ''}
      rows={3}
      maxLength={2000}
      placeholder='describe this callout…'
      onKeyDown={(e) => {
        if (e.key === 'Escape') {
          e.preventDefault();
          e.currentTarget.blur();
        }
      }}
      className='w-full resize-none border border-textInactiveColor bg-bgColor p-1.5 text-textBaseSize text-textColor placeholder:text-labelColor focus:border-textColor focus:outline-none'
    />
  );
}

// A grid of annotated image tiles for one media list (moodboard OR technical). Owns that list's
// media (add / remove) and the callouts pinned onto it — the same image is the picker, the
// preview, and the annotation canvas all at once, so it is only ever shown once.
function AnnotatedMediaGrid({
  listName,
  mediaById,
  onPickedMedia,
  gridClassName,
  zoomable,
  notesMode,
  pinSize,
  emptyLabel,
  addLabel,
  purpose,
}: {
  listName: MediaListName;
  mediaById: Map<number, common_MediaFull>;
  onPickedMedia: (items: common_MediaFull[]) => void;
  gridClassName: string;
  zoomable: boolean;
  notesMode: 'hover' | 'auto';
  pinSize: 'sm' | 'md';
  emptyLabel: string;
  addLabel: string;
  purpose: string;
}) {
  const { control, getValues, setValue } = useFormContext<TechCardFormData>();
  const mediaFA = useFieldArray({ control, name: listName });
  const calloutFA = useFieldArray({ control, name: 'callouts' });
  const calloutValues = (useWatch({ control, name: 'callouts' }) ?? []) as FormCallout[];
  const [addMode, setAddMode] = useState(false);
  const [showAllNotes, setShowAllNotes] = useState(false);

  const isMoodboard = listName === 'moodboardMedia';
  const siblingName: MediaListName = isMoodboard ? 'technicalMedia' : 'moodboardMedia';
  const kinds = isMoodboard ? MOODBOARD_KINDS : TECHNICAL_KINDS;
  const kindOptions = techCardMediaKindOptions.filter((o) => kinds.includes(o.value));
  const defaultKind: common_TechCardMediaKind = kinds[0];

  // max+1, not length+1: after a mid-list delete, length+1 collides with an existing number —
  // and pieces/operations/issues reference callouts BY number.
  const nextNumber = () =>
    Math.max(0, ...calloutValues.map((c) => (Number.isFinite(c.number) ? Number(c.number) : 0))) +
    1;

  function handleAddMedia(items: common_MediaFull[]) {
    // Dedupe against BOTH lists — media ids are assumed unique across technical ∪ moodboard.
    const selectedIds = mediaFA.fields.map((f) => f.mediaId);
    const siblingIds = (getValues(siblingName) ?? []).map((m) => m.mediaId);
    const fresh = items.filter(
      (it) => it.id != null && !selectedIds.includes(it.id) && !siblingIds.includes(it.id),
    );
    if (!fresh.length) return;
    onPickedMedia(fresh);
    for (const it of fresh) mediaFA.append({ mediaId: it.id as number, kind: defaultKind });
  }

  // Removing an image un-pins its callouts (keeps the text, drops the now-dead pin) so the
  // payload never carries a media id that is on neither list.
  function removeMediaAt(index: number) {
    const removedId = mediaFA.fields[index]?.mediaId;
    mediaFA.remove(index);
    if (!removedId) return;
    const cs = getValues('callouts') ?? [];
    cs.forEach((c, ci) => {
      if (c.mediaId === removedId) {
        setValue(`callouts.${ci}.mediaId`, 0, { shouldDirty: true });
        setValue(`callouts.${ci}.posX`, '', { shouldDirty: true });
        setValue(`callouts.${ci}.posY`, '', { shouldDirty: true });
      }
    });
  }

  function addCalloutTo(mediaId: number, x: number, y: number) {
    calloutFA.append({
      number: nextNumber(),
      part: '',
      description: '',
      dimensions: '',
      mediaId,
      posX: x.toFixed(3),
      posY: y.toFixed(3),
    });
  }

  // Map a callout's stable field key back to its global index for RHF field paths.
  const keyToIndex = useMemo(
    () => new Map(calloutFA.fields.map((f, i) => [f.id, i] as const)),
    [calloutFA.fields],
  );

  const calloutsFor = (mediaId: number): AnnotatedCallout[] =>
    calloutFA.fields
      .map((f, index) => ({ f, index, c: calloutValues[index] }))
      .filter((x) => x.c?.mediaId === mediaId)
      .map((x) => {
        const px = parseFloat(x.c?.posX ?? '');
        const py = parseFloat(x.c?.posY ?? '');
        return {
          key: x.f.id,
          number: x.c?.number ?? x.index + 1,
          // legacy pinned-but-unplaced callouts fall back to centre so they stay reachable.
          xNorm: Number.isNaN(px) ? 0.5 : px,
          yNorm: Number.isNaN(py) ? 0.5 : py,
          hasText: !!x.c?.description?.trim(),
        };
      });

  const views = mediaFA.fields.filter((f) => !!mediaUrl(mediaById.get(f.mediaId)));
  const hasMedia = views.length > 0;

  return (
    <div className='space-y-3'>
      {hasMedia && (
        <div className='flex flex-wrap items-center justify-between gap-3'>
          <Text variant='label' size='small'>
            {addMode
              ? 'click a tile to drop a callout · drag a pin to move it'
              : 'hover or focus a pin to read and edit its note'}
          </Text>
          <div className='flex shrink-0 items-center gap-4'>
            {notesMode === 'auto' && (
              <ToggleSwitch
                checked={showAllNotes}
                onCheckedChange={setShowAllNotes}
                label='show all notes'
              />
            )}
            <ToggleSwitch checked={addMode} onCheckedChange={setAddMode} label='add callout' />
          </div>
        </div>
      )}

      {!hasMedia ? (
        <Text variant='label' size='small'>
          {emptyLabel}
        </Text>
      ) : (
        <div className={gridClassName}>
          {mediaFA.fields.map((mf, mIndex) => {
            const full = mediaById.get(mf.mediaId);
            const url = mediaUrl(full);
            if (!url) return null;
            return (
              <div key={mf.id} className='space-y-2'>
                <div className='relative'>
                  <AnnotatedImage
                    src={url}
                    alt={kindLabels[mf.kind ?? ''] ?? (isMoodboard ? 'reference' : 'sketch')}
                    aspectRatio={mediaAspect(full)}
                    callouts={calloutsFor(mf.mediaId)}
                    editable
                    addMode={addMode}
                    zoomable={zoomable}
                    notesMode={notesMode}
                    showAllNotes={showAllNotes}
                    pinSize={pinSize}
                    onAdd={(x, y) => addCalloutTo(mf.mediaId, x, y)}
                    onMove={(key, x, y) => {
                      const i = keyToIndex.get(key);
                      if (i == null) return;
                      setValue(`callouts.${i}.posX`, x.toFixed(3), { shouldDirty: true });
                      setValue(`callouts.${i}.posY`, y.toFixed(3), { shouldDirty: true });
                    }}
                    onRemove={(key) => {
                      const i = keyToIndex.get(key);
                      if (i != null) calloutFA.remove(i);
                    }}
                    noteTitle={(key) => {
                      const i = keyToIndex.get(key);
                      return i != null ? calloutValues[i]?.part || undefined : undefined;
                    }}
                    renderNote={(key) => {
                      const i = keyToIndex.get(key);
                      return i != null ? <CalloutNoteBody index={i} /> : null;
                    }}
                    cornerSlot={
                      <Button
                        type='button'
                        aria-label='remove image'
                        onClick={() => removeMediaAt(mIndex)}
                        className='border border-textInactiveColor bg-bgColor px-1 leading-none hover:bg-textColor hover:text-bgColor'
                      >
                        [x]
                      </Button>
                    }
                  />
                  <span className='pointer-events-none absolute left-1 top-1 z-[5] bg-textColor px-1.5 py-0.5'>
                    <Text className='!text-bgColor' size='small'>
                      {mIndex + 1}
                    </Text>
                  </span>
                </div>
                <SelectField name={`${listName}.${mIndex}.kind`} label='kind' items={kindOptions} />
              </div>
            );
          })}
        </div>
      )}

      <MediaSelector
        label={addLabel}
        purpose={purpose}
        aspectRatio={['Custom']}
        allowMultiple
        showVideos
        saveSelectedMedia={handleAddMedia}
        triggerClassName='uppercase px-3 py-1.5'
      />
    </div>
  );
}

// The full, structured callout editor — number, part code, dimensions, which image it is pinned
// to, and the note. Collapsed by default (the pins + their pop-out notes carry the day-to-day
// flow); this is the escape hatch for renumbering, re-pinning, or reaching an un-pinned callout.
function CalloutsList({
  mediaById,
  view,
}: {
  mediaById: Map<number, common_MediaFull>;
  view: 'technical' | 'moodboard';
}) {
  const { control } = useFormContext<TechCardFormData>();
  const { fields, remove } = useFieldArray({ control, name: 'callouts' });
  const callouts = (useWatch({ control, name: 'callouts' }) ?? []) as FormCallout[];
  const technicalMedia = (useWatch({ control, name: 'technicalMedia' }) ?? []) as Array<{
    mediaId: number;
    kind?: string;
  }>;
  const moodboardMedia = (useWatch({ control, name: 'moodboardMedia' }) ?? []) as Array<{
    mediaId: number;
    kind?: string;
  }>;
  const media = view === 'moodboard' ? moodboardMedia : technicalMedia;
  const [open, setOpen] = useState(false);

  const viewMediaIds = useMemo(() => new Set(media.map((m) => m.mediaId)), [media]);
  // A callout belongs to this list when pinned to one of the view's images; an un-pinned callout
  // defaults to the technical list so it is never hidden from both.
  const inView = (index: number) => {
    const mid = callouts[index]?.mediaId;
    return mid ? viewMediaIds.has(mid) : view === 'technical';
  };
  const visibleFields = fields
    .map((f, index) => ({ f, index }))
    .filter(({ index }) => inView(index));

  const pinOptions = [
    { value: 0, label: '(unpinned)' },
    ...media.map((m, i) => ({
      value: m.mediaId,
      label: `${view === 'moodboard' ? 'M' : 'T'}#${i + 1} ${
        kindLabels[m.kind ?? ''] ?? (view === 'moodboard' ? 'reference' : 'sketch')
      }`,
    })),
  ];

  return (
    <div className='border-t border-textInactiveColor pt-3'>
      <button
        type='button'
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className='flex w-full cursor-pointer items-center justify-between gap-2 text-left focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-textColor'
      >
        <Text variant='uppercase' size='small'>
          all callouts {visibleFields.length ? `(${visibleFields.length})` : ''}
        </Text>
        <Text variant='label' size='small' className='uppercase'>
          {open ? '− hide' : '+ show'}
        </Text>
      </button>

      {open && (
        <div className='mt-3 space-y-3'>
          {visibleFields.length === 0 ? (
            <Text variant='label' size='small'>
              no callouts yet. turn on “add callout”, then click an image above
            </Text>
          ) : (
            visibleFields.map(({ f, index }) => (
              <div key={f.id} className='space-y-2 border border-textInactiveColor p-3'>
                <div className='flex items-center justify-between'>
                  <Text variant='uppercase' size='small'>
                    callout {index + 1}
                  </Text>
                  <Button
                    type='button'
                    variant='secondary'
                    aria-label='remove callout'
                    onClick={() => remove(index)}
                  >
                    ✕
                  </Button>
                </div>
                <div className='grid grid-cols-1 gap-2 lg:grid-cols-4'>
                  {/* Auto-assigned (nextNumber = max+1) and referenced BY number by
                      pieces/operations/issues — read-only so hand-edits can't collide with the
                      sequence. Kept in the field array so it still round-trips. */}
                  <div className='space-y-2'>
                    <Text className='leading-none lowercase'>number</Text>
                    <Text variant='label' className='tabular-nums'>
                      {callouts[index]?.number ?? index + 1}
                    </Text>
                  </div>
                  <ComboField
                    name={`callouts.${index}.part`}
                    label='part (код детали)'
                    options={pieceCodeOptions}
                  />
                  <InputField name={`callouts.${index}.dimensions`} label='dimensions' />
                  <SelectField
                    name={`callouts.${index}.mediaId`}
                    label='pinned to'
                    items={pinOptions}
                    valueAsNumber
                  />
                </div>
                <TextareaField
                  name={`callouts.${index}.description`}
                  label='description'
                  rows={2}
                  maxLength={2000}
                />
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
}

// The single free-form comments field for the moodboard. It writes the card's `notes` (the only
// card-level prose field), so overall direction notes round-trip with the rest of the card; the
// per-image caption sprawl that used to sit under each thumbnail is gone.
function MoodboardComments() {
  const { control } = useFormContext<TechCardFormData>();
  const { field } = useController({ control, name: 'notes' });
  const id = useId();
  return (
    <div className='space-y-1 border-t border-textInactiveColor pt-3'>
      <label htmlFor={id}>
        <Text variant='label' size='small' className='uppercase' component='span'>
          general comments
        </Text>
      </label>
      <textarea
        id={id}
        {...field}
        value={field.value ?? ''}
        rows={4}
        maxLength={2000}
        placeholder='overall notes on the moodboard, references, direction…'
        className='w-full resize-none border border-textInactiveColor bg-bgColor p-2 text-textBaseSize text-textColor placeholder:text-labelColor focus:border-textColor focus:outline-none'
      />
      <Text variant='label' size='small'>
        shared with the card’s notes field
      </Text>
    </div>
  );
}

// Sketch sheet — owns the resolved-media map shared by both grids (moodboard + technical) so a
// freshly-picked image can be annotated without a save/reload. Media ids are unique across the
// two lists, so one shared map serves both. `view` splits the two independent media lists
// (technicalMedia vs moodboardMedia) across two constructor tabs.
export function SketchTab({
  techCard,
  view = 'sketch',
}: {
  techCard?: common_TechCard;
  view?: 'sketch' | 'moodboard';
}) {
  const [picked, setPicked] = useState<common_MediaFull[]>([]);

  const mediaById = useMemo(() => {
    const m = new Map<number, common_MediaFull>();
    for (const rm of [
      ...(techCard?.resolvedTechnicalMedia ?? []),
      ...(techCard?.resolvedMoodboardMedia ?? []),
    ]) {
      if (rm.media?.id != null) m.set(rm.media.id, rm.media);
    }
    for (const p of picked) if (p.id != null) m.set(p.id, p);
    return m;
  }, [techCard?.resolvedTechnicalMedia, techCard?.resolvedMoodboardMedia, picked]);

  const onPicked = (items: common_MediaFull[]) => setPicked((prev) => [...prev, ...items]);

  if (view === 'moodboard') {
    return (
      <Section title='moodboard (mood / reference / swatches)'>
        <AnnotatedMediaGrid
          listName='moodboardMedia'
          mediaById={mediaById}
          onPickedMedia={onPicked}
          gridClassName='grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4'
          zoomable={false}
          notesMode='hover'
          pinSize='sm'
          emptyLabel='no moodboard images yet. add references to pin notes on them'
          addLabel='add moodboard image'
          purpose='moodboard reference'
        />
        <CalloutsList mediaById={mediaById} view='moodboard' />
        <MoodboardComments />
      </Section>
    );
  }

  return (
    <Section title='technical sketch'>
      <AnnotatedMediaGrid
        listName='technicalMedia'
        mediaById={mediaById}
        onPickedMedia={onPicked}
        gridClassName='grid grid-cols-1 gap-4 sm:grid-cols-2'
        zoomable
        notesMode='auto'
        pinSize='md'
        emptyLabel='no sketches yet. add a technical drawing to place callouts on it'
        addLabel='add sketch'
        purpose='tech sketch'
      />
      <CalloutsList mediaById={mediaById} view='technical' />
    </Section>
  );
}
