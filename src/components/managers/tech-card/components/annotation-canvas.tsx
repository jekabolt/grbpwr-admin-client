import { cn } from 'lib/utility';
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { Chip, ChipRow } from 'ui/components/chip';
import Text from 'ui/components/text';

import {
  ANNOTATION_COLORS,
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

/** Толщина линий и размеры фигур в пикселях кадра — не масштабируются вместе с картинкой. */
const R_PIN = 9;
const TICK = 7;
const BRACKET_DROP = 10;

const COLOR_HEX: Record<Exclude<AnnotationColor, ''>, string> = {
  red: '#d02b2b',
  blue: '#2323ff',
  green: '#0f7a34',
  orange: '#d97a00',
};

const KIND_LABEL: Record<AnnotationKind, string> = {
  pin: 'пин',
  label: 'подпись',
  dim: 'мерка',
  bracket: 'участок',
  multi: 'мультилидер',
};

const KIND_HINT: Record<AnnotationKind, string> = {
  pin: 'точка с номером — подпись читается в легенде под снимком',
  label: 'точка и подпись со стрелкой — «что тут делать»',
  dim: 'две точки, размерная линия с засечками — «по какому размеру»',
  bracket: 'две точки, скобка над участком — «на этом отрезке»',
  multi: 'одна подпись к нескольким местам — от 2 до 8 точек',
};

type Pt = { x: number; y: number };

const num = (v?: string) => {
  const n = Number((v ?? '').replace(',', '.'));
  return Number.isFinite(n) ? n : 0;
};
const str = (n: number) => String(Math.round(n * 10000) / 10000);
const ptsOf = (a: AnnotationForm): Pt[] => (a.points ?? []).map((p) => ({ x: num(p.x), y: num(p.y) }));
const inkOf = (a: AnnotationForm) => (a.color ? COLOR_HEX[a.color as Exclude<AnnotationColor, ''>] : 'currentColor');

export function AnnotationCanvas({
  src,
  alt,
  annotations,
  onChange,
  frozen = false,
  className,
}: {
  src: string;
  alt?: string;
  annotations: AnnotationForm[];
  /** Отсутствует = холст только читается. Печать и архив зовут его именно так. */
  onChange?: (next: AnnotationForm[]) => void;
  frozen?: boolean;
  className?: string;
}) {
  const boxRef = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ w: 0, h: 0 });
  // Наведение и выбор — РАЗНЫЕ состояния: наведение изолирует (мышь), выбор открывает правку
  // (клик) и переживает уход курсора, иначе поле ввода закрывалось бы от каждого движения.
  const [hovered, setHovered] = useState<number | null>(null);
  const [selected, setSelected] = useState<number | null>(null);
  // Незавершённая постановка: вид выбран, точки набираются кликами.
  const [placing, setPlacing] = useState<{ kind: AnnotationKind; points: Pt[] } | null>(null);

  const editable = !frozen && !!onChange;

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
      if (e.key !== 'Escape') return;
      if (placing) setPlacing(null);
      else setSelected(null);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [editable, placing]);

  const px = useCallback((p: Pt) => ({ x: p.x * size.w, y: p.y * size.h }), [size]);

  const commit = (next: AnnotationForm[]) => onChange?.(next);

  const patch = (i: number, fields: Partial<AnnotationForm>) => {
    commit(annotations.map((a, k) => (k === i ? { ...a, ...fields } : a)));
  };

  const remove = (i: number) => {
    commit(annotations.filter((_, k) => k !== i));
    setSelected(null);
  };

  const finishPlacing = (kind: AnnotationKind, points: Pt[]) => {
    const [min] = ANNOTATION_POINTS[kind];
    if (points.length < min) return;
    // Плашка ставится над серединой якорей — оттуда её почти никогда не приходится двигать,
    // а лидер строится сам.
    const cx = points.reduce((s, p) => s + p.x, 0) / points.length;
    const cy = points.reduce((s, p) => s + p.y, 0) / points.length;
    const next: AnnotationForm = {
      kind,
      points: points.map((p) => ({ x: str(p.x), y: str(p.y) })),
      text: '',
      labelX: str(Math.min(0.96, Math.max(0.04, cx))),
      labelY: str(Math.min(0.96, Math.max(0.06, cy - 0.1))),
      color: '',
    };
    commit([...annotations, next]);
    setPlacing(null);
    // Выбор сразу — третий такт жеста «клик-клик-ввод»: поле подписи открывается само.
    setSelected(annotations.length);
  };

  const onCanvasClick = (e: React.MouseEvent) => {
    if (!editable || !placing || size.w === 0) return;
    const r = boxRef.current!.getBoundingClientRect();
    const p = {
      x: Math.min(1, Math.max(0, (e.clientX - r.left) / r.width)),
      y: Math.min(1, Math.max(0, (e.clientY - r.top) / r.height)),
    };
    const points = [...placing.points, p];
    const [, max] = ANNOTATION_POINTS[placing.kind];
    if (points.length >= max) finishPlacing(placing.kind, points);
    else setPlacing({ ...placing, points });
  };

  const active = placing ? null : hovered;
  const dimmed = (i: number) => active !== null && active !== i;

  return (
    <div className={cn('flex flex-col gap-1', className)}>
      {editable && (
        <ChipRow>
          {(Object.keys(KIND_LABEL) as AnnotationKind[]).map((k) => (
            <Chip
              key={k}
              dashed={placing?.kind !== k}
              onClick={() => setPlacing(placing?.kind === k ? null : { kind: k, points: [] })}
              title={KIND_HINT[k]}
            >
              {KIND_LABEL[k]}
            </Chip>
          ))}
          {placing && (
            <>
              <Text size='micro' variant='label' component='span'>
                {placingHint(placing.kind, placing.points.length)}
              </Text>
              {placing.points.length >= ANNOTATION_POINTS[placing.kind][0] && (
                <Chip onClick={() => finishPlacing(placing.kind, placing.points)} title='закончить постановку'>
                  готово · {placing.points.length}
                </Chip>
              )}
              <Chip dashed onClick={() => setPlacing(null)} title='отменить постановку'>
                отменить
              </Chip>
            </>
          )}
        </ChipRow>
      )}

      <div
        ref={boxRef}
        className={cn('relative select-none border border-borderColor bg-bgZebra', placing && 'cursor-crosshair')}
        onClick={onCanvasClick}
      >
        <img src={src} alt={alt ?? ''} className='block w-full' draggable={false} />
        {size.w > 0 && (
          <svg
            className='pointer-events-none absolute inset-0'
            width={size.w}
            height={size.h}
            aria-hidden
          >
            <defs>
              <marker id='ann-arrow' viewBox='0 0 8 8' refX={7} refY={4} markerWidth={5} markerHeight={5} orient='auto-start-reverse'>
                <path d='M0,1 L7,4 L0,7 z' fill='currentColor' />
              </marker>
            </defs>
            {annotations.map((a, i) => (
              <AnnotationShape
                key={i}
                a={a}
                index={i}
                px={px}
                hidden={dimmed(i)}
                selected={selected === i}
              />
            ))}
            {placing && <PlacingShape kind={placing.kind} points={placing.points} px={px} />}
          </svg>
        )}

        {/* Плашки — HTML поверх SVG, а не <text>: перенос строки, обрезка и выделение мышью в SVG
            приходится изобретать заново, и всё это уже есть у обычного блока. */}
        {size.w > 0 &&
          annotations.map((a, i) =>
            a.kind === 'pin' ? null : (
              <button
                key={`plate:${i}`}
                type='button'
                onMouseEnter={() => setHovered(i)}
                onMouseLeave={() => setHovered((h) => (h === i ? null : h))}
                onClick={(e) => {
                  e.stopPropagation();
                  if (editable) setSelected(selected === i ? null : i);
                }}
                className={cn(
                  'absolute max-w-[45%] -translate-x-1/2 -translate-y-1/2 border bg-bgColor px-1 py-px text-left text-nano leading-tight',
                  selected === i ? 'border-textColor' : 'border-borderColor',
                  dimmed(i) && 'invisible',
                )}
                style={{
                  left: `${num(a.labelX) * 100}%`,
                  top: `${num(a.labelY) * 100}%`,
                  color: a.color ? COLOR_HEX[a.color as Exclude<AnnotationColor, ''>] : undefined,
                }}
              >
                {a.text?.trim() || '—'}
              </button>
            ),
          )}

        {/* Номера пинов — тем же слоем, чтобы цифра не тонула в контуре снимка. */}
        {size.w > 0 &&
          annotations.map((a, i) => {
            if (a.kind !== 'pin') return null;
            const p = ptsOf(a)[0];
            if (!p) return null;
            return (
              <button
                key={`pin:${i}`}
                type='button'
                onMouseEnter={() => setHovered(i)}
                onMouseLeave={() => setHovered((h) => (h === i ? null : h))}
                onClick={(e) => {
                  e.stopPropagation();
                  if (editable) setSelected(selected === i ? null : i);
                }}
                title={a.text?.trim() || `выноска ${pinNumber(annotations, i)}`}
                className={cn(
                  'absolute flex -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full border bg-bgColor text-nano',
                  selected === i ? 'border-textColor' : 'border-borderColor',
                  dimmed(i) && 'invisible',
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
              </button>
            );
          })}
      </div>

      {editable && selected !== null && annotations[selected] && (
        <AnnotationEditor
          a={annotations[selected]}
          number={pinNumber(annotations, selected)}
          onText={(text) => patch(selected, { text })}
          onColor={(color) => patch(selected, { color })}
          onRemove={() => remove(selected)}
          onClose={() => setSelected(null)}
        />
      )}

      {/* ЛЕГЕНДА ТОЛЬКО ДЛЯ ПИНОВ. Остальные виды несут текст на себе, и повторять его списком
          значило бы печатать одно и то же дважды. */}
      <PinLegend annotations={annotations} onHover={setHovered} />
    </div>
  );
}

function placingHint(kind: AnnotationKind, placed: number): string {
  const [min, max] = ANNOTATION_POINTS[kind];
  if (max === 1) return 'кликните точку на снимке';
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
  index,
  px,
  hidden,
  selected,
}: {
  a: AnnotationForm;
  index: number;
  px: (p: Pt) => Pt;
  hidden: boolean;
  selected: boolean;
}) {
  if (hidden) return null;
  const pts = ptsOf(a).map(px);
  if (pts.length === 0) return null;
  const ink = inkOf(a);
  const w = selected ? 2 : 1.5;
  const label = px({ x: num(a.labelX), y: num(a.labelY) });

  switch (a.kind) {
    case 'pin':
      // Сам кружок — HTML-слоем выше; здесь только точка привязки, чтобы место было видно и
      // тогда, когда номер перекрыт соседом.
      return <circle cx={pts[0].x} cy={pts[0].y} r={2} fill={ink} />;
    case 'label':
      return (
        <g stroke={ink} fill='none' strokeWidth={w}>
          <circle cx={pts[0].x} cy={pts[0].y} r={3} fill={ink} />
          <line x1={label.x} y1={label.y} x2={pts[0].x} y2={pts[0].y} markerEnd='url(#ann-arrow)' />
        </g>
      );
    case 'dim': {
      const [p, q] = pts;
      // Засечки перпендикулярны линии — как в чертеже: они и делают линию РАЗМЕРНОЙ, а не просто
      // отрезком между двумя точками.
      const dx = q.x - p.x;
      const dy = q.y - p.y;
      const len = Math.hypot(dx, dy) || 1;
      const nx = (-dy / len) * TICK;
      const ny = (dx / len) * TICK;
      return (
        <g stroke={ink} strokeWidth={w} fill='none'>
          <line x1={p.x} y1={p.y} x2={q.x} y2={q.y} />
          <line x1={p.x - nx} y1={p.y - ny} x2={p.x + nx} y2={p.y + ny} />
          <line x1={q.x - nx} y1={q.y - ny} x2={q.x + nx} y2={q.y + ny} />
          <line x1={label.x} y1={label.y} x2={(p.x + q.x) / 2} y2={(p.y + q.y) / 2} strokeDasharray='2 2' />
        </g>
      );
    }
    case 'bracket': {
      const [p, q] = pts;
      const dx = q.x - p.x;
      const dy = q.y - p.y;
      const len = Math.hypot(dx, dy) || 1;
      const nx = (-dy / len) * BRACKET_DROP;
      const ny = (dx / len) * BRACKET_DROP;
      return (
        <g stroke={ink} strokeWidth={w} fill='none'>
          <path
            d={`M${p.x},${p.y} L${p.x + nx},${p.y + ny} L${q.x + nx},${q.y + ny} L${q.x},${q.y}`}
          />
          <line
            x1={label.x}
            y1={label.y}
            x2={(p.x + q.x) / 2 + nx}
            y2={(p.y + q.y) / 2 + ny}
            strokeDasharray='2 2'
          />
        </g>
      );
    }
    case 'multi':
      return (
        <g stroke={ink} strokeWidth={w} fill='none'>
          {pts.map((p, i) => (
            <g key={i}>
              <circle cx={p.x} cy={p.y} r={3} fill={ink} />
              <line x1={label.x} y1={label.y} x2={p.x} y2={p.y} markerEnd='url(#ann-arrow)' />
            </g>
          ))}
        </g>
      );
    default:
      return null;
  }
}

