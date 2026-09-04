import type {
  DesignBenchSlotRef,
  GetDesignBandResponse,
  common_DesignBenchSlot,
  common_DesignInputSlot,
  common_DesignPicture,
  common_DesignRun,
  common_MediaFull,
} from 'api/proto-http/admin';
import { useSnackBarStore } from 'lib/stores/store';
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
} from 'react';
import { useFormContext } from 'react-hook-form';
import { Chip } from 'ui/components/chip';
import { ConfirmationModal } from 'ui/components/confirmation-modal';
import Text from 'ui/components/text';

import type { TechCardFormData } from '../schema';
import { findSlot } from './bench-slot';
import { runHandle } from './handles';
import type { DesignKind } from './kinds-strip';
import {
  INPUT_MAX,
  REFERENCE_KIND,
  appendBoardPictures,
  isInputRow,
  type BoardItem,
} from './mood-board';
import { pictureIsModel } from './threed/media';
import { useDesignWrites } from './use-design-band';
import { isPictureHidden } from './visibility';
import { isSilhouetteView, normaliseViewKey, viewLabel } from './views';

/**
 * RECALL — ЖЕСТ «СОБЕРИ ЭТОТ ПРОГОН ЗАНОВО», И ОН РАЗРУШИТЕЛЕН, ПОЭТОМУ СПРАШИВАЕТ.
 *
 * Круг 5, пункт 12, дословно: «рекол флет шита должен быть через модалку вы уверенны? должен
 * чистить все картинки в промпте на флет и подписи и разметки к ему + если мы нажимаем на рекол из
 * генерации допустим фабрик рендера оно должно переключатся на фабрик рендер а не пихать их во
 * флеты так же и для 3д». Пунктом 13: «рекол сейчас работает неправильно он должен добавлять в
 * промпт референс картинки а не уже сгенеренные но так же должна быть кнопка и кидать сгенеренные».
 *
 * ТРИ ЗАЯВЛЕНИЯ, И КАЖДОЕ ОТМЕНЯЕТ ЧАСТЬ ПРЕЖНЕГО МЕХАНИЗМА.
 *
 * 1. ВОПРОС ПЕРЕД ВСТАВКОЙ. Круг 4 (T-10) сделал рекол жестом без подтверждения — и был прав для
 *    ТОГДАШНЕГО рекола, который ПОПОЛНЯЛ вход. Этот больше не пополняет: он ЗАМЕЩАЕТ промпт, то
 *    есть уносит картинки, роли, записки и указания, набранные руками. Правило продукта («guard the
 *    irreversible») требует вопроса, а вопрос обязан назвать ЧИСЛА, а не спросить «вы уверены?».
 *    Всё, что T-10 требовал СНЯТЬ, снятым и остаётся: ни панели «RECALLED — RUN N», ни описи «THE
 *    PICTURES IT WAS GIVEN», ни кнопки RERUN. Вопрос — не панель снимка: он живёт ровно один жест.
 *
 * 2. РЕФЕРЕНСЫ, А НЕ РЕЗУЛЬТАТ (V-13). Прежний сбор входа читал `inputs.refs` И `inputs.slots` одним
 *    рядом, и довод был честный: у render-прогона `refs` пуст, а весь вход лежит в плитах. Цена
 *    этого довода вскрылась только теперь: ПЛИТА ВЕРСТАКА — ЭТО, КАК ПРАВИЛО, СГЕНЕРЁННЫЙ ФЛЭТ, и
 *    рекол исправно клал в промпт результат прошлой машины вместо референсов, с которых всё
 *    началось. Поэтому дверей стало ДВЕ и они названы разными словами: `recall ▸` берёт то, что
 *    прогону ДАВАЛИ, `+ results ▸` — то, что он ВЕРНУЛ. Ни одна не притворяется другой.
 *
 * 3. ВХОД ЕДЕТ ТУДА, ГДЕ ОН ЖИВЁТ (V-12в). У прогона есть род, и у рода — свой экран: флэт читает
 *    INPUT — REFERENCES, фабрик-рендер читает INPUT — FLATS OF THIS CARD (слоты верстака), 3D читает
 *    свежайший рендер каждого вида. Рекол теперь ПЕРЕКЛЮЧАЕТ студию на род прогона и отдаёт вход
 *    приёмнику ТОГО экрана. Плиты render-прогона больше не приезжают строками референсов на флэт —
 *    это и была жалоба.
 *
 * ЧТО ДЕРЖИТ ПРАВИЛО «НЕТ ОТЛОЖЕННОМУ НЕВИДИМОМУ ЖЕСТУ». Оно то же, что и было, и по той же причине:
 * выбор, которому некому ответить, не записывается вовсе. Только «некому» считается теперь ПО РОДУ —
 * у каждого рода свой приёмник, — а переключатель вида (крючок `useStudioKindSwitch`) сам приводит
 * нужный приёмник на экран. Нет ни крючка, ни приёмника — жест отказывает ВСЛУХ и не копится.
 */

/* ────────────────────────────── the selection ────────────────────────────── */

/**
 * ДВЕ ДВЕРИ ОДНОГО ПРОГОНА (V-13), и они не варианты одной: `input` — то, что прогону дали,
 * `results` — то, что он отдал. Разные картинки, разные последствия, разные слова на чипе.
 */
export type RecallMode = 'input' | 'results';

type Selection = {
  run: common_DesignRun;
  mode: RecallMode;
  /** Экран, который обязан этот выбор принять. Вычислен один раз, при взводе. */
  kind: DesignKind;
};

const recalled = new Map<number, Selection>();
/** Сколько приёмников каждого рода смонтировано на карточку — см. `useRecallAnswerable`. */
const hosts = new Map<number, Map<DesignKind, number>>();
/** Переключатель вида студии, если композитор его завёл — см. `useStudioKindSwitch`. */
const switches = new Map<number, { kind: DesignKind; go: (kind: DesignKind) => void }>();
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

function hostCount(techCardId: number, kind: DesignKind): number {
  return hosts.get(techCardId)?.get(kind) ?? 0;
}

/**
 * КАКОЙ ЭКРАН ОБЯЗАН ОТВЕТИТЬ НА ЭТОТ ЖЕСТ.
 *
 * Род прогона — не украшение строки истории, а адрес его входа: render читает слоты верстака, 3D
 * читает рендеры, флэт читает референсы. `vector` и `draft_idea` сюда не попадают — обе двери им не
 * предлагаются (см. `RecallDoors`), а не обрабатываются здесь молчаливым `else`.
 *
 * У ДВЕРИ РЕЗУЛЬТАТА АДРЕС ОДИН — ФЛЭТ, каким бы ни был род прогона. «Кинуть сгенеренные» значит
 * «сделать их референсами следующего промпта», а промпт — это INPUT — REFERENCES; ни у рендера, ни у
 * 3D места для картинки-референса нет вовсе.
 */
export function recallTargetKind(run: common_DesignRun, mode: RecallMode): DesignKind {
  if (mode === 'results') return 'flat';
  const kind = (run.kind ?? '').trim().toLowerCase();
  if (kind === 'render') return 'render';
  if (kind === 'threed') return 'threed';
  return 'flat';
}

/**
 * Взвести выбор — ПОСЛЕ вопроса, никогда до него. Единственный вызывающий с непустым прогоном —
 * `RecallDoors` ниже, из `onConfirm` модалки; приёмники зовут его с `null`, снимая свой же выбор.
 *
 * ПОРЯДОК ВНУТРИ ВАЖЕН: сначала переключение вида, потом запись выбора. Переключение размонтирует
 * приёмник прежнего рода, а размонтирование выбрасывает выбор ЭТОГО рода (см. `useRegisterRecallHost`);
 * взведи мы раньше — жест сам бы себя и стёр на переходе flat → render.
 */
