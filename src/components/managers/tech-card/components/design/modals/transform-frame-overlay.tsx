import {
  CORNER_HANDLES,
  HANDLE_UV,
  handlePoint,
  warpIsoline,
  warpNodePoints,
  type FrameHit,
  type Quad,
  type WarpGrid,
} from './transform-frame';

/**
 * РАМКА НА ЭКРАНЕ — И БОЛЬШЕ НИЧЕГО.
 *
 * Ни одного жеста здесь нет НАРОЧНО: указатель ведёт сама сцена (`onStagePointerDown` в
 * `vector-modal.tsx`), потому что рамка обязана перехватывать руку РАНЬШЕ инструментов, а
 * `pointer-events` на восьми маленьких квадратах поверх холста дали бы ей ровно обратный
 * приоритет — сначала промах мимо ручки, потом мазок кистью в то же место. По той же причине весь
 * слой помечен `pointer-events: none`, как и все прочие накладки редактора.
 *
 * ── ПОЧЕМУ ДВОЙНОЙ ШТРИХ, А НЕ ОДИН ЦВЕТ ───────────────────────────────────────────────────
 *
 * Рамка ложится и на белую бумагу, и на тёмную фотографию — одноцветный контур на одном из двух
 * исчезает. Белая подложка плюс тонкая чернильная линия поверх видна на обоих; ровно тем же
 * приёмом нарисована муравьиная дорожка лассо в этом же редакторе, и заводить рамке СВОЙ язык
 * было бы вторым словарём на одном экране.
 *
 * Размеры делятся на зум: ручка обязана оставаться одного размера под пальцем на любом
 * приближении — иначе на 800 % она закрывает то, что двигают (тот же довод, что у узлов кривой).
 */

export type FrameOwner = 'backdrop' | 'paste' | 'crop';

