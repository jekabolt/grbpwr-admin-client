import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { adminService } from 'api/api';
import {
  DesignBenchSlotRef,
  DesignSplitFrame,
  DesignUploadItem,
  GetDesignBandResponse,
} from 'api/proto-http/admin';
import { useSnackBarStore } from 'lib/stores/store';
import { useCallback, useMemo } from 'react';

/**
 * THE BAND'S DATA SEAM. Every organ of the DESIGN band reads through here and writes through here;
 * none of them calls `adminService` directly. That is not tidiness — the organs are built by
 * separate hands in parallel, and a second call site for the same write is where the two hands
 * disagree about what to invalidate afterwards.
 *
 * ONE READ. `GetDesignBand` returns the whole band — bench, budget, references, layers,
 * aggregates, the first page of the merged runs+batches feed. So there is exactly one
 * query key per card and every mutation invalidates exactly it. Splitting the read per organ would
 * buy nothing (the server composes it in one transaction anyway) and would cost the guarantee that
 * the bench and the feed on screen are the same instant of the card.
 */
export const designKeys = {
  all: ['design'] as const,
  band: (techCardId: number) => [...designKeys.all, 'band', techCardId] as const,
  layer: (layerId: number) => [...designKeys.all, 'layer', layerId] as const,
};

/**
 * A rolled-back binary does not answer the band's routes at all. grpc-gateway's mux replies to an
 * unregistered path with 501, and a proxy in front of it may turn that into 404 — so BOTH are read
 * as «this server does not speak design», and everything else (401, 403, 500) is a real error that
 * must stay loud.
 *
 * This matters beyond a blank tab: the same answer feeds the payload gate, and an ungated payload
 * against an old binary is a 400 on the WHOLE UpdateTechCard document, i.e. nobody saves any tech
 * card at all (`DiscardUnknown: false`, internal/api/http/http.go).
 */
function isUnimplemented(error: unknown): boolean {
  const status = (error as { status?: number } | null)?.status;
  return status === 404 || status === 501;
}

/**
 * ПУСТАЯ ПОЛОСА — ответ карточке, чей сервер этих маршрутов не знает вовсе или ещё не ответил.
 *
 * ПЕРЕЧИСЛЕНА ЦЕЛИКОМ, БЕЗ `as` И БЕЗ РАСПАКОВКИ ПУСТОГО: недостача поля обязана краснеть здесь.
 * Новое обязательное поле контракта — это вопрос «а что полоса показывает, пока его нет», и ответ
 * на него принимает человек, а не приведение типа.
 */
