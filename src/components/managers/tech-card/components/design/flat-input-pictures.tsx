import type {
  GetDesignBandResponse,
  common_DesignBenchSlot,
  common_DesignInputSlot,
  common_DesignReference,
  common_DesignRunParams,
  common_MediaFull,
} from 'api/proto-http/admin';
import { useQueryClient } from '@tanstack/react-query';
import { MediaSlot } from 'components/managers/media/components/media-slot';
import { useSnackBarStore } from 'lib/stores/store';
import { cn } from 'lib/utility';
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { useFormContext, useWatch } from 'react-hook-form';
import {
  FocusedAnnotator,
  type FocusedTileAction,
  type FocusedTileBadge,
  type FocusedView,
} from 'ui/components/focused-annotator';
import type { PictureBusyKind } from 'ui/components/picture-busy';
import Text from 'ui/components/text';

import type { TechCardFormData } from '../schema';
import { useTechCardAutosave } from './autosave-contract';
import { CapName, displayDetailName, readBench } from './bench-slot';
import {
  boardMenu,
  INPUT_OWN_WORDS,
  inputStillReading,
  labelsByMedia,
  photoDetailSlots,
  tileWord,
  viewWord,
  type BoardMenuPick,
} from './board-labels';
import { useBoardPick, useBoardProposals } from './board-pick';
import { serverSpeaksDesign } from './capability';
import { holdFlatInput, readFlatInput, rowsWritable, setFlatReading } from './flat-input';
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
import { CornerMenu } from './picture-tile';
import {
  forgetInputRemoval,
  forgetInputRemovalOf,
  listInputRemovals,
  rememberInputRemoval,
  useInputRemovals,
  type InputRemoval,
} from './removal-undo';
import {
  designKeys,
  isUnimplemented,
  useDesignWrites,
  useFlatPreviewTiles,
} from './use-design-band';

/**
 * ═══ ВХОД ФЛЭТА — КАРТИНКИ, КОТОРЫЕ УЙДУТ В ПРОМПТ (M13 → M15, владелец 07.10) ═══════════════════
 *
 * M13: плитки — ТА ЖЕ лента, что у доски (`FocusedAnnotator`, `layout='grid'`, ярлык `N · слово`),
 * ниже ростом. ИСТОЧНИК — ОТВЕТ СЕРВЕРА (`PreviewDesignRunInputs` с параметрами нажатия, тот же
 * строитель, что у GENERATE и «what the model gets»), поэтому показанное = отправленное. Номер плитки
 * — порядок в промпте.
 *
 *   VIEWS                  — фото нажатия «views» (≤2 на вид);
 *   DETAIL · <имя>         — фото нажатия этой детали (≤4) и приложенные FRONT/BACK (`… flat`).
 *
 * M15 (109-UNIFIED-INPUT, владелец: «единый инпут… чтобы оно само поняло, что это сайд или дитейл»):
 *   · ОДИН `+ picture` первым в ряду — тот же `MediaSlot` и тот же `appendBoardPictures`, что у доски,
 *     назначение ПУСТОЕ: что это — вид или деталь, и какая деталь — решает лестница ярлыков сервера
 *     (M4), предложение назначения применяется здесь же (`useBoardProposals`);
 *   · ЛОТОК справа от него — добавленное в этой сессии, пока оно не встало ни в одно нажатие:
 *     бледные плитки без номера, слово доски (`tileWord`: `…`, `view ?`, `mood`…; `render` — выход
 *     прогона), угол ▾ доски (`boardMenu`) — тот же вопрос, что карточка под доской;
 *   · СЕРВЕР ПРЕДПОЛАГАЕТ, ЧЕЛОВЕК РЕШАЕТ: ярлык модели на плитке — серой плашкой, тап по ней = принять
 *     (ярлык человека, плашка чернеет); у имени детали модели — серое имя, клик — переименовать;
 *   · `remove from prompt` — накладка на фото (ховер; на планшете — тап взводит), картинка остаётся
 *     на доске с ярлыком (`label_state = held`), строка `N removed from the prompt · undo` под группой.
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

const byModel = (ref: common_DesignReference | undefined) =>
  ref?.labelSource === 'model_cheap' || ref?.labelSource === 'model_strong';

/** The raw state: `held` (109 §4) is read here, board-labels folds unknown words into `ok`. */
const isHeld = (ref: common_DesignReference | undefined) =>
  (ref?.labelState ?? '').trim() === 'held';

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

