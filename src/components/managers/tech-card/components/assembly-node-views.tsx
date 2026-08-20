import { cn } from 'lib/utility';
import type { HTMLAttributes } from 'react';
import { Chip } from 'ui/components/chip';
import Text from 'ui/components/text';

import type { AssemblyBlock } from './assembly-blocks';
import type { AssemblyStep, AssemblyUnit } from './assembly-frontier';
import {
  SCHEMATIC_METRICS,
  type BoxLayout,
  type SchematicLayout,
  type TileLayout,
} from './assembly-layout';
import { pieceRefKey } from './piece-block-refs';
import type { PieceCloth } from './piece-cloth';
import { PieceTile } from './piece-silhouette';
import type { PieceShapeMap } from './use-piece-shapes';

// ПРЕЗЕНТАЦИОННЫЙ РЕНДЕР НОД СХЕМЫ СБОРКИ — боксы узлов, хвост, провода, глифы.
//
// Вынуто из `assembly-schematic.tsx` переносом, без единой правки классов, подписей и разметки:
// фулскрин рисует ТЕ ЖЕ ноды, что инлайн, и второй экземпляр этой разметки разошёлся бы с
// оригиналом молча — тот же сорт дефекта, от которого заведены `piece-silhouette.tsx` и
// `piece-cloth.ts`. Эквивалентность переноса держит проба `scripts/assembly-views-probe.mjs`:
// golden-снимок разметки ПОЛНОГО `AssemblySchematic`, снятый до переноса.
//
// ЧЕГО ЗДЕСЬ НЕТ И НЕ ДОЛЖНО БЫТЬ:
//
//   • МУТАТОРОВ И ФОРМЫ. Ни `useFieldArray`, ни `useFormContext`, ни `setValue`: всё, что пишет в
//     карточку, живёт в `operations-field.tsx` в одном экземпляре (R3), а схема собирает ЖЕСТ и
//     передаёт его наверх. Модуль чистый на запись целиком.
//   • REF-ОВ ЖЕСТА. `justDragged`, `dragRef`, `clickGuard`, автоскролл — общая механика ОДНОГО
//     полотна, и она остаётся в родителе. Заведи вьюшка свой клик-гард — клик-эхо после драга
//     начнёт открывать шаг, и дифф при этом останется «переносом».
//   • `<button>`. Интерактив полотна — `div` с ролью кнопки: схема живёт внутри общего
//     `<fieldset disabled={frozen}>` карточки, а задизейбленность НАСЛЕДУЕТСЯ, и настоящая кнопка
//     под таким предком не получает ни клика, ни фокуса. Ошибка невидима на драфте, где всё и
//     тестируется, и убивает инлайн ровно на выпущенной карточке (R4). Готовые пропы органа
//     (`role`/`tabIndex`/`onClick`/`onKeyDown`) собирает родитель своим `activate()` и отдаёт сюда
//     объектом — вьюшка их только раскладывает.

/**
 * Ноды не отдают палец прокрутке.
 *
 * Объявляется ЗАРАНЕЕ и на самой ноде: браузер выбирает поведение жеста в момент касания, и
 * запрет, выставленный после `pointerdown`, уже ничего не решает — палец уводит страницу в
 * прокрутку, прилетает `pointercancel`, нода возвращается назад. Полотно при этом остаётся
 * прокручиваемым: касание мимо нод ведёт себя как обычно.
 */
export const NODE_TOUCH = 'none' as const;

/**
 * Готовые пропы органа полотна: результат родительских `activate(...)`, `dragHandlers(...)` и
 * `hoverHandlers(...)`. Объектом, а не колбэком-фабрикой: вьюшка не должна знать ни про клик-эхо,
 * ни про то, разрешено ли действие, — она раскладывает то, что ей дали.
 */
export type OrganProps = HTMLAttributes<HTMLDivElement>;

/**
 * ВИД ШАГА ОДНИМ ЗНАКОМ. В строке блока раньше стояли только номер и подпись, и три разных по
 * смыслу шага выглядели одинаково: тот, что рождает узел, тот, что дособирает существующий, и
 * тот, что просто обрабатывает и ничего не собирает. Глиф отвечает на это, не занимая строки.
 */
export const stepGlyph = (steps: AssemblyStep[], i: number): string => {
  const st = steps[i];
  if (!st?.outputUnitKey) return '·';
  return st.inputs.some((inp) => inp.key === st.outputUnitKey) ? '+▣' : '▣';
};