const EMPTY_BAND: GetDesignBandResponse = {
  bench: [],
  budget: undefined,
  references: [],
  layers: [],
  totalRuns: 0,
  archivedRuns: 0,
  maxRrev: 0,
  colourRecipes: [],
  hiddenByRun: {},
  hiddenByBatch: {},
  runs: [],
  batches: [],
  nextPageToken: '',
  // ПОЛКИ АССЕТОВ КАРТОЧКИ (V-11) и метки, которые они оставили на флэтах. Пусто, а не
  // `undefined`: «сервер про них не знает» и «на этой карточке их нет» рисуются одинаково —
  // пустой полкой с живым плейсхолдером, — потому что завести ассет на старом бинаре всё равно
  // нельзя, и полка, нарисованная иначе, обещала бы человеку разницу, которой он не может
  // воспользоваться.
  assets: [],
  assetPlacements: [],
  // ВЫХОДЫ КАРТОЧКИ ЦЕЛИКОМ (H-9). Пусто, а не `undefined`, и это ответ на вопрос, который
  // комментарий выше требует решать человеком: на бинаре, который поля не знает, читатель обязан
  // упасть обратно на обход первой страницы `runs` — то есть увидеть ровно то, что видел до этой
  // волны. Пустой список это и означает: «сказать нечего», а не «выходов нет».
  //
  // ⚠ `outputsTotal` НОЛЬ здесь НЕ ЗНАЧИТ «карточка пуста». Ноль рядом с непустыми `runs` читается
  // как «эта половина ответа не пришла», и подписывать усечение по нему нельзя — подпись берётся
  // из `outputsTotalByColorway` и только когда там есть ключ секции.
  outputs: [],
  outputsTotal: 0,
  outputsTotalByColorway: {},
  // `undefined`, AND EXPLICITLY NOT `false`. This is the band handed to a card whose server does
  // not speak the routes at all, or one that has not answered yet — and `has_fabric_render` is the
  // mirror of the SERVER's own 3D gate (W-13). `false` here would be a claim we are not entitled
  // to make: it would grey out 3D on the strip of every card on a rolled-back contour and on every
  // card for the duration of its first read, worded as «this card owns no fabric render» when the
  // truth is «nobody has been asked». Absence is read as «not stated» by every consumer of it.
  hasFabricRender: undefined,
  // `undefined`, AND NOT `[]`, BY THE SAME RULE AND FOR A SHARPER REASON. This set is now the 3D
  // DOOR (L-3): a client reads «is my colourway's render bench occupied» off it. An empty list is
  // a claim — «no bench on this card holds a plate» — and on a rolled-back binary, or during the
  // first read, it is a claim nobody made: it would draw 3D shut on every card of that contour with
  // a sentence naming a colourway, which is a lie with a proper noun in it. Absence is read as «not
  // stated» by `renderBenchOccupied`, which then answers «occupied» and lets the SERVER refuse if
  // it must — the same posture `hasFabricRender` above takes.
  renderBenchColorwayIds: undefined,
};

export type DesignBandState = {
  band: GetDesignBandResponse;
  /** The card has never been read yet — organs render their own skeletons, not an empty band. */
  isLoading: boolean;
  /** The server answered the band's routes. False also while loading: nothing may be sent yet. */
  serverSpeaks: boolean;
  /** A real failure, as opposed to «this binary has no band». */
  error: Error | null;
  refetch: () => void;
};

/**
 * ОПИСАНИЕ ЧТЕНИЯ ПОЛОСЫ — ОДНО, потому что читателя стало два: подписка экрана (`useDesignBand`)
 * и разовое чтение «как сейчас на сервере» (`readBandNow` ниже). Они РАЗНОЙ природы — один живёт
 * в кэше, второй нарочно идёт мимо него, — но спрашивают одно и то же и обязаны спрашивать это
 * одинаково: второй объявленный порознь запрос разъедется с первым на первом же поле, которое
 * появится в аргументах.
 */
function bandQuery(techCardId: number) {
  return {
    queryKey: designKeys.band(techCardId),
    queryFn: () =>
      adminService.GetDesignBand({
        techCardId,
        /**
         * ═══ THE BENCH IS READ WHOLE, AND SCOPED ON THE CLIENT (L-2, D6) ═════════════════════
         *
         * `bench_colorway_id` has THREE outcomes and 0 is «NOT STATED», i.e. the WHOLE bench —
         * byte for byte what every client before this axis sent. That is what travels here, and
         * the picked colourway narrows the rows in `benchRowMatches` instead.
         *
         * WHY NOT FILTER ON THE SERVER, WHICH IT CAN DO (`-1` for the colourway-less bench, a
         * product id for a named one). Because this message is not the bench: it is the bench PLUS
         * the budget, the references, the layers, the shelves, the aggregates and the first page of
         * the merged feed — and the filter narrows `bench` ONLY, by the contract's own words. A
         * per-colourway argument would therefore mint one CACHE ENTRY PER COLOURWAY of the same
         * card, each holding its own copy of a feed that is identical in all of them, and every
         * write on the card would have to invalidate all of them or leave the others stale. One
         * key per card is the guarantee this seam was built for: «the bench and the feed on screen
         * are the same instant of the card».
         *
         * IT ALSO KEEPS COLOURWAY SWITCHING FREE. The rows are already in hand, so picking a
         * colour redraws without a round trip — and `render_bench_colorway_ids`, which the picker
         * draws its presence dots from, is whole-card regardless of this argument.
         *
         * THE COST IS NAMED AND PAID IN ONE PLACE: every reader of the render bench must match the
         * TRIPLE (view, kind, colourway). That is `benchRowMatches` in `./bench-kinds`, and a
         * second parse of a slot's colourway anywhere else is the L-5 defect with a new axis.
         */
        benchColorwayId: 0,
      }),
  };
}