/**
 * M15 · ОДНА ДВЕРЬ ВО ВХОД (чистая: форма снаружи). Новые картинки ложатся на ДОСКУ строкой без
 * назначения — тем же `appendBoardPictures`, что у «+ picture» доски (дубль, потолок, слова отказа);
 * что это, скажет сервер. Уже лежащая на доске не добавляется второй раз: снятая из промпта
 * (`held`) возвращается в него (`putBack`), остальное — слово, где она уже стоит. Картинку из
 * технических флэтов карточки доска не берёт (медиа не стоит в двух списках).
 */
export function planUnifiedAdd(input: {
  live: BoardItem[];
  otherListIds: number[];
  added: common_MediaFull[];
  held: (mediaId: number) => boolean;
  max: number;
}): {
  next: BoardItem[];
  accepted: number[];
  putBack: number[];
  already: number;
  refusal: string | null;
} {
  const onBoard = new Set(input.live.filter(isBoardRow).map((i) => i.mediaId));
  const elsewhere = new Set(input.otherListIds);
  const ids = input.added.map((m) => m.id ?? 0).filter((id) => id > 0);
  const again = ids.filter((id) => onBoard.has(id));
  const putBack = again.filter((id) => input.held(id));
  const result = appendBoardPictures({
    live: input.live,
    inScope: isBoardRow,
    otherListIds: input.otherListIds,
    added: input.added.filter((m) => !onBoard.has(m.id ?? 0)),
    kind: 'TECH_CARD_MEDIA_KIND_MOODBOARD',
    max: input.max,
    scopeLabel: 'board',
  });
  const refusal =
    result.refusal ??
    (ids.some((id) => elsewhere.has(id) && !onBoard.has(id))
      ? 'that picture is one of the card’s own flats — it goes with «from my flat»'
      : null);
  return {
    next: result.next,
    accepted: result.accepted.map((m) => m.id ?? 0).filter((id) => id > 0),
    putBack,
    already: again.length - putBack.length,
    refusal,
  };
}

/**
 * «REMOVE FROM PROMPT» и его обратная запись (109 §4). Оптимистично: плитка уходит с экрана сразу
 * (память `removal-undo`, пока сервер не сказал `held`); отказ — плитка возвращается и одна строка.
 * Под удержанием входа, как `writeLabel`: GENERATE ждёт эту запись.
 */