/**
 * Состояние узла СЛОВОМ, а не значком. «✓», «→GARMENT» и «✕» требовали держать в голове
 * словарь из трёх символов; строчкой хватает места сказать это словом.
 */
export const stateWord = (b: AssemblyBlock, terminal: boolean): string =>
  terminal ? '✓ garment' : b.absorbedInto ? `→ ▣ ${b.absorbedInto}` : '✕ break';

/**
 * ЧТО УЗЕЛ БЕРЁТ — его ПРЯМЫЕ входы, а не замыкание по деталям.
 *
 * Разница принципиальна. Замыкание (`block.leaves`) для готового изделия — это ВСЕ детали
 * карточки, и сводка выродилась бы в список из пятнадцати имён ровно на том узле, ради
 * которого схему открывают. Прямые входы отвечают на настоящий вопрос — «из чего собран
 * именно этот узел»: у корпуса это полочка и спинка, у изделия — ▣ SHELL и ▣ HOOD.
 *
 * Собственный ключ отбрасывается: в поглощении `GARMENT + HEM → GARMENT` узел входит сам в
 * себя, и «берёт: ▣ GARMENT» не сообщает ничего.
 */
export function directInputsOf(
  blocks: AssemblyBlock[],
  steps: AssemblyStep[],
): Map<string, string[]> {
  const directInputs = new Map<string, string[]>();
  for (const b of blocks) {
    const seen = new Set<string>();
    const acc: string[] = [];
    for (const i of b.steps) {
      for (const input of steps[i]?.inputs ?? []) {
        if (!input.key || input.key === b.key || seen.has(input.key)) continue;
        seen.add(input.key);
        acc.push(input.key);
      }
    }
    directInputs.set(b.key, acc);
  }
  return directInputs;
}

/**
 * Состав узла КОМПАКТНО: узлы поимённо, детали числом.
 *
 * Имена деталей в подвал не влезают и не нужны — их видно плитками рядом и стрелками к ним.
 * Число же отвечает на вопрос, которого плитки не закрывают: «сколько всего в этот узел
 * вошло», особенно когда часть плиток утащена рукой на другой конец полотна.
 */
export function compositionOf(
  key: string,
  directInputs: Map<string, string[]>,
  units: Map<string, AssemblyUnit>,
): string {
  const inputs = directInputs.get(key) ?? [];
  const named = inputs.filter((k) => units.has(k)).map((k) => `▣ ${k}`);
  const pieces = inputs.filter((k) => !units.has(k)).length;
  const parts = [...named, ...(pieces ? [`${pieces} ${pieces === 1 ? 'piece' : 'pieces'}`] : [])];
  return parts.length ? `← ${parts.join(' + ')}` : '';
}

const boxOfBlock = (layout: SchematicLayout, blockKey: string): BoxLayout | undefined =>
  blockKey === '' ? layout.tail : layout.byKey.get(blockKey);

/**
 * Строка бокса → её y. Нужна проводам: они целятся в строку, а не в бокс.
 *
 * Фабрикой, а не голой функцией: раскладка и блоки меняются вместе, и связывать их в одном месте
 * дешевле, чем таскать оба через каждый вызов.
 */
export function makeRowY(
  blocks: AssemblyBlock[],
  layout: SchematicLayout,
): (blockKey: string, stepIndex: number) => number {
  const { LINE_H, HEAD_H } = SCHEMATIC_METRICS;
  return (blockKey: string, stepIndex: number): number => {
    const box = boxOfBlock(layout, blockKey);
    if (!box) return 0;
    // ХВОСТ СЧИТАЕТСЯ ПО `tailSteps`, А НЕ ПО СВОЕМУ БЛОКУ. Обработка одной детали уехала на
    // её плитку, и в хвосте её строки больше нет; блок про это не знает — атрибуция шагов
    // намеренно осталась прежней. Считай провод по блоку — и он целился бы в строку, сдвинутую
    // на все уехавшие, то есть мимо всех оставшихся.
    const rows = blockKey === '' ? layout.tailSteps : (blocks.find((x) => x.key === blockKey)?.steps ?? []);
    const pos = rows.indexOf(stepIndex);
    if (pos < 0) return box.y + HEAD_H / 2;
    return box.y + HEAD_H + 2 + pos * LINE_H + LINE_H / 2;
  };
}

const wire = (x1: number, y1: number, x2: number, y2: number) => {
  const mid = (x1 + x2) / 2;
  return `M${x1},${y1} C${mid},${y1} ${mid},${y2} ${x2},${y2}`;
};