export function useDesignBand(techCardId?: number): DesignBandState {
  const enabled = !!techCardId && techCardId > 0;
  const query = useQuery({
    ...bandQuery(techCardId ?? 0),
    enabled,
    // An unimplemented route will not become implemented by asking again, and a 404 storm on every
    // card open is how a rolled-back binary turns into a support ticket about «the admin is slow».
    retry: (failureCount, error) => !isUnimplemented(error) && failureCount < 1,
  });

  const unimplemented = isUnimplemented(query.error);

  return {
    band: query.data ?? EMPTY_BAND,
    isLoading: enabled && query.isLoading,
    serverSpeaks: enabled && !!query.data && !unimplemented,
    error: unimplemented ? null : ((query.error as Error | null) ?? null),
    refetch: query.refetch,
  };
}

/**
 * Every write goes through one factory so that «what happens after it lands» is written once.
 *
 * `Aborted` is not an error the user caused. Two people share a bench; a stale `expected_slot_rev`
 * means somebody else put a picture in that slot a second ago. The honest reaction is to say who
 * and refetch — NOT to retry, which would overwrite their work with the intent they had before
 * they saw it.
 */
function isAborted(error: unknown): boolean {
  const status = (error as { status?: number } | null)?.status;
  // grpc-gateway maps codes.Aborted onto HTTP 409.
  return status === 409;
}

export type DesignWriteOptions = {
  /** Shown on success. Omit for writes whose result is visible on screen by itself. */
  successMessage?: string;
  onSettledOk?: () => void;
};

