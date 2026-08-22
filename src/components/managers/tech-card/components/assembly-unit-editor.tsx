import { common_TechCardMachineType } from 'api/proto-http/admin';
import { cn } from 'lib/utility';
import { Fragment } from 'react';
import { useFormContext, useWatch } from 'react-hook-form';
import Text from 'ui/components/text';
import { parseDecimalNumber } from 'utils/decimal';

import type { AssemblyBlock } from './assembly-blocks';
import type { AssemblyResult } from './assembly-frontier';
import { stateWord } from './assembly-node-views';
import { type FoundPiece } from './nesting/dxf-geometry';
import { operationHeading } from './operation-options';
import type { WorkCatalog } from './operation-work';
import { useOperationWorkCatalog } from './useOperationWorkCatalog';
import { pieceRefKey } from './piece-block-refs';
import { PieceRef, useFormPieces } from './piece-picker';
import { PieceSilhouette, SILHOUETTE_INK } from './piece-silhouette';
import { TechCardFormData } from './schema';
import type { PieceShapeMap } from './use-piece-shapes';

// РЕДАКТОР ОПЕРАЦИЙ УЗЛА — ВТОРАЯ РОЛЬ ДОКА.
//
// ГЛАВНОЕ, ЧТО НАДО ПОНЯТЬ ПРО ЭТОТ ЭКРАН: принадлежность шага узлу — ВЫЧИСЛЯЕМАЯ ПРОЕКЦИЯ, а не
// поле. В данных её нет: `assembly-blocks.ts` выводит её из входов транзитивно и пересчитывает на
// каждое изменение. Отсюда три следствия, и каждое видно в разметке ниже:
//
//   1) «Вставить операцию в узел» напрямую невыразимо. Можно вставить шаг НА ПОЗИЦИЮ и дать ему
//      ТАКИЕ ВХОДЫ, чтобы проекция отнесла его к узлу. Оба условия обеспечивает точка вставки:
//      позицию — адресом, состав — ключом узла в `inputKeys`. Молчаливое «вставил внутрь —
//      оказалось снаружи» и есть главный провал, которого этот экран не имеет права допустить.
//   2) Шаги узла НЕ ОБЯЗАНЫ идти подряд глобально: заготовительный шаг детали, которую узел съест,
//      принадлежит узлу, где бы он ни стоял до её поедания. «Между 40 и 50 внутри узла» и «на
//      позиции 5 в общей последовательности» — разные системы координат, и разделитель обязан
//      сказать, когда они расходятся.
//   3) Окно допустимых позиций у вставки своё: обработка САМОГО узла законна только там, где узел
//      уже на столе и ещё не съеден. Это ровно `frontierBefore[k]`, и точка вставки рисуется
//      только там, где ответ утвердительный. Точка, ведущая в отказ, хуже отсутствующей.
//
// ЧЕГО ЭКРАН НЕ ДЕЛАЕТ: не правит поля шага (клик по строке возвращает док в режим шага), не
// переставляет шаги (это рельс, у него своя ручка и свой мутатор) и не растворяет узел (это
// ховер-полоса бокса).
//
// ЧТО ЗДЕСЬ ОБЩЕЕ С РЕЛЬСОМ, А ЧТО СВОЁ. Общее — СЛОВА: заголовок шага считает `operationHeading`,
// состояние узла называет `stateWord`, силуэты рисует `PieceSilhouette`. Именно они разъезжаются
// молча, и потому их здесь не переписывают. Своя — только строка: у рельса она умеет
// перетаскивание и приём брошенной детали, а мини-рельсу узла ни то, ни другое не принадлежит.

/** Мера строки-глифа: та же квадратная полочка, что в рельсе, — сетка одна на оба списка. */
const ROW_GLYPH = `mr-0.5 size-4 ${SILHOUETTE_INK}`;
const ROW_GLYPH_LIMIT = 3;
const NONE_OP_TYPE = 'TECH_CARD_OPERATION_TYPE_UNKNOWN';

/**
 * Мера мини-рельса, px. Ширина дока — ширина экрана, и на полутора тысячах пикселей номер шага и
 * его SMV перестают читаться как одна строка. Самый длинный настоящий заголовок («machine · outer
 * shell · collar top + collar under + collar stand») укладывается сюда с запасом, остальное
 * подрезается — как и в рельсе.
 */
const RAIL_MEASURE = 720;

