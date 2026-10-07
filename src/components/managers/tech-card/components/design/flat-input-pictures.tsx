import type {
  GetDesignBandResponse,
  common_DesignBenchSlot,
  common_DesignInputSlot,
  common_DesignRunParams,
} from 'api/proto-http/admin';
import { useQueryClient } from '@tanstack/react-query';
import { cn } from 'lib/utility';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useFormContext, useWatch } from 'react-hook-form';
import { FocusedAnnotator, type FocusedView } from 'ui/components/focused-annotator';
import Text from 'ui/components/text';

import type { TechCardFormData } from '../schema';
import { useTechCardAutosave } from './autosave-contract';
import { displayDetailName, readBench } from './bench-slot';
import { labelsByMedia, viewWord } from './board-labels';
import { serverSpeaksDesign } from './capability';
import { flatRunParams, type FlatSelection } from './flat-run-row';
import { targetSlotId } from './flat-route';
import { isBoardRow, useLabelPoll, type BoardItem } from './mood-board';
import { designKeys, isUnimplemented, useFlatPreviewTiles } from './use-design-band';

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

export function FlatInputPictures({
  techCardId,
  band,
  selection,
}: {
  techCardId: number;
  band: GetDesignBandResponse;
  /** What the run row stands on (`FlatRunRow` → `onSelection`); null until it has said. */
  selection: FlatSelection | null;
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
    return bench.details.filter((d) => {
      const id = d.id ?? 0;
      return id > 0 && (withPhotos.has(id) || id === selectedDetail);
    });
  }, [band.references, bench.details, selectedDetail]);

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
      />
      {details.map((d) => (
        <DetailGroup
          key={d.id}
          techCardId={techCardId}
          slot={d}
          name={displayDetailName(bench.details, d)}
          stamp={stamp}
          on={(d.id ?? 0) === selectedDetail}
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
}: {
  techCardId: number;
  slot: common_DesignBenchSlot;
  name: string;
  stamp: string;
  on: boolean;
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
  detailName = 'detail',
  params,
  stamp,
  on,
  always = false,
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

  // A detail the server would not answer for stays off the input; the views say so above.
  if (preview.isError) return null;
  const answered = !!preview.data;
  // Деталь без своих фото рисуется, только когда выбрана (тогда видно: её нажатие пошлёт флэты).
  if (answered && refs.length === 0 && !always) return null;
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
              word={(v) => wordOfRef.get(v.mediaId) ?? ''}
              label={label}
            />
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
const NO_CALLOUTS = () => [];
const noop = () => {};
const noPick = () => [];

/** The moodboard's own strip, read-only: no pins, no corners, no add slot, no zoom. */
function Strip({
  views,
  rowPx,
  numberFrom,
  word,
  label,
}: {
  views: FocusedView[];
  rowPx: number;
  numberFrom: number;
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
        mediaLabel={(v, i) => `${label} · ${numberFrom + i} · ${word(v)}`}
        tileBadge={(v) => word(v)}
      />
    </div>
  );
}
