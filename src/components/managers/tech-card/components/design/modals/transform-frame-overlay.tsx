import {
  CORNER_HANDLES,
  HANDLE_UV,
  handlePoint,
  type FrameHit,
  type Quad,
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
}) {
  const k = zoom || 1;
  const outline = quad.map((p) => `${p[0].toFixed(2)},${p[1].toFixed(2)}`).join(' L');
  const d = `M${outline} Z`;

  return (
    <svg
      viewBox={`0 0 ${plateW} ${plateH.toFixed(2)}`}
      preserveAspectRatio='none'
      className='pointer-events-none absolute inset-0 h-full w-full'
      data-transform-frame={owner}
      data-frame-axis={axis ? '1' : '0'}
    >
      {/* Контур: белая подложка, чернильная линия поверх. У кропа линия сплошная (это край листа),
          у трансформа — тоже сплошная: пунктир здесь занят выделением, и два пунктира на одном
          экране означали бы две одинаковые вещи. */}
      <path d={d} fill='none' stroke='#fff' strokeWidth={3 / k} />
      <path d={d} fill='none' stroke='currentColor' strokeWidth={1.25 / k} data-frame-outline='' />

      {/* КРОП ЗАТЕМНЯЕТ ОТБРАСЫВАЕМОЕ. Показать, что именно уйдёт, можно только показав это: у
          человека нет другого способа увидеть границу будущего листа на плите того же цвета.
          Правило чётности заливки вырезает рамку из закрывающего прямоугольника — так же, как это
          делает всякий кроп-инструмент. */}
      {axis && (
        <path
          d={`M0,0 L${plateW},0 L${plateW},${plateH.toFixed(2)} L0,${plateH.toFixed(2)} Z ${d}`}
          fillRule='evenodd'
          fill='currentColor'
          opacity={0.16}
          data-frame-shade=''
        />
      )}

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

      {HANDLE_UV.map((_, h) => {
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