/**
 * Провод помнит СВОИ КОНЦЫ: без этого «подсветить всё, что входит и выходит из ноды»
 * выродилось бы в разбор строки пути.
 */
export type SchematicWire = {
  d: string;
  key: string;
  from: string;
  to: string;
  faint?: boolean;
};

/**
 * Провода полотна ИЗ ДАННЫХ, а не из позиций: ручная раскладка ставит колонки как угодно, а связи
 * остаются теми же. `rowY` приходит параметром, потому что провод целится в СТРОКУ потребителя, и
 * формула этой строки — свойство раскладки, а не набора связей.
 */
export function buildWires(
  blocks: AssemblyBlock[],
  steps: AssemblyStep[],
  layout: SchematicLayout,
  rowY: (blockKey: string, stepIndex: number) => number,
): SchematicWire[] {
  // Шаг → блок, которому он принадлежит (включая хвостовой с пустым ключом).
  const blockOfStep = new Map<number, string>();
  for (const b of blocks) for (const i of b.steps) blockOfStep.set(i, b.key);

  const wires: SchematicWire[] = [];
  // Узел → строка-потребитель.
  for (const b of blocks) {
    if (b.key === '') continue;
    for (const i of b.steps) {
      for (const input of steps[i]?.inputs ?? []) {
        if (input.kind !== 'unit' || input.key === b.key) continue;
        const from = layout.byKey.get(input.key);
        const to = layout.byKey.get(b.key);
        if (!from || !to) continue;
        wires.push({
          key: `${input.key}->${b.key}:${i}`,
          from: input.key,
          to: b.key,
          d: wire(from.x + from.w, from.y + from.h / 2, to.x, rowY(b.key, i)),
        });
      }
    }
  }
  // ДЕТАЛЬ → СТРОКА-ПОТРЕБИТЕЛЬ, ВСЕГДА, включая её собственный узел.
  //
  // Раньше смежная связь провода не получала: плитка стоит вплотную к своему боксу, и считалось,
  // что соседство само за себя говорит. Не говорит. Соседство показывает, ЧТО деталь относится к
  // узлу, но не показывает, на КАКОМ ШАГЕ она в него вошла, — а это главный вопрос к схеме; и
  // стоит ноду подвинуть рукой, как соседство исчезает, не оставив вместо себя ничего.
  for (const t of layout.tiles) {
    for (const i of t.consumers) {
      const target = blockOfStep.get(i);
      if (target === undefined) continue;
      // ШАГ, УЕХАВШИЙ НА ПЛИТКУ, В ХВОСТЕ БОЛЬШЕ НЕ РИСУЕТСЯ — и провод в него вёл бы в
      // строку, которой там нет: `blocks` про переезд не знает (атрибуция намеренно не
      // тронута), знает только раскладка, и спрашивать надо её.
      if (target === '' && !layout.tailSteps.includes(i)) continue;
      const to = boxOfBlock(layout, target);
      if (!to) continue;
      const eatenHere = t.state === 'eaten' && t.into === target;
      wires.push({
        key: `tile:${t.key}->${target}:${i}`,
        from: t.key,
        to: target,
        // ИЗ СЕРЕДИНЫ ГОЛОВЫ, А НЕ ИЗ СЕРЕДИНЫ ПЛИТКИ: у плитки с обработками высота выросла
        // под её собственные строки, и точка выхода уехала бы к ним — провод целился бы в
        // деталь мимо детали.
        d: wire(t.x + t.w, t.y + SCHEMATIC_METRICS.TILE / 2, to.x, rowY(target, i)),
        // Вошла в узел — полный провод; просто обработана этим шагом — бледный пунктир: связь
        // есть, но деталь осталась на столе, и путать одно с другим нельзя.
        faint: !eatenHere,
      });
    }
  }
  return wires;
}

/**
 * СЛОЙ ПРОВОДОВ — svg на всё полотно: маркер-стрелка в `<defs>` и по пути на связь.
 *
 * `markerId` ПРИХОДИТ ПРОПОМ, а не заводится здесь через `useId`, и это не мелочь. Ссылка
 * `url(#…)` разрешается по ДОКУМЕНТУ, а не по поддереву: как только инлайновая схема и портал
 * фулскрина смонтированы одновременно, фиксированный `assembly-arrow` есть в документе дважды, и
 * WebKit вправе разрешить ссылку в маркер внутри спрятанного (`display:none`) поддерева — стрелки
 * молча исчезают. Инстанс-уникальный id снимает это; отдаётся он снаружи, потому что снимок
 * разметки (`scripts/assembly-views-probe.mjs`) канонизирует ТОЛЬКО токены `useId`, а стабильные
 * идентификаторы оставляет как есть — иначе переименование маркера проходило бы гейт молча.
 */
