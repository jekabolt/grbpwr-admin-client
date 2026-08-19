import * as Dialog from '@radix-ui/react-dialog';
import { cn } from 'lib/utility';
import { useSnackBarStore } from 'lib/stores/store';
import { useCallback, useRef, useState, type ReactNode } from 'react';
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
      // Модификаторные — ДО typing-гарда: ⌘0/⌘1 текста не набирают. А ⌘Z сюда не попадает вовсе,
      // и правильно: в поле это родной откат ввода.
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
      case ']':
        toggleDock();
        e.preventDefault();
        break;
      case '[':
        // Полка деталей приедет в Ф5. До неё клавиша молчит — обещать полосой подсказок то, чего
        // нет, хуже, чем не обещать ничего.
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
            // нет, просто пусты. Без `preventDefault` Radix закрывает фулскрин раньше любого
            // кастомного слоя — он слушает Escape на документе.
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
            <section
              className='flex min-h-0 flex-col border border-borderColor bg-bgColor'
              style={{ visibility: dockOpen ? undefined : 'hidden' }}
              aria-hidden={!dockOpen}
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
