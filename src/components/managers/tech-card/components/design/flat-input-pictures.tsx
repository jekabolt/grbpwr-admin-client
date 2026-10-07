import type {
  GetDesignBandResponse,
  common_DesignBenchSlot,
  common_DesignInputSlot,
  common_DesignRunParams,
  common_MediaFull,
} from 'api/proto-http/admin';
import { useQueryClient } from '@tanstack/react-query';
import { MediaSlot } from 'components/managers/media/components/media-slot';
import { useSnackBarStore } from 'lib/stores/store';
import { cn } from 'lib/utility';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useFormContext, useWatch } from 'react-hook-form';
import { FocusedAnnotator, type FocusedView } from 'ui/components/focused-annotator';
import Text from 'ui/components/text';

import type { TechCardFormData } from '../schema';
import { useTechCardAutosave } from './autosave-contract';
import { displayDetailName, readBench } from './bench-slot';
import { labelsByMedia, viewWord } from './board-labels';
import { serverSpeaksDesign } from './capability';
import { holdFlatInput, readFlatInput, rowsWritable } from './flat-input';
import { flatRunParams, type FlatSelection } from './flat-run-row';
import { targetSlotId } from './flat-route';
import { HELD_WORD } from './modals/what-model-gets-modal';
import {
  appendBoardPictures,
  isBoardRow,
  MOOD_MAX,
  useLabelPoll,
  type BoardItem,
} from './mood-board';
import {
  designKeys,
  isUnimplemented,
  useDesignWrites,
  useFlatPreviewTiles,
} from './use-design-band';
import { DETAIL_VIEW } from './views';

/**
 * ═══ ВХОД ФЛЭТА — КАРТИНКИ, КОТОРЫЕ УЙДУТ В ПРОМПТ (M13, владелец 07.10) ═══════════════════════════
 *
 * «в флет инпутах надо показывать все медиа которые идут в промпт — те детали и сайды — с таким же UI
 * как в мудборде». Плитки — ТА ЖЕ лента, что у доски (`FocusedAnnotator`, `layout='grid'`, ярлык
 * `N · слово`), только для чтения и ниже ростом. Свой копии плитки нет.
 *
 * ИСТОЧНИК — ОТВЕТ СЕРВЕРА, А НЕ ДОСКА: `PreviewDesignRunInputs` с ровно теми параметрами, что ушли бы
 * нажатием (`flatRunParams`, тот же строитель, что у GENERATE и у «what the model gets»). Поэтому
 * показанное = отправленное, а удержанное (mood, «view ?», старше двух свежих) здесь не стоит вовсе —
 * оно с причиной в модалке. Номер плитки — порядок в промпте, как строки модалки.
 *
 *   VIEWS                  — фото нажатия «views» (≤2 на вид);
 *   DETAIL · <имя>         — фото нажатия этой детали (≤4) и приложенные принятые FRONT/BACK —
 *                            мелкими плитками `… flat`, номер продолжает фото.
 * Деталь стоит здесь, когда у неё есть свои фото, или когда она выбрана в target ▾ (тогда видно, что
 * её нажатие пошлёт одни флэты). Группа выбранной цели — в полный тон, остальные приглушены.
 *
 * ЧТЕНИЕ БЕСПЛАТНО (сухой прогон сборки входа: ни модели, ни денег) и не на каждое сохранение: ключ —
 * то, что сборка читает (сохранённая доска, ярлыки, флэтовый верстак, `previewStamp`).
 *
 * M14 (владелец 07.10: «в инпутс должна быть возможность так же добавить медиа»): у каждой группы —
 * тот же слот `+ picture`, что первым стоит в ленте доски (`MediaSlot`: библиотека, бросок, ⌘V).
 * Картинка ложится НА ДОСКУ — других мест у неё нет (101): в VIEWS — с назначением `target`, вид ей
 * ставит разметчик доски (M4); в DETAIL · имя — с назначением `detail` и ярлыком ЧЕЛОВЕКА на слот этой
 * детали (модель его не трогает). Пока сервер не сказал, уйдёт ли она, она стоит в группе бледной
 * плиткой без номера: `…` — читается или ещё не сохранена; слово причины (`view ?`, `older`…) —
 * удержана, и модалка «what the model gets» говорит почему. Ушла в превью — стала обычной плиткой.
 */