export function WireLayer({
  wires,
  hovered,
  width,
  height,
  markerId,
}: {
  wires: SchematicWire[];
  /** Ключ ноды под курсором: от него считаются `lit` и `dimmed`. */
  hovered: string | null;
  width: number;
  height: number;
  /** Идентификатор маркера-стрелки. Уникален на инстанс полотна — см. шапку. */
  markerId: string;
}) {
  /** Маркер-стрелка: провод обязан говорить НАПРАВЛЕНИЕ, а не только факт связи. */
  const ARROW = `url(#${markerId})`;
  return (
    <svg width={width} height={height} className='absolute inset-0' aria-hidden>
      <defs>
        <marker
          id={markerId}
          viewBox='0 0 8 8'
          refX={7}
          refY={4}
          markerWidth={5}
          markerHeight={5}
          orient='auto-start-reverse'
        >
          <path d='M0,1 L7,4 L0,7 z' fill='currentColor' />
        </marker>
      </defs>
      {wires.map((w) => {
        // Провод «этой ноды» — тот, у которого она на любом конце: вопрос читателя звучит
        // как «что с ней связано», а не «что из неё выходит».
        const lit = hovered !== null && (w.from === hovered || w.to === hovered);
        // Пока что-то наведено, остальные провода УХОДЯТ НА ЗАДНИЙ ПЛАН, а не остаются как
        // были: подсветить связи, не приглушив прочее, значит не ответить на вопрос — на
        // плотной схеме жирная линия теряется среди двух десятков таких же.
        const dimmed = hovered !== null && !lit;
        return (
          <path
            key={w.key}
            d={w.d}
            fill='none'
            stroke='currentColor'
            strokeWidth={lit ? 2 : 1}
            strokeDasharray={w.faint ? '3 3' : undefined}
            markerEnd={ARROW}
            opacity={lit ? 0.9 : dimmed ? 0.12 : w.faint ? 0.3 : 0.45}
          />
        );
      })}
    </svg>
  );
}

/**
 * БОКС УЗЛА: шапка-паспорт, строки шагов, полоса действий под наведением и постоянный подвал.
 *
 * `block` принимается под именем `b` намеренно: тело — дословный перенос из `AssemblySchematic`, и
 * переименование локали в нём сделало бы дифф переноса нечитаемым ровно там, где его и читают.
 */