export function recallDesignRun(
  techCardId: number,
  run: common_DesignRun | null,
  mode: RecallMode = 'input',
): void {
  if (!techCardId || techCardId <= 0) return;
  // Снятие выбора разрешено всегда: убрать несделанное можно и без приёмника.
  if (!run) {
    if (recalled.delete(techCardId)) emit();
    return;
  }

  const kind = recallTargetKind(run, mode);
  const sw = switches.get(techCardId);
  if (!sw && hostCount(techCardId, kind) === 0) {
    // ОТКАЗ ПРОИЗНОСИТСЯ ВСЛУХ И НИЧЕГО НЕ СОХРАНЯЕТ. Так выглядит эта дверь на сборке, где
    // композитор ещё не завёл переключатель: жест не копится до случайного монтажа приёмника, а
    // называет экран, на который человек может уйти сам.
    useSnackBarStore
      .getState()
      .showMessage(
        `recall hands this run to the ${kindLabel(kind)} screen, and this build cannot switch views by itself — open ${kindLabel(kind)} on the strip above and press recall there.`,
        'error',
      );
    return;
  }

  if (sw && sw.kind !== kind) sw.go(kind);
  recalled.set(techCardId, { run, mode, kind });
  emit();
}

export function useRecalledRun(techCardId: number): Selection | null {
  return useSyncExternalStore(
    subscribe,
    () => recalled.get(techCardId) ?? null,
    () => null,
  );
}

/**
 * ЕСТЬ ЛИ КОМУ ОТВЕТИТЬ НА ЖЕСТ — вопрос РАЗМЕТКИ, который решает вызывающий, рисовать ли чип.
 * Вопрос ЖЕСТА решает `recallDesignRun`, и решает его там же, где выбор записывается: сторож на
 * стороне вызывающего защищает ровно тех вызывающих, которые про него вспомнили.
 *
 * Ответ «да» даёт ЛИБО смонтированный приёмник нужного рода, ЛИБО переключатель вида: он приведёт
 * приёмник на экран сам, и это не обещание на будущее, а синхронное следствие того же нажатия.
 */
export function useRecallAnswerable(techCardId: number): (kind: DesignKind) => boolean {
  const snapshot = useSyncExternalStore(
    subscribe,
    () => `${switches.has(techCardId)}|${[...(hosts.get(techCardId) ?? [])].join(',')}`,
    () => 'false|',
  );
  return useCallback(
    (kind: DesignKind) => switches.has(techCardId) || hostCount(techCardId, kind) > 0,
    // Пересобирается ровно тогда, когда меняется состав приёмников: снимок в зависимостях —
    // единственное, что связывает чистую функцию с внешним стором.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [techCardId, snapshot],
  );
}

/**
 * МОЖЕТ ЛИ ЭТА СБОРКА СДЕРЖАТЬ ОБЕЩАНИЕ «СТУДИЯ ПЕРЕКЛЮЧИТСЯ».
 *
 * Вопрос существует ровно потому, что переключение — не свойство этого модуля, а КРЮЧОК, который
 * заводит композитор. Пока его нет, дверь всё равно работает (приёмник верстака смонтирован
 * историей), но окно не имеет права обещать переход: обещание, которого не будет, хуже отсутствия
 * обещания — человек уходит искать плиты не на том экране.
 */
export function useStudioSwitchAvailable(techCardId: number): boolean {
  return useSyncExternalStore(
    subscribe,
    () => switches.has(techCardId),
    () => false,
  );
}

/**
 * КРЮЧОК КОМПОЗИТОРА — ЕДИНСТВЕННОЕ, ЧТО ЭТОТ МОДУЛЬ ПРОСИТ У `studio-tab.tsx`.
 *
 * Вид студии (`const [kind, setKind]`) живёт у композитора, и это правильно: полоса представлений
 * его показывает, экраны читают, третьего владельца быть не должно. Но рекол обязан этот вид
 * ПЕРЕКЛЮЧАТЬ (V-12в), а история прогонов стоит от композитора через два дерева и монтируется на
 * всех трёх вкладках. Тащить `setKind` пропом через `GenerationStudio` → `GenerationHistory` →
 * `RunRow` → чип значило бы прошить четыре чужих сигнатуры ради одного жеста.
 *
 * Поэтому композитор ОБЪЯВЛЯЕТ свой вид здесь одной строкой:
 *
 *     useStudioKindSwitch(techCardId ?? 0, kind, setKind);
 *
 * Хранится не копия состояния, а ссылка на владельца: `kind` читается, чтобы не переключать туда,
 * где уже стоим, а `go` — это его же `setKind`. Второго источника правды не заводится.
 */
/**
 * ПЕРЕКЛЮЧАТЕЛЬ ВИДА ДЛЯ ОБРАБОТЧИКА СОБЫТИЯ, а не для рендера — и намеренно БЕЗ идентификатора
 * карточки.
 *
 * Зовущий — дверь «edit the description ▸» из панели WHAT THE MODEL GETS, а панель приходит из
 * `render/`, где идентификатора карточки в пропах нет; добавить его туда значило бы править
 * `render-studio.tsx` и `threed-studio.tsx`, то есть композиторов, которых эта правка не касается.
 *
 * ПОЧЕМУ «РОВНО ОДИН» — ЭТО НЕ ДОПУЩЕНИЕ, А ПРОВЕРКА. В админке одновременно открыта одна карточка,
 * поэтому запись в реестре ровно одна. Если их вдруг две — переход по роутеру, не успевший
 * размонтировать прежнюю, — мы НЕ угадываем, какая из них та: возвращаем `null`, и дверь честно
 * говорит, где поле, вместо того чтобы увести человека на чужую карточку.
 */
export function studioSwitchSolo(): { kind: DesignKind; go: (kind: DesignKind) => void } | null {
  if (switches.size !== 1) return null;
  for (const only of switches.values()) return only;
  return null;
}

export function useStudioKindSwitch(
  techCardId: number,
  kind: DesignKind,
  go: (kind: DesignKind) => void,
): void {
  const goRef = useRef(go);
  goRef.current = go;
  useLayoutEffect(() => {
    if (!techCardId || techCardId <= 0) return;
    switches.set(techCardId, { kind, go: (next) => goRef.current(next) });
    emit();
    return () => {
      // Снимать только СВОЮ запись: две карточки подряд без размонтирования (переход по клиентскому
      // роутеру) дают эффект уборки старой карточки ПОСЛЕ записи новой.
      if (switches.get(techCardId)?.kind === kind) switches.delete(techCardId);
      emit();
    };
  }, [techCardId, kind]);
}

/** Приёмник объявляет себя домом жеста своего рода. */
function useRegisterRecallHost(techCardId: number, kind: DesignKind, active: boolean): void {
  useLayoutEffect(() => {
    if (!active || !techCardId || techCardId <= 0) return;
    const forCard = hosts.get(techCardId) ?? new Map<DesignKind, number>();
    forCard.set(kind, (forCard.get(kind) ?? 0) + 1);
    hosts.set(techCardId, forCard);
    emit();
    return () => {
      const map = hosts.get(techCardId);
      const left = (map?.get(kind) ?? 1) - 1;
      if (map && left > 0) {
        map.set(kind, left);
      } else {
        map?.delete(kind);
        if (map && map.size === 0) hosts.delete(techCardId);
        // ВТОРАЯ ПОЛОВИНА ЗАПРЕТА НА ОТЛОЖЕННЫЙ ЖЕСТ: выбор, ответчик которого ушёл, выбрасывается.
        // ТОЛЬКО СВОЕГО РОДА — иначе переключение вкладки, которым рекол сам же и приводит нужный
        // приёмник, уносило бы по дороге тот выбор, ради которого переключалось.
        if (recalled.get(techCardId)?.kind === kind) recalled.delete(techCardId);
      }
      emit();
    };
  }, [techCardId, kind, active]);
}

function kindLabel(kind: DesignKind): string {
  return kind === 'render' ? 'fabric render' : kind === 'threed' ? '3D' : 'flat';
}

