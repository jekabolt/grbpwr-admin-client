// Лист DXF как он есть: детали в СВОИХ координатах чертежа, кликабельные (Ф10.1).
//
// Почему это существует. Сопоставление блока с деталью кроя раньше делалось по таблице имён, а
// имя в файле — это то, что придумал экспортёр («PERED_S», «Block_17»). Понять, о какой детали
// речь, по такому имени нельзя: человек ориентируется по форме и по тому, где деталь лежит
// среди соседей. Поэтому единственный честный носитель вопроса «что это за деталь» — сам лист.
//
// Рисуем СВОИ разобранные контуры, а не файл через WebGL-вьювер: это ровно та геометрия, по
// которой считается раскладка и заводятся детали, так что показанное и сопоставляемое не могут
// разойтись. Вьювер красивее, но он ничего не знает про детали.
import { useEffect, useMemo, useRef, useState } from 'react';
import type { PieceDTO, Pt } from 'lib/nesting/types';
import { LabelSpace, planLabel, type LabelPlan } from 'lib/nesting/render/label-fit';
import type { BoxMm } from 'lib/pattern-import/types';
import { GenericPopover, Text } from 'ui';
import { BodySilhouette } from './body-silhouette';
import { outlineGeo } from './sheet-outline-geo';
import { useSheetViewPrefs, type SheetViewPrefs } from './sheet-view-prefs';

// Состояние блока на листе. Серо-чернильная палитра — та же, что у редактора раскладки;
// красный оставлен ровно за одним смыслом: связь снимается.
export type PieceMark = 'open' | 'staged' | 'mapped' | 'dropped' | 'unnamed';

// Вид листа (владелец, patterns-lite r3): синяя заливка 12 % и синяя обводка 1px — деталь
// «есть и связана»; остальные состояния отличаются от неё обводкой/пунктиром, как раньше.
const BLUE = '#2323ff';
// «связь снимается» — один красный на весь лист: заливка состояния, линия шва, засечки, рамка фокуса.
const DROP_RED = '#c22222';
type PieceStyle = {
  fill: string;
  fillOpacity: number;
  stroke: string;
  strokeOpacity: number;
  dash: boolean;
};
const STYLE: Record<PieceMark, PieceStyle> = {
  // не сопоставлена — пустая, пунктиром: это то, что ещё просит ответа
  open: { fill: '#ffffff', fillOpacity: 1, stroke: '#8a8a8a', strokeOpacity: 1, dash: true },
  // выбор сделан в этой сессии, но карточка не сохранена
  staged: { fill: BLUE, fillOpacity: 0.12, stroke: BLUE, strokeOpacity: 0.8, dash: true },
  // связь уже лежит на сервере
  mapped: { fill: BLUE, fillOpacity: 0.12, stroke: BLUE, strokeOpacity: 0.8, dash: false },
  // помечена «снять» — связь уйдёт при сохранении
  dropped: { fill: '#ffffff', fillOpacity: 1, stroke: DROP_RED, strokeOpacity: 1, dash: true },
  // в файле у контура нет имени блока, привязать не к чему (приглушена)
  unnamed: { fill: '#f2f2f2', fillOpacity: 1, stroke: '#d5d5d5', strokeOpacity: 1, dash: false },
};

const GRID_STROKE = '#e6e6f0';
// Один шаг сетки, в см листа: сетка масштабируется вместе с деталями, шаг от зума не зависит.
const GRID_STEP = 10;
const SIZE_INK = '#311eee';

// Линии сетки на видимый кадр: шаг в см, только видимые, одним путём.
function gridPath(b: Box, step: number): string {
  const x0 = Math.floor(b.x / step) * step;
  const y0 = Math.floor(b.y / step) * step;
  let d = '';
  for (let x = x0; x <= b.x + b.w; x += step) d += `M${x},${b.y}V${b.y + b.h}`;
  for (let y = y0; y <= b.y + b.h; y += step) d += `M${b.x},${y}H${b.x + b.w}`;
  return d;
}

const VIEW_TOGGLES: [keyof SheetViewPrefs, string][] = [
  ['grid', 'grid'],
  ['silhouette', 'body silhouette'],
  ['sizes', 'sizes'],
  ['names', 'names'],
  ['grain', 'grainline'],
  ['vertices', 'vertices'],
];

const ICON_BTN =
  'flex size-7 items-center justify-center border border-borderColor bg-white text-labelColor hover:border-textColor hover:text-textColor';

