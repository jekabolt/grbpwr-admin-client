import { common_MediaFull, common_TechCardMediaKind } from 'api/proto-http/admin';
import { useMediaMap } from 'components/managers/media/utils/useMediaQuery';
import { useSnackBarStore } from 'lib/stores/store';
import { useId, useMemo, useState } from 'react';
import { useController, useFormContext, useWatch } from 'react-hook-form';
import { AnnotationEditor } from 'ui/components/annotation/editor';
import { rememberPen } from 'ui/components/annotation/surface';
import { Button } from 'ui/components/button';
import { Chip, ChipRow } from 'ui/components/chip';
import { ConfirmationModal } from 'ui/components/confirmation-modal';
import { FocusedAnnotator, type FocusedView } from 'ui/components/focused-annotator';
import { GroupLabel } from 'ui/components/group-label';
import { Pill } from 'ui/components/pill';
import { Section } from 'ui/components/section';
import Select from 'ui/components/select';
import Text from 'ui/components/text';
import Textarea from 'ui/components/text-area';

import type { TechCardFormData } from '../schema';
import { useMoodCallouts } from './mood-callouts';
import { useDesignWrites } from './use-design-band';

/**
 * МУДБОРД — первый пункт процесса и единственная доска, которую человек наполняет руками.
 *
 * ЧТО ЗДЕСЬ ЛЕЖИТ И ГДЕ ОНО ЖИВЁТ. Плитки — это `moodboardMedia` ДОКУМЕНТА (карточка знает свои
 * картинки и без полосы DESIGN); указания на плитках — `callouts` того же документа, отфильтрованные
 * по мудбордным `media_id` (см. `./mood-callouts`); общая записка — `moodNote`. Полоса DESIGN сюда
 * не приходит вовсе, и подпись органа это утверждает: доска не зависит от того, отвечает ли сервер
 * новые маршруты.
 *
 * ПОЧЕМУ ЭТО НЕ ПРОМПТ. Мудборд читает человек и черновик идеи; в генерацию не уходит ничего
 * (`B2`). Оговорка стоит прямо в подписи блока, потому что «картинки, которые я собрал» и «картинки,
 * которые увидит модель» — два разных предмета, и второй живёт в блоке референсов ниже.
 *
 * ✕ ПЛИТКИ — ЕДИНСТВЕННАЯ НЕВОЗВРАТНАЯ ДВЕРЬ ВО ВСЕЙ ПОЛОСЕ, поэтому она называет цену вслух
 * (Г1/R7): сколько указаний умрёт вместе с плиткой — они не живут больше нигде — и уносит ли она
 * роль референса. Молчащий ✕ уже стоил звонка «а куда делись мои пометки на мудборде».
 */

const MOODBOARD_KINDS: common_TechCardMediaKind[] = [
  'TECH_CARD_MEDIA_KIND_MOODBOARD',
  'TECH_CARD_MEDIA_KIND_REFERENCE',
  'TECH_CARD_MEDIA_KIND_SWATCH',
];

const KIND_ITEMS = [
  { value: 'TECH_CARD_MEDIA_KIND_MOODBOARD', label: 'mood' },
  { value: 'TECH_CARD_MEDIA_KIND_REFERENCE', label: 'reference' },
  { value: 'TECH_CARD_MEDIA_KIND_SWATCH', label: 'swatch' },
];

/**
 * Потолок доски. Счётчик «N / 12» обещает рост, поэтому дверь добавления существует ВСЕГДА и при
 * полной доске честно отказывает словами, а не исчезает (Д19): исчезнувшая дверь читается как
 * «добавлять сюда нельзя вообще», и человек идёт искать её в другом месте.
 */
export const MOOD_MAX = 12;

/** Одна строка `moodboardMedia` как её видит форма. Мудборд и референсы правят ОДИН этот список. */
export type BoardItem = NonNullable<TechCardFormData['moodboardMedia']>[number];

/**
 * Приём картинок на доску — ОДНА функция на обе двери («+ picture» здесь и «+ reference» в блоке
 * референсов). Чистая: форму она не знает, вызывающий передаёт живой список и получает новый.
 *
 * Заведена общей не для красоты: два отдельных приёма разошлись бы по трём правилам сразу — по
 * дедупликации против ВТОРОГО списка карточки (id уникальны по обоим), по потолку доски и по
 * словам отказа. Разъехавшись, они дали бы дубль медиа, который стоит формуле дайджеста дороже,
 * чем весь этот блок.
 */
