import * as Dialog from '@radix-ui/react-dialog';
import type {
  DesignBenchSlotRef,
  GetDesignBandResponse,
  common_DesignEditLayer,
  common_DesignPicture,
} from 'api/proto-http/admin';
import { fetchMediaBlob } from 'lib/features/media-blob';
import { useSnackBarStore } from 'lib/stores/store';
import { cn } from 'lib/utility';
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { nearestOnPolyline } from 'ui/components/annotation/geometry';
import { Button } from 'ui/components/button';
import { CalloutBox } from 'ui/components/callout-box';
import { Chip, ChipRow } from 'ui/components/chip';
import { ConfirmationModal } from 'ui/components/confirmation-modal';
import { Pill } from 'ui/components/pill';
import Text from 'ui/components/text';

import { fitView, toWorld, zoomAt, type View } from '../../canvas-view';
import { pictureHandle } from '../handles';
import { provenanceLabel, readProvenance } from '../provenance';
import { useDesignWrites } from '../use-design-band';
import { RASTER_FALLBACK_W, pickSceneInk, rasteriseStrokesOverBase } from './rasterise-layer';
import { TraceVectorPanel } from './trace-vector-panel';
import { findMediaUrlInBand, useTraceVector } from './use-trace-vector';
import {
  findLayerForMedia,
  layerRasterUrl,
  layerRefusalText,
  uploadRaster,
  useDesignEditLayer,
  useEditLayerWrites,
  type LayerHandle,
} from './use-edit-layer';
import { ToolIcon, VectorBrushRail } from './vector-brush-rail';
import {
  copyInsideSelection,
  deleteInsideSelection,
  pointInPolygon,
  selectionPathD,
  settleLasso,
  type SelectionArea,
} from './vector-lasso';
import { DEFAULT_NIB, clampNib, eraseAlong, stampAlong } from './vector-nib';
import {
  PLATE_W,
  RASTER_UNDO_BYTES,
  RASTER_UNDO_DEPTH,
  clearGesture,
  cloneAlong,
  commitStage,
  exportRasterPng,
  markRect,
  maskBox,
  nibRadius,
  paintAlong,
  rasterBox,

  renderView,
  seedRaster,
  selectionMask,
  clearInside,
  softenInside,
  stageScratch,
  type PaintMode,
  type RasterLayer,
} from './vector-raster';
import {
  EditTimeline,
  emptyTimelineState,
  type TimelineState,
  type UndoResult,
} from './vector-raster-history';
import {
  penDown,
  penMove,
  penPolygon,
  penPreviewD,
  penRubberD,
  penStroke,
  penUndo,
  penUp,
  type PenState,
} from './vector-pen';
import {
  DEFAULT_INK,
  DEFAULT_RATIO,
  MAX_STROKES_BYTES,
  STITCHES,
  DEFAULT_GAUGE,
  DEFAULT_STEP,
  clampGauge,
  clampStep,
  gaugeWeight,
  layerSvg,
  readInk,
  readLayer,
  settleTrace,
  strokeGeometry,
  strokePolyline,
  writeLayer,
  type StitchKey,
  type VectorStroke,
} from './vector-strokes';

/**
 * THE VECTOR EDITOR — strokes over a flat, on their own layer, with the raster underneath as a
 * tracing sheet. It is the door `bench-slot.tsx` ships as `edit ▸`.
 *
 * THE PICTURE UNDERNEATH IS NEVER TOUCHED, AND THAT IS THE WHOLE ARRANGEMENT. Three objects, not
 * one: the BASE picture (untouched bytes), the LAYER (this client's strokes, addressed by its own
 * id and versioned by a compare-and-set rev), and — only when somebody asks for it — a FLATTENED
 * picture, a sibling of the base carrying `derived_from`. A design that wrote strokes back onto the
 * base would destroy the one thing a minted sheet pins: the hash of the bytes it froze.
 *
 * THE CLIENT RASTERISES. There is no vector renderer in the backend at all and the stroke format is
 * this client's own, so the only honest rasteriser is the canvas that drew the strokes. The bytes
 * go up through `UploadContentImage` and `FlattenDesignEditLayer` records the provenance — see
 * `use-edit-layer.ts` for why the shared upload hook is not the one used.
 *
 * A LAYER THIS BUNDLE CANNOT READ IS NOT AN EMPTY LAYER. `readLayer` flags it, every writer here
 * turns off, and the screen says so — starting clean and saving would replace a colleague's drawing
 * with nothing, and there is no revision history to recover it from (the contract says so in as
 * many words: «there is deliberately no revision history»).
 *
 * ─── ОБОЛОЧКА: ПОЛНЫЙ ЭКРАН, ВИД С ЗУМОМ И ПАНОРАМОЙ ─────────────────────────────────────────
 *
 * Редактор живёт ПОЛНЫМ ЭКРАНОМ, той же грамматикой, что фулскрин схемы сборки
 * (`assembly-fullscreen.tsx`): Radix-диалог на весь вьюпорт, свой признак в DOM
 * (`data-vector-screen`), шапка-хром с явным выходом, клавиши-глаголы, сверенные по `e.code` для
 * не-латинских раскладок, и Esc-лестница. Прежняя оболочка была `ConfirmationModal` c потолком
 * сцены 360px — 12.5% экрана 1440×900 под холстом у инструмента, чья работа и есть холст.
 *
 * ВИД — ОТДЕЛЬНАЯ СИСТЕМА КООРДИНАТ, а не размер коробки. Мир (плата с растром и штрихами) стоит
 * в 0,0 вьюпорта и двигается транформом `translate(pan) scale(zoom)`; указатель переводится в мир
 * через `toWorld` из `canvas-view.ts` — тот же чистый модуль, которым смотрит полотно сборки, со
 * всеми его уроками (деление на зум, удержание точки под курсором, кламп вписывания). Штрихи
 * ХРАНЯТСЯ ДОЛЯМИ 0..1 КАДРА, как хранились: зум и панорама — свойства ВЗГЛЯДА, и в записи их нет,
 * поэтому перезалив растра другого размера по-прежнему не сдвигает ни одной линии.
 *
 * КИСТЬЮ РИСУЮТ, А НЕ НАЗНАЧАЮТ ВИД ЗАДНИМ ЧИСЛОМ. Выбранный в рейке шов — активная кисть, и
 * каждый новый штрих рождается ею. Прежний довод («шов — промышленное утверждение, ставить
 * машину, которую никто не выбирал, нельзя») не отменён, а перенесён на своё место: он запрещал
 * АВТОМАТИЧЕСКОЕ пред-заполнение, и потому кисть при входе — `plain`, машина не названа, пока
 * человек сам не взял её в руку. Явный выбор человека этим доводом не гейтуется.
 *
 * ВОПРОС ПРИ ВХОДЕ. Плата без вектора встречает развилкой: рисовать поверх растра или перевести
 * растр в вектор машиной. Вторая ветка ЖИВАЯ: контракт дорос (род прогона `vector` +
 * `UploadContentVector`/`ImportDesignVector`), и весь её ход — платный прогон, ожидание, ПРИЁМКА
 * ЧЕЛОВЕКОМ рядом с исходником, подшивка слоя — живёт на этом же экране, в
 * `trace-vector-panel.tsx` (UI) и `use-trace-vector.ts` (данные и деньги). Прежняя точка
 * подключения `onTraceToVector` снята: она существовала, пока контракта не было, а флоу целиком
 * принадлежит редактору — у него есть всё (band, base, slot), и второй модалки поверх экрана
 * правило «сперва исчерпай встроенное» не разрешает. Слой, в котором вектор уже есть — штрихами
 * ИЛИ файлом (`source_media_id`), — развилку не показывает: «если зашли ещё раз — оно уже имеет
 * вектор».
 */

type Tool =
  | 'line'
  | 'freehand'
  | 'curve'
  | 'select'
  | 'clone'
  | 'paint'
  | 'erase'
  | 'stamp'
  | 'lasso'
  | 'pan';

/**
 * ДВА МАТЕРИАЛА, И КАЖДЫЙ ЧИП НАЗЫВАЕТ СВОЙ. Это главное решение круга 6 на поверхности.
 *
 * До растра у редактора был один материал — ЛИНИИ, — и всякий инструмент, как бы он ни назывался,
 * работал по ним. С появлением пикселей появился второй, и «ластик» перестал быть одним словом:
 * стереть пиксели фотографии и вырезать кусок проведённой линии — разные работы над разными
 * вещами, с разными последствиями (пиксель уходит навсегда в картинку, линия остаётся правимой).
 *
 * ── ПОЧЕМУ ЭТО НЕ ЛОЖНОЕ РАСЩЕПЛЕНИЕ ───────────────────────────────────────────────────────
 *
 * Признак ложного расщепления — два органа, делающих ОДНУ работу и различающихся лишь тем, у кого
 * сосед не задан. Ровно этим и оказалась пара `cut` / `erase`: два инструмента, у которых человек
 * обязан был ПОМНИТЬ, из чего сделано то, что он хочет убрать, ПРЕЖДЕ чем выбрать, чем убирать.
 * Владелец распорядился свести их в один (Y-9), и `cut` снят: ластик снимает оба материала одним
 * жестом. Полосы `lines` / `pixels` остались — они говорят, ЧТО инструмент производит, а не
 * заставляют выбирать между двумя ластиками.
 *
 * ── ПОЧЕМУ ЭТО И НЕ ВЕДРО ПОД ДВУМЯ СМЫСЛАМИ ───────────────────────────────────────────────
 *
 * Обратная ловушка — ОДИН орган, означающий два разных дела в зависимости от скрытого режима.
 * Именно её мы бы получили, оставив один чип «erase», чей смысл зависит от того, какой слой сейчас
 * «активен». Поэтому режима нет: чипов два, они стоят в РАЗНЫХ полосах с надписанным материалом, и
 * подпись каждого говорит, что он трогает и что оставляет нетронутым.
 *
 * ── ЧТО СТАЛО С ДОВОДОМ `vector-nib.ts` ────────────────────────────────────────────────────
 *
 * Шапка того файла объясняла, почему штамп клонирует ШТРИХИ: «растра в документе нет вовсе».
 * Довод УМЕР — растр появился. Но вывод пережил свою причину не по инерции, а по новой: линии —
 * материал, у которого своё вычитание и своё размножение, и `clone` остаётся ЕДИНСТВЕННЫМ способом
 * положить копию линий туда, куда показала рука (у «copy inside» смещение фиксированное, а
 * инструмента переноса штрихов в редакторе нет вовсе).
 */
type Material = 'lines' | 'pixels' | 'view';

const TOOL_LABEL: Record<Tool, string> = {
  line: 'line',
  freehand: 'freehand',
  // Внутреннее имя `curve` — слово ФОРМАТА штриха и не меняется; на экране инструмент называется
  // тем словом, которым его просил владелец: pen.
  curve: 'pen',
  select: 'select',
  clone: 'clone',
  paint: 'brush',
  erase: 'erase',
  stamp: 'stamp',
  lasso: 'lasso',
  pan: 'pan',
};

/** Клавиша-глагол каждого инструмента. Сверяется по `e.code` — см. `verbKey`. */
const TOOL_KEY: Record<Tool, string> = {
  line: 'l',
  freehand: 'b',
  curve: 'p',
  select: 'v',
  clone: 'c',
  paint: 'r',
  erase: 'e',
  stamp: 's',
  lasso: 'w',
  pan: 'h',
};

/**
 * Что инструмент делает — одной строкой, и в ней ОБЯЗАТЕЛЬНО сказано, чего он НЕ трогает: у ластика
 * это единственное место, где названы ТРИ его правила (скрытые линии, неполная непрозрачность и
 * активная область), а без них он выглядел бы то режущим, то нет, без видимой причины.
 */
const TOOL_HINT: Record<Tool, string> = {
  line: 'a straight line, born with the stitch in hand',
  freehand: 'a line that follows the hand',
  curve: 'anchors and handles — the drawing tool for curves',
  select: 'pick one line and edit its stitch, colour, size',
  clone: 'copy the LINES under the source and lay them under your hand',
  paint: 'paint PIXELS with the ink, size, hardness and opacity in hand',
  erase:
    'rub away everything under the nib — the pixels go to transparency, the photo included, and the drawn lines are cut through. Lines are only cut at full opacity (a line cannot be half-erased), never while the lines layer is hidden, and never outside an active area',
  stamp: 'copy PIXELS from the source to under your hand, as in photoshop',
  lasso: 'draw an area — it holds the raster tools in and cuts the lines at its edge',
  pan: 'move the sheet',
};

/**
 * Порядок полос над холстом.
 *
 * ⚠ `cut` УБРАН ПО ПРЯМОМУ РЕШЕНИЮ ВЛАДЕЛЬЦА (Y-9): «ластик один на всё». Отдельный резчик линий
 * стоял рядом с ластиком пикселей, и различал их только материал — то есть человек обязан был
 * помнить, из чего сделано то, что он хочет убрать, ПРЕЖДЕ чем выбрать инструмент. Теперь ластик
 * снимает и краску, и линии одним жестом, и помнить нечего.
 */
const TOOL_BANDS: { material: Material; label: string; tools: Tool[] }[] = [
  { material: 'lines', label: 'lines', tools: ['line', 'freehand', 'curve', 'select', 'clone'] },
  { material: 'pixels', label: 'pixels', tools: ['paint', 'erase', 'stamp'] },
  { material: 'view', label: 'area & view', tools: ['lasso', 'pan'] },
];

/** Инструменты, красящие ПИКСЕЛИ. Их жест копится в буфере растра, а не в списке штрихов. */
const isRasterTool = (t: Tool): t is 'paint' | 'erase' | 'stamp' =>
  t === 'paint' || t === 'erase' || t === 'stamp';

/** Инструмент, множащий ЛИНИИ круглым нибом. Резчик ушёл в ластик — см. `TOOL_BANDS`. */
const isLineNib = (t: Tool): t is 'clone' => t === 'clone';

/**
 * Круглый ниб в руке — у всех пяти. ОДНО число размера на все, а не по числу на инструмент: довод
 * прежнего ниба («стирают крупным кругом, а рисуют тонкой нитью») отделял КРУГЛЫЙ КОНЧИК от НИТИ,
 * а не ластик от штампа. Пять чисел на пять круглых кончиков были бы пятью ручками, которые человек
 * крутит в одну и ту же сторону.
 */
const isNibTool = (t: Tool): t is 'clone' | 'paint' | 'erase' | 'stamp' =>
  isRasterTool(t) || isLineNib(t);

/** Инструменты, берущие ИСТОЧНИК alt-кликом. */
const isSourceTool = (t: Tool): t is 'clone' | 'stamp' => t === 'clone' || t === 'stamp';

/** How close a click has to land, in SCREEN pixels, to mean «this stroke». */
const HIT_PX = 10;
/** Шаг зума кнопкой и клавишей — тот же, что у полотна сборки (ZOOM_STEP его HUD). */
const Z_STEP = 1.2;

/**
 * Признак экрана в DOM — тем же приёмом, что `data-assembly-screen`: модалка поверх (страж выхода)
 * живёт в СВОЁМ портале у body, и вернуть фокус экрану после её закрытия можно только найдя его.
 */
const SCREEN_MARK = 'data-vector-screen';

const clamp01 = (n: number) => Math.min(1, Math.max(0, n));

/**
 * Клавиши-глаголы не срабатывают, пока набирают текст, — тот же гард, что у фулскрина сборки
 * (см. довод у TYPING_TARGETS там): Radix-органы шлют события со своих внутренних спанов.
 */
const TYPING_TARGETS =
  'input, textarea, select, button, [role="combobox"], [role="radio"], [role="option"], [role="listbox"], [contenteditable=""], [contenteditable="true"]';
const isTyping = (target: EventTarget | null): boolean => {
  const el = target as HTMLElement | null;
  return !!el?.closest?.(TYPING_TARGETS);
};

/**
 * Клавиша глагола: символ, а с не-латинской раскладки — ФИЗИЧЕСКАЯ клавиша. Дословно правило
 * фулскрина сборки: на кириллице `e.key` даёт «в»/«з», и все одноклавишные глаголы молча умирали
 * бы у половины пользователей. Функция не экспортируется оттуда — повторена с этой ссылкой.
 */
const verbKey = (e: { key: string; code: string; shiftKey: boolean }): string => {
  if (/^[a-z]$/.test(e.key)) return e.key;
  if (!e.shiftKey && /^Key[A-Z]$/.test(e.code)) return e.code.slice(3).toLowerCase();
  if (!e.shiftKey && /^Digit[0-9]$/.test(e.code)) return e.code.slice(5);
  return e.key;
};

/* Механика пера целиком живёт в vector-pen.ts: прежняя модель «одна исходящая рукоятка на якорь,
 * входящая достраивается зеркалом» не могла выразить Alt-размыкание пары (две независимые
 * величины не восстановить из одной) и переехала туда, вырастя, — см. довод в шапке того файла. */

