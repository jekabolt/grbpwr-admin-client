import { cn } from 'lib/utility';
import { useCallback, useEffect, useId, useLayoutEffect, useRef, useState } from 'react';
import type { ReactNode, RefObject } from 'react';
import { Section } from 'ui/components/section';
import Text from 'ui/components/text';
import { Arrow } from 'ui/icons/arrow';
import { FIELD_REVEAL_EVENT } from 'utils/field-errors';

import { onDoorKey } from './callout-rail';
import {
  CALLOUTS_COLLAPSE_BELOW,
  CALLOUTS_KEY_STEP,
  CALLOUTS_MIN_W,
  CALLOUTS_PREFS_KEY,
  calloutsCollapsed,
  calloutsMaxWidth,
  clampCalloutsWidth,
  useCalloutsPrefs,
} from './use-callouts-prefs';

/**
 * ═══ ПАНЕЛЬ CALLOUTS — ОДНА ОБОЛОЧКА НА МУДБОРД И ЛИСТ ARTIFACTS (T14, R15) ═════════════════════
 *
 * Владелец, 04.10: «в artefacts the sheet сделать так что бы колаут блок тоже мог колапсится как в
 * мудборде». Механизм — разделитель в шве, полоска 28px, шеврон в шапке, жест ширины, перенос фокуса
 * за дверью, предпочтения на пользователя — жил внутри `MoodBoard`; здесь он вынесен целиком и без
 * правок, чтобы лист получил ТОТ ЖЕ орган, а не копию, которая разойдётся первой же правкой.
 * Хук (`useCalloutsPanel`) держит состояние и жест, компонент (`CalloutsPanel`) рисует разделитель
 * и панель — прямыми детьми ряда `SectionStack row`: разделитель меряет ряд у своего родителя.
 * Лист и доска хранят предпочтения под РАЗНЫМИ ключами (`prefsBase`): свернуть панель доски не
 * значит свернуть панель листа.
 */

/**
 * Щелчок против жеста ширины (O-58): нажатие, ушедшее до отпускания меньше чем на 4px, — щелчок,
 * дальше — жест, и щелчка у него нет.
 */
const DRAG_SLOP = 4;
/** Tailwind `lg`: от него разделитель стоит в шве и жест ширины есть, ниже — нет. */
const LG_UP = '(min-width: 64rem)';

/**
 * ЛОВУШКИ `click` ЖЕСТОВ ШИРИНЫ (27.09, O-58 r4–r6, ревью Codex; D-70′, D-70″). `click`, который
 * браузер шлёт за отпусканием жеста, — этого отпускания, а не двери, и попасть он может куда угодно
 * (см. шапку жеста в `MoodBoard`). Отпускание взводит СВОЮ ловушку — жетон «указатель, точка,
 * время» — и она съедает не больше одного `click`: с `pointerId` жеста либо, без числового
 * `pointerId` (движок, где `click` — ещё `MouseEvent`), упавший не дальше 24px от точки отпускания.
 * Ловушка кончается ТОЛЬКО на этом `click` или по своему сроку — что раньше; срок задаёт `release`:
 * у касания и пера секунда, у мыши — конец задачи отпускания. Никакое нажатие её не снимает:
 * `pointerId` — имя живого контакта, а не пальца, и повторяется, а отложенный `click` касания
 * (iOS Safari, WebView) приходит и после нового нажатия с тем же `pointerId` (ревью Codex r5).
 * Новое отпускание взводит свою, а прежние живут до своего срока; больше ловушка не ест ничего.
 * `click` с `pointerId` −1 или `detail` 0 — клавиатура, ассистивная техника, `element.click()`
 * (замерено) — дверь всегда. Взводит ли отпускание ловушку, тоже решает `release`: у мыши — только
 * после жеста с движением.
 */
