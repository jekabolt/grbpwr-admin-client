import * as Dialog from '@radix-ui/react-dialog';
import { cn } from 'lib/utility';
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import {
  ArrowMarkerDef,
  CalloutShape,
  CALLOUT_COLOR_HEX,
  PlacingShape,
} from 'ui/components/annotation-shapes';
import { Chip, ChipRow } from 'ui/components/chip';
import Text from 'ui/components/text';

import {
  ANNOTATION_COLORS,
  ANNOTATION_KINDS,
  ANNOTATION_POINTS,
  type AnnotationColor,
  type AnnotationForm,
  type AnnotationKind,
} from './schema';

// ХОЛСТ С ВЫНОСКАМИ — картинка и указания поверх неё.
//
// ПРИМИТИВ НЕ ЗНАЕТ СЛОВА «ОПЕРАЦИЯ». Он принимает список выносок и отдаёт изменённый; кто его
// показывает — шаг сборки, карточный эскиз, деталь кроя или примерка — его не касается. Это не
// запас на будущее: тот же экран напрашивается в трёх местах, и ветвление по владельцу внутри
// примитива означало бы три разных поведения одной картинки.
//
// КООРДИНАТЫ — ДОЛИ КАДРА (0..1), а не пиксели: снимок показывают в разных размерах, печатают и
// кладут в архив, и единственное, что переживает все три, — доля. Пиксели считаются на лету из
// измеренного размера кадра, поэтому окружности остаются окружностями при любых пропорциях
// картинки (SVG с preserveAspectRatio="none" их бы сплющил).
//
// ИЗОЛЯЦИЯ: наведение на выноску скрывает остальные. На снимке узла их бывает десяток, они
// пересекаются, и прочесть один указатель, не убрав соседей, невозможно.
//
// ИНТЕРАКТИВ ЗДЕСЬ — НЕ ФОРМА. Холст живёт внутри общего `<fieldset disabled>` карточки, а
// задизейбленность НАСЛЕДУЕТСЯ: `<button>` под таким предком не получает ни клика, ни
// mouseenter. На выпущенной карточке это убило бы не правку (её и так нет), а ЧТЕНИЕ —
// изоляция перестала бы работать ровно там, где выносок много и они пересекаются.

/** Радиус кружка пина в пикселях кадра. Прочие размеры фигур живут в общем примитиве. */
const R_PIN = 9;
/** Зеркало серверного предела: узнать о нём при сохранении всей карточки — поздно. */
const MAX_ANNOTATIONS = 30;

/** Цвета живут в общем примитиве фигур: их читает и карточный эскиз. */
const COLOR_HEX = CALLOUT_COLOR_HEX;

export const KIND_LABEL: Record<AnnotationKind, string> = {
  pin: 'пин',
  label: 'подпись',
  dim: 'мерка',
  bracket: 'участок',
  multi: 'мультилидер',
  arc: 'дуга',
};

export const KIND_HINT: Record<AnnotationKind, string> = {
  pin: 'точка с номером — подпись читается в легенде под снимком',
  label: 'точка и подпись со стрелкой — «что тут делать»',
  dim: 'две точки, размерная линия с засечками — «по какому размеру»',
  bracket: 'две точки, скобка над участком — «на этом отрезке»',
  multi: 'одна подпись к нескольким местам — от 2 до 8 точек',
  arc: 'три точки: начало, точка НА КРИВОЙ, конец — посадка оката, скругление борта, ход строчки',
};

type Pt = { x: number; y: number };

/**
 * Перетаскивание плашки. Хранится СМЕЩЕНИЕ курсора относительно её центра: без него плашка
 * прыгала бы центром под курсор на первом же пикселе — жест начинался бы с рывка.
 */
type PlateDrag = {
  index: number;
  pointerId: number;
  /** Смещение точки захвата от центра плашки, в долях кадра. */
  offX: number;
  offY: number;
  x: number;
  y: number;
  /** Точка начала — для порога: ниже него жест остаётся кликом. */
  fromX: number;
  fromY: number;
  started: boolean;
};

/** Порог, разводящий клик по плашке и её перетаскивание, в долях кадра. */
const PLATE_DRAG_THRESHOLD = 0.01;

/**
 * РЕЕСТР ЖИВЫХ ХОЛСТОВ — «правка ровно одна на экране».
 *
 * До полосы кадров холст был на экране один, и локальные `selected`/`points` были локальными по
 * факту. Теперь их до десяти сразу (плюс одиннадцатый в зуме), и локальность превращается в три
 * дефекта: выбор на кадре A не снимается выбором на кадре B, поэтому Delete срабатывает у ОБОИХ
 * слушателей window и уносит две выноски с разных снимков; наполовину набранная мерка на A
 * достраивается кликом по A уже после того, как человек начал новую на B; а `selected` — ИНДЕКС,
 * и удаление в зуме сдвигает индекс наружного холста на чужую выноску, которую следующая же
 * правка текста перезапишет.
 *
 * Лечится одним правилом: холст, начавший правку, гасит правку у всех остальных. Реестр модульный,
 * потому что холсты не знают друг о друге и знать не должны — их родители разные (полоса шага,
 * галерея эскиза, диалог зума).
 */