export function appendBoardPictures(input: {
  live: BoardItem[];
  /** id второго списка карточки (`technicalMedia`): медиа не имеет права стоять в обоих. */
  otherListIds: number[];
  added: common_MediaFull[];
  kind: string;
}): { next: BoardItem[]; accepted: common_MediaFull[]; refusal: string | null } {
  const taken = new Set<number>([...input.live.map((i) => i.mediaId), ...input.otherListIds]);
  const fresh = input.added.filter((it) => it.id != null && !taken.has(it.id));
  if (!fresh.length) return { next: input.live, accepted: [], refusal: null };

  const room = MOOD_MAX - input.live.length;
  if (room <= 0) {
    return {
      next: input.live,
      accepted: [],
      refusal: `the board is full — ${MOOD_MAX} of ${MOOD_MAX}; remove a picture first`,
    };
  }
  const accepted = fresh.slice(0, room);
  return {
    next: [
      ...input.live,
      ...accepted.map((it) => ({ mediaId: it.id as number, kind: input.kind, caption: '' })),
    ],
    accepted,
    refusal:
      accepted.length < fresh.length
        ? `only ${accepted.length} of ${fresh.length} fit — the board holds ${MOOD_MAX}`
        : null,
  };
}

/** Слепок доски, по которому черновик понимает, что он протух. */
type MoodDraft = {
  lines: string[];
  readPictures: number;
  readCallouts: number;
  time: string;
  fingerprint: string;
};

