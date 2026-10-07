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
import { Button } from 'ui/components/button';
import { ConfirmationModal } from 'ui/components/confirmation-modal';
import Text from 'ui/components/text';

import type { TechCardFormData } from '../schema';
import { findSlot } from './bench-slot';
import { flatInputBusy, holdFlatInput, readFlatInput } from './flat-input';
import { GapPill } from './generation/run-panel';
import { isRunLive } from './generation/run-state';
import { runHandle } from './handles';
import { retouchSourceId, workflowOfRun } from './playground/registry/run-workflow';
import type { DesignKind } from './bench-kinds';
import { LABEL_VIEWS } from './board-labels';
import { MOOD_MAX, appendBoardPictures, isBoardRow, type BoardItem } from './mood-board';
import { pictureIsModel } from './threed/media';
import { cardOnScreen, useDesignWrites } from './use-design-band';
import { isPictureHidden } from './visibility';
import { DETAIL_VIEW, isActiveView, isLegacyView, normaliseViewKey, viewLabel } from './views';
import { flatHumanWords, runFlatWords } from './flat-route';

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
export function recallTargetKind(
  run: common_DesignRun,
  mode: RecallMode,
  threedRetired = false,
): DesignKind {
  if (mode === 'results') return 'flat';
  const kind = (run.kind ?? '').trim().toLowerCase();
  if (kind === 'render') return 'render';
  /* A 3D RUN GOES WHERE 3D IS BUILT ON THIS SERVER (C-10, C-12): STEP 5 on a server older than
     `playground_workflows`, the playground tile Image to 3D where STEP 5 has left the rail
     (`threedStepRetired`, core/chain.ts) — there the playground's receiver opens tile 12 with the
     run's reference and options (`workflowOfRun` → `image_to_3d`). */
  if (kind === 'threed') return threedRetired ? 'playground' : 'threed';
  /* ПЛЕЙГРАУНД ЗАБИРАЕТ СВОЙ ВХОД СЕБЕ. Его вход — не референсы промпта и не слоты верстака, а
     СТОЛ (`params.freeform.items[]` с областями), и разложить его может только тот экран, который
     стол и рисует. Без этой строки жест уводил бы стол прошлого прогона во ФЛЭТ — то есть
     превращал бы размеченные картинки в безымянные референсы чужого промпта, молча. */
  if (kind === 'freeform' || kind === 'cutout') return 'playground';
  // Phase 3: Extend Image (tile 9) and the mask retouch (tile 10) are the playground's own kinds.
  if (kind === 'extend' || kind === 'inpaint') return 'playground';
  // B-32: a clip run recalls into the playground's Image to Video tile (`workflowOfRun`).
  if (kind === 'video') return 'playground';
  // ON MODEL's recolour is the PLAYGROUND workflow `change_color` now (C-01). Recall switches the
  // step only; `?wf=` is the playground screen's to set from the run.
  if (kind === 'recolor') return 'playground';
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
  /** STEP 5 has left the rail on this server (`threedStepRetired`): a 3D run goes to tile 12. */
  threedRetired = false,
): void {
  if (!techCardId || techCardId <= 0) return;
  // Снятие выбора разрешено всегда: убрать несделанное можно и без приёмника.
  if (!run) {
    if (recalled.delete(techCardId)) emit();
    return;
  }

  const kind = recallTargetKind(run, mode, threedRetired);
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
  if (kind === 'render') return 'fabric render';
  if (kind === 'threed') return '3D';
  if (kind === 'playground') return 'playground';
  // `onmodel` is no screen any more (C-06): a recolour is recalled into PLAYGROUND · Change a
  // Color, and `recallTargetKind` never answers `onmodel`. Named for the type's sake, truthfully.
  if (kind === 'onmodel') return 'playground';
  if (kind === 'pattern') return 'pattern';
  return 'flat';
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
  /** The flat's own words now (`flatWords`) — what the run's lines would replace. */
  flatWords: string;
}) {
  const { alive, gone } = input.mode === 'results' ? keptResults(input.run) : keptRefs(input.run);
  /**
   * ═══ ДВЕРИ КЛАДУТ НА ДОСКУ И НИЧЕГО НЕ ЧИСТЯТ (101 Ф3) ═══════════════════════════════════════
   *
   * Отдельного входа флэта больше нет: флэт берёт картинки с МУДБОРДА по ярлыкам, по два самых
   * свежих на вид (`designFlatPickFromBoard`). Поэтому `recall ▸` и `+ results ▸` кладут картинки
   * прогона НА ДОСКУ, а не замещают вход: доска — работа человека (указания, роли), и стирать её
   * жестом истории нельзя. «Только результаты» (J-4) получается само: выходы прогона — новейшие
   * медиа, и в следующий прогон своего вида едут они, а прежние картинки того же вида остаются дома
   * строкой «older» в «what the model gets».
   */
  const board = input.rows.filter(isBoardRow);
  const room = Math.max(0, MOOD_MAX - board.length);
  const occupied = new Set<number>([...board.map((i) => i.mediaId), ...input.otherListIds]);
  const fresh = alive.filter((k) => !occupied.has(k.mediaId));
  const already = alive.length - fresh.length;
  const add = fresh.slice(0, room);
  const refused = fresh.length - add.length;

  /* THE RUN'S WORDS GO BACK WHERE THEY CAME FROM (M15): a flat run was given «garment: class» + the
     person's flat words, so only those lines return — into FLAT › WORDS, never into the description
     (the class line follows the category; a render run's note is model-written prose). */
  const words = input.mode === 'input' ? runFlatWords(input.run) : '';
  const current = flatHumanWords(input.flatWords);

  return {
    add,
    already,
    refused,
    gone,
    words,
    /** Строки WORDS, которые слова прогона заменят. Пусто — заменять нечего, и вопрос об этом не стоит. */
    replaces: words && words !== current ? current : '',
    /** Жест, который ничего не сделает, называется так вслух, а не рисуется дверью. */
    empty: !add.length && !(words && words !== current),
  };
}