type CanvasClaim = { clearSelection: () => void; clearPoints: () => void };
const liveCanvases = new Set<CanvasClaim>();

/** Отдать правку себе: у всех прочих холстов гаснет и выбор, и незавершённый жест. */
function claimEditing(me: CanvasClaim) {
  for (const other of liveCanvases) {
    if (other === me) continue;
    other.clearSelection();
    other.clearPoints();
  }
}

const num = (v?: string) => {
  const n = Number((v ?? '').replace(',', '.'));
  return Number.isFinite(n) ? n : 0;
};
const str = (n: number) => String(Math.round(n * 10000) / 10000);
const ptsOf = (a: AnnotationForm): Pt[] => (a.points ?? []).map((p) => ({ x: num(p.x), y: num(p.y) }));

export function AnnotationCanvas({
  src,
  alt,
  annotations,
  onChange,
  frozen = false,
  className,
  maxHeightClass,
  heightPx,
  toolbar = true,
  placingKind: externalKind,
  onPlaced,
  cornerSlot,
  zoomable = false,
  renderPiecePicker,
  pieceLabel,
}: {
  src: string;
  alt?: string;
  /** Потолок высоты снимка (класс), когда место ограничено — печать. */
  maxHeightClass?: string;
  /**
   * Фиксированная высота снимка в пикселях: кадр становится «ростом с полосу», ширину берёт от
   * своих пропорций. Так филмстрип выстраивается в ровный ряд, а альбомный снимок остаётся
   * альбомным — картинку не режут, поэтому выноски по-прежнему ложатся на свои места.
   */
  heightPx?: number;
  annotations: AnnotationForm[];
  /** Отсутствует = холст только читается. Печать и архив зовут его именно так. */
  onChange?: (next: AnnotationForm[]) => void;
  frozen?: boolean;
  className?: string;
  /** Своя панель видов. Полоса снимков держит ОДНУ панель на всю полосу и гасит эту. */
  toolbar?: boolean;
  /** Вид, выбранный СНАРУЖИ (общая панель полосы). undefined = холст решает сам. */
  placingKind?: AnnotationKind | null;
  /** Постановка завершена — общая панель снимает выбор вида. */
  onPlaced?: () => void;
  /** Кнопки поверх кадра (убрать снимок и прочее хозяйство владельца). */
  cornerSlot?: ReactNode;
  /** Показать кнопку «зум»: тот же холст во весь экран, с той же правкой. */
  zoomable?: boolean;
  /** Пикер детали кроя для редактора выноски. Отсутствует = поля детали нет вовсе. */
  renderPiecePicker?: (value: string, onChange: (lineKey: string) => void) => ReactNode;
  /** Имя детали по её ключу — для подписи и легенды, в том числе на печати. */
  pieceLabel?: (lineKey: string) => string | undefined;
}) {
  const boxRef = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ w: 0, h: 0 });
  // Наведение и выбор — РАЗНЫЕ состояния: наведение изолирует (мышь), выбор открывает правку
  // (клик) и переживает уход курсора, иначе поле ввода закрывалось бы от каждого движения.
  const [hovered, setHovered] = useState<number | null>(null);
  const [selected, setSelected] = useState<number | null>(null);
  // Незавершённая постановка. ВИД может прийти снаружи (общая панель полосы), а точки набираются
  // всегда здесь: они принадлежат ЭТОМУ снимку, и общий счётчик на полосу достраивал бы мерку,
  // начатую на первом кадре, вторым кликом по третьему.
  const [ownKind, setOwnKind] = useState<AnnotationKind | null>(null);
  const [points, setPoints] = useState<Pt[]>([]);
  const placingKind = externalKind !== undefined ? externalKind : ownKind;
  // Смена вида обнуляет набранное: две точки мерки не годятся началом дуги.
  useEffect(() => {
    setPoints([]);
  }, [placingKind]);
  const [zoomOpen, setZoomOpen] = useState(false);
  // Перетаскивание плашки. Без него перекрытие двух подписей НЕУСТРАНИМО: плашка ставится над
  // серединой якорей, и когда две выноски рядом, их подписи ложатся друг на друга навсегда.
  const [dragPlate, setDragPlate] = useState<PlateDrag | null>(null);
  // Зеркало жеста для синхронного чтения слушателями window: они переживают рендер, а решение
  // «куда встала плашка» обязано считаться по последнему движению, а не по отрендеренному.
  const dragRef = useRef<PlateDrag | null>(null);
  const commitDrag = useCallback((v: PlateDrag | null) => {
    dragRef.current = v;
    setDragPlate(v);
  }, []);
  /** Клик после перетаскивания — эхо, и открывать редактор он не должен. */
  const justDragged = useRef(false);

  const editable = !frozen && !!onChange;
  // Замыкание слушателей window живёт дольше рендера, поэтому «можно ли писать» и КУДА писать
  // читаются из ref'ов, а не из замыкания: карточку могли выпустить, пока палец на плашке, и
  // старый обработчик записал бы координаты в уже замороженную форму.
  const liveRef = useRef({ editable, onChange, annotations });
  liveRef.current = { editable, onChange, annotations };

  // ЗАЯВКА НА ПРАВКУ. Идентичность стабильна на всю жизнь холста, а функции внутри читают свежие
  // сеттеры — реестр хранит ОДИН объект и не пересобирается на каждый рендер.
  const claimRef = useRef<CanvasClaim>({ clearSelection: () => {}, clearPoints: () => {} });
  claimRef.current.clearSelection = () => setSelected(null);
  claimRef.current.clearPoints = () => setPoints([]);
  useEffect(() => {
    const me = claimRef.current;
    liveCanvases.add(me);
    return () => {
      liveCanvases.delete(me);
    };
  }, []);
  /** Выбрать выноску ЗДЕСЬ — и погасить правку на всех остальных холстах. */
  const selectHere = useCallback((next: number | null) => {
    if (next !== null) claimEditing(claimRef.current);
    setSelected(next);
  }, []);

  useLayoutEffect(() => {
    const el = boxRef.current;
    if (!el) return;
    const measure = () => setSize({ w: el.clientWidth, h: el.clientHeight });
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // Escape снимает незавершённый жест и выбор — единственный выход, который не требует попасть
  // мышью в конкретное место.
  useEffect(() => {
    if (!editable) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (placingKind) {
          setPoints([]);
          setOwnKind(null);
          onPlaced?.();
        } else setSelected(null);
        return;
      }
      // Delete/Backspace удаляют выбранную. ОБЕ клавиши намеренно: на маковской клавиатуре
      // «Delete» — это `Backspace`, и обещать жест, которого у половины команды физически нет,
      // хуже, чем не обещать вовсе.
      //
      // НО НЕ когда курсор в поле ввода: там та же клавиша стирает букву, и перехватить её
      // значило бы удалять выноску при правке её же подписи.
      if ((e.key !== 'Delete' && e.key !== 'Backspace') || selected === null) return;
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable)) return;
      // И НЕ когда этот холст на СКРЫТОЙ вкладке. Вкладки карточки смонтированы все разом
      // (переключение — это `hidden`), слушатель висит на window, а выбор переживает уход с
      // вкладки. Без этой проверки «выбрал выноску на снимке шага → ушёл на эскиз → нажал Delete»
      // удаляло выноску на вкладке, которой не видно, — молча и без единого следа на экране.
      if (!boxRef.current?.isConnected || boxRef.current.offsetParent === null) return;
      e.preventDefault();
      remove(selected);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [editable, placingKind, selected, annotations]);

  const px = useCallback((p: Pt) => ({ x: p.x * size.w, y: p.y * size.h }), [size]);

  // Слушатели на window, а не на плашке: она размером с текст, и указатель сходит с неё на первом
  // же движении — на самой плашке жест обрывался бы сразу.
  //
  // Подписка держится, ПОКА ЖЕСТ ЖИВ, а не пересоздаётся на каждое движение: зависимость от
  // самого состояния перетаскивания плодила бы по слушателю на кадр, и снятие с
  // `pointercancel`, подписанное анонимной функцией, не отписывалось бы вовсе.
  const dragActive = dragPlate !== null;
  useEffect(() => {
    // Карточку выпустили посреди жеста — жест обрывается сразу, не дожидаясь отпускания.
    if (dragActive && !editable) commitDrag(null);
  }, [dragActive, editable, commitDrag]);
  useEffect(() => {
    if (!dragActive) return;
    const at = (e: PointerEvent) => {
      const el = boxRef.current;
      if (!el) return null;
      const r = el.getBoundingClientRect();
      return {
        x: Math.min(1, Math.max(0, (e.clientX - r.left) / r.width)),
        y: Math.min(1, Math.max(0, (e.clientY - r.top) / r.height)),
      };
    };
    const move = (e: PointerEvent) => {
      const d = dragRef.current;
      if (!d || e.pointerId !== d.pointerId) return;
      const p = at(e);
      if (!p) return;
      const far =
        Math.abs(p.x - d.fromX) > PLATE_DRAG_THRESHOLD ||
        Math.abs(p.y - d.fromY) > PLATE_DRAG_THRESHOLD;
      if (!d.started && !far) return;
      commitDrag({
        ...d,
        started: true,
        x: Math.min(1, Math.max(0, p.x - d.offX)),
        y: Math.min(1, Math.max(0, p.y - d.offY)),
      });
    };
    const up = (e: PointerEvent) => {
      const d = dragRef.current;
      if (d && e.pointerId !== d.pointerId) return;
      commitDrag(null);
      if (!d?.started) return;
      justDragged.current = true;
      // Право на запись проверяется В МОМЕНТ ЗАПИСИ, а не в момент начала жеста.
      if (!liveRef.current.editable) return;
      patch(d.index, { labelX: str(d.x), labelY: str(d.y) });
    };
    const cancel = (e: PointerEvent) => {
      const d = dragRef.current;
      if (d && e.pointerId !== d.pointerId) return;
      justDragged.current = !!d?.started;
      commitDrag(null);
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
    // Потеря фокуса окна обрывает жест без разбора указателей: событий указателя оттуда больше
    // не придёт вовсе.
    const lost = () => {
      justDragged.current = !!dragRef.current?.started;
      commitDrag(null);
    };
    window.addEventListener('pointercancel', cancel);
    window.addEventListener('blur', lost);
    return () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      window.removeEventListener('pointercancel', cancel);
      window.removeEventListener('blur', lost);
    };
  }, [dragActive, commitDrag, annotations]);

  // ЗАПИСЬ ИДЁТ ЧЕРЕЗ liveRef, А НЕ ЧЕРЕЗ ЗАМЫКАНИЕ. Слушатель клавиатуры подписан на window и
  // пересоздаётся только когда меняются его зависимости; проп `onChange` полосы несёт ИНДЕКС
  // кадра, и после перестановки стрелками (`move`) сам кадр остаётся тем же (ключ — media_id), а
  // индекс в нём уже чужой. Стрелка «раньше» и следом Delete записывали массив выносок этого
  // снимка в тот, что занял его место, — потеря без единого сообщения.
  const commit = (next: AnnotationForm[]) => liveRef.current.onChange?.(next);

  const patch = (i: number, fields: Partial<AnnotationForm>) => {
    commit(liveRef.current.annotations.map((a, k) => (k === i ? { ...a, ...fields } : a)));
  };

  const remove = (i: number) => {
    commit(liveRef.current.annotations.filter((_, k) => k !== i));
    setSelected(null);
  };

  const clearPlacing = () => {
    setPoints([]);
    setOwnKind(null);
    onPlaced?.();
  };

  const finishPlacing = (kind: AnnotationKind, pts: Pt[]) => {
    const [min] = ANNOTATION_POINTS[kind];
    if (pts.length < min) return;
    if (liveRef.current.annotations.length >= MAX_ANNOTATIONS) {
      clearPlacing();
      return;
    }
    // Плашка ставится над серединой якорей — оттуда её почти никогда не приходится двигать,
    // а лидер строится сам.
    const cx = pts.reduce((s, p) => s + p.x, 0) / pts.length;
    const cy = pts.reduce((s, p) => s + p.y, 0) / pts.length;
    const next: AnnotationForm = {
      kind,
      points: pts.map((p) => ({ x: str(p.x), y: str(p.y) })),
      text: '',
      labelX: str(Math.min(0.96, Math.max(0.04, cx))),
      labelY: str(Math.min(0.96, Math.max(0.06, cy - 0.1))),
      color: '',
      pieceLineKey: '',
    };
    const before = liveRef.current.annotations;
    commit([...before, next]);
    clearPlacing();
    // Выбор сразу — третий такт жеста «клик-клик-ввод»: поле подписи открывается само.
    selectHere(before.length);
  };

  const onCanvasClick = (e: React.MouseEvent) => {
    if (!editable || !placingKind || size.w === 0) return;
    const r = boxRef.current!.getBoundingClientRect();
    const p = {
      x: Math.min(1, Math.max(0, (e.clientX - r.left) / r.width)),
      y: Math.min(1, Math.max(0, (e.clientY - r.top) / r.height)),
    };
    // Первая точка ЗДЕСЬ отменяет наполовину набранное у соседей: жест принадлежит одному снимку,
    // и мерка, начатая на кадре A, не должна ждать своего второго клика, пока человек рисует на B.
    if (points.length === 0) claimEditing(claimRef.current);
    const next = [...points, p];
    const [, max] = ANNOTATION_POINTS[placingKind];
    if (next.length >= max) finishPlacing(placingKind, next);
    else setPoints(next);
  };

  const active = placingKind ? null : hovered;
  const dimmed = (i: number) => active !== null && active !== i;
  const nameOf = (a: AnnotationForm) =>
    a.pieceLineKey ? pieceLabel?.(a.pieceLineKey) : undefined;
  const titleOf = (a: AnnotationForm, fallback: string) =>
    [a.text?.trim(), nameOf(a)].filter(Boolean).join(' · ') || fallback;

  return (
    <div className={cn('flex flex-col gap-1', heightPx != null && 'w-fit', className)}>
      {editable && toolbar && (
        <ChipRow>
          {annotations.length >= MAX_ANNOTATIONS ? (
            <Text size='micro' variant='label' component='span'>
              на снимок не больше {MAX_ANNOTATIONS} выносок — дальше их не прочесть
            </Text>
          ) : (
            ANNOTATION_KINDS.map((k) => (
              <Chip
                key={k}
                nonForm
                dashed={placingKind !== k}
                onClick={() => setOwnKind(placingKind === k ? null : k)}
                title={KIND_HINT[k]}
              >
                {KIND_LABEL[k]}
              </Chip>
            ))
          )}
          {placingKind && (
            <>
              <Text size='micro' variant='label' component='span'>
                {placingHint(placingKind, points.length)}
              </Text>
              {points.length >= ANNOTATION_POINTS[placingKind][0] && (
                <Chip
                  nonForm
                  onClick={() => finishPlacing(placingKind, points)}
                  title='закончить постановку'
                >
                  готово · {points.length}
                </Chip>
              )}
              <Chip nonForm dashed onClick={clearPlacing} title='отменить постановку'>
                отменить
              </Chip>
            </>
          )}
        </ChipRow>
      )}

      <div
        ref={boxRef}
        className={cn(
          'relative select-none border border-borderColor bg-bgZebra',
          heightPx != null && 'w-fit',
          placingKind && 'cursor-crosshair',
        )}
        onClick={onCanvasClick}
      >
        {/* `max-h` кладётся на САМО изображение, а не на контейнер: коробка с ограниченной
            высотой и картинкой `w-full` внутри просто переполняется — на печати это обрезанный
            снимок. Ограничив изображение, коробка ужимается по нему, а выноски остаются на
            местах: они в долях кадра, а не в пикселях. */}
        <img
          src={src}
          alt={alt ?? ''}
          className={cn(
            'block',
            heightPx != null ? 'h-auto w-auto max-w-none' : 'h-auto w-full',
            maxHeightClass,
          )}
          style={heightPx != null ? { height: heightPx } : undefined}
          draggable={false}
        />
        {/* viewBox, А НЕ ПИКСЕЛЬНЫЕ width/height. Замер сделан для ЭКРАНА, а печать меняет ширину
            коробки, и ResizeObserver при этом не стреляет: фигуры остались бы в экранном масштабе,
            пока плашки (они в процентах) переехали бы — лидер указывал бы мимо. С viewBox холст
            масштабируется вместе с коробкой, пропорции которой равны пропорциям снимка. */}
        {size.w > 0 && (
          <svg
            className='pointer-events-none absolute inset-0 h-full w-full'
            viewBox={`0 0 ${size.w} ${size.h}`}
            preserveAspectRatio='none'
            aria-hidden
          >
            <defs>
              <ArrowMarkerDef />
            </defs>
            {annotations.map((a, i) => (
              <AnnotationShape
                key={i}
                a={a}
                px={px}
                hidden={dimmed(i)}
                selected={selected === i}
                // Лидер тянется за плашкой во время перетаскивания: иначе линия оставалась бы у
                // старого места, и жест выглядел бы как «подпись оторвалась от указателя».
                labelAt={dragPlate?.index === i ? { x: dragPlate.x, y: dragPlate.y } : undefined}
              />
            ))}
            {placingKind && <PlacingShape kind={placingKind} pts={points.map(px)} />}
          </svg>
        )}

        {/* Плашки — HTML поверх SVG, а не <text>: перенос строки, обрезка и выделение мышью в SVG
            приходится изобретать заново, и всё это уже есть у обычного блока. */}
        {size.w > 0 &&
          annotations.map((a, i) =>
            a.kind === 'pin' ? null : (
              <span
                key={`plate:${i}`}
                role={editable ? 'button' : undefined}
                tabIndex={editable ? 0 : undefined}
                title={titleOf(a, KIND_LABEL[a.kind ?? 'label'])}
                onMouseEnter={() => setHovered(i)}
                onMouseLeave={() => setHovered((h) => (h === i ? null : h))}
                onClick={(e) => {
                  e.stopPropagation();
                  if (justDragged.current) {
                    justDragged.current = false;
                    return;
                  }
                  if (editable) selectHere(selected === i ? null : i);
                }}
                onKeyDown={(e) => {
                  if (!editable || (e.key !== 'Enter' && e.key !== ' ')) return;
                  e.preventDefault();
                  selectHere(selected === i ? null : i);
                }}
                className={cn(
                  'absolute max-w-[45%] -translate-x-1/2 -translate-y-1/2 cursor-pointer border bg-bgColor px-1 py-px text-left text-nano leading-tight',
                  selected === i ? 'border-textColor' : 'border-borderColor',
                  dimmed(i) && 'invisible',
                  // Во время постановки слой подписей НЕ ловит клик: точка под чужой плашкой иначе
                  // непоставима — вместо неё открывался бы редактор соседа.
                  placingKind && 'pointer-events-none',
                )}
                onPointerDown={(e) => {
                  if (!editable) return;
                  // Живой жест не перехватывается вторым касанием: иначе плашка B поехала бы по
                  // координатам пальца, тащившего A.
                  if (dragRef.current) return;
                  e.stopPropagation();
                  justDragged.current = false;
                  const el = boxRef.current;
                  if (!el) return;
                  const r = el.getBoundingClientRect();
                  const px0 = (e.clientX - r.left) / r.width;
                  const py0 = (e.clientY - r.top) / r.height;
                  commitDrag({
                    index: i,
                    pointerId: e.pointerId,
                    offX: px0 - num(a.labelX),
                    offY: py0 - num(a.labelY),
                    x: num(a.labelX),
                    y: num(a.labelY),
                    fromX: px0,
                    fromY: py0,
                    started: false,
                  });
                }}
                style={{
                  // `touch-action` объявляется ЗАРАНЕЕ: браузер выбирает поведение жеста в момент
                  // касания, и запрет, выставленный позже, уже ничего не решает — палец уводит
                  // страницу в прокрутку, прилетает pointercancel, плашка возвращается назад.
                  touchAction: editable ? 'none' : undefined,
                  left: `${(dragPlate?.index === i ? dragPlate.x : num(a.labelX)) * 100}%`,
                  top: `${(dragPlate?.index === i ? dragPlate.y : num(a.labelY)) * 100}%`,
                  color: a.color ? COLOR_HEX[a.color as Exclude<AnnotationColor, ''>] : undefined,
                }}
              >
                {a.text?.trim() || nameOf(a) || '—'}
              </span>
            ),
          )}

        {/* Номера пинов — тем же слоем, чтобы цифра не тонула в контуре снимка. */}
        {size.w > 0 &&
          annotations.map((a, i) => {
            if (a.kind !== 'pin') return null;
            const p = ptsOf(a)[0];
            if (!p) return null;
            return (
              <span
                key={`pin:${i}`}
                role={editable ? 'button' : undefined}
                tabIndex={editable ? 0 : undefined}
                onMouseEnter={() => setHovered(i)}
                onMouseLeave={() => setHovered((h) => (h === i ? null : h))}
                onClick={(e) => {
                  e.stopPropagation();
                  if (editable) selectHere(selected === i ? null : i);
                }}
                onKeyDown={(e) => {
                  if (!editable || (e.key !== 'Enter' && e.key !== ' ')) return;
                  e.preventDefault();
                  selectHere(selected === i ? null : i);
                }}
                title={titleOf(a, `выноска ${pinNumber(annotations, i)}`)}
                className={cn(
                  'absolute flex -translate-x-1/2 -translate-y-1/2 cursor-pointer items-center justify-center rounded-full border bg-bgColor text-nano',
                  selected === i ? 'border-textColor' : 'border-borderColor',
                  dimmed(i) && 'invisible',
                  placingKind && 'pointer-events-none',
                )}
                style={{
                  left: `${p.x * 100}%`,
                  top: `${p.y * 100}%`,
                  width: R_PIN * 2,
                  height: R_PIN * 2,
                  color: a.color ? COLOR_HEX[a.color as Exclude<AnnotationColor, ''>] : undefined,
                }}
              >
                {pinNumber(annotations, i)}
              </span>
            );
          })}

        {(zoomable || cornerSlot) && (
          <div className='absolute right-1 top-1 z-[4] flex items-center gap-1'>
            {cornerSlot}
            {zoomable && (
              <FrameButton
                label='зум'
                title='открыть снимок во весь экран — там же и ставить указания точнее'
                onPress={() => {
                  // ЗУМ ОБРЫВАЕТ НЕЗАВЕРШЁННУЮ ПОСТАНОВКУ. Полноэкранный холст — отдельная
                  // поверхность со своей панелью видов и своими точками; продолжить в нём мерку,
                  // начатую на миниатюре, нечем, а оставить режим включённым значило бы, что после
                  // закрытия зума первый же клик по кадру уронит на него постороннюю фигуру.
                  if (placingKind) clearPlacing();
                  setZoomOpen(true);
                }}
              />
            )}
          </div>
        )}
      </div>

      {/* ПОЛОСА ПРЯЧЕТ СВОЙ ТУЛБАР — вместе с ним пряталось и «готово». У мультилидера якорей от
          двух до восьми, и без этой кнопки закончить его раньше ВОСЬМИ было нечем: жест завершался
          только по достижению максимума. Здесь же говорится и про упёршийся предел — иначе выбор
          вида на полном снимке просто ничего не делал бы, молча. */}
      {editable &&
        !toolbar &&
        // ТОЛЬКО У ТОГО КАДРА, ГДЕ ЖЕСТ ИДЁТ. Вид выбран на всю полосу, и условие «есть вид»
        // напечатало бы одну и ту же подсказку под каждым из десяти снимков — полоса превратилась
        // бы в столбик одинаковых строк. Строка появляется, когда на ЭТОМ кадре поставлена первая
        // точка (общая подсказка «кликайте по нужному снимку» висит над полосой), либо когда этот
        // кадр упёрся в предел и класть на него больше нечего.
        ((placingKind && annotations.length >= MAX_ANNOTATIONS) || points.length > 0) && (
        <ChipRow>
          {annotations.length >= MAX_ANNOTATIONS ? (
            <Text size='micro' variant='label' component='span'>
              на этом снимке уже {MAX_ANNOTATIONS} выносок — дальше их не прочесть
            </Text>
          ) : (
            <>
              <Text size='micro' variant='label' component='span'>
                {placingHint(placingKind as AnnotationKind, points.length)}
              </Text>
              {points.length >= ANNOTATION_POINTS[placingKind as AnnotationKind][0] &&
                ANNOTATION_POINTS[placingKind as AnnotationKind][0] !==
                  ANNOTATION_POINTS[placingKind as AnnotationKind][1] && (
                  <Chip
                    nonForm
                    onClick={() => finishPlacing(placingKind as AnnotationKind, points)}
                    title='закончить постановку'
                  >
                    готово · {points.length}
                  </Chip>
                )}
              {points.length > 0 && (
                <Chip nonForm dashed onClick={clearPlacing} title='отменить постановку'>
                  отменить
                </Chip>
              )}
            </>
          )}
        </ChipRow>
      )}

      {editable && selected !== null && annotations[selected] && (
        <AnnotationEditor
          a={annotations[selected]}
          number={pinNumber(annotations, selected)}
          onText={(text) => patch(selected, { text })}
          onColor={(color) => patch(selected, { color })}
          onPiece={(pieceLineKey) => patch(selected, { pieceLineKey })}
          onRemove={() => remove(selected)}
          onClose={() => setSelected(null)}
          renderPiecePicker={renderPiecePicker}
        />
      )}

      {/* ЛЕГЕНДА ТОЛЬКО ДЛЯ ПИНОВ. Остальные виды несут текст на себе, и повторять его списком
          значило бы печатать одно и то же дважды. */}
      <PinLegend annotations={annotations} onHover={setHovered} pieceLabel={pieceLabel} />

      {/* ЗУМ — ТОТ ЖЕ ХОЛСТ, А НЕ СМОТРЕЛКА. Снимок узла бывает мелким, а указание ставят по
          миллиметровой детали; открывать увеличенную копию только для чтения значило бы отправлять
          человека ставить точку обратно на миниатюру, где он в неё и не попал. Правка здесь та же
          самая, потому что и форма та же — координаты в долях кадра. */}
      {zoomable && (
        <Dialog.Root open={zoomOpen} onOpenChange={setZoomOpen}>
          <Dialog.Portal>
            <Dialog.Overlay className='fixed inset-0 z-[var(--z-modal)] bg-overlay' />
            <Dialog.Content
              aria-label={alt || 'снимок'}
              className='fixed inset-0 z-[var(--z-modal)] flex flex-col bg-bgColor text-textColor focus:outline-none'
            >
              <Dialog.Title className='sr-only'>{alt || 'снимок'}</Dialog.Title>
              <div className='flex shrink-0 items-center justify-between gap-4 border-b border-borderColor bg-bgSecondary px-2.5 py-1.5'>
                <Text size='micro' variant='uppercase' tracking='group' component='span' className='truncate font-bold'>
                  {alt || 'снимок'}
                </Text>
                <Dialog.Close className='shrink-0 cursor-pointer border border-borderColor bg-bgColor px-2.5 py-1 text-micro uppercase leading-none tracking-label hover:bg-textColor hover:text-bgColor'>
                  закрыть ✕
                </Dialog.Close>
              </div>
              <div className='min-h-0 flex-1 overflow-auto p-2 sm:p-4'>
                <AnnotationCanvas
                  src={src}
                  alt={alt}
                  annotations={annotations}
                  onChange={onChange}
                  frozen={frozen}
                  maxHeightClass='max-h-[calc(100dvh-11rem)]'
                  className='mx-auto w-fit'
                  renderPiecePicker={renderPiecePicker}
                  pieceLabel={pieceLabel}
                />
              </div>
            </Dialog.Content>
          </Dialog.Portal>
        </Dialog.Root>
      )}
    </div>
  );
}

