import * as Dialog from '@radix-ui/react-dialog';
import { cn } from 'lib/utility';
import { useSnackBarStore } from 'lib/stores/store';
import {
  Fragment,
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { useFormContext, useFormState, useWatch } from 'react-hook-form';
import { Button } from 'ui/components/button';
import { Chip } from 'ui/components/chip';
import { ConfirmationModal } from 'ui/components/confirmation-modal';
import { Pill } from 'ui/components/pill';
import Text from 'ui/components/text';

import type { AssemblyBlock } from './assembly-blocks';
import {
  AssemblyCanvas,
  DRAG_THRESHOLD,
  ZOOM_STEP,
  type CanvasHandle,
  type CanvasHint,
} from './assembly-canvas';
import type { CreatePrefill } from './assembly-create-dialog';
import type { AssemblyResult, AssemblyStep } from './assembly-frontier';
import { AssemblyShelf, type ShelfFilter } from './assembly-shelf';
import type { PieceCloth } from './piece-cloth';
import type { TechCardFormData } from './schema';
import { SequenceRail } from './sequence-rail';
import {
  DOCK_DEFAULT,
  DOCK_MAX,
  DOCK_MIN,
  SHELF_DEFAULT,
  SHELF_MAX,
  SHELF_MIN,
  usePanelPrefs,
} from './use-panel-prefs';
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
// ФУЛСКРИН и передаёт аргументом: в Ф3 это был снекбар-заглушка, теперь — арм режима добора, и
// `operations-field.tsx` ради этого трогать не пришлось.
//
// ВСЁ ПРЕЗЕНТАЦИОННОЕ ИДЁТ МИМО ФОРМЫ. Позиции, зум, панорама, высоты панелей, открытость дока —
// ничего из этого не касается RHF: иначе перетаскивание ноды взводило бы `isDirty`, а с ним
// beforeunload и заряженный Save на карточке, которую никто не менял.

/** Высота строки-заглушки между хромом и полотном. Тот же зазор, что у прочих треков грида. */
const GRID_GAP = 8;

/**
 * Свёрнутая полка = ровно её шапка, и число обязано совпадать с `h-6` этой шапки
 * (`assembly-shelf.tsx`). Меньше — шапку обрежет, больше — под ней ляжет полоса пустоты, которая
 * читается как «полка сломалась, а не свёрнута».
 */
const SHELF_HEAD = 24;

/**
 * Ghost детали, которую несут из полки на полотно.
 *
 * Размер — СВОБОДНОЙ ПЛИТКИ ПОЛОТНА (64×48 из `assembly-layout.ts`), а не плитки полки: ghost
 * показывает, чем деталь станет, а не то, откуда её взяли. Живёт он в ЭКРАННЫХ координатах и гаснет,
 * едва указатель войдёт в сцену — там ту же деталь уже везёт само полотно, и два её изображения под
 * одним курсором читались бы как две детали.
 */
const GHOST_W = 64;
const GHOST_H = 48;

/**
 * Шпаргалка. Список — данные, а не разметка: клавиша, попавшая в роутер и забытая здесь, — та же
 * ложь, что подпись про несуществующую клавишу.
 *
 * ТРЕТЬЕ ПОЛЕ — В КАКОМ ВИДЕ КЛАВИША ЖИВА, и фильтр по нему обязателен: шпаргалка открывается и в
 * списке, где клавиши полотна гашены белым списком роутера, — строка про мёртвые `v`/`u`/маркизу
 * там была бы той же ложью, что подпись про несуществующую клавишу. И наоборот: драг ⠿ — живой
 * жест списка, и жест без строки в шпаргалке лжёт ровно так же.
 */
const HELP_KEYS: [string, string, 'both' | 'schematic' | 'list'][] = [
  ['v · h', 'select tool · pan tool', 'schematic'],
  ['space', 'pan while held', 'schematic'],
  ['f · ⌘1', 'fit everything on screen', 'schematic'],
  ['⌘0', 'zoom back to 100%', 'schematic'],
  ['+ · −', 'zoom in · out', 'schematic'],
  ['⇧2', 'frame the selection', 'schematic'],
  ['⌘a', 'pick everything on the table', 'both'],
  ['drag on empty ground', 'marquee — touching a node picks it (shift adds)', 'schematic'],
  ['drag from the shelf', 'drop on a node to join, on empty ground to place the piece', 'schematic'],
  ['drag ⠿ on a step', 'reorder the sequence', 'list'],
  ['arrows', 'nudge the picked by 8px (shift: 1px)', 'schematic'],
  ['u', 'join the picked into a unit', 'schematic'],
  ['o', 'an operation on the picked', 'schematic'],
  ['d', 'dissolve the picked unit', 'schematic'],
  ['⌘z', 'undo the last gesture', 'both'],
  ['⌘f', 'find a piece or a unit', 'both'],
  ['⌘l', 'the sequence as a list · back to the schematic', 'both'],
  ['[', 'collapse or open the pieces shelf', 'both'],
  [']', 'collapse or open the step dock', 'schematic'],
  ['s', 'show or hide the sketch sticker (drag it by its head)', 'both'],
  ['esc', 'find → shortcuts → adding → selection → leave', 'both'],
];

/**
 * Стикер эскиза: ширина и отступ от края сцены.
 *
 * 280px — УЖЕ инлайновой колонки (320px), и намеренно: там эскиз стоит рядом с работой, здесь он
 * лежит ПОВЕРХ неё, и каждый лишний пиксель ширины отнимается у полотна, ради которого экран и
 * открыли.
 */
const STICKER_W = 280;
const STICKER_MARGIN = 8;

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
  /**
   * Добавить деталь во входы шага. Единственный вызыватель отсюда — РЕЖИМ ДОБОРА полки. Гейт
   * заморозки у мутатора теперь СВОЙ, первой строкой (`operations-field.tsx`, черри-пик-кандидат
   * `e0eb0021`); вызов всё равно гейтуется и на этой стороне — жест pointer-ный, разметка его не
   * глушит, и пояс с подтяжками дешевле одного тихого дописывания в выпущенную карточку.
   */
  addInputToOperation: (index: number, key: string) => void;
  addOperation: () => void;
  /** Потребитель — Ф6в (перестановка шагов в списке). */
  moveOperation: (from: number, to: number) => void;
  /**
   * РЕЛЬС РЕЖИМА СПИСКА — ТЕ ЖЕ ДАННЫЕ И ТЕ ЖЕ КОЛБЭКИ, ЧТО У ИНЛАЙНА, и приезжают они пропами по
   * той же причине, по какой приезжает пропом всё остальное: `useFieldArray('operations')`
   * существует в приложении в единственном экземпляре — в `OperationsField`, — и второй с ним не
   * синхронизируется. Сам `SequenceRail` — ОДИН модуль на оба вида: два похожих списка одних и тех
   * же шагов разъезжаются первой же правкой.
   */
  railFields: { id: string }[];
  /**
   * Размечена ли карточка узлами. Отвечает за ДВЕ вещи сразу: врезку шапок узлов в рельс и дефолт
   * вида, когда `prefs.mode` пуст (то же правило `effectiveMode`, что у инлайна).
   */
  railMarked: boolean;
  /** Индекс шага → шапка блока, которую надо врезать ПЕРЕД ним (`useRailGrouping`). */
  railHeaderBefore: Map<number, { block: AssemblyBlock; smv: string; terminal: boolean }>;
  /** Шаги с незаполненным обязательным полем. */
  railErrorIndices: ReadonlySet<number>;
  /** Шаги, ломающие сборочный граф. */
  railBrokenSteps: ReadonlySet<number>;
  /** Активный пин эскиза: строка рельса светится вместе с ним (R6 — заливки у пина нет). */
  activePin: number | null;
  activeBom: string | null;
  onHoverPin: (n: number | null) => void;
  /**
   * Разбор перетаскиваемой нагрузки в lineKey детали. ПРОПОМ, а не импортом: протокол живёт в
   * `operations-field.tsx` вместе с двумя своими константами и используется не только рельсом.
   */
  readPieceDrag: (dt: DataTransfer) => string;
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
 * Клавиша глагола: символ, а с не-латинской раскладки — ФИЗИЧЕСКАЯ клавиша.
 *
 * Тот же случай, что ⇧2 в роутере (там код физический с самого начала): на кириллической
 * раскладке `e.key` даёт «г»/«щ»/«в»/«ъ», и все одноклавишные глаголы вместе с ⌘Z/⌘A/⌘F молча
 * умирали бы ровно у той половины пользователей, что печатает кириллицей. Латинские раскладки
 * остаются хозяйками своих букв (на Dvorak/AZERTY жмут то, что написано на клавише) — фолбэк
 * просыпается только когда символ не латиница. Shift сохраняет прежнее поведение глаголов:
 * шифтованная буква глаголом не была и не становится, поэтому фолбэк под Shift молчит, а
 * латинская заглавная проходит мимо первой ветки и остаётся `e.key`.
 */
const verbKey = (e: { key: string; code: string; shiftKey: boolean }): string => {
  if (/^[a-z]$/.test(e.key)) return e.key;
  if (!e.shiftKey && /^Key[A-Z]$/.test(e.code)) return e.code.slice(3).toLowerCase();
  if (!e.shiftKey && e.code === 'BracketRight') return ']';
  if (!e.shiftKey && e.code === 'BracketLeft') return '[';
  return e.key;
};

/**
 * Модификаторные комбинации регистра и Shift не различают (⌘⇧Z обязана ДОЙТИ до проверки redo,
 * а не отсеяться раскладкой), поэтому нормализация своя: латиница в нижний регистр, не-латиница —
 * через физическую клавишу.
 */
const comboKey = (e: { key: string; code: string }): string => {
  if (/^[a-zA-Z]$/.test(e.key)) return e.key.toLowerCase();
  if (/^Key[A-Z]$/.test(e.code)) return e.code.slice(3).toLowerCase();
  return e.key;
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
  addInputToOperation,
  addOperation,
  moveOperation,
  railFields,
  railMarked,
  railHeaderBefore,
  railErrorIndices,
  railBrokenSteps,
  activePin,
  activeBom,
  onHoverPin,
  readPieceDrag,
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
  /** Сцена — и система координат стикера эскиза, и его кламп. */
  const stageRef = useRef<HTMLDivElement>(null);

  // ДОК ЗАКРЫТ ПРИ ВХОДЕ — и это ОТДЕЛЬНОЕ состояние, а не производная от `selectedIndex`.
  // Производная равна −1 только при нуле шагов: на любой карточке с операциями она ≥ 0 с первого
  // кадра, и выведенный из неё док был бы открыт с порога — то есть весь возврат высоты полотна
  // (+176px) аннулирован ровно там, где фулскрин и открывают.
  const [dockStep, setDockStep] = useState<number | null>(null);

  // --- вид: схема или список ----------------------------------------------------------------------
  //
  // ПРАВИЛО ТО ЖЕ, ЧТО У ИНЛАЙНА (`effectiveMode` в `operations-field.tsx`), и это не совпадение:
  // вид — свойство КАРТОЧКИ, а не поверхности. Явный выбор человека сильнее вывода; вывод остаётся
  // дефолтом: размеченная карточка открывается схемой, неразмеченная — списком (пустое полотно на
  // первом открытии читается как «сломалось»).
  //
  // ДО Ф6в ФУЛСКРИН ФОРСИЛ СХЕМУ, НЕ ЗАПИСЫВАЯ `prefs.mode` (M13) — чтобы вход сюда не ломал
  // R11-дефолт неразмеченной карточки. Теперь режим ожил, но ПИСАТЕЛЬ у него ровно один: явный жест
  // человека (чип `list` и ⌘L). Ни вход в фулскрин, ни выход из него в предпочтения не пишут.
  const setMode = prefs.setMode;
  const fsMode = prefs.mode ?? (railMarked ? 'schematic' : 'list');
  const listMode = fsMode === 'list';
  const toggleMode = useCallback(
    () => setMode(listMode ? 'schematic' : 'list'),
    [listMode, setMode],
  );

  // «ДОК ОТКРЫТ» — ЭТО ДВА УСЛОВИЯ, И ВТОРОЕ ОБЯЗАНО ЖИТЬ В РЕНДЕРЕ, а не только в эффекте ниже.
  // Эффект отрабатывает ПОСЛЕ рендера, то есть кадр между «нажали list» и «эффект закрыл док»
  // держал бы на экране ДВА `OperationEditor` на одни имена полей — с двумя писателями, двумя
  // комплектами эффектов пресетов и сломанным фокусом. Здесь же док гаснет тем же рендером, каким
  // появляется список.
  const dockOpen = dockStep !== null && !listMode;

  /**
   * РЕДАКТОР ШАГА НА ЭКРАНЕ: в схеме это открытый док, в списке — его колонка. Условие живёт
   * отдельно от `dockOpen`, потому что им проверяется режим добора: «＋ piece» стоит в САМОМ
   * редакторе, и привязка режима к доку сделала бы кнопку мёртвой ровно в том виде, где редактор
   * виден всегда.
   */
  const editorOnScreen = dockOpen || listMode;

  /**
   * Пустая последовательность на месте редактора (док в схеме, колонка в списке). НА ВЫПУЩЕННОЙ
   * КАРТОЧКЕ «add the first step» обещал бы орган, которого нет: «+ operation» при заморозке
   * снята и из шапки дока, и из-под рельса. Отказ — тем же предложением, что у всех органов
   * (`FROZEN_REFUSAL`): два текста об одном правиле читаются как два разных правила.
   */
  const emptySequenceNote = frozen
    ? `the assembly sequence is empty. ${FROZEN_REFUSAL}`
    : 'the assembly sequence is empty so far — add the first step';

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
  const shelfH = panels.shelfH ?? SHELF_DEFAULT;
  // Полка по умолчанию РАЗВЁРНУТА: она отвечает на вопрос «всё ли собрано», с которого экран и
  // открывают. Свёрнутость — выбор человека, и он живёт на пользователя, а не на карточку.
  const shelfCollapsed = panels.shelfCollapsed ?? false;

  const toggleShelf = useCallback(
    () => setPanels({ shelfCollapsed: !shelfCollapsed }),
    [shelfCollapsed, setPanels],
  );

  // --- активный колорвей --------------------------------------------------------------------------
  //
  // ОДИН НА ВЕСЬ ЭКРАН: полка группируется по нему, полотно им же штрихует. Разведи их — и одна
  // деталь на одном экране получит два ответа про свою ткань, причём оба «правильные».
  //
  // ИНДЕКС ЧИНИТ РОДИТЕЛЬ (полка клампит только ПОКАЗ): рецепт живёт в форме, колорвей из него
  // можно убрать прямо сейчас, и индекс, переживший своё значение, оставил бы полотно без
  // штриховки при живом рецепте. Кламп — в рендере, чтобы обе поверхности одного кадра видели
  // одно число; эффект догоняет им состояние, иначе чипы полки светили бы выбранным то, чего нет.
  const [colorwayIndex, setColorwayIndex] = useState(0);
  const cwIndex =
    colorwayIndex >= 0 && colorwayIndex < pieceClothByColorway.length ? colorwayIndex : 0;
  useEffect(() => {
    if (colorwayIndex !== cwIndex) setColorwayIndex(cwIndex);
  }, [colorwayIndex, cwIndex]);

  const cloth = pieceClothByColorway[cwIndex]?.map ?? null;

  // --- полка ---------------------------------------------------------------------------------------
  //
  // Ось — В ПРЕДПОЧТЕНИЯХ КАРТОЧКИ (Ф5б): «по узлам» и «по тканям» суть два разных вопроса к одной
  // карточке, и выбранный держится между визитами. Фильтр — СЕССИОННЫЙ: он сворачивает длинную
  // полосу под текущую задачу и, переживи он визит, встречал бы человека полкой, где половины
  // деталей нет, без единого следа почему.
  const axis = prefs.axis ?? 'unit';
  const [shelfFilter, setShelfFilter] = useState<ShelfFilter>('all');

  const pickedSet = useMemo(() => new Set(picked), [picked]);

  /**
   * Узел-потребитель детали. ТА ЖЕ ВЫВОДКА, ЧТО В `assembly-layout.ts`, и это не совпадение: полка
   * и полотно обязаны считать деталь съеденной в один и тот же момент. Шаг-ОБРАБОТКА (пустой
   * выходной ключ) деталь не съедает — она остаётся на столе.
   */
  const intoByPiece = useMemo(() => {
    const m = new Map<string, string>();
    res.consumedBy.forEach((stepIdx, key) => {
      if (res.units.has(key)) return; // это узел, не деталь
      const into = steps[stepIdx]?.outputUnitKey ?? '';
      if (into) m.set(key, into);
    });
    return m;
  }, [res, steps]);

  const intoOf = useCallback((lineKey: string) => intoByPiece.get(lineKey) ?? null, [intoByPiece]);
  const unitNameOf = useCallback((key: string) => res.units.get(key)?.name ?? '', [res]);

  /**
   * Порядок групп полки = порядок боксов полотна. `Map` фронтира хранит порядок вставки, а он и
   * есть порядок производящих шагов: без этого полка сортирует по первому появлению узла среди
   * деталей, и два соседних органа рассказывают о карточке разное.
   */
  const unitOrder = useMemo(() => [...res.units.keys()], [res]);

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
   * ДОК ОТСТУПАЕТ ПЕРЕД СПИСКОМ И ВОЗВРАЩАЕТСЯ ТЕМ ЖЕ, КАКИМ БЫЛ (`dockBeforeList` прототипа).
   *
   * Список несёт рельс И редактор шага; держать под ним открытый док значило бы положить те же
   * поля на экран дважды. Показ гасит уже `dockOpen` в рендере — здесь снимается САМО состояние,
   * чтобы «док открыт» не оставалось истинным для органов, которые про вид ничего не знают
   * (режим добора, `toggleDock`, подпись шага).
   *
   * ПЕРЕХОД ЛОВИТСЯ ПО ФАКТУ, А НЕ В ОБРАБОТЧИКЕ ЧИПА: вид может смениться и без жеста — карточка
   * без сохранённого режима переезжает в схему, как только в ней появляется первый узел. Дока,
   * забытого открытым в этом случае, не увидел бы ни один обработчик.
   */
  const dockBeforeList = useRef<number | null>(null);
  const wasList = useRef(listMode);
  useLayoutEffect(() => {
    if (listMode === wasList.current) return;
    wasList.current = listMode;
    if (listMode) {
      dockBeforeList.current = dockStep;
      setDockStep(null);
      return;
    }
    setDockStep(dockBeforeList.current);
    dockBeforeList.current = null;
  }, [listMode, dockStep]);

  // --- драг плитки полки на полотно ---------------------------------------------------------------
  //
  // POINTER-ПОРТ, А НЕ HTML5 DnD (решение плана, M4). У инлайнового лотка драг нативный
  // (`dataTransfer`), и полке он не даётся: под нативным драгом pointer-события не летят ВОВСЕ, то
  // есть hit-тест узлов полотна перестал бы работать и дроп «на узел» молча стал бы переносом.
  //
  // ЖЕСТ ВЕДЁТ ЭТОТ ФАЙЛ, потому что начинается он ВНЕ полотна: полка отдаёт наружу только
  // `onTilePointerDown` (своего гарда драга у неё нет намеренно). Полотно даёт то, чего снаружи не
  // достать, — свои координаты, свою подсветку цели и свой хвост дропа (`beginExternalDrag` и
  // соседи); здесь остаются захват указателя, порог, ghost и гашение клик-эха.

  const tileDrag = useRef<{
    pointerId: number;
    key: string;
    /** Плитка, захватившая указатель: с неё же его и снимаем. */
    el: HTMLElement;
    fromX: number;
    fromY: number;
    /** Порог пройден — жест стал перетаскиванием, и полотно про него уже знает. */
    started: boolean;
  } | null>(null);
  /** Указатель зажат на плитке. Пока true, жест слушают окно и только окно. */
  const [tileDragOn, setTileDragOn] = useState(false);
  /** Что несут; `null` — ghost не смонтирован. */
  const [tileDragKey, setTileDragKey] = useState<string | null>(null);
  const ghostRef = useRef<HTMLDivElement>(null);
  /** Где ghost и надо ли его гасить. Пишется ИМПЕРАТИВНО — как трансформ мира и рамка маркизы. */
  const ghostAt = useRef({ x: 0, y: 0, over: false });

  /**
   * ГАШЕНИЕ КЛИК-ЭХА (проброс ревью Ф5а).
   *
   * Своего гарда у полки нет по построению: жест ведёт родитель, и второй сторож, не знающий про
   * начатый жест, гасил бы клики, которые родитель считает живыми. Без этого флага драг плитки на
   * полотно кончался бы ещё и «выбрать деталь»: захват указателя ретаргетит и совместимостные
   * мышиные события, поэтому `click` приходит на плитку даже когда отпустили над полотном.
   *
   * Сбрасывается на КАЖДОМ pointerdown, а не по таймеру: жест, отпущенный там, где клика не будет
   * вовсе, иначе съел бы следующий честный клик.
   */
  const tileClickEcho = useRef(false);
  const takeTileClickEcho = useCallback(() => {
    if (!tileClickEcho.current) return false;
    tileClickEcho.current = false;
    return true;
  }, []);

  const paintGhost = useCallback(() => {
    const el = ghostRef.current;
    if (!el) return;
    const g = ghostAt.current;
    el.style.display = g.over ? 'none' : 'block';
    el.style.transform = `translate3d(${g.x - GHOST_W / 2}px, ${g.y - GHOST_H / 2}px, 0)`;
  }, []);
  // ПЕРВЫЙ КАДР GHOST'А. Элемент появляется тем же рендером, что и состояние, — до него ставить
  // позицию некуда, и без этого он мигнул бы в левом верхнем углу экрана.
  useLayoutEffect(paintGhost, [tileDragKey, paintGhost]);

  const endTileDrag = useCallback((drop: { x: number; y: number } | null) => {
    const g = tileDrag.current;
    if (!g) return;
    tileDrag.current = null;
    setTileDragOn(false);
    setTileDragKey(null);
    // Захват мог быть уже снят браузером (`pointercancel`) или плитки может уже не быть в дереве:
    // исключение здесь уронило бы конец жеста, а не начало.
    try {
      g.el.releasePointerCapture(g.pointerId);
    } catch {
      /* указатель уже отпущен */
    }
    // Порог не пройден — перетаскивания не было: это обычный клик по плитке, и трогать его нельзя.
    if (!g.started) return;
    tileClickEcho.current = true;
    if (drop) canvasRef.current?.dropExternalDrag(drop.x, drop.y);
    else canvasRef.current?.cancelExternalDrag();
  }, []);

  const onTilePointerDown = useCallback((lineKey: string, e: React.PointerEvent) => {
    // Правая и средняя кнопки жеста не начинают; тач и перо приходят с `button === 0`.
    if (e.button !== 0) return;
    const el = e.currentTarget as HTMLElement;
    tileClickEcho.current = false;
    tileDrag.current = {
      pointerId: e.pointerId,
      key: lineKey,
      el,
      fromX: e.clientX,
      fromY: e.clientY,
      started: false,
    };
    // Захват — чтобы жест не потерялся, уйдя с плитки: дальше он живёт над полотном. `preventDefault`
    // здесь НЕ зовём: он отнял бы у плитки фокус, а вместе с ним клавиатурный путь к той же детали.
    try {
      el.setPointerCapture(e.pointerId);
    } catch {
      /* без захвата обойдёмся — слушатели всё равно на окне */
    }
    setTileDragOn(true);
  }, []);

  useEffect(() => {
    if (!tileDragOn) return;
    const move = (e: PointerEvent) => {
      const g = tileDrag.current;
      if (!g || e.pointerId !== g.pointerId) return;
      if (!g.started) {
        // Порог — ТОТ ЖЕ, что у полотна (`DRAG_THRESHOLD`), но в ЭКРАННЫХ пикселях: жест начинается
        // над полкой, где ни мира, ни зума ещё нет.
        if (
          Math.abs(e.clientX - g.fromX) <= DRAG_THRESHOLD &&
          Math.abs(e.clientY - g.fromY) <= DRAG_THRESHOLD
        ) {
          return;
        }
        g.started = true;
        canvasRef.current?.beginExternalDrag(g.key, e.clientX, e.clientY);
        setTileDragKey(g.key);
      }
      const over = canvasRef.current?.moveExternalDrag(e.clientX, e.clientY) ?? false;
      ghostAt.current = { x: e.clientX, y: e.clientY, over };
      paintGhost();
    };
    const up = (e: PointerEvent) => {
      const g = tileDrag.current;
      if (!g || e.pointerId !== g.pointerId) return;
      endTileDrag({ x: e.clientX, y: e.clientY });
    };
    /**
     * ТАЧ ОБЯЗАН ПЕРЕЖИВАТЬСЯ, А НЕ РОНЯТЬ ЖЕСТ (проброс ревью Ф5а, п. 5).
     *
     * Плитки полки несут `touch-action: pan-x` — полоса деталей это горизонтальный скроллер, и
     * глухая `none` убила бы прокрутку пальцем на всей её площади. Значит палец, поехавший ВБОК,
     * забирает браузер: жест приходит `pointercancel` и `pointerup` не приходит НИКОГДА. Драг на
     * полотно вертикальный (полотно лежит прямо под полкой) и потому живёт; горизонтальный просто
     * отменяется — без дропа, без записи и без зависшего ghost'а.
     */
    const cancel = (e: PointerEvent) => {
      const g = tileDrag.current;
      if (g && e.pointerId !== g.pointerId) return;
      endTileDrag(null);
    };
    // Потеря окна И потеря видимости — оба аварийные конца, и слушать надо оба: полотно гасит
    // свою половину жеста на `visibilitychange` тоже («blur владельцу жеста может и не прийти» —
    // его onLost), и без зеркала здесь ghost переживал бы деталь, которую полотно уже не везёт, —
    // до первого pointerup висел бы за курсором без единой зажатой кнопки.
    const lost = () => endTileDrag(null);
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      const g = tileDrag.current;
      // Порог не пройден — жеста нет, и Esc принадлежит лестнице: гасить ею нечего.
      if (!g?.started) return;
      // ЖИВОЙ ЖЕСТ ВЫШЕ ВСЕЙ ESC-ЛЕСТНИЦЫ — ровно как драг ноды и маркиза в полотне: Esc посреди
      // жеста значит «отменить жест», а не «подняться на ступень».
      e.preventDefault();
      e.stopPropagation();
      endTileDrag(null);
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
    window.addEventListener('pointercancel', cancel);
    window.addEventListener('blur', lost);
    document.addEventListener('visibilitychange', lost);
    window.addEventListener('keydown', onKey, true);
    return () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      window.removeEventListener('pointercancel', cancel);
      window.removeEventListener('blur', lost);
      document.removeEventListener('visibilitychange', lost);
      window.removeEventListener('keydown', onKey, true);
    };
  }, [tileDragOn, endTileDrag, paintGhost]);

  // --- режим добора деталей в шаг -------------------------------------------------------------------
  //
  // ОДНО ПРАВИЛО КЛИКА ПО ПЛИТКЕ: клик — ВСЕГДА «выбрать и довести панорамой». Добавление детали в
  // шаг живёт отдельным режимом, в который экран входит явно — «＋ piece» в доке. Иначе один и тот
  // же клик значил бы разное в зависимости от того, открыт ли док: пишущий жест, отличающийся от
  // читающего только невидимым контекстом.
  //
  // Состояние СЕССИОННОЕ и мимо RHF: это не факт карточки, а положение рук.
  const [addMode, setAddMode] = useState<{ stepIndex: number; stepLabel: string } | null>(null);

  /**
   * УСЛОВИЯ ЖИЗНИ РЕЖИМА ПРОВЕРЯЮТСЯ В РЕНДЕРЕ, а не только эффектом-сторожем ниже: эффект
   * отрабатывает ПОСЛЕ покраски, и кадр между «док закрыли» и «сторож убрал состояние» показывал бы
   * полку, зовущую класть детали в шаг, которого на экране уже нет.
   */
  const addModeLive =
    addMode &&
    !frozen &&
    editorOnScreen &&
    addMode.stepIndex === selectedIndex &&
    selectedIndex < steps.length
      ? addMode
      : null;

  /**
   * Фронтир целевого шага — ТОТ ЖЕ, что сверяет `addInputToOperation`: `frontierBefore[i]`. Считается
   * НА КАЖДЫЙ РЕНДЕР, а не снимается на входе в режим: добавленная деталь уходит со стола тем же
   * жестом, и замороженный снимок предлагал бы её второй раз — с отказом движка в ответ.
   */
  const shelfAddMode = useMemo(
    () =>
      addModeLive
        ? {
            ...addModeLive,
            frontier: new Set(res.frontierBefore[addModeLive.stepIndex] ?? res.frontier),
          }
        : null,
    [addModeLive, res],
  );

  const exitAddMode = useCallback(() => setAddMode(null), []);

  /**
   * «＋ piece» редактора шага: ВООРУЖИТЬ ДОБОР. Решение принимает фулскрин, а не
   * `operations-field` — полка его орган, и файл с мутаторами ради этого не тронут.
   *
   * Повторное нажатие — выход: орган, которым вошли, обязан уметь вывести.
   */
  const armAddMode = useCallback(() => {
    // Пояс и подтяжки. Кнопка живёт под `<fieldset disabled={frozen}>` дока и на выпущенной
    // карточке мертва, но дыра здесь самая тихая: портал выносит и док, и полку из-под fieldset
    // карточки целиком, а у `addInputToOperation` собственный гейт появился позже вызывающих.
    if (frozen) return;
    // ШАГ БЕРЁТСЯ ИЗ `selectedIndex`, а не из `dockStep`: редактор с этой кнопкой смонтирован
    // именно на `selectedIndex`, и разойдись эти два числа — детали уехали бы в чужой шаг.
    // `editorOnScreen` отвечает только за «редактор виден» (док в схеме, колонка в списке);
    // верхняя граница обязательна — `selected` родителя всегда ≥ 0 и на карточке без операций
    // указывает на строку, которой нет.
    if (!editorOnScreen || selectedIndex < 0 || selectedIndex >= steps.length) return;
    if (addModeLive) {
      setAddMode(null);
      return;
    }
    setAddMode({ stepIndex: selectedIndex, stepLabel: String((selectedIndex + 1) * 10) });
    // СВЁРНУТУЮ ПОЛКУ РАЗВОРАЧИВАЕМ: режим, чьи органы не видны, читается как сломанная кнопка.
    if (shelfCollapsed) setPanels({ shelfCollapsed: false });
  }, [frozen, editorOnScreen, selectedIndex, steps.length, addModeLive, shelfCollapsed, setPanels]);

  /**
   * Клик по годной плитке в режиме добора. Отказ вне фронтира произносит САМ мутатор — словами
   * движка и по свежим значениям формы; полка негодные плитки приглушает заранее, так что сюда
   * они и не доходят.
   */
  const addPieceToStep = useCallback(
    (lineKey: string) => {
      // Клик-эхо драга гасится ПЕРВЫМ и здесь тоже: жест на полотно, начатый в режиме добора,
      // иначе кончался бы ещё и молчаливым добавлением детали в открытый шаг.
      if (takeTileClickEcho()) return;
      if (frozen) return; // тот же пояс: жест pointer-ный, fieldset его не глушит
      if (!addModeLive) return;
      addInputToOperation(addModeLive.stepIndex, lineKey);
    },
    [frozen, addModeLive, addInputToOperation, takeTileClickEcho],
  );

  /**
   * СТОРОЖ РЕЖИМА. Выходов из добора четыре — Esc, повторный «＋ piece», закрытие дока, смена шага,
   * — но три последних суть одно и то же условие, а сверх них есть случаи, которых ни один жест не
   * видит: шаг удалили из дока, карточку заморозили, `selectedIndex` уехал снаружи. Показ уже
   * погашен `addModeLive` в рендере; здесь снимается само состояние, чтобы повторный «＋ piece» не
   * читался как «выйти» из режима, которого на экране давно нет.
   */
  useEffect(() => {
    if (addMode && !addModeLive) setAddMode(null);
  }, [addMode, addModeLive]);

  const addStepFromDock = () => {
    // Гейт на СТОРОНЕ ВЫЗОВА, хотя мутатор гейтован и сам: без него `setDockStep` открыл бы док на
    // индексе шага, которого заморозка не дала создать.
    if (frozen) return;
    const at = steps.length;
    addOperation();
    // В СПИСКЕ ДОК НЕ ОТКРЫВАЕТСЯ: редактор уже стоит в его колонке, и второй экземпляр на те же
    // имена полей — ровно то, ради чего док перед списком и отступает. Выбор нового шага делает
    // сам мутатор (`addOperation` зовёт `setSelected`), поэтому списку хватает его одного.
    if (!listMode) setDockStep(at);
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

  /**
   * Клик по плитке полки ВНЕ режима добора: выбрать и довести панорамой. Ровно то же, что делает
   * find-палитра, и той же ручкой — доводка МИНИМАЛЬНЫМ сдвигом. Выбирается ТОЛЬКО то, что на
   * столе: съеденная деталь входом не годится, и эффект очистки выбора всё равно выбросил бы её
   * следующим кадром — мигание вместо ответа. Довести до глаз при этом можно любую.
   */
  const pickPiece = useCallback(
    (lineKey: string) => {
      // ДРАГ НЕ ВЫБИРАЕТ. `click` приходит после каждого перетаскивания плитки — захват указателя
      // ретаргетит и совместимостные мышиные события, — и без гашения жест «утащил деталь на
      // полотно» кончался бы ещё и сменой выделения с доводкой панорамой.
      if (takeTileClickEcho()) return;
      if (onTable.has(lineKey)) setPicked([lineKey]);
      canvasRef.current?.reveal(lineKey);
    },
    [onTable, takeTileClickEcho],
  );

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
    // ШПАРГАЛКА УСТУПАЕТ ПАЛИТРЕ. Её scrim лежит ВЫШЕ палитры (z-20 против z-10), и ⌘F из-под
    // него открывал бы поле, в котором печатаешь вслепую, — а Esc первой ступенью гасил бы
    // невидимую палитру под видимой шпаргалкой. Справка уступает без потерь: состояния у неё нет.
    setHelpOpen(false);
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

  // --- сплиттеры панелей --------------------------------------------------------------------------
  //
  // Порт `wireSplit`/`setBar` прототипа, и он ОДИН на обе панели (`SplitBar` внизу файла): у дока и
  // полки различаются только знак движения, кламп и смысл двойного клика. Во время перетаскивания
  // высота пишется ПРЯМО в CSS-переменную грида, а в предпочтения уходит только по отпусканию:
  // состояние React на каждый кадр перерисовывало бы редактор шага целиком, со всеми его двумя
  // десятками полей.
  const writeTrack = useCallback((name: string, px: number) => {
    gridRef.current?.style.setProperty(name, `${px}px`);
  }, []);

  // --- стикер эскиза ------------------------------------------------------------------------------
  //
  // ЗАКРЫТ ПРИ ВХОДЕ. Эскиз — справка, а не рабочее поле: экран открывают, чтобы разбирать сборку,
  // и панель, которую никто не звал, начинала бы каждый визит с перекрытого куска полотна.
  //
  // ВСЁ ТРИ СОСТОЯНИЯ — СЕССИОННЫЕ И МИМО RHF (открыт / где лежит / свёрнут): это положение рук, а
  // не факт карточки. В предпочтения они тоже не идут — в отличие от высот панелей и оси полки,
  // позиция плавающей справки не переживает даже смену размера окна осмысленно.
  //
  // ЗАКРЫТИЕ СТИКЕРА НЕ СТУПЕНЬ ESC-ЛЕСТНИЦЫ, и это решение, а не пропуск. Лестница гасит СЛОИ,
  // перехватывающие смысл экрана (палитра, шпаргалка, вооружённый добор, выделение); стикер не
  // перехватывает ничего — он сосед дока и полки, а те закрываются `]` и `[` и Esc не слушают.
  // Отдай ему ступень — и Esc, которым сбрасывают выделение, попутно уносил бы справку с экрана.
  // Выше лестницы стоит только ЖИВОЙ ЖЕСТ: драг стикера гасит Esc своим слушателем (см. ниже),
  // ровно как драг ноды, маркиза и драг плитки из полки.
  const [sketchOpen, setSketchOpen] = useState(false);
  const [sketchFolded, setSketchFolded] = useState(false);
  /**
   * Позиция в координатах сцены. `null` — «ещё не мерили»: стартовый угол ставит сам стикер, когда
   * узнает свой размер. ПЕРЕЖИВАЕТ ЗАКРЫТИЕ: положенную под руку справку, закрытую и вызванную
   * снова, возвращать в угол — значит терять выбор, который человек уже сделал.
   */
  const [sketchPos, setSketchPos] = useState<{ x: number; y: number } | null>(null);

  /**
   * Орган без ручки не заводится, и ручка без органа тоже: клавиша `s` и чип живут ровно тогда,
   * когда эскиз действительно приехал сверху.
   */
  const hasSketch = sketchNote != null;
  const toggleSketch = useCallback(() => {
    if (!hasSketch) return;
    setSketchOpen((v) => !v);
  }, [hasSketch]);

  // --- роутер клавиш ------------------------------------------------------------------------------

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.defaultPrevented || e.repeat) return;
    if (e.metaKey || e.ctrlKey) {
      // Модификаторные — ДО typing-гарда глаголов: ⌘0/⌘1 текста не набирают. Уступают они не
      // всякому органу, а НАБОРУ ТЕКСТА (`isTextField`), и каждой — по своей причине.
      const k = comboKey(e);
      if (k === 'f') {
        // ⌘F не уступает никому: родного поиска внутри модального оверлея нет вовсе, а палитра
        // ничего не меняет. Открытую — просто пере-фокусирует.
        openFind();
        e.preventDefault();
        return;
      }
      if (k === 'l') {
        // ⌘L — ЯВНЫЙ ЖЕСТ, и потому единственный (вместе с чипом) писатель `prefs.mode` на этом
        // экране. Набору текста он не уступает: родного смысла внутри модального оверлея у него
        // нет, а вид ничего не правит — как и ⌘F выше. Через `comboKey`: на кириллической
        // раскладке `e.key` даёт «д», и клавиша молча умерла бы у половины цеха.
        toggleMode();
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
      // В СПИСКЕ ПОЛОТНА НЕТ — ⌘0/⌘1 не глотаются ради no-op'а по пустому ref'у: у браузера на
      // них свои жесты (сброс зума страницы, первая вкладка), и отнимать их, ничего не делая
      // взамен, хуже, чем уступить.
      if (listMode) return;
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
    if (!listMode && e.shiftKey && (e.code === 'Digit2' || e.key === '@')) {
      fitSelection();
      e.preventDefault();
      return;
    }
    const verb = verbKey(e);
    // В СПИСКЕ ПОЛОТНА НЕТ — И КЛАВИШИ ПОЛОТНА В НЁМ МОЛЧАТ, все разом, а не по одной.
    //
    // Молчат СОВСЕМ, и это не тот случай, когда «молчаливый выход не отказ»: `u` в списке ответило
    // бы «нарисуйте маркизу или кликните по головам», то есть отправило бы искать органы, которых
    // в этом виде не существует. Неправильные слова хуже молчания. Прочие клавиши полотна
    // (v/h/f/±/стрелки/пробел) без этого гарда и так были бы no-op — `canvasRef` в списке пуст, —
    // но вместе с ними умирал бы и `preventDefault`: пробел и стрелки обязаны остаться прокруткой
    // рельса и колонки редактора. Списку принадлежат ровно `[`, `]` (отказом), `?` и `s`.
    if (listMode && verb !== '[' && verb !== ']' && verb !== '?' && verb !== '/' && verb !== 's') {
      return;
    }
    switch (verb) {
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
      case 's':
        // Показать/спрятать стикер эскиза. Через `verbKey`, как и все прочие глаголы: на
        // кириллической раскладке `e.key` даёт «ы», и клавиша молча умерла бы у половины цеха.
        toggleSketch();
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
        // В СПИСКЕ — ОТКАЗ СЛОВАМИ, а не тихий no-op и тем более не второй редактор (починенный
        // дефект прототипа: `]` в списке открывал док с теми же полями поверх той же строки).
        // Клавиша жива в обоих видах, значит и объяснить обязана в обоих.
        if (listMode) {
          showMessage('the list already carries the step editor', 'error');
          e.preventDefault();
          break;
        }
        toggleDock();
        e.preventDefault();
        break;
      case '[':
        // Свернуть/развернуть полку. Полного скрытия у полки нет: свёрнутая — это её 24px шапка со
        // счётчиками и осями, и `[` переключает ровно эти два состояния.
        toggleShelf();
        e.preventDefault();
        break;
      default:
        break;
    }
  };

  const onKeyUp = (e: React.KeyboardEvent) => {
    if (e.key === ' ') canvasRef.current?.setSpaceHand(false);
  };

  // ТРЕКИ ГРИДА, сверху вниз: хром / зазор / полка / сплиттер полки / сцена / сплиттер дока / док.
  // Порядок ДЕТЕЙ ниже обязан совпадать с этим списком один в один: грид раскладывает их подряд, и
  // выпавший ребёнок сдвигает всех следующих на трек вверх — полотно уезжает в нулевой.
  //
  // Закрытый док отдаёт полотну и свой трек, и трек своего сплиттера (0 и 0); свёрнутая полка
  // схлопывается до шапки, но трек её сплиттера ОСТАЁТСЯ — 8px пустоты между шапкой и полотном
  // дешевле, чем ещё одна пара нулей в списке.
  const rows = [
    'auto',
    `${GRID_GAP}px`,
    shelfCollapsed ? `${SHELF_HEAD}px` : `var(--shelf-h, ${SHELF_DEFAULT}px)`,
    `${GRID_GAP}px`,
    'minmax(0, 1fr)',
    dockOpen ? `${GRID_GAP}px` : '0',
    dockOpen ? `var(--dock-h, ${DOCK_DEFAULT}px)` : '0',
  ].join(' ');

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
            // нет, просто пусты. ВЫШЕ ВСЕЙ ЛЕСТНИЦЫ стоит ЖИВОЙ ЖЕСТ — драг ноды и маркиза гасят
            // Escape своими слушателями на window (`assembly-canvas.tsx`) и до сюда его не пускают:
            // Esc посреди жеста означает «отменить жест», а не «подняться на ступень».
            // Без `preventDefault` Radix закрывает фулскрин раньше любого кастомного слоя — он
            // слушает Escape на документе.
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
            // Режим добора — ПЕРЕД выделением: пока он вооружён, клики полки значат другое, и
            // сначала гасится именно он. Шапка полки это и обещает: «esc to finish».
            if (addModeLive) {
              e.preventDefault();
              setAddMode(null);
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

          {/* ПОЯС `minmax(0,1fr)` НА КОЛОНКЕ — И `min-w-0` НА КАЖДОМ РЕБЁНКЕ. Единственная колонка
              грида по умолчанию `auto`: она вырастает до САМОГО ШИРОКОГО ребёнка и растягивает по
              нему всех остальных, а грид-ребёнок с `min-width:auto` уже своего min-content стать не
              умеет. Замерено на окне 900px: шапка полки давала 1018px, и на эти 1018 растягивались
              хром, полотно и док — `save` и переключатели уезжали за край экрана. Полка была первой,
              но природа общая: широкая строка редактора в доке сделала бы ровно то же. Поэтому пояс
              общий — колонка не растёт, дети ужимаются в трек, а дальше каждый разбирается сам
              (полка скроллит полосу плиток, док переносит строки). `min-h-0` там же и по той же
              причине, только по вертикали: без него панель не умеет стать ниже своего содержимого и
              вылезает из трека. */}
          <div
            ref={gridRef}
            className='grid h-full grid-cols-[minmax(0,1fr)] [&>*]:min-h-0 [&>*]:min-w-0'
            style={{
              gridTemplateRows: rows,
              ['--dock-h' as string]: `${dockH}px`,
              ['--shelf-h' as string]: `${shelfH}px`,
            }}
          >
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
                  {/* ПЕРЕКЛЮЧАТЕЛЬ ВИДА — ТОГГЛ, НЕСУЩИЙ СВОЁ СОСТОЯНИЕ, как чип эскиза рядом:
                      орган, меняющий вид и молчащий о том, какой вид сейчас, читается как не
                      сработавший. `nonForm` — он ЧИТАЮЩИЙ: вид это способ смотреть, а не правка, и
                      на выпущенной карточке он обязан работать (R10). Пишет он в предпочтения
                      карточки, и вместе с ⌘L это ЕДИНСТВЕННЫЙ писатель `prefs.mode` на экране:
                      вход в фулскрин и выход из него режим не трогают. */}
                  <Chip
                    nonForm
                    dashed
                    selected={listMode}
                    pressed={listMode}
                    onClick={toggleMode}
                    title={
                      listMode
                        ? 'back to the schematic — the assembly on a canvas (⌘l)'
                        : 'the sequence as a list — the rail and the open step (⌘l)'
                    }
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
                  {/* ЧИП ЭСКИЗА — `nonForm`, как и весь читающий хром: стикер ничего не пишет и
                      обязан работать на выпущенной карточке. И он ТОГГЛ, поэтому несёт своё
                      состояние заливкой и `aria-pressed`: орган, открывающий панель и молчащий о
                      том, что она уже открыта, читается как не сработавший. */}
                  {hasSketch && (
                    <Chip
                      nonForm
                      dashed
                      selected={sketchOpen}
                      pressed={sketchOpen}
                      onClick={toggleSketch}
                      title='the construction sketch, floating over the canvas (s)'
                    >
                      sketch
                    </Chip>
                  )}
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

            {/* ── полка деталей ────────────────────────────────────────────────────────────── */}
            {/* ПОЛКА ГОВОРИТ, ЧТО СУЩЕСТВУЕТ, полотно — как оно собрано, find — где оно лежит.
                Лоток (`AssemblyTray`) в фулскрине НЕ рендерится вовсе: две поверхности одного
                факта с разной семантикой клика расходятся не в диффе, а на фабрике. */}
            {/* СВОЕЙ ОБЁРТКИ У ПОЛКИ БОЛЬШЕ НЕТ: она стояла ради `min-w-0` на секции, а теперь
                этот пояс лежит на самом гриде и достаётся ВСЕМ его детям сразу — полке, доку и
                хрому. Одна обёртка вокруг одного органа была бы уже не поясом, а заплатой на том
                месте, где порвалось первым. */}
            <AssemblyShelf
              pieces={pieces}
              // КАРТА КАК ЕСТЬ, без перекладки ключей: полка сама сворачивает `lineKey` в
              // `pieceRefKey` для контура, а ткань ключует сырым `lineKey`. Переложи здесь — и
              // получишь пустую штриховку при живом рецепте, ничего не сломав на глаз.
              pieceShapes={pieceShapes}
              pieceClothByColorway={pieceClothByColorway}
              colorwayIndex={cwIndex}
              onColorwayIndex={setColorwayIndex}
              axis={axis}
              onAxis={prefs.setAxis}
              filter={shelfFilter}
              onFilter={setShelfFilter}
              collapsed={shelfCollapsed}
              onToggleCollapsed={toggleShelf}
              intoOf={intoOf}
              unitOrder={unitOrder}
              unitNameOf={unitNameOf}
              selection={pickedSet}
              onPick={pickPiece}
              addMode={shelfAddMode}
              onAddToStep={addPieceToStep}
              onExitAddMode={exitAddMode}
              // ДРАГ НА ПОЛОТНО В СПИСКЕ НЕ ВООРУЖАЕТСЯ ВОВСЕ: полотна нет, нести деталь некуда, а
              // жест, начавшийся и не кончившийся ничем, читается как сломанная полка. Клик по
              // плитке (выбрать / доложить в шаг) работает в обоих видах — обе оси аудита полки от
              // вида не зависят.
              onTilePointerDown={listMode ? undefined : onTilePointerDown}
              frozen={frozen}
            />

            {/* ── сплиттер полки ───────────────────────────────────────────────────────────── */}
            <SplitBar
              value={shelfH}
              min={SHELF_MIN}
              max={SHELF_MAX}
              // +1: сплиттер стоит ПОД полкой, и движение вниз обязано её растить.
              dir={1}
              active={!shelfCollapsed}
              label='resize the pieces shelf'
              onLive={(px) => writeTrack('--shelf-h', px)}
              onCommit={(px) => setPanels({ shelfH: px })}
              onCollapse={toggleShelf}
            />

            {/* ── сцена ────────────────────────────────────────────────────────────────────── */}
            {/* ТРЕК ОДИН НА ОБА ВИДА, и стикер эскиза остаётся его слоем. Список мог бы приехать
                отдельным треком грида, но тогда сцена перестала бы быть системой координат
                стикера — а стикер в списке нужен ровно так же, как на полотне: пины эскиза и
                строки рельса светятся друг от друга, и без эскиза светиться нечему. */}
            <div ref={stageRef} className='relative grid min-h-0 min-w-0'>
              {listMode ? (
                /* ── список: рельс и колонка редактора ──────────────────────────────────────
                   ДВЕ КОЛОНКИ, СКРОЛЛЯЩИЕСЯ ПОРОЗНЬ. Рельс на карточке в сорок шагов длиннее
                   экрана, а редактор шага — сам по себе высокий: общий скролл увозил бы один,
                   пока читают другой. Ровно та же геометрия, что у инлайна (320px + остаток),
                   только высоту здесь задаёт трек грида, а не страница. */
                <div className='flex min-h-0 min-w-0 gap-2'>
                  <div className='flex min-h-0 w-[320px] shrink-0 flex-col overflow-y-auto'>
                    {/* ТОТ ЖЕ МОДУЛЬ, ЧТО У ИНЛАЙНА, и те же данные — они приезжают пропами из
                        `OperationsField`. Второго рельса на те же шаги здесь нет и быть не может:
                        два списка одних и тех же операций разъезжаются первой же правкой, и «шаг
                        30» в оверлее перестаёт совпадать с «шагом 30» на странице. */}
                    <SequenceRail
                      fields={railFields}
                      // В списке шапки узлов врезаются всегда, когда есть что врезать: вид уже
                      // список, второе слагаемое инлайнового условия здесь тождественно истинно.
                      grouped={railMarked}
                      headerBefore={railHeaderBefore}
                      selectedIndex={selectedIndex}
                      // ТОЛЬКО ВЫБОР, БЕЗ `setDockStep`: редактор стоит в колонке справа, и
                      // открытый заодно док положил бы те же поля на экран дважды. `onPickStep`
                      // родителя нужен и здесь — за ним стоит прокрутка инлайнового редактора,
                      // которая понадобится после выхода.
                      onSelect={onPickStep}
                      errorIndices={railErrorIndices}
                      brokenSteps={railBrokenSteps}
                      activePin={activePin}
                      activeBom={activeBom}
                      pieceShapes={pieceShapes}
                      onHoverPin={onHoverPin}
                      // Дроп детали на строку — жест НАТИВНОГО DnD, а в фулскрине его источника
                      // нет вовсе (полка возит плитки pointer-портом). Колбэк всё равно тот же
                      // мутатор: рельс один на два вида, и его контракт не должен различаться.
                      onDropPiece={addInputToOperation}
                      onMoveOperation={moveOperation}
                      readPieceDrag={readPieceDrag}
                    />
                    {/* «＋ OPERATION» ОБЯЗАТЕЛЬНА ИМЕННО ЗДЕСЬ. В схеме она стоит в шапке дока, а
                        в списке док закрыт — и без этой кнопки карточка с нулём шагов (а список и
                        есть её дефолт) не давала бы завести первый шаг вовсе. Настоящая
                        `<button>`, потому что она ПИШЕТ; при заморозке её нет, как нет и чипа в
                        доке. */}
                    {!frozen && (
                      <button
                        type='button'
                        onClick={addStepFromDock}
                        className='mt-0.5 w-full shrink-0 border border-dashed border-borderColor py-1 text-labelColor transition-colors hover:border-textColor hover:text-textColor focus-visible:outline focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-textColor'
                      >
                        <Text size='control' variant='uppercase' tracking='label' component='span'>
                          + operation
                        </Text>
                      </button>
                    )}
                  </div>
                  {/* СВОЙ `<fieldset disabled>` — РОВНО ПО ТОЙ ЖЕ ПРИЧИНЕ, ЧТО У ДОКА: внешний,
                      что стоит на карточке, до портала не достаёт вовсе, и редактор выпущенной
                      карточки был бы полностью правимым. `min-w-0` — против дефолтного
                      `min-inline-size: min-content` самого fieldset.
                      `onFocus` — ЗЕРКАЛО ВОСЬМОЙ ТОЧКИ СБРОСА записи отмены: `focusin` всплывает,
                      одного обработчика на колонке хватает на все поля редактора, и правки полей
                      после create жестовым ⌘Z не отменяются — в списке ровно так же, как в доке. */}
                  <fieldset
                    disabled={frozen}
                    onFocus={onDockEdit}
                    className='min-h-0 min-w-0 flex-1 overflow-y-auto border border-borderColor bg-bgColor p-2'
                  >
                    {/* ВЕРХНЯЯ ГРАНИЦА ОБЯЗАТЕЛЬНА, и слова те же, что в доке: `selected`
                        родителя всегда ≥ 0, и без неё колонка монтировала бы редактор
                        НЕСУЩЕСТВУЮЩЕЙ строки — getValues отдаёт undefined, а первый же ввод
                        создал бы `operations.0` в значениях формы МИМО field array. */}
                    {selectedIndex >= 0 && selectedIndex < steps.length ? (
                      renderDockEditor(armAddMode)
                    ) : (
                      <Text size='micro' variant='label'>
                        {emptySequenceNote}
                      </Text>
                    )}
                  </fieldset>
                </div>
              ) : (
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
              )}
              {/* СТИКЕР ЭСКИЗА — СЛОЙ ПОВЕРХ СЦЕНЫ, А НЕ ВОСЬМОЙ ТРЕК ГРИДА. Грид-ребёнком он был
                  бы обязан отнять у полотна высоту НАВСЕГДА (справка, которую нельзя убрать с
                  дороги, — уже не справка), а его ширина растягивала бы единственную колонку —
                  ровно тот дефект узкого окна, ради которого на гриде лежит пояс
                  `minmax(0,1fr)`/`min-w-0`. Поэтому он абсолютный внутри `relative`-сцены и
                  клампится её прямоугольником; узел содержимого фулскрин кладёт внутрь как есть,
                  ничего о нём не зная. */}
              {hasSketch && sketchOpen && (
                <SketchSticker
                  stageRef={stageRef}
                  pos={sketchPos}
                  onPos={setSketchPos}
                  folded={sketchFolded}
                  onFold={() => setSketchFolded((v) => !v)}
                  onClose={() => setSketchOpen(false)}
                >
                  {sketchNote}
                </SketchSticker>
              )}
            </div>

            {/* ── сплиттер дока ────────────────────────────────────────────────────────────── */}
            <SplitBar
              value={dockH}
              min={DOCK_MIN}
              max={DOCK_MAX}
              // −1: сплиттер стоит НАД доком, и движение вверх обязано его растить.
              dir={-1}
              active={dockOpen}
              label='resize the step dock'
              onLive={(px) => writeTrack('--dock-h', px)}
              onCommit={(px) => setPanels({ dockH: px })}
              onCollapse={closeDock}
            />

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
                  {/* ВЕРХНЯЯ ГРАНИЦА ОБЯЗАТЕЛЬНА: `selected` родителя всегда ≥ 0 (useState(0)),
                      и на карточке без операций `]` подписывал бы док «step 10» по строке,
                      которой нет. */}
                  {selectedIndex >= 0 && selectedIndex < steps.length
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
              {/* ВЕРХНЯЯ ГРАНИЦА — НЕ ПЕРЕСТРАХОВКА: `selected` родителя всегда ≥ 0, и без неё
                  ветка пустой последовательности была мертва, а `]` на карточке без операций
                  монтировал редактор НЕСУЩЕСТВУЮЩЕЙ строки — getValues отдаёт undefined, а первый
                  же ввод создал бы `operations.0` в значениях формы МИМО field array. */}
              <fieldset disabled={frozen} className='min-h-0 min-w-0 flex-1 overflow-y-auto p-2'>
                {!dockOpen ? null : selectedIndex >= 0 && selectedIndex < steps.length ? (
                  renderDockEditor(armAddMode)
                ) : (
                  <Text size='micro' variant='label'>
                    {emptySequenceNote}
                  </Text>
                )}
              </fieldset>
            </section>
          </div>

          {/* ── ghost детали, летящей из полки на полотно ──────────────────────────────────── */}
          {/* ВНЕ ГРИДА И В ЭКРАННЫХ КООРДИНАТАХ — как рамка маркизы в полотне: положение пишется
              императивно, потому что меняется со скоростью кадров, а состояние React перерисовывало
              бы весь экран вместе с редактором шага. `aria-hidden` и `pointer-events-none`: это
              изображение руки, а не орган — под ним обязан жить hit-тест полотна. */}
          {tileDragKey !== null && (
            <div
              ref={ghostRef}
              aria-hidden
              className='pointer-events-none fixed left-0 top-0 z-30 flex items-center justify-center border border-textColor bg-bgColor px-1 opacity-80'
              style={{ width: GHOST_W, height: GHOST_H, display: 'none' }}
            >
              <Text size='micro' component='span' className='min-w-0 truncate uppercase'>
                {tileDragKey}
              </Text>
            </div>
          )}

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
          {/* Оверлей-scrim: перекрывает экран целиком и гасится кликом мимо. */}
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
                  {/* Только клавиши ЭТОГО вида: строка про мёртвую в списке `v` — та же ложь, что
                      подпись про несуществующую клавишу. */}
                  {HELP_KEYS.filter(
                    ([, , where]) => where === 'both' || where === (listMode ? 'list' : 'schematic'),
                  ).map(([keys, what]) => (
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
                    esc closes this; each esc after it drops the top layer — adding pieces, then the
                    selection, then fullscreen itself
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
 * ПОЛОСА-СПЛИТТЕР ПАНЕЛИ — одна на обе панели экрана.
 *
 * У дока и полки различаются ровно три вещи: знак движения (`dir`), кламп и то, что делает двойной
 * клик. Всё остальное — захват указателя, живая запись высоты в CSS-переменную грида мимо React,
 * стрелки с шагом 12px, фокус-кольцо, `aria` — обязано быть ОДНИМ кодом: два экземпляра этой
 * механики уже разошлись однажды (`aria-valuenow` дока не обновлялся во время перетаскивания), и
 * второй экземпляр расходится ровно так же, только позже.
 *
 * СВЁРНУТАЯ ПАНЕЛЬ ОСТАВЛЯЕТ ПОЛОСУ В ГРИДЕ, спрятав её `visibility`. `display:none` убирает
 * грид-ЭЛЕМЕНТ, и все следующие дети съезжают на трек вверх: полотно оказывается в нулевом треке
 * высотой 0px, то есть исчезает.
 */
function SplitBar({
  value,
  min,
  max,
  dir,
  active,
  label,
  onLive,
  onCommit,
  onCollapse,
}: {
  value: number;
  min: number;
  max: number;
  /** Знак, переводящий движение указателя ВНИЗ в прирост высоты: −1 для панели под полосой, +1 — над. */
  dir: 1 | -1;
  /** Панель развёрнута. У свёрнутой полоса остаётся в гриде, но жеста и фокуса у неё нет. */
  active: boolean;
  label: string;
  /** Живая высота — прямо в стиль грида, мимо состояния. */
  onLive: (px: number) => void;
  /** Отпустили: высота уходит в предпочтения. */
  onCommit: (px: number) => void;
  /** Двойной клик по полосе. */
  onCollapse: () => void;
}) {
  const elRef = useRef<HTMLDivElement>(null);
  const gesture = useRef<{ pointerId: number; fromY: number; base: number } | null>(null);
  const live = useRef(value);
  // ВНЕ ЖЕСТА ЖИВОЕ ЧИСЛО СЛЕДУЕТ ЗА КОММИТОМ: высоту меняет не только эта полоса (стрелки, чужая
  // вкладка, дефолт после чтения хранилища), и жест, стартовавший с устаревшей базы, прыгнул бы на
  // первом же движении.
  if (!gesture.current) live.current = value;

  // ФОКУС НЕ ИМЕЕТ ПРАВА ПРОВАЛИТЬСЯ В BODY, и это не про вежливость. Свёртка прячет полосу
  // `visibility:hidden`, а спрятанный элемент фокус не держит: браузер отдаёт его `<body>` — то
  // есть ЗА пределы `Dialog.Content`, на котором висит роутер клавиш. Замерено на стенде: `[` с
  // фокусом на полосе сворачивал полку и дальше не работала НИ ОДНА клавиша экрана, пока не
  // кликнешь внутрь. Возвращаем фокус контенту диалога — туда же, куда его ставит Radix на входе.
  const wasActive = useRef(active);
  useLayoutEffect(() => {
    const lost = wasActive.current && !active;
    wasActive.current = active;
    if (!lost) return;
    const el = elRef.current;
    const a = document.activeElement;
    // Фокус уже забрал кто-то живой — отбирать его не за что.
    if (a && a !== el && a !== document.body) return;
    (el?.closest('[role="dialog"]') as HTMLElement | null)?.focus();
  }, [active]);

  const write = useCallback(
    (px: number) => {
      const v = Math.min(max, Math.max(min, px));
      live.current = v;
      // `aria-valuenow` — ЖИВОЙ, и пишется он руками. React-атрибутом он обновлялся бы только на
      // коммите: высота во время жеста идёт мимо состояния, рендера нет, и скринридер всё
      // перетаскивание читал бы число, с которого начали. React перезапишет атрибут своим значением
      // на первом же рендере с ИЗМЕНИВШИМСЯ `value` — то есть ровно после коммита.
      elRef.current?.setAttribute('aria-valuenow', String(v));
      onLive(v);
    },
    [min, max, onLive],
  );

  /** Указатель зажат на полосе. Пока true, аварийные концы жеста слушают окно и только окно. */
  const [dragging, setDragging] = useState(false);

  const endGesture = (e: React.PointerEvent) => {
    const g = gesture.current;
    if (!g || e.pointerId !== g.pointerId) return;
    gesture.current = null;
    setDragging(false);
    onCommit(live.current);
  };

  // ЖИВОЙ ЖЕСТ ПОЛОСЫ — ВЫШЕ ВСЕЙ ESC-ЛЕСТНИЦЫ, как драг ноды, маркиза, плитка из полки и стикер:
  // Esc посреди перетаскивания значит «верни высоту, какой была», а не «поднимись на ступень» — и
  // уж точно не «закрой фулскрин под зажатым указателем» (ровно это и происходило: полоса была
  // единственным живым жестом экрана без своего слушателя, Radix ловил Escape на документе и при
  // пустой лестнице закрывал оверлей, не дав жесту кончиться). Потеря окна и потеря видимости —
  // аварийные концы: `pointerup` после них может не прийти никогда, и незакрытый жест оставил бы
  // высоту панели живущей мимо предпочтений до следующего касания. Аварийный конец закрывается как
  // `pointercancel` — коммитом достигнутой высоты; отменяет (возвращает высоту ДО жеста) только Esc.
  useEffect(() => {
    if (!dragging) return;
    const finish = (commit: boolean) => {
      const g = gesture.current;
      if (!g) return;
      gesture.current = null;
      setDragging(false);
      // Захват мог быть уже снят браузером — исключение уронило бы конец жеста, а не начало.
      try {
        elRef.current?.releasePointerCapture(g.pointerId);
      } catch {
        /* указатель уже отпущен */
      }
      if (commit) {
        onCommit(live.current);
        return;
      }
      // Отмена: высота ДО жеста. В предпочтения не пишем — там она и лежит.
      write(g.base);
    };
    const lost = () => finish(true);
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape' || !gesture.current) return;
      e.preventDefault();
      e.stopPropagation();
      finish(false);
    };
    window.addEventListener('blur', lost);
    document.addEventListener('visibilitychange', lost);
    window.addEventListener('keydown', onKey, true);
    return () => {
      window.removeEventListener('blur', lost);
      document.removeEventListener('visibilitychange', lost);
      window.removeEventListener('keydown', onKey, true);
    };
  }, [dragging, onCommit, write]);

  return (
    <div
      ref={elRef}
      role='separator'
      aria-orientation='horizontal'
      aria-label={label}
      aria-valuenow={value}
      aria-valuemin={min}
      aria-valuemax={max}
      tabIndex={active ? 0 : -1}
      className='group relative cursor-row-resize focus-visible:outline focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-textColor'
      style={{ touchAction: 'none', visibility: active ? undefined : 'hidden' }}
      onPointerDown={(e) => {
        if (!active || e.button !== 0) return;
        gesture.current = { pointerId: e.pointerId, fromY: e.clientY, base: live.current };
        (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
        setDragging(true);
        e.preventDefault();
      }}
      onPointerMove={(e) => {
        const g = gesture.current;
        if (!g || e.pointerId !== g.pointerId) return;
        write(g.base + dir * (e.clientY - g.fromY));
      }}
      onPointerUp={endGesture}
      onPointerCancel={endGesture}
      onDoubleClick={onCollapse}
      onKeyDown={(e) => {
        if (e.key !== 'ArrowUp' && e.key !== 'ArrowDown') return;
        // Стрелки принадлежат полосе, пока фокус на ней: без остановки они дошли бы до роутера
        // фулскрина и двигали бы выбранные ноды, пока человек меняет высоту панели.
        e.preventDefault();
        e.stopPropagation();
        write(live.current + dir * (e.key === 'ArrowDown' ? 12 : -12));
        onCommit(live.current);
      }}
    >
      <span className='pointer-events-none absolute left-1/2 top-1/2 h-[3px] w-8 -translate-x-1/2 -translate-y-1/2 border-y border-borderColor transition-colors group-hover:border-textColor' />
    </div>
  );
}

/**
 * СТИКЕР ЭСКИЗА — плавающая справка над сценой.
 *
 * ЧУЖОЙ УЗЕЛ ВНУТРИ, И ЭТО ВСЁ, ЧТО О НЁМ ИЗВЕСТНО. Эскиз приезжает ЭЛЕМЕНТОМ с вкладки: его
 * подписки на форму (`operations`, `callouts`, `technicalMedia`) остаются в листе, который их
 * завёл, а фулскрин даёт узлу шапку, место и умение уйти. Смонтируй здесь второй такой же
 * компонент — и получишь второй комплект подписок с собственным мнением о том, какой пин активен.
 *
 * ПОЗИЦИЯ ВО ВРЕМЯ ЖЕСТА ПИШЕТСЯ ИМПЕРАТИВНО, как трансформ мира, рамка маркизы, ghost плитки и
 * высоты панелей: состояние React на каждый кадр перерисовывало бы полотно и редактор шага
 * целиком. В состояние она уходит по отпусканию — одним рендером на весь жест.
 *
 * АНИМАЦИЙ ПЕРЕЛЁТА НЕТ ВООБЩЕ (ни `transition`, ни доводки): стикер стоит там, где его отпустили,
 * поэтому `prefers-reduced-motion` ему нечего уважать — уважать нечего по построению.
 *
 * ЗАМОРОЗКА ЕГО НЕ КАСАЕТСЯ (R10): это чтение и раскладка, а не правка. Ни одного `disabled` на
 * его органах нет и быть не должно — на выпущенной карточке эскиз обязан открываться и таскаться
 * так же, как на живой.
 */
function SketchSticker({
  stageRef,
  pos,
  onPos,
  folded,
  onFold,
  onClose,
  children,
}: {
  /** Сцена: система координат стикера и его кламп. */
  stageRef: React.RefObject<HTMLDivElement | null>;
  /** `null` — размер ещё не мерян; стартовый угол ставит первый же layout-эффект. */
  pos: { x: number; y: number } | null;
  onPos: (p: { x: number; y: number }) => void;
  folded: boolean;
  onFold: () => void;
  onClose: () => void;
  children: ReactNode;
}) {
  const elRef = useRef<HTMLDivElement>(null);
  const drag = useRef<{
    pointerId: number;
    /** Где внутри стикера держат указатель: без этого он прыгал бы углом под курсор. */
    offX: number;
    offY: number;
    /** Шапка, захватившая указатель: с неё же его и снимаем. */
    el: HTMLElement;
    /** Позиция ДО жеста. Esc возвращает ровно её. */
    from: { x: number; y: number };
  } | null>(null);
  /** Живая позиция жеста. Коммитится в состояние по отпусканию — не на каждый кадр. */
  const live = useRef({ x: 0, y: 0 });
  const [dragging, setDragging] = useState(false);

  /**
   * Кламп в прямоугольник сцены. Стикер шире или выше сцены (узкое окно, открытый док) — прижимаем
   * к левому верхнему углу: уехавший за край угол с шапкой не вернуть уже ничем.
   */
  const clampTo = useCallback(
    (x: number, y: number) => {
      const stage = stageRef.current?.getBoundingClientRect();
      const el = elRef.current?.getBoundingClientRect();
      if (!stage || !el) return { x, y };
      return {
        x: Math.max(0, Math.min(x, stage.width - el.width)),
        y: Math.max(0, Math.min(y, stage.height - el.height)),
      };
    },
    [stageRef],
  );

  const paintAt = useCallback((p: { x: number; y: number }) => {
    const el = elRef.current;
    if (!el) return;
    el.style.left = `${p.x}px`;
    el.style.top = `${p.y}px`;
  }, []);

  // СТАРТОВЫЙ УГОЛ — ВЕРХНИЙ ПРАВЫЙ, и ставится он ПОСЛЕ ЗАМЕРА. Внизу у полотна свой HUD
  // (инструмент и зум) во всю ширину, слева его органы; верх сцены пуст. Layout-эффект успевает до
  // покраски, поэтому первого кадра в чужом углу не будет: до замера стикер прижат `right`, после —
  // живёт в `left`/`top`, как и всё остальное время.
  useLayoutEffect(() => {
    if (pos) return;
    const stage = stageRef.current?.getBoundingClientRect();
    const el = elRef.current?.getBoundingClientRect();
    if (!stage || !el) return;
    onPos(clampTo(stage.width - el.width - STICKER_MARGIN, STICKER_MARGIN));
  }, [pos, stageRef, clampTo, onPos]);

  /**
   * ПЕРЕ-КЛАМП. Сцена меняет размер без единого рендера стикера: открылся док, потянули сплиттер
   * (высота пишется прямо в CSS-переменную), сузили окно, свернули полку. Стикер, положенный у
   * нижнего края, после этого висел бы ПОВЕРХ дока — сцена его не обрезает.
   */
  const reclamp = useCallback(() => {
    if (drag.current) return; // посреди жеста позицию ведёт рука, а не наблюдатель
    const stage = stageRef.current?.getBoundingClientRect();
    const el = elRef.current?.getBoundingClientRect();
    if (!stage || !el) return;
    const x = el.left - stage.left;
    const y = el.top - stage.top;
    const c = clampTo(x, y);
    if (c.x !== x || c.y !== y) onPos(c);
  }, [stageRef, clampTo, onPos]);

  useEffect(() => {
    const stage = stageRef.current;
    if (!stage) return;
    const ro = new ResizeObserver(reclamp);
    ro.observe(stage);
    return () => ro.disconnect();
  }, [stageRef, reclamp]);

  // Разворот растит стикер вниз и может вывести его за нижний край; свёртка — только уменьшает,
  // но эффект один на оба перехода, чтобы не заводить правило «в одну сторону клампим».
  useLayoutEffect(reclamp, [folded, reclamp]);

  const onHeadPointerDown = (e: React.PointerEvent) => {
    // Правая и средняя кнопки жеста не начинают; тач и перо приходят с `button === 0`.
    if (e.button !== 0) return;
    // Кнопки шапки жеста НЕ начинают: иначе каждое нажатие «свернуть» было бы ещё и
    // микро-перетаскиванием на дрожание руки.
    if ((e.target as HTMLElement).closest('button')) return;
    const stage = stageRef.current?.getBoundingClientRect();
    const el = elRef.current?.getBoundingClientRect();
    if (!stage || !el) return;
    const head = e.currentTarget as HTMLElement;
    const from = { x: el.left - stage.left, y: el.top - stage.top };
    drag.current = {
      pointerId: e.pointerId,
      offX: e.clientX - el.left,
      offY: e.clientY - el.top,
      el: head,
      from,
    };
    live.current = from;
    // Захват — чтобы жест не потерялся, уйдя с шапки: дальше он живёт над полотном, у которого
    // свои pointer-обработчики. `preventDefault` не зовём — он отнял бы у шапки фокус вместе с
    // клавиатурным путём к её кнопкам; выделение текста гасит `select-none`.
    try {
      head.setPointerCapture(e.pointerId);
    } catch {
      /* без захвата обойдёмся — слушатели всё равно на окне */
    }
    setDragging(true);
  };

  useEffect(() => {
    if (!dragging) return;
    const finish = (commit: boolean) => {
      const g = drag.current;
      if (!g) return;
      drag.current = null;
      setDragging(false);
      // Захват мог быть уже снят браузером (`pointercancel`) — исключение здесь уронило бы конец
      // жеста, а не его начало.
      try {
        g.el.releasePointerCapture(g.pointerId);
      } catch {
        /* указатель уже отпущен */
      }
      if (commit) {
        onPos(live.current);
        return;
      }
      // Отмена: возвращаем позицию ДО жеста. Состояние её и держит, поэтому пишем только стиль —
      // рендера здесь не нужно вовсе.
      live.current = g.from;
      paintAt(g.from);
    };
    const move = (e: PointerEvent) => {
      const g = drag.current;
      if (!g || e.pointerId !== g.pointerId) return;
      const stage = stageRef.current?.getBoundingClientRect();
      if (!stage) return;
      const p = clampTo(e.clientX - g.offX - stage.left, e.clientY - g.offY - stage.top);
      live.current = p;
      paintAt(p);
    };
    const up = (e: PointerEvent) => {
      const g = drag.current;
      if (!g || e.pointerId !== g.pointerId) return;
      finish(true);
    };
    /** Палец увела прокрутка или система забрала жест: `pointerup` не придёт НИКОГДА. */
    const cancel = (e: PointerEvent) => {
      const g = drag.current;
      if (g && e.pointerId !== g.pointerId) return;
      finish(false);
    };
    // Потеря окна И потеря видимости — оба аварийные конца, и слушать надо оба: `blur` владельцу
    // жеста может и не прийти, а стикер, оставшийся приклеенным к курсору без единой зажатой
    // кнопки, — тот же зависший ghost, только крупнее.
    const lost = () => finish(false);
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape' || !drag.current) return;
      // ЖИВОЙ ЖЕСТ ВЫШЕ ВСЕЙ ESC-ЛЕСТНИЦЫ — ровно как драг ноды, маркиза и драг плитки из полки:
      // Esc посреди жеста значит «отменить жест», а не «подняться на ступень». Сам по себе стикер
      // ступени не занимает: он сосед дока и полки, а не слой, перехватывающий смысл экрана.
      e.preventDefault();
      e.stopPropagation();
      finish(false);
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
    window.addEventListener('pointercancel', cancel);
    window.addEventListener('blur', lost);
    document.addEventListener('visibilitychange', lost);
    window.addEventListener('keydown', onKey, true);
    return () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      window.removeEventListener('pointercancel', cancel);
      window.removeEventListener('blur', lost);
      document.removeEventListener('visibilitychange', lost);
      window.removeEventListener('keydown', onKey, true);
    };
  }, [dragging, clampTo, onPos, paintAt, stageRef]);

  const close = () => {
    // ФОКУС НЕ ИМЕЕТ ПРАВА ПРОВАЛИТЬСЯ В BODY — та же причина, что у полосы-сплиттера: стикер
    // уходит ВМЕСТЕ с кнопкой, на которой стоит фокус, браузер отдаёт его `<body>`, то есть ЗА
    // пределы `Dialog.Content` с роутером клавиш, и дальше не работает ни одна клавиша экрана,
    // пока не кликнешь внутрь.
    (elRef.current?.closest('[role="dialog"]') as HTMLElement | null)?.focus();
    onClose();
  };

  return (
    <div
      ref={elRef}
      role='group'
      aria-label='construction sketch'
      className='absolute z-10 flex max-h-[calc(100%-16px)] flex-col border border-textColor bg-bgColor'
      style={
        pos
          ? { left: pos.x, top: pos.y, width: STICKER_W }
          : { right: STICKER_MARGIN, top: STICKER_MARGIN, width: STICKER_W }
      }
    >
      <div
        className={cn(
          'flex h-6 shrink-0 cursor-move select-none items-center gap-1 px-1',
          // Внутреннее правило — только когда под ним есть что отделять: у свёрнутого стикера оно
          // легло бы вплотную к его собственной рамке и читалось бы одной жирной чертой.
          !folded && 'border-b border-hairline',
        )}
        // Палец на шапке таскает стикер, а не страницу под оверлеем.
        style={{ touchAction: 'none' }}
        onPointerDown={onHeadPointerDown}
      >
        <button
          type='button'
          onClick={onFold}
          aria-expanded={!folded}
          aria-label={folded ? 'open the sketch' : 'collapse the sketch to its head'}
          title={folded ? 'open the sketch' : 'collapse the sketch to its head'}
          className='text-labelColor transition-colors hover:text-textColor'
        >
          <Text size='micro' component='span'>
            {folded ? '▸' : '▾'}
          </Text>
        </button>
        <Text
          size='micro'
          variant='uppercase'
          tracking='label'
          component='span'
          className='min-w-0 truncate font-bold'
        >
          sketch
        </Text>
        <button
          type='button'
          onClick={close}
          aria-label='hide the sketch'
          title='hide the sketch (s)'
          className='ml-auto text-labelColor transition-colors hover:text-textColor'
        >
          <Text size='micro' component='span'>
            ✕
          </Text>
        </button>
      </div>
      {/* СВЁРНУТЫЙ СТИКЕР — РОВНО ЕГО ШАПКА: тело снимается, а не прячется `visibility`, иначе
          свёрнутая справка продолжала бы отнимать место у полотна, ничего не показывая. */}
      {!folded && <div className='min-h-0 overflow-y-auto p-1.5'>{children}</div>}
    </div>
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