export function TransformFrameOverlay({
  quad,
  owner,
  axis,
  zoom,
  hover,
  plateW,
  plateH,
  cropFill,
  grid,
}: {
  quad: Quad;
  owner: FrameOwner;
  /** Кроп не крутится и не гнётся: у листа нет ни угла, ни перспективы. */
  axis: boolean;
  zoom: number;
  /** Что сейчас под указателем — от этого зависит подсветка ручки и значок поворота. */
  hover: FrameHit;
  plateW: number;
  plateH: number;
  /**
   * ЖИВАЯ СЕТКА WARP (H-4). Есть — рамка показывает ШЕСТНАДЦАТЬ УЗЛОВ вместо восьми ручек и
   * рисует саму поверхность; нет — прежние восемь ручек. Двух наборов органов разом не бывает
   * нарочно: рука, у которой на одном экране и «тяни угол», и «гни сетку», каждый раз гадает,
   * что сейчас случится.
   */
  grid?: WarpGrid;
  /**
   * ЧЕМ БУДЕТ ЗАЛИТО НОВОЕ ПОЛЕ. Тот же `cropFill`, что уедет в `expandRasterLayer`: кольцо
   * роста рисуется ИМ, а не выдуманным «цветом подсветки», — то есть показывает буквально то,
   * что появится. `null` (прозрачное поле) не рисуется ничем: белый прямоугольник на месте
   * будущей дырки соврал бы. Только у кропа.
   */
  cropFill?: string | null;
}) {
  const k = zoom || 1;
  const outline = quad.map((p) => `${p[0].toFixed(2)},${p[1].toFixed(2)}`).join(' L');
  const d = `M${outline} Z`;

  /* ── ДЕЛЬТА КАДРА: ЧТО ПРИБУДЕТ И ЧТО УЙДЁТ ───────────────────────────────────────────────
   *
   * Оба квада осе-выровнены (`axis`), значит разность двух прямоугольников считается
   * прямоугольниками — без масок, без `clipPath` и без правила чётности, которое и завело этот
   * орган в дефект H-14: `evenodd(плата, кадр)` при кадре БОЛЬШЕ платы гасил себя внутри платы
   * и красил кольцо снаружи, а снаружи всё резал UA-клип svg. Ноль видимых пикселей на честном
   * жесте — владелец назвал это «кроп для расширения не работает вообще».
   */
  const frame = axis ? rectOf(quad) : null;
  const plate = { x0: 0, y0: 0, x1: plateW, y1: plateH };
  /** Прибудет: кадр минус плата. Заливается ЦВЕТОМ ПОЛЯ — это и есть будущая бумага. */
  const growth = frame ? cutOut(frame, plate) : [];
  /** Уйдёт: плата минус кадр. Прежний чернильный полутон, теперь прямоугольниками. */
  const discard = frame ? cutOut(plate, frame) : [];
  /** Есть ли вообще рост — от этого зависит, надо ли рисовать кромку НЫНЕШНЕГО листа. */
  const grows = growth.length > 0;

  /* ── СЕТКА WARP: ПОВЕРХНОСТЬ И ЕЁ УЗЛЫ ────────────────────────────────────────────────────
   *
   * Линии — ОБРАЗЫ ИЗОЛИНИЙ домена, семплированные ТЕМ ЖЕ `warpMapper`, который положит картинку
   * при коммите: разойтись превью и результату нечем. Крайние четыре — граница патча, и рисуются
   * весом контура рамки; внутренние четыре — его структура, и рисуются весом линий третей.
   * Двойной штрих (белая подложка + чернильная нить) — тот же приём, что у контура и у муравьиной
   * дорожки: одноцветная линия исчезает либо на белой бумаге, либо на тёмной фотографии, а
   * шаблон бывает и тем, и другим.
   */
  const meshEdges = grid ? [0, 1].map((i) => warpIsoline({ quad, grid }, 'u', i)) : [];
  const meshEdgesV = grid ? [0, 1].map((i) => warpIsoline({ quad, grid }, 'v', i)) : [];
  const meshInner = grid
    ? [1 / 3, 2 / 3].flatMap((t) => [
        warpIsoline({ quad, grid }, 'u', t),
        warpIsoline({ quad, grid }, 'v', t),
      ])
    : [];
  const nodes = grid ? warpNodePoints(quad, grid) : [];

  return (
    <svg
      viewBox={`0 0 ${plateW} ${plateH.toFixed(2)}`}
      preserveAspectRatio='none'
      /* ⚠ `overflow-visible` — ЭТО ФИКС H-3, И ОН ЖЕ ПОЛОВИНА H-14. Бокс этого svg — РОВНО
         плата, а UA-умолчание для svg — `overflow: hidden`. Всё, что рамка рисует за
         [0..plateW]×[0..plateH] — контур, ручки, зона поворота, кольца дельты, — срезалось по
         краю платы, ПРИ ТОМ ЧТО сам шаблон (`img`, `max-w-none`) за платой видно: `worldRef`
         overflow не ставит. Владелец: «направляюшие не показываются если они вне холста».
         Ручка, до которой нельзя дотянуться глазом, — шаблон, который нельзя поставить.
         Клип ВЬЮПОРТА (`overflow-hidden` на нём) остаётся: он и должен резать по краю ЭКРАНА.
         Юниты рисуются 1:1 в пиксели мира, поэтому вынос за viewBox геометрически честен. */
      className='pointer-events-none absolute inset-0 h-full w-full overflow-visible'
      data-transform-frame={owner}
      data-frame-axis={axis ? '1' : '0'}
    >
      {/* ЧТО ПРИБУДЕТ — НАРИСОВАНО ТЕМ, ЧЕМ ПРИБУДЕТ. Не «подсветка роста», а сама будущая
          бумага: на сером грунте вьюпорта (#f2f2f2) белое поле читается как новый лист ровно по
          тому же правилу, на котором стоит весь админ, — белое это МАТЕРИАЛ, серое это земля. */}
      {cropFill != null &&
        growth.map((r, i) => (
          <rect
            key={`grow${i}`}
            x={r.x0}
            y={r.y0}
            width={r.x1 - r.x0}
            height={r.y1 - r.y0}
            fill={cropFill}
            data-frame-growth={i}
          />
        ))}

      {/* ЧТО УЙДЁТ. Прежний полутон, прежнее число: 0.16 чернил — это «здесь ещё бумага, но её
          не будет». Отличается от роста НЕ цветом, а тем, что рост лежит СНАРУЖИ кадра, а отрез
          ВНУТРИ платы; правило одно на оба направления жеста. */}
      {discard.map((r, i) => (
        <rect
          key={`cut${i}`}
          x={r.x0}
          y={r.y0}
          width={r.x1 - r.x0}
          height={r.y1 - r.y0}
          fill='currentColor'
          opacity={0.16}
          data-frame-shade={i}
        />
      ))}

      {/* КРОМКА НЫНЕШНЕГО ЛИСТА — только когда лист растёт. Без неё «белое поле по белой бумаге»
          неотличимо от самой бумаги, и человек не видит, ГДЕ кончалось то, что у него было.
          Вес и прозрачность взяты у линий третей, а не выдуманы: второго словаря тонких
          вспомогательных линий на этом экране заводить нельзя. */}
      {grows && (
        <rect
          x={0}
          y={0}
          width={plateW}
          height={plateH}
          fill='none'
          stroke='currentColor'
          strokeWidth={0.75 / k}
          opacity={0.4}
          data-frame-sheet-edge=''
        />
      )}

      {/* Контур: белая подложка, чернильная линия поверх. У кропа линия сплошная (это край листа),
          у трансформа — тоже сплошная: пунктир здесь занят выделением, и два пунктира на одном
          экране означали бы две одинаковые вещи.

          В РЕЖИМЕ WARP КВАД ОТСТУПАЕТ НА ВТОРОЙ ПЛАН и рисуется весом вспомогательной линии — той
          же, что трети и кромка листа. Он там не объект, а СПРАВКА: показывает, что именно увезёт
          «move / scale it», пока рука гнёт поверхность. Объектом становится граница патча ниже.
          Атрибут `data-frame-outline` при этом остаётся НА КВАДЕ в обоих режимах: квад и есть
          истина рамки, и проба, спрашивающая «где рамка», обязана получать один и тот же ответ. */}
      {grid ? (
        <path
          d={d}
          fill='none'
          stroke='currentColor'
          strokeWidth={0.75 / k}
          opacity={0.4}
          data-frame-outline=''
        />
      ) : (
        <>
          <path d={d} fill='none' stroke='#fff' strokeWidth={3 / k} />
          <path
            d={d}
            fill='none'
            stroke='currentColor'
            strokeWidth={1.25 / k}
            data-frame-outline=''
          />
        </>
      )}

      {/* ГРАНИЦА ПАТЧА — то, где картинка кончается на самом деле. Вес контура рамки, потому что
          в этом режиме объект — она. */}
      {[...meshEdges, ...meshEdgesV].map((line, i) => (
        <polyline
          key={`warp-edge-${i}`}
          points={ptsAttr(line)}
          fill='none'
          stroke='#fff'
          strokeWidth={3 / k}
          data-warp-edge-under={i}
        />
      ))}
      {[...meshEdges, ...meshEdgesV].map((line, i) => (
        <polyline
          key={`warp-edge-ink-${i}`}
          points={ptsAttr(line)}
          fill='none'
          stroke='currentColor'
          strokeWidth={1.25 / k}
          data-warp-edge={i}
        />
      ))}

      {/* ВНУТРЕННИЕ ИЗОЛИНИИ — структура поверхности, вес вспомогательной линии. Белая подложка
          у них тоньше: на тёмной фотографии тонкая чернильная нить без неё пропадает целиком. */}
      {meshInner.map((line, i) => (
        <polyline
          key={`warp-inner-under-${i}`}
          points={ptsAttr(line)}
          fill='none'
          stroke='#fff'
          strokeWidth={2 / k}
          opacity={0.7}
        />
      ))}
      {meshInner.map((line, i) => (
        <polyline
          key={`warp-inner-${i}`}
          points={ptsAttr(line)}
          fill='none'
          stroke='currentColor'
          strokeWidth={0.75 / k}
          opacity={0.6}
          data-warp-line={i}
        />
      ))}

      {/* Трети — линии кадрирования. Только у кропа: на шаблоне и вставке они спорили бы с самим
          содержимым, которое человек как раз и разглядывает. */}
      {axis &&
        [1 / 3, 2 / 3].flatMap((t) => {
          const top = lerp(quad[0], quad[1], t);
          const bot = lerp(quad[3], quad[2], t);
          const left = lerp(quad[0], quad[3], t);
          const right = lerp(quad[1], quad[2], t);
          return [
            <line
              key={`v${t}`}
              x1={top[0]}
              y1={top[1]}
              x2={bot[0]}
              y2={bot[1]}
              stroke='currentColor'
              strokeWidth={0.75 / k}
              opacity={0.4}
            />,
            <line
              key={`h${t}`}
              x1={left[0]}
              y1={left[1]}
              x2={right[0]}
              y2={right[1]}
              stroke='currentColor'
              strokeWidth={0.75 / k}
              opacity={0.4}
            />,
          ];
        })}

      {/* ВОСЕМЬ РУЧЕК — ТОЛЬКО ВНЕ WARP. Масштаба, поворота и перспективы в режиме сетки нет
          нарочно: два набора органов на одном экране означали бы, что рука каждый раз гадает,
          что случится от нажатия. Вернуться к ним — тем же чипом рейки, отжатым. */}
      {!grid &&
        HANDLE_UV.map((_, h) => {
          const at = handlePoint(quad, h);
          const corner = CORNER_HANDLES.includes(h);
          const on = hover?.kind === 'handle' && hover.handle === h;
          // Угол крупнее середины стороны: он делает три работы (масштаб, поворот, перспектива),
          // и целиться в него приходится точнее.
          const r = ((corner ? 5 : 4) / k) * (on ? 1.35 : 1);
          return (
            <rect
              key={h}
              x={at[0] - r}
              y={at[1] - r}
              width={r * 2}
              height={r * 2}
              fill={on ? 'currentColor' : '#fff'}
              stroke='currentColor'
              strokeWidth={1.25 / k}
              data-frame-handle={h}
            />
          );
        })}

      {/* ШЕСТНАДЦАТЬ УЗЛОВ. Та же идиома, что у ручек: белый квадрат с чернильной обводкой,
          размер делится на зум, наведённый растёт и заливается чернилами. Один размер на все —
          в этом режиме каждый узел делает ровно одну работу, и выделять углы было бы враньём про
          иерархию. Внутренний узел — КОНТРОЛЬНАЯ точка кубика: он тянет поверхность к себе, и на
          сильном изгибе линия проходит рядом с ним, а не сквозь него, — ровно как рукоятка
          кривой у пера в этом же редакторе. */}
      {nodes.map((at, i) => {
        const on = hover?.kind === 'node' && hover.handle === i;
        const r = (4 / k) * (on ? 1.35 : 1);
        return (
          <rect
            key={`warp-node-${i}`}
            x={at[0] - r}
            y={at[1] - r}
            width={r * 2}
            height={r * 2}
            fill={on ? 'currentColor' : '#fff'}
            stroke='currentColor'
            strokeWidth={1.25 / k}
            data-warp-node={i}
          />
        );
      })}

      {/* ЗНАЧОК ПОВОРОТА ВМЕСТО КУРСОРА. Стандартного курсора вращения в браузере нет вовсе, а
          выдуманный битмап был бы изобретением привычного органа заново (что этому админу
          запрещено). Дуга со стрелкой появляется ровно там, где рука уже стоит, и говорит, что
          случится, ДО нажатия. */}
      {hover?.kind === 'rotate' && (
        <g data-frame-rotate={hover.handle} pointerEvents='none'>
          {(() => {
            const at = handlePoint(quad, hover.handle);
            const rr = 11 / k;
            const arc = `M ${at[0] - rr} ${at[1]} A ${rr} ${rr} 0 0 1 ${at[0]} ${at[1] - rr}`;
            return (
              <>
                <path d={arc} fill='none' stroke='#fff' strokeWidth={3.5 / k} />
                <path d={arc} fill='none' stroke='currentColor' strokeWidth={1.5 / k} />
                <path
                  d={`M ${at[0] - rr - 2.4 / k} ${at[1] - 3.2 / k} L ${at[0] - rr} ${at[1] + 1 / k} L ${at[0] - rr + 2.4 / k} ${at[1] - 3.2 / k}`}
                  fill='none'
                  stroke='currentColor'
                  strokeWidth={1.5 / k}
                />
              </>
            );
          })()}
        </g>
      )}
    </svg>
  );
}