/**
 * Кнопка поверх кадра. Гасит СВОЙ указатель: иначе нажатие проходит вниз, на холст, и в режиме
 * постановки вместо зума ставится точка ровно под кнопкой.
 *
 * Не `<button>`: холст живёт внутри общего `<fieldset disabled>` выпущенной карточки, а
 * задизейбленность наследуется — на выпущенной карточке зум перестал бы открываться, то есть
 * читать архив стало бы нечем.
 */
function FrameButton({
  label,
  title,
  onPress,
}: {
  label: string;
  title: string;
  onPress: () => void;
}) {
  return (
    <span
      role='button'
      tabIndex={0}
      title={title}
      aria-label={title}
      onPointerDown={(e) => e.stopPropagation()}
      onClick={(e) => {
        e.stopPropagation();
        onPress();
      }}
      onKeyDown={(e) => {
        if (e.key !== 'Enter' && e.key !== ' ') return;
        e.preventDefault();
        onPress();
      }}
      className='cursor-pointer border border-borderColor bg-bgColor px-1.5 py-px text-nano uppercase leading-none tracking-label hover:bg-textColor hover:text-bgColor focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-textColor'
    >
      {label}
    </span>
  );
}

function placingHint(kind: AnnotationKind, placed: number): string {
  const [min, max] = ANNOTATION_POINTS[kind];
  if (max === 1) return 'кликните точку на снимке';
  if (kind === 'arc') {
    return ['кликните начало дуги', 'кликните точку НА дуге', 'кликните конец дуги'][placed] ?? '';
  }
  if (min === max) return `кликните ${max} точки — поставлено ${placed}`;
  return `кликайте точки (от ${min} до ${max}) — поставлено ${placed}`;
}

