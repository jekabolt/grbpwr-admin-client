import * as Dialog from '@radix-ui/react-dialog';
import { cn } from 'lib/utility';
import { useSnackBarStore } from 'lib/stores/store';
import { Fragment, useCallback, useMemo, useRef, useState, type ReactNode } from 'react';
import { useFormContext, useFormState, useWatch } from 'react-hook-form';
import { Button } from 'ui/components/button';
import { Chip } from 'ui/components/chip';
import { ConfirmationModal } from 'ui/components/confirmation-modal';
import { Pill } from 'ui/components/pill';
import Text from 'ui/components/text';

import type { AssemblyBlock } from './assembly-blocks';
import { AssemblyCanvas, ZOOM_STEP, type CanvasHandle, type CanvasHint } from './assembly-canvas';
import type { CreatePrefill } from './assembly-create-dialog';
import type { AssemblyResult, AssemblyStep } from './assembly-frontier';
import type { PieceCloth } from './piece-cloth';
import type { TechCardFormData } from './schema';
import { DOCK_DEFAULT, DOCK_MAX, DOCK_MIN, usePanelPrefs } from './use-panel-prefs';
import type { PieceShapeMap } from './use-piece-shapes';
import type { useSchematicPrefs } from './use-schematic-prefs';

// ФУЛСКРИН СХЕМЫ СБОРКИ — ТРЕТИЙ ВИД, а не отдельный экран.
//
// Он ребёнок `OperationsField` и не заводит НИ ОДНОГО собственного мутатора (R3): `useFieldArray`
// по операциям существует в единственном экземпляре — там, наверху, — и всё, что фулскрину нужно
// (поля, мутаторы, выбор, незавершённое создание, предпочтения), приезжает пропами. Второй
// экземпляр field array не синхронизируется с первым: его мутаторы не вещают, и два вида начали бы
// расходиться молча.
//
// ПОКА ФУЛСКРИН ОТКРЫТ, ИНЛАЙНОВЫЙ БЛОК «SEQUENCE» НЕ РЕНДЕРИТСЯ ВОВСЕ. Иначе на одни и те же
// имена полей смонтированы ДВА `OperationEditor`, и каждое поле имеет двух писателей.
//
// РЕДАКТОР ШАГА ПРИЕЗЖАЕТ БИЛДЕРОМ, а не готовым элементом. `OperationEditor` — приватная функция
// `operations-field.tsx` с полутора десятками пропов, и вытаскивать её наружу ради фулскрина
// значило бы затеять незапланированный рефакторинг ровно там, где он опаснее всего. Билдер
// замыкает её со всеми пропами (включая key-контракт `id:index`), а обработчик «＋ piece» решает
// ФУЛСКРИН и передаёт аргументом: в Ф3 это снекбар-заглушка, в Ф5в её заменит арм режима добора —
// и `operations-field.tsx` для этого трогать не придётся.
//
// ВСЁ ПРЕЗЕНТАЦИОННОЕ ИДЁТ МИМО ФОРМЫ. Позиции, зум, панорама, высоты панелей, открытость дока —
// ничего из этого не касается RHF: иначе перетаскивание ноды взводило бы `isDirty`, а с ним
// beforeunload и заряженный Save на карточке, которую никто не менял.

/** Высота строки-заглушки между хромом и полотном. Тот же зазор, что у прочих треков грида. */
const GRID_GAP = 8;

/**
 * Шпаргалка. Список — данные, а не разметка: клавиша, попавшая в роутер и забытая здесь, — та же
 * ложь, что подпись про несуществующую клавишу.
 *
 * `[` (полка деталей) тут НЕ значится: она приедет в Ф5.
 */
const HELP_KEYS: [string, string][] = [
  ['v · h', 'select tool · pan tool'],
  ['space', 'pan while held'],
  ['f · ⌘1', 'fit everything on screen'],
  ['⌘0', 'zoom back to 100%'],
  ['+ · −', 'zoom in · out'],
  ['⇧2', 'frame the selection'],
  ['⌘a', 'pick everything on the table'],
  ['drag on empty ground', 'marquee — touching a node picks it (shift adds)'],
  ['arrows', 'nudge the picked by 8px (shift: 1px)'],
  ['u', 'join the picked into a unit'],
  ['o', 'an operation on the picked'],
  ['d', 'dissolve the picked unit'],
  ['⌘z', 'undo the last gesture'],
  ['⌘f', 'find a piece or a unit'],
  [']', 'collapse or open the step dock'],
  ['esc', 'find → shortcuts → selection → leave'],
];

