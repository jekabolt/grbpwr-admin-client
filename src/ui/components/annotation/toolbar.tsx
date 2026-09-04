import { Chip, ChipRow } from 'ui/components/chip';
import Text from 'ui/components/text';

import { kindDef, PALETTE_KINDS, placingHint, type KindDef } from './kinds';

export { placingHint };

// ПАНЕЛЬ ИНСТРУМЕНТОВ — ТОЛЬКО ВИДЫ, пять чипов в одну строку.
//
// БЫЛО ВОСЕМЬ, И ДВА ИЗ НИХ НАЗЫВАЛИ ОДНО И ТО ЖЕ. `pin` и `label` — один жест «щёлкни и напиши»,
// различавшийся лишь тем, где потом читается текст; `multileader` — та же записка, которой нужно
// больше одной стрелки. Выбор между близнецами по чипу неразрешим: чип не показывает разницы,
// которой различаются виды. Оба ушли из палитры (в реестре и на проводе они живы).
//
// ПОТОМ БЫЛО ШЕСТЬ, И ЕЩЁ ДВА НАЗЫВАЛИ ОДИН ЖЕСТ (круг 18, D-19). «Dimension» и «span» — обе две
// точки, различались только КОНЦАМИ линии: засечки против скобы. То есть чип называл наконечник,
// а наконечник — свойство поставленной фигуры, и место ему в редакторе рядом с цветом. Стало пять
// РАЗНЫХ фигур: записка, линия, кривая, зона, след.
//
// Цвет, пунктир, штриховка и наконечники сюда НЕ попадают, хотя напрашиваются. Это свойства
// ПОСТАВЛЕННОГО указания, а не режима руки: постановка и так заканчивается открытым редактором
// (третий такт жеста «клик-клик-ввод»), и стилевой ряд уже на экране.
//
// Единственный сценарий, где стиль в панели был бы нужен, — серия штрихов одним цветом; он закрыт
// ПАМЯТЬЮ ПЕРА: новое указание наследует стиль последнего поставленного (см. surface.tsx).
//
// ПАНЕЛЬ ОДНА НА ПОЛОСУ/ЛИСТ, а не на кадр: пять чипов под каждым из десяти снимков съели бы
// полосу целиком. Точки при этом набираются на СВОЁМ кадре — общий счётчик достраивал бы мерку,
// начатую на первом снимке, вторым кликом по третьему.

/**
 * ЯВНЫЙ СПИСОК ВИДОВ СВОДИТСЯ К ЧИПАМ ПО ПОЛЮ `tool` РЕЕСТРА. Владелец, перечисливший виды
 * хранения (`['dim', 'bracket', …]`), получает один чип «line», а не два одинаковых: скоба
 * ставится тем же чипом, что мерка, и различается наконечником уже в редакторе.
 */
function toolsOf(kinds: string[]): KindDef[] {
  const seen = new Set<string>();
  const out: KindDef[] = [];
  for (const k of kinds) {
    const d = kindDef(kindDef(k).tool);
    if (seen.has(d.key)) continue;
    seen.add(d.key);
    out.push(d);
  }
  return out;
}

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
  const palette = kinds ? toolsOf(kinds) : PALETTE_KINDS;
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
          // Якорь для проб — ключ инструмента, а не его ярлык: жест обязан переживать переименование
          // чипа, иначе проба ярлыка красила бы и все пробы жеста.
          data-tool={d.key}
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
