import { common_MediaFull } from 'api/proto-http/admin';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useController, useFieldArray, useFormContext, useWatch } from 'react-hook-form';
import { AnnotationEditor } from 'ui/components/annotation/editor';
import { useEditHistory } from 'ui/components/annotation/history';
import { rememberPen, type PenStyle, type SurfaceCallout } from 'ui/components/annotation/surface';
import type { AnnotationColorKey, AnnotationKindKey } from 'ui/components/annotation/wire';
import { ConfirmationModal } from 'ui/components/confirmation-modal';
import Text from 'ui/components/text';
import { FocusedAnnotator, type FocusedView } from 'ui/components/focused-annotator';
import { demoteCalloutToPin, hasDrawnGeometry } from './callout-geometry';
import { FittingFormData } from './schema';

type FormCallout = {
  number?: number;
  note?: string;
  mediaId?: number;
  posX?: string;
  posY?: string;
  // ГЕОМЕТРИЯ УКАЗАНИЯ (0319). `posX/posY` по-прежнему «где стоит нумерованный маркер» — на него
  // ссылается номером замечание; `points` держит якоря фигуры и у пина пуст.
  kind?: AnnotationKindKey;
  points?: { x: string; y: string }[];
  color?: AnnotationColorKey;
  dashed?: boolean;
  filled?: boolean;
};

const numOf = (v?: string) => {
  const n = Number((v ?? '').replace(',', '.'));
  return Number.isFinite(n) ? n : 0;
};

/**
 * «1 drawn callout · 3 drawn callouts».
 *
 * Число в этом вопросе — единственное, ради чего его вообще задают («сколько я сейчас потеряю»),
 * и склеенное с ним «1 drawn callouts» читается как сбой, а не как предупреждение.
 */