/** Номер пина = его порядок СРЕДИ ПИНОВ, а не в общем списке: легенда нумеруется подряд. */
function pinNumber(list: AnnotationForm[], index: number): number {
  let n = 0;
  for (let i = 0; i <= index; i++) if (list[i]?.kind === 'pin') n++;
  return n;
}

function AnnotationShape({
  a,
  px,
  hidden,
  selected,
  labelAt,
}: {
  a: AnnotationForm;
  px: (p: Pt) => Pt;
  hidden: boolean;
  selected: boolean;
  /** Транзиентная позиция плашки во время перетаскивания. */
  labelAt?: Pt;
}) {
  if (hidden) return null;
  // Сама фигура рисуется ОБЩИМ примитивом (ui/annotation-shapes): те же засечки мерки и та же
  // дуга на снимке шага и на карточном эскизе. Здесь остаётся только перевод долей кадра в
  // пиксели и решение, что считать местом подписи.
  return (
    <CalloutShape
      kind={a.kind ?? 'pin'}
      pts={ptsOf(a).map(px)}
      label={px(labelAt ?? { x: num(a.labelX), y: num(a.labelY) })}
      color={a.color || undefined}
      strokeWidth={selected ? 2 : 1.5}
    />
  );
}

function AnnotationEditor({
  a,
  number,
  onText,
  onColor,
  onPiece,
  onRemove,
  onClose,
  renderPiecePicker,
}: {
  a: AnnotationForm;
  number: number;
  onText: (v: string) => void;
  onColor: (v: AnnotationColor) => void;
  onPiece: (v: string) => void;
  onRemove: () => void;
  onClose: () => void;
  renderPiecePicker?: (value: string, onChange: (lineKey: string) => void) => ReactNode;
}) {
  const ref = useRef<HTMLInputElement>(null);
  // Третий такт жеста: точки поставлены — курсор уже в поле подписи, без ещё одного клика.
  useEffect(() => {
    ref.current?.focus();
  }, [a]);

  return (
    <div className='flex flex-col gap-1 border border-borderColor p-1.5'>
      <div className='flex items-center gap-1.5'>
        <Text size='micro' variant='label' component='span' className='uppercase'>
          {KIND_LABEL[a.kind ?? 'pin']}
          {a.kind === 'pin' ? ` · ${number}` : ''}
        </Text>
        <input
          ref={ref}
          value={a.text ?? ''}
          onChange={(e) => onText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              onClose();
            }
          }}
          placeholder={a.kind === 'dim' ? 'значение с единицами — «6 мм»' : 'что тут делать'}
          maxLength={500}
          className='min-w-0 flex-1 border border-borderColor bg-bgColor px-1 py-px text-micro focus:border-textColor focus:outline-none'
        />
      </div>
      {/* ДЕТАЛЬ КРОЯ, О КОТОРОЙ УКАЗАНИЕ. Ссылка, а не имя: имя переживает переименование хуже.
          Пикер приходит снаружи — примитив не знает ни формы карточки, ни того, откуда берутся
          силуэты; на печати и в архиве пикера нет вовсе, и поле просто не рисуется. */}
      {renderPiecePicker && (
        <div className='flex items-center gap-1.5'>
          <Text size='micro' variant='label' component='span' className='shrink-0 uppercase'>
            деталь:
          </Text>
          <div className='min-w-0 flex-1'>{renderPiecePicker(a.pieceLineKey ?? '', onPiece)}</div>
        </div>
      )}
      <ChipRow>
        <Text size='micro' variant='label' component='span' className='uppercase'>
          цвет:
        </Text>
        {ANNOTATION_COLORS.map((c) => (
          <Chip
            key={c || 'ink'}
            nonForm
            dashed={(a.color ?? '') !== c}
            onClick={() => onColor(c)}
            title={c ? 'цвет различает пересекающиеся выноски' : 'чернильный — как всё остальное на листе'}
          >
            <span
              aria-hidden
              className='inline-block size-2 border border-borderColor'
              style={{ background: c ? COLOR_HEX[c as Exclude<AnnotationColor, ''>] : 'currentColor' }}
            />
            {c || 'чернила'}
          </Chip>
        ))}
        <Chip nonForm dashed onClick={onRemove} title='удалить выноску'>
          удалить
        </Chip>
        <Chip nonForm dashed onClick={onClose} title='закрыть правку'>
          готово
        </Chip>
      </ChipRow>
    </div>
  );
}

