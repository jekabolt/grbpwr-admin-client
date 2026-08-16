// КАК ВЫГЛЯДИТ УКАЗАНИЕ — один файл на все поверхности.
//
// Мерку между двумя точками, скобку над участком, дугу по окату, обведённую зону и след маркера
// рисуют в четырёх местах: на снимке шага, на карточном эскизе, на мудборде и на бумаге тех-пака.
// Вторая копия этих фигур разошлась бы с первой первой же правкой — одна и та же мерка получила бы
// на двух экранах разные засечки, и заметить это было бы нечем.
//
// ФАЙЛ ЧИСТО ОТРИСОВОЧНЫЙ. Он не знает ни формы карточки, ни того, откуда взялись точки: принимает
// ПИКСЕЛИ кадра и отдаёт SVG-группу. Правила видов он читает из реестра рядом (`kinds.ts`).

export {
  arcPath,
  polygonPath,
  inkPath,
  polygonCentroid,
  simplifyPath,
  simplifyToLimit,
  nearestOnPolyline,
  projectOnSegment,
  type ShapePoint,
} from './geometry';
import { arcPath, inkPath, polygonPath } from './geometry';
import type { ShapePoint } from './geometry';
import { kindDef } from './kinds';

export const CALLOUT_COLOR_HEX: Record<string, string> = {
  red: '#d02b2b',
  blue: '#2323ff',
  green: '#0f7a34',
  orange: '#d97a00',
  // Белый — единственный цвет, читаемый на чёрной ткани, а чёрная ткань это половина снимков узла.
  // Он не теряется на светлом фоне, потому что БЕЛЫЙ ДВУХСЛОЕН ПО ОПРЕДЕЛЕНИЮ: под ним всегда
  // лежит чернильная подложка (см. `Stroke`), и на белой бумаге он печатается полой линией с
  // чёрными краями. Это не опция отрисовки, а идентичность цвета.
  white: '#ffffff',
};

export const calloutInk = (color?: string) =>
  (color && CALLOUT_COLOR_HEX[color]) || 'currentColor';

/** Толщина линий и размеры фигур в пикселях кадра — не масштабируются вместе с картинкой. */
const TICK = 7;
const BRACKET_DROP = 10;
/** След маркера тяжелее чертёжных фигур: он и должен читаться фломастером, а не волосяной линией. */
const INK_WIDTH = 2;
/** Пунктир ФИГУРЫ заведомо крупнее пунктира ЛИДЕРА (`2 2`) — иначе их не различить. */
const DASH_SHAPE = '6 4';
const DASH_LEADER = '2 2';

// ── ОБЩИЕ ОПРЕДЕЛЕНИЯ SVG ───────────────────────────────────────────────────────────────────────

/**
 * СТРЕЛКА НА КАЖДЫЙ ЦВЕТ, а не одна на `currentColor`.
 *
 * `currentColor` внутри `<marker>` разрешается в контексте ОПРЕДЕЛЕНИЯ маркера, а не ссылающейся
 * линии: наконечник наследовал цвет от `<defs>`, то есть оставался чернильным, пока сама линия
 * краснела. Один общий маркер выразить «стрелка цвета своей линии» не может в принципе — только
 * определение на цвет.
 */
const ARROW_COLORS = ['', 'red', 'blue', 'green', 'orange', 'white'] as const;

export const arrowMarkerId = (color?: string) =>
  color && CALLOUT_COLOR_HEX[color] ? `ann-arrow-${color}` : 'ann-arrow';

/** Совместимость: id стрелки чернильного цвета. */
export const ARROW_MARKER_ID = 'ann-arrow';

const hatchId = (color?: string) =>
  color && CALLOUT_COLOR_HEX[color] ? `ann-hatch-${color}` : 'ann-hatch';

/**
 * Все общие определения одной группой: холст кладёт её в свой `<defs>` один раз.
 *
 * Определений на цвет по два (стрелка и штриховка) — двенадцать узлов на поверхность. Считать их
 * по факту использованных цветов было бы экономией на спичках ценой пересборки `<defs>` при каждой
 * перекраске, а `<defs>` не рисуется вовсе.
 */