export function useDesignWrites(techCardId?: number) {
  const qc = useQueryClient();
  const { showMessage } = useSnackBarStore();
  const key = designKeys.band(techCardId ?? 0);

  const invalidate = useCallback(() => {
    qc.invalidateQueries({ queryKey: key });
  }, [qc, key]);

  /**
   * ПОЛОСА, ПРОЧИТАННАЯ СЕЙЧАС, — не то, что лежит в кэше.
   *
   * ЗАЧЕМ ЭТО ВООБЩЕ ЕСТЬ. Есть один класс записи, которому мало «отправил и перечитал»: КЛИЕНТСКАЯ
   * КОМПЕНСАЦИЯ ЧУЖОЙ ЗАПИСИ — когда клиент снимает то, что поставил сервер (`split-to-input.tsx`,
   * T-15). Такая запись обязана сначала убедиться, что снимает СВОЁ, потому что между действием
   * сервера и этим снятием в строку мог написать ЧЕЛОВЕК из другой вкладки, а `SetDesignReferenceRole`
   * с пустой ролью — голый DELETE строки: он унесёт и чужую роль, и чужую записку, и спросить его
   * «а если строка изменилась» нечем. Проверка по `band` из пропа не годится — это снимок ДО
   * разреза; нужен именно свежий ответ.
   *
   * ЗАПРОС ИДЁТ МИМО КЭША, И ЭТО ЕДИНСТВЕННОЕ, ЧТО ЗДЕСЬ РАБОТАЕТ. Напрашивающийся `fetchQuery` по
   * тому же ключу СКЛЕИВАЕТСЯ С УЖЕ ЛЕТЯЩИМ запросом — а летящий мог быть отправлен ДО той записи,
   * чей след мы проверяем. Тогда проверка получила бы состояние «до», не нашла роли и доложила «её
   * и не было», то есть тихо разрешила бы промпту остаться неснятым. Для проверки перед записью
   * годится только ответ на запрос, отправленный ПОСЛЕ предыдущей записи, и «свежесть» здесь —
   * порядок событий, а не время жизни кэша.
   *
   * В КЭШ ОТВЕТ НАРОЧНО НЕ КЛАДЁТСЯ. Это чтение — довод для решения, а не то, что рисует экран; за
   * экран отвечает `invalidate` каждой записи. Положить сюда значило бы вступить в гонку за одну
   * ячейку с перечитыванием, которое ещё летит, и её мог бы выиграть более старый ответ.
   *
   * ОТКАЗ ВОЗВРАЩАЕТСЯ КАК `null`, И ВЫЗЫВАЮЩИЙ ОБЯЗАН ЧИТАТЬ ЕГО КАК «НЕ ЗНАЮ», а не как «пусто»:
   * не прочитав состояние, компенсацию нельзя выполнить — только назвать несделанной.
   */
  /* `readBandNow` СНЯТ ВМЕСТЕ СО СВОИМ ЕДИНСТВЕННЫМ ПОТРЕБИТЕЛЕМ. Разовое чтение «как сейчас на
     сервере» существовало ради компенсации ролей разреза: клиент проверял перед каждым снятием,
     что строка всё ещё та, что поставил сервер. Компенсации больше нет — намерение разреза едет
     в самом запросе (`for_input`), и роли, которых не просили, не пишутся. Читать полосу мимо
     кэша больше незачем, а живой глагол без потребителя — приглашение позвать его там, где
     обычного чтения хватило бы. */

  /**
   * The shared tail of every band write. Kept as a plain function rather than a hook so the
   * mutations below can all be declared unconditionally at the top level.
   */
  const onError = useCallback(
    (error: unknown) => {
      const message = (error as Error)?.message || 'the change did not go through';
      if (isAborted(error)) {
        // Somebody else moved first. Their state wins; ours is thrown away on purpose.
        showMessage(`someone changed this first — ${message}`, 'error');
        invalidate();
        return;
      }
      showMessage(message, 'error');
    },
    [showMessage, invalidate],
  );

  const registerUpload = useMutation({
    mutationFn: (input: {
      clientRequestId: string;
      items: DesignUploadItem[];
      target?: DesignBenchSlotRef;
      expectedSlotRev?: number;
      newDetailName?: string;
    }) =>
      adminService.RegisterDesignUpload({
        techCardId: techCardId ?? 0,
        clientRequestId: input.clientRequestId,
        items: input.items,
        target: input.target,
        expectedSlotRev: input.expectedSlotRev ?? 0,
        newDetailName: input.newDetailName ?? '',
      }),
    onSuccess: invalidate,
    onError,
  });

  const setBenchSlot = useMutation({
    mutationFn: (input: {
      slot: DesignBenchSlotRef;
      pictureId: number;
      expectedSlotRev: number;
      newDetailName?: string;
    }) =>
      adminService.SetDesignBenchSlot({
        techCardId: techCardId ?? 0,
        slot: input.slot,
        pictureId: input.pictureId,
        expectedSlotRev: input.expectedSlotRev,
        newDetailName: input.newDetailName ?? '',
      }),
    onSuccess: invalidate,
    onError,
  });

  const deleteDetailSlot = useMutation({
    mutationFn: (slotId: number) => adminService.DeleteDesignDetailSlot({ slotId }),
    onSuccess: invalidate,
    onError,
  });

  const hidePicture = useMutation({
    mutationFn: (input: { pictureId: number; hidden: boolean }) =>
      adminService.HideDesignPicture(input),
    onSuccess: invalidate,
    onError,
  });

  /**
   * THE MARK «CHOSEN» ON A PICTURE — W-12. `selected: false` takes the mark off; the server keeps
   * the two picture flags INDEPENDENT and so does this seam: choosing is not un-hiding, hiding is
   * not un-choosing, and nothing is exclusive — the owner speaks in the plural, so many pictures
   * of a kind may carry the mark at once. No optimistic write, same as `hidePicture`: the badge is
   * drawn from the refetched band, so the screen can never show a mark the server refused.
   */
  const setPictureSelected = useMutation({
    mutationFn: (input: { pictureId: number; selected: boolean }) =>
      adminService.SetDesignPictureSelected(input),
    onSuccess: invalidate,
    onError,
  });

  const splitPicture = useMutation({
    mutationFn: (input: {
      pictureId: number;
      clientRequestId: string;
      frames: DesignSplitFrame[];
      /**
       * Просит ли ВЫЗЫВАЮЩИЙ показать кропы модели. Обязателен и без умолчания: разрез с верстака
       * и разрез из блока входа — два разных намерения, и молчание одного из них означало бы
       * умолчание, выбранное здесь, а не сказанное тем, кто режет. Сервер по лжи пишет роли
       * промпта (`design_reference`), и снять их потом без гонки с человеком нечем.
       */
      forInput: boolean;
    }) => adminService.SplitDesignPicture(input),
    onSuccess: invalidate,
    onError,
  });

  /**
   * РОЛЬ И ЗАПИСКА — ОДИН UPSERT, потому что они одна строка. Записка живёт на строке роли
   * (`design_reference.note`), и второй глагол для неё был бы вторым запросом, который умеет
   * наполовину не дойти: роль встала, записка нет — и на экране пара, которой в базе не бывает.
   *
   * АСИММЕТРИЯ ОЧИСТКИ ПРИХОДИТ С КОНТРАКТА, и вызывающий обязан её знать: пустая РОЛЬ УДАЛЯЕТ
   * строку и уносит записку с собой (строка и есть существование роли), а пустая ЗАПИСКА на
   * строке, сохраняющей роль, стирает только записку.
   *
   * У ЗАПИСКИ ТРИ СОСТОЯНИЯ, А НЕ ДВА, и это НЕ мелочь стиля: в контракте поле объявлено
   * `optional` (`SetDesignReferenceRoleRequest.note`) ровно затем, чтобы «сказать про записку
   * нечего» отличалось от «стереть записку». ОТСУТСТВИЕ поля — «оставь как было», ПРИСУТСТВИЕ с
   * пустой строкой — «сотри». Поэтому здесь `note?: string` и передаётся КАК ЕСТЬ: `JSON.stringify`
   * выбрасывает `undefined`, и незаданная записка не доезжает до сервера вовсе.
   *
   * (Здесь стояло «`note` передаётся ВСЕГДА — забыть его значит стереть чужие слова молча». Довод
   * был верен для сигнатуры, где записка обязательна, и НЕВЕРЕН про провод: молча стирает как раз
   * пустая строка, а не пропуск. Обязательность поля заставляла всякого, кто правит только роль,
   * придумывать значение чужой записке — то есть заставляла делать именно то, от чего защищала.)
   */
  /**
   * ═══ И ТРЕТЬЕ ПОЛЕ С ТРЕМЯ ЧЛЕНАМИ — `detail_slot_id` (J-9) ═══════════════════════════════
   *
   * Правило СЕРВЕРНОЕ, и клиент обязан ему подчиняться, а не изобретать своё:
   *   · роль ≠ `detail`            — сохранённая связь ОЧИЩАЕТСЯ сервером, что бы мы ни прислали;
   *   · роль = `detail`, id  > 0   — связь ЗАПИСЫВАЕТСЯ;
   *   · роль = `detail`, id == 0   — связь СОХРАНЯЕТСЯ. НОЛЬ ЭТО «нечего сказать про слот»,
   *                                  и НИКОГДА не «очисти».
   *
   * ⚠ ПОЭТОМУ УМОЛЧАНИЕ — НОЛЬ, И ЭТО НЕ ЛЕНЬ, А ЕДИНСТВЕННОЕ БЕЗОПАСНОЕ ЗНАЧЕНИЕ. Всякий, кто
   * правит ТОЛЬКО записку (`commitNote`) или только роль, поле не задаёт — и обязан не задавать:
   * proto3 не отличает незаданный int32 от нуля, так что «забыл прислать» и «прислал 0» на
   * проводе одно и то же, и сервер трактует их как «оставь». Это ровно та ловушка, которую
   * `note` уже проходил, прежде чем стал `optional`; здесь `optional` ничего бы не купил, потому
   * что «оставь» — единственное, чем ноль мог бы быть полезен.
   *
   * ⚠ ОТРИЦАТЕЛЬНОЕ НЕ УЕЗЖАЕТ НИКОГДА. Сервер отвергает его `InvalidArgument`, а этот вызов идёт
   * ВТОРЫМ в паре «завести слот → связать с ним референс»: отказ здесь оставил бы на верстаке
   * заведённую именованную деталь, на которую не показывает ни один референс. Пол — ноль, то есть
   * «оставь как было»: худшее, что даёт зажим, — сегодняшнее поведение без связи, а не полузапись.
   * Величина отрицательной быть не может (id приходит из ответа сервера), поэтому зажим — сторож
   * на невозможном, а не обработка ожидаемого.
   */
  const setReferenceRole = useMutation({
    mutationFn: (input: {
      mediaId: number;
      role: string;
      ordinal: number;
      note?: string;
      detailSlotId?: number;
    }) =>
      adminService.SetDesignReferenceRole({
        techCardId: techCardId ?? 0,
        mediaId: input.mediaId,
        role: input.role,
        ordinal: input.ordinal,
        note: input.note,
        detailSlotId: Math.max(0, Math.trunc(input.detailSlotId ?? 0)),
      }),
    onSuccess: invalidate,
    onError,
  });

  return useMemo(
    () => ({
      registerUpload,
      setBenchSlot,
      deleteDetailSlot,
      hidePicture,
      setPictureSelected,
      splitPicture,
      setReferenceRole,
      invalidate,
    }),
    [
      registerUpload,
      setBenchSlot,
      deleteDetailSlot,
      hidePicture,
      setPictureSelected,
      splitPicture,
      setReferenceRole,
      invalidate,
    ],
  );
}

