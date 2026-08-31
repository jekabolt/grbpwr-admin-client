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
 * ONE READ. `GetDesignBand` returns the whole band — bench, versions, journal, budget, references,
 * layers, aggregates, the first page of the merged runs+batches feed. So there is exactly one
 * query key per card and every mutation invalidates exactly it. Splitting the read per organ would
 * buy nothing (the server composes it in one transaction anyway) and would cost the guarantee that
 * the bench and the feed on screen are the same instant of the card.
 */
export const designKeys = {
  all: ['design'] as const,
  band: (techCardId: number) => [...designKeys.all, 'band', techCardId] as const,
  version: (techCardId: number, versionNumber: number) =>
    [...designKeys.all, 'version', techCardId, versionNumber] as const,
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

const EMPTY_BAND: GetDesignBandResponse = {
  bench: [],
  versionNumbers: [],
  latestVersion: undefined,
  journal: [],
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
  // `undefined`, AND EXPLICITLY NOT `false`. This is the band handed to a card whose server does
  // not speak the routes at all, or one that has not answered yet — and `has_fabric_render` is the
  // mirror of the SERVER's own 3D gate (W-13). `false` here would be a claim we are not entitled
  // to make: it would grey out 3D on the strip of every card on a rolled-back contour and on every
  // card for the duration of its first read, worded as «this card owns no fabric render» when the
  // truth is «nobody has been asked». Absence is read as «not stated» by every consumer of it.
  hasFabricRender: undefined,
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
    queryFn: () => adminService.GetDesignBand({ techCardId }),
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
  const setReferenceRole = useMutation({
    mutationFn: (input: { mediaId: number; role: string; ordinal: number; note?: string }) =>
      adminService.SetDesignReferenceRole({
        techCardId: techCardId ?? 0,
        mediaId: input.mediaId,
        role: input.role,
        ordinal: input.ordinal,
        note: input.note,
      }),
    onSuccess: invalidate,
    onError,
  });

  const recordIssue = useMutation({
    mutationFn: (input: { versionNumber: number; action: string; clientRequestId: string }) =>
      adminService.RecordDesignSheetIssue({
        techCardId: techCardId ?? 0,
        versionNumber: input.versionNumber,
        action: input.action,
        clientRequestId: input.clientRequestId,
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
      recordIssue,
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
      recordIssue,
      invalidate,
    ],
  );
}

/**
 * A minted version, read whole and on demand. ARTIFACTS shows the LIVE document plus a «differs
 * from vN» plate; only printing or inspecting an old version pulls one of these, which is why it
 * is not folded into the band read.
 */
export function useDesignSheetVersion(techCardId?: number, versionNumber?: number) {
  return useQuery({
    queryKey: designKeys.version(techCardId ?? 0, versionNumber ?? 0),
    queryFn: () =>
      adminService.GetDesignSheetVersion({
        techCardId: techCardId ?? 0,
        versionNumber: versionNumber ?? 0,
      }),
    enabled: !!techCardId && !!versionNumber && versionNumber > 0,
    // A frozen version is immutable by construction; refetching it can only cost time.
    staleTime: Infinity,
  });
}

/**
 * `client_request_id` is the server's idempotency key: a repeated id returns the SAME row instead
 * of minting a phantom second one. It must therefore be minted once per user intent and survive a
 * retry — generating it inside the mutation would defeat the entire mechanism, since a retry would
 * carry a fresh id and the server would honestly create a second version.
 */
export function newClientRequestId(): string {
  const c = globalThis.crypto;
  if (c && typeof c.randomUUID === 'function') return c.randomUUID();
  const bytes = new Uint8Array(16);
  if (c && typeof c.getRandomValues === 'function') c.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
}