function useInputHold(techCardId: number) {
  const { showMessage } = useSnackBarStore();
  const { setReferenceHeld } = useDesignWrites(techCardId);
  const [inflight, setInflight] = useState<ReadonlySet<number>>(new Set());
  const mark = (ids: number[], on: boolean) =>
    setInflight((prev) => {
      const next = new Set(prev);
      for (const id of ids) {
        if (on) next.add(id);
        else next.delete(id);
      }
      return next;
    });

  const write = useCallback(
    async (mediaIds: number[], held: boolean): Promise<number[]> => {
      const card = techCardId;
      if (!rowsWritable(readFlatInput(card))) {
        showMessage('a flat run is being started — change the input once it has started', 'error');
        return [];
      }
      const release = holdFlatInput(card);
      mark(mediaIds, true);
      const failed: number[] = [];
      try {
        for (const mediaId of mediaIds) {
          try {
            await setReferenceHeld.mutateAsync({ mediaId, held, silent: true });
          } catch {
            failed.push(mediaId);
          }
        }
      } finally {
        mark(mediaIds, false);
        release();
      }
      if (failed.length)
        showMessage(
          held
            ? 'could not take it out of the prompt — it is back; try again'
            : 'could not put it back into the prompt — try again',
          'error',
        );
      return failed;
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [techCardId, setReferenceHeld, showMessage],
  );

  /** Take pictures of one group out of the prompt. */
  const take = useCallback(
    (group: string, mediaIds: number[]) => {
      for (const id of mediaIds) rememberInputRemoval(techCardId, group, id);
      void write(mediaIds, true).then((failed) => {
        if (failed.length) forgetInputRemoval(techCardId, group, failed);
      });
    },
    [techCardId, write],
  );

  /** Undo: every picture this group lost in this session goes back. */
  const undo = useCallback(
    (removal: InputRemoval) => {
      forgetInputRemoval(techCardId, removal.group);
      void write(removal.mediaIds, false).then((failed) => {
        for (const id of failed) rememberInputRemoval(techCardId, removal.group, id);
      });
    },
    [techCardId, write],
  );

  const putBack = useCallback((mediaIds: number[]) => void write(mediaIds, false), [write]);

  return { inflight, take, undo, putBack };
}

/** A picture added in this input, this session — in the tray until a press sends it. */
type Added = { mediaId: number; full: common_MediaFull };

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
  /** The card cannot be written: no add slot, no menus, no removal. */
  disabled?: boolean;
}): JSX.Element | null {
  const speaks = serverSpeaksDesign();
  const stamp = usePreviewStamp(band);
  // Полоса ещё не прочитана — ярлыков и верстака нет, спрашивать рано (вопрос ушёл бы дважды).
  const bandRead =
    (useQueryClient().getQueryState(designKeys.band(techCardId))?.dataUpdatedAt ?? 0) > 0;
  const bench = useMemo(() => readBench(band, 'flat'), [band]);
  const detailSlots = useMemo(() => photoDetailSlots(band.bench), [band.bench]);
  const { getValues, setValue, control } = useFormContext<TechCardFormData>();
  const { showMessage } = useSnackBarStore();

  // Картинка ждёт ярлыка — полоса перечитывается и здесь: доска на шаге FLAT не смонтирована.
  const all = (useWatch({ control, name: 'moodboardMedia' }) ?? []) as BoardItem[];
  const items = useMemo(() => all.filter(isBoardRow), [all]);
  const purposeOf = useMemo(
    () => new Map(items.map((i) => [i.mediaId, (i.role ?? '').trim()])),
    [items],
  );
  const labels = useMemo(() => labelsByMedia(band.references), [band.references]);
  useLabelPoll(techCardId, items, labels, speaks);

  const canWrite = !disabled && speaks && techCardId > 0;
  // Предложение назначения модели — и здесь: доска на шаге FLAT не смонтирована (109 §5).
  useBoardProposals(techCardId, items, labels, !canWrite);
  const pick = useBoardPick(techCardId, !canWrite);
  const hold = useInputHold(techCardId);
  const removals = useInputRemovals();

  /* Выход любого прогона этой карточки — не вход флэта (109 §2.4, M16): плитка лотка говорит
     `render` сразу, не дожидаясь сервера. Вырез фона (`cutout`) — допустимый вход. */
  const outputs = useMemo(() => {
    const s = new Set<number>();
    for (const run of band.runs ?? []) {
      if ((run.kind ?? '').trim().toLowerCase() === 'cutout') continue;
      for (const p of run.pictures ?? []) if ((p.media?.id ?? 0) > 0) s.add(p.media?.id as number);
    }
    return s;
  }, [band.runs]);

  /* ДОБАВЛЕННОЕ ВО ВХОДЕ — по карточке, на сессию. Снятое с доски уходит и отсюда. */
  const [addedAll, setAdded] = useState<{ card: number; list: Added[] }>({ card: 0, list: [] });
  const added = useMemo(() => {
    if (addedAll.card !== techCardId) return [];
    const onBoard = new Set(items.map((i) => i.mediaId));
    return addedAll.list.filter((a) => onBoard.has(a.mediaId));
  }, [addedAll, techCardId, items]);

  const onAdd = (media: common_MediaFull[]) => {
    const card = techCardId;
    if (!rowsWritable(readFlatInput(card))) {
      showMessage('a flat run is being started — add the picture once it has started', 'error');
      return;
    }
    const plan = planUnifiedAdd({
      live: (getValues('moodboardMedia') ?? []) as BoardItem[],
      otherListIds: ((getValues('technicalMedia') ?? []) as BoardItem[]).map((i) => i.mediaId),
      added: media,
      held: (id) => isHeld(labels.get(id)),
      max: MOOD_MAX,
    });
    if (plan.refusal) showMessage(plan.refusal, 'error');
    else if (plan.already && !plan.accepted.length && !plan.putBack.length)
      showMessage(
        plan.already === 1
          ? 'already on the board — it is in the input'
          : `${plan.already} already on the board — they are in the input`,
        'success',
      );
    if (plan.putBack.length) {
      for (const id of plan.putBack) forgetInputRemovalOf(card, id);
      hold.putBack(plan.putBack);
    }
    if (!plan.accepted.length) return;
    setValue('moodboardMedia', plan.next as TechCardFormData['moodboardMedia'], {
      shouldDirty: true,
    });
    const byId = new Map(media.map((m) => [m.id ?? 0, m]));
    setAdded((prev) => {
      const list = prev.card === card ? prev.list : [];
      const kept = list.filter((a) => !plan.accepted.includes(a.mediaId));
      const fresh = plan.accepted.map((id) => ({
        mediaId: id,
        full: byId.get(id) as common_MediaFull,
      }));
      return { card, list: [...kept, ...fresh] };
    });
  };

  /* ЧТО УХОДИТ — по нажатиям: каждая группа говорит, какие фото её нажатие шлёт. Плитка лотка,
     ставшая фото какого-то нажатия, уходит из лотка в свою группу (109 §1). */
  const [sentBy, setSentBy] = useState<Record<string, string>>({});
  const reportSent = useCallback((group: string, ids: number[]) => {
    const sig = ids.join(' ');
    setSentBy((prev) => (prev[group] === sig ? prev : { ...prev, [group]: sig }));
  }, []);
  const sent = useMemo(() => {
    const s = new Set<number>();
    for (const sig of Object.values(sentBy))
      for (const id of sig.split(' ')) if (Number(id) > 0) s.add(Number(id));
    return s;
  }, [sentBy]);

  /** Снятое из промпта не показывается нигде во входе — ни в группе, ни в лотке (оно в модалке). */
  const hidden = useCallback(
    (id: number) => hold.inflight.has(id) || isHeld(labels.get(id)),
    [hold.inflight, labels],
  );

  const selectedDetail = selection ? targetSlotId(selection.target) : 0;
  /* ДЕТАЛИ, ЧЬИ НАЖАТИЯ НЕСУТ СВОИ ФОТО: фото детали едет только со строкой ярлыка этой детали
     (роль `detail` + слот, не снятая из промпта). Выбранная в target ▾ стоит всегда. */
  const details = useMemo(() => {
    const withPhotos = new Set(
      (band.references ?? [])
        .filter((r) => (r.role ?? '').trim() === 'detail' && !isHeld(r))
        .map((r) => r.detailSlotId ?? 0),
    );
    return bench.details.filter((d) => {
      const id = d.id ?? 0;
      return id > 0 && (withPhotos.has(id) || id === selectedDetail);
    });
  }, [band.references, bench.details, selectedDetail]);

  /* Нажатие «views» спрашивается и здесь — тем же ключом, что у его группы (один запрос в кэше):
     его `held` даёт плитке лотка причину (`older`…), его отказ — слова вместо плиток. */
  const viewsAsk = useFlatPreviewTiles(
    techCardId,
    selection?.views ?? NO_PARAMS,
    stamp,
    !!selection && bandRead,
  );
  const viewsHeld = useMemo(() => {
    const m = new Map<number, string>();
    for (const h of viewsAsk.data?.held ?? []) m.set(h.mediaId ?? 0, (h.reason ?? '').trim());
    return m;
  }, [viewsAsk.data]);

  /** Слово плитки лотка: слово доски, а у вставшего ярлыка, который не едет, — причина сервера. */
  const trayWord = useCallback(
    (id: number): string => {
      if (outputs.has(id)) return 'render';
      const purpose = purposeOf.get(id) ?? '';
      const reason = viewsHeld.get(id);
      // Still being read (the one rule GENERATE waits by): the tile sweeps.
      if (inputStillReading(purpose, labels.get(id), detailSlots, reason)) return '…';
      const w = tileWord(purpose, labels.get(id), detailSlots) ?? '';
      if (INPUT_OWN_WORDS.has(w) || !reason) return w;
      return HELD_WORD[reason] ?? reason.replace(/_/g, ' ');
    },
    [outputs, purposeOf, labels, detailSlots, viewsHeld],
  );

  const tray = useMemo(
    () => added.filter((a) => !sent.has(a.mediaId) && !hidden(a.mediaId)),
    [added, sent, hidden],
  );

  /* ЧИТАЕТСЯ — GENERATE подождёт эти картинки (≤15 с, Q2). Публикуется на каждую смену лотка. */
  const readingSig = tray
    .filter((a) => trayWord(a.mediaId) === '…')
    .map((a) => a.mediaId)
    .join(' ');
  useEffect(() => {
    const ids = readingSig ? readingSig.split(' ').map(Number) : [];
    setFlatReading(techCardId, ids);
    return () => setFlatReading(techCardId, []);
  }, [readingSig, techCardId]);

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

  const groupProps = {
    techCardId,
    stamp,
    labels,
    canWrite,
    hidden,
    onAccept: pick.accept,
    onTake: hold.take,
    onUndo: hold.undo,
    removalOf: (group: string) => removals(techCardId, group),
    onSent: reportSent,
  };

  const shownGroups = new Set(['views', ...details.map((d) => `d:${d.id ?? 0}`)]);
  // `removals` is read so this render follows the removal memory.
  void removals;
  const orphans = listInputRemovals(techCardId).filter(
    (r) => !shownGroups.has(r.group) && r.mediaIds.some(hidden),
  );

  const viewsOn = selectedDetail === 0;
  return (
    <div data-flat-pictures='' className='flex flex-wrap items-start gap-x-8 gap-y-4'>
      {(canWrite || tray.length > 0) && (
        <div data-flat-pictures-add='' className='min-w-0 max-w-full'>
          {/* Место подписи группы: плитки входа стоят на одной линии с плитками групп. */}
          <Text
            size='nano'
            variant='label'
            component='span'
            className='mb-2 block uppercase tracking-label'
            aria-hidden={tray.length === 0}
          >
            {tray.length > 0 ? 'reading' : ' '}
          </Text>
          <div className='flex min-w-0 items-start gap-2'>
            {canWrite && (
              <div className='py-1' data-flat-add=''>
                {/* M15 · ОДИН `+ picture` на весь вход — тот же слот, что первым стоит в ленте доски. */}
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
              </div>
            )}
            {tray.length > 0 && (
              <div
                data-flat-pictures-tray={tray.map((a) => a.mediaId).join(' ')}
                className='min-w-0'
              >
                <Strip
                  views={tray.map((a) => ({
                    key: `a${a.mediaId}`,
                    mediaId: a.mediaId,
                    full: a.full,
                  }))}
                  rowPx={PHOTO_ROW_PX}
                  numberFrom={1}
                  numbered={false}
                  pale
                  // Reading is drawn on the picture (`PictureBusy`), not said with `…`.
                  badge={(v) => {
                    const w = trayWord(v.mediaId);
                    return w === '…' ? '' : w;
                  }}
                  busy={(v) => (trayWord(v.mediaId) === '…' ? 'read' : null)}
                  label='input · not sent yet'
                  corners={
                    canWrite
                      ? (v, i) => {
                          const word = trayWord(v.mediaId);
                          const menu = boardMenu({
                            mediaId: v.mediaId,
                            n: i + 1,
                            purpose: purposeOf.get(v.mediaId) ?? '',
                            ref: labels.get(v.mediaId),
                            slots: detailSlots,
                            onPick: (p: BoardMenuPick) => pick.onPick(v.mediaId, p),
                          });
                          // Выход прогона — не вид и не деталь: только mood / material / none.
                          const items =
                            word === 'render'
                              ? menu.items.filter((it) =>
                                  ['mood', 'material', ''].includes(it.value),
                                )
                              : menu.items;
                          return {
                            right: (
                              <span onPointerDown={(e) => e.stopPropagation()} className='flex'>
                                <CornerMenu menu={{ ...menu, items }} />
                              </span>
                            ),
                          };
                        }
                      : undefined
                  }
                />
              </div>
            )}
          </div>
        </div>
      )}
      <PressGroup
        {...groupProps}
        groupKey='views'
        label='views'
        params={selection.views}
        on={viewsOn}
        always
      />
      {details.map((d) => (
        <DetailGroup
          key={d.id}
          {...groupProps}
          slot={d}
          name={displayDetailName(bench.details, d)}
          on={(d.id ?? 0) === selectedDetail}
        />
      ))}
      {/* A model's detail whose every photo left the prompt went with them (Q3): its undo stays. */}
      {orphans.map((r) => (
        <UndoRow
          key={r.group}
          group={r.group}
          removal={r}
          removedNow={r.mediaIds.filter(hidden)}
          canWrite={canWrite}
          onUndo={hold.undo}
          word='a detail'
        />
      ))}
      {pick.naming}
    </div>
  );
}