/**
 * Подпись дока в режиме узла: `▣ COLLAR · 4 steps · 12.5 min`.
 *
 * Живёт здесь, а не в фулскрине, вместе со всем остальным словарём этого режима: подпись и то, что
 * она подписывает, обязаны меняться одной правкой.
 */
export function unitDockTitle(block: AssemblyBlock, smv: string): string {
  const n = block.steps.length;
  const steps = `${n} ${n === 1 ? 'step' : 'steps'}`;
  return `▣ ${block.key} · ${steps}${smv ? ` · ${smv} min` : ''}`;
}

/** Экранный номер шага. Номера позиционные всюду: сервер пересчитывает их при сохранении. */
const stepNumber = (index: number) => (index + 1) * 10;

/**
 * ЧТО ЛЕЖИТ НА СТОЛЕ ПЕРЕД ШАГОМ `k`. За концом массива — конечный фронтир: позиция «после
 * последнего шага» законна, и молчать о ней значило бы терять единственную точку вставки у узла,
 * которого никто не съел.
 */
const frontierAt = (res: AssemblyResult, k: number) => res.frontierBefore[k] ?? res.frontier;

export function AssemblyUnitEditor({
  block,
  blocks,
  res,
  smv,
  terminal,
  frozen,
  selectedIndex,
  pieceShapes,
  onPickStep,
  onInsert,
}: {
  /** Узел и его шаги — проекция `assemblyBlocks`, в порядке последовательности. */
  block: AssemblyBlock;
  /** Все блоки карточки: ими называется, ЧЬИ шаги стоят в разрыве между двумя строками узла. */
  blocks: AssemblyBlock[];
  res: AssemblyResult;
  /** Σ SMV шагов узла — считает `useRailGrouping`, тем же счётом, что и шапки рельса. */
  smv: string;
  /** Узел — готовое изделие (единственный живой). */
  terminal: boolean;
  frozen: boolean;
  /** Шаг, открытый во ВТОРОЙ роли дока: строка светится, и связь двух ролей видна. */
  selectedIndex: number;
  pieceShapes: PieceShapeMap;
  /** Клик по строке — вернуть док в режим шага с этим шагом. */
  onPickStep: (index: number) => void;
  /** Точка вставки нажата: открыть создание шага на позиции `at` с ключом узла в составе. */
  onInsert: (at: number) => void;
}) {
  // Каталог работ — ОДНОЙ подпиской на весь док: имя шага в мини-рельсе спрашивает работу тем же
  // счётом, что рельс. Ключ у запроса общий на приложение, второго обращения к сети нет.
  const { catalog: workCatalog } = useOperationWorkCatalog();
  // Индекс шага → ключ его блока. Нужен РАЗРЫВУ: сказать «2 steps of other units between» можно
  // только зная, что стоящие между шаги действительно в узлах, а не в хвосте «вне узлов».
  const blockOfIndex = new Map<number, string>();
  for (const b of blocks) for (const i of b.steps) blockOfIndex.set(i, b.key);

  const eatenAt = res.consumedBy.get(block.key);
  const rows = block.steps;

  /** Разрыв между двумя соседними строками узла: сколько чужих шагов стоит между ними и чьи они. */
  const gapWords = (from: number, to: number): string => {
    const n = to - from - 1;
    if (n <= 0) return '';
    let inUnits = 0;
    for (let i = from + 1; i < to; i += 1) if (blockOfIndex.get(i)) inUnits += 1;
    const steps = `${n} ${n === 1 ? 'step' : 'steps'}`;
    // ТРИ ФОРМУЛИРОВКИ, ПОТОМУ ЧТО СЛУЧАЯ ТРИ. «steps of other units» — правда только когда между
    // строками стоят шаги ДРУГИХ УЗЛОВ; шаг, не достигающий ни одного узла, живёт в хвосте «вне
    // узлов», и назвать его чужим узлом значило бы соврать ровно там, где эта фраза и заведена —
    // чтобы «после 40» не оказалось не там, где человек ждал.
    if (inUnits === n) return `${steps} of other units between`;
    if (inUnits === 0) return `${steps} outside units between`;
    return `${steps} between, none of them in this unit`;
  };

  // ТОЧКА ВСТАВКИ ЖИВЁТ ТОЛЬКО ТАМ, ГДЕ ОНА СДЕРЖИТ ОБЕЩАНИЕ. Позиция `k` годится, если узел на
  // этот момент уже на столе и ещё не съеден: тогда шаг с ключом узла во входах проекция отнесёт
  // именно к нему. Раньше производящего шага узла не существует вовсе, и вставка «в узел» там —
  // обещание, которого не сдержать ничем.
  const canInsertAt = (k: number) => !frozen && frontierAt(res, k).includes(block.key);

  // Причина отсутствия точки вставки в голове списка называется ОДИН РАЗ, а не над каждой строкой:
  // она одна на всю область заготовительных шагов, и повторённая пять раз стала бы шумом.
  let saidNotYet = false;

  return (
    // МЕРА СТРОКИ, А НЕ ВСЯ ШИРИНА ДОКА. Док широк как экран, и растянутая на него строка разносит
    // номер и SMV на полтора метра пустоты: глаз перестаёт связывать «40» с «1.5» в одной строке.
    // Редактор шага занимает всю ширину законно — там сетка полей; список остаётся списком.
    // Число инлайном, а не классом: это единственная мера единственного списка, а не токен сетки.
    <div className='flex flex-col' style={{ maxWidth: RAIL_MEASURE }}>
      {rows.length === 0 && (
        <Text size='micro' variant='label'>
          this unit has no steps — nothing produces it
        </Text>
      )}
      {rows.map((index, i) => {
        const next = rows[i + 1];
        const at = index + 1;
        const offered = canInsertAt(at);
        const gap = next === undefined ? '' : gapWords(index, next);
        // Заготовительная область: узла ещё нет на столе, и сказать об этом надо один раз.
        const notYet = !offered && !frozen && block.producedAt >= at;
        const sayNotYet = notYet && !saidNotYet;
        if (sayNotYet) saidNotYet = true;
        return (
          <Fragment key={index}>
            <UnitStepRow
              index={index}
              selected={index === selectedIndex}
              pieceShapes={pieceShapes}
              onSelect={() => onPickStep(index)}
              workCatalog={workCatalog}
            />
            {(offered || gap || sayNotYet) && next !== undefined && (
              <InsertSlot
                at={at}
                afterNumber={stepNumber(index)}
                unitKey={block.key}
                offered={offered}
                gap={gap}
                note={
                  sayNotYet
                    ? `▣ ${block.key} appears at step ${stepNumber(block.producedAt)}`
                    : ''
                }
                onInsert={onInsert}
              />
            )}
          </Fragment>
        );
      })}
      {/* ХВОСТОВАЯ ТОЧКА ВСТАВКИ — после последнего шага узла, и она же самая частая: «дошить ещё
          одну операцию в этот узел» кончается именно здесь. */}
      {rows.length > 0 && canInsertAt(rows[rows.length - 1] + 1) && (
        <InsertSlot
          at={rows[rows.length - 1] + 1}
          afterNumber={stepNumber(rows[rows.length - 1])}
          unitKey={block.key}
          offered
          gap=''
          note=''
          onInsert={onInsert}
        />
      )}
      {/* КУДА УЗЕЛ ДЕВАЕТСЯ ДАЛЬШЕ — последней строкой, и это не украшение: ею же объясняется,
          почему после неё вставлять уже некуда. Слова — те же, что на полотне (`stateWord`): два
          органа, называющие одно состояние по-разному, читаются как два разных состояния. */}
      {rows.length > 0 && (
        <div className='mt-1 flex items-baseline gap-1.5 border-t border-hairline pt-1'>
          <Text size='micro' variant='label' component='span' className='min-w-0 truncate'>
            {stateWord(block, terminal)}
            {block.absorbedInto && eatenAt !== undefined
              ? ` takes it at step ${stepNumber(eatenAt)}`
              : ''}
          </Text>
          {block.name && (
            <Text
              size='micro'
              variant='label'
              component='span'
              className='ml-auto shrink-0 truncate'
            >
              {block.name}
            </Text>
          )}
        </div>
      )}
    </div>
  );
}