// A segmented row in a canvas corner, on the corner button's metrics (28px box, edge outline,
// white fill); the chosen segment is ink-filled. Adjacent segments share one border.
export function CanvasSegments({
  options,
  value,
  onChange,
  label,
}: {
  options: readonly { key: string; label: string }[];
  value: string;
  onChange: (key: string) => void;
  label: string;
}) {
  return (
    <div role='group' aria-label={label} className='flex'>
      {options.map((o, i) => {
        const on = o.key === value;
        return (
          <button
            key={o.key || '(none)'}
            type='button'
            aria-pressed={on}
            onClick={() => onChange(o.key)}
            className={`flex h-7 min-w-7 items-center justify-center border px-2 text-micro uppercase tracking-pill ${i > 0 ? 'border-l-0' : ''} ${
              on
                ? 'border-textColor bg-textColor text-bgColor'
                : 'border-borderColor bg-white text-labelColor hover:text-textColor'
            }`}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

type Box = { x: number; y: number; w: number; h: number };

// Чертёжные координаты → экранные. DXF считает Y вверх, SVG — вниз, поэтому Y инвертируется
// ЗДЕСЬ, в числах, а не групповым transform='scale(1,-1)': под таким transform зеркалятся и
// подписи, и их пришлось бы разворачивать обратно на каждой детали.
const vy = (y: number) => -y;

// Public focus coordinates are mm/Y-up; PieceSheet's SVG viewBox is cm/Y-down.
function boxFromMm(b: BoxMm, padRatio: number): Box {
  const w = Math.max((b.maxX - b.minX) / 10, 0.1);
  const h = Math.max((b.maxY - b.minY) / 10, 0.1);
  const pad = Math.max(w, h) * padRatio;
  return { x: b.minX / 10 - pad, y: vy(b.maxY / 10) - pad, w: w + 2 * pad, h: h + 2 * pad };
}

// Сдвиг курсора, ниже которого жест считается кликом, а не протяжкой (экранные пиксели).
const DRAG_SLOP = 4;

// Угол долевой ДЛЯ ПОДПИСИ. Подпись, положенная вдоль долевой, ложится вдоль детали — так её и
// ждут в лекальном цеху. Требование «ровно один отрезок» то же, что у ориентации (см.
// geom/grain-orient.ts): два кандидата — значит непонятно, какой из них долевая. Деталь без
// блока пропускаем: в файле-россыпи кандидаты общие на весь чертёж, и один случайный отрезок
// развернул бы подписи всего листа.
function grainAngleForLabel(p: PieceDTO, layer: string): number | null {
  if (!p.blockName) return null;
  const all = p.grain ?? [];
  const hits = layer ? all.filter((c) => c.layer === layer) : all;
  return hits.length === 1 ? hits[0].angleDeg : null;
}

export function PieceSheet({
  pieces,
  markOf,
  labelOf,
  selectedKey,
  keyOf,
  onPick,
  grainLayer,
  innerLayers,
  tall,
  bare,
  topLeft,
  focus,
  focusMark,
  overlay,
  onFit,
}: {
  pieces: readonly PieceDTO[];
  // Overlaid in the canvas's top-left corner (the dialog's size switch).
  topLeft?: React.ReactNode;
  // Taller canvas (60vh) for a screen where the sheet IS the screen (pieces viewer).
  tall?: boolean;
  // No gesture hint line under the sheet: only real problems stay.
  bare?: boolean;
  /** Zoom to this mm/Y-up box when its numbers change. null leaves the current view alone. */
  focus?: BoxMm | null;
  /** Stroke-only ring in the same mm/Y-up sheet coordinates. */
  focusMark?: { x: number; y: number; r: number } | null;
  /** Drawn over the pieces, under the names, in sheet coords (cm, Y down); gets cm per px. */
  overlay?: (px: number) => React.ReactNode;
  /** The corner «whole sheet» button was pressed (a zoomed caller leaves its zoom). */
  onFit?: () => void;
  // Слой долевой. '' — не показывать. Рисуется поверх контуров: раскладка поворачивает деталь
  // именно по этой линии, и человек должен увидеть прочитанное ДО того, как ткань разрезана.
  grainLayer?: string;
  // Какие слои внутренней геометрии рисовать: линия шва (припуск виден как зазор до линии
  // кроя), надсечки, свёрла, вытачки. Без них деталь на экране — голый силуэт, а режут по ним.
  innerLayers?: ReadonlySet<string>;
  // Ключ, под которым деталь опознаётся снаружи (у диалога это регистронезависимое имя блока).
  // '' = у контура нет имени, кликать нечего.
  keyOf: (piece: PieceDTO) => string;
  markOf: (piece: PieceDTO) => PieceMark;
  labelOf: (piece: PieceDTO) => string;
  selectedKey: string | null;
  onPick: (key: string) => void;
}) {
  // Деталь без чертёжных координат показать негде (см. PieceDTO.originX) — такое приходит
  // только из сохранённого маркера, который на лист не кладут, но лучше отвалиться честно.
  const placed = useMemo(
    () => pieces.filter((p) => p.originX != null && p.originY != null),
    [pieces],
  );
  const hidden = pieces.length - placed.length;

  // Габарит листа по всем деталям + поля, чтобы подписи с краю не обрезались.
  const fit = useMemo<Box | null>(() => {
    if (placed.length === 0) return null;
    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;
    for (const p of placed) {
      const ox = p.originX!;
      const oy = p.originY!;
      if (ox < minX) minX = ox;
      if (oy < minY) minY = oy;
      if (ox + p.bboxW > maxX) maxX = ox + p.bboxW;
      if (oy + p.bboxH > maxY) maxY = oy + p.bboxH;
    }
    const w = Math.max(maxX - minX, 1);
    const h = Math.max(maxY - minY, 1);
    const pad = Math.max(w, h) * 0.03;
    return { x: minX - pad, y: vy(maxY) - pad, w: w + 2 * pad, h: h + 2 * pad };
  }, [placed]);

  // Зум/панорама живут в viewBox. null = «как влезает».
  const [view, setView] = useState<Box | null>(null);
  const box = view ?? fit;
  const svgRef = useRef<SVGSVGElement | null>(null);

  const focusKey = focus ? `${focus.minX}|${focus.minY}|${focus.maxX}|${focus.maxY}` : '';
  useEffect(() => {
    if (focus) setView(boxFromMm(focus, 0.25));
    // focusKey stands for `focus`: a new object with the same numbers must not re-zoom.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focusKey]);
  // Жест: одновременно кандидат на выбор детали и на протяжку — что это было, решает пройденный
  // путь. Раньше деталь съедала pointerdown через stopPropagation, и лист переставал двигаться
  // ровно там, где деталь заполняла кадр, то есть на любом полезном увеличении.
  const gesture = useRef<{ px: number; py: number; box: Box; key: string; moved: boolean } | null>(
    null,
  );
  // Кандидат, положенный деталью за мгновение до всплытия к svg. Отдельно от `gesture` и с
  // проверкой pointerId: иначе ключ от прошлого жеста, не снятого по какой-то причине, выделил
  // бы деталь при клике по пустому месту.
  const candidate = useRef<{ key: string; pointerId: number } | null>(null);
  const [panning, setPanning] = useState(false);
  const [prefs, setPref] = useSheetViewPrefs();
  // svg появляется вместе с fit — наблюдатель размера переподписывается на это.
  const hasFit = fit != null;

  // Размер холста в пикселях — чтобы точки, подписи длин и обводки держали экранный размер
  // на любом зуме.
  const [svgSize, setSvgSize] = useState<{ w: number; h: number } | null>(null);
  useEffect(() => {
    const svg = svgRef.current;
    if (!svg || typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(() => {
      const r = svg.getBoundingClientRect();
      if (r.width && r.height) setSvgSize({ w: r.width, h: r.height });
    });
    ro.observe(svg);
    return () => ro.disconnect();
  }, [hasFit]);

  // Крупные детали рисуются первыми: мелкая, лежащая в вырезе крупной, иначе оказалась бы под
  // ней и стала бы некликабельной.
  const ordered = useMemo(() => [...placed].sort((a, b) => b.areaCm2 - a.areaCm2), [placed]);

  // Подписи. Раньше имя рисовалось горизонтально одним кеглем в центроиде и у узкой или
  // диагональной детали уезжало на СОСЕДНЮЮ — на листе это читается как «вот эта деталь так и
  // называется». Теперь план (внутрь контура → поворот по долевой/длинной оси → мельче →
  // усечение → выноска) считает общий с раскладкой планировщик, см. lib/nesting/render/label-fit.
  //
  // Пересчитывается на МАСШТАБ, а не на кадр: кегль берётся от окна (box.w), а место подписи —
  // от чертежа, так что протяжка плана не меняет и платить за неё каждым кадром незачем.
  const labelTexts = ordered.map((p) => labelOf(p));
  const labelKey = labelTexts.join(' ');
  const viewW = box?.w ?? 0;
  const labelPlans = useMemo(() => {
    const out = new Map<number, LabelPlan>();
    if (!viewW || ordered.length === 0) return out;
    // Мельче этого подпись всё равно нечитаема; на приближении она вернётся сама, потому что
    // кегль считается от окна.
    const fontMax = viewW / 55;
    const fontMin = viewW / 130;
    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;
    const polys = new Map<number, Pt[]>();
    for (const p of ordered) {
      const ox = p.originX!;
      const oy = p.originY!;
      polys.set(
        p.id,
        p.poly.map((pt) => ({ x: ox + pt.x, y: oy + pt.y })),
      );
      if (ox < minX) minX = ox;
      if (oy < minY) minY = oy;
      if (ox + p.bboxW > maxX) maxX = ox + p.bboxW;
      if (oy + p.bboxH > maxY) maxY = oy + p.bboxH;
    }
    // Выноска имеет право уйти чуть за габарит чертежа — лист всё равно рисуется с полями.
    const pad = fontMax * 3;
    const space = new LabelSpace({
      minX: minX - pad,
      minY: minY - pad,
      maxX: maxX + pad,
      maxY: maxY + pad,
    });
    for (const p of ordered) space.addPolygon(polys.get(p.id)!, p.id);
    ordered.forEach((p, i) => {
      const text = labelTexts[i];
      if (!text) return;
      out.set(
        p.id,
        planLabel({
          poly: polys.get(p.id)!,
          text,
          fontMaxCm: fontMax,
          fontMinCm: fontMin,
          preferredAngleDeg: grainAngleForLabel(p, grainLayer ?? ''),
          space,
          selfKey: p.id,
        }),
      );
    });
    return out;
    // labelTexts участвует через labelKey: сами функции labelOf приходят inline-стрелками и
    // меняют идентичность каждый рендер, а пересчёт плана на каждый кадр протяжки — дорого.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ordered, viewW, labelKey, grainLayer]);

  // Экранные пиксели на одну чертёжную единицу. SVG вписывает viewBox по УМОЛЧАНИЮ как
  // 'xMidYMid meet': масштаб единый по обеим осям, а лишнее место уходит в поля по краям.
  // Поэтому делить смещение курсора на ширину элемента нельзя — как только пропорции окна и
  // листа расходятся (а они расходятся всегда: окно фиксировано по высоте), зум под курсором и
  // протяжка уезжают тем сильнее, чем уже лист.
  const metricsOf = (b: Box) => {
    const svg = svgRef.current;
    if (!svg) return null;
    const r = svg.getBoundingClientRect();
    if (r.width === 0 || r.height === 0) return null;
    const scale = Math.min(r.width / b.w, r.height / b.h);
    return {
      scale,
      // Поля, которыми 'meet' центрирует вписанный лист.
      padX: (r.width - b.w * scale) / 2,
      padY: (r.height - b.h * scale) / 2,
      rect: r,
    };
  };

  // Колесо приходится вешать вручную. React регистрирует wheel корневым ПАССИВНЫМ слушателем,
  // из которого preventDefault невозможен, а тело модалки скроллится (overflow-y-auto): без
  // отмены один щелчок колеса и увеличивал лист, и уезжал с него. Держим последний viewBox в
  // ref, чтобы не переподписываться на каждый кадр зума.
  const boxRef = useRef<Box | null>(box);
  boxRef.current = box;
  useEffect(() => {
    const svg = svgRef.current;
    if (!svg) return;
    const onWheel = (e: WheelEvent) => {
      // Горизонтальный свайп по тачпаду даёт deltaY === 0 — без этого он читался бы как
      // приближение (проверка e.deltaY > 0 отправляет ноль в ветку «увеличить»).
      if (!e.deltaY) return;
      e.preventDefault();
      const b = boxRef.current;
      const m = b && metricsOf(b);
      if (!b || !m) return;
      const at = {
        x: b.x + (e.clientX - m.rect.left - m.padX) / m.scale,
        y: b.y + (e.clientY - m.rect.top - m.padY) / m.scale,
      };
      // Ограничения: дальше 40× не нужно никому, а обзор шире исходного превращает лист в точку.
      const factor = e.deltaY > 0 ? 1.15 : 1 / 1.15;
      const limit = fit ?? b;
      const w = Math.min(limit.w, Math.max(limit.w / 40, b.w * factor));
      const scale = w / b.w;
      setView({
        x: at.x - (at.x - b.x) * scale,
        y: at.y - (at.y - b.y) * scale,
        w,
        h: b.h * scale,
      });
    };
    svg.addEventListener('wheel', onWheel, { passive: false });
    return () => svg.removeEventListener('wheel', onWheel);
  }, [fit]);

  if (!fit || !box) {
    return (
      <div
        className={`flex ${tall ? 'h-[60vh]' : 'h-[46vh]'} w-full items-center justify-center border border-borderColor bg-bgColor`}
      >
        <Text size='micro' variant='label'>
          no contours that can be shown were found in the file
        </Text>
      </div>
    );
  }

  // Чертёжных единиц (см) на экранный пиксель.
  const px = svgSize ? 1 / Math.min(svgSize.w / box.w, svgSize.h / box.h) : box.w / 800;

  // Видимая область целиком: 'meet' добавляет поля по краям, если пропорции холста и viewBox
  // расходятся, — сетка обязана закрывать и их. Края привязаны к шагу, чтобы линии не плыли.
  const gridBox = (() => {
    const vw = svgSize ? svgSize.w * px : box.w * 3;
    const vh = svgSize ? svgSize.h * px : box.h * 3;
    const x = box.x - (vw - box.w) / 2;
    const y = box.y - (vh - box.h) / 2;
    const x0 = Math.floor(x / GRID_STEP) * GRID_STEP - GRID_STEP;
    const y0 = Math.floor(y / GRID_STEP) * GRID_STEP - GRID_STEP;
    return {
      x: x0,
      y: y0,
      w: Math.ceil((x + vw - x0) / GRID_STEP) * GRID_STEP + GRID_STEP,
      h: Math.ceil((y + vh - y0) / GRID_STEP) * GRID_STEP + GRID_STEP,
    };
  })();

  // Длины сторон: подпись внутрь от середины дуги, вдоль касательной, строкой вверх. Короче 3 см
  // и короче самой подписи на экране — пропускаем; соседние подписи не налезают (сетка ячеек).
  const sizeLabels: { k: string; x: number; y: number; a: number; t: string }[] = [];
  if (prefs.sizes) {
    const cell = 26 * px;
    const taken = new Map<string, { x: number; y: number }[]>();
    const off = 8 * px;
    for (const p of ordered) {
      const ox = p.originX!;
      const oy = p.originY!;
      outlineGeo(p.poly).edges.forEach((e, i) => {
        if (e.lenCm < 3 || e.lenCm / px < 40) return;
        const x = ox + e.mid.x + e.nx * off;
        const y = vy(oy + e.mid.y + e.ny * off);
        if (x < box.x || x > box.x + box.w || y < box.y || y > box.y + box.h) return;
        const cx = Math.floor(x / cell);
        const cy = Math.floor(y / cell);
        for (let dx = -1; dx <= 1; dx++)
          for (let dy = -1; dy <= 1; dy++)
            for (const q of taken.get(`${cx + dx}:${cy + dy}`) ?? [])
              if (Math.hypot(q.x - x, q.y - y) < cell) return;
        const key = `${cx}:${cy}`;
        taken.set(key, [...(taken.get(key) ?? []), { x, y }]);
        let a = (Math.atan2(-e.ty, e.tx) * 180) / Math.PI;
        if (a > 90) a -= 180;
        else if (a <= -90) a += 180;
        sizeLabels.push({ k: `${p.id}:${i}`, x, y, a, t: e.lenCm.toFixed(1) });
      });
    }
  }

  // Вершины одним путём на цвет: 50 деталей × 20 углов — это тысяча кружков, а путь один.
  const dots = { blue: '', grey: '' };
  if (prefs.vertices) {
    const r = 1.8 * px;
    for (const p of ordered) {
      const ox = p.originX!;
      const oy = p.originY!;
      const m = markOf(p);
      const tone = m === 'mapped' || m === 'staged' ? 'blue' : 'grey';
      for (const c of outlineGeo(p.poly).corners) {
        const x = ox + c.x - r;
        const y = vy(oy + c.y);
        dots[tone] += `M${x},${y}a${r},${r} 0 1,0 ${2 * r},0a${r},${r} 0 1,0 ${-2 * r},0`;
      }
    }
  }

  const endGesture = () => {
    gesture.current = null;
    // Defensive: the svg's pointerdown always consumes the candidate (it bubbles there and
    // nothing stops it), but a leftover key must never be able to outlive its gesture — for a
    // mouse the pointerId is constant, so it would not be caught by the id check.
    candidate.current = null;
    setPanning(false);
  };

  return (
    <div className='space-y-1'>
      <div className='relative w-full border border-borderColor bg-bgColor'>
        <svg
          ref={svgRef}
          xmlns='http://www.w3.org/2000/svg'
          viewBox={`${box.x} ${box.y} ${box.w} ${box.h}`}
          fontFamily='monospace'
          className={`${tall ? 'h-[60vh]' : 'h-[46vh]'} w-full touch-none ${panning ? 'cursor-grabbing' : 'cursor-grab'}`}
          onPointerDown={(e) => {
            // Только основная кнопка: правый клик открывает контекстное меню и никогда не
            // отдаёт pointerup, оставляя жест взведённым навсегда.
            if (e.button !== 0) return;
            const c = candidate.current;
            candidate.current = null;
            gesture.current = {
              px: e.clientX,
              py: e.clientY,
              box,
              // Деталь под курсором положила сюда свой ключ мгновением раньше (её pointerdown
              // идёт до всплытия), но НЕ гасила событие.
              key: c?.pointerId === e.pointerId ? c.key : '',
              moved: false,
            };
            e.currentTarget.setPointerCapture(e.pointerId);
          }}
          onPointerMove={(e) => {
            const st = gesture.current;
            if (!st) return;
            const dx = e.clientX - st.px;
            const dy = e.clientY - st.py;
            if (!st.moved) {
              if (Math.abs(dx) + Math.abs(dy) < DRAG_SLOP) return;
              // Ушли дальше порога — это протяжка: выбор снимается, чтобы отпускание над
              // деталью не выделяло её «заодно».
              st.moved = true;
              st.key = '';
              setPanning(true);
            }
            const m = metricsOf(st.box);
            if (!m) return;
            // Масштаб за протяжку не меняется (двигается только начало viewBox), поэтому
            // достаточно одного пересчёта пикселей в сантиметры. Считаем от НАЧАЛА жеста, так
            // что порог не даёт скачка.
            setView({ ...st.box, x: st.box.x - dx / m.scale, y: st.box.y - dy / m.scale });
          }}
          onPointerUp={() => {
            const st = gesture.current;
            if (st && !st.moved && st.key) onPick(st.key);
            endGesture();
          }}
          onPointerCancel={endGesture}
          onLostPointerCapture={endGesture}
          onDoubleClick={() => setView(null)}
        >
          {/* Сетка в сантиметрах листа: одна, 10 см, зумится вместе с деталями. */}
          {prefs.grid ? (
            <path
              pointerEvents='none'
              fill='none'
              strokeWidth={1}
              d={gridPath(gridBox, GRID_STEP)}
              stroke={GRID_STROKE}
              vectorEffect='non-scaling-stroke'
            />
          ) : null}

          {/* Силуэт — ориентир масштаба за деталями, по центру габарита листа. */}
          {prefs.silhouette ? (
            <BodySilhouette cx={fit.x + fit.w / 2} cy={fit.y + fit.h / 2} />
          ) : null}

          {ordered.map((p) => {
            const key = keyOf(p);
            const mark = markOf(p);
            const st = STYLE[mark];
            const on = !!key && key === selectedKey;
            const ox = p.originX!;
            const oy = p.originY!;
            const points = p.poly.map((pt) => `${ox + pt.x},${vy(oy + pt.y)}`).join(' ');
            // Толщина — в экранных пикселях (1px, наведение 1.5px, выбранная 2.5px), на любом
            // зуме. Выбор не трогает заливку (владелец: яркость не должна падать) — только
            // синяя обводка и мягкий ореол под ней.
            const sw = (on ? 2.5 : 1) * px;
            const plan = labelPlans.get(p.id);
            return (
              <g key={p.id}>
                {on ? (
                  <polygon
                    points={points}
                    pointerEvents='none'
                    fill='none'
                    stroke={BLUE}
                    strokeOpacity={0.15}
                    strokeWidth={6 * px}
                    strokeLinejoin='round'
                  />
                ) : null}
                <polygon
                  points={points}
                  fill={st.fill}
                  fillOpacity={st.fillOpacity}
                  stroke={on ? BLUE : st.stroke}
                  strokeOpacity={on ? 1 : st.strokeOpacity}
                  strokeWidth={sw}
                  strokeDasharray={st.dash && !on ? `${6 * px} ${4 * px}` : undefined}
                  style={{ '--hw': `${1.5 * px}` } as React.CSSProperties}
                  className={
                    key
                      ? on
                        ? 'cursor-pointer'
                        : 'cursor-pointer hover:[stroke-width:var(--hw)]'
                      : undefined
                  }
                  onPointerDown={(e) => {
                    if (e.button !== 0 || !key) return;
                    // Кладём кандидата и ОТПУСКАЕМ событие дальше: панорама взводится на самом
                    // svg, а что это было — выбор или протяжка — решится по пройденному пути.
                    candidate.current = { key, pointerId: e.pointerId };
                  }}
                  // Двойной клик по листу возвращает обзор; по детали — не должен, иначе
                  // привычный двойной щелчок по выбору выбрасывает весь зум.
                  onDoubleClick={(e) => e.stopPropagation()}
                >
                  {/* Усечённое имя обязано остаться восстановимым: подсказка висит на самой
                    детали, а не на подписи — та не принимает указатель, иначе перехватывала
                    бы клик у своего же контура. */}
                  {plan?.truncated ? <title>{plan.full}</title> : null}
                </polygon>
              </g>
            );
          })}

          {/* Внутренняя геометрия: линия шва, надсечки, свёрла, вытачки. Рисуется ПОД подписями
              и над контурами, тонко и серым — это чертёж детали, а не выделение. Замкнутые пути
              (линия шва) идут polygon'ом без заливки, открытые (надсечки, базовые) — polyline. */}
          {innerLayers && innerLayers.size > 0
            ? ordered.map((p) => {
                const paths = (p.inner ?? []).filter(
                  (c) => innerLayers.has(c.layer) && c.layer !== grainLayer,
                );
                if (paths.length === 0) return null;
                const ox = p.originX!;
                const oy = p.originY!;
                return (
                  <g
                    key={`i${p.id}`}
                    pointerEvents='none'
                    fill='none'
                    stroke='#9a9a9a'
                    strokeWidth={0.75 * px}
                  >
                    {paths.map((c, i) => {
                      const pts = c.pts.map((pt) => `${ox + pt.x},${vy(oy + pt.y)}`).join(' ');
                      return c.closed ? (
                        <polygon key={i} points={pts} />
                      ) : (
                        <polyline key={i} points={pts} />
                      );
                    })}
                  </g>
                );
              })
            : null}

          {/* Долевая: тот самый отрезок из файла, по которому раскладка разворачивает деталь.
              Отдельным проходом поверх контуров и без реакции на указатель — линия не должна
              перехватывать клик у своей же детали. */}
          {grainLayer && prefs.grain
            ? ordered.map((p) => {
                const g = (p.grain ?? []).filter((c) => c.layer === grainLayer);
                // Ровно один отрезок = то, что ориентация считает долевой. Показываем ровно то,
                // чем она пользуется, иначе проверка проверяла бы не то.
                if (g.length !== 1) return null;
                const { a, b } = g[0];
                return (
                  <g key={`g${p.id}`} pointerEvents='none'>
                    <line
                      x1={a.x}
                      y1={vy(a.y)}
                      x2={b.x}
                      y2={vy(b.y)}
                      stroke={DROP_RED}
                      strokeWidth={box.w / 400 || 0.01}
                    />
                    {/* Засечки на концах: без них короткая линия читается как случайный штрих. */}
                    {[a, b].map((pt, i) => (
                      <circle
                        key={i}
                        cx={pt.x}
                        cy={vy(pt.y)}
                        r={box.w / 300 || 0.01}
                        fill={DROP_RED}
                      />
                    ))}
                  </g>
                );
              })
            : null}

          {/* Подписи — отдельным проходом поверх ВСЕХ контуров: иначе имя крупной детали
              оказывалось бы под мелкой, лежащей на ней сверху. pointerEvents='none', чтобы
              текст не перехватывал клик у своей же детали.

              Угол берётся со знаком минус: план считается в чертёжной системе (Y вверх), а
              лист рисуется через vy() — картинка зеркальна, и строка обязана лечь вдоль
              детали такой, какой её ВИДНО. */}
          {/* Вершины контура — точки на изломах. */}
          {dots.blue || dots.grey ? (
            <g pointerEvents='none'>
              {dots.blue ? <path d={dots.blue} fill={BLUE} /> : null}
              {dots.grey ? <path d={dots.grey} fill='#9a9a9a' /> : null}
            </g>
          ) : null}

          {/* Длины сторон, см. */}
          {sizeLabels.length > 0 ? (
            <g pointerEvents='none' fill={SIZE_INK} fontSize={9 * px}>
              {sizeLabels.map((l) => (
                <text
                  key={l.k}
                  transform={`translate(${l.x} ${l.y})${l.a ? ` rotate(${l.a})` : ''}`}
                  textAnchor='middle'
                  dominantBaseline='middle'
                >
                  {l.t}
                </text>
              ))}
            </g>
          ) : null}

          {overlay ? overlay(px) : null}

          {prefs.names &&
            Array.from(labelPlans, ([id, plan]) => (
              <g key={`t${id}`} pointerEvents='none'>
                {plan.leader ? (
                  <>
                    <circle
                      cx={plan.leader.dotX}
                      cy={vy(plan.leader.dotY)}
                      r={plan.fontCm * 0.22}
                      fill='#111111'
                    />
                    <line
                      x1={plan.leader.dotX}
                      y1={vy(plan.leader.dotY)}
                      x2={plan.leader.toX}
                      y2={vy(plan.leader.toY)}
                      stroke='#111111'
                      strokeWidth={box.w / 900 || 0.005}
                    />
                  </>
                ) : null}
                <text
                  transform={`translate(${plan.x} ${vy(plan.y)})${
                    plan.angleDeg ? ` rotate(${-plan.angleDeg})` : ''
                  }`}
                  fontSize={plan.fontCm}
                  fill='#111111'
                  textAnchor='middle'
                  dominantBaseline='middle'
                >
                  {plan.text}
                </text>
              </g>
            ))}

          {focusMark ? (
            <circle
              pointerEvents='none'
              cx={focusMark.x / 10}
              cy={vy(focusMark.y / 10)}
              r={focusMark.r / 10}
              fill='none'
              stroke={DROP_RED}
              strokeWidth={1}
              vectorEffect='non-scaling-stroke'
            />
          ) : null}
        </svg>
        {topLeft && <div className='absolute top-1.5 left-1.5'>{topLeft}</div>}
        {/* Угол холста: «весь лист» (только когда кадр ушёл от вписанного) и настройки вида. */}
        <div className='absolute right-1.5 bottom-1.5 flex items-center gap-1'>
          {view && (
            <button
              type='button'
              aria-label='show the whole sheet'
              title='show the whole sheet'
              onClick={() => {
                setView(null);
                onFit?.();
              }}
              className={ICON_BTN}
            >
              <svg
                width='14'
                height='14'
                viewBox='0 0 14 14'
                fill='none'
                stroke='currentColor'
                strokeWidth='1'
                aria-hidden='true'
              >
                <path d='M0.5 4.5V0.5H4.5M9.5 0.5H13.5V4.5M13.5 9.5V13.5H9.5M4.5 13.5H0.5V9.5' />
              </svg>
            </button>
          )}
          <GenericPopover
            noTail
            className='w-[168px]'
            contentProps={{ side: 'top', align: 'end', sideOffset: 4 }}
            triggerProps={{
              'aria-label': 'view settings',
              title: 'view settings',
              className: ICON_BTN,
            }}
            openElement={
              <svg
                width='14'
                height='14'
                viewBox='0 0 14 14'
                fill='white'
                stroke='currentColor'
                strokeWidth='1'
                aria-hidden='true'
              >
                <path d='M0.5 3.5H13.5M0.5 7.5H13.5M0.5 11.5H13.5' />
                <rect x='3.5' y='1.5' width='2' height='4' />
                <rect x='8.5' y='5.5' width='2' height='4' />
                <rect x='5.5' y='9.5' width='2' height='4' />
              </svg>
            }
          >
            <div className='flex flex-col gap-1.5 py-0.5'>
              {VIEW_TOGGLES.map(([k, label]) => (
                <label key={k} className='flex cursor-pointer items-center gap-1.5'>
                  <input
                    type='checkbox'
                    checked={prefs[k]}
                    onChange={(e) => setPref(k, e.target.checked)}
                  />
                  <Text size='micro' variant='label' component='span'>
                    {label}
                  </Text>
                </label>
              ))}
            </div>
          </GenericPopover>
        </div>
      </div>
      {(!bare || hidden > 0) && (
        <div className='flex flex-wrap items-center gap-2'>
          {!bare && (
            <Text size='nano' variant='label' component='span'>
              click a piece — select · wheel — zoom · drag — pan
            </Text>
          )}
          {hidden > 0 && (
            <Text size='nano' component='span' className='text-error'>
              pieces not shown: {hidden} (no coordinates in the parse)
            </Text>
          )}
        </div>
      )}
    </div>
  );
}