/** Незавершённая постановка: точки уже кликнуты, фигура ещё не создана. */
function PlacingShape({ kind, points, px }: { kind: AnnotationKind; points: Pt[]; px: (p: Pt) => Pt }) {
  const pts = points.map(px);
  return (
    <g stroke='currentColor' strokeWidth={1.5} fill='none' opacity={0.7}>
      {pts.map((p, i) => (
        <circle key={i} cx={p.x} cy={p.y} r={3} fill='currentColor' />
      ))}
      {pts.length > 1 && (
        <polyline
          points={pts.map((p) => `${p.x},${p.y}`).join(' ')}
          strokeDasharray={kind === 'multi' ? '3 3' : undefined}
        />
      )}
    </g>
  );
}

function AnnotationEditor({
  a,
  number,
  onText,
  onColor,
  onRemove,
  onClose,
}: {
  a: AnnotationForm;
  number: number;
  onText: (v: string) => void;
  onColor: (v: AnnotationColor) => void;
  onRemove: () => void;
  onClose: () => void;
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
      <ChipRow>
        <Text size='micro' variant='label' component='span' className='uppercase'>
          цвет:
        </Text>
        {ANNOTATION_COLORS.map((c) => (
          <Chip
            key={c || 'ink'}
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
        <Chip dashed onClick={onRemove} title='удалить выноску'>
          удалить
        </Chip>
        <Chip dashed onClick={onClose} title='закрыть правку'>
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
}: {
  annotations: AnnotationForm[];
  onHover?: (i: number | null) => void;
}) {
  const pins = annotations
    .map((a, i) => ({ a, i }))
    .filter(({ a }) => a.kind === 'pin' && (a.text ?? '').trim());
  if (pins.length === 0) return null;
  return (
    <div className='flex flex-col gap-0.5'>
      {pins.map(({ a, i }) => (
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
        </div>
      ))}
    </div>
  );
}
