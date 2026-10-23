import { cn } from 'lib/utility';
import { useId } from 'react';
import { useFormContext, useWatch } from 'react-hook-form';
import { Input, Text } from 'ui';

import type { AssemblyBlock } from './assembly-blocks';
import type { TechCardFormData } from './schema';
import { UnitGlyph, useUnitPicture } from './unit-silhouette';

/** The block name is the name on its first producing operation; every view edits that one fact. */
export function UnitNameInput({ block, className }: { block: AssemblyBlock; className?: string }) {
  const id = useId();
  const { control, setValue } = useFormContext<TechCardFormData>();
  const name = (useWatch({
    control,
    name: `operations.${block.producedAt}.outputUnitName`,
  }) ?? '') as string;
  const frozen =
    useWatch({ control, name: 'approvalState' }) === 'TECH_CARD_APPROVAL_STATE_RELEASED';

  return (
    <Input
      name={`unit-name-${id}`}
      value={name}
      placeholder='unit name'
      aria-label={`unit name for ${block.key}`}
      maxLength={255}
      disabled={frozen}
      autoComplete='off'
      className={className}
      onPointerDown={(event: React.PointerEvent<HTMLInputElement>) => event.stopPropagation()}
      onClick={(event: React.MouseEvent<HTMLInputElement>) => event.stopPropagation()}
      onDoubleClick={(event: React.MouseEvent<HTMLInputElement>) => event.stopPropagation()}
      onKeyDown={(event: React.KeyboardEvent<HTMLInputElement>) => {
        event.stopPropagation();
        if (event.key !== 'Enter') return;
        event.preventDefault();
        event.currentTarget.blur();
      }}
      onChange={(event: React.ChangeEvent<HTMLInputElement>) =>
        setValue(`operations.${block.producedAt}.outputUnitName`, event.target.value, {
          shouldDirty: true,
          shouldTouch: true,
        })
      }
    />
  );
}

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
  // Глиф узла (полоса C): только когда каркас поставил пиктограмму, иначе строка как была.
  const picture = useUnitPicture(isTail ? null : block.key);
  return (
    <div
      className={cn(
        'mt-1.5 flex items-center gap-1.5 border-t border-textColor px-1 pt-1 first:mt-0',
        isTail && 'border-dashed border-borderColor',
      )}
    >
      <UnitGlyph
        picture={picture}
        name={block.name || block.key}
        boxClassName='mr-0 size-4 self-center'
      />
      <Text
        size='micro'
        variant='uppercase'
        tracking='label'
        component='span'
        className='font-bold'
      >
        {isTail ? '◌ outside units' : `▣ ${block.key}`}
      </Text>
      {!isTail && <UnitNameInput block={block} className='min-w-0 flex-1 text-micro' />}
      {/* СОСТОЯНИЕ УЗЛА НАЗЫВАЕТСЯ СЛОВОМ, а не выводится читателем из отсутствия чего-то.
          Три состояния, и они разные: изделие (единственный живой узел), ушёл в другой узел
          (нормальная середина сборки) и разрыв (живой, но не единственный — сборка не сошлась). */}
      {!isTail && (
        <Text size='micro' variant='label' component='span' className='ml-auto shrink-0'>
          {terminal ? '✓ garment' : block.absorbedInto ? `→ ▣ ${block.absorbedInto}` : '✕ break'}
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