export function AnnotationDefs() {
  return (
    <>
      {ARROW_COLORS.map((c) => {
        const ink = c ? CALLOUT_COLOR_HEX[c] : 'currentColor';
        return (
          <marker
            key={`arrow:${c || 'ink'}`}
            id={arrowMarkerId(c)}
            viewBox='0 0 8 8'
            refX={7}
            refY={4}
            markerWidth={5}
            markerHeight={5}
            orient='auto-start-reverse'
          >
            {/* У белой стрелки чернильный обвод — та же двухслойность, что у белой линии. */}
            <path
              d='M0,1 L7,4 L0,7 z'
              fill={ink}
              stroke={c === 'white' ? 'currentColor' : 'none'}
              strokeWidth={c === 'white' ? 0.75 : 0}
            />
          </marker>
        );
      })}
      {ARROW_COLORS.map((c) => {
        const ink = c ? CALLOUT_COLOR_HEX[c] : 'currentColor';
        return (
          // ШТРИХОВКА БЕЗ ФОНОВОЙ ВУАЛИ: между линиями снимок просвечивает. Полупрозрачная заливка
          // прятала бы ровно то, на что указывают, а на чёрно-белой печати превращалась бы в
          // серый прямоугольник. Косые линии 45° — классическая чертёжная штриховка, различимая
          // и на лазернике.
          <pattern
            key={`hatch:${c || 'ink'}`}
            id={hatchId(c)}
            width={7}
            height={7}
            patternUnits='userSpaceOnUse'
            patternTransform='rotate(45)'
          >
            {c === 'white' && (
              <line x1={0} y1={0} x2={0} y2={7} stroke='currentColor' strokeWidth={2.4} />
            )}
            <line x1={0} y1={0} x2={0} y2={7} stroke={ink} strokeWidth={1.2} />
          </pattern>
        );
      })}
    </>
  );
}

/** Совместимость со старым именем: холсты клали в `<defs>` только стрелку. */
export const ArrowMarkerDef = AnnotationDefs;

// ── ШТРИХ С ГАЛО ────────────────────────────────────────────────────────────────────────────────

type StrokeProps = {
  /** Готовый SVG-путь фигуры в пикселях кадра. */
  d: string;
  color?: string;
  width: number;
  dashed?: boolean;
  /**
   * Белая подложка под линией. Включена на ФОТО-поверхностях (снимок узла, мудборд, примерка): на
   * пёстром снимке чернильная линия тонет, и указание перестаёт быть видно ровно там, где его
   * поставили. На штриховом ЭСКИЗЕ выключена — белая подложка перекрывала бы линии самого чертежа.
   *
   * Белого цвета это не касается: его подложка чернильная и нужна всегда, иначе на светлом участке
   * снимка и на бумаге белая линия исчезает целиком.
   */
  halo?: boolean;
  markerEnd?: string;
  markerStart?: string;
};

function Stroke({ d, color, width, dashed, halo, markerEnd, markerStart }: StrokeProps) {
  const ink = calloutInk(color);
  const dash = dashed ? DASH_SHAPE : undefined;
  const white = color === 'white';
  // Подложка у белого — ЧЕРНИЛЬНАЯ и безусловная; у прочих — белая и только на фото.
  const under = white ? 'currentColor' : '#fff';
  const showUnder = white || halo;
  return (
    <>
      {showUnder && (
        <path
          d={d}
          fill='none'
          stroke={under}
          strokeWidth={width + 2}
          strokeDasharray={dash}
          strokeLinecap='round'
          strokeLinejoin='round'
          opacity={white ? 1 : 0.9}
        />
      )}
      <path
        d={d}
        fill='none'
        stroke={ink}
        strokeWidth={width}
        strokeDasharray={dash}
        strokeLinecap='round'
        strokeLinejoin='round'
        markerEnd={markerEnd}
        markerStart={markerStart}
      />
    </>
  );
}

/** Точка-якорь фигуры: тот же цвет и та же двухслойность, что у линии. */
function Dot({ p, color, r = 2.5 }: { p: ShapePoint; color?: string; r?: number }) {
  const white = color === 'white';
  return (
    <circle
      cx={p.x}
      cy={p.y}
      r={r}
      fill={calloutInk(color)}
      stroke={white ? 'currentColor' : 'none'}
      strokeWidth={white ? 0.75 : 0}
    />
  );
}

/** Лидер — волосяной пунктир от плашки к фигуре. Его начертание КОНВЕНЦИЯ и не настраивается. */
function Leader({ from, to, color }: { from: ShapePoint; to: ShapePoint; color?: string }) {
  return (
    <line
      x1={from.x}
      y1={from.y}
      x2={to.x}
      y2={to.y}
      stroke={calloutInk(color)}
      strokeWidth={1}
      strokeDasharray={DASH_LEADER}
      fill='none'
    />
  );
}