export function UnitBoxView({
  box,
  block: b,
  steps,
  units,
  directInputs,
  smvOfBlock,
  labelOf,
  nameOfNode,
  unitClothLine,
  terminal,
  onTable,
  isPicked,
  frozen,
  hovered,
  dragging,
  ringClassName,
  dragProps,
  hoverProps,
  headProps,
  stepProps,
  onAddOperation,
  onDissolveUnit,
}: {
  box: BoxLayout;
  block: AssemblyBlock;
  steps: AssemblyStep[];
  units: Map<string, AssemblyUnit>;
  directInputs: Map<string, string[]>;
  /** Σ SMV блока по ключу. Считает досье, схема только показывает. */
  smvOfBlock: Map<string, string>;
  /** Короткая подпись шага для строки бокса. */
  labelOf: (index: number) => string;
  /** Человеческое имя ноды: имя детали или код узла. */
  nameOfNode: (key: string) => string;
  /** Свёртка ткани узла по его листьям; пусто, если у узла нет ни одной детали. */
  unitClothLine: (key: string) => string;
  /** Единственный живой узел карточки — то есть готовое изделие. */
  terminal: boolean;
  /** Узел лежит на столе (не съеден другим). */
  onTable: boolean;
  isPicked: boolean;
  frozen: boolean;
  hovered: boolean;
  /** Ноду тащат прямо сейчас. */
  dragging: boolean;
  /** Рамка ноды: цель жеста или наведение. Считает родитель — знание про жест живёт там. */
  ringClassName?: string;
  dragProps: OrganProps;
  hoverProps: OrganProps;
  /** Пропы шапки как органа: пусто, когда по ней кликать нечем. */
  headProps: OrganProps;
  stepProps: (index: number) => OrganProps;
  onAddOperation: () => void;
  onDissolveUnit: () => void;
}) {
  const { LINE_H, HEAD_H, FOOT_H } = SCHEMATIC_METRICS;
  return (
    <div>
      <div
        className={cn(
          'absolute border-2 border-textColor bg-bgColor',
          dragging && 'opacity-70',
          ringClassName,
        )}
        style={{ left: box.x, top: box.y, width: box.w, height: box.h, touchAction: NODE_TOUCH }}
        {...dragProps}
        {...hoverProps}
      >
        {/* ШАПКА — PICK-ЗОНА БОКСА. Строки внутри уже кнопки шагов, поэтому выбор узла
            переехал на заголовок: одна нода — одно место, куда по ней кликают. Кнопка, а
            не div, ради клавиатуры: Enter на сфокусированной шапке — тот же выбор, и
            путь «сшить» с клавиатуры не потерян. */}
        <div
          {...headProps}
          className={cn(
            // `overflow-hidden` — последняя преграда: высота шапки посчитана
            // раскладкой, и третья строка текста, откуда бы она ни взялась, легла бы
            // поверх первой строки шага.
            'flex w-full flex-col justify-center overflow-hidden border-b border-hairline px-1 text-left',
            !frozen && onTable && 'hover:bg-bgZebra',
            isPicked && 'bg-bgZebra',
          )}
          style={{ height: HEAD_H }}
          // Полный текст шапки — в подсказке: ключ и имя узла обрезаются по ширине, и
          // прочесть их целиком иначе было бы негде.
          title={`▣ ${box.key}${b.name ? ` · ${b.name}` : ''}${
            terminal ? ' · finished garment' : b.absorbedInto ? ` · goes into ▣ ${b.absorbedInto}` : ' · break'
          }\n${
            onTable
              ? 'the unit is on the table — click to take it into the next assembly'
              : 'the unit has already gone into another one; click to open the step that consumed it'
          }`}
        >
          {/* ПЕРВАЯ СТРОКА — ТОЛЬКО КЛЮЧ. Он идентифицирует узел во всех остальных
              шагах, и делить строку с чем-либо ему нельзя: раньше имя теснило ключ,
              ключ теснил состояние, и двухсловный «ДВА РУКАВА» уезжал поверх шага. */}
          <Text
            size='micro'
            variant='uppercase'
            tracking='label'
            component='span'
            className='block w-full truncate font-bold'
          >
            {isPicked ? '✓ ' : ''}▣ {box.key}
          </Text>
          {/* ВТОРАЯ СТРОКА — ИМЯ И СОСТОЯНИЕ СЛОВОМ. «✓», «→GARMENT» и «✕» требовали
              держать в голове словарь из трёх значков; строкой хватает места сказать
              это словом. Красным — только разрыв: сборка не сошлась, и это ошибка,
              а не оттенок. */}
          <span className='flex w-full items-baseline gap-1 overflow-hidden'>
            {b.name && (
              <Text size='nano' variant='label' component='span' className='min-w-0 shrink truncate'>
                {b.name}
              </Text>
            )}
            <Text
              size='nano'
              variant='label'
              component='span'
              className={cn(
                'ml-auto max-w-[60%] shrink-0 truncate',
                !terminal && !b.absorbedInto && 'text-error',
              )}
            >
              {stateWord(b, terminal)}
            </Text>
          </span>
        </div>
        {/* ДЕЙСТВИЯ УЗЛА ПОКАЗЫВАЮТСЯ ПО НАВЕДЕНИЮ. Постоянно висящие чипы над каждым
            боксом — это два лишних объекта на узел, и на схеме из десяти узлов их
            двадцать: полотно читается как панель кнопок, а не как карта сборки.
            Пропасть между боксом и чипами не возникает: чипы — потомки бокса в DOM, а
            pointerenter/leave считают вложенность, а не нарисованные границы, поэтому
            увести курсор на чип, не потеряв наведение, можно. */}
        {!frozen && hovered && (
          // ПОЗИЦИЯ СЧИТАЕТСЯ ОТ КРАЯ БОКСА, А НЕ ПОДБИРАЕТСЯ ЧИСЛОМ. `-top-4` было
          // магическими шестнадцатью пикселями: чуть выше строка чипа — и она залезала
          // на сам бокс, чуть ниже — отрывалась от него. `bottom-full` ставит нижний
          // край полосы ровно на верхний край бокса при любом кегле.
          //
          // `pb-1` внутри — МОСТИК: без него между чипами и боксом остаётся пустота, и
          // провести через неё курсор, не потеряв наведение, нельзя — чипы исчезали бы
          // ровно на пути к ним.
          //
          // Фон и `z-10` — потому что полоса живёт в зазоре между колонками и рядами, и
          // соседняя нода там же. Прозрачная полоса поверх чужого бокса читается как
          // наезд; непрозрачная и заведомо верхняя — как то, чем она и является:
          // временный слой над схемой.
          <div className='absolute bottom-full left-0 z-10 flex max-w-full items-center gap-1 bg-bgColor pb-1'>
            <Chip dashed onClick={onAddOperation} title='add a processing step on this unit'>
              + operation
            </Chip>
            <Chip
              dashed
              onClick={onDissolveUnit}
              title='the step stops assembling the unit; its inputs return to the table for the next steps'
            >
              dissolve
            </Chip>
          </div>
        )}
        {b.steps.map((i) => (
          <div
            key={i}
            {...stepProps(i)}
            className='flex w-full items-center gap-1 px-1 text-left hover:bg-bgZebra focus-visible:outline focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-textColor'
            style={{ height: LINE_H }}
            title='open the step in the list'
          >
            <Text size='nano' component='span' className='min-w-0 truncate'>
              {(i + 1) * 10} · {labelOf(i)}
            </Text>
            {/* Вид шага одним знаком: ▣ рождает узел, +▣ дособирает его, · только
                обрабатывает. Три разных по смыслу шага выглядели одинаково. */}
            <Text size='nano' variant='label' component='span' className='ml-auto shrink-0'>
              {stepGlyph(steps, i)}
            </Text>
          </div>
        ))}

        {/* ПОДВАЛ — ПОСТОЯННЫЙ, а не по наведению. Состав и трудоёмкость это два
            вопроса, которые задают узлу чаще всего, и прятать ответы за мышь нельзя:
            ноды размечены `touch-action: none`, то есть рассчитаны на палец, а
            наведения на планшете не существует вовсе. Состав компактный — узлы
            поимённо, детали числом: имена деталей сюда не влезут и не нужны, их видно
            плитками и стрелками к ним. */}
        <div
          className='absolute inset-x-0 bottom-0 flex items-baseline gap-1 overflow-hidden border-t border-hairline px-1'
          style={{ height: FOOT_H }}
          // Вторая строка подсказки — ТКАНЬ УЗЛА: состав отвечает «из чего собран», а
          // свёртка — «из чего сшит», и это разные вопросы к одному боксу. Пустой она не
          // приезжает: у узла без единой детали её просто нет.
          title={[
            `takes: ${(directInputs.get(box.key) ?? []).map(nameOfNode).join(' + ') || '—'}`,
            unitClothLine(box.key),
          ]
            .filter(Boolean)
            .join('\n')}
        >
          <Text size='nano' variant='label' component='span' className='min-w-0 truncate'>
            {compositionOf(box.key, directInputs, units)}
          </Text>
          {smvOfBlock.get(box.key) && (
            <Text size='nano' variant='label' component='span' className='ml-auto shrink-0 tabular-nums'>
              Σ {smvOfBlock.get(box.key)}
            </Text>
          )}
        </div>
      </div>
    </div>
  );
}