/* ────────────────────────────── what a run can hand back ────────────────────────────── */

/** Одна картинка, годная к переиспользованию, вместе с тем, чем она была в снимке. */
type Kept = {
  mediaId: number;
  media: common_MediaFull;
  /** Роль снимка. Пусто = роли не было, и выдумывать её нечем. */
  role: string;
  note: string;
};

/**
 * РЕФЕРЕНСЫ ПРОГОНА — И ТОЛЬКО ОНИ (V-13).
 *
 * Здесь читался ещё и `inputs.slots`, «весь вход одним рядом». Довод был про render-прогон, у
 * которого `refs` пуст закономерно; цена — на КАЖДОМ прогоне, потому что плита верстака это почти
 * всегда сгенерённый флэт, и он приезжал в промпт как референс. Владелец назвал это прямо: «он
 * должен добавлять в промпт референс картинки а не уже сгенеренные». Плиты не потеряны — они едут
 * своей дорогой, в верстак того экрана, который их читает (`platePlan`).
 *
 * ПРОПАВШИЕ СЧИТАЮТСЯ, А НЕ ЗАМАЛЧИВАЮТСЯ: `media_id` в снимке заполнен всегда, включая удалённое
 * медиа, и именно отсутствие `media` опознаёт картинку, которой на карточке больше нет.
 */
function keptRefs(run: common_DesignRun): { alive: Kept[]; gone: number } {
  const alive: Kept[] = [];
  const seen = new Set<number>();
  let gone = 0;
  for (const ref of run.inputs?.refs ?? []) {
    const id = ref.mediaId ?? ref.media?.id;
    if (id == null || seen.has(id)) continue;
    seen.add(id);
    if (ref.deleted || ref.media?.id == null) {
      gone++;
      continue;
    }
    alive.push({
      // Живая строка ключуется по `media.id`: ниже по течению всё (приём во вход, роли) работает с
      // объектами медиа, и один ключ дешевле допущения о равенстве двух полей.
      mediaId: ref.media.id,
      media: ref.media,
      role: (ref.role ?? '').trim(),
      note: (ref.note ?? '').trim(),
    });
  }
  return { alive, gone };
}

/**
 * ЧТО ПРОГОН ВЕРНУЛ — вторая дверь (V-13). Роли не переносятся ни при каких данных: у результата
 * роли нет, `ghost_view` — гипотеза машины, а не утверждение человека, и превращать её в роль промпта
 * значит подписать догадку чужим именем. Спрятанная картинка не предлагается: `hidden_at` читают все
 * пикеры, и вход не имеет права быть исключением.
 */
function keptResults(run: common_DesignRun): { alive: Kept[]; gone: number } {
  const alive: Kept[] = [];
  const seen = new Set<number>();
  let gone = 0;
  for (const picture of run.pictures ?? []) {
    /**
     * ═══ ФАЙЛ МОДЕЛИ — НЕ КАРТИНКА ПРОМПТА (J-11) ══════════════════════════════════════════
     *
     * Владелец, дословно: «в GENERATION HISTORY если мы жмем + RESULTS ▸ модель не должна
     * добавлятся в промпт».
     *
     * ЗАМЕРЕНО ПО КОНТРАКТУ, А НЕ ПРЕДПОЛОЖЕНО. Прогон 3D заводит ДВЕ строки `design_picture` —
     * сам `.glb` и растровую миниатюру, — и обе приезжают с одним родом `threed`
     * (`internal/designgen/threedfal.go`: `Produces() = {model/gltf-binary, image/png}`, а
     * `publish` кладёт обе как обычные выходы). Тип файла на проводе не сказан нигде: у медиа нет
     * поля content-type, и у модели ВСЕ ТРИ адреса (`fullSize`/`compressed`/`thumbnail`)
     * указывают на один и тот же `.glb`. Значит цикл выше, берущий «всякую картинку с медиа»,
     * честно клал `.glb` в INPUT — REFERENCES: плитка подписывалась «3d model», а в промпт уезжал
     * файл, который маршрут картинок прочитать не может.
     *
     * Признак берётся у `pictureIsModel` — ЕДИНСТВЕННОГО места, где живёт правило «это модель»
     * (по расширению пути, см. `threed/media.ts`). Второй способ узнать модель разошёлся бы с
     * первым молча.
     *
     * ⚠ И ЭТО НЕ СЧИТАЕТСЯ ПОТЕРЕЙ (`gone`). `gone` — про картинку, которой БОЛЬШЕ НЕТ на
     * карточке, и вопрос перед дверью печатает это число словами «gone from the card, skipped».
     * Модель никуда не делась: она лежит в 3D MODELS OF THIS CARD, её можно открыть и скачать.
     * Её просто нельзя показать модели как картинку.
     */
    if (pictureIsModel(picture)) continue;
    const media = picture.media;
    const id = media?.id;
    // `media` и `media.id` проверяются ОБА, хотя одного хватило бы по данным: сузить тип нечем, а
    // необязательное поле медиа — ровно тот случай, когда «картинки больше нет» и надо считать.
    if (media == null || id == null) {
      gone++;
      continue;
    }
    // `hidden_at` читается ОБЩИМ сторожем, а не сравнением строки: нулевая метка времени приезжает
    // непустой строкой, и наивная проверка объявила бы спрятанной каждую картинку полосы.
    if (seen.has(id) || isPictureHidden(picture)) continue;
    seen.add(id);
    alive.push({ mediaId: id, media, role: '', note: '' });
  }
  return { alive, gone };
}

/* ────────────────────────────── the flat plan ────────────────────────────── */

type MoodCalloutRow = NonNullable<TechCardFormData['callouts']>[number];

/**
 * ЧТО ИМЕННО СЛУЧИТСЯ С ПРОМПТОМ — ОДНА ФУНКЦИЯ НА ВОПРОС И НА ИСПОЛНЕНИЕ.
 *
 * Модалка обязана назвать числа, а приём обязан ровно эти числа и сделать. Два независимых
 * подсчёта разошлись бы в первый же день (и разошлись бы молча — окно продолжало бы обещать то,
 * чего приём больше не делает), поэтому план считается ЗДЕСЬ и читается обоими.
 *
 * ЧИСТАЯ ФУНКЦИЯ: ни формы, ни сети. Вызывающий приносит снимок формы, она возвращает решение.
 */
