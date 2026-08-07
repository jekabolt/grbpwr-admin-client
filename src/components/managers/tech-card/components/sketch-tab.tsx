import { common_MediaFull, common_TechCard, common_TechCardMediaKind } from 'api/proto-http/admin';
import { techCardMeasurementUnitOptions, techCardMediaKindOptions } from 'constants/filter';
import { useId, useMemo, useState } from 'react';
import { useController, useFieldArray, useFormContext, useWatch } from 'react-hook-form';
import { Accordion } from 'ui/components/accordion';
import { type AnnotatedCallout } from 'ui/components/annotated-image';
import { Button } from 'ui/components/button';
import { FocusedAnnotator, type FocusedView } from 'ui/components/focused-annotator';
import { GroupLabel } from 'ui/components/group-label';
import { Pill } from 'ui/components/pill';
import { SectionHeader } from 'ui/components/section-header';
import Text from 'ui/components/text';
import Textarea from 'ui/components/text-area';
import InputField from 'ui/form/fields/input-field';
import SelectField from 'ui/form/fields/select-field';
import TextareaField from 'ui/form/fields/textarea-field';
import { normalizePieceName } from './piece-picker';
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
  mediaId?: number;
  posX?: string;
  posY?: string;
};

// Media resolves to a URL only a tick after it's picked; an unresolved id is skipped (not rendered
// blank), so this gates which field-array rows become gallery images.
const mediaUrl = (full?: common_MediaFull): string =>
  full?.media?.fullSize?.mediaUrl || full?.media?.thumbnail?.mediaUrl || '';

// The editable body of a callout's note: just its text. The structured fields (part, number, which
// image it's pinned to) live in the "callouts" accordion below, so the note that pops on a pin
// stays small and legible — a place to write, not a form.
function CalloutNoteBody({ index }: { index: number }) {
  const { control } = useFormContext<TechCardFormData>();
  const { field } = useController({ control, name: `callouts.${index}.description` });
  return (
    <Textarea
      {...field}
      value={field.value ?? ''}
      rows={2}
      maxLength={2000}
      placeholder='describe this callout…'
      onKeyDown={(e: React.KeyboardEvent<HTMLTextAreaElement>) => {
        if (e.key === 'Escape') {
          e.preventDefault();
          e.currentTarget.blur();
        }
      }}
      className='min-h-[38px] resize-none'
    />
  );
}

