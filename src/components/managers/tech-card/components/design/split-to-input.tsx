import type { GetDesignBandResponse, common_DesignPicture, common_MediaFull } from 'api/proto-http/admin';
import { cn } from 'lib/utility';
import { useSnackBarStore } from 'lib/stores/store';
import { useRef, useState, type ReactNode } from 'react';
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
import { uploadItem } from './upload-item';

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
 * поместившийся в строки (`INPUT_MAX`), роль с сервера всё равно несёт и потому остаётся видимым
 * в блоке референсов — его есть чем снять руками, а отказ приёма называет числа.
 *
 * (Здесь стояло «виден плашкой „off the card“». Плашки больше нет: владелец снял её требованием
 * S-6 — «это буквально то, что идёт в промт, это не флеты, они не должны быть в карточке», — и
 * вместе с надписью ушёл её тихий замок на записке. Довод пережил свою причину; сам факт
 * «носитель роли обязан быть на экране» остался верным и потому переписан, а не удалён.)
 *
 * ─────────────────────────────────────────────────────────────────────────────────────────────
 * T-15 (круг 4): «в INPUT — REFERENCES не должны уходить все флеты если мы их явно туда сами не
 * добавим». ЭТОТ ХУК И БЫЛ ГЛАВНЫМ НОСИТЕЛЕМ ТОЙ ЖАЛОБЫ, и вот почему.
 *
 * Хук зовут ДВА экрана: блок референсов (`openForMedia` — человек режет СВОЙ референс, кадры и
 * должны стать референсами) и ВЕРСТАК, `bench.tsx` → `openForPicture` — человек режет ПЛИТУ
 * ФЛЭТА, чтобы разложить виды по слотам. До этой правки `handleCrops` не различал вызывающих и
 * заводил строки входа ОБОИМ. То есть каждый разрез флэта на верстаке молча набивал INPUT —
 * REFERENCES теми самыми флэтами — ровно то, на что владелец и пожаловался.
 *
 * Поэтому «класть ли во вход» стало ЯВНЫМ утверждением вызывающего, `addToInput`, и по умолчанию
 * оно ОТРИЦАТЕЛЬНОЕ: экран, который ничего не сказал, во вход не кладёт. Умолчание выбрано так
 * намеренно — забытый проп даёт ТИШИНУ, а не тихое пополнение промпта.
 *
 * ВТОРАЯ ПОЛОВИНА ЖИЛА НА СЕРВЕРЕ, И ТЕПЕРЬ ОНА ТАМ ЖЕ И РЕШЕНА. `SplitPicture` писал
 * `design_reference(role = view_key)` КАЖДОМУ кадру с видом, не спрашивая, с какого экрана пришёл
 * разрез (решение круга 1, R-11, которое T-15 отменяет). Роль реально едет в промпт — его сервер
 * собирает из `design_reference`, — так что это была не лишняя строка на экране, а флэт,
 * скормленный модели молча.
 *
 * КЛИЕНТ СНИМАЛ ЭТИ РОЛИ СЛЕДОМ, И ЭТО БЫЛО НЕИЗЛЕЧИМО. Очистка роли — голый DELETE по
 * (карточка, медиа) без сверки с ожидаемым значением. Кропов несколько, снятие идёт по одному, и
 * пока очередь доходит до третьего, человек в соседней вкладке успевает назначить ему роль
 * `detail` и записку «double topstitch»: следующий `role: ''` уносит обе — и роль, и слова,
 * которых нет больше нигде. Сверка перед каждым снятием сужала окно до одного круга запроса, но
 * закрыть его не могла: человек, поставивший ТУ ЖЕ роль без записки, от сервера неотличим.
 *
 * ПОЭТОМУ ВОПРОС ЗАДАЁТСЯ ДО ЗАПИСИ. `SplitDesignPictureRequest.for_input` едет вместе с кадрами
 * (`split-modal.tsx` → `forInput`), и роли, которых никто не просил, не появляются вовсе. Снимать
 * нечего, перечитывать полосу перед каждым кадром не нужно, гонки нет.
 * ───────────────────────────────────────────────────────────────────────────────────────────── */