function planFlat(input: {
  run: common_DesignRun;
  mode: RecallMode;
  rows: BoardItem[];
  otherListIds: number[];
  callouts: MoodCalloutRow[];
  /** Роли, стоящие на карточке сейчас: media_id → есть ли записка. */
  roled: Map<number, boolean>;
  description: string;
  /**
   * Медиа, чью разметку этот жест трогать НЕ ИМЕЕТ ПРАВА — плиты верстака.
   *
   * ⚠ ПОЛЕ `callouts` ОДНО НА ВСЮ КАРТОЧКУ, И ОНО НЕ ТОЛЬКО МУДБОРДНОЕ. Тем же массивом пишет
   * панель артефактов: указания на плитах ЛИСТА — это строки `callouts`, приколотые к `media_id`
   * плиты, а плита не стоит ни в `moodboardMedia`, ни в `technicalMedia`. Правило «оставить то, что
   * осталось в двух списках» стёрло бы их все до одного при первом же реколе — тихо, потому что
   * лист рисуется на другой вкладке. Поэтому чистка разметки — СПИСОК НА СНОС, а не список на
   * сохранение, и плиты в него не попадают ни при каких данных.
   *
   * `null` = ПЛИТЫ НЕИЗВЕСТНЫ (полосы у вызывающего нет), и тогда разметка не трогается вовсе.
   * Незнание — не повод стирать: несделанная уборка видна и повторима, стёртая разметка — нет.
   */
  pinned: ReadonlySet<number> | null;
}) {
  const { alive, gone } = input.mode === 'results' ? keptResults(input.run) : keptRefs(input.run);
  const inputRows = input.rows.filter(isInputRow);

  /**
   * ═══ ОБЕ ДВЕРИ ЧИСТЯТ ВХОД (J-4) ═══════════════════════════════════════════════════════════
   *
   * Владелец, дословно: «когда нажимаешь + RESULTS ▸ в GENERATION HISTORY оно должно чистить все
   * импуты в INPUT — REFERENCES и добавлять только то что является аутпутом».
   *
   * ЗДЕСЬ СТОЯЛ `input.mode === 'input'`, и довод был такой: `recall ▸` ВОСПРОИЗВОДИТ прогон, а
   * `+ results ▸` ничего не воспроизводит и потому только ДОБАВЛЯЕТ. Довод пережил свою причину.
   * Дверь результатов существует для одного жеста — «взять то, что вышло, и генерить дальше ИЗ
   * ЭТОГО», — и в нём предыдущий вход не участвует ни одной картинкой: он уже отработал, из него
   * и получились эти выходы. Дописывание в конец давало промпт-склейку из старого входа и нового
   * результата, где номера картинок ползли, потолок `INPUT_MAX` съедался прошлым заходом, а роли
   * прежних референсов молча продолжали ехать в модель.
   *
   * ЧТО ИМЕННО УХОДИТ, СЧИТАЕТСЯ НИЖЕ ОДНОЙ ФУНКЦИЕЙ НА ВОПРОС И НА ИСПОЛНЕНИЕ: строки входа, их
   * роли и записки (у них свой RPC, они уходят СЕЙЧАС), и указания тех картинок, что покидают
   * карточку целиком. Плиты верстака не трогаются ни при каких данных — их разметка принадлежит
   * листу, а не промпту (`pinned` ниже).
   *
   * ⚠ ОПИСАНИЕ ИЗДЕЛИЯ НЕ ЧИСТИТСЯ, И ЭТО ГРАНИЦА, А НЕ НЕДОДЕЛКА. «Импуты» владельца — картинки
   * входа; слова же были ВХОДОМ ЭТОГО САМОГО ПРОГОНА, из них эти выходы и получились, и следующий
   * прогон без них станет прогоном другой вещи. Дверь блока «clear the input» (`runClear`) чистит
   * и описание — но её жмут, чтобы начать с нуля, а эту, чтобы продолжить.
   */
  const clearing = true;
  const clearRows = clearing ? inputRows.map((i) => i.mediaId) : [];
  const clearRoles = clearRows.filter((id) => input.roled.has(id));

  /**
   * УКАЗАНИЯ УХОДЯТ ВМЕСТЕ СО СВОЕЙ КАРТИНКОЙ, НО ТОЛЬКО ЕСЛИ КАРТИНКА УХОДИТ С КАРТОЧКИ ВОВСЕ.
   * Одно и то же медиа имеет право стоять и на доске, и во входе — это ровно тот жест, ради
   * которого вход отделили от доски. Снять разметку с доски, потому что чистится ВХОД, значило бы
   * уничтожить работу, к рекол-у отношения не имеющую.
   */
  const staying = new Set<number>([
    ...input.rows.filter((i) => !isInputRow(i)).map((i) => i.mediaId),
    ...input.otherListIds,
  ]);
  const pinned = input.pinned;
  const losing = new Set(
    pinned == null ? [] : clearRows.filter((id) => !staying.has(id) && !pinned.has(id)),
  );
  const clearCallouts = input.callouts.filter((c) => losing.has(c?.mediaId ?? 0)).length;

  // Место считается по ОЧИЩЕННОМУ входу: у двери входа он пуст, у двери результата — нет.
  const kept = clearing ? 0 : inputRows.length;
  const room = Math.max(0, INPUT_MAX - kept);
  const occupied = new Set<number>([
    ...(clearing ? [] : inputRows.map((i) => i.mediaId)),
    ...input.otherListIds,
  ]);
  const fresh = alive.filter((k) => !occupied.has(k.mediaId));
  const already = alive.length - fresh.length;
  const add = fresh.slice(0, room);
  const refused = fresh.length - add.length;

  const words = input.mode === 'input' ? (input.run.inputs?.garmentNote ?? '').trim() : '';
  const description = input.description.trim();

  return {
    clearRows,
    clearRoles,
    /** Медиа, чья разметка уходит вместе с ними. Ровно этот набор снимает приём. */
    losing,
    clearCallouts,
    add,
    already,
    refused,
    gone,
    words,
    /** Текст, который слова прогона заменят. Пусто — заменять нечего, и вопрос об этом не стоит. */
    replaces: words && words !== description ? description : '',
    /** Жест, который ничего не сделает, называется так вслух, а не рисуется дверью. */
    empty: !add.length && !clearRows.length && !(words && words !== description),
  };
}

type FlatPlan = ReturnType<typeof planFlat>;

/** Медиа каждой плиты, стоящей сейчас в слоте верстака: их разметка принадлежит листу, не промпту. */
function platedMedia(band?: GetDesignBandResponse): Set<number> {
  const ids = new Set<number>();
  for (const slot of band?.bench ?? []) {
    const mediaId = slot.picture?.media?.id;
    if (mediaId != null) ids.add(mediaId);
  }
  return ids;
}

/* ────────────────────────────── the plate plan ────────────────────────────── */

type PlateMove = {
  ref: DesignBenchSlotRef;
  label: string;
  pictureId: number;
  slotRev: number;
  /** Слот уже держит эту картинку: ставить нечего, и в итоге это отдельное число. */
  same: boolean;
};

/** Каждая картинка полосы, которую МОЖНО поставить в слот, по её медиа. */
function pictureIdByMedia(band: GetDesignBandResponse): Map<number, number> {
  const m = new Map<number, number>();
  const take = (picture?: common_DesignPicture) => {
    const mediaId = picture?.media?.id;
    const id = picture?.id ?? 0;
    if (mediaId == null || id <= 0 || m.has(mediaId)) return;
    m.set(mediaId, id);
  };
  for (const run of band.runs ?? []) for (const p of run.pictures ?? []) take(p);
  for (const batch of band.batches ?? []) for (const p of batch.pictures ?? []) take(p);
  for (const slot of band.bench ?? []) take(slot.picture);
  return m;
}

/** Строка верстака нужного ВЕРСТАКА (ось `kind`) и нужного вида. Пусто = слот ещё не рождён.
 *  Правило «пустой род читается как flat» здесь больше не пишется в третий раз: адресует та же
 *  пара view × kind, что и всюду, — `findSlot` поверх словаря `bench-kinds` (L-5). */
function benchRow(
  band: GetDesignBandResponse,
  kind: string,
  view: string,
): common_DesignBenchSlot | null {
  // КОЛОРВЕЙ 0: рекол пишет ТОЛЬКО флэтовый верстак (все три вызова `platePlan` передают 'flat'),
  // а у него оси нет (L-4). Если этот орган когда-нибудь научат возвращать плиты в РЕНДЕРНЫЙ
  // верстак, колорвей обязан прийти сюда параметром — и тогда же прогон, чей колорвей удалён,
  // придётся решать отдельно: `run.colorwayId` у такого прогона читается нулём, то есть плиты
  // уехали бы в безколорвейный верстак молча.
  return findSlot(band, { viewKey: view, kind, colorwayId: 0 });
}