// The tech-card adapter over the shared FocusedAnnotator, driven in GRID layout: every view is on
// screen at once carrying its own pins, so front and back can be read together without clicking
// between them. It owns the tech-card-specific data — the `{ mediaId, kind }` media rows, the
// structured `{ part, description }` callouts, the per-image "kind" select, and "set as
// preview" — and hands the shared component only resolved views + callbacks, so moodboard/sketch
// behave exactly as before while the fitting reuses the same component with its own bindings.
function TechCardGallery({
  listName,
  mediaById,
  onPickedMedia,
  notesMode,
  pinSize,
  emptyLabel,
  addLabel,
  purpose,
}: {
  listName: MediaListName;
  mediaById: Map<number, common_MediaFull>;
  onPickedMedia: (items: common_MediaFull[]) => void;
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

  const isMoodboard = listName === 'moodboardMedia';
  const siblingName: MediaListName = isMoodboard ? 'technicalMedia' : 'moodboardMedia';
  const kinds = isMoodboard ? MOODBOARD_KINDS : TECHNICAL_KINDS;
  const kindOptions = techCardMediaKindOptions.filter((o) => kinds.includes(o.value));
  const defaultKind: common_TechCardMediaKind = kinds[0];

  const myMediaIds = useMemo(() => new Set(mediaFA.fields.map((f) => f.mediaId)), [mediaFA.fields]);

  // Which sheet a callout counts against — the same rule `CalloutsList` filters by, so the two can
  // never disagree about who owns a number. An unpinned callout falls to the technical sheet.
  const isMine = (c: FormCallout) => (c.mediaId ? myMediaIds.has(c.mediaId) : !isMoodboard);

  // The sketch and the moodboard number INDEPENDENTLY: they are two different documents, and a
  // moodboard reference note has no business pushing the next sketch callout to 7. Construction,
  // pieces and issues all point at SKETCH callouts, so that sequence stays dense and predictable
  // instead of being perforated by notes stuck on a swatch photo.
  //
  // max+1, not length+1: after a mid-list delete, length+1 collides with an existing number.
  //
  // The max is taken over the live callouts AND over everything still pointing at a number, because
  // deleting a callout does not clear its referrers. Delete the highest sketch callout and the next
  // one added would take its number back — and the server derives a cut piece's NAME from the
  // callout it is pinned to, by number (calloutSync.apply), so an unrelated new callout silently
  // renamed a piece that still carried the old one. A number that is still referenced is not free.
  //
  // Sketch only: pieces, operations and issues point at SKETCH callouts, and folding their numbers
  // into the moodboard's sequence would push moodboard notes up for no reason — the two documents
  // number independently on purpose.
  const referencedNumbers = () => {
    if (isMoodboard) return [];
    const v = getValues();
    return [
      ...(v.pieces ?? []).map((p) => p.calloutNumber ?? 0),
      ...(v.operations ?? []).map((o) => o.calloutNumber ?? 0),
      ...(v.issues ?? []).map((i) => i.calloutNumber ?? 0),
    ].filter((n) => Number.isFinite(n) && n > 0);
  };
  const nextNumber = () =>
    Math.max(
      0,
      ...calloutValues
        .filter(isMine)
        .map((c) => (Number.isFinite(c.number) ? Number(c.number) : 0)),
      ...referencedNumbers(),
    ) + 1;

  // Commit a media pick: dedupe against BOTH lists (ids are unique across technical ∪ moodboard),
  // resolve the picked full-media, append, and report the fresh ids so the gallery focuses one.
  function handleAddMedia(items: common_MediaFull[]): number[] {
    const selectedIds = mediaFA.fields.map((f) => f.mediaId);
    const siblingIds = (getValues(siblingName) ?? []).map((m) => m.mediaId);
    const fresh = items.filter(
      (it) => it.id != null && !selectedIds.includes(it.id) && !siblingIds.includes(it.id),
    );
    if (!fresh.length) return [];
    onPickedMedia(fresh);
    const ids: number[] = [];
    for (const it of fresh) {
      mediaFA.append({ mediaId: it.id as number, kind: defaultKind });
      ids.push(it.id as number);
    }
    return ids;
  }

  // Removing an image un-pins its callouts (keeps the text, drops the now-dead pin) so the
  // payload never carries a media id that is on neither list.
  function removeMedia(view: FocusedView) {
    const index = mediaFA.fields.findIndex((f) => f.mediaId === view.mediaId);
    if (index < 0) return;
    mediaFA.remove(index);
    const cs = getValues('callouts') ?? [];
    cs.forEach((c, ci) => {
      if (c.mediaId === view.mediaId) {
        setValue(`callouts.${ci}.mediaId`, 0, { shouldDirty: true });
        setValue(`callouts.${ci}.posX`, '', { shouldDirty: true });
        setValue(`callouts.${ci}.posY`, '', { shouldDirty: true });
      }
    });
  }

  // ЗАПИСЬ ИДЁТ В КОРЕНЬ МАССИВА, а не через append/remove этого useFieldArray.
  //
  // На «callouts» висят ДВА useFieldArray: этот и свой у CalloutsList — и оба смонтированы
  // одновременно, они соседи в одной секции. В react-hook-form 7.62 append/remove НЕ эмитят
  // _subjects.array (измерено), поэтому соседний массив о правке не узнаёт: пин на картинке
  // появляется (он читается из useWatch), а строки в структурированном списке нет. Хуже того,
  // remove по устаревшему fields адресует НЕ ТУ выноску. setValue по корню массива событие
  // эмитит, и оба useFieldArray пересинхронизируются — это ровно та же починка, что была нужна
  // деталям кроя.
  const writeCallouts = (next: FormCallout[]) => setValue('callouts', next, { shouldDirty: true });

  function addCalloutTo(mediaId: number, x: number, y: number) {
    writeCallouts([
      ...((getValues('callouts') ?? []) as FormCallout[]),
      {
        number: nextNumber(),
        part: '',
        description: '',
        mediaId,
        posX: x.toFixed(3),
        posY: y.toFixed(3),
      },
    ]);
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

  const views: FocusedView[] = mediaFA.fields
    .map((f) => ({ f, full: mediaById.get(f.mediaId) }))
    .filter((v) => !!mediaUrl(v.full))
    .map((v) => ({ key: v.f.id, mediaId: v.f.mediaId, full: v.full as common_MediaFull }));

  const mediaLabel = (view: FocusedView): string => {
    const f = mediaFA.fields.find((mf) => mf.mediaId === view.mediaId);
    return kindLabels[f?.kind ?? ''] ?? (isMoodboard ? 'reference' : 'sketch');
  };

  return (
    <FocusedAnnotator
      layout='grid'
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
        if (i != null)
          writeCallouts(
            ((getValues('callouts') ?? []) as FormCallout[]).filter((_, ci) => ci !== i),
          );
      }}
      renderNote={(key) => {
        const i = keyToIndex.get(key);
        return i != null ? <CalloutNoteBody index={i} /> : null;
      }}
      noteTitle={(key) => {
        const i = keyToIndex.get(key);
        return i != null ? calloutValues[i]?.part || undefined : undefined;
      }}
      onPickMedia={handleAddMedia}
      onRemoveMedia={removeMedia}
      addLabel={addLabel}
      purpose={purpose}
      pickerAspectRatio={['Custom']}
      notesMode={notesMode}
      pinSize={pinSize}
      emptyLabel={emptyLabel}
      fallbackAspect='3/4'
      // Both surfaces are a fixed-height filmstrip — every image the same height, natural width
      // (landscapes wider), horizontal-only scroll. Images aren't cropped, so callout pins still
      // map 1:1.
      gridRowHeight={480}
      previewFirst
      mediaLabel={mediaLabel}
      carouselLabel={`${isMoodboard ? 'moodboard' : 'sketch'} images`}
      renderFocusedFooter={(view) => {
        const index = mediaFA.fields.findIndex((f) => f.mediaId === view.mediaId);
        if (index < 0) return null;
        return (
          // wraps rather than squeezing: a 180px tile cannot hold the select and the button side
          // by side, and a crushed select is worse than a second line.
          <div className='flex flex-wrap items-end gap-1.5'>
            <div className='min-w-[92px] flex-1'>
              <SelectField name={`${listName}.${index}.kind`} label='kind' items={kindOptions} />
            </div>
            <div className='shrink-0'>
              {index === 0 ? (
                <Pill tone='mut'>preview</Pill>
              ) : (
                <Button
                  type='button'
                  variant='secondary'
                  size='xs'
                  // first item = the card's preview / thumbnail (proto: idea preview_url)
                  onClick={() => mediaFA.move(index, 0)}
                  className='cursor-pointer'
                >
                  set as preview
                </Button>
              )}
            </div>
          </div>
        );
      }}
    />
  );
}