export function useSplitToInput({
  techCardId,
  band,
  /**
   * ЗАВОДИТ ЛИ ЭТОТ РАЗРЕЗ СТРОКИ ВХОДА. Утверждение вызывающего, а не догадка по данным: с
   * картинки полосы нельзя прочесть, каким экраном её открыли. По умолчанию `false` — см. шапку.
   */
  addToInput = false,
  /**
   * Свежепринятые медиа кропов — вызывающему, который держит СВОЮ карту разрешения media_id→файл.
   * Кропы только что родились на сервере, в библиотечной карте их ещё нет, и без этого колбэка
   * блок референсов рисовал бы «media #N not resolved» на строке, которую сам же завёл.
   */
  onAccepted,
  /**
   * ═══ КРОП ЗАМЕЩАЕТ, А НЕ ДОПИСЫВАЕТ (J-8) ═══════════════════════════════════════════════════
   *
   * Владелец: «в INPUT — REFERENCES должна быть возможность кропнуть картинку в тамбнейле».
   * «Кропнуть картинку» — это ОДНА картинка до и ОДНА после, на том же месте; разрез, который
   * дописывает кроп в конец списка и оставляет исходник рядом, — другой жест (он и так есть, это
   * `split`).
   *
   * ПОЭТОМУ ЗАМЕЩЕНИЕ ДЕЛАЕТ ВЫЗЫВАЮЩИЙ, А НЕ ЭТОТ ХУК. Строка входа — это `moodboardMedia`
   * КАРТОЧКИ плюс роль и записка в `design_reference`, и обе половины принадлежат блоку
   * референсов: у хука нет ни номера строки, ни её роли, ни её записки. Хук отдаёт факт («вот
   * кроп, вот из чьего медиа он вырезан») и не решает за экран, что с ним делать.
   */
  onCropped,
}: {
  techCardId: number;
  band: GetDesignBandResponse;
  addToInput?: boolean;
  onAccepted?: (media: common_MediaFull[]) => void;
  onCropped?: (crop: common_DesignPicture, sourceMediaId: number) => void;
}) {
  const { getValues, setValue } = useFormContext<TechCardFormData>();
  const { registerUpload } = useDesignWrites(techCardId);
  const { showMessage } = useSnackBarStore();

  const [target, setTarget] = useState<{
    picture: common_DesignPicture;
    handle?: string;
    /** `crop` — один кадр, без вида, замещающий исходную строку входа (J-8). */
    mode: 'split' | 'crop';
    /** Медиа, ИЗ КОТОРОГО режут. У кропа это адрес строки, которую предстоит заместить. */
    sourceMediaId: number;
    /** Цена жеста словами вызывающего — рисуется в окне ДО реза. */
    note?: ReactNode;
  } | null>(null);
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
    setTarget({ picture, handle, mode: 'split', sourceMediaId: picture.media?.id ?? 0 });
  }

  /** Дверь для референсов: у входа только `media_id`, картинку полосы сначала надо получить. */
  function openForMedia(
    full: common_MediaFull,
    handle?: string,
    opts?: { mode?: 'split' | 'crop'; note?: ReactNode },
  ) {
    const mediaId = full.id;
    if (mediaId == null) return;
    const mode = opts?.mode ?? 'split';
    const note = opts?.note;
    const existing = findBandPicture(mediaId) ?? registered.current.get(mediaId)?.picture;
    if (existing) {
      setTarget({ picture: existing, handle, mode, sourceMediaId: mediaId, note });
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
      // `kind: ''` читается сервером как flat, а у флэта колорвея нет по существу (L-4) — ноль
      // здесь единственное принимаемое значение. Колорвей самих КАДРОВ разреза клиент не заявляет
      // вовсе: `SplitPicture` наследует его от родителя на сервере, и второе мнение о нём отсюда
      // было бы догадкой о картинке, которую мы ещё не видели.
      { clientRequestId: keep.requestId, items: [uploadItem({ mediaId })] },
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
          setTarget({ picture, handle, mode, sourceMediaId: mediaId, note });
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
    // Кадры, которым сервер поставил роль промпта, — РОВНО те, что несут вид: условие серверной
    // транзакции (`IsDesignGhostView`) и это членство в словаре — одно и то же утверждение, и
    // считать их по-другому значило бы обещать снятие ролей, которых не ставили.
    const framed = withMedia.filter((crop) =>
      (DESIGN_VIEW_KEYS as readonly string[]).includes(normaliseViewKey(crop.ghostView)),
    );

    if (!addToInput) {
      saySlotsOnly(withMedia.length);
      return;
    }

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
    // поэтому блок референсов покажет его строкой, и его есть чем снять руками. Плашки
    // «off the card» здесь больше нет — см. шапку файла.
    if (result.refusal) showMessage(result.refusal, 'error');
    if (!result.accepted.length) return;

    // Запись по КОРНЮ массива — как везде в этой паре блоков: два экземпляра поля-массива на одно
    // имя не синхронизируются, а мудборд смонтирован рядом и правит вторую половину того же списка.
    setValue('moodboardMedia', result.next as TechCardFormData['moodboardMedia'], {
      shouldDirty: true,
    });
    onAccepted?.(result.accepted);

    // Счёт для итоговой строки — по кадрам, несущим вид: ровно то условие, по которому сервер
    // ставил роль, и потому итог не обещает больше, чем покажет перечитанная полоса. Ключ вне
    // словаря (сервер из будущего) в счёт не входит.
    const acceptedIds = new Set(result.accepted.map((m) => m.id));
    const marked = framed.filter((crop) => acceptedIds.has(crop.media?.id as number)).length;
    showMessage(
      `${result.accepted.length} picture${result.accepted.length === 1 ? '' : 's'} added to the input — ${marked} marked with ${marked === 1 ? 'its view' : 'their views'}`,
      'success',
    );
  }

  /**
   * РАЗРЕЗ НЕ ДЛЯ ВХОДА: кадры остаются картинками полосы, а роли промпта, поставленные сервером
   * в транзакции разреза, снимаются здесь же (T-15, см. шапку файла).
   *
   * ПОСЛЕДОВАТЕЛЬНО, А НЕ ЗАЛПОМ — по той же причине, что и снос входа в блоке референсов: залп
   * делает порядок отказов случайным, а «что осталось в промпте» должно совпадать с тем, что
   * человек увидит на экране, детерминированно. Слова каждого отказа уже сказал шов записи; эта
   * строка — ИТОГ, по которому видно, чем снятие кончилось для каждого кадра.
   *
   * И КАЖДОЕ СНЯТИЕ ПРОВЕРЯЕТСЯ ОТДЕЛЬНО, СВЕЖИМ ЧТЕНИЕМ. Чтение стоит запроса и стоит его
   * осознанно: кадров единицы, а цена ошибки — стёртые слова человека, которых нет нигде больше.
   * Одно чтение на весь цикл оставило бы окно длиной во весь цикл; чтение перед каждой записью
   * сужает его до одного круга запроса (шире клиенту не сузить, см. шапку файла).
   */
  /**
   * КОМПЕНСАЦИИ РОЛЕЙ БОЛЬШЕ НЕТ, И ЭТО ПОЧИНКА, А НЕ УПРОЩЕНИЕ.
   *
   * Здесь стоял `takeRolesBack`: разрез с верстака не хотел пополнять промпт, но роли кадрам
   * ставил СЕРВЕР в транзакции разреза, и клиент снимал их следом. Снять чужую запись без гонки
   * с человеком было нечем — очистка роли это голый DELETE по (карточка, медиа) без сверки с
   * ожидаемым значением, а между записью и удалением человек в соседней вкладке успевает
   * поставить свою роль и записку, которые удаление уничтожит. Сверка перед каждым удалением
   * сужала окно, но закрыть его не могла.
   *
   * Теперь вопрос задан ДО записи: `SplitDesignPictureRequest.for_input` говорит серверу, для
   * промпта ли этот разрез, и роли, которых никто не просил, просто не появляются. Снимать
   * нечего, читать полосу перед каждым кадром не нужно, гонки нет.
   */
  function saySlotsOnly(cut: number) {
    const views = `${cut} view${cut === 1 ? '' : 's'}`;
    showMessage(`${views} cut — mark them into slots from the band`, 'success');
  }


  /**
   * КРОП — РОВНО ОДНА КАРТИНКА НА ВЫХОДЕ. Окно кропа отпускает только один кадр (`ready` там —
   * `frames.length === 1`), поэтому список из двух и больше здесь означал бы, что сервер сделал
   * не то, о чём его просили; молча взять первую значило бы скрыть это. Пустой список — то же
   * самое, только вслух: строку замещать нечем.
   */
  function handleCrop(pictures: common_DesignPicture[], sourceMediaId: number) {
    const withMedia = pictures.filter((p) => p.media?.id != null);
    if (withMedia.length !== 1) {
      showMessage(
        withMedia.length
          ? `the crop came back as ${withMedia.length} pictures — the reference is left as it was`
          : 'the crop was filed but no picture came back — the reference is left as it was',
        'error',
      );
      return;
    }
    onCropped?.(withMedia[0], sourceMediaId);
  }

  const modal = target ? (
    <SplitModal
      techCardId={techCardId}
      picture={target.picture}
      handle={target.handle}
      mode={target.mode}
      note={target.note}
      open
      onOpenChange={(open) => !open && setTarget(null)}
      forInput={addToInput}
      onSplit={
        target.mode === 'crop'
          ? (pictures) => handleCrop(pictures, target.sourceMediaId)
          : handleCrops
      }
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
/* `SplitCornerButton` СНЯТ. Он был угловым органом ДО общего примитива, и его последний
   потребитель — плита верстака — переехал на `PictureTile`, где угол рисуется по закону, а не
   по месту вызова. Держать экспорт «на всякий случай» значило бы оставить второй способ рисовать
   тот же орган, то есть ровно то, на что владелец и жаловался. */