/**
 * Легенда пинов — печатная таблица под снимком.
 *
 * Только для пинов: у остальных видов текст стоит на самой картинке, и список повторял бы его
 * вторым экземпляром, который однажды разойдётся с первым.
 */
function PinLegend({
  annotations,
  onHover,
  pieceLabel,
}: {
  annotations: AnnotationForm[];
  onHover?: (i: number | null) => void;
  pieceLabel?: (lineKey: string) => string | undefined;
}) {
  const pins = annotations
    .map((a, i) => ({ a, i }))
    .filter(
      ({ a }) =>
        a.kind === 'pin' && ((a.text ?? '').trim() || (a.pieceLineKey && pieceLabel?.(a.pieceLineKey))),
    );
  if (pins.length === 0) return null;
  return (
    <div className='flex flex-col gap-0.5'>
      {pins.map(({ a, i }) => {
        const piece = a.pieceLineKey ? pieceLabel?.(a.pieceLineKey) : undefined;
        return (
          <div
            key={i}
            className='flex items-baseline gap-1.5'
            onMouseEnter={() => onHover?.(i)}
            onMouseLeave={() => onHover?.(null)}
          >
            <Text size='nano' variant='label' component='span' className='shrink-0 tabular-nums'>
              {pinNumber(annotations, i)}
            </Text>
            <Text size='nano' component='span' className='min-w-0'>
              {a.text}
            </Text>
            {piece && (
              <Text size='nano' variant='label' component='span' className='shrink-0 uppercase'>
                {piece}
              </Text>
            )}
          </div>
        );
      })}
    </div>
  );
}
