import { common_MediaFull, common_TechCardMediaKind } from 'api/proto-http/admin';
import { useMediaMap } from 'components/managers/media/utils/useMediaQuery';
import { useSnackBarStore } from 'lib/stores/store';
import { useEffect, useId, useMemo, useState } from 'react';
import { useController, useFormContext, useWatch } from 'react-hook-form';
import { AnnotationEditor } from 'ui/components/annotation/editor';
import { rememberPen } from 'ui/components/annotation/surface';
import { Chip, ChipRow } from 'ui/components/chip';
import { ConfirmationModal } from 'ui/components/confirmation-modal';
import { FocusedAnnotator, type FocusedView } from 'ui/components/focused-annotator';
import { GroupLabel } from 'ui/components/group-label';
import { Pill } from 'ui/components/pill';
import { Section } from 'ui/components/section';
import Select from 'ui/components/select';
import Text from 'ui/components/text';
import Textarea from 'ui/components/text-area';
import { create } from 'zustand';

import type { TechCardFormData } from '../schema';
import { MoodDraft } from './head/mood-draft';
import { useMoodCallouts } from './mood-callouts';

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
 * ДОСКА И ВХОД — ДВА СПИСКА, А НЕ ОДИН СПИСОК С ЯРЛЫКОМ (U-5). Один массив `moodboardMedia` держит
 * обе половины, но РАЗДЕЛЬНЫМИ СТРОКАМИ: строка со `kind = REFERENCE` принадлежит входу и на доске
 * не рисуется НИКОГДА, всё остальное — доска. Раньше это был один ярлык на одной строке, и смена
 * ярлыка уносила картинку с доски вместе с её указаниями: они адресуются по `media_id`, но рисуются
 * только на кадре, а кадра больше не было. Теперь плитку берут во вход ЖЕСТОМ (см. `takeIntoInput`),
 * который заводит ВТОРУЮ строку на тот же `media_id`: доска сохраняет и плитку, и указания, а вход
 * получает собственную запись со своей ролью и своей запиской.
 *
 * ✕ ПЛИТКИ — ЕДИНСТВЕННАЯ НЕВОЗВРАТНАЯ ДВЕРЬ ВО ВСЕЙ ПОЛОСЕ, поэтому она называет цену вслух
 * (Г1/R7): сколько указаний умрёт вместе с плиткой — они не живут больше нигде. Молчащий ✕ уже
 * стоил звонка «а куда делись мои пометки на мудборде».
 */

export const REFERENCE_KIND = 'TECH_CARD_MEDIA_KIND_REFERENCE';

const BOARD_KINDS: common_TechCardMediaKind[] = [
  'TECH_CARD_MEDIA_KIND_MOODBOARD',
  'TECH_CARD_MEDIA_KIND_SWATCH',
];

/**
 * Виды плитки ДОСКИ. `reference` из списка убран намеренно: вход — это не ярлык на плитке, а своя
 * строка, и селект, уносящий картинку с доски, был бы дверью без обратного хода в одном нажатии.
 */
const KIND_ITEMS = [
  { value: 'TECH_CARD_MEDIA_KIND_MOODBOARD', label: 'mood' },
  { value: 'TECH_CARD_MEDIA_KIND_SWATCH', label: 'swatch' },
];

/**
 * Потолок доски. Счётчик «N / 12» обещает рост, поэтому дверь добавления существует ВСЕГДА и при
 * полной доске честно отказывает словами, а не исчезает (Д19): исчезнувшая дверь читается как
 * «добавлять сюда нельзя вообще», и человек идёт искать её в другом месте.
 */
export const MOOD_MAX = 12;

/**
 * Потолок ВХОДА — свой, а не общий с доской. Общий потолок означал, что двенадцатая картинка на
 * доске запрещала тринадцатую в промпте и наоборот: два разных предмета делили одно число, и
 * отказ говорил про доску там, где человек наполнял вход. Число то же, счёт раздельный.
 */
export const INPUT_MAX = 12;

/** Одна строка `moodboardMedia` как её видит форма. Мудборд и референсы правят ОДИН этот список. */
export type BoardItem = NonNullable<TechCardFormData['moodboardMedia']>[number];

