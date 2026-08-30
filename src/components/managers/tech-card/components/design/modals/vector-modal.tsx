import * as Dialog from '@radix-ui/react-dialog';
import type {
  DesignBenchSlotRef,
  GetDesignBandResponse,
  common_DesignPicture,
} from 'api/proto-http/admin';
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
import { RASTER_FALLBACK_W, rasteriseStrokesOverBase } from './rasterise-layer';
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
  DEFAULT_RATIO,
  MAX_STROKES_BYTES,
  STITCHES,
  layerSvg,
  readLayer,
  settleTrace,
  strokeGeometry,
  strokePolyline,
  writeLayer,
  type CubicSeg,
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
 * ВОПРОС ПРИ ВХОДЕ. Плата без единого штриха встречает развилкой: рисовать поверх растра (то, что
 * работает) или перевести растр в вектор. Вторая ветка СЕГОДНЯ НЕДОСТИЖИМА — у провода нет рода
 * прогона `vector`, а бакет принимает только JPEG/PNG/WebP/GIF, то есть SVG некуда положить, — и
 * дверь стоит ЗАПЕРТОЙ С ПРИЧИНОЙ, а не молча мёртвой. Точка подключения — проп `onTraceToVector`:
 * когда контракт дорастёт, вызывающий передаёт обработчик, и дверь открывается без правки этого
 * файла. Слой, в котором вектор уже есть, развилку не показывает: «если зашли ещё раз — оно уже
 * имеет вектор».
 */

type Tool = 'line' | 'freehand' | 'curve' | 'select' | 'erase' | 'pan';

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
const r4 = (n: number) => Math.round(n * 10000) / 10000;

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
 * ПЕРО В ПРОЦЕССЕ. Якоря и ИСХОДЯЩИЕ рукоятки — в долях кадра, как и готовые штрихи: жест обязан
 * жить в той же системе координат, в которой будет храниться, иначе зум посреди построения
 * сдвинул бы недорисованную кривую.
 */
type PenState = {
  anchors: [number, number][];
  /** Рукоятка якоря `i`, вытянутая при его постановке; `null` — якорь поставлен кликом. */
  outs: ([number, number] | null)[];
  /** Рукоятка последнего якоря прямо сейчас тянется. */
  dragging: boolean;
};

/**
 * Готовый штрих из состояния пера.
 *
 * Рукоятки симметричны, как у всякого пера: исходящая `out_i` задаёт `c1` интервала `i`, а
 * ВХОДЯЩАЯ рукоятка якоря — зеркало его исходящей, поэтому `c2` интервала — `a_{i+1} − out_{i+1}`.
 * Подряд стоящие одинаковые якоря склеиваются: даблклик-коммит кладёт второй якорь в ту же точку.
 *
 * СПИСОК СЕГМЕНТОВ ПИШЕТСЯ ВСЕГДА, даже сплошь `null`. Это документированное различие формата
 * (vector-strokes.ts): без списка интервалы сглаживает Catmull-Rom, а перо, поставившее три якоря
 * кликами, обещало ПРЯМЫЕ прогоны — сгладить их значило бы нарисовать кривую, которую никто не
 * рисовал.
 */
function penStroke(
  pen: PenState,
  brush: StitchKey,
  weight: StrokeWeight,
  dashed: boolean,
): VectorStroke | null {
  const anchors: [number, number][] = [];
  const outs: ([number, number] | null)[] = [];
  pen.anchors.forEach((a, i) => {
    const prev = anchors[anchors.length - 1];
    if (prev && prev[0] === a[0] && prev[1] === a[1]) {
      // Совпавший якорь несёт рукоятку — жест «кликнул ещё раз и потянул» правит последний якорь.
      if (pen.outs[i]) outs[outs.length - 1] = pen.outs[i];
      return;
    }
    anchors.push(a);
    outs.push(pen.outs[i]);
  });
  if (anchors.length < 2) return null;
  const segs: (CubicSeg | null)[] = [];
  for (let i = 0; i < anchors.length - 1; i++) {
    const out = outs[i];
    const nextOut = outs[i + 1];
    if (!out && !nextOut) {
      segs.push(null);
      continue;
    }
    const a = anchors[i];
    const b = anchors[i + 1];
    const c1 = out ? [a[0] + out[0], a[1] + out[1]] : [a[0], a[1]];
    const c2 = nextOut ? [b[0] - nextOut[0], b[1] - nextOut[1]] : [b[0], b[1]];
    segs.push([r4(c1[0]), r4(c1[1]), r4(c2[0]), r4(c2[1])]);
  }
  return {
    tool: 'curve',
    brush,
    weight,
    dashed,
    pts: anchors.map(([x, y]) => [r4(x), r4(y)] as [number, number]),
    segs,
  };
}