/**
 * ХВОСТОВОЙ БОКС: шаги, не достигающие ни одного узла. До Ф7 их на полотне не было
 * вовсе — неразмеченная карточка показывала пустоту вместо существующего маршрута.
 * Пунктир и лексикон те же, что у врезки рельса, чтобы две вьюшки называли одно
 * одинаково.
 */
export function TailBoxView({
  tail,
  tailSteps,
  smvOfBlock,
  labelOf,
  dragging,
  ringClassName,
  dragProps,
  hoverProps,
  stepProps,
}: {
  tail: BoxLayout;
  /**
   * Строки, которые хвост РИСУЕТ, — `SchematicLayout.tailSteps`, а не `steps` хвостового
   * псевдоблока. Разница ровно в обработках, уехавших на плитки своих деталей: высоту коробки
   * раскладка отмерила по первому списку, и нарисуй вьюшка второй — лишняя строка легла бы
   * поверх подвала (замерено: две строки в коробке, отмеренной на одну).
   */
  tailSteps: number[];
  smvOfBlock: Map<string, string>;
  labelOf: (index: number) => string;
  dragging: boolean;
  ringClassName?: string;
  dragProps: OrganProps;
  hoverProps: OrganProps;
  stepProps: (index: number) => OrganProps;
}) {
  const { LINE_H, HEAD_H, FOOT_H } = SCHEMATIC_METRICS;
  return (
    <div
      className={cn(
        'absolute border-2 border-dashed border-borderColor bg-bgColor',
        dragging && 'opacity-70',
        ringClassName,
      )}
      style={{
        left: tail.x,
        top: tail.y,
        width: tail.w,
        height: tail.h,
        touchAction: NODE_TOUCH,
      }}
      {...dragProps}
      {...hoverProps}
    >
      {/* Хвост носит ту же шапку в две строки, что и узлы: одна геометрия на все боксы
          полотна дешевле двух, а вопрос «что это за коробка» у него тот же. */}
      <div
        className='flex w-full flex-col justify-center overflow-hidden border-b border-hairline px-1'
        style={{ height: HEAD_H }}
      >
        <Text size='micro' variant='uppercase' tracking='label' component='span' className='block truncate font-bold'>
          ◌ outside units
        </Text>
        <Text size='nano' variant='label' component='span' className='block truncate'>
          the step's target isn't a unit
        </Text>
      </div>
      {tailSteps.map((i) => (
        <div
          key={i}
          {...stepProps(i)}
          className='flex w-full items-center px-1 text-left hover:bg-bgZebra focus-visible:outline focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-textColor'
          style={{ height: LINE_H }}
          title='open the step in the list'
        >
          <Text size='nano' component='span' className='min-w-0 truncate'>
            {(i + 1) * 10} · {labelOf(i)}
          </Text>
        </div>
      ))}
      <div
        className='absolute inset-x-0 bottom-0 flex items-baseline gap-1 overflow-hidden border-t border-hairline px-1'
        style={{ height: FOOT_H }}
      >
        <Text size='nano' variant='label' component='span' className='min-w-0 truncate'>
          {tailSteps.length} {tailSteps.length === 1 ? 'step' : 'steps'}
        </Text>
        {smvOfBlock.get('') && (
          <Text size='nano' variant='label' component='span' className='ml-auto shrink-0 tabular-nums'>
            Σ {smvOfBlock.get('')}
          </Text>
        )}
      </div>
    </div>
  );
}

