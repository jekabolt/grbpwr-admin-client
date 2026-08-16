import { common_MediaFull } from 'api/proto-http/admin';
import { useEffect, useMemo, useRef } from 'react';
import { useController, useFieldArray, useFormContext, useWatch } from 'react-hook-form';
import { useEditHistory } from 'ui/components/annotation/history';
import { type SurfaceCallout } from 'ui/components/annotation/surface';
import { FocusedAnnotator, type FocusedView } from 'ui/components/focused-annotator';
import { FittingFormData } from './schema';

type FormCallout = {
  number?: number;
  note?: string;
  mediaId?: number;
  posX?: string;
  posY?: string;
};

// The fitting's "photos & fit notes" — the SAME surface as the tech-card sketch and moodboard,
// in the same layout: a fixed-height filmstrip where every photo is on screen at once carrying its
// own numbered fit-note pins, a legend of those notes under each frame, a zoom control opening the
// shared full-screen surface (pan + place + edit), and the "add" slot as the last cell of the rail.
// Nothing has to be clicked to see front and back together, which is how a fitting conversation
// actually goes ("wrinkles at the front, but the back is fine").
//
// Fit-note callouts live in the shared `callouts` field array together with the FittingCallouts
// list below, each carrying an auto-assigned, read-only `number` that changeRequests.calloutNumber
// cross-references. Composition is written ONLY through `writeCallouts` — see the argument there;
// the two views do not stay in sync by themselves.
//
// Fitting photos are NOT constrained to one aspect ratio — the gallery frames each to its own
// dimensions, so a pin stays exactly where it was placed — and are added several at a time through
// the multiselect media picker. The resolved-media map (media library + saved fitting.media +
// freshly-picked) is owned by the parent FittingForm and shared with the FittingCallouts list, so a
// just-picked photo can be annotated without a save/reload, and a photo whose address did not
// resolve still shows up as a frame instead of vanishing with its notes.
export function FittingMedia({
  mediaById,
  onPicked,
}: {
  mediaById: Map<number, common_MediaFull>;
  onPicked: (items: common_MediaFull[]) => void;
}) {
  const { control, setValue, getValues } = useFormContext<FittingFormData>();
  const { field } = useController({ control, name: 'mediaIds' });
  const calloutFA = useFieldArray({ control, name: 'callouts' });
  const callouts = (useWatch({ control, name: 'callouts' }) ?? []) as FormCallout[];

  /**
   * ЕДИНСТВЕННЫЙ ПУТЬ ПРАВКИ СОСТАВА ЗАМЕТОК — тот же, что у эскизов тех-карты.
   *
   * `callouts` держат ДВА `useFieldArray`: этот и список «fit notes» под галереей. Замерено в
   * react-hook-form 7.62: собственные мутаторы поля-массива (`append`/`remove`) шлют только в
   * `_subjects.state` и обновляют СВОЙ `fields` напрямую — до второго экземпляра они не доходят
   * вообще. Поставленный на фотографии пин заводил заметку, которой в списке НЕ ПОЯВЛЯЛОСЬ, а
   * удаление из списка не убирало пин с кадра. Замерено на стенде: список так и говорил
   * «FIT NOTES (4)» после постановки пятого пина.
   *
   * `setValue` по ИМЕНИ МАССИВА — единственное, что вещает в `_subjects.array`, то есть
   * пересобирает оба экземпляра разом. Точечные правки (текст, координаты) идут листом, как и
   * раньше: они не меняют состав и не обязаны перевыдавать ключи всему списку.
   */
  const writeCallouts = (next: FormCallout[]) =>
    setValue('callouts', next as FittingFormData['callouts'], { shouldDirty: true });

  /**
   * ОТКАТ ЖЕСТА (⌘Z) — тот же, что на эскизах, и по тому же доводу: пин ставят и таскают РУКОЙ,
   * а у руки нет подтверждения. Промахнулся на три пикселя — вернуть прежнее положение можно
   * только на глаз, если его никто не помнит. Различие было случайным: поверхность одна, жест
   * один, а откат работал только на одном из двух экранов.
   */
  const history = useEditHistory<FormCallout>(callouts, writeCallouts);

  const mediaIds = field.value ?? [];

  // mediaId is unique per fitting, so it doubles as the stable React key.
  //
  // БЕЗ ФИЛЬТРА ПО АДРЕСУ. Раньше здесь стояло `.filter(v => !!mediaUrl(v.full))`, и фотография,
  // которую не удалось разрешить, ИСЧЕЗАЛА из галереи молча — вместе со своими пинами: ни
  // прочесть заметку, ни снять её было нельзя, а сохранялась она по-прежнему. Неразрешённый кадр
  // остаётся в ряду и называет причину сам (см. пустой `src` в AnnotationSurface).
  const views: FocusedView[] = mediaIds.map((id) => ({
    key: String(id),
    mediaId: id,
    full: mediaById.get(id),
  }));

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

  // Единственный вид здесь — пин, и его точка И ЕСТЬ маркер: якорей у него нет.
  // Перо здесь не при чём: единственный вид — пин, а у пина ни линии, ни площади.
  function addCalloutTo(mediaId: number, _kind: string, points: { x: number; y: number }[]) {
    const p = points[0];
    if (!p) return;
    // max+1, not length+1: after a mid-list delete, length+1 collides with an existing number —
    // and the number is read-only, so a duplicate can't be fixed by hand. change requests
    // reference fit notes BY number, so it must stay unique.
    const current = (getValues('callouts') ?? []) as FormCallout[];
    const nextNumber =
      Math.max(0, ...current.map((c) => (Number.isFinite(c.number) ? Number(c.number) : 0))) + 1;
    writeCallouts([
      ...current,
      {
        number: nextNumber,
        note: '',
        mediaId,
        posX: p.x.toFixed(3),
        posY: p.y.toFixed(3),
      },
    ]);
  }

  // Map a callout's stable field key back to its global index for RHF field paths.
  const keyToIndex = useMemo(
    () => new Map(calloutFA.fields.map((f, i) => [f.id, i] as const)),
    [calloutFA.fields],
  );

  const calloutsFor = (mediaId: number): SurfaceCallout[] =>
    calloutFA.fields
      .map((f, index) => ({ f, index, c: callouts[index] }))
      .filter((x) => x.c?.mediaId === mediaId)
      .map((x) => {
        const px = parseFloat(x.c?.posX ?? '');
        const py = parseFloat(x.c?.posY ?? '');
        return {
          key: x.f.id,
          number: x.c?.number ?? x.index + 1,
          // У заметки примерки геометрии нет и не появляется: это пин с запиской о посадке, а
          // мерка на фото примерки означала бы измерение, которого никто не делал.
          kind: 'pin',
          points: [],
          // legacy pinned-but-unplaced notes fall back to centre so they stay reachable.
          label: { x: Number.isNaN(px) ? 0.5 : px, y: Number.isNaN(py) ? 0.5 : py },
          // ТЕКСТ ЕДЕТ В ВЬЮ-МОДЕЛЬ. Им наполняется легенда под фотографией и подсказка пина —
          // без него заметки о посадке читались бы только по одной, открывая каждый пин кликом.
          text: x.c?.note ?? '',
          hasText: !!x.c?.note?.trim(),
        };
      });

  return (
    <FocusedAnnotator
      // ТА ЖЕ РАСКЛАДКА, ЧТО У ЭСКИЗОВ, и по той же причине. Примерка стояла в `focused`: один
      // большой кадр, а всё остальное — ноготками под ним. Разговор на примерке идёт «спереди
      // морщит, а сзади нет», то есть кадры сравнивают, а не листают; ровно этим доводом эскизы
      // и переведены в ряд. Заодно уходит вторая грамматика на общем компоненте: панель видов,
      // стрелки ряда, зум, легенда и слот «добавить» теперь стоят там же и работают так же.
      layout='grid'
      // Та же высота ряда, что у мудборда и эскизов: снимки не обрезаются, поэтому пин
      // по-прежнему ложится ровно туда, куда его поставили.
      gridRowHeight={480}
      views={views}
      calloutsFor={calloutsFor}
      onAddCallout={addCalloutTo}
      // Панель примерки — только пин: заметка о посадке это «здесь морщит», а не чертёжная мерка.
      calloutKinds={['pin']}
      onBeforeMutate={history.record}
      onUndo={history.undo}
      canUndo={history.canUndo}
      onMoveCallout={(key, x, y) => {
        const i = keyToIndex.get(key);
        if (i == null) return;
        setValue(`callouts.${i}.posX`, x.toFixed(3), { shouldDirty: true });
        setValue(`callouts.${i}.posY`, y.toFixed(3), { shouldDirty: true });
      }}
      onRemoveCallout={(key) => {
        const i = keyToIndex.get(key);
        if (i == null) return;
        writeCallouts(((getValues('callouts') ?? []) as FormCallout[]).filter((_, ci) => ci !== i));
      }}
      // ТОТ ЖЕ СЛОТ, что у тех-карты, но СВОЙ редактор: заметка о посадке это одно поле, и
      // грузить её чипами деталей и палитрой значило бы обещать хранение, которого у примерки нет.
      // Общая здесь не форма, а место: правка живёт под кадром, а не всплывает над пином.
      renderEditor={(key, { close }) => {
        const i = keyToIndex.get(key);
        return i != null ? <FitNoteBody index={i} onDone={close} /> : null;
      }}
      onPickMedia={onPickMedia}
      onRemoveMedia={removeMedia}
      addLabel='add fitting photo'
      purpose='fitting photos'
      // Снимок примерки — ФОТОГРАФИЯ, как и мудборд: чернильная линия на пёстром кадре тонет.
      halo
      // Свободные пропорции: снимок с примерки никто не кадрирует под сетку, и обрезка увела бы
      // пин с того места, куда его поставили.
      pickerAspectRatio={['Custom']}
      emptyLabel='add a photo to start pinning fit notes'
      fallbackAspect='3/4'
      mediaLabel={(_view, i) => `fitting photo ${i + 1}`}
      carouselLabel='fitting photos'
    />
  );
}

// Правка одной заметки о посадке. Привязана прямо к общему полю-массиву `callouts`, поэтому правка
// здесь и в списке заметок остаются одним и тем же.
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
