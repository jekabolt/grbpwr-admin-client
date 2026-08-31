import type {
  GetDesignBandResponse,
  common_DesignRun,
  common_MediaFull,
} from 'api/proto-http/admin';
import { useSnackBarStore } from 'lib/stores/store';
import { useEffect, useLayoutEffect, useRef, useState, useSyncExternalStore } from 'react';
import { useFormContext } from 'react-hook-form';
import { ConfirmationModal } from 'ui/components/confirmation-modal';
import Text from 'ui/components/text';

import type { TechCardFormData } from '../schema';
import { runHandle } from './handles';
import {
  INPUT_MAX,
  REFERENCE_KIND,
  appendBoardPictures,
  isInputRow,
  type BoardItem,
} from './mood-board';
import { useDesignWrites } from './use-design-band';
import { DESIGN_VIEW_KEYS, normaliseViewKey } from './views';

/**
 * RECALL — ЭТО ЖЕСТ «ВОЗЬМИ ЭТО СЕБЕ», А НЕ ЭКРАН «ПОСМОТРИ, ЧТО БЫЛО».
 *
 * И РАЗ ЭТО «ВОЗЬМИ», ТО ЭТО ЗАПИСЬ, И СКАЗАТЬ ЭТО НАДО ПЕРВЫМ ДЕЛОМ. Нажатие заводит строки
 * референсов в форме карточки (`shouldDirty`), может заполнить описание изделия и посылает
 * `SetDesignReferenceRole` за каждую заведённую строку. Ни одно из этого не откатывается само.
 * Всякая подпись, обещающая «показать, что было» или «ничего не меняет», описывает орган, которого
 * здесь нет с тех пор, как панель снимка снесли по T-10; такие подписи ещё стоят в чужих
 * `generation-history.tsx` и `run-panel.tsx` и подлежат правке их дорожками.
 *
 * Владелец, круг 4, пункт 10, дословно: «когда мы нажимаем на RECALL ▸ в GENERATION HISTORY у нас
 * в INPUT — REFERENCES появляются поля RECALLED — RUN 3; ASKED; WORDS; VIEWS; THE PICTURES IT WAS
 * GIVEN; THE PLATES IT WAS GIVEN и тд. это не нужно нужно только переиспользование картинок и
 * промптов которые были записаны и больше ничего. мы просто добавляем те картинки и тексты которые
 * были и дальше пользователь решает что делать а в разделе INPUT — REFERENCES нам вообще НИКОГДА
 * не нужны отображения THE PICTURES IT WAS GIVEN THE PLATES IT WAS GIVEN. так же на рекол в этом
 * разделе не должно быть кнопки RERUN THIS RUN ран мы можем сделать только из GENERATION — FLAT ->
 * GENERATE». И пунктом 11: «INPUT — REFERENCES статичны там только референсы и тексты промпта все
 * остальное там не нужно».
 *
 * ЧТО ЭТО ОТМЕНЯЕТ. Здесь стояла панель `RecalledRunPrompt`: заголовок «recalled — run N», строки
 * `asked` / `words` / `views · layout`, опись «the pictures it was given» с замороженной разметкой
 * на каждой картинке, опись «the plates it was given», опись доски и кнопка `rerun this run ▸` с
 * полем `ask` и остатком дневного бюджета. Всё это снято ЦЕЛИКОМ, а не спрятано за условием:
 * пункт 11 говорит не «показывай реже», а «раздел статичен».
 *
 * ЧТО ОСТАЛОСЬ ВМЕСТО ПАНЕЛИ. Тот же жест на строке истории теперь ПОПОЛНЯЕТ обычный вход:
 * картинки прогона встают обычными строками референсов, а его слова — в описание изделия. Дальше
 * это обычные референсы, которые человек правит как всякие другие; никакого «вспомненного
 * прогона» как отдельной сущности на экране больше нет.
 *
 * КАКИЕ КАРТИНКИ ПЕРЕНОСЯТСЯ — ВСЕ, КОТОРЫЕ ПРОГОН ПОЛУЧИЛ. Снимок держит вход двумя списками,
 * `refs` и `slots` (плиты верстака), и у render-прогона первый пуст закономерно, а весь вход лежит
 * во втором. Читать один `refs` значило бы отдавать невоспроизводимый вход и говорить «kept no
 * pictures» про запись с двумя плитами. Сборка ряда и дедупликация — в `keptPictures` ниже.
 *
 * ПОЧЕМУ РОЛИ ВСЁ-ТАКИ ЕДУТ ВМЕСТЕ С КАРТИНКАМИ. Референс без роли в промпт не идёт вовсе
 * («not in prompt»), поэтому «переиспользование картинок» без ролей означало бы добавить десяток
 * картинок, которые ничего не делают, и заставить человека заново собрать ту самую композицию,
 * ради переиспользования которой он и нажал. Роль ставится ТОЛЬКО картинке, которой этот жест
 * только что завёл строку и у которой роли на карточке ещё нет: чужую роль и чужую записку рекол
 * не трогает ни при каких данных.
 *
 * ПОЧЕМУ ЗА ОПИСАНИЕ СПРАШИВАЮТ. Описание изделия ОДНО на карточку, и подстановка чужих слов
 * поверх набранных — уничтожение текста, который нигде не хранится. Пустое поле заполняется молча
 * (терять нечего), непустое — только после вопроса, который эти слова показывает.
 *
 * ЧТО СОХРАНИЛОСЬ ИЗ ПРЕЖНЕГО МЕХАНИЗМА, И ПОЧЕМУ ИМЕННО ТАК. Модульный стор ниже: строка истории
 * и блок референсов — соседи под композитором, которым не владеет ни один из них, и жест,
 * пересекающий этот шов, обходится без провайдера и общего родителя. Выбор теперь ЖИВЁТ ОДИН
 * ТИК — приёмник снимает его сразу, как только взял, — поэтому чип в истории сам возвращается из
 * «recalled» в «recall ▸», и состояние «выбранный прогон» на экране не залипает.
 *
 * ИМЯ ЭКСПОРТА `RecalledRunPrompt` ОСТАВЛЕНО НАРОЧНО: его монтирует чужой `generation-history.tsx`
 * (ветка B), и переименование сломало бы сборку чужой ветки. Имя — след снесённого органа, а не
 * сам орган; снять его — дело оркестратора после слияния веток.
 */