/** Рост ленты фото и ленты приложенных флэтов, px. Доска стоит в 380 — вход это сводка, не рабочее место. */
const PHOTO_ROW_PX = 140;
const PLATE_ROW_PX = 96;

/** Слово плитки фото: вид, флэт «from my flat» или имя детали — как на плитке доски. */
const refWord = (role: string, detail: string): string =>
  role === 'front_flat'
    ? 'front flat'
    : role === 'back_flat'
      ? 'back flat'
      : role === 'detail'
        ? detail
        : viewWord(role);

/** Слово приложенного флэта: `front flat`, `back flat` (деталь — своим именем). */
const plateWord = (s: common_DesignInputSlot): string => {
  const view = (s.viewKey ?? '').trim();
  const name = view === 'detail' ? (s.detailName ?? '').trim() || 'detail' : viewWord(view);
  return `${name} flat`;
};

/**
 * ЧТО ЧИТАЕТ СБОРКА ВХОДА — И ТОЛЬКО ЭТО: доска (назначения картинок), ярлыки и флэтовый верстак.
 * Слова WORDS ключ не трогают. Сервер читает СОХРАНЁННУЮ карточку, поэтому правка доски спрашивает
 * ещё и на двух следующих сохранениях (`round`; второе ловит правку, сделанную, пока первое летело).
 * Сама доска в ключе (Codex M13): вход, смонтированный заново после сохранённой на шаге MOODBOARD
 * правки, не возьмёт из кэша ответ, прочитанный до неё, — `round` при монтировании снова ноль; и всё
 * равно каждое монтирование спрашивает заново (`useFlatPreviewTiles`: staleTime 0) — кэш лишь
 * держит плитки на экране, пока идёт ответ.
 */
export function usePreviewStamp(band: GetDesignBandResponse): string {
  const { control } = useFormContext<TechCardFormData>();
  const autosave = useTechCardAutosave();
  const all = (useWatch({ control, name: 'moodboardMedia' }) ?? []) as BoardItem[];
  const boardSig = useMemo(
    () => JSON.stringify(all.filter(isBoardRow).map((i) => [i.mediaId, i.role ?? ''])),
    [all],
  );
  const bandSig = useMemo(
    () =>
      JSON.stringify([
        (band.references ?? []).map((r) => [
          r.mediaId,
          r.role,
          r.labelState,
          r.labelSource,
          r.detailSlotId,
          r.ordinal,
        ]),
        (band.bench ?? [])
          .filter((s) => (s.kind ?? 'flat') === 'flat' && !(s.colorwayId ?? 0))
          .map((s) => [s.id, s.viewKey, s.pictureId, s.detailName]),
      ]),
    [band.references, band.bench],
  );
  const settled = (st: string) => st === 'idle' || st === 'saved' || st === 'off';
  // Смонтирован с несохранённой картой (правка доски и сразу на FLAT, Codex M13) — так же два
  // следующих сохранения: первое могло улететь ещё без правки.
  const pending = useRef(settled(autosave.status) ? 0 : 2);
  const lastBoard = useRef(boardSig);
  const lastSaved = useRef(autosave.lastSavedAt);
  const [round, setRound] = useState(0);
  useEffect(() => {
    if (boardSig === lastBoard.current) return;
    lastBoard.current = boardSig;
    pending.current = 2;
  }, [boardSig]);
  useEffect(() => {
    // Только НОВОЕ сохранение: значение на монтировании — то, что уже было до входа.
    if (autosave.lastSavedAt === lastSaved.current) return;
    lastSaved.current = autosave.lastSavedAt;
    if (pending.current <= 0) return;
    pending.current -= 1;
    setRound((n) => n + 1);
  }, [autosave.lastSavedAt]);
  return `${bandSig}|${boardSig}|${round}`;
}