/**
 * ПЛИТЫ ПРОГОНА — В ВЕРСТАК ТОГО ЭКРАНА, КОТОРЫЙ ИХ ЧИТАЕТ (V-12в).
 *
 * Фабрик-рендер читает ФЛЭТ-верстак: «INPUT — FLATS OF THIS CARD» это те же слоты `kind: flat`,
 * увиденные со стороны рендера. Поэтому рекол render-прогона ставит его плиты обратно в эти слоты —
 * и ничего сверх того: слоты, которых прогон не касался, остаются как стоят. Владелец просил
 * очистить ПРОМПТ НА ФЛЭТ, а не обнулить верстак, и разница здесь не в осторожности, а в том, что
 * пустой слот — это не «как было», а «сломано»: рендер без стороны просто не запускается.
 *
 * ЧЕГО ЗДЕСЬ НЕТ И ПОЧЕМУ. `DesignInputSlot` несёт `media_id`, а `SetDesignBenchSlot` требует
 * `picture_id` — снимок хранит файл, а верстак картинку полосы. Перевод идёт по загруженной полосе,
 * и он МОЖЕТ НЕ НАЙТИСЬ: полоса отдаёт первую страницу истории. Ненайденное считается и называется
 * вслух, а не тонет в «готово».
 */
function platePlan(
  band: GetDesignBandResponse,
  run: common_DesignRun,
  benchKind: string,
): { moves: PlateMove[]; unresolved: number } {
  const byMedia = pictureIdByMedia(band);
  const moves: PlateMove[] = [];
  let unresolved = 0;
  const seen = new Set<string>();

  for (const slot of (run.inputs?.slots ?? []) as common_DesignInputSlot[]) {
    const mediaId = slot.mediaId ?? 0;
    // `media_id = 0` — это заказанная, но пустая деталь снимка (её просили НАРИСОВАТЬ), а не плита.
    if (mediaId <= 0) continue;
    const view = normaliseViewKey(slot.viewKey);
    const slotId = slot.slotId ?? 0;
    const key = slotId > 0 ? `s${slotId}` : `v${view}`;
    if (seen.has(key)) continue;
    seen.add(key);

    const pictureId = byMedia.get(mediaId) ?? 0;
    if (pictureId <= 0) {
      unresolved++;
      continue;
    }

    if (slotId > 0) {
      // Деталь адресуется своим id; `kind` при этом игнорируется контрактом — минтованный id уже
      // называет свой верстак.
      const row = (band.bench ?? []).find((r) => (r.id ?? 0) === slotId);
      if (!row) {
        unresolved++;
        continue;
      }
      moves.push({
        ref: { slotId, kind: undefined, colorwayId: 0 },
        label: (slot.detailName ?? '').trim() || (row.detailName ?? '').trim() || 'detail',
        pictureId,
        slotRev: row.slotRev ?? 0,
        same: (row.pictureId ?? 0) === pictureId,
      });
      continue;
    }

    if (!isSilhouetteView(view)) continue;
    const row = benchRow(band, benchKind, view);
    moves.push({
      // `kind` НАЗЫВАЕТСЯ ЯВНО: у верстака ТРИ оси, и render-front и flat-front — разные слоты,
      // оба адресуемые `view_key: front`. Пустое поле означало бы flat сегодня и что угодно завтра.
      // Колорвей 0 — по доводу у `benchRow` выше: рекол адресует флэтовый верстак, а у него оси
      // нет (L-4), и положительное значение здесь сервер отверг бы (`colorway_forbidden`).
      ref: { viewKey: view, kind: benchKind, colorwayId: 0 },
      label: viewLabel(view),
      pictureId,
      slotRev: row?.slotRev ?? 0,
      same: (row?.pictureId ?? 0) === pictureId,
    });
  }
  return { moves, unresolved };
}

/* ────────────────────────────── the doors ────────────────────────────── */

function count(n: number, one: string, many = `${one}s`): string {
  return `${n} ${n === 1 ? one : many}`;
}

/**
 * ОБЕ ДВЕРИ И ВОПРОС ПЕРЕД НИМИ — ОДНИМ ОРГАНОМ, потому что чипов рекола на карточке два (строка
 * истории и раскрытая панель прогона), а вопрос обязан быть у них общий. Разъехавшись, две модалки
 * назвали бы одному жесту разные последствия — и вторая неизбежно оказалась бы короче первой.
 */