type GroupShared = {
  techCardId: number;
  stamp: string;
  labels: ReadonlyMap<number, common_DesignReference>;
  canWrite: boolean;
  hidden: (mediaId: number) => boolean;
  onAccept: (ref: common_DesignReference | undefined) => void;
  onTake: (group: string, mediaIds: number[]) => void;
  onUndo: (removal: InputRemoval) => void;
  removalOf: (group: string) => InputRemoval | null;
  onSent: (group: string, mediaIds: number[]) => void;
};

function DetailGroup({
  slot,
  name,
  on,
  ...shared
}: GroupShared & {
  slot: common_DesignBenchSlot;
  name: string;
  on: boolean;
}) {
  const id = slot.id ?? 0;
  const { showMessage } = useSnackBarStore();
  const { setBenchSlot } = useDesignWrites(shared.techCardId);
  // Нажатие детали — ровно как у GENERATE: `flatRunParams(slotId, null, [])`.
  const params = useMemo(() => flatRunParams(id, null, []), [id]);
  const byModelSlot = !!slot.madeByModel;

  /* T75 · ИМЯ ДЕТАЛИ ПРАВИТСЯ НА МЕСТЕ — та же шапка, что у ячейки верстака: клик по имени.
     Переименованная человеком деталь модели становится его (`made_by_model = 0`, сервер). */
  const rename = shared.canWrite
    ? {
        value: (slot.detailName ?? '').trim(),
        onCommit: (next: string) => {
          const card = shared.techCardId;
          if (!rowsWritable(readFlatInput(card))) {
            showMessage(
              'a flat run is being started — rename the detail once it has started',
              'error',
            );
            return;
          }
          const release = holdFlatInput(card);
          void setBenchSlot
            .mutateAsync({
              slot: { slotId: id, kind: undefined, colorwayId: 0 },
              // A rename ECHOES the plate: 0 would unmark the slot it renames.
              pictureId: slot.pictureId ?? 0,
              expectedSlotRev: slot.slotRev ?? 0,
              newDetailName: next,
            })
            .catch(() => {})
            .finally(release);
        },
      }
    : undefined;

  return (
    <PressGroup
      {...shared}
      groupKey={`d:${id}`}
      label={`detail · ${name}`}
      heading={
        <span className='flex min-w-0 items-baseline gap-1'>
          <span className='shrink-0'>detail ·</span>
          {rename ? (
            <CapName label={name} rename={rename} muted={byModelSlot} />
          ) : (
            <span className={cn('min-w-0 truncate', byModelSlot && 'text-labelColor')}>{name}</span>
          )}
        </span>
      }
      notADetail={byModelSlot ? id : 0}
      detailName={name}
      params={params}
      on={on}
      always={on}
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
  heading,
  notADetail = 0,
  detailName = 'detail',
  params,
  stamp,
  on,
  always = false,
  labels,
  canWrite,
  hidden,
  onAccept,
  onTake,
  onUndo,
  removalOf,
  onSent,
}: GroupShared & {
  groupKey: string;
  label: string;
  /** The group's name when it is more than a word (a detail's renameable name). */
  heading?: ReactNode;
  /**
   * A model's detail (its slot id): `✕ not a detail` on hover takes ALL its photos out of the prompt —
   * every labelled one, not only the newest four the press sends (Codex M15), so the slot goes.
   */
  notADetail?: number;
  detailName?: string;
  params: common_DesignRunParams;
  on: boolean;
  /** Draw the group even when the press sends nothing of its own (the views; the selected detail). */
  always?: boolean;
}) {
  const preview = useFlatPreviewTiles(techCardId, params, stamp);

  const refs = useMemo(
    () =>
      (preview.data?.inputs?.refs ?? []).filter(
        (r) => (r.mediaId ?? 0) > 0 && !r.deleted && !hidden(r.mediaId ?? 0),
      ),
    [preview.data, hidden],
  );
  const plates = useMemo(
    () => (preview.data?.inputs?.slots ?? []).filter((s) => (s.mediaId ?? 0) > 0 && !s.deleted),
    [preview.data],
  );

  // Что это нажатие шлёт — лотку (плитка уходит из него в свою группу).
  const sentSig = (preview.data?.inputs?.refs ?? [])
    .map((r) => r.mediaId ?? 0)
    .filter((id) => id > 0)
    .join(' ');
  useEffect(() => {
    onSent(groupKey, sentSig ? sentSig.split(' ').map(Number) : []);
  }, [onSent, groupKey, sentSig]);
  useEffect(() => () => onSent(groupKey, []), [onSent, groupKey]);

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

  /* СЕРВЕР ПРЕДПОЛАГАЕТ, ЧЕЛОВЕК РЕШАЕТ (109 §2.2): ярлык модели — серой плашкой; тап по ней —
     принять (тот же ярлык, записанный человеком). Ярлык человека — чернилами, не нажимается. */
  const photoBadge = (v: FocusedView): FocusedTileBadge => {
    const ref = labels.get(v.mediaId);
    const guess = byModel(ref);
    const word = wordOfRef.get(v.mediaId) ?? '';
    return {
      word,
      tone: guess ? 'guess' : 'ink',
      onPress: guess && canWrite ? () => onAccept(ref) : undefined,
      pressLabel: `accept ${word} — the model’s guess becomes yours`,
    };
  };
  const removeAction = canWrite
    ? (v: FocusedView): FocusedTileAction => ({
        label: 'remove from prompt',
        ariaLabel: `remove ${label} picture ${wordOfRef.get(v.mediaId) ?? ''} from the prompt`,
        onAction: () => onTake(groupKey, [v.mediaId]),
      })
    : undefined;

  const removal = removalOf(groupKey);
  // Undo counts what is still out: a picture put back elsewhere (the modal, the board) left it.
  const removedNow = removal ? removal.mediaIds.filter(hidden) : [];

  // A detail the server would not answer for stays off the input; the views say so above.
  if (preview.isError) return null;
  const answered = !!preview.data;
  // Деталь без своих фото рисуется, только когда выбрана (тогда видно: её нажатие пошлёт флэты).
  if (answered && refs.length === 0 && !always && !removedNow.length) return null;
  if (!answered && !always) return null;

  return (
    <div
      data-flat-pictures-group={groupKey}
      data-on={on ? 'on' : 'off'}
      data-sent={[
        ...refs.map((r) => `${r.mediaId}:${(r.role ?? '').trim()}`),
        ...plates.map((s) => `${s.mediaId}:${(s.viewKey ?? '').trim()}_flat`),
      ].join(' ')}
      className={cn(
        'group/press min-w-0 max-w-full',
        // Не выбранная цель отступает назад, но читается; наведение возвращает её в полный тон.
        'transition-opacity duration-150 ease-out motion-reduce:transition-none',
        !on && 'opacity-50 hover:opacity-100 focus-within:opacity-100',
      )}
    >
      <div className='mb-2 flex min-w-0 items-baseline gap-2'>
        <Text
          size='nano'
          variant={on ? undefined : 'label'}
          component='span'
          className='block min-w-0 uppercase tracking-label'
        >
          {heading ?? label}
        </Text>
        {/* ✕ У ИМЕНИ ДЕТАЛИ МОДЕЛИ (109 §3): «не деталь» — все её фото снимаются из промпта, слот
            уходит сам (Q3). Тихий: на ховер группы и на фокус. */}
        {notADetail > 0 && canWrite && refs.length > 0 && (
          <button
            type='button'
            data-not-a-detail={groupKey}
            aria-label={`${label} is not a detail — take its photos out of the prompt`}
            title='not a detail — its photos leave the prompt, the detail goes'
            onClick={() =>
              onTake(
                groupKey,
                [...labels.values()]
                  .filter(
                    (r) =>
                      (r.role ?? '').trim() === 'detail' &&
                      (r.detailSlotId ?? 0) === notADetail &&
                      !isHeld(r) &&
                      (r.mediaId ?? 0) > 0,
                  )
                  .map((r) => r.mediaId as number),
              )
            }
            className={cn(
              'shrink-0 text-nano uppercase leading-none tracking-label text-labelColor hover:text-textColor',
              'opacity-0 transition-opacity duration-150 ease-out group-hover/press:opacity-100 focus-visible:opacity-100 motion-reduce:transition-none',
              '[@media(hover:none)]:opacity-100',
            )}
          >
            ✕ not a detail
          </button>
        )}
      </div>
      {!answered ? (
        // Первый ответ ещё в пути: место ленты держится, WORDS под ней не прыгают.
        <div style={{ height: PHOTO_ROW_PX + 8 }} aria-busy='true' />
      ) : refs.length === 0 && plates.length === 0 ? (
        <Text size='nano' variant='label' component='p' className='uppercase tracking-label'>
          nothing goes yet
        </Text>
      ) : (
        <div className='flex min-w-0 items-start gap-2'>
          {photoViews.length > 0 && (
            <Strip
              views={photoViews}
              rowPx={PHOTO_ROW_PX}
              numberFrom={1}
              badge={photoBadge}
              action={removeAction}
              label={label}
            />
          )}
          {plateViews.length > 0 && (
            <Strip
              views={plateViews}
              rowPx={PLATE_ROW_PX}
              numberFrom={photoViews.length + 1}
              badge={(v) => wordOfPlate.get(v.mediaId) ?? ''}
              label={`${label} · flats`}
            />
          )}
        </div>
      )}
      {removal && (
        <UndoRow
          group={groupKey}
          removal={removal}
          removedNow={removedNow}
          canWrite={canWrite}
          onUndo={onUndo}
        />
      )}
    </div>
  );
}

