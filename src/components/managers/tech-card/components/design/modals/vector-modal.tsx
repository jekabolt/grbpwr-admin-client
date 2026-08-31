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
import { useEditHistory } from 'ui/components/annotation/history';
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
  layerRefusalText,
  uploadRaster,
  useDesignEditLayer,
  useEditLayerWrites,
  type LayerHandle,
} from './use-edit-layer';
import { VectorBrushRail } from './vector-brush-rail';
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
  MAX_GAUGE,
  MAX_STROKES_BYTES,
  MIN_GAUGE,
  STITCHES,
  WEIGHT_GAUGE,
  gaugeWeight,
  layerSvg,
  readInk,
  readLayer,
  settleTrace,
  strokeGeometry,
  strokePolyline,
  writeLayer,
  type StitchKey,
  type StrokeWeight,
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

type Tool = 'line' | 'freehand' | 'curve' | 'lasso' | 'select' | 'erase' | 'stamp' | 'pan';

/** Подпись чипа инструмента. Внутреннее имя `curve` — слово ФОРМАТА штриха и не меняется; на
 *  экране инструмент называется тем словом, которым его просил владелец: pen. */
const TOOL_LABEL: Record<Tool, string> = {
  line: 'line',
  freehand: 'freehand',
  curve: 'pen',
  lasso: 'lasso',
  select: 'select',
  erase: 'erase',
  stamp: 'stamp',
  pan: 'pan',
};

/** Инструменты круглого ниба — ластик и штамп. Их след копится так же, как след кисти. */
const isNibTool = (t: Tool): t is 'erase' | 'stamp' => t === 'erase' || t === 'stamp';

