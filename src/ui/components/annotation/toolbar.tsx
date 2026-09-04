import { Chip, ChipRow } from 'ui/components/chip';
import Text from 'ui/components/text';

import { kindDef, PALETTE_KINDS, placingHint } from './kinds';

export { placingHint };

// ПАНЕЛЬ ИНСТРУМЕНТОВ — ТОЛЬКО ВИДЫ, шесть чипов в одну строку.
//
// БЫЛО ВОСЕМЬ, И ДВА ИЗ НИХ НАЗЫВАЛИ ОДНО И ТО ЖЕ. `pin` и `label` — один жест «щёлкни и напиши»,
// различавшийся лишь тем, где потом читается текст; `multileader` — та же записка, которой нужно
// больше одной стрелки. Выбор между близнецами по чипу неразрешим: чип не показывает разницы,
// которой различаются виды. Оба ушли из палитры (в реестре и на проводе они живы), и палитра стала
// списком РАЗНЫХ фигур: записка, мерка, скоба, дуга, зона, след.
//
// Цвет, пунктир и штриховка сюда НЕ попадают, хотя напрашиваются. Это свойства ПОСТАВЛЕННОГО
// указания, а не режима руки: постановка и так заканчивается открытым редактором (третий такт
// жеста «клик-клик-ввод»), и стилевой ряд уже на экране. Шесть цветов, пунктир и заливка рядом с
// шестью видами дали бы пятнадцать контролов — это уже поиск, а не инструмент.
//
// Единственный сценарий, где стиль в панели был бы нужен, — серия штрихов одним цветом; он закрыт
// ПАМЯТЬЮ ПЕРА: новое указание наследует стиль последнего поставленного (см. surface.tsx).
//
// ПАНЕЛЬ ОДНА НА ПОЛОСУ/ЛИСТ, а не на кадр: шесть чипов под каждым из десяти снимков съели бы
// полосу целиком. Точки при этом набираются на СВОЁМ кадре — общий счётчик достраивал бы мерку,
// начатую на первом снимке, вторым кликом по третьему.

export function AnnotationToolbar({
  tool,
  onTool,
  /** Виды, доступные на этой поверхности. Не задано — вся палитра. */
  kinds,
  /** Сколько указаний ещё влезет; 0 — панель уступает место объяснению. */
  remaining,
  /** Подсказка постановки: что делать следующим кликом. Приходит от активного кадра. */
  hint,
  className,
}: {
  tool: string | null;
  onTool: (kind: string | null) => void;
  kinds?: string[];
  remaining?: number;
  hint?: string;
  className?: string;
}) {
  const palette = kinds ? kinds.map(kindDef) : PALETTE_KINDS;
  if (remaining != null && remaining <= 0) {
    return (
      <Text size='micro' variant='label' component='span' className={className}>
        the limit of callouts on this frame is reached — any more and they can't be read
      </Text>
    );
  }
  return (
    <ChipRow className={className}>
      {palette.map((d) => (
        <Chip
          key={d.key}
          nonForm
          dashed={tool !== d.key}
          selected={tool === d.key}
          pressed={tool === d.key}
          onClick={() => onTool(tool === d.key ? null : d.key)}
          title={d.hint}
        >
          {d.label}
        </Chip>
      ))}
      {tool && (
        <>
          {hint && (
            <Text size='micro' variant='label' component='span'>
              {hint}
            </Text>
          )}
          <Chip nonForm dashed onClick={() => onTool(null)} title='leave the placing mode'>
            cancel
          </Chip>
        </>
      )}
    </ChipRow>
  );
}