/** Where a picture added in the input goes: the views press, or one detail's slot. */
export type InputAddTarget = { kind: 'views' } | { kind: 'detail'; slotId: number };

/**
 * M14 · КАРТИНКА, ДОБАВЛЕННАЯ ВО ВХОДЕ, — НА ДОСКУ (чистая: форма снаружи). Новая встаёт строкой доски
 * с назначением группы (`target` / `detail`) тем же приёмом, что «+ picture» доски
 * (`appendBoardPictures`: дубль в ящике невозможен, потолок доски, слова отказа). Уже лежащая на доске
 * получает назначение группы — человек показал её ЗДЕСЬ. Картинку из технического списка карточки
 * доска не берёт (медиа не стоит в двух списках). `placed` — что теперь стоит на доске с назначением
 * группы, в порядке выбора.
 */
export function planInputAdd(input: {
  live: BoardItem[];
  otherListIds: number[];
  added: common_MediaFull[];
  target: InputAddTarget;
  max: number;
}): { next: BoardItem[]; placed: number[]; refusal: string | null } {
  const purpose = input.target.kind === 'views' ? 'target' : 'detail';
  const onBoard = new Set(input.live.filter(isBoardRow).map((i) => i.mediaId));
  const elsewhere = new Set(input.otherListIds);
  const ids = input.added.map((m) => m.id ?? 0).filter((id) => id > 0);
  const again = ids.filter((id) => onBoard.has(id));
  const result = appendBoardPictures({
    live: input.live,
    inScope: isBoardRow,
    otherListIds: input.otherListIds,
    added: input.added.filter((m) => !onBoard.has(m.id ?? 0)),
    kind: 'TECH_CARD_MEDIA_KIND_MOODBOARD',
    max: input.max,
    scopeLabel: 'board',
  });
  const accepted = new Set(result.accepted.map((m) => m.id ?? 0));
  const moved = new Set([...again, ...accepted]);
  const next = result.next.map((i) =>
    isBoardRow(i) && moved.has(i.mediaId) && (i.role ?? '') !== purpose
      ? { ...i, role: purpose }
      : i,
  );
  const refusal =
    result.refusal ??
    (ids.some((id) => elsewhere.has(id) && !onBoard.has(id))
      ? 'that picture is one of the card’s own flats — it goes with «from my flat»'
      : null);
  return { next, placed: ids.filter((id) => moved.has(id)), refusal };
}

/**
 * The input's add gesture: the plan above into the form (the autosave carries it), and for a detail
 * a PERSON's label on its slot — written first, so the model never reads it as some other detail.
 * Refused while a flat run is being started (the run would take a board half before, half after).
 */
function useInputAdd(techCardId: number) {
  const { getValues, setValue } = useFormContext<TechCardFormData>();
  const { showMessage } = useSnackBarStore();
  const { setReferenceRole } = useDesignWrites(techCardId);
  return useCallback(
    (added: common_MediaFull[], target: InputAddTarget): number[] => {
      const card = techCardId;
      if (!rowsWritable(readFlatInput(card))) {
        showMessage('a flat run is being started — add the picture once it has started', 'error');
        return [];
      }
      const plan = planInputAdd({
        live: (getValues('moodboardMedia') ?? []) as BoardItem[],
        otherListIds: ((getValues('technicalMedia') ?? []) as BoardItem[]).map((i) => i.mediaId),
        added,
        target,
        max: MOOD_MAX,
      });
      if (plan.refusal) showMessage(plan.refusal, 'error');
      if (!plan.placed.length) return [];
      /* VIEWS: a picture moved here from a detail keeps its label row — a model's is read again by
         the server (the purpose changed under it), a person's asks «which view is this?» under the
         moodboard (an empty role would be a person's «no view», Codex M14). */
      if (target.kind === 'detail') {
        const order = plan.next.filter(isBoardRow).map((i) => i.mediaId);
        const release = holdFlatInput(card);
        void Promise.all(
          plan.placed.map((mediaId) =>
            setReferenceRole.mutateAsync({
              mediaId,
              role: DETAIL_VIEW,
              ordinal: Math.max(1, order.indexOf(mediaId) + 1),
              detailSlotId: target.slotId,
            }),
          ),
        )
          // A refusal is said by the write's own seam (`onError`).
          .catch(() => {})
          .finally(release);
      }
      setValue('moodboardMedia', plan.next as TechCardFormData['moodboardMedia'], {
        shouldDirty: true,
      });
      return plan.placed;
    },
    [techCardId, getValues, setValue, showMessage, setReferenceRole],
  );
}

