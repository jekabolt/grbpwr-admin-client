import { cn } from 'lib/utility';
import Text from 'ui/components/text';

import type { AssemblyBlock } from './assembly-blocks';

// Шапка блока подсборки в рельсе.
//
// ЭТО ЗАГОЛОВОК МЕЖДУ СТРОКАМИ, А НЕ ОБЁРТКА ВОКРУГ НИХ, и это не деталь вёрстки. Перетаскивание
// шагов обязано остаться ГЛОБАЛЬНЫМ — через границы блоков: порядок операций первичен, блоки
// выводятся из него, и запирать шаг внутри блока значило бы отдать порядок алгоритму. Оберни
// строки в контейнер блока — и dnd-kit начнёт считать границы контейнера границами сортировки.
//
// Поэтому досье здесь — это рельс с врезанными заголовками, а не стопка карточек. Технолог
// продолжает таскать шаг куда угодно; заголовок лишь называет, в чью подсборку шаг попал.
export function UnitBlockHeader({
  block,
  smv,
  terminal,
}: {
  block: AssemblyBlock;
  /** Σ SMV шагов блока; пусто, если ни у одного не задано. */
  smv: string;
  /** Этот узел — готовое изделие (единственный живой). */
  terminal: boolean;
}) {
  const isTail = block.key === '';
  return (
    <div
      className={cn(
        'mt-1.5 flex items-baseline gap-1.5 border-t border-textColor px-1 pt-1 first:mt-0',
        isTail && 'border-dashed border-borderColor',
      )}
    >
      <Text size='micro' variant='uppercase' tracking='label' component='span' className='font-bold'>
        {isTail ? '◌ outside units' : `▣ ${block.key}`}
      </Text>
      {!isTail && block.name && (
        <Text size='micro' variant='label' component='span' className='min-w-0 truncate'>
          {block.name}
        </Text>
      )}
      {/* СОСТОЯНИЕ УЗЛА НАЗЫВАЕТСЯ СЛОВОМ, а не выводится читателем из отсутствия чего-то.
          Три состояния, и они разные: изделие (единственный живой узел), ушёл в другой узел
          (нормальная середина сборки) и разрыв (живой, но не единственный — сборка не сошлась). */}
      {!isTail && (
        <Text size='micro' variant='label' component='span' className='ml-auto shrink-0'>
          {terminal
            ? '✓ garment'
            : block.absorbedInto
              ? `→ ▣ ${block.absorbedInto}`
              : '✕ break'}
        </Text>
      )}
      {isTail && (
        <Text size='micro' variant='label' component='span' className='ml-auto shrink-0'>
          the step's target isn't a unit
        </Text>
      )}
      {smv && (
        <Text size='micro' variant='label' component='span' className='shrink-0 tabular-nums'>
          Σ {smv}
        </Text>
      )}
    </div>
  );
}