export type AssemblyFullscreenProps = {
  blocks: AssemblyBlock[];
  steps: AssemblyStep[];
  res: AssemblyResult;
  pieces: { lineKey: string; name: string }[];
  pieceNameOf: (lineKey: string) => string;
  /** Короткая подпись шага — та же, что у `AssemblySchematic`. */
  labelOf: (index: number) => string;
  pieceShapes: PieceShapeMap;
  smvOfBlock: Map<string, string>;
  /**
   * ЦЕЛИКОМ объект результата `use-schematic-prefs`, а не разложенный на `positions`/`onMove`/…
   * После Ф5б в нём появится ось группировки полки, и она обязана дойти до потребителя без правки
   * `operations-field.tsx`.
   */
  prefs: ReturnType<typeof useSchematicPrefs>;
  selectedIndex: number;
  /** Открыть шаг. ЕДИНСТВЕННОЕ, что открывает док. */
  onPickStep: (index: number) => void;
  setSelected: (index: number) => void;
  setPendingCreate: (p: CreatePrefill | null) => void;
  /** Потребитель — Ф4. */
  dissolveUnit: (stepIndex: number) => void;
  /** Потребитель — Ф5в (режим добора деталей в шаг). */
  addInputToOperation: (index: number, key: string) => void;
  addOperation: () => void;
  /** Потребитель — Ф6в (перестановка шагов в списке). */
  moveOperation: (from: number, to: number) => void;
  /**
   * Отмена последнего жеста, глубина 1. Инверсию делает `operations-field.tsx` — там же, где
   * мутаторы (R3); фулскрин только зовёт её и показывает чип. Гейт заморозки и отказ словами — на
   * той стороне: отказывать обязан тот, кто знает, что именно отменял.
   */
  onUndo: () => void;
  /** Подпись чипа: `undo — create step 90` либо `nothing to undo`. Считается `last-mutation.ts`. */
  undoTitle: string;
  /** Есть ли что отменять. Чип без записи задизейблен, а не молчит при нажатии. */
  canUndo: boolean;
  /**
   * В доке начали править поля. ВОСЬМАЯ ИЗ ДЕВЯТИ ТОЧЕК СБРОСА записи отмены: жестовый ⌘Z обещает
   * «ой» сразу после жеста, а не откат всего, что напечатали следом.
   */
  onDockEdit: () => void;
  /** Строит настоящий `OperationEditor` открытого шага; аргумент — обработчик «＋ piece». */
  renderDockEditor: (onFlashPieces: () => void) => ReactNode;
  /** Второй экземпляр `<StepNumberDrift />`: корневой остался под оверлеем и не виден. */
  dockChrome: ReactNode;
  frozen: boolean;
  /** Ф4+: восстановленный черновик меняет то, что фулскрин вправе делать при входе. */
  draftPending: boolean;
  onSave: () => void;
  saving: boolean;
  pieceClothByColorway: { label: string; map: Map<string, PieceCloth> }[];
  /** ЗАРЕЗЕРВИРОВАН: наполнит Ф6б (`construction-tab.tsx`). */
  sketchNote?: ReactNode;
  /** Закрыть фулскрин. Снимает `?fs=1` — механика URL живёт в `OperationsField`. */
  onExit: () => void;
};

/**
 * Клавиши-глаголы не срабатывают, пока набирают текст.
 *
 * `closest`, а не сравнение тега: Radix Select — это `<button role="combobox">` с тайпахедом по
 * буквам, и событие приходит с его внутреннего спана. Без гарда буква в поле заметки дёргала бы
 * полотно, а в Ф4 та же буква растворяла бы узел.
 *
 * `option`/`listbox` — про тот же селект, но РАСКРЫТЫЙ: его список живёт в собственном портале,
 * фокус стоит на пункте (`[role="option"]`), а React-события из портала вещают по дереву
 * компонентов — то есть прилетают в роутер фулскрина. Без этих двух селекторов тайпахед по
 * буквам в раскрытом списке («f» в поиске fusing) вписывал бы полотно и брал ладонь.
 */
const TYPING_TARGETS =
  'input, textarea, select, button, [role="combobox"], [role="radio"], [role="option"], [role="listbox"], [contenteditable=""], [contenteditable="true"]';

const isTyping = (target: EventTarget | null): boolean => {
  const el = target as HTMLElement | null;
  return !!el?.closest?.(TYPING_TARGETS);
};

/**
 * Гард ⌘Z и ⌘A — УЖЕ, чем гард глаголов, и намеренно.
 *
 * Глаголы уступают всякому органу: буква на кнопке или в раскрытом селекте не жест полотна. А ⌘Z
 * уступает ровно НАБОРУ ТЕКСТА — там он родной откат ввода. Пропусти сюда `button`, и отмена
 * умирала бы после каждого нажатия чипа: фокус остаётся на кнопке, а ⌘Z оттуда уже «в поле».
 * Ровно так же ⌘A: в тексте это выделить текст, на кнопке — выделить всё на столе.
 */
const TEXT_TARGETS = 'input, textarea, [contenteditable=""], [contenteditable="true"]';

const isTextField = (target: EventTarget | null): boolean => {
  const el = target as HTMLElement | null;
  return !!el?.closest?.(TEXT_TARGETS);
};

/**
 * Отказ выпущенной карточки. ОДНА формулировка на все органы, включая инверсию отмены в
 * `operations-field.tsx` (она импортирует её отсюда): два текста об одном правиле читаются как два
 * разных правила.
 */
export const FROZEN_REFUSAL = 'the card is released — it can be read and laid out, not edited';