// The full, structured callout editor — number, part code, which image it is pinned to, and the
// note. With every view on screen carrying its own pins, this list's job narrows to
// reaching UNPINNED callouts (a callout survives its image being removed), so it announces how many
// there are and opens itself when any exist.
function CalloutsList({ view }: { view: 'technical' | 'moodboard' }) {
  const { control, formState, getValues, setValue } = useFormContext<TechCardFormData>();
  // `fields` даёт стабильные ключи для React; удаление идёт КОРНЕВЫМ setValue — по той же
  // причине, что и в галерее: на «callouts» висят два useFieldArray, и remove одного не
  // доходит до другого. Плюс remove по устаревшему fields адресует не ту выноску.
  const { fields } = useFieldArray({ control, name: 'callouts' });
  const removeCallout = (index: number) =>
    setValue(
      'callouts',
      ((getValues('callouts') ?? []) as FormCallout[]).filter((_, ci) => ci !== index),
      { shouldDirty: true },
    );
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
  // null = the user hasn't touched the disclosure, so it follows the unpinned count.
  const [open, setOpen] = useState<boolean | null>(null);

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
  const unpinned = visibleFields.filter(({ index }) => !callouts[index]?.mediaId).length;
  // An error inside a callout FORCES the disclosure open, overriding the user's own collapse: the
  // error router switches to this tab and calls revealField, which finds nothing when the row is
  // not in the DOM — leaving a toast that names a field nobody can see (19.8).
  const hasCalloutError = !!formState.errors.callouts;
  const isOpen = hasCalloutError || (open ?? unpinned > 0);

  // A callout names a PIECE, and a piece is a row on the pieces tab — so the vocabulary here is
  // that table, not the standard nomenclature it was typed from. Free text let a callout point at
  // «FP_R» while the card's only front piece was named «FP_R_1», and nothing ever flagged it.
  const pieces = (useWatch({ control, name: 'pieces' }) ?? []) as Array<{
    name?: string;
    calloutNumber?: number;
  }>;
  const pieceOptions = useMemo(() => {
    const seen = new Set<string>();
    const out: string[] = [];
    for (const p of pieces) {
      const name = p.name?.trim();
      if (!name || seen.has(name)) continue;
      seen.add(name);
      out.push(name);
    }
    return out;
  }, [pieces]);

  // Tolerant read: a value typed before this field was a picker (or left behind when its piece was
  // renamed) still shows, flagged, instead of silently reading as empty and being dropped by the
  // next save of an unrelated field.
  const partOptionsFor = (current?: string) => {
    const value = current?.trim();
    const items = pieceOptions.map((p) => ({ value: p, label: p }));
    if (value && !pieceOptions.includes(value)) {
      items.unshift({ value, label: `${value} — not in pieces` });
    }
    return items;
  };

  // ВТОРАЯ ПОЛОВИНА СВЯЗИ. Выноска называет деталь (`callout.part`), а деталь ссылается на выноску
  // НОМЕРОМ (`piece.calloutNumber`) — и рисуют пины, считают «открепление» и печатают тех-пак
  // именно по номеру. Клиент писал только первую половину: с тех пор как из таблицы деталей убрали
  // редактируемую колонку callout (95cdb1af, 30.07) с формулировкой «номер ставится на вкладке
  // SKETCH», номер не ставился НИГДЕ — `piece.calloutNumber` оставался нулём у всех деталей, и
  // диаграмма выносок в «деталях кроя» вечно показывала «нет выносок». Здесь эта половина и
  // дописывается: выбрал деталь в выноске — деталь на неё сослалась.
  //
  // Проход по ВСЕМ деталям, а не только по выбранной: смена детали в выноске обязана снять номер с
  // прежней, иначе на один номер сослались бы две детали, и «открепить» стало бы нечем.
  const pinPieceToCallout = (calloutIndex: number, part: string | undefined) => {
    const number = callouts[calloutIndex]?.number ?? 0;
    if (!number) return;
    const wanted = normalizePieceName(part ?? '');
    const live = (getValues('pieces') ?? []) as Array<{ name?: string; calloutNumber?: number }>;
    live.forEach((p, pi) => {
      const isTarget = !!wanted && normalizePieceName(p.name ?? '') === wanted;
      const holds = (p.calloutNumber ?? 0) === number;
      if (isTarget === holds) return;
      setValue(`pieces.${pi}.calloutNumber`, isTarget ? number : 0, { shouldDirty: true });
    });
  };

  // The card's geometry unit exists exactly to say what a callout's dimensions are measured in
  // (techCardMeasurementUnitOptions), so the field names it rather than leaving the operator to
  // guess whether "12" is cm or mm.
  const measurementUnit = (useWatch({ control, name: 'measurementUnit' }) ?? '') as string;
  const unitLabel =
    techCardMeasurementUnitOptions.find((o) => o.value === measurementUnit)?.label ?? '';

  // Выноски этого списка, чей `part` называет РЕАЛЬНУЮ деталь, которая на эту выноску не ссылается.
  // Считается по живой форме, поэтому кнопка исчезает сама, как только связи проставлены.
  const unlinkedParts = useMemo(() => {
    const byName = new Map<string, number>();
    for (const p of pieces) {
      const key = normalizePieceName(p.name ?? '');
      if (key && !byName.has(key)) byName.set(key, p.calloutNumber ?? 0);
    }
    return visibleFields
      .map(({ index }) => ({
        index,
        number: callouts[index]?.number ?? 0,
        part: (callouts[index]?.part ?? '').trim(),
      }))
      .filter((u) => {
        if (!u.number || !u.part) return false;
        const held = byName.get(normalizePieceName(u.part));
        return held != null && held !== u.number;
      });
  }, [pieces, callouts, visibleFields]);

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
    <Accordion
      open={isOpen}
      onOpenChange={setOpen}
      title={
        <Text
          size='micro'
          variant='uppercase'
          tracking='group'
          component='span'
          className='font-bold'
        >
          callouts ({visibleFields.length})
        </Text>
      }
      meta={unpinned > 0 ? <Pill tone='attention'>{unpinned} unpinned</Pill> : undefined}
    >
      <div className='space-y-2'>
        {/* Выноски, которые НАЗЫВАЮТ существующую деталь, но не связаны с ней.
            Ровно то состояние, в котором сегодня лежит каждая карточка: имя детали проставлено, а
            номер выноски у детали — нет, потому что писать его было нечему. Молча дописать это на
            загрузке нельзя (правка карточки, которую никто не делал), поэтому связывание — действие
            человека, но одним нажатием на все сразу: пятнадцать раз переоткрыть один и тот же
            селект никто не станет, и карточка так и осталась бы без выносок. */}
        {unlinkedParts.length > 0 && (
          <div className='flex flex-wrap items-center gap-1.5'>
            <Button
              type='button'
              variant='secondary'
              size='xs'
              title={`деталь названа, но не ссылается на выноску: ${unlinkedParts
                .map((u) => `#${u.number} → ${u.part}`)
                .join(', ')}`}
              onClick={() => unlinkedParts.forEach((u) => pinPieceToCallout(u.index, u.part))}
            >
              связать детали с выносками ({unlinkedParts.length})
            </Button>
            <Text size='nano' variant='label' component='span'>
              без связи деталь не знает своей выноски: пин не рисуется в «деталях кроя» и не
              печатается в тех-паке
            </Text>
          </div>
        )}
        {visibleFields.length === 0 ? (
          <Text size='micro' variant='label'>
            no callouts yet. turn on “add callout”, then click any image above
          </Text>
        ) : (
          visibleFields.map(({ f, index }) => (
            <div key={f.id} className='space-y-2 border border-borderColor p-2'>
              <div className='flex items-center gap-1.5'>
                {/* Auto-assigned (nextNumber = max+1) and referenced BY number by
                    pieces/operations/issues — read-only so hand-edits can't collide with the
                    sequence. Kept in the field array so it still round-trips. */}
                <span className='flex size-4 shrink-0 items-center justify-center bg-textColor text-nano leading-none tabular-nums text-bgColor'>
                  {callouts[index]?.number ?? index + 1}
                </span>
                <Text
                  size='micro'
                  variant='uppercase'
                  tracking='group'
                  component='span'
                  className='font-bold'
                >
                  callout
                </Text>
                {!callouts[index]?.mediaId && <Pill tone='attention'>unpinned</Pill>}
                <div className='ml-auto shrink-0'>
                  <Button
                    type='button'
                    variant='secondary'
                    size='xs'
                    aria-label='remove callout'
                    onClick={() => removeCallout(index)}
                    className='cursor-pointer'
                  >
                    ✕
                  </Button>
                </div>
              </div>
              <div className='grid grid-cols-1 gap-2 lg:grid-cols-2'>
                <SelectField
                  name={`callouts.${index}.part`}
                  label='part (код детали)'
                  placeholder={pieceOptions.length ? 'pick a piece…' : 'no pieces on this card yet'}
                  items={partOptionsFor(callouts[index]?.part)}
                  onAfterChange={(v) => pinPieceToCallout(index, typeof v === 'string' ? v : '')}
                />
                <SelectField
                  name={`callouts.${index}.mediaId`}
                  label='pinned to'
                  items={pinOptions}
                  valueAsNumber
                />
                {/* The measurement the callout carries (ширина кармана, длина планки…). It
                    round-trips and prints on the tech pack, but nothing in this editor could
                    write it — a callout could only ever be described in prose. */}
                <InputField
                  name={`callouts.${index}.dimensions`}
                  label={`dimensions${unitLabel ? ` (${unitLabel})` : ''}`}
                  placeholder='e.g. 14 × 16'
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
    </Accordion>
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
    <div>
      <GroupLabel>general comments</GroupLabel>
      <label htmlFor={id} className='sr-only'>
        general comments
      </label>
      <Textarea
        {...field}
        id={id}
        value={field.value ?? ''}
        rows={3}
        maxLength={2000}
        placeholder='overall notes on the moodboard, references, direction…'
        className='resize-none'
      />
      <Text size='micro' variant='label' className='mt-px'>
        shared with the card’s notes field
      </Text>
    </div>
  );
}

// Sketch sheet — owns the resolved-media map shared by both surfaces (moodboard + technical) so a
// freshly-picked image can be annotated without a save/reload. Media ids are unique across the
// two lists, so one shared map serves both. `view` splits the two independent media lists
// (technicalMedia vs moodboardMedia) across two constructor tabs; both render the same grid.
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
      <section className='flex flex-col gap-2.5 border border-borderColor bg-bgColor p-4'>
        <SectionHeader
          title='moodboard'
          question='— mood, reference and swatch images; pin a note on any of them'
        />
        <TechCardGallery
          listName='moodboardMedia'
          mediaById={mediaById}
          onPickedMedia={onPicked}
          notesMode='hover'
          pinSize='sm'
          emptyLabel='no moodboard images yet. add references to pin notes on them'
          addLabel='add moodboard image'
          purpose='moodboard reference'
        />
        <CalloutsList view='moodboard' />
        <MoodboardComments />
      </section>
    );
  }

  return (
    <section className='flex flex-col gap-2.5 border border-borderColor bg-bgColor p-4'>
      <SectionHeader
        title='technical sketch'
        question='— front / back / detail views, each carrying the numbered callouts the construction tab points at'
      />
      <TechCardGallery
        listName='technicalMedia'
        mediaById={mediaById}
        onPickedMedia={onPicked}
        notesMode='auto'
        pinSize='md'
        emptyLabel='no sketches yet. add a technical drawing to place callouts on it'
        addLabel='add sketch'
        purpose='tech sketch'
      />
      <CalloutsList view='technical' />
    </section>
  );
}