/** `N removed from the prompt · undo` — under its group (109 §4.2); undo puts them all back. */
function UndoRow({
  group,
  removal,
  removedNow,
  canWrite,
  onUndo,
  word,
}: {
  group: string;
  removal: InputRemoval;
  removedNow: number[];
  canWrite: boolean;
  onUndo: (removal: InputRemoval) => void;
  /** A row standing alone (its group is gone) says whose pictures they were. */
  word?: string;
}) {
  if (!removedNow.length) return null;
  return (
    <p
      className={cn('flex items-baseline gap-1', word ? 'self-end' : 'mt-1')}
      data-flat-removed={removedNow.join(' ')}
      data-flat-removed-group={group}
    >
      <Text size='nano' variant='label' component='span' className='uppercase tracking-label'>
        {word ? `${word} · ` : ''}
        {removedNow.length} removed from the prompt ·
      </Text>
      <button
        type='button'
        data-flat-removed-undo={group}
        disabled={!canWrite}
        onClick={() => onUndo({ ...removal, mediaIds: removedNow })}
        className='text-nano uppercase leading-none tracking-label text-textColor underline underline-offset-2 hover:no-underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-textColor disabled:text-labelColor'
      >
        undo
      </button>
    </p>
  );
}

const NO_PARAMS: common_DesignRunParams = flatRunParams(0, null, []);
const NO_CALLOUTS = () => [];
const noop = () => {};
const noPick = () => [];