const hhmm = () =>
  new Intl.DateTimeFormat('en-GB', { hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(
    new Date(),
  );

export function MoodBoard({
  techCardId,
  disabled,
}: {
  techCardId: number;
  disabled?: boolean;
}): JSX.Element {
  const { control, getValues, setValue } = useFormContext<TechCardFormData>();
  const { showMessage } = useSnackBarStore();
  const { setReferenceRole } = useDesignWrites(techCardId);

  const items = (useWatch({ control, name: 'moodboardMedia' }) ?? []) as BoardItem[];
  const moodNote = useController({ control, name: 'moodNote' });
  const noteId = useId();

  // ЗАПИСЬ СОСТАВА ДОСКИ — ПО КОРНЮ МАССИВА, и по той же причине, что у указаний: блок референсов
  // тоже правит эти строки (он переводит картинку в `reference` и обратно), а мутаторы поля-массива
  // до соседнего читателя не доходят. Корневая запись событие эмитит.
  const writeItems = (next: BoardItem[]) =>
    setValue('moodboardMedia', next as TechCardFormData['moodboardMedia'], { shouldDirty: true });

  // Свежевыбранные медиа разрешаются локально: без этого только что добавленную картинку нельзя
  // разметить до сохранения и перезагрузки.
  const [picked, setPicked] = useState<common_MediaFull[]>([]);
  // БИБЛИОТЕКА, А НЕ `resolvedMoodboardMedia`. Подпись органа даёт только `techCardId`, карточки у
  // него нет, и это намеренно: доска не должна знать про полосу. Цена названа честно — картинка
  // старше последних пятисот файлов библиотеки не разрешится, и кадр останется в ряду пустым,
  // сохранив свои указания (`FocusedAnnotator` рисует неразрешённый кадр, а не выбрасывает его).
  const libraryMap = useMediaMap();
  const mediaById = useMemo(() => {
    const m = new Map<number, common_MediaFull>(libraryMap);
    for (const p of picked) if (p.id != null) m.set(p.id, p);
    return m;
  }, [libraryMap, picked]);

  const moodMediaIds = useMemo(
    () => new Set(items.map((i) => i.mediaId).filter((id): id is number => !!id)),
    [items],
  );
  const callouts = useMoodCallouts(moodMediaIds);

  const views: FocusedView[] = items.map((i) => ({
    // Ключ — сам id медиа: он уникален по обоим спискам карточки и переживает удаление соседа,
    // в отличие от позиции в ряду.
    key: String(i.mediaId),
    mediaId: i.mediaId,
    full: mediaById.get(i.mediaId),
  }));

  const kindOf = (mediaId: number) =>
    items.find((i) => i.mediaId === mediaId)?.kind ?? 'TECH_CARD_MEDIA_KIND_MOODBOARD';

  const setKind = (mediaId: number, kind: string) => {
    if (!MOODBOARD_KINDS.includes(kind as common_TechCardMediaKind)) return;
    const was = kindOf(mediaId);
    if (was === kind) return;
    writeItems(
      ((getValues('moodboardMedia') ?? []) as BoardItem[]).map((i) =>
        i.mediaId === mediaId ? { ...i, kind } : i,
      ),
    );
    // Картинка, переставшая быть референсом, теряет и роль в промпте: роль — это утверждение про
    // ВХОД, а вход у неё кончился. Оставленная роль стала бы записью, которую не видно ни на одном
    // экране и которую нечем снять.
    //
    // ГАСИТСЯ ПО ПРЕЖНЕМУ ЗНАЧЕНИЮ, А НЕ ПО НОВОМУ. «Всё, что не reference, снимает роль» слало бы
    // очистку и при переводе mood → swatch, то есть сетевой запрос и инвалидацию полосы на каждое
    // касание селекта — с шансом на снекбар об ошибке там, где человек ничего про роли не делал.
    if (was === 'TECH_CARD_MEDIA_KIND_REFERENCE' && kind !== 'TECH_CARD_MEDIA_KIND_REFERENCE') {
      setReferenceRole.mutate({ mediaId, role: '', ordinal: 0 });
    }
  };

  // ── дверь добавления ────────────────────────────────────────────────────────────────────────
  function handleAddMedia(added: common_MediaFull[]): number[] {
    const result = appendBoardPictures({
      live: (getValues('moodboardMedia') ?? []) as BoardItem[],
      otherListIds: ((getValues('technicalMedia') ?? []) as BoardItem[]).map((i) => i.mediaId),
      added,
      kind: 'TECH_CARD_MEDIA_KIND_MOODBOARD',
    });
    // ОТКАЗ ГОВОРИТСЯ ВСЛУХ. Дверь при полной доске остаётся на месте и объясняет себя (Д19):
    // исчезнувшая дверь читается как «сюда добавлять нельзя вообще».
    if (result.refusal) showMessage(result.refusal, 'error');
    if (!result.accepted.length) return [];
    setPicked((prev) => [...prev, ...result.accepted]);
    writeItems(result.next);
    return result.accepted.map((it) => it.id as number);
  }

  // ── ✕ плитки: цитата перед уничтожением ─────────────────────────────────────────────────────
  const [pendingRemove, setPendingRemove] = useState<number | null>(null);
  const pendingCallouts = pendingRemove == null ? 0 : callouts.countOn(pendingRemove);
  const pendingIsReference =
    pendingRemove != null && kindOf(pendingRemove) === 'TECH_CARD_MEDIA_KIND_REFERENCE';

  function confirmRemove() {
    const mediaId = pendingRemove;
    setPendingRemove(null);
    if (mediaId == null) return;
    // Порядок важен: сначала снимается роль (сервер отвергнет роль на медиа, которого карточка
    // больше не держит), потом уходят указания, потом сама плитка.
    if (kindOf(mediaId) === 'TECH_CARD_MEDIA_KIND_REFERENCE') {
      setReferenceRole.mutate({ mediaId, role: '', ordinal: 0 });
    }
    // УКАЗАНИЯ УМИРАЮТ ВМЕСТЕ С ПЛИТКОЙ, а не открепляются. Доли кадра осмысленны только на СВОЁМ
    // снимке, номера у мудбордного указания нет, и открепившееся оно не показывается нигде — то
    // есть «сохранили» означало бы «оставили сиротой в payload». Поэтому ✕ и обязан назвать число.
    callouts.removeOn(mediaId);
    writeItems(
      ((getValues('moodboardMedia') ?? []) as BoardItem[]).filter((i) => i.mediaId !== mediaId),
    );
  }

  // ── черновик идеи ───────────────────────────────────────────────────────────────────────────
  //
  // ЧИТАТЕЛЬ ЧИТАЕТ ТО, ЧТО ЧЕЛОВЕК ПИСАЛ РУКАМИ (Г1). До этой правки черновик собирался из имён
  // плиток и общей записки, а тексты указаний — самое ценное, что есть на доске, — не читал никто:
  // дизайнер размечал мудборд и получал черновик, в котором его слов нет.
  const fingerprint = JSON.stringify([
    items.map((i) => i.mediaId),
    (moodNote.field.value ?? '').trim(),
    callouts.texts(),
  ]);
  const [draft, setDraft] = useState<MoodDraft | null>(null);
  const [taken, setTaken] = useState<string[]>([]);
  const stale = !!draft && draft.fingerprint !== fingerprint;

  function readTheBoard() {
    const texts = callouts.texts();
    const note = (moodNote.field.value ?? '').trim();
    const lines = [
      `The mood is set by ${items.length} picture${items.length === 1 ? '' : 's'}.`,
      ...(note ? [note] : []),
      ...texts,
    ];
    setDraft({
      lines,
      readPictures: items.length,
      readCallouts: texts.length,
      time: hhmm(),
      fingerprint,
    });
    setTaken([]);
  }

  function addLineToConcept(line: string) {
    const current = (getValues('concept') ?? '').trim();
    setValue('concept', current ? `${current}\n${line}` : line, { shouldDirty: true });
    setTaken((prev) => [...prev, line]);
  }

  const readOnly = !!disabled;

  return (
    <Section
      title='moodboard'
      question='— the mood, not the prompt: nothing here is sent to generation'
      action={
        <Text size='micro' variant='label' component='span'>
          {items.length} / {MOOD_MAX}
        </Text>
      }
    >
      <FocusedAnnotator
        layout='grid'
        railWrap
        views={views}
        // ПОДЛОЖКА ПОД ЛИНИЯМИ — ЭТО ФОТОГРАФИИ. Чернильная линия на пёстром снимке тонет, и
        // указание перестаёт быть видно ровно там, где его поставили.
        halo
        calloutsFor={callouts.calloutsFor}
        onAddCallout={callouts.add}
        onEditPoints={callouts.editPoints}
        onMoveCallout={callouts.moveLabel}
        onRemoveCallout={callouts.removeByKey}
        onPickMedia={handleAddMedia}
        onRemoveMedia={(view) => setPendingRemove(view.mediaId)}
        readOnly={readOnly}
        addLabel='+ picture'
        purpose='moodboard reference'
        carouselLabel='moodboard'
        emptyLabel='nothing on the board yet. drop a picture, paste one with ⌘V, or browse the library — then pin notes on it'
        mediaLabel={(view, i) => `moodboard picture ${i + 1}`}
        renderFocusedFooter={(view) => (
          <div className='flex items-center gap-2'>
            <Select
              name={`mood-kind-${view.mediaId}`}
              items={KIND_ITEMS}
              value={kindOf(view.mediaId)}
              placeholder='mood'
              readOnly={readOnly}
              onValueChange={(v) => setKind(view.mediaId, v)}
              className='w-[120px]'
            />
            {kindOf(view.mediaId) === 'TECH_CARD_MEDIA_KIND_REFERENCE' && (
              <Pill tone='ink'>in the input</Pill>
            )}
          </div>
        )}
        renderEditor={(key, { close }) => {
          const row = callouts.at(key);
          if (!row) return null;
          const { index, value } = row;
          return (
            <AnnotationEditor
              kind={value.kind ?? 'pin'}
              // НОМЕРА НЕТ И В РЕДАКТОРЕ: мудбордную пометку не адресует ни деталь, ни операция,
              // ни дефект, и нарисованный номер обещал бы адрес, которого не существует.
              text={value.description ?? ''}
              color={value.color ?? ''}
              dashed={!!value.dashed}
              filled={!!value.filled}
              // Деталей кроя у мудбордной пометки нет: она про настроение, а не про изделие.
              pieceKeys={[]}
              onPieces={() => {}}
              onText={(v) => callouts.setText(index, v)}
              onColor={(v) => {
                rememberPen({ color: v });
                callouts.setColor(index, v);
              }}
              onDashed={(v) => {
                rememberPen({ dashed: v });
                callouts.setDashed(index, v);
              }}
              onFilled={(v) => {
                rememberPen({ filled: v });
                callouts.setFilled(index, v);
              }}
              onDemote={(value.kind ?? 'pin') === 'pin' ? undefined : () => callouts.demote(index)}
              onRemove={() => {
                callouts.removeByKey(key);
                close();
              }}
              onClose={close}
            />
          );
        }}
      />

      {/* ОБЩАЯ ЗАПИСКА — ОДНА НА ВСЮ ДОСКУ, и это НЕ описание изделия. Описание изделия уходит в
          каждый прогон; эта записка не покидает мудборда, её читает только человек и черновик ниже.
          Поле пустое ≠ поле не заполнено: `moodNote` объявлено `.nullish()` без `.default('')`,
          потому что у него серверный протокол «отсутствует = сохрани хранимое», а пустая строка
          это КОМАНДА «очисти». Поэтому в форму пишется ровно то, что напечатал человек, и молчащая
          форма молчит. */}
      <div>
        <GroupLabel>shared note</GroupLabel>
        <label htmlFor={noteId} className='sr-only'>
          shared note
        </label>
        <Textarea
          {...moodNote.field}
          id={noteId}
          disabled={readOnly}
          value={moodNote.field.value ?? ''}
          rows={3}
          maxLength={2000}
          placeholder='what these pictures say together'
          className='resize-none'
        />
        <Text size='micro' variant='label' className='mt-px'>
          not the garment description — that one goes into every run; this one never leaves the
          moodboard
        </Text>
      </div>

      {/* ЧЕРНОВИК ИДЕИ. Собирается ЗДЕСЬ, из того, что лежит на доске, — и подпись это говорит:
          прозу пишет модель, а генеративная машина в эту волну отрезана, и обещать её словами
          кнопки значило бы обещать то, чего нет. Ценность и без модели настоящая: тексты указаний
          иначе не собраны нигде, а именно из-за них черновик и заводился. */}
      <div>
        <GroupLabel>draft of the idea</GroupLabel>
        <div className='flex flex-wrap items-baseline gap-2'>
          <Button
            type='button'
            variant='secondary'
            size='sm'
            disabled={readOnly || items.length === 0}
            onClick={readTheBoard}
          >
            read the board ▸
          </Button>
          <Text size='micro' variant='label' component='span'>
            reads the pictures, the shared note and every note pinned on them. Nothing is written
            until you add a line.
          </Text>
        </div>

        {draft && (
          <div className='mt-2 space-y-1'>
            <div className='flex flex-wrap items-baseline gap-2'>
              <Text size='micro' variant='label' component='span'>
                read {draft.readPictures} picture{draft.readPictures === 1 ? '' : 's'} ·{' '}
                {draft.readCallouts} note{draft.readCallouts === 1 ? '' : 's'} · {draft.time}
              </Text>
              {/* СТЕЙЛ СРАВНИВАЕТ И УКАЗАНИЯ. Слепок из «числа плиток + общей записки» молчал ровно
                  тогда, когда человек работал руками: дописал пометку — черновик по-прежнему
                  «свежий», хотя читал он другую доску. */}
              {stale && <Pill tone='attention'>the moodboard has changed since</Pill>}
            </div>
            {draft.lines.map((line, i) => (
              <div
                key={`${i}:${line}`}
                className='flex items-start gap-2 border-b border-hairline py-1'
              >
                <Text size='micro' component='span' className='min-w-0 flex-1'>
                  {line}
                </Text>
                <ChipRow>
                  {taken.includes(line) ? (
                    <Pill tone='ok'>added</Pill>
                  ) : (
                    <Chip
                      disabled={readOnly}
                      onClick={() => addLineToConcept(line)}
                      title='append this line to the card’s concept'
                    >
                      add to concept
                    </Chip>
                  )}
                </ChipRow>
              </div>
            ))}
          </div>
        )}
      </div>

      <ConfirmationModal
        open={pendingRemove != null}
        onOpenChange={(open) => !open && setPendingRemove(null)}
        onConfirm={confirmRemove}
        onCancel={() => setPendingRemove(null)}
        title='remove the picture'
        confirmLabel='remove it'
        width='sm'
      >
        <div className='space-y-2'>
          {pendingCallouts > 0 && (
            <Text size='control'>
              {pendingCallouts} note{pendingCallouts === 1 ? '' : 's'} pinned on this picture{' '}
              {pendingCallouts === 1 ? 'dies' : 'die'} with it — they live nowhere else.
            </Text>
          )}
          {pendingIsReference && (
            <Text size='control'>
              It is also an input reference — its role in the prompt goes with it.
            </Text>
          )}
          {pendingCallouts === 0 && !pendingIsReference && (
            <Text size='control'>
              The picture comes off the board. The file itself stays in the library.
            </Text>
          )}
        </div>
      </ConfirmationModal>
    </Section>
  );
}