/**
 * ТОЧКА ВСТАВКИ — ВОЛОСЯНАЯ ЛИНЕЙКА, А НЕ ПЛАВАЮЩАЯ КНОПКА: в этом языке кнопки, висящей над
 * содержимым, нет вовсе. В покое между строками стоит правило толщиной в пиксель; под курсором и
 * под фокусом оно становится пунктирным и называет себя словами.
 *
 * НАСТОЯЩАЯ `<button>`, а не `div` с ролью, и это ровно тот случай, для которого правило R4
 * оставляет исключение: орган ПИШЕТ (жест кончается новым шагом), и внешний `<fieldset disabled>`
 * дока ОБЯЗАН его глушить. Строка выше — наоборот, `role="button"` на спане: открыть шаг это
 * чтение, и на выпущенной карточке оно законно.
 *
 * Подпись появляется прозрачностью, а не занимает место по наведению: сдвиг соседних строк под
 * курсором превратил бы список в дрожащий. `motion-reduce:transition-none` — тем же приёмом, что
 * во всех остальных появлениях по наведению в этом дереве.
 */
function InsertSlot({
  at,
  afterNumber,
  unitKey,
  offered,
  gap,
  note,
  onInsert,
}: {
  at: number;
  /** Номер шага, ПОСЛЕ которого встанет новый: точка вставки означает позицию сразу за ним. */
  afterNumber: number;
  unitKey: string;
  offered: boolean;
  /** Разрыв: чужие шаги, стоящие между этими двумя строками узла. Пусто — разрыва нет. */
  gap: string;
  /** Почему вставить сюда нельзя. Пусто — либо можно, либо причина уже названа выше. */
  note: string;
  onInsert: (at: number) => void;
}) {
  const words = gap || note;
  if (!offered) {
    // ТОЧКИ, ВЕДУЩЕЙ В ОТКАЗ, НЕ СУЩЕСТВУЕТ. Остаётся линейка и, если есть что сказать, слова:
    // молчаливая пустота на месте органа объясняет меньше, чем названная причина.
    return (
      <div className='flex h-[18px] items-center gap-1.5'>
        {words && (
          <Text size='micro' variant='label' component='span' className='min-w-0 shrink truncate'>
            {words}
          </Text>
        )}
        <span className='h-0 min-w-3 flex-1 border-t border-hairline' />
      </div>
    );
  }
  return (
    <button
      type='button'
      onClick={() => onInsert(at)}
      aria-label={`insert a step after step ${afterNumber}`}
      title={`a new step right after ${afterNumber}, inside ▣ ${unitKey} — you pick what it does`}
      className='group relative flex h-[18px] w-full items-center gap-1.5 text-left focus-visible:outline focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-textColor'
    >
      {words && (
        <Text size='micro' variant='label' component='span' className='min-w-0 shrink truncate'>
          {words}
        </Text>
      )}
      {/* ДВЕ ЛИНЕЙКИ ОДНА ПОВЕРХ ДРУГОЙ, А НЕ ОДНА СО СМЕНОЙ СТИЛЯ. Смена `border-style` мгновенна
          и переключается рывком; наложенные волосяная и пунктирная переходят друг в друга той же
          прозрачностью, что и подпись, то есть весь орган оживает одним движением. Высота нулевая
          у обеих — линия рисуется верхней границей, и переход ничего не двигает. */}
      <span className='relative h-0 min-w-3 flex-1'>
        <span className='absolute inset-x-0 top-0 border-t border-hairline transition-opacity group-hover:opacity-0 group-focus-visible:opacity-0 motion-reduce:transition-none' />
        <span className='absolute inset-x-0 top-0 border-t border-dashed border-textColor opacity-0 transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100 motion-reduce:transition-none' />
      </span>
      {/* ПОДПИСЬ ЛОЖИТСЯ ПОВЕРХ ЛИНЕЙКИ, А НЕ ОТНИМАЕТ У НЕЁ МЕСТО. В потоке она держала бы за
          собой пустой хвост в покое — линейка обрывалась бы, не доходя до края, у каждой строки
          одинаково и без причины. Своим фоном подпись разрывает линию ровно там, где стоит. */}
      <Text
        size='micro'
        variant='uppercase'
        tracking='label'
        component='span'
        className='absolute inset-y-0 right-0 flex items-center bg-bgColor pl-1.5 opacity-0 transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100 motion-reduce:transition-none'
      >
        + insert here
      </Text>
    </button>
  );
}