/* ────────────────────────────── the selection ────────────────────────────── */

const recalled = new Map<number, common_DesignRun>();
/** How many display hosts are mounted for a card — see `useRecallHostMounted`. */
const hosts = new Map<number, number>();
const listeners = new Set<() => void>();

function emit(): void {
  for (const listener of [...listeners]) listener();
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/**
 * Select a past run, or clear the selection with `null`.
 *
 * THE ROW ITSELF IS STORED, not its id, and that is not laziness: `DesignInputSnapshot` is frozen
 * at launch and can never change afterwards, so the copy the history was already given is exactly
 * as true as anything `GetDesignRun` would hand back. Re-reading would buy a request and no fact.
 *
 * ЖЕСТ БЕЗ ПРИЁМНИКА НЕ КОПИТСЯ, И ЭТО ГЛАВНОЕ ПРАВИЛО ЭТОГО МОДУЛЯ. Приёмник живёт в блоке
 * INPUT — REFERENCES, а блок этот рисуется ТОЛЬКО на вкладке `flat — sheet` (`studio-tab.tsx`).
 * Раньше выбор ложился в карту независимо от того, есть ли кому его взять: с FABRIC RENDER чип
 * загорался «recalled», на экране не менялось ничего — а при следующем заходе на FLAT приёмник
 * монтировался и ВНЕЗАПНО забирал прогон, заведя строки и записав роли БЕЗ НОВОГО ЖЕСТА. Отложенное
 * невидимое действие — худший из возможных исходов: человек уже решил, что жест не сработал.
 *
 * ПОЧЕМУ ЭКСПОРТА `useRecallHostMounted` ДЛЯ ЭТОГО НЕ ХВАТАЛО. Он и не мог хватить: его читает
 * ВЫЗЫВАЮЩИЙ, чтобы решить, показывать ли свой чип, — то есть он сторожит РАЗМЕТКУ ОДНОГО ЭКРАНА.
 * Сторож на стороне вызывающего защищает ровно тех вызывающих, которые про него вспомнили: чипов
 * рекола на карточке два (строка истории и раскрытая панель прогона), третий появится с третьим
 * экраном, и забытый гейт снова даст отложенный жест — молча, потому что отказ жеста и есть
 * тишина. Поэтому вопрос «есть ли кому ответить» задаётся ЗДЕСЬ, где выбор записывается, и это
 * единственное место, которое новый экран не может обойти. Гейты у вызывающих остаются и полезны —
 * они убирают мёртвый орган с экрана; но правило держит эта дверь, а не они.
 *
 * Отказ произносится вслух и НИЧЕГО не сохраняет: чип не загорается, потому что взять прогон
 * некому, и экран не обещает того, чего не сделал.
 */
export function recallDesignRun(techCardId: number, run: common_DesignRun | null): void {
  if (!techCardId || techCardId <= 0) return;
  const next = run ?? null;
  // Снятие выбора разрешено всегда: убрать несделанное можно и без приёмника.
  if (next && (hosts.get(techCardId) ?? 0) === 0) {
    useSnackBarStore
      .getState()
      .showMessage(
        'recall adds the run’s pictures and words to input — references, and that block is only on the flat — sheet view. switch to flat and press recall there.',
        'error',
      );
    return;
  }
  const current = recalled.get(techCardId) ?? null;
  if (current === next) return;
  if (next) recalled.set(techCardId, next);
  else recalled.delete(techCardId);
  emit();
}

export function useRecalledRun(techCardId: number): common_DesignRun | null {
  return useSyncExternalStore(
    subscribe,
    () => recalled.get(techCardId) ?? null,
    () => null,
  );
}

/**
 * IS THE GESTURE ANSWERED SOMEWHERE ON THIS SCREEN?
 *
 * The intake below lives in INPUT — REFERENCES, and that block belongs to another organ. It
 * announces itself on mount, so the history can tell a live gesture from a dead one instead of
 * guessing by looking at the DOM.
 *
 * ЭТО ЖЕ ЧИСЛО — ДВЕРЬ ЖЕСТА: `recallDesignRun` отказывается записывать выбор, когда оно ноль.
 * Читатель этого хука решает вопрос разметки, а не вопрос жеста; про их разницу см. `recallDesignRun`.
 */
export function useRecallHostMounted(techCardId: number): boolean {
  return useSyncExternalStore(
    subscribe,
    () => (hosts.get(techCardId) ?? 0) > 0,
    () => false,
  );
}

function useRegisterRecallHost(techCardId: number, active: boolean): void {
  useLayoutEffect(() => {
    if (!active || !techCardId || techCardId <= 0) return;
    hosts.set(techCardId, (hosts.get(techCardId) ?? 0) + 1);
    emit();
    return () => {
      const left = (hosts.get(techCardId) ?? 1) - 1;
      if (left > 0) {
        hosts.set(techCardId, left);
      } else {
        hosts.delete(techCardId);
        // ВТОРАЯ ПОЛОВИНА ЗАПРЕТА НА ОТЛОЖЕННЫЙ ЖЕСТ. Дверь в `recallDesignRun` закрывает вход
        // выбору, которому некому ответить; эта строка выбрасывает выбор, ОТВЕТЧИК КОТОРОГО УШЁЛ
        // (человек нажал recall и тут же переключил вид, пока эффект приёма не отработал). Без неё
        // остаётся ровно тот же дефект в микроскопическом окне — а «невидимое отложенное действие»
        // не бывает допустимым по размеру окна.
        recalled.delete(techCardId);
      }
      emit();
    };
  }, [techCardId, active]);
}

/* ────────────────────────────── what a run can hand back ────────────────────────────── */

/** Одна картинка снимка, годная к переиспользованию, вместе с тем, чем она в снимке была. */
type Kept = {
  mediaId: number;
  media: common_MediaFull;
  /** Роль, которую снимок несёт для этой картинки. Пусто = роли в снимке не было. */
  role: string;
  note: string;
};

/**
 * ВСЁ, ЧТО ПРОГОН ПОЛУЧИЛ НА ВХОД, ОДНИМ РЯДОМ — И РЕФЕРЕНСЫ, И ПЛИТЫ.
 *
 * ЗАЧЕМ ЭТО ОТДЕЛЬНАЯ ФУНКЦИЯ, А НЕ СТРОКА `run.inputs?.refs ?? []`. Снимок хранит вход ДВУМЯ
 * списками: `refs` — референсы, которые человек собрал руками, и `slots` — ПЛИТЫ ВЕРСТАКА, которые
 * едут в прогоны рендера и починки. У render-прогона `refs` пуст ЗАКОНОМЕРНО, а весь его вход
 * лежит в `slots`. Рекол, читавший только `refs`, на таком прогоне переносил ровно текст и говорил
 * «kept no pictures» про снимок с двумя плитами — то есть врал про содержимое записи и отдавал
 * невоспроизводимый вход. «Переиспользование картинок» (T-10) — это ВСЕ картинки, которые реально
 * ушли модели, а из какого поля снимка они пришли — деталь хранения.
 *
 * ДЕДУПЛИКАЦИЯ ПО `media_id`, И РЕФЕРЕНС СТАРШЕ ПЛИТЫ. Одно и то же медиа имеет право стоять и
 * референсом, и в слоте; во входе карточки строка на `media_id` бывает одна (роль хранится по
 * `media_id`, двум строкам её нечем различить). Референс идёт первым, потому что несёт РУЧНЫЕ
 * роль и записку, а плита — только свой вид: при выборе между ними теряться должно меньшее.
 *
 * РОЛЬ ПЛИТЫ — ЕЁ `view_key`, и это не выдумка про картинку, а то же самое утверждение другими
 * словами: словарь ролей референса и словарь видов — один и тот же список (`front | back | side_l |
 * side_r | detail`). Ключ ВНЕ словаря (сервер новее этой сборки) роли не даёт: угадывать за него
 * значение нечем, и картинка приедет без роли, строкой, которую человек разметит сам.
 *
 * ПРОПАВШИЕ СЧИТАЮТСЯ ОДИН РАЗ НА МЕДИА, а не по числу упоминаний: «сколько картинок этого прогона
 * больше нет на карточке» — свойство картинки, а не полей снимка.
 */
function keptPictures(run: common_DesignRun): { alive: Kept[]; gone: number } {
  const alive: Kept[] = [];
  const seen = new Set<number>();
  let gone = 0;

  const take = (
    mediaId: number | undefined,
    media: common_MediaFull | undefined,
    deleted: boolean | undefined,
    role: string,
    note: string,
  ) => {
    // `media_id` в снимке заполнен ВСЕГДА, включая удалённое медиа, — им и опознаём картинку;
    // `media` серверу разрешено не присылать, и именно этим удалённая опознаётся.
    const id = mediaId ?? media?.id;
    if (id == null || seen.has(id)) return;
    seen.add(id);
    if (deleted || media?.id == null) {
      gone++;
      return;
    }
    // ЖИВАЯ СТРОКА ХРАНИТ `media.id`, А НЕ `media_id` СНИМКА, хотя это одна и та же строка: ниже по
    // течению всё ключуется по `media.id` (приём во вход берёт объекты медиа, роли ставятся по их
    // `id`), и один-единственный ключ здесь дешевле, чем допущение о равенстве двух полей.
    alive.push({ mediaId: media.id, media, role, note });
  };

  for (const ref of run.inputs?.refs ?? []) {
    take(ref.mediaId, ref.media, ref.deleted, (ref.role ?? '').trim(), (ref.note ?? '').trim());
  }
  for (const slot of run.inputs?.slots ?? []) {
    const view = normaliseViewKey(slot.viewKey);
    const role = (DESIGN_VIEW_KEYS as readonly string[]).includes(view) ? view : '';
    take(slot.mediaId, slot.media, slot.deleted, role, '');
  }
  return { alive, gone };
}

/* ────────────────────────────── the intake ────────────────────────────── */

/**
 * Приёмник рекола. Рисует ОДИН предмет — вопрос про описание изделия, и только когда описание уже
 * непустое; в покое не рисует ничего. Всё остальное, что он делает, — это две записи в форму и
 * сетевые роли для только что заведённых строк.
 */
export function RecalledRunPrompt({
  techCardId,
  band,
  disabled,
  host = true,
  onAccepted,
}: {
  techCardId: number;
  /**
   * The band, when the mounting screen has one. Only the ROLES already standing on the card are
   * read from it, and only so that a recall never overwrites one somebody set by hand.
   */
  band?: GetDesignBandResponse;
  disabled?: boolean;
  /**
   * `false` mounts an INERT copy: it neither announces itself as the home of the gesture nor takes
   * anything in. Recalling belongs to the input block, and filing pictures into a block that is not
   * on the screen would be a change nobody can see.
   *
   * ЕДИНСТВЕННЫЙ ЕГО ПОТРЕБИТЕЛЬ — подменная копия в истории — СНЯТ (её убрали вместе с гейтом
   * `recallHosted` на самом чипе). Проп оставлен ради одного утверждения, которое обязано остаться
   * верным: инертная копия НЕ считается приёмником. Не считаясь, она закрывает дверь в
   * `recallDesignRun`, и жест на экране, где взять прогон некому, отказывает вслух, а не копится.
   */
  host?: boolean;
  /**
   * Свежепринятые медиа — вызывающему, который держит СВОЮ карту разрешения media_id→файл. Медиа
   * снимка прогона в библиотечной карте может не быть, и без этого колбэка блок референсов
   * нарисовал бы «media #N not resolved» на строке, которую сам же и завёл.
   */
  onAccepted?: (media: common_MediaFull[]) => void;
}) {
  useRegisterRecallHost(techCardId, host);
  const run = useRecalledRun(techCardId);
  const form = useFormContext<TechCardFormData>();
  const { setReferenceRole } = useDesignWrites(techCardId);
  const { showMessage } = useSnackBarStore();

  /**
   * Вопрос про описание держится ПАРОЙ с прогоном: чужие слова не должны пережить свой прогон.
   *
   * И ВМЕСТЕ С НИМ — ИСХОД ПО КАРТИНКАМ, потому что модалка обязана его назвать. Раньше она
   * утверждала «the pictures from that run are already in the input» БЕЗУСЛОВНО: при полном входе
   * картинки отклонялись, а окно продолжало говорить, что они добавлены. Числа приезжают сюда с
   * приёма, а не пересчитываются при рисовании: к моменту вопроса форму уже мог поправить человек.
   */
  const [words, setWords] = useState<{
    runId: number;
    text: string;
    added: number;
    refused: number;
    already: number;
  } | null>(null);

  /**
   * Какой прогон этот приёмник уже взял. Сторож от повторного приёма: эффект переигрывается и на
   * втором проходе StrictMode, и на любом соседнем ререндере, а приём — это сетевые записи и
   * строки в форме. Сбрасывается, когда выбора нет, поэтому тот же прогон можно вспомнить снова.
   */
  const taken = useRef(0);

  useEffect(() => {
    if (!host) return;
    const runId = run?.id ?? 0;
    if (!run || !runId) {
      taken.current = 0;
      return;
    }
    if (taken.current === runId) return;
    taken.current = runId;

    // ВЫБОР СНИМАЕТСЯ СРАЗУ. Рекол — жест, а не состояние: то, что он принёс, дальше живёт
    // обычными референсами, и «выбранный прогон» не имеет права оставаться на экране как режим.
    recallDesignRun(techCardId, null);

    const handle = runHandle(runId) || 'that run';
    if (disabled) {
      showMessage(`this card is read-only — nothing was taken from ${handle}`, 'error');
      return;
    }

    // ВЕСЬ ВХОД ПРОГОНА — референсы И плиты, дедуплицированные по медиа (см. `keptPictures`).
    // Картинка, которой на карточке больше нет, приезжает без медиа или помеченной `deleted` —
    // взять её нечем, и число таких названо вслух, а не съедено.
    const { alive, gone } = keptPictures(run);
    const text = (run.inputs?.garmentNote ?? '').trim();

    if (!alive.length && !text) {
      showMessage(
        gone > 0
          ? `${handle} kept ${gone} picture${gone === 1 ? '' : 's'}, and ${gone === 1 ? 'it is' : 'they are'} gone from the card — there is nothing left to reuse`
          : `${handle} kept no pictures and no words to reuse`,
        'error',
      );
      return;
    }

    /* ── картинки ── */
    const live = (form.getValues('moodboardMedia') ?? []) as BoardItem[];
    const otherListIds = ((form.getValues('technicalMedia') ?? []) as BoardItem[]).map(
      (i) => i.mediaId,
    );
    // ТРИ ИСХОДА СЧИТАЮТСЯ ЗДЕСЬ, А НЕ ВЫВОДЯТСЯ ИЗ ОТВЕТА ПРИЁМА. `appendBoardPictures` возвращает
    // только принятое и слова отказа, и «уже было во входе» от «не поместилось» по ним не отличить
    // — а разница ровно та, ради которой человек читает итог: в первом случае делать нечего, во
    // втором надо освободить место. Дублирования правила нет: занятость считается тем же ящиком и
    // тем же вторым списком, которые приём получает аргументами.
    const occupied = new Set<number>([
      ...live.filter(isInputRow).map((i) => i.mediaId),
      ...otherListIds,
    ]);
    const already = alive.filter((k) => occupied.has(k.mediaId)).length;

    const result = appendBoardPictures({
      live,
      inScope: isInputRow,
      otherListIds,
      added: alive.map((k) => k.media),
      kind: REFERENCE_KIND,
      max: INPUT_MAX,
      scopeLabel: 'input',
    });
    const added = result.accepted.length;
    const refused = alive.length - already - added;
    // `result.refusal` СОЗНАТЕЛЬНО НЕ ПОКАЗЫВАЕТСЯ ОТДЕЛЬНОЙ ПЛАШКОЙ. У этого жеста один итог, и он
    // ниже: он называет и потолок, и числа, и прогон, из которого брали. Две красные плашки на одно
    // нажатие — не «подробнее», а два голоса об одном событии, и второй неизбежно короче первого.
    if (result.accepted.length) {
      // Запись по КОРНЮ массива, как и везде в этой паре блоков: два экземпляра поля-массива на
      // одно имя не синхронизируются, а мудборд правит вторую половину того же списка.
      form.setValue('moodboardMedia', result.next as TechCardFormData['moodboardMedia'], {
        shouldDirty: true,
      });
      onAccepted?.(result.accepted);
    }

    /* ── слова ── */
    const current = (form.getValues('garmentDescription') ?? '').trim();
    const asksAboutWords = !!text && text !== current && !!current;
    if (text && text !== current && !current) {
      form.setValue('garmentDescription', text, { shouldDirty: true });
    }
    if (asksAboutWords) setWords({ runId, text, added, refused, already });

    /* ── роли ──
       Только на СВОИХ новых строках и только там, где роли ещё нет: рекол пополняет вход, а не
       переписывает его. Последовательно, а не залпом — залп делает порядок отказов случайным, а
       «что доехало» должно совпадать с экраном детерминированно. */
    const roleOf = new Map<number, { role: string; note: string }>();
    for (const kept of alive) {
      if (kept.role) roleOf.set(kept.mediaId, { role: kept.role, note: kept.note });
    }
    const roledOnCard = new Set(
      (band?.references ?? [])
        .filter((r) => r.mediaId != null && (r.role ?? '').trim())
        .map((r) => r.mediaId as number),
    );
    const order = result.next.filter(isInputRow).map((i) => i.mediaId);
    const wanted = result.accepted
      .map((m) => m.id as number)
      .filter((id) => roleOf.has(id) && !roledOnCard.has(id));

    void (async () => {
      let roled = 0;
      let stayed = 0;
      for (const mediaId of wanted) {
        const it = roleOf.get(mediaId);
        if (!it) continue;
        try {
          // ORDINAL — ПОЗИЦИЯ ВО ВХОДЕ, как и у ручной правки роли: номер промпта нигде не
          // хранится, он выводится сканом, и второй источник одной величины разъехался бы с
          // первым на первом же снятии роли.
          await setReferenceRole.mutateAsync({
            mediaId,
            role: it.role,
            ordinal: Math.max(1, order.indexOf(mediaId) + 1),
            note: it.note,
          });
          roled++;
        } catch {
          stayed++;
        }
      }

      // ИТОГ НАЗЫВАЕТ ОБЕ ПОЛОВИНЫ ЧАСТИЧНОГО ИСХОДА — сколько прошло и сколько нет. «Отклонено»
      // и «уже было» разделены: одинаковое молчание про них — это и есть то, чем прежний итог
      // обманывал на полном входе.
      const said: string[] = [];
      said.push(
        added
          ? `${added} picture${added === 1 ? '' : 's'} added to the input from ${handle}`
          : refused
            ? `nothing was added from ${handle} — the input already holds ${INPUT_MAX} of ${INPUT_MAX}`
            : `nothing new came from ${handle} — its pictures are already in the input`,
      );
      if (added && refused)
        said.push(
          `${refused} did not fit — the input holds ${INPUT_MAX}; remove a picture and recall again`,
        );
      if (added && already)
        said.push(`${already} ${already === 1 ? 'was' : 'were'} already in the input`);
      if (roled) said.push(`${roled} kept ${roled === 1 ? 'its role' : 'their roles'}`);
      if (stayed)
        said.push(
          `${stayed} could not be given ${stayed === 1 ? 'its role' : 'their roles'} — set ${stayed === 1 ? 'it' : 'them'} by hand`,
        );
      if (gone) said.push(`${gone} gone from the card, skipped`);
      if (text && !current) said.push('the description was filled from the run');
      if (asksAboutWords) said.push('the description is kept — answer the question about it');
      showMessage(said.join(' · '), stayed || refused ? 'error' : 'success');
    })();
    // `form`, `showMessage` и `setReferenceRole` намеренно не в списке: приём взводится ВЫБОРОМ, и
    // перезапуск его от смены ссылки на мутацию был бы вторым приёмом того же прогона.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [run, host, disabled, techCardId, band?.references]);

  if (!host || !words) return null;

  const handle = runHandle(words.runId) || 'that run';

  /**
   * ЧТО НА САМОМ ДЕЛЕ СТАЛО С КАРТИНКАМИ — первой строкой окна.
   *
   * Здесь стояло безусловное «the pictures from that run are already in the input». На полном
   * входе это была прямая ложь: картинки отклонены, их там нет, а окно ими же и объясняло, почему
   * спрашивает только про текст. Ветки перечислены все, включая «прогон был без картинок»: у
   * вопроса про описание нет ни одной причины умалчивать про вторую половину жеста.
   */
  const pictures = words.added
    ? `${words.added} picture${words.added === 1 ? '' : 's'} from ${handle} ${words.added === 1 ? 'is' : 'are'} now in the input` +
      (words.refused ? `, ${words.refused} did not fit` : '') +
      (words.already ? `, ${words.already} ${words.already === 1 ? 'was' : 'were'} already there` : '')
    : words.refused
      ? `None of ${handle}’s pictures fit — the input already holds ${INPUT_MAX}, so none of them were added`
      : words.already
        ? `${handle}’s pictures were already in the input`
        : `${handle} brought no pictures`;

  return (
    <ConfirmationModal
      open
      onOpenChange={(open) => !open && setWords(null)}
      onConfirm={() => {
        form.setValue('garmentDescription', words.text, { shouldDirty: true });
        setWords(null);
      }}
      onCancel={() => setWords(null)}
      title='use the recalled description'
      confirmLabel='replace the description'
      cancelLabel='keep mine'
      width='sm'
    >
      <div className='space-y-2'>
        <Text size='control'>
          {pictures}. These are the words {handle} was given — putting them in replaces the
          description on this card, and the text you have now is not kept anywhere. Copy what you
          need first.
        </Text>
        <div className='max-h-40 overflow-auto border border-borderColor bg-bgColor p-2'>
          <Text size='control' component='p' className='whitespace-pre-wrap break-words'>
            {words.text}
          </Text>
        </div>
      </div>
    </ConfirmationModal>
  );
}
