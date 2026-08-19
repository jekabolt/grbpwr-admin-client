// Точка входа пробы разметки штриховки: словарь ткани → SVG-разметка `<pattern>`, статическим
// рендером.
//
// Лежит В РЕПОЗИТОРИИ, а не во временном файле: esbuild разрешает `react-dom/server` и
// `react/jsx-runtime` относительно расположения ФАЙЛА, и энтри во временной папке их не находит
// (тот же вывод, что у annotation-shape-probe-entry.tsx).
import { renderToStaticMarkup } from 'react-dom/server';
import {
  ClothSwatch,
  clothPatternDefs,
  hatchId,
} from '../src/components/managers/tech-card/components/cloth-hatch';
import {
  CLOTH_GEOMETRY,
  CLOTH_RAMP,
  type PieceClothState,
} from '../src/components/managers/tech-card/components/piece-cloth';

// Словарь пробе нужен как ОЖИДАНИЕ: числа в нём пинит cloth:pieces, а здесь проверяется, что
// рендерер выписывает в разметку именно их. Второго литерала геометрии тут нет намеренно —
// он превратил бы пробу разметки во вторую копию словаря.
export { CLOTH_GEOMETRY, CLOTH_RAMP, hatchId };

/** Разметка паттерна одной роли под заданный `u`. Пустая строка — рендерер отдал `null`. */
export function renderPattern(state: PieceClothState, u: number): string {
  const defs = clothPatternDefs('probe', state, u);
  return defs === null ? '' : renderToStaticMarkup(<svg>{defs}</svg>);
}

/**
 * `null`, а не пустой `<pattern>`, — отдельный вопрос: пустой паттерн отрендерился бы в пустую
 * строку ровно так же, и «у детали без ткани не появляется ни одного лишнего узла» проверялось бы
 * тогда ничем.
 */
export function patternIsNull(state: PieceClothState, u: number): boolean {
  return clothPatternDefs('probe', state, u) === null;
}

/** Два образца ОДНОЙ роли в одном документе: id обязан быть на инстанс, а не на роль. */
export function renderSwatchPair(state: PieceClothState): string {
  return renderToStaticMarkup(
    <div>
      <ClothSwatch state={state} />
      <ClothSwatch state={state} />
    </div>,
  );
}