const lerp = (a: readonly [number, number], b: readonly [number, number], t: number): [number, number] => [
  a[0] + (b[0] - a[0]) * t,
  a[1] + (b[1] - a[1]) * t,
];

/** Ломаная в атрибут `points`. Два знака после запятой: юнит платы — это пиксель мира. */
const ptsAttr = (line: readonly (readonly [number, number])[]): string =>
  line.map((p) => `${p[0].toFixed(2)},${p[1].toFixed(2)}`).join(' ');

type Box = { x0: number; y0: number; x1: number; y1: number };

/** Габарит осе-выровненного квада. У кропа он и есть сам квад — но читать углы честнее. */
function rectOf(q: Quad): Box {
  const xs = q.map((p) => p[0]);
  const ys = q.map((p) => p[1]);
  return { x0: Math.min(...xs), y0: Math.min(...ys), x1: Math.max(...xs), y1: Math.max(...ys) };
}

/**
 * `a` МИНУС `b` — до четырёх непересекающихся прямоугольников.
 *
 * Пустое пересечение возвращает `a` целиком, и это не крайний случай ради полноты: кадр, уведённый
 * рукой ЦЕЛИКОМ за плату, — законное состояние жеста, и «уходит всё» надо уметь нарисовать. Полосы
 * режутся сверху/снизу во всю ширину, слева/справа — только по высоте пересечения: иначе углы
 * попали бы в два прямоугольника разом, и полупрозрачный отрез стал бы в них вдвое темнее.
 */
function cutOut(a: Box, b: Box): Box[] {
  const ix0 = Math.max(a.x0, b.x0);
  const iy0 = Math.max(a.y0, b.y0);
  const ix1 = Math.min(a.x1, b.x1);
  const iy1 = Math.min(a.y1, b.y1);
  if (ix1 <= ix0 || iy1 <= iy0) return a.x1 > a.x0 && a.y1 > a.y0 ? [a] : [];
  const out: Box[] = [];
  if (iy0 > a.y0) out.push({ x0: a.x0, y0: a.y0, x1: a.x1, y1: iy0 });
  if (iy1 < a.y1) out.push({ x0: a.x0, y0: iy1, x1: a.x1, y1: a.y1 });
  if (ix0 > a.x0) out.push({ x0: a.x0, y0: iy0, x1: ix0, y1: iy1 });
  if (ix1 < a.x1) out.push({ x0: ix1, y0: iy0, x1: a.x1, y1: iy1 });
  return out;
}