function drawnCalloutsPlural(n: number): string {
  return n === 1 ? 'drawn callout' : 'drawn callouts';
}

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
// ВИДОВ ЗДЕСЬ СТОЛЬКО ЖЕ, СКОЛЬКО НА ЭСКИЗЕ (0319), и указание несёт ту же геометрию: вид, якоря,
// цвет, пунктир, штриховку. Разговор на примерке состоит ровно из этих фигур — «вот на столько
// длиннее» (мерка), «вот тут заломы» (зона), «шов уходит вот так» (дуга), — и пин с запиской умел
// сказать только «здесь». Хранение то же самое, что у выноски карточки; своего у примерки лишь
// то, чего у неё НЕТ: ни детали кроя, ни привязки размера.
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

  /**
   * СНЯТИЕ КАДРА С НАРИСОВАННЫМ — ЧЕРЕЗ ПОДТВЕРЖДЕНИЕ, И ОНО НАЗЫВАЕТ ЧИСЛО.
   *
   * «✕» стоит вплотную к «зум», а цена промаха выросла: снятый кадр уносит с собой ВСЕ якоря
   * своих указаний — обведённую зону, дугу, мерку, — и вернуть их повторным добавлением той же
   * фотографии нельзя, в форме их уже нет. Спрашиваем только когда есть что терять: кадр без
   * фигур снимается сразу, иначе подтверждение превратится в шум, который нажимают не читая.
   *
   * ПОДТВЕРЖДЕНИЕ ЖИВЁТ ЗДЕСЬ, А НЕ В ОБЩЕЙ ГАЛЕРЕЕ: у неё три вызывающих со своими правилами
   * (у эскиза выноски адресуют деталь и операцию, у мудборда терять нечего), и вопрос, заданный
   * за них всех, был бы задан не о том.
   */
  const [pendingRemoval, setPendingRemoval] = useState<{
    view: FocusedView;
    shapes: number;
  } | null>(null);
  function requestRemoveMedia(view: FocusedView) {
    const shapes = callouts.filter((c) => c.mediaId === view.mediaId && hasDrawnGeometry(c)).length;
    if (!shapes) {
      removeMedia(view);
      return;
    }
    setPendingRemoval({ view, shapes });
  }

  // When a photo is removed from the fitting, un-pin any fit note that was on it — keep the note
  // text but drop the now-dead pin + coords so it isn't saved pointing at a media no longer
  // attached (which could never be shown/repositioned again). Driven off the mediaIds change so it
  // covers a photo removed from anywhere, not only the carousel control.
  //
  // ЗАПИСЬ В ИСТОРИЮ ЗДЕСЬ ОБЯЗАТЕЛЬНА, И ЭТО ЕДИНСТВЕННОЕ МЕСТО, ГДЕ ЕЁ НЕ БЫЛО. Пока снятие
  // фотографии стоило только координат маркера, потеря возвращалась перетаскиванием. Теперь она
  // стоит РОСЧЕРКА: обведённая зона, дуга и мерка становятся точками, и вернуть их нечем — якорей
  // в форме больше нет. Хуже того, без записи ⌘Z перематывал бы ЧЕРЕЗ это разжалование, в снимок
  // прошлого жеста, то есть в состояние, где фигуры ещё не рисовали.
  const prevMediaIdsRef = useRef<number[]>(mediaIds);
  useEffect(() => {
    const prev = prevMediaIdsRef.current;
    prevMediaIdsRef.current = mediaIds;
    const removed = prev.filter((id) => !mediaIds.includes(id));
    if (!removed.length) return;
    const orphaned = callouts
      .map((c, i) => ({ c, i }))
      .filter(({ c }) => !!c.mediaId && removed.includes(c.mediaId));
    if (!orphaned.length) return;
    history.record();
    orphaned.forEach(({ i }) => {
      setValue(`callouts.${i}.mediaId`, 0, { shouldDirty: true });
      setValue(`callouts.${i}.posX`, '', { shouldDirty: true });
      setValue(`callouts.${i}.posY`, '', { shouldDirty: true });
      // ЯКОРЯ УХОДЯТ ВМЕСТЕ СО СНИМКОМ, как на эскизе. Доли кадра осмысленны только на СВОЁМ
      // кадре: оставить их значило бы, что открепившаяся мерка, приколотая потом к другой
      // фотографии, ляжет по координатам удалённой — с виду нормальная линия, показывающая не
      // туда. Записка при этом остаётся: её писал человек, и она переживает снимок.
      demoteCalloutToPin(setValue, i);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mediaIds]);

  // ПОСТАНОВКА — ОДИН ПУТЬ НА ВСЕ ВИДЫ, тот же, что на эскизе. У ПИНА ЯКОРЕЙ НЕТ: его единственная
  // точка и есть нумерованный маркер (на него ссылается номером замечание). У фигуры маркер
  // ставится САМ — над серединой якорей и чуть выше, чтобы номер не сел на саму линию.
  function addCalloutTo(
    mediaId: number,
    kind: string,
    points: { x: number; y: number }[],
    pen: PenStyle,
  ) {
    if (points.length === 0) return;
    const pin = kind === 'pin';
    const cx = points.reduce((s, p) => s + p.x, 0) / points.length;
    const cy = points.reduce((s, p) => s + p.y, 0) / points.length;
    const marker = pin
      ? points[0]
      : {
          x: Math.min(0.96, Math.max(0.04, cx)),
          y: Math.min(0.96, Math.max(0.06, cy - 0.08)),
        };
    // max+1, not length+1: after a mid-list delete, length+1 collides with an existing number —
    // and the number is read-only, so a duplicate can't be fixed by hand. change requests
    // reference fit notes BY number, so it must stay unique.
    //
    // ИЗВЕСТНЫЙ ДЕФЕКТ, НЕ ПОЧИНЕННЫЙ ЗДЕСЬ НАМЕРЕННО: max+1 переиспользует номер, если удалить
    // заметку со СТАРШИМ номером — тогда замечание, ссылавшееся на удалённую, начинает показывать
    // на новую. Эскиз от этого защищён, потому что считает максимум ещё и по всем ссылающимся
    // (`referencedNumbers`), а у примерки ссылка живёт СВОБОДНЫМ ЧИСЛОМ в поле «callout #», и
    // сосчитать её тем же способом нельзя: замечания на редактировании принадлежат не форме, а
    // отдельному CRUD. Правильная починка — выбор выноски списком вместо ввода числа, и это
    // отдельная работа. Дефект существовал и до геометрии; здесь он только записан, чтобы
    // следующий не принял его за случайность.
    const current = (getValues('callouts') ?? []) as FormCallout[];
    const nextNumber =
      Math.max(0, ...current.map((c) => (Number.isFinite(c.number) ? Number(c.number) : 0))) + 1;
    writeCallouts([
      ...current,
      {
        number: nextNumber,
        note: '',
        mediaId,
        posX: marker.x.toFixed(3),
        posY: marker.y.toFixed(3),
        kind: kind as AnnotationKindKey,
        points: pin ? [] : points.map((p) => ({ x: p.x.toFixed(4), y: p.y.toFixed(4) })),
        // ОФОРМЛЕНИЕ ИЗ ПАМЯТИ ПЕРА, а не с нуля: у человека одна рука, и выбрав белый пунктир на
        // тёмной ткани, он обводит им дальше — иначе каждую следующую зону приходится
        // перекрашивать поштучно.
        color: pen.color as AnnotationColorKey,
        dashed: pen.dashed,
        filled: pen.filled,
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
          kind: x.c?.kind ?? 'pin',
          points: (x.c?.points ?? []).map((pt) => ({ x: numOf(pt.x), y: numOf(pt.y) })),
          // legacy pinned-but-unplaced notes fall back to centre so they stay reachable.
          label: { x: Number.isNaN(px) ? 0.5 : px, y: Number.isNaN(py) ? 0.5 : py },
          // ТЕКСТ ЕДЕТ В ВЬЮ-МОДЕЛЬ. Им наполняется легенда под фотографией и подсказка пина —
          // без него заметки о посадке читались бы только по одной, открывая каждый пин кликом.
          text: x.c?.note ?? '',
          hasText: !!x.c?.note?.trim(),
          color: x.c?.color ?? '',
          dashed: !!x.c?.dashed,
          filled: !!x.c?.filled,
        };
      });

  const gallery = (
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
      // ПАЛИТРА ЦЕЛИКОМ — та же, что на эскизе. Здесь стоял `calloutKinds={['pin']}` с доводом
      // «мерка на фото примерки означала бы измерение, которого никто не делал»; на примерке
      // именно мерят и обводят: «вот на столько длиннее», «вот тут заломы», «шов идёт вот так».
      // Ограничение отсекало ровно те слова, ради которых на примерку и приносят фотоаппарат.
      onBeforeMutate={history.record}
      onUndo={history.undo}
      canUndo={history.canUndo}
      onEditPoints={(key, points) => {
        const i = keyToIndex.get(key);
        if (i == null) return;
        // ВИД ПОДПИСИ СЛЕДУЕТ ЗА ЧИСЛОМ СТРЕЛОК: панель знает один вид, провод различает одну
        // стрелку (label) и несколько (multi). Различие — счётчик, и держать его руками значило
        // бы просить человека объявить то, что и так видно.
        const prev = callouts[i]?.kind;
        if (prev === 'label' || prev === 'multi') {
          setValue(`callouts.${i}.kind`, points.length > 1 ? 'multi' : 'label', {
            shouldDirty: true,
          });
        }
        setValue(
          `callouts.${i}.points`,
          points.map((p) => ({ x: p.x.toFixed(4), y: p.y.toFixed(4) })),
          { shouldDirty: true },
        );
      }}
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
      // ТОТ ЖЕ РЕДАКТОР, ЧТО НА ЭСКИЗЕ, — не «похожий», а буквально он. Здесь стояло своё поле в
      // одну textarea, и как только у указания появились цвет, пунктир и штриховка, оно стало
      // формой, которой этих полей не хватает: обвести зону было можно, а перекрасить — нет.
      //
      // ПИКЕРА ДЕТАЛЕЙ ЗДЕСЬ НЕТ, и это не забывчивость: у выноски примерки нет поля детали вовсе
      // (см. FittingCallout в контракте), а замечания привязываются к деталям отдельной сущностью
      // (change_request.piece_ids). Ряд чипов, которому некуда писать, обещал бы связь, которой
      // нет, — редактор рисует его только по наличию `renderPiecePicker`.
      renderEditor={(key, { close, arrows }) => {
        const i = keyToIndex.get(key);
        const c = i != null ? callouts[i] : undefined;
        if (i == null || !c) return null;
        return (
          <AnnotationEditor
            kind={c.kind ?? 'pin'}
            number={c.number}
            text={c.note ?? ''}
            color={c.color ?? ''}
            dashed={!!c.dashed}
            filled={!!c.filled}
            pieceKeys={[]}
            onText={(v) => setValue(`callouts.${i}.note`, v, { shouldDirty: true })}
            onColor={(v) => {
              rememberPen({ color: v });
              setValue(`callouts.${i}.color`, v as AnnotationColorKey, { shouldDirty: true });
            }}
            onDashed={(v) => {
              rememberPen({ dashed: v });
              setValue(`callouts.${i}.dashed`, v, { shouldDirty: true });
            }}
            onFilled={(v) => {
              rememberPen({ filled: v });
              setValue(`callouts.${i}.filled`, v, { shouldDirty: true });
            }}
            onPieces={() => {}}
            onRemove={() => {
              // ЧЕРЕЗ ИСТОРИЮ, как и удаление клавишей: одна и та же операция, сделанная мышью, не
              // имеет права быть безвозвратной там, где сделанная с клавиатуры откатывается.
              history.record();
              writeCallouts(
                ((getValues('callouts') ?? []) as FormCallout[]).filter((_, ci) => ci !== i),
              );
              close();
            }}
            onClose={close}
            // ЛУЧИ ЗАПИСКИ приходят от листа (`FocusedAnnotator` держит взвод: редактор стоит НАД
            // рядом кадров, а клик приходит на плитку). Здесь стояла «make it a point» — владелец
            // её убрал (E-27).
            arrows={arrows}
            // ПОТОЛОК ТОТ ЖЕ, ЧТО У ПОЛЯ В СПИСКЕ ЗАМЕТОК. Записка живёт в ОДНОМ поле формы, а
            // правится в двух местах; разные потолки означали, что набранная в списке заметка на
            // 1200 знаков в редакторе под кадром просто не дописывается — браузер отказывает во
            // вставке молча, и объяснения этому на экране нет.
            maxLength={2000}
            // Ручки правятся только там, где якоря есть. У пина примерки их нет вовсе (его точка
            // живёт в маркере), и обещать ручки, которых не появится, — врать подсказкой.
            anchors={c.points?.length ?? 0}
          />
        );
      }}
      onPickMedia={onPickMedia}
      onRemoveMedia={requestRemoveMedia}
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

  if (!pendingRemoval) return gallery;
  return (
    <>
      {gallery}
      <ConfirmationModal
        open
        onOpenChange={(v) => !v && setPendingRemoval(null)}
        title='remove the photo together with its drawings?'
        confirmLabel='remove the photo'
        cancelLabel='keep it'
        onCancel={() => setPendingRemoval(null)}
        onConfirm={() => {
          removeMedia(pendingRemoval.view);
          setPendingRemoval(null);
        }}
        width='sm'
      >
        <Text size='small'>
          {`this photo carries ${pendingRemoval.shapes} ${drawnCalloutsPlural(pendingRemoval.shapes)}` +
            ' — zones, arcs, measurements. They will become plain points: the numbers and the notes' +
            ' stay, but the drawing disappears. Adding the same photo again cannot bring it back.'}
        </Text>
      </ConfirmationModal>
    </>
  );
}