const CLICK_TRAP_MS = 1000;
const CLICK_TRAP_PX = 24;
type ClickTrap = {
  id: number;
  x: number;
  y: number;
  t: number;
  timer?: ReturnType<typeof setTimeout>;
};
function createClickTraps() {
  let armed: ClickTrap[] = [];
  const drop = (trap: ClickTrap) => {
    clearTimeout(trap.timer);
    armed = armed.filter((t) => t !== trap);
    if (!armed.length) window.removeEventListener('click', onClick, true);
  };
  function onClick(e: MouseEvent) {
    const pid = (e as Partial<PointerEvent>).pointerId;
    if (pid === -1 || e.detail === 0) return;
    const now = performance.now();
    const trap = armed.find(
      (t) =>
        now - t.t <= CLICK_TRAP_MS &&
        (typeof pid === 'number'
          ? pid === t.id
          : Math.hypot(e.clientX - t.x, e.clientY - t.y) <= CLICK_TRAP_PX),
    );
    if (!trap) return;
    drop(trap);
    e.preventDefault();
    e.stopPropagation();
  }
  return {
    /** Взвести ловушку отпускания: его указатель и точка, время — сейчас, срок — `ms`. */
    arm(pointerId: number, x: number, y: number, ms: number) {
      if (!armed.length) window.addEventListener('click', onClick, true);
      const trap: ClickTrap = { id: pointerId, x, y, t: performance.now() };
      trap.timer = setTimeout(() => drop(trap), ms);
      armed.push(trap);
    },
    /** Снять все — доска уходит. */
    clear() {
      armed.forEach((t) => clearTimeout(t.timer));
      armed = [];
      window.removeEventListener('click', onClick, true);
    },
  };
}

export type CalloutsPanelOptions = {
  /** Сколько указаний в панели: без предпочтения пустая панель свёрнута, полоска пишет число. */
  count: number;
  /** Ключ удержания «раскрыто на сеанс» — карточка: на соседней удержание не действует. */
  holdKey: number;
  /** Узел панели — владелец может слушать на нём свои просьбы (`FIELD_REVEAL_EVENT`). */
  panelRef: RefObject<HTMLDivElement | null>;
  /** Основа ключа предпочтений; без неё — ключ мудборда. */
  prefsBase?: string;
};