export function AssemblyFullscreen({
  blocks,
  steps,
  res,
  pieces,
  pieceNameOf,
  labelOf,
  pieceShapes,
  smvOfBlock,
  prefs,
  selectedIndex,
  onPickStep,
  setPendingCreate,
  dissolveUnit,
  addOperation,
  onUndo,
  undoTitle,
  canUndo,
  onDockEdit,
  renderDockEditor,
  dockChrome,
  frozen,
  onSave,
  saving,
  pieceClothByColorway,
  sketchNote,
  onExit,
}: AssemblyFullscreenProps) {
  const showMessage = useSnackBarStore((st) => st.showMessage);
  const canvasRef = useRef<CanvasHandle>(null);
  const gridRef = useRef<HTMLDivElement>(null);

  // ДОК ЗАКРЫТ ПРИ ВХОДЕ — и это ОТДЕЛЬНОЕ состояние, а не производная от `selectedIndex`.
  // Производная равна −1 только при нуле шагов: на любой карточке с операциями она ≥ 0 с первого
  // кадра, и выведенный из неё док был бы открыт с порога — то есть весь возврат высоты полотна
  // (+176px) аннулирован ровно там, где фулскрин и открывают.
  const [dockStep, setDockStep] = useState<number | null>(null);
  const dockOpen = dockStep !== null;

  // Выбор живёт здесь, а не в полотне: его гасит Esc-лестница, а лестница одна на экран.
  const [picked, setPicked] = useState<string[]>([]);
  const [hint, setHint] = useState<CanvasHint>(null);
  const [resetOpen, setResetOpen] = useState(false);
  // Две верхние ступени Esc-лестницы. Обе — состояния экрана, а не полотна: гасит их лестница, а
  // лестница одна.
  const [findOpen, setFindOpen] = useState(false);
  const [helpOpen, setHelpOpen] = useState(false);

  const { prefs: panels, set: setPanels } = usePanelPrefs();
  const dockH = panels.dockH ?? DOCK_DEFAULT;

  const cloth = pieceClothByColorway[0]?.map ?? null;

  /**
   * Клик по шагу ВНУТРИ фулскрина — единственное, что открывает док. `onPickStep` родителя зовётся
   * тоже: за ним стоит прокрутка инлайнового редактора, которая понадобится после выхода.
   */
  const pickStep = useCallback(
    (index: number) => {
      onPickStep(index);
      setDockStep(index);
    },
    [onPickStep],
  );

  const closeDock = useCallback(() => setDockStep(null), []);

  const toggleDock = useCallback(() => {
    setDockStep((cur) => (cur === null ? Math.max(0, selectedIndex) : null));
  }, [selectedIndex]);

  /**
   * «＋ piece» редактора. Решение принимает ФУЛСКРИН, а не `operations-field`: полка деталей —
   * его орган, и в Ф5в этот же колбэк включит режим добора, не тронув файл с мутаторами.
   *
   * Жест обязан иметь видимое следствие: молчащая кнопка читается как сломанная.
   */
  const flashPieces = useCallback(() => {
    showMessage(
      'the pieces shelf arrives in a later phase — exit fullscreen to add pieces to this step',
      'error',
    );
  }, [showMessage]);

  const addStepFromDock = () => {
    // Гейт на СТОРОНЕ ВЫЗОВА, хотя мутатор гейтован и сам: без него `setDockStep` открыл бы док на
    // индексе шага, которого заморозка не дала создать.
    if (frozen) return;
    const at = steps.length;
    addOperation();
    setDockStep(at);
  };

  // --- глаголы выделения --------------------------------------------------------------------------
  //
  // КАЖДЫЙ НАЧИНАЕТСЯ С ГЕЙТА ЗАМОРОЗКИ И ПОВТОРЯЕТ ГЕЙТ СВОЕЙ КНОПКИ. Мутаторы гейтованы и сами,
  // но молчаливый выход мутатора — не отказ: человек нажал клавишу, ничего не произошло, и объяснить
  // это некому. Клавиша обязана уметь ровно то же, что кнопка, и отказывать теми же словами.
  //
  // И КАЖДЫЙ КОНЧАЕТСЯ `setPendingCreate` (R1). Ни тип операции, ни зона, ни машина жестом не
  // подставляются: подставленное значение проходит все проверки и уезжает на печать как
  // утверждение, которого никто не делал. Прототип здесь НЕ эталон.

  const onTable = useMemo(() => new Set(res.frontier), [res]);

  const sewSelection = useCallback(() => {
    if (frozen) {
      showMessage(FROZEN_REFUSAL, 'error');
      return;
    }
    if (picked.length < 2) {
      showMessage(
        'a unit needs at least two nodes picked — draw a marquee or click their heads',
        'error',
      );
      return;
    }
    setPendingCreate({ inputKeys: picked, intent: 'unit' });
    setPicked([]);
  }, [frozen, picked, setPendingCreate, showMessage]);

  const processSelection = useCallback(() => {
    if (frozen) {
      showMessage(FROZEN_REFUSAL, 'error');
      return;
    }
    if (picked.length === 0) {
      showMessage('pick a piece or a unit first', 'error');
      return;
    }
    setPendingCreate({ inputKeys: picked, intent: 'process' });
    setPicked([]);
  }, [frozen, picked, setPendingCreate, showMessage]);

  const dissolveSelection = useCallback(() => {
    if (frozen) {
      showMessage(FROZEN_REFUSAL, 'error');
      return;
    }
    // ТОТ ЖЕ ГЕЙТ, ЧТО У КНОПКИ В БОКСЕ: ровно один узел, и он на столе. В прототипе это был
    // починенный дефект — клавиша растворяла произвольного члена маркизы.
    const free = picked.filter((k) => onTable.has(k));
    if (free.length !== 1 || !res.units.has(free[0])) {
      showMessage(
        'dissolve needs exactly one unit picked, and it must still be on the table',
        'error',
      );
      return;
    }
    const block = blocks.find((b) => b.key === free[0]);
    if (!block) {
      showMessage(`“${free[0]}” has no producing step to dissolve`, 'error');
      return;
    }
    dissolveUnit(block.producedAt);
    setPicked([]);
  }, [frozen, picked, onTable, res, blocks, dissolveUnit, showMessage]);

  const undo = useCallback(() => {
    // Гейт стоит и здесь, и внутри `onUndo`: молчаливый выход мутатора отказом не является, а
    // произносит отказ сторона, знающая, что именно отменялось.
    if (frozen) {
      showMessage(FROZEN_REFUSAL, 'error');
      return;
    }
    onUndo();
  }, [frozen, onUndo, showMessage]);

  const fitSelection = useCallback(() => {
    if (picked.length === 0) {
      showMessage('nothing picked — the view has nothing to frame', 'error');
      return;
    }
    canvasRef.current?.fitSelection();
  }, [picked, showMessage]);

  // --- find-палитра -------------------------------------------------------------------------------
  //
  // Полка говорит, ЧТО существует; палитра — ГДЕ оно лежит. Доводка панорамой минимальным сдвигом
  // (`revealDelta`): найденная деталь рядом с той, что уже перед глазами, не имеет права увозить
  // весь экран.

  const [findQuery, setFindQuery] = useState('');
  const [findIndex, setFindIndex] = useState(0);
  const findInputRef = useRef<HTMLInputElement>(null);

  const findRows = useMemo(() => {
    const rows: { key: string; label: string; sub: string }[] = [];
    for (const [key, unit] of res.units) rows.push({ key, label: `▣ ${key}`, sub: unit.name });
    if ((blocks.find((b) => b.key === '')?.steps.length ?? 0) > 0) {
      rows.push({ key: '', label: '◌ outside units', sub: 'steps outside any unit' });
    }
    for (const p of pieces) rows.push({ key: p.lineKey, label: p.lineKey, sub: p.name });
    return rows;
  }, [res, blocks, pieces]);

  const findHits = useMemo(() => {
    const q = findQuery.trim().toLowerCase();
    const all = q
      ? findRows.filter((r) => `${r.label} ${r.sub}`.toLowerCase().includes(q))
      : findRows;
    return all.slice(0, 40);
  }, [findRows, findQuery]);

  const openFind = useCallback(() => {
    // ПОВТОРНЫЙ ⌘F НЕ СТИРАЕТ ЗАПРОС, а выделяет его — как родной поиск: набранное слово чаще
    // хотят уточнить, чем выбросить.
    if (!findOpen) {
      setFindQuery('');
      setFindIndex(0);
    }
    setFindOpen(true);
    // Поле монтируется этим же рендером — фокус ставится следующим кадром, иначе его некуда ставить.
    requestAnimationFrame(() => {
      findInputRef.current?.focus();
      findInputRef.current?.select();
    });
  }, [findOpen]);

  const chooseFind = useCallback(
    (i: number) => {
      const hit = findHits[i];
      if (!hit) return;
      setFindOpen(false);
      // ВЫБИРАЕТСЯ ТОЛЬКО ТО, ЧТО НА СТОЛЕ. Съеденная деталь и хвостовой бокс входами не годятся, и
      // эффект очистки выбора всё равно выбросил бы их следующим кадром — мигание вместо ответа.
      if (onTable.has(hit.key)) setPicked([hit.key]);
      canvasRef.current?.reveal(hit.key);
    },
    [findHits, onTable],
  );

  // --- сплиттер дока ------------------------------------------------------------------------------
  //
  // Порт `wireSplit`/`setBar` прототипа. Во время перетаскивания высота пишется ПРЯМО в CSS-переменную
  // грида, а в предпочтения уходит только по отпусканию: состояние React на каждый кадр
  // перерисовывало бы редактор шага целиком, со всеми его двумя десятками полей.
  const splitRef = useRef<{ pointerId: number; fromY: number; base: number } | null>(null);
  const liveH = useRef(dockH);

  const writeDockH = (px: number) => {
    const v = Math.min(DOCK_MAX, Math.max(DOCK_MIN, px));
    liveH.current = v;
    gridRef.current?.style.setProperty('--dock-h', `${v}px`);
  };

  const onSplitDown = (e: React.PointerEvent) => {
    if (!dockOpen || e.button !== 0) return;
    splitRef.current = { pointerId: e.pointerId, fromY: e.clientY, base: liveH.current };
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    e.preventDefault();
  };
  const onSplitMove = (e: React.PointerEvent) => {
    const s = splitRef.current;
    if (!s || e.pointerId !== s.pointerId) return;
    // dir = −1: сплиттер стоит НАД доком, и движение вверх обязано его растить.
    writeDockH(s.base - (e.clientY - s.fromY));
  };
  const onSplitUp = (e: React.PointerEvent) => {
    const s = splitRef.current;
    if (!s || e.pointerId !== s.pointerId) return;
    splitRef.current = null;
    setPanels({ dockH: liveH.current });
  };

  // --- роутер клавиш ------------------------------------------------------------------------------

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.defaultPrevented || e.repeat) return;
    if (e.metaKey || e.ctrlKey) {
      // Модификаторные — ДО typing-гарда глаголов: ⌘0/⌘1 текста не набирают. Уступают они не
      // всякому органу, а НАБОРУ ТЕКСТА (`isTextField`), и каждой — по своей причине.
      const k = e.key.toLowerCase();
      if (k === 'f') {
        // ⌘F не уступает никому: родного поиска внутри модального оверлея нет вовсе, а палитра
        // ничего не меняет. Открытую — просто пере-фокусирует.
        openFind();
        e.preventDefault();
        return;
      }
      // ⇧⌘Z — это redo, а redo здесь НЕТ. Тихо отменить вместо него — худшее, что можно сделать:
      // человек просил вернуть, а получил ещё один шаг назад.
      if (k === 'z' && !e.shiftKey) {
        if (isTextField(e.target)) return; // в поле — родной откат ввода
        undo();
        e.preventDefault();
        return;
      }
      if (k === 'a') {
        if (isTextField(e.target)) return; // в поле — выделить текст
        setPicked([...res.frontier]); // всё, что на столе
        e.preventDefault();
        return;
      }
      if (e.key === '0') {
        canvasRef.current?.zoomReset();
        e.preventDefault();
      } else if (e.key === '1') {
        canvasRef.current?.fit();
        e.preventDefault();
      }
      return;
    }
    if (isTyping(e.target)) return;
    // ⇧2 — кадрировать выделение. По `code`, а не по `key`: на не-латинской раскладке Shift+2 даёт
    // не «@», и клавиша молча пропала бы ровно у той половины пользователей, что печатает кириллицей.
    if (e.shiftKey && (e.code === 'Digit2' || e.key === '@')) {
      fitSelection();
      e.preventDefault();
      return;
    }
    switch (e.key) {
      case ' ':
        canvasRef.current?.setSpaceHand(true);
        e.preventDefault();
        break;
      case '+':
      case '=':
        canvasRef.current?.zoomBy(ZOOM_STEP);
        e.preventDefault();
        break;
      case '-':
        canvasRef.current?.zoomBy(1 / ZOOM_STEP);
        e.preventDefault();
        break;
      case 'f':
        canvasRef.current?.fit();
        e.preventDefault();
        break;
      case 'v':
        canvasRef.current?.setTool('select');
        e.preventDefault();
        break;
      case 'h':
        canvasRef.current?.setTool('hand');
        e.preventDefault();
        break;
      case 'u':
        sewSelection();
        e.preventDefault();
        break;
      case 'o':
        processSelection();
        e.preventDefault();
        break;
      case 'd':
        dissolveSelection();
        e.preventDefault();
        break;
      case '?':
      case '/':
        setHelpOpen((v) => !v);
        e.preventDefault();
        break;
      case 'ArrowLeft':
      case 'ArrowRight':
      case 'ArrowUp':
      case 'ArrowDown': {
        // Ноды двигает СТРЕЛКА, а не форма: это раскладка. Пустой выбор — не отказ, а отсутствие
        // жеста: объяснять нечего, и снекбар был бы шумом на каждое нажатие стрелки.
        if (picked.length === 0) break;
        const d = e.shiftKey ? 1 : 8;
        const dx = e.key === 'ArrowLeft' ? -d : e.key === 'ArrowRight' ? d : 0;
        const dy = e.key === 'ArrowUp' ? -d : e.key === 'ArrowDown' ? d : 0;
        canvasRef.current?.nudge(dx, dy);
        e.preventDefault();
        break;
      }
      case ']':
        toggleDock();
        e.preventDefault();
        break;
      case '[':
        // Полка деталей приедет в Ф5. До неё клавиша молчит — обещать полосой подсказок то, чего
        // нет, хуже, чем не обещать ничего. По той же причине её нет и в шпаргалке.
        break;
      default:
        break;
    }
  };

  const onKeyUp = (e: React.KeyboardEvent) => {
    if (e.key === ' ') canvasRef.current?.setSpaceHand(false);
  };

  const rows = dockOpen
    ? `auto ${GRID_GAP}px minmax(0, 1fr) ${GRID_GAP}px var(--dock-h, ${DOCK_DEFAULT}px)`
    : `auto ${GRID_GAP}px minmax(0, 1fr) 0 0`;

  return (
    <Dialog.Root
      open
      onOpenChange={(o) => {
        if (!o) onExit();
      }}
    >
      <Dialog.Portal>
        <Dialog.Overlay className='fixed inset-0 z-[var(--z-modal)] bg-overlay' />
        <Dialog.Content
          className='fixed inset-0 z-[var(--z-modal)] bg-pageBg p-4 focus:outline-none'
          onEscapeKeyDown={(e) => {
            // ESC-ЛЕСТНИЦА, каноническая и единая для всех фаз: find → шпаргалка → режим добора →
            // выделение → выход. Каждый Esc гасит верхнюю НЕПУСТУЮ ступень; ступени, чьей фазы ещё
            // нет, просто пусты (режим добора — Ф5в). Без `preventDefault` Radix закрывает фулскрин
            // раньше любого кастомного слоя — он слушает Escape на документе.
            if (findOpen) {
              e.preventDefault();
              setFindOpen(false);
              return;
            }
            if (helpOpen) {
              e.preventDefault();
              setHelpOpen(false);
              return;
            }
            if (picked.length > 0) {
              e.preventDefault();
              setPicked([]);
            }
          }}
          onKeyDown={onKeyDown}
          onKeyUp={onKeyUp}
        >
          <Dialog.Title className='sr-only'>assembly — fullscreen schematic</Dialog.Title>
          <Dialog.Description className='sr-only'>
            the assembly graph on a pan and zoom canvas, with the open step in a dock below
          </Dialog.Description>

          <div ref={gridRef} className='grid h-full' style={{ gridTemplateRows: rows, ['--dock-h' as string]: `${dockH}px` }}>
            {/* ── хром ─────────────────────────────────────────────────────────────────────── */}
            <header className='flex flex-col gap-1 border border-borderColor bg-bgColor px-2 py-1.5'>
              <div className='flex flex-wrap items-center gap-2'>
                <Text size='micro' variant='uppercase' tracking='label' component='span' className='font-bold'>
                  assembly
                </Text>
                <CardIdentity />
                {/* СЧЁТЧИКИ — ТЕКСТ, А НЕ ОРГАНЫ: нажимать здесь не на что, и выглядеть кнопкой
                    они не должны. */}
                <Text size='micro' variant='label' component='span' className='tabular-nums'>
                  {pieces.length} {pieces.length === 1 ? 'piece' : 'pieces'} · {steps.length}{' '}
                  {steps.length === 1 ? 'operation' : 'operations'}
                </Text>
                <UnsavedBadge />

                <span className='ml-auto flex flex-wrap items-center gap-1'>
                  {/* Переключатель вида в хром НЕ дублируется: настоящий приедет в Ф6. Один
                      задизейбленный чип честнее второго живого органа, спорящего с инлайновым.
                      Вид задизейбленности — классами: без onClick чип рендерится простым span,
                      до которого ни `:disabled`, ни span-гейт самого Chip не достают. */}
                  <Chip
                    nonForm
                    disabled
                    title='the list view arrives later'
                    className='cursor-not-allowed opacity-40'
                  >
                    list
                  </Chip>
                  {/* ЧИП ОТМЕНЫ — НАСТОЯЩАЯ КНОПКА (`nonForm` тут был бы ошибкой): он ПИШЕТ в
                      форму, а всё пишущее обязано умирать под `<fieldset disabled>`, если однажды
                      окажется под ним. Задизейблен без записи — обещать отмену, которой нет, значит
                      предлагать заведомый отказ. Честное обещание чипа — «ой» сразу после жеста:
                      глубина одна, redo нет, а первая правка массива или полей шага запись гасит. */}
                  <Chip
                    dashed
                    disabled={!canUndo}
                    onClick={undo}
                    title={frozen ? FROZEN_REFUSAL : undoTitle}
                  >
                    undo
                  </Chip>
                  <Chip nonForm dashed onClick={openFind} title='find a piece or a unit (⌘f)'>
                    find
                  </Chip>
                  <Chip nonForm dashed onClick={() => setHelpOpen(true)} title='keyboard shortcuts (?)'>
                    ?
                  </Chip>
                  <Chip
                    nonForm
                    dashed
                    onClick={() => setResetOpen(true)}
                    title='restore the automatic layout'
                  >
                    reset layout
                  </Chip>
                  {frozen ? (
                    <Pill tone='mut' title='the card is released — it can be read and laid out, not edited'>
                      released · read-only
                    </Pill>
                  ) : (
                    <Button
                      type='button'
                      variant='main'
                      size='sm'
                      onClick={onSave}
                      disabled={saving}
                      loading={saving}
                    >
                      save
                    </Button>
                  )}
                  {/* Без глифа: «⤡» в подключённом моноширинном не нарисован и приезжает
                      подстановкой из системного шрифта — рядом с «⤢» на чипе входа это читается
                      как две разные иконки об одном действии. */}
                  <Chip nonForm onClick={onExit} title='leave fullscreen (esc)'>
                    exit fullscreen
                  </Chip>
                </span>
              </div>

              {/* СТРОКА ЗАРЕЗЕРВИРОВАНА ПОСТОЯННО. Появляясь по факту наведения, она сдвигала бы
                  полотно вниз посреди жеста — вместе с системой координат под рукой. */}
              <div className='min-h-4'>
                {hint && (
                  <Text size='micro' variant='label' className={cn(hint.bad && 'text-error')}>
                    {hint.text}
                  </Text>
                )}
              </div>
              {/* Второй экземпляр предупреждения о переезде номеров: корневой живёт в
                  `OperationsField`, то есть ПОД оверлеем, а удалить шаг можно прямо отсюда. */}
              {dockChrome}
            </header>

            {/* Зазор-трек. Пустой div, а не `gap` грида: свёрнутый док обязан отдать полотну и
                свой трек, и трек сплиттера целиком, а `gap` остаётся между нулевыми треками. */}
            <div />

            {/* ── сцена ────────────────────────────────────────────────────────────────────── */}
            <div className='relative grid min-h-0 min-w-0'>
              <AssemblyCanvas
                ref={canvasRef}
                blocks={blocks}
                steps={steps}
                res={res}
                labelOf={labelOf}
                pieceNameOf={pieceNameOf}
                onPickStep={pickStep}
                onCreate={setPendingCreate}
                onDissolve={dissolveUnit}
                pieceShapes={pieceShapes}
                cloth={cloth}
                smvOfBlock={smvOfBlock}
                positions={prefs.pos}
                onMove={prefs.move}
                frozen={frozen}
                picked={picked}
                onPicked={setPicked}
                onHint={setHint}
              />
              {/* ЗАРЕЗЕРВИРОВАНО ПОД ЭСКИЗ (Ф6б): фулскрин принимает узел и кладёт его над сценой
                  как есть, ничего о нём не зная. */}
              {sketchNote}
            </div>

            {/* ── сплиттер ─────────────────────────────────────────────────────────────────── */}
            {/* СВЁРНУТЫЙ ДОК ОСТАВЛЯЕТ СПЛИТТЕР В ГРИДЕ, спрятав его `visibility`. `display:none`
                убирает грид-ЭЛЕМЕНТ, и все следующие дети съезжают на трек вверх: полотно
                оказывается в нулевом треке высотой 0px, то есть исчезает. */}
            <div
              role='separator'
              aria-orientation='horizontal'
              aria-label='resize the step dock'
              aria-valuenow={dockH}
              aria-valuemin={DOCK_MIN}
              aria-valuemax={DOCK_MAX}
              tabIndex={dockOpen ? 0 : -1}
              className='group relative cursor-row-resize focus-visible:outline focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-textColor'
              style={{ touchAction: 'none', visibility: dockOpen ? undefined : 'hidden' }}
              onPointerDown={onSplitDown}
              onPointerMove={onSplitMove}
              onPointerUp={onSplitUp}
              onPointerCancel={onSplitUp}
              onDoubleClick={closeDock}
              onKeyDown={(e) => {
                if (e.key !== 'ArrowUp' && e.key !== 'ArrowDown') return;
                e.preventDefault();
                e.stopPropagation();
                writeDockH(liveH.current + (e.key === 'ArrowUp' ? 12 : -12));
                setPanels({ dockH: liveH.current });
              }}
            >
              <span className='pointer-events-none absolute left-1/2 top-1/2 h-[3px] w-8 -translate-x-1/2 -translate-y-1/2 border-y border-borderColor transition-colors group-hover:border-textColor' />
            </div>

            {/* ── док ──────────────────────────────────────────────────────────────────────── */}
            {/* ОДИН LISTENER `focusin` НА ВЕСЬ ДОК — восьмая точка сброса записи отмены. React
                вешает `onFocus` поверх нативного `focusin`, то есть он всплывает: одного
                обработчика на контейнере хватает на все два десятка полей редактора шага, и
                добавлять его к каждому не нужно. Смысл: правки ПОЛЕЙ после create жестовым ⌘Z не
                отменяются — «undo возвращает больше, чем жест» снимается только так. */}
            <section
              className='flex min-h-0 flex-col border border-borderColor bg-bgColor'
              style={{ visibility: dockOpen ? undefined : 'hidden' }}
              aria-hidden={!dockOpen}
              onFocus={onDockEdit}
            >
              <div className='flex shrink-0 items-center gap-2 border-b border-hairline px-2 py-1'>
                <button
                  type='button'
                  onClick={closeDock}
                  title='collapse the dock (])'
                  aria-label='collapse the dock'
                  className='text-labelColor transition-colors hover:text-textColor'
                >
                  <Text size='micro' component='span'>
                    ▾
                  </Text>
                </button>
                <Text size='micro' variant='uppercase' tracking='label' component='span' className='min-w-0 truncate font-bold'>
                  {selectedIndex >= 0
                    ? `step ${(selectedIndex + 1) * 10} · ${labelOf(selectedIndex)}`
                    : 'no step open'}
                </Text>
                <span className='ml-auto flex items-center gap-1'>
                  {!frozen && (
                    <Chip
                      dashed
                      onClick={addStepFromDock}
                      title='append an empty step and open it here'
                    >
                      + operation
                    </Chip>
                  )}
                </span>
              </div>
              {/* СВОЙ `<fieldset disabled>`: внешний, что стоит на карточке, до портала не достаёт
                  вовсе — портал живёт в body, а не внутри формы. Без него редактор выпущенной
                  карточки был бы полностью правимым. */}
              {/* РЕДАКТОР МОНТИРУЕТСЯ ТОЛЬКО ПРИ ОТКРЫТОМ ДОКЕ, а не прячется `visibility`.
                  Спрятанный, он остаётся живым ПИСАТЕЛЕМ: его эффекты (пресет типа операции,
                  заполнение нитки из BOM) срабатывают на изменения полей, откуда бы те ни пришли,
                  — то есть закрытый док правил бы карточку. Плюс три десятка подписок `useWatch`,
                  перерисовывающихся на каждый символ, за экран, которого нет на глазах. */}
              {/* `min-w-0` — против дефолтного `min-inline-size: min-content` самого fieldset:
                  без него широкая строка редактора распирала бы док шире вьюпорта вместо того,
                  чтобы переноситься. */}
              <fieldset disabled={frozen} className='min-h-0 min-w-0 flex-1 overflow-y-auto p-2'>
                {!dockOpen ? null : selectedIndex >= 0 ? (
                  renderDockEditor(flashPieces)
                ) : (
                  <Text size='micro' variant='label'>
                    the assembly sequence is empty so far — add the first step
                  </Text>
                )}
              </fieldset>
            </section>
          </div>

          {/* ── find ──────────────────────────────────────────────────────────────────────── */}
          {/* Полка говорит, ЧТО существует; палитра — ГДЕ оно лежит. Первая ступень Esc-лестницы:
              Esc здесь закрывает ТОЛЬКО палитру. */}
          {findOpen && (
            <div
              className='absolute left-1/2 top-16 z-10 w-[min(420px,calc(100%-2rem))] -translate-x-1/2 border border-textColor bg-bgColor'
              role='dialog'
              aria-label='find a piece or a unit'
            >
              <input
                ref={findInputRef}
                value={findQuery}
                onChange={(e) => {
                  setFindQuery(e.target.value);
                  setFindIndex(0);
                }}
                onKeyDown={(e) => {
                  // Стрелки и Enter принадлежат палитре — до роутера полотна им хода нет, иначе
                  // ↑↓ двигали бы выделенные ноды, пока в поле выбирают строку. Escape НЕ
                  // останавливаем: его ловит Esc-лестница, и первой ступенью гасит именно find.
                  if (e.key === 'ArrowDown') {
                    setFindIndex((i) => Math.min(i + 1, Math.max(0, findHits.length - 1)));
                  } else if (e.key === 'ArrowUp') {
                    setFindIndex((i) => Math.max(0, i - 1));
                  } else if (e.key === 'Enter') {
                    chooseFind(findIndex);
                  } else {
                    return;
                  }
                  e.preventDefault();
                  e.stopPropagation();
                }}
                placeholder='find a piece or a unit'
                aria-label='find a piece or a unit'
                className='h-7 w-full border-b border-hairline bg-transparent px-2 text-micro outline-none placeholder:text-labelColor'
              />
              <div className='max-h-64 overflow-y-auto' role='listbox' aria-label='matches'>
                {findHits.length === 0 ? (
                  <div className='px-2 py-1'>
                    <Text size='micro' variant='label'>
                      nothing by that name
                    </Text>
                  </div>
                ) : (
                  findHits.map((r, i) => (
                    <div
                      key={`${r.key}:${r.label}`}
                      role='option'
                      aria-selected={i === findIndex}
                      tabIndex={-1}
                      onMouseEnter={() => setFindIndex(i)}
                      onClick={() => chooseFind(i)}
                      className={cn(
                        'flex cursor-pointer items-center gap-2 px-2 py-1',
                        i === findIndex && 'bg-textColor text-bgColor',
                      )}
                    >
                      <Text size='micro' component='span' className='shrink-0'>
                        {r.label}
                      </Text>
                      <Text
                        size='micro'
                        component='span'
                        className={cn('min-w-0 truncate', i !== findIndex && 'text-labelColor')}
                      >
                        {r.sub}
                      </Text>
                    </div>
                  ))
                )}
              </div>
            </div>
          )}

          {/* ── шпаргалка ─────────────────────────────────────────────────────────────────── */}
          {/* Оверлей-scrim: перекрывает экран целиком и гасится кликом мимо. `[` в ней НЕ значится —
              полка деталей приедет в Ф5, а обещать мёртвую клавишу хуже, чем молчать. */}
          {helpOpen && (
            <div
              className='absolute inset-0 z-20 flex items-center justify-center bg-overlay p-4'
              onClick={() => setHelpOpen(false)}
            >
              <div
                className='max-h-full w-[min(520px,100%)] overflow-y-auto border border-textColor bg-bgColor p-3'
                role='dialog'
                aria-label='keyboard shortcuts'
                onClick={(e) => e.stopPropagation()}
              >
                <Text size='micro' variant='uppercase' tracking='label' className='font-bold'>
                  keyboard
                </Text>
                <dl className='mt-2 grid grid-cols-[auto,1fr] gap-x-3 gap-y-1'>
                  {HELP_KEYS.map(([keys, what]) => (
                    <Fragment key={keys}>
                      <dt className='whitespace-nowrap'>
                        <Text size='micro' component='span' className='tabular-nums'>
                          {keys}
                        </Text>
                      </dt>
                      <dd>
                        <Text size='micro' variant='label' component='span'>
                          {what}
                        </Text>
                      </dd>
                    </Fragment>
                  ))}
                </dl>
                <div className='mt-2'>
                  <Text size='micro' variant='label'>
                    esc closes this; esc again clears the selection, and once more leaves fullscreen
                  </Text>
                </div>
              </div>
            </div>
          )}

          {/* R8: ЕДИНСТВЕННОЕ подтверждение на всём экране, и текст его — слово в слово тот же, что
              у инлайна. Два экрана, по-разному объясняющих одно и то же, читаются как два разных
              правила. */}
          <ConfirmationModal
            open={resetOpen}
            onOpenChange={setResetOpen}
            onConfirm={() => {
              prefs.reset();
              setResetOpen(false);
            }}
            title='restore the automatic layout'
            confirmLabel='reset'
            cancelLabel='keep'
            width='sm'
          >
            <Text size='micro' variant='label'>
              every manual position on this card will be forgotten, and the schematic will place the
              units by itself again. the card's data doesn't change: positions are only a way of
              looking.
            </Text>
          </ConfirmationModal>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

/**
 * Имя карточки в шапке. ЛИСТ со своей подпиской: в корне фулскрина `useWatch` перерисовывал бы
 * полотно на каждый символ, набранный в любом из двух полей.
 */
function CardIdentity() {
  const { control } = useFormContext<TechCardFormData>();
  const styleNumber = (useWatch({ control, name: 'styleNumber' }) ?? '') as string;
  const name = (useWatch({ control, name: 'name' }) ?? '') as string;
  const text = [styleNumber.trim(), name.trim()].filter(Boolean).join(' · ');
  if (!text) return null;
  return (
    <Text size='micro' variant='label' component='span' className='min-w-0 truncate uppercase'>
      {text}
    </Text>
  );
}

/**
 * Бейдж несохранённых правок. Тоже ЛИСТ, и по той же причине, только острее: `isDirty` меняется на
 * первом же нажатии клавиши в любом поле карточки, а подписка на него в корне перерисовывала бы
 * весь фулскрин вместе с полотном.
 */
function UnsavedBadge() {
  const { control } = useFormContext<TechCardFormData>();
  const { isDirty } = useFormState({ control });
  if (!isDirty) return null;
  return (
    <Pill tone='attention' title='the card has changes that are not saved yet'>
      unsaved
    </Pill>
  );
}