/** A picture added in this input, this session — shown pale until the server says it is sent. */
type Added = { mediaId: number; full: common_MediaFull; group: string };

export function FlatInputPictures({
  techCardId,
  band,
  selection,
  disabled = false,
}: {
  techCardId: number;
  band: GetDesignBandResponse;
  /** What the run row stands on (`FlatRunRow` → `onSelection`); null until it has said. */
  selection: FlatSelection | null;
  /** The card cannot be written: no add slot. */
  disabled?: boolean;
}): JSX.Element | null {
  const speaks = serverSpeaksDesign();
  const stamp = usePreviewStamp(band);
  // Полоса ещё не прочитана — ярлыков и верстака нет, спрашивать рано (вопрос ушёл бы дважды).
  const bandRead =
    (useQueryClient().getQueryState(designKeys.band(techCardId))?.dataUpdatedAt ?? 0) > 0;
  const bench = useMemo(() => readBench(band, 'flat'), [band]);

  // Картинка ждёт ярлыка — полоса перечитывается и здесь: доска на шаге FLAT не смонтирована.
  const { control } = useFormContext<TechCardFormData>();
  const all = (useWatch({ control, name: 'moodboardMedia' }) ?? []) as BoardItem[];
  const items = useMemo(() => all.filter(isBoardRow), [all]);
  const labels = useMemo(() => labelsByMedia(band.references), [band.references]);
  useLabelPoll(techCardId, items, labels, speaks);

  /* M14 · добавленное во входе — по карточке, на сессию: бледная плитка, пока сервер не ответил. Снятое
     с доски уходит и отсюда. */
  const [addedAll, setAdded] = useState<{ card: number; list: Added[] }>({ card: 0, list: [] });
  const added = useMemo(() => {
    if (addedAll.card !== techCardId) return [];
    const onBoard = new Set(items.map((i) => i.mediaId));
    return addedAll.list.filter((a) => onBoard.has(a.mediaId));
  }, [addedAll, techCardId, items]);
  const addTo = useInputAdd(techCardId);
  const canAdd = !disabled && speaks && techCardId > 0;
  const onAdd = (group: string, target: InputAddTarget) => (media: common_MediaFull[]) => {
    const placed = addTo(media, target);
    if (!placed.length) return;
    const byId = new Map(media.map((m) => [m.id ?? 0, m]));
    setAdded((prev) => {
      const list = prev.card === techCardId ? prev.list : [];
      const kept = list.filter((a) => !placed.includes(a.mediaId));
      const fresh = placed.map((id) => ({
        mediaId: id,
        full: byId.get(id) as common_MediaFull,
        group,
      }));
      return { card: techCardId, list: [...kept, ...fresh] };
    });
  };

  const selectedDetail = selection ? targetSlotId(selection.target) : 0;
  /* ДЕТАЛИ, ЧЬИ НАЖАТИЯ НЕСУТ СВОИ ФОТО: фото детали едет только со строкой ярлыка этой детали
     (сервер: роль `detail` + слот) — без такой строки у её нажатия одни флэты, и спрашивать незачем.
     Выбранная в target ▾ стоит всегда. */
  const details = useMemo(() => {
    const withPhotos = new Set(
      (band.references ?? [])
        .filter((r) => (r.role ?? '').trim() === 'detail')
        .map((r) => r.detailSlotId ?? 0),
    );
    // M14: a detail a picture was just added to stays drawn while the server reads it.
    for (const a of added) if (a.group.startsWith('d:')) withPhotos.add(Number(a.group.slice(2)));
    return bench.details.filter((d) => {
      const id = d.id ?? 0;
      return id > 0 && (withPhotos.has(id) || id === selectedDetail);
    });
  }, [band.references, bench.details, selectedDetail, added]);

  /* Нажатие «views» спрашивается и здесь — тем же ключом, что у его группы (один запрос в кэше):
     сервер не ответил (старый бинарь, сбой) — вход говорит по-старому, словами. */
  const viewsAsk = useFlatPreviewTiles(
    techCardId,
    selection?.views ?? NO_PARAMS,
    stamp,
    !!selection && bandRead,
  );
  if (!selection || !bandRead) return null;

  // Сервер не ответил — вход говорит по-старому, словами: сколько картинок доски идёт во флэт
  // (дверь к доске — в шапке блока). Следующая смена входа спрашивает снова.
  if (viewsAsk.isError) {
    const sources = items.filter(
      (i) => (i.role === 'target' || i.role === 'detail') && i.mediaId > 0,
    ).length;
    return (
      <Text
        size='nano'
        variant='label'
        component='p'
        className='uppercase tracking-label'
        data-flat-pictures-fallback={isUnimplemented(viewsAsk.error) ? 'unimplemented' : 'error'}
      >
        from the moodboard · {sources} picture{sources === 1 ? '' : 's'}
      </Text>
    );
  }

  const viewsOn = selectedDetail === 0;
  return (
    <div data-flat-pictures='' className='flex flex-wrap items-start gap-x-8 gap-y-4'>
      <PressGroup
        techCardId={techCardId}
        groupKey='views'
        label='views'
        params={selection.views}
        stamp={stamp}
        on={viewsOn}
        always
        added={added.filter((a) => a.group === 'views')}
        onAdd={canAdd ? onAdd('views', { kind: 'views' }) : undefined}
      />
      {details.map((d) => (
        <DetailGroup
          key={d.id}
          techCardId={techCardId}
          slot={d}
          name={displayDetailName(bench.details, d)}
          stamp={stamp}
          on={(d.id ?? 0) === selectedDetail}
          added={added.filter((a) => a.group === `d:${d.id ?? 0}`)}
          onAdd={
            canAdd ? onAdd(`d:${d.id ?? 0}`, { kind: 'detail', slotId: d.id ?? 0 }) : undefined
          }
        />
      ))}
    </div>
  );
}