/** Строка ВХОДА — та, что рисуется в блоке референсов. */
export const isInputRow = (item: BoardItem) => item.kind === REFERENCE_KIND;
/**
 * Строка ДОСКИ. Определена ОТРИЦАНИЕМ входа, а не перечислением видов: карточка из клона, из
 * импорта или из легаси-разбиения несёт виды, которых сегодняшний словарь не знает, и список
 * «доска = mood | swatch» тихо ронял бы такую строку в НИ ОДИН из двух блоков — то есть терял бы
 * картинку с экрана, сохраняя её в payload.
 */
export const isBoardRow = (item: BoardItem) => !isInputRow(item);

/**
 * ВЗВЕДЁННЫЙ ВЫБОР ПЛИТКИ — единственное состояние, которое делят два соседних блока: ссылку
 * «or from the moodboard» жмут в РЕФЕРЕНСАХ, а выбирают на ДОСКЕ. Ни один из блоков не может им
 * владеть — доска не знает про вход, вход не рисует плиток доски, — а общего родителя править
 * нельзя (`studio-tab.tsx` принадлежит другой задаче). Поэтому состояние живёт здесь, вне обоих
 * деревьев, ровно как соседний `pick-mode.tsx` для верстака.
 *
 * Не в форме и не в React Query: это не свойство карточки, и оно ОБЯЗАНО умирать на Esc и при
 * уходе со страницы. Взвод, переживший перезагрузку, — это карточка, которая выглядит сломанной
 * по причине, которую не объясняет ни одно поле.
 */
type InputPickState = { armed: boolean; arm: () => void; disarm: () => void };
export const useInputPick = create<InputPickState>((set) => ({
  armed: false,
  arm: () => set({ armed: true }),
  disarm: () => set({ armed: false }),
}));

/**
 * Приём картинок в ОДИН из двух ящиков карточки — общая функция на обе двери («+ picture» здесь и
 * «+ reference» в блоке референсов). Чистая: форму она не знает, вызывающий передаёт живой список
 * и получает новый.
 *
 * Заведена общей не для красоты: два отдельных приёма разошлись бы по трём правилам сразу — по
 * дедупликации против ВТОРОГО списка карточки (`technicalMedia`), по потолку и по словам отказа.
 * Разъехавшись, они дали бы дубль медиа, который стоит формуле дайджеста дороже, чем весь блок.
 *
 * ДЕДУПЛИКАЦИЯ СЧИТАЕТСЯ ПО ЯЩИКУ, А НЕ ПО ВСЕМУ СПИСКУ. Одна картинка ИМЕЕТ ПРАВО стоять и на
 * доске, и во входе — это ровно тот жест, ради которого вход отделили; чего она не имеет права —
 * стоять в своём ящике дважды.
 */