export function useCalloutsPanel({
  count,
  holdKey,
  panelRef,
  prefsBase = CALLOUTS_PREFS_KEY,
}: CalloutsPanelOptions) {
  /* ═══ ПАНЕЛЬ CALLOUTS — ШИРИНА, СВЁРНУТОСТЬ, РАЗДЕЛИТЕЛЬ (волна 25.09, D-11/D-12, T12/T13) ═══════
     Владелец: панель указаний занимала 340px всегда — и на пустой доске тоже. Теперь:
       · ширину тянут разделителем между доской и панелью (влево — шире), ←/→ на фокусе — по 16px;
         пол 240, потолок — меньшее из 720 и 60% ряда: доске всегда остаётся место;
       · шеврон в шапке сворачивает панель в полоску 28px с повёрнутой подписью `callouts · N`;
         вся полоска — одна дверь обратно;
       · без предпочтения пустая доска держит панель свёрнутой, а первое указание раскрывает её
         само (`calloutsCollapsed`); явный клик пишет предпочтение, и число больше не решает.
     Ширина и свёрнутость — ПРЕЗЕНТАЦИЯ (`use-callouts-prefs.ts`, localStorage на пользователя):
     форма об этом не узнаёт, автосейв не просыпается. */
  const panelId = useId();
  const { prefs: calloutPrefs, set: setCalloutPrefs } = useCalloutsPrefs(prefsBase);
  /* РАСКРЫТИЕ ПО ПРОСЬБЕ ПОВЕРХНОСТИ — НА СЕАНС, А НЕ В ПРЕДПОЧТЕНИЕ. Enter на кадре и «напиши, что
     это» после новой точки раскрывают свёрнутую панель: текст указания пишется только в ней. Это не
     выбор человека про панель, и его явное «свернуть» обязано пережить перезагрузку (ревью Codex,
     P2). Держится до следующего щелчка по шеврону или полоске. Ключ — карточка, которую раскрыли:
     на соседней карточке раскрытие не действует с первого же кадра, без эффекта-сброса. */
  const [heldFor, setHeldFor] = useState<number | null>(null);
  const heldOpen = heldFor === holdKey;
  const collapsed = !heldOpen && calloutsCollapsed(calloutPrefs.collapsed, count);
  /* ПАНЕЛЬ, СВЁРНУТАЯ ПРЕДПОЧТЕНИЕМ, ТОЖЕ РАСКРЫВАЕТСЯ НА ПРОСЬБУ «ПОКАЖИ ПОЛЕ» (раунд 3, m5). Якорь
     `callouts.N.description` стоит под `hidden={collapsed}`: раскрытая доска (`setOpen` выше) его не
     покажет, пока свёрнута сама панель, — и дверь с отказом по полю снова молчала бы. Раскрытие — на
     сеанс (`heldFor`), как у Enter на кадре: явное «свернуть» человека не переписывается. */
  useEffect(() => {
    const panel = panelRef.current;
    if (!panel || !collapsed) return;
    const onAsk = () => setHeldFor(holdKey);
    panel.addEventListener(FIELD_REVEAL_EVENT, onAsk);
    return () => panel.removeEventListener(FIELD_REVEAL_EVENT, onAsk);
  }, [collapsed, holdKey]);
  const separator = useRef<HTMLDivElement | null>(null);
  /** Ширина ряда «доска + панель» — меряется у родителя разделителя (сам ряд — `SectionStack`). */
  const [rowW, setRowW] = useState(0);
  useLayoutEffect(() => {
    const row = separator.current?.parentElement;
    if (!row) return;
    const measure = () => setRowW(Math.round(row.getBoundingClientRect().width));
    measure();
    if (typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(measure);
    ro.observe(row);
    return () => ro.disconnect();
  }, []);
  const panelW = clampCalloutsWidth(calloutPrefs.w, rowW);
  const resizeTo = (w: number) => setCalloutPrefs({ w: clampCalloutsWidth(w, rowW) });

  /* ФОКУС ЕДЕТ ЗА ДВЕРЬЮ — та же беда, что у свёрнутой `Section`: шеврон и полоска — два разных
     узла, и нажатие прячет тот, на котором стоял фокус. Переносится ТОЛЬКО после щелчка или Enter
     по двери: панель, раскрывшаяся сама (появилось первое указание) или рукой на разделителе,
     фокус не ворует — жест и клавиши живут на разделителе, а он стоит в обоих положениях. */
  const collapseDoor = useRef<HTMLSpanElement | null>(null);
  const expandDoor = useRef<HTMLSpanElement | null>(null);
  /** Дверь, на которую ставит фокус СЛЕДУЮЩИЙ коммит. */
  const focusNext = useRef<'strip' | 'chevron' | null>(null);
  const setCollapsed = (next: boolean) => {
    // Фокус едет за дверью, только если дверь на экране сменится.
    if (next !== collapsed) focusNext.current = next ? 'strip' : 'chevron';
    setHeldFor(null);
    setCalloutPrefs({ collapsed: next });
  };
  useLayoutEffect(() => {
    const door = focusNext.current;
    if (!door) return;
    focusNext.current = null;
    (door === 'strip' ? expandDoor : collapseDoor).current?.focus({ preventScroll: true });
  });

  /* ═══ ТЯНУТЬ, А НЕ ПОДГЛЯДЫВАТЬ (27.09, O-58, D-58) ═══════════════════════════════════════════
     Владелец, дословно: «в MOODBOARD на ховер CALLOUTS блок не должен ревиалится из фулл колапс
     состояния там просто должен менятся курсор на палочку с двумя стрелочками и мы должны иметь
     возможность менять размер колаут блока динамически как мы хотим вплот до доведения его до фулл
     колапса».

     Подгляда по наведению (O-52) больше нет: наведение на полоску и на шов меняет только курсор.
     Ширину ведёт ОДИН жест, и начинают его две ручки — разделитель в шве (от `lg` он стоит и при
     открытой панели, и при свёрнутой) и сама полоска. Ширина идёт за рукой, `w = w0 + (x0 − x)`,
     где `w0` — нарисованная ширина (у полоски 28). Ниже `CALLOUTS_COLLAPSE_BELOW` панель
     сворачивается прямо под рукой, от него — открыта шириной `clamp(w)`, то есть не уже пола.
     Предпочтение пишется по ходу: `collapsed` — на пересечении порога, `w` — только открытая
     ширина; на отпускании писать нечего.

     ЗАХВАТ — НА РАЗДЕЛИТЕЛЕ, откуда бы жест ни начался: его узел смонтирован всегда, и смена
     полоска ↔ панель посреди жеста захват не роняет (полоска уронила бы — она уходит из DOM).

     ЩЕЛЧОК ПО ПОЛОСКЕ — НАЖАТИЕ, УШЕДШЕЕ МЕНЬШЕ ЧЕМ НА 4px, И РЕШАЕТСЯ ОН НА ОТПУСКАНИИ — для мыши,
     касания и пера одинаково (ревью Codex r3). `click`, который браузер шлёт следом, — этого же
     отпускания, а не новая просьба, и попасть он может куда угодно: замерено в Chromium, `click`
     захваченной мыши уходит цели захвата (разделителю), а `click` касания ищется под пальцем — где
     после раскрытия уже шеврон «свернуть» или строка указания, а после жеста, раскрывшего панель, —
     её органы или кадр доски. Поэтому его съедает ловушка на ОКНЕ в фазе перехвата
     (`createClickTraps`), куда бы он ни попал; прежде глушение жило на полоске, которая к этому
     времени уже снята. Ловушка у каждого отпускания своя и узнаёт только `click` этого отпускания:
     по `pointerId`, а где его нет — по точке; живёт до него или секунду, и никакое нажатие её не
     снимает (ревью Codex r4–r5: прежняя снималась следующим нажатием, и отложенный `click` касания
     проходил, а без `pointerId` она глотала любой `click` страницы). У мыши ловушку взводит только
     жест с движением, и живёт она только до конца задачи отпускания: отложенного `click` у мыши нет
     (D-70′, D-70″).

     `click` БЕЗ НАЖАТИЯ — ДВЕРЬ ВСЕГДА. Клавиатура, ассистивная техника и `element.click()` шлют его
     с `pointerId` −1 и `detail` 0 (замерено), ловушка его не трогает, и полоска раскрывается своим
     `onClick`, как любая дверь.

     ОДИН ЖЕСТ — ОДИН УКАЗАТЕЛЬ (ревью Codex r3). Жест помнит свой `pointerId`: второй палец и не
     главный указатель его не начинают, не водят и не кончают.

     Ниже `lg` разделителя нет — нет и жеста: полоска там строка под доской и открывается щелчком.
     Окно, ушедшее ниже `lg` посреди жеста, кончает его НА САМОМ ПЕРЕХОДЕ (`matchMedia`, ревью
     Codex r4): Chromium не снимает захват с узла, ставшего `display: none` (замерено), и движения
     писали бы ширину панели, которой нет, а отпускание без движения раскрыло бы полоску.
     Предпочтение остаётся последним, записанным от `lg`. Движение и отпускание к тому же сами
     спрашивают, нарисован ли разделитель: переход может прийти в одном кадре с отпусканием, а доску
     сворачивают и посреди жеста. Стрелки разделителя посреди жеста молчат — ширину ведёт рука
     (ревью Codex r4). */
  const drag = useRef<{
    /** Указатель жеста: чужие события жест не водят и не кончают. */
    id: number;
    x: number;
    y: number;
    /** Нарисованная ширина в начале жеста: у полоски 28. */
    w: number;
    /** Сторона порога, на которой жест держит панель, — рендер отстаёт от потока `pointermove`. */
    open: boolean;
    /** Рука ушла на `DRAG_SLOP` — это жест, и щелчка у него нет. */
    moved: boolean;
    /** Начат с полоски: без движения это щелчок по ней. */
    strip: boolean;
  } | null>(null);
  const [dragging, setDragging] = useState(false);
  /** Ловушки `click` отпусканий этого монтажа (см. `createClickTraps`). */
  const [clickTraps] = useState(createClickTraps);
  useEffect(() => () => clickTraps.clear(), [clickTraps]);
  /** Кончить жест, не дожидаясь отпускания: снять и состояние, и захват. */
  const endDrag = useCallback(() => {
    const d = drag.current;
    drag.current = null;
    setDragging(false);
    const sep = separator.current;
    if (d && sep?.hasPointerCapture(d.id)) sep.releasePointerCapture(d.id);
  }, []);
  // Окно ушло ниже `lg` — жест кончается на самом переходе (см. шапку жеста).
  useEffect(() => {
    const lg = window.matchMedia(LG_UP);
    const onChange = () => {
      if (!lg.matches && drag.current) endDrag();
    };
    lg.addEventListener('change', onChange);
    return () => lg.removeEventListener('change', onChange);
  }, [endDrag]);
  /** Сторона порога — это предпочтение; открытая сторона несёт ширину. Удержание на сеанс снимается. */
  const settle = (fold: boolean, w = panelW) => {
    setHeldFor(null);
    setCalloutPrefs(
      fold ? { collapsed: true } : { collapsed: false, w: clampCalloutsWidth(w, rowW) },
    );
  };
  const grab = (e: React.PointerEvent, strip: boolean) => {
    const sep = separator.current;
    // Разделитель не нарисован (ниже `lg`, свёрнутая доска) — нет и жеста. Начинает его только
    // главный указатель и только левой кнопкой (касание и перо — тоже 0).
    if (!sep?.offsetWidth || !e.isPrimary || e.button !== 0) return;
    // Жест уже идёт — второе нажатие его не перехватывает. Состояние без захвата — след жеста,
    // потерявшего конец, и новому нажатию оно не мешает.
    const live = drag.current;
    if (live && sep.hasPointerCapture(live.id)) return;
    e.preventDefault();
    sep.setPointerCapture(e.pointerId);
    drag.current = {
      id: e.pointerId,
      x: e.clientX,
      y: e.clientY,
      w: panelRef.current?.offsetWidth ?? panelW,
      open: !collapsed,
      moved: false,
      strip,
    };
    setDragging(true);
  };
  const follow = (e: React.PointerEvent) => {
    const d = drag.current;
    if (!d || e.pointerId !== d.id) return;
    // Окно ушло ниже `lg` (или доска свернулась) посреди жеста — разделителя нет, жеста тоже.
    if (!separator.current?.offsetWidth) {
      endDrag();
      return;
    }
    if (Math.hypot(e.clientX - d.x, e.clientY - d.y) >= DRAG_SLOP) d.moved = true;
    // Влево — шире: панель стоит СПРАВА, и её левый край идёт за рукой.
    const w = d.w + (d.x - e.clientX);
    const open = w >= CALLOUTS_COLLAPSE_BELOW;
    if (open !== d.open) {
      d.open = open;
      settle(!open, w);
    } else if (open) resizeTo(w);
  };
  const release = (e: React.PointerEvent) => {
    const d = drag.current;
    if (!d || d.id !== e.pointerId) return;
    drag.current = null;
    setDragging(false);
    // Отменённый указатель и снятый захват `click` не шлют — съедать и раскрывать нечего.
    // Разделитель, пропавший без движения (окно ниже `lg` в том же кадре, свёрнутая доска), — жеста
    // нет, как в `follow`: ни раскрытия, ни ловушки.
    if (e.type !== 'pointerup' || !separator.current?.offsetWidth) return;
    // МЫШЬ — ТОЛЬКО ПОСЛЕ ЖЕСТА С ДВИЖЕНИЕМ И ТОЛЬКО ДО КОНЦА ЗАДАЧИ ОТПУСКАНИЯ (D-70′, D-70″).
    // Отложенного `click` у мыши не бывает: любой движок шлёт его синхронно, в той же задаче, что
    // `pointerup` и `mouseup`, — или не шлёт вовсе (жест раскрыл панель, полоска снята: Chromium
    // `click` не шлёт, замерено). Ловушка простого щелчка или жеста, снявшего полоску, иначе
    // секунду ждала бы, чтобы съесть следующий честный щелчок мыши. Срок мыши — макрозадача
    // (`setTimeout` 0), не микрозадача: чекпоинт микрозадач стоит между `pointerup` и `click`, и
    // ловушка умерла бы до него. Касание и перо — ловушка всегда и на секунду: их `click` ищется
    // под пальцем и приходит позже.
    const mouse = e.pointerType === 'mouse';
    const trapMs = mouse ? 0 : CLICK_TRAP_MS;
    if (!mouse || d.moved) clickTraps.arm(e.pointerId, e.clientX, e.clientY, trapMs);
    // Нажатие на полоске без движения — щелчок по ней (см. шапку жеста).
    if (d.strip && !d.moved) setCollapsed(false);
  };

  /** Раскрыть на сеанс (просьба поверхности); предпочтение человека не переписывается. */
  const hold = useCallback(() => setHeldFor(holdKey), [holdKey]);

  return {
    count,
    collapsed,
    hold,
    panelId,
    panelRef,
    separator,
    rowW,
    panelW,
    dragging,
    drag,
    grab,
    follow,
    release,
    settle,
    resizeTo,
    setCollapsed,
    collapseDoor,
    expandDoor,
  };
}

export type CalloutsPanelState = ReturnType<typeof useCalloutsPanel>;

export function CalloutsPanel({
  panel,
  hidden,
  tag,
  note,
  where,
  className,
  children,
}: {
  panel: CalloutsPanelState;
  /** Спрятать разделитель и панель вместе (свёрнутая доска); состояние меню при этом живёт. */
  hidden?: boolean;
  /** Префикс data-атрибутов: `data-<tag>-callouts…` (мудборд — `mb`). */
  tag: string;
  /** Счётчик в шапке, слева от шеврона. */
  note?: ReactNode;
  /** Хвост подписи полоски для чтеца: `expand the callouts panel · N <where>`. */
  where: string;
  /** Шов блока `callouts`. */
  className?: string;
  children: ReactNode;
}) {
  const {
    count,
    collapsed,
    panelId,
    panelRef,
    separator,
    rowW,
    panelW,
    dragging,
    drag,
    grab,
    follow,
    release,
    settle,
    resizeTo,
    setCollapsed,
    collapseDoor,
    expandDoor,
  } = panel;
  const open = !hidden;
  const data = (part: string) => ({ [`data-${tag}-callouts${part}`]: '' });
  return (
    <>
      {/* ═══ РАЗДЕЛИТЕЛЬ ДОСКИ И ПАНЕЛИ (волна 25.09, D-11) ═══════════════════════════════════
        Стоит В ШВЕ между блоками, а не рисует его: шов остаётся грунтом в 24px (разделитель
        8px и отрицательные поля `-mx-4` съедают ровно свою ширину у двух зазоров ряда), линия
        не рисуется в покое — только короткая метка-хватка, чернеющая под рукой. Полная линия
        встаёт лишь на время перетаскивания: это «шов в движении», а не второй контур блока.
        Только от `lg` — ниже панель стоит под доской во всю ширину, и тянуть нечего. Всегда
        смонтирован (прячется атрибутом), потому что по нему меряется ширина ряда.

        O-58: СТОИТ И ПРИ СВЁРНУТОЙ ПАНЕЛИ — рядом с полоской, той же хваткой; жест ширины
        захватывается здесь, откуда бы ни начался (см. шапку жеста). Свёрнутая панель — ширина 0
        для `aria-valuenow`; ← из неё раскрывает на полу, → на полу сворачивает. */}
      <div
        ref={separator}
        role='separator'
        aria-orientation='vertical'
        aria-label='resize the callouts panel'
        aria-controls={panelId}
        aria-valuenow={collapsed ? 0 : panelW}
        aria-valuemin={0}
        aria-valuemax={calloutsMaxWidth(rowW)}
        tabIndex={0}
        hidden={!open}
        {...data('-resize')}
        data-dragging={dragging || undefined}
        className='group relative hidden w-2 shrink-0 cursor-col-resize touch-none select-none self-stretch focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-0 focus-visible:outline-textColor lg:-mx-4 lg:block'
        onPointerDown={(e) => grab(e, false)}
        onPointerMove={follow}
        onPointerUp={release}
        onPointerCancel={release}
        onLostPointerCapture={release}
        onKeyDown={(e) => {
          // Посреди жеста указателя стрелки — по-прежнему клавиши разделителя, но молчат: ширину
          // ведёт рука, и шаг клавиши её следующее движение отменило бы от своей точки отсчёта.
          if (drag.current && (e.key === 'ArrowLeft' || e.key === 'ArrowRight')) {
            e.preventDefault();
            return;
          }
          if (e.key === 'ArrowLeft') {
            if (collapsed) settle(false, CALLOUTS_MIN_W);
            else resizeTo(panelW + CALLOUTS_KEY_STEP);
          } else if (e.key === 'ArrowRight') {
            // Свёрнутая панель — край шкалы: делать нечего, но клавиша по-прежнему разделителя, а
            // не страницы, которая иначе поехала бы вбок (ревью Codex r3).
            if (!collapsed) {
              if (panelW <= CALLOUTS_MIN_W) settle(true);
              else resizeTo(panelW - CALLOUTS_KEY_STEP);
            }
          } else return;
          e.preventDefault();
        }}
      >
        {/* Линия перетаскивания — на всю высоту ряда, только пока тянут. */}
        <span
          aria-hidden
          className='pointer-events-none absolute inset-y-0 left-1/2 hidden w-px -translate-x-1/2 bg-textColor group-data-[dragging]:block'
        />
        {/* Хватка: липкая, чтобы её было видно и у длинной ленты кадров. */}
        <span
          aria-hidden
          className='pointer-events-none sticky top-gutter mx-auto block h-8 w-0.5 bg-borderColor transition-colors duration-150 group-hover:bg-textColor group-focus-visible:bg-textColor group-data-[dragging]:bg-textColor motion-reduce:transition-none'
        />
      </div>

      {/* БОКОВОЕ МЕНЮ УКАЗАНИЙ (B-9) — ТОТ ЖЕ ОРГАН, что стоит справа от листа в ARTIFACTS, и
        теперь буквально тот же: заголовок `callouts`, счётчик пилюлей, строка на указание,
        правка выбранной строки внутри неё. Липкое от `lg` — панель стоит рядом ровно с тем,
        что комментирует, и не уезжает, пока человек листает ленту.
        `caps` ПЕРЕДАЁТСЯ — у мудбордного указания редактор наконечника был всегда (он стоял в
        `AnnotationEditor` под кадрами), и переезд правки в панель не имел права его терять.

        ⚠ ВОЛНА 25.09: ПАНЕЛЬ БОЛЬШЕ НЕ РАЗМОНТИРУЕТСЯ СВЁРТКОЙ ДОСКИ — прячется атрибутом, как
        DESCRIPTION и черновик ниже (`hidden` побеждает любой `display`, preflight). Состояние
        меню (выбранная строка, взвод «+ point», просьба фокуса) переживает сворачивание. Ширина
        — CSS-переменной `--cw` на обёртке, от `lg`; свёрнутая панель — полоска 28px.

        O-52 (26.09): СВЁРНУТАЯ ОБЁРТКА РОСТОМ С РЯД (`self-stretch`), то есть с доску рядом:
        полоска стоит вровень с блоком доски сверху и снизу. Открытая панель — прежняя: липкая,
        ростом с содержимое. */}
      <div
        ref={panelRef}
        id={panelId}
        hidden={!open}
        {...data('')}
        data-collapsed={collapsed || undefined}
        style={{ '--cw': `${panelW}px` } as React.CSSProperties}
        className={cn(
          'min-w-0 lg:shrink-0',
          collapsed
            ? 'lg:w-[28px] lg:self-stretch'
            : 'lg:sticky lg:top-gutter lg:w-[var(--cw)] lg:self-start',
        )}
      >
        {collapsed && (
          /* СВЁРНУТАЯ ПАНЕЛЬ — ОДНА ДВЕРЬ ЦЕЛИКОМ, как свёрнутый блок `Section`: имя, число и
           знак, внутри ни одного другого органа. От `lg` — вертикальная полоска во всю высоту
           ряда: подпись стоит ровно посередине по обеим осям (O-52), знак — у верхнего края,
           вне потока, чтобы не сдвигать подпись со середины; симметричные 32px сверху и снизу
           оставляют знаку место и на короткой доске. Подпись ЛИПКАЯ сверху и снизу (ревью): в
           окне ниже доски середина полоски уходит за край экрана, и подпись держится в
           видимой части полоски, не выходя из неё. Ниже `lg` — обычная строка во всю ширину.
           Дверь — `span`, а не кнопка: её не гасит `<fieldset disabled>` выпущенной карты (см.
           `onDoorKey` в callout-rail.tsx).
           O-58: от `lg` полоска — ещё и ручка ширины (курсор `col-resize`): нажатие на ней
           начинает жест разделителя, щелчок без движения раскрывает (см. шапку жеста). */
          <span
            ref={expandDoor}
            role='button'
            tabIndex={0}
            onPointerDown={(e) => grab(e, true)}
            // `click` жеста сюда не доходит (его съедает ловушка отпускания); доходит щелчок без
            // нажатия — клавиатуры, ассистивной техники, ниже `lg` — обычный. Посреди жеста
            // `click` — чужой (второго пальца), а не двери.
            onClick={() => {
              if (!drag.current) setCollapsed(false);
            }}
            onKeyDown={onDoorKey(() => setCollapsed(false))}
            aria-expanded={false}
            aria-controls={panelId}
            aria-label={`expand the callouts panel · ${count} ${where}`}
            {...data('-strip')}
            className='group flex w-full cursor-pointer items-center justify-between gap-2 border border-borderColor bg-bgColor px-block py-2.5 text-left focus-visible:outline focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-textColor lg:relative lg:h-full lg:cursor-col-resize lg:touch-none lg:flex-col lg:justify-center lg:px-0 lg:py-8'
          >
            <Text
              size='micro'
              variant='uppercase'
              tracking='label'
              component='span'
              {...data('-label')}
              className='whitespace-nowrap text-labelColor group-hover:text-textColor lg:sticky lg:top-gutter lg:bottom-gutter lg:[writing-mode:vertical-rl]'
            >
              callouts · {count}
            </Text>
            <Arrow
              aria-hidden
              className='shrink-0 rotate-180 text-labelColor group-hover:text-textColor lg:absolute lg:left-1/2 lg:top-2.5 lg:-translate-x-1/2 lg:-rotate-90'
            />
          </span>
        )}
        <div hidden={collapsed} className='contents'>
          <Section
            title='callouts'
            action={
              <span className='flex items-center gap-2'>
                {note}
                <span
                  ref={collapseDoor}
                  role='button'
                  tabIndex={0}
                  onClick={() => setCollapsed(true)}
                  onKeyDown={onDoorKey(() => setCollapsed(true))}
                  aria-expanded
                  aria-controls={panelId}
                  aria-label='collapse the callouts panel'
                  {...data('-collapse')}
                  className='group cursor-pointer px-1 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-textColor'
                >
                  {/* Тот же знак, что у каждой свёртки админки, повёрнутый к краю, куда панель
                    уходит: вправо от `lg`, вверх ниже. */}
                  <Arrow
                    aria-hidden
                    className='shrink-0 text-labelColor group-hover:text-textColor lg:rotate-90'
                  />
                </span>
              </span>
            }
            className={className}
          >
            {children}
          </Section>
        </div>
      </div>
    </>
  );
}