/**
 * Строка мини-рельса. Читает форму КОНТЕКСТОМ, как и строка рельса: контекст проникает в порталы, и
 * доку, живущему оверлеем, ничего не надо доставлять руками.
 *
 * НЕ `<button>`: открыть шаг — ЧТЕНИЕ, а нативная кнопка внутри `<fieldset disabled>` выпущенной
 * карточки клика не получает. На выпущенной карточке режим узла обязан читаться целиком, включая
 * переход к шагу (R10).
 */
function UnitStepRow({
  index,
  selected,
  pieceShapes,
  onSelect,
  workCatalog,
}: {
  index: number;
  selected: boolean;
  pieceShapes: PieceShapeMap;
  onSelect: () => void;
  /** Каталог работ — пропом от дока: одна подписка на мини-рельс, как в большом рельсе.
   * Обязателен тем же приёмом, что аргументы композитора: `undefined` пишется вслух. */
  workCatalog: WorkCatalog | undefined;
}) {
  const { control } = useFormContext<TechCardFormData>();
  const opType = (useWatch({ control, name: `operations.${index}.operationType` }) ?? '') as string;
  const machineType = (useWatch({ control, name: `operations.${index}.machineType` }) ??
    '') as string;
  // Тот же якорь вида, что у рельса: два способа назвать шаг — это два разных имени одного шага.
  const seamClass = (useWatch({ control, name: `operations.${index}.seamClass` }) ?? '') as string;
  // ...и та же названная работа: два способа назвать шаг — это два разных имени одного шага.
  const work = (useWatch({ control, name: `operations.${index}.work` }) ?? '') as string;
  const zone = (useWatch({ control, name: `operations.${index}.zone` }) ?? '') as string;
  const note = (useWatch({ control, name: `operations.${index}.note` }) ?? '') as string;
  const smv = (useWatch({ control, name: `operations.${index}.smv` }) ?? '') as string;
  const inputKeys = (useWatch({ control, name: `operations.${index}.inputKeys` }) ??
    []) as string[];

  const allPieces = useFormPieces();
  const linkedPieces = inputKeys
    .map((k) => allPieces.find((pc) => pc.lineKey === k))
    .filter((p): p is PieceRef => !!p);
  const glyphs = linkedPieces
    .map((p) => ({ key: p.lineKey, shape: pieceShapes?.get(pieceRefKey(p.lineKey)) ?? null }))
    .filter((g): g is { key: string; shape: FoundPiece } => !!g.shape)
    .slice(0, ROW_GLYPH_LIMIT);

  // ЗАГОЛОВОК СОБИРАЕТСЯ ТЕМ ЖЕ СЧЁТОМ, ЧТО В РЕЛЬСЕ. Второй способ назвать шаг означал бы, что
  // «шаг 30» в доке однажды перестанет совпадать с «шагом 30» на рельсе.
  const label =
    operationHeading({
      operationType: opType as Parameters<typeof operationHeading>[0]['operationType'],
      machineType: machineType as common_TechCardMachineType,
      seamClass,
      work,
      workCatalog,
      zone: zone as Parameters<typeof operationHeading>[0]['zone'],
      pieceNames: linkedPieces.map((p) => p.name),
      note,
    }) || 'new step';
  const smvMin = parseDecimalNumber(smv);

  return (
    <span
      role='button'
      tabIndex={0}
      onClick={onSelect}
      onKeyDown={(e) => {
        if (e.key !== 'Enter' && e.key !== ' ') return;
        e.preventDefault();
        onSelect();
      }}
      aria-current={selected}
      title={`${label} — open this step in the editor`}
      className={cn(
        'flex min-w-0 cursor-pointer items-center gap-1.5 border px-1 py-1 text-left transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-textColor',
        selected ? 'border-textColor bg-bgZebra' : 'border-transparent hover:border-borderColor',
      )}
    >
      <Text size='control' component='span' className='w-6 shrink-0 font-bold tabular-nums'>
        {stepNumber(index)}
      </Text>
      {glyphs.length > 0 && (
        <span className='flex shrink-0 items-center'>
          {glyphs.map((g) => (
            <PieceSilhouette key={g.key} found={g.shape} boxClassName={ROW_GLYPH} />
          ))}
        </span>
      )}
      <Text
        size='control'
        component='span'
        className={cn('min-w-0 flex-1 truncate', opType === NONE_OP_TYPE && 'text-labelColor')}
      >
        {label}
      </Text>
      <Text
        size='micro'
        variant='label'
        component='span'
        className='w-8 shrink-0 text-right tabular-nums'
        title='SMV, min'
      >
        {smvMin > 0 ? smvMin.toFixed(1) : '—'}
      </Text>
    </span>
  );
}