/** Живой путь пера для превью — та же арифметика рукояток, что у `penStroke`, в юнитах бокса. */
function penPreviewD(pen: PenState, w: number, h: number): string {
  const a = pen.anchors;
  if (!a.length) return '';
  let d = `M${(a[0][0] * w).toFixed(2)},${(a[0][1] * h).toFixed(2)}`;
  for (let i = 0; i < a.length - 1; i++) {
    const out = pen.outs[i];
    const nextOut = pen.outs[i + 1];
    const p = a[i];
    const q = a[i + 1];
    if (!out && !nextOut) {
      d += ` L${(q[0] * w).toFixed(2)},${(q[1] * h).toFixed(2)}`;
      continue;
    }
    const c1 = out ? [(p[0] + out[0]) * w, (p[1] + out[1]) * h] : [p[0] * w, p[1] * h];
    const c2 = nextOut ? [(q[0] - nextOut[0]) * w, (q[1] - nextOut[1]) * h] : [q[0] * w, q[1] * h];
    d += ` C${c1[0].toFixed(2)},${c1[1].toFixed(2)} ${c2[0].toFixed(2)},${c2[1].toFixed(2)} ${(
      q[0] * w
    ).toFixed(2)},${(q[1] * h).toFixed(2)}`;
  }
  return d;
}

