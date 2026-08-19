// ШТРИХОВКА ТКАНИ — SVG-разметка знака, один порт на всех, кто рисует деталь.
//
// Почему штриховка, а не тон: тех-паки ПЕЧАТАЮТ, и под 1-битным порогом девять серых тонов из
// десяти схлопываются в белый — замерено. Штриховка даёт два перцептивных канала сразу (светлота и
// ориентация), и оба переживают мono-лазер. Язык знака: `/` — лицевая ткань · `\` — изнаночная ·
// `×` — склейка (клеевая, утеплитель); рваная линия — открытое полотно (сетка, прочее); точки —
// «назначение не поставлено». Знак живёт ВНУТРИ замкнутого контура детали и никогда на боксе
// плитки: закрашенный бокс говорил бы про плитку, а не про то, из чего деталь кроят.
//
// Почему геометрия считается в CSS-пикселях, а не в user units: viewBox силуэта — это bbox детали
// из DXF, в сантиметрах, и у спинки (70 см) с бочком (12 см) он различается на порядок. Один
// глобальный статический `<pattern>` тут непригоден в принципе: тот же def отрисует шаг 12 единиц
// как 1/6 спинки и как всю ширину бочка. Отсюда `u` — «сколько user units в одном CSS-пикселе» —
// пересчитывается вызывающим на КАЖДЫЙ инстанс, а числа @1× живут в CLOTH_GEOMETRY (piece-cloth.ts)
// и здесь только умножаются. Второй словарь геометрии в этом файле развёл бы плитку с легендой.
//
// Поворот стоит ДВАЖДЫ и это не дублирование: класс (`hx45`/`hx135`/`hx0`, global.css) несёт ещё и
// кламп плотности `scale(var(--hk, 1))`, а CSS `transform` на `<pattern>` перебивает атрибут
// `patternTransform`. Атрибут остаётся фолбэком для движков, где CSS-трансформ на паттерне не
// поддержан: там теряется только кламп, а сам знак читается.
import type { ReactNode } from 'react';
import { useId } from 'react';
import { CLOTH_GEOMETRY, type PieceClothState } from './piece-cloth';

// `url(#id)` разбирается как CSS-значение, а useId в React 19 отдаёт идентификатор в гильеметах
// («R1»). В браузерах такой url() валиден, но тот же id уезжает в печатный комплект и в чужие
// разборщики SVG, где не-ASCII в неквотированном url-токене — лотерея. Сводим к [A-Za-z0-9]:
// гильеметы стоят снаружи и постоянны, так что уникальность инстансов не страдает.
export const hatchId = (prefix: string, raw: string) =>
  `${prefix}-${raw.replace(/[^a-zA-Z0-9]/g, '')}`;

/** Класс поворота: он же носитель клампа `--hk`, поэтому выводится из угла, а не из вида знака. */
function hatchClass(rot: number): string {
  return rot === 0 ? 'hx0' : rot > 0 ? 'hx45' : 'hx135';
}

/**
 * SVG-разметка паттерна одной роли под конкретный `u` (user units на CSS-пиксель).
 *
 * `flat` (то есть `unbound`) — это `null`, а не пустой паттерн: у детали без ткани не должно
 * появиться ни одного лишнего узла, иначе «как раньше» перестаёт быть буквальным.
 *
 * Толщина штриха ВСЕГДА `u` — ровно один CSS-пиксель на экране независимо от габарита детали.
 * Дэшаррей берётся из словаря и обязан делить шаг нацело: не попавший в шаг рисует молча СПЛОШНУЮ
 * линию, и сетка становится неотличима от подкладки (поймано первым же прогоном прототипа).
 */
export function clothPatternDefs(id: string, state: PieceClothState, u: number): ReactNode {
  const g = CLOTH_GEOMETRY[state];
  if (!g || g.kind === 'flat') return null;
  const t = g.tile * u;

  if (g.kind === 'dot') {
    return (
      <pattern id={id} className='hx0' patternUnits='userSpaceOnUse' width={t} height={t}>
        <circle cx={t / 2} cy={t / 2} r={g.r * u} fill='#000' />
      </pattern>
    );
  }

  if (g.kind === 'cross') {
    return (
      <pattern
        id={id}
        className={hatchClass(g.rot)}
        patternUnits='userSpaceOnUse'
        width={t}
        height={t}
        patternTransform={`rotate(${g.rot})`}
      >
        <line x1={0} y1={t / 2} x2={t} y2={t / 2} stroke='#000' strokeWidth={u} />
        <line x1={t / 2} y1={0} x2={t / 2} y2={t} stroke='#000' strokeWidth={u} />
      </pattern>
    );
  }

  return (
    <pattern
      id={id}
      className={hatchClass(g.rot)}
      patternUnits='userSpaceOnUse'
      width={t}
      height={t}
      patternTransform={`rotate(${g.rot})`}
    >
      <line
        x1={0}
        y1={t / 2}
        x2={t}
        y2={t / 2}
        stroke='#000'
        strokeWidth={u}
        strokeDasharray={g.dash ? `${g.dash[0] * u} ${g.dash[1] * u}` : undefined}
      />
    </pattern>
  );
}

/**
 * ОБРАЗЕЦ 10×10 CSS px — тот же паттерн, что несёт плитка, а не нарисованная отдельно иконка.
 *
 * Легенда, у которой знак свой, — это не легенда: расхождение в один градус или в один шаг
 * читается как «другая ткань». Поэтому образец зовёт ту же `clothPatternDefs` и свой `u` считает по
 * тому же правилу: viewBox 0 0 10 10 в боксе 10×10 px даёт ровно 1 user unit на пиксель.
 *
 * Рамки здесь нет намеренно — её рисует вызывающий: у заголовка группы и у ключа шапки она разная.
 */
export function ClothSwatch({ state }: { state: PieceClothState }) {
  // id — на ИНСТАНС: общий id молча подставил бы всем образцам первый попавшийся в DOM def.
  const id = hatchId('sw', useId());
  const defs = clothPatternDefs(id, state, 1);
  return (
    <svg
      xmlns='http://www.w3.org/2000/svg'
      viewBox='0 0 10 10'
      width={10}
      height={10}
      className='block shrink-0'
      aria-hidden='true'
    >
      {defs ? <defs>{defs}</defs> : null}
      {/* Заливка — инлайновым style по той же причине, что и в силуэте: поверхности, на которых
          живёт образец, кроют потомков классами, а класс бьёт presentation-атрибут. */}
      <rect width={10} height={10} style={{ fill: defs ? `url(#${id})` : '#dedede' }} />
    </svg>
  );
}