/** The moodboard's own strip, read-only: no pins, no zoom; optional badge press, action and corners. */
function Strip({
  views,
  rowPx,
  numberFrom,
  numbered = true,
  pale = false,
  badge,
  busy,
  action,
  corners,
  label,
}: {
  views: FocusedView[];
  rowPx: number;
  numberFrom: number;
  /** A picture not in the prompt has no place in its order: the word alone. */
  numbered?: boolean;
  /** The tray: pale until hovered or focused (its corner ▾ is a real control). */
  pale?: boolean;
  badge: (v: FocusedView) => string | FocusedTileBadge;
  /** The picture is being worked on — drawn on it; its accessible word is `reading`. */
  busy?: (v: FocusedView) => PictureBusyKind | null;
  action?: (v: FocusedView) => FocusedTileAction;
  corners?: (v: FocusedView, i: number) => { left?: ReactNode; right?: ReactNode } | null;
  label: string;
}) {
  const wordOf = (v: FocusedView) => {
    const b = badge(v);
    return (typeof b === 'string' ? b : b.word) || (busy?.(v) ? 'reading' : '');
  };
  return (
    <div
      className={cn(
        'min-w-0',
        pale &&
          'opacity-50 transition-opacity duration-150 ease-out hover:opacity-100 focus-within:opacity-100 motion-reduce:transition-none',
      )}
    >
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
          numbered ? `${label} · ${numberFrom + i} · ${wordOf(v)}` : `${label} · ${wordOf(v)}`
        }
        tileBadge={(v) => badge(v)}
        tileBusy={busy}
        tileAction={action}
        tileCorners={corners}
      />
    </div>
  );
}