export function appendBoardPictures(input: {
  /** Весь `moodboardMedia`: он и возвращается, чтобы соседний ящик не пострадал. */
  live: BoardItem[];
  /** Какие строки принадлежат ящику, куда кладут. */
  inScope: (item: BoardItem) => boolean;
  /** id второго списка карточки (`technicalMedia`): медиа не имеет права стоять в обоих. */
  otherListIds: number[];
  added: common_MediaFull[];
  kind: string;
  max: number;
  /** Как ящик зовут в словах отказа — «board» или «input». */
  scopeLabel: string;
}): { next: BoardItem[]; accepted: common_MediaFull[]; refusal: string | null } {
  const scoped = input.live.filter(input.inScope);
  const taken = new Set<number>([...scoped.map((i) => i.mediaId), ...input.otherListIds]);
  const fresh = input.added.filter((it) => it.id != null && !taken.has(it.id));
  if (!fresh.length) return { next: input.live, accepted: [], refusal: null };

  const room = input.max - scoped.length;
  if (room <= 0) {
    return {
      next: input.live,
      accepted: [],
      refusal: `the ${input.scopeLabel} is full — ${input.max} of ${input.max}; remove a picture first`,
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
        ? `only ${accepted.length} of ${fresh.length} fit — the ${input.scopeLabel} holds ${input.max}`
        : null,
  };
}

/**
 * Плитка доски заводит СВОЮ запись во входе: строка новая, `media_id` тот же, плитка остаётся на
 * месте вместе со всеми своими указаниями. Второй записи на тот же `media_id` во входе не бывает —
 * роль хранится в полосе по `media_id`, и двум записям её было бы нечем различить.
 */
export function takeIntoInput(
  live: BoardItem[],
  mediaId: number,
): { next: BoardItem[]; refusal: string | null } {
  const input = live.filter(isInputRow);
  if (input.some((i) => i.mediaId === mediaId)) {
    return { next: live, refusal: 'this picture is already in the input' };
  }
  if (input.length >= INPUT_MAX) {
    return {
      next: live,
      refusal: `the input is full — ${INPUT_MAX} of ${INPUT_MAX}; remove a reference first`,
    };
  }
  return { next: [...live, { mediaId, kind: REFERENCE_KIND, caption: '' }], refusal: null };
}

export function MoodBoard({
  techCardId,
  disabled,
}: {
  techCardId: number;
  disabled?: boolean;
}): JSX.Element {
  const { control, getValues, setValue } = useFormContext<TechCardFormData>();
  const { showMessage } = useSnackBarStore();

  const all = (useWatch({ control, name: 'moodboardMedia' }) ?? []) as BoardItem[];
  const items = useMemo(() => all.filter(isBoardRow), [all]);
  const inputIds = useMemo(() => new Set(all.filter(isInputRow).map((i) => i.mediaId)), [all]);
  const moodNote = useController({ control, name: 'moodNote' });
  const noteId = useId();
  const bodyId = useId();

  // ЗАПИСЬ СОСТАВА ДОСКИ — ПО КОРНЮ МАССИВА, и по той же причине, что у указаний: блок референсов
  // тоже правит эти строки (он держит вторую половину того же списка), а мутаторы поля-массива
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
    // Ключ — сам id медиа: он уникален ПО ДОСКЕ (во входе на тот же id стоит отдельная строка,
    // но её рисует другой блок) и переживает удаление соседа, в отличие от позиции в ряду.
    key: String(i.mediaId),
    mediaId: i.mediaId,
    full: mediaById.get(i.mediaId),
  }));

  const kindOf = (mediaId: number) =>
    items.find((i) => i.mediaId === mediaId)?.kind ?? 'TECH_CARD_MEDIA_KIND_MOODBOARD';

  const setKind = (mediaId: number, kind: string) => {
    if (!BOARD_KINDS.includes(kind as common_TechCardMediaKind)) return;
    if (kindOf(mediaId) === kind) return;
    writeItems(
      ((getValues('moodboardMedia') ?? []) as BoardItem[]).map((i) =>
        // Правится строка ДОСКИ: строка входа на тот же `media_id` — отдельная запись со своим
        // видом, и трогать её сменой ярлыка на плитке значило бы менять вход, не спросив.
        i.mediaId === mediaId && isBoardRow(i) ? { ...i, kind } : i,
      ),
    );
  };

  // ── как я смотрю на доску: strip | grid ─────────────────────────────────────────────────────
  //
  // ВЫСОТА КАДРА ФИКСИРОВАНА В ОБОИХ РЕЖИМАХ, ШИРИНА ГУЛЯЕТ (U-4). Это инверсия прежнего
  // поведения: доска стояла шириной в 300px на кадр, и высота считалась от пропорций снимка —
  // портрет рядом с панорамой давал ряд, в котором ничего не сравнивается. Кадр НЕ обрезается ни в
  // одном из режимов, поэтому пины по-прежнему ложатся на снимок один в один.
  const [mode, setMode] = useState<'strip' | 'grid'>('grid');
  const rowHeight = mode === 'strip' ? 340 : 280;

  // ── дверь добавления ────────────────────────────────────────────────────────────────────────
  function handleAddMedia(added: common_MediaFull[]): number[] {
    const result = appendBoardPictures({
      live: (getValues('moodboardMedia') ?? []) as BoardItem[],
      inScope: isBoardRow,
      otherListIds: ((getValues('technicalMedia') ?? []) as BoardItem[]).map((i) => i.mediaId),
      added,
      kind: 'TECH_CARD_MEDIA_KIND_MOODBOARD',
      max: MOOD_MAX,
      scopeLabel: 'board',
    });
    // ОТКАЗ ГОВОРИТСЯ ВСЛУХ. Дверь при полной доске остаётся на месте и объясняет себя (Д19):
    // исчезнувшая дверь читается как «сюда добавлять нельзя вообще».
    if (result.refusal) showMessage(result.refusal, 'error');
    if (!result.accepted.length) return [];
    setPicked((prev) => [...prev, ...result.accepted]);
    writeItems(result.next);
    return result.accepted.map((it) => it.id as number);
  }

  // ── взведённый выбор: плитка доски заводит запись во входе ──────────────────────────────────
  const pick = useInputPick();
  const readOnly = !!disabled;
  const picking = pick.armed && !readOnly;

  // Esc снимает взвод. Полоса обещает это словами, поэтому обещание должно исполняться и тогда,
  // когда фокус нигде в частности, — отсюда слушатель на документе, а не на баннере.
  useEffect(() => {
    if (!picking) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        pick.disarm();
      }
    };
    document.addEventListener('keydown', onKey, true);
    return () => document.removeEventListener('keydown', onKey, true);
  }, [picking, pick]);

  // Взвод не переживает уход с экрана: он не свойство карточки.
  useEffect(() => () => useInputPick.getState().disarm(), []);

  function pickIntoInput(mediaId: number) {
    const result = takeIntoInput((getValues('moodboardMedia') ?? []) as BoardItem[], mediaId);
    if (result.refusal) {
      showMessage(result.refusal, 'error');
      return;
    }
    writeItems(result.next);
    // Один жест — одна запись. Взвод снимается сразу: он назывался «pick a picture», в
    // единственном числе, и оставленный взведённым он читался бы как «жду ещё».
    pick.disarm();
    showMessage('the picture is in the input — give it a role there', 'success');
  }

  // ── ✕ плитки: цитата перед уничтожением ─────────────────────────────────────────────────────
  const [pendingRemove, setPendingRemove] = useState<number | null>(null);
  const pendingCallouts = pendingRemove == null ? 0 : callouts.countOn(pendingRemove);
  const pendingAlsoInInput = pendingRemove != null && inputIds.has(pendingRemove);

  function confirmRemove() {
    const mediaId = pendingRemove;
    setPendingRemove(null);
    if (mediaId == null) return;
    // УКАЗАНИЯ УМИРАЮТ ВМЕСТЕ С ПЛИТКОЙ, а не открепляются. Доли кадра осмысленны только на СВОЁМ
    // снимке, номера у мудбордного указания нет, и открепившееся оно не показывается нигде — то
    // есть «сохранили» означало бы «оставили сиротой в payload». Поэтому ✕ и обязан назвать число.
    callouts.removeOn(mediaId);
    // Снимается ТОЛЬКО строка доски. Запись входа на тот же `media_id` — отдельная сущность со
    // своей ролью и своей запиской, и её сносит собственный ✕ в блоке референсов, который тоже
    // называет свою цену. Одна дверь, уносящая две вещи в разных блоках, — это дверь, о цене
    // которой человек узнаёт после.
    writeItems(
      ((getValues('moodboardMedia') ?? []) as BoardItem[]).filter(
        (i) => !(i.mediaId === mediaId && isBoardRow(i)),
      ),
    );
  }

  // ── колапс блока (U-3) ──────────────────────────────────────────────────────────────────────
  //
  // Стрелка стоит РОВНО ТАМ, где стоял счётчик «4 / 12», как и просил владелец, а сам счёт уехал в
  // серую оговорку рядом с именем блока: свёрнутый блок, который не говорит, сколько в нём лежит,
  // отвечает на вопрос «стоит ли разворачивать» молчанием.
  const [open, setOpen] = useState(true);

  return (
    <Section
      title='moodboard'
      question={`— the mood, not the prompt: nothing here is sent to generation · ${items.length} / ${MOOD_MAX}`}
      action={
        <button
          type='button'
          onClick={() => setOpen(!open)}
          aria-expanded={open}
          aria-controls={bodyId}
          aria-label={open ? 'collapse the moodboard' : 'expand the moodboard'}
          className='cursor-pointer px-1 text-labelColor hover:text-textColor'
        >
          <Text size='micro' component='span'>
            {open ? '▲' : '▼'}
          </Text>
        </button>
      }
    >
      <div id={bodyId} className={open ? 'space-y-stack' : 'hidden'}>
        {/* ПОЛОСА ВЗВОДА. Стоит НАД доской, а не под ней: она объясняет, почему плитки вдруг
            обведены пунктиром, и объяснение обязано попасться на глаза раньше следствия. */}
        {picking && (
          <div className='flex flex-wrap items-center gap-2 border border-textColor px-2.5 py-1.5'>
            <Text size='micro' variant='label' component='span'>
              pick a moodboard picture — it becomes a reference too, the tile stays here
            </Text>
            <Chip onClick={() => pick.disarm()} className='ml-auto'>
              esc to cancel
            </Chip>
          </div>
        )}

        <FocusedAnnotator
          layout='grid'
          // U-4: ВЫСОТА ОДНА НА ВСЕ КАДРЫ. `railWrap` (перенос по строкам ценой разной высоты)
          // снят; его место занимает пара `gridRowHeight` + `wrapRows`, которая переносит по
          // строкам, НЕ отпуская высоту.
          railWrap={false}
          gridRowHeight={rowHeight}
          wrapRows={mode === 'grid'}
          // U-3: виды указаний — слева, переключатель strip/grid — справа, на одном уровне.
          kindsFirst
          viewControls={
            <ChipRow>
              {(['strip', 'grid'] as const).map((m) => (
                <Chip
                  key={m}
                  nonForm
                  selected={mode === m}
                  pressed={mode === m}
                  onClick={() => setMode(m)}
                >
                  {m}
                </Chip>
              ))}
            </ChipRow>
          }
          tilePick={{
            active: picking,
            onPick: (view) => pickIntoInput(view.mediaId),
            taken: (mediaId) => inputIds.has(mediaId),
            label: (view, i) => `take picture ${i + 1} into the input`,
            takenLabel: 'in the input',
          }}
          views={views}
          // ПОДЛОЖКА ПОД ЛИНИЯМИ УКАЗАНИЙ — ЭТО ФОТОГРАФИИ. Чернильная линия на пёстром снимке
          // тонет, и указание перестаёт быть видно ровно там, где его поставили.
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
              {inputIds.has(view.mediaId) && <Pill tone='ink'>in the input</Pill>}
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
                onDemote={
                  (value.kind ?? 'pin') === 'pin' ? undefined : () => callouts.demote(index)
                }
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
            каждый прогон и живёт в блоке референсов; эта записка не покидает мудборда, её читает
            только человек и черновик ниже.
            Поле пустое ≠ поле не заполнено: `moodNote` объявлено `.nullish()` без `.default('')`,
            потому что у него серверный протокол «отсутствует = сохрани хранимое», а пустая строка
            это КОМАНДА «очисти». Поэтому в форму пишется ровно то, что напечатал человек, и
            молчащая форма молчит. */}
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

        {/* ЧЕРНОВИК ИДЕИ — `moodDraftHtml` прототипа, который зовёт его ПОСЛЕДНИМ внутри доски
            (`proto.html:3271`), поэтому и здесь он стоит внизу этой же секции.
            Здесь стоял черновик, собиравшийся В БРАУЗЕРЕ: он склеивал общую записку с текстами
            указаний и называл это «read the board». Слова были честные, но органом прототипа это
            не было — тот просит прозу у модели. Бэкенд отдаёт `DraftDesignIdea`, и теперь зовётся
            он. */}
        <MoodDraft techCardId={techCardId} disabled={readOnly} />
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
          {pendingAlsoInInput && (
            <Text size='control'>
              The same picture also stands in the input — that reference is its own entry and stays
              there, with its role and its note.
            </Text>
          )}
          {pendingCallouts === 0 && !pendingAlsoInInput && (
            <Text size='control'>
              The picture comes off the board. The file itself stays in the library.
            </Text>
          )}
        </div>
      </ConfirmationModal>
    </Section>
  );
}
