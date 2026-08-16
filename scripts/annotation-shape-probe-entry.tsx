// Точка входа пробы фигур: рендерит `CalloutShape` и общие определения в статическую разметку.
//
// Лежит В РЕПОЗИТОРИИ, а не во временном файле: esbuild разрешает `react-dom/server` и
// `react/jsx-runtime` относительно расположения ФАЙЛА, и энтри во временной папке их не находит.
import { renderToStaticMarkup } from 'react-dom/server';
import { AnnotationDefs, CalloutShape } from '../src/ui/components/annotation/shapes';

export function render(props: Parameters<typeof CalloutShape>[0]): string {
  return renderToStaticMarkup(<svg>{CalloutShape(props)}</svg>);
}

/** Определения стрелок и штриховок — цветной наконечник живёт именно здесь. */
export function renderDefs(): string {
  return renderToStaticMarkup(
    <svg>
      <defs>
        <AnnotationDefs />
      </defs>
    </svg>,
  );
}