/**
 * ПЛИТКА ДЕТАЛИ КАК НОДА ПОЛОТНА: бокс, состояние рамкой, подпись и сам контур с штриховкой.
 *
 * Вынута сюда по той же причине, что боксы: фулскрин рисует ТУ ЖЕ плитку, а второй экземпляр
 * восьмидесяти строк органного JSX разошёлся бы с оригиналом молча.
 *
 * ДВА ПРОСТРАНСТВА КЛЮЧЕЙ, и путать их нельзя: ткань ключуется СЫРЫМ `lineKey` (он же ключ ноды и
 * ручной позиции), а контур чертежа — `pieceRefKey(lineKey)`. Перепутанные, они дают пустую
 * штриховку при живом рецепте, ничего не сломав на глаз, — поэтому обе выборки стоят здесь, в
 * одном месте, а не у каждого вызывателя.
 *
 * Органы (`role`/`tabIndex`/`onClick`/`onKeyDown`) собирает РОДИТЕЛЬ своим `activate()` и отдаёт
 * готовым объектом: вьюшка не знает ни про клик-эхо после драга, ни про то, разрешено ли действие.
 */
export function TileView({
  tile: t,
  name,
  pieceShapes,
  cloth,
  labelOf,
  picked,
  dragging,
  ringClassName,
  organProps,
  dragProps,
  hoverProps,
  stepProps,
}: {
  tile: TileLayout;
  /** Человеческое имя детали. */
  name: string;
  pieceShapes: PieceShapeMap;
  /** Карта ткани деталей показываемого колорвея; `null` — вопрос не задавался. */
  cloth?: Map<string, PieceCloth> | null;
  /** Короткая подпись шага — та же, что в строке блока. */
  labelOf: (index: number) => string;
  picked: boolean;
  /** Плитку тащат прямо сейчас. */
  dragging: boolean;
  /** Рамка ноды: цель жеста или наведение. Считает родитель — знание про жест живёт там. */
  ringClassName?: string;
  /** Пропы ГОЛОВЫ плитки как органа: пусто, когда по ней кликать нечем. */
  organProps: OrganProps;
  dragProps: OrganProps;
  hoverProps: OrganProps;
  /** Пропы строки обработки: тот же орган, что у строки блока, — открыть шаг в списке. */
  stepProps: (index: number) => OrganProps;
}) {
  const { TILE, PROC_ROW_H } = SCHEMATIC_METRICS;
  return (
    <div
      className={cn(
        'absolute flex flex-col overflow-hidden border',
        t.state === 'free' ? 'border-dashed border-borderColor' : 'border-borderColor',
        picked && 'border-solid border-textColor',
        dragging && 'opacity-70',
        ringClassName,
      )}
      style={{ left: t.x, top: t.y, width: t.w, height: t.h, touchAction: NODE_TOUCH }}
      title={
        t.state === 'free'
          ? `${name} — hasn't gone into any unit yet; click to take it into the assembly`
          : `${name} — already in unit ▣ ${t.into}; click to open the step that consumed it`
      }
      {...dragProps}
      {...hoverProps}
    >
      {/* ГОЛОВА — САМА ДЕТАЛЬ, и она же PICK-ЗОНА плитки. Орган переехал с внешней коробки
          сюда ровно по образцу бокса узла: строки под головой — уже кнопки шагов, и оставь
          роль снаружи, клик по строке сработал бы ДВАЖДЫ (открыл шаг и заодно взял деталь
          в выбор). У плитки без обработок голова занимает её целиком, поэтому зона клика
          не изменилась ни на пиксель.

          РОСТ ГОЛОВЫ — ОСТАТОК, а не число: строки ниже фиксированы `PROC_ROW_H`, и остаток
          сам равен `TILE` минус рамка плитки. Напиши здесь `TILE` числом — и голова окажется
          на два пикселя выше своего места, потому что рамку раскладка считает внутри плитки
          (замерено: силуэт голой плитки 46, а не 48). */}
      <div {...organProps} className='flex min-h-0 flex-1 items-center justify-center'>
        {/* `pxBox` — бокс ГОЛОВЫ, тот, в котором силуэт действительно рисуется (free 64×48,
            stack 52×48). Паддинги своей обёртки плитка вычитает сама; передать сюда бокс
            РИСОВАНИЯ значило бы вычесть их дважды, и шаг штриховки поехал бы по аспекту
            детали. Дефолтный 48×48 здесь не годится: free-плитка шире. */}
        <PieceTile
          found={pieceShapes?.get(pieceRefKey(t.key)) ?? null}
          name={name}
          cloth={cloth?.get(t.key) ?? null}
          pxBox={{ w: t.w, h: TILE }}
          className='size-full'
        />
      </div>
      {/* ОБРАБОТКИ ЭТОЙ ДЕТАЛИ — её СОСТОЯНИЕ, а не список работ. Плитка обязана читаться
          как «полочка, обработанная топстичем и фьюзингом»: движок запрещает узел из
          одного входа, обработка не рождает новой вещи, а меняет состояние той же детали.

          СТРОКА ЗЕРКАЛЬНА СТРОКЕ БЛОКА, И ЭТО НАМЕРЕННО. Тот же шаг законно виден в обоих
          местах (блок отвечает «какая работа скатывается в узел», плитка — «в каком
          состоянии деталь»), и две одинаковые строки читались бы как дубль. Поэтому здесь
          грамматика `Row` — подпись слева, значение справа, — а не грамматика блока, где
          слева номер, а справа глиф: в 44 пикселях содержимого различить их иначе нечем.

          Высота строки и её разделитель приходят из раскладки одним числом (`PROC_ROW_H`,
          линия входит В строку её верхней границей): вторая пара чисел здесь означала бы,
          что картинка и раскладка однажды разойдутся, и разойдутся молча. */}
      {t.processing.map((i) => (
        <div
          key={i}
          {...stepProps(i)}
          className='flex shrink-0 items-center gap-1 overflow-hidden border-t border-hairline bg-bgColor px-1 text-left hover:bg-bgZebra focus-visible:outline focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-textColor'
          style={{ height: PROC_ROW_H }}
          title={`${labelOf(i)} — processing on this piece; click to open the step in the list`}
        >
          <Text
            size='nano'
            variant='label'
            component='span'
            className='min-w-0 truncate leading-none'
          >
            {labelOf(i)}
          </Text>
          {/* НОМЕР ШАГА, а не порядковый на плитке: он связывает плитку с рельсом
              последовательности, и второй нумерации у одного шага быть не должно. */}
          <Text
            size='nano'
            component='span'
            className='ml-auto shrink-0 tabular-nums leading-none'
          >
            {(i + 1) * 10}
          </Text>
        </div>
      ))}
    </div>
  );
}