/** Ширина мира в css-пикселях до зума — она же ширина viewBox сцены, юниты совпадают 1:1. */
const PLATE_W = 1000;
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
  /** Кисть в руке: вид шва, вес, «строительность» СЛЕДУЮЩЕГО штриха. */
  const [brush, setBrush] = useState<StitchKey>('plain');
  const [weight, setWeight] = useState<StrokeWeight>('thin');
  const [dashed, setDashed] = useState(false);
  /** Цвет нити в руке. Чёрный при входе: цвет — утверждение, и его делает человек, не машина. */
  const [ink, setInk] = useState<string>(DEFAULT_INK);
  /** Размер шва в руке, в пикселях платы. Стартует ступенью `thin` — прежним весом по умолчанию. */
  const [gauge, setGauge] = useState<number>(WEIGHT_GAUGE.thin);
  /** Круг ластика и штампа, в пикселях платы. Отдельно от нити — см. довод у пропа рейки. */
  const [nib, setNib] = useState<number>(DEFAULT_NIB);
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

  const history = useEditHistory<VectorStroke>(strokes, setStrokes);
  const { record, undo, reset: resetHistory } = history;

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
    setWeight('thin');
    setDashed(false);
    setInk(DEFAULT_INK);
    setGauge(WEIGHT_GAUGE.thin);
    setNib(DEFAULT_NIB);
    setPicking(false);
    setStampSrc(null);
    stampOffset.current = null;
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

  // ⌘Z / Ctrl+Z. MATCHED BY `code`, NEVER BY `key`: on a Russian layout `event.key` is «я» and a
  // comparison against the letter z is dead — the same trap the assembly screen was bitten by.
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
      // Перо в работе: ⌘Z снимает ПОСЛЕДНИЙ ЯКОРЬ, а не последний штрих, — отменяется то, что
      // делалось только что. Пустеющее перо гаснет целиком.
      const p = penRef.current;
      if (p) {
        putPen(penUndo(p));
        return;
      }
      undo();
      setSelected(null);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, frozen, undo, putPen]);

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
    const px = Math.min(MAX_GAUGE, Math.max(MIN_GAUGE, gauge));
    const hex = readInk(ink);
    return {
      brush,
      weight: gaugeWeight(px),
      dashed,
      ...(hex && hex !== DEFAULT_INK ? { ink: hex } : {}),
      gauge: px,
    };
  }, [brush, dashed, ink, gauge]);

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
      record();
      setStrokes((prev) => [
        ...prev,
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
    [record],
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
    record();
    setStrokes((prev) => [...prev, stroke]);
  }, [paint, record, putPen, putPenHover]);

  /** Смена инструмента одной дорогой — и с клавиши, и с чипа: недостроенное перо коммитится. */
  const switchTool = useCallback(
    (t: Tool) => {
      if (penRef.current) commitPen();
      setTool(t);
      if (t !== 'select') setSelected(null);
    },
    [commitPen],
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

    // ШТАМП: alt-клик БЕРЁТ ИСТОЧНИК и ничего не печатает — жест фотошопа буква в букву.
    if (tool === 'stamp' && event.altKey) {
      event.preventDefault();
      setStampSrc(at);
      stampOffset.current = null;
      showMessage('source taken. Now drag where it should be printed', 'success');
      return;
    }
    if (tool === 'stamp' && !stampSrc) {
      showMessage('alt-click the place to copy FROM first, then drag', 'error');
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
    if (isNibTool(tool)) {
      putTrace(null);
      if (frozen) return;
      const world = { w: PLATE_W, h: plateH };
      const radius = nib / 2;
      if (tool === 'erase') {
        // РЕЖЕТ, А НЕ СНИМАЕТ ОБЪЕКТ ЦЕЛИКОМ — тем же резчиком, что «delete inside» лассо.
        const { next, changed } = eraseAlong(strokes, liveTrace, radius, world);
        if (!changed) return;
        record();
        setStrokes(next);
        setSelected(null);
        return;
      }
      const src = stampSrc;
      if (!src) return;
      // Смещение фиксируется ПЕРВЫМ мазком и живёт до следующего alt-клика — режим Aligned.
      if (!stampOffset.current) {
        stampOffset.current = [liveTrace[0][0] - src[0], liveTrace[0][1] - src[1]];
      }
      const born = stampAlong(strokes, liveTrace, stampOffset.current, radius, world);
      if (!born.length) {
        showMessage('nothing under the source: the stamp copies strokes, not pixels', 'error');
        return;
      }
      record();
      setStrokes((prev) => [...prev, ...born]);
      return;
    }
    if (liveTrace.length >= 2) commitTrace(liveTrace, tool === 'line', paint);
    putTrace(null);
  };

  // ── the stroke under edit ──────────────────────────────────────────────────────────────────

  const editStroke = (fields: Partial<VectorStroke>) => {
    if (selected === null || frozen) return;
    record();
    setStrokes((prev) => prev.map((s, i) => (i === selected ? { ...s, ...fields } : s)));
  };

  const removeSelected = () => {
    if (selected === null || frozen) return;
    record();
    setStrokes((prev) => prev.filter((_, i) => i !== selected));
    setSelected(null);
  };

  // ── операции над выделениями лассо ─────────────────────────────────────────────────────────

  /** Копия того, что внутри области. Со смещением — копия точно поверх читалась бы как «ничего». */
  const copySel = (i: number) => {
    const sel = sels[i];
    if (!sel || frozen) return;
    const born = copyInsideSelection(strokes, sel.pts);
    if (!born.length) {
      showMessage('the selection holds no strokes — nothing was copied', 'error');
      return;
    }
    record();
    setStrokes((prev) => [...prev, ...born]);
    showMessage(
      `${born.length} stroke${born.length === 1 ? '' : 's'} copied — the copies sit slightly offset`,
      'success',
    );
  };

  /** Стереть то, что внутри: штрихи РЕЖУТСЯ по дорожке, наружные куски живут дальше. */
  const deleteSel = (i: number) => {
    const sel = sels[i];
    if (!sel || frozen) return;
    const { next, changed } = deleteInsideSelection(strokes, sel.pts);
    if (!changed) {
      showMessage('the selection holds no strokes — nothing was deleted', 'error');
      return;
    }
    record();
    setStrokes(next);
    setSelected(null);
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
  /** Размер: у выбранной строки правится её `gauge`, вместе с ближайшей ступенью `weight`. */
  const pickGauge = (px: number) => {
    const n = Math.min(MAX_GAUGE, Math.max(MIN_GAUGE, Math.round(px) || MIN_GAUGE));
    if (selected !== null) editStroke({ gauge: n, weight: gaugeWeight(n) });
    else {
      setGauge(n);
      setWeight(gaugeWeight(n));
    }
  };
  /** Ступень — то же число, названное словом; и чип, и поле правят ОДНУ величину. */
  const pickWeightPreset = (w: StrokeWeight) => pickGauge(WEIGHT_GAUGE[w]);

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
        baseSrc: rasterOn ? baseSrc : '',
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
  const dirty = entered && strokesJson !== seededJson.current;

  /** Store the strokes and adopt the rev the server hands back. Returns the layer's id. */
  const persist = useCallback(async (): Promise<number> => {
    const res = await saveLayer.mutateAsync({
      layerId: layerRef.current.id,
      baseMediaId,
      expectedRev: layerRef.current.rev,
      strokes: payload,
    });
    const stored = res.layer;
    const next: LayerHandle = {
      id: stored?.id ?? layerRef.current.id,
      rev: stored?.rev ?? layerRef.current.rev,
    };
    layerRef.current = next;
    setLayer(next);
    // Сохранённое перестаёт быть «несохранённым» у стража выхода.
    seededJson.current = strokesJson;
    return next.id;
  }, [saveLayer, baseMediaId, payload, strokesJson]);

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
    if (frozen || tooLarge || !strokes.length || busy) return;
    setBusy('saving the drawing…');
    setRefusal(null);
    try {
      await persist();
      showMessage('the drawing is saved — no picture was made', 'success');
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
    () => rasteriseStrokesOverBase({ baseSrc, strokes, ratio }),
    [baseSrc, ratio, strokes],
  );

  const saveAsPicture = async () => {
    if (frozen || tooLarge || !strokes.length || busy) return;
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
    if (dirty && !frozen && strokes.length > 0) {
      setConfirmExit(true);
      return;
    }
    onOpenChange(false);
  }, [busy, dirty, frozen, strokes.length, onOpenChange]);

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
    switch (k) {
      case 'v':
        switchTool('select');
        break;
      case 'l':
        switchTool('line');
        break;
      case 'b':
        switchTool('freehand');
        break;
      case 'p':
        switchTool('curve');
        break;
      case 'w':
        switchTool('lasso');
        break;
      case 'e':
        switchTool('erase');
        break;
      case 's':
        switchTool('stamp');
        break;
      // Пипетка — не инструмент, а МОДИФИКАТОР следующего клика, поэтому она переключается, а не
      // «берётся в руку»: `i` — та же буква, что и в фотошопе.
      case 'i':
        if (!frozen) setPicking((v) => !v);
        break;
      case 'h':
        switchTool('pan');
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
  const ready = !frozen && strokes.length > 0 && !tooLarge && !busy;
  /** Слой-файл без редактируемой проекции: файл цел, штрихов нет — экран обязан сказать это. */
  const fileOnly = entered && fileMediaId > 0 && strokes.length === 0 && !readPending;
  const anyCallout =
    unreadable || readPending || readFailed || !!refusal || tooLarge || fileOnly;

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
            if (busy || (dirty && !frozen && strokes.length > 0)) {
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
                    <Chip
                      dashed
                      disabled={frozen || !history.canUndo()}
                      onClick={() => {
                        undo();
                        setSelected(null);
                      }}
                      title='undo the last gesture (⌘z)'
                    >
                      undo
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
                  onWeight={pickWeightPreset}
                  onDashed={pickDashed}
                  onInk={pickInk}
                  onGauge={pickGauge}
                  nib={nib}
                  onNib={(px) => setNib(clampNib(px))}
                  nibTool={isNibTool(tool) ? tool : null}
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
                  vecOn={vecOn}
                  onVecOn={() => setVecOn((v) => !v)}
                  rasterOn={rasterOn}
                  onRasterOn={() => setRasterOn((v) => !v)}
                  strokesCount={strokes.length}
                  baseLabel={base ? pictureHandle(base) : null}
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
                    record();
                    setStrokes((prev) => (mode === 'replace' ? incoming : [...prev, ...incoming]));
                    setSelected(null);
                  }}
                  saveNote={saveNote}
                />

                <div className='flex min-h-0 min-w-0 flex-1 flex-col gap-1'>
                  {/* Инструменты — НАД холстом, во всю его ширину: рейка отдана кистям. */}
                  <div className='flex flex-wrap items-center gap-2 border border-borderColor bg-bgColor px-2 py-1'>
                    <ChipRow>
                      {(
                        [
                          ['line', 'l'],
                          ['freehand', 'b'],
                          ['curve', 'p'],
                          ['lasso', 'w'],
                          ['select', 'v'],
                          ['erase', 'e'],
                          ['stamp', 's'],
                          ['pan', 'h'],
                        ] as const
                      ).map(([t, key]) => (
                        <Chip
                          key={t}
                          selected={tool === t}
                          pressed={tool === t}
                          disabled={frozen && t !== 'select' && t !== 'pan'}
                          onClick={() => switchTool(t)}
                          title={`${TOOL_LABEL[t]} (${key})`}
                        >
                          {TOOL_LABEL[t]}
                        </Chip>
                      ))}
                    </ChipRow>
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
                    <Text size='nano' variant='label' component='span' className='min-w-0'>
                      {tool === 'curve'
                        ? // ОДНА строка на весь путь: смена текста посреди жеста — тот же сдвиг холста.
                          'click = corner · drag = curve · grab a handle to bend, alt splits the pair · click the first anchor closes · enter/esc finish'
                        : tool === 'lasso'
                          ? 'draw around an area · its strokes can be copied or deleted from the rail · feather is each selection’s own'
                          : tool === 'select'
                            ? 'click a stroke — the rail edits its stitch'
                            : tool === 'erase'
                              ? 'drag the nib: it CUTS what it covers, the rest of the line stays'
                              : tool === 'stamp'
                                ? 'alt-click to take the source, then drag. The strokes under the source are printed under your hand'
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
                          className='pointer-events-none absolute inset-0 block h-full w-full'
                          style={{ objectFit: 'fill' }}
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
                            ) : isNibTool(tool) ? (
                              /* СЛЕД НИБА В НАТУРАЛЬНУЮ ШИРИНУ — не намёк линией, а ровно та
                                 полоса, которую ластик вырежет (или штамп напечатает). Ширина в
                                 МИРОВЫХ пикселях и на зум НЕ делится: ниб — свойство платы, и
                                 приближение обязано приближать и его. */
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
                            ) : (
                              <path
                                d={`M${trace.map(([x, y]) => `${x * PLATE_W},${y * plateH}`).join(' L')}`}
                                fill='none'
                                stroke='currentColor'
                                strokeWidth={6 / zoomK}
                                strokeDasharray={`${10 / zoomK} ${10 / zoomK}`}
                              />
                            ))}
                          {/* ── КРУГЛЫЙ НИБ: где он сейчас и откуда штамп берёт. Обводка чёрным по
                              белому, чтобы круг был виден и на тёмной фотографии. */}
                          {isNibTool(tool) && nibHover && !trace && (
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
                          {tool === 'stamp' && stampSrc && (
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