export function RecallDoors({
  techCardId,
  band,
  run,
  disabled,
}: {
  techCardId: number;
  band: GetDesignBandResponse;
  run: common_DesignRun;
  disabled?: boolean;
}) {
  const form = useFormContext<TechCardFormData>();
  const answerable = useRecallAnswerable(techCardId);
  const canSwitch = useStudioSwitchAvailable(techCardId);
  const [asking, setAsking] = useState<RecallMode | null>(null);

  const runId = run.id ?? 0;
  const handle = runHandle(runId) || 'that run';
  const kind = (run.kind ?? '').trim().toLowerCase();
  /**
   * ВЕКТОРНЫЙ ПРОГОН ДВЕРЕЙ НЕ ИМЕЕТ — исключение самого владельца (T-16, «рекола для генерации свг
   * вектора не должно быть»): перерисовку начинают из редактора плиты, и её вход — эта плита.
   */
  const isVector = kind === 'vector';
  const target = recallTargetKind(run, asking ?? 'input');

  /**
   * ДВЕРЬ ВХОДА ПРЕДЛАГАЕТСЯ, ТОЛЬКО ЕСЛИ ПРОГОНУ ЕСТЬ ЧТО ОТДАТЬ ИМЕННО ЭТОМУ ЭКРАНУ.
   *
   * Раньше хватало наличия снимка, и на флэт-прогоне без единого референса дверь открывала окно,
   * которое честно предлагало СТЕРЕТЬ промпт и не положить взамен ничего. Разрушение без выгоды —
   * не выбор, а ловушка, и её место не в модалке, а в отсутствующей двери. У 3D мерка другая: там
   * жест — это ещё и переход на свой экран, и он осмыслен сам по себе.
   */
  const handsOver =
    target === 'threed'
      ? true
      : target === 'render'
        ? (run.inputs?.slots ?? []).some((s) => (s.mediaId ?? 0) > 0)
        : (run.inputs?.refs ?? []).length > 0 || !!(run.inputs?.garmentNote ?? '').trim();
  const inputDoor = !!run.inputs && handsOver && !isVector && runId > 0 && !disabled;
  /**
   * ═══ ПРОГОН 3D ЭТОЙ ДВЕРИ НЕ ИМЕЕТ ВОВСЕ (J-11) ═════════════════════════════════════════════
   *
   * Отсев `.glb` в `keptResults` — половина ответа, и одна она оставила бы дверь, которая на
   * прогоне 3D кладёт во вход ПОСТЕР: растр, «который стоит вместо модели там, где список обязан
   * нарисовать плитку» (`threedfal.go`), а не картинку, которую человек выбрал как результат. Это
   * ровно тот жест, на который владелец и жалуется — «модель не должна добавлятся в промпт», —
   * только сделанный её тенью.
   *
   * ⚠ И ЭТО НЕ «ОСТОРОЖНОСТЬ», А ГРАНИЦА: единственный настоящий выход прогона 3D — файл модели,
   * а файл модели в промпт картинок не едет по построению. Дверь без предмета — не дверь.
   * Векторный прогон исключён отдельно и по другой причине (T-16, см. `isVector` выше).
   */
  const isThreed = kind === 'threed';
  const resultsDoor =
    !isVector &&
    !isThreed &&
    runId > 0 &&
    !disabled &&
    (run.pictures ?? []).some((p) => p.media?.id != null && !pictureIsModel(p));

  /**
   * План считается ТОЛЬКО пока стоит вопрос. Считать его на каждый рендер строки значило бы
   * пересобирать карты по всей форме на каждую букву, набранную где-то ещё на карточке.
   */
  const plan = useMemo<FlatPlan | null>(() => {
    if (!asking || recallTargetKind(run, asking) !== 'flat' || !form) return null;
    const rows = (form.getValues('moodboardMedia') ?? []) as BoardItem[];
    const roled = new Map<number, boolean>();
    for (const r of band.references ?? []) {
      if (r.mediaId != null && (r.role ?? '').trim()) roled.set(r.mediaId, !!(r.note ?? '').trim());
    }
    return planFlat({
      run,
      mode: asking,
      rows,
      otherListIds: ((form.getValues('technicalMedia') ?? []) as BoardItem[]).map((i) => i.mediaId),
      callouts: (form.getValues('callouts') ?? []) as MoodCalloutRow[],
      roled,
      description: (form.getValues('garmentDescription') ?? '') as string,
      pinned: platedMedia(band),
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [asking, run, band, form]);

  const plates = useMemo(() => {
    if (!asking || asking !== 'input') return null;
    if (target === 'render') return platePlan(band, run, 'flat');
    return null;
  }, [asking, target, band, run]);

  if (!inputDoor && !resultsDoor) return null;
  if (!answerable('flat') && !answerable(target)) return null;

  const confirmLabel =
    target === 'threed'
      ? 'go to 3D'
      : target === 'render'
        ? 'put the plates back'
        : asking === 'results'
          ? // ПОДПИСЬ КНОПКИ НАЗЫВАЕТ ПОСЛЕДСТВИЕ, А ОНО СТАЛО РАЗРУШИТЕЛЬНЫМ (J-4): дверь больше
            // не «добавляет», она замещает вход результатами прогона.
            'replace the input with its results'
          : 'replace the prompt';

  return (
    <>
      {inputDoor && answerable(recallTargetKind(run, 'input')) && (
        <Chip
          onClick={() => setAsking('input')}
          title={`take what ${handle} was given — its reference pictures and its words — into the ${kindLabel(recallTargetKind(run, 'input'))} input. It asks first: the prompt it replaces is not kept anywhere.`}
        >
          recall ▸
        </Chip>
      )}
      {resultsDoor && answerable('flat') && (
        <Chip
          onClick={() => setAsking('results')}
          title={`replace input — references with the pictures ${handle} produced. Everything standing in the input now — pictures, roles, notes — leaves it. It asks first.`}
        >
          + results ▸
        </Chip>
      )}

      <ConfirmationModal
        open={!!asking}
        onOpenChange={(open) => !open && setAsking(null)}
        onConfirm={() => {
          const mode = asking;
          setAsking(null);
          if (mode) recallDesignRun(techCardId, run, mode);
        }}
        onCancel={() => setAsking(null)}
        title={
          asking === 'results'
            ? `replace the input with ${handle}’s results`
            : `recall ${handle} into ${kindLabel(target)}`
        }
        confirmLabel={confirmLabel}
        cancelLabel='leave it as it is'
        width='sm'
      >
        <div className='space-y-2'>
          {target === 'flat' && plan && <FlatQuestion plan={plan} handle={handle} mode={asking!} />}
          {target === 'render' && plates && (
            <PlateQuestion plates={plates} handle={handle} switches={canSwitch} />
          )}
          {target === 'threed' && (
            <>
              <Text size='control' component='p'>
                {handle} is a 3D run, so it belongs to the 3D studio and not to the flat prompt.
                {canSwitch
                  ? ' The studio switches to 3D.'
                  : ' Open 3D on the strip above to see it — this build does not switch views by itself.'}
              </Text>
              {/* ⚠ ЭТА СТРОКА БЫЛА ЛОЖЬЮ С КРУГА V-14 И ПЕРЕЖИЛА ДВА КРУГА. Она говорила «3D
                  reads the NEWEST render of each view, not a slot anybody can write» — а слоты
                  есть с V-14 (рендер-верстак), и с J-25 их пишут прямо на FABRIC RENDER. Человек,
                  прочитавший её, шёл искать несуществующий механизм «последнего рендера».
                  ПОВЕДЕНИЕ ПРИ ЭТОМ НЕ МЕНЯЕТСЯ: рекол 3D по-прежнему ничего не ставит — плиты
                  прогона 3D это МОДЕЛИ, а не рендеры сторон, и класть их в рендер-верстак было бы
                  постановкой выхода вместо входа. Меняется только то, что сказано вслух. */}
              <Text size='control' variant='label' component='p'>
                Nothing is placed: the input of a 3D build is the FABRIC RENDER SLOTS of one
                colourway, and this run’s plates are its OUTPUT — models, not renders of a side. To
                change what the next build reads, put renders into the sides on FABRIC RENDER. Its
                plates stay where they are.
              </Text>
            </>
          )}
        </div>
      </ConfirmationModal>
    </>
  );
}

/**
 * ЧТО БУДЕТ СТЁРТО — ЧИСЛАМИ, А НЕ СЛОВОМ «ВСЁ». Разрушительный вопрос, не называющий предмета,
 * читается как формальность и нажимается не глядя; именно поэтому здесь перечислены строки, роли,
 * записки и указания по отдельности, а не «the input».
 */
function FlatQuestion({
  plan,
  handle,
  mode,
}: {
  plan: FlatPlan;
  handle: string;
  mode: RecallMode;
}) {
  const removed: string[] = [];
  if (plan.clearRows.length) removed.push(count(plan.clearRows.length, 'picture'));
  if (plan.clearRoles.length) removed.push(`${count(plan.clearRoles.length, 'role')} and their notes`);
  if (plan.clearCallouts) removed.push(count(plan.clearCallouts, 'callout'));

  /**
   * ОДНА ЧИСЛОВАЯ ФРАЗА НА ОБЕ ДВЕРИ (J-4). Обе теперь ЗАМЕЩАЮТ вход, и различаются ровно двумя
   * словами: откуда картинки взялись и как они называются. Две редакции одного предложения
   * разошлись бы в первый же день — и разошлись бы молча, потому что читают их поодиночке.
   */
  const results = mode === 'results';
  const source = results ? 'PRODUCED' : 'was given';
  const noun = results ? 'output picture' : 'reference picture';
  const nothing = results
    ? `produced nothing the prompt can take — a 3D model is a file, not a picture`
    : `brought no reference pictures of its own`;

  return (
    <>
      <Text size='control' component='p'>
        {plan.clearRows.length
          ? plan.add.length
            ? `The flat prompt is REPLACED with what ${handle} ${source}. ${removed.join(', ')} leave the input; ${count(plan.add.length, noun)} from ${handle} take their place.`
            : `${removed.join(', ')} leave the input, and ${handle} ${nothing} — the prompt is left empty.`
          : `The input is empty, so nothing is removed. ${count(plan.add.length, noun)} from ${handle} go in.`}
      </Text>

      {plan.replaces && (
        <Text size='control' component='p'>
          The garment description is replaced with the words {handle} was given. The text you have
          now is not kept anywhere — copy it first if you need it.
        </Text>
      )}

      {(plan.refused > 0 || plan.gone > 0 || plan.already > 0) && (
        <Text size='control' variant='label' component='p'>
          {[
            plan.refused > 0 &&
              `${plan.refused} will not fit — the input holds ${INPUT_MAX}`,
            plan.already > 0 && `${plan.already} already in the input`,
            plan.gone > 0 && `${plan.gone} gone from the card, skipped`,
          ]
            .filter(Boolean)
            .join(' · ')}
        </Text>
      )}

      {plan.clearRoles.length > 0 && (
        // ГРАНИЦА ЧЕСТНОСТИ — та же, что у «clear the input»: у ролей свой RPC и они уходят СЕЙЧАС,
        // а строки и описание живут в документе и уедут с ним при сохранении карточки. С J-4 это
        // верно для ОБЕИХ дверей: результаты тоже замещают вход, значит тоже снимают роли.
        <Text size='control' variant='label' component='p'>
          The roles and notes are removed on the server now; the rows and the description leave the
          card when you save it.
        </Text>
      )}
    </>
  );
}

function PlateQuestion({
  plates,
  handle,
  switches,
}: {
  plates: { moves: PlateMove[]; unresolved: number };
  handle: string;
  /** Обещание перехода даётся, только если этой сборке есть чем его сдержать. */
  switches: boolean;
}) {
  const moving = plates.moves.filter((m) => !m.same);
  const already = plates.moves.length - moving.length;
  return (
    <>
      <Text size='control' component='p'>
        {handle} is a fabric render, so its plates go back into INPUT — FLATS OF THIS CARD, not into
        the flat prompt.
        {switches
          ? ' The studio switches to FABRIC RENDER.'
          : ' Open FABRIC RENDER on the strip above to see them — this build does not switch views by itself.'}
      </Text>
      {moving.length > 0 ? (
        <Text size='control' component='p'>
          {moving.map((m) => m.label).join(', ')} {moving.length === 1 ? 'is' : 'are'} replaced with
          the {moving.length === 1 ? 'plate' : 'plates'} {handle} was given. Whatever stands there
          now is displaced, not deleted — it stays on the card, right of the line.
        </Text>
      ) : (
        <Text size='control' component='p'>
          Every plate {handle} was given already stands in its slot, so nothing moves. Only the view
          switches.
        </Text>
      )}
      {(already > 0 || plates.unresolved > 0) && (
        <Text size='control' variant='label' component='p'>
          {[
            already > 0 && `${already} already in place`,
            plates.unresolved > 0 &&
              `${plates.unresolved} not on this page of the card and skipped`,
          ]
            .filter(Boolean)
            .join(' · ')}
        </Text>
      )}
      <Text size='control' variant='label' component='p'>
        Slots this run did not use are left exactly as they are.
      </Text>
    </>
  );
}

/* ────────────────────────────── the flat intake ────────────────────────────── */

/**
 * Приёмник рекола НА ФЛЭТЕ. Видимого органа у него нет и быть не должно: вопрос задан у двери, а
 * ответ на жест — это строки, которые появляются во входе, и один итог в снекбаре.
 *
 * ИМЯ ЭКСПОРТА И СИГНАТУРА ОСТАВЛЕНЫ КАК БЫЛИ: его монтирует чужой `references-section.tsx`, и
 * переименование сломало бы чужую дорожку. `host` тоже остаётся — инертная копия не считается
 * приёмником, и это единственное, ради чего проп существует.
 */
export function RecalledRunPrompt({
  techCardId,
  band,
  disabled,
  host = true,
  onAccepted,
}: {
  techCardId: number;
  band?: GetDesignBandResponse;
  disabled?: boolean;
  host?: boolean;
  /**
   * Свежепринятые медиа — вызывающему, который держит СВОЮ карту разрешения media_id→файл. Медиа
   * снимка прогона в библиотечной карте может не быть, и без этого колбэка блок референсов
   * нарисовал бы «media #N not resolved» на строке, которую сам же и завёл.
   */
  onAccepted?: (media: common_MediaFull[]) => void;
}) {
  useRegisterRecallHost(techCardId, 'flat', host);
  const selection = useRecalledRun(techCardId);
  const form = useFormContext<TechCardFormData>();
  const { setReferenceRole } = useDesignWrites(techCardId);
  const { showMessage } = useSnackBarStore();

  /**
   * Какой жест этот приёмник уже взял — прогон И дверь: один прогон законно вспоминают дважды,
   * сперва референсами, потом результатом. Сторож нужен потому, что эффект переигрывается и на
   * втором проходе StrictMode, а приём — это сетевые записи и строки в форме.
   */
  const taken = useRef('');

  useEffect(() => {
    if (!host) return;
    if (!selection || selection.kind !== 'flat') {
      taken.current = '';
      return;
    }
    const { run, mode } = selection;
    const runId = run.id ?? 0;
    const stamp = `${runId}:${mode}`;
    if (!runId || taken.current === stamp) return;
    taken.current = stamp;

    // ВЫБОР СНИМАЕТСЯ СРАЗУ. Рекол — жест, а не состояние: то, что он принёс, дальше живёт обычными
    // референсами, и «выбранный прогон» не имеет права оставаться на экране как режим.
    recallDesignRun(techCardId, null);

    const handle = runHandle(runId) || 'that run';
    if (disabled) {
      showMessage(`this card is read-only — nothing was taken from ${handle}`, 'error');
      return;
    }

    const rows = (form.getValues('moodboardMedia') ?? []) as BoardItem[];
    const otherListIds = ((form.getValues('technicalMedia') ?? []) as BoardItem[]).map(
      (i) => i.mediaId,
    );
    const roled = new Map<number, boolean>();
    for (const r of band?.references ?? []) {
      if (r.mediaId != null && (r.role ?? '').trim()) roled.set(r.mediaId, !!(r.note ?? '').trim());
    }
    const callouts = (form.getValues('callouts') ?? []) as MoodCalloutRow[];
    const plan = planFlat({
      run,
      mode,
      rows,
      otherListIds,
      callouts,
      roled,
      description: (form.getValues('garmentDescription') ?? '') as string,
      // Полосы у этой копии может и не быть; без неё плиты неизвестны, и разметка не трогается.
      pinned: band ? platedMedia(band) : null,
    });

    if (plan.empty) {
      showMessage(
        plan.gone > 0
          ? `${handle} kept ${count(plan.gone, 'picture')}, and ${plan.gone === 1 ? 'it is' : 'they are'} gone from the card — there is nothing left to reuse`
          : plan.already > 0
            ? `nothing new came from ${handle} — its pictures are already in the input`
            : `${handle} kept nothing this door can reuse`,
        'error',
      );
      return;
    }

    void (async () => {
      const said: string[] = [];

      /* ── чистка: сначала роли, потом строки ──
         Тот же порядок, что у одиночного ✕ и у «clear the input»: снятая строка при живой роли
         рождала бы носителя роли без строки на карточке. Роли снимаются ПО ОДНОЙ — bulk-глагола на
         проводе нет, — и частичный отказ не съедается: не снявшаяся роль остаётся на экране вместе
         со своей строкой, а итог говорит, сколько именно осталось. */
      const stayed = new Set<number>();
      for (const mediaId of plan.clearRoles) {
        try {
          await setReferenceRole.mutateAsync({ mediaId, role: '', ordinal: 0, note: '' });
        } catch {
          stayed.add(mediaId);
        }
      }

      const live = (form.getValues('moodboardMedia') ?? []) as BoardItem[];
      const dropping = new Set(plan.clearRows.filter((id) => !stayed.has(id)));
      const cleared = live.filter((i) => !(isInputRow(i) && dropping.has(i.mediaId)));

      const result = appendBoardPictures({
        live: cleared,
        inScope: isInputRow,
        otherListIds,
        added: plan.add.map((k) => k.media),
        kind: REFERENCE_KIND,
        max: INPUT_MAX,
        scopeLabel: 'input',
      });
      // Запись по КОРНЮ массива, как и везде в этой паре блоков: два экземпляра поля-массива на одно
      // имя не синхронизируются, а мудборд правит вторую половину того же списка.
      form.setValue('moodboardMedia', result.next as TechCardFormData['moodboardMedia'], {
        shouldDirty: true,
      });
      if (result.accepted.length) onAccepted?.(result.accepted);

      /* ── разметка ──
         Указание живёт на медиа, а не на строке входа, поэтому снимается только у картинок, которые
         уходят с карточки СОВСЕМ: у той, что осталась на доске, разметка чужая этому жесту. */
      if (dropping.size) {
        // СПИСОК НА СНОС, А НЕ НА СОХРАНЕНИЕ (см. `pinned` у планировщика): в `callouts` лежат ещё и
        // указания на плитах листа, и «сохранить то, что осталось во входе и на доске» унесло бы их
        // целиком. Уходят ровно те медиа, которые план назвал в вопросе, и ни одним больше — плюс
        // сторож на тот случай, если роль не снялась и строка осталась стоять.
        const gonePictures = new Set(
          [...plan.losing].filter(
            (id) => dropping.has(id) && !result.next.some((i) => i.mediaId === id),
          ),
        );
        const kept = callouts.filter((c) => !gonePictures.has(c?.mediaId ?? 0));
        const lost = callouts.length - kept.length;
        if (lost > 0) {
          form.setValue('callouts', kept as TechCardFormData['callouts'], { shouldDirty: true });
          said.push(`${count(lost, 'callout')} removed with ${lost === 1 ? 'its' : 'their'} picture`);
        }
      }

      /* ── слова ──
         Вопрос про описание задан у двери вместе со всем остальным, поэтому здесь он не повторяется:
         человек уже прочитал, что текст будет заменён, и нажал. Второе окно на один жест — это не
         «подробнее», а сомнение в собственном вопросе. */
      if (plan.words) {
        form.setValue('garmentDescription', plan.words, { shouldDirty: true });
      }

      /* ── роли принятых картинок ──
         Роль ставится ТОЛЬКО на своей новой строке: рекол воспроизводит вход прогона, а не
         переписывает роли, которые человек поставил соседним картинкам. Порядковый номер промпта —
         позиция во входе, как и у ручной правки: он нигде не хранится и выводится сканом. */
      const order = result.next.filter(isInputRow).map((i) => i.mediaId);
      const roleOf = new Map(plan.add.filter((k) => k.role).map((k) => [k.mediaId, k]));
      let roledOk = 0;
      let roleFailed = 0;
      for (const media of result.accepted) {
        const it = roleOf.get(media.id ?? 0);
        if (!it) continue;
        try {
          await setReferenceRole.mutateAsync({
            mediaId: it.mediaId,
            role: it.role,
            ordinal: Math.max(1, order.indexOf(it.mediaId) + 1),
            note: it.note,
          });
          roledOk++;
        } catch {
          roleFailed++;
        }
      }

      /* ── ИТОГ, НАЗЫВАЮЩИЙ ОБЕ ПОЛОВИНЫ ЧАСТИЧНОГО ИСХОДА ── */
      const added = result.accepted.length;
      said.unshift(
        added
          ? `${count(added, 'picture')} from ${handle} ${added === 1 ? 'is' : 'are'} in the input`
          : `nothing was added from ${handle}`,
      );
      if (plan.clearRows.length)
        said.push(`${count(plan.clearRows.length - stayed.size, 'picture')} cleared before it`);
      if (stayed.size)
        said.push(
          `${count(stayed.size, 'role')} could not be removed — ${stayed.size === 1 ? 'that reference stays' : 'those references stay'} in the input`,
        );
      if (result.refusal) said.push(result.refusal);
      if (plan.gone) said.push(`${plan.gone} gone from the card, skipped`);
      if (roledOk) said.push(`${roledOk} kept ${roledOk === 1 ? 'its role' : 'their roles'}`);
      if (roleFailed)
        said.push(
          `${roleFailed} could not be given ${roleFailed === 1 ? 'its role' : 'their roles'} — set ${roleFailed === 1 ? 'it' : 'them'} by hand`,
        );
      if (plan.words) said.push('the description was taken from the run');
      showMessage(said.join(' · '), stayed.size || roleFailed || result.refusal ? 'error' : 'success');
    })();
    // `form`, `showMessage` и `setReferenceRole` намеренно не в списке: приём взводится ВЫБОРОМ, и
    // перезапуск его от смены ссылки на мутацию был бы вторым приёмом того же жеста.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selection, host, disabled, techCardId]);

  return null;
}

/* ────────────────────────────── the bench intake ────────────────────────────── */

/**
 * ПРИЁМНИК РЕКОЛА ДЛЯ ФАБРИК-РЕНДЕРА И 3D (V-12в).
 *
 * ОН МОНТИРУЕТСЯ ИСТОРИЕЙ ПРОГОНОВ, а не экраном рендера, и это не лень. История стоит на ВСЕХ трёх
 * вкладках, а экран рендера — только на своей; приёмник, живущий на экране рендера, отсутствовал бы
 * ровно в тот момент, когда жест начинается — на флэте, где человек видит строку render-прогона.
 * Дверь при этом всё равно переключает вид: слоты, в которые он пишет, показывает именно тот экран.
 *
 * У 3D ПРИНИМАТЬ НЕЧЕГО, И ЭТО СКАЗАНО, А НЕ СЪЕДЕНО: его вход — свежайший рендер каждого вида,
 * вычисляемый из истории, а не слот, в который можно положить. Это ровно тот дефект, о котором
 * владелец говорит отдельным пунктом (V-14).
 */
export function RecallBenchIntake({
  techCardId,
  band,
  disabled,
}: {
  techCardId: number;
  band: GetDesignBandResponse;
  disabled?: boolean;
}) {
  useRegisterRecallHost(techCardId, 'render', true);
  useRegisterRecallHost(techCardId, 'threed', true);
  const selection = useRecalledRun(techCardId);
  const { setBenchSlot } = useDesignWrites(techCardId);
  const { showMessage } = useSnackBarStore();
  const taken = useRef('');

  useEffect(() => {
    if (!selection || (selection.kind !== 'render' && selection.kind !== 'threed')) {
      taken.current = '';
      return;
    }
    const { run, kind } = selection;
    const runId = run.id ?? 0;
    const stamp = `${runId}:${kind}`;
    if (!runId || taken.current === stamp) return;
    taken.current = stamp;
    recallDesignRun(techCardId, null);

    const handle = runHandle(runId) || 'that run';
    if (disabled) {
      showMessage(`this card is read-only — nothing was taken from ${handle}`, 'error');
      return;
    }

    if (kind === 'threed') {
      // ИТОГ НЕ ОБЪЯВЛЯЕТ ПЕРЕХОД, ХОТЯ ПЕРЕХОД ОБЫЧНО И СЛУЧАЕТСЯ. Переключение — дело двери, и
      // оно ВИДНО САМО: полоса представлений меняет вид под пальцем. А на сборке без крючка
      // композитора перехода не будет вовсе, и фраза «moved to 3D» стала бы единственным враньём
      // в этом жесте. Итог говорит только то, за что отвечает приёмник.
      showMessage(
        `${handle}’s plates were not placed: they are 3D models, i.e. the output of a build. What a build READS is the FABRIC RENDER SLOTS of one colourway — fill those on FABRIC RENDER.`,
        'error',
      );
      return;
    }

    const { moves, unresolved } = platePlan(band, run, 'flat');
    const moving = moves.filter((m) => !m.same);
    if (!moving.length) {
      showMessage(
        unresolved > 0
          ? `nothing was placed — ${count(unresolved, 'plate')} of ${handle} ${unresolved === 1 ? 'is' : 'are'} not on this page of the card`
          : `every plate ${handle} was given already stands in its slot — nothing to move`,
        unresolved > 0 ? 'error' : 'success',
      );
      return;
    }

    void (async () => {
      const placed: string[] = [];
      const failed: string[] = [];
      // Последовательно, а не залпом: залп по СAS-слотам делает порядок отказов случайным, а «что
      // доехало» обязано совпадать с экраном детерминированно.
      for (const move of moving) {
        try {
          await setBenchSlot.mutateAsync({
            slot: move.ref,
            pictureId: move.pictureId,
            expectedSlotRev: move.slotRev,
          });
          placed.push(move.label);
        } catch {
          failed.push(move.label);
        }
      }
      const said: string[] = [];
      if (placed.length)
        said.push(
          `${placed.join(', ')} ${placed.length === 1 ? 'holds' : 'hold'} ${handle}’s ${placed.length === 1 ? 'plate' : 'plates'} again`,
        );
      if (failed.length)
        said.push(`${failed.join(', ')} did not take it — someone changed ${failed.length === 1 ? 'that slot' : 'those slots'} first`);
      if (unresolved) said.push(`${count(unresolved, 'plate')} not on this page of the card, skipped`);
      showMessage(said.join(' · '), failed.length || unresolved ? 'error' : 'success');
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selection, disabled, techCardId]);

  return null;
}
