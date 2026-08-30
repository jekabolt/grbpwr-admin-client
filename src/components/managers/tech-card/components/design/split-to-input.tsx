import type { GetDesignBandResponse, common_DesignPicture, common_MediaFull } from 'api/proto-http/admin';
import { cn } from 'lib/utility';
import { useSnackBarStore } from 'lib/stores/store';
import { useRef, useState } from 'react';
import { useFormContext } from 'react-hook-form';

import type { TechCardFormData } from '../schema';
import {
  INPUT_MAX,
  REFERENCE_KIND,
  appendBoardPictures,
  isInputRow,
  type BoardItem,
} from './mood-board';
import { SplitModal } from './split-modal';
import { newClientRequestId, useDesignWrites } from './use-design-band';
import { DESIGN_VIEW_KEYS, normaliseViewKey } from './views';

/**
 * СПЛИТ → ВХОД: разметить на картинке кадры видов и получить их ОТДЕЛЬНЫМИ строками входа, уже
 * помеченными ролью (R-17). Логика вынесена из блока референсов, потому что та же кнопка нужна и
 * на плитах FLAT SLOTS (чужой файл): два экрана, один механизм, и разъехаться им нельзя — роль,
 * которую ставит один, обязана значить то же, что роль, которую ставит другой.
 *
 * ЦЕПОЧКА БЕЗ НОВЫХ RPC, и каждый её шаг вынужден контрактом:
 *   1. `RegisterDesignUpload(media)` — `SplitDesignPicture` режет только КАРТИНКУ ПОЛОСЫ (по
 *      `picture_id`), а референс — это `media_id`, у которого картинки полосы может не быть.
 *      Регистрация её создаёт. ЦЕНА НАЗВАНА: медиа при этом филуется в полосу как ручная пачка и
 *      появляется на полке загрузок — это не утечка, а то, чем «картинка полосы» является.
 *      Плиты верстака этот шаг пропускают (`openForPicture`): у них картинка уже есть.
 *   2. `SplitDesignPicture(frames)` — кадры размечает человек в модалке; каждый кадр обязан нести
 *      вид, безымянный кадр модалка не отпускает.
 *   3. Из вернувшихся кропов — строки входа + `SetDesignReferenceRole(role = view_key кадра)`.
 *      Словари ролей и видов совпадают буква в букву (`front|back|side_l|side_r|detail`), поэтому
 *      перенос — членство в `DESIGN_VIEW_KEYS`, а не догадка и не карта соответствия.
 *
 * ЧТО ВИДНО ПРИ ЧАСТИЧНОМ ПРОВАЛЕ. Запись ролей — N отдельных вызовов, они не атомарны. Кроп, чья
 * роль не встала, НЕ прячется и не откатывается: его строка входа уже на карточке, ячейка честно
 * говорит «not in prompt», и роль ставится руками тем же селектом, что и всегда. Отказ сервера
 * при этом кричит сноской шва записи (`useDesignWrites.onError`) — молча не теряется ничего.
 */
