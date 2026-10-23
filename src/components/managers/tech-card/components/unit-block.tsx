import { cn } from 'lib/utility';
import { unitDisplayName } from 'lib/assembly-unit-name';
import { useEffect, useId, useRef, useState } from 'react';
import { useFormContext, useWatch } from 'react-hook-form';
import { FormControl, FormField, FormItem, FormLabel, FormMessage, Input, Text } from 'ui';

import type { AssemblyBlock } from './assembly-blocks';
import type { AssemblyResult } from './assembly-frontier';
import type { TechCardFormData } from './schema';
import { UnitGlyph, useUnitPicture } from './unit-silhouette';

/**
 * The backend keeps a unit name on its FIRST producer and clears the duplicate on absorbing steps.
 * Invalid/incomplete joins have no engine unit yet, so their own row remains the only honest target.
 */
export function unitNameProducerIndex(
  res: AssemblyResult,
  unitKey: string,
  currentIndex: number,
): number {
  return res.units.get(unitKey)?.producedAt ?? currentIndex;
}

const unitNamePath = (producedAt: number) => `operations.${producedAt}.outputUnitName` as const;

function useCanonicalUnitName(unitKey: string, producedAt: number) {
  const { control, setValue } = useFormContext<TechCardFormData>();
  const path = unitNamePath(producedAt);
  const override = (useWatch({ control, name: path }) ?? '') as string;
  const frozen =
    useWatch({ control, name: 'approvalState' }) === 'TECH_CARD_APPROVAL_STATE_RELEASED';
  const displayName = unitDisplayName({ key: unitKey, outputUnitName: override });

  const save = (next: string) => {
    const value = next.trim();
    if (value === override.trim() || (!override.trim() && value === displayName)) return;
    setValue(path, value, { shouldDirty: true, shouldTouch: true });
  };

  return { control, path, override, displayName, frozen, save };
}

/**
 * The name as a header: text at rest, the same text in an input only while it is being edited.
 * Only the rendered name stops pointer/click propagation. That keeps its single click for rename,
 * while the rest of a list row or canvas node retains its existing select/drag gesture.
 */
export function InlineUnitName({
  block,
  className,
  inputClassName,
}: {
  block: AssemblyBlock;
  className?: string;
  inputClassName?: string;
}) {
  const id = useId();
  const { override, displayName, frozen, save } = useCanonicalUnitName(block.key, block.producedAt);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(displayName);
  const inputRef = useRef<HTMLInputElement>(null);
  const cancelling = useRef(false);

  useEffect(() => {
    if (!editing) setDraft(displayName);
  }, [displayName, editing]);

  useEffect(() => {
    if (!editing) return;
    requestAnimationFrame(() => {
      inputRef.current?.focus();
      inputRef.current?.select();
    });
  }, [editing]);

  if (!editing) {
    return (
      <span
        data-unit-name={block.key}
        title={frozen ? undefined : 'click to rename the unit'}
        className={cn(
          'inline-block min-w-0 max-w-full truncate align-bottom',
          !frozen &&
            'cursor-text underline decoration-transparent underline-offset-2 hover:decoration-current',
          className,
        )}
        onPointerDown={
          frozen
            ? undefined
            : (event: React.PointerEvent<HTMLSpanElement>) => event.stopPropagation()
        }
        onClick={
          frozen
            ? undefined
            : (event: React.MouseEvent<HTMLSpanElement>) => {
                event.stopPropagation();
                setEditing(true);
              }
        }
      >
        {displayName}
      </span>
    );
  }

  const commit = () => {
    if (cancelling.current) {
      cancelling.current = false;
      setEditing(false);
      return;
    }
    save(draft);
    setEditing(false);
  };

  return (
    <Input
      ref={inputRef}
      name={`inline-unit-name-${id}`}
      value={draft}
      aria-label={`unit name for ${displayName}`}
      maxLength={255}
      disabled={frozen}
      autoComplete='off'
      data-unit-name-input={block.key}
      className={cn('h-4 min-h-0 min-w-0 max-w-full px-1 py-0', inputClassName)}
      style={{ width: `${Math.max(8, Math.min(40, draft.length + 2))}ch` }}
      onPointerDown={(event: React.PointerEvent<HTMLInputElement>) => event.stopPropagation()}
      onClick={(event: React.MouseEvent<HTMLInputElement>) => event.stopPropagation()}
      onDoubleClick={(event: React.MouseEvent<HTMLInputElement>) => event.stopPropagation()}
      onBlur={commit}
      onKeyDown={(event: React.KeyboardEvent<HTMLInputElement>) => {
        event.stopPropagation();
        if (event.key === 'Enter') {
          event.preventDefault();
          event.currentTarget.blur();
        }
        if (event.key === 'Escape') {
          event.preventDefault();
          cancelling.current = true;
          setDraft(displayName);
          event.currentTarget.blur();
        }
      }}
      onChange={(event: React.ChangeEvent<HTMLInputElement>) => setDraft(event.target.value)}
    />
  );
}