// ── ФИГУРА ──────────────────────────────────────────────────────────────────────────────────────

/**
 * Геометрия одного указания в ПИКСЕЛЯХ кадра.
 *
 * `label` — куда тянуть лидер (плашка на снимке шага, нумерованный маркер на эскизе). Лидер не
 * хранится нигде: он производное, и хранить его значило бы дать ему разойтись с якорем.
 *
 * `pin` здесь НЕ РИСУЕТСЯ фигурой — только точка привязки: сам кружок с номером живёт HTML-слоем
 * выше, иначе цифра тонула бы в контуре снимка.
 */
export function CalloutShape({
  kind,
  pts,
  label,
  color,
  dashed,
  filled,
  halo,
  strokeWidth = 1.5,
}: {
  kind: string;
  pts: ShapePoint[];
  label: ShapePoint;
  color?: string;
  dashed?: boolean;
  filled?: boolean;
  halo?: boolean;
  strokeWidth?: number;
}) {
  if (pts.length === 0) return null;
  const def = kindDef(kind);
  const w = strokeWidth;
  // Пунктир и штриховка рисуются ТОЛЬКО там, где имеют смысл, даже если флаг пришёл с провода
  // поднятым. Сервер приводит их к false сам, но отрисовка не имеет права зависеть от того,
  // прошли ли данные через сегодняшний сервер: архив релиза и клон сезона приходят мимо него.
  const dash = dashed && def.dashable;
  const arrow = `url(#${arrowMarkerId(color)})`;

  switch (def.key) {
    case 'pin':
      return <Dot p={pts[0]} color={color} r={2} />;

    case 'label':
    case 'multi':
      return (
        <g>
          {pts.map((p, i) => (
            <g key={i}>
              <Dot p={p} color={color} r={3} />
              <Stroke
                d={`M${label.x},${label.y} L${p.x},${p.y}`}
                color={color}
                width={w}
                halo={halo}
                markerEnd={arrow}
              />
            </g>
          ))}
        </g>
      );

    case 'dim': {
      const [p, q] = pts;
      if (!q) return null;
      // Засечки перпендикулярны линии — как в чертеже: они и делают линию РАЗМЕРНОЙ, а не просто
      // отрезком между двумя точками.
      const dx = q.x - p.x;
      const dy = q.y - p.y;
      const len = Math.hypot(dx, dy) || 1;
      const nx = (-dy / len) * TICK;
      const ny = (dx / len) * TICK;
      return (
        <g>
          <Stroke d={`M${p.x},${p.y} L${q.x},${q.y}`} color={color} width={w} dashed={dash} halo={halo} />
          <Stroke
            d={`M${p.x - nx},${p.y - ny} L${p.x + nx},${p.y + ny}`}
            color={color}
            width={w}
            halo={halo}
          />
          <Stroke
            d={`M${q.x - nx},${q.y - ny} L${q.x + nx},${q.y + ny}`}
            color={color}
            width={w}
            halo={halo}
          />
          <Leader from={label} to={{ x: (p.x + q.x) / 2, y: (p.y + q.y) / 2 }} color={color} />
        </g>
      );
    }

    case 'bracket': {
      const [p, q] = pts;
      if (!q) return null;
      const dx = q.x - p.x;
      const dy = q.y - p.y;
      const len = Math.hypot(dx, dy) || 1;
      const nx = (-dy / len) * BRACKET_DROP;
      const ny = (dx / len) * BRACKET_DROP;
      return (
        <g>
          <Stroke
            d={`M${p.x},${p.y} L${p.x + nx},${p.y + ny} L${q.x + nx},${q.y + ny} L${q.x},${q.y}`}
            color={color}
            width={w}
            dashed={dash}
            halo={halo}
          />
          <Leader
            from={label}
            to={{ x: (p.x + q.x) / 2 + nx, y: (p.y + q.y) / 2 + ny }}
            color={color}
          />
        </g>
      );
    }

    case 'arc': {
      const [p, mid, q] = pts;
      if (!mid || !q) return null;
      return (
        <g>
          <Stroke d={arcPath(p, mid, q)} color={color} width={w} dashed={dash} halo={halo} />
          {/* Концы отмечены точками: без них «где кривая начинается» читается только по изгибу, а
              на пологой дуге его нет. */}
          <Dot p={p} color={color} />
          <Dot p={q} color={color} />
          <Leader from={label} to={mid} color={color} />
        </g>
      );
    }

    case 'polygon': {
      if (pts.length < 2) return null;
      const d = polygonPath(pts);
      return (
        <g>
          {filled && <path d={d} fill={`url(#${hatchId(color)})`} stroke='none' />}
          <Stroke d={d} color={color} width={w} dashed={dash} halo={halo} />
          <Leader from={label} to={centroidOf(pts)} color={color} />
        </g>
      );
    }

    case 'ink':
      return (
        <Stroke d={inkPath(pts)} color={color} width={INK_WIDTH} dashed={dash} halo={halo} />
      );

    default:
      return null;
  }
}

