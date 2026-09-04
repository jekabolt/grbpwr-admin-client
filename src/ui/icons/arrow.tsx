import { SVGProps } from 'react';

export function Arrow(props: SVGProps<SVGSVGElement>) {
  return (
    <svg
      width='16'
      height='16'
      viewBox='0 0 16 16'
      fill='none'
      xmlns='http://www.w3.org/2000/svg'
      {...props}
    >
      {/* ⚠ `currentColor`, А НЕ `black`. Презентационный атрибут на самом `<path>` бьёт всё, что
          пришло цветом снаружи: пропы разворачиваются на `<svg>`, и любой `text-*` класс хозяина
          до линии не доезжал. Замерено: при заданном `color: rgb(102,102,102)` линия рисовалась
          `rgb(0,0,0)`, и наведение не меняло ничего. Из-за этого молчали ОБА механизма сразу —
          и `stroke='currentColor'` у вызывающего, и `text-labelColor group-hover:text-textColor`;
          в `FieldsGroup` тем же способом никогда не применялся `text-textInactiveColor` у
          выключенной группы. Хозяин по-прежнему может переопределить: `{...props}` идёт после. */}
      <path
        d='M12 10L8 6L4 10'
        stroke='currentColor'
        strokeWidth='1.33333'
        strokeLinecap='round'
        strokeLinejoin='round'
      />
    </svg>
  );
}
