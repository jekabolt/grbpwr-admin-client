// Интерактивная панель раскладки (Ф5 — ручная доводка): те же полоса/линейка/детали, что
// в renderLayoutSvg, но JSX + pointer events. Перетаскивание — за деталь, поворот — R или
// кнопка тулбара; редактор только двигает Placement'ы и репортит их наверх, валидация и
// статистика живут в модалке (пересчёт на drop, не на каждый кадр). Живёт в lazy-чанке
// раскладки вместе с остальной геометрией.
//
// Просмотр длинного маркера. Раньше холст вписывал ВСЮ длину в ширину модалки: маркер 1197 ×
// 140 см становился полоской ~115px с нечитаемыми подписями. Теперь холст фиксированной высоты,
// по умолчанию ширина ткани заполняет высоту («по ширине»), остальная длина — протяжкой, колесом
// с shift или горизонтальным свайпом; колесо — зум под курсором. Сверху мини-карта всего маркера
// с рамкой текущего окна. Зум/панорама живут только в viewBox: детали не перерисовываются на
// кадр, подписи пересобираются на ОКОНЧАНИЕ зума.
import {
  useEffect,
  useId,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { Text } from 'ui';
import { grainDisplaySegment } from 'lib/nesting/geom/grain-display';
import type { FabricDirection, Placement, PieceDTO, Pt, RotationDeg } from 'lib/nesting/types';
import { allowedRotations, placedPoly } from 'lib/nesting/types';
import { LabelSpace, planLabel, type LabelPlan } from 'lib/nesting/render/label-fit';
import { rotatedBounds } from 'lib/nesting/geom/clearance';
import { GrainArrow } from '../grain-arrow';

const FILL = '#f2f2f2';
const FILL_SELECTED = '#e4e9f2';
const STROKE = '#8a8a8a';
const INK = '#111111';
const RULE = '#cccccc';
const TARGET = '#c22222';
const BAD = '#c22222';
const MINI_FILL = '#d4d4d4';
const OFF_TABLE = '#bdbdbd';

// Экранные константы, px.
const PAD_PX = 10;
const RULER_PX = 20;
const LABEL_MAX_PX = 11;
const LABEL_MIN_PX = 9;
// Деталь мельче этого на экране подписи не получает: имя всё равно не влезет, а выноски от
// десятков мелких деталей превращают обзор в штриховку.
const LABEL_HIDE_PX = 24;
const DRAG_SLOP = 4;
const MINIMAP_PX = 28;
// Одна квадратная кнопка угла холста: 28×28, рамка, глиф 14px. Модалка рисует свою кнопку выгрузки
// ЭТИМ ЖЕ классом и в ЭТОЙ ЖЕ группе (проп `corner`), чтобы три кнопки не расходились по размеру.
export const CANVAS_ICON_BTN =
  'flex size-7 shrink-0 items-center justify-center border border-borderColor bg-white text-labelColor hover:border-textColor hover:text-textColor focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-textColor';
const ICON_BTN = CANVAS_ICON_BTN;

type View = { x: number; y: number; s: number }; // s — px на см
type Size = { w: number; h: number };

const keyOf = (pl: Placement) => `${pl.pieceId}|${pl.instance}`;

// Тот же порядок и те же правила, что у planLayoutLabels (render/label-fit.ts) — один planLabel,
// одна занятость листа, крупные первыми, долевая/хвост «×N (90°, mirror)». Разница одна: кегль
// задаётся в ЭКРАННЫХ пикселях текущего масштаба, а не от ширины ткани, поэтому при приближении
// подпись остаётся читаемой, а не растёт вместе с деталью.
function planScreenLabels(
  placements: readonly Placement[],
  byId: ReadonlyMap<number, PieceDTO>,
  widthCm: number,
  usedLengthCm: number,
  pxPerCm: number,
): Map<string, LabelPlan> {
  const out = new Map<string, LabelPlan>();
  if (!(pxPerCm > 0)) return out;
  const space = new LabelSpace({
    minX: 0,
    minY: 0,
    maxX: Math.max(usedLengthCm, 1),
    maxY: widthCm,
  });
  const items: { pl: Placement; piece: PieceDTO; poly: Pt[] }[] = [];
  for (const pl of placements) {
    const piece = byId.get(pl.pieceId);
    if (!piece) continue;
    const poly = placedPoly(piece.poly, pl);
    items.push({ pl, piece, poly });
    space.addPolygon(poly, keyOf(pl));
  }
  items.sort((a, b) => b.piece.areaCm2 - a.piece.areaCm2);
  for (const { pl, piece, poly } of items) {
    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;
    for (const p of poly) {
      if (p.x < minX) minX = p.x;
      if (p.y < minY) minY = p.y;
      if (p.x > maxX) maxX = p.x;
      if (p.y > maxY) maxY = p.y;
    }
    if (Math.max(maxX - minX, maxY - minY) * pxPerCm < LABEL_HIDE_PX) continue;
    const oriented = piece.grain == null && piece.originX == null;
    const marks = [pl.rot ? `${pl.rot}°` : '', pl.flipped ? 'mirror' : ''].filter(Boolean);
    out.set(
      keyOf(pl),
      planLabel({
        poly,
        text: piece.name,
        suffix:
          (pl.instance > 0 ? ` ×${pl.instance + 1}` : '') +
          (marks.length > 0 ? ` (${marks.join(', ')})` : ''),
        fontMaxCm: LABEL_MAX_PX / pxPerCm,
        fontMinCm: LABEL_MIN_PX / pxPerCm,
        preferredAngleDeg: oriented ? (pl.rot % 180 === 0 ? 0 : 90) : null,
        space,
        selfKey: keyOf(pl),
      }),
    );
  }
  return out;
}

const RULER_STEPS = [1, 2, 5, 10, 20, 50, 100, 200, 500, 1000];
const stepFor = (minPx: number, s: number) =>
  RULER_STEPS.find((k) => k * s >= minPx) ?? RULER_STEPS[RULER_STEPS.length - 1];

const clamp1 = (pos: number, lo: number, hi: number, size: number) =>
  size >= hi - lo ? Math.min(lo, Math.max(hi - size, pos)) : Math.min(hi - size, Math.max(lo, pos));

export function LayoutEditor({
  pieces,
  placements,
  widthCm,
  usedLengthCm,
  targetCm,
  marginCm,
  allowCrossGrain,
  fabricDirection,
  editable,
  violating,
  onChange,
  focus,
  tableEndCm,
  corner,
}: {
  pieces: readonly PieceDTO[];
  placements: readonly Placement[];
  widthCm: number;
  usedLengthCm: number;
  targetCm?: number;
  marginCm: number;
  allowCrossGrain: boolean;
  // Направление НАСТОЯЩЕЙ ткани этой раскладки — и у сохранённого маркера тоже (MarkersSection
  // резолвит скоуп его строки BOM). Раньше в режиме просмотра сюда подставлялось 'unknown', и это
  // была не осторожность, а дыра: редактор ПРЕДЛАГАЛ поставить деталь на 180° на ворсовой ткани,
  // а сервер такую правку старой строки принимал по помилованию — и строка оставалась помилованной
  // навсегда. Сохранённые повороты при этом ничего не теряют: rotsFor ниже всегда держит ТЕКУЩИЙ
  // поворот детали в цикле, поэтому 180° легаси-маркера остаётся выбранным и выбираемым.
  fabricDirection: FabricDirection;
  editable: boolean;
  // Placement indices that violate clearances — painted red.
  violating: ReadonlySet<number>;
  // Fired on drop / rotate with the full new placement array.
  onChange: (next: Placement[]) => void;
  // «Показать» снаружи (шапка модалки): выбрать размещение и подвести к нему окно. `nonce`
  // меняется на каждый щелчок, чтобы повторный щелчок по той же детали снова её показывал.
  focus?: { index: number; nonce: number } | null;
  // КОНЕЦ РАСКРОЕЧНОГО СТОЛА: полезная длина U = стол − 2·запас на концы, см. Вертикальная линия
  // чернилом с подписью и штриховка «не на столе» за ней. Отсутствует — стол не задан, линии нет.
  tableEndCm?: number;
  // Дополнительные кнопки угла холста (выгрузка из модалки) — в ту же группу, тем же размером.
  corner?: ReactNode;
}) {
  const byId = useMemo(() => new Map(pieces.map((p) => [p.id, p])), [pieces]);
  const svgRef = useRef<SVGSVGElement | null>(null);
  const canvasRef = useRef<HTMLDivElement | null>(null);
  const [selected, setSelected] = useState<number | null>(null);
  // Live drag: index + current translation override (committed on pointerup).
  const [drag, setDrag] = useState<{ index: number; x: number; y: number } | null>(null);
  const dragStart = useRef<{ px: number; py: number; x: number; y: number } | null>(null);

  // ТА ЖЕ функция, что применяет движок. Направление ткани решает переворот на 180°, и решать
  // его здесь отдельным выражением значило бы завести вторую копию политики, которая разойдётся
  // с первой молча: рука предложила бы поворот, которого поиск не рассматривал, и маркер на
  // ворсовой ткани уехал бы на резак с деталями против ворса.
  const rots: RotationDeg[] = allowedRotations(fabricDirection, allowCrossGrain);
  const usableWidth = Math.max(0, widthCm - 2 * marginCm);

  // Поворот предлагается только в тех положениях, где деталь помещается по ширине —
  // то же правило, что у движка (nest/index.ts). Текущий поворот всегда остаётся в
  // цикле: сохранённый маркер может нести 90° при allowCrossGrain=false, и кнопка не
  // должна молча уводить деталь на 0°.
  //
  // Зеркало передаётся насквозь: у отражённого варианта габариты те же по РАЗМЕРУ, но другие по
  // положению ([0,w] переезжает в [−w,0]), а «влезает ли по ширине» — вопрос про размер. Считать
  // его по незеркальному контуру было бы верно по числу и неверно по смыслу; передаём флаг, чтобы
  // здесь и в clamp ниже мерялась одна и та же деталь.
  const rotsFor = (piece: PieceDTO, current: RotationDeg, flipped?: boolean): RotationDeg[] => {
    const fitting = rots.filter((r) => {
      const b = rotatedBounds(piece, r, flipped);
      return b.maxY - b.minY <= usableWidth + 1e-9;
    });
    if (!fitting.includes(current)) fitting.unshift(current);
    return fitting.length > 0 ? fitting : [current];
  };

  const W = widthCm;
  const tableEnd =
    tableEndCm != null && Number.isFinite(tableEndCm) && tableEndCm > 0 ? tableEndCm : null;
  // Стол входит в длину полотна (плюс узкая полоса «за столом»), чтобы его конец был виден и тогда,
  // когда маркер короче стола: «весь маркер» показывает, сколько стола ещё свободно.
  const L = Math.max(usedLengthCm, targetCm ?? 0, tableEnd != null ? tableEnd * 1.04 : 0, 10);
  const hatchId = `table-off-${useId().replace(/[^a-zA-Z0-9_-]/g, '')}`;

  // ——— окно просмотра ————————————————————————————————————————————————————————————————————
  // Размер холста в px. До первого замера — правдоподобная заглушка; useLayoutEffect меряет до
  // отрисовки, так что мигания нет.
  const [size, setSize] = useState<Size>({ w: 800, h: 420 });
  useLayoutEffect(() => {
    const el = canvasRef.current;
    if (!el) return;
    const measure = () => {
      const r = el.getBoundingClientRect();
      if (r.width > 0 && r.height > 0)
        setSize((p) => (p.w === r.width && p.h === r.height ? p : { w: r.width, h: r.height }));
    };
    measure();
    if (typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // «По ширине»: ширина ткани + линейка заполняют высоту холста, обзор с начала полосы.
  const fitWidth: View = useMemo(() => {
    const s = Math.max(1e-3, (size.h - 2 * PAD_PX - RULER_PX) / Math.max(W, 1));
    return { x: -PAD_PX / s, y: -PAD_PX / s, s };
  }, [size.h, W]);
  // «Весь маркер»: вся длина и ширина влезают целиком, по центру.
  const fitAll: View = useMemo(() => {
    const s = Math.max(
      1e-3,
      Math.min((size.w - 2 * PAD_PX) / L, (size.h - 2 * PAD_PX - RULER_PX) / Math.max(W, 1)),
    );
    return {
      x: L / 2 - size.w / (2 * s),
      y: (W + RULER_PX / s) / 2 - size.h / (2 * s),
      s,
    };
  }, [size.w, size.h, L, W]);
  const sMin = Math.min(fitAll.s, fitWidth.s) * 0.9;
  const sMax = fitWidth.s * 25;

  // Окно не уходит с полотна: если полотно уже окна — окно его целиком обнимает, иначе
  // окно целиком внутри полотна (с полями и линейкой).
  const clampView = (v: View): View => {
    const s = Math.min(sMax, Math.max(sMin, v.s));
    const vw = size.w / s;
    const vh = size.h / s;
    return {
      s,
      x: clamp1(v.x, -PAD_PX / s, L + PAD_PX / s, vw),
      y: clamp1(v.y, -PAD_PX / s, W + (RULER_PX + PAD_PX) / s, vh),
    };
  };

  // null = «по ширине» (следует за размером холста, пока его не трогали).
  const [userView, setUserView] = useState<View | null>(null);
  const view = clampView(userView ?? fitWidth);
  const vw = size.w / view.s;
  const vh = size.h / view.s;
  const px = 1 / view.s; // см на экранный пиксель

  // Подписи пересобираются на ОКОНЧАНИЕ зума: масштаб «оседает» через 160 мс после последнего
  // изменения. Протяжка масштаб не меняет и план не трогает.
  const [settledS, setSettledS] = useState(view.s);
  useEffect(() => {
    if (view.s === settledS) return;
    const t = window.setTimeout(() => setSettledS(view.s), 160);
    return () => window.clearTimeout(t);
  }, [view.s, settledS]);

  // ТОТ ЖЕ планировщик подписей, что у SVG-экспорта и плоттерного DXF (planLabel + LabelSpace),
  // но кегль — в экранных пикселях. Пересчёт привязан к ЗАФИКСИРОВАННЫМ размещениям: во время
  // перетаскивания план не трогаем, у тянущейся детали подпись едет за ней по-старому, а на
  // pointerup всё пересобирается.
  const planByKey = useMemo(
    () => planScreenLabels(placements, byId, widthCm, usedLengthCm, settledS),
    [placements, byId, widthCm, usedLengthCm, settledS],
  );

  // Последнее состояние окна — для нативного обработчика колеса (подписан один раз).
  const live = useRef({ view, size, clampView });
  live.current = { view, size, clampView };

  // Колесо вешается вручную: React регистрирует wheel ПАССИВНЫМ слушателем, из которого
  // preventDefault невозможен, а тело модалки скроллится. Соглашение то же, что у листа деталей:
  // колесо — зум под курсором; плюс shift+колесо и горизонтальный свайп — протяжка по длине.
  useEffect(() => {
    const el = canvasRef.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      const { view: v, size: sz, clampView: cv } = live.current;
      const unit = e.deltaMode === 1 ? 16 : e.deltaMode === 2 ? sz.h : 1;
      const dx = e.deltaX * unit;
      const dy = e.deltaY * unit;
      if (!dx && !dy) return;
      e.preventDefault();
      const horizontal = e.shiftKey || (Math.abs(dx) > Math.abs(dy) && !e.ctrlKey);
      if (horizontal) {
        const along = e.shiftKey ? dx || dy : dx;
        const across = e.shiftKey ? 0 : dy;
        setUserView(cv({ ...v, x: v.x + along / v.s, y: v.y + across / v.s }));
        return;
      }
      const r = el.getBoundingClientRect();
      const cx = e.clientX - r.left;
      const cy = e.clientY - r.top;
      // Непрерывный множитель: щелчок мыши (~100) ≈ ×1.16, тачпад/щипок — плавно.
      const k = e.ctrlKey ? 0.01 : 0.0015;
      const s = v.s * Math.exp(-Math.max(-300, Math.min(300, dy)) * k);
      const at = { x: v.x + cx / v.s, y: v.y + cy / v.s };
      const next = cv({ s, x: 0, y: 0 });
      setUserView(cv({ s: next.s, x: at.x - cx / next.s, y: at.y - cy / next.s }));
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, []);

  // Показ детали по запросу снаружи: выбор + окно по центру её габарита, масштаб — чтобы деталь
  // занимала около трети холста (не крупнее предела зума).
  useEffect(() => {
    if (!focus) return;
    const pl = placements[focus.index];
    const piece = pl ? byId.get(pl.pieceId) : undefined;
    if (!pl || !piece) return;
    setSelected(focus.index);
    const b = rotatedBounds(piece, pl.rot, pl.flipped);
    const cx = pl.x + (b.minX + b.maxX) / 2;
    const cy = pl.y + (b.minY + b.maxY) / 2;
    const { size: sz, clampView: cv } = live.current;
    const want = Math.min(
      sz.w / (3 * Math.max(b.maxX - b.minX, 1)),
      sz.h / (3 * Math.max(b.maxY - b.minY, 1)),
    );
    const s = cv({ s: want, x: 0, y: 0 }).s;
    setUserView(cv({ s, x: cx - sz.w / (2 * s), y: cy - sz.h / (2 * s) }));
    // Только на новый запрос: правка размещений не должна снова дёргать окно.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focus?.nonce]);

  // Протяжка за пустое место полотна.
  const pan = useRef<{ px: number; py: number; v: View; moved: boolean } | null>(null);
  const [panning, setPanning] = useState(false);
  const endPan = () => {
    pan.current = null;
    setPanning(false);
  };

  // ——— перетаскивание деталей ————————————————————————————————————————————————————————————
  // Static per-piece point strings — dragging only changes the group transform.
  const pointsById = useMemo(() => {
    const m = new Map<number, string>();
    for (const p of pieces)
      m.set(p.id, p.poly.map((pt) => `${pt.x.toFixed(2)},${pt.y.toFixed(2)}`).join(' '));
    return m;
  }, [pieces]);

  const toSvg = (e: { clientX: number; clientY: number }) => {
    const svg = svgRef.current;
    if (!svg) return { x: 0, y: 0 };
    const pt = svg.createSVGPoint();
    pt.x = e.clientX;
    pt.y = e.clientY;
    const m = svg.getScreenCTM();
    if (!m) return { x: 0, y: 0 };
    const loc = pt.matrixTransform(m.inverse());
    return { x: loc.x, y: loc.y };
  };

  const clamp = (index: number, x: number, y: number, rot: RotationDeg) => {
    const pl = placements[index];
    const piece = byId.get(pl.pieceId);
    if (!piece) return { x, y };
    // ЗЕРКАЛО обязано попасть в габариты: у отражённой детали собственный bbox лежит в [−w, 0],
    // а не в [0, w]. Зажим по незеркальным границам разрешил бы утащить её на целую ширину за
    // кромку — и это не «немного неточно», а деталь, которой на полотне нет.
    const rb = rotatedBounds(piece, rot, pl.flipped);
    // Полоса физически ограничена поперёк и слева; вправо длина открыта.
    const minY = marginCm - rb.minY;
    const maxY = W - marginCm - rb.maxY;
    const minX = marginCm - rb.minX;
    return {
      x: Math.max(minX, x),
      y: maxY >= minY ? Math.min(Math.max(minY, y), maxY) : y,
    };
  };

  const startDrag = (index: number, e: React.PointerEvent<SVGGElement>) => {
    // Без права правки деталь не гасит событие — оно всплывает к холсту и становится протяжкой.
    if (!editable || e.button !== 0) return;
    e.stopPropagation();
    setSelected(index);
    const pl = placements[index];
    const p = toSvg(e);
    dragStart.current = { px: p.x, py: p.y, x: pl.x, y: pl.y };
    setDrag({ index, x: pl.x, y: pl.y });
    (e.currentTarget as Element).setPointerCapture(e.pointerId);
  };

  const moveDrag = (e: React.PointerEvent<SVGGElement>) => {
    const st = dragStart.current;
    if (!st || !drag) return;
    const p = toSvg(e);
    const next = clamp(
      drag.index,
      st.x + (p.x - st.px),
      st.y + (p.y - st.py),
      placements[drag.index].rot,
    );
    setDrag({ index: drag.index, x: next.x, y: next.y });
  };

  const endDrag = () => {
    if (!drag) return;
    const { index, x, y } = drag;
    setDrag(null);
    dragStart.current = null;
    const pl = placements[index];
    if (Math.abs(pl.x - x) > 1e-6 || Math.abs(pl.y - y) > 1e-6) {
      const next = placements.map((q, i) => (i === index ? { ...q, x, y } : q));
      onChange(next);
    }
  };

  const rotateSelected = () => {
    if (!editable || selected == null) return;
    const pl = placements[selected];
    const piece = byId.get(pl.pieceId);
    if (!piece) return;
    const list = rotsFor(piece, pl.rot, pl.flipped);
    const rot = list[(list.indexOf(pl.rot) + 1) % list.length];
    if (rot === pl.rot) return; // единственное допустимое положение — вращать некуда
    // Держим центр повёрнутого bbox на месте, чтобы деталь не «прыгала». Зеркальность у обоих
    // габаритов ОДНА И ТА ЖЕ: поворот её не меняет (M применяется до R), кнопка «повернуть»
    // зеркало не снимает и не наводит.
    const rb0 = rotatedBounds(piece, pl.rot, pl.flipped);
    const rb1 = rotatedBounds(piece, rot, pl.flipped);
    const cx = pl.x + (rb0.minX + rb0.maxX) / 2;
    const cy = pl.y + (rb0.minY + rb0.maxY) / 2;
    const raw = { x: cx - (rb1.minX + rb1.maxX) / 2, y: cy - (rb1.minY + rb1.maxY) / 2 };
    const c = clamp(selected, raw.x, raw.y, rot);
    onChange(placements.map((q, i) => (i === selected ? { ...q, rot, x: c.x, y: c.y } : q)));
  };

  const selPiece = selected != null ? byId.get(placements[selected]?.pieceId) : undefined;

  // Пометки размещения тем же словарём, что и планировщик подписей (render/label-fit.ts): поворот
  // и «зеркало». Левая и правая полочки на маркере отличаются ТОЛЬКО хиральностью — если её нигде
  // не написать, человек, сверяющий раскладку с комплектом кроя, различить их не сможет.
  const marksOf = (pl: Placement): string => {
    const m = [pl.rot ? `${pl.rot}°` : '', pl.flipped ? 'mirror' : ''].filter(Boolean);
    return m.length > 0 ? ` (${m.join(', ')})` : '';
  };

  // Слой деталей не зависит от окна: зум и протяжка меняют только viewBox, а обводки держат
  // экранную толщину через non-scaling-stroke. Пересборка — на правку, выбор и перетаскивание.
  const piecesLayer = useMemo(
    () =>
      placements.map((pl, index) => {
        const piece = byId.get(pl.pieceId);
        if (!piece) return null;
        const at = drag?.index === index ? drag : pl;
        const bad = violating.has(index);
        const on = selected === index;
        const grain = piece.displayGrain
          ? grainDisplaySegment([piece.poly], piece.displayGrain)
          : null;
        return (
          // ДОГОВОР О РАЗМЕЩЕНИИ, выраженный матрицами SVG (lib/nesting/types.ts):
          //     placed(p) = R(rot) · M^flipped · p + (x, y),   M: (x, y) ↦ (−x, y)
          // Список transform'ов SVG перемножается СЛЕВА НАПРАВО, а к точке применяется
          // справа налево — то есть `translate rotate scale(-1 1)` это ровно T·R·M, и
          // зеркало срабатывает ПЕРВЫМ, в собственных координатах детали. Порядок здесь
          // не косметика: M·R(θ) = R(−θ)·M, поэтому «scale перед rotate» разошёлся бы с
          // движком на 2θ — то есть НЕ РАЗОШЁЛСЯ БЫ ВОВСЕ на 0° и 180° и разъехался бы на
          // 180° у детали на 90°. Экран показывал бы деталь, которой в файле для резака
          // нет, и никакой признак этого не выдал бы: контур остаётся контуром.
          // Ось тоже часть договора — scale(-1 1), а не scale(1 -1): вторая нарисовала бы
          // столь же правдоподобную деталь ровно в полуобороте от нужного места.
          <g
            key={index}
            transform={`translate(${at.x} ${at.y}) rotate(${pl.rot})${pl.flipped ? ' scale(-1 1)' : ''}`}
            className={editable ? 'cursor-move' : undefined}
            onPointerDown={(e) => startDrag(index, e)}
            onPointerMove={moveDrag}
            onPointerUp={endDrag}
            onPointerCancel={endDrag}
            // Двойной щелчок по детали в правке не должен сбрасывать зум холста.
            onDoubleClick={editable ? (e) => e.stopPropagation() : undefined}
          >
            <polygon
              points={pointsById.get(pl.pieceId) ?? ''}
              fill={on ? FILL_SELECTED : FILL}
              stroke={bad ? BAD : on ? INK : STROKE}
              strokeWidth={bad || on ? 2 : 1}
              vectorEffect='non-scaling-stroke'
            />
            {/* Чертёж детали внутри контура: линия шва, надсечки, свёрла, вытачки. Едут
                тем же transform'ом, что и контур, поэтому остаются на своих местах при
                любом повороте и перетаскивании. Раскройщик режет по маркеру — маркер без
                надсечек неполон. */}
            {(piece.inner ?? [])
              .filter((c) => c.layer !== piece.displayGrain?.layer)
              .map((c, k) => {
                const pts = c.pts.map((pt) => `${pt.x.toFixed(2)},${pt.y.toFixed(2)}`).join(' ');
                const Tag = c.closed ? 'polygon' : 'polyline';
                return (
                  <Tag
                    key={k}
                    points={pts}
                    fill='none'
                    stroke={STROKE}
                    strokeWidth={0.75}
                    vectorEffect='non-scaling-stroke'
                  />
                );
              })}
            {grain && Math.min(piece.bboxW, piece.bboxH) * settledS >= 24 && (
              <GrainArrow segment={grain} pxPerUnit={settledS} />
            )}
          </g>
        );
      }),
    // Обработчики замыкают placements/drag/editable/onChange — они в зависимостях.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [
      placements,
      byId,
      drag,
      selected,
      violating,
      pointsById,
      editable,
      onChange,
      marginCm,
      W,
      settledS,
    ],
  );

  // Подписи — отдельным слоем поверх всех контуров. Кегль задан в см от «осевшего» масштаба,
  // поэтому во время зума они просто масштабируются вместе с полотном, а на остановке
  // пересобираются под ~11px.
  const labelsLayer = useMemo(
    () =>
      placements.map((pl, index) => {
        const piece = byId.get(pl.pieceId);
        if (!piece) return null;
        const bad = violating.has(index);
        if (drag?.index === index) {
          // Во время перетаскивания план устарел по координатам — простая подпись едет вместе
          // с деталью; на pointerup план пересоберётся.
          const rb = rotatedBounds(piece, pl.rot, pl.flipped);
          const label = pl.instance > 0 ? `${piece.name} ×${pl.instance + 1}` : piece.name;
          return (
            <text
              key={index}
              x={drag.x + (rb.minX + rb.maxX) / 2}
              y={drag.y + (rb.minY + rb.maxY) / 2}
              fontSize={LABEL_MAX_PX / settledS}
              fill={bad ? BAD : INK}
              textAnchor='middle'
              dominantBaseline='central'
              pointerEvents='none'
            >
              {label}
              {marksOf(pl)}
            </text>
          );
        }
        const plan = planByKey.get(keyOf(pl));
        if (!plan) return null;
        return (
          <g key={index} pointerEvents='none'>
            {plan.leader && (
              <>
                <circle
                  cx={plan.leader.dotX}
                  cy={plan.leader.dotY}
                  r={plan.fontCm * 0.22}
                  fill={bad ? BAD : INK}
                />
                <line
                  x1={plan.leader.dotX}
                  y1={plan.leader.dotY}
                  x2={plan.leader.toX}
                  y2={plan.leader.toY}
                  stroke={bad ? BAD : INK}
                  strokeWidth={0.75}
                  vectorEffect='non-scaling-stroke'
                />
              </>
            )}
            <text
              x={plan.box.cx}
              y={plan.box.cy}
              fontSize={plan.fontCm}
              fill={bad ? BAD : INK}
              textAnchor='middle'
              dominantBaseline='central'
              fontFamily='monospace'
              transform={`rotate(${plan.box.angleDeg} ${plan.box.cx} ${plan.box.cy})`}
            >
              {plan.text}
              {plan.truncated && <title>{plan.full}</title>}
            </text>
          </g>
        );
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [placements, byId, drag, violating, planByKey, settledS],
  );

  // Мини-карта: весь маркер одной полоской, детали — светлыми силуэтами. Растянута по ширине
  // без сохранения пропорций (preserveAspectRatio='none'): это карта, а не чертёж.
  const minimapPieces = useMemo(
    () =>
      placements.map((pl, index) => {
        if (!byId.has(pl.pieceId)) return null;
        return (
          <polygon
            key={index}
            points={pointsById.get(pl.pieceId) ?? ''}
            transform={`translate(${pl.x} ${pl.y}) rotate(${pl.rot})${pl.flipped ? ' scale(-1 1)' : ''}`}
            fill={MINI_FILL}
          />
        );
      }),
    [placements, byId, pointsById],
  );
  const miniRef = useRef<HTMLDivElement | null>(null);
  const miniDragging = useRef(false);
  const centerFromMinimap = (e: { clientX: number; clientY: number }) => {
    const el = miniRef.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    if (!r.width || !r.height) return;
    const cx = ((e.clientX - r.left) / r.width) * L;
    const cy = ((e.clientY - r.top) / r.height) * W;
    setUserView(clampView({ s: view.s, x: cx - vw / 2, y: cy - vh / 2 }));
  };
  const pct = (v: number) => `${Math.min(100, Math.max(0, v * 100))}%`;
  const miniLeft = Math.max(0, view.x) / L;
  const miniRight = Math.min(L, view.x + vw) / L;
  const miniTop = Math.max(0, view.y) / W;
  const miniBottom = Math.min(W, view.y + vh) / W;

  // Линейка в экранных пикселях: засечки не чаще 6px, числа не чаще ~56px; рисуются только
  // попадающие в окно.
  const tickStep = stepFor(6, view.s);
  const labelStep = stepFor(56, view.s);
  const ticks: number[] = [];
  {
    const from = Math.max(0, Math.ceil(view.x / tickStep));
    const to = Math.min(Math.floor(L / tickStep), Math.floor((view.x + vw) / tickStep));
    for (let k = from; k <= to; k++) ticks.push(k * tickStep);
  }

  const allVisible =
    view.x <= 1e-6 && view.x + vw >= L - 1e-6 && view.y <= 1e-6 && view.y + vh >= W - 1e-6;
  const atFitWidth =
    Math.abs(view.s - fitWidth.s) < 1e-6 && Math.abs(view.x - clampView(fitWidth).x) < 1e-6;
  const atFitAll = Math.abs(view.s - clampView(fitAll).s) < 1e-6;

  return (
    <div className='space-y-1'>
      {/* Мини-карта нужна только когда маркер не влезает в окно целиком (владелец). */}
      {!allVisible && (
        <>
          {/* Мини-карта: весь маркер, рамка — текущее окно; щелчок/протяжка переводит окно. */}
          <div
            ref={miniRef}
            className='relative w-full cursor-pointer touch-none border border-borderColor bg-white'
            style={{ height: MINIMAP_PX }}
            onPointerDown={(e) => {
              if (e.button !== 0) return;
              miniDragging.current = true;
              e.currentTarget.setPointerCapture(e.pointerId);
              centerFromMinimap(e);
            }}
            onPointerMove={(e) => {
              if (miniDragging.current) centerFromMinimap(e);
            }}
            onPointerUp={() => {
              miniDragging.current = false;
            }}
            onPointerCancel={() => {
              miniDragging.current = false;
            }}
            aria-label='marker overview'
          >
            <svg
              xmlns='http://www.w3.org/2000/svg'
              viewBox={`0 0 ${L} ${W}`}
              preserveAspectRatio='none'
              className='absolute inset-0 h-full w-full'
              aria-hidden='true'
            >
              {tableEnd != null && (
                <rect
                  x={tableEnd}
                  y={0}
                  width={Math.max(0, L - tableEnd)}
                  height={W}
                  fill={OFF_TABLE}
                  opacity={0.35}
                />
              )}
              {minimapPieces}
              {tableEnd != null && (
                <line
                  x1={tableEnd}
                  y1={0}
                  x2={tableEnd}
                  y2={W}
                  stroke={INK}
                  strokeWidth={1.5}
                  vectorEffect='non-scaling-stroke'
                />
              )}
              <line
                x1={usedLengthCm}
                y1={0}
                x2={usedLengthCm}
                y2={W}
                stroke={INK}
                strokeWidth={1}
                vectorEffect='non-scaling-stroke'
              />
              {targetCm != null && targetCm > 0 && (
                <line
                  x1={targetCm}
                  y1={0}
                  x2={targetCm}
                  y2={W}
                  stroke={TARGET}
                  strokeWidth={1}
                  vectorEffect='non-scaling-stroke'
                />
              )}
            </svg>
            <div
              className='pointer-events-none absolute border border-textColor'
              style={{
                left: pct(miniLeft),
                width: pct(Math.max(0, miniRight - miniLeft)),
                top: pct(miniTop),
                height: pct(Math.max(0, miniBottom - miniTop)),
                minWidth: 3,
              }}
            />
          </div>
        </>
      )}

      <div
        ref={canvasRef}
        className='relative h-[60vh] min-h-[320px] w-full overflow-hidden border border-borderColor bg-bgColor outline-none'
        tabIndex={0}
        onKeyDown={(e) => {
          if ((e.key === 'r' || e.key === 'R' || e.key === 'к' || e.key === 'К') && editable) {
            e.preventDefault();
            rotateSelected();
          }
        }}
      >
        <svg
          ref={svgRef}
          xmlns='http://www.w3.org/2000/svg'
          viewBox={`${view.x} ${view.y} ${vw} ${vh}`}
          fontFamily='monospace'
          className={`absolute inset-0 h-full w-full touch-none ${panning ? 'cursor-grabbing' : 'cursor-grab'}`}
          onPointerDown={(e) => {
            // Сюда доходит всё, кроме нажатия на деталь в режиме правки (та гасит событие).
            if (e.button !== 0) return;
            pan.current = { px: e.clientX, py: e.clientY, v: view, moved: false };
            e.currentTarget.setPointerCapture(e.pointerId);
          }}
          onPointerMove={(e) => {
            const st = pan.current;
            if (!st) return;
            const dx = e.clientX - st.px;
            const dy = e.clientY - st.py;
            if (!st.moved) {
              if (Math.abs(dx) + Math.abs(dy) < DRAG_SLOP) return;
              st.moved = true;
              setPanning(true);
            }
            setUserView(clampView({ ...st.v, x: st.v.x - dx / st.v.s, y: st.v.y - dy / st.v.s }));
          }}
          onPointerUp={() => {
            // Щелчок по пустому месту без протяжки снимает выбор.
            if (pan.current && !pan.current.moved) setSelected(null);
            endPan();
          }}
          onPointerCancel={endPan}
          onLostPointerCapture={endPan}
          onDoubleClick={() => setUserView(null)}
        >
          <rect
            x={0}
            y={0}
            width={L}
            height={W}
            fill='#ffffff'
            stroke={RULE}
            strokeWidth={1}
            vectorEffect='non-scaling-stroke'
          />
          {tableEnd != null && (
            <>
              <defs>
                <pattern
                  id={hatchId}
                  patternUnits='userSpaceOnUse'
                  width={8 * px}
                  height={8 * px}
                  patternTransform='rotate(45)'
                >
                  <line x1={0} y1={0} x2={0} y2={8 * px} stroke={OFF_TABLE} strokeWidth={px} />
                </pattern>
              </defs>
              <rect
                x={tableEnd}
                y={0}
                width={Math.max(0, L - tableEnd)}
                height={W}
                fill={`url(#${hatchId})`}
                pointerEvents='none'
              />
            </>
          )}
          {marginCm > 0 && (
            <rect
              x={marginCm}
              y={marginCm}
              width={Math.max(0, L - marginCm)}
              height={Math.max(0, W - 2 * marginCm)}
              fill='none'
              stroke={RULE}
              strokeWidth={px}
              strokeDasharray={`${6 * px} ${4 * px}`}
            />
          )}
          <g pointerEvents='none'>
            {ticks.map((x) => {
              const major = Math.abs(x / labelStep - Math.round(x / labelStep)) < 1e-9;
              return (
                <g key={x}>
                  <line
                    x1={x}
                    y1={W}
                    x2={x}
                    y2={W + (major ? 6 : 3) * px}
                    stroke={major ? STROKE : RULE}
                    strokeWidth={1}
                    vectorEffect='non-scaling-stroke'
                  />
                  {major && x > 0 && (
                    <text
                      x={x}
                      y={W + 15 * px}
                      fontSize={10 * px}
                      fill={STROKE}
                      textAnchor='middle'
                    >
                      {x}
                    </text>
                  )}
                </g>
              );
            })}
          </g>

          {piecesLayer}
          {labelsLayer}

          <line
            x1={usedLengthCm}
            y1={0}
            x2={usedLengthCm}
            y2={W}
            stroke={INK}
            strokeWidth={1.5}
            vectorEffect='non-scaling-stroke'
            pointerEvents='none'
          />
          {tableEnd != null && (
            <g pointerEvents='none'>
              <line
                x1={tableEnd}
                y1={0}
                x2={tableEnd}
                y2={W}
                stroke={INK}
                strokeWidth={1.5}
                vectorEffect='non-scaling-stroke'
              />
              <text
                x={tableEnd - 4 * px}
                y={12 * px}
                fontSize={10 * px}
                fill={INK}
                textAnchor='end'
                stroke='#ffffff'
                strokeWidth={3 * px}
                paintOrder='stroke'
              >
                table end
              </text>
            </g>
          )}
          {targetCm != null && targetCm > 0 && (
            <line
              x1={targetCm}
              y1={0}
              x2={targetCm}
              y2={W}
              stroke={TARGET}
              strokeWidth={1.5 * px}
              strokeDasharray={`${8 * px} ${5 * px}`}
              pointerEvents='none'
            />
          )}
        </svg>

        {/* Выбранная деталь — мелко в левом верхнем углу холста, только пока она выбрана. */}
        {editable && selected != null && selPiece && (
          <div className='pointer-events-none absolute left-1.5 top-1.5 z-[1] flex items-center gap-2 bg-bgColor px-1'>
            <Text size='nano' variant='label' component='span'>
              {selPiece.name}
              {marksOf(placements[selected])}
            </Text>
            {rotsFor(selPiece, placements[selected].rot, placements[selected].flipped).length >
              1 && (
              <button
                type='button'
                className='pointer-events-auto text-nano uppercase underline hover:opacity-70'
                onClick={rotateSelected}
              >
                rotate (R)
              </button>
            )}
          </div>
        )}

        {/* Угол холста: «по ширине», «весь маркер» и кнопки модалки (выгрузка) — одна группа,
            один размер 28×28, одна линия. */}
        <div className='absolute bottom-1.5 right-1.5 z-[1] flex items-center gap-1'>
          <button
            type='button'
            aria-label='fit fabric width'
            title='fit fabric width'
            onClick={() => setUserView(null)}
            disabled={atFitWidth}
            className={`${ICON_BTN} disabled:opacity-40`}
          >
            <svg
              width='14'
              height='14'
              viewBox='0 0 14 14'
              fill='white'
              stroke='currentColor'
              strokeWidth='1'
              aria-hidden='true'
            >
              <path d='M0.5 0.5H13.5M0.5 13.5H13.5' />
              <path d='M7 2.5V11.5M5 4.5L7 2.5L9 4.5M5 9.5L7 11.5L9 9.5' fill='none' />
            </svg>
          </button>
          <button
            type='button'
            aria-label='show the whole marker'
            title='show the whole marker'
            onClick={() => setUserView(fitAll)}
            disabled={atFitAll}
            className={`${ICON_BTN} disabled:opacity-40`}
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
          {corner}
        </div>
      </div>
    </div>
  );
}