export function useSplitToInput({
  techCardId,
  band,
  /**
   * Свежепринятые медиа кропов — вызывающему, который держит СВОЮ карту разрешения media_id→файл.
   * Кропы только что родились на сервере, в библиотечной карте их ещё нет, и без этого колбэка
   * блок референсов рисовал бы «media #N not resolved» на строке, которую сам же завёл.
   */
  onAccepted,
}: {
  techCardId: number;
  band: GetDesignBandResponse;
  onAccepted?: (media: common_MediaFull[]) => void;
}) {
  const { getValues, setValue } = useFormContext<TechCardFormData>();
  const { registerUpload, setReferenceRole } = useDesignWrites(techCardId);
  const { showMessage } = useSnackBarStore();

  const [target, setTarget] = useState<{ picture: common_DesignPicture; handle?: string } | null>(
    null,
  );
  /** Чьё медиа сейчас регистрируется — кнопке-инициатору, чтобы показать «split…» и не дать второй клик. */
  const [registering, setRegistering] = useState<number | null>(null);

  /**
   * Регистрации этой сессии: media_id → {ключ намерения, картинка}. Ключ минтится ОДИН раз на
   * медиа и переживает и ретрай, и повторный клик: `client_request_id` — серверный ключ
   * идемпотентности, повторный id возвращает ТУ ЖЕ пачку вместо фантомной второй. Свежий ключ на
   * каждый клик плодил бы в полосе по картинке на нажатие.
   */
  const registered = useRef(new Map<number, { requestId: string; picture?: common_DesignPicture }>());

  /** Картинка полосы под этим media_id, если она уже есть, — тогда регистрация не нужна вовсе. */
  function findBandPicture(mediaId: number): common_DesignPicture | undefined {
    const live = (p: common_DesignPicture) => p.media?.id === mediaId && !p.hiddenAt;
    for (const batch of band.batches ?? []) {
      const hit = (batch.pictures ?? []).find(live);
      if (hit) return hit;
    }
    for (const run of band.runs ?? []) {
      const hit = (run.pictures ?? []).find(live);
      if (hit) return hit;
    }
    for (const slot of band.bench ?? []) {
      if (slot.picture && live(slot.picture)) return slot.picture;
    }
    return undefined;
  }

  /** Дверь для плит, у которых картинка полосы уже есть (FLAT SLOTS): регистрация пропускается. */
  function openForPicture(picture: common_DesignPicture, handle?: string) {
    setTarget({ picture, handle });
  }

  /** Дверь для референсов: у входа только `media_id`, картинку полосы сначала надо получить. */
  function openForMedia(full: common_MediaFull, handle?: string) {
    const mediaId = full.id;
    if (mediaId == null) return;
    const existing = findBandPicture(mediaId) ?? registered.current.get(mediaId)?.picture;
    if (existing) {
      openForPicture(existing, handle);
      return;
    }
    let entry = registered.current.get(mediaId);
    if (!entry) {
      entry = { requestId: newClientRequestId() };
      registered.current.set(mediaId, entry);
    }
    const keep = entry;
    setRegistering(mediaId);
    registerUpload.mutate(
      // `ghostView: ''` — у исходника-склейки одного вида нет; `kind: ''` читается сервером как flat.
      { clientRequestId: keep.requestId, items: [{ mediaId, ghostView: '', kind: '' }] },
      {
        onSuccess: (data) => {
          setRegistering(null);
          const picture =
            (data.pictures ?? []).find((p) => p.media?.id === mediaId) ?? (data.pictures ?? [])[0];
          if (!picture) {
            // Сервер сказал «да» и не вернул картинку — это его нарушение контракта, но открыть
            // модалку не на чем, и молчать нельзя: клик выглядел бы съеденным.
            showMessage('the upload was filed but no picture came back', 'error');
            return;
          }
          keep.picture = picture;
          openForPicture(picture, handle);
        },
        // Слова отказа уже показал шов записи (`useDesignWrites.onError`); здесь — только снять
        // «split…» с кнопки, чтобы она не осталась вечно занятой.
        onError: () => setRegistering(null),
      },
    );
  }

  /** Кропы сплита → строки входа + роль вида на каждую. Вызывается модалкой после удавшегося разреза. */
  function handleCrops(pictures: common_DesignPicture[]) {
    const withMedia = pictures.filter((p) => p.media?.id != null);
    const result = appendBoardPictures({
      live: (getValues('moodboardMedia') ?? []) as BoardItem[],
      inScope: isInputRow,
      otherListIds: ((getValues('technicalMedia') ?? []) as BoardItem[]).map((i) => i.mediaId),
      added: withMedia.map((p) => p.media as common_MediaFull),
      kind: REFERENCE_KIND,
      max: INPUT_MAX,
      scopeLabel: 'input',
    });
    // Потолок входа держит и кропы: отказ приёма называет, сколько поместилось, — и кроп, не
    // попавший в строки, роли НЕ получает, иначе родился бы носитель роли, которого нет на экране.
    if (result.refusal) showMessage(result.refusal, 'error');
    if (!result.accepted.length) return;

    // Запись по КОРНЮ массива — как везде в этой паре блоков: два экземпляра поля-массива на одно
    // имя не синхронизируются, а мудборд смонтирован рядом и правит вторую половину того же списка.
    setValue('moodboardMedia', result.next as TechCardFormData['moodboardMedia'], {
      shouldDirty: true,
    });
    onAccepted?.(result.accepted);

    const acceptedIds = new Set(result.accepted.map((m) => m.id));
    const inputRows = result.next.filter(isInputRow);
    let marked = 0;
    for (const crop of withMedia) {
      const mediaId = crop.media?.id as number;
      if (!acceptedIds.has(mediaId)) continue;
      // Роль кадра приезжает на кропе как `ghost_view`. Перенос — только членством в словаре:
      // ключ вне его (сервер из будущего) не превращается в роль-догадку, строка остаётся
      // «not in prompt», и человек ставит роль руками.
      const role = normaliseViewKey(crop.ghostView);
      if (!(DESIGN_VIEW_KEYS as readonly string[]).includes(role)) continue;
      // ORDINAL — позиция во входе, не номер промпта: номер выводится сканом на чтении.
      const ordinal = Math.max(1, inputRows.findIndex((i) => i.mediaId === mediaId) + 1);
      setReferenceRole.mutate({ mediaId, role, ordinal, note: '' });
      marked += 1;
    }
    showMessage(
      `${result.accepted.length} picture${result.accepted.length === 1 ? '' : 's'} added to the input — ${marked} marked with ${marked === 1 ? 'its view' : 'their views'}`,
      'success',
    );
  }

  const modal = target ? (
    <SplitModal
      techCardId={techCardId}
      picture={target.picture}
      handle={target.handle}
      open
      onOpenChange={(open) => !open && setTarget(null)}
      onSplit={handleCrops}
    />
  ) : null;

  return { openForMedia, openForPicture, registering, modal };
}

/**
 * Угловая кнопка «split» — тот же орган, что «zoom» на кадре: рамка, белая подложка, нано-капс.
 * Видимость (наведение ИЛИ фокус) отдаёт ХОЗЯИН своими классами — у ячейки референсов и у плиты
 * верстака свои группы наведения, и кнопка не вправе решать за них. Пока идёт регистрация, кнопка
 * видна БЕЗУСЛОВНО: занятый орган, видимый только под курсором, читается как съеденный клик.
 */
export function SplitCornerButton({
  onClick,
  pending,
  disabled,
  ariaLabel,
  className,
}: {
  onClick: () => void;
  pending?: boolean;
  disabled?: boolean;
  ariaLabel: string;
  className?: string;
}) {
  return (
    <button
      type='button'
      onClick={onClick}
      disabled={disabled || pending}
      aria-label={ariaLabel}
      aria-busy={pending || undefined}
      className={cn(
        'border border-borderColor bg-bgColor px-1 text-nano uppercase tracking-label text-labelColor hover:text-textColor disabled:text-textInactiveColor',
        className,
        pending && 'opacity-100',
      )}
    >
      {pending ? 'split…' : 'split'}
    </button>
  );
}
