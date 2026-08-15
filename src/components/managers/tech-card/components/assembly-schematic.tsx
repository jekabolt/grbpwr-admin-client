import { cn } from 'lib/utility';
import { useState } from 'react';
import { Chip, ChipRow } from 'ui/components/chip';
import Text from 'ui/components/text';

import type { AssemblyBlock } from './assembly-blocks';
import type { AssemblyResult, AssemblyStep } from './assembly-frontier';
import { assemblyLayout, SCHEMATIC_METRICS } from './assembly-layout';

// Схема сборки: карта чёрных ящиков.
//
// ЭТО ПОЛНОЦЕННЫЙ РЕДАКТОР, а не витрина: собрать весь порядок сборки можно не уходя отсюда.
// Выбрал детали на столе → «сшить» → узел родился; добавил обработку внутрь блока; растворил
// узел; открыл шаг и правишь параметры.
//
// Первая редакция плана оставляла схеме только выбор и навигацию, опасаясь, что два экрана
// начнут спорить о том, где «настоящая» операция. Опасение верное, но лечится оно не запретом:
// источник истины и так ОДИН — состояние формы. Расходятся не виды, а ЛОГИКА МУТАЦИЙ, если её
// написать дважды. Поэтому схема не содержит ни одного собственного мутатора: joinIntoUnit,
// addStepIntoUnit, dissolveUnit живут в OperationsField в одном экземпляре, и список зовёт ровно
// их же.
//
// ПРОВОД ИДЁТ К СТРОКЕ-ПОТРЕБИТЕЛЮ, А НЕ К БОКСУ. Разница существенная: узел SHELL входит в
// GARMENT не «вообще», а на конкретном шаге, и провод, упирающийся в верх бокса, скрывает
// именно то, ради чего схему смотрят — где эта подсборка пришивается.
export function AssemblySchematic({
  blocks,
  steps,
  res,
  labelOf,
  pieceNameOf,
  onPickStep,
  onJoin,
  onAddStep,
  onDissolve,
  frozen = false,
}: {
  blocks: AssemblyBlock[];
  steps: AssemblyStep[];
  res: AssemblyResult;
  /** Короткая подпись шага для строки бокса. */
  labelOf: (index: number) => string;
  pieceNameOf: (lineKey: string) => string;
  onPickStep: (index: number) => void;
  /** Сшить выбранное в новый узел. Мутатор общий со списком. */
  onJoin: (inputKeys: string[]) => void;
  /** Добавить обработку внутрь блока. */
  onAddStep: (unitKey: string) => void;
  /** Растворить узел — по индексу его производящего шага. */
  onDissolve: (stepIndex: number) => void;
  /** Карточка выпущена: схема остаётся читаемой, но не редактируемой. */
  frozen?: boolean;
}) {
  // Выбор — то, из чего собирается следующий узел. Живёт в схеме, потому что это состояние
  // ЖЕСТА, а не данных: уход с экрана его обнуляет, и правильно.
  const [picked, setPicked] = useState<string[]>([]);
  const toggle = (key: string) =>
    setPicked((cur) => (cur.includes(key) ? cur.filter((k) => k !== key) : [...cur, key]));
  const onTable = new Set(res.frontier);
  const layout = assemblyLayout(blocks, steps, res);
  const { LINE_H, HEAD_H } = SCHEMATIC_METRICS;
  const looseSteps = blocks.find((b) => b.key === '')?.steps ?? [];

  if (layout.tiles.length === 0 && layout.boxes.length === 0) {
    // ЧЕСТНОЕ ПУСТОЕ СОСТОЯНИЕ, а не пустое полотно — но теперь оно означает ровно одно:
    // на карточке НЕТ ДЕТАЛЕЙ. До Ф7 сюда попадала и размеченная деталями карточка без единого
    // узла, то есть экран говорил «нечего рисовать» ровно тогда, когда рисовать было что.
    return (
      <div className='flex flex-col items-center gap-1 border border-dashed border-borderColor px-3 py-8 text-center'>
        <Text size='micro' variant='label'>
          деталей ещё нет — схеме нечего рисовать
        </Text>
        <Text size='micro' variant='label'>
          детали приходят из выкроек; появятся здесь плитками, и сборка начнётся с них
        </Text>
        {!frozen && (
          <FreePieces
            keys={res.frontier}
            pieceNameOf={pieceNameOf}
            picked={picked}
            onToggle={toggle}
            onJoin={(keys) => {
              onJoin(keys);
              setPicked([]);
            }}
            onClear={() => setPicked([])}
          />
        )}
      </div>
    );
  }

  // Строка бокса → её y. Нужна проводам: они целятся в строку, а не в бокс.
  const rowY = (blockKey: string, stepIndex: number): number => {
    const box = layout.byKey.get(blockKey);
    if (!box) return 0;
    const b = blocks.find((x) => x.key === blockKey);
    const pos = b ? b.steps.indexOf(stepIndex) : -1;
    if (pos < 0) return box.y + HEAD_H / 2;
    return box.y + HEAD_H + 2 + pos * LINE_H + LINE_H / 2;
  };

  // Провод: от правого края бокса-источника к левому краю строки-потребителя, кубической кривой.
  const wires: Array<{ d: string; key: string }> = [];
  for (const b of blocks) {
    if (b.key === '') continue;
    for (const i of b.steps) {
      for (const input of steps[i]?.inputs ?? []) {
        if (input.kind !== 'unit' || input.key === b.key) continue;
        const from = layout.byKey.get(input.key);
        const to = layout.byKey.get(b.key);
        if (!from || !to) continue;
        const x1 = from.x + from.w;
        const y1 = from.y + from.h / 2;
        const x2 = to.x;
        const y2 = rowY(b.key, i);
        const mid = (x1 + x2) / 2;
        wires.push({ key: `${input.key}->${b.key}:${i}`, d: `M${x1},${y1} C${mid},${y1} ${mid},${y2} ${x2},${y2}` });
      }
    }
  }

  return (
    <>
      {!frozen && (
        <FreePieces
          keys={res.frontier.filter((k) => !res.units.has(k))}
          pieceNameOf={pieceNameOf}
          picked={picked}
          onToggle={toggle}
          onJoin={(keys) => {
            onJoin(keys);
            setPicked([]);
          }}
          onClear={() => setPicked([])}
          compact
        />
      )}
    <div className='overflow-auto border border-borderColor bg-bgColor' style={{ maxHeight: 640 }}>
      <div style={{ width: layout.width, height: layout.height, position: 'relative' }}>
        <svg
          width={layout.width}
          height={layout.height}
          className='absolute inset-0'
          aria-hidden
        >
          {wires.map((w) => (
            <path key={w.key} d={w.d} fill='none' stroke='currentColor' strokeWidth={1} opacity={0.45} />
          ))}
        </svg>

        {/* ВСЕ ДЕТАЛИ КАРТОЧКИ — по одной плитке на деталь, место следует из состояния: съеденная
            стоит у бокса своего узла, свободная — в колонке у левого края. Координаты приходят из
            раскладки, а не считаются здесь: раскладка проверяема пробой, разметка — нет.

            Плитка остаётся <button> и на съеденной детали, хотя действия у той пока нет: клик по
            съеденной уводит к съевшему шагу — это T-32, а фокусируемость нужна уже сейчас, иначе
            клавиатура потеряет половину полотна ровно в тот момент, когда полотно стало полным. */}
        {layout.tiles.map((t) => (
          <button
            key={`tile:${t.key}`}
            type='button'
            disabled={frozen}
            onClick={t.state === 'free' ? () => toggle(t.key) : undefined}
            className={cn(
              'absolute flex items-center justify-center px-1 text-center',
              t.state === 'free'
                ? 'border border-dashed border-borderColor'
                : 'border border-borderColor bg-bgColor',
              picked.includes(t.key) && 'border-solid border-textColor bg-bgZebra',
            )}
            style={{ left: t.x, top: t.y, width: t.w, height: t.h }}
            title={
              t.state === 'free'
                ? `${pieceNameOf(t.key)} — ещё не вошла ни в один узел; кликните, чтобы взять в сборку`
                : `${pieceNameOf(t.key)} — уже в узле ▣ ${t.into}`
            }
          >
            <Text size='nano' variant='label' component='span' className='line-clamp-2'>
              {pieceNameOf(t.key)}
            </Text>
          </button>
        ))}

        {/* ХВОСТОВОЙ БОКС: шаги, не достигающие ни одного узла. До Ф7 их на полотне не было
            вовсе — неразмеченная карточка показывала пустоту вместо существующего маршрута, а
            обработка, созданная из схемы, исчезала без следа. Пунктир и лексикон те же, что у
            врезки рельса, чтобы две вьюшки называли одно одинаково. */}
        {layout.tail && (
          <div
            className='absolute border-2 border-dashed border-borderColor bg-bgColor'
            style={{ left: layout.tail.x, top: layout.tail.y, width: layout.tail.w, height: layout.tail.h }}
          >
            <div className='flex items-baseline gap-1 border-b border-hairline px-1' style={{ height: HEAD_H }}>
              <Text size='micro' variant='uppercase' tracking='label' component='span' className='font-bold'>
                ◌ вне узлов
              </Text>
              <Text size='nano' variant='label' component='span' className='ml-auto shrink-0'>
                цель шага — не узел
              </Text>
            </div>
            {looseSteps.map((i) => (
              <button
                key={i}
                type='button'
                onClick={() => onPickStep(i)}
                className='flex w-full items-center px-1 text-left hover:bg-bgZebra focus-visible:outline focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-textColor'
                style={{ height: LINE_H }}
                title='открыть шаг в списке'
              >
                <Text size='nano' component='span' className='min-w-0 truncate'>
                  {(i + 1) * 10} · {labelOf(i)}
                </Text>
              </button>
            ))}
          </div>
        )}

        {layout.boxes.map((box) => {
          const b = blocks.find((x) => x.key === box.key);
          if (!b) return null;
          const terminal = res.frontier.includes(box.key) && res.units.has(box.key);
          return (
            <div key={box.key}>
              {/* Плитки деталей-входов рисует общий проход по layout.tiles выше: до Ф7 они жили
                  здесь, и деталь, взятая ещё и обработкой чужого блока, рисовалась дважды. */}
              <div
                className='absolute border-2 border-textColor bg-bgColor'
                style={{ left: box.x, top: box.y, width: box.w, height: box.h }}
              >
                <div className='flex items-baseline gap-1 border-b border-hairline px-1' style={{ height: HEAD_H }}>
                  <Text size='micro' variant='uppercase' tracking='label' component='span' className='font-bold'>
                    ▣ {box.key}
                  </Text>
                  {b.name && (
                    <Text size='nano' variant='label' component='span' className='min-w-0 truncate'>
                      {b.name}
                    </Text>
                  )}
                  <Text size='nano' variant='label' component='span' className='ml-auto shrink-0'>
                    {terminal ? '✓' : b.absorbedInto ? `→${b.absorbedInto}` : '✕'}
                  </Text>
                </div>
                {!frozen && (
                  <div className='absolute -top-4 left-0 flex items-center gap-1'>
                    {/* Взять узел входом следующей сборки можно только пока он НА СТОЛЕ: съеденный
                        узел лежит внутри другого, и предлагать его — предлагать заведомый отказ. */}
                    {onTable.has(box.key) && (
                      <Chip
                        dashed={!picked.includes(box.key)}
                        onClick={() => toggle(box.key)}
                        title='взять этот узел в следующую сборку'
                      >
                        {picked.includes(box.key) ? '✓ выбран' : 'выбрать'}
                      </Chip>
                    )}
                    <Chip dashed onClick={() => onAddStep(box.key)} title='добавить обработку по этому узлу'>
                      + операция
                    </Chip>
                    <Chip
                      dashed
                      onClick={() => onDissolve(b.producedAt)}
                      title='шаг перестанет собирать узел; входы вернутся на стол следующим шагам'
                    >
                      растворить
                    </Chip>
                  </div>
                )}
                {b.steps.map((i) => (
                  <button
                    key={i}
                    type='button'
                    onClick={() => onPickStep(i)}
                    className='flex w-full items-center px-1 text-left hover:bg-bgZebra focus-visible:outline focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-textColor'
                    style={{ height: LINE_H }}
                    title='открыть шаг в списке'
                  >
                    <Text size='nano' component='span' className='min-w-0 truncate'>
                      {(i + 1) * 10} · {labelOf(i)}
                    </Text>
                  </button>
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </div>
    </>
  );
}

// FreePieces — панель выбора и единственное действие, рождающее узел.
//
// Одна кнопка, а не мастер: «сшить» — это и есть весь жест. Код узла предлагается автоматически,
// имя даётся потом в открывшемся шаге, потому что придумывать имя в момент жеста — это пауза
// ровно там, где у технолога есть инерция.
function FreePieces({
  keys,
  pieceNameOf,
  picked,
  onToggle,
  onJoin,
  onClear,
  compact = false,
}: {
  keys: string[];
  pieceNameOf: (k: string) => string;
  picked: string[];
  onToggle: (k: string) => void;
  onJoin: (keys: string[]) => void;
  onClear: () => void;
  compact?: boolean;
}) {
  if (keys.length === 0 && picked.length === 0) return null;
  return (
    <ChipRow className={compact ? 'mb-1.5' : 'mt-2'}>
      <Text size='micro' variant='label' component='span' className='uppercase'>
        на столе:
      </Text>
      {keys.map((k) => (
        <Chip
          key={k}
          dashed={!picked.includes(k)}
          onClick={() => onToggle(k)}
          title={`${pieceNameOf(k)} — кликните, чтобы взять в сборку`}
        >
          {picked.includes(k) ? `✓ ${pieceNameOf(k)}` : pieceNameOf(k)}
        </Chip>
      ))}
      {picked.length > 0 && (
        <>
          <Chip onClick={() => onJoin(picked)} title='создать узел из выбранного'>
            сшить · {picked.length}
          </Chip>
          <Chip dashed onClick={onClear} title='снять выбор'>
            отменить
          </Chip>
        </>
      )}
    </ChipRow>
  );
}
