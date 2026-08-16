// Точка входа пробы фигур: рендерит `CalloutShape` в статическую разметку.
//
// Лежит В РЕПОЗИТОРИИ, а не во временном файле: esbuild разрешает `react-dom/server` и
// `react/jsx-runtime` относительно расположения ФАЙЛА, и энтри во временной папке их не находит.
import { renderToStaticMarkup } from 'react-dom/server';
import { CalloutShape } from '../src/ui/components/annotation-shapes';

export function render(props: Parameters<typeof CalloutShape>[0]): string {
  return renderToStaticMarkup(<svg>{CalloutShape(props)}</svg>);
}