function DetailGroup({
  techCardId,
  slot,
  name,
  stamp,
  on,
  added,
  onAdd,
}: {
  techCardId: number;
  slot: common_DesignBenchSlot;
  name: string;
  stamp: string;
  on: boolean;
  added: Added[];
  onAdd?: (media: common_MediaFull[]) => void;
}) {
  const id = slot.id ?? 0;
  // Нажатие детали — ровно как у GENERATE: `flatRunParams(slotId, null, [])`.
  const params = useMemo(() => flatRunParams(id, null, []), [id]);
  return (
    <PressGroup
      techCardId={techCardId}
      groupKey={`d:${id}`}
      label={`detail · ${name}`}
      detailName={name}
      params={params}
      stamp={stamp}
      on={on}
      always={on || added.length > 0}
      added={added}
      onAdd={onAdd}
    />
  );
}

/**
 * ОДНО НАЖАТИЕ — ОДНА ГРУППА: подпись (слово цели, как в target ▾) и то, что сервер собрал бы для
 * него. Фото — лентой доски; приложенные флэты — той же лентой, ниже ростом, номер продолжается.
 */
function PressGroup({
  techCardId,
  groupKey,
  label,
  detailName = 'detail',
  params,
  stamp,
  on,
  always = false,
  added = NO_ADDED,
  onAdd,
}: {
  techCardId: number;
  groupKey: string;
  label: string;
  detailName?: string;
  params: common_DesignRunParams;
  stamp: string;
  on: boolean;
  /** Draw the group even when the press sends nothing of its own (the views; the selected detail). */
  always?: boolean;
  /** M14: pictures added here this session — pale, unnumbered, until the server sends them. */
  added?: Added[];
  /** M14: the add slot's gesture; absent — no slot (read-only card). */
  onAdd?: (media: common_MediaFull[]) => void;
}) {
  const preview = useFlatPreviewTiles(techCardId, params, stamp);

  const refs = useMemo(
    () => (preview.data?.inputs?.refs ?? []).filter((r) => (r.mediaId ?? 0) > 0 && !r.deleted),
    [preview.data],
  );
  const plates = useMemo(
    () => (preview.data?.inputs?.slots ?? []).filter((s) => (s.mediaId ?? 0) > 0 && !s.deleted),
    [preview.data],
  );
  const photoViews = useMemo<FocusedView[]>(
    () => refs.map((r) => ({ key: `r${r.mediaId}`, mediaId: r.mediaId ?? 0, full: r.media })),
    [refs],
  );
  const plateViews = useMemo<FocusedView[]>(
    () => plates.map((s) => ({ key: `s${s.mediaId}`, mediaId: s.mediaId ?? 0, full: s.media })),
    [plates],
  );
  const wordOfRef = useMemo(() => {
    const m = new Map<number, string>();
    for (const r of refs) m.set(r.mediaId ?? 0, refWord((r.role ?? '').trim(), detailName));
    return m;
  }, [refs, detailName]);
  const wordOfPlate = useMemo(() => {
    const m = new Map<number, string>();
    for (const s of plates) m.set(s.mediaId ?? 0, plateWord(s));
    return m;
  }, [plates]);
  /* ДОБАВЛЕННОЕ, ЕЩЁ НЕ УШЕДШЕЕ: в ответе нет среди фото — бледной плиткой; слово — причина удержания
     из того же ответа, иначе `…` (читается / ещё не сохранено). */
  const pending = useMemo(() => {
    const sent = new Set(refs.map((r) => r.mediaId ?? 0));
    return added.filter((a) => !sent.has(a.mediaId));
  }, [added, refs]);
  const pendingViews = useMemo<FocusedView[]>(
    () => pending.map((a) => ({ key: `a${a.mediaId}`, mediaId: a.mediaId, full: a.full })),
    [pending],
  );
  const heldWord = useMemo(() => {
    const m = new Map<number, string>();
    for (const h of preview.data?.held ?? [])
      m.set(h.mediaId ?? 0, HELD_WORD[(h.reason ?? '').trim()] ?? (h.reason ?? '').trim());
    return m;
  }, [preview.data]);

  // A detail the server would not answer for stays off the input; the views say so above.
  if (preview.isError) return null;
  const answered = !!preview.data;
  // Деталь без своих фото рисуется, только когда выбрана (тогда видно: её нажатие пошлёт флэты).
  if (answered && refs.length === 0 && !always) return null;
  if (!answered && !always) return null;

  /* M14 · СЛОТ «+ picture» — тот же, что первым стоит в ленте доски (O-62), ростом ленты входа. */
  const addSlot = onAdd ? (
    <MediaSlot
      aspectRatio={['Custom']}
      frameAspect='3/4'
      heightPx={PHOTO_ROW_PX}
      label='+ picture'
      purpose='moodboard reference'
      allowMultiple
      showVideos={false}
      onSelect={onAdd}
      sizeClassName='w-fit'
      className='shrink-0'
    />
  ) : null;

  return (
    <div
      data-flat-pictures-group={groupKey}
      data-on={on ? 'on' : 'off'}
      data-sent={[
        ...refs.map((r) => `${r.mediaId}:${(r.role ?? '').trim()}`),
        ...plates.map((s) => `${s.mediaId}:${(s.viewKey ?? '').trim()}_flat`),
      ].join(' ')}
      className={cn(
        'min-w-0 max-w-full',
        // Не выбранная цель отступает назад, но читается; наведение возвращает её в полный тон.
        'transition-opacity duration-150 ease-out motion-reduce:transition-none',
        !on && 'opacity-50 hover:opacity-100 focus-within:opacity-100',
      )}
    >
      <Text
        size='nano'
        variant={on ? undefined : 'label'}
        component='span'
        className='mb-2 block uppercase tracking-label'
      >
        {label}
      </Text>
      {!answered ? (
        // Первый ответ ещё в пути: место ленты держится, WORDS под ней не прыгают.
        <div style={{ height: PHOTO_ROW_PX + 8 }} aria-busy='true' />
      ) : refs.length === 0 && plates.length === 0 && pending.length === 0 && !addSlot ? (
        <Text size='nano' variant='label' component='p' className='uppercase tracking-label'>
          nothing goes yet
        </Text>
      ) : (
        <div className='flex min-w-0 items-start gap-2'>
          {addSlot && <div className='py-1'>{addSlot}</div>}
          {photoViews.length > 0 && (
            <Strip
              views={photoViews}
              rowPx={PHOTO_ROW_PX}
              numberFrom={1}
              word={(v) => wordOfRef.get(v.mediaId) ?? ''}
              label={label}
            />
          )}
          {pendingViews.length > 0 && (
            <div
              className='opacity-50'
              data-flat-pictures-pending={pending.map((a) => a.mediaId).join(' ')}
            >
              <Strip
                views={pendingViews}
                rowPx={PHOTO_ROW_PX}
                numberFrom={1}
                numbered={false}
                word={(v) => heldWord.get(v.mediaId) ?? '…'}
                label={`${label} · not sent yet`}
              />
            </div>
          )}
          {plateViews.length > 0 && (
            <Strip
              views={plateViews}
              rowPx={PLATE_ROW_PX}
              numberFrom={photoViews.length + 1}
              word={(v) => wordOfPlate.get(v.mediaId) ?? ''}
              label={`${label} · flats`}
            />
          )}
        </div>
      )}
    </div>
  );
}