export function VectorModal({
  open,
  onOpenChange,
  techCardId,
  band,
  base,
  slot,
  disabled,
  onFlattened,
  onTraceToVector,
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
   * ТОЧКА ПОДКЛЮЧЕНИЯ ветки «да, перевести растр в вектор» из развилки при входе. Пока контракт
   * не умеет ни рода прогона `vector`, ни хранения SVG, ни один вызывающий её не передаёт — и
   * дверь стоит запертой с причиной. Появится обработчик — дверь оживёт без правки этого файла.
   */
  onTraceToVector?: () => void;
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
  const [vecOn, setVecOn] = useState(true);
  const [rasterOn, setRasterOn] = useState(true);
  const [trace, setTrace] = useState<[number, number][] | null>(null);
  const [pen, setPen] = useState<PenState | null>(null);
  const [ratio, setRatio] = useState<number>(wireRatio);
  const [unreadable, setUnreadable] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [refusal, setRefusal] = useState<string | null>(null);
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
    putPen(null);
    putTrace(null);
    setRefusal(null);
    setConfirmExit(false);
    seededJson.current = JSON.stringify(doc.strokes);
    userMoved.current = false;
    /**
     * РАЗВИЛКА — ТОЛЬКО ПЕРЕД ПУСТОЙ ПЛАТОЙ С РАСТРОМ. Слой со штрихами уже «имеет вектор» и
     * вопрос был бы задан о сделанном выборе; рисование с нуля растра не имеет и спрашивать не о
     * чем; нечитаемый слой обязан показать своё предупреждение, а не прятать его за вопросом;
     * read-only визит не рисует вовсе.
     */
    setEntered(!baseSrc || !!disabled || doc.unreadable || doc.strokes.length > 0);
    resetHistory();
  }, [open, knownId, knownRev, baseMediaId, baseSrc, disabled, loaded, wireRatio, resetHistory]);

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
        putPen(
          p.anchors.length > 1
            ? { anchors: p.anchors.slice(0, -1), outs: p.outs.slice(0, -1), dragging: false }
            : null,
        );
        return;
      }
      undo();
      setSelected(null);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, frozen, undo, putPen]);

  // ── рисование ──────────────────────────────────────────────────────────────────────────────

  const commitTrace = useCallback(
    (pts: [number, number][], asLine: boolean, liveBrush: StitchKey, liveWeight: StrokeWeight, liveDashed: boolean) => {
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
          brush: liveBrush,
          weight: liveWeight,
          dashed: liveDashed,
          pts: settled,
        },
      ]);
    },
    [record],
  );

  /** Коммит пера: Enter или даблклик. Смена инструмента тоже коммитит — построенное не выбрасывается. */
  const commitPen = useCallback(() => {
    const p = penRef.current;
    putPen(null);
    if (!p) return;
    const stroke = penStroke(p, brush, weight, dashed);
    if (!stroke) return;
    record();
    setStrokes((prev) => [...prev, stroke]);
  }, [brush, weight, dashed, record, putPen]);

  /** Смена инструмента одной дорогой — и с клавиши, и с чипа: недостроенное перо коммитится. */
  const switchTool = useCallback(
    (t: Tool) => {
      if (penRef.current) commitPen();
      setTool(t);
      if (t !== 'select') setSelected(null);
    },
    [commitPen],
  );

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

    if (tool === 'select' || tool === 'erase') {
      const hit = hitStroke(strokes, at, PLATE_W, plateH, HIT_PX / (viewRef.current.zoom || 1));
      if (hit === null) {
        setSelected(null);
        return;
      }
      if (tool === 'erase') {
        if (frozen) return;
        record();
        setStrokes((prev) => prev.filter((_, i) => i !== hit));
        setSelected(null);
        return;
      }
      setSelected(hit);
      return;
    }

    if (frozen) return;
    event.preventDefault();
    // Capture on the VIEWPORT: the pointer routinely leaves the box mid-drag and without capture
    // the stroke would end wherever it crossed the border.
    vp.setPointerCapture?.(event.pointerId);

    if (tool === 'curve') {
      const prev = penRef.current;
      putPen(
        prev
          ? { anchors: [...prev.anchors, at], outs: [...prev.outs, null], dragging: true }
          : { anchors: [at], outs: [null], dragging: true },
      );
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
    if (livePen?.dragging) {
      const at = frameAt(event);
      const last = livePen.anchors[livePen.anchors.length - 1];
      if (!last) return;
      const dx = at[0] - last[0];
      const dy = at[1] - last[1];
      const outs = livePen.outs.slice();
      // Микродрожь под кликом — не рукоятка: порог полпроцента кадра отделяет «кликнул» от
      // «потянул», иначе каждый клик пера рождал бы кривую с невидимой кривизной.
      outs[outs.length - 1] = Math.hypot(dx, dy) < 0.005 ? null : [dx, dy];
      putPen({ ...livePen, outs });
      return;
    }
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
    if (penRef.current?.dragging) {
      putPen({ ...penRef.current, dragging: false });
      return;
    }
    const liveTrace = traceRef.current;
    if (!liveTrace) return;
    if (liveTrace.length >= 2) commitTrace(liveTrace, tool === 'line', brush, weight, dashed);
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

  /** Свойство кисти ИЛИ выбранного штриха — какой контекст на рейке, тому и достаётся правка. */
  const pickBrush = (key: StitchKey) => {
    if (selected !== null) editStroke({ brush: key });
    else setBrush(key);
  };
  const pickWeight = (w: StrokeWeight) => {
    if (selected !== null) editStroke({ weight: w });
    else setWeight(w);
  };
  const pickDashed = (d: boolean) => {
    if (selected !== null) editStroke({ dashed: d });
    else setDashed(d);
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

  const download = () => {
    const w = RASTER_FALLBACK_W;
    const h = Math.round(w / (ratio || DEFAULT_RATIO));
    const svg = layerSvg(strokes, { width: w, height: h, baseHref: baseSrc || undefined });
    const href = URL.createObjectURL(new Blob([svg], { type: 'image/svg+xml' }));
    const a = document.createElement('a');
    a.href = href;
    a.download = `${base ? pictureHandle(base) : 'drawing'}-vector.svg`.replace(/[^\w.-]+/g, '-');
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(href);
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
      case 'e':
        switchTool('erase');
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
  const anyCallout = unreadable || readPending || readFailed || !!refusal || tooLarge;

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
        : tool === 'select' || tool === 'erase'
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
            // Esc-ЛЕСТНИЦА: живое перо → выделение → выход (через одну дверь со стражем).
            // Без `preventDefault` Radix закрывает экран раньше любой ступени.
            if (penRef.current) {
              e.preventDefault();
              putPen(null);
              return;
            }
            if (selected !== null) {
              e.preventDefault();
              setSelected(null);
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
              /* ── развилка входа ──────────────────────────────────────────────────────── */
              <div className='flex min-h-0 flex-1 items-start justify-center pt-[12vh]'>
                <div className='w-[440px] max-w-full space-y-2.5 border border-borderColor bg-bgColor p-4'>
                  <Text
                    size='micro'
                    variant='uppercase'
                    tracking='label'
                    component='p'
                    className='font-bold'
                  >
                    this flat has no vector yet
                  </Text>
                  <Text size='micro' variant='label' component='p'>
                    Two ways from here. Draw over the raster: your strokes live on their own layer,
                    the picture underneath is never touched, and next time this screen opens the
                    vector is already here. Or convert the raster itself into a vector — not wired
                    yet, see below.
                  </Text>
                  <div className='flex flex-wrap items-center gap-1.5'>
                    <Button
                      type='button'
                      variant='main'
                      size='sm'
                      autoFocus
                      onClick={() => setEntered(true)}
                    >
                      draw over the raster
                    </Button>
                    {onTraceToVector ? (
                      <Button type='button' variant='secondary' size='sm' onClick={onTraceToVector}>
                        convert the raster to vector
                      </Button>
                    ) : (
                      /* ДВЕРЬ ЗАПЕРТА С ПРИЧИНОЙ, а не молча мёртвой: кнопка, которая ничего не
                         делает, хуже отсутствующей. Причина стоит ВИДИМЫМ текстом — title на
                         задизейбленной кнопке не показывается (pointer-events там нет). */
                      <Button type='button' variant='secondary' size='sm' disabled>
                        convert the raster to vector
                      </Button>
                    )}
                  </div>
                  {!onTraceToVector && (
                    <Text size='nano' variant='label' component='p'>
                      conversion is not wired yet: the wire has no «vector» run kind and the media
                      bucket accepts only JPEG/PNG/WebP/GIF, so an SVG has nowhere to live. The
                      door opens when the contract grows both — nothing on this screen will need to
                      change except handing it the handler.
                    </Text>
                  )}
                </div>
              </div>
            ) : (
              /* ── рейка + холст ───────────────────────────────────────────────────────── */
              <div className='flex min-h-0 min-w-0 flex-1 gap-2'>
                <VectorBrushRail
                  frozen={frozen}
                  brush={brush}
                  weight={weight}
                  dashed={dashed}
                  selected={selected}
                  selectedStroke={selectedStroke}
                  onBrush={pickBrush}
                  onWeight={pickWeight}
                  onDashed={pickDashed}
                  onRemoveSelected={removeSelected}
                  onDeselect={() => setSelected(null)}
                  vecOn={vecOn}
                  onVecOn={() => setVecOn((v) => !v)}
                  rasterOn={rasterOn}
                  onRasterOn={() => setRasterOn((v) => !v)}
                  strokesCount={strokes.length}
                  baseLabel={base ? pictureHandle(base) : null}
                  canDownload={strokes.length > 0}
                  onDownload={download}
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
                          ['select', 'v'],
                          ['erase', 'e'],
                          ['pan', 'h'],
                        ] as const
                      ).map(([t, key]) => (
                        <Chip
                          key={t}
                          selected={tool === t}
                          pressed={tool === t}
                          disabled={frozen && t !== 'select' && t !== 'pan'}
                          onClick={() => switchTool(t)}
                          title={`${t} (${key})`}
                        >
                          {t}
                        </Chip>
                      ))}
                    </ChipRow>
                    <Text size='nano' variant='label' component='span' className='min-w-0'>
                      {tool === 'curve'
                        ? pen
                          ? 'click adds an anchor, drag pulls its handle · enter or double-click finishes · esc drops it'
                          : 'click to place anchors, drag to bend — a real pen'
                        : tool === 'select'
                          ? 'click a stroke — the rail edits its stitch'
                          : tool === 'erase'
                            ? 'click a stroke to remove it'
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
                      {vecOn && (
                        <svg
                          viewBox={`0 0 ${PLATE_W} ${plateH.toFixed(2)}`}
                          preserveAspectRatio='none'
                          className='pointer-events-none absolute inset-0 h-full w-full'
                        >
                          {strokes.map((stroke, i) => {
                            const g = strokeGeometry(stroke, PLATE_W, plateH);
                            if (!g.d) return null;
                            return (
                              <g key={i} opacity={selected !== null && selected !== i ? 0.45 : 1}>
                                {g.offsets.map((dy, k) => (
                                  <path
                                    key={k}
                                    d={g.d}
                                    transform={`translate(0 ${dy})`}
                                    fill='none'
                                    stroke='currentColor'
                                    strokeWidth={g.strokeWidth * (selected === i ? 1.8 : 1)}
                                    strokeDasharray={g.dash || undefined}
                                    strokeLinecap='round'
                                    strokeLinejoin='round'
                                  />
                                ))}
                              </g>
                            );
                          })}
                          {trace && trace.length > 1 && (
                            <path
                              d={`M${trace.map(([x, y]) => `${x * PLATE_W},${y * plateH}`).join(' L')}`}
                              fill='none'
                              stroke='currentColor'
                              strokeWidth={6 / zoomK}
                              strokeDasharray={`${10 / zoomK} ${10 / zoomK}`}
                            />
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
                              />
                              {pen.anchors.map(([x, y], i) => (
                                <rect
                                  key={i}
                                  x={x * PLATE_W - 4 / zoomK}
                                  y={y * plateH - 4 / zoomK}
                                  width={8 / zoomK}
                                  height={8 / zoomK}
                                  fill='currentColor'
                                />
                              ))}
                              {(() => {
                                const last = pen.anchors[pen.anchors.length - 1];
                                const out = pen.outs[pen.outs.length - 1];
                                if (!last || !out) return null;
                                const cx = last[0] * PLATE_W;
                                const cy = last[1] * plateH;
                                const dx = out[0] * PLATE_W;
                                const dy = out[1] * plateH;
                                return (
                                  <line
                                    x1={cx - dx}
                                    y1={cy - dy}
                                    x2={cx + dx}
                                    y2={cy + dy}
                                    stroke='currentColor'
                                    strokeWidth={1.5 / zoomK}
                                  />
                                );
                              })()}
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
