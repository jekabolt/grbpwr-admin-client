import * as Dialog from '@radix-ui/react-dialog';
import type {
  DesignBenchSlotRef,
  GetDesignBandResponse,
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

import { FIT_INSET, FIT_MIN, fitView, revealDelta, toWorld, zoomAt, type View } from '../../canvas-view';
import { exactPalette, isMapInk, planHex } from '../colour-plan/model';
import { pictureHandle } from '../handles';
import { provenanceLabel, readProvenance } from '../provenance';
import { findMediaUrlInBand, useDesignWrites } from '../use-design-band';
import { RASTER_FALLBACK_W, pickSceneInk, rasteriseStrokesOverBase } from './rasterise-layer';
import {
  findLayerForMedia,
  layerRasterUrl,
  layerRefusalText,
  uploadRaster,
  useDesignEditLayer,
  useEditLayerWrites,
  type LayerHandle,
} from './use-edit-layer';
import {
  BACKDROP_GONE_TEXT,
  BACKDROP_KEEP_UNITS,
  adoptBackdrop,
  backdropCorners,
  backdropCss,
  backdropScopeKey,
  flushBackdrop,
  forgetBackdrop,
  probeBackdrop,
  readBackdrop,
  reconcileBackdrop,
  saveBackdropSoon,
  setBackdropDepth,
  setBackdropLocked,
  setBackdropOpacity,
  setBackdropGrid,
  setBackdropQuad,
  type Backdrop,
} from './vector-backdrop';
import {
  FULL_REGION,
  MIN_FRAME_SIDE,
  CORNER_HANDLES,
  HANDLE_UV,
  drawWarped,
  fitQuadRatio,
  hitFrame,
  keepQuadReachable,
  moveQuad,
  pinQuad,
  pointInQuad,
  quadAngleDeg,
  quadBounds,
  quadCenter,
  quadCss,
  quadFromRect,
  rotateQuad,
  scaleQuad,
  snapDeg,
  gridIsIdentity,
  gridIsUsable,
  hitWarpNode,
  identityGrid,
  moveGridNode,
  quadToDomain,
  warpCrossesHorizon,
  warpHorizonMargin,
  warpMapper,
  warpSurfaceBox,
  type FrameHit,
  type Quad,
  type WarpGrid,
  type WarpRegion,
} from './transform-frame';
import {
  MAX_GUIDES,
  addGuide,
  flushGuides,
  hitGuide,
  readGuides,
  sameSpot,
  saveGuidesSoon,
  snapFrac,
  tickStep,
  type Guide,
} from './vector-guides';
import { BackdropWarpCanvas } from './backdrop-warp-canvas';
import { TransformFrameOverlay, type FrameOwner } from './transform-frame-overlay';
import { patchRegion } from './vector-patch';
import { handleEnd } from './vector-pen';
import {
  editBegin,
  editCommit,
  editConvert,
  editDelete,
  editDown,
  editHit,
  editMove,
  editNudge,
  editPreviewD,
  editResync,
  editSelect,
  editUp,
  nearestOnPath,
  nodeEditable,
  type EditState,
} from './vector-pen-edit';
import {
  DEFAULT_EXPAND_FILL,
  ExpandGuardError,
  expandRasterLayer,
  expandStrokes,
  framePlanCuts,
  planFrame,
  type ExpandFill,
} from './vector-expand';
import { ToolIcon, VectorBrushRail } from './vector-brush-rail';
import { STAGE_WORDS, traceOnePress, type OnePressStage } from './trace-onepress';
import { layerVectorSvg } from './svg-export';
import { healMask } from './vector-heal';
import {
  COPY_NUDGE,
  copyInsideSelection,
  deleteInsideSelection,
  pointInPolygon,
  selectionPathD,
  settleLasso,
  thinLasso,
  type SelectionArea,
} from './vector-lasso';
import {
  DEFAULT_TOLERANCE,
  bucketFill,
  parseFillColor,
  selectionAlpha,
} from './vector-fill';
import { DEFAULT_NIB, clampNib, eraseAlong, stampAlong } from './vector-nib';
import {
  PLATE_W,
  RASTER_MAX_W,
  RASTER_UNDO_BYTES,
  RASTER_UNDO_DEPTH,
  clearGesture,
  cloneAlong,
  commitStage,
  cutoutInside,
  cutoutRect,
  drawCutout,
  exportColourMapPng,
  exportRasterPng,
  markRect,
  maskBox,
  nibRadius,
  PAPER_INK,
  paintAlong,
  smoothSegment,
  rasterCtx,
  rasterBox,

  renderView,
  seedRaster,
  selectionMask,
  fillInside,
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
  decodeStrokesWire,
  DEFAULT_INK,
  DEFAULT_RATIO,
  MAX_STROKES_BYTES,
  HOTKEYS,
  DEFAULT_GAUGE,
  DEFAULT_STEP,
  clampGauge,
  stitchMinLength,
  stitchName,
  strokeGauge,
  strokeStep,
  clampStep,
  gaugeWeight,
  readInk,
  readLayer,
  settleTrace,
  thinTrace,
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
 * ВХОДА-ВОПРОСА БОЛЬШЕ НЕТ (H-1, круг 14). Владелец: «пока отложим это пока из эдит мода
 * полностью выпили как нажиаешь что перевести в вектор итд сразу открывать эдитор». Развилка
 * «рисовать / перевести машиной» снята ЦЕЛИКОМ вместе со своей веткой «да»: панель, платный
 * прогон `StartDesignRun(kind='vector')`, поллинг, приёмка `ImportDesignVector` и разборщик
 * чужого SVG удалены файлами, а не спрятаны флагом — мёртвый читатель это дверь, через которую
 * вещь отрастает обратно, и git помнит всё.
 *
 * ⚠ ЦЕНА НАЗВАНА ВСЛУХ: готовый, но НЕ ПРИНЯТЫЙ векторный прогон остаётся строкой истории с
 * картинкой, но подшить его слоем больше нечем — клиентская приёмка удалена. Деньги не спрятаны
 * (история прогон показывает), дверь «keep this vector» исчезла.
 *
 * Серверные глаголы живы и не тронуты: это «пока отложим», а не «снесли контракт». Возврат —
 * новая сборка, не раскопка.
 *
 * ОБВОДКА ОСТАЛАСЬ, И ОНА БЕСПЛАТНАЯ: `trace-onepress.ts` поверх собственного движка
 * (`vector-trace.ts`), дверь — чип `data-trace-run` в рейке. Машина рисунок не ПЕРЕРИСОВЫВАЕТ,
 * она обводит те пиксели, что есть.
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
  | 'fill'
  | 'heal'
  | 'patch'
  | 'lasso'
  | 'crop'
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
  fill: 'fill',
  heal: 'heal',
  patch: 'patch',
  lasso: 'lasso',
  crop: 'crop',
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
  fill: 'g',
  // `j` — та же клавиша, что у лечащей кисти в фотошопе, и она здесь свободна.
  heal: 'j',
  /**
   * ⚠ `k` И `q` ВМЕСТО ФОТОШОПНЫХ `c` И `j`, И ЭТО ВЫНУЖДЕННО, А НЕ ПО ВКУСУ.
   *
   * У фотошопа кроп — `c`, заплатка — `j`. Обе буквы здесь ЗАНЯТЫ РАНЬШЕ: `c` — клон линий (он
   * появился, когда растра в редакторе не было вовсе), `j` — лечащая кисть. Отобрать их у соседей
   * значило бы переучивать руку тех, кто уже привык, ради двух новых инструментов; поэтому
   * фотошопная раскладка нарушена ОСОЗНАННО и названа здесь. Свободные буквы рядом по смыслу:
   * `k` — «kadr», ближайшая к `c` незанятая, и `q` — под мизинцем, как и вся тройка ретуши.
   */
  crop: 'k',
  patch: 'q',
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
    'rub away everything under the nib — the pixels are rubbed to PAPER WHITE, the photo included, and the drawn lines are cut through. Lines are only cut at full opacity (a line cannot be half-erased), never while the lines layer is hidden, and never outside an active area',
  stamp: 'copy PIXELS from the source to under your hand, as in photoshop',
  fill: 'flood the area under the cursor with the ink in hand — an active area holds it in',
  heal:
    'brush over a spot — a mole, a speck, a stray mark — and let go: it grows over with the texture around it. The colour in hand is not used; opacity is how hard it heals. An active area holds it in. When nothing nearby matches, that spot is smoothed instead of grown, and the tool says so',
  patch:
    'lasso a region, then drag it onto a clean place — the region is REBUILT from where you dropped it and the seam is blended into what surrounds it. Nothing is invented: the pixels come from the place you chose, not from the rest of the picture. Lines are never touched',
  lasso: 'draw an area — it holds the raster tools in and cuts the lines at its edge',
  crop:
    'drag the frame — outward grows the sheet, inward crops it. Enter applies, esc cancels. This cannot be undone and survives only as a NEW picture',
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
  {
    material: 'pixels',
    label: 'pixels',
    tools: ['paint', 'erase', 'stamp', 'fill', 'heal', 'patch'],
  },
  /**
   * КРОП СТОИТ В ПОЛОСЕ «ОБЛАСТЬ И ВИД», А НЕ В ПИКСЕЛЯХ (G-4: «добавь его просто в набор тулов в
   * верхнем баре»). Он не производит ни линий, ни пикселей — он меняет САМ ЛИСТ, то есть коробку,
   * в которой живут оба материала; в полосе `pixels` он обещал бы, что линии переживут его
   * нетронутыми, а он их режет.
   */
  { material: 'view', label: 'area & view', tools: ['lasso', 'crop', 'pan'] },
];

/**
 * ПОЛОСЫ РЕЖИМА ЦВЕТОВОЙ КАРТЫ — СУЖЕНИЕ ТОГО ЖЕ СПИСКА, А НЕ ВТОРОЙ СПИСОК.
 *
 * ⚠ ЗДЕСЬ НЕТ ЛИНИЙ, И ЭТО УТВЕРЖДЕНИЕ. Карта — плоские заливки по чертежу, который УЖЕ нарисован;
 * штрих на ней не метка (у него нет площади, скан его не увидит) и не чертёж (чертёж приехал
 * снизу). Нет клона, штампа, лечилки и заплатки: все четверо КОПИРУЮТ пиксели с одного места на
 * другое, то есть размазывают чужие полутона — ровно то, чего точный скан не досчитается. Нет
 * кропа: он пересчитывает лист, а карта обязана совпасть с флэтом пиксель в пиксель, иначе метки
 * лягут не на те детали.
 */
const COLOUR_TOOL_BANDS: { material: Material; label: string; tools: Tool[] }[] = [
  { material: 'pixels', label: 'colour', tools: ['paint', 'fill', 'erase'] },
  { material: 'view', label: 'area & view', tools: ['lasso', 'pan'] },
];

/** Тот же список, множеством — им гейтится ЕДИНСТВЕННЫЙ писатель инструмента (`switchTool`). */
const COLOUR_TOOLS = new Set<Tool>(COLOUR_TOOL_BANDS.flatMap((b) => b.tools));

/** Инструменты, красящие ПИКСЕЛИ. Их жест копится в буфере растра, а не в списке штрихов. */
const isRasterTool = (t: Tool): t is 'paint' | 'erase' | 'stamp' =>
  t === 'paint' || t === 'erase' || t === 'stamp';

/**
 * ПИКСЕЛЬНЫЙ, НО НЕ МАЖУЩИЙ. Заливке нужен растр — и только это у неё общего с кистью: жеста у неё
 * нет (один клик), буфера мазка нет (пишет прямо в документ, как «стереть внутри»), кольца ниба нет
 * (заливка не имеет размера). Поэтому она НЕ входит ни в `isRasterTool`, ни в `isNibTool`, а
 * «нужен ли растр» спрашивается отдельным предикатом — иначе она поехала бы по пути scratch→stage,
 * которого у неё нет.
 */
/**
 * ⚠ КРОП ЗДЕСЬ ЕСТЬ, ХОТЯ В ПОЛОСЕ ОН СТОИТ НЕ В ПИКСЕЛЯХ (круг 15, J-32).
 *
 * Владелец: «в эдит моде когда мы хотим увеличить полотно через кроп … после применения оно не
 * увеличивает картинку а просто растягивает то что было». Дословно так и было — и не с прошлого
 * круга, а с самого G-4. Кроп ПЕРЕСЧИТЫВАЕТ ХОЛСТ (`expandRasterLayer`), а холста на плате с
 * фотографией, к которой не притрагивались пиксельным инструментом, ПРОСТО НЕТ: ветка
 * `layer === null` в `applyCropFrame` меняла только форму платы, подложку растягивал
 * `objectFit:'fill'`, а сохранение брало размер у НАТУРАЛЬНЫХ размеров картинки. Замерено: плата
 * 0.8 → 1.046, `stretchX` 1.3075, аплоад 800×1000 вместо 1046×1000.
 *
 * Дефект не находили два круга по одной причине: `qa-crop` перед КАЖДЫМ кропом нажимает `brush`
 * (`qa-crop.mjs:189, 391`), а `switchTool('brush')` заводит холст. Проба сама создавала состояние,
 * в котором дефекта нет. Владелец открывает фотографию и берёт кроп сразу.
 *
 * Отсюда: кроп заводит растр, как всякий инструмент, который его ТРОГАЕТ, — и цена названа вслух:
 * с этого круга кроп на плате с фотографией ЗАВИСИТ ОТ ПРОКСИ ровно так же, как кисть, и
 * отказывает теми же словами.
 */
/**
 * ПРЯМОУГОЛЬНИК ВЬЮПОРТА, В КОТОРОМ ЖИВЁТ МИР, — ОДИН НА ВСЕХ ЧИТАТЕЛЕЙ (круг 15, J-36).
 *
 * ⚠ РАМКА В 1 px ВХОДИЛА В `getBoundingClientRect`, НО НЕ В МИР. Узел вьюпорта несёт
 * `border border-borderColor`; `getBoundingClientRect().left` — ВНЕШНИЙ край рамки, а мир
 * (`absolute left-0 top-0`) стоит от ВНУТРЕННЕГО. `toWorld` вычитал внешний — и всё, что рисует
 * редактор, оказывалось на 1 px правее и ниже указателя. Замерено: круг ниба (+1,+1) px и
 * отпечаток (+0.98,+0.98) px на зуме 0.524, (+1,+1.01) на 0.905; между собой они сходились до
 * 0.02 px, то есть пара «превью и результат» была ЦЕЛА, а мимо шли ОБА. В юнитах платы это
 * 1.9 на вписывании и 0.125 на 8× — «выделяем не так ровно, как хотелось бы» дословно.
 *
 * Шесть чтений прямоугольника у шести читателей (вписывание, колесо, зум кнопкой, две обёртки
 * координаты, отступ вида) сводятся сюда. Размер берётся `clientWidth/clientHeight` по тому же
 * доводу: это коробка СОДЕРЖИМОГО, а вписывать надо в неё, а не в неё плюс две рамки.
 */
const viewportRect = (vp: HTMLElement) => {
  const r = vp.getBoundingClientRect();
  return {
    left: r.left + vp.clientLeft,
    top: r.top + vp.clientTop,
    width: vp.clientWidth,
    height: vp.clientHeight,
  };
};

const needsRaster = (t: Tool): boolean =>
  isRasterTool(t) || t === 'fill' || t === 'heal' || t === 'patch' || t === 'crop';

/**
 * МАЖУЩИЙ ЖЕСТ — те, у кого есть протяжка по холсту: буфер мазка копится в `scratch`, превью
 * показывает след под рукой.
 *
 * ЛЕЧИЛКА ЗДЕСЬ, НО НЕ В `isRasterTool`, И ЭТО НЕСУЩЕЕ РАЗЛИЧИЕ. `isRasterTool` гейтит путь
 * scratch → просеять → положить краску (`endRasterGesture`); лечилка краски не кладёт вовсе,
 * буфер ей нужен только как НАКОПИТЕЛЬ МАСКИ — «вот сюда я мазнул». Поставь её в `isRasterTool`,
 * и отпускание руки записало бы тёмный мазок превью в документ как живопись.
 */
const smears = (t: Tool): boolean => isRasterTool(t) || t === 'heal';

/**
 * ПРЕВЬЮ ЛЕЧИЛКИ — ФИКСИРОВАННОЕ, и оба числа тут не вкус.
 *
 * Цвет в руке лечилка не использует вовсе (движок читает только альфу маски), поэтому красить
 * превью им значило бы прятать след, когда в руке белое: человек вёл бы по белой ткани белым по
 * белому и не видел, где мажет. Непрозрачность тоже своя: у лечилки ползунок непрозрачности — это
 * СИЛА ЛЕЧЕНИЯ, а не видимость следа, и на 10% силы след был бы почти невидим ровно тогда, когда
 * целиться надо точнее всего.
 */
const HEAL_PREVIEW_INK = '#00000080';
const HEAL_PREVIEW_ALPHA = 0.5;

/** Инструмент, множащий ЛИНИИ круглым нибом. Резчик ушёл в ластик — см. `TOOL_BANDS`. */
const isLineNib = (t: Tool): t is 'clone' => t === 'clone';

/**
 * Круглый ниб в руке — у всех пяти. ОДНО число размера на все, а не по числу на инструмент: довод
 * прежнего ниба («стирают крупным кругом, а рисуют тонкой нитью») отделял КРУГЛЫЙ КОНЧИК от НИТИ,
 * а не ластик от штампа. Пять чисел на пять круглых кончиков были бы пятью ручками, которые человек
 * крутит в одну и ту же сторону.
 */
const isNibTool = (t: Tool): t is 'clone' | 'paint' | 'erase' | 'stamp' | 'heal' =>
  isRasterTool(t) || isLineNib(t) || t === 'heal';

/** Инструменты, берущие ИСТОЧНИК alt-кликом. */
const isSourceTool = (t: Tool): t is 'clone' | 'stamp' => t === 'clone' || t === 'stamp';

/** Инструменты, рисующие НИТЬЮ: их «размер в руке» — толщина, а не радиус круга. */
const isThreadTool = (t: Tool): t is 'line' | 'freehand' | 'curve' =>
  t === 'line' || t === 'freehand' || t === 'curve';

/** How close a click has to land, in SCREEN pixels, to mean «this stroke». */
const HIT_PX = 10;
/** Шаг зума кнопкой и клавишей — тот же, что у полотна сборки (ZOOM_STEP его HUD). */
const Z_STEP = 1.2;

/**
 * ПОТОЛОК ЗУМА РЕДАКТОРА — СВОЙ, 800% (G-6: «самый большой зум должен быть ещё ближе»).
 *
 * Общий `ZOOM_MAX = 2.5` из `canvas-view.ts` не тронут: им живёт полотно сборки, у которого своя
 * причина стоять на 250% и свои гейты. Здесь потолок передаётся вызовом.
 *
 * ПОЧЕМУ 8 И ЧТО ЕГО ОГРАНИЧИВАЕТ. Зум — это CSS-трансформ мира; backing store холста от него не
 * растёт, поэтому память не ограничивает вовсе. Ограничивает ИНТЕРПОЛЯЦИЯ: на 8× один пиксель
 * растра (плата 1600) занимает около пяти экранных, и браузер по умолчанию размазывает его
 * билинейно — «ближе» читалось бы как «мыльнее». Отсюда второй половиной этого пункта идёт
 * `image-rendering: pixelated` начиная с `PIXELATED_FROM`: с этого масштаба человек смотрит на
 * ПИКСЕЛИ, и показывать их надо пикселями. Выше восьми смысла нет: всё в редакторе позиционируется
 * в юнитах платы, а 8× уже даёт ~13 экранных точек на юнит — крупнее самой единицы адресации.
 */
const EDITOR_ZOOM_MAX = 8;

/**
 * С какого масштаба растр рисуется пикселями, а не сглаженной кашей. Три — это точка, где один
 * пиксель растра занимает около двух экранных: ниже сглаживание ещё помогает, выше оно уже врёт
 * о том, где проходит край краски, — а ретушь нибом в один юнит (G-5) делается именно по краю.
 */
const PIXELATED_FROM = 3;

/**
 * Признак экрана в DOM — тем же приёмом, что `data-assembly-screen`: модалка поверх (страж выхода)
 * живёт в СВОЁМ портале у body, и вернуть фокус экрану после её закрытия можно только найдя его.
 */
const SCREEN_MARK = 'data-vector-screen';

const clamp01 = (n: number) => Math.min(1, Math.max(0, n));

/* ═══ SHIFT ДЕЛАЕТ ЛИНИЮ РОВНОЙ (E-18) ══════════════════════════════════════════════════════
 *
 * Владелец: «при зажатом шифте линии должны быть ровными». Ровно фотошопное правило: рука ведёт
 * куда угодно, а линия ложится по ближайшей из ВОСЬМИ осей — 0°, 45°, 90° и так по кругу.
 *
 * ⚠ УГЛЫ СЧИТАЮТСЯ В ЮНИТАХ ПЛАТЫ, А НЕ В ДОЛЯХ, И БЕЗ ЭТОГО ПРАВИЛО ВРЁТ. Указатель приходит
 * долями кадра (`frameAt`), а плата не квадрат: при 4:5 доля по вертикали в 1.25 раза «длиннее»
 * доли по горизонтали, и «45°» в долях легло бы на экране под 38.66°. Тот же класс ошибки, что
 * уже стоил анизотропного прореживания лассо: доли — не метры.
 *
 * ⚠ ТОЧКА КЛАДЁТСЯ ПРОЕКЦИЕЙ, А НЕ ПОВОРОТОМ. Поворот сохранил бы ДЛИНУ и увёл бы конец линии
 * из-под курсора: рука на 100 юнитов вправо и 10 вниз получила бы горизонталь длиной 100.5 —
 * длиннее, чем показывает рука. Проекция даёт ровно ту составляющую, которая вдоль оси.
 */
/* ═══ ЛИНЕЙКИ: РАЗМЕРЫ И ЧЕРНИЛА (E-17) ═════════════════════════════════════════════════════
 *
 * Полосы кладутся ПОВЕРХ вьюпорта, а не рядом с ним, и это несущее решение, а не экономия
 * разметки. Полоса, занявшая место в потоке, УМЕНЬШИЛА БЫ вьюпорт на 16 px в тот момент, когда
 * человек нажимает чип, — то есть холст уехал бы под рукой, а `viewportRect()` (шесть читателей,
 * от лассо до кольца кисти) сменил бы размер на кадре без единого жеста. Ровно этот класс
 * дефектов уже сторожит проба 83. Наложенная полоса не двигает ничего.
 *
 * Цвета — токены дома, а не выдуманные: белая полоса это МАТЕРИАЛ на сером грунте вьюпорта,
 * #666 подписи (labelColor, ~5.7:1 — читаемо, в отличие от #ccc), #e6e6e6 внутреннее правило
 * между хромом и холстом.
 */
const RULER_PX = 16;
const RULER_FONT_PX = 9;
const RULER_MAJOR_PX = 6;
const RULER_MINOR_PX = 3;
/**
 * Наименьшее расстояние между ПОДПИСАННЫМИ делениями. Не замер, а арифметика: самая длинная
 * подпись здесь — пять знаков («−1000»), моноширинный 9 px даёт около 5.4 px на знак, то есть
 * 27 px текста плюс отступ; 56 оставляет между соседними числами примерно столько же пустого
 * места, сколько занимает само число, — ниже этого шкала читается как сплошная строка цифр.
 */
const RULER_LABEL_MIN_PX = 56;
const RULER_MINOR_MIN_PX = 5;
const RULER_BG = '#ffffff';
const RULER_INK = '#666666';
const RULER_RULE = '#e6e6e6';
const RULER_EDGE = '#000000';

/** Насколько близко к направляющей надо подвести руку, чтобы взять её, — в пикселях ЭКРАНА. */
const GUIDE_GRAB_PX = 5;
/** Насколько близко конец линии притягивается к разметке — в пикселях ЭКРАНА. */
const GUIDE_SNAP_PX = 7;

const STRAIGHT_STEP = Math.PI / 4;

/**
 * Насколько рука обязана уйти от точки нажатия, прежде чем у жеста появится направление, — в
 * юнитах платы (плата шириной 1000). Порог несущий у МАЗКА: его ось выбирается один раз и
 * держится, и дрожь в один юнит на нажатии заперла бы весь мазок на случайной оси.
 */
const STRAIGHT_MIN_UNITS = 3;

/** Единичное направление ближайшей из восьми осей, в юнитах платы. `null` — рука не сдвинулась. */
const straightDir = (
  from: [number, number],
  to: [number, number],
  plateH: number,
): [number, number] | null => {
  const dx = (to[0] - from[0]) * PLATE_W;
  const dy = (to[1] - from[1]) * plateH;
  if (Math.hypot(dx, dy) < STRAIGHT_MIN_UNITS) return null;
  const a = Math.round(Math.atan2(dy, dx) / STRAIGHT_STEP) * STRAIGHT_STEP;
  return [Math.cos(a), Math.sin(a)];
};

/**
 * Отрезок параметра t, на котором `o + d·t` не выходит за [0, size]. Луч ДВУСТОРОННИЙ нарочно:
 * при заблокированной оси (мазок) рука имеет право пойти назад по той же линии, и обрезка
 * отрицательной половины запирала бы её у точки нажатия.
 */
const rayRange = (o: number, d: number, size: number): [number, number] => {
  if (Math.abs(d) < 1e-9) {
    return o < 0 || o > size
      ? [0, 0]
      : [Number.NEGATIVE_INFINITY, Number.POSITIVE_INFINITY];
  }
  const a = -o / d;
  const b = (size - o) / d;
  return a < b ? [a, b] : [b, a];
};

/**
 * Точка руки, положенная на луч `dir` из `from`, — в долях кадра.
 *
 * ⚠ ПЛАТА ОБРЕЗАЕТ ДЛИНУ, А НЕ КООРДИНАТЫ. Прижать x и y порознь (`clamp01` у каждой, как это
 * делает `frameAt`) значило бы СЛОМАТЬ УГОЛ: диагональ, ушедшая за верхний край, вернулась бы с
 * прижатым y и прежним x, то есть перестала бы быть диагональю ровно там, где человек смотрит.
 */
const alongDir = (
  from: [number, number],
  to: [number, number],
  dir: [number, number],
  plateH: number,
): [number, number] => {
  const ox = from[0] * PLATE_W;
  const oy = from[1] * plateH;
  const dx = to[0] * PLATE_W - ox;
  const dy = to[1] * plateH - oy;
  const rx = rayRange(ox, dir[0], PLATE_W);
  const ry = rayRange(oy, dir[1], plateH);
  const lo = Math.max(rx[0], ry[0]);
  const hi = Math.min(rx[1], ry[1]);
  const len = Math.min(Math.max(dx * dir[0] + dy * dir[1], lo), Math.max(hi, lo));
  return [clamp01((ox + dir[0] * len) / PLATE_W), clamp01((oy + dir[1] * len) / plateH)];
};

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

/**
 * ЗОНЫ ПОПАДАНИЯ РАМКИ, В ЭКРАННЫХ ПИКСЕЛЯХ — как `HIT_PX` у штриха, и делятся на зум там же, где
 * он: десять экранных пикселей обязаны значить десять экранных на любом приближении.
 *
 * Зона поворота ШИРЕ ручки и лежит СНАРУЖИ квада: внутри её нет вовсе, иначе она отбирала бы у
 * человека перетаскивание тела ровно у углов, где он чаще всего целится.
 */
const FRAME_HANDLE_PX = 9;
const FRAME_ROTATE_PX = 26;

/**
 * САМАЯ МЕЛКАЯ РАМКА ВСТАВКИ, в долях кадра. Копия одной ГОРИЗОНТАЛЬНОЙ линии имеет нулевую
 * высоту, и нормировать по ней значило бы делить на ноль: вставка приезжала бы с NaN в каждой
 * координате и не рисовалась вовсе. Коробка раздаётся симметрично, поэтому вставка без единого
 * жеста ложится ровно туда же, куда клала прежняя мгновенная — числа проб 48 не сдвигаются.
 *
 * ⚠ ЧИСЛО ВЫРОСЛО С 0.02 ПО ЗАМЕРУ. При двух сотых рамка получалась высотой в 25 юнитов платы —
 * тоньше, чем зона захвата её собственных ручек, — и ВЗЯТЬСЯ ЗА ТЕЛО БЫЛО НЕЧЕМ: любое нажатие
 * попадало в ручку, то есть тонкая вставка не двигалась вовсе, а только растягивалась. Зона ручки
 * теперь сужается вместе с рамкой (`hitFrame`), но полоса тела обязана остаться видимой и пальцу.
 */
const MIN_FLOAT_SPAN = 0.05;

/** Во сколько раз кадру позволено вырасти за один жест — тот же потолок, что стоял у множителя. */
const CROP_MAX_GROWTH = 4;

/** Пиксели вставки: их источник и место в домене рамки. */
type FloatPaste = {
  /** Штрихи, нормированные в единичный квадрат домена рамки. */
  strokes: VectorStroke[];
  /** Вырезка пикселей и её место в том же домене. */
  cut: HTMLCanvasElement | null;
  cutRegion: WarpRegion;
  /** Исходная коробка в долях кадра — ею меряется, во сколько раз изменилась толщина нити. */
  srcW: number;
  srcH: number;
};

type FrameState = {
  owner: FrameOwner;
  quad: Quad;
  /** Кроп: осе-выровненная рамка без поворота и перспективы — у листа нет ни угла, ни схода. */
  axis: boolean;
  snapshot: Quad;
  /** ГЕОМЕТРИЯ ИСКРИВЛЕНИЯ (H-4): шестнадцать контрольных точек в домене квада. Форма, не режим. */
  grid?: WarpGrid;
  /**
   * ОРГАНЫ СЕТКИ НА ЭКРАНЕ. Геометрия живёт в `grid`, показ — здесь: «искривлён, но под ручками»
   * это законное состояние, и без второго поля оно НЕВЫРАЗИМО.
   *
   * ⚠ ПЕРВАЯ РЕДАКЦИЯ ЭТОГО ТИПА ПОЛЯ НЕ ИМЕЛА НАРОЧНО — «режим и есть наличие сетки», — и это
   * стоило двух дефектов, замеренных ревю. Выход из режима (`leaveWarp`) над ИЗОГНУТЫМ мешем был
   * тождественным no-op: он перекладывал ту же сетку обратно, и чип, чья подпись обещает «вернуться
   * к восьми ручкам», не делал ничего (16 узлов / 0 ручек до нажатия и после). А сохранённое
   * искривление открывалось сразу в узлах, потому что «сетка в записи» и означало «режим». Вместе
   * это значило, что ИСКРИВЛЁННЫЙ ШАБЛОН БОЛЬШЕ НЕЛЬЗЯ НИ ПОДВИНУТЬ, НИ ПОВЕРНУТЬ, НИ ПРИКОЛОТЬ.
   *
   * Довод против второго поля («они разойдутся: режим есть, сетки нет — что рисовать?») закрыт
   * УСТРОЙСТВОМ, а не дисциплиной: на экран смотрит ОДНА производная — `frameShowsNodes`, — и
   * названная комбинация в ней рисует ровно ручки. Разойтись полям негде.
   */
  warp?: boolean;
  /** Снимок сетки на открытии — Esc и ⌘Z возвращают ОБЕ половины постановки, а не одну. */
  snapshotGrid?: WarpGrid;
  float?: FloatPaste;
};

/**
 * ПОКАЗЫВАЕТ ЛИ РАМКА УЗЛЫ — ЕДИНСТВЕННЫЙ ЧИТАТЕЛЬ ПАРЫ «`warp` + `grid`» ЦЕЛИКОМ.
 *
 * ⚠ «Единственный читатель» здесь — про ПАРУ, а не про каждое поле по отдельности, и прежняя
 * редакция этой строки не оговаривала разницу. `leaveWarp` читает `fr.warp` НАПРЯМУЮ — и законно:
 * он спрашивает «мы сейчас в режиме узлов», то есть ОДНО поле, а не «рисовать ли узлы», для чего
 * нужны оба. Слить два вопроса — ровно тот дефект, что чинится ниже, поэтому второй читатель
 * одного поля тут не лишний, а другой вопрос.
 *
 * ⚠ ЭТОТ ВОПРОС НЕ ПУТАТЬ С «ИСКРИВЛЕНА ЛИ КАРТИНКА». Второй спрашивают выбором растеризатора
 * (`grid && !gridIsIdentity(grid)`) и отвечают на него ИНАЧЕ: изогнутый шаблон рисуется канвасом
 * и тогда, когда узлов на экране нет вовсе, — человек вышел к ручкам, а искривление осталось.
 * Слить эти два вопроса в один — ровно тот дефект, который здесь чинится.
 */
const frameShowsNodes = (
  fr: FrameState | null | undefined,
): fr is FrameState & { grid: WarpGrid } => !!fr && fr.warp === true && gridIsUsable(fr.grid);

/**
 * ТОЖДЕСТВЕННАЯ СЕТКА НЕ ХРАНИТСЯ — ОДНО ПРАВИЛО, ОДНО НАПИСАНИЕ.
 *
 * Довод один на все места вызова: сетка, записанная «на всякий случай», перевела бы показ шаблона
 * с резкого `img` + `matrix3d` на канвас НАВСЕГДА и объявила бы шаблон изменённым, хотя человек
 * только заглянул в режим и вышел. Пессимизация без причины — это враньё про то, что он сделал.
 *
 * ⚠ БЫЛО ЧЕТЫРЕ КОПИИ ОДНОГО ВЫРАЖЕНИЯ — `writeBackdropFrame`, `leaveWarp`, `commitFrame` и
 * `cancelFrame` писали `gridIsIdentity(x) ? undefined : x` каждый у себя. Свести их в `writeBackdropFrame`
 * нельзя: две из них пишут ещё и `setBackdropLocked(…, true)`, то есть у них разное ДЕЛО при общем
 * ПРАВИЛЕ. Поэтому вынесено ровно правило, а не дверь: расходиться теперь нечему.
 */
const keptGrid = (g: WarpGrid | undefined): WarpGrid | undefined =>
  gridIsIdentity(g) ? undefined : g;

/**
 * ПЕРЕСЕКАЕТ ЛИ ГЕОМЕТРИЯ ЭТОЙ РАМКИ ЛИНИЮ СХОДА — вопрос о ПАРЕ «квад + сетка», и другого
 * написания у него нет.
 *
 * ⚠ СПРАШИВАТЬ ОБЯЗАНО ОБЕ ПОЛОВИНЫ, И ЭТО ЗАМЕРЕННАЯ ПОЧИНКА. `warpMapper` композирует патч
 * сетки С ГОМОГРАФИЕЙ КВАДА, значит пригнуть делитель к нулю можно с ЛЮБОЙ стороны, а сторож
 * стоял только у одной: у драга узла. Писатель квада (`move` / `scale` / `rotate` / `pin`) шёл
 * мимо целиком. Замер: квад 1000 × 1000, узел 5 в [0.4, 0.3], ⌘-пин левого верхнего угла в точку
 * платы (990, 500) — делитель пробегает −0.49 … 1, ТО ЕСТЬ МЕНЯЕТ ЗНАК, минимум |w| = 0.005 при
 * пороге 0.02, семплированная точка поверхности уезжает в −49000 юнитов платы. Обратная матрица
 * при этом обратима, `Number.isFinite` доволен, и жест принимался: битмап превью упирался в
 * потолок (1318 × 4096), яркость над шаблоном обваливалась 155.68 → 67.88, а рваный квад уезжал
 * в запись.
 */
const frameCrossesHorizon = (fr: FrameState): boolean =>
  warpCrossesHorizon({ quad: fr.quad, grid: fr.grid });

/**
 * ЗАПАС ДО ЛИНИИ СХОДА ЧИСЛОМ — тем же, которым `frameCrossesHorizon` отвечает да/нет.
 * Нужен ровно затем, чтобы отличить «плохо» от «ХУЖЕ»: довод — у `putFrame`.
 */
const frameHorizonMargin = (fr: FrameState): number =>
  warpHorizonMargin({ quad: fr.quad, grid: fr.grid });

/**
 * Часть рамки, занятая ВЫРЕЗКОЙ ПИКСЕЛЕЙ. Углы берутся у того же `warpMapper`, что рисует коммит,
 * — значит превью и результат не могут разойтись даже под перспективой.
 */
const cutQuadOf = (quad: Quad, r: WarpRegion): Quad => {
  const f = warpMapper({ quad });
  return [f(r.u0, r.v0), f(r.u1, r.v0), f(r.u1, r.v1), f(r.u0, r.v1)] as unknown as Quad;
};

/** Одно и то же ли попадание. Сравнение по РОДУ и НОМЕРУ: объект приезжает новой ссылкой всегда. */
const sameHit = (a: FrameHit, b: FrameHit): boolean =>
  a === b ||
  (!!a && !!b && a.kind === b.kind && (a.kind === 'body' || b.kind === 'body' || a.handle === b.handle));

type FrameDrag = {
  id: number;
  mode: 'move' | 'scale' | 'rotate' | 'pin' | 'node';
  handle: number;
  startQuad: Quad;
  /** Сетка НА МОМЕНТ НАЖАТИЯ. Драг узла меняет её, драг квада — нет; опорой служит она обоим. */
  startGrid: WarpGrid | undefined;
  startAt: [number, number];
  /** Угол «центр → точка нажатия», градусы. Поворот считает приращение от него. */
  startDeg: number;
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
  mode = 'edit',
  colourLabel = '',
  mapSrc = '',
  seedInks,
  onColourMap,
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
  /**
   * ═══ РЕЖИМ ЦВЕТОВОЙ КАРТЫ — ЭТОТ ЖЕ РЕДАКТОР, СУЖЕННЫЙ, А НЕ ВТОРОЙ РЕДАКТОР ════════════════
   *
   * Владелец просил «заливкой и брашем выбрать кастомные колорс для разных деталей». Всё названное
   * здесь уже есть: ведро с допуском и лассо, которое его держит, пиксельная кисть с цветом в
   * руке, ластик, пипетка, отмена, зум, прокси для CORS и один шов загрузки. Второй маляр означал
   * бы второй растровый движок, который надо держать в согласии с первым, — ровно тот класс
   * расхождения, который этот репозиторий уже оплатил дважды (растеризатор, движок заливки).
   *
   * ЧТО РЕЖИМ МЕНЯЕТ, ПОИМЁННО: полос две вместо трёх (`paint / fill / erase` и `lasso / pan` —
   * ни линий, ни клона, ни штампа, ни лечилки, ни заплатки, ни кропа: ни один из них карту не
   * делает); жёсткость и непрозрачность заперты на 100 (внутренности заливки обязаны быть ТОЧНОЙ
   * краской, иначе скан палитры не досчитается их); ластик ВОЗВРАЩАЕТ чертёж вместо бумаги; в
   * шапке ОДНА кнопка — `use as colour map`, и никогда пара «слой / картинка»: карта не слой и не
   * снимок карточки.
   *
   * ⚠ И СЛОЙ ЭТОГО ФЛЭТА В ЭТОМ РЕЖИМЕ НЕ ЧИТАЕТСЯ И НЕ ПИШЕТСЯ ВОВСЕ. У слоя ключ
   * `(карточка, база)` — один на базу, — поэтому карта, сохранённая слоем, столкнулась бы с
   * обводкой того же флэта и стёрла бы её. Здесь она и не сохраняется слоем: наружу уезжает
   * отдельная картинка, а план её адресует.
   */
  mode?: 'edit' | 'colour';
  /** Имя вида для шапки в режиме карты: `colour — front`. */
  colourLabel?: string;
  /** Адрес УЖЕ ПОКРАШЕННОЙ карты этого вида: документ заводится из него, подложка — из флэта. */
  mapSrc?: string;
  /**
   * ПАЛИТРА, ЗАПИСАННАЯ В ПРОШЛЫЙ ЗАХОД. Засевает множество кандидатов, чтобы скан не гадал: цвет,
   * которым красили вчера и не трогали сегодня, обязан остаться меткой, а не исчезнуть из меню.
   */
  seedInks?: readonly string[];
  /**
   * КАРТА ГОТОВА: картинка уже в библиотеке, палитра посчитана точным совпадением.
   *
   * ⚠ ВОЗВРАЩАЕТ «ПРИНЯТО ЛИ», И ЭТО НЕ ФОРМАЛЬНОСТЬ. Приёмщик пишет план под сверкой ревизии, и
   * коллега, сохранивший свою покраску минуту назад, этот вызов ОТКЛОНИТ. Закрыться на отказе
   * значило бы выбросить минуты работы, которые ещё видны на экране, — поэтому редактор остаётся
   * открытым и говорит словами. Загруженный файл при этом остаётся ничьим в библиотеке; это цена
   * того, что скан идёт ДО загрузки, а не после неё.
   */
  onColourMap?: (map: {
    mediaId: number;
    url: string;
    palette: { hex: string; px: number }[];
  }) => boolean | Promise<boolean>;
}) {
  const { showMessage } = useSnackBarStore();
  const { setBenchSlot } = useDesignWrites(techCardId);
  const { saveLayer, flattenLayer } = useEditLayerWrites(techCardId);

  /** Режим карты цветов — читается двумя десятками мест ниже, поэтому назван один раз здесь. */
  const colourMode = mode === 'colour';
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
  /* ⚠ В РЕЖИМЕ КАРТЫ СЛОЙ НЕ ЧИТАЕТСЯ ВОВСЕ, И ЭТО НЕ ЭКОНОМИЯ ЗАПРОСА. Прочитанный слой поставил
     бы на плату чужие штрихи (обводку, ретушь) — а карта обязана совпадать с тем чертежом, который
     уезжает в слоте, то есть с ЧИСТЫМ флэтом. И не прочитанный слой невозможно перезаписать: ключ
     `(карточка, база)` один на базу, и сохранение карты слоем стёрло бы обводку того же флэта. */
  const layerQuery = useDesignEditLayer(techCardId, open && !colourMode ? knownId : 0);
  const loaded = layerQuery.data?.layer;

  const [strokes, setStrokes] = useState<VectorStroke[]>([]);
  const [tool, setTool] = useState<Tool>('line');
  /**
   * ИНСТРУМЕНТ В РУКЕ, ОТВЕЧАЮЩИЙ ПРО СЕЙЧАС. Состояние React отвечает про кадр, в котором
   * замыкание родилось, а с круга 15 у кропа есть ОЖИДАНИЕ между нажатием чипа и открытием
   * рамки: холст заводится асинхронно. За это время рука успевает взять другой инструмент, и
   * рамка, открытая по старому значению, встала бы поверх чужого жеста. Ссылка пишется в
   * `switchTool` СИНХРОННО — до всякой перерисовки.
   */
  const toolRef = useRef<Tool>('line');
  toolRef.current = tool;
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
  /**
   * ═══ ЧЕРНИЛА, КОТОРЫМИ ЗДЕСЬ КРАСИЛИ, — ЗАПИСЬ, А НЕ СКАН ════════════════════════════════════
   *
   * ⚠ ЭТО ЛОВУШКА, НАЗВАННАЯ ДИЗАЙНОМ ПОИМЁННО, И ОНА СТОИТ ДЕНЕГ. Собрать «какие цвета
   * использованы» проходом по готовому холсту НЕЛЬЗЯ: у заливки мягкая полоса края красит
   * «настолько, насколько похоже», у кисти есть антиалиасинг, под ними лежит JPEG со своим шумом, —
   * и такой проход возвращает сотни оттенков, которых никто не выбирал. Человек назначал бы ткани
   * цветам, которых на экране нет, а платный промпт объявлял бы модели детали, размеченные
   * несуществующей меткой.
   *
   * Поэтому кандидаты записываются В МОМЕНТ КОММИТА — там, где цвет ТОЧНО был в руке: кисть в
   * `endRasterGesture`, ведро в `fillAt`. Скан потом только СВЕРЯЕТ точным равенством, сколько
   * пикселей каждого записанного цвета выжило (`exactPalette`), — множество закрыто, выдумать в
   * нём нечего. Чёрное и белое не пишутся: это чернила чертежа и бумага.
   *
   * ⚠ РЕФ, А НЕ СОСТОЯНИЕ, У ПИСАТЕЛЯ. Коммит жеста и обработчик заливки зовутся вне рендера, и
   * значение из замыкания прошлого кадра потеряло бы цвет, взятый пипеткой секунду назад. Рядом
   * живёт состояние — им рисуется ряд чернил на рейке.
   */
  const [usedInks, setUsedInks] = useState<string[]>([]);
  const usedInksRef = useRef<string[]>([]);
  const recordInk = useCallback((hex?: string | null) => {
    const v = planHex(hex);
    if (!isMapInk(v)) return;
    if (usedInksRef.current.includes(v)) return;
    usedInksRef.current = [...usedInksRef.current, v];
    setUsedInks(usedInksRef.current);
  }, []);
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
  /** Заливка: насколько далеко от цвета под курсором она соглашается идти, и на сколько заходит под
   *  антиалиасинг соседнего контура. Мягкость края и размытие маски наружу не выведены нарочно —
   *  четыре ручки на одну работу это ручки, которые человек крутит в одну сторону. */
  const [fillTolerance, setFillTolerance] = useState<number>(DEFAULT_TOLERANCE);
  const [fillExpand, setFillExpand] = useState<number>(0);
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
  const [refusal, putRefusal] = useState<string | null>(null);
  /**
   * ДВЕРЬ ВНУТРИ ОТКАЗА. Отказ, называющий выход словами, и отказ, дающий его нажатием, — разные
   * экраны для руки, и второй здесь возможен ровно потому, что выход ОДИН и он уже есть в шапке.
   */
  const [refusalDoor, setRefusalDoor] = useState<'picture' | null>(null);
  /**
   * ⚠ ТЕКСТ ОТКАЗА И ЕГО ДВЕРЬ СТАВЯТСЯ ОДНИМ ВЫЗОВОМ, И ЭТО НЕ УДОБСТВО.
   *
   * Отказов в этом файле десять, и гасят они друг друга в любом порядке. Разведи текст и кнопку
   * по двум сеттерам — и первый же отказ, поставленный без кнопки поверх кропового, оставил бы
   * «save as a new picture» под ЧУЖИМИ словами: кнопка, обещающая одно, под текстом про другое.
   * Забыть о ней здесь нельзя по устройству — двери без текста не существует.
   */
  const setRefusal = useCallback((text: string | null, door: 'picture' | null = null) => {
    putRefusal(text);
    setRefusalDoor(text ? door : null);
  }, []);
  /**
   * ФАЙЛ СЛОЯ — авторитетный SVG (`source_media_id`), когда слой им рождён (машинная перерисовка
   * или импорт). Медиа-ид и, когда полоса его ещё несёт, URL: у контракта нет чтения медиа по id
   * намеренно, поэтому файл, чей прогон уехал со первой страницы истории, остаётся без картинки
   * и об этом говорится словами, а не битым `<img>`.
   */
  const [fileMediaId, setFileMediaId] = useState(0);
  const [fileUrl, setFileUrl] = useState('');
  const [confirmExit, setConfirmExit] = useState(false);
  const [zoomPct, setZoomPct] = useState(100);
  const [panning, setPanning] = useState(false);
  const [spaceHeld, setSpaceHeld] = useState(false);
  /** Shift у пера — притяжение к 45°. Резинка обязана показывать это ДО клика, иначе притяжение
   *  видно только по факту, и человек ставит якорь наугад. */
  const [shiftHeld, setShiftHeld] = useState(false);
  /**
   * ПРАВКА УЗЛОВ УЛОЖЕННОЙ КРИВОЙ (Q-10). Владелец: «пока ты не покинул эдит подравнять кривую как
   * надо». Живёт под инструментом `select` — это Direct Selection иллюстратора, а не одиннадцатый
   * чип: выбрать линию и подвинуть её узел — одно и то же действие, разделённое только точностью
   * попадания.
   *
   * Реф рядом с состоянием по той же причине, что у пера: `pointermove` прилетает раньше рендера.
   */
  /**
   * ОБРАТНЫЙ КРОП (Q-3): расширить плиту и залить новое поле цветом.
   *
   * ⚠ РАСШИРЕНИЕ НЕ ПЕРЕЖИВАЕТ ПЕРЕОТКРЫТИЕ САМО ПО СЕБЕ, и это не недосмотр, а действующий
   * инвариант: «есть база — её форма побеждает». Расширенное соотношение уезжает в документ, но при
   * следующем открытии проигрывает натуральным пропорциям НЕИЗМЕНИВШЕЙСЯ подложки, и рисунок
   * приезжает сплющенным — молча. Поэтому расширение здесь ОДИН АКТ С МИНТОМ НОВОЙ КАРТИНКИ:
   * пока `expanded` взведён, «save the drawing only» отказывается словами, а предлагается «save as
   * a new picture» — её натуральные пропорции и станут новой истиной.
   */
  const [expanded, setExpanded] = useState(false);
  const expandedRef = useRef(false);

  /* ═══ ЛОКАЛЬНАЯ ТРАССИРОВКА ════════════════════════════════════════════════════════════════
   *
   * ⚠ ОТ ВОСЬМИ РУЧЕК ОСТАЛОСЬ ДВА ЧИСЛА (G-7). Ни режима, ни полярности, ни канала, ни порога, ни
   * допуска, ни размера сора здесь больше нет: их считает `trace-onepress.ts` по самой плите.
   * Живого предпросмотра бинаризации нет тоже — он существовал, чтобы человек ПРОВЕРИЛ свой ответ
   * про полярность до обводки, а ответа больше нет.
   *
   * ЧТО ОСТАЛОСЬ: `traceStage` — какая стадия прогона идёт (её показывает кнопка, и без неё
   * долгий прогон читался бы как зависший экран), и `traceSuggest` — допуск, который движок назвал
   * ОЦЕНКОЙ в своём отказе.
   *
   * ОТКАЗ УХОДИТ В `setRefusal` — в тот же единственный красный блок над холстом, которым
   * отказывают растр, чтение слоя и сохранение; второй красный блок в рейке был бы вторым местом,
   * где экран говорит «нет», и человек читал бы их по очереди.
   */
  const [traceStage, setTraceStage] = useState<OnePressStage | null>(null);
  const [traceSuggest, setTraceSuggest] = useState<number | null>(null);
  /**
   * ⚠ ПОВТОРНЫЙ ВХОД ЗАКРЫВАЕТ РЕФ, А НЕ `disabled` КНОПКИ. Прогон запускают ТРИ пальца — кнопка,
   * чип «trace coarser» и дверь развилки, — и последняя жмётся ДО того, как рейка вообще
   * смонтирована. Два прогона на одном растре не «немного медленнее»: каждый кладёт СВОЙ
   * `commitLines`, и одно ⌘Z сняло бы только половину линий.
   */
  const tracingRef = useRef(false);
  const [nodeEdit, setNodeEdit] = useState<EditState | null>(null);
  const nodeEditRef = useRef<EditState | null>(null);

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
  const putNodeEdit = useCallback((next: EditState | null) => {
    nodeEditRef.current = next;
    setNodeEdit(next);
  }, []);
  const putTrace = useCallback((next: [number, number][] | null) => {
    traceRef.current = next;
    setTrace(next);
  }, []);

  /**
   * ВЫДЕЛЕНИЕ ЛАССО — ОДНО ИЛИ НИ ОДНОГО (H-2), рабочее состояние визита. Дословно от владельца:
   * «не должно быть два выделения за раз если сделал выделение простой клик в одну точку снимает
   * старое и если после клика ведем курсором то уже содаем новое выделение».
   *
   * ⚠ ЗДЕСЬ БЫЛИ `sels: SelectionArea[]` + `activeSel: number | null`, И ЭТО БЫЛ ТИП, В КОТОРОМ
   * ЗАПРЕЩЁННОЕ СОСТОЯНИЕ ВЫРАЗИМО. Инвариант «областей не больше одной» пришлось бы сторожить в
   * трёх писателях (настил лассо, перо→область, ⇧⌘D), и первый же четвёртый писатель, добавленный
   * через полгода, нарушил бы его молча. Правило дома — «проба против типа»: сначала спроси,
   * нельзя ли сделать неправильное состояние НЕВЫРАЗИМЫМ. Один слот делает это одной строкой;
   * заодно умерли `findSelAt` (переключать нечего) и индексный аргумент у шести глаголов области.
   *
   * Растушёвка ОСТАЛАСЬ свойством выделения, а не инструмента (Q-круг, дословно: «возможность его
   * растушовывыть еще отдельно для всех выделений») — просто выделение теперь одно, и новое
   * приходит со своим нулём, ничего не наследуя от снятого.
   *
   * Истории отката оно не принадлежит: она типизирована списком штрихов, и ⌘Z после «удалить
   * внутри» возвращает ШТРИХИ, оставляя дорожку стоять — ровно как в фотошопе.
   */
  const [sel, setSel] = useState<SelectionArea | null>(null);
  /**
   * БУФЕР ОБМЕНА ОБЛАСТИ (Q-6). Держит ОБА материала: линии внутри дорожки и вырезанные по той же
   * маске пиксели. Прежний глагол «copy inside» умел только линии — тот же дефект, который владелец
   * нашёл у «удалить внутри»: человек обводил кусок фотографии, копировал и не получал ничего.
   *
   * Живёт в ref, а не в состоянии: содержимое буфера ничего не рисует, и перерисовка на ⌘C была бы
   * работой ради ничего. Каждая следующая вставка отступает дальше предыдущей, чтобы две вставки
   * подряд не легли одна в одну.
   */
  const clip = useRef<{
    strokes: VectorStroke[];
    cut: HTMLCanvasElement | null;
    /** Коробка вырезки В ДОЛЯХ КАДРА: пиксели и штрихи обязаны жить в одной системе координат,
     *  иначе одна рамка над ними двумя означала бы два разных места. */
    cutFrac: { x0: number; y0: number; x1: number; y1: number } | null;
    pastes: number;
  } | null>(null);
  /** Последняя СНЯТАЯ область — для ⇧⌘D. Так же, как Reselect в фотошопе. */
  const lastDropped = useRef<SelectionArea | null>(null);
  /**
   * СНЯЛО ЛИ ЧТО-НИБУДЬ ИМЕННО ЭТО НАЖАТИЕ — единственный факт, которого не хватало двум разным
   * дефектам сразу, и потому он один, а не два похожих.
   *
   * `dropSel()` пишет `lastDropped` ТОЛЬКО когда область была; иначе он возвращает `false` и
   * оставляет прежнее значение лежать. Без этой отметки: (1) Esc посреди обводки звал `reselect()`
   * безусловно и воскрешал область, снятую МИНУТЫ назад совсем другим жестом — молча пере-маскируя
   * кисть по ней; (2) отпускание звало `dropSel()` во второй раз, получало `false` и НЕ печатало
   * «area dropped — ⇧⌘D brings it back», хотя нажатие область только что снесло. Половина
   * исходного дефекта («ни отмены, ни слова») пережила починку отмены именно так.
   */
  const pressDropped = useRef(false);
  /** Курсор над холстом в режиме пера — конец резинки. Реф + зеркало, тем же приёмом, что жест. */
  const penHoverRef = useRef<[number, number] | null>(null);
  const [penHover, setPenHover] = useState<[number, number] | null>(null);
  /** Курсор над холстом под круглым нибом — центр превью-круга ластика и штампа. */
  const [nibHover, setNibHover] = useState<[number, number] | null>(null);
  /**
   * ПОДЛОЖКА ДЛЯ СРИСОВЫВАНИЯ (Q-1, Q-9) — шаблон, а не слой картинки.
   *
   * ⚠ ОНА НЕ СОХРАНЯЕТСЯ. Прямое решение владельца: подложка живёт только в редакторе, как template
   * layer в Illustrator. На сервер уходят линии и пиксели, и ничего больше — поэтому её нет ни в
   * `writeLayer`, ни в сплющивании, ни в `dirty`. Положение при этом помнится между открытиями
   * (localStorage по ключу слоя): выставить шаблон стоит минуты, и терять эту работу на каждом
   * закрытии было бы хуже, чем не иметь шаблона вовсе.
   *
   * ⚠ ЗАМОК БОЛЬШЕ НЕ ОРГАН (G-3). Хранимым битом он остался — им шаблон помнит между сессиями,
   * ставят его сейчас или по нему рисуют, — но чипа «unlocked — you place it» нет: его место занял
   * ЖЕСТ. Рамка видима ⇔ шаблон отперт; Enter или клик мимо запирают его, строка «place it» в
   * группе слоёв отпирает обратно. Владелец снёс весь ряд кнопок дословно, и замок был в этом
   * ряду.
   */
  const [backdrop, setBackdrop] = useState<Backdrop | null>(null);
  const backdropRef = useRef<Backdrop | null>(null);
  const putPenHover = useCallback((next: [number, number] | null) => {
    penHoverRef.current = next;
    setPenHover(next);
  }, []);

  /* ═══ ТРАНСФОРМ-РАМКА — ОДИН СЛОТ НА ТРЁХ ХОЗЯЕВ (G-3, G-13, G-4) ═════════════════════════
   *
   * ⚠ РАМКА ОДНА, И ЭТО НЕСУЩЕЕ РЕШЕНИЕ КРУГА. Шаблон, вставленный кусок и кадр листа — три разных
   * содержимых под ОДНИМ жестом (тянуть тело, тянуть ручку, крутить за углом, Ctrl-тянуть угол).
   * Три состояния рядом означали бы три рамки на экране одновременно и три ответа на вопрос «что
   * сейчас двигает Enter»; один слот делает это невыразимым: взять рамку кому-то второму можно
   * только поставив первую.
   *
   * `snapshot` — квад НА МОМЕНТ ОТКРЫТИЯ. Им живут Esc и ⌘Z: отмена трансформа обязана возвращать
   * не «предыдущий шаг ручки», а то положение, с которого человек начал, — ровно как в фотошопе.
   */
  const [frame, setFrame] = useState<FrameState | null>(null);
  const frameRef = useRef<FrameState | null>(null);
  /**
   * ЕДИНСТВЕННАЯ ДВЕРЬ К ГЕОМЕТРИИ РАМКИ — И ЗДЕСЬ ЖЕ СТОИТ ЛИНИЯ СХОДА.
   *
   * ⚠ СТОРОЖ ПЕРЕЕХАЛ СЮДА С МЕСТА ВЫЗОВА, И ЭТО ПОЧИНКА, А НЕ УБОРКА. Он был написан у драга
   * УЗЛА — одного жеста из пяти, — а писатель КВАДА (`move` / `scale` / `rotate` / `pin`) шёл
   * мимо. ⌘-пин угла над погнутым мешем принимался целиком: см. числа у `frameCrossesHorizon`.
   * Правило, живущее у места вызова, а не у двери, — ровно тот дефект, что уже держал релиз
   * этого файла однажды; второй копии у пина поэтому НЕ ПОЯВИЛОСЬ, появилась дверь.
   *
   * ⚠ ОТКАЗ УСЛОВЕН, И УСЛОВИЕ НЕ ЗАПАС, А ВЫХОД. Сторож стоит на ЖЕСТЕ, а записи переживают
   * бандл: прежний позволял увести узел за горизонт и клал такую сетку в localStorage (проба 18d
   * `qa-warp` сеет ровно её). Безусловный отказ означал бы, что рамка на такой записи НЕ
   * ОТКРЫВАЕТСЯ ВОВСЕ — ни подвинуть, ни распрямить, ни отменить; сторож заперся бы вместе с
   * человеком. Поэтому отказывается ровно ВВЕДЕНИЕ пересечения: было хорошо — стало плохо. Было
   * уже плохо (запись из прошлого) — рука работает, а экран держат потолок битмапа и окно
   * досягаемости образа. Прежняя пара проверяется ЛЕНИВО: только на пути отказа, то есть
   * практически никогда.
   *
   * Отказ ведёт себя как стена, а не как исчезновение: `pinQuad`/`scaleQuad` считают от
   * СТАРТОВОГО квада на каждом движении, поэтому угол идёт за рукой до последнего хорошего места
   * и там встаёт, а рука ушла — он идёт дальше.
   *
   * ⚠ ЛАЗЕЙКА ВЕДЁТ ВОН, А НЕ ГЛУБЖЕ, И ПЕРВАЯ ЕЁ РЕДАКЦИЯ ЭТОГО НЕ ДЕЛАЛА. Написанная как
   * «пропускать любой переход пересекающее→пересекающее», она пропускала и СТРОГО ХУДШИЕ. Замерено
   * на записи с квадом [[990,500],[1000,0],[1000,1000],[0,1000]]: шесть подряд положений угла от
   * x=991 до x=999.9999 приняты ВСЕ, а максимальная семплированная координата выросла
   * 50 293 → 4 616 404 580, и отпускание указателя это записывало. То есть сторож, задуманный как
   * выход, работал воронкой.
   *
   * ЧТО ТАКОЕ «ХУЖЕ» — ЧИСЛОМ, И ЧИСЛО НЕ НОВОЕ. `warpHorizonMargin` возвращает МИНИМАЛЬНЫЙ
   * делитель гомографии по той же сетке семплов, по которой `warpCrossesHorizon` отвечает да/нет
   * (`crosses ⇔ margin < HORIZON_EPS`). Хуже — значит `margin` УМЕНЬШИЛСЯ: поверхность подошла к
   * линии схода ближе, чем была. Второй меры для этого не заведено нарочно: сторож и его градиент
   * обязаны мерить одно и то же, иначе они разойдутся молча.
   *
   * ⚠ ВЕРДИКТ ВОЗВРАЩАЕТСЯ НАРУЖУ, И ЭТО НЕ УДОБСТВО. Дверь, отказывающая МОЛЧА, делает неверным
   * предположение КАЖДОГО вызывающего: `flattenWarp` писал запись и говорил «the warp was
   * flattened» в прошедшем времени по жесту, которого не случилось (замерено), и `leaveWarp` писал
   * запись той же слепой строкой. Кто persist-ит, тостит или закрывается — обязан спросить.
   */
  const putFrame = useCallback((next: FrameState | null): boolean => {
    if (next && frameCrossesHorizon(next)) {
      /**
       * ⚠ ОПОРА СРАВНЕНИЯ — СОСТОЯНИЕ НА НАЧАЛО ЖЕСТА, А НЕ ПОСЛЕДНЯЯ ПРИНЯТАЯ РАМКА, И ЭТА
       * РАЗНИЦА — ВСЯ ПОЧИНКА. Пока опорой была `frameRef.current`, принятый запас становился
       * БЕГУЩИМ МАКСИМУМОМ: `homographyFromQuad` собирает `g`/`h` из РАЗНОСТЕЙ координат, поэтому
       * сдвиг, поворот и масштаб ПЕРЕ-ОКРУГЛЯЮТ их, и запас гуляет на ±1 ulp вокруг истинного.
       * Один удачный семпл «+1 ulp» защёлкивал опору наверху — и дальше каждое положение с
       * ИСТИННЫМ запасом читалось как «хуже» и отвергалось. Замерено на квадe из комментария выше
       * (запас −0.49): из 400 положений тела отвергнуто 374, из 360 поворотов — 342, из 300
       * масштабов — 217, максимальная непрерывная серия отказов 127 событий подряд. Обещание
       * «рука работает» ниже было неправдой: шаблон переставал следовать за указателем совсем.
       *
       * Защёлка на НАЧАЛО ЖЕСТА снимает храповик ПО ПОСТРОЕНИЮ и не требует второго порога рядом
       * с `HORIZON_EPS`: опора неподвижна, пока рука не отпущена, поэтому дрожание последнего бита
       * больше ни на что не влияет. Ровно тем же и по той же причине живут `pinQuad`/`scaleQuad` —
       * они тоже считают от `startQuad`, чтобы отказ был стеной, а не исчезновением.
       */
      const drag = frameDrag.current;
      const prev: FrameState | null = drag
        ? { ...next, quad: drag.startQuad, grid: drag.startGrid }
        : frameRef.current;
      if (prev) {
        // Было хорошо — стало плохо: это ВВЕДЕНИЕ пересечения, и оно запрещено.
        if (!frameCrossesHorizon(prev)) return false;
        /* Было плохо — стало ХУЖЕ: запрещено тоже. Лазейка существует, чтобы ВЫЙТИ из плохой
           записи, а не чтобы уходить в неё глубже.

           ⚠ СРАВНЕНИЕ БЕЗ ДОПУСКА — ЭТО ИЗМЕРЕНО И ОТКЛОНЕНО, А НЕ ЗАБЫТО. Допуск здесь
           напрашивается, и вот почему его нет.

           ЦЕНА ЕГО ОТСУТСТВИЯ ЧЕСТНО НАЗВАНА: после починки на пересекающей записи (запас −0.49)
           отвергается 88 положений тела из 400, 128 поворотов из 360 и 123 масштаба из 300.
           Все они — АРИФМЕТИЧЕСКИЙ ШУМ, а не геометрия: сдвиг, поворот и масштаб — АФФИННЫЕ
           преобразования, а умножение слева на аффинную матрицу не трогает нижнюю строку
           `[g h 1]` ВООБЩЕ. Истинный запас вдоль такого жеста ПОСТОЯНЕН, и вся дельта —
           след пере-округления `homographyFromQuad`, который собирает `g`/`h` из РАЗНОСТЕЙ
           координат. Полоса шума замерена и узка: ±4 ulp запаса на сдвиге, ±8 на повороте,
           ±12 на масштабе.

           И ИМЕННО ПОЭТОМУ ДОПУСК НЕВОЗМОЖЕН. Храповик (опора = последняя принятая рамка) —
           это ТОТ ЖЕ САМЫЙ шум, усиленный: опора защёлкивается на `+max` полосы, а худший
           семпл сидит на `−max`, поэтому зазор храповика РОВНО ВДВОЕ шире полосы — 8, 16 и
           24 ulp против 4, 8 и 12. Симуляция обеих политик на одном ряду квадов: допуск ниже
           полосы (1–2 ulp) не снимает НИ ОДНОГО отказа, а допуск на полосе и выше (4, 8, 12)
           обнуляет отказы у починки и одновременно роняет серию храповика до 1, 3 и 16 — под
           порог 20, которым его ловит проба 21. Окно, где допуск снимает шум и сохраняет
           сторожа, — это [4,4), [8,8), [12,12): оно ПУСТО. Число, снимающее дрожание, гасит
           единственный признак, отличающий дефект от починки.

           Поэтому отказ остаётся стеной без допуска. Серия отказов ограничена ПО ПОСТРОЕНИЮ,
           а не удачей: опора неподвижна на весь жест, поэтому стойка длится 3–7 кадров
           (в пробе 5 — там ещё округление пикселей) и не растёт, тогда как у храповика она
           доходила до 355. Стойка на несколько кадров у записи, которая УЖЕ пересекает линию
           схода, — это приемлемо; сторож, ослабленный подобранным числом, — нет. */
        if (frameHorizonMargin(next) < frameHorizonMargin(prev)) return false;
      }
    }
    frameRef.current = next;
    setFrame(next);
    return true;
  }, []);
  /** Жест рамки. В рефе по той же причине, что перо: `pointermove` прилетает раньше рендера. */
  const frameDrag = useRef<FrameDrag | null>(null);
  /**
   * ЧТО СЕЙЧАС ПОД УКАЗАТЕЛЕМ. Состояние, а не реф: от него зависит и подсветка ручки, и значок
   * поворота, и курсор — то есть картинка. Пишется ТОЛЬКО при смене рода попадания, иначе каждое
   * движение мыши над рамкой перерисовывало бы весь редактор.
   */
  const [frameHover, setFrameHover] = useState<FrameHit>(null);
  /** Живой жест заплатки: откуда потащили область. */
  const patchDrag = useRef<{ id: number; from: [number, number] } | null>(null);
  /**
   * КУДА ТАЩАТ, В ДОЛЯХ КАДРА. Дорожка области при этом СТОИТ НА МЕСТЕ — она и есть то, что будет
   * перестроено, — а призрак-копия показывает, ОТКУДА берутся пиксели. Без него человек видел бы,
   * как содержимое области меняется, и не понимал бы, чем он управляет.
   */
  const [patchOffset, setPatchOffset] = useState<[number, number] | null>(null);
  /** Цвет нового поля у кроп-рамки; `null` — прозрачно (законное состояние, а не «не выбрано»). */
  const [cropFill, setCropFill] = useState<ExpandFill>(DEFAULT_EXPAND_FILL);
  /**
   * ЗАПЕРТОЕ ОТНОШЕНИЕ СТОРОН КАДРА (E-18); `null` — свободная рамка, и это НЕ «не выбрано», а
   * законный, притом умолчальный, режим фотошопного кропа.
   *
   * ЖИВЁТ ДОЛЬШЕ РАМКИ И ДОЛЬШЕ ИНСТРУМЕНТА — как всякая настройка кисти в этой рейке: человек,
   * кадрирующий десяток картинок в 4:5, называет форму один раз, а не на каждой.
   */
  const [cropRatio, setCropRatio] = useState<number | null>(null);

  /* ═══ ЛИНЕЙКИ И НАПРАВЛЯЮЩИЕ (E-17) ══════════════════════════════════════════════════════
   *
   * ⚠ ОДИН ВЫКЛЮЧАТЕЛЬ НА ЛИНЕЙКИ И НА НАПРАВЛЯЮЩИЕ, А НЕ ДВА. У фотошопа их два (⌘R и ⌘;), и
   * там это оправдано: направляющие живут в документе и переживают закрытие линеек. Здесь второй
   * выключатель означал бы состояние «направляющие есть, но взяться за них нечем» — линейка ведь
   * и есть место, откуда их берут и куда возвращают. Одно понятие — один орган.
   */
  const [rulersOn, setRulersOn] = useState(false);
  const [guides, setGuides] = useState<Guide[]>([]);
  /**
   * ⚠ РЕФ РЯДОМ С СОСТОЯНИЕМ — ТОТ ЖЕ ЗАМЕРЕННЫЙ ДЕФЕКТ, что у следа и у пера: `pointermove`
   * прилетает раньше, чем React перерисует после `pointerdown`, и чтение `guides` из замыкания
   * во время протяжки видело бы позапрошлый набор — вытащенная направляющая теряла бы саму себя
   * на первом же кадре. Писатель один: `putGuides`.
   */
  const guidesRef = useRef<Guide[]>([]);
  /** Что сейчас тащат: индекс живой направляющей либо `-1` для только что вытянутой из линейки. */
  const guideDrag = useRef<{ id: number; index: number; dir: 'h' | 'v' } | null>(null);
  const bdKeyRef = useRef('');
  /** Ключ, по которому разметку читали в прошлый раз, — им опознаётся переезд после сохранения. */
  const guideKeyRef = useRef('');

  /**
   * ЕДИНСТВЕННЫЙ ПИСАТЕЛЬ РАЗМЕТКИ: реф, экран и память меняются вместе.
   *
   * `persist` — про ПАМЯТЬ, а не про экран: кадры протяжки идут сюда десятками в секунду, и
   * писать хранилище на каждый было бы синхронной записью в `localStorage` под рукой. Запись
   * ставится на отпускании; отложенная (`saveGuidesSoon`) она и там, потому что отпусканий подряд
   * тоже бывает много.
   */
  const writeGuides = useCallback((next: Guide[], persist: boolean) => {
    guidesRef.current = next;
    setGuides(next);
    if (persist) saveGuidesSoon(bdKeyRef.current, next);
  }, []);
  /**
   * ОТМЕНА РАМКИ, ЧИТАЕМАЯ ИЗ ОБРАБОТЧИКА НА ОКНЕ.
   *
   * ⌘Z висит на `window` в эффекте, чей список зависимостей намеренно короток — иначе слушатель
   * пересоздавался бы на каждый рендер редактора. Замыкание там ЗАМОРОЖЕНО на кадре, в котором
   * эффект последний раз сработал, а отмена рамки пишет подложку по ключу слоя, который после
   * первого сохранения МЕНЯЕТСЯ. Ссылка отвечает про сейчас — тот же приём, что у `frozenRef`.
   */
  const cancelFrameRef = useRef<() => void>(() => {});
  /** Постановка рамки, читаемая из обработчика на окне, — тот же приём и по той же причине. */
  const commitFrameRef = useRef<() => void>(() => {});
  /** Открытие рамки шаблона, читаемое из эффекта восстановления — тот же приём, что у отмены. */
  const openBackdropFrameRef = useRef<(b: Backdrop) => void>(() => {});
  /** Холст превью вставки. Байты в него кладёт эффект — рендер JSX холсты не красит. */
  const floatCanvasRef = useRef<HTMLCanvasElement | null>(null);

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
  const contentOff = useRef<(() => void) | null>(null);
  /**
   * ЩИПОК НА ХРОМЕ РЕДАКТОРА НЕ ЗУМИТ САМО ОКНО (круг 15, J-38).
   *
   * Владелец: «когда мы случайно делаем пинч не на холсте, а на верхней и боковой панелях, само
   * окно не должно в принципе приближаться». Замерено: единственный слушатель колеса висел на
   * ВЬЮПОРТЕ, и над рейкой и над шапкой ctrl+wheel — так Chromium отдаёт щипок трекпада —
   * доходил до документа с `defaultPrevented === false`: две поверхности из трёх.
   *
   * ⚠ CALLBACK-РЕФ, А НЕ ЭФФЕКТ, И ЭТО ТОТ ЖЕ УРОК, ЧТО У `attachViewport`. Содержимое диалога
   * живёт в ПОРТАЛЕ Radix и монтируется коммитом позже: эффект, читающий `contentRef.current`
   * в свой единственный прогон, застаёт `null` — ровно так уже дважды молча не вешался слушатель
   * колеса на холсте.
   *
   * ⚠ ОБЫЧНЫЙ СКРОЛЛ РЕЙКИ ЖИВЁТ. Отнимать `wheel` целиком означало бы, что рейка перестала
   * прокручиваться, — и игла «prevent всё» зеленела бы на пробе, доказывающей ровно обратное
   * тому, что нужно. Поэтому условие на `ctrlKey || metaKey`, а контроль пробы — что рейка
   * ПРОКРУТИЛАСЬ на обычном колесе.
   *
   * ⚠ SAFARI ЩИПОК ШЛЁТ НЕ КОЛЕСОМ, а `gesturestart/gesturechange/gestureend`, которых не слушал
   * никто. Headless Chromium их не воспроизводит вовсе — это честно ЗАМЕРИТЬ здесь нельзя, и
   * живой смоук на маке владельца остаётся обязательным.
   */
  const attachContent = useCallback((node: HTMLDivElement | null) => {
    contentRef.current = node;
    contentOff.current?.();
    contentOff.current = null;
    if (!node) return;
    const onWheel = (e: WheelEvent) => {
      if (e.ctrlKey || e.metaKey) e.preventDefault();
    };
    const onGesture = (e: Event) => e.preventDefault();
    node.addEventListener('wheel', onWheel, { passive: false });
    node.addEventListener('gesturestart', onGesture as EventListener);
    node.addEventListener('gesturechange', onGesture as EventListener);
    node.addEventListener('gestureend', onGesture as EventListener);
    contentOff.current = () => {
      node.removeEventListener('wheel', onWheel);
      node.removeEventListener('gesturestart', onGesture as EventListener);
      node.removeEventListener('gesturechange', onGesture as EventListener);
      node.removeEventListener('gestureend', onGesture as EventListener);
    };
  }, []);

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
    if (live) stageScratch(layer, maskRef.current, live.mode);
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

  const plateH = PLATE_W / (ratio || DEFAULT_RATIO);
  const zoomK = zoomPct / 100 || 1;
  const plateRect = useMemo(() => ({ w: PLATE_W, h: plateH }), [plateH]);
  /** Ключ памяти положения подложки. До первого сохранения `layer.id` = 0 — перенос записи ниже. */
  const bdKey = useMemo(
    () => backdropScopeKey({ techCardId, baseMediaId, layerId: layer.id }),
    [techCardId, baseMediaId, layer.id],
  );
  bdKeyRef.current = bdKey;
  /**
   * ОДИН ПИСАТЕЛЬ ПОДЛОЖКИ. Реф и состояние меняются вместе: `pointermove` прилетает раньше
   * рендера, и чтение состояния во время протяжки давало бы позапрошлое положение — шаблон полз бы
   * за рукой с отставанием на кадр.
   */
  /**
   * ⚠ ПЛАТА ЧИТАЕТСЯ РЕФОМ, А НЕ ЗАВИСИМОСТЬЮ. Её высота меняется, пока грузится подложка (форма
   * приходит из натуральных пропорций картинки), а восстановление шаблона — асинхронная проба
   * файла. Плата в зависимостях означала бы, что каждая такая смена ОТМЕНЯЕТ пробу на полпути, и
   * шаблон не появлялся никогда: замерено пробой, три красных подряд на верном коде.
   */
  const plateRef = useRef(plateRect);
  plateRef.current = plateRect;

  const putBackdrop = useCallback(
    (next: Backdrop | null, remember = true) => {
      backdropRef.current = next;
      setBackdrop(next);
      if (!remember) return;
      if (next) saveBackdropSoon(bdKey, next);
      else forgetBackdrop(bdKey);
    },
    [bdKey],
  );

  /**
   * Seed on opening — and forget everything on the way out, so reopening over another plate cannot
   * inherit the previous plate's strokes or a rev that belongs to somebody else's layer.
   */
  useEffect(() => {
    if (!open) {
      seeded.current = false;
      /* ⚠ ПРИЗНАК «ПРО ПОЛ УЖЕ СКАЗАНО» ГАСИТСЯ НА ЗАКРЫТИИ, А НЕ НИЖЕ ПО ТЕЛУ СИДА. Ниже —
         значит после РАННЕГО ВЫХОДА (`knownId > 0 && !loaded`), которого на повторном входе не
         миновать: «один раз за визит» превращалось в «один раз на два визита». Закрытие
         наступает всегда и ровно один раз. */
      cropFloorSaid.current = false;
      return;
    }
    if (seeded.current) return;
    // A layer the band knows about is not seeded until its strokes arrive; a layer that does not
    // exist yet is seeded immediately, because there is nothing to wait for.
    if (knownId > 0 && !loaded) return;
    seeded.current = true;

    const doc = readLayer(decodeStrokesWire(loaded?.strokes), wireRatio);
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
    // Расширенную плату НЕ перебиваем формой базы: она и есть то, что человек только что сделал.
    if (!expandedRef.current) setRatio(baseMediaId > 0 ? wireRatio : doc.ratio);
    setUnreadable(doc.unreadable);
    setSelected(null);
    /* В РЕЖИМЕ КАРТЫ РУКА НАЧИНАЕТ С ВЕДРА — это первое слово владельца («заливкой и брашем») и
       единственный инструмент, которым красят деталь целиком одним нажатием. */
    setTool(colourMode ? 'fill' : 'line');
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
    /* ⚠ НА КАРТЕ ЖЁСТКОСТЬ И НЕПРОЗРАЧНОСТЬ ЗАПЕРТЫ НА 100, И ЭТО НЕ ВКУС. Мягкий край и
       полупрозрачность дают ПРОМЕЖУТОЧНЫЕ пиксели, которых скан не досчитается точным
       равенством: залитая на 60% деталь ушла бы из палитры целиком, и человек увидел бы «я
       красил, а его нет». Органы этих двух чисел в режиме карты не рисуются вовсе — тогда и
       нечем разойтись. */
    setHardness(colourMode ? 100 : 80);
    setOpacity(100);
    /* ЗАПИСАННЫЕ ЧЕРНИЛА — СОСТОЯНИЕ ВИЗИТА, засеянное палитрой прошлой покраски. Пережив
       открытие над ДРУГИМ видом, вчерашний цвет объявил бы меткой то, чего на этой карте нет. */
    usedInksRef.current = (seedInks ?? []).map(planHex).filter(isMapInk);
    setUsedInks(usedInksRef.current);
    setPicking(false);
    setStampSrc(null);
    stampOffset.current = null;
    // Точка отрыва — свойство ВИЗИТА: пережив открытие над другой платой, она провела бы прямую
    // от места, которого на этом листе нет.
    lastMark.current = null;
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
    setSel(null);
    /* СНЯТАЯ ОБЛАСТЬ — СВОЙСТВО ВИЗИТА, как и `lastMark` строкой выше. Пережив открытие другой
       платы, она вернулась бы по ⇧⌘D в единицах ЧУЖОЙ высоты. */
    lastDropped.current = null;
    pressDropped.current = false;
    /* Опора сравнения запасов — тоже свойство визита. Дожив до другой платы, она сравнивала бы
       новый кадр с квадом ЧУЖОЙ записи. */
    frameDrag.current = null;
    setRefusal(null);
    /**
     * ОЦЕНКА ДОПУСКА ПРИНАДЛЕЖИТ ВИЗИТУ, А НЕ СЛОЮ: это число ТОГО отказа о ТЕХ пикселях, и,
     * дожив до следующего открытия над другой платой, чип «trace coarser» предлагал бы загрубить
     * прогон, которого не было.
     */
    setTraceStage(null);
    setTraceSuggest(null);
    tracingRef.current = false;
    setConfirmExit(false);
    seededJson.current = JSON.stringify(doc.strokes);
    userMoved.current = false;
    resetHistory();
    // `baseSrc` и `disabled` ушли из зависимостей вместе с развилкой входа (H-1): читала их
    // только она. Оставленные, они пересеивали бы визит на каждое прибытие подложки.
  }, [open, knownId, knownRev, known, band, baseMediaId, loaded, wireRatio, resetHistory, colourMode, seedInks]);

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

  /**
   * ЗЕМЛЯ ПОД РАСТРОМ ВИДНА РОВНО ТОГДА, КОГДА ЕСТЬ ЧЕМУ БЫТЬ ПРОЗРАЧНЫМ. Условие названо, а не
   * вписано в разметку, по двум причинам: его читают два соседних узла (шахматка и сам холст), и
   * мутационный прогон обязан уметь сломать ИМЕННО ЕГО, не задев холст.
   */
  const showChecker = rasterReady && rasterOn && !!rasterRef.current;

  // ── вид: применение, вписывание, зум ───────────────────────────────────────────────────────

  /**
   * ГДЕ УКАЗАТЕЛЬ СТОИТ СЕЙЧАС, В КООРДИНАТАХ ОКНА (круг 15, J-36, дефект 2).
   *
   * Превью инструмента (круг ниба, резинка пера, попадание в рамку) считалось ОДИН РАЗ — на
   * `pointermove` — и с тех пор жило в координатах МИРА. Панорама колесом, зум щипком, кнопками
   * и клавишами, отступ вида после кропа и вписывание двигают мир ПОД НЕПОДВИЖНЫМ УКАЗАТЕЛЕМ:
   * событий указателя при этом нет ни одного, и круг оставался на старом месте мира, а нажатие
   * брало точку под указателем. Замерено: `wheel(60,40)` без движения мыши — круг уезжает на
   * (−120,−80) px, отпечаток ложится под указатель; расхождение 229×153 юнита платы. Это и есть
   * «вижу превью кисти на ховер полотна, но оттиск появляется не там, где было превью».
   *
   * Ссылка гасится уходом курсора: превью, пересчитанное для указателя за пределами холста, было
   * бы кругом, висящим на кромке, — ровно тем, ради чего `onPointerLeave` его и снимает.
   */
  const lastClient = useRef<{ x: number; y: number } | null>(null);
  /**
   * ⚠ ПЕРЕСЧЁТ ЗОВЁТСЯ ССЫЛКОЙ, А НЕ ПРЯМО. `applyView` объявлен раньше всего, что читает
   * инструмент в руке и форму платы, и обязан остаться `useCallback([])` — он висит на узле через
   * `applyViewRef` и в `ResizeObserver`. Ссылка на живое замыкание — единственный способ дать ему
   * СЕГОДНЯШНИЙ пересчёт, не потащив в его зависимости половину экрана.
   */
  const refreshHoverRef = useRef<() => void>(() => {});
  /** Перерисовка делений линеек — ссылкой, по тому же доводу, что у `refreshHoverRef`. */
  const drawRulersRef = useRef<() => void>(() => {});

  const applyView = useCallback(() => {
    const world = worldRef.current;
    if (!world) return;
    const { pan, zoom } = viewRef.current;
    world.style.transform = `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`;
    setZoomPct(Math.round(zoom * 100));
    /* ОДНА ДВЕРЬ: всякий писатель вида уже проходит здесь, поэтому и превью пересчитывается
       здесь — иначе следующий способ подвинуть мир снова забыли бы. */
    refreshHoverRef.current();
    /* ⚠ ЛИНЕЙКИ ПЕРЕРИСОВЫВАЮТСЯ ЗДЕСЬ ЖЕ, И ЭТО ЕДИНСТВЕННОЕ ВЕРНОЕ МЕСТО. Мир двигается
       ИМПЕРАТИВНО — трансформом узла, без рендера React, — а деления линейки суть проекция мира
       на кромку экрана. Рисуй их из состояния, и они отставали бы на всю панораму колесом: линейка
       показывала бы координаты того места, где холст был до прокрутки. Та же дверь, тот же довод,
       что у `refreshHover` строкой выше. */
    drawRulersRef.current();
  }, []);

  const fitPlate = useCallback(() => {
    const vp = viewportRef.current;
    if (!vp) return;
    const r = viewportRect(vp);
    if (r.width < 2 || r.height < 2) return;
    viewRef.current = fitView(
      { x: 0, y: 0, w: PLATE_W, h: PLATE_W / (ratio || DEFAULT_RATIO) },
      { w: r.width, h: r.height },
    );
    applyView();
  }, [ratio, applyView]);

  /**
   * ВПИСЫВАНИЕ ВЕШАЕТСЯ НА САМ УЗЕЛ, А НЕ НА ЭФФЕКТ, И ЭТО ЗАМЕРЕНО.
   *
   * Раньше вписывание висело на `entered`: развилка входа занимала первый кадр, а холст
   * появлялся на СЛЕДУЮЩЕМ — и эффект, перезапущенный сменой `entered`, заставал вьюпорт уже
   * измеренным. Это была случайная подпорка. Со снятием развилки (H-1) единственный прогон
   * эффекта уехал на самый первый коммит модалки, а её содержимое живёт в ПОРТАЛЕ Radix и
   * монтируется коммитом позже: `viewportRef.current` там ещё `null`, повода перезапуститься у
   * эффекта больше нет, и редактор открывался в 100 % с платой вдвое больше экрана.
   * Замерено инструментом: `{open: true, vp: false}` — ровно один прогон, и тот вхолостую.
   *
   * Callback-реф отвечает на вопрос «когда узел появился» ТОЧНО, каким бы коммитом это ни
   * случилось, а `ResizeObserver` на нём чинит заодно вторую дыру того же рода — смену размера
   * окна при нетронутом виде. `fitPlate` читается рефом, чтобы смена формы платы не
   * переприцепляла наблюдателя.
   */
  const fitPlateRef = useRef(fitPlate);
  fitPlateRef.current = fitPlate;
  const applyViewRef = useRef(applyView);
  applyViewRef.current = applyView;
  const viewportRO = useRef<ResizeObserver | null>(null);
  const viewportOff = useRef<(() => void) | null>(null);
  /**
   * ВСЁ, ЧТО ВЕШАЕТСЯ НА УЗЕЛ ВЬЮПОРТА, ВЕШАЕТСЯ ЗДЕСЬ — И ЭТО ПРАВИЛО, А НЕ УДОБСТВО.
   *
   * ⚠ ОДИН И ТОТ ЖЕ ДЕФЕКТ СЛУЧИЛСЯ ДВАЖДЫ, ПОТОМУ ЧТО ОРГАНОВ БЫЛО ДВА. Эффект, читающий
   * `viewportRef.current` в момент своего прогона, застаёт `null`: содержимое модалки живёт в
   * ПОРТАЛЕ Radix и монтируется коммитом позже. Пока такие эффекты зависели от `entered`, смена
   * флага давала им второй прогон — случайная подпорка. Снятие развилки (H-1) убрало её разом у
   * ОБОИХ: вписывание молча не отрабатывало, и слушатель `wheel` молча не вешался, отчего
   * панорама скроллом и зум щипком умерли, а подпись под холстом продолжала их обещать.
   * Вписывание я починил, колесо — не заметил, потому что колесо не крутила НИ ОДНА проба из ста
   * с лишним (`grep -l 'mouse.wheel\|WheelEvent' tmp/dsgprobe/*.mjs` — пусто).
   *
   * Callback-реф отвечает на вопрос «когда узел появился» точно, каким бы коммитом это ни
   * случилось. Держать здесь ОБА подписчика — единственный способ не наступить в третий раз:
   * добавить эффект, читающий вьюпорт по монтированию, теперь просто некуда.
   */
  const attachViewport = useCallback((node: HTMLDivElement | null) => {
    viewportRef.current = node;
    viewportRO.current?.disconnect();
    viewportRO.current = null;
    viewportOff.current?.();
    viewportOff.current = null;
    if (!node) return;

    /**
     * ⚠ ВИД ПРИМЕНЯЕТСЯ ВСЕГДА; НА «ЧЕЛОВЕК ТРОНУЛ САМ» ГЕЙТИТСЯ ТОЛЬКО ВПИСЫВАНИЕ.
     *
     * Прежде здесь стоял ранний выход по `userMoved` ДО применения — и это разводило две
     * половины одного утверждения: числа вида (`viewRef`) и `transform` узла мира. На повторном
     * входе узел мира монтируется заново и приезжает БЕЗ трансформа, а `userMoved` к тому
     * моменту ещё взведён: сид визита гасит его, но сам выходит рано, пока читается слой
     * (`knownId > 0 && !loaded`), а `gcTime: 0` у этого чтения делает «рано» неизбежным для
     * любого, кто закрыл и открыл окно не мгновенно.
     *
     * ЦЕНА БЫЛА НЕ КОСМЕТИЧЕСКОЙ. Плата рисовалась в 1:1 поверх вьюпорта, показатель зума при
     * этом честно говорил 91 %, а `toWorld` продолжал делить на ПРОШЛЫЙ зум и вычитать ПРОШЛУЮ
     * панораму: линия, проведённая рукой через видимую плату, уезжала в документ на пятую часть
     * листа мимо. Замерено: рука [[0.25,0.306],[0.75,0.306]] → запись [[0.150,0.500],[0.702,0.500]].
     * Молча, и обнаружилось бы на бумаге.
     */
    const ro = new ResizeObserver(() => {
      // Человек, тронувший вид сам, распоряжается им дальше один: мир из-под руки не вырывают.
      // Но НАРИСОВАТЬ то, что уже описано числами, надо в любом случае.
      if (userMoved.current) applyViewRef.current();
      else fitPlateRef.current();
    });
    ro.observe(node);
    viewportRO.current = ro;
    // Узел появился — на нём немедленно оказывается тот вид, который числа уже описывают.
    applyViewRef.current();

    /**
     * Колесо: скролл — панорама, щипок (ctrlKey у трекпада) и ⌘ — зум вокруг курсора.
     * НАТИВНЫЙ слушатель, потому что React вешает wheel пассивным и `preventDefault` оттуда мёртв
     * — страница под редактором уезжала бы вместе с миром.
     */
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      if (e.ctrlKey || e.metaKey) {
        const r = viewportRect(node);
        viewRef.current = zoomAt(
          viewRef.current,
          Math.exp(-e.deltaY * 0.0022),
          e.clientX - r.left,
          e.clientY - r.top,
          EDITOR_ZOOM_MAX,
        );
      } else {
        const { pan, zoom } = viewRef.current;
        viewRef.current = { zoom, pan: { x: pan.x - e.deltaX, y: pan.y - e.deltaY } };
      }
      userMoved.current = true;
      applyViewRef.current();
    };
    node.addEventListener('wheel', onWheel, { passive: false });
    viewportOff.current = () => node.removeEventListener('wheel', onWheel);
  }, []);

  /** Смена ФОРМЫ платы (натуральные пропорции подложки, кроп) — второй повод вписать заново. */
  useLayoutEffect(() => {
    if (!open || !viewportRef.current) return;
    if (userMoved.current) return;
    fitPlate();
  }, [open, ratio, fitPlate]);

  const zoomBy = useCallback(
    (factor: number) => {
      const vp = viewportRef.current;
      if (!vp) return;
      const r = viewportRect(vp);
      viewRef.current = zoomAt(
        viewRef.current,
        factor,
        r.width / 2,
        r.height / 2,
        EDITOR_ZOOM_MAX,
      );
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
      /* ⚠ И `frameDrag` ТОЖЕ — он опора сравнения запасов у `putFrame`, а не просто состояние
         мыши. Гасился он ровно в двух местах (`closeFrame` и pointerup), и ни одно не покрывает
         потерю фокуса с отпусканием снаружи окна. Пережив жест, он подсовывал бы `putFrame`
         СТАРЫЙ стартовый квад: улучшил запас −0.49 → −0.40 рукой, потерял фокус, нажал
         «flatten» — и ход до −0.45 принимается, хотя он ХУЖЕ текущего кадра. Асимметрия «сосед
         гасится, этот нет» и была единственным следом. */
      frameDrag.current = null;
    };
    window.addEventListener('blur', onBlur);
    return () => window.removeEventListener('blur', onBlur);
  }, [open]);

  /** Точка события в долях кадра — через мир (`toWorld` делит на зум), а не через DOM-прямоугольник. */
  const frameAt = (e: { clientX: number; clientY: number }): [number, number] => {
    const vp = viewportRef.current;
    if (!vp) return [0, 0];
    const w = toWorld(e.clientX, e.clientY, viewportRect(vp), viewRef.current);
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
    const w = toWorld(e.clientX, e.clientY, viewportRect(vp), viewRef.current);
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
  /**
   * ЕДИНСТВЕННЫЙ ПИСАТЕЛЬ ДОКУМЕНТА ИЗ ПРАВКИ УЗЛОВ. Всё, что меняет форму, проходит здесь и нигде
   * больше: два писателя означали бы два разных представления о том, что сейчас в документе.
   */
  /**
   * ⚠ «РАСШИРИТЬ ЛИСТ» СНЯТО КАК ОТДЕЛЬНЫЙ ГЛАГОЛ (G-4). Множитель, девять якорей и кнопка
   * «expand the sheet» просили человека посчитать в уме то, что рамка кадра показывает: расти лист
   * теперь одним жестом с обрезкой — см. `applyCropFrame`. Сама машинерия пересчёта
   * (`planFrame` → `expandStrokes` / `expandRasterLayer`) переиспользована целиком, ни одной новой
   * арифметики к ней не добавлено.
   */
  const commitNodes = useCallback(
    (st: EditState) => {
      const res = editCommit(strokesRef.current, st);
      if (!res) {
        putNodeEdit(st);
        return;
      }
      commitLines(res.strokes);
      putNodeEdit(res.st);
    },
    [commitLines, putNodeEdit],
  );

  const applyUndoResult = useCallback(
    (res: NonNullable<UndoResult>) => {
      /**
       * СМЕНА ЛИСТА ОТМЕНЯЕТСЯ ЦЕЛИКОМ, ОДНИМ КАДРОМ (круг 15, J-34).
       *
       * Холст, штрихи и форма платы меняются ВМЕСТЕ: подставь их по одному, и между двумя
       * присваиваниями существовал бы кадр, в котором штрихи считаны в долях нового листа, а
       * холст ещё старый, — то есть ровно та рассинхронизация, из-за которой круг G-4 ленту и
       * сносил. Всё, что держало координаты старого листа (маска, область, точка отрыва, живой
       * жест), здесь же и гасится.
       *
       * ⚠ `expanded` СТАНОВИТСЯ ПРОИЗВОДНЫМ ОТ ФОРМЫ, А НЕ ОТ ФАКТА КРОПА. Флаг запирает «save the
       * drawing only», и если бы он оставался взведённым после отмены, человек, вернувший лист к
       * подложке, остался бы заперт в «save as a new picture» навсегда — за жест, который он уже
       * отменил.
       */
      if (res.kind === 'sheet') {
        rasterRef.current = res.layer;
        strokesRef.current = res.strokes;
        setStrokes(res.strokes);
        setRatio(res.ratio);
        setRasterReady(!!res.layer);
        maskRef.current = null;
        liveRef.current = null;
        setSel(null);
        lastDropped.current = null;
        pressDropped.current = false;
        lastMark.current = null;
        setNibHover(null);
        putTrace(null);
        putPen(null);
        putPenHover(null);
        putNodeEdit(null);
        setStampSrc(null);
        stampOffset.current = null;
        expandedRef.current = res.expanded;
        setExpanded(res.expanded);
        rasterDirtyRef.current = true;
        setRasterDirty(true);
        paintView();
        /* Вписывание — ссылкой: `fitPlate` читает форму платы из состояния, а `setRatio` выше в
           этом же кадре ещё не перерисовал его. Перевписывание по новой форме доделает
           `useLayoutEffect` на `ratio` — тот же порядок, каким живёт сам кроп. */
        fitPlateRef.current();
        return;
      }
      if (res.kind === 'lines' || res.kind === 'both') {
        strokesRef.current = res.strokes;
        setStrokes(res.strokes);
      }
      if (res.kind === 'pixels' || res.kind === 'both') {
        paintView();
        rasterDirtyRef.current = true;
        setRasterDirty(true);
      }
      // ПРАВКА УЗЛОВ ПЕРЕСОБИРАЕТСЯ ПО НОВОМУ ДОКУМЕНТУ. Без этого она держала бы узлы штриха,
      // которого после отмены уже нет, и следующий сдвиг записал бы их обратно.
      if (res.kind === 'lines' || res.kind === 'both') {
        putNodeEdit(nodeEditRef.current ? editResync(res.strokes, nodeEditRef.current) : null);
      }
    },
    [paintView, putNodeEdit],
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

  /**
   * ВОССТАНОВИТЬ ПОДЛОЖКУ ПРИ ОТКРЫТИИ — И ТОЛЬКО ПОСЛЕ ТОГО, КАК ФАЙЛ ОТВЕТИЛ.
   *
   * Рисовать её до пробы нельзя: медиа могли удалить из библиотеки, и битая картинка на плате
   * читалась бы как «редактор сломался». Пропавшая говорит об этом словами и снимается — иначе
   * следующее открытие показывало бы то же сообщение навсегда.
   *
   * Проба заодно возвращает НАСТОЯЩИЕ натуральные размеры: запись помнит те, что были при
   * постановке, а картинку могли перезалить.
   */
  useEffect(() => {
    if (!open) return;
    let alive = true;
    const stored = readBackdrop(bdKey);
    if (!stored) return;
    void probeBackdrop(stored.src).then((probe) => {
      if (!alive) return;
      if (!probe.ok) {
        forgetBackdrop(bdKey);
        showMessage(BACKDROP_GONE_TEXT, 'error');
        return;
      }
      // Без записи: это ЧТЕНИЕ, а не правка, и трогать хранимое здесь нечем.
      const back = reconcileBackdrop(stored, probe, plateRef.current);
      putBackdrop(back, false);
      /**
       * ⚠ РАМКА ВИДИМА ⇔ ШАБЛОН ОТПЕРТ, И ЭТО ОДНО ПРАВИЛО, А НЕ ДВА СОСТОЯНИЯ РЯДОМ.
       *
       * Бит замка переживает сессию: человек, ушедший на середине постановки, возвращается ровно
       * туда, где остановился. Не открыть здесь рамку значило бы восстановить «отпертый» шаблон,
       * который ничем не отпёрт — он не ловит руку и не двигается, а строка рейки при этом
       * показывает «place it», то есть предлагает взять то, что якобы уже в руке.
       */
      if (!back.locked) openBackdropFrameRef.current(back);
    });
    return () => {
      alive = false;
    };
    // Ключ меняется, когда слой получает свой id после первого сохранения.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, bdKey, putBackdrop]);

  /**
   * ПИКСЕЛИ ВСТАВКИ — В ЕЁ СОБСТВЕННЫЙ ХОЛСТ, И ЗАНОВО ПРИ КАЖДОМ МОНТИРОВАНИИ.
   *
   * Тот же урок, что стоил владельцу дефекта Y-2: React монтирует ЧИСТЫЙ `<canvas>`, а байты живут
   * в объекте вырезки. Нарисовать их один раз при создании флоата было бы недостаточно — стоит
   * элементу размонтироваться (сменилась глубина шаблона, переключили слой), и на экране остался бы
   * пустой прямоугольник вместо вставки.
   */
  const floatCut = frame?.owner === 'paste' ? frame.float?.cut ?? null : null;
  useLayoutEffect(() => {
    const c = floatCanvasRef.current;
    if (!c || !floatCut) return;
    const ctx = c.getContext('2d');
    if (!ctx) return;
    ctx.clearRect(0, 0, c.width, c.height);
    ctx.drawImage(floatCut, 0, 0);
  }, [floatCut]);

  /**
   * ═══ ENTER СТАВИТ ЖИВУЮ РАМКУ — НА ОКНЕ, А НЕ НА ДИАЛОГЕ ═════════════════════════════════
   *
   * ⚠ ЗАМЕРЕНО ПРОБОЙ, И ЭТО НЕ ПЕРЕСТРАХОВКА. Обработчик клавиш модалки стоит ПОСЛЕ гарда
   * `isTyping`, а в списке его целей есть `button`: после нажатия на любой чип рейки фокус стоит
   * на кнопке, и Enter до ветки рамки НЕ ДОХОДИЛ ВООБЩЕ. Проба показала это числом — рамка не
   * ставилась ни разу за прогон.
   *
   * Живая рамка — РЕЖИМ: пока она на экране, Enter означает «поставь это» и ничего другого. Кнопки
   * при этом не мертвы — их по-прежнему жмут пробелом; отобран ровно один смысл ровно на то время,
   * пока на плите стоит незаконченный жест. Настоящее текстовое поле не трогается: там Enter
   * принадлежит форме.
   */
  const frameLive = !!frame;
  useEffect(() => {
    if (!open || !frameLive) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== 'Enter' || event.metaKey || event.ctrlKey || event.altKey) return;
      if (
        (event.target as HTMLElement)?.closest?.(
          'input, textarea, [contenteditable=""], [contenteditable="true"]',
        )
      )
        return;
      event.preventDefault();
      commitFrameRef.current();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, frameLive]);

  /** Отложенная запись обязана лечь до того, как вкладку закроют. */
  useEffect(() => {
    if (!open) return;
    const flushBoth = () => {
      flushBackdrop();
      flushGuides();
    };
    window.addEventListener('pagehide', flushBoth);
    return () => {
      window.removeEventListener('pagehide', flushBoth);
      flushBoth();
    };
  }, [open]);

  /**
   * РАЗМЕТКА СЛОЯ ПОДНИМАЕТСЯ ПРИ ОТКРЫТИИ (E-17). Ключ тот же, что у подложки: «какой это слой» —
   * вопрос с ОДНИМ ответом, и второй его формы в проекте нет.
   *
   * Пробы файла здесь нет и не нужно — направляющая ни на что не ссылается; поэтому и синхронно.
   */
  useEffect(() => {
    if (!open) {
      guideKeyRef.current = '';
      return;
    }
    const stored = readGuides(bdKey);
    const prev = guideKeyRef.current;
    guideKeyRef.current = bdKey;
    /**
     * ⚠ КЛЮЧ МЕНЯЕТСЯ ПОД РУКОЙ ОДИН РАЗ ЗА ЖИЗНЬ СЛОЯ: до первого сохранения `layer.id` равен
     * нулю, после — настоящий. Перечитать по новому ключу значило бы, что разметка ИСЧЕЗАЕТ
     * ровно в момент сохранения — человек нажал «save» и потерял расстановку, которой сохранение
     * не касалось. Поэтому она переезжает за ключом.
     *
     * ⚠ ПЕРЕЕЗД УЗКИЙ НАРОЧНО: только тот же лист (карточка и медиа совпадают) и только из
     * «слоя без id». Иначе разметка одной плиты досталась бы соседней — окно между открытиями не
     * размонтируется, и `guidesRef` переживает смену плиты.
     *
     * ⚠ ЭТА ВЕТКА НЕ ЗАМЕРЕНА ПРОБОЙ, и это сказано вслух: чтобы её исполнить, стенду нужен
     * круг «сохранить и получить id» — сеть там подменена, и такого круга у него нет. Правило
     * взято у соседа по хранилищу (чтение подложки тоже НЕ ГАСИТ то, что на экране, когда по
     * новому ключу пусто), а не выдумано здесь.
     */
    const sameSheet =
      !!prev && prev !== bdKey && prev.endsWith(':0') && prev.slice(0, -2) === bdKey.slice(0, bdKey.lastIndexOf(':'));
    if (!stored.length && sameSheet && guidesRef.current.length) {
      saveGuidesSoon(bdKey, guidesRef.current);
      return;
    }
    guidesRef.current = stored;
    setGuides(stored);
  }, [open, bdKey]);

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
      /* ЖИВАЯ РАМКА СТАРШЕ ЛЕНТЫ. Трансформ ещё не в документе, и снимать им шаг ленты значило бы
         забирать у человека прошлый мазок вместо того, что он делает прямо сейчас. Отменяется
         РАМКА — к снимку на открытии, а вставка просто исчезает. */
      if (frameRef.current) {
        cancelFrameRef.current();
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

  /**
   * ⌘C / ⌘V — БУФЕР ОБЛАСТИ (Q-6), ⌘D / ⇧⌘D — снять и вернуть выделение (Q-4).
   *
   * ⚠ НА ОКНЕ, А НЕ НА МОДАЛКЕ, и это не стиль. Обработчик модалки срабатывает, только если фокус
   * внутри неё; после клика по любой кнопке рейки он на этой кнопке — внутри, — но стоит фокусу
   * оказаться на самом холсте (не фокусируемом) или уйти после закрытия всплывашки, и клавиша
   * молчит. Замерено пробой: ⌘V после нажатия «copy inside» не вставлял ничего. ⌘Z по этой самой
   * причине живёт на окне с самого начала; клавиши буфера — та же порода.
   *
   * Гард текстового поля тот же: в настоящем поле ⌘C/⌘V принадлежат браузеру.
   */
  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (!(event.metaKey || event.ctrlKey)) return;
      if (
        (event.target as HTMLElement)?.closest?.(
          'input, textarea, [contenteditable=""], [contenteditable="true"]',
        )
      )
        return;
      /**
       * ⌘R — ЛИНЕЙКИ (E-17), та же клавиша, что у фотошопа, и она стоит ВЫШЕ гарда заморозки
       * НАРОЧНО: линейка ничего не пишет. На «read-only» смотреть и мерить можно ровно так же,
       * как зумить, — тем же правилом, по которому органы вида там остаются живыми.
       *
       * ⚠ ОДНОКЛАВИШНОГО `r` здесь быть не может: `r` занята кистью (`TOOL_KEY`), и отнять её
       * значило бы переучивать руку ради переключателя вида.
       *
       * ⚠ И ДА, ЭТО ОТНИМАЕТ У БРАУЗЕРА ПЕРЕЗАГРУЗКУ, ПОКА ОТКРЫТ РЕДАКТОР. Именно этого и надо:
       * ⌘R над полноэкранным редактором с несохранённой работой — почти всегда промах по
       * фотошопной привычке. Ничего при этом не теряется: `preventDefault` останавливает
       * перезагрузку до того, как она начнётся.
       */
      if (event.code === 'KeyR') {
        event.preventDefault();
        setRulersOn((v) => !v);
        return;
      }
      if (frozen) return;
      // По `e.code`: на кириллической раскладке `e.key` для этих клавиш — «с», «м» и «в».
      if (event.code === 'KeyC') {
        if (!sel) return;
        event.preventDefault();
        void copySel();
        return;
      }
      if (event.code === 'KeyV') {
        event.preventDefault();
        void pasteClip();
        return;
      }
      if (event.code === 'KeyD') {
        event.preventDefault();
        if (event.shiftKey) reselect();
        else if (dropSel()) showMessage('area dropped — ⇧⌘D brings it back', 'success');
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

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
      /**
       * ⚠ У КАРТЫ ЦВЕТОВ ДВА ИСТОЧНИКА, И ОНИ РАЗНЫЕ ПО СМЫСЛУ. Документ заводится из УЖЕ
       * ПОКРАШЕННОЙ карты, когда она есть (доработка вместо покраски с нуля), а нетронутая
       * подложка — ВСЕГДА из чистого флэта: ластик-возврат обязан приносить чертёж, а не
       * вчерашнюю краску. Хранимая живопись СЛОЯ здесь не читается вовсе (`colourMode` закрыл и
       * чтение слоя выше): у флэта своя обводка, и карта её не касается.
       */
      const layer = colourMode
        ? await seedRaster(mapSrc || baseSrc, box, baseSrc)
        : await seedRaster((!dropped && storedRasterUrl) || baseSrc, box);
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
  }, [baseMedia, baseSrc, ratio, storedRasterId, storedRasterUrl, storedRasterGone, colourMode, mapSrc]);

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
  /**
   * ⚠ РАЗМЕР ХОЛСТА — ТОЖЕ ЗАВИСИМОСТЬ, И ЭТО НАЙДЕНО ПРОБОЙ КРОПА, А НЕ ПРЕДУСМОТРЕНО.
   *
   * Кроп и расширение ЗАМЕНЯЮТ пиксельный слой новым, другого размера. React ставит новому
   * `<canvas>` новые `width`/`height` — а присваивание любого из них ОЧИЩАЕТ холст по спецификации,
   * — и происходит это ПОСЛЕ того, как `applyCropFrame` уже нарисовал документ в старый элемент.
   * Эффект, слушавший только `rasterReady`/`rasterOn`, при этом не срабатывал: ни то, ни другое не
   * менялось. На экране оставался ПУСТОЙ холст поверх целого документа.
   *
   * Замерено: после роста листа пиксель нового поля читался как [0,0,0,0] вместо белой бумаги, хотя
   * в документе она была. Это ровно тот же дефект Y-2 («нажать чекбокс — пропадут и не появятся»),
   * пришедший со второй стороны, и лечится он тем же — назвать зависимостью то, из-за чего на
   * экране появляется НОВЫЙ, ещё не закрашенный элемент.
   */
  const rasterW = rasterRef.current?.w ?? 0;
  const rasterH = rasterRef.current?.h ?? 0;
  useLayoutEffect(() => {
    if (rasterReady && rasterOn) paintView();
  }, [rasterReady, rasterOn, rasterW, rasterH, paintView]);

  /**
   * МАСКА ВЫДЕЛЕНИЯ — ОДИН объект и на «куда пускать кисть» (X-6), и на «насколько мягок край»
   * (X-5). Пересобирается при смене области или её растушёвки, а не на каждом отпечатке:
   * размытие полигона по холсту в полтора мегапикселя посреди мазка стоило бы кадров.
   */
  const areaKey = sel ? `${JSON.stringify(sel.pts)}|${sel.feather}` : '';
  useEffect(() => {
    const layer = rasterRef.current;
    if (!layer || !sel) {
      maskRef.current = null;
      return;
    }
    maskRef.current = selectionMask(layer, sel.pts, sel.feather);
    // areaKey — содержимое области строкой: массив точек приезжает новой ссылкой на каждый рендер.
  }, [areaKey, rasterReady, sel]);

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

  /**
   * Режим пиксельного жеста: кисть и штамп кладут, ластик кладёт бумагу — а НА КАРТЕ ЦВЕТОВ
   * ВОЗВРАЩАЕТ ЧЕРТЁЖ.
   *
   * ⚠ ТРЕТИЙ РЕЖИМ, А НЕ ФЛАГ У ВТОРОГО. Забелить и вернуть — разные работы: белое пятно на месте
   * линии сносит стенку, вдоль которой держится заливка, и следующее ведро выливается на весь
   * лист. Довод целиком — у `RasterLayer.base`.
   */
  const paintModeOf = (t: Tool): PaintMode =>
    t === 'erase' ? (colourMode ? 'restore' : 'erase') : 'paint';

  /**
   * ИНСТРУМЕНТ, КОТОРЫМ НАЧАЛСЯ ЖЕСТ, — И ИМ ЖЕ ЖЕСТ КОНЧИТСЯ.
   *
   * Отпускание кнопки читало `tool` из состояния React, то есть значение НА МОМЕНТ ОТПУСКАНИЯ.
   * Клавиши инструментов живые всё время, поэтому «зажать ластик, нажать e→r, отпустить» коммитило
   * буфер стирания как КРАСКУ: превью показывало одно, документ получал другое. Рука не может
   * начать жест одним инструментом и закончить другим — это и записано здесь.
   */
  const gestureToolRef = useRef<Tool | null>(null);

  /**
   * ГДЕ КИСТЬ ОТОРВАЛАСЬ ОТ БУМАГИ В ПРОШЛЫЙ РАЗ — для Shift-клика «точка, потом точка = прямая»
   * (H-15, владелец: «нажал одну точку нажал наследующю с шифтом оно сделало пряму линию»).
   *
   * КЛЮЧ ПО ИНСТРУМЕНТУ, А НЕ ПРОСТО КООРДИНАТА. Мазнуть кистью, взять ластик и Shift-кликнуть
   * означало бы стереть полосу вдоль отрезка, которого ластик не рисовал; связывать разнородные
   * жесты нельзя, и сторожить это условием в трёх местах — тоже: имя инструмента лежит рядом с
   * точкой, и соединить разное просто нечем.
   *
   * ⚠ МОДИФИКАТОР ЧИТАЕТСЯ С УКАЗАТЕЛЯ (`event.shiftKey` на pointerdown), А НЕ С КЛАВИАТУРЫ.
   * Клавиатурный путь этого экрана проходит через гард набора (`isTyping`, а `TYPING_TARGETS`
   * содержит `button`), и после клика по любому чипу инструмента он мёртв — Enter над рамкой
   * ловится оконным слушателем именно поэтому. Указательное событие несёт состояние Shift само и
   * ни через один гард не идёт.
   *
   * Смену инструмента НЕ чистит (ключ сам не даст соединить разное), undo не чистит (координаты
   * остаются законными — как в фотошопе). Чистится там, где точка перестаёт что-то значить:
   * на входе визита и при пересчёте листа кропом.
   */
  const lastMark = useRef<{ tool: Tool; at: [number, number] } | null>(null);

  /**
   * ОСЬ, ПО КОТОРОЙ ИДЁТ ТЕКУЩИЙ МАЗОК ПОД SHIFT (E-18) — только у пикселей и только на время
   * жеста. Ссылкой, а не состоянием: она читается и пишется внутри одного кадра протяжки, и
   * перерисовывать ради неё весь редактор шестьдесят раз в секунду было бы платой ни за что.
   */
  const shiftAxis = useRef<[number, number] | null>(null);

  /**
   * СЭМПЛЫ ТЕКУЩЕГО ПИКСЕЛЬНОГО ЖЕСТА — ОТДЕЛЬНО ОТ `trace`.
   *
   * `trace` — это то, что ПОКАЗЫВАЕТСЯ и что уйдёт в штрих; здесь копится то, по чему кладётся
   * КРАСКА, и это разные списки: у линии `trace` держит две точки, а рука прошла двадцать, и
   * сплайн по двум точкам — прямая. Держать оба в одном списке значило бы выбирать, кому соврать.
   */
  const dabSamples = useRef<[number, number][]>([]);

  /** Начало пиксельного жеста: буфер чист, коробка пуста, режим и непрозрачность зафиксированы. */
  const beginRasterGesture = (t: Tool) => {
    gestureToolRef.current = t;
    dabSamples.current = [];
    const layer = rasterRef.current;
    if (!layer) return;
    clearGesture(layer);
    liveRef.current = { mode: paintModeOf(t), opacity: t === 'heal' ? HEAL_PREVIEW_ALPHA : opacity / 100 };
  };

  /** Продолжение жеста: в буфер уходит ТОЛЬКО НОВЫЙ участок следа, а не весь след заново. */
  const growRasterGesture = (t: Tool, path: readonly [number, number][]) => {
    const layer = rasterRef.current;
    if (!layer) return;
    if (path.length < 2) return;
    const nibSpec = {
      r: nibRadius(nib, layer),
      hardness: hardness / 100,
      /* ЛАСТИК РИСУЕТ БУМАГОЙ (круг 15, J-33). Цвет назван ЗДЕСЬ, у ниба, а не веткой композита в
         `commitStage`: композит у кисти и ластика теперь один, и различает их ровно то, чем они
         красят, — плюс резка линий на отпускании, которая осталась ластику одному. */
      ink:
        t === 'heal'
          ? HEAL_PREVIEW_INK
          : t === 'erase'
            ? PAPER_INK
            : readInk(ink) ?? DEFAULT_INK,
    };
    if (t === 'stamp') {
      const off = stampOffset.current;
      if (!off) return;
      cloneAlong(layer, path, off, nibSpec);
    } else {
      paintAlong(layer, path, nibSpec);
    }
    scheduleView();
  };

  /**
   * ПУТЬ КИСТИ СТРОИТСЯ СПЛАЙНОМ, А НЕ ОТРЕЗКАМИ (круг 15, J-35).
   *
   * ⚠ ЦЕНА НАЗВАНА: КРАСКА ОТСТАЁТ РОВНО НА ОДИН СЭМПЛ. Сегмент между `p[n-3]` и `p[n-2]`
   * определён только тогда, когда пришёл `p[n-1]` — таково устройство любой интерполяции по
   * четырём точкам. Шестьдесят герц это 16 мс; так живёт фотошоп, и это несравнимо дешевле, чем
   * рисовать хордой и потом «сглаживать» уже положенную краску, которой не отменить.
   * Хвост дотягивается на отпускании: без этого конец мазка молча терялся бы.
   *
   * ⚠ ВСЕ АППАРАТНЫЕ СЭМПЛЫ, А НЕ КАДРЫ. `getCoalescedEvents()` отдаёт то, что устройство успело
   * прислать между кадрами: у планшета и трекпада их 2-8 на кадр, и ломаная по ним уже вдвое
   * короче ещё до всякого сплайна. У синтетической мыши Playwright их нет — там список из одного
   * события, и путь тождественно совпадает с прежним. Это записано в ожиданиях иглы `M45`.
   */
  const feedRasterSamples = (t: Tool, pts: readonly [number, number][]) => {
    const box = rasterRef.current;
    if (!box) return;
    const buf = dabSamples.current;
    for (const at of pts) {
      buf.push(at);
      if (buf.length === 2) {
        /* Первый отрезок контекста не имеет вовсе: до него точек нет. Квадратичный к концу —
           это тот же CR с удвоенной первой точкой. */
        growRasterGesture(t, [buf[0], buf[1]]);
        continue;
      }
      if (buf.length < 4) continue;
      const n = buf.length;
      const seg = smoothSegment(buf[n - 4], buf[n - 3], buf[n - 2], buf[n - 1], box);
      growRasterGesture(t, [buf[n - 3], ...seg]);
    }
  };

  /** Дотянуть хвост: последний сегмент, у которого не было точки-контекста справа. */
  const flushRasterSamples = (t: Tool) => {
    const box = rasterRef.current;
    const buf = dabSamples.current;
    const n = buf.length;
    if (box && n >= 3) {
      const seg = smoothSegment(buf[n - 3], buf[n - 2], buf[n - 1], buf[n - 1], box);
      growRasterGesture(t, [buf[n - 2], ...seg]);
    }
    dabSamples.current = [];
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

      /**
       * РЕЖЕТ ВЕСЬ НИБ, А НЕ ЕГО ЯДРО.
       *
       * ⚠ Здесь стояло `(nib / 2) * hardness / 100`, и довод «мягкий край стирает пиксели частично,
       * значит и линию берём только ядром» звучал стройно ровно до замера: при мягкости 0 и нибе 48
       * под рукой рисуется полоса в 48 пикселей, а линия срезалась полоской в 2.4 — пять процентов
       * от показанного. Подсказка при этом обещает «rub away everything under the nib».
       *
       * Довод был неверен по существу: частичная прозрачность — состояние ПИКСЕЛЯ, а у линии его
       * нет, её нельзя срезать на 5%. Значит мягкость к резу не относится вовсе, и единственная
       * честная ширина — та, которую человек видит: круг ниба целиком.
       */
      const bite = nib / 2;
      if (vecOn && opacity >= 100) {
        for (const piece of runs) {
          if (piece.length < 1) continue;
          const cut = eraseAlong(next, piece, bite, { w: PLATE_W, h: plateH });
          next = cut.next;
          linesChanged = linesChanged || cut.changed;
        }
      }
    }

    if (layer) stageScratch(layer, maskRef.current, paintModeOf(t));
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
      /* ⚠ ПЕРВЫЙ ИЗ ДВУХ ШВОВ ЗАПИСИ ЧЕРНИЛ, И СТОИТ ОН ПОСЛЕ ТОГО, КАК ЛЕНТА ПОДТВЕРДИЛА,
         ЧТО ПИКСЕЛИ ЛЕГЛИ. Записать на нажатии значило бы объявить меткой цвет, которым провели
         по пустому месту или мимо активной области, — и он остался бы в меню навсегда, ничего
         не покрывая. Ластик сюда не пишет: он не кладёт цвет, он возвращает чертёж. */
      if (colourMode && t === 'paint') recordInk(ink);
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

  /**
   * ПОРОГ ПРОРЕЖИВАНИЯ — «НЕ ХУЖЕ 0.75 ЭКРАННОГО ПИКСЕЛЯ НА ЭТОМ ЗУМЕ», В ЮНИТАХ ПЛАТЫ.
   *
   * ОДНО ЧИСЛО НА ЛАССО, СЛЕД РУКИ И НИБ — потому что человек рисует их одной рукой и на одном
   * приближении, и три разных порога означали бы, что обводка, линия и ластик срезают углы
   * по-разному на одном и том же жесте. Пол в пол-юнита: ниже него прореживание перестаёт
   * выбрасывать шум и начинает хранить дрожь руки, а вместе с ней — вес документа.
   */
  const thinEps = () => Math.max(0.5, 0.75 / (viewRef.current.zoom || 1));

  const commitTrace = useCallback(
    (pts: [number, number][], asLine: boolean, livePaint: typeof paint) => {
      const settled = asLine
        ? [pts[0], pts[pts.length - 1]]
        : settleTrace(pts, { w: PLATE_W, h: plateH }, thinEps());
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
    /* `plateH` и `thinEps` — в зависимостях, а не в ссылках: замыкание, замороженное на форме
       позапрошлой платы, прорядило бы след по чужой высоте. `thinEps` читает зум ссылкой и потому
       сам по себе не устаревает; в списке он стоит честно, как всякое читаемое имя. */
    [commitLines, plateH, thinEps],
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
  /**
   * ⚠ БЕЗ `useCallback`, И ЭТО НЕ НЕБРЕЖНОСТЬ. Отсюда закрывается трансформ-рамка, а её закрытие
   * ставит вставку в документ — то есть читает `plateH`, размер платы и список областей. Замыкание,
   * замороженное на кадре, в котором рамки ещё не было, положило бы кусок по ПОЗАПРОШЛОЙ форме
   * платы; ровно этой породы дефект уже стоил редактору первого сэмпла следа (см. довод у `putPen`).
   * Функция дешёвая, зовут её от нажатия пальцем, и мемоизация здесь покупала бы только этот риск.
   */
  const switchTool = (t: Tool) => {
      /* ⚠ ГЛАГОЛ-КЛАВИША ТОЖЕ ПРОХОДИТ ЗДЕСЬ, И ЭТО ЕДИНСТВЕННАЯ ДВЕРЬ. В режиме карты полос две,
         но клавиши инструментов живут всё время: `p` открыло бы перо, которого на экране нет, — и
         человек рисовал бы линии, которых скан палитры не увидит никогда. Гейт стоит у ОДНОГО
         писателя `tool`, а не у ряда чипов, потому что ряд чипов — не единственный вход. */
      if (colourMode && !COLOUR_TOOLS.has(t)) return;
      if (penRef.current) commitPen();
      /**
       * СМЕНА ИНСТРУМЕНТА ЗАКРЫВАЕТ РАМКУ — И ПО-РАЗНОМУ У РАЗНЫХ ХОЗЯЕВ.
       *
       * Шаблон и вставка СТАВЯТСЯ: построенное не выбрасывается, ровно как коммитится недоложенный
       * контур пера. Кадр ОТМЕНЯЕТСЯ: его применение необратимо и сносит ленту, и запускать такое
       * от нажатия на соседний чип нельзя — там ставят только Enter или двойной клик.
       */
      const fr = frameRef.current;
      if (fr && !(t === 'crop' && fr.owner === 'crop')) {
        if (fr.owner === 'crop') closeFrame();
        else commitFrame();
      }
      setTool(t);
      toolRef.current = t;
      /**
       * ⚠ СМЕНА ИНСТРУМЕНТА ЗАКАНЧИВАЕТ ЛИЧНОСТЬ НАЖАТИЯ — И ЭТО ЕДИНСТВЕННОЕ МЕСТО, ГДЕ ЭТО
       * ПРАВДА ДЛЯ ВСЕХ ПУТЕЙ. Отметка значит «ЭТО нажатие сняло область». Гасил её только хвост
       * жеста лассо, а `putTrace([at])` на нажатии не спрашивает инструмент ВООБЩЕ: `line`,
       * `freehand` и мазковые заводят живой жест, НЕ трогая ни `sel`, ни отметку. Оба читателя
       * (Esc-ступень и ветка `settleLasso`) спрашивают инструмент на ОТПУСКАНИИ, поэтому смена
       * инструмента посреди протяжки разводила запись и чтение: отпускание уходило в общий хвост
       * `commitTrace`, гашение не исполнялось, и отметка доживала до СЛЕДУЮЩЕГО жеста. Дальше
       * Esc воскрешал область позапрошлого жеста — ровно тот сценарий, который абзац у
       * Esc-ступени объявляет закрытым, — а нулевое по длине отпускание печатало «area dropped»
       * за нажатие, не снявшее ничего.
       */
      pressDropped.current = false;
      /**
       * РАМКА КАДРА ОТКРЫВАЕТСЯ ПОСЛЕ ХОЛСТА, А НЕ ДО НЕГО — но только когда холст ещё надо завести.
       *
       * Порядок несущий в обе стороны. Открой рамку раньше — и отказ прокси оставил бы на экране
       * живой жест, чьё применение растянуло бы подложку ровно так, как жалуется владелец. Жди
       * холста ТАМ, ГДЕ ОН УЖЕ ЕСТЬ, — и рамка появлялась бы кадром позже без всякой причины,
       * а рука, привыкшая к мгновенному отклику, успела бы нажать мимо.
       */
      /* ⚠ `needsRaster(t)` В УСЛОВИИ — НЕ ИЗБЫТОЧНОСТЬ, А СЦЕПКА ДВУХ ПОЛОВИН ОДНОГО РЕШЕНИЯ.
         Ждать холста имеет смысл ровно тогда, когда его кто-то заводит. Без этой связки снятие
         `'crop'` из `needsRaster` дало бы кроп, у которого рамка НЕ ОТКРЫВАЕТСЯ ВОВСЕ: ждать
         некого, а синхронная ветка пропущена. Замерено иглой C7. */
      const seedForCrop =
        t === 'crop' &&
        needsRaster(t) &&
        !frozen &&
        baseMediaId > 0 &&
        !rasterRef.current &&
        frameRef.current?.owner !== 'crop';
      if (t === 'crop' && frameRef.current?.owner !== 'crop' && !seedForCrop) openCropFrame();
      if (t !== 'select') {
        setSelected(null);
        putNodeEdit(null);
      }
      if (needsRaster(t) && !frozen) {
        // ЗАПЕРТЫЙ ПИКСЕЛЬНЫЙ ИНСТРУМЕНТ НЕ ОСТАЁТСЯ В РУКЕ. Чип, выбранный и молча ничего не
        // делающий, читается как сломанный редактор; рука возвращается к `select`, а причина
        // стоит отказом над холстом.
        void ensureRaster().then((layer) => {
          if (!layer) {
            setTool((cur) => (needsRaster(cur) ? 'select' : cur));
            return;
          }
          if (seedForCrop && toolRef.current === 'crop' && frameRef.current?.owner !== 'crop') {
            openCropFrame();
          }
        });
      }
  };

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
    setSel({ pts: poly, feather: 0 });
    setTool('lasso');
    setSelected(null);
  };

  /* ⚠ `findSelAt` ЗДЕСЬ БОЛЬШЕ НЕТ (H-2). Она отвечала на вопрос «какую из областей взять в
     руку», а областей больше одной не бывает: единственный ответ — «ту же самую», то есть
     ничего. Клик внутри дорожки теперь снимает её ровно так же, как клик мимо. */

  /* ═══ ТРАНСФОРМ-РАМКА: ОТКРЫТЬ, ПОСТАВИТЬ, ОТМЕНИТЬ ════════════════════════════════════════ */

  /** Точка события В ЮНИТАХ ПЛАТЫ и БЕЗ клампа: рамка законно свисает за край, как и подложка. */
  const plateAt = (e: { clientX: number; clientY: number }): [number, number] => {
    const f = frameAtFree(e);
    return [f[0] * PLATE_W, f[1] * plateH];
  };

  /**
   * ЧТО ПОД УКАЗАТЕЛЕМ У ЖИВОЙ РАМКИ — ОДНА ФУНКЦИЯ НА НАЖАТИЕ И НА НАВЕДЕНИЕ. Порознь они
   * разошлись бы первой же правкой: курсор обещал бы одно, а кнопка делала другое.
   *
   * В РЕЖИМЕ WARP ОПРАШИВАЮТСЯ УЗЛЫ, А НЕ РУЧКИ. Порядок — тот же закон, что у ручек рамки: узел
   * старше тела, иначе узел внутри квада было бы нечем взять — любое нажатие уходило бы в сдвиг.
   * Масштаба, поворота и перспективы в этом режиме нет вовсе, и это НЕ упущение: их органы —
   * восемь ручек, а на экране сейчас шестнадцать узлов, и держать оба набора значило бы заставить
   * руку гадать, что случится от нажатия.
   */
  const frameHitAt = (fr: FrameState, p: [number, number]): FrameHit => {
    const zoomNow = viewRef.current.zoom || 1;
    /* Спрашивается ИМЕННО «что на экране», а не «есть ли сетка»: у рамки, вышедшей к ручкам над
       изогнутым мешем, сетка есть, а узлов нет — и целиться рука обязана в то, что видит. */
    if (frameShowsNodes(fr)) {
      const n = hitWarpNode(fr.quad, fr.grid, p, FRAME_HANDLE_PX / zoomNow);
      if (n !== null) return { kind: 'node', handle: n };
      return pointInQuad(fr.quad, p) ? { kind: 'body' } : null;
    }
    return hitFrame(fr.quad, p, {
      handle: FRAME_HANDLE_PX / zoomNow,
      rotate: FRAME_ROTATE_PX / zoomNow,
      axis: fr.axis,
    });
  };

  /**
   * ПЕРЕСЧИТАТЬ ПРЕВЬЮ ПОД НЕПОДВИЖНЫМ УКАЗАТЕЛЕМ (круг 15, J-36, дефект 2).
   *
   * Зовётся из `applyView`, то есть из ЕДИНСТВЕННОЙ двери, через которую вид вообще меняется, —
   * колесо, щипок, кнопки зума, клавиши, панорама рукой, вписывание, отступ после кропа. Читает
   * ровно те же `frameAt`/`frameAtFree`/`plateAt`, что и настоящие события указателя: две
   * арифметики «где мы» разошлись бы первой правкой, и разошлись бы МОЛЧА.
   *
   * Что здесь НЕ делается: живой жест не трогается вовсе. Протяжка держит свои координаты сама и
   * получает настоящие события; подменить их пересчётом значило бы дорисовать руке движение,
   * которого она не делала.
   */
  const refreshHover = () => {
    const at = lastClient.current;
    if (!at) return;
    const e = { clientX: at.x, clientY: at.y };
    const fr = frameRef.current;
    if (fr && !frozenRef.current) {
      const hit = frameHitAt(fr, plateAt(e));
      if (!sameHit(hit, frameHover)) setFrameHover(hit);
      return;
    }
    if (tool === 'curve' && penRef.current) {
      putPenHover(frameAtFree(e));
      return;
    }
    if (isNibTool(tool) || isThreadTool(tool)) setNibHover(frameAt(e));
  };
  refreshHoverRef.current = refreshHover;

  // ── линейки по кромкам вьюпорта (E-17) ─────────────────────────────────────────────────────

  const rulerTopRef = useRef<HTMLCanvasElement | null>(null);
  const rulerLeftRef = useRef<HTMLCanvasElement | null>(null);
  const markXRef = useRef<HTMLDivElement | null>(null);
  const markYRef = useRef<HTMLDivElement | null>(null);

  /**
   * ГДЕ РУКА НА ЛИНЕЙКЕ — ДВЕ НИТИ, ДВИГАЕМЫЕ ТРАНСФОРМОМ, А НЕ ПЕРЕРИСОВКОЙ ХОЛСТА.
   *
   * Указатель шлёт события десятками в секунду, и перерисовывать ради метки все деления с
   * подписями значило бы жечь кадр на каждое движение руки — под мазком кистью это видно.
   * Трансформ узла не трогает ни разметку, ни layout.
   */
  const moveRulerMarks = (clientX: number, clientY: number) => {
    const vp = viewportRef.current;
    if (!vp) return;
    const r = viewportRect(vp);
    const mx = markXRef.current;
    const my = markYRef.current;
    if (mx) mx.style.transform = `translateX(${Math.round(clientX - r.left)}px)`;
    if (my) my.style.transform = `translateY(${Math.round(clientY - r.top)}px)`;
  };

  /**
   * ДЕЛЕНИЯ ОБЕИХ ЛИНЕЕК. Всё — в ЮНИТАХ ПЛАТЫ, и ноль стоит на её левом верхнем углу: другой
   * системы координат у этого редактора нет вовсе (толщина нити, размер ниба, растушёвка области
   * — все они уже названы в юнитах платы), и вторая, «в пикселях снимка», означала бы два разных
   * ответа на вопрос «сколько тут».
   */
  const drawRulers = () => {
    const vp = viewportRef.current;
    const top = rulerTopRef.current;
    const left = rulerLeftRef.current;
    if (!vp || !top || !left) return;
    const r = viewportRect(vp);
    if (r.width < 2 || r.height < 2) return;
    const { pan, zoom } = viewRef.current;
    const k = zoom || 1;
    /* Плотность экрана — иначе подписи 9 px выходят мыльными на любом ретина-мониторе, а линейка
       с нечитаемыми числами не линейка. Потолок 2: выше него разница уже не видна, а память
       холста растёт квадратично. */
    const dpr = Math.min(2, window.devicePixelRatio || 1);

    const prep = (cv: HTMLCanvasElement, w: number, h: number) => {
      const W = Math.max(1, Math.round(w * dpr));
      const H = Math.max(1, Math.round(h * dpr));
      if (cv.width !== W) cv.width = W;
      if (cv.height !== H) cv.height = H;
      const g = cv.getContext('2d');
      if (!g) return null;
      g.setTransform(dpr, 0, 0, dpr, 0, 0);
      g.clearRect(0, 0, w, h);
      g.fillStyle = RULER_BG;
      g.fillRect(0, 0, w, h);
      /* ⚠ ШРИФТ ДОМА, А НЕ СИСТЕМНЫЙ МОНОШИРИННЫЙ. Холст не наследует CSS, и «ui-monospace»
         здесь было бы ВТОРОЙ гарнитурой на экране, где вся типографика — одна. Не приехавший
         `FeatureMono` не страшен: шкала перерисовывается на каждой записи вида, и первая же
         панорама покажет её правильной. */
      g.font = `${RULER_FONT_PX}px FeatureMono, ui-monospace, SFMono-Regular, Menlo, monospace`;
      g.textBaseline = 'alphabetic';
      return g;
    };

    const step = tickStep(k, RULER_LABEL_MIN_PX);
    /* Мелкое деление рисуется, только когда ему есть где поместиться: пять штрихов в шести
       пикселях — это серая полоса, а не шкала. */
    const minor = step / 5;
    const minorVisible = minor * k >= RULER_MINOR_MIN_PX;

    const gTop = prep(top, r.width, RULER_PX);
    if (gTop) {
      gTop.strokeStyle = RULER_INK;
      gTop.fillStyle = RULER_INK;
      gTop.lineWidth = 1;
      const from = Math.floor((0 - pan.x) / k / step) * step;
      const to = (r.width - pan.x) / k;
      for (let w0 = from; w0 <= to; w0 += step) {
        const x = Math.round(pan.x + w0 * k) + 0.5;
        gTop.globalAlpha = 1;
        gTop.beginPath();
        gTop.moveTo(x, RULER_PX - RULER_MAJOR_PX);
        gTop.lineTo(x, RULER_PX);
        gTop.stroke();
        gTop.fillText(String(Math.round(w0)), x + 2, RULER_FONT_PX + 1);
        if (!minorVisible) continue;
        gTop.globalAlpha = 0.5;
        for (let m = 1; m < 5; m += 1) {
          const mx = Math.round(pan.x + (w0 + minor * m) * k) + 0.5;
          gTop.beginPath();
          gTop.moveTo(mx, RULER_PX - RULER_MINOR_PX);
          gTop.lineTo(mx, RULER_PX);
          gTop.stroke();
        }
      }
      /* Кромка ЛИСТА на линейке: без неё числа висят в пустоте, и «где кончается бумага» видно
         только по холсту. Вес и цвет — внутреннего правила (#e6e6e6 здесь потерялся бы на белом
         фоне самой линейки, поэтому чернила с прозрачностью, как у линий третей рамки). */
      gTop.globalAlpha = 0.35;
      gTop.strokeStyle = RULER_EDGE;
      for (const w0 of [0, PLATE_W]) {
        const x = Math.round(pan.x + w0 * k) + 0.5;
        gTop.beginPath();
        gTop.moveTo(x, 0);
        gTop.lineTo(x, RULER_PX);
        gTop.stroke();
      }
      gTop.globalAlpha = 1;
      gTop.strokeStyle = RULER_RULE;
      gTop.beginPath();
      gTop.moveTo(0, RULER_PX - 0.5);
      gTop.lineTo(r.width, RULER_PX - 0.5);
      gTop.stroke();
    }

    const gLeft = prep(left, RULER_PX, r.height);
    if (gLeft) {
      gLeft.strokeStyle = RULER_INK;
      gLeft.fillStyle = RULER_INK;
      gLeft.lineWidth = 1;
      const from = Math.floor((0 - pan.y) / k / step) * step;
      const to = (r.height - pan.y) / k;
      for (let w0 = from; w0 <= to; w0 += step) {
        const y = Math.round(pan.y + w0 * k) + 0.5;
        gLeft.globalAlpha = 1;
        gLeft.beginPath();
        gLeft.moveTo(RULER_PX - RULER_MAJOR_PX, y);
        gLeft.lineTo(RULER_PX, y);
        gLeft.stroke();
        /* Подпись вертикальной линейки ПОВЁРНУТА, а не составлена из цифр столбиком: столбик
           читается по букве, а число читается целиком. */
        gLeft.save();
        gLeft.translate(RULER_FONT_PX + 1, y + 2);
        gLeft.rotate(-Math.PI / 2);
        gLeft.fillText(String(Math.round(w0)), 0, 0);
        gLeft.restore();
        if (!minorVisible) continue;
        gLeft.globalAlpha = 0.5;
        for (let m = 1; m < 5; m += 1) {
          const my = Math.round(pan.y + (w0 + minor * m) * k) + 0.5;
          gLeft.beginPath();
          gLeft.moveTo(RULER_PX - RULER_MINOR_PX, my);
          gLeft.lineTo(RULER_PX, my);
          gLeft.stroke();
        }
      }
      gLeft.globalAlpha = 0.35;
      gLeft.strokeStyle = RULER_EDGE;
      for (const w0 of [0, plateH]) {
        const y = Math.round(pan.y + w0 * k) + 0.5;
        gLeft.beginPath();
        gLeft.moveTo(0, y);
        gLeft.lineTo(RULER_PX, y);
        gLeft.stroke();
      }
      gLeft.globalAlpha = 1;
      gLeft.strokeStyle = RULER_RULE;
      gLeft.beginPath();
      gLeft.moveTo(RULER_PX - 0.5, 0);
      gLeft.lineTo(RULER_PX - 0.5, r.height);
      gLeft.stroke();
    }
  };
  drawRulersRef.current = rulersOn ? drawRulers : () => {};

  /* Линейки включили, плата сменила форму, окно изменило размер — деления обязаны стать на место
     ДО того, как человек по ним что-то отмерит. Вид при этом не трогается: перерисовка шкалы —
     не жест. */
  useEffect(() => {
    drawRulersRef.current();
  }, [rulersOn, plateH, zoomPct]);

  /**
   * РАМКА КАДРА ОСТАЁТСЯ ОСЕ-ВЫРОВНЕННОЙ И КОНЕЧНОЙ.
   *
   * Потолок роста тот же, что стоял у прежнего множителя (×4): выше него растр всё равно упирается
   * в `RASTER_MAX_W` и старое содержимое начинает пересэмпливаться вниз — то есть «расширил ещё»
   * означало бы «потерял в чёткости», молча. Пол — `MIN_FRAME_SIDE`: рамка, схлопнутая в линию,
   * даёт лист нулевой высоты, из которого нечего восстанавливать.
   */
  const clampCropQuad = (q: Quad): Quad => {
    const b = quadBounds(q);
    const grow = CROP_MAX_GROWTH;
    const x0 = Math.min(Math.max(b.x0, -PLATE_W * (grow - 1)), PLATE_W * grow - MIN_FRAME_SIDE);
    const y0 = Math.min(Math.max(b.y0, -plateH * (grow - 1)), plateH * grow - MIN_FRAME_SIDE);
    const x1 = Math.max(Math.min(b.x1, PLATE_W * grow), x0 + MIN_FRAME_SIDE);
    const y1 = Math.max(Math.min(b.y1, plateH * grow), y0 + MIN_FRAME_SIDE);
    return quadFromRect(x0, y0, x1 - x0, y1 - y0);
  };

  /**
   * ПОСТАНОВКА ШАБЛОНА ИЗ-ПОД ЖИВОЙ РАМКИ — ОБЩИЙ ПИСАТЕЛЬ ТРЁХ ДВЕРЕЙ ИЗ ПЯТИ.
 *
 * ⚠ ЗАГОЛОВОК ОДНАЖДЫ ГОВОРИЛ «ОДИН ПИСАТЕЛЬ НА ВСЕ ТРИ ДВЕРИ», И ЭТО БЫЛО НЕПРАВДОЙ УЖЕ ТОГДА.
 * Дверей, ставящих шаблон, ПЯТЬ: отпускание указателя, чип «flatten» и выход из warp ходят сюда,
 * а `commitFrame` и `cancelFrame` пишут САМИ — им надо ещё и запереть подложку
 * (`setBackdropLocked(…, true)`), чего этот писатель не делает. Свести их сюда нельзя без того,
 * чтобы дверь начала делать разное в зависимости от аргумента. Общим сделано ПРАВИЛО, а не дверь:
 * «тождественная сетка не хранится» живёт в `keptGrid` наверху файла и написано ровно один раз.
   *
   * ⚠ ДВЕРЕЙ ТРИ, А ПИСАТЕЛЬ БЫЛ ОДИН — У ОТПУСКАНИЯ УКАЗАТЕЛЯ, — И ЭТО СТОИЛО ДЕФЕКТА. «Flatten
   * the warp» это НАЖАТИЕ ЧИПА: никакой драг за ним не следует, значит `onStagePointerUp` не
   * бежит, значит запись не менялась. Чип рапортовал в ПРОШЕДШЕМ времени («the warp was
   * flattened»), показ возвращался на резкий `img` — а в записи сетка оставалась лежать, и уход из
   * редактора без Enter возвращал искривление целиком (замерено: канвас, 16 узлов, чип «flatten»
   * снова на месте). То есть разрушительное действие было долговечным, а исправляющее — нет.
   *
   * Тождественная сетка не хранится — тем же правилом, что у отпускания: записанная «на всякий
   * случай», она перевела бы показ с резкого `img` на канвас навсегда и объявила бы шаблон
   * изменённым, хотя человек только заглянул в режим.
   */
  const writeBackdropFrame = (quad: Quad, grid: WarpGrid | undefined) => {
    const b = backdropRef.current;
    if (!b) return;
    putBackdrop(setBackdropGrid(setBackdropQuad(b, quad), keptGrid(grid)));
  };

  /** Рамка на шаблоне. Открывается выбором картинки и строкой «place it» в группе слоёв. */
  const openBackdropFrame = (b: Backdrop, remember = true) => {
    const quad = backdropCorners(b) as unknown as Quad;
    /* ОТКРЫВАЕТСЯ ВСЕГДА В РЕЖИМЕ ВОСЬМИ РУЧЕК, даже когда в записи лежит сетка. Она при этом не
       теряется: сетка едет с квадом сама (она в его домене), показ остаётся канвасом, а войти в
       неё — один чип. Открывать сразу в сетке значило бы, что человек, взявший шаблон, чтобы его
       подвинуть, застаёт другой набор органов, чем в прошлый раз.

       ⚠ ДО ПОЯВЛЕНИЯ `warp` ЭТОТ КОММЕНТАРИЙ БЫЛ НЕПРАВДОЙ. Поле передавалось одно (`grid`), а
       режимом считалось его наличие — значит запись с искривлением открывалась ровно в узлах, и
       масштаба с поворотом у такого шаблона не было вовсе (замерено: 16 узлов, 0 ручек). Теперь
       режим сказан отдельным словом, и обещание исполняется. */
    const openedFrame = putFrame({
      owner: 'backdrop',
      quad,
      axis: false,
      snapshot: quad,
      grid: b.grid,
      warp: false,
      snapshotGrid: b.grid,
    });
    /* ⚠ ТРЕТИЙ ВЫЗЫВАЮЩИЙ, ЧИТАЮЩИЙ ВЕРДИКТ. Отпереть запись, когда рамка НЕ открылась, значило бы
       снять замок с шаблона, которого человек не получил под руку. Случай узкий (смена
       инструмента закрывает прежнюю рамку, и `prev` обычно пуст), но предположение то же самое. */
    if (!openedFrame) {
      /* ⚠ И ОТКАЗ ЗДЕСЬ ГОВОРИТ ВСЛУХ. Путь узкий — «place it» при живой рамке кропа или вставки,
         когда `prev` хорош, а в записи лежит легаси-пересечение, — но молчащая дверь на нём
         выглядела бы как сломанная кнопка: нажал, и НИЧЕГО. Это та же форма, что чинится у
         `flattenWarp`, и лечится тем же: назвать причину и назвать выход. */
      showMessage(
        'this template cannot be placed while another frame is open: its stored corners cross the vanishing line. Press Esc to close the current frame, then place it',
        'error',
      );
      return;
    }
    /* Запись трогается ТОЛЬКО когда бит замка правда меняется: восстановление из хранилища — это
       чтение, и писать в него отсюда значило бы переставить `at` записи на каждое открытие окна. */
    if (b.locked) putBackdrop(setBackdropLocked(b, false), remember);
    setFrameHover(null);
  };

  /**
   * ═══ WARP: ВОЙТИ, ВЫЙТИ, РАСПРЯМИТЬ (H-4) ═══════════════════════════════════════════════════
   *
   * Владелец: «варп эфекта в темплейте в эдиторе нету».
   *
   * Вход строит ТОЖДЕСТВЕННУЮ сетку — картинка не двигается ни на пиксель, меняются только органы
   * под рукой. Выход её не выбрасывает: заглянуть в режим и вернуться к ручкам — не то же самое,
   * что распрямить искривление, и путать эти два намерения одним чипом значило бы уничтожать
   * работу нажатием, которое обещало сменить инструмент.
   */
  const enterWarp = () => {
    const fr = frameRef.current;
    if (!fr || fr.owner !== 'backdrop') return;
    /* ⚠ РАННЕГО ВЫХОДА «СЕТКА УЖЕ ЕСТЬ» ЗДЕСЬ БОЛЬШЕ НЕТ. Он был написан, пока наличие сетки И
       БЫЛО режимом; теперь войти НАД УЖЕ ИСКРИВЛЁННЫМ мешем — законный и обязательный жест, иначе
       вернуться к узлам после выхода к ручкам было бы нечем. Геометрия при входе не трогается:
       берётся та, что есть, и только её отсутствие сеет тождество. */
    /* ⚠ ДЕВЯТЫЙ ВЫЗЫВАЮЩИЙ, И ЕДИНСТВЕННЫЙ, КОГО КРУГ Q2 НЕ ОБОШЁЛ. Он ронял вердикт молча: на
       пересекающей трапеции с `g === 0` вход в режим отвергался (тождественная сетка «ухудшала»
       запас на один ulp — см. довод у `warpHorizonMargin`), и чип НЕ ДЕЛАЛ НИЧЕГО И НЕ ГОВОРИЛ
       НИЧЕГО: шестнадцать узлов просто не появлялись. Ровно та форма немой двери, ради которой
       вердикт и заведён. Причина устранена в измерителе — вход в warp теперь не двигает запас
       ВООБЩЕ, — но вердикт всё равно читается: дверь, чей отказ никто не проверяет, однажды снова
       начнёт отказывать. */
    if (!putFrame({ ...fr, grid: gridIsUsable(fr.grid) ? fr.grid : identityGrid(), warp: true })) {
      showMessage(
        'the nodes cannot be shown here: this template already crosses the vanishing line. Move a corner back first, then bend it',
        'error',
      );
      return;
    }
    setFrameHover(null);
  };

  /**
   * ОБРАТНО К ВОСЬМИ РУЧКАМ. Сетка ОСТАЁТСЯ жить в рамке — она не постановка, а форма, и выход из
   * режима не имеет права её уничтожать.
   *
   * ⚠ ДО ПОЯВЛЕНИЯ `warp` ЭТОТ ОРГАН БЫЛ NO-OP НАД ИЗОГНУТЫМ МЕШЕМ: он перекладывал ту же самую
   * сетку обратно, режим-то был ею и выражен. Тождественную он при этом выбрасывал — то есть
   * работал ровно в том единственном случае, когда работы никакой и не было.
   *
   * ТОЖДЕСТВЕННАЯ ВЫБРАСЫВАЕТСЯ — ЭТО УБОРКА, а не выход: сетка, которая ничего не делает, увела
   * бы показ на канвас без единой причины. И раз рамка при этом расходится с записью, уборка
   * ПИШЕТСЯ — тем же писателем, что и отпускание указателя.
   */
  const leaveWarp = () => {
    const fr = frameRef.current;
    if (!fr || !fr.warp) return;
    const kept = keptGrid(fr.grid);
    /* ⚠ ТОТ ЖЕ ВОПРОС, ЧТО У `flattenWarp`, И НАЙДЕН ОН БЫЛ ОБХОДОМ ВСЕХ ДЕВЯТИ ВЫЗЫВАЮЩИХ, а не
       по отчёту: «уборка тождественной сетки» — это ТОЖЕ снятие сетки, значит она может получить
       отказ ровно по той же причине. Писать запись после отказа означало бы развести её с рамкой
       молча, без единого слова на экране. */
    if (!putFrame({ ...fr, grid: kept, warp: false })) {
      showMessage(
        'the handles cannot take over here: without its mesh this template crosses the vanishing line. Move a corner back first',
        'error',
      );
      return;
    }
    if (!kept && fr.grid && fr.owner === 'backdrop') writeBackdropFrame(fr.quad, undefined);
    setFrameHover(null);
  };

  /**
   * РАСПРЯМИТЬ. Без этой двери единственным выходом из неудачного искривления было бы снять
   * шаблон целиком и выставлять его заново — то есть потерять и постановку тоже. Квад не
   * трогается: «распрямить» и «поставить заново» — разные намерения.
   */
  const flattenWarp = () => {
    const fr = frameRef.current;
    if (!fr || !fr.grid) return;
    /* Сетка ВЫБРАСЫВАЕТСЯ, а не сбрасывается в тождество: тождественная сетка это всё ещё сетка,
       и показ остался бы на канвасе, который мылит там, где `img` рисует резко. Раз искривления
       нет — нет и причины держать режим. */
    /* ⚠ ВЕРДИКТ ДВЕРИ СПРАШИВАЕТСЯ ДО ЛЮБОГО СЛОВА И ЛЮБОЙ ЗАПИСИ. Замерено: у легаси-записи с
       пересекающим квадом сетка может КОМПЕНСИРОВАТЬ пересечение (12 из 12 сдвигов узлов к уровням
       y = [0, .15, .30, .45] приняты, поверхность безопасна) — и тогда СНЯТИЕ этой сетки снова
       уводит поверхность за горизонт, то есть `putFrame` законно отказывает. Прежняя редакция
       отказа не видела: писала запись и говорила «the warp was flattened» в прошедшем времени про
       то, чего не произошло, — рамка оставалась с сеткой, запись уезжала без неё, и они
       расходились. Это тот же дефект «слово впереди дела», что уже чинился в этом файле. */
    if (!putFrame({ ...fr, grid: undefined, warp: false })) {
      showMessage(
        'the warp cannot be flattened: without its mesh this template crosses the vanishing line. Move a corner back first, then flatten',
        'error',
      );
      return;
    }
    if (fr.owner === 'backdrop') writeBackdropFrame(fr.quad, undefined);
    setFrameHover(null);
    showMessage('the warp was flattened — the template keeps its place and size', 'success');
  };

  /**
   * ⚠ ПОЛ ВПИСЫВАНИЯ НАЗЫВАЕТСЯ ВСЛУХ, ОДИН РАЗ ЗА ВИЗИТ. `fitView` не опускается ниже
   * `FIT_MIN` (0.35), а кадру разрешено вырасти до `CROP_MAX_GROWTH` (×4) — то есть примерно
   * с 3.2 ширины платы «показать целиком» перестаёт быть выполнимым, и без слов это выглядит
   * ровно как жалоба H-14: тяну, а экран не отвечает.
   */
  const cropFloorSaid = useRef(false);

  /**
   * ВИД ОТСТУПАЕТ И ПОКАЗЫВАЕТ КАДР — НА ОТПУСКАНИИ, И ТОЛЬКО КОГДА ЕМУ ПРАВДА ТЕСНО.
   *
   * ⚠ ПЕРВАЯ РЕДАКЦИЯ ЭТОГО ОРГАНА СТИРАЛА ПРИБЛИЖЕНИЕ ЧЕЛОВЕКА НА КАЖДОМ ЖЕСТЕ, и вопрос был
   * задан неверно: «влезает ли ВЕСЬ кадр в экран». Кадр открывается ровно по границам платы, а
   * выше вписывающего зума плата в экран не влезает — значит ответ был «нет» ВСЕГДА, и любое,
   * даже направленное ВНУТРЬ, движение ручки отбрасывало вид к вписыванию. Замерено: зум 1.087,
   * ручка сдвинута внутрь на 30 px, отпущено — вид вернулся точно к вписывающей матрице. Человек,
   * подводящий кромку к шву на увеличении, терял его на первом же движении, и так без конца.
   * Побочно взводился `userMoved`, глушивший до конца визита и перевписывание по смене формы
   * платы, и наблюдателя размера окна.
   *
   * ВЕРНЫЙ ВОПРОС — ДВА, И ОБА УЖЕ: (1) вырос ли лист ЗА ПРЕДЕЛЫ ПЛАТЫ (обрезка внутрь за экран
   * не уводит ничего и вида не касается вовсе); (2) ушло ли выросшее за кромку экрана. И только
   * тогда — минимальное вмешательство: сперва ПАНОРАМА, потому что приближение принадлежит
   * человеку, и трогать его надо последним; зум отступает лишь когда кадр не помещается в экран
   * при нынешнем приближении НИКАК.
   *
   * Во время протяжки вид не трогается вовсе: мир, поехавший из-под руки, уводит и точку, за
   * которую держат. Фотошоп так не делает буквально — у него бесконечный пастборд; у нас его нет.
   */
  const revealCropFrame = (fr: FrameState) => {
    const vp = viewportRef.current;
    if (!vp) return;
    const r = viewportRect(vp);
    if (r.width < 2 || r.height < 2) return;
    const b = quadBounds(fr.quad);
    /* Пол-юнита допуска — от арифметики клампа, а не от вкуса: кадр, «ровно по плате», не обязан
       совпасть с ней до последнего бита, и дрожь в шестом знаке не повод двигать экран. */
    const grew =
      b.x0 < -0.5 || b.y0 < -0.5 || b.x1 > PLATE_W + 0.5 || b.y1 > plateH + 0.5;
    if (!grew) return;
    const view = viewRef.current;
    const box = { x: b.x0, y: b.y0, w: b.x1 - b.x0, h: b.y1 - b.y0 };
    const port = { w: r.width, h: r.height };
    /**
     * ⚠ ВОПРОС ЗАДАЁТСЯ ПО ОСЯМ, КОТОРЫЕ ВЫРОСЛИ, А НЕ ПРО ВЕСЬ КАДР СРАЗУ.
     *
     * Первая починка закрыла движение ВНУТРЬ и оставила открытым РОСТ: выросший кадр всегда
     * содержит плату, значит «влезает ли он целиком» выше вписывающего зума — снова всегда «нет»,
     * и приближение снова стиралось. Замерено: 91 % → 52 % от протяжки правой кромки на 30 px
     * НАРУЖУ, при том что сама кромка оставалась на экране, — вмешательство гнала ВЫСОТА кадра,
     * которой рука не касалась вовсе.
     *
     * Ось, по которой человек ничего не тянул, не имеет права двигать его экран.
     */
    const grewX = b.x0 < -0.5 || b.x1 > PLATE_W + 0.5;
    const grewY = b.y0 < -0.5 || b.y1 > plateH + 0.5;
    const raw = revealDelta(box, port, view, FIT_INSET);
    const d = { x: grewX ? raw.x : 0, y: grewY ? raw.y : 0 };
    if (d.x === 0 && d.y === 0) return; // выросшее и так на экране — руки прочь
    const fitsAtZoom =
      (!grewX || box.w * view.zoom <= port.w - FIT_INSET * 2) &&
      (!grewY || box.h * view.zoom <= port.h - FIT_INSET * 2);
    if (fitsAtZoom) {
      // ПРИБЛИЖЕНИЕ СОХРАНЯЕТСЯ: подвинуть мир достаточно, чтобы кадр стал виден целиком.
      viewRef.current = { zoom: view.zoom, pan: { x: view.pan.x + d.x, y: view.pan.y + d.y } };
    } else {
      // Показывается ОБЪЕДИНЕНИЕ платы и кадра: кадр, уведённый вбок, всё равно режет лист, и
      // видеть надо оба — иначе экран показал бы рамку над пустотой.
      const x0 = Math.min(0, b.x0);
      const y0 = Math.min(0, b.y0);
      const x1 = Math.max(PLATE_W, b.x1);
      const y1 = Math.max(plateH, b.y1);
      const next = fitView({ x: x0, y: y0, w: x1 - x0, h: y1 - y0 }, port);
      viewRef.current = next;
      const floored =
        next.zoom <= FIT_MIN + 1e-6 &&
        ((x1 - x0) * next.zoom > port.w - FIT_INSET * 2 ||
          (y1 - y0) * next.zoom > port.h - FIT_INSET * 2);
      if (floored && !cropFloorSaid.current) {
        cropFloorSaid.current = true;
        /**
         * ⚠ ЭТО СПРАВКА, А НЕ ОТКАЗ — И ТИП ТОСТА ОБЯЗАН ЭТО ГОВОРИТЬ (круг 15, J-32).
         *
         * Владелец: «когда мы хотим увеличить полотно через кроп выдаёт ошибку». Ничего не
         * ломалось: лист рос, жест продолжался, — но красный тост читается как «редактор
         * отказал», и человек бросает жест на середине. Ровно из-за этого «выдаёт ошибку» и
         * «функциональность вообще не работает» слились у него в одну жалобу.
         */
        showMessage(
          'the sheet no longer fits the view — scroll to reach the edge you are pulling',
          'success',
        );
      }
    }
    /* ⚠ `userMoved` ЗДЕСЬ НЕ ВЗВОДИТСЯ. Это поправка МАШИНЫ, а не жест человека, и объявлять ею
       вид «человек распорядился сам» значило бы заглушить до конца визита и перевписывание по
       смене формы платы, и наблюдателя размера окна — оба гейтятся ровно этим признаком. */
    applyView();
  };

  /**
   * РАМКА НАЗВАННОЙ ФОРМЫ — НАИБОЛЬШАЯ ТАКАЯ ВНУТРИ ЛИСТА, ПО ЦЕНТРУ (E-18).
   *
   * ОДНА ФУНКЦИЯ НА ДВЕ ДВЕРИ: открытие кропа и выбор формы чипом обязаны давать ОДНУ И ТУ ЖЕ
   * рамку — иначе «взял кроп при выбранном 1:1» и «взял кроп, потом нажал 1:1» давали бы разное,
   * и человек не смог бы сказать, какое из двух правильное.
   */
  const cropQuadFor = (r: number | null): Quad => {
    const sheet = quadFromRect(0, 0, PLATE_W, plateH);
    return r === null ? sheet : fitQuadRatio(sheet, r, 'fit', [0.5, 0.5]);
  };

  /** Рамка кадра — по нынешним границам платы. Тянуть наружу больше её, внутрь — меньше. */
  const openCropFrame = () => {
    const quad = cropQuadFor(cropRatio);
    putFrame({ owner: 'crop', quad, axis: true, snapshot: quad });
    setFrameHover(null);
  };

  /**
   * ВЫБРАТЬ ОТНОШЕНИЕ СТОРОН КАДРА (E-18).
   *
   * ⚠ ФОРМА СЧИТАЕТСЯ ОТ ЛИСТА, А НЕ ОТ НЫНЕШНЕЙ РАМКИ, И ЭТО ДВА РАЗНЫХ ДЕФЕКТА СРАЗУ.
   *
   * От рамки «по площади»: 16:9 на листе 4:5 дал бы рамку ШИРЕ ЛИСТА (1490 при 1000) — то есть
   * простой выбор формы, не тронув ни одной ручки, ПРЕДЛОЖИЛ БЫ НАРАСТИТЬ бумагу на четверть с
   * каждой стороны. Кроп умеет расти, но растить обязан ЧЕЛОВЕК рукой, а не выпадающий выбор.
   *
   * От рамки «по стороне»: 16:9 → 9:16 → 16:9 не вернулось бы туда, откуда ушло, — каждое
   * переключение отгрызало бы кусок, и через три нажатия рамка схлопывалась бы в щель.
   *
   * От ЛИСТА обе беды исчезают разом: результат зависит только от названной формы, значит он
   * повторим и обратим, и он по построению внутри бумаги. Ровно так ведёт себя выбор пресета у
   * фотошопного кропа.
   */
  const chooseCropRatio = (r: number | null) => {
    setCropRatio(r);
    const fr = frameRef.current;
    if (!fr || fr.owner !== 'crop' || r === null) return;
    putFrame({ ...fr, quad: cropQuadFor(r) });
  };

  const closeFrame = () => {
    frameDrag.current = null;
    putFrame(null);
    setFrameHover(null);
  };

  /**
   * ПОСТАВИТЬ — Enter или клик мимо. У каждого хозяина своё «поставить», и это ТРИ РАЗНЫХ ГЛАГОЛА
   * под одним жестом, а не один: шаблон запирается, вставка ложится в документ одним шагом ленты,
   * кадр применяется необратимо. Общим здесь остаётся только то, что рамка после этого исчезает.
   */
  const commitFrame = () => {
    const fr = frameRef.current;
    if (!fr) return;
    if (fr.owner === 'backdrop') {
      const b = backdropRef.current;
      closeFrame();
      /* ТОЖДЕСТВЕННАЯ СЕТКА НЕ СОХРАНЯЕТСЯ. Заглянув в режим warp и выйдя, человек не изменил
         ничего — а записанная «на всякий случай» единичная сетка перевела бы показ шаблона с
         резкого `img` + `matrix3d` на канвас навсегда. Пессимизация без причины и есть враньё. */
      if (b) {
        putBackdrop(setBackdropLocked(setBackdropGrid(setBackdropQuad(b, fr.quad), keptGrid(fr.grid)), true));
      }
      return;
    }
    if (fr.owner === 'paste') {
      void commitFloat(fr);
      return;
    }
    void applyCropFrame(fr);
  };

  /**
   * ОТМЕНИТЬ — Esc и ⌘Z над живой рамкой.
   *
   * Возвращается СНИМОК НА ОТКРЫТИИ, а не предыдущий шаг ручки: трансформ — один жест, сколько бы
   * раз рука ни бралась за ручки, и «отменить его наполовину» не значит ничего. У вставки отмены
   * нет вовсе — есть отказ: непоставленный кусок просто исчезает, документа он не касался.
   */
  const cancelFrame = () => {
    const fr = frameRef.current;
    if (!fr) return;
    closeFrame();
    if (fr.owner === 'backdrop') {
      const b = backdropRef.current;
      /* СНИМОК ВКЛЮЧАЕТ СЕТКУ. Вернув один квад, отмена возвращала бы постановку и оставляла
         искривление — то есть отменяла бы ровно половину того, что человек сделал. */
      if (b) {
        const back = keptGrid(fr.snapshotGrid);
        putBackdrop(setBackdropLocked(setBackdropGrid(setBackdropQuad(b, fr.snapshot), back), true));
      }
      return;
    }
    if (fr.owner === 'paste') {
      showMessage('the pasted piece was dropped — the drawing was never touched', 'success');
      return;
    }
    setTool('select');
  };
  cancelFrameRef.current = cancelFrame;
  commitFrameRef.current = commitFrame;
  openBackdropFrameRef.current = (b: Backdrop) => openBackdropFrame(b, false);

  /**
   * ⚠ ПЕРЕД ЛЮБЫМ ПИСАТЕЛЕМ ДОКУМЕНТА — ПОСТАВИТЬ ЖИВУЮ ВСТАВКУ.
   *
   * Сохранение, удаление внутри области и вторая вставка обязаны идти по ОДНОЙ дороге: либо кусок
   * поставлен, либо его нет. Молчаливое сохранение при живом флоате означало бы картинку, на
   * которой человек своими глазами видел вставку, а на сервере её нет.
   */
  const settleFloatFirst = async () => {
    const fr = frameRef.current;
    if (fr?.owner === 'paste') await commitFloat(fr);
  };

  /* ═══ ВСТАВКА: ПОСТАВИТЬ ФЛОАТ В ДОКУМЕНТ (G-13) ══════════════════════════════════════════
   *
   * ОДИН ШАГ ЛЕНТЫ НА ОБА МАТЕРИАЛА — тем же `recordCombined`, что у «удалить внутри»: записанные
   * порознь, они требовали бы двух ⌘Z, и первое нажатие оставляло бы состояние, которого никто не
   * создавал (линии вернулись, вставленные пиксели остались).
   */
  const commitFloat = async (fr: FrameState) => {
    const f = fr.float;
    closeFrame();
    if (!f || frozenRef.current) return;
    const map = warpMapper({ quad: fr.quad });
    const toFrac = (p: readonly [number, number]): [number, number] => [p[0] / PLATE_W, p[1] / plateH];

    /**
     * ТОЛЩИНА НИТИ УМНОЖАЕТСЯ НА КОРЕНЬ ИЗ ОТНОШЕНИЯ ПЛОЩАДЕЙ, и это НАЗВАННАЯ АППРОКСИМАЦИЯ.
     * Формат несёт ОДНУ толщину на штрих; под перспективой честная толщина менялась бы вдоль
     * линии, и выразить это нечем. Альтернатива — растеризовать штрихи при перспективной вставке —
     * отвергнута: она молча превращает правимые линии в пиксели.
     */
    const srcArea = Math.max(1e-9, f.srcW * PLATE_W * f.srcH * plateH);
    const b = quadBounds(fr.quad);
    const gaugeK = Math.sqrt(Math.max(1e-9, (b.x1 - b.x0) * (b.y1 - b.y0)) / srcArea);

    const linesBase = strokesRef.current;
    const born = f.strokes.map((st) => {
      const out: VectorStroke = {
        ...st,
        pts: st.pts.map(([u, v]) => toFrac(map(u, v))),
        gauge: clampGauge(strokeGauge(st) * gaugeK),
        weight: gaugeWeight(clampGauge(strokeGauge(st) * gaugeK)),
      };
      if (st.segs) {
        out.segs = st.segs.map((seg) =>
          seg
            ? ((): [number, number, number, number] => {
                const a = toFrac(map(seg[0], seg[1]));
                const c = toFrac(map(seg[2], seg[3]));
                return [a[0], a[1], c[0], c[1]];
              })()
            : null,
        );
      }
      if (st.step !== undefined) out.step = clampStep(st.step * gaugeK);
      return out;
    });
    const next = born.length ? [...linesBase, ...born] : linesBase;

    const layer = f.cut ? await ensureRaster() : rasterRef.current;
    if (frozenRef.current) return;

    let put: (() => void) | null = null;
    if (layer && f.cut) {
      const cut = f.cut;
      const kx = layer.w / PLATE_W;
      const ky = layer.h / plateH;
      const quadPx = fr.quad.map((p) => [p[0] * kx, p[1] * ky] as [number, number]) as unknown as Quad;
      // Коробка размечается ДО записи: лента снимает «как было» по ней, и пустая коробка означала
      // бы шаг, ничего не восстанавливающий.
      const corners = [
        map(f.cutRegion.u0, f.cutRegion.v0),
        map(f.cutRegion.u1, f.cutRegion.v0),
        map(f.cutRegion.u1, f.cutRegion.v1),
        map(f.cutRegion.u0, f.cutRegion.v1),
      ];
      const xs = corners.map((p) => p[0] * kx);
      const ys = corners.map((p) => p[1] * ky);
      const x0 = Math.max(0, Math.floor(Math.min(...xs)) - 1);
      const y0 = Math.max(0, Math.floor(Math.min(...ys)) - 1);
      const x1 = Math.min(layer.w - 1, Math.ceil(Math.max(...xs)) + 1);
      const y1 = Math.min(layer.h - 1, Math.ceil(Math.max(...ys)) + 1);
      clearGesture(layer);
      if (x1 >= x0 && y1 >= y0) {
        markRect(layer, [x0, y0, x1, y1]);
        put = () =>
          drawWarped(
            rasterCtx(layer.doc),
            cut,
            cut.width,
            cut.height,
            { quad: quadPx },
            f.cutRegion,
          );
      }
    }

    const done = timeline.current.recordCombined(layer, linesBase, next, born.length > 0, put);
    if (layer) {
      clearGesture(layer);
      paintView();
    }
    if (done.pixels) {
      rasterDirtyRef.current = true;
      setRasterDirty(true);
    }
    if (done.lines) {
      strokesRef.current = next;
      setStrokes(next);
    }
    if (done.lines || done.pixels) {
      bumpTl();
      showMessage('placed', 'success');
      return;
    }
    showMessage('the pasted piece held nothing that could be put down here', 'error');
  };

  /* ═══ КРОП: РАМКА КАДРА ПРИМЕНЯЕТСЯ (G-4) ═════════════════════════════════════════════════
   *
   * ⚠ ОДИН ЖЕСТ, ОБА НАПРАВЛЕНИЯ. Наружу — лист прирастает, внутрь — отрезается, и никакого
   * второго органа для второго направления нет: у фотошопного кропа его тоже нет, а прежний ряд
   * «множитель + девять якорей + кнопка» просил человека посчитать в уме то, что рамка показывает.
   *
   * ⚠ ШТРИХИ РЕЖУТСЯ ДО ПЕРЕСЧЁТА, И БЕЗ ЭТОГО КРОП МОЛЧА ГНУЛ БЫ ЛИНИИ. Координата за 0..1
   * клампится `readPoint` при следующем чтении слоя — линия, ушедшая за кадр, вернулась бы
   * ПРИЖАТОЙ К КРОМКЕ. Резка идёт той же машинерией, что «скопировать внутри»: то, что внутри
   * рамки, остаётся; пересечённые штрихи делятся по её краю.
   *
   * ⚠ ЛЕНТА ОТМЕНЫ БОЛЬШЕ НЕ СНОСИТСЯ (круг 15, J-34: «ctrl z после кропа не работает»). Довод
   * G-4 — «шаги ленты адресуют пиксели СТАРОГО холста» — не смягчён, а закрыт четвёртым родом шага
   * `sheet`, который старый холст УДЕРЖИВАЕТ объектом и возвращает раньше, чем до шагов под ним
   * дойдёт очередь. См. `recordSheet` в `vector-raster-history.ts`.
   *
   * ⚠ БЕЗ ХОЛСТА КРОП НЕ ПЛАНИРУЕТСЯ ВОВСЕ, ПОКА ПОД ПЛАТОЙ ЕСТЬ КАРТИНКА. Это ВТОРОЙ сторож, и
   * он обязателен: `switchTool` заводит холст АСИНХРОННО, а Enter приходит от клавиатуры и может
   * прийти раньше. Ветка `layer === null` остаётся законной ровно для рисунка с нуля
   * (`baseMediaId === 0`), где растягивать нечего, а штрихи пересчитываются честно.
   */
  const applyCropFrame = async (fr: FrameState) => {
    if (frozenRef.current) return;
    if (baseMediaId > 0 && !rasterRef.current) {
      const seeded = await ensureRaster();
      if (!seeded) {
        closeFrame();
        setTool('select');
        showMessage(
          'the sheet was not changed: the pixel layer could not be started, and growing the sheet without it would only stretch the picture instead of adding room. The reason stands above the canvas',
          'error',
        );
        return;
      }
    }
    const layer = rasterRef.current;
    const from = layer
      ? { w: layer.w, h: layer.h }
      : { w: RASTER_FALLBACK_W, h: Math.round(RASTER_FALLBACK_W / (ratio || DEFAULT_RATIO)) };
    const b = quadBounds(fr.quad);
    const rect = {
      x0: (b.x0 / PLATE_W) * from.w,
      y0: (b.y0 / plateH) * from.h,
      x1: (b.x1 / PLATE_W) * from.w,
      y1: (b.y1 / plateH) * from.h,
    };
    const same =
      Math.abs(rect.x0) < 0.5 &&
      Math.abs(rect.y0) < 0.5 &&
      Math.abs(rect.x1 - from.w) < 0.5 &&
      Math.abs(rect.y1 - from.h) < 0.5;
    if (same) {
      closeFrame();
      setTool('select');
      showMessage('the frame is exactly the sheet — nothing to crop or grow', 'error');
      return;
    }
    const plan = planFrame(from, rect);
    const cuts = framePlanCuts(from, rect);

    // Незавершённые жесты отменяются ДО пересчёта: перо, след руки и источник штампа держат
    // координаты, которых после кропа уже нет.
    if (penRef.current) putPen(null);
    putPenHover(null);
    putTrace(null);
    putNodeEdit(null);
    setStampSrc(null);
    stampOffset.current = null;
    /* И ТОЧКА ОТРЫВА ТОЖЕ. Она хранится ДОЛЯМИ кадра, а кроп пересчитывает сам кадр: доля 0.8
       старого листа — это другое место нового, и Shift-клик провёл бы прямую откуда попало.
       Тот же довод, по которому здесь же гасится источник штампа. */
    lastMark.current = null;
    setNibHover(null);
    closeFrame();

    try {
      const kept = cuts
        ? copyInsideSelection(
            strokesRef.current,
            [
              [b.x0 / PLATE_W, b.y0 / plateH],
              [b.x1 / PLATE_W, b.y0 / plateH],
              [b.x1 / PLATE_W, b.y1 / plateH],
              [b.x0 / PLATE_W, b.y1 / plateH],
            ],
            [0, 0],
          )
        : strokesRef.current;
      const nextStrokes = expandStrokes(kept, plan);
      const beforeStrokes = strokesRef.current;
      const beforeRatio = ratio;
      const beforeExpanded = expandedRef.current;
      if (layer) {
        /* НОВЫЙ ХОЛСТ — НОВЫЙ ОБЪЕКТ; старый уходит в ленту ЖИВЫМ, а не копией: шаги ниже по
           стопке адресуют его пиксели, и отмена обязана вернуть им ИМЕННО их холст. */
        rasterRef.current = expandRasterLayer(layer, plan, cropFill, RASTER_MAX_W);
      }
      strokesRef.current = nextStrokes;
      setStrokes(nextStrokes);
      /* ОБЛАСТИ СНИМАЮТСЯ ЦЕЛИКОМ, И ЭТО СКАЗАНО. Пересчитанная область, половина которой лежала
         за новым краем, стала бы дорожкой вокруг того, чего больше нет; одно правило на оба
         направления жеста честнее двух похожих. */
      setSel(null);
      /* ⚠ И СНЯТАЯ ЗАБЫВАЕТСЯ ТОЖЕ — ЗДЕСЬ ЭТО НЕ ПОТЕРЯ, А ЕДИНСТВЕННОЕ ВЕРНОЕ. Резка меняет
         размер платы, а точки области хранятся в ЕЁ единицах; вернувшись по ⇧⌘D после кропа, они
         легли бы по другой высоте — дорожка вокруг того, чего там нет. Область снимается «целиком»
         именно в этом смысле: и с экрана, и из памяти отмены. */
      lastDropped.current = null;
      pressDropped.current = false;
      maskRef.current = null;
      expandedRef.current = true;
      setExpanded(true);
      setRatio(plan.ratio);
      timeline.current.recordSheet({
        beforeLayer: layer,
        afterLayer: rasterRef.current,
        beforeStrokes,
        afterStrokes: nextStrokes,
        beforeRatio,
        afterRatio: plan.ratio,
        beforeExpanded,
        afterExpanded: true,
      });
      bumpTl();
      rasterDirtyRef.current = true;
      setRasterDirty(true);
      setSelected(null);
      paintView();
      fitPlate();
      setTool('select');
      showMessage(
        `the sheet is now ${plan.to.w}×${plan.to.h}${cuts ? ' — what fell outside the frame was cut, areas were dropped' : ''}. ⌘Z brings the old sheet back; as it stands it survives only as a NEW picture — use “save as a new picture”`,
        'success',
      );
    } catch (err) {
      if (err instanceof ExpandGuardError) {
        showMessage(
          `the sheet was not changed: a stroke carries a field this screen does not know how to move (${err.unknownKeys.join(', ')}). Nothing was changed`,
          'error',
        );
        return;
      }
      throw err;
    }
  };

  /* ═══ НАПРАВЛЯЮЩИЕ: ТРИ ПОЛОВИНЫ ОДНОГО ЖЕСТА (E-17) ══════════════════════════════════════
   *
   * Вытянуть из линейки, подвинуть на листе, вернуть на линейку — это ОДИН жест указателя с тремя
   * дверьми, и все три сведены сюда, потому что состояние у них общее (`guideDrag`). Порознь
   * первая из них (нажатие на линейку) жила бы в разметке, вторая — в движении сцены, третья — в
   * отпускании, и «что сейчас в руке» пришлось бы выводить в трёх местах по-разному.
   */

  /** Долю листа под указателем вдоль поперечной оси направляющей. */
  const guideAtPointer = (
    e: { clientX: number; clientY: number },
    dir: 'h' | 'v',
    skip: number,
  ): number => {
    const f = frameAtFree(e);
    const raw = dir === 'h' ? f[1] : f[0];
    /* ⚠ ДОПУСК ПРИВЯЗКИ ПЕРЕВОДИТСЯ В ДОЛИ ТОЙ ЖЕ ОСИ. Плата не квадрат: один допуск «в долях»
       на обе оси притягивал бы по вертикали 4:5-листа на четверть сильнее, чем по горизонтали. */
    const span = dir === 'h' ? plateH : PLATE_W;
    const tol = GUIDE_SNAP_PX / (viewRef.current.zoom || 1) / Math.max(1e-6, span);
    /* ⚠ САМА СЕБЯ НЕ ПРИТЯГИВАЕТ. Живая направляющая лежит в том же списке, и без выброса она
       прилипла бы к своему прошлому положению — то есть перестала бы двигаться вовсе. */
    const others = guidesRef.current.filter((_, i) => i !== skip);
    return clamp01(snapFrac(others, dir, raw, tol));
  };

  /**
   * ═══ КОНЕЦ ЛИНИИ ПРИТЯГИВАЕТСЯ К РАЗМЕТКЕ (E-17) ════════════════════════════════════════
   *
   * ⚠ ТОЛЬКО ЛИНИЯ, И ЭТО ГРАНИЦА, А НЕ НЕДОДЕЛКА. Направляющая существует, чтобы ПОСТАВИТЬ
   * что-то точно; линия — единственный инструмент, у которого «точно» выражается двумя точками.
   * След руки и кисть притягивать нельзя вовсе: у них сотня точек, и притянутая середина мазка
   * означала бы, что рисунок сам себя правит там, где рука его не вела.
   *
   * ⚠ ПРИТЯГИВАЕТ ТОЛЬКО К ВИДИМОМУ. Опорных долей листа (`GUIDE_MARKS` — кромки и середина)
   * здесь нет нарочно: невидимая привязка — это рука, которую держат, не показав чем. У самой
   * направляющей они есть, потому что там на экране виден хотя бы результат — линия встала.
   */
  const snapDraw = (p: [number, number]): [number, number] => {
    if (!rulersOn || !guidesRef.current.length) return p;
    const k = viewRef.current.zoom || 1;
    return [
      snapFrac(guidesRef.current, 'v', p[0], GUIDE_SNAP_PX / k / PLATE_W, []),
      snapFrac(guidesRef.current, 'h', p[1], GUIDE_SNAP_PX / k / plateH, []),
    ];
  };

  /** Указатель стоит на одной из линеек — по координатам ЭКРАНА, а не мира. */
  const overRuler = (e: { clientX: number; clientY: number }): boolean => {
    const vp = viewportRef.current;
    if (!vp) return false;
    const r = viewportRect(vp);
    return e.clientX - r.left < RULER_PX || e.clientY - r.top < RULER_PX;
  };

  /**
   * НАЖАЛИ НА ЛИНЕЙКУ — РОДИЛАСЬ НАПРАВЛЯЮЩАЯ И СРАЗУ ПОЕХАЛА ЗА РУКОЙ.
   *
   * ⚠ ЗАХВАТ СТАВИТСЯ НА ВЬЮПОРТ, А НЕ НА САМУ ЛИНЕЙКУ. Захваченный линейкой указатель слал бы
   * ей же и движение, и отпускание — то есть жест, вышедший за 16 пикселей полосы (а он выходит
   * весь), обрывался бы на первом кадре. Вьюпорт ведёт указатель для всего редактора; сюда
   * приходит ровно одна дверь.
   */
  const beginGuideFromRuler = (event: React.PointerEvent<HTMLCanvasElement>, dir: 'h' | 'v') => {
    if (event.button !== 0) return;
    event.preventDefault();
    event.stopPropagation();
    const vp = viewportRef.current;
    const want: Guide = { dir, at: guideAtPointer(event, dir, -1) };
    const born = addGuide(guidesRef.current, want);
    const grab = () => {
      try {
        vp?.setPointerCapture?.(event.pointerId);
      } catch {
        /* Захват — удобство, а не условие: без него жест доживёт до выхода за вьюпорт и
           оборвётся отпусканием, что честнее, чем не начаться вовсе. */
      }
    };
    if (born === guidesRef.current) {
      /**
       * ⚠ ДВА ОТКАЗА С РАЗНЫМ СМЫСЛОМ, И НИ ОДИН ИЗ НИХ НЕ «НИЧЕГО НЕ ПРОИЗОШЛО».
       *
       * ТАМ УЖЕ ЕСТЬ ТАКАЯ — берём ЕЁ в руку и ведём дальше. Родиться направляющая обязана в
       * точке под указателем, а указатель в этот миг стоит НА ЛИНЕЙКЕ, то есть за кромкой листа:
       * доля клампится в 0 (или 1) и садится на опорную. Значит стоит человеку однажды прижать
       * направляющую к кромке — и следующий жест от той же линейки упирался бы в совпадение и
       * МОЛЧА не делал бы ничего. Пустой жест — тот самый дефект, который этот редактор чинит по
       * кругу; здесь он закрыт тем, что жест продолжается той направляющей, что уже есть.
       *
       * ПОТОЛОК — говорит. Жест, «не сработавший» на тридцать третьей, неотличим от сломанного
       * редактора: на экране ничего, и причина не названа нигде.
       */
      const twin = sameSpot(guidesRef.current, want);
      if (twin >= 0) {
        grab();
        guideDrag.current = { id: event.pointerId, index: twin, dir };
        return;
      }
      showMessage(`${MAX_GUIDES} guides is all one sheet holds — «clear guides» empties it`, 'error');
      return;
    }
    grab();
    writeGuides(born, false);
    guideDrag.current = { id: event.pointerId, index: born.length - 1, dir };
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

    /**
     * ЖИВАЯ РАМКА СПРАШИВАЕТСЯ ПЕРВОЙ — РАНЬШЕ ПИПЕТКИ И РАНЬШЕ ЛЮБОГО ИНСТРУМЕНТА.
     *
     * Рамка — это РЕЖИМ, а не орган: пока она на экране, экран занят постановкой, и рисовать по
     * ней нельзя — иначе первый же штрих лёг бы поверх того, что человек ещё двигает. Так ведёт
     * себя всякий трансформ: он забирает холст целиком, пока его не поставили.
     *
     * КЛИК МИМО СТАВИТ И ПРОГЛАТЫВАЕТСЯ — тоже дословно по фотошопу. Проглатывается потому, что
     * этот же клик иначе положил бы штрих в то место, куда человек ткнул, чтобы ЗАКОНЧИТЬ жест.
     * У кропа выхода «мимо» нет вовсе: применение необратимо, и промах мышью не имеет права его
     * запускать — там ставят только Enter или двойной клик.
     */
    const fr = frameRef.current;
    if (fr && !frozen) {
      const p = plateAt(event);
      const hit = frameHitAt(fr, p);
      if (hit) {
        event.preventDefault();
        vp.setPointerCapture?.(event.pointerId);
        const c = quadCenter(fr.quad);
        frameDrag.current = {
          id: event.pointerId,
          startGrid: fr.grid,
          mode:
            hit.kind === 'node'
              ? 'node'
              : hit.kind === 'rotate'
                ? 'rotate'
                : hit.kind === 'body'
                  ? 'move'
                  : (event.metaKey || event.ctrlKey) &&
                      !fr.axis &&
                      CORNER_HANDLES.includes(hit.handle)
                    ? 'pin'
                    : 'scale',
          handle: hit.kind === 'body' ? -1 : hit.handle,
          startQuad: fr.quad,
          startAt: p,
          startDeg: (Math.atan2(p[1] - c[1], p[0] - c[0]) * 180) / Math.PI,
        };
        setFrameHover(hit);
        return;
      }
      event.preventDefault();
      if (fr.owner !== 'crop') commitFrame();
      return;
    }

    // ПИПЕТКА СТАРШЕ ЛЮБОГО ИНСТРУМЕНТА: пока она взведена, клик берёт цвет и НИЧЕГО не рисует.
    // Так же ведёт себя alt-пипетка кисти в фотошопе — жест один, и он не оставляет следа.
    if (picking) {
      event.preventDefault();
      void takeInkAt(at);
      return;
    }

    /**
     * ═══ ВЗЯТЬ НАПРАВЛЯЮЩУЮ — ТОЛЬКО СТРЕЛКОЙ И РУКОЙ (E-17) ══════════════════════════════
     *
     * ⚠ ИНСТРУМЕНТЫ ЗДЕСЬ НАЗВАНЫ ПОИМЁННО, И ЭТО ГЛАВНОЕ РЕШЕНИЕ ЖЕСТА. Направляющая — тонкая
     * линия, а полоса захвата вокруг неё шире неё самой; отдай ей нажатие ОТ ЛЮБОГО инструмента,
     * и человек, ведущий шов ВДОЛЬ разметки (то есть ровно то, ради чего он её и поставил), вместо
     * штриха утащил бы саму разметку. У фотошопа то же правило и по той же причине: направляющую
     * берёт `Move`, а не кисть. `select` — наша стрелка, и клавиша у неё та же `v`.
     *
     * ⚠ РУКИ (`pan`) В ЭТОМ СПИСКЕ НЕТ, И ЭТО НЕ ЗАБЫВЧИВОСТЬ: панорама уходит ранним `return`
     * в самом начале обработчика, вместе со средней кнопкой и зажатым пробелом. Названная здесь,
     * она была бы мёртвой строкой, обещающей жест, который сюда не доходит.
     *
     * Замороженный слой не исключение: разметка не документ, её можно двигать и на «read-only» —
     * тем же правилом, по которому там живут зум и вписывание.
     */
    if (rulersOn && tool === 'select' && guidesRef.current.length) {
      const idx = hitGuide(
        guidesRef.current,
        plateAt(event),
        plateRect,
        GUIDE_GRAB_PX / (viewRef.current.zoom || 1),
      );
      if (idx >= 0) {
        event.preventDefault();
        vp.setPointerCapture?.(event.pointerId);
        guideDrag.current = { id: event.pointerId, index: idx, dir: guidesRef.current[idx].dir };
        return;
      }
    }

    if (tool === 'select') {
      /**
       * УЗЕЛ СТАРШЕ ШТРИХА. Кривая уже выбрана — значит рука целится в её узел или рукоятку, а не
       * в саму линию; попадание мимо всех узлов означает «выбираю другую линию» и уходит ниже.
       */
      const ne = nodeEditRef.current;
      if (ne && !frozen) {
        const r = editDown(ne, at, penWorld(), { alt: event.altKey });
        if (r.took) {
          event.preventDefault();
          vp.setPointerCapture?.(event.pointerId);
          if (r.st.dirty) commitNodes(r.st);
          else putNodeEdit(r.st);
          return;
        }
      }
      const hit = hitStroke(strokes, at, PLATE_W, plateH, HIT_PX / (viewRef.current.zoom || 1));
      setSelected(hit);
      // Взяли линию — сразу открыли её узлы: отдельного «войти в правку» нет, потому что и не
      // нужно. У линии без кривизны узлы тоже есть, править их так же законно.
      putNodeEdit(hit === null ? null : editBegin(strokesRef.current, hit));
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
    if (needsRaster(tool) && !rasterRef.current) {
      showMessage('the pixel layer is not ready yet — one moment', 'error');
      void ensureRaster();
      return;
    }
    event.preventDefault();
    // Capture on the VIEWPORT: the pointer routinely leaves the box mid-drag and without capture
    // the stroke would end wherever it crossed the border.
    vp.setPointerCapture?.(event.pointerId);

    /**
     * ЗАПЛАТКА — ДВУХФАЗНЫЙ ЖЕСТ, ДОСЛОВНО ПО ФОТОШОПУ (G-12).
     *
     * Первый драг ВНЕ области рисует контур (тем же лассо: второго построителя областей в
     * редакторе нет и не будет — растушёвка, прореживание и резка живут в одном месте). Драг
     * ИЗНУТРИ области тащит её на чистое место, и вот он-то и есть заплатка. Разводит их
     * попадание указателя, а не скрытый режим: человек видит дорожку и видит, внутри он или снаружи.
     */
    if (tool === 'patch') {
      if (sel && pointInPolygon({ x: at[0], y: at[1] }, sel.pts)) {
        patchDrag.current = { id: event.pointerId, from: at };
        const layer = rasterRef.current;
        if (layer) {
          clearGesture(layer);
          // Превью — НЕПРОЗРАЧНАЯ подмена содержимого области, а не мазок: заплатка не кладёт
          // краску поверх, она показывает, ЧТО встанет на место.
          liveRef.current = { mode: 'paint', opacity: 1 };
        }
        return;
      }
    }

    if (tool === 'curve') {
      // Вся механика — в penDown: замыкание по первому якорю, захват рукоятки, новый якорь.
      // МОДИФИКАТОРЫ ЕДУТ ОБЪЕКТОМ, а не голым alt. Прежняя булева форма компилируется и сегодня,
      // и в этом её опасность: Shift (угол кратен 45°) и пробел (двигать сам якорь, не отпуская)
      // были бы мертвы МОЛЧА — «собирается» здесь не значит «работает».
      const res = penDown(penRef.current, frameAtFree(event), penWorld(), {
        alt: event.altKey,
        shift: event.shiftKey,
      });
      if (res.closedNow) {
        // Клик по первому якорю ЗАМКНУЛ контур — путь окончен, коммит немедленный, как в фотошопе.
        penRef.current = res.pen;
        commitPen();
        return;
      }
      putPen(res.pen);
      return;
    }
    if (tool === 'fill') {
      void fillAt(at);
      return;
    }
    if (smears(tool)) {
      // Смещение штампа фиксируется ПЕРВОЙ точкой мазка и держится до следующего alt-клика — это и
      // есть режим Aligned, тот, что у фотошопа стоит по умолчанию: несколько мазков продолжают
      // ОДИН отпечаток, а не перерисовывают его от источника каждый раз.
      if (tool === 'stamp' && stampSrc && !stampOffset.current) {
        stampOffset.current = [at[0] - stampSrc[0], at[1] - stampSrc[1]];
      }
      beginRasterGesture(tool);
      /* SHIFT-КЛИК КЛАДЁТ ПРЯМУЮ ОТ ПРОШЛОЙ ТОЧКИ (H-15). Отрезок уходит в буфер ТОГО ЖЕ жеста,
         поэтому протяжка после него продолжает вести от `at`, а отпускание коммитит всё ОДНИМ
         шагом ленты: прямая плюс возможное продолжение руки = один ⌘Z, ровно как в фотошопе.
         Последовательные Shift-клики цепляются сами — каждое отпускание переписывает `lastMark`. */
      const chain = event.shiftKey && lastMark.current?.tool === tool ? lastMark.current.at : at;
      /* SHIFT-ЛИНИЯ ОСТАЁТСЯ ПРЯМОЙ — её и просили прямой (H-15), сглаживать здесь нечего.
         Точка без протяжки — тоже отпечаток: клик кистью обязан оставить пятно. */
      growRasterGesture(tool, [chain, at]);
      dabSamples.current = [at];
    }
    /**
     * ═══ ПРЕЖНЯЯ ОБЛАСТЬ СНИМАЕТСЯ НА НАЖАТИИ, А НЕ НА ОТПУСКАНИИ (H-2) ═══════════════════════
     *
     * Владелец: «простой клик в одну точку снимает старое и если после клика ведем курсором то уже
     * содаем новое выделение». СНИМАЕТ — НА КЛИКЕ, то есть на НАЖАТИИ; ведение после него уже
     * строит новую. Решение принималось на ОТПУСКАНИИ (`settleLasso` ниже), и потому весь драг на
     * экране жили ДВЕ области разом: у прежней рисовались бегущие муравьи, у новой — живой
     * залитый контур. Ровно то, что эта просьба запрещает, и видно это было именно во время жеста,
     * а не после него.
     *
     * ⚠ ГАСИТСЯ ТОЛЬКО ПОД ЛАССО И ЗАПЛАТКОЙ, И ЭТО НЕ ОСТОРОЖНОСТЬ, А ГРАНИЦА СМЫСЛА. `sel` —
     * НЕ ТОЛЬКО ВЫДЕЛЕНИЕ, ОН ЖЕ МАСКА: он режет след кисти на куски и собирает `maskRef` («куда
     * пускать кисть» X-6, «насколько мягок край» X-5). Снять его на нажатии ЛЮБЫМ инструментом
     * значило бы молча отменить ограничение, которое человек поставил руками, — и следующий мазок
     * лёг бы ровно там, где экран только что обещал его удержать. Кисть сюда доходит тоже
     * (`smears(tool)` выше), поэтому условие названо инструментами, а не «всегда».
     *
     * Заплатка входит в список законно: драг ИЗНУТРИ области тащит её и вышел раньше по `return`,
     * значит сюда она доходит только press-ом СНАРУЖИ — а это рисование новой обводки.
     *
     * Ветка «клик без протяжки» на отпускании после этого ничего не снимает — снимать уже нечего.
     * Она оставлена как есть: там живёт довод про то, почему место клика больше ни на что не влияет.
     */
    /* ⚠ ЧЕРЕЗ `dropSel`, А НЕ `setSel(null)`. Снимать надо на нажатии (это просьба владельца), но
       снятая область ОБЯЗАНА запоминаться: иначе нулевой по длине press — то есть обычный клик —
       уносил бы минуту обводки насовсем, потому что отпускание не находит, что сохранять, и ⇧⌘D
       возвращать уже нечего. `dropSel` — единственное место, где живёт «снятая помнится». */
    if (tool === 'lasso' || tool === 'patch') pressDropped.current = dropSel();
    /* НАЧАЛО ЛИНИИ ПРИТЯГИВАЕТСЯ ТАК ЖЕ, КАК КОНЕЦ. Притянуть один конец из двух значило бы, что
       отрезок, начатый на направляющей, ложится рядом с ней — и человек узнаёт об этом, только
       приблизив. */
    putTrace([tool === 'line' ? snapDraw(at) : at]);
  };

  const onStagePointerMove = (event: React.PointerEvent<HTMLDivElement>) => {
    /* ГДЕ РУКА СТОИТ — ПИШЕТСЯ ПЕРВОЙ СТРОКОЙ, ДО ВСЯКОЙ ВЕТКИ. Половина веток ниже выходит
       ранним `return` (протяжка рамки, панорама, перо), и запись в конце означала бы, что после
       панорамы рукой превью пересчитывать не от чего. */
    lastClient.current = { x: event.clientX, y: event.clientY };
    /* НИТИ НА ШКАЛАХ ИДУТ ЗА РУКОЙ ВСЕГДА, какой бы жест ни был в работе: линейка отвечает на
       вопрос «где я», а он не зависит от того, что сейчас в руке. */
    if (rulersOn) moveRulerMarks(event.clientX, event.clientY);
    /**
     * НАПРАВЛЯЮЩАЯ В РУКЕ ЗАБИРАЕТ ДВИЖЕНИЕ ЦЕЛИКОМ — тем же правилом, что живая рамка: пока её
     * ведут, экран занят ею, и рисовать под ней нечем.
     */
    const gd = guideDrag.current;
    if (gd && event.pointerId === gd.id) {
      const at = guideAtPointer(event, gd.dir, gd.index);
      const cur = guidesRef.current[gd.index];
      if (cur && cur.at !== at) {
        writeGuides(
          guidesRef.current.map((g, i) => (i === gd.index ? { dir: gd.dir, at } : g)),
          false,
        );
      }
      return;
    }
    const fd = frameDrag.current;
    const fr = frameRef.current;
    if (fd && fr && event.pointerId === fd.id) {
      const p = plateAt(event);
      /**
       * ДРАГ УЗЛА СЕТКИ (H-4) — КВАД НЕ ТРОГАЕТСЯ ВОВСЕ. Точка руки переводится в ДОМЕН квада
       * обратной гомографией: сетка задана там, и класть в неё юниты платы значило бы завести
       * второй набор координат под одним именем. Вырожденный квад отдаёт `null` — жест молча
       * не делает ничего, а не пишет NaN, из которого сетку уже не вернуть.
       */
      if (fd.mode === 'node') {
        if (!gridIsUsable(fr.grid)) return;
        const dom = quadToDomain(fd.startQuad, p);
        if (!dom) return;
        const next = moveGridNode(fr.grid, fd.handle, dom);
        /**
         * ⚠ УЗЕЛ УПИРАЕТСЯ В ЛИНИЮ СХОДА, КАК В СТЕНУ, И СТЕНА СТОИТ НЕ ЗДЕСЬ, А У ДВЕРИ.
         *
         * Кламп домена (`moveGridNode`) держит контрольные точки в `[-1, 2]`, но ГДЕ ГОРИЗОНТ, он
         * не знает: у перспективного квада линия схода лежит ВНУТРИ этого домена. Обычный драг
         * узла 14 в точку листа (20, 80) — точку, лежащую на бумаге, — просил у браузера холст
         * 195146 × 291827, шаблон исчезал целиком (яркость окна над ним 203.89 → 249.25), и
         * вернуть его могли только «flatten» или Esc, то есть только ценой всего искривления.
         *
         * ⚠ ПРОВЕРКА СТОЯЛА ЗДЕСЬ СТРОКОЙ И ПОТОМУ НЕ СТОЯЛА НИГДЕ. Она стерегла ОДИН жест из
         * пяти; ⌘-пин угла над тем же мешем писал квад мимо неё и рвал поверхность ровно так же
         * (замерено, см. `frameCrossesHorizon`). Теперь правило живёт в `putFrame` — единственной
         * двери к геометрии рамки, — и этот жест проходит через него вместе со всеми остальными:
         * отказанный `putFrame` не пишет ничего, узел остаётся на последнем хорошем месте, рука
         * читает это как стену. Второй копии здесь не появилось НАРОЧНО: копия у места вызова —
         * это ровно тот дефект, который тут чинится.
         */
        putFrame({ ...fr, grid: next });
        return;
      }
      let quad = fr.quad;
      /* Точка, которая обязана стоять на месте, пока рамка меняет форму под запертое отношение
         (E-18). Значение по умолчанию — центр: у сдвига всей рамки ручки нет вовсе. */
      let holdUv: [number, number] = [0.5, 0.5];
      if (fd.mode === 'move') {
        quad = moveQuad(fd.startQuad, p[0] - fd.startAt[0], p[1] - fd.startAt[1]);
      } else if (fd.mode === 'pin') {
        quad = pinQuad(fd.startQuad, CORNER_HANDLES.indexOf(fd.handle), p);
      } else if (fd.mode === 'rotate') {
        const c = quadCenter(fd.startQuad);
        const now = (Math.atan2(p[1] - c[1], p[0] - c[0]) * 180) / Math.PI;
        const want = quadAngleDeg(fd.startQuad) + (now - fd.startDeg);
        quad = rotateQuad(fd.startQuad, event.shiftKey ? snapDeg(want) : want);
      } else {
        /**
         * ЗАПЕРТОЕ ОТНОШЕНИЕ РАБОТАЕТ ТЕМ ЖЕ ОРГАНОМ, ЧТО SHIFT (E-18), И ЭТО НЕ СОВПАДЕНИЕ:
         * «держи форму» — одно правило, названное двумя способами. Разница только в том, ЧТО
         * держится: Shift держит нынешнюю форму рамки, чип — названную.
         *
         * ⚠ `proportional` НЕДОСТАТОЧНО, И БЕЗ ВТОРОЙ ПОЛОВИНЫ ОТНОШЕНИЕ ТЕРЯЛОСЬ БЫ НА ПОЛОВИНЕ
         * ручек: в `scaleQuad` эта ветка живёт только при `movesX && movesY`, то есть у УГЛОВ.
         * Потянув середину стороны, человек менял бы один размер, не трогая второй, — и рамка
         * молча переставала бы быть 4:5, оставаясь подписанной как 4:5.
         */
        quad = scaleQuad(fd.startQuad, fd.handle, p, {
          proportional: event.shiftKey || (fr.axis && cropRatio !== null),
          // Кроп не отражается: перевёрнутая рамка кадра означала бы отрицательный размер листа.
          allowFlip: !fr.axis,
          minSide: MIN_FRAME_SIDE,
        });
        const uv = HANDLE_UV[fd.handle];
        /* ЯКОРЬ — ПРОТИВОПОЛОЖНАЯ РУЧКА. Тянут правую сторону — стоит левая; тянут угол —
           стоит угол напротив. Иначе рамка уезжала бы из-под пальца, который её тянет. */
        if (uv) holdUv = [1 - uv[0], 1 - uv[1]];
        if (fr.axis && cropRatio !== null) {
          quad = fitQuadRatio(quad, cropRatio, uv && uv[0] === 0.5 ? 'h' : 'w', holdUv);
        }
      }
      if (fr.axis) quad = clampCropQuad(quad);
      else quad = keepQuadReachable(quad, plateRect, BACKDROP_KEEP_UNITS);
      /* ⚠ ПОЧИНКА ПОСЛЕ КЛАМПА, И ОНА ТОЧНО НИЧЕГО НЕ ДЕЛАЕТ В ОБЫЧНОМ СЛУЧАЕ. `clampCropQuad`
         режет по потолку роста (×4) СТОРОНАМИ ПОРОЗНЬ и потому имеет право сломать отношение —
         редко, но молча. `fit` берёт наибольший прямоугольник нужной формы ВНУТРИ полученного:
         когда кламп ничего не изменил, `min(w, h·ratio) === w`, и это тождество. */
      if (fr.axis && cropRatio !== null && fd.mode !== 'move') {
        quad = fitQuadRatio(quad, cropRatio, 'fit', holdUv);
      }
      putFrame({ ...fr, quad });
      return;
    }
    /**
     * НАВЕДЕНИЕ НАД ЖИВОЙ РАМКОЙ ЗАБИРАЕТ ДВИЖЕНИЕ ЦЕЛИКОМ, и это то же правило, что у нажатия:
     * пока рамка на экране, курсор говорит про НЕЁ, а не про инструмент в руке. Состояние
     * пишется только при смене рода попадания — иначе каждый кадр протяжки мыши над рамкой
     * перерисовывал бы весь редактор.
     */
    if (fr && !frozen) {
      const hit = frameHitAt(fr, plateAt(event));
      if (!sameHit(hit, frameHover)) setFrameHover(hit);
      return;
    }
    /**
     * ПЕРЕТАСКИВАНИЕ ОБЛАСТИ ЗАПЛАТКОЙ. Превью строится КАЖДЫЙ КАДР заново из документа, а не
     * копится: заплатка не мажет, она ПОДМЕНЯЕТ, и накопленный буфер показывал бы след руки там,
     * где на самом деле встанет одно последнее положение.
     */
    const pd = patchDrag.current;
    if (pd && event.pointerId === pd.id) {
      const now = frameAt(event);
      const off: [number, number] = [now[0] - pd.from[0], now[1] - pd.from[1]];
      setPatchOffset(off);
      const layer = rasterRef.current;
      if (layer) {
        // Смещение ОТРИЦАТЕЛЬНОЕ при отрисовке: в области обязано оказаться то, что лежит ТАМ,
        // куда её тащат, — то есть `scratch(x) = doc(x + Δ)`.
        const s = rasterCtx(layer.scratch);
        s.clearRect(0, 0, layer.w, layer.h);
        s.drawImage(layer.doc, -Math.round(off[0] * layer.w), -Math.round(off[1] * layer.h));
        scheduleView();
      }
      return;
    }
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
      putPen(
        penMove(
          livePen,
          frameAtFree(event),
          { alt: event.altKey, shift: event.shiftKey, space: spaceHeld },
          penWorld(),
        ),
      );
      return;
    }
    if (nodeEditRef.current?.drag) {
      putNodeEdit(
        editMove(
          nodeEditRef.current,
          frameAtFree(event),
          { alt: event.altKey, shift: event.shiftKey },
          penWorld(),
        ),
      );
      return;
    }
    if (tool === 'curve' && livePen) {
      // Резинка: перспективный сегмент от последнего якоря к курсору — кривизна видна ДО клика.
      putPenHover(frameAtFree(event));
      return;
    }
    // НИБ ВИДЕН ДО НАЖАТИЯ. Круг под курсором — единственный способ узнать, что сотрётся, ДО того
    // как оно сотрётся; курсор-крестик про размер ниба не говорит ничего.
    /**
     * РАЗМЕР ПОД КУРСОРОМ — И У ЛИНИЙ ТОЖЕ (Q-8). Круг ниба показывался только пиксельным
     * инструментам; линия, перо и след руки рисовали НИТЬЮ, толщину которой человек мог узнать
     * только нарисовав. Владелец просил показывать размер кисти на наведении — «кисть» здесь и
     * есть то, чем рисует инструмент в руке, какого бы он ни был материала.
     */
    if (isNibTool(tool) || isThreadTool(tool)) setNibHover(frameAt(event));
    if (!traceRef.current) return;
    /**
     * ВСЕ АППАРАТНЫЕ СЭМПЛЫ, А НЕ ОДИН КАДР (круг 15, J-35).
     *
     * Браузер объединяет события указателя в одно на кадр: планшет и трекпад шлют 125-1000 Гц,
     * экран показывает 60. `getCoalescedEvents()` отдаёт объединённые — то, что устройство
     * ДЕЙСТВИТЕЛЬНО прислало. Пока их выбрасывали, путь строился по одной точке на кадр, и на
     * быстрой руке соседние сэмплы отстояли на 10-30 px: угол виден до всякого сплайна.
     *
     * ⚠ У СИНТЕТИЧЕСКОЙ МЫШИ ИХ НЕТ, и это записано в ожиданиях иглы: на стенде Playwright
     * список всегда из одного события, и снятие этой строки НЕ ПОКРАСНЕЕТ ни одной пробы,
     * ходящей через `page.mouse`. Мерить её можно только событием, у которого
     * `getCoalescedEvents` подделан (проба 147b), — и это не обход оракула, а признание того,
     * что стенд не умеет быть планшетом.
     */
    const native = event.nativeEvent as PointerEvent & {
      getCoalescedEvents?: () => PointerEvent[];
    };
    const coalesced = native.getCoalescedEvents?.() ?? [];
    const samples: [number, number][] = (coalesced.length ? coalesced : [event]).map((e) =>
      frameAt({ clientX: e.clientX, clientY: e.clientY }),
    );
    const at = samples[samples.length - 1];
    // A LINE KEEPS TWO POINTS, A TRACE ACCUMULATES. Pushing every sample and slicing at the end
    // looks identical on screen and is not: the thinning pass would then run over a hundred nearly
    // collinear samples and the «straight» line would arrive with a wobble nobody drew.
    {
      const prev = traceRef.current;
      /**
       * ═══ SHIFT: ЛИНИЯ ВЫХОДИТ РОВНОЙ (E-18) ═════════════════════════════════════════════
       *
       * Начало жеста — `prev[0]`: ту же точку положил `putTrace([at])` на нажатии, и заводить ей
       * ВТОРУЮ память значило бы держать два ответа на вопрос «откуда линия», которые разойдутся
       * на первом же жесте, начатом не мышью.
       *
       * ⚠ ДВА МАТЕРИАЛА — ДВА ПОВЕДЕНИЯ, И ЭТО НЕ НЕПОСЛЕДОВАТЕЛЬНОСТЬ, А СЛЕДСТВИЕ ТОГО, ЧЕМ
       * ОНИ РАЗЛИЧАЮТСЯ. Векторная линия каждый кадр СТРОИТСЯ ЗАНОВО из двух точек, поэтому рука
       * вольна перекидывать её между восемью осями сколько угодно — на экране всегда ровно одна
       * последняя. Пиксель ЛОЖИТСЯ НАВСЕГДА: перекинув ось на середине, человек оставил бы на
       * холсте угол из двух мазков и не смог бы стереть половину. Поэтому у мазка ось решается
       * ОДИН РАЗ, на первом заметном движении, и держится до конца жеста — ровно так ведёт себя
       * кисть в фотошопе.
       *
       * ⚠ SHIFT ЧИТАЕТСЯ С УКАЗАТЕЛЯ. Клавиатурный `shiftHeld` этого экрана нужен рейке, а не
       * жесту: он живёт через оконный слушатель и после клика по чипу отстаёт на кадр.
       */
      const straight =
        event.shiftKey &&
        !!prev.length &&
        (tool === 'line' || tool === 'freehand' || smears(tool));
      if (!straight) shiftAxis.current = null;
      const dir = straight
        ? (shiftAxis.current ?? straightDir(prev[0], at, plateH))
        : null;
      if (straight && dir && smears(tool)) shiftAxis.current = dir;
      /* ⚠ SHIFT СТАРШЕ ПРИВЯЗКИ, И ПОРЯДОК ЗДЕСЬ — ЭТО ПРАВИЛО, А НЕ СЛУЧАЙНОСТЬ. Притянуть
         конец УЖЕ ВЫПРЯМЛЕННОЙ линии к направляющей значило бы сломать угол, который человек
         держит пальцем: он попросил ровно, а получил бы «почти ровно, зато по разметке». */
      const fixed = dir
        ? alongDir(prev[0], at, dir, plateH)
        : tool === 'line'
          ? snapDraw(at)
          : at;
      // ПИКСЕЛИ КЛАДУТСЯ ПРЯМО СЕЙЧАС. Копить след и красить его целиком на отпускании значило бы
      // рисовать вслепую: мазок появлялся бы после того, как рука его закончила.
      if (smears(tool)) feedRasterSamples(tool, dir ? [fixed] : samples);
      putTrace(
        tool === 'line' || dir ? [prev[0], fixed] : [...prev, ...samples],
      );
    }
  };

  const onStagePointerUp = (event: React.PointerEvent<HTMLDivElement>) => {
    /* ОСЬ ЖИВЁТ РОВНО ОДИН ЖЕСТ (E-18). Пережив отпускание, она заперла бы СЛЕДУЮЩИЙ мазок на
       направлении позапрошлого — и человек не нашёл бы, чем это отменить: Shift он отпустил. */
    shiftAxis.current = null;
    /**
     * НАПРАВЛЯЮЩУЮ СТАВЯТ ИЛИ ВЫБРАСЫВАЮТ (E-17) — и второе тоже жест, а не кнопка: вернуть её
     * на линейку, откуда взял, — то, что рука делает не думая, и ровно то, что делает фотошоп.
     *
     * ⚠ ДВА ПРИЗНАКА «ВЫБРОСИЛ», А НЕ ОДИН, потому что вопросов тоже два. «Отпустил над
     * линейкой» — экранный, и он ловит возврат туда, откуда взял. «Отпустил вне листа» —
     * мировой, и он ловит уведённую за кромку разметку, которая на листе не лежит и потому
     * ничего не размечает. Один без другого оставлял бы законный способ спрятать направляющую
     * так, что убрать её было бы уже нечем: на линейку она из-за края не вернётся.
     *
     * ЗАПИСЬ В ПАМЯТЬ — ЗДЕСЬ, И ТОЛЬКО ЗДЕСЬ: кадры протяжки идут десятками в секунду, а
     * `localStorage` синхронен. Жест кончился — можно писать.
     */
    const gd = guideDrag.current;
    if (gd && event.pointerId === gd.id) {
      guideDrag.current = null;
      const f = frameAtFree(event);
      const off = f[0] < 0 || f[0] > 1 || f[1] < 0 || f[1] > 1;
      const drop = off || overRuler(event);
      writeGuides(
        drop ? guidesRef.current.filter((_, i) => i !== gd.index) : guidesRef.current,
        true,
      );
      return;
    }
    if (frameDrag.current && event.pointerId === frameDrag.current.id) {
      frameDrag.current = null;
      /* ПОЛОЖЕНИЕ ШАБЛОНА ПИШЕТСЯ НА ОТПУСКАНИИ, А НЕ НА КАЖДОМ ДВИЖЕНИИ: `saveBackdropSoon`
         отложена на 400 мс, но состояние подложки — нет, и запись из-под руки означала бы
         перерисовку всего редактора на каждый кадр протяжки. */
      const fr = frameRef.current;
      /* Сетка пишется рядом с квадом и тем же правилом: тождественную не хранить. Иначе окно,
         закрытое без Enter после захода в режим warp, оставило бы в записи сетку, которая ничего
         не делает, и следующий визит показал бы шаблон канвасом без единой причины. Правило
         названо ОДИН раз, в `writeBackdropFrame`, — у чипа «flatten» оно то же самое. */
      if (fr?.owner === 'backdrop') writeBackdropFrame(fr.quad, fr.grid);
      if (fr?.owner === 'crop') revealCropFrame(fr);
      return;
    }
    if (patchDrag.current && event.pointerId === patchDrag.current.id) {
      const from = patchDrag.current.from;
      patchDrag.current = null;
      setPatchOffset(null);
      liveRef.current = null;
      void patchGesture(from, frameAt(event));
      return;
    }
    const drag = panDrag.current;
    if (drag && event.pointerId === drag.id) {
      panDrag.current = null;
      setPanning(false);
      return;
    }
    if (nodeEditRef.current?.drag) {
      // ОДИН ЖЕСТ — ОДИН ⌘Z. Запись в документ только здесь, на отпускании: писать на каждом
      // движении значило бы набить ленту сотней шагов одного перетаскивания.
      commitNodes(editUp(nodeEditRef.current));
      return;
    }
    if (penRef.current?.drag) {
      putPen(penUp(penRef.current));
      return;
    }
    const liveTrace = traceRef.current;
    if (!liveTrace) return;
    /* ЗАПЛАТКА ОБВОДИТ ТЕМ ЖЕ ЛАССО. Своего построителя области у неё нет нарочно: растушёвка,
       прореживание обводки и резка линий по дорожке живут в одном месте, и второй набор тех же
       правил разошёлся бы с первым на первой же правке. */
    if (tool === 'lasso' || tool === 'patch') {
      putTrace(null);
      const poly = settleLasso(liveTrace, { w: PLATE_W, h: plateH }, thinEps());
      if (poly) {
        /**
         * ОБВОДКА ЗАМЕНЯЕТ ПРЕЖНЮЮ ОБЛАСТЬ, А НЕ ВСТАЁТ РЯДОМ (H-2). Растушёвка у новой — СВОЙ
         * ноль: унаследованная от снятой соседки, она стирала бы пиксели мягче, чем показывает
         * дорожка на экране, и человек узнал бы об этом по результату, а не по виду.
         */
        setSel({ pts: poly, feather: 0 });
      } else {
        /**
         * ЖЕСТ-КЛИК (Q-5, уточнён H-2). Владелец: «простой клик в одну точку снимает старое и
         * если после клика ведем курсором то уже содаем новое выделение».
         *
         * СНИМАЕТ КЛИК В ЛЮБУЮ ТОЧКУ, а не только мимо дорожки. Прежде клик ВНУТРИ брал область в
         * руку — это было нужно, пока областей могло быть несколько и между ними надо было чем-то
         * переключаться. Область теперь одна, «взять» значит «взять ту же самую», то есть ничего,
         * и место жеста больше ни на что не влияет.
         *
         * Решение «клик это или новая область» принимает `settleLasso` НА ОТПУСКАНИИ — по
         * вырожденности площади, а не по порогу сдвига в пикселях: дрогнувшая рука отделена от
         * обводки тем же критерием, каким прореживается сам след.
         */
        /* ⚠ СПРАШИВАЕТСЯ НАЖАТИЕ, А НЕ `dropSel()` ВТОРОЙ РАЗ. К этому моменту область уже снята
           нажатием, поэтому повторный вызов вернул бы `false`, и единственная строка, которая учит
           человека про ⇧⌘D, не печаталась бы никогда: клик лассо сносил бы обводку МОЛЧА. */
        /* ⚠ У ЭТОГО СООБЩЕНИЯ ЕСТЬ ПОТОЛОК, И ОН НЕ В СКЛЕЙКЕ. Склейка честна — колонка рисует
           «×N». Глушит `muteRepeats`: тост, доживший до потолка жизни в 20 с при `count > 1`,
           переводит СВОЙ текст в немые на 20 с, и каждое подавленное повторение сдвигает окно
           дальше. Значит человек, снимающий области подряд дольше двадцати секунд, перестаёт
           получать уведомление совсем. Это сделка общего хранилища, а не этого экрана, и здесь
           она только записана — чинить её тут значило бы завести второе правило про тосты. */
        if (pressDropped.current) showMessage('area dropped — ⇧⌘D brings it back', 'success');
      }
      /* Отметка нажатия живёт РОВНО ОДИН ЖЕСТ — снимается на обеих ветках, и на обводке, и на
         клике. Пережив жест, она разрешила бы следующему Esc воскресить чужое. */
      pressDropped.current = false;
      return;
    }
    if (smears(tool) || (gestureToolRef.current && smears(gestureToolRef.current))) {
      putTrace(null);
      const started = gestureToolRef.current ?? tool;
      gestureToolRef.current = null;
      if (frozen) return;
      /* ТОЧКА ОТРЫВА ЗАПОМИНАЕТСЯ ПОД ИМЕНЕМ ИНСТРУМЕНТА, КОТОРЫМ ЖЕСТ ШЁЛ, — тем же `started`,
         что решает развилку ниже, а не тем, что в руке сейчас. Только после гарда `frozen`:
         жест, ничего не написавший, не имеет права оставить якорь для следующей прямой. */
      lastMark.current = { tool: started, at: liveTrace[liveTrace.length - 1] };
      // РАЗВИЛКА ПО ИНСТРУМЕНТУ, КОТОРЫМ ЖЕСТ НАЧАЛСЯ, а не по тому, что в руке сейчас, — по тому
      // же доводу, что у `gestureToolRef` вообще: клавиши инструментов живые всё время.
      /* Хвост дотягивается ДО развилки: лечилка тоже мажет (`smears`), и её маска обязана
         дойти до последней точки ровно так же, как краска кисти. */
      flushRasterSamples(started);
      if (started === 'heal') void healGesture();
      else endRasterGesture(started, liveTrace);
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
  /**
   * СКОПИРОВАТЬ ТО, ЧТО ВНУТРИ — И ЛИНИИ, И ПИКСЕЛИ (Q-6).
   *
   * ⚠ ЗДЕСЬ БЫЛ ТОТ ЖЕ ДЕФЕКТ, ЧТО ВЛАДЕЛЕЦ НАШЁЛ У УДАЛЕНИЯ: глагол брал только штрихи. Обвёл
   * кусок фотографии, нажал копировать — «the selection holds no strokes», отказ, объясняющий не
   * то, что произошло. Рядом стояла кнопка «soften inside», которая пиксели трогает.
   *
   * И это уже не «дублировать», а НАСТОЯЩИЙ БУФЕР. Прежний глагол клал копию сразу и на месте:
   * вставить её в другую область, в другую часть плиты или дважды было нечем. Теперь ⌘C кладёт в
   * буфер, ⌘V достаёт — как везде.
   */
  const copySel = async () => {
    if (!sel || frozen) return;
    const born = copyInsideSelection(strokesRef.current, sel.pts, [0, 0]);

    /**
     * ═══ ХОЛСТ ЗАВОДИТСЯ ЗДЕСЬ ЖЕ, КАК У ВСЕХ ОСТАЛЬНЫХ ПИКСЕЛЬНЫХ ГЛАГОЛОВ (E-19) ══════════
     *
     * Владелец: «когда делаешь выделение через лассо и жмешь ctrl c ошибка что selection holds
     * nothing to copy». ЗАМЕРЕНО, а не выведено чтением: на пресете `fresh` (картинка есть, слоя
     * на ней ещё не было — это КАЖДЫЙ первый заход) `rasterRef.current` на момент ⌘C равен null,
     * область при этом честно построена, и отказ печатается. Тот же жест, той же областью, после
     * одного взятия кисти — «pixels copied». Разница ровно одна: холст успели завести.
     *
     * ⚠ ПРЕЖНИЙ ДОВОД — «заводить растр РАДИ КОПИИ значило бы молча испачкать слой» — ОКАЗАЛСЯ
     * НЕВЕРЕН, и это проверяется одной строкой: `ensureRaster` не трогает `rasterDirtyRef`, а
     * сохранение пишет пиксели ТОЛЬКО при `rasterDirtyRef.current` (см. `persist`). Заведение
     * холста — это чтение картинки в память, а не правка; ровно поэтому его же делает простая
     * СМЕНА ЧИПА на кисть, которая тоже ничего не меняет. Довод пережил свою причину и защищал
     * дефект: единственный глагол над пикселями, который спрашивал холст, вместо того чтобы его
     * попросить.
     *
     * ⚠ ГЕЙТ `baseMediaId > 0` — ТОТ ЖЕ, ЧТО У КРОПА (`applyCropFrame`), и он несущий: на рисунке
     * с нуля картинки под платой нет вовсе, `seedRaster` откажет, и ⌘C над областью с ЛИНИЯМИ
     * внутри выдал бы отказ про пиксельный слой вместо того, чтобы просто скопировать линии.
     * Отказ заведения тоже не роняет жест: линии копируются, а пустая область получает свой
     * прежний ответ.
     */
    let cut: HTMLCanvasElement | null = null;
    let cutFrac: { x0: number; y0: number; x1: number; y1: number } | null = null;
    if (baseMediaId > 0 && !rasterRef.current) await ensureRaster();
    const layer = rasterRef.current;
    if (layer) {
      const mask = selectionMask(layer, sel.pts, sel.feather);
      const taken = mask ? cutoutInside(layer, mask) : null;
      if (taken) {
        cut = taken.canvas;
        // Коробка приходит В ПИКСЕЛЯХ РАСТРА и переводится в доли ЗДЕСЬ, один раз: вставка живёт в
        // юнитах платы, и второй перевод на её стороне разошёлся бы с этим на первой же плите
        // непривычного размера.
        cutFrac = {
          x0: taken.box[0] / layer.w,
          y0: taken.box[1] / layer.h,
          x1: (taken.box[0] + taken.canvas.width) / layer.w,
          y1: (taken.box[1] + taken.canvas.height) / layer.h,
        };
      }
    }
    if (!born.length && !cut) {
      showMessage('the selection holds nothing to copy', 'error');
      return;
    }
    clip.current = { strokes: born, cut, cutFrac, pastes: 0 };
    const what = [
      born.length ? `${born.length} line${born.length === 1 ? '' : 's'}` : '',
      cut ? 'pixels' : '',
    ]
      .filter(Boolean)
      .join(' and ');
    showMessage(`${what} copied — ⌘V puts them down`, 'success');
  };

  /**
   * ═══ ВСТАВИТЬ — И НЕ ПОЛОЖИТЬ (G-13) ═════════════════════════════════════════════════════
   *
   * Дословно от владельца: «когда с помощью выделения делаешь вставку вставленным объектом нужно
   * что бы было можно управлять пока мы его не заплейсим ибо сейчас он просто в радомную точку
   * приземляется и ничего с ним не сделать».
   *
   * ⚠ ⌘V БОЛЬШЕ НЕ КОММИТИТ. Он строит ПЛАВАЮЩИЙ объект в той же рамке, что у шаблона (§0), и
   * документа не касается ни одним байтом до Enter или клика мимо. Прежняя мгновенная вставка была
   * не «быстрее», а невыразима: положить кусок и потом двигать его было нечем — инструмента
   * переноса пикселей в редакторе нет вовсе.
   *
   * НАЧАЛЬНОЕ СМЕЩЕНИЕ ОСТАЁТСЯ НАРАСТАЮЩИМ (`COPY_NUDGE·n`): две вставки подряд по-прежнему не
   * лягут одна в одну и не прочтутся как «вставилось один раз».
   *
   * ВТОРАЯ ВСТАВКА СПЕРВА СТАВИТ ПЕРВУЮ — слот рамки один. Иначе на экране жили бы два плавающих
   * куска и один Enter, и человек не знал бы, какой из них он сейчас кладёт.
   */
  const pasteClip = async () => {
    const c = clip.current;
    if (!c || frozen) {
      if (!c) showMessage('nothing in the clipboard — copy an area first', 'error');
      return;
    }
    await settleFloatFirst();
    const step = c.pastes + 1;
    const off: [number, number] = [COPY_NUDGE[0] * step, COPY_NUDGE[1] * step];

    /* ИСХОДНАЯ КОРОБКА — ОДНА НА ОБА МАТЕРИАЛА. Линии и пиксели буфера обязаны ехать в ОДНОЙ
       рамке: две коробки означали бы, что перспектива гнёт их по-разному, и вставленный кусок
       расползался бы на глазах. */
    let x0 = Number.POSITIVE_INFINITY;
    let y0 = Number.POSITIVE_INFINITY;
    let x1 = Number.NEGATIVE_INFINITY;
    let y1 = Number.NEGATIVE_INFINITY;
    for (const st of c.strokes) {
      for (const [x, y] of st.pts) {
        if (x < x0) x0 = x;
        if (x > x1) x1 = x;
        if (y < y0) y0 = y;
        if (y > y1) y1 = y;
      }
    }
    if (c.cutFrac) {
      x0 = Math.min(x0, c.cutFrac.x0);
      y0 = Math.min(y0, c.cutFrac.y0);
      x1 = Math.max(x1, c.cutFrac.x1);
      y1 = Math.max(y1, c.cutFrac.y1);
    }
    if (!Number.isFinite(x0) || !Number.isFinite(y0) || !Number.isFinite(x1) || !Number.isFinite(y1)) {
      showMessage('the clipboard held nothing that could be put down here', 'error');
      return;
    }
    /* ⚠ ВЫРОЖДЕННАЯ КОРОБКА РАЗДАЁТСЯ СИММЕТРИЧНО. Копия ОДНОЙ ГОРИЗОНТАЛЬНОЙ линии имеет нулевую
       высоту, и нормировать по ней значило бы делить на ноль: вставка приезжала бы с NaN в каждой
       координате и не рисовалась вовсе. Раздача симметрична, поэтому вставка без единого жеста
       ложится ровно туда же, куда клала прежняя мгновенная. */
    if (x1 - x0 < MIN_FLOAT_SPAN) {
      const c0 = (x0 + x1) / 2;
      x0 = c0 - MIN_FLOAT_SPAN / 2;
      x1 = c0 + MIN_FLOAT_SPAN / 2;
    }
    if (y1 - y0 < MIN_FLOAT_SPAN) {
      const c0 = (y0 + y1) / 2;
      y0 = c0 - MIN_FLOAT_SPAN / 2;
      y1 = c0 + MIN_FLOAT_SPAN / 2;
    }
    const sw = x1 - x0;
    const sh = y1 - y0;
    const norm = (p: readonly [number, number]): [number, number] => [(p[0] - x0) / sw, (p[1] - y0) / sh];

    const strokes = c.strokes.map((st) => {
      const out: VectorStroke = { ...st, pts: st.pts.map(norm) };
      if (st.segs) {
        out.segs = st.segs.map((seg) =>
          seg
            ? ((): [number, number, number, number] => {
                const a = norm([seg[0], seg[1]]);
                const b = norm([seg[2], seg[3]]);
                return [a[0], a[1], b[0], b[1]];
              })()
            : null,
        );
      }
      return out;
    });
    const cutRegion: WarpRegion = c.cutFrac
      ? {
          u0: (c.cutFrac.x0 - x0) / sw,
          v0: (c.cutFrac.y0 - y0) / sh,
          u1: (c.cutFrac.x1 - x0) / sw,
          v1: (c.cutFrac.y1 - y0) / sh,
        }
      : FULL_REGION;

    const quad = quadFromRect(
      (x0 + off[0]) * PLATE_W,
      (y0 + off[1]) * plateH,
      sw * PLATE_W,
      sh * plateH,
    );
    putFrame({
      owner: 'paste',
      quad,
      axis: false,
      snapshot: quad,
      float: { strokes, cut: c.cut, cutRegion, srcW: sw, srcH: sh },
    });
    clip.current = { ...c, pastes: step };
    showMessage(
      'pasted — drag it, pull a handle to size it, ⌘-drag a corner for perspective; enter puts it down',
      'success',
    );
  };

  const reselect = () => {
    const back = lastDropped.current;
    if (!back || frozen) return;
    lastDropped.current = null;
    // ЗАМЕНА, А НЕ ДОБАВЛЕНИЕ: вернуть снятую поверх нынешней значило бы завести вторую (H-2).
    setSel(back);
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
  const deleteSel = async () => {
    if (!sel || frozen) return;
    /* ЖИВАЯ ВСТАВКА СТАВИТСЯ ПЕРВОЙ. Иначе «удалить внутри» вычистило бы область, а плавающий
       кусок над ней остался бы висеть и лёг бы поверх очищенного следующим Enter — то есть
       глагол, обещающий «внутри не остаётся ничего», оставлял бы там что-то. */
    await settleFloatFirst();

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
      layer && mask ? () => fillInside(layer, mask!) : null,
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
        'lines inside the area were cut, but the pixel layer could not be opened — the picture underneath is untouched. Reopen the layer and repeat if you meant to erase it too.',
        'error',
      );
      return;
    }
    // Сообщение называет, ЧТО именно ушло: «удалено» без материала не даёт человеку понять, надо ли
    // ему жать ⌘Z, если он ждал другого.
    const what = [gone.pixels ? 'pixels' : '', gone.lines ? 'lines' : ''].filter(Boolean).join(' and ');
    showMessage(`${what} inside the area deleted`, 'success');
  };

  /**
   * РАСТУШЕВАТЬ ПИКСЕЛИ ВНУТРИ ОБЛАСТИ (X-5) — операция, а не ореол.
   *
   * Число области играет здесь ОБЕ свои роли и одним значением: оно же радиус смягчения и оно же
   * мягкость края, с которой смягчение сходит на нет. Иначе «растушёвка» на рейке значила бы одно
   * у кисти и другое у кнопки, и человек, поставивший 24, получал бы два разных 24.
   */
  const softenSel = async () => {
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
    showMessage(`pixels inside the area softened by ${sel.feather}px`, 'success');
  };

  /**
   * СНЯТЬ САМУ ОБЛАСТЬ — штрихи не трогаются.
   *
   * Отсюда же ходят ⌘D и клик по пустому месту (Q-4, Q-5): владелец просил, чтобы область
   * «пропадала на просто клик, как в фотошопе», а «пропасть» и «перестать быть активной» — разные
   * вещи, и вторая оставляла бы дорожку на экране. Раз область теперь уходит и от промаха мышью,
   * СНЯТАЯ ЗАПОМИНАЕТСЯ: ⇧⌘D её возвращает, это Reselect фотошопа. Без него один случайный клик
   * уносил бы минуту обводки насовсем.
   *
   * Возвращает, было ли что снимать: вызывающему нужно знать, говорить ли про ⇧⌘D.
   */
  const dropSel = (): boolean => {
    if (!sel) return false;
    lastDropped.current = sel;
    setSel(null);
    return true;
  };

  /** Растушёвка области — свойство ВЫДЕЛЕНИЯ, а не инструмента: смена кисти её не трогает. */
  const featherSel = (px: number) => {
    const clamped = Math.min(200, Math.max(0, Math.round(px)));
    setSel((prev) => (prev ? { ...prev, feather: clamped } : prev));
  };

  /** Свойство кисти ИЛИ выбранного штриха — какой контекст на рейке, тому и достаётся правка. */
  const pickBrush = (key: StitchKey) => {
    if (selected !== null) editStroke({ brush: key });
    else setBrush(key);
    warnPlainFallback(key, selected !== null ? strokeStep(strokes[selected]) : step);
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
  /**
   * СКАЗАТЬ ВСЛУХ, ЧТО ШОВ БОЛЬШЕ НЕ НАРИСУЕТСЯ.
   *
   * Генератор фигуры на линии короче одной внятной фигуры возвращает пустоту, и вместо шва молча
   * встаёт прямая. Пока потолок стежка был 60, это трогало только совсем короткие линии. С потолком
   * 200 (Q-7) порог потайного шва — 2200 юнитов при плате в 1000, то есть подмена стала БЕЗУСЛОВНОЙ:
   * человек переключал бы виды шва и не видел ни одного изменения, а орган выбора выглядел бы
   * сломанным. Раз потолок поднят по прямой просьбе, подмена обязана называть себя.
   */
  const warnPlainFallback = (key: StitchKey, stepPx: number) => {
    const need = stitchMinLength(key, stepPx);
    if (need <= PLATE_W) return;
    showMessage(
      `at this stitch length ${stitchName(key)} needs a line ${Math.round(need / PLATE_W)}× wider than the sheet — shorter lines are drawn plain`,
      'error',
    );
  };

  /**
   * ЗАЛИТЬ ОБЛАСТЬ ПОД КУРСОРОМ (Q-15). Один клик — один шаг ленты.
   *
   * Пишет ПРЯМО в документ, как «стереть внутри» и «смягчить внутри», а не через буфер мазка:
   * у заливки нет жеста, и путь scratch→stage ей нечем кормить. Активная область держит её внутри —
   * то же правило, что у всех пиксельных глаголов.
   */
  /**
   * ═══ ЛЕЧЕНИЕ — КОНЕЦ МАЗКА ЛЕЧИЛКИ (Q-14) ═══════════════════════════════════════════════════
   *
   * Владелец: «добавить тул Spot Healing Brush Tool как в фотошопе».
   *
   * СВОЙ ГЛАГОЛ, А НЕ ВЕТКА В `endRasterGesture`. Тот кладёт БУФЕР МАЗКА в документ как краску;
   * здесь буфер — не краска, а МАСКА: «вот сюда я мазнул, зарасти это». Слить их значило бы
   * записать тёмный след превью в фотографию.
   *
   * ЛЕЧИТ НА ОТПУСКАНИИ, А НЕ ПОД РУКОЙ, и это тот же выбор, что у фотошопа: донора ищут по всему
   * пятну целиком, а пятно ещё рисуется. Лечить каждый отрезок отдельно значило бы искать донора
   * для куска мазка и склеивать заплату из несогласованных кусков.
   *
   * ПОРЯДОК ЛЕНТЫ — ДОСЛОВНО ТОТ ЖЕ, ЧТО У ЗАЛИВКИ: стереть буфер жеста, разметить коробку,
   * записать шаг, стереть снова. Лента снимает «как было» ПО РАЗМЕЧЕННОЙ КОРОБКЕ и делает это ДО
   * применения, поэтому буфер обязан уйти раньше разметки — иначе в снимок «как было» попал бы
   * тёмный след превью, и ⌘Z вернул бы его на картинку.
   */
  const healGesture = async () => {
    const layer = rasterRef.current;
    if (!layer || frozenRef.current) return;
    const ctx = rasterCtx(layer.doc);
    const src = ctx.getImageData(0, 0, layer.w, layer.h);
    // МАСКА МАЗКА — из буфера жеста, той же функцией, какой читается маска выделения. Второго
    // построителя следа здесь нет нарочно: два пути дали бы два разных ответа на вопрос «где
    // прошла рука», и расходились бы они молча.
    const stroke = selectionAlpha(rasterCtx(layer.scratch).getImageData(0, 0, layer.w, layer.h));

    let selAlpha: Uint8Array | null = null;
    if (sel) {
      const mask = selectionMask(layer, sel.pts, sel.feather);
      if (mask) selAlpha = selectionAlpha(rasterCtx(mask).getImageData(0, 0, layer.w, layer.h));
    }

    setBusy('healing…');
    let res;
    try {
      res = healMask(src, stroke, { strength: opacity / 100, selection: selAlpha });
    } finally {
      setBusy(null);
    }

    if (!res.rect) {
      clearGesture(layer);
      paintView();
      showMessage('nothing under the brush to heal', 'error');
      return;
    }
    const r = res.rect;
    clearGesture(layer);
    markRect(layer, [r.x, r.y, r.x + r.w - 1, r.y + r.h - 1]);
    const changed = timeline.current.recordGesture(layer, () =>
      ctx.putImageData(res.image, 0, 0, r.x, r.y, r.w, r.h),
    );
    clearGesture(layer);
    paintView();
    if (!changed) return;
    rasterDirtyRef.current = true;
    setRasterDirty(true);
    bumpTl();
    // ПОДМЕНА НАЗЫВАЕТ СЕБЯ. Пятно, которому не нашлось похожего места рядом, заглаживается
    // гладко — результат ВИДИМО другой (мыло вместо зерна), и человек, не предупреждённый об
    // этом, спишет разницу на кривой инструмент. Молчать здесь дешевле и хуже.
    if (res.donors < res.spots) {
      showMessage(
        res.donors === 0
          ? 'no matching texture nearby — the spot was smoothed over instead of grown'
          : `${res.spots - res.donors} of ${res.spots} spots had no matching texture nearby and were smoothed over`,
        'error',
      );
    }
  };

  /**
   * ═══ ЗАПЛАТКА — КОНЕЦ ПЕРЕТАСКИВАНИЯ ОБЛАСТИ (G-12) ══════════════════════════════════════
   *
   * Владелец: «нам нужен Patch Tool … что бы работал 1 в 1 как в фотошопе». Что здесь есть и чего
   * нет — перечислено в шапке `vector-patch.ts` и сказано человеку подсказкой инструмента.
   *
   * ПОРЯДОК ЛЕНТЫ — ДОСЛОВНО ТОТ ЖЕ, ЧТО У ЗАЛИВКИ И ЛЕЧИЛКИ: стереть буфер жеста, разметить
   * коробку, записать шаг, стереть снова. Лента снимает «как было» ПО РАЗМЕЧЕННОЙ КОРОБКЕ и делает
   * это ДО применения, поэтому буфер обязан уйти раньше разметки — иначе в снимок «как было» попал
   * бы живой предпросмотр, и ⌘Z вернул бы его на картинку.
   *
   * ШТРИХИ НЕ ТРОГАЮТСЯ ВОВСЕ: это пиксельный глагол, и линия поперёк области переживает его
   * нетронутой — как переживает кисть или лечилку.
   */
  const patchGesture = async (from: [number, number], to: [number, number]) => {
    const layer = rasterRef.current;
    if (!layer || frozenRef.current) {
      if (layer) {
        clearGesture(layer);
        paintView();
      }
      return;
    }
    if (!sel) {
      clearGesture(layer);
      paintView();
      return;
    }
    const mask = selectionMask(layer, sel.pts, sel.feather);
    if (!mask) {
      clearGesture(layer);
      paintView();
      return;
    }
    // Буфер предпросмотра уходит ДО всего: он не документ, и попасть в снимок ленты не имеет права.
    clearGesture(layer);
    paintView();

    const ctx = rasterCtx(layer.doc);
    const src = ctx.getImageData(0, 0, layer.w, layer.h);
    const alpha = selectionAlpha(rasterCtx(mask).getImageData(0, 0, layer.w, layer.h));
    const dx = Math.round((to[0] - from[0]) * layer.w);
    const dy = Math.round((to[1] - from[1]) * layer.h);

    setBusy('rebuilding the area…');
    let res;
    try {
      res = patchRegion(src, alpha, dx, dy, { strength: opacity / 100 });
    } finally {
      setBusy(null);
    }
    if (!res.rect) {
      if (res.refusal) showMessage(res.refusal, 'error');
      return;
    }
    const r = res.rect;
    markRect(layer, [r.x, r.y, r.x + r.w - 1, r.y + r.h - 1]);
    const changed = timeline.current.recordGesture(layer, () =>
      ctx.putImageData(res.image, 0, 0, r.x, r.y, r.w, r.h),
    );
    clearGesture(layer);
    paintView();
    if (!changed) return;
    rasterDirtyRef.current = true;
    setRasterDirty(true);
    bumpTl();
    showMessage(
      'the area was rebuilt from where you dropped it, seam blended — the lines are untouched',
      'success',
    );
  };

  const fillAt = async (at: [number, number]) => {
    if (frozenRef.current) return;
    const layer = await ensureRaster();
    if (frozenRef.current || !layer) return;
    const ctx = rasterCtx(layer.doc);
    const src = ctx.getImageData(0, 0, layer.w, layer.h);

    let selAlpha: Uint8Array | null = null;
    if (sel) {
      const mask = selectionMask(layer, sel.pts, sel.feather);
      if (mask) selAlpha = selectionAlpha(rasterCtx(mask).getImageData(0, 0, layer.w, layer.h));
    }

    const res = bucketFill(
      src,
      Math.floor(at[0] * layer.w),
      Math.floor(at[1] * layer.h),
      parseFillColor(ink),
      {
        tolerance: fillTolerance,
        expand: fillExpand,
        opacity: opacity / 100,
        selection: selAlpha,
      },
    );
    if (!res.rect) {
      showMessage('nothing under the cursor to fill', 'error');
      return;
    }
    const r = res.rect;
    // Порядок обязателен: лента снимает «как было» ПО РАЗМЕЧЕННОЙ КОРОБКЕ и делает это ДО того,
    // как позовёт применение. Разметка после — это шаг, восстанавливающий пустоту.
    clearGesture(layer);
    markRect(layer, [r.x, r.y, r.x + r.w - 1, r.y + r.h - 1]);
    const changed = timeline.current.recordGesture(layer, () =>
      ctx.putImageData(res.image, 0, 0, r.x, r.y, r.w, r.h),
    );
    clearGesture(layer);
    paintView();
    if (!changed) return;
    rasterDirtyRef.current = true;
    setRasterDirty(true);
    /* ВТОРОЙ ШОВ ЗАПИСИ ЧЕРНИЛ — И ОН ТОЖЕ ЗА `changed`. Ведро, которому нечего было залить,
       отвечает отказом словами выше и метки не рождает: множество кандидатов растёт только там,
       где краска действительно легла. */
    if (colourMode) recordInk(ink);
    bumpTl();
  };

  /**
   * ═══ ОБВЕСТИ ПИКСЕЛИ — ОДНО НАЖАТИЕ ═══════════════════════════════════════════════════════
   *
   * Операция над всей плитой или над областью, ровно как заливка и лечилка, и читает она ту же
   * пару: `layer.doc` целиком и `selectionAlpha` активного лассо. Всё, что раньше спрашивалось
   * ручками (режим, полярность, канал, порог, допуск, размер сора), теперь МЕРЯЕТСЯ — довод и
   * числа в `trace-onepress.ts`.
   *
   * ОДИН `commitLines`, И ЭТО НЕСУЩЕЕ. Обводка кладёт сотни штрихов; уложи их по одному — и ⌘Z
   * снимал бы контур по петле, сотню раз, а лента при этом хранила бы сотню шагов. Один вызов
   * единственного писателя списка означает ОДИН шаг ленты: одно ⌘Z снимает всю обводку целиком.
   *
   * ⚠ ПОСЛЕ ПРОГОНА РУКА САМА БЕРЁТ `select`, И ЭТО ОТВЕТ НА ВТОРУЮ ПОЛОВИНУ ЖАЛОБЫ («я не могу
   * ничего все равно менять»). Линии УЖЕ были правимыми объектами; невидимым это было потому, что
   * в руке оставался инструмент, который по ним рисует, а не берёт их. Один щелчок по линии
   * открывает её узлы — но только если рука к этому готова.
   *
   * СНЕКБАР, А НЕ БЛОК НА ЭКРАНЕ. Числа прогона — событие, а не свойство панели: отчёт, который
   * висел бы в рейке до следующего прогона (G-9), владелец снял прямым требованием.
   */
  const runTraceOnePress = async (tolerance?: number) => {
    if (frozenRef.current || tracingRef.current) return;
    setRefusal(null);
    setTraceSuggest(null);
    const layer = await ensureRaster();
    if (!layer || frozenRef.current) return;
    const src = rasterCtx(layer.doc).getImageData(0, 0, layer.w, layer.h);

    let selAlpha: Uint8Array | null = null;
    if (sel) {
      const mask = selectionMask(layer, sel.pts, sel.feather);
      if (mask) selAlpha = selectionAlpha(rasterCtx(mask).getImageData(0, 0, layer.w, layer.h));
    }

    tracingRef.current = true;
    let res;
    try {
      res = await traceOnePress(src, {
        ratio: ratio || DEFAULT_RATIO,
        selection: selAlpha,
        existing: strokesRef.current,
        tolerance,
        onStage: (stage) => {
          setTraceStage(stage);
          setBusy(STAGE_WORDS[stage]);
        },
      });
    } finally {
      tracingRef.current = false;
      setTraceStage(null);
      setBusy(null);
    }
    if (frozenRef.current) return;

    if (!res.ok) {
      setRefusal(res.reason);
      setTraceSuggest(res.suggestTolerance ?? null);
      return;
    }
    /* ПУСТАЯ ОБВОДКА НЕ КЛАДЁТСЯ В ЛЕНТУ. «Ни одной линии на этой плите» — законный результат, а
       не изменение документа; шаг ленты «ничего на ничего» означал бы, что одно ⌘Z после него не
       делает ровно ничего, а нажатие человек уже потратил. */
    if (res.strokes.length === 0) {
      showMessage('nothing on this plate reads as a drawn line', 'error');
      return;
    }
    commitLines([...strokesRef.current, ...res.strokes]);
    switchTool('select');
    const parts = [`${res.strokes.length} line${res.strokes.length === 1 ? '' : 's'} traced`];
    if (res.rows > 0) parts.push(`${res.rows} stitch row${res.rows === 1 ? '' : 's'}`);
    if (res.spots > 0) parts.push(`${res.spots} filled spot${res.spots === 1 ? '' : 's'}`);
    showMessage(
      `${parts.join(' · ')} — click one to edit it, drag its nodes, ⌫ deletes it`,
      'success',
    );
  };

  const pickStep = (px: number) => {
    const n = clampStep(px);
    if (selected !== null) editStroke({ step: n });
    else {
      setStep(n);
      setStepOwn(true);
    }
    warnPlainFallback(selected !== null ? strokes[selected].brush : brush, n);
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
  const dirty = strokesJson !== seededJson.current || rasterDirty;

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
    /**
     * ⚠ ДОКУМЕНТ БЕРЁТСЯ ИЗ РЕФА, А НЕ ИЗ ЗАПОМНЕННОГО `payload`.
     *
     * `payload` — это `useMemo` над СОСТОЯНИЕМ, то есть снимок ПРОШЛОГО рендера. Пока штрихи
     * менялись только жестами, разницы не было: жест кончался, React перерисовывал, кнопку жали
     * потом. Плавающая вставка (G-13) сломала это молча — она ставится ТУТ ЖЕ, в том же обработчике
     * нажатия на «сохранить», и запомненное значение о ней ещё не знает: на сервер уехал бы
     * документ БЕЗ вставки, которую человек только что видел на экране.
     *
     * Реф — единственный писатель, знающий про СЕЙЧАС (тот же довод, что у `strokesRef` вообще).
     */
    const doc = writeLayer(strokesRef.current, ratio);
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
      strokes: doc,
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
    seededJson.current = JSON.stringify(strokesRef.current);
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
  }, [saveLayer, baseMediaId, ratio, storedRasterId]);

  const saveDrawingOnly = async () => {
    if (frozen || tooLarge || !anyContent || busy) return;
    /**
     * ⚠ ЭТОТ ОТКАЗ БЫЛ ОБЕЩАН КОММЕНТАРИЕМ И НЕ СУЩЕСТВОВАЛ В КОДЕ. Шапка `expanded` с круга Q-3
     * дословно утверждает: «пока `expanded` взведён, „save the drawing only“ отказывается словами»
     * — но ни одной ветки, которая бы отказывала, в файле не было, и ни одна проба этого не
     * спрашивала. Нашлось при постановке кропа (G-4), потому что кроп сделал цену выше: расширение
     * возвращалось растянутым, а обрезка вернётся РАСТЯНУТОЙ СИЛЬНЕЕ и с потерянными краями.
     *
     * Механизм отказа: форма платы, сохранённая без картинки, при следующем открытии ПРОИГРЫВАЕТ
     * натуральным пропорциям неизменившейся подложки (см. `if (!expandedRef.current) setRatio(...)`
     * в сиде) — и рисунок приезжает сплющенным МОЛЧА. Единственный способ сделать новую форму
     * правдой — новая картинка, чьи натуральные пропорции ею и станут.
     */
    if (expandedRef.current) {
      /**
       * ⚠ ОТКАЗ НЕСЁТ ДВЕРЬ, О КОТОРОЙ ГОВОРИТ (круг 15, J-32, чтение «б»).
       *
       * Отказ верен по смыслу и всегда был верен; человеку он читается «ошибка» — это второй
       * кандидат на «выдаёт ошибку» из слов владельца. Красный колаут, называющий кнопку, до
       * которой надо ещё дотянуться глазами через всю шапку, и есть тот самый тупик. Дверь
       * стоит ВНУТРИ отказа: сказал «нельзя так — можно вот так» и тут же дал «вот так».
       */
      setRefusal(
        'the sheet was cropped or grown, and a drawing saved on its own cannot carry that: on the next visit the picture underneath wins its shape back and the strokes come back squashed. The new sheet’s own proportions become the truth only as a new picture — or press ⌘Z to take the crop back and save the drawing as before.',
        'picture',
      );
      return;
    }
    /* СОХРАНЕНИЕ С ПЛАВАЮЩИМ КУСКОМ НЕ МОЛЧИТ: он либо поставлен, либо его нет. Молчаливое
       сохранение мимо него дало бы файл, на котором человек своими глазами видел вставку. */
    await settleFloatFirst();
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

  /**
   * ═══ «USE AS COLOUR MAP» — ЕДИНСТВЕННАЯ КНОПКА РЕЖИМА КАРТЫ ══════════════════════════════════
   *
   * Ни слоя, ни картинки карточки: карта — ни то, ни другое. Слой у флэта один (ключ
   * `(карточка, база)`), и карта, сохранённая слоем, снесла бы обводку того же чертежа; картинка
   * карточки предлагалась бы слотам верстака и стояла бы в ARTIFACTS как РИСУНОК ВЕЩИ, которым
   * карта ровно не является. Поэтому наружу уезжает обычная загрузка в библиотеку, а адресует её
   * цветовой план — как это уже делает разметка `fix-markup` со своей копией платы.
   *
   * ПОРЯДОК ОБЯЗАТЕЛЕН: сначала СКАН (он может отказать бесплатно), потом байты и загрузка. Обратный
   * порядок оставлял бы в библиотеке файл, о котором никто не узнает, каждый раз, когда человек
   * нажал кнопку, ничего не покрасив.
   */
  const useAsColourMap = async () => {
    if (frozen || busy) return;
    const layer = rasterRef.current;
    if (!layer) {
      setRefusal(
        'nothing is painted yet — flood a part with the bucket or brush it, then this button has something to hand over.',
      );
      return;
    }
    setRefusal(null);
    try {
      setBusy('reading the colours…');
      const pixels = rasterCtx(layer.doc).getImageData(0, 0, layer.w, layer.h).data;
      /* ⚠ КАНДИДАТЫ — ТОЛЬКО ЗАПИСАННЫЕ ЧЕРНИЛА. Открой множество, и мягкий край заливки станет
         десятком «использованных цветов», которых никто не выбирал. Довод целиком — у `usedInks`. */
      const palette = exactPalette(pixels, usedInksRef.current);
      if (palette.length === 0) {
        setRefusal(
          'no colour is marked on this drawing. Black and white are the drawing’s own ink and its paper, so painting in them marks nothing — pick a colour and flood a part with it.',
        );
        return;
      }
      setBusy('uploading the colour map…');
      const media = await uploadRaster(exportColourMapPng(layer));
      const mediaId = media.id ?? 0;
      if (!mediaId) throw new Error('the colour map went up but came back without an id');
      const accepted =
        (await onColourMap?.({
          mediaId,
          url: media.media?.fullSize?.mediaUrl || '',
          palette,
        })) ?? true;
      if (!accepted) {
        setRefusal(
          'the colour plan was not saved, so this painting has not been filed — it is still on screen and nothing was lost. The reason is in the message that just appeared; deal with it and press the button again.',
        );
        return;
      }
      /* СОХРАНЁННОЕ ПЕРЕСТАЁТ БЫТЬ НЕСОХРАНЁННЫМ — иначе страж выхода спросил бы про правки,
         которые только что уехали, и человек решил бы, что кнопка не сработала. */
      rasterDirtyRef.current = false;
      setRasterDirty(false);
      onOpenChange(false);
    } catch (error) {
      setRefusal(layerRefusalText(error));
    } finally {
      setBusy(null);
    }
  };

  const saveAsPicture = async () => {
    if (frozen || tooLarge || !anyContent || busy) return;
    await settleFloatFirst();
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
   * ═══ СКАЧАТЬ SVG — КНОПКА, КОТОРАЯ НЕ БЫВАЕТ СЕРОЙ (G-10) ════════════════════════════════
   *
   * Владелец: «свг данлоуд экспорт который нам будет выдавать хороший вектор без хуйни и кнопка
   * должна быть сразу активна мы подождем все что нужно подождать». Отсюда ЧЕТЫРЕ ветки, и ни
   * одна из них не «ничего не произошло»:
   *
   *  1. СЛОЙ-ФАЙЛ С ЖИВЫМ URL → отдаётся ОРИГИНАЛ производителя. Контракт говорит это дословно:
   *     «download SVG hands back THIS media, never a re-serialisation of the strokes». Круг через
   *     собственный формат — тихая подмена одного чертежа другим, ровно то, как поставщику уезжает
   *     не тот файл, который принимали.
   *  2. ЕСТЬ ШТРИХИ → `svg-export` по ним. ⚠ РАСТР ПРИ ЭТОМ НЕ ТРАССИРУЕТСЯ, и это осознанный
   *     отход от плана круга. План предлагал добавлять трассу растра группой рядом; но самый
   *     частый путь владельца — «обвёл плиту одним нажатием, поправил пару линий, выгрузил», и на
   *     нём добавка означала бы КАЖДУЮ ЛИНИЮ ДВАЖДЫ: один раз правленую рукой, один раз заново
   *     снятую с тех же пикселей. Дубль в файле хуже отсутствия: его не видно на глаз и он
   *     удваивает узлы.
   *  3. ШТРИХОВ НЕТ, А ПИКСЕЛИ ЕСТЬ → `trace-onepress` ПРЯМО В ПАМЯТИ. Документ не трогается
   *     вовсе: ни шага ленты, ни коммита, — значит потолок слоя в 512 КБ здесь ни при чём, и
   *     плита, которая не влезла бы в документ, всё равно выгружается файлом.
   *  4. ПУСТО ВОВСЕ → снекбар словами. Не серая кнопка: «нечего выгружать» это ответ, а
   *     недоступный орган — загадка.
   *
   * Подмена НАЗЫВАЕТСЯ: слой-файл, чей оригинал не достаётся из корзины, отдаёт структурный
   * экспорт и говорит об этом вслух — молчаливая подмена здесь стоила бы чужого чертежа.
   */
  const downloadingRef = useRef(false);
  const [downloadStage, setDownloadStage] = useState<string | null>(null);

  const download = () => {
    if (downloadingRef.current) return;
    const w = RASTER_FALLBACK_W;
    const h = Math.round(w / (ratio || DEFAULT_RATIO));
    const name = () => `${base ? pictureHandle(base) : 'drawing'}`;

    // 1 · оригинал производителя.
    if (fileMediaId > 0 && fileUrl) {
      downloadingRef.current = true;
      setDownloadStage('fetching the original…');
      void (async () => {
        try {
          saveBlob(await fetchMediaBlob(fileUrl));
        } catch {
          const svg = layerVectorSvg(strokesRef.current, { width: w, height: h });
          if (svg) {
            saveBlob(new Blob([svg], { type: 'image/svg+xml' }));
            showMessage(
              'the vectoriser’s original could not be fetched — exported the editable projection instead',
              'error',
            );
          } else {
            showMessage(
              'the vector file could not be fetched from the bucket, and this layer holds no strokes of its own to export instead',
              'error',
            );
          }
        } finally {
          downloadingRef.current = false;
          setDownloadStage(null);
        }
      })();
      return;
    }

    /**
     * 1б · СЛОЙ-ФАЙЛ, У КОТОРОГО ОРИГИНАЛА НЕ ДОСТАТЬ. Раньше здесь кнопка просто гасла
     * (`canDownload = fileMediaId > 0 ? !!fileUrl : …`) — то есть человек оставался с серым
     * органом и без объяснения. Теперь выгрузка идёт дальше по общим веткам, но ПОДМЕНА
     * НАЗЫВАЕТСЯ: то, что уедет, — не файл производителя, а проекция, которую редактор умеет
     * построить сам. Молчаливая подмена здесь стоила бы чужого чертежа у поставщика.
     */
    if (fileMediaId > 0 && !fileUrl) {
      showMessage(
        'the vectoriser’s original is not on this screen, so it cannot be handed back — exporting the editable projection instead',
        'error',
      );
    }

    // 2 · штрихи есть — они и есть чертёж.
    const drawn = strokesRef.current;
    if (drawn.length > 0) {
      const svg = layerVectorSvg(drawn, { width: w, height: h });
      if (!svg) {
        showMessage('nothing on the plate yet', 'error');
        return;
      }
      saveBlob(new Blob([svg], { type: 'image/svg+xml' }));
      showMessage(`${drawn.length} line${drawn.length === 1 ? '' : 's'} written to ${name()}-vector.svg`, 'success');
      return;
    }

    // 3 · штрихов нет — обвести пиксели В ПАМЯТИ и выгрузить результат.
    downloadingRef.current = true;
    void (async () => {
      try {
        const layer = await ensureRaster();
        if (!layer) {
          showMessage('nothing on the plate yet', 'error');
          return;
        }
        const src = rasterCtx(layer.doc).getImageData(0, 0, layer.w, layer.h);
        const res = await traceOnePress(src, {
          ratio: ratio || DEFAULT_RATIO,
          /* ПОТОЛОК СЛОЯ ЗДЕСЬ НИ ПРИ ЧЁМ: в документ не уезжает ни один штрих. Поэтому список
             «что уже лежит» пуст — иначе отказ по байтам сорвал бы выгрузку файла, который
             сохранять никто и не собирался. */
          onStage: (stage) => setDownloadStage(STAGE_WORDS[stage]),
        });
        if (!res.ok) {
          showMessage(res.reason, 'error');
          return;
        }
        setDownloadStage('writing the file…');
        const svg = layerVectorSvg(res.strokes, { width: w, height: h });
        if (!svg) {
          showMessage('nothing on the plate yet', 'error');
          return;
        }
        saveBlob(new Blob([svg], { type: 'image/svg+xml' }));
        showMessage(
          `${res.strokes.length} line${res.strokes.length === 1 ? '' : 's'} traced from the pixels and written to ${name()}-vector.svg — the drawing itself was not changed`,
          'success',
        );
      } finally {
        downloadingRef.current = false;
        setDownloadStage(null);
      }
    })();
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
      // ⌘C / ⌘V / ⌘D живут НА ОКНЕ, рядом с ⌘Z — см. эффект ниже. Здесь их нет нарочно.
      return;
    }
    // ПРОБЕЛ ПЕРЕХВАТЫВАЕТСЯ РАНЬШЕ гарда набора — но только НЕ в текстовом поле. На фокусе-кнопке
    // пробел по умолчанию «нажать кнопку», и после клика по чипу инструмента зажатая ладонь
    // дёргала бы этот чип вместо панорамы; Enter кнопкам остаётся.
    if (e.shiftKey) setShiftHeld(true);
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
    /* Enter НАД ЖИВОЙ РАМКОЙ ловится НА ОКНЕ, а не здесь — см. эффект `frameLive` ниже: сюда он
       не доходит вовсе, если фокус стоит на чипе рейки (а после любого нажатия он стоит именно
       там). Замерено пробой: рамка не ставилась ни разу. */
    if (e.key === 'Enter' && tool === 'curve' && penRef.current) {
      e.preventDefault();
      commitPen();
      return;
    }
    // Delete/Backspace: содержимое активной области, иначе — выбранный штрих. По e.code —
    // именованные клавиши раскладка не путает, но правило дома одно: физическая клавиша.
    if ((e.code === 'Backspace' || e.code === 'Delete') && !frozen) {
      // ЖИВОЕ ПЕРО СТАРШЕ ВСЕГО: Backspace над недоложенным контуром снимает ПОСЛЕДНИЙ ЯКОРЬ, как
      // в фотошопе, — отменяется то, что делалось только что, а не то, что лежит рядом.
      const livePenNow = penRef.current;
      if (livePenNow) {
        e.preventDefault();
        putPen(penUndo(livePenNow));
        return;
      }
      const ne = nodeEditRef.current;
      if (ne && ne.sel >= 0) {
        e.preventDefault();
        commitNodes(editDelete(ne, ne.sel));
        return;
      }
      /**
       * ═══ ПОЧЕМУ ОБЛАСТЬ И ВЫБРАННЫЙ ШТРИХ СОСУЩЕСТВУЮТ, А НЕ ВЫТЕСНЯЮТ ДРУГ ДРУГА ══════════
       *
       * Вопрос поднимался как «в эдиторе не должно быть двух выделений за раз», и напрашивалась
       * правка: клик по штриху снимает область. ЗАМЕРЕНО — ЭТО СЛОМАЛО БЫ ДАННЫЕ, потому что
       * `sel` НЕ ТОЛЬКО ВЫДЕЛЕНИЕ. Он одновременно МАСКА, и в трёх местах:
       *   · `paint` режет след на куски по `pointInPolygon(..., sel.pts)` — область ОГРАНИЧИВАЕТ
       *     рисование (выше по файлу, у сборки `runs`);
       *   · `maskRef` собирается из `sel.pts`/`sel.feather` и служит «куда пускать кисть» (X-6) и
       *     «насколько мягок край» (X-5) для пиксельного канала;
       *   · заплатка (`tool === 'patch'`) разводит свои две фазы попаданием указателя ВНУТРЬ `sel`.
       * Снять область по клику значило бы молча отменить ограничение, которое человек поставил
       * руками, — и следующий мазок лёг бы ровно там, где экран только что обещал его удержать.
       *
       * ЧТО ВЛАДЕЛЕЦ ПРОСИЛ НА САМОМ ДЕЛЕ — ОДНА ОБЛАСТЬ, А НЕ «ОДИН ВЫДЕЛЕННЫЙ ОБЪЕКТ». «Простой
       * клик в одну точку снимает старое, а клик с ведением создаёт новое» — это дословно жест
       * лассо, и он УЖЕ исполнен: `findSelAt` снесена (H-2), областей больше одной не бывает, клик
       * внутри дорожки снимает её так же, как клик мимо. Штрих же — объект другого рода, и в
       * фотошопе маркиз и выбранный контур сосуществуют ровно так же.
       *
       * ⚠ ЧТО ЗДЕСЬ ОСТАЁТСЯ НЕРЕШЁННЫМ И РЕШАЕТСЯ НЕ ЗДЕСЬ. Лестница ниже НЕ СМОТРИТ НА
       * ИНСТРУМЕНТ В РУКЕ: после «лассо → V → клик по штриху» Delete снимает ОБЛАСТЬ, хотя человек
       * только что выбрал линию и видит её узлы. В фотошопе это разводит инструмент (маркиз владеет
       * Delete у выделения, Direct Selection — у контура). Правка выглядит маленькой, но меняет
       * семантику РАЗРУШАЮЩЕЙ клавиши, и её нельзя провозить попутно: вынесена отдельной задачей.
       */
      /* ⚠ ИНСТРУМЕНТ В РУКЕ РЕШАЕТ, ЧЕЙ ЭТО DELETE. Лестница ранга ниже не смотрела на него вовсе:
         после «обвёл область → V → клик по штриху» Delete сносил СОДЕРЖИМОЕ ОБЛАСТИ, а выбранный
         штрих оставался цел — разрушающая клавиша била не по тому объекту, который человек только
         что взял. В фотошопе это разводит именно инструмент: маркиз владеет Delete у выделения,
         Direct Selection — у контура. Область при этом НЕ СНИМАЕТСЯ: она заодно маска (режет след
         кисти, собирает `maskRef`, разводит две фазы заплатки), и гасить её по клику значило бы
         молча отменить ограничение, которое человек поставил руками. Сосуществование законно —
         неверен был ПОРЯДОК. */
      if (tool === 'select' && selected !== null) {
        e.preventDefault();
        removeSelected();
        return;
      }
      if (sel) {
        e.preventDefault();
        deleteSel();
        return;
      }
      if (selected !== null) {
        e.preventDefault();
        removeSelected();
        return;
      }
    }
    /**
     * [ И ] — РАЗМЕР ТОГО, ЧТО В РУКЕ (Q-8), как в фотошопе. Меняется именно тот размер, которым
     * этот инструмент рисует: у круглого ниба — ниб, у линии — толщина нити. Одна пара клавиш на
     * две величины здесь не «две работы под одной ручкой»: в руке в каждый момент ровно одна из
     * них, и вторая ничего не рисует.
     *
     * По `e.code`, а не по символу: на кириллической раскладке `e.key` для этих клавиш — «х» и «ъ».
     */
    if ((e.code === 'BracketLeft' || e.code === 'BracketRight') && !frozen) {
      e.preventDefault();
      const up = e.code === 'BracketRight';
      // Шаг МУЛЬТИПЛИКАТИВНЫЙ: на тонком краю прибавка в единицу — это удвоение, на толстом —
      // полпроцента. Одна и та же доля на всём ходу и есть то, чего ждёт рука.
      const grow = (v: number) => (up ? Math.max(v * 1.15, v + 0.25) : Math.min(v / 1.15, v - 0.25));
      if (isNibTool(tool)) setNib((v) => clampNib(grow(v)));
      else pickGauge(grow(selected !== null ? strokeGauge(strokes[selected]) : gauge));
      return;
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
        // ЦИФРА ЗНАЧИТ НАЗВАННЫЙ ВИД, А НЕ n-ю СТРОКУ СПИСКА (круг 15). `STITCHES` перерос девять
        // записей и переупорядочен по семьям; читай клавиша порядок списка, восьмёрка молча
        // сменила бы потайной на blanket — довод у самого `HOTKEYS`.
        if (Number.isInteger(n) && n >= 1 && n <= HOTKEYS.length && !frozen) {
          pickBrush(HOTKEYS[n - 1]);
        }
      }
    }
  };

  const onKeyUp = (e: React.KeyboardEvent) => {
    if (!e.shiftKey) setShiftHeld(false);
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
  const fileOnly = fileMediaId > 0 && strokes.length === 0 && !readPending;
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

  /**
   * ГДЕ СТОИТ ШАБЛОН — ОДИН ОТВЕТ НА ДВА ЭЛЕМЕНТА (над растром и под ним).
   *
   * Пока рамка живая, ИСТИНА — ЕЁ КВАД, а не запись: запись обновляется на отпускании кнопки, и
   * читать её во время протяжки значило бы показывать шаблон на кадр позади руки. Записанный квад
   * (`backdropCss`) остаётся правдой во всё остальное время, включая восстановление из хранилища.
   */
  const backdropStyle = useMemo(() => {
    if (!backdrop) return undefined;
    const live = frame?.owner === 'backdrop' ? frame.quad : null;
    const base = backdropCss(backdrop);
    return live ? { ...base, transform: quadCss(live, backdrop.natW, backdrop.natH) } : base;
  }, [backdrop, frame]);

  /**
   * ШАБЛОН НА ЭКРАНЕ: `img` С МАТРИЦЕЙ ИЛИ КАНВАС, И ГРАНИЦА РОВНО ОДНА — МОЖЕТ ЛИ CSS ОПИСАТЬ
   * ЭТУ ГЕОМЕТРИЮ (H-4).
   *
   * Пока может, показ идёт прежним и лучшим путём: одна CSS-матрица, GPU, идеальная резкость,
   * ноль работы на кадр. Искривлённую поверхность `matrix3d` выразить не может в принципе — у
   * неё для этого нет чисел, — и ровно там показ переезжает на канвас.
   *
   * ⚠ ГРАНИЦА — «СЕТКА ЧТО-ТО ДЕЛАЕТ», А НЕ «СЕТКА ЕСТЬ», И ЭТО ВИДНО ГЛАЗОМ. Первая редакция
   * уводила показ на канвас в тот момент, когда человек просто ЗАГЛЯНУЛ в режим: тождественная
   * сетка ничего не гнёт, а рисовальщик уже клал 1152 клипованных треугольника, и на сплошной
   * заливке проступала диагональная штриховка их швов (замерено: +3.55 яркости на черте
   * источника, +5.5 на заливке). Платить видимым качеством за состояние, в котором картинка
   * тождественна себе, незачем: `gridIsIdentity` и есть ответ на вопрос «опишет ли это CSS».
   *
   * ИСТИНА, ПОКА РАМКА ЖИВАЯ, — ЕЁ КВАД И ЕЁ СЕТКА, а не запись: запись обновляется на отпускании
   * кнопки, и читать её во время протяжки значило бы показывать шаблон на кадр позади руки.
   */
  /**
   * ⚠ УГЛЫ ЗАПИСИ СЧИТАЮТСЯ В ПАМЯТКЕ, А НЕ В РЕНДЕРЕ, И ЭТО НЕ МИКРО-ОПТИМИЗАЦИЯ.
   * `backdropCorners` возвращает НОВЫЙ массив на каждый вызов, а канвас превью перерисовывает
   * себя при смене ссылки на квад. Посчитанный прямо в разметке, он делал бы полную перерисовку
   * искривлённого шаблона (SUBDIV² × 2 треугольника с клипом) на КАЖДЫЙ рендер модалки — а она
   * рендерится, например, на каждое движение мыши под круглым нибом (`setNibHover`). Ссылка,
   * меняющаяся только вместе с записью, оставляет холсту ровно ту работу, которая нужна.
   */
  const backdropQuadOfRecord = useMemo(
    () => (backdrop ? (backdropCorners(backdrop) as unknown as Quad) : null),
    [backdrop],
  );

  /**
   * ЧЕМ РИСОВАТЬ ШАБЛОН — И ГДЕ ЕГО ОБРАЗ ЛЕЖИТ. Обе половины одного вопроса, поэтому одна памятка.
   *
   * ⚠ ЭТО «КАРТИНКА ИСКРИВЛЕНА?», А НЕ «УЗЛЫ НА ЭКРАНЕ?». Вопросы разные: изогнутый шаблон рисуется
   * канвасом и после выхода к восьми ручкам — искривление никуда не делось, органы сменились.
   *
   * ⚠ И КОРОБКА СЧИТАЕТСЯ ЗДЕСЬ, А НЕ ВНУТРИ ХОЛСТА. У вырожденной поверхности (все шестнадцать
   * узлов в одной точке, схлопывание в линию) коробки НЕТ, а холст, узнававший это сам, в таком
   * случае возвращал `null` — то есть подложка молча переставала существовать: ни картинки, ни
   * слова. Решение обязано приниматься там, где есть вторая дверь, и она вот: резкий `img`.
   */
  const bdGrid = frame?.owner === 'backdrop' ? frame.grid : backdrop?.grid;
  const bdQuad = frame?.owner === 'backdrop' ? frame.quad : backdropQuadOfRecord;
  const backdropWarpBox = useMemo(
    () =>
      bdQuad && bdGrid && !gridIsIdentity(bdGrid)
        ? warpSurfaceBox({ quad: bdQuad, grid: bdGrid })
        : null,
    [bdQuad, bdGrid],
  );

  const renderBackdrop = (depth: 'over' | 'under') => {
    if (!backdrop) return null;
    if (bdQuad && bdGrid && backdropWarpBox) {
      return (
        <BackdropWarpCanvas
          src={backdrop.src}
          natW={backdrop.natW}
          natH={backdrop.natH}
          quad={bdQuad}
          grid={bdGrid}
          box={backdropWarpBox}
          opacity={backdrop.opacity}
          depth={depth}
          zoom={zoomK}
        />
      );
    }
    return (
      <img
        src={backdrop.src}
        alt=''
        draggable={false}
        data-backdrop={depth}
        className='pointer-events-none absolute left-0 top-0 block max-w-none'
        style={backdropStyle}
      />
    );
  };

  /**
   * ШТРИХИ ПЛАВАЮЩЕЙ ВСТАВКИ, ПРОГНАННЫЕ ЧЕРЕЗ РАМКУ. Считаются ОДНОЙ функцией с коммитом
   * (`warpMapper`), поэтому «что видно» и «что ляжет» не могут разойтись: разошлись бы они молча,
   * и первым узнал бы об этом человек, у которого вставка прыгнула на Enter.
   */
  const floatPreview = useMemo(() => {
    const f = frame?.owner === 'paste' ? frame.float : null;
    if (!f || !f.strokes.length) return [];
    const map = warpMapper({ quad: frame!.quad });
    const toFrac = (p: readonly [number, number]): [number, number] => [p[0] / PLATE_W, p[1] / plateH];
    return f.strokes.map((st) => {
      const out: VectorStroke = { ...st, pts: st.pts.map(([u, v]) => toFrac(map(u, v))) };
      if (st.segs) {
        out.segs = st.segs.map((seg) =>
          seg
            ? ((): [number, number, number, number] => {
                const a = toFrac(map(seg[0], seg[1]));
                const b = toFrac(map(seg[2], seg[3]));
                return [a[0], a[1], b[0], b[1]];
              })()
            : null,
        );
      }
      return out;
    });
  }, [frame, plateH]);

  /**
   * КУРСОР НАД РАМКОЙ ГОВОРИТ, ЧТО СЛУЧИТСЯ. Восемь ручек — четыре направления изменения размера
   * (стандартный словарь браузера, а не выдуманный); тело — «двигать»; зона поворота курсора не
   * имеет вовсе, потому что его нет в CSS: там вместо курсора рисуется ДУГА СО СТРЕЛКОЙ, прямо у
   * руки, — см. оверлей. Выдумывать битмап под стандартную работу этому админу запрещено.
   */
  /* Классы ПОЛНЫМИ ЛИТЕРАЛАМИ: Tailwind ищет их в исходнике текстом, и `cursor-${x}-resize` не
     попал бы в сборку вовсе — курсор молча остался бы стрелкой на всех восьми ручках. */
  const FRAME_CURSOR = [
    'cursor-nwse-resize',
    'cursor-ns-resize',
    'cursor-nesw-resize',
    'cursor-ew-resize',
    'cursor-ew-resize',
    'cursor-nesw-resize',
    'cursor-ns-resize',
    'cursor-nwse-resize',
  ];
  const frameCursor =
    frameHover?.kind === 'handle'
      ? FRAME_CURSOR[frameHover.handle]
      : frameHover?.kind === 'body'
        ? 'cursor-move'
        : frameHover?.kind === 'rotate'
          ? 'cursor-crosshair'
          : /* УЗЕЛ СЕТКИ ТЯНЕТСЯ В ЛЮБУЮ СТОРОНУ, поэтому осевой стрелки у него быть не может:
               восемь курсоров рамки называют ОСЬ, вдоль которой пойдёт ручка, а у узла оси нет.
               `move` — то же, чем помечено тело: «возьмётся и поедет за рукой». */
            frameHover?.kind === 'node'
            ? 'cursor-move'
            : '';

  const stageCursor = panning
    ? 'cursor-grabbing'
    : spaceHeld || tool === 'pan'
      ? 'cursor-grab'
      : frozen
        ? 'cursor-default'
        : frame && frameCursor
          ? frameCursor
          : frame
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
          ref={attachContent}
          {...{ [SCREEN_MARK]: '' }}
          /* `touch-action: pan-x pan-y` — тач-половина того же запрета: без неё щипок пальцами по
             хрому зумит страницу мимо всякого слушателя. `select-none` — J-39: протяжка по шапке
             и рейке выделяла 103 и 302 символа вместо того, чтобы ничего не делать; поля ввода
             возвращают себе выделение явно, потому что Safari отнимает его и у них. */
          style={{ touchAction: 'pan-x pan-y' }}
          className='fixed inset-0 z-[var(--z-modal)] select-none bg-pageBg p-4 focus:outline-none [&_[contenteditable]]:select-text [&_input]:select-text [&_textarea]:select-text'
          onEscapeKeyDown={(e) => {
            // Esc-ЛЕСТНИЦА: ЖИВАЯ РАМКА → взведённая пипетка → живое перо → выбранный штрих →
            // области лассо → выход (через одну дверь со стражем). Без `preventDefault` Radix
            // закрывает экран раньше любой ступени.
            //
            // РАМКА — ВЕРХНЯЯ СТУПЕНЬ, потому что она единственная держит НЕСОХРАНЁННЫЙ жест,
            // видимый на экране: Esc над ней возвращает то, с чего человек начал, а над вставкой
            // выбрасывает кусок, документа не тронув.
            if (frameRef.current) {
              e.preventDefault();
              cancelFrame();
              return;
            }
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
            /* ЖИВОЙ ЖЕСТ ЛАССО — СТУПЕНЬ, КОТОРОЙ НЕ БЫЛО, И ЕЁ ОТСУТСТВИЕ ЗАКРЫВАЛО ЭКРАН.
               Лестница не спрашивала `traceRef`, а нажатие уже сняло прежнюю область — значит во
               время протяжки все ступени ниже пусты, и Esc проваливался в ВЫХОД ИЗ РЕДАКТОРА.
               Отмена жеста возвращает снятую область: человек не довёл новую, прежняя не должна
               была пострадать — ровно поведение фотошопа. */
            if (traceRef.current && (tool === 'lasso' || tool === 'patch')) {
              e.preventDefault();
              putTrace(null);
              /* ⚠ ВОЗВРАЩАЕТСЯ ТОЛЬКО СНЯТОЕ ЭТИМ ЖЕ НАЖАТИЕМ. Безусловный `reselect()` поднимал
                 `lastDropped` любой давности: обвёл область, снял её ⌘D, рисовал минуту, начал
                 новую обводку и передумал — и Esc воскрешал ту, первую, пере-маскируя кисть по
                 ней без единого слова. Хуже: `VectorModal` при закрытии не размонтируется, а
                 возвращает `null`, поэтому реф переживал закрытие, и область могла всплыть НА
                 ДРУГОЙ ПЛАТЕ в единицах чужой высоты. */
              if (pressDropped.current) reselect();
              pressDropped.current = false;
              return;
            }
            if (selected !== null) {
              e.preventDefault();
              setSelected(null);
              return;
            }
            if (sel) {
              // Deselect: дорожка снимается — фотошопный ⌘D, посаженный на Esc. ЧЕРЕЗ `dropSel`,
              // чтобы Esc-снятие возвращалось тем же ⇧⌘D, что и снятие по ⌘D: две двери к одному
              // жесту, помнящие по-разному, — это ловушка, а не свобода.
              e.preventDefault();
              /* ⚠ С СООБЩЕНИЕМ, КАК И ⌘D. Обе двери снимают одно и то же и обе возвращаются одним
                 ⇧⌘D, но говорила про возврат только одна: снятие по Esc уносило обводку молча.
                 Тот же дефект, что был на клике лассо, в соседней ступени той же лестницы. */
              if (dropSel()) showMessage('area dropped — ⇧⌘D brings it back', 'success');
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
            {/* ⚠ РОД КАДРА, А НЕ СЛОВО «FLAT» ВСЕГДА. Редактор открывается и над рендером — с
                круга 16 прямо из полосы рендеров, — и заголовок называл его флэтом в ста
                процентах случаев. Правка при этом ничего не переносит между верстаками:
                `FlattenEditLayer` наследует род и колорвею родителя.

                ⚠ И ПУСТОЙ РОД — ТОЖЕ НЕ «FLAT». Фолбэк `|| 'flat'` возвращал ровно ту ложь, на
                которую жалуется абзац выше: картинка мудборда рода не несёт вовсе (её база
                собирается из медиа, а не из кадра полосы), и правка фотографии объявлялась
                правкой флэта. Безродный кадр называется кадром. */}
            {colourMode
              ? `colour${colourLabel ? ` — ${colourLabel}` : ''}`
              : base
                ? `vector edit — ${(base.kind || '').trim() || 'a picture'}`
                : 'vector edit — a new drawing'}
          </Dialog.Title>
          <Dialog.Description className='sr-only'>
            {colourMode
              ? 'flood and brush the parts of this flat in flat colours; those colours are labels for cloths, not the garment’s own'
              : 'strokes over the picture on a pan and zoom canvas; the raster underneath is never touched'}
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
                {colourMode ? `colour${colourLabel ? ` — ${colourLabel}` : ''}` : 'vector edit'}
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
                {/* Органы вида живут вместе с холстом, а холст здесь теперь ВСЕГДА (H-1): гард
                    `entered` сторожил развилку входа, а её больше нет. */}
                {
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
                    {/* ═══ ЛИНЕЙКИ (E-17) ══════════════════════════════════════════════════
                        Орган вида, и стоит он среди органов вида: линейка ничего не рисует и
                        ничего не сохраняет. `nonForm` — по тому же правилу, что у зума: на
                        замороженном слое смотреть и мерить можно, и `<fieldset disabled>` не
                        имеет права это отнять.

                        ПОДПИСЬ НАЗЫВАЕТ ЖЕСТ, А НЕ СОСТОЯНИЕ. «rulers» на кнопке и «drag one
                        out of a ruler» в подсказке — единственное место, где человек узнаёт,
                        что направляющие вообще бывают: вытягивание из кромки не подсказывается
                        ничем на экране. */}
                    <Chip
                      nonForm
                      dashed
                      selected={rulersOn}
                      pressed={rulersOn}
                      data-rulers-chip={rulersOn ? '1' : '0'}
                      onClick={() => setRulersOn((v) => !v)}
                      title={
                        rulersOn
                          ? `rulers are on (⌘R) · drag a guide out of a ruler; the arrow tool moves one, dropping it back on a ruler removes it${guides.length ? ` · ${guides.length} guide${guides.length === 1 ? '' : 's'}` : ''}`
                          : 'show rulers along the edges and drag guides out of them (⌘R)'
                      }
                    >
                      rulers{rulersOn && guides.length ? ` ${guides.length}` : ''}
                    </Chip>
                    {rulersOn && guides.length > 0 && (
                      <Chip
                        nonForm
                        dashed
                        data-guides-clear=''
                        onClick={() => writeGuides([], true)}
                        title='take every guide off this sheet'
                      >
                        clear guides
                      </Chip>
                    )}
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
                          ? `undo the last ${{ pixels: 'pixel gesture', lines: 'line gesture', both: 'gesture — it took both lines and pixels', sheet: 'change of the sheet itself — the crop comes off and the old sheet comes back' }[timeline.current.nextUndoKind() ?? 'lines']} (⌘z) · ${tl.depth} step${tl.depth === 1 ? '' : 's'} kept, ceiling ${RASTER_UNDO_DEPTH} or ${RASTER_UNDO_BYTES / 1024 / 1024} MB of pixels`
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
                }
                {frozen ? (
                  <Pill tone='mut'>read-only</Pill>
                ) : colourMode ? (
                  /* ⚠ ОДНА КНОПКА, И НИКОГДА ПАРА «СЛОЙ / КАРТИНКА». Карта не слой (у флэта слой
                     один, и она снесла бы его обводку) и не снимок карточки (её предлагали бы
                     слотам верстака как рисунок вещи, которым она не является). Обе кнопки той
                     пары здесь были бы дверьми в неверные места. */
                  <Button
                    type='button'
                    variant='main'
                    size='sm'
                    disabled={!!busy}
                    data-colour-map-commit=''
                    onClick={() => void useAsColourMap()}
                    title='hand this painting over as the colour map of this view — the colours become the rows of the parts menu'
                  >
                    {busy ?? 'use as colour map'}
                  </Button>
                ) : (
                  /* Писатели живут вместе с холстом — и он здесь безусловен (H-1). */
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
                    {refusalDoor === 'picture' && !frozen && (
                      <div className='mt-1.5'>
                        <Button
                          type='button'
                          variant='main'
                          size='sm'
                          disabled={!ready}
                          data-refusal-door='picture'
                          onClick={saveAsPicture}
                        >
                          {busy ?? 'save as a new picture'}
                        </Button>
                      </div>
                    )}
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

            {/* ── рейка + холст: ОДИН И ЕДИНСТВЕННЫЙ вид этого экрана (H-1) ────────────────
                Развилки «рисовать / перевести машиной» здесь больше нет: открытие плиты — уже
                редактор. Бесплатная обводка стоит чипом в рейке (`data-trace-run`), платного
                прогона нет нигде. */}
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
                  rasterTool={needsRaster(tool)}
                  lineTool={!needsRaster(tool)}
                  colourMode={colourMode}
                  usedInks={usedInks}
                  hardness={hardness}
                  /* ⚠ ВТОРОЙ ЗАМОК НА ТЕХ ЖЕ ДВУХ ЧИСЛАХ, И ОН НЕ ЛИШНИЙ. Первый — отсутствие
                     органа на рейке; но `RailProps` принимает обработчик, а не запрет, и
                     единственный способ гарантировать сотню на карте — не пустить сюда другое
                     значение. Иначе замок держался бы разметкой, то есть держался бы до первой
                     правки соседнего файла. */
                  onHardness={(n: number) =>
                    setHardness(colourMode ? 100 : Math.min(100, Math.max(0, Math.round(n) || 0)))
                  }
                  opacity={opacity}
                  onOpacity={(n: number) =>
                    setOpacity(colourMode ? 100 : Math.min(100, Math.max(1, Math.round(n) || 1)))
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
                  sel={sel}
                  onFeatherSel={featherSel}
                  onCopySel={copySel}
                  onDeleteSel={deleteSel}
                  onDropSel={dropSel}
                  onSoftenSel={() => void softenSel()}
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
                  // экспорт своих штрихов; плита без штрихов — обводку в памяти. Довод — у
                  // `download`. Запрета нет ни у одной ветки: у каждой есть ответ.
                  downloadStage={downloadStage}
                  onDownload={download}
                  outNote={
                    fileMediaId > 0
                      ? '«download SVG» hands back the layer’s ORIGINAL file — the one the vectoriser produced — never a re-serialisation. Strokes drawn here live on the layer and in saved pictures, not inside the file.'
                      : undefined
                  }
                  saveNote={saveNote}
                  backdrop={backdrop}
                  backdropKey={bdKey}
                  expanded={expanded}
                  cropTool={tool === 'crop'}
                  cropFill={cropFill}
                  onCropFill={setCropFill}
                  cropRatio={cropRatio}
                  sheetRatio={PLATE_W / plateH}
                  onCropRatio={chooseCropRatio}
                  penTool={tool === 'curve'}
                  penCanClose={!!pen && pen.anchors.length >= 3}
                  onPathToSelection={makeSelectionFromPen}
                  nodeCount={nodeEdit?.path.nodes.length ?? 0}
                  nodeSelected={nodeEdit?.sel ?? -1}
                  nodeSmooth={
                    nodeEdit && nodeEdit.sel >= 0
                      ? nodeEdit.path.nodes[nodeEdit.sel]?.linked === true
                      : false
                  }
                  onNodeConvert={() => {
                    const ne = nodeEditRef.current;
                    if (ne && ne.sel >= 0) commitNodes(editConvert(ne, ne.sel, penWorld()));
                  }}
                  onNodeDelete={() => {
                    const ne = nodeEditRef.current;
                    if (ne && ne.sel >= 0) commitNodes(editDelete(ne, ne.sel));
                  }}
                  plate={plateRect}
                  onBackdropPick={(media) => {
                    const r = adoptBackdrop(media[0], plateRect);
                    if (!r.ok) {
                      showMessage(r.reason, 'error');
                      return;
                    }
                    /* ВЫБРАЛ КАРТИНКУ — СРАЗУ СТАВИШЬ ЕЁ. Прежде шаблон приезжал вписанным и
                       незапертым, то есть уже «в режиме постановки», просто без органа, которым
                       это видно. Рамка и есть тот орган. */
                    putBackdrop(r.backdrop);
                    openBackdropFrame(r.backdrop);
                  }}
                  onBackdropOp={(next) => putBackdrop(next)}
                  backdropPlacing={frame?.owner === 'backdrop'}
                  onBackdropPlace={() => {
                    const b = backdropRef.current;
                    if (!b) return;
                    if (frameRef.current?.owner === 'backdrop') commitFrame();
                    else openBackdropFrame(b);
                  }}
                  /* `warpOn` — ЧТО НА ЭКРАНЕ (узлы или ручки), `warpBent` — ИСКРИВЛЕНА ЛИ КАРТИНКА.
                     Два разных вопроса, и чип задаёт оба: залитый значит «сейчас узлы», а соседний
                     «flatten» появляется только когда гнуть уже есть что. */
                  warpOn={frameShowsNodes(frame)}
                  warpBent={frame?.owner === 'backdrop' && !gridIsIdentity(frame.grid)}
                  onWarpToggle={() => {
                    if (frameShowsNodes(frameRef.current)) leaveWarp();
                    else enterWarp();
                  }}
                  onWarpFlatten={flattenWarp}
                  onBackdropDepth={() => {
                    const b = backdropRef.current;
                    if (!b) return;
                    putBackdrop(setBackdropDepth(b, b.depth === 'over' ? 'under' : 'over'));
                  }}
                  onBackdropRemove={() => {
                    if (frameRef.current?.owner === 'backdrop') closeFrame();
                    putBackdrop(null);
                  }}
                  traceStage={traceStage}
                  traceHasSelection={!!sel}
                  traceSuggest={traceSuggest}
                  onTraceRun={() => void runTraceOnePress()}
                  /* ЧИП ЗАПУСКАЕТ САМ, А НЕ СТАВИТ ЧИСЛО В ПОЛЕ. Поля больше нет, и «поставил
                     допуск» превратилось бы в жест, после которого надо вспомнить нажать ещё
                     что-то. Оценку назвал движок — он же её и применяет. */
                  onTraceCoarser={(tolerance) => void runTraceOnePress(tolerance)}
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
                    {(colourMode ? COLOUR_TOOL_BANDS : TOOL_BANDS).map((band) => (
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
                    {/* ⚠ ДВЕРЬ MAKE SELECTION ПЕРЕЕХАЛА В РЕЙКУ, И ЭТО НЕ ПЕРЕСТАНОВКА МЕБЕЛИ.
                        Она стояла здесь по правилу «присутствие — по инструменту, доступность — по
                        пути», и правило работало, пока ряд чипов помещался в одну строку С НЕЙ. С
                        приходом `patch` и `crop` (круг 13) запас кончился: проба 83 померила
                        144/740 у пера против 117/767 у всех прочих — ряд переносился на вторую
                        строку и СДВИГАЛ ХОЛСТ ровно тогда, когда по нему ведут путь.
                        Правило этого файла старше и сильнее: НАД ХОЛСТОМ НЕТ МЕСТА НИЧЕМУ
                        УСЛОВНОМУ. Рейка — колонка со своей прокруткой, её рост не стоит холсту ни
                        пикселя, и дверь живёт теперь там, рядом с областями, которые она рождает. */}
                    </div>
                    <Text
                      size='nano'
                      variant='label'
                      component='p'
                      className='h-4 min-w-0 overflow-hidden text-ellipsis whitespace-nowrap'
                      data-tool-hint={frame ? `frame-${frame.owner}` : tool}
                    >
                      {/* ЖИВАЯ РАМКА ГОВОРИТ ЗА ИНСТРУМЕНТ: пока она на экране, работа — это она.
                          Строка стоит В ТОЙ ЖЕ коробке фиксированной высоты (`h-4`, без переноса,
                          с многоточием) — холст от смены текста не двигается ни на пиксель, и
                          сторожем этому стоит проба 83. */}
                      {frame
                        ? frame.owner === 'crop'
                          ? 'drag the frame — outward grows the sheet, inward crops it · enter or double-click applies, esc cancels · cannot be undone'
                          : `drag to move · handles scale (shift keeps the proportion) · drag outside a corner to rotate (shift snaps 15°) · ⌘-drag a corner for perspective · enter ${frame.owner === 'paste' ? 'puts it down' : 'places the template'}`
                        : tool === 'curve'
                        ? // ОДНА строка на весь путь: смена текста посреди жеста — тот же сдвиг холста.
                          'click = corner · drag = curve · grab a handle to bend, alt splits the pair · click the first anchor closes · enter/esc finish'
                        : tool === 'lasso'
                          ? 'draw around an area · it holds the pixel tools in and cuts the lines at its edge · feather is each area’s own'
                          : tool === 'patch'
                          ? 'lasso a region, then drag it onto a clean place — the region is rebuilt from there and the seam blended. No texture is invented; the lines are not touched'
                          : tool === 'select'
                            ? /* Единственное место, где сказано, что направляющую можно взять:
                                 тонкая синяя нить сама об этом не говорит, а курсор над ней не
                                 меняется — рамка перехватывает наведение раньше. Строка растёт
                                 ТОЛЬКО когда разметка на листе есть; болтаться постоянно она не
                                 имеет права (высота блока над холстом неизменна — проба 83). */
                              guides.length && rulersOn
                              ? 'click a stroke — the rail edits its stitch · drag a guide to move it, onto a ruler to remove it'
                              : 'click a stroke — the rail edits its stitch'
                            : tool === 'clone'
                                ? 'alt-click to take the source, then drag. The LINES under the source are laid under your hand'
                                : tool === 'erase'
                                  ? 'drag the nib: it rubs the PIXELS to paper white, the photo included, and CUTS the drawn lines it covers. One eraser for both'
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
                    ref={attachViewport}
                    onPointerDown={onStagePointerDown}
                    onPointerMove={onStagePointerMove}
                    onPointerUp={onStagePointerUp}
                    onPointerCancel={onStagePointerUp}
                    // Круг ниба гаснет вместе с уходом курсора: иначе он остался бы висеть на
                    // краю платы и читался бы как след, которого нет.
                    onPointerLeave={() => {
                      /* И ПАМЯТЬ О ПОЛОЖЕНИИ РУКИ ГАСНЕТ ВМЕСТЕ С НИМ. Иначе следующий зум
                         кнопкой, сделанный уже без курсора над холстом, ВОСКРЕСИЛ БЫ круг на
                         месте, где руки давно нет. */
                      lastClient.current = null;
                      setNibHover(null);
                    }}
                    onPointerEnter={(event) => {
                      lastClient.current = { x: event.clientX, y: event.clientY };
                    }}
                    onDoubleClick={() => {
                      // Двойной клик применяет КАДР — второй фотошопный способ сказать «да» там,
                      // где клика мимо нет нарочно (применение необратимо).
                      if (frameRef.current?.owner === 'crop') {
                        commitFrame();
                        return;
                      }
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
                      {/* ШАБЛОН ДЛЯ СРИСОВЫВАНИЯ. Указатель он не ловит никогда — протяжку ведёт
                          сама сцена, и `pointer-events` на картинке только отняли бы у неё
                          события. Когда его ставят, поверх стоит трансформ-рамка — она и есть
                          признак того, что экран сейчас двигает шаблон, а не рисует. Чем он
                          нарисован — `img` с матрицей или канвасом — решает `renderBackdrop`. */}
                      {backdrop && backdrop.depth === 'under' && renderBackdrop('under')}
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
                              if (!expandedRef.current) {
                                setRatio(img.naturalWidth / img.naturalHeight);
                              }
                            }
                          }}
                          data-base-img=''
                          className='pointer-events-none absolute inset-0 block h-full w-full'
                          style={{ objectFit: 'fill', opacity: rasterReady ? 0 : 1 }}
                        />
                      )}
                      {/* ═══ ШАХМАТКА ПРОЗРАЧНОСТИ — ЗЕМЛЯ ПОД РАСТРОМ (N-4) ══════════════════
                          Владелец: «на фабрик рендерах в эдит моде не работает erase». Ластик
                          РАБОТАЛ: замер стенда на настоящих байтах беты показывает альфу в нуле
                          под кистью и на флэте, и на рендере. Не работал ЭКРАН — плата белая
                          (`bg-bgColor`), и дырка до прозрачности рисовалась белым. На флэте, где
                          по белой бумаге идут тёмные линии, это видно (максимальная разница
                          канала на снимке 217); на фабрик-рендере светлой вещи на светлом фоне —
                          38 при том же жесте. «Прогрыз насквозь» и «закрасил белым» выглядели
                          одинаково, и на светлой картинке второе неотличимо от «ничего не
                          произошло».
                          Шахматка — тот самый орган, которым это различает фотошоп, и она стоит
                          РОВНО ПОД РАСТРОМ и ровно при тех же условиях: пока канал не заведён,
                          плата остаётся белой бумагой для линий, а копия подложки непрозрачна и
                          сама её закрывает. Видно её становится только там, где прозрачность
                          ПОЯВИЛАСЬ, — то есть только там, где ластик действительно взял. */}
                      {showChecker && (
                        <div
                          data-raster-checker=''
                          aria-hidden
                          className='pointer-events-none absolute inset-0'
                          style={{
                            backgroundColor: '#ffffff',
                            backgroundImage:
                              'linear-gradient(45deg, #cccccc 25%, transparent 25%, transparent 75%, #cccccc 75%),' +
                              'linear-gradient(45deg, #cccccc 25%, transparent 25%, transparent 75%, #cccccc 75%)',
                            backgroundSize: '24px 24px',
                            backgroundPosition: '0 0, 12px 12px',
                          }}
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
                          /* ═══ БЛИЖЕ ТРЁХКРАТНОГО СМОТРЯТ НА ПИКСЕЛИ, А НЕ НА КАРТИНКУ (G-6) ═══
                             Билинейное сглаживание браузера на 8× размазывает край краски на
                             половину экранного сантиметра, и ретушь нибом в один юнит делается
                             вслепую: видно пятно, а не то, какие пиксели оно накрыло. Атрибут
                             ставится ПОРОГОМ, а не всегда, потому что на 100% то же правило дало
                             бы лестницу на всякой фотографической подложке. */
                          style={{
                            imageRendering: zoomPct >= PIXELATED_FROM * 100 ? 'pixelated' : 'auto',
                          }}
                        />
                      )}
                      {/* ═══ ПЛАВАЮЩАЯ ВСТАВКА — ПИКСЕЛЬНАЯ ПОЛОВИНА (G-13) ══════════════════
                          Стоит НАД пиксельным каналом и ПОД линиями: вставленный кусок ложится
                          поверх краски, как ложится и при постановке (`source-over` у выреза), —
                          иначе превью обещало бы одно, а Enter давал другое.
                          Холст, а не картинка: вырезка живёт в памяти как canvas, и перегонять её
                          в data-URL ради показа значило бы кодировать PNG на каждую вставку. */}
                      {frame?.owner === 'paste' && frame.float?.cut && (
                        <canvas
                          ref={floatCanvasRef}
                          width={frame.float.cut.width}
                          height={frame.float.cut.height}
                          data-paste-float=''
                          aria-hidden
                          className='pointer-events-none absolute left-0 top-0 block max-w-none'
                          style={{
                            width: `${frame.float.cut.width}px`,
                            height: `${frame.float.cut.height}px`,
                            transformOrigin: '0 0',
                            transform: quadCss(
                              cutQuadOf(frame.quad, frame.float.cutRegion),
                              frame.float.cut.width,
                              frame.float.cut.height,
                            ),
                          }}
                        />
                      )}
                      {/* ⚠ ЖИВОЙ БИНАРИЗАЦИИ ЗДЕСЬ БОЛЬШЕ НЕТ (G-7). Синяя заливка показывала,
                          что движок СЧИТАЕТ КРАСКОЙ при выбранной человеком полярности, — то есть
                          существовала ради проверки ответа, которого человек больше не даёт.
                          Оставить её значило бы держать холст в стопке платы ради утверждения,
                          которое некому опровергнуть. */}
                      {/* ШАБЛОН ДЛЯ СРИСОВЫВАНИЯ — см. близнеца выше: он же под растром. */}
                      {backdrop && backdrop.depth === 'over' && renderBackdrop('over')}
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
                          {/* ── ОБЛАСТЬ ЛАССО, И ОНА ОДНА (H-2). Дорожка — двойной штрих (белая
                              подложка + чёрный пунктир), видимый на любом растре; ореол
                              растушёвки — блюр в мировых пикселях, то есть свойство ПЛАТЫ, а не
                              экрана: приближение честно приближает и мягкость.

                              ⚠ ИНДЕКСЫ В РАЗМЕТКЕ ОСТАВЛЕНЫ ЛИТЕРАЛЬНЫМ НУЛЁМ НАРОЧНО. Половина
                              проб редактора якорится на `data-sel-row="0"`, `data-sel-ants="0"`,
                              `data-sel-halo="0"`, `data-sel-feather-input="0"`; выбросив индекс,
                              мы переписали бы их все ради нуля информации. Индекс отныне
                              КОНСТАНТА, а не порядковый номер, и это сказано здесь, у места
                              порождения, чтобы следующий читатель не искал вторую область. */}
                          {(() => {
                            if (!sel) return null;
                            const d = selectionPathD(sel.pts, PLATE_W, plateH);
                            if (!d) return null;
                            /* ⚠ `data-sel-active` ОТРАЖАЕТ СОСТОЯНИЕ, А НЕ ПЕЧАТАЕТ ЕДИНИЦУ.
                               Раньше здесь стоял литерал `'1'`, а узел рождается только при живом
                               `sel`, — значит атрибут не мог принять другого значения НИКОГДА.
                               Пробы читают его сегодня только как локатор, поэтому ложной зелени
                               нет; но утверждение о НЕактивном состоянии было бы неопровержимо по
                               построению — сторож у двери, которой нет. Различие настоящее: на
                               запертой карточке область РИСУЕТСЯ, но не делает ничего — Delete
                               закрыт `!frozen`, кисть тоже. */
                            return (
                              <g
                                data-sel='0'
                                data-sel-active={frozen ? '0' : '1'}
                                data-sel-feather={sel.feather}
                              >
                                {sel.feather > 0 && (
                                  <path
                                    d={d}
                                    fill='currentColor'
                                    opacity={0.12}
                                    style={{ filter: `blur(${sel.feather / 2}px)` }}
                                    data-sel-halo='0'
                                  />
                                )}
                                <path
                                  d={d}
                                  fill='currentColor'
                                  fillOpacity={0.04}
                                  stroke='#fff'
                                  strokeWidth={2.5 / zoomK}
                                />
                                <path
                                  d={d}
                                  fill='none'
                                  stroke='currentColor'
                                  strokeWidth={1.25 / zoomK}
                                  strokeDasharray={`${5 / zoomK} ${4 / zoomK}`}
                                  data-sel-ants='0'
                                />
                              </g>
                            );
                          })()}
                          {/* ⚠ ПРЕВЬЮ РИСУЕТСЯ ПРОРЕЖЕННЫМ СЛЕДОМ, А НЕ СЫРЫМ (круг 15, J-36/J-35).
                              Пока превью вело сырую ломаную, а итог получался из прореженной,
                              «что видел — то и получил» было обещанием: на отпускании контур
                              подменялся другим, и человек видел, как его обводка дёргается. Одна
                              функция на оба — и тождество держится устройством. Цена — RDP на
                              сотнях точек каждый кадр: доли миллисекунды. */}
                          {((raw: [number, number][] | null) => {
                            if (!raw || raw.length <= 1) return null;
                            /* ⚠ ИМЯ ДРУГОЕ НАРОЧНО. `const trace = …` внутри этой функции затенил
                               бы внешний `trace` целиком, включая строку, которая его читает, —
                               то есть обращение в мёртвую зону и падение экрана на первом же
                               движении руки. Сырой след приходит параметром. */
                            const shown =
                              tool === 'lasso'
                                ? thinLasso(raw, { w: PLATE_W, h: plateH }, thinEps())
                                : tool === 'freehand'
                                  ? thinTrace(raw, { w: PLATE_W, h: plateH }, thinEps())
                                  : raw;
                            if (shown.length <= 1) return null;
                            return tool === 'lasso' ? (
                              /* Живая обводка лассо: лёгкая линия + пунктир к началу — видно, где
                                 контур замкнётся, когда кнопка отпустится. */
                              <g>
                                <path
                                  d={`M${shown.map(([x, y]) => `${x * PLATE_W},${y * plateH}`).join(' L')}`}
                                  fill='currentColor'
                                  fillOpacity={0.05}
                                  stroke='currentColor'
                                  strokeWidth={1.5 / zoomK}
                                />
                                <line
                                  x1={shown[shown.length - 1][0] * PLATE_W}
                                  y1={shown[shown.length - 1][1] * plateH}
                                  x2={shown[0][0] * PLATE_W}
                                  y2={shown[0][1] * plateH}
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
                                d={`M${shown.map(([x, y]) => `${x * PLATE_W},${y * plateH}`).join(' L')}`}
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
                                  { tool: tool === 'line' ? 'line' : 'freehand', ...paint, pts: shown },
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
                            );
                          })(trace)}
                          {/* ── КРУГЛЫЙ НИБ: где он сейчас и откуда штамп берёт. Обводка чёрным по
                              белому, чтобы круг был виден и на тёмной фотографии. */}
                          {/* КРУГ НИБА ВИДЕН И ВО ВРЕМЯ ЖЕСТА, а не только при наведении: у
                              ластика собственного следа нет по определению — он убирает, — и без
                              круга рука во время стирания не видит ни границы, ни размера того,
                              чем стирает. Прежде круг гас ровно в тот момент, когда нужен. */}
                          {nodeEdit && (
                            /**
                             * УЗЛЫ И РУКОЯТКИ ПРАВЯЩЕЙСЯ КРИВОЙ.
                             *
                             * Тонкая обводка живого пути рисуется ОТДЕЛЬНО от самого штриха: пока
                             * рука тянет узел, документ ещё не тронут (запись — на отпускании), и
                             * без этой обводки экран показывал бы старую форму до самого конца
                             * жеста, то есть рука тянула бы вслепую.
                             *
                             * Все размеры делятся на зум: узел обязан оставаться одного размера
                             * под пальцем на любом приближении, иначе на 400 % он закрывает то,
                             * что двигают.
                             */
                            <g data-node-edit='' pointerEvents='none'>
                              <path
                                d={editPreviewD(nodeEdit.path, PLATE_W, plateH)}
                                fill='none'
                                stroke='currentColor'
                                strokeWidth={1 / zoomK}
                                opacity={0.5}
                              />
                              {nodeEdit.path.nodes.map((an, i) => {
                                const cx = an.a[0] * PLATE_W;
                                const cy = an.a[1] * plateH;
                                const r = (i === nodeEdit.sel ? 5 : 3.5) / zoomK;
                                return (
                                  <g key={i}>
                                    {(['in', 'out'] as const).map((side) => {
                                      const h = handleEnd(an, side);
                                      if (!h) return null;
                                      const hx = h[0] * PLATE_W;
                                      const hy = h[1] * plateH;
                                      return (
                                        <g key={side}>
                                          <line
                                            x1={cx}
                                            y1={cy}
                                            x2={hx}
                                            y2={hy}
                                            stroke='currentColor'
                                            strokeWidth={0.8 / zoomK}
                                            opacity={0.6}
                                          />
                                          <circle
                                            cx={hx}
                                            cy={hy}
                                            r={3 / zoomK}
                                            fill='#fff'
                                            stroke='currentColor'
                                            strokeWidth={1 / zoomK}
                                            data-node-handle={`${i}:${side}`}
                                          />
                                        </g>
                                      );
                                    })}
                                    <rect
                                      x={cx - r}
                                      y={cy - r}
                                      width={r * 2}
                                      height={r * 2}
                                      fill={i === nodeEdit.sel ? '#fff' : 'currentColor'}
                                      stroke='currentColor'
                                      strokeWidth={1.2 / zoomK}
                                      data-node={i}
                                    />
                                  </g>
                                );
                              })}
                            </g>
                          )}
                          {isThreadTool(tool) && nibHover && (
                            /* ТОЧКА В НАТУРАЛЬНУЮ ТОЛЩИНУ НИТИ. Не кольцо: кольцо означает
                               «столько заберётся», а нить — это то, что ЛЯЖЕТ, и показывать её
                               надо тем же телом, каким она рисуется. Белая подложка — чтобы
                               тонкая тёмная точка была видна и на тёмной фотографии. */
                            <g data-thread-cursor='' pointerEvents='none'>
                              <circle
                                cx={nibHover[0] * PLATE_W}
                                cy={nibHover[1] * plateH}
                                r={Math.max(gauge / 2 + 1.5 / zoomK, 1 / zoomK)}
                                fill='#fff'
                                opacity={0.85}
                              />
                              <circle
                                cx={nibHover[0] * PLATE_W}
                                cy={nibHover[1] * plateH}
                                r={Math.max(gauge / 2, 0.2)}
                                fill={ink}
                              />
                            </g>
                          )}
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
                            /**
                             * ПРЕВЬЮ ПЕРА РИСУЕТСЯ ТЕМ ЖЕ ШВОМ, КАКОЙ ВЫБРАН (M-1).
                             *
                             * ⚠ ЗДЕСЬ БЫЛ СЕРЫЙ ПУНКТИР — ОДИН И ТОТ ЖЕ ПРИ ЛЮБОМ ШВЕ. Владелец
                             * называл этот дефект уже дважды: в круге 7 про линию и след руки
                             * («хочется что бы под зажатием курсора отображалось именно то что
                             * рисуется а не пунктирная линия»), теперь про перо. Тогда починили
                             * две ветки из трёх; у пера осталась своя резинка, и она про шов не
                             * знала ничего.
                             *
                             * Геометрия берётся ТЕМ ЖЕ вызовом, что рисует уложенные штрихи, — не
                             * похожим, а тем же: иначе превью и результат разошлись бы в первый же
                             * день, когда кто-нибудь поправит один из двух.
                             */
                            <g>
                              {(() => {
                                const st = penStroke(pen, paint);
                                const g = st ? strokeGeometry(st, PLATE_W, plateH) : null;
                                if (!g?.d) {
                                  // Один якорь — швом рисовать ещё нечего; точка, а не пунктир.
                                  return null;
                                }
                                const previewInk = readInk(st!.ink) ?? 'currentColor';
                                return (g.offsets ?? [0]).map((dy: number, k: number) => (
                                  <path
                                    key={k}
                                    d={g.d}
                                    transform={`translate(0 ${dy})`}
                                    fill='none'
                                    stroke={previewInk}
                                    strokeWidth={g.strokeWidth}
                                    strokeDasharray={g.dash || undefined}
                                    strokeLinecap='round'
                                    strokeLinejoin='round'
                                    data-pen-preview=''
                                  />
                                ));
                              })()}
                              {/* Резинка: кривая, которая родится, если кликнуть сейчас, — с
                                  кривизной от исходящей рукоятки последнего якоря. */}
                              {penHover && !pen.drag && !pen.closed && (
                                <path
                                  d={penRubberD(pen, penHover, PLATE_W, plateH, penWorld(), shiftHeld)}
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
                      {/* ═══ ПЛАВАЮЩАЯ ВСТАВКА — ЛИНЕЙНАЯ ПОЛОВИНА (G-13) ════════════════════
                          Своим слоем, а не внутри общего SVG штрихов: тот гаснет вместе с
                          галочкой «lines», а вставка обязана быть видна, пока её ставят — иначе
                          Enter клал бы то, чего человек не видит. Геометрия — ОДНА функция с
                          зафиксированными штрихами (`strokeGeometry`), поэтому превью не может
                          соврать про шов или толщину. */}
                      {floatPreview.length > 0 && (
                        <svg
                          viewBox={`0 0 ${PLATE_W} ${plateH.toFixed(2)}`}
                          preserveAspectRatio='none'
                          className='pointer-events-none absolute inset-0 h-full w-full'
                          data-paste-strokes={floatPreview.length}
                        >
                          {floatPreview.map((stroke, i) => {
                            const g = strokeGeometry(stroke, PLATE_W, plateH);
                            if (!g.d) return null;
                            const strokeInk = readInk(stroke.ink) ?? 'currentColor';
                            return (
                              <g key={i}>
                                {g.offsets.map((dy, k) => (
                                  <path
                                    key={k}
                                    d={g.d}
                                    transform={`translate(0 ${dy})`}
                                    fill='none'
                                    stroke={strokeInk}
                                    strokeWidth={g.strokeWidth}
                                    strokeDasharray={g.dash || undefined}
                                    strokeLinecap='round'
                                    strokeLinejoin='round'
                                  />
                                ))}
                              </g>
                            );
                          })}
                        </svg>
                      )}
                      {/* ═══ ЗАПЛАТКА: ОТКУДА БЕРУТСЯ ПИКСЕЛИ (G-12) ═════════════════════════
                          Дорожка области стоит на месте — она и есть то, что перестраивается, — а
                          призрак показывает МЕСТО-ДОНОР под рукой. Без него человек видел бы, как
                          содержимое области меняется, и не понимал бы, чем он управляет. */}
                      {patchOffset && sel && (
                        <svg
                          viewBox={`0 0 ${PLATE_W} ${plateH.toFixed(2)}`}
                          preserveAspectRatio='none'
                          className='pointer-events-none absolute inset-0 h-full w-full'
                          data-patch-ghost=''
                        >
                          <path
                            d={selectionPathD(
                              sel.pts.map(
                                ([x, y]) => [x + patchOffset[0], y + patchOffset[1]] as [number, number],
                              ),
                              PLATE_W,
                              plateH,
                            )}
                            fill='none'
                            stroke='#fff'
                            strokeWidth={2.5 / zoomK}
                          />
                          <path
                            d={selectionPathD(
                              sel.pts.map(
                                ([x, y]) => [x + patchOffset[0], y + patchOffset[1]] as [number, number],
                              ),
                              PLATE_W,
                              plateH,
                            )}
                            fill='none'
                            stroke='currentColor'
                            strokeWidth={1.25 / zoomK}
                            strokeDasharray={`${5 / zoomK} ${4 / zoomK}`}
                          />
                        </svg>
                      )}
                      {/* ═══ НАПРАВЛЯЮЩИЕ (E-17) ═══════════════════════════════════════════
                          В МИРЕ, А НЕ НА ЭКРАНЕ: они привязаны к листу, значит обязаны ехать с
                          ним на панораме и зуме — своей арифметики вида им не нужно вовсе,
                          трансформ мира уже сделан. Толщина делится на зум по тому же правилу,
                          что у рамки и у муравьёв: линия разметки обязана оставаться волосяной
                          на любом приближении, иначе на 800 % она закрывает то, что размечает.

                          ЦВЕТ — ЕДИНСТВЕННОЕ, ЧЕМ ОНА ОТЛИЧАЕТСЯ ОТ НАРИСОВАННОЙ ЛИНИИ, и
                          поэтому он здесь не украшение: пунктир на этом экране уже занят
                          выделением, сплошная чёрная — это шов. Синий (#2323ff, токен дома) не
                          значит ничего другого ни на одном экране админки. Белая подложка под
                          ним — тот же приём, что у контура рамки: на тёмной фотографии
                          одноцветная нить пропадает целиком.

                          Указателя не ловит НИКОГДА (`pointer-events: none`): жест ведёт сама
                          сцена — иначе тонкая линия отнимала бы нажатие у кисти раньше, чем
                          инструмент успеет о нём узнать. */}
                      {rulersOn && guides.length > 0 && (
                        <svg
                          viewBox={`0 0 ${PLATE_W} ${plateH.toFixed(2)}`}
                          preserveAspectRatio='none'
                          className='pointer-events-none absolute inset-0 h-full w-full'
                          data-guides={guides.length}
                        >
                          {guides.map((g, i) => {
                            const held = guideDrag.current?.index === i;
                            const p =
                              g.dir === 'h'
                                ? { x1: 0, y1: g.at * plateH, x2: PLATE_W, y2: g.at * plateH }
                                : { x1: g.at * PLATE_W, y1: 0, x2: g.at * PLATE_W, y2: plateH };
                            return (
                              <g key={`${g.dir}${i}`}>
                                <line {...p} stroke='#fff' strokeWidth={3 / zoomK} opacity={0.6} />
                                <line
                                  {...p}
                                  stroke='#2323ff'
                                  strokeWidth={(held ? 2 : 1) / zoomK}
                                  data-guide={i}
                                  data-guide-dir={g.dir}
                                  data-guide-at={g.at.toFixed(4)}
                                />
                              </g>
                            );
                          })}
                        </svg>
                      )}
                      {/* ТРАНСФОРМ-РАМКА — ПОВЕРХ ВСЕГО И ВСЕГДА ОДНА (G-3, G-13, G-4). */}
                      {frame && (
                        <TransformFrameOverlay
                          quad={frame.quad}
                          owner={frame.owner}
                          axis={frame.axis}
                          zoom={zoomK}
                          hover={frameHover}
                          plateW={PLATE_W}
                          plateH={plateH}
                          /* Органы, а не геометрия: изогнутая рамка под восемью ручками сетку
                             ИМЕЕТ, но не показывает — иначе на экране жили бы оба набора разом. */
                          grid={frameShowsNodes(frame) ? frame.grid : undefined}
                          /* Кольцо роста рисуется ТЕМ ЖЕ цветом, каким `expandRasterLayer`
                             потом зальёт новое поле: экран показывает не «где будет край», а
                             буквально что там появится. */
                          cropFill={frame.owner === 'crop' ? cropFill : undefined}
                        />
                      )}
                    </div>
                    {/* ═══ ЛИНЕЙКИ (E-17) ══════════════════════════════════════════════════
                        СЁСТРЫ МИРА, А НЕ ЕГО ДЕТИ: мир двигается трансформом, и линейка внутри
                        него уехала бы вместе с ним — то есть перестала бы быть кромкой экрана.
                        Лежат ПОВЕРХ вьюпорта, размера ему не меняя (довод у `RULER_PX`).

                        Указатель они ЛОВЯТ, в отличие от всех прочих накладок редактора, и это
                        и есть орган «добавить направляющую»: нажать на линейку и повести. */}
                    {rulersOn && (
                      <>
                        <canvas
                          ref={rulerTopRef}
                          data-ruler='top'
                          onPointerDown={(e) => beginGuideFromRuler(e, 'h')}
                          className='absolute left-0 top-0 cursor-row-resize'
                          style={{ width: '100%', height: `${RULER_PX}px` }}
                        />
                        <canvas
                          ref={rulerLeftRef}
                          data-ruler='left'
                          onPointerDown={(e) => beginGuideFromRuler(e, 'v')}
                          className='absolute left-0 top-0 cursor-col-resize'
                          style={{ width: `${RULER_PX}px`, height: '100%' }}
                        />
                        {/* Угол: место, где сходятся обе шкалы. Ничего не делает нарочно — он не
                            орган, а стык хрома, и кнопка здесь обещала бы жест, которого нет. */}
                        <div
                          data-ruler='corner'
                          className='pointer-events-none absolute left-0 top-0 border-b border-r border-hairline bg-bgColor'
                          style={{ width: `${RULER_PX}px`, height: `${RULER_PX}px` }}
                        />
                        {/* ГДЕ РУКА — ДВЕ НИТИ ПО ШКАЛАМ. Единственное, что здесь чернильное:
                            это ответ на вопрос «сколько», и он обязан читаться сразу. */}
                        <div
                          ref={markXRef}
                          data-ruler-cursor='x'
                          className='pointer-events-none absolute left-0 top-0 bg-textColor'
                          style={{ width: '1px', height: `${RULER_PX}px` }}
                        />
                        <div
                          ref={markYRef}
                          data-ruler-cursor='y'
                          className='pointer-events-none absolute left-0 top-0 bg-textColor'
                          style={{ width: `${RULER_PX}px`, height: '1px' }}
                        />
                      </>
                    )}
                  </div>
                </div>
              </div>
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