export function VectorModal({
  open,
  onOpenChange,
  techCardId,
  band,
  base,
  slot,
  disabled,
  onFlattened,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  techCardId: number;
  band: GetDesignBandResponse;
  /** The picture being traced. Absent = a drawing from nothing, which is its own kind of layer. */
  base?: common_DesignPicture | null;
  /**
   * The bench slot the editor was opened from. The flattened picture takes it — the person acted on
   * that slot, so nothing is guessed. `slotRev` is the CAS token read with the band.
   */
  slot?: { ref: DesignBenchSlotRef; label: string; slotRev: number } | null;
  disabled?: boolean;
  /** The new picture, for a caller that wants to walk to it. */
  onFlattened?: (picture: common_DesignPicture) => void;
}) {
  const { showMessage } = useSnackBarStore();
  const { setBenchSlot } = useDesignWrites(techCardId);
  const { saveLayer, flattenLayer } = useEditLayerWrites(techCardId);

  const baseMedia = base?.media;
  const baseMediaId = baseMedia?.id ?? 0;
  const baseSrc =
    baseMedia?.media?.fullSize?.mediaUrl ||
    baseMedia?.media?.compressed?.mediaUrl ||
    baseMedia?.media?.thumbnail?.mediaUrl ||
    '';

  /** The picture's own shape, from the wire when the bucket knows it. */
  const wireRatio = useMemo(() => {
    const w = baseMedia?.media?.fullSize?.width ?? 0;
    const h = baseMedia?.media?.fullSize?.height ?? 0;
    return w > 0 && h > 0 ? w / h : DEFAULT_RATIO;
  }, [baseMedia]);

  // The layer that already traces this base, if the band listed one. Strokes are NOT in that list.
  const known = useMemo(
    () => findLayerForMedia(band.layers, baseMediaId),
    [band.layers, baseMediaId],
  );
  const knownId = known?.id ?? 0;
  const knownRev = known?.rev ?? 0;
  const layerQuery = useDesignEditLayer(techCardId, open ? knownId : 0);
  const loaded = layerQuery.data?.layer;

  const [strokes, setStrokes] = useState<VectorStroke[]>([]);
  const [tool, setTool] = useState<Tool>('line');
  const [selected, setSelected] = useState<number | null>(null);
  /**
   * Кисть в руке: вид шва и «строительность» СЛЕДУЮЩЕГО штриха.
   *
   * ⚠ СОСТОЯНИЕ `weight` СНЯТО, И ЭТО НЕ УБОРКА. Оно писалось в трёх местах и НЕ ЧИТАЛОСЬ НИГДЕ:
   * слово веса вычисляется из числа прямо там, где нужно (`gaugeWeight(px)` в `paint` и в
   * `pickGauge`). Мёртвый писатель состояния — это не безобидный хвост: каждая запись гнала
   * перерисовку всего редактора впустую, и он же был вторым местом, где «вес» мог разойтись с
   * толщиной. Вес — ЯРЛЫК на число, а не вторая величина; ровно этим доводом из рейки убрали
   * отдельные чипы веса, а здесь его копия дожила до сегодня.
   */
  const [brush, setBrush] = useState<StitchKey>('plain');
  const [dashed, setDashed] = useState(false);
  /** Цвет нити в руке. Чёрный при входе: цвет — утверждение, и его делает человек, не машина. */
  const [ink, setInk] = useState<string>(DEFAULT_INK);
  /* УМОЛЧАНИЕ БЕРЁТСЯ ИЗ `DEFAULT_GAUGE`, А НЕ ИЗ ТАБЛИЦЫ СТАРЫХ СЛОВ. `WEIGHT_GAUGE` — это
     расшифровка формата (что значит `weight: 'thin'` у уже сохранённого штриха), и она заморожена
     на прежних числах намеренно. Брать оттуда толщину НОВОЙ кисти значило бы, что диапазон
     похудел, а рука по-прежнему начинает с прежней жирной линии — Y-1 был бы сделан наполовину. */
  const [gauge, setGauge] = useState<number>(DEFAULT_GAUGE);
  /**
   * ДЛИНА СТЕЖКА В РУКЕ — ВТОРОЙ РЕГУЛЯТОР ШВА (X-8). Пока `stepOwn` ложно, стежок СЛЕДУЕТ за
   * нитью: это не «не задано по умолчанию», а рабочее состояние, которое формат умеет выразить и
   * которое держит документ на прежней версии. Разводит их первое движение самого регулятора.
   */
  /* СТЕЖОК СТАРТУЕТ РАВНЫМ НИТИ, а не своим числом. Пока `stepOwn === false`, действующая длина
     стежка ТОЖДЕСТВЕННО равна толщине (`strokeStep === strokeGauge`) — это устройство формата, а не
     совпадение. Отдельное умолчание показывало на рейке 6, когда штрих шился двойкой: экран, живой
     призрак и уложенная линия давали ТРИ разных шва в одну секунду, а подпись под регулятором при
     этом честно сообщала «following the thread». Теперь `DEFAULT_STEP` ОПРЕДЕЛЁН через
     `DEFAULT_GAUGE` — разъехаться им больше нечем, и имя сохраняет намерение. */
  const [step, setStep] = useState<number>(DEFAULT_STEP);
  const [stepOwn, setStepOwn] = useState(false);
  /** Круг ниба, в пикселях платы. Отдельно от нити — см. довод у `isNibTool`. */
  const [nib, setNib] = useState<number>(DEFAULT_NIB);
  /**
   * ЖЁСТКОСТЬ КРАЯ И НЕПРОЗРАЧНОСТЬ — свойства КРУГЛОГО КОНЧИКА, а не нити, и живут только пока в
   * руке пиксельный инструмент: у резчика линий мягкого края не бывает вовсе (полилиния режется ПО
   * контуру, между «внутри» и «снаружи» нет полутона), а «полупрозрачно вырезать» — не операция.
   */
  const [hardness, setHardness] = useState(80);
  const [opacity, setOpacity] = useState(100);
  /** Пипетка взведена: следующий клик по холсту берёт цвет вместо жеста инструмента. */
  const [picking, setPicking] = useState(false);
  /**
   * ИСТОЧНИК ШТАМПА и его смещение. Источник берут alt-кликом, как в фотошопе; смещение
   * «источник → курсор» фиксируется ПЕРВЫМ мазком и держится до следующего alt-клика — это и есть
   * режим Aligned, тот, что у фотошопа стоит по умолчанию: несколько мазков продолжают ОДИН
   * отпечаток, а не перерисовывают его от источника каждый раз.
   */
  const [stampSrc, setStampSrc] = useState<[number, number] | null>(null);
  const stampOffset = useRef<[number, number] | null>(null);
  const [vecOn, setVecOn] = useState(true);
  const [rasterOn, setRasterOn] = useState(true);
  const [trace, setTrace] = useState<[number, number][] | null>(null);
  const [pen, setPen] = useState<PenState | null>(null);
  const [ratio, setRatio] = useState<number>(wireRatio);
  const [unreadable, setUnreadable] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [refusal, setRefusal] = useState<string | null>(null);
  /**
   * ФАЙЛ СЛОЯ — авторитетный SVG (`source_media_id`), когда слой им рождён (машинная перерисовка
   * или импорт). Медиа-ид и, когда полоса его ещё несёт, URL: у контракта нет чтения медиа по id
   * намеренно, поэтому файл, чей прогон уехал со первой страницы истории, остаётся без картинки
   * и об этом говорится словами, а не битым `<img>`.
   */
  const [fileMediaId, setFileMediaId] = useState(0);
  const [fileUrl, setFileUrl] = useState('');
  /** Развилка входа пройдена (или не нужна) — редактор на экране. */
  const [entered, setEntered] = useState(false);
  const [confirmExit, setConfirmExit] = useState(false);
  const [zoomPct, setZoomPct] = useState(100);
  const [panning, setPanning] = useState(false);
  const [spaceHeld, setSpaceHeld] = useState(false);

  /**
   * The layer's identity. STATE, because the header prints the rev and a ref would leave a stale
   * number on screen after a save; MIRRORED IN A REF, because the save chain reads it between two
   * awaits and a closure would hand it the value from before the previous call.
   */
  const [layer, setLayer] = useState<LayerHandle>({ id: 0, rev: 0 });
  const layerRef = useRef(layer);
  layerRef.current = layer;

  /**
   * ЖЕСТ ЖИВЁТ В РЕФАХ, СОСТОЯНИЕ — ЛИШЬ ЗЕРКАЛО ДЛЯ РЕНДЕРА, и это не стиль, а замеренный дефект:
   * pointermove прилетает РАНЬШЕ, чем React перерисует после pointerdown, и гард по значению из
   * замыкания видит там прошлый рендер — первый сэмпл следа терялся, а рукоятка пера, вытянутая
   * быстрой рукой, не регистрировалась вовсе (мутация M6 показала [null, null] на живом драге).
   * Поэтому источник истины — реф, писатели идут через `putPen`/`putTrace`, и НИ ОДИН setPen /
   * setTrace не зовётся мимо них.
   */
  const penRef = useRef<PenState | null>(null);
  const traceRef = useRef<[number, number][] | null>(null);
  const putPen = useCallback((next: PenState | null) => {
    penRef.current = next;
    setPen(next);
  }, []);
  const putTrace = useCallback((next: [number, number][] | null) => {
    traceRef.current = next;
    setTrace(next);
  }, []);

  /**
   * ВЫДЕЛЕНИЯ ЛАССО — рабочее состояние визита, как в фотошопе: в документ не пишутся и при
   * пересиде обнуляются. Каждое несёт СВОЮ растушёвку (см. vector-lasso.ts); активное — то, к
   * которому применяются copy/delete и клавиши. Истории отката они не принадлежат: она типизирована
   * списком штрихов, и ⌘Z после «удалить внутри» возвращает ШТРИХИ, оставляя дорожку стоять — ровно
   * как в фотошопе.
   */
  const [sels, setSels] = useState<SelectionArea[]>([]);
  const [activeSel, setActiveSel] = useState<number | null>(null);
  /** Курсор над холстом в режиме пера — конец резинки. Реф + зеркало, тем же приёмом, что жест. */
  const penHoverRef = useRef<[number, number] | null>(null);
  const [penHover, setPenHover] = useState<[number, number] | null>(null);
  /** Курсор над холстом под круглым нибом — центр превью-круга ластика и штампа. */
  const [nibHover, setNibHover] = useState<[number, number] | null>(null);
  const putPenHover = useCallback((next: [number, number] | null) => {
    penHoverRef.current = next;
    setPenHover(next);
  }, []);

  /**
   * SEEDED ONCE PER OPENING, AND NEVER AGAIN WHILE IT IS OPEN. Boolean on purpose — a content key
   * would RE-SEED after every save's band refetch: wiped undo history, tool jumped back, seconds
   * of drawing thrown away. The editor owns its strokes from the moment it opens; the server's
   * copy is read once, at the start. (The full argument lived here before the fullscreen shell and
   * has not changed.)
   */
  const seeded = useRef(false);
  const viewportRef = useRef<HTMLDivElement | null>(null);
  const worldRef = useRef<HTMLDivElement | null>(null);
  const contentRef = useRef<HTMLDivElement | null>(null);

  /** Вид: мир во вьюпорте. Реф + императивный трансформ — панорама не должна перерисовывать SVG. */
  const viewRef = useRef<View>({ pan: { x: 0, y: 0 }, zoom: 1 });
  /** Человек уже двигал вид — авто-перевписывание (смена ratio с прибытием картинки) молчит. */
  const userMoved = useRef(false);
  const panDrag = useRef<{ id: number; x: number; y: number } | null>(null);

  /** Снимок штрихов на момент сида — им меряется «есть что терять» у стража выхода. */
  const seededJson = useRef('[]');

  /* ═══ ПИКСЕЛЬНЫЙ КАНАЛ ═══════════════════════════════════════════════════════════════════
   *
   * Растр — ЛЕНИВЫЙ: он не заводится, пока в руку не взяли пиксельный инструмент. Копия подложки
   * стоит запроса через прокси и декодирования картинки, и платить их за визит, в котором человек
   * провёл две линии пером, незачем. До первого пиксельного жеста на плате стоит обычный `<img>`.
   */
  const rasterRef = useRef<RasterLayer | null>(null);
  const viewCanvasRef = useRef<HTMLCanvasElement | null>(null);
  /** Растр заведён — зеркало рефа для рендера (холст вместо `<img>`, строки рейки). */
  const [rasterReady, setRasterReady] = useState(false);
  /** Пиксели менялись с момента сида — страж выхода и решение «грузить ли растр». */
  const [rasterDirty, setRasterDirty] = useState(false);
  const rasterDirtyRef = useRef(false);
  const seeding = useRef(false);
  /**
   * ПИКСЕЛЬНЫЙ КАНАЛ, ХРАНИМЫЙ СЕРВЕРОМ. Голый id — контракт отдаёт его и полосой, и слоем именно
   * потому, что это НЕ 512 КБ: вкладка обязана отличать покрашенный холст от пустого, не открывая
   * слой. Ноль значит «не покрашено», и тогда холст заводится копией подложки.
   */
  const [storedRasterId, setStoredRasterId] = useState(0);
  /**
   * БАЙТЫ ХРАНИМОЙ ЖИВОПИСИ — и они приезжают ТОЛЬКО глаголом слоя.
   *
   * Полоса перечисляет слои и отдаёт `rasterMediaId`, но НЕ `rasterMedia`: пиксели слоя ей негде
   * рисовать, и чтение медиа на каждое открытие вкладки было бы куплено ни за что. Поэтому здесь
   * читается `loaded`, а не `known`, — и это не забытый фолбэк: у `known` этого поля нет по
   * контракту, а второй источник URL для одного факта разошёлся бы с первым на первой же пропаже.
   */
  const [storedRasterUrl, setStoredRasterUrl] = useState('');
  /**
   * ⚠ ТРИ СОСТОЯНИЯ, А НЕ ДВА, И СРЕДНЕЕ — САМОЕ ВАЖНОЕ.
   *
   *   `storedRasterId === 0`  — НИКОГДА НЕ КРАСИЛИ. Холст заводится копией подложки, молча: терять
   *                             нечего, и говорить не о чем.
   *   `gone === true`         — КРАСИЛИ, И ФАЙЛ ПРОПАЛ. Сервер искал строку медиа и не нашёл.
   *   `gone === false`, но URL пуст — СЕРВЕР НИЧЕГО НЕ СКАЗАЛ (соединение отказало, или бандл
   *                             старше бекенда). Это «мы не знаем», а не «его нет».
   *
   * Первое от второго отличается тем, что во втором ЕСТЬ ЧТО ТЕРЯТЬ: молча завести холст копией
   * подложки значит показать нетронутое фото как «сохранённое состояние» — и первое же сохранение
   * запишет эту копию поверх вчерашней живописи, безвозвратно, потому что ленты правок у слоя нет.
   * Поэтому «нет растра» проходит молча, а «растр пропал» обязано быть НАЗВАНО словами.
   */
  const [storedRasterGone, setStoredRasterGone] = useState(false);
  /**
   * ЧЕЛОВЕК ПОПРОСИЛ СНЯТЬ ПИКСЕЛИ. Отдельный флаг, а не «пустой растр»: пустой растр — это
   * прозрачная картинка, которую сервер послушно сохранит, и фотография осталась бы стёртой
   * навсегда. `clear_raster` — единственный способ сказать «верни нетронутое фото», и он ОБЯЗАН
   * исключать отправку id (сервер отвечает на пару InvalidArgument).
   */
  const dropRasterRef = useRef(false);

  /** Маска активного выделения в пикселях растра; пересобирается при смене области. */
  const maskRef = useRef<HTMLCanvasElement | null>(null);
  /** Живой жест: чем он ляжет. `null` — жеста нет, и видимый холст равен документу. */
  const liveRef = useRef<{ mode: PaintMode; opacity: number } | null>(null);
  const rafRef = useRef<number | null>(null);

  /** ОДНА ЛЕНТА ОТМЕНЫ НА ДВА МАТЕРИАЛА — довод в шапке `vector-raster-history.ts`. */
  const timeline = useRef(new EditTimeline());
  const [tl, setTl] = useState<TimelineState>(emptyTimelineState());
  const bumpTl = useCallback(() => setTl(timeline.current.state()), []);

  /**
   * Штрихи В РЕФЕ — тем же приёмом и по той же причине, что жест: лента отмены запоминает пару
   * «до / после», а «до» она обязана взять на момент ЖЕСТА, а не на момент последнего рендера.
   */
  const strokesRef = useRef(strokes);
  strokesRef.current = strokes;

  /**
   * ЕДИНСТВЕННЫЙ ПИСАТЕЛЬ СПИСКА ШТРИХОВ, ходящий через ленту. Прежний `record()` запоминал только
   * «до» — для возврата этого мало, и второй писатель мимо ленты означал бы ⌘⇧Z, который иногда
   * работает.
   */
  const commitLines = useCallback(
    (next: VectorStroke[]) => {
      timeline.current.recordLines(strokesRef.current, next);
      strokesRef.current = next;
      setStrokes(next);
      setTl(timeline.current.state());
    },
    [],
  );

  const resetHistory = useCallback(() => {
    timeline.current.reset();
    setTl(timeline.current.state());
  }, []);

  /** Видимый холст = документ + живой жест. Один путь на превью и на коммит — см. `stageScratch`. */
  const paintView = useCallback(() => {
    const layer = rasterRef.current;
    const view = viewCanvasRef.current;
    if (!layer || !view) return;
    const live = liveRef.current;
    if (live) stageScratch(layer, maskRef.current);
    renderView(view, layer, live);
  }, []);

  /**
   * Перерисовка не чаще кадра. Мазок шлёт `pointermove` быстрее, чем экран успевает показать, и
   * полная пересборка вида на каждое событие — это несколько блитов холста 1600×2000 впустую.
   */
  const scheduleView = useCallback(() => {
    if (rafRef.current !== null) return;
    rafRef.current = requestAnimationFrame(() => {
      rafRef.current = null;
      paintView();
    });
  }, [paintView]);

  /**
   * ВЕТКА «ДА» РАЗВИЛКИ — машинная перерисовка растра в вектор. Данные и деньги — в
   * `use-trace-vector.ts`; хук живёт здесь безусловно (правило хуков), но просыпается только
   * пока развилка на экране.
   */
  const traceVector = useTraceVector({
    techCardId,
    band,
    base,
    slot: slot ? { ref: slot.ref, label: slot.label } : null,
    active: open && !entered && !disabled,
  });

  const plateH = PLATE_W / (ratio || DEFAULT_RATIO);
  const zoomK = zoomPct / 100 || 1;

  /**
   * Seed on opening — and forget everything on the way out, so reopening over another plate cannot
   * inherit the previous plate's strokes or a rev that belongs to somebody else's layer.
   */
  useEffect(() => {
    if (!open) {
      seeded.current = false;
      return;
    }
    if (seeded.current) return;
    // A layer the band knows about is not seeded until its strokes arrive; a layer that does not
    // exist yet is seeded immediately, because there is nothing to wait for.
    if (knownId > 0 && !loaded) return;
    seeded.current = true;

    const doc = readLayer(loaded?.strokes, wireRatio);
    setLayer({ id: loaded?.id ?? knownId, rev: loaded?.rev ?? knownRev });
    setStrokes(doc.strokes);
    // Файл слоя — из прочитанного слоя или из списка полосы; URL — лучшая попытка по картинкам
    // первой страницы (см. findMediaUrlInBand).
    const storedFileId = loaded?.sourceMediaId ?? known?.sourceMediaId ?? 0;
    setFileMediaId(storedFileId);
    setFileUrl(findMediaUrlInBand(band, storedFileId));
    // WITH A BASE, THE BASE'S SHAPE WINS. The stored ratio is only the memory of a drawing that has
    // no picture under it; letting it override a real picture would put every stroke in the wrong
    // place the moment the two disagree.
    setRatio(baseMediaId > 0 ? wireRatio : doc.ratio);
    setUnreadable(doc.unreadable);
    setSelected(null);
    setTool('line');
    // КИСТЬ ПРИ ВХОДЕ — plain: шов — промышленное утверждение о машине, и пока человек сам не взял
    // кисть-шов, ни один штрих машины не называет. Это перенос старого запрета пред-заполнения:
    // запрещено НАЗНАЧЕННОЕ МАШИНОЙ, а не выбранное человеком.
    setBrush('plain');
    setDashed(false);
    setInk(DEFAULT_INK);
    setGauge(DEFAULT_GAUGE);
    setStep(DEFAULT_STEP);
    setStepOwn(false);
    setNib(DEFAULT_NIB);
    setHardness(80);
    setOpacity(100);
    setPicking(false);
    setStampSrc(null);
    stampOffset.current = null;
    // ПИКСЕЛИ ЗАБЫВАЮТСЯ ВМЕСТЕ СО ВСЕМ ОСТАЛЬНЫМ. Растр, доживший до следующего открытия над
    // ДРУГОЙ платой, положил бы чужую фотографию под чужие штрихи — и, что хуже, молча.
    rasterRef.current = null;
    maskRef.current = null;
    liveRef.current = null;
    seeding.current = false;
    setRasterReady(false);
    setRasterDirty(false);
    rasterDirtyRef.current = false;
    dropRasterRef.current = false;
    setStoredRasterId(loaded?.rasterMediaId ?? known?.rasterMediaId ?? 0);
    // БАЙТЫ И ПРОПАЖА — ТОЛЬКО ИЗ ПРОЧИТАННОГО СЛОЯ. Полоса их не несёт (см. объявление), поэтому
    // `known` здесь не участвует вовсе: подставить сюда его молчание значило бы прочитать «полоса
    // об этом не говорит» как «сервер сказал: пусто».
    setStoredRasterUrl(layerRasterUrl(loaded));
    setStoredRasterGone(loaded?.rasterDeleted === true);
    putPen(null);
    putTrace(null);
    putPenHover(null);
    setSels([]);
    setActiveSel(null);
    setRefusal(null);
    setConfirmExit(false);
    seededJson.current = JSON.stringify(doc.strokes);
    userMoved.current = false;
    /**
     * РАЗВИЛКА — ТОЛЬКО ПЕРЕД ПЛАТОЙ БЕЗ ВЕКТОРА. Слой со штрихами уже «имеет вектор»; слой с
     * ФАЙЛОМ (source_media_id) имеет его тоже, даже когда редактируемой проекции ещё нет — задать
     * вопрос над ним значило бы предложить купить то, что уже куплено. Рисование с нуля растра не
     * имеет и спрашивать не о чем; нечитаемый слой обязан показать своё предупреждение, а не
     * прятать его за вопросом; read-only визит не рисует вовсе.
     */
    setEntered(
      !baseSrc || !!disabled || doc.unreadable || doc.strokes.length > 0 || storedFileId > 0,
    );
    resetHistory();
  }, [
    open,
    knownId,
    knownRev,
    known,
    band,
    baseMediaId,
    baseSrc,
    disabled,
    loaded,
    wireRatio,
    resetHistory,
  ]);

  /**
   * THE EDITOR IS FROZEN UNTIL IT KNOWS WHAT IS ALREADY THERE — a correctness gate, not a spinner:
   * drawing into the gap either gets replaced by the seed or goes out as `layer_id = 0` and files
   * a SECOND layer on the same picture (the full argument is unchanged from the modal era).
   */
  const readPending = knownId > 0 && layer.id === 0 && !loaded && !layerQuery.isError;
  const readFailed = knownId > 0 && layer.id === 0 && layerQuery.isError;
  const frozen = !!disabled || unreadable || readPending || readFailed;
  /**
   * ЗАМОРОЖЕННОСТЬ, ЧИТАЕМАЯ ПОСЛЕ `await`.
   *
   * Значение из замыкания застыло на кадре, в котором жест начался. Глагол, который ждёт загрузки
   * подложки, продолжится в мире, где экран уже мог уехать в только-чтение: органы показывают
   * запрет, а старый вызов всё ещё пишет. Ссылка отвечает про СЕЙЧАС.
   */
  const frozenRef = useRef(frozen);
  frozenRef.current = frozen;

  // ── вид: применение, вписывание, зум ───────────────────────────────────────────────────────

  const applyView = useCallback(() => {
    const world = worldRef.current;
    if (!world) return;
    const { pan, zoom } = viewRef.current;
    world.style.transform = `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`;
    setZoomPct(Math.round(zoom * 100));
  }, []);

  const fitPlate = useCallback(() => {
    const vp = viewportRef.current;
    if (!vp) return;
    const r = vp.getBoundingClientRect();
    if (r.width < 2 || r.height < 2) return;
    viewRef.current = fitView(
      { x: 0, y: 0, w: PLATE_W, h: PLATE_W / (ratio || DEFAULT_RATIO) },
      { w: r.width, h: r.height },
    );
    applyView();
  }, [ratio, applyView]);

  /**
   * Вписывание на входе и при смене формы платы — но ТОЛЬКО пока человек не двигал вид сам:
   * прибытие натуральных размеров картинки не имеет права вырывать мир из-под руки.
   */
  useLayoutEffect(() => {
    if (!open || !entered) return;
    if (userMoved.current) return;
    fitPlate();
  }, [open, entered, ratio, fitPlate]);

  const zoomBy = useCallback(
    (factor: number) => {
      const vp = viewportRef.current;
      if (!vp) return;
      const r = vp.getBoundingClientRect();
      viewRef.current = zoomAt(viewRef.current, factor, r.width / 2, r.height / 2);
      userMoved.current = true;
      applyView();
    },
    [applyView],
  );

  const zoomReset = useCallback(() => {
    viewRef.current = { ...viewRef.current, zoom: 1 };
    userMoved.current = true;
    applyView();
  }, [applyView]);

  /**
   * Колесо: скролл — панорама, щипок (ctrlKey у трекпада) и ⌘ — зум вокруг курсора. Нативный
   * слушатель, потому что React вешает wheel пассивным и `preventDefault` оттуда мёртв — страница
   * под редактором уезжала бы вместе с миром.
   */
  useEffect(() => {
    const vp = viewportRef.current;
    if (!vp || !open || !entered) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      if (e.ctrlKey || e.metaKey) {
        const r = vp.getBoundingClientRect();
        viewRef.current = zoomAt(
          viewRef.current,
          Math.exp(-e.deltaY * 0.0022),
          e.clientX - r.left,
          e.clientY - r.top,
        );
      } else {
        const { pan, zoom } = viewRef.current;
        viewRef.current = { zoom, pan: { x: pan.x - e.deltaX, y: pan.y - e.deltaY } };
      }
      userMoved.current = true;
      applyView();
    };
    vp.addEventListener('wheel', onWheel, { passive: false });
    return () => vp.removeEventListener('wheel', onWheel);
  }, [open, entered, applyView]);

  /**
   * Потеря окна гасит зажатый пробел и панораму: keyup после ⌘Tab не приходит НИКОГДА, и без
   * этого курсор-ладонь оставался бы до следующего нажатия — залипший режим, который выглядит как
   * сломанный инструмент.
   */
  useEffect(() => {
    if (!open) return;
    const onBlur = () => {
      setSpaceHeld(false);
      setPanning(false);
      panDrag.current = null;
    };
    window.addEventListener('blur', onBlur);
    return () => window.removeEventListener('blur', onBlur);
  }, [open]);

  /** Точка события в долях кадра — через мир (`toWorld` делит на зум), а не через DOM-прямоугольник. */
  const frameAt = (e: { clientX: number; clientY: number }): [number, number] => {
    const vp = viewportRef.current;
    if (!vp) return [0, 0];
    const w = toWorld(e.clientX, e.clientY, vp.getBoundingClientRect(), viewRef.current);
    return [clamp01(w.x / PLATE_W), clamp01(w.y / plateH)];
  };

  /**
   * То же, БЕЗ клампа кадром — для рукояток пера. Управляющая точка легально живёт за краем платы
   * (CONTROL_REACH формата), и кламп здесь молча пригибал бы кривую у кромки; якоря кламшатся
   * внутри самой механики пера.
   */
  const frameAtFree = (e: { clientX: number; clientY: number }): [number, number] => {
    const vp = viewportRef.current;
    if (!vp) return [0, 0];
    const w = toWorld(e.clientX, e.clientY, vp.getBoundingClientRect(), viewRef.current);
    return [w.x / PLATE_W, w.y / plateH];
  };

  /**
   * РАЗЛОЖИТЬ ИТОГ ЛЕНТЫ — ОДНИМ МЕСТОМ НА ОТМЕНУ И ВОЗВРАТ.
   *
   * Две одинаковые раскладки, написанные рядом, разошлись бы первой же правкой: составной род
   * добавили бы в одну и забыли во второй, и ⌘⇧Z начал бы возвращать половину того, что забрал ⌘Z.
   *
   * Составной шаг (`both`) трогает ОБА материала: пиксели лента уже вернула в холст сама, штрихи
   * возвращает вызывающему — поэтому здесь делается и то, и другое.
   */
  const applyUndoResult = useCallback(
    (res: NonNullable<UndoResult>) => {
      if (res.kind === 'lines' || res.kind === 'both') {
        strokesRef.current = res.strokes;
        setStrokes(res.strokes);
      }
      if (res.kind === 'pixels' || res.kind === 'both') {
        paintView();
        rasterDirtyRef.current = true;
        setRasterDirty(true);
      }
    },
    [paintView],
  );

  /**
   * ОТМЕНА И ВОЗВРАТ — ОДНА ДОРОГА НА ОБА МАТЕРИАЛА. Шаг по линиям возвращает список штрихов, шаг
   * по пикселям кладёт их обратно в холст сам; экран перерисовывается в обоих случаях, потому что
   * «ничего не произошло» и «произошло невидимо» человек различить не может.
   */
  const doUndo = useCallback(() => {
    const res = timeline.current.undo(rasterRef.current);
    if (!res) return;
    applyUndoResult(res);
    setSelected(null);
    setTl(timeline.current.state());
  }, [applyUndoResult]);

  const doRedo = useCallback(() => {
    const res = timeline.current.redo(rasterRef.current);
    if (!res) return;
    applyUndoResult(res);
    setSelected(null);
    setTl(timeline.current.state());
  }, [applyUndoResult]);

  // ⌘Z / Ctrl+Z, ⌘⇧Z — возврат. MATCHED BY `code`, NEVER BY `key`: on a Russian layout
  // `event.key` is «я» and a comparison against the letter z is dead — the same trap the assembly
  // screen was bitten by.
  useEffect(() => {
    if (!open || frozen) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.code !== 'KeyZ' || !(event.metaKey || event.ctrlKey)) return;
      // В настоящем текстовом поле ⌘Z — родной откат ввода; глушить его нельзя. Гард УЖЕ гарда
      // глаголов — тот же довод, что у TEXT_TARGETS фулскрина сборки.
      if (
        (event.target as HTMLElement)?.closest?.(
          'input, textarea, [contenteditable=""], [contenteditable="true"]',
        )
      )
        return;
      event.preventDefault();
      if (event.shiftKey) {
        doRedo();
        return;
      }
      // Перо в работе: ⌘Z снимает ПОСЛЕДНИЙ ЯКОРЬ, а не последний штрих, — отменяется то, что
      // делалось только что. Пустеющее перо гаснет целиком.
      const p = penRef.current;
      if (p) {
        putPen(penUndo(p));
        return;
      }
      doUndo();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, frozen, doUndo, doRedo, putPen]);

  // ── пиксельный канал: заведение, маска выделения, жест ─────────────────────────────────────

  /**
   * ЗАВЕСТИ РАСТР — ИЗ ХРАНИМОЙ ЖИВОПИСИ, ЕСЛИ ОНА ЕСТЬ, И КОПИЕЙ ПОДЛОЖКИ, ЕСЛИ ЕЁ НЕТ.
   *
   * Зовётся при ВЗЯТИИ пиксельного инструмента, а не при первом мазке: чтение картинки стоит
   * запроса и декодирования, и человек, у которого первый мазок замер на полсекунды, решит, что
   * редактор сломался, — а не что он готовится.
   *
   * ЭТО ВТОРАЯ ПОЛОВИНА КРУГА «покрасил → сохранил → открыл заново». Первая — `persist`, она
   * отправляет полный RGBA слоя в медиа и кладёт его id на слой; здесь этот id, УЖЕ РАЗРЕШЁННЫЙ
   * СЕРВЕРОМ в картинку (`raster_media`), становится холстом. Пока разрешения не было, круг был
   * разорван, и разорван молча: сервер отдавал число, а числом холст не заводится.
   *
   * Отказ (испорченный CORS'ом холст, мёртвая картинка) НЕ МОЛЧИТ и не оставляет пустой холст под
   * рукой: инструмент откатывается на `select`, и причина названа. Растр, заведённый пустым там,
   * где под ним есть фотография, стёр бы её с экрана одним переключением чипа.
   */
  const ensureRaster = useCallback(async (): Promise<RasterLayer | null> => {
    if (rasterRef.current) return rasterRef.current;
    if (seeding.current) return null;
    seeding.current = true;
    setBusy('preparing the pixel layer…');
    try {
      const naturalW = baseMedia?.media?.fullSize?.width ?? 0;
      const box = rasterBox(naturalW, ratio || DEFAULT_RATIO);
      /**
       * СНЯТИЕ КАНАЛА УЖЕ ЗАЯВЛЕНО — ХОЛСТ ЗАВОДИТСЯ ПОДЛОЖКОЙ, а не тем, что человек только что
       * попросил снять. `dropRasterPixels` обнуляет холст и ставит заявку на `clear_raster`;
       * взявшись после этого за кисть, человек начинает С НЕТРОНУТОГО ФОТО — ровно того, что
       * кнопка ему пообещала. Прочитать здесь хранимый URL значило бы воскресить снятую живопись
       * ПОД ЕГО НОВЫМИ МАЗКАМИ, а следующее сохранение (уже без `clear_raster`, потому что
       * пиксели изменились) записало бы этот гибрид как новую правду.
       */
      const dropped = dropRasterRef.current;
      if (!dropped && storedRasterId > 0 && !storedRasterUrl) {
        /**
         * ЖИВОПИСЬ БЫЛА, А БАЙТОВ НЕТ — И ТОГДА ПИКСЕЛЬНЫЕ ИНСТРУМЕНТЫ ЗАПЕРТЫ СЛОВАМИ.
         *
         * ЗАВЕСТИ ХОЛСТ КОПИЕЙ ПОДЛОЖКИ ЗДЕСЬ БЫЛО БЫ ХУЖЕ ОТКАЗА, а не мягче: экран показал бы
         * нетронутое фото как «сохранённое состояние», человек дорисовал бы по нему один мазок, и
         * первое же сохранение записало бы эту копию ПОВЕРХ вчерашней живописи — молча и
         * безвозвратно, потому что ленты правок у слоя нет по контракту.
         *
         * ДВЕ ПРИЧИНЫ — ДВА РАЗНЫХ ОТВЕТА, потому что человеку от них нужно разное. «Файл удалён»
         * — это конец: ждать нечего, и единственный честный ход дальше назван кнопкой. «Сервер
         * промолчал» — это, скорее всего, минута: перезагрузить и попробовать снова. Слить их в
         * одну фразу значило бы либо отправить человека ждать того, чего уже нет, либо толкнуть
         * его снимать канал, который цел.
         */
        setRefusal(
          storedRasterGone
            ? `the painted pixels of this layer are GONE: the media row it points at (${storedRasterId}) no longer exists in the library, so the painting cannot be brought back — there is no revision history on a layer. Pixel tools stay closed so a fresh copy of the base cannot quietly take its place. When you are ready to start over, press «revert to the untouched picture» — that says out loud that the channel is being dropped. The line tools are unaffected.`
            : `this layer holds painted pixels (media ${storedRasterId}) and the server did not hand them over on this read — that is «we do not know», not «they are gone»: the painting is very probably intact. Reopen the layer to ask again. Pixel tools are closed until the bytes arrive, so that a fresh copy of the base cannot be written over them; the line tools are unaffected.`,
        );
        return null;
      }
      /**
       * ХРАНИМАЯ ЖИВОПИСЬ СТАРШЕ ПОДЛОЖКИ. Слой, у которого растр есть, заводится ИЗ НЕГО: только
       * там живут дырки, прогрызенные ластиком в прошлый визит. Копия подложки на его месте
       * бесшумно заклеила бы каждую из них оригиналом.
       *
       * А `storedRasterId === 0` — это «никогда не красили», и тогда копия подложки и есть
       * правильное начало. Молча: терять нечего, и говорить не о чем.
       */
      const layer = await seedRaster((!dropped && storedRasterUrl) || baseSrc, box);
      rasterRef.current = layer;
      setRasterReady(true);
      return layer;
    } catch {
      setRefusal(
        'the pixel layer could not be started: the picture underneath refused to come through the proxy, and a raster editor that cannot read its own pixels would quietly draw on nothing. Line tools still work.',
      );
      return null;
    } finally {
      seeding.current = false;
      setBusy(null);
    }
  }, [baseMedia, baseSrc, ratio, storedRasterId, storedRasterUrl, storedRasterGone]);

  /**
   * НАРИСОВАТЬ ДОКУМЕНТ В ВИДИМЫЙ ХОЛСТ — и когда растр только появился, и КАЖДЫЙ РАЗ, когда холст
   * возвращается на экран.
   *
   * ⚠ ЗДЕСЬ БЫЛ ДЕФЕКТ, НАЗВАННЫЙ ВЛАДЕЛЬЦЕМ (Y-2): «нажать чекбокс lines или pixels — они
   * пропадут с канваса, но если нажать ещё раз, они не появятся». Причина не в состоянии: галочка
   * возвращалась исправно. Видимый холст РАЗМОНТИРУЕТСЯ вместе с `rasterOn`, и React монтирует
   * обратно ЧИСТЫЙ элемент — пиксели живут в `layer.doc`, а не в нём. Эффект же слушал только
   * `rasterReady`, который при переключении галочки не меняется, поэтому перерисовать новый холст
   * было некому, и человек видел пустоту там, где документ цел.
   *
   * Поэтому `rasterOn` — полноправная зависимость, а не условие внутри: именно её переход
   * false→true и есть тот момент, когда на экране появляется новый, ещё не закрашенный элемент.
   */
  useLayoutEffect(() => {
    if (rasterReady && rasterOn) paintView();
  }, [rasterReady, rasterOn, paintView]);

  /**
   * МАСКА АКТИВНОГО ВЫДЕЛЕНИЯ — ОДИН объект и на «куда пускать кисть» (X-6), и на «насколько мягок
   * край» (X-5). Пересобирается при смене области или её растушёвки, а не на каждом отпечатке:
   * размытие полигона по холсту в полтора мегапикселя посреди мазка стоило бы кадров.
   */
  const activeArea = activeSel !== null ? sels[activeSel] ?? null : null;
  const areaKey = activeArea ? `${JSON.stringify(activeArea.pts)}|${activeArea.feather}` : '';
  useEffect(() => {
    const layer = rasterRef.current;
    if (!layer || !activeArea) {
      maskRef.current = null;
      return;
    }
    maskRef.current = selectionMask(layer, activeArea.pts, activeArea.feather);
    // areaKey — содержимое области строкой: массив точек приезжает новой ссылкой на каждый рендер.
  }, [areaKey, rasterReady, activeArea]);

  /**
   * ВЕРНУТЬ НЕТРОНУТОЕ ФОТО. Единственная дорога к `clear_raster`, и она НЕ «стереть холст»:
   * прозрачный холст, записанный как новое состояние, оставил бы фотографию стёртой навсегда, а
   * снятие канала возвращает подложку такой, какой она лежит в своём медиа.
   *
   * Заявка ставится флагом и уходит СЛЕДУЮЩИМ сохранением, а не немедленным запросом: сохранение
   * несёт ревизию, одну на оба канала, и второй писатель рядом с ней разошёлся бы с первым на
   * первой же гонке.
   */
  const dropRasterPixels = useCallback(() => {
    dropRasterRef.current = true;
    rasterRef.current = null;
    maskRef.current = null;
    liveRef.current = null;
    timeline.current.reset();
    setTl(timeline.current.state());
    setRasterReady(false);
    // ЗАЯВКА — ЭТО НЕСОХРАНЁННАЯ ПРАВКА. Уйти отсюда молча значило бы, что человек считает
    // фотографию восстановленной, а на сервере лежит прежняя живопись.
    rasterDirtyRef.current = true;
    setRasterDirty(true);
    showMessage(
      'the pixel layer will be dropped on the next save — the picture underneath comes back untouched',
      'success',
    );
  }, [showMessage]);

  /** Режим пиксельного жеста: ластик вычитает, кисть и штамп кладут. */
  const paintModeOf = (t: Tool): PaintMode => (t === 'erase' ? 'erase' : 'paint');

  /**
   * ИНСТРУМЕНТ, КОТОРЫМ НАЧАЛСЯ ЖЕСТ, — И ИМ ЖЕ ЖЕСТ КОНЧИТСЯ.
   *
   * Отпускание кнопки читало `tool` из состояния React, то есть значение НА МОМЕНТ ОТПУСКАНИЯ.
   * Клавиши инструментов живые всё время, поэтому «зажать ластик, нажать e→r, отпустить» коммитило
   * буфер стирания как КРАСКУ: превью показывало одно, документ получал другое. Рука не может
   * начать жест одним инструментом и закончить другим — это и записано здесь.
   */
  const gestureToolRef = useRef<Tool | null>(null);

  /** Начало пиксельного жеста: буфер чист, коробка пуста, режим и непрозрачность зафиксированы. */
  const beginRasterGesture = (t: Tool) => {
    gestureToolRef.current = t;
    const layer = rasterRef.current;
    if (!layer) return;
    clearGesture(layer);
    liveRef.current = { mode: paintModeOf(t), opacity: opacity / 100 };
  };

  /** Продолжение жеста: в буфер уходит ТОЛЬКО НОВЫЙ отрезок следа, а не весь след заново. */
  const growRasterGesture = (t: Tool, from: [number, number], to: [number, number]) => {
    const layer = rasterRef.current;
    if (!layer) return;
    const nibSpec = {
      r: nibRadius(nib, layer),
      hardness: hardness / 100,
      ink: readInk(ink) ?? DEFAULT_INK,
    };
    if (t === 'stamp') {
      const off = stampOffset.current;
      if (!off) return;
      cloneAlong(layer, [from, to], off, nibSpec);
    } else {
      paintAlong(layer, [from, to], nibSpec);
    }
    scheduleView();
  };

  /**
   * КОНЕЦ ЖЕСТА — единственное место, где документ меняется. Порядок обязателен: просеять буфер
   * через выделение, положить его непрозрачностью руки, записать шаг (он читает и буфер, и уже
   * изменённый документ), и только потом забыть жест.
   */
  const endRasterGesture = (t: Tool, trace: [number, number][] | null) => {
    const layer = rasterRef.current;
    liveRef.current = null;

    /**
     * ⚠ РАННЕГО ВЫХОДА ПО `!layer` ЗДЕСЬ БЫТЬ НЕ ДОЛЖНО. Он стоял тут, пока жест был чисто
     * пиксельным, и после Y-9 стал бы дефектом: у слоя БЕЗ ПОДЛОЖКИ растр не заводится вовсе
     * (заводить копию нечего), и ластик молча переставал резать линии — то есть на рисунке с нуля
     * не работал ни по одному материалу. Гейт стоит у КАЖДОГО пиксельного действия отдельно, а не
     * у входа в функцию: см. тот же урок в `SplitPicture`, где гейт-ранний-выход обнулил хвост.
     *
     * ЛАСТИК СНИМАЕТ ОБА МАТЕРИАЛА (Y-9). Владелец: «теперь erase работает только на пиксели, а на
     * то, что нарисовали, нет». Линии режутся ТЕМ ЖЕ резчиком и ТЕМ ЖЕ радиусом ниба, что рисует
     * пиксельный след, — иначе видимая дорожка стирания и то, что она забирает, разошлись бы, и
     * человек целился бы в одно, а попадал в другое.
     *
     * Записывается это ОДНИМ шагом ленты: один жест руки — одно ⌘Z. Два шага возвращали бы половину.
     */
    let next = strokesRef.current;
    let linesChanged = false;
    if (t === 'erase' && trace && trace.length > 0) {
      /**
       * ЛАСТИК РЕЖЕТ ЛИНИИ ПО ТЕМ ЖЕ ПРАВИЛАМ, ПО КАКИМ СНИМАЕТ ПИКСЕЛИ. Три условия, и каждое —
       * закрытая дыра, а не осторожность:
       *
       * `vecOn` — СНЯТАЯ ГАЛОЧКА ЗНАЧИТ «НЕ ТРОГАТЬ», А НЕ «НЕ ПОКАЗЫВАТЬ». Человек прячет чертёж
       * именно затем, чтобы почистить фотографию под ним; резать невидимое — молча уносить работу,
       * о пропаже которой он узнает, вернув галочку, когда ⌘Z уже перекрыт.
       *
       * ПОЛНАЯ НЕПРОЗРАЧНОСТЬ — потому что линию нельзя срезать НАПОЛОВИНУ. Пиксели на 20% честно
       * тускнеют; штрих либо есть, либо нет. Резать его при «слегка притушить» значило бы уничтожать
       * насмерть то, что человек просил приглушить. Сказано словами в подсказке инструмента.
       *
       * АКТИВНАЯ ОБЛАСТЬ — потому что она держит в себе пиксельную половину того же жеста
       * (`stageScratch` просеивает буфер маской). Половина, знающая про границу, и половина, не
       * знающая, — это один жест с двумя разными смыслами, и наружная линия срезалась бы у
       * человека, которому экран только что пообещал, что рука удержана внутри.
       *
       * След режется НЕ фильтром точек, а РАЗРЫВОМ НА КУСКИ: выбросив середину, мы соединили бы
       * оставшиеся концы хордой ЧЕРЕЗ наружное место и срезали бы ровно то, что защищаем.
       */
      const sel = activeSel !== null ? sels[activeSel] : null;
      const runs: [number, number][][] = [];
      let run: [number, number][] = [];
      for (const pt of trace) {
        if (!sel || pointInPolygon({ x: pt[0], y: pt[1] }, sel.pts)) run.push(pt);
        else if (run.length) {
          runs.push(run);
          run = [];
        }
      }
      if (run.length) runs.push(run);

      // Радиус реза — НЕПРОЗРАЧНОЕ ЯДРО ниба (`hardness` и есть его доля, см. `nibStamp`), а не
      // весь круг: мягкий край стирает пиксели частично, и резать по нему значило бы забирать
      // линию там, где фотография едва тронута.
      const bite = (nib / 2) * Math.max(0.05, hardness / 100);
      if (vecOn && opacity >= 100) {
        for (const piece of runs) {
          if (piece.length < 1) continue;
          const cut = eraseAlong(next, piece, bite, { w: PLATE_W, h: plateH });
          next = cut.next;
          linesChanged = linesChanged || cut.changed;
        }
      }
    }

    if (layer) stageScratch(layer, maskRef.current);
    const gone = timeline.current.recordCombined(
      layer,
      strokesRef.current,
      next,
      linesChanged,
      layer ? () => commitStage(layer, paintModeOf(t), opacity / 100) : null,
    );
    if (layer) {
      clearGesture(layer);
      paintView();
    }
    if (gone.pixels) {
      rasterDirtyRef.current = true;
      setRasterDirty(true);
    }
    if (gone.lines) {
      strokesRef.current = next;
      setStrokes(next);
      setSelected(null);
    }
    if (gone.lines || gone.pixels) bumpTl();
  };

  // ── рисование ──────────────────────────────────────────────────────────────────────────────

  /**
   * КРАСКА В РУКЕ — всё, чем родится следующий штрих, одним объектом. Собрана в одном месте, чтобы
   * ни один из трёх писателей (след, перо, импорт) не завёл свою версию «чем сейчас рисуют» и не
   * забыл про цвет, как забыл бы про него `pieceStroke`, если бы его не дописали.
   *
   * `weight` пишется БЛИЖАЙШЕЙ ступенью к числу: это старое написание того же размера, и штрих,
   * прочитанный бандлом без `gauge`, ляжет настолько близко к задуманному, насколько три ступени
   * это позволяют. Цвет и размер кладутся только когда им есть что сказать — чёрная нить пресетной
   * толщины не несёт ни одного нового ключа, и документ остаётся прежней версии.
   */
  const paint = useMemo(() => {
    const px = clampGauge(gauge);
    const hex = readInk(ink);
    return {
      brush,
      weight: gaugeWeight(px),
      dashed,
      ...(hex && hex !== DEFAULT_INK ? { ink: hex } : {}),
      gauge: px,
      // ДЛИНА СТЕЖКА КЛАДЁТСЯ, ТОЛЬКО ЕСЛИ РУКА ЕЁ РАЗВЕЛА С НИТЬЮ. «Не задан» — законное
      // состояние формата («стежок следует за нитью»), и штрих, у которого поле равно нити,
      // поднял бы версию документа до 4 ни за что: старые вкладки потеряли бы право читать
      // чертёж, в котором ничего нового не сказано.
      ...(stepOwn ? { step: clampStep(step) } : {}),
    };
  }, [brush, dashed, ink, gauge, step, stepOwn]);

  const commitTrace = useCallback(
    (pts: [number, number][], asLine: boolean, livePaint: typeof paint) => {
      const settled = asLine ? [pts[0], pts[pts.length - 1]] : settleTrace(pts);
      if (settled.length < 2) return;
      // Two identical endpoints are a click, not a line — a zero-length path draws nothing and can
      // never be selected again, so it would sit in the layer for ever as an invisible row.
      if (
        settled.length === 2 &&
        settled[0][0] === settled[1][0] &&
        settled[0][1] === settled[1][1]
      )
        return;
      commitLines([
        ...strokesRef.current,
        {
          tool: asLine ? 'line' : 'freehand',
          // ШТРИХ РОЖДАЕТСЯ КИСТЬЮ В РУКЕ. Шов остаётся промышленным утверждением о машине — но
          // теперь его делает человек, беря кисть ДО жеста, а не машина за него: кисть при входе
          // всегда `plain`, и ни одна машина не названа, пока её явно не выбрали. Прежний порядок
          // (штрих родился plain, вид назначили вторым жестом) сохранён как частный случай — им
          // остаётся инструмент select.
          ...livePaint,
          pts: settled,
        },
      ]);
    },
    [commitLines],
  );

  /**
   * Коммит пера: Enter, Esc, даблклик или замыкание кликом по первому якорю. Смена инструмента
   * тоже коммитит — построенное не выбрасывается. Меньше двух якорей — рисовать не из чего,
   * недострой честно гаснет.
   */
  const commitPen = useCallback(() => {
    const p = penRef.current;
    putPen(null);
    putPenHover(null);
    if (!p) return;
    const stroke = penStroke(p, paint);
    if (!stroke) return;
    commitLines([...strokesRef.current, stroke]);
  }, [paint, commitLines, putPen, putPenHover]);

  /**
   * Смена инструмента одной дорогой — и с клавиши, и с чипа: недостроенное перо коммитится, а
   * пиксельный инструмент ЗАВОДИТ РАСТР ЗАРАНЕЕ (см. `ensureRaster`), чтобы первый мазок не ждал
   * картинку. На замороженном экране пиксельный инструмент не берётся вовсе — растр там нечем
   * менять, и заводить копию подложки было бы платой ни за что.
   */
  const switchTool = useCallback(
    (t: Tool) => {
      if (penRef.current) commitPen();
      setTool(t);
      if (t !== 'select') setSelected(null);
      if (isRasterTool(t) && !frozen) {
        // ЗАПЕРТЫЙ ПИКСЕЛЬНЫЙ ИНСТРУМЕНТ НЕ ОСТАЁТСЯ В РУКЕ. Чип, выбранный и молча ничего не
        // делающий, читается как сломанный редактор; рука возвращается к `select`, а причина
        // стоит отказом над холстом.
        void ensureRaster().then((layer) => {
          if (!layer) setTool((cur) => (isRasterTool(cur) ? 'select' : cur));
        });
      }
    },
    [commitPen, ensureRaster, frozen],
  );

  /** Пороги пера в мировых пикселях платы — доля по x и по y весят по-разному, мерить надо в мире. */
  const penWorld = () => ({
    w: PLATE_W,
    h: plateH,
    radius: HIT_PX / (viewRef.current.zoom || 1),
  });

  /**
   * «ПУТЬ → ВЫДЕЛЕНИЕ»: контур пера становится областью лассо — фотошопный Make Selection. Пера
   * после этого нет (контур ИЗРАСХОДОВАН на область, штриха не рождается), инструмент — лассо,
   * чтобы операции над областью были под рукой.
   */
  const makeSelectionFromPen = () => {
    const p = penRef.current;
    if (!p) return;
    const poly = penPolygon(p);
    if (!poly) return;
    putPen(null);
    putPenHover(null);
    setSels([...sels, { pts: poly, feather: 0 }]);
    setActiveSel(sels.length);
    setTool('lasso');
    setSelected(null);
  };

  /** Верхнее выделение под точкой — клик лассо активирует его, как клик по объекту. */
  const findSelAt = (at: [number, number]): number | null => {
    for (let i = sels.length - 1; i >= 0; i--) {
      if (pointInPolygon({ x: at[0], y: at[1] }, sels[i].pts)) return i;
    }
    return null;
  };

  const onStagePointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
    const vp = viewportRef.current;
    if (!vp) return;
    /**
     * РУКА НА ХОЛСТЕ ЗАБИРАЕТ ФОКУС У ЧИСЛОВОГО ПОЛЯ, и это не косметика — это чинит МЁРТВУЮ
     * КЛАВИАТУРУ. Замерено пробой 76: набрали размер в поле, ушли рисовать — и ⌘Z молчит, потому
     * что гард «в текстовом поле ⌘Z принадлежит браузеру» видит `event.target` = тот самый инпут,
     * который никто не покидал (холст — не фокусируемый элемент, и клик по нему фокус не двигает).
     * Тем же гардом (`isTyping`) были мертвы ВСЕ одноклавишные глаголы: буква уходила в поле числа.
     * Возврат фокуса экрану — тот же приём, что у стража выхода ниже.
     */
    const active = document.activeElement as HTMLElement | null;
    if (active?.closest?.('input, textarea, [contenteditable=""], [contenteditable="true"]')) {
      contentRef.current?.focus();
    }
    // Панорама — средней кнопкой, зажатым пробелом или инструментом «рука» — живёт и на замороженном
    // экране: смотреть можно всегда.
    if (event.button === 1 || spaceHeld || tool === 'pan') {
      event.preventDefault();
      vp.setPointerCapture?.(event.pointerId);
      panDrag.current = { id: event.pointerId, x: event.clientX, y: event.clientY };
      setPanning(true);
      return;
    }
    if (event.button !== 0) return;
    const at = frameAt(event);

    // ПИПЕТКА СТАРШЕ ЛЮБОГО ИНСТРУМЕНТА: пока она взведена, клик берёт цвет и НИЧЕГО не рисует.
    // Так же ведёт себя alt-пипетка кисти в фотошопе — жест один, и он не оставляет следа.
    if (picking) {
      event.preventDefault();
      void takeInkAt(at);
      return;
    }

    if (tool === 'select') {
      const hit = hitStroke(strokes, at, PLATE_W, plateH, HIT_PX / (viewRef.current.zoom || 1));
      setSelected(hit);
      return;
    }

    if (frozen) return;

    // ШТАМП И КЛОН: alt-клик БЕРЁТ ИСТОЧНИК и ничего не печатает — жест фотошопа буква в букву.
    if (isSourceTool(tool) && event.altKey) {
      event.preventDefault();
      setStampSrc(at);
      stampOffset.current = null;
      showMessage('source taken. Now drag where it should be printed', 'success');
      return;
    }
    if (isSourceTool(tool) && !stampSrc) {
      showMessage('alt-click the place to copy FROM first, then drag', 'error');
      return;
    }
    // ПИКСЕЛЬНЫЙ ИНСТРУМЕНТ БЕЗ РАСТРА НЕ РИСУЕТ В ПУСТОТУ. `ensureRaster` уже сработал на смене
    // чипа; сюда попадают только случаи, когда копия подложки не приехала — и молчаливый мазок
    // «в никуда» был бы худшим из возможных ответов.
    if (isRasterTool(tool) && !rasterRef.current) {
      showMessage('the pixel layer is not ready yet — one moment', 'error');
      void ensureRaster();
      return;
    }
    event.preventDefault();
    // Capture on the VIEWPORT: the pointer routinely leaves the box mid-drag and without capture
    // the stroke would end wherever it crossed the border.
    vp.setPointerCapture?.(event.pointerId);

    if (tool === 'curve') {
      // Вся механика — в penDown: замыкание по первому якорю, захват рукоятки, новый якорь.
      const res = penDown(penRef.current, frameAtFree(event), penWorld());
      if (res.closedNow) {
        // Клик по первому якорю ЗАМКНУЛ контур — путь окончен, коммит немедленный, как в фотошопе.
        penRef.current = res.pen;
        commitPen();
        return;
      }
      putPen(res.pen);
      return;
    }
    if (isRasterTool(tool)) {
      // Смещение штампа фиксируется ПЕРВОЙ точкой мазка и держится до следующего alt-клика — это и
      // есть режим Aligned, тот, что у фотошопа стоит по умолчанию: несколько мазков продолжают
      // ОДИН отпечаток, а не перерисовывают его от источника каждый раз.
      if (tool === 'stamp' && stampSrc && !stampOffset.current) {
        stampOffset.current = [at[0] - stampSrc[0], at[1] - stampSrc[1]];
      }
      beginRasterGesture(tool);
      // Точка без протяжки — тоже отпечаток: клик кистью обязан оставить пятно.
      growRasterGesture(tool, at, at);
    }
    putTrace([at]);
  };

  const onStagePointerMove = (event: React.PointerEvent<HTMLDivElement>) => {
    const drag = panDrag.current;
    if (drag && event.pointerId === drag.id) {
      const { pan, zoom } = viewRef.current;
      viewRef.current = {
        zoom,
        pan: { x: pan.x + event.clientX - drag.x, y: pan.y + event.clientY - drag.y },
      };
      panDrag.current = { id: drag.id, x: event.clientX, y: event.clientY };
      userMoved.current = true;
      applyView();
      return;
    }
    const livePen = penRef.current;
    if (livePen?.drag) {
      // Протяжка рукоятки: симметричная пара, Alt размыкает — вся арифметика в penMove.
      putPen(penMove(livePen, frameAtFree(event), event.altKey, penWorld()));
      return;
    }
    if (tool === 'curve' && livePen) {
      // Резинка: перспективный сегмент от последнего якоря к курсору — кривизна видна ДО клика.
      putPenHover(frameAtFree(event));
      return;
    }
    // НИБ ВИДЕН ДО НАЖАТИЯ. Круг под курсором — единственный способ узнать, что сотрётся, ДО того
    // как оно сотрётся; курсор-крестик про размер ниба не говорит ничего.
    if (isNibTool(tool)) setNibHover(frameAt(event));
    if (!traceRef.current) return;
    const at = frameAt(event);
    // A LINE KEEPS TWO POINTS, A TRACE ACCUMULATES. Pushing every sample and slicing at the end
    // looks identical on screen and is not: the thinning pass would then run over a hundred nearly
    // collinear samples and the «straight» line would arrive with a wobble nobody drew.
    {
      const prev = traceRef.current;
      // ПИКСЕЛИ КЛАДУТСЯ ПРЯМО СЕЙЧАС, ОТРЕЗКОМ. Копить след и красить его целиком на отпускании
      // значило бы рисовать вслепую: мазок появлялся бы после того, как рука его закончила.
      if (isRasterTool(tool)) growRasterGesture(tool, prev[prev.length - 1], at);
      putTrace(tool === 'line' ? [prev[0], at] : [...prev, at]);
    }
  };

  const onStagePointerUp = (event: React.PointerEvent<HTMLDivElement>) => {
    const drag = panDrag.current;
    if (drag && event.pointerId === drag.id) {
      panDrag.current = null;
      setPanning(false);
      return;
    }
    if (penRef.current?.drag) {
      putPen(penUp(penRef.current));
      return;
    }
    const liveTrace = traceRef.current;
    if (!liveTrace) return;
    if (tool === 'lasso') {
      putTrace(null);
      const poly = settleLasso(liveTrace);
      if (poly) {
        // Обводка стала областью — новой и сразу активной, с растушёвкой 0 (своей, не инструмента).
        setSels([...sels, { pts: poly, feather: 0 }]);
        setActiveSel(sels.length);
      } else {
        // Жест-клик: активировать область под курсором или снять активность вовсе.
        setActiveSel(findSelAt(liveTrace[liveTrace.length - 1]));
      }
      return;
    }
    if (isRasterTool(tool) || (gestureToolRef.current && isRasterTool(gestureToolRef.current))) {
      putTrace(null);
      const started = gestureToolRef.current ?? tool;
      gestureToolRef.current = null;
      if (frozen) return;
      endRasterGesture(started, liveTrace);
      return;
    }
    if (isLineNib(tool)) {
      putTrace(null);
      if (frozen) return;
      const world = { w: PLATE_W, h: plateH };
      const radius = nib / 2;
      const src = stampSrc;
      if (!src) return;
      // Смещение фиксируется ПЕРВЫМ мазком и живёт до следующего alt-клика — режим Aligned.
      if (!stampOffset.current) {
        stampOffset.current = [liveTrace[0][0] - src[0], liveTrace[0][1] - src[1]];
      }
      const born = stampAlong(strokesRef.current, liveTrace, stampOffset.current, radius, world);
      if (!born.length) {
        showMessage(
          'no line under the source: «clone» copies lines, «stamp» copies pixels',
          'error',
        );
        return;
      }
      commitLines([...strokesRef.current, ...born]);
      return;
    }
    if (liveTrace.length >= 2) commitTrace(liveTrace, tool === 'line', paint);
    putTrace(null);
  };

  // ── the stroke under edit ──────────────────────────────────────────────────────────────────

  /**
   * ПРАВКА ВЫБРАННОГО ШТРИХА — И НИ ОДНОГО ШАГА ЛЕНТЫ ЗА ПРАВКУ, КОТОРАЯ НИЧЕГО НЕ МЕНЯЕТ.
   *
   * Шаг писался безусловно, поэтому второй клик по той же плашке цвета, повторный выбор того же
   * вида шва или возврат числа к прежнему значению клали в ленту полную копию массива штрихов.
   * Это тот же дефект, что был у пиксельного жеста (пустой жест не должен занимать шаг): ⌘Z,
   * который «ничего не сделал», обесценивает отмену целиком — человек жмёт его вслепую и не
   * понимает, сколько раз ещё надо.
   *
   * Сравнение поверхностное и этого достаточно: все поля штриха — числа, строки и флаги, кроме
   * `pts`/`segs`, а их этот путь не правит (геометрию меняют инструменты, не рейка).
   */
  const editStroke = (fields: Partial<VectorStroke>) => {
    if (selected === null || frozen) return;
    const cur = strokesRef.current[selected];
    if (!cur) return;
    const keys = Object.keys(fields) as (keyof VectorStroke)[];
    if (keys.length > 0 && keys.every((k) => cur[k] === fields[k])) return;
    commitLines(strokesRef.current.map((s, i) => (i === selected ? { ...s, ...fields } : s)));
  };

  const removeSelected = () => {
    if (selected === null || frozen) return;
    commitLines(strokesRef.current.filter((_, i) => i !== selected));
    setSelected(null);
  };

  // ── операции над выделениями лассо ─────────────────────────────────────────────────────────

  /** Копия того, что внутри области. Со смещением — копия точно поверх читалась бы как «ничего». */
  const copySel = (i: number) => {
    const sel = sels[i];
    if (!sel || frozen) return;
    const born = copyInsideSelection(strokesRef.current, sel.pts);
    if (!born.length) {
      showMessage('the selection holds no strokes — nothing was copied', 'error');
      return;
    }
    commitLines([...strokesRef.current, ...born]);
    showMessage(
      `${born.length} stroke${born.length === 1 ? '' : 's'} copied — the copies sit slightly offset`,
      'success',
    );
  };

  /**
   * СТЕРЕТЬ ТО, ЧТО ВНУТРИ — И КРАСКУ, И ЛИНИИ.
   *
   * ⚠ ЗДЕСЬ БЫЛ ДЕФЕКТ, НАЗВАННЫЙ ВЛАДЕЛЬЦЕМ: «при выделении не работает удаление на самой
   * картинке». Глагол резал ТОЛЬКО штрихи и никогда не трогал пиксели — а стоял в одном ряду с
   * `soften inside`, которая пиксели трогает. Человек обводил кусок фотографии, жал Delete и
   * получал «the selection holds no strokes», то есть отказ, объясняющий не то, что произошло.
   *
   * ПОЧЕМУ ОБА МАТЕРИАЛА, А НЕ «ПО АКТИВНОМУ ИНСТРУМЕНТУ». Разделить удаление по тому, какой чип
   * сейчас нажат, значило бы завести скрытый режим: один жест с двумя смыслами, различимыми только
   * по состоянию, о котором человек не думал, когда обводил область. Это ровно то ведро под двумя
   * смыслами, которого рейка избегает, разделив полосы `lines` и `pixels` явно. «Удалить внутри»
   * — один смысл: внутри не остаётся ничего.
   *
   * РАСТУШЁВКА ОБЛАСТИ ДЕЙСТВУЕТ И ЗДЕСЬ, той же маской, что у смягчения: заданная — край стирания
   * сходит на нет, не заданная — режет ровно по дорожке. Одно число, одно значение у обеих кнопок.
   *
   * ШТРИХИ РЕЖУТСЯ ПО ДОРОЖКЕ, наружные куски живут дальше — это поведение не менялось.
   */
  const deleteSel = async (i: number) => {
    const sel = sels[i];
    if (!sel || frozen) return;

    /**
     * ХРАНИМЫЕ ПИКСЕЛИ ЕСТЬ, НО НЕ ПРИШЛИ — ОТКАЗ ЦЕЛИКОМ, А НЕ ПОЛОВИНА РАБОТЫ.
     *
     * Подсказка кнопки обещает «remove everything inside this area». Срезать линии, зная, что до
     * пикселей не дотянуться, значит выполнить половину обещанного и промолчать об этом: человек
     * увидит очищенную область, сохранит, а хранимая живопись останется внутри неё нетронутой.
     * Отказ здесь честнее частичного успеха, и он называет причину теми же словами, что и запрет
     * пиксельных инструментов.
     */
    if (storedRasterId > 0 && !storedRasterUrl && !dropRasterRef.current) {
      showMessage(
        'the painted pixels of this layer have not arrived, so «delete inside» cannot reach them — and cutting only the lines would leave the painting inside the area untouched while looking done. Reopen the layer, then try again.',
        'error',
      );
      return;
    }

    /**
     * СНАЧАЛА ПИКСЕЛИ, ПОТОМ ЛИНИИ — И ЛИНИИ СЧИТАЮТСЯ ПОСЛЕ ОЖИДАНИЯ.
     *
     * ⚠ Порядок здесь не стилистический. `ensureRaster` может ждать загрузку подложки через прокси
     * — это сотни миллисекунд, за которые человек успевает дорисовать штрих или нажать другую
     * кнопку. Список штрихов, снятый ДО ожидания и применённый ПОСЛЕ, затёр бы всё, что появилось
     * за это время, даже за пределами области. Поэтому `strokesRef.current` читается уже после.
     */
    const layer = await ensureRaster();
    if (frozenRef.current) return;

    const linesBase = strokesRef.current;
    const { next, changed: linesChanged } = deleteInsideSelection(linesBase, sel.pts);

    let mask: HTMLCanvasElement | null = null;
    if (layer) {
      mask = selectionMask(layer, sel.pts, sel.feather);
      if (mask) {
        const rect = maskBox(mask);
        clearGesture(layer);
        if (rect) markRect(layer, rect);
      }
    }

    /**
     * ОДИН ГЛАГОЛ — ОДИН ШАГ ЛЕНТЫ. Записанные порознь, линии и пиксели требовали бы двух ⌘Z, и
     * первое нажатие оставляло бы человека в состоянии, которого он не создавал: линии вернулись,
     * дырка в фотографии осталась.
     */
    const gone = timeline.current.recordCombined(
      layer,
      linesBase,
      next,
      linesChanged,
      layer && mask ? () => clearInside(layer, mask!) : null,
    );
    if (layer) {
      clearGesture(layer);
      paintView();
    }
    if (gone.pixels) {
      rasterDirtyRef.current = true;
      setRasterDirty(true);
    }
    if (gone.lines) {
      strokesRef.current = next;
      setStrokes(next);
      setSelected(null);
    }
    if (gone.lines || gone.pixels) bumpTl();

    if (!gone.lines && !gone.pixels) {
      showMessage('the selection holds nothing to delete', 'error');
      return;
    }
    /**
     * ПОЛОВИНА РАБОТЫ НАЗЫВАЕТСЯ ПОЛОВИНОЙ. Пиксельный слой мог не завестись и по причине, не
     * пойманной гейтом выше: подложка не прошла через прокси, картинка не читается. Тогда линии
     * срезаны, а фотография цела — и сообщение «lines deleted» выглядит как полный успех у
     * глагола, чья подсказка обещает убрать внутри ВСЁ. Молчание здесь — та же ложь, что и
     * неверное слово.
     */
    if (!layer && baseMediaId > 0) {
      showMessage(
        `lines inside area ${i + 1} were cut, but the pixel layer could not be opened — the picture underneath is untouched. Reopen the layer and repeat if you meant to erase it too.`,
        'error',
      );
      return;
    }
    // Сообщение называет, ЧТО именно ушло: «удалено» без материала не даёт человеку понять, надо ли
    // ему жать ⌘Z, если он ждал другого.
    const what = [gone.pixels ? 'pixels' : '', gone.lines ? 'lines' : ''].filter(Boolean).join(' and ');
    showMessage(`${what} inside area ${i + 1} deleted`, 'success');
  };

  /**
   * РАСТУШЕВАТЬ ПИКСЕЛИ ВНУТРИ ОБЛАСТИ (X-5) — операция, а не ореол.
   *
   * Число области играет здесь ОБЕ свои роли и одним значением: оно же радиус смягчения и оно же
   * мягкость края, с которой смягчение сходит на нет. Иначе «растушёвка» на рейке значила бы одно
   * у кисти и другое у кнопки, и человек, поставивший 24, получал бы два разных 24.
   */
  const softenSel = async (i: number) => {
    const sel = sels[i];
    if (!sel || frozen) return;
    if (sel.feather <= 0) {
      showMessage('give this area a feather first — it is the radius the pixels soften by', 'error');
      return;
    }
    const layer = await ensureRaster();
    // Тот же сторож, что у соседнего «удалить внутри»: `frozen` из замыкания застыл на кадре, где
    // жест начался, а `ensureRaster` мог ждать подложку сотни миллисекунд. Один из двух глаголов
    // над областью его уже имел — второй без него оставался писателем на только-чтении.
    if (frozenRef.current) return;
    if (!layer) return;
    const mask = selectionMask(layer, sel.pts, sel.feather);
    if (!mask) return;
    // Коробка операции — контур области плюс запас на размытие; она приходит от самой маски, а не
    // считается здесь вторым разом: два расчёта одной геометрии разошлись бы первой же правкой
    // коэффициента размытия, и ⌘Z начал бы оставлять ободок по краю области.
    const rect = maskBox(mask);
    clearGesture(layer);
    if (rect) markRect(layer, rect);
    const changed = timeline.current.recordGesture(layer, () =>
      softenInside(layer, mask, (sel.feather / 2) * (layer.w / PLATE_W)),
    );
    clearGesture(layer);
    paintView();
    if (!changed) return;
    rasterDirtyRef.current = true;
    setRasterDirty(true);
    bumpTl();
    showMessage(`pixels inside area ${i + 1} softened by ${sel.feather}px`, 'success');
  };

  /** Снять саму область — штрихи не трогаются. */
  const dropSel = (i: number) => {
    setSels((prev) => prev.filter((_, k) => k !== i));
    setActiveSel((a) => (a === null || a === i ? null : a > i ? a - 1 : a));
  };

  /** Растушёвка ОДНОЙ области — свойство выделения, а не инструмента: соседние не меняются. */
  const featherSel = (i: number, px: number) => {
    const clamped = Math.min(200, Math.max(0, Math.round(px)));
    setSels((prev) => prev.map((s, k) => (k === i ? { ...s, feather: clamped } : s)));
  };

  /** Свойство кисти ИЛИ выбранного штриха — какой контекст на рейке, тому и достаётся правка. */
  const pickBrush = (key: StitchKey) => {
    if (selected !== null) editStroke({ brush: key });
    else setBrush(key);
  };
  const pickDashed = (d: boolean) => {
    if (selected !== null) editStroke({ dashed: d });
    else setDashed(d);
  };
  /**
   * ЦВЕТ ПРАВИТСЯ ТАМ ЖЕ, ГДЕ ВИД И ВЕС. Непонятную строку из поля hex НЕ ГЛОТАЕТ и не красит
   * чёрным: пока человек допечатывает `#ff00`, значение остаётся текстом органа, а нить не
   * меняется — иначе каждое второе нажатие в поле перекрашивало бы выбранный штрих.
   */
  const pickInk = (raw: string) => {
    const hex = readInk(raw);
    if (selected !== null) {
      if (hex) editStroke({ ink: hex === DEFAULT_INK ? undefined : hex });
      return;
    }
    setInk(hex ?? raw);
  };
  /** Толщина нити: у выбранной строки правится её `gauge`, вместе с ближайшей ступенью `weight`. */
  const pickGauge = (px: number) => {
    const n = clampGauge(px);
    if (selected !== null) editStroke({ gauge: n, weight: gaugeWeight(n) });
    else {
      setGauge(n);
      // СВЯЗАННЫЙ СТЕЖОК ИДЁТ ЗА НИТЬЮ — иначе «follows the thread» было бы надписью, а не
      // поведением: число в поле стежка осталось бы прежним, и человек читал бы на рейке пару,
      // которой на плате нет.
      if (!stepOwn) setStep(n);
    }
  };

  /**
   * ДЛИНА СТЕЖКА. Движение самого регулятора РАЗВОДИТ стежок с нитью — это и есть тот жест, ради
   * которого поле в формате появилось. Возврат к связанности — отдельная дверь («follow»), а не
   * догадка по совпадению чисел: стежок, случайно равный нити, это по-прежнему СВОЙ стежок.
   */
  const pickStep = (px: number) => {
    const n = clampStep(px);
    if (selected !== null) editStroke({ step: n });
    else {
      setStep(n);
      setStepOwn(true);
    }
  };

  /** Вернуть стежок под нить. У выбранной строки это снимает поле — документ снова связан. */
  const followStep = () => {
    if (selected !== null) {
      editStroke({ step: undefined });
      return;
    }
    setStepOwn(false);
    setStep(gauge);
  };

  /**
   * ПИПЕТКА: цвет из ТОГО ЖЕ композита, что уходит в плоскую картинку, — значит и с подложки.
   * Гасится сразу после взятия: залипший режим «следующий клик не рисует» выглядит как сломанная
   * кисть, а второе взятие стоит одного нажатия чипа.
   *
   * Слои учтены честно: погашенный растр не участвует в пробе, погашенный вектор тоже, — пипетка
   * обязана брать то, что ВИДНО, а не то, что хранится.
   */
  const takeInkAt = async (at: [number, number]) => {
    setPicking(false);
    const hex = await pickSceneInk(
      {
        // ПИПЕТКА БЕРЁТ С КОМПОЗИТА, А КОМПОЗИТ ТЕПЕРЬ НЕСЁТ КРАСКУ. Растр заведён — он и есть
        // подложка (он её копия), поэтому `baseSrc` в этом случае не передаётся вовсе: иначе
        // фотография нарисовалась бы поверх собственных дырок и пипетка вернула бы цвет, которого
        // на экране нет.
        baseSrc: rasterOn && !rasterRef.current ? baseSrc : '',
        raster: rasterOn ? rasterRef.current : null,
        strokes: vecOn ? strokes : [],
        ratio: ratio || DEFAULT_RATIO,
      },
      at,
    );
    if (!hex) {
      showMessage('the colour under the pointer could not be read', 'error');
      return;
    }
    pickInk(hex);
    showMessage(`ink ${hex}`, 'success');
  };

  // ── the wire ───────────────────────────────────────────────────────────────────────────────

  const payload = useMemo(() => writeLayer(strokes, ratio), [strokes, ratio]);
  const payloadBytes = useMemo(() => new TextEncoder().encode(payload).length, [payload]);
  const tooLarge = payloadBytes > MAX_STROKES_BYTES;
  const strokesJson = useMemo(() => JSON.stringify(strokes), [strokes]);
  /**
   * «ЕСТЬ ЧТО ТЕРЯТЬ» СЧИТАЕТ И ПИКСЕЛИ. Страж выхода, знающий только про штрихи, выпускал бы
   * человека, стёршего полфотографии, без единого вопроса — и это была бы потеря, которую нечем
   * вернуть: ленты правок у слоя нет по контракту.
   */
  const dirty = entered && (strokesJson !== seededJson.current || rasterDirty);

  /**
   * Store the strokes and adopt the rev the server hands back. Returns the layer's id.
   *
   * ── ШОВ ПИКСЕЛЬНОГО КАНАЛА — ОДИН, И ОН ЗДЕСЬ ─────────────────────────────────────────────
   *
   * Растр покидает редактор ровно двумя дорогами, и обе идут через один и тот же неперекодирующий
   * `uploadRaster`:
   *   • В СЛОЙ — это сохранение. PNG БЕЗ БЕЛОЙ ЗЕМЛИ (`exportRasterPng`), потому что слой это
   *     ДОКУМЕНТ и дырка на нём обязана остаться дыркой; белая земля превратила бы её в краску,
   *     которую следующий визит уже нечем стереть.
   *   • ВО ФЛЭТ — это `saveAsPicture`: там композит с белой землёй, потому что флэт это КАРТИНКА,
   *     и под дыркой на ней видно бумагу.
   *
   * ГРУЗИТСЯ ТОЛЬКО ИЗМЕНЁННЫЙ РАСТР, и это не оптимизация, а требование контракта: полноразмерный
   * PNG — мегабайты, а «ничего не сказано» (оба поля пустые) означает «хранимое переживает
   * сохранение». Сохранение одних штрихов обязано молчать про пиксели — иначе оно платило бы
   * мегабайтами за то, чтобы записать то же самое.
   *
   * ОБА ПОЛЯ РАЗОМ — ПРОТИВОРЕЧИЕ (сервер отвечает InvalidArgument), поэтому «снять пиксели»
   * исключает «вот новые пиксели» ветвлением, а не порядком присваивания.
   */
  const persist = useCallback(async (): Promise<number> => {
    const layer = rasterRef.current;
    let rasterMediaId: number | undefined;
    let clearRaster: boolean | undefined;
    // URL ТОЛЬКО ЧТО ЗАГРУЖЕННЫХ ПИКСЕЛЕЙ. Сохранение отвечает слоем БЕЗ разрешённого медиа — его
    // разрешает читающий глагол, а не пишущий, — поэтому единственный, кто знает адрес свежей
    // живописи, это ответ самой загрузки. Оставить здесь прежний URL значило бы держать в руке
    // ссылку на ПОЗАВЧЕРАШНЮЮ картинку, и первый же повторный заход за холстом (после «снять» и
    // отмены снятия) завёл бы его из неё.
    let freshRasterUrl: string | undefined;
    if (dropRasterRef.current) {
      clearRaster = true;
    } else if (layer && rasterDirtyRef.current) {
      const media = await uploadRaster(exportRasterPng(layer));
      rasterMediaId = media.id ?? 0;
      if (!rasterMediaId) throw new Error('the painted pixels went up but came back without an id');
      freshRasterUrl = media.media?.fullSize?.mediaUrl || '';
    }
    const res = await saveLayer.mutateAsync({
      layerId: layerRef.current.id,
      baseMediaId,
      expectedRev: layerRef.current.rev,
      strokes: payload,
      rasterMediaId,
      clearRaster,
    });
    const stored = res.layer;
    const next: LayerHandle = {
      id: stored?.id ?? layerRef.current.id,
      rev: stored?.rev ?? layerRef.current.rev,
    };
    layerRef.current = next;
    setLayer(next);
    // Сохранённое перестаёт быть «несохранённым» у стража выхода — по ОБОИМ каналам: ревизия одна
    // на них двоих, и «пиксели ещё не сохранены» после успешной записи было бы ложью.
    seededJson.current = strokesJson;
    setStoredRasterId(stored?.rasterMediaId ?? (clearRaster ? 0 : rasterMediaId ?? storedRasterId));
    // Адрес идёт ЗА идентификатором, иначе пара разошлась бы: снятие обнуляет оба, загрузка
    // переставляет оба, а сохранение одних штрихов не трогает ни один.
    if (clearRaster) setStoredRasterUrl('');
    else if (freshRasterUrl !== undefined) setStoredRasterUrl(freshRasterUrl);
    // ПОСЛЕ УСПЕШНОЙ ЗАПИСИ НИЧЕГО НЕ ПРОПАЛО. Флаг «медиа пропало» — это ответ ПРОШЛОГО чтения о
    // ПРОШЛОМ идентификаторе; оставить его поднятым над только что записанным значило бы объявить
    // потерянной живопись, которую человек сохранил секунду назад.
    if (clearRaster || freshRasterUrl !== undefined) setStoredRasterGone(false);
    rasterDirtyRef.current = false;
    setRasterDirty(false);
    dropRasterRef.current = false;
    return next.id;
  }, [saveLayer, baseMediaId, payload, strokesJson, storedRasterId]);

  /**
   * ПРИЁМКА МАШИННОГО ВЕКТОРА. Слой уже подшит сервером (`ImportDesignVector`, rev = 1) — редактор
   * его УСЫНОВЛЯЕТ, не пере-читая: ответ и есть слой, а второй GET купил бы запрос и ноль фактов.
   * Проекция может быть пустой — тогда на плате рисуется сам ФАЙЛ, и об этом сказано словами.
   */
  const adoptImported = useCallback(
    (result: { layer: common_DesignEditLayer; strokes: VectorStroke[]; fileUrl: string }) => {
      const next: LayerHandle = { id: result.layer.id ?? 0, rev: result.layer.rev ?? 1 };
      layerRef.current = next;
      setLayer(next);
      setStrokes(result.strokes);
      seededJson.current = JSON.stringify(result.strokes);
      setFileMediaId(result.layer.sourceMediaId ?? 0);
      setFileUrl(result.fileUrl);
      setSelected(null);
      setEntered(true);
      resetHistory();
      showMessage(
        'the vector is filed as this plate’s layer — it will already be here on the next visit',
        'success',
      );
    },
    [resetHistory, showMessage],
  );

  const saveDrawingOnly = async () => {
    if (frozen || tooLarge || !anyContent || busy) return;
    setBusy('saving the drawing…');
    setRefusal(null);
    try {
      const carriedPixels = rasterDirtyRef.current;
      await persist();
      showMessage(
        carriedPixels
          ? 'the drawing AND the painted pixels are saved — no picture was made'
          : 'the drawing is saved — no picture was made',
        'success',
      );
    } catch (error) {
      setRefusal(layerRefusalText(error));
    } finally {
      setBusy(null);
    }
  };

  /**
   * Paint base + strokes into one canvas and hand back a PNG data URL. THE CANVAS ITSELF LIVES IN
   * `rasterise-layer.ts`, SHARED — two canvases drawing the same strokes would drift silently.
   */
  const rasterise = useCallback(
    () =>
      rasteriseStrokesOverBase({
        // ФЛЭТ НЕСЁТ КРАСКУ. Здесь видимость слоёв НЕ учитывается нарочно — как не учитывалась и
        // до растра: погашенный на время работы слой это свойство ВЗГЛЯДА, а сплющивается
        // рисунок, а не взгляд.
        baseSrc: rasterRef.current ? '' : baseSrc,
        raster: rasterRef.current,
        strokes,
        ratio,
      }),
    [baseSrc, ratio, strokes],
  );

  const saveAsPicture = async () => {
    if (frozen || tooLarge || !anyContent || busy) return;
    setRefusal(null);
    try {
      setBusy('saving the drawing…');
      const id = await persist();

      setBusy('rasterising…');
      const dataUrl = await rasterise();

      setBusy('uploading the picture…');
      const media = await uploadRaster(dataUrl);

      setBusy('filing it into the band…');
      const res = await flattenLayer.mutateAsync({
        layerId: id,
        expectedRev: layerRef.current.rev,
        mediaId: media.id ?? 0,
      });
      const picture = res.picture;

      let placed = false;
      if (slot && picture?.id) {
        setBusy(`putting it into ${slot.label}…`);
        // A SEPARATE CALL, AND A FAILURE HERE IS NOT A LOST DRAWING — by this point the picture
        // EXISTS in the band; a slot CAS refusal must not read as «the drawing did not go through».
        try {
          await setBenchSlot.mutateAsync({
            slot: slot.ref,
            pictureId: picture.id,
            expectedSlotRev: slot.slotRev,
          });
          placed = true;
        } catch {
          showMessage(
            `the picture is saved, but the ${slot.label} slot was not changed — somebody moved it first. Put it in from the band.`,
            'error',
          );
        }
      }

      if (placed) showMessage(`saved and put into ${slot?.label}`, 'success');
      else if (!slot) showMessage('saved as a new picture', 'success');
      if (picture) onFlattened?.(picture);
      onOpenChange(false);
    } catch (error) {
      setRefusal(layerRefusalText(error));
    } finally {
      setBusy(null);
    }
  };

  const saveBlob = (blob: Blob) => {
    const href = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = href;
    a.download = `${base ? pictureHandle(base) : 'drawing'}-vector.svg`.replace(/[^\w.-]+/g, '-');
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(href);
  };

  /**
   * СКАЧАТЬ SVG. Слой, рождённый файлом, отдаёт ФАЙЛ — контракт говорит это дословно: «download
   * SVG hands back THIS media, never a re-serialisation of the strokes». Круг через собственный
   * формат холста — не тот файл, который производитель вернул, а тихая подмена одного другим —
   * ровно то, как поставщику уезжает не тот чертёж, который принимали. Слой без файла (рисованный)
   * сериализуется, как и раньше: там штрихи и ЕСТЬ оригинал.
   */
  const download = () => {
    if (fileMediaId > 0 && fileUrl) {
      void (async () => {
        try {
          saveBlob(await fetchMediaBlob(fileUrl));
        } catch {
          showMessage(
            'the vector file could not be fetched from the bucket — nothing was downloaded. Try again.',
            'error',
          );
        }
      })();
      return;
    }
    const w = RASTER_FALLBACK_W;
    const h = Math.round(w / (ratio || DEFAULT_RATIO));
    const svg = layerSvg(strokes, { width: w, height: h, baseHref: baseSrc || undefined });
    saveBlob(new Blob([svg], { type: 'image/svg+xml' }));
  };

  // ── выход ──────────────────────────────────────────────────────────────────────────────────

  /**
   * ОДНА ДВЕРЬ НАРУЖУ — чип «exit» и Esc-лестница обе идут сюда. Несохранённые штрихи спрашивают
   * страж: раньше «cancel» модалки молча выбрасывал час обводки, и полный экран, где Esc жмут
   * рефлекторно, сделал бы эту потерю только чаще.
   */
  const requestClose = useCallback(() => {
    if (busy) return;
    /**
     * ⚠ ЗДЕСЬ БЫЛ ДЕФЕКТ (Z-5): к `dirty` был приписан `&& strokes.length > 0`, и правка, сделанная
     * ТОЛЬКО по пикселям, проходила мимо стража. Фотография, из которой ластиком выгрызли кусок,
     * закрывалась без вопроса и пропадала: линий на слое нет, значит спрашивать не о чем — рассуждал
     * код, глядя на один материал из двух.
     *
     * Конъюнкт был лишним с самого начала: `dirty` УЖЕ означает «состояние разошлось с заведённым»
     * и сам включает `rasterDirty`. Условие «а ещё нарисуй хоть одну линию» ничего не охраняло, зато
     * молча отменяло охрану.
     */
    if (dirty && !frozen) {
      setConfirmExit(true);
      return;
    }
    onOpenChange(false);
  }, [busy, dirty, frozen, onOpenChange]);

  // ── клавиатура ─────────────────────────────────────────────────────────────────────────────

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.metaKey || e.ctrlKey) {
      // ⌘0 — зум 100%; ⌘Z ловит window-эффект выше.
      if (e.code === 'Digit0') {
        e.preventDefault();
        zoomReset();
      }
      // ⌘C над активной областью — копия её содержимого. По e.code: на кириллице e.key — «с».
      if (e.code === 'KeyC' && activeSel !== null && !isTyping(e.target)) {
        e.preventDefault();
        copySel(activeSel);
      }
      return;
    }
    if (!entered) return;
    // ПРОБЕЛ ПЕРЕХВАТЫВАЕТСЯ РАНЬШЕ гарда набора — но только НЕ в текстовом поле. На фокусе-кнопке
    // пробел по умолчанию «нажать кнопку», и после клика по чипу инструмента зажатая ладонь
    // дёргала бы этот чип вместо панорамы; Enter кнопкам остаётся.
    if (e.code === 'Space') {
      if (
        (e.target as HTMLElement)?.closest?.(
          'input, textarea, [contenteditable=""], [contenteditable="true"]',
        )
      )
        return;
      e.preventDefault();
      setSpaceHeld(true);
      return;
    }
    if (isTyping(e.target)) return;
    if (e.key === 'Enter' && tool === 'curve' && penRef.current) {
      e.preventDefault();
      commitPen();
      return;
    }
    // Delete/Backspace: содержимое активной области, иначе — выбранный штрих. По e.code —
    // именованные клавиши раскладка не путает, но правило дома одно: физическая клавиша.
    if ((e.code === 'Backspace' || e.code === 'Delete') && !frozen) {
      if (activeSel !== null) {
        e.preventDefault();
        deleteSel(activeSel);
        return;
      }
      if (selected !== null) {
        e.preventDefault();
        removeSelected();
        return;
      }
    }
    const k = verbKey(e);
    // ОДНА ТАБЛИЦА КЛАВИШ НА ЧИПЫ И НА КЛАВИАТУРУ. Прежний switch дублировал `TOOL_KEY` руками, и
    // одиннадцатый инструмент был бы одиннадцатым шансом написать в подсказке чипа одну букву, а
    // поймать в обработчике другую.
    const byKey = (Object.keys(TOOL_KEY) as Tool[]).find((t) => TOOL_KEY[t] === k);
    if (byKey) {
      switchTool(byKey);
      return;
    }
    switch (k) {
      // Пипетка — не инструмент, а МОДИФИКАТОР следующего клика, поэтому она переключается, а не
      // «берётся в руку»: `i` — та же буква, что и в фотошопе.
      case 'i':
        if (!frozen) setPicking((v) => !v);
        break;
      case 'f':
        fitPlate();
        userMoved.current = true;
        break;
      case '+':
      case '=':
        zoomBy(Z_STEP);
        break;
      case '-':
        zoomBy(1 / Z_STEP);
        break;
      default: {
        const n = Number(k);
        if (Number.isInteger(n) && n >= 1 && n <= STITCHES.length && !frozen) {
          pickBrush(STITCHES[n - 1].key);
        }
      }
    }
  };

  const onKeyUp = (e: React.KeyboardEvent) => {
    if (e.code === 'Space') setSpaceHeld(false);
  };

  const selectedStroke = selected === null ? null : strokes[selected] ?? null;
  /**
   * ЕСТЬ ЧТО СОХРАНЯТЬ — теперь это ДВА материала. Кнопки, запертые на «ни одной линии» у человека,
   * который стёр фотографии половину фона, читались бы как «эта работа ничего не стоит».
   */
  const anyContent = strokes.length > 0 || rasterDirty;
  const ready = !frozen && anyContent && !tooLarge && !busy;
  /** Слой-файл без редактируемой проекции: файл цел, штрихов нет — экран обязан сказать это. */
  const fileOnly = entered && fileMediaId > 0 && strokes.length === 0 && !readPending;
  /**
   * ЧТО ИМЕННО ЗАПИСЫВАЮТ ПИКСЕЛИ — СКАЗАНО ВСЛУХ, НО В РЕЙКЕ, А НЕ КОРОБКОЙ НАД ХОЛСТОМ.
   *
   * ЗАМЕРЕНО ДВАЖДЫ. Сперва коробка всплывала после первого мазка и сдвигала холст на свою высоту
   * — проба 66 показала числом, что второй мазок лёг мимо точки, в которую его вели. Перенос
   * условия на «взяли пиксельный инструмент» это не вылечил, а передвинул: проба 83 померила
   * коробку холста по всем инструментам и увидела 117/767 у линейных против 173/711 у пиксельных —
   * тот же сдвиг, просто на клике по чипу.
   *
   * ВЫВОД: НАД ХОЛСТОМ НЕТ МЕСТА НИЧЕМУ УСЛОВНОМУ. Объяснение уехало в рейку, к группе слоёв, где
   * оно и по смыслу на месте (там же живёт дверь «вернуть нетронутое фото»), а рейка — колонка со
   * своей прокруткой: её рост не стоит холсту ни пикселя. Коробками над холстом остаются только
   * ОТКАЗЫ — они и должны отнимать место, потому что работать поверх них нельзя.
   */
  const anyCallout = unreadable || readPending || readFailed || !!refusal || tooLarge || fileOnly;

  const saveNote = base
    ? `saving writes the vector over «${pictureHandle(base)}» into a NEW picture — a sibling of the base${
        slot ? `, taking the ${slot.label} slot` : ''
      }. The original is never overwritten. «Save the drawing only» keeps the strokes and makes no picture.`
    : 'no raster underneath: the vector base is the drawing itself — it lands on the upload shelf as its own single-picture batch.';

  const stageCursor = panning
    ? 'cursor-grabbing'
    : spaceHeld || tool === 'pan'
      ? 'cursor-grab'
      : frozen
        ? 'cursor-default'
        : tool === 'select'
          ? 'cursor-pointer'
          : 'cursor-crosshair';

  if (!open) return null;

  return (
    <Dialog.Root
      open={open}
      onOpenChange={(o) => {
        if (!o) requestClose();
      }}
    >
      <Dialog.Portal>
        <Dialog.Overlay className='fixed inset-0 z-[var(--z-modal)] bg-overlay' />
        <Dialog.Content
          ref={contentRef}
          {...{ [SCREEN_MARK]: '' }}
          className='fixed inset-0 z-[var(--z-modal)] bg-pageBg p-4 focus:outline-none'
          onEscapeKeyDown={(e) => {
            // Esc-ЛЕСТНИЦА: взведённая пипетка → живое перо → выбранный штрих → области лассо →
            // выход (через одну дверь со стражем). Без `preventDefault` Radix закрывает экран
            // раньше любой ступени.
            if (picking) {
              e.preventDefault();
              setPicking(false);
              return;
            }
            if (penRef.current) {
              // Esc ЗАВЕРШАЕТ незамкнутый контур, а не выбрасывает его, — по механике фотошопа:
              // построенное коммитится штрихом (недострой из одного якоря гаснет сам).
              e.preventDefault();
              commitPen();
              return;
            }
            if (selected !== null) {
              e.preventDefault();
              setSelected(null);
              return;
            }
            if (sels.length > 0) {
              // Deselect: дорожки снимаются все разом — фотошопный ⌘D, посаженный на Esc.
              e.preventDefault();
              setSels([]);
              setActiveSel(null);
              return;
            }
            if (busy || (dirty && !frozen)) {
              e.preventDefault();
              requestClose();
            }
            // Чистый выход — дефолту Radix дорога: он позовёт onOpenChange(false) → requestClose.
          }}
          onKeyDown={onKeyDown}
          onKeyUp={onKeyUp}
        >
          <Dialog.Title className='sr-only'>
            {base ? 'vector edit — flat' : 'vector edit — a new drawing'}
          </Dialog.Title>
          <Dialog.Description className='sr-only'>
            strokes over the flat on a pan and zoom canvas; the raster underneath is never touched
          </Dialog.Description>

          <div className='flex h-full flex-col gap-2'>
            {/* ── хром ──────────────────────────────────────────────────────────────────── */}
            <header className='flex flex-wrap items-center gap-2 border border-borderColor bg-bgColor px-2 py-1.5'>
              <Text
                size='micro'
                variant='uppercase'
                tracking='label'
                component='span'
                className='font-bold'
              >
                vector edit
              </Text>
              {base ? (
                <>
                  <Pill tone='ink'>base: {pictureHandle(base)}</Pill>
                  <Text size='nano' variant='label' component='span' className='hidden lg:inline'>
                    {provenanceLabel(readProvenance(base))} · the original is never overwritten
                  </Text>
                </>
              ) : (
                <Text size='micro' variant='label' component='span'>
                  a new drawing — nothing underneath
                </Text>
              )}
              {layer.id > 0 && (
                <Text size='nano' variant='label' component='span' className='uppercase'>
                  layer {layer.id} · r{layer.rev}
                </Text>
              )}

              <span className='ml-auto flex flex-wrap items-center gap-1'>
                {/* Органы вида живут только вместе с холстом: на развилке входа холста нет, и
                    чип, молча ничего не делающий, хуже отсутствующего — тот же довод, что у
                    запертой двери конверсии. */}
                {entered && (
                  <>
                    <Chip nonForm dashed onClick={() => zoomBy(1 / Z_STEP)} title='zoom out (−)'>
                      −
                    </Chip>
                    <Text
                      size='micro'
                      variant='label'
                      component='span'
                      className='min-w-9 text-center tabular-nums'
                      title='the canvas zoom — scroll pans, pinch zooms'
                    >
                      {zoomPct}%
                    </Text>
                    <Chip nonForm dashed onClick={() => zoomBy(Z_STEP)} title='zoom in (+)'>
                      +
                    </Chip>
                    <Chip
                      nonForm
                      dashed
                      onClick={() => {
                        fitPlate();
                        userMoved.current = true;
                      }}
                      title='fit the plate on screen (f)'
                    >
                      fit
                    </Chip>
                    <Chip nonForm dashed onClick={zoomReset} title='zoom back to 1:1 (⌘0)'>
                      1:1
                    </Chip>
                    {/* ОТМЕНА НАЗЫВАЕТ, ЧТО ИМЕННО ВЕРНЁТСЯ, И СКОЛЬКО ШАГОВ ЕЩЁ ЕСТЬ. Лента одна
                        на линии и пиксели, и без слова материала «undo» на растровом шаге читался
                        бы как «отменить последнюю линию» — и не сработал бы так, как ожидали. */}
                    <Chip
                      dashed
                      disabled={frozen || !tl.depth}
                      onClick={doUndo}
                      data-undo-chip={timeline.current.nextUndoKind() ?? ''}
                      title={
                        tl.depth
                          ? `undo the last ${{ pixels: 'pixel gesture', lines: 'line gesture', both: 'gesture — it took both lines and pixels' }[timeline.current.nextUndoKind() ?? 'lines']} (⌘z) · ${tl.depth} step${tl.depth === 1 ? '' : 's'} kept, ceiling ${RASTER_UNDO_DEPTH} or ${RASTER_UNDO_BYTES / 1024 / 1024} MB of pixels`
                          : 'nothing to undo yet (⌘z)'
                      }
                    >
                      undo{tl.depth ? ` ${tl.depth}` : ''}
                    </Chip>
                    <Chip
                      dashed
                      disabled={frozen || !tl.redoDepth}
                      onClick={doRedo}
                      data-redo-chip={timeline.current.nextRedoKind() ?? ''}
                      title='put back what undo took (⌘⇧z)'
                    >
                      redo
                    </Chip>
                  </>
                )}
                {frozen ? (
                  <Pill tone='mut'>read-only</Pill>
                ) : (
                  /* Писатели — только вместе с холстом: на развилке и на суде им нечего писать,
                     и пара призрачных кнопок там — шум, а не состояние. Тот же довод, что у
                     органов вида строкой выше. */
                  entered && (
                    <>
                      <Button
                        variant='secondary'
                        size='sm'
                        disabled={!ready}
                        onClick={saveDrawingOnly}
                        title='store the strokes without producing a picture — comes back tomorrow'
                      >
                        save the drawing only
                      </Button>
                      <Button
                        type='button'
                        variant='main'
                        size='sm'
                        disabled={!ready}
                        onClick={saveAsPicture}
                      >
                        {busy ?? 'save as a new picture'}
                      </Button>
                    </>
                  )
                )}
                <Chip nonForm onClick={requestClose} title='leave the editor (esc)'>
                  exit
                </Chip>
              </span>
            </header>

            {/* ── отказы и предупреждения ───────────────────────────────────────────────── */}
            {anyCallout && (
              <div className='space-y-1'>
                {unreadable && (
                  <CalloutBox tone='error'>
                    <Text size='micro' component='p'>
                      <b>this layer was written by a version of the admin this one cannot read.</b>{' '}
                      Nothing here can be saved: writing over it would replace somebody&rsquo;s
                      drawing with an empty one, and a layer keeps no revision history to get it
                      back from. Reload the admin — if the message survives a reload, the layer was
                      written by a NEWER bundle and this tab is the old one.
                    </Text>
                  </CalloutBox>
                )}
                {readPending && (
                  <CalloutBox tone='note'>
                    <Text size='micro' component='p'>
                      <b>reading the drawing that is already on this plate.</b> The band lists
                      layers without their strokes, so an empty canvas here means «not read yet»,
                      not «nothing drawn» — the tools open as soon as it lands.
                    </Text>
                  </CalloutBox>
                )}
                {readFailed && (
                  <CalloutBox tone='error'>
                    <Text size='micro' component='p'>
                      <b>the drawing already on this plate could not be read.</b>{' '}
                      {layerRefusalText(layerQuery.error)} Drawing is closed until it can be: a save
                      from here would be filed as a SECOND layer on the same picture, and the first
                      would stop being reachable.
                    </Text>
                  </CalloutBox>
                )}
                {refusal && (
                  <CalloutBox tone='error'>
                    <Text size='micro' component='p'>
                      {refusal}
                    </Text>
                  </CalloutBox>
                )}
                {fileOnly && (
                  <CalloutBox tone='note'>
                    <Text size='micro' component='p'>
                      <b>this layer holds the vector as a FILE, without editable strokes yet</b>{' '}
                      (media {fileMediaId}).{' '}
                      {fileUrl
                        ? 'The file is drawn on the plate; «download SVG» hands back exactly it. Strokes you draw here are stored beside it — the file itself never changes.'
                        : 'Its run has left the first page of the history, so this screen cannot draw it — the file itself is intact, and «download SVG» is closed until it can hand the real one back.'}
                    </Text>
                  </CalloutBox>
                )}
                {tooLarge && (
                  <CalloutBox tone='warning'>
                    <Text size='micro' component='p'>
                      <b>too many strokes for one layer.</b> {Math.round(payloadBytes / 1024)} KB
                      against a ceiling of {MAX_STROKES_BYTES / 1024} KB. Nothing is lost on screen
                      — but this cannot be stored until some strokes go, and thinning them
                      automatically would move lines somebody drew on purpose.
                    </Text>
                  </CalloutBox>
                )}
              </div>
            )}

            {!entered ? (
              /* ── развилка входа и вся ветка «да» за ней ─────────────────────────────────
                 Вопрос, платный прогон, ожидание, приёмка рядом с исходником — четыре фазы
                 одной панели на этом же экране; довод и слова — в trace-vector-panel.tsx. */
              <TraceVectorPanel
                trace={traceVector}
                baseSrc={baseSrc}
                baseLabel={base ? pictureHandle(base) : 'this plate'}
                baseMediaId={baseMediaId}
                ratio={ratio || DEFAULT_RATIO}
                onDraw={() => setEntered(true)}
                onAccepted={adoptImported}
              />
            ) : (
              /* ── рейка + холст ───────────────────────────────────────────────────────── */
              <div className='flex min-h-0 min-w-0 flex-1 gap-2'>
                <VectorBrushRail
                  frozen={frozen}
                  brush={brush}
                  dashed={dashed}
                  ink={ink}
                  gauge={gauge}
                  selected={selected}
                  selectedStroke={selectedStroke}
                  onBrush={pickBrush}
                  onDashed={pickDashed}
                  onInk={pickInk}
                  onGauge={pickGauge}
                  step={step}
                  stepOwn={stepOwn}
                  onStep={pickStep}
                  onStepFollow={followStep}
                  nib={nib}
                  onNib={(px: number) => setNib(clampNib(px))}
                  nibLabel={isNibTool(tool) ? TOOL_LABEL[tool] : ''}
                  rasterTool={isRasterTool(tool)}
                  lineTool={!isRasterTool(tool)}
                  hardness={hardness}
                  onHardness={(n: number) =>
                    setHardness(Math.min(100, Math.max(0, Math.round(n) || 0)))
                  }
                  opacity={opacity}
                  onOpacity={(n: number) =>
                    setOpacity(Math.min(100, Math.max(1, Math.round(n) || 1)))
                  }
                  undoDepth={tl.depth}
                  undoBytes={tl.bytes}
                  undoEvicted={tl.evicted}
                  undoCeiling={RASTER_UNDO_DEPTH}
                  undoByteCeiling={RASTER_UNDO_BYTES / 1024 / 1024}
                  picking={picking}
                  onPicking={setPicking}
                  onRemoveSelected={removeSelected}
                  onDeselect={() => setSelected(null)}
                  sels={sels}
                  activeSel={activeSel}
                  onActivateSel={setActiveSel}
                  onFeatherSel={featherSel}
                  onCopySel={copySel}
                  onDeleteSel={deleteSel}
                  onDropSel={dropSel}
                  onSoftenSel={(i: number) => void softenSel(i)}
                  vecOn={vecOn}
                  onVecOn={() => setVecOn((v) => !v)}
                  rasterOn={rasterOn}
                  onRasterOn={() => setRasterOn((v) => !v)}
                  strokesCount={strokes.length}
                  baseLabel={base ? pictureHandle(base) : null}
                  rasterReady={rasterReady}
                  rasterDirty={rasterDirty}
                  rasterStored={storedRasterId > 0 && !dropRasterRef.current}
                  onDropRaster={dropRasterPixels}
                  rasterSize={
                    rasterRef.current ? `${rasterRef.current.w}×${rasterRef.current.h}` : ''
                  }
                  // Слой-файл отдаёт ФАЙЛ (и только когда URL известен); рисованный слой —
                  // сериализацию своих штрихов. Довод — у `download`.
                  canDownload={fileMediaId > 0 ? !!fileUrl : strokes.length > 0}
                  onDownload={download}
                  outNote={
                    fileMediaId > 0
                      ? '«download SVG» hands back the layer’s ORIGINAL file — the one the vectoriser produced — never a re-serialisation. Strokes drawn here live on the layer and in saved pictures, not inside the file.'
                      : undefined
                  }
                  frameRatio={ratio || DEFAULT_RATIO}
                  strokes={strokes}
                  onImport={(incoming, mode) => {
                    commitLines(
                      mode === 'replace' ? incoming : [...strokesRef.current, ...incoming],
                    );
                    setSelected(null);
                  }}
                  saveNote={saveNote}
                />

                <div className='flex min-h-0 min-w-0 flex-1 flex-col gap-1'>
                  {/* Инструменты — НАД холстом, во всю его ширину: рейка отдана кистям.
                      ВЫСОТА ЭТОГО БЛОКА НЕ ЗАВИСИТ ОТ ИНСТРУМЕНТА. Подсказка стоит СВОЕЙ строкой
                      фиксированной высоты, а не в одном ряду с чипами: она у каждого инструмента
                      своей длины, и в общем ряду длинная подсказка переносила бы чипы на вторую
                      строку — то есть СДВИГАЛА БЫ ХОЛСТ на смене инструмента. Тот же дефект уже
                      был замерен пробой 43 на чипе «path → selection». */}
                  <div className='flex flex-col gap-1 border border-borderColor bg-bgColor px-2 py-1'>
                    <div className='flex flex-wrap items-center gap-2'>
                    {/* ПОЛОСЫ ПО МАТЕРИАЛУ. Надпись «lines» / «pixels» — не украшение группы, а
                        то, ЧТО инструмент производит: линию, которую потом можно править вечно,
                        или пиксели, которые лягут в картинку. Один общий ряд чипов стёр бы это
                        различие, а оно решает, что человек получит на выходе. */}
                    {TOOL_BANDS.map((band) => (
                      <span
                        key={band.material}
                        className='flex min-w-0 items-center gap-1.5'
                        data-tool-band={band.material}
                      >
                        <Text
                          size='nano'
                          variant='label'
                          component='span'
                          className='shrink-0 uppercase'
                        >
                          {band.label}
                        </Text>
                        <ChipRow>
                          {band.tools.map((t) => (
                            <Chip
                              key={t}
                              selected={tool === t}
                              pressed={tool === t}
                              disabled={frozen && t !== 'select' && t !== 'pan'}
                              onClick={() => switchTool(t)}
                              title={`${TOOL_LABEL[t]} (${TOOL_KEY[t]}) — ${TOOL_HINT[t]}`}
                            >
                              {/* ИКОНКА ДОБАВЛЯЕТСЯ К СЛОВУ, А НЕ ВМЕСТО НЕГО (Y-10). Инструментов
                                  десять, берут их редко, и голая иконка заставила бы человека
                                  гадать по картинке — при том что `Chip` и так `inline-flex` с
                                  зазором, то есть слово рядом ничего не стоит по месту. */}
                              <ToolIcon kind={t} />
                              {TOOL_LABEL[t]}
                            </Chip>
                          ))}
                        </ChipRow>
                      </span>
                    ))}
                    {/* Дверь Make Selection. ПРИСУТСТВИЕ — по инструменту, ДОСТУПНОСТЬ — по пути:
                        чип, всплывающий на третьем якоре, переносил тулбар на новую строку и
                        СДВИГАЛ холст на ~25px ПОСРЕДИ жеста — даблклик клал второй якорь в другую
                        точку мира, а клик по первому якорю промахивался мимо зоны замыкания
                        (замерено пробой 43). Всё, что стоит над холстом, обязано быть стабильным,
                        пока идёт путь. */}
                    {tool === 'curve' && (
                      <Chip
                        dashed
                        disabled={frozen || !pen || pen.anchors.length < 3}
                        onClick={makeSelectionFromPen}
                        title='close this path into a lasso selection instead of a stroke (needs 3+ anchors)'
                      >
                        path → selection
                      </Chip>
                    )}
                    </div>
                    <Text
                      size='nano'
                      variant='label'
                      component='p'
                      className='h-4 min-w-0 overflow-hidden text-ellipsis whitespace-nowrap'
                      data-tool-hint={tool}
                    >
                      {tool === 'curve'
                        ? // ОДНА строка на весь путь: смена текста посреди жеста — тот же сдвиг холста.
                          'click = corner · drag = curve · grab a handle to bend, alt splits the pair · click the first anchor closes · enter/esc finish'
                        : tool === 'lasso'
                          ? 'draw around an area · it holds the pixel tools in and cuts the lines at its edge · feather is each area’s own'
                          : tool === 'select'
                            ? 'click a stroke — the rail edits its stitch'
                            : tool === 'clone'
                                ? 'alt-click to take the source, then drag. The LINES under the source are laid under your hand'
                                : tool === 'erase'
                                  ? 'drag the nib: it rubs the PIXELS away to transparency, the photo included, and CUTS the drawn lines it covers. One eraser for both'
                                  : tool === 'stamp'
                                    ? 'alt-click to take the source, then drag. The PIXELS under the source are printed under your hand'
                                    : tool === 'paint'
                                      ? 'drag to paint PIXELS · size, hardness and opacity are in the rail · an active area holds the paint in'
                                      : tool === 'pan'
                                        ? 'drag to move the sheet · scroll pans · pinch zooms'
                                        : 'press and drag to draw · space pans · ⌘z takes back the last gesture'}
                    </Text>
                  </div>

                  {/* ХОЛСТ. Мир (плата) — белый блок на сером грунте вьюпорта: граница платы —
                      это край белого на сером, по правилу «зазор и есть разделитель», без
                      нарисованной рамки, которая съедала бы пиксель системы координат. */}
                  <div
                    ref={viewportRef}
                    onPointerDown={onStagePointerDown}
                    onPointerMove={onStagePointerMove}
                    onPointerUp={onStagePointerUp}
                    onPointerCancel={onStagePointerUp}
                    // Круг ниба гаснет вместе с уходом курсора: иначе он остался бы висеть на
                    // краю платы и читался бы как след, которого нет.
                    onPointerLeave={() => setNibHover(null)}
                    onDoubleClick={() => {
                      if (tool === 'curve' && penRef.current) commitPen();
                    }}
                    className={cn(
                      'relative min-h-0 min-w-0 flex-1 touch-none select-none overflow-hidden border border-borderColor bg-pageBg',
                      stageCursor,
                    )}
                  >
                    <div
                      ref={worldRef}
                      className='absolute left-0 top-0 bg-bgColor'
                      style={{
                        width: `${PLATE_W}px`,
                        height: `${plateH}px`,
                        transformOrigin: '0 0',
                        willChange: 'transform',
                      }}
                    >
                      {/* ПОДЛОЖКА ЖИВЁТ ДО ПЕРВОГО ПИКСЕЛЬНОГО ИНСТРУМЕНТА, а потом ГАСНЕТ, но
                          остаётся в разметке: она — оракул натуральных пропорций (`onLoad`), и
                          снять её значило бы потерять форму платы у того, кто взял кисть раньше,
                          чем картинка договорила. Прячется прозрачностью, а не размонтированием:
                          растр УЖЕ содержит её пиксели, и нарисовать её ещё раз под ним значило бы
                          заклеить каждую дырку от ластика оригиналом. */}
                      {baseSrc && rasterOn && (
                        <img
                          src={baseSrc}
                          alt=''
                          draggable={false}
                          onLoad={(event) => {
                            const img = event.currentTarget;
                            if (baseMediaId > 0 && img.naturalWidth > 0 && img.naturalHeight > 0) {
                              setRatio(img.naturalWidth / img.naturalHeight);
                            }
                          }}
                          data-base-img=''
                          className='pointer-events-none absolute inset-0 block h-full w-full'
                          style={{ objectFit: 'fill', opacity: rasterReady ? 0 : 1 }}
                        />
                      )}
                      {/* ПИКСЕЛЬНЫЙ КАНАЛ. Холст в разрешении растра, растянутый в плату теми же
                          правилами, что и подложка: доли кадра значат одно и то же на обоих. */}
                      {rasterReady && rasterOn && rasterRef.current && (
                        <canvas
                          ref={viewCanvasRef}
                          width={rasterRef.current.w}
                          height={rasterRef.current.h}
                          data-raster-canvas=''
                          role='img'
                          aria-label={`the pixel layer${base ? ` over «${pictureHandle(base)}»` : ''} — ${rasterDirty ? 'painted' : 'a copy of the picture underneath'}`}
                          className='pointer-events-none absolute inset-0 block h-full w-full'
                        />
                      )}
                      {/* СЛОЙ-ФАЙЛ БЕЗ ПРОЕКЦИИ: на плате рисуется сам SVG слоя — иначе принятый
                          вектор выглядел бы как пустой холст. Штрихи, когда они появятся, рисуются
                          ПОВЕРХ и живут отдельно от файла; предупреждение над холстом говорит это
                          словами. `fill», как и у растра: доли кадра растягиваются в плату. */}
                      {vecOn && strokes.length === 0 && fileMediaId > 0 && fileUrl && (
                        <img
                          src={fileUrl}
                          alt=''
                          draggable={false}
                          className='pointer-events-none absolute inset-0 block h-full w-full'
                          style={{ objectFit: 'fill' }}
                        />
                      )}
                      {vecOn && (
                        <svg
                          viewBox={`0 0 ${PLATE_W} ${plateH.toFixed(2)}`}
                          preserveAspectRatio='none'
                          className='pointer-events-none absolute inset-0 h-full w-full'
                        >
                          {strokes.map((stroke, i) => {
                            const g = strokeGeometry(stroke, PLATE_W, plateH);
                            if (!g.d) return null;
                            const strokeInk = readInk(stroke.ink) ?? 'currentColor';
                            return (
                              <g
                                key={i}
                                opacity={selected !== null && selected !== i ? 0.45 : 1}
                                data-stroke-ink={readInk(stroke.ink) ?? ''}
                              >
                                {g.offsets.map((dy, k) => (
                                  <path
                                    key={k}
                                    d={g.d}
                                    transform={`translate(0 ${dy})`}
                                    fill='none'
                                    stroke={strokeInk}
                                    strokeWidth={g.strokeWidth * (selected === i ? 1.8 : 1)}
                                    strokeDasharray={g.dash || undefined}
                                    strokeLinecap='round'
                                    strokeLinejoin='round'
                                  />
                                ))}
                              </g>
                            );
                          })}
                          {/* ── ОБЛАСТИ ЛАССО. Дорожка — двойной штрих (белая подложка + чёрный
                              пунктир), видимый на любом растре; ореол растушёвки — блюр в мировых
                              пикселях, то есть свойство ПЛАТЫ, а не экрана: приближение честно
                              приближает и мягкость. Неактивная область глушится, а не прячется. */}
                          {sels.map((s, i) => {
                            const d = selectionPathD(s.pts, PLATE_W, plateH);
                            if (!d) return null;
                            const active = activeSel === i;
                            return (
                              <g
                                key={`sel-${i}`}
                                opacity={active ? 1 : 0.55}
                                data-sel={i}
                                data-sel-active={active ? '1' : '0'}
                                data-sel-feather={s.feather}
                              >
                                {s.feather > 0 && (
                                  <path
                                    d={d}
                                    fill='currentColor'
                                    opacity={0.12}
                                    style={{ filter: `blur(${s.feather / 2}px)` }}
                                    data-sel-halo={i}
                                  />
                                )}
                                <path
                                  d={d}
                                  fill={active ? 'currentColor' : 'none'}
                                  fillOpacity={active ? 0.04 : 0}
                                  stroke='#fff'
                                  strokeWidth={2.5 / zoomK}
                                />
                                <path
                                  d={d}
                                  fill='none'
                                  stroke='currentColor'
                                  strokeWidth={1.25 / zoomK}
                                  strokeDasharray={`${5 / zoomK} ${4 / zoomK}`}
                                  data-sel-ants={i}
                                />
                              </g>
                            );
                          })}
                          {trace &&
                            trace.length > 1 &&
                            (tool === 'lasso' ? (
                              /* Живая обводка лассо: лёгкая линия + пунктир к началу — видно, где
                                 контур замкнётся, когда кнопка отпустится. */
                              <g>
                                <path
                                  d={`M${trace.map(([x, y]) => `${x * PLATE_W},${y * plateH}`).join(' L')}`}
                                  fill='currentColor'
                                  fillOpacity={0.05}
                                  stroke='currentColor'
                                  strokeWidth={1.5 / zoomK}
                                />
                                <line
                                  x1={trace[trace.length - 1][0] * PLATE_W}
                                  y1={trace[trace.length - 1][1] * plateH}
                                  x2={trace[0][0] * PLATE_W}
                                  y2={trace[0][1] * plateH}
                                  stroke='currentColor'
                                  strokeWidth={1 / zoomK}
                                  strokeDasharray={`${4 / zoomK} ${4 / zoomK}`}
                                  opacity={0.6}
                                />
                              </g>
                            ) : isLineNib(tool) ? (
                              /* СЛЕД НИБА В НАТУРАЛЬНУЮ ШИРИНУ — не намёк линией, а ровно та
                                 полоса, которую резчик вырежет (или клон напечатает). Ширина в
                                 МИРОВЫХ пикселях и на зум НЕ делится: ниб — свойство платы, и
                                 приближение обязано приближать и его.
                                 ПИКСЕЛЬНЫМ ИНСТРУМЕНТАМ ЭТА ПОЛОСА НЕ РИСУЕТСЯ: у них мазок УЖЕ
                                 виден — он лежит на холсте под этим SVG, — и призрак поверх него
                                 показывал бы мазок вдвое темнее, чем он есть. */
                              <path
                                d={`M${trace.map(([x, y]) => `${x * PLATE_W},${y * plateH}`).join(' L')}`}
                                fill='none'
                                stroke='currentColor'
                                strokeWidth={nib}
                                strokeLinecap='round'
                                strokeLinejoin='round'
                                opacity={0.18}
                                data-nib-swath=''
                              />
                            ) : isRasterTool(tool) ? null : (
                              /**
                               * ЖИВОЙ ШТРИХ РИСУЕТСЯ ТЕМ ЖЕ, ЧЕМ И ЗАФИКСИРОВАННЫЙ (Y-4).
                               *
                               * ⚠ Здесь был ЖИРНЫЙ ПУНКТИР шириной 6px — намёк на линию вместо
                               * линии. Владелец: «когда ведёшь линию, хочется, чтобы под зажатым
                               * курсором отображалось именно то, что рисуется, а не пунктирная
                               * линия». Пунктир врал дважды: он не той толщины, что нить, и не
                               * того вида, что шов, — человек отпускал кнопку и видел ДРУГОЕ.
                               *
                               * Пиксельные инструменты не получают призрака ВОВСЕ: их мазок уже
                               * лежит на холсте под этим SVG, и линия поверх него — та самая
                               * пунктирная помеха, на которую владелец жаловался особо («особенно
                               * это конфьюзит на ластике»): у ластика под пунктиром пусто, и
                               * пунктир читался как след, которого нет.
                               *
                               * Геометрия берётся у ОДНОГО рисовальщика с зафиксированными
                               * штрихами. Второй, «облегчённый» рисовальщик превью и был бы тем
                               * самым враньём: он разошёлся бы с настоящим первой же правкой шва.
                               */
                              (() => {
                                const g = strokeGeometry(
                                  { tool: tool === 'line' ? 'line' : 'freehand', ...paint, pts: trace },
                                  PLATE_W,
                                  plateH,
                                );
                                if (!g.d) return null;
                                const liveInk = readInk(paint.ink) ?? 'currentColor';
                                return (
                                  <g data-live-stroke=''>
                                    {g.offsets.map((dy, k) => (
                                      <path
                                        key={k}
                                        d={g.d}
                                        transform={`translate(0 ${dy})`}
                                        fill='none'
                                        stroke={liveInk}
                                        strokeWidth={g.strokeWidth}
                                        strokeDasharray={g.dash || undefined}
                                        strokeLinecap='round'
                                        strokeLinejoin='round'
                                      />
                                    ))}
                                  </g>
                                );
                              })()
                            ))}
                          {/* ── КРУГЛЫЙ НИБ: где он сейчас и откуда штамп берёт. Обводка чёрным по
                              белому, чтобы круг был виден и на тёмной фотографии. */}
                          {/* КРУГ НИБА ВИДЕН И ВО ВРЕМЯ ЖЕСТА, а не только при наведении: у
                              ластика собственного следа нет по определению — он убирает, — и без
                              круга рука во время стирания не видит ни границы, ни размера того,
                              чем стирает. Прежде круг гас ровно в тот момент, когда нужен. */}
                          {isNibTool(tool) && nibHover && (
                            <g data-nib-cursor='' pointerEvents='none'>
                              <circle
                                cx={nibHover[0] * PLATE_W}
                                cy={nibHover[1] * plateH}
                                r={nib / 2}
                                fill='none'
                                stroke='#fff'
                                strokeWidth={2.5 / zoomK}
                              />
                              <circle
                                cx={nibHover[0] * PLATE_W}
                                cy={nibHover[1] * plateH}
                                r={nib / 2}
                                fill='none'
                                stroke='currentColor'
                                strokeWidth={1.25 / zoomK}
                              />
                            </g>
                          )}
                          {isSourceTool(tool) && stampSrc && (
                            /* ИСТОЧНИК — перекрестие, как в фотошопе, и линия к нибу: без неё
                               смещение «источник → курсор» невидимо, и печатается непонятно что. */
                            <g data-stamp-src='' pointerEvents='none'>
                              {nibHover && (
                                <line
                                  x1={stampSrc[0] * PLATE_W}
                                  y1={stampSrc[1] * plateH}
                                  x2={nibHover[0] * PLATE_W}
                                  y2={nibHover[1] * plateH}
                                  stroke='currentColor'
                                  strokeWidth={1 / zoomK}
                                  strokeDasharray={`${5 / zoomK} ${4 / zoomK}`}
                                  opacity={0.5}
                                />
                              )}
                              <circle
                                cx={stampSrc[0] * PLATE_W}
                                cy={stampSrc[1] * plateH}
                                r={nib / 2}
                                fill='none'
                                stroke='currentColor'
                                strokeWidth={1 / zoomK}
                                strokeDasharray={`${4 / zoomK} ${4 / zoomK}`}
                              />
                              <line
                                x1={stampSrc[0] * PLATE_W - 9 / zoomK}
                                y1={stampSrc[1] * plateH}
                                x2={stampSrc[0] * PLATE_W + 9 / zoomK}
                                y2={stampSrc[1] * plateH}
                                stroke='currentColor'
                                strokeWidth={1.5 / zoomK}
                              />
                              <line
                                x1={stampSrc[0] * PLATE_W}
                                y1={stampSrc[1] * plateH - 9 / zoomK}
                                x2={stampSrc[0] * PLATE_W}
                                y2={stampSrc[1] * plateH + 9 / zoomK}
                                stroke='currentColor'
                                strokeWidth={1.5 / zoomK}
                              />
                            </g>
                          )}
                          {pen && (
                            /* Превью пера. Толщины делятся на зум: превью — орган ЭКРАНА, его
                               линия обязана быть одной и той же руке при любом приближении. */
                            <g>
                              <path
                                d={penPreviewD(pen, PLATE_W, plateH)}
                                fill='none'
                                stroke='currentColor'
                                strokeWidth={3 / zoomK}
                                strokeDasharray={`${8 / zoomK} ${6 / zoomK}`}
                                data-pen-preview=''
                              />
                              {/* Резинка: кривая, которая родится, если кликнуть сейчас, — с
                                  кривизной от исходящей рукоятки последнего якоря. */}
                              {penHover && !pen.drag && !pen.closed && (
                                <path
                                  d={penRubberD(pen, penHover, PLATE_W, plateH)}
                                  fill='none'
                                  stroke='currentColor'
                                  strokeWidth={1.5 / zoomK}
                                  strokeDasharray={`${4 / zoomK} ${3 / zoomK}`}
                                  opacity={0.7}
                                  data-pen-rubber=''
                                />
                              )}
                              {pen.anchors.map((an, i) => (
                                <g key={i}>
                                  {/* Обе рукоятки КАЖДОГО якоря — их видно и их можно взять. */}
                                  {(['inH', 'outH'] as const).map((side) => {
                                    const off = an[side];
                                    if (!off) return null;
                                    const hx = (an.a[0] + off[0]) * PLATE_W;
                                    const hy = (an.a[1] + off[1]) * plateH;
                                    return (
                                      <g key={side}>
                                        <line
                                          x1={an.a[0] * PLATE_W}
                                          y1={an.a[1] * plateH}
                                          x2={hx}
                                          y2={hy}
                                          stroke='currentColor'
                                          strokeWidth={1 / zoomK}
                                          opacity={0.8}
                                        />
                                        <circle
                                          cx={hx}
                                          cy={hy}
                                          r={3.5 / zoomK}
                                          fill='#fff'
                                          stroke='currentColor'
                                          strokeWidth={1.25 / zoomK}
                                          data-pen-handle={`${i}:${side === 'inH' ? 'in' : 'out'}`}
                                        />
                                      </g>
                                    );
                                  })}
                                  {/* Первый якорь при живом пути — полый и крупнее: «клик сюда
                                      замыкает контур». Остальные — залитые квадраты. */}
                                  {i === 0 && pen.anchors.length >= 2 ? (
                                    <rect
                                      x={an.a[0] * PLATE_W - 5 / zoomK}
                                      y={an.a[1] * plateH - 5 / zoomK}
                                      width={10 / zoomK}
                                      height={10 / zoomK}
                                      fill='#fff'
                                      stroke='currentColor'
                                      strokeWidth={1.5 / zoomK}
                                      data-pen-anchor={i}
                                    />
                                  ) : (
                                    <rect
                                      x={an.a[0] * PLATE_W - 4 / zoomK}
                                      y={an.a[1] * plateH - 4 / zoomK}
                                      width={8 / zoomK}
                                      height={8 / zoomK}
                                      fill='currentColor'
                                      data-pen-anchor={i}
                                    />
                                  )}
                                </g>
                              ))}
                            </g>
                          )}
                        </svg>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Страж выхода. Возврат фокуса экрану — тем же приёмом, что у фулскрина сборки: без
              него закрытие модалки роняет фокус в body и клавиши экрана мертвы до клика. */}
          <ConfirmationModal
            open={confirmExit}
            onOpenChange={setConfirmExit}
            onConfirm={() => {
              setConfirmExit(false);
              onOpenChange(false);
            }}
            onCancel={() => setConfirmExit(false)}
            width='sm'
            title='leave the editor?'
            confirmLabel='discard and leave'
            cancelLabel='keep editing'
            onCloseAutoFocus={(event) => {
              event.preventDefault();
              contentRef.current?.focus();
            }}
          >
            <Text size='micro' component='p'>
              The drawing changed since it was read and was not saved. Leaving now throws the
              change away — «save the drawing only» in the header keeps it without making a
              picture.
            </Text>
          </ConfirmationModal>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

/**
 * Which stroke a click means — in WORLD pixels (the plate's own), with the threshold handed in by
 * the caller ALREADY DIVIDED BY ZOOM: ten screen pixels must mean ten screen pixels at every
 * magnification, and forgetting the division makes strokes harder to hit exactly when somebody
 * zoomed in to hit them precisely. Distance is measured against the polyline `strokePolyline`
 * hands back — for a curve that includes the bulge, not just the anchors (the full argument lives
 * on `strokePolyline`).
 */
function hitStroke(
  strokes: VectorStroke[],
  at: [number, number],
  w: number,
  h: number,
  hitPx: number,
): number | null {
  const p = { x: at[0] * w, y: at[1] * h };
  let index = -1;
  let best = Number.POSITIVE_INFINITY;
  for (let i = 0; i < strokes.length; i++) {
    const near = nearestOnPolyline(p, strokePolyline(strokes[i], w, h));
    if (!near || near.dist >= best) continue;
    best = near.dist;
    index = i;
  }
  return index >= 0 && best <= hitPx ? index : null;
}