/**
 * `client_request_id` is the server's idempotency key: a repeated id returns the SAME row instead
 * of creating a phantom second one. It must therefore be minted once per user intent and survive a
 * retry — generating it inside the mutation would defeat the entire mechanism, since a retry would
 * carry a fresh id and the server would honestly create a second row.
 *
 * Every write of this band that a human can fire twice takes one: an upload registration, a split,
 * a run. (The sheet's own version mint was the first reader of this rule and is gone; the rule is
 * not — it belongs to the writes, not to that one act.)
 */
export function newClientRequestId(): string {
  const c = globalThis.crypto;
  if (c && typeof c.randomUUID === 'function') return c.randomUUID();
  const bytes = new Uint8Array(16);
  if (c && typeof c.getRandomValues === 'function') c.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
}

/**
 * Best-effort URL of a media id, out of the pictures the band's FIRST PAGE already carries. The
 * contract has no media-by-id read on purpose (the band is the one source of re-entry truth), so
 * a file whose run has paged out of the first history page comes back as '' — the caller must
 * degrade to words, never to a broken image.
 *
 * ⚠ ЖИВЁТ ЗДЕСЬ, А НЕ У ПЛАТНОГО ПРОГОНА (H-1, круг 14). Функция читает `GetDesignBandResponse` —
 * это словарь полосы, и её настоящий потребитель СЛОЙ-ФАЙЛ на повторном заходе: у слоя есть
 * `source_media_id`, а URL к нему надо чем-то найти. Прежний дом (`use-trace-vector.ts`) снесён
 * вместе с векторным прогоном, а эта работа его смерть пережила и от неё не зависела ни дня.
 */
export function findMediaUrlInBand(band: GetDesignBandResponse, mediaId: number): string {
  if (!mediaId) return '';
  const pools = [
    ...(band.runs ?? []).map((r) => r.pictures ?? []),
    ...(band.batches ?? []).map((b) => b.pictures ?? []),
  ];
  for (const pictures of pools) {
    for (const p of pictures) {
      if ((p.media?.id ?? 0) === mediaId) {
        return (
          p.media?.media?.fullSize?.mediaUrl ||
          p.media?.media?.compressed?.mediaUrl ||
          p.media?.media?.thumbnail?.mediaUrl ||
          ''
        );
      }
    }
  }
  return '';
}