type FlatPlan = ReturnType<typeof planFlat>;

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
): { moves: PlateMove[]; unresolved: number; retired: number } {
  const byMedia = pictureIdByMedia(band);
  const moves: PlateMove[] = [];
  let unresolved = 0;
  /** Плиты снятых 3/4 (D-18): прогон их получал, но вернуть их некуда — слота такого вида больше
   *  не предлагают. Считаются и называются вслух, как и ненайденные, а не пропадают молча. */
  let retired = 0;
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

    /* СНЯТЫЙ ВИД — «retired» ДО перевода файла в картинку (ревью Codex m2). Плита 3/4 может не
       лежать на загруженной странице истории, и тогда она читалась бы «не найдена», хотя ответ
       другой и окончательный: вернуть её некуда вовсе, слота такого вида больше не предлагают. */
    if (isLegacyView(view)) {
      retired++;
      continue;
    }

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

    if (!isActiveView(view)) continue;
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
  return { moves, unresolved, retired };
}

/* ────────────────────────────── the doors ────────────────────────────── */

function count(n: number, one: string, many = `${one}s`): string {
  return `${n} ${n === 1 ? one : many}`;
}

/**
 * ОБЕ ДВЕРИ И ВОПРОС ПЕРЕД НИМИ — ОДНИМ ОРГАНОМ, потому что вопрос обязан быть один на карточку:
 * две модалки назвали бы одному жесту разные последствия, и вторая неизбежно оказалась бы короче
 * первой. С раскладкой макета орган стоит РОВНО В ОДНОМ месте — в мета-ряду строки истории; из
 * раскрытой панели прогона он снят, панель теперь стоит прямо под этим рядом.
 *
 * ═══ ДВЕРЬ ЕСТЬ ВСЕГДА, И ПОГАШЕННАЯ ОБЪЯСНЯЕТ СЕБЯ РЯДОМ (макет, `histRow`) ══════════════════
 * Раньше орган возвращал `null`, когда двери было нечего отдать, — и строка без двери читалась
 * как строка, у которой рекола НЕТ, а не как строка, у которой ему НЕЧЕГО брать. Теперь обе двери
 * стоят на каждой строке, а причина гашения — пилюлей-gap ПЕРЕД дверью, как в макете:
 * `NOTHING WENT IN · [RECALL ▸]`, `NOTHING RASTER CAME BACK · [+ RESULTS ▸]`.
 *
 * ⚠ СМЫСЛ ДВЕРЕЙ — ПРОДУКТА, НЕ МАКЕТА. `+ results ▸` здесь ЗАМЕЩАЕТ INPUT — REFERENCES выходами
 * прогона (J-4), а не ставит их в свободные ячейки верстака, как в макете; поэтому и причины у
 * него свои: «its output is a model» (3D, J-11), «this run has not come back yet», «nothing raster
 * came back», и «<kind> is not on screen» — приёмник того рода не смонтирован, а переключателя
 * вида у этой сборки нет (`useStudioKindSwitch` композитор не зовёт).
 *
 * Векторный прогон дверей не имеет вовсе — исключение самого владельца (T-16, «рекола для
 * генерации свг вектора не должно быть»): перерисовку начинают из редактора плиты.
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
  const isVector = kind === 'vector';
  /* The band answered (this row stands on it): STEP 5 has left the rail exactly when it lists the
     playground workflows — `threedStepRetired` of core/chain.ts on a loaded band. */
  const threedRetired = band.playgroundWorkflows !== undefined;
  const target = recallTargetKind(run, asking ?? 'input', threedRetired);
  const inputTarget = recallTargetKind(run, 'input', threedRetired);

  /**
   * ДВЕРЬ ВХОДА ОТДАЁТ ЧТО-ТО, ТОЛЬКО ЕСЛИ ПРОГОНУ ЕСТЬ ЧТО ОТДАТЬ ИМЕННО ЭТОМУ ЭКРАНУ.
   *
   * Раньше хватало наличия снимка, и на флэт-прогоне без единого референса дверь открывала окно,
   * которое честно предлагало СТЕРЕТЬ промпт и не положить взамен ничего. Разрушение без выгоды —
   * не выбор, а ловушка, и её место — в погашенной двери с причиной. У 3D мерка другая: там жест —
   * это ещё и переход на свой экран, и он осмыслен сам по себе.
   */
  /* A RETOUCH HANDS OVER ITS PICTURE, OR NOTHING (G-02 Codex 5): its recall opens the mask editor
     on the picture it painted, so the door is live only while the snapshot still carries that
     picture — a words-only recall would open a tile that cannot start from anything. */
  const retouch = workflowOfRun(run) === 'retouch_zone';
  const retouchSource = retouchSourceId(run);
  const handsOver =
    kind === 'threed'
      ? true
      : retouch
        ? retouchSource > 0 &&
          (run.inputs?.refs ?? []).some(
            (ref) => (ref.mediaId ?? 0) === retouchSource && !!ref.media && !ref.deleted,
          )
        : inputTarget === 'render'
          ? (run.inputs?.slots ?? []).some((s) => (s.mediaId ?? 0) > 0)
          : (run.inputs?.refs ?? []).length > 0 || !!runFlatWords(run);
  /**
   * ═══ ПРОГОН 3D ДВЕРИ РЕЗУЛЬТАТА НЕ ИМЕЕТ ВОВСЕ (J-11) ═══════════════════════════════════════
   *
   * Отсев `.glb` в `keptResults` — половина ответа, и одна она оставила бы дверь, которая на
   * прогоне 3D кладёт во вход ПОСТЕР: растр, «который стоит вместо модели там, где список обязан
   * нарисовать плитку» (`threedfal.go`), а не картинку, которую человек выбрал как результат. Это
   * ровно тот жест, на который владелец и жалуется — «модель не должна добавлятся в промпт», —
   * только сделанный её тенью. Единственный настоящий выход прогона 3D — файл модели, а файл модели
   * в промпт картинок не едет по построению.
   */
  const isThreed = kind === 'threed';
  const live = isRunLive(run);
  const raster = (run.pictures ?? []).some((p) => p.media?.id != null && !pictureIsModel(p));

  /* Причины гашения — по одной на дверь, первая подходящая. Порядок несущий: «нечего брать»
     стоит раньше «некому отдать», потому что вторая причина лечится переходом на другой шаг, а
     первая — нет, и человек должен знать, что переход ему не поможет. */
  const inputWhy =
    retouch && run.inputs && !handsOver
      ? 'its picture is gone'
      : !run.inputs || !handsOver
        ? 'nothing went in'
        : !answerable(inputTarget)
          ? `${kindLabel(inputTarget)} is not on screen`
          : null;
  const resultsWhy = isThreed
    ? 'its output is a model'
    : live
      ? 'this run has not come back yet'
      : !raster
        ? 'nothing raster came back'
        : !answerable('flat')
          ? 'flat is not on screen'
          : null;

  /**
   * План считается ТОЛЬКО пока стоит вопрос. Считать его на каждый рендер строки значило бы
   * пересобирать карты по всей форме на каждую букву, набранную где-то ещё на карточке.
   */
  const plan = useMemo<FlatPlan | null>(() => {
    if (!asking || recallTargetKind(run, asking, threedRetired) !== 'flat' || !form) return null;
    const rows = (form.getValues('moodboardMedia') ?? []) as BoardItem[];
    return planFlat({
      run,
      mode: asking,
      rows,
      otherListIds: ((form.getValues('technicalMedia') ?? []) as BoardItem[]).map((i) => i.mediaId),
      flatWords: (form.getValues('flatWords') as string | null | undefined) ?? '',
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [asking, run, band, form]);

  const plates = useMemo(() => {
    if (!asking || asking !== 'input') return null;
    if (target === 'render') return platePlan(band, run, 'flat');
    return null;
  }, [asking, target, band, run]);

  if (isVector || runId <= 0) return null;

  const confirmLabel =
    target === 'threed'
      ? 'go to 3D'
      : target === 'render'
        ? 'put the plates back'
        : target === 'flat'
          ? // 101 Ф3: обе двери флэта кладут картинки на доску и ничего не стирают.
            'put them on the moodboard'
          : retouch
            ? 'open the mask'
            : 'replace the prompt';

  const inputDark = !!disabled || !!inputWhy;
  const resultsDark = !!disabled || !!resultsWhy;

  return (
    <>
      {inputWhy && <GapPill>{inputWhy}</GapPill>}
      {/* `title` ТОЛЬКО У ЖИВОЙ ДВЕРИ: причина погашенной уже стоит словами перед ней (макет:
          «title у погашенной не ставится никогда»). Стрелка не попадает в aria-label — читалка
          произносила бы её юникодным именем. */}
      <Button
        variant='secondary'
        size='xs'
        disabled={inputDark}
        onClick={() => setAsking('input')}
        aria-label={`take the input of ${handle} back`}
        title={
          inputDark
            ? undefined
            : inputTarget === 'flat'
              ? `put what ${handle} was given — its reference pictures and its words — back on the moodboard. It asks first.`
              : `take what ${handle} was given — its reference pictures and its words — into the ${kindLabel(inputTarget)} input. It asks first: the prompt it replaces is not kept anywhere.`
        }
      >
        recall ▸
      </Button>
      {resultsWhy && <GapPill>{resultsWhy}</GapPill>}
      <Button
        variant='secondary'
        size='xs'
        disabled={resultsDark}
        onClick={() => setAsking('results')}
        aria-label={`put what ${handle} returned on the moodboard`}
        title={
          resultsDark
            ? undefined
            : `put the pictures ${handle} produced on the moodboard — the next flat sends them as the newest of their view. It asks first.`
        }
      >
        + results ▸
      </Button>

      <ConfirmationModal
        open={!!asking}
        onOpenChange={(open) => !open && setAsking(null)}
        onConfirm={() => {
          const mode = asking;
          setAsking(null);
          if (mode) recallDesignRun(techCardId, run, mode, threedRetired);
        }}
        onCancel={() => setAsking(null)}
        title={
          target === 'flat'
            ? asking === 'results'
              ? `${handle}’s results on the moodboard`
              : `${handle}’s input on the moodboard`
            : `recall ${handle} into ${kindLabel(target)}`
        }
        confirmLabel={confirmLabel}
        cancelLabel='leave it as it is'
        width='sm'
      >
        <div className='space-y-2'>
          {target === 'flat' && plan && <FlatQuestion plan={plan} handle={handle} mode={asking!} />}
          {target === 'playground' && retouch && asking === 'input' && (
            <Text size='control' component='p'>
              Retouch a Zone opens with the mask on {handle}’s picture and its words in the box. The
              zone is not carried over — paint it again, then GENERATE.
            </Text>
          )}
          {target === 'render' && plates && (
            <PlateQuestion plates={plates} handle={handle} switches={canSwitch} />
          )}
          {target === 'threed' && (
            <>
              <Text size='control' component='p'>
                {handle} is a 3D run, so it belongs to the 3D studio and not to the flat prompt.
                {canSwitch
                  ? ' The studio switches to 3D.'
                  : ' Open 3D on the chain above to see it — this build does not switch views by itself.'}
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
 * ЧТО ЛЯЖЕТ НА ДОСКУ — ЧИСЛАМИ (101 Ф3). Двери больше ничего не стирают: картинки прогона встают на
 * мудборд, и флэт берёт с доски по два самых свежих на вид.
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
  const results = mode === 'results';
  const noun = results ? 'output picture' : 'reference picture';
  return (
    <>
      <Text size='control' component='p'>
        {plan.add.length
          ? `${count(plan.add.length, noun)} from ${handle} go on the moodboard${results ? ' as flats of this garment' : ' with the views they had'}. Nothing on the board is removed; the flat sends the two newest pictures of each view.`
          : `Nothing from ${handle} goes on the moodboard.`}
      </Text>

      {plan.replaces && (
        <Text size='control' component='p'>
          The flat’s words are replaced with the lines {handle} was given. The lines you have now
          are not kept anywhere — copy them first if you need them.
        </Text>
      )}

      {(plan.refused > 0 || plan.gone > 0 || plan.already > 0) && (
        <Text size='control' variant='label' component='p'>
          {[
            plan.refused > 0 && `${plan.refused} will not fit — the board holds ${MOOD_MAX}`,
            plan.already > 0 && `${plan.already} already on the board`,
            plan.gone > 0 && `${plan.gone} gone from the card, skipped`,
          ]
            .filter(Boolean)
            .join(' · ')}
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
  plates: { moves: PlateMove[]; unresolved: number; retired: number };
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
      {(already > 0 || plates.unresolved > 0 || plates.retired > 0) && (
        <Text size='control' variant='label' component='p'>
          {[
            already > 0 && `${already} already in place`,
            plates.unresolved > 0 &&
              `${plates.unresolved} not on this page of the card and skipped`,
            plates.retired > 0 && `${plates.retired} of a 3/4 view skipped — 3/4 views are retired`,
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
    /* ВХОД ЗАНЯТ — РЕКОЛ ОТКАЗЫВАЕТСЯ (ревью раунда 3, m1). Идёт GENERATE (карточка сохраняется, запрос
       прогона в полёте — сервер снимает роли В МОМЕНТ запуска) или вход уже переписывается (CLEAR,
       кроп, деталь): роли и строки, переписанные посреди этого, дали бы прогону не тот промпт, за
       который нажали. Жест не делает ничего и говорит об этом; повторить его можно, когда вход свободен. */
    if (flatInputBusy(readFlatInput(techCardId))) {
      showMessage(
        `the flat input is busy — a run is being saved or started, or the prompt is being changed; nothing was taken from ${handle}`,
        'error',
      );
      return;
    }

    const rows = (form.getValues('moodboardMedia') ?? []) as BoardItem[];
    const otherListIds = ((form.getValues('technicalMedia') ?? []) as BoardItem[]).map(
      (i) => i.mediaId,
    );
    const plan = planFlat({
      run,
      mode,
      rows,
      otherListIds,
      flatWords: (form.getValues('flatWords') as string | null | undefined) ?? '',
    });

    if (plan.empty) {
      showMessage(
        plan.gone > 0
          ? `${handle} kept ${count(plan.gone, 'picture')}, and ${plan.gone === 1 ? 'it is' : 'they are'} gone from the card — there is nothing left to reuse`
          : plan.already > 0
            ? `nothing new came from ${handle} — its pictures are already on the moodboard`
            : `${handle} kept nothing this door can reuse`,
        'error',
      );
      return;
    }

    /* ПОД УДЕРЖАНИЕМ ВХОДА ДО ПОСЛЕДНЕЙ ЗАПИСИ (m1): ярлыки ставятся по одной, и GENERATE, нажатый
       посреди, взял бы доску наполовину. Слова запираются, только если рекол их пишет (MIN-1). */
    const card = techCardId;
    const release = holdFlatInput(card, { words: !!plan.words });
    void (async () => {
      try {
        const said: string[] = [];
        const live = (form.getValues('moodboardMedia') ?? []) as BoardItem[];
        const result = appendBoardPictures({
          live,
          inScope: isBoardRow,
          otherListIds,
          added: plan.add.map((k) => k.media),
          kind: 'TECH_CARD_MEDIA_KIND_MOODBOARD',
          max: MOOD_MAX,
          scopeLabel: 'board',
        });
        /* НАЗНАЧЕНИЕ ПРИНЯТЫХ КАРТИНОК (101 Ф3): вид прогона → `target`, деталь → `detail`; выход
           прогона (`+ results ▸`) — флэт этой вещи, тоже `target`. Без роли — пусто: назначение
           предложит модель, как у любой новой картинки доски. */
        const purposeOf = new Map(
          plan.add.map((k) => [
            k.mediaId,
            mode === 'results' || (k.role && k.role !== DETAIL_VIEW)
              ? 'target'
              : k.role === DETAIL_VIEW
                ? 'detail'
                : '',
          ]),
        );
        const accepted = new Set(result.accepted.map((m) => m.id ?? 0));
        const next = result.next.map((i) =>
          isBoardRow(i) && accepted.has(i.mediaId) && purposeOf.get(i.mediaId)
            ? { ...i, role: purposeOf.get(i.mediaId) }
            : i,
        );
        // Запись по КОРНЮ массива, как и везде у этого списка.
        form.setValue('moodboardMedia', next as TechCardFormData['moodboardMedia'], {
          shouldDirty: true,
        });
        if (result.accepted.length) onAccepted?.(result.accepted);

        /* ── слова ──
           Вопрос про описание задан у двери вместе со всем остальным, поэтому здесь он не повторяется. */
        if (plan.words) {
          form.setValue('flatWords', plan.words, { shouldDirty: true });
        }

        /* ── ярлыки принятых картинок ──
           Вид, который прогон получил от человека, встаёт ярлыком человека: модель его не перечитывает.
           Только на принятых картинках — ярлыки соседей не трогаются. У выхода прогона ярлыка нет:
           его прочтёт модель. */
        const order = next.filter(isBoardRow).map((i) => i.mediaId);
        /* Только вид из словаря ярлыков (Codex Ф3): деталь в снимке прогона едет без слота —
           ярлык человека «detail» без слота ни к чему бы не привязал; её прочтёт модель и сама
           приведёт к слоту (назначение `detail` уже стоит). Снятые 3/4 — тоже модели. */
        const roleOf = new Map(
          plan.add
            .filter((k) => (LABEL_VIEWS as readonly string[]).includes(k.role))
            .map((k) => [k.mediaId, k]),
        );
        let roledOk = 0;
        let roleFailed = 0;
        for (const media of result.accepted) {
          const it = roleOf.get(media.id ?? 0);
          if (!it || mode === 'results') continue;
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
        said.push(
          added
            ? `${count(added, 'picture')} from ${handle} ${added === 1 ? 'is' : 'are'} on the moodboard`
            : `nothing was added from ${handle}`,
        );
        if (result.refusal) said.push(result.refusal);
        if (plan.gone) said.push(`${plan.gone} gone from the card, skipped`);
        if (roledOk) said.push(`${roledOk} kept ${roledOk === 1 ? 'its view' : 'their views'}`);
        if (roleFailed)
          said.push(
            `${roleFailed} could not be given ${roleFailed === 1 ? 'its view' : 'their views'} — set ${roleFailed === 1 ? 'it' : 'them'} on the tile`,
          );
        if (plan.words) said.push('the flat’s words were taken from the run');
        // Итог — только над карточкой, которая на экране (ревью раунда 4, MIN-5).
        if (cardOnScreen(card)) {
          showMessage(said.join(' · '), roleFailed || result.refusal ? 'error' : 'success');
        }
      } finally {
        release();
      }
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

    const { moves, unresolved, retired } = platePlan(band, run, 'flat');
    const moving = moves.filter((m) => !m.same);
    /* Плиты снятых 3/4 (D-18) — отдельной фразой: их не «не нашли», им просто больше некуда встать. */
    const retiredSaid = retired
      ? `${count(retired, 'plate')} of a 3/4 view skipped — 3/4 views are retired`
      : '';
    if (!moving.length) {
      showMessage(
        [
          unresolved > 0
            ? `nothing was placed — ${count(unresolved, 'plate')} of ${handle} ${unresolved === 1 ? 'is' : 'are'} not on this page of the card`
            : moves.length === 0
              ? 'nothing was placed'
              : `${retired > 0 ? 'every other plate' : `every plate ${handle} was given`} already stands in its slot — nothing to move`,
          retiredSaid,
        ]
          .filter(Boolean)
          .join(' · '),
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
        said.push(
          `${failed.join(', ')} did not take it — someone changed ${failed.length === 1 ? 'that slot' : 'those slots'} first`,
        );
      if (unresolved)
        said.push(`${count(unresolved, 'plate')} not on this page of the card, skipped`);
      if (retiredSaid) said.push(retiredSaid);
      showMessage(said.join(' · '), failed.length || unresolved ? 'error' : 'success');
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selection, disabled, techCardId]);

  return null;
}
