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
 * помеченными ролью (R-17). Логика вынесена из блока референсов, потому что та же кнопка стоит и
 * на плитах FLAT SLOTS (`bench.tsx` → `openForPicture`): два экрана, один механизм, и разъехаться
 * им нельзя — роль, которую ставит один, обязана значить то же, что роль, которую ставит другой.
 *
 * ЦЕПОЧКА БЕЗ НОВЫХ RPC, и каждый её шаг вынужден контрактом:
 *   1. `RegisterDesignUpload(media)` — `SplitDesignPicture` режет только КАРТИНКУ ПОЛОСЫ (по
 *      `picture_id`), а референс — это `media_id`, у которого картинки полосы может не быть.
 *      Регистрация её создаёт. ЦЕНА НАЗВАНА: медиа при этом филуется в полосу как ручная пачка и
 *      появляется на полке загрузок — это не утечка, а то, чем «картинка полосы» является.
 *      Плиты верстака этот шаг пропускают (`openForPicture`): у них картинка уже есть.
 *   2. `SplitDesignPicture(frames)` — кадры размечает человек в модалке; каждый кадр обязан нести
 *      вид, безымянный кадр модалка не отпускает.
 *   3. Из вернувшихся кропов — ТОЛЬКО строки входа. Роли кропам НЕ пишутся отсюда, и это не
 *      экономия, а запрет двойного писателя: СЕРВЕР ставит `design_reference(role = view_key
 *      кадра)` В ТОЙ ЖЕ транзакции, что и сами кропы (`internal/store/design/pictures.go`,
 *      SplitPicture), с идемпотентностью по живым кропам родителя. Второй `SetDesignReferenceRole`
 *      с клиента затирал бы серверный ordinal (хвост промпта) позицией строки и, по семантике
 *      upsert-а, нёс бы `note: ''` — то есть пустую записку поверх строки, которой уже владеет
 *      сервер. Роли приезжают со следующим чтением полосы (`invalidate` в шве записи сплита).
 *
 * ЧТО ВИДНО ПРИ ЧАСТИЧНОМ ПРОВАЛЕ. Роль-без-строки невозможна наполовину: роли и кропы — одна
 * серверная транзакция. Единственный частичный исход остаётся у ПОТОЛКА ВХОДА: кроп, не
 * поместившийся в строки (`INPUT_MAX`), роль с сервера всё равно несёт и потому виден в блоке
 * референсов плашкой «off the card» — его есть чем снять руками, а отказ приёма называет числа.
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
  const { registerUpload } = useDesignWrites(techCardId);
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

  /**
   * Кропы сплита → строки входа. РОЛИ ЗДЕСЬ НЕ ПИШУТСЯ: их уже поставил сервер в транзакции
   * самого разреза (см. шапку файла — второй писатель затирал бы серверный ordinal и записку).
   * Отсюда уходит только ДОКУМЕНТНАЯ половина референса — строка `kind = REFERENCE` на карточке,
   * которой серверу взять неоткуда: `tech_card_media` едет целиком с сейвом формы.
   */
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
    // Потолок входа держит и кропы, и отказ называет числа. Кроп, не поместившийся в строки,
    // роль с сервера ВСЁ РАВНО несёт — прятать его нельзя (носитель роли обязан быть на экране),
    // поэтому блок референсов покажет его плашкой «off the card», и его есть чем снять руками.
    if (result.refusal) showMessage(result.refusal, 'error');
    if (!result.accepted.length) return;

    // Запись по КОРНЮ массива — как везде в этой паре блоков: два экземпляра поля-массива на одно
    // имя не синхронизируются, а мудборд смонтирован рядом и правит вторую половину того же списка.
    setValue('moodboardMedia', result.next as TechCardFormData['moodboardMedia'], {
      shouldDirty: true,
    });
    onAccepted?.(result.accepted);

    // Счёт для итоговой строки — по `ghost_view` кропа, членством в словаре: ровно то условие, по
    // которому сервер ставил роль (`IsDesignGhostView`), и потому итог не обещает больше, чем
    // покажет перечитанная полоса. Ключ вне словаря (сервер из будущего) в счёт не входит.
    const acceptedIds = new Set(result.accepted.map((m) => m.id));
    const marked = withMedia.filter(
      (crop) =>
        acceptedIds.has(crop.media?.id as number) &&
        (DESIGN_VIEW_KEYS as readonly string[]).includes(normaliseViewKey(crop.ghostView)),
    ).length;
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
