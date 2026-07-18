import { common_MediaFull } from 'api/proto-http/admin';
import { useEffect, useMemo, useRef } from 'react';
import { useController, useFieldArray, useFormContext, useWatch } from 'react-hook-form';
import { type AnnotatedCallout } from 'ui/components/annotated-image';
import { FocusedAnnotator, type FocusedView } from 'ui/components/focused-annotator';
import { FittingFormData } from './schema';

type FormCallout = {
  number?: number;
  note?: string;
  mediaId?: number;
  posX?: string;
  posY?: string;
};

// Media resolves to a URL only a tick after it's picked; an unresolved id is skipped (not rendered
// blank), so this gates which fitting photos become gallery images.
const mediaUrl = (full?: common_MediaFull): string =>
  full?.media?.fullSize?.mediaUrl || full?.media?.thumbnail?.mediaUrl || '';

// The fitting's "photos & fit notes" — a focused gallery over the fitting photos, matching the
// tech-card moodboard / sketch surface: ONE large focused photo you annotate in place with numbered
// fit-note pins, a thumbnail carousel of every photo below (click to focus), and a zoom control
// opening the shared lightbox (pan + freehand draw). Fit-note callouts live in the shared `callouts`
// field array (kept in sync with the FittingCallouts list), each carrying an auto-assigned,
// read-only `number` that changeRequests.calloutNumber cross-references. Fitting photos are NOT
// constrained to one aspect ratio — the gallery frames each to its own dimensions — and are added
// several at a time through the multiselect media picker. The resolved-media map (saved
// fitting.media + freshly-picked) is owned by the parent FittingForm and shared with the
// FittingCallouts list, so a just-picked photo can be annotated without a save/reload.
export function FittingMedia({
  mediaById,
  onPicked,
}: {
  mediaById: Map<number, common_MediaFull>;
  onPicked: (items: common_MediaFull[]) => void;
}) {
  const { control, setValue } = useFormContext<FittingFormData>();
  const { field } = useController({ control, name: 'mediaIds' });
  const calloutFA = useFieldArray({ control, name: 'callouts' });
  const callouts = (useWatch({ control, name: 'callouts' }) ?? []) as FormCallout[];

  const mediaIds = field.value ?? [];

  // mediaId is unique per fitting, so it doubles as the stable React key.
  const views: FocusedView[] = mediaIds
    .map((id) => ({ id, full: mediaById.get(id) }))
    .filter((v) => !!mediaUrl(v.full))
    .map((v) => ({ key: String(v.id), mediaId: v.id, full: v.full as common_MediaFull }));

  // Commit a media pick: dedupe against the current photos, resolve the picked full-media, append,
  // and report the fresh ids so the gallery can focus one.
  function onPickMedia(items: common_MediaFull[]): number[] {
    const existing = field.value ?? [];
    const unique = items.filter((m) => m.id != null && !existing.includes(m.id));
    if (!unique.length) return [];
    onPicked(unique);
    const ids = unique.map((m) => m.id).filter((id): id is number => id != null);
    field.onChange([...existing, ...ids]);
    return ids;
  }

  function removeMedia(view: FocusedView) {
    field.onChange((field.value ?? []).filter((v) => v !== view.mediaId));
  }

  // When a photo is removed from the fitting, un-pin any fit note that was on it — keep the note
  // text but drop the now-dead pin + coords so it isn't saved pointing at a media no longer
  // attached (which could never be shown/repositioned again). Driven off the mediaIds change so it
  // covers a photo removed from anywhere, not only the carousel control.
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

  function addCalloutTo(mediaId: number, x: number, y: number) {
    // max+1, not length+1: after a mid-list delete, length+1 collides with an existing number —
    // and the number is read-only, so a duplicate can't be fixed by hand. change requests
    // reference fit notes BY number, so it must stay unique.
    const nextNumber =
      Math.max(0, ...callouts.map((c) => (Number.isFinite(c.number) ? Number(c.number) : 0))) + 1;
    calloutFA.append({
      number: nextNumber,
      note: '',
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
      .map((f, index) => ({ f, index, c: callouts[index] }))
      .filter((x) => x.c?.mediaId === mediaId)
      .map((x) => {
        const px = parseFloat(x.c?.posX ?? '');
        const py = parseFloat(x.c?.posY ?? '');
        return {
          key: x.f.id,
          number: x.c?.number ?? x.index + 1,
          // legacy pinned-but-unplaced notes fall back to centre so they stay reachable.
          xNorm: Number.isNaN(px) ? 0.5 : px,
          yNorm: Number.isNaN(py) ? 0.5 : py,
          hasText: !!x.c?.note?.trim(),
        };
      });

  return (
    <FocusedAnnotator
      views={views}
      calloutsFor={calloutsFor}
      onAddCallout={addCalloutTo}
      onMoveCallout={(key, x, y) => {
        const i = keyToIndex.get(key);
        if (i == null) return;
        setValue(`callouts.${i}.posX`, x.toFixed(3), { shouldDirty: true });
        setValue(`callouts.${i}.posY`, y.toFixed(3), { shouldDirty: true });
      }}
      onRemoveCallout={(key) => {
        const i = keyToIndex.get(key);
        if (i != null) calloutFA.remove(i);
      }}
      renderNote={(key, { close }) => {
        const i = keyToIndex.get(key);
        return i != null ? <FitNoteBody index={i} onDone={close} /> : null;
      }}
      noteTitle={() => 'fit note'}
      onPickMedia={onPickMedia}
      onRemoveMedia={removeMedia}
      addLabel='add fitting photo'
      purpose='fitting photos'
      notesMode='auto'
      pinSize='md'
      emptyLabel='add a photo to start pinning fit notes'
      fallbackAspect='3/4'
      mediaLabel={(_view, i) => `fitting photo ${i + 1}`}
      carouselLabel='fitting photos'
    />
  );
}

// The editable body of one fit-note sticky note (the text behind a pin). Bound straight to the
// shared `callouts` field array, so edits here and in the FittingCallouts list stay in sync.
function FitNoteBody({ index, onDone }: { index: number; onDone: () => void }) {
  const { control } = useFormContext<FittingFormData>();
  const { field } = useController({ control, name: `callouts.${index}.note` });
  return (
    <textarea
      {...field}
      value={field.value ?? ''}
      rows={3}
      maxLength={2000}
      placeholder='что не так с посадкой…'
      onKeyDown={(e) => {
        if (e.key === 'Escape') {
          e.preventDefault();
          e.currentTarget.blur();
          onDone();
        }
      }}
      className='w-full resize-none border border-textInactiveColor bg-bgColor p-1.5 text-textBaseSize text-textColor placeholder:text-labelColor focus:border-textColor focus:outline-none'
    />
  );
}