const NO_PARAMS: common_DesignRunParams = flatRunParams(0, null, []);
const NO_ADDED: Added[] = [];
const NO_CALLOUTS = () => [];
const noop = () => {};
const noPick = () => [];

/** The moodboard's own strip, read-only: no pins, no corners, no add slot, no zoom. */
function Strip({
  views,
  rowPx,
  numberFrom,
  numbered = true,
  word,
  label,
}: {
  views: FocusedView[];
  rowPx: number;
  numberFrom: number;
  /** A picture not in the prompt has no place in its order: the word alone. */
  numbered?: boolean;
  word: (v: FocusedView) => string;
  label: string;
}) {
  return (
    <div className='min-w-0'>
      <FocusedAnnotator
        layout='grid'
        readOnly
        views={views}
        gridRowHeight={rowPx}
        numberFrom={numberFrom}
        numbered={numbered}
        preferNaturalAspect
        zoomable={false}
        railArrows={false}
        pinText='hover'
        calloutsFor={NO_CALLOUTS}
        onAddCallout={noop}
        onMoveCallout={noop}
        onRemoveCallout={noop}
        onPickMedia={noPick}
        onRemoveMedia={noop}
        addLabel=''
        purpose='flat input'
        emptyLabel=''
        carouselLabel={label}
        mediaLabel={(v, i) =>
          numbered ? `${label} · ${numberFrom + i} · ${word(v)}` : `${label} · ${word(v)}`
        }
        tileBadge={(v) => word(v)}
      />
    </div>
  );
}