/** The labelled PRODUCES control, pointed at the same canonical first-producer field. */
export function UnitNameField({ unitKey, producedAt }: { unitKey: string; producedAt: number }) {
  const id = useId();
  const { control, path, displayName, frozen, save } = useCanonicalUnitName(unitKey, producedAt);
  const [focused, setFocused] = useState(false);
  const [draft, setDraft] = useState(displayName);
  const cancelling = useRef(false);

  useEffect(() => {
    if (!focused) setDraft(displayName);
  }, [displayName, focused]);

  return (
    <FormField
      control={control}
      name={path}
      render={({ field }) => {
        const commit = () => {
          field.onBlur();
          setFocused(false);
          if (cancelling.current) {
            cancelling.current = false;
            setDraft(displayName);
            return;
          }
          const next = draft.trim();
          save(next);
          setDraft(next || unitDisplayName({ key: unitKey }));
        };

        return (
          <FormItem>
            <FormLabel>Unit name</FormLabel>
            <FormControl>
              <Input
                ref={field.ref}
                name={`unit-name-${id}`}
                value={draft}
                aria-label={`unit name for ${displayName}`}
                maxLength={255}
                disabled={frozen}
                autoComplete='off'
                onFocus={() => {
                  setDraft(displayName);
                  setFocused(true);
                }}
                onBlur={commit}
                onKeyDown={(event: React.KeyboardEvent<HTMLInputElement>) => {
                  if (event.key === 'Enter') {
                    event.preventDefault();
                    event.currentTarget.blur();
                  }
                  if (event.key === 'Escape') {
                    event.preventDefault();
                    cancelling.current = true;
                    event.currentTarget.blur();
                  }
                }}
                onChange={(event: React.ChangeEvent<HTMLInputElement>) =>
                  setDraft(event.target.value)
                }
              />
            </FormControl>
            <FormMessage />
          </FormItem>
        );
      }}
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
  className,
  unitNameOf,
}: {
  block: AssemblyBlock;
  /** Σ SMV шагов блока; пусто, если ни у одного не задано. */
  smv: string;
  /** Этот узел — готовое изделие (единственный живой). */
  terminal: boolean;
  className?: string;
  /** Owner-facing name of another unit referenced by this block. */
  unitNameOf?: (key: string) => string;
}) {
  const isTail = block.key === '';
  // Глиф узла (полоса C): только когда каркас поставил пиктограмму, иначе строка как была.
  const picture = useUnitPicture(isTail ? null : block.key);
  return (
    <div
      className={cn(
        'mt-1.5 flex items-center gap-1.5 border-t border-textColor px-1 pt-1 first:mt-0',
        isTail && 'border-dashed border-borderColor',
        className,
      )}
    >
      <UnitGlyph
        picture={picture}
        name={unitDisplayName({ key: block.key, outputUnitName: block.name })}
        boxClassName='mr-0 size-4 self-center'
      />
      <Text
        size='micro'
        variant='uppercase'
        tracking='label'
        component='span'
        className='shrink-0 font-bold'
      >
        {isTail ? '◌ outside units' : '▣'}
      </Text>
      {!isTail && (
        <InlineUnitName
          block={block}
          className='text-micro font-bold uppercase tracking-label'
          inputClassName='text-micro font-bold uppercase tracking-label'
        />
      )}
      {/* СОСТОЯНИЕ УЗЛА НАЗЫВАЕТСЯ СЛОВОМ, а не выводится читателем из отсутствия чего-то.
          Три состояния, и они разные: изделие (единственный живой узел), ушёл в другой узел
          (нормальная середина сборки) и разрыв (живой, но не единственный — сборка не сошлась). */}
      {!isTail && (
        <Text size='micro' variant='label' component='span' className='ml-auto shrink-0'>
          {terminal
            ? '✓ garment'
            : block.absorbedInto
              ? `→ ▣ ${unitNameOf?.(block.absorbedInto) ?? unitDisplayName({ key: block.absorbedInto })}`
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