/** Среднее вершин — для лидера зоны. Полный центроид живёт в geometry и нужен постановке. */
function centroidOf(pts: ShapePoint[]): ShapePoint {
  return {
    x: pts.reduce((s, p) => s + p.x, 0) / pts.length,
    y: pts.reduce((s, p) => s + p.y, 0) / pts.length,
  };
}

// ── НЕЗАВЕРШЁННАЯ ПОСТАНОВКА ────────────────────────────────────────────────────────────────────

/**
 * Что видно, пока фигура ещё ставится. Показывает РЕЗУЛЬТАТ, а не намерение: у дуги это уже
 * настоящая кривая, гнущаяся за курсором, а не три точки, из которых потом что-то получится.
 * Слепая постановка «три клика и посмотрим» — ровно то, из-за чего дугу и переделывали.
 *
 * `cursor` — текущее положение указателя; без него превью не может быть живым.
 * `snapClose` — курсор в радиусе замыкания у первой вершины зоны.
 */
export function PlacingShape({
  kind,
  pts,
  cursor,
  color,
  snapClose,
}: {
  kind: string;
  pts: ShapePoint[];
  cursor?: ShapePoint | null;
  color?: string;
  snapClose?: boolean;
}) {
  const def = kindDef(kind);
  const ink = calloutInk(color);

  // ДУГА ЖИВЬЁМ. Порядок кликов — начало, конец, изгиб; после второго клика кривая уже настоящая
  // и гнётся под курсором, поэтому ставящий видит линию, которую рисует, а не угадывает её.
  if (def.key === 'arc' && pts.length === 2 && cursor) {
    return (
      <g opacity={0.85}>
        <Stroke d={arcPath(pts[0], cursor, pts[1])} color={color} width={1.5} />
        <Dot p={pts[0]} color={color} />
        <Dot p={pts[1]} color={color} />
      </g>
    );
  }

  if (def.key === 'ink') {
    // Сырой след без сглаживания: сглаживание применяется на коммите, и разница при ε=1.5px
    // глазом не ловится, зато рисование остаётся мгновенным на длинном штрихе.
    return pts.length > 1 ? (
      <path
        d={`M${pts.map((p) => `${p.x},${p.y}`).join(' L')}`}
        fill='none'
        stroke={ink}
        strokeWidth={INK_WIDTH}
        strokeLinecap='round'
        strokeLinejoin='round'
      />
    ) : null;
  }

  const rubber = cursor && pts.length > 0 ? [...pts, cursor] : pts;
  return (
    <g stroke={ink} strokeWidth={1.5} fill='none' opacity={0.75}>
      {pts.map((p, i) => (
        <circle key={i} cx={p.x} cy={p.y} r={3} fill={ink} />
      ))}
      {rubber.length > 1 && (
        <polyline
          points={rubber.map((p) => `${p.x},${p.y}`).join(' ')}
          strokeDasharray={def.grammar === 'click' && def.points[1] > 2 ? '3 3' : undefined}
        />
      )}
      {/* ЗАМЫКАНИЕ ВИДНО ДО КЛИКА. Кольцо у первой вершины и прилипшая к ней резиновая линия —
          единственный способ показать «отпустишь здесь — замкнётся» раньше, чем это случилось. */}
      {snapClose && pts.length > 0 && (
        <>
          <circle cx={pts[0].x} cy={pts[0].y} r={6} fill='none' strokeWidth={2} />
          {pts.length > 2 && (
            <polyline
              points={`${pts[pts.length - 1].x},${pts[pts.length - 1].y} ${pts[0].x},${pts[0].y}`}
              strokeDasharray='3 3'
            />
          )}
        </>
      )}
    </g>
  );
}
