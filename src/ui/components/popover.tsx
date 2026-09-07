'use client';

import * as Popover from '@radix-ui/react-popover';
import React, { useCallback, useRef, useState } from 'react';

import { cn } from 'lib/utility';

import Text from './text';

/**
 * The one popover shell. Reference grammar:
 *   panel  white, 1px INK border, --shadow-popover, 220–280px
 *   tail   8px square rotated 45°, ink left+top border, 22px from the left edge
 *   head   optional, ruled below, 10px bold uppercase
 *   body   px-2 py-1.5, scrolls at 50vh
 *
 * `noTail` for comboboxes that sit flush under a field (the material picker) —
 * a tail on something anchored edge-to-edge reads as a mistake.
 *
 * Every small floating picker in the app goes through this: sample picker, piece
 * picker, callout note, category browser, attention detail, season chips.
 */
type Props = {
  children: React.ReactNode;
  openElement: React.ReactNode | ((isOpen: boolean) => React.ReactNode);
  title?: string;
  contentProps?: Popover.PopoverContentProps;
  // e.g. { 'aria-label': 'more actions' } when openElement is an icon with no text.
  triggerProps?: Popover.PopoverTriggerProps;
  className?: string;
  noTail?: boolean;
  /** Controlled mode — omit for self-managed open state. */
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
};

export default function GenericPopover({
  openElement,
  title,
  children,
  contentProps,
  triggerProps,
  className,
  noTail,
  open,
  onOpenChange,
}: Props) {
  const [internal, setInternal] = useState(false);
  const isOpen = open ?? internal;
  const setOpen = (v: boolean) => {
    if (open === undefined) setInternal(v);
    onOpenChange?.(v);
  };

  return (
    <Popover.Root open={isOpen} onOpenChange={setOpen}>
      <Popover.Trigger className='flex items-center' {...triggerProps}>
        {typeof openElement === 'function' ? openElement(isOpen) : openElement}
      </Popover.Trigger>
      <PopoverContent className={className} title={title} noTail={noTail} {...contentProps}>
        {children}
      </PopoverContent>
    </Popover.Root>
  );
}

/**
 * ═══ ПОЧЕМУ ПОПОВЕР ВНУТРИ МОДАЛКИ НЕ ЛИСТАЛСЯ ════════════════════════════════════════════════
 *
 * Жалоба владельца с беты: «в NEW COLOURWAY → PICK THE PANTONE не работает скролл». Замер на
 * стенде: `scrollHeight` 4944 при `clientHeight` 320, колесо — `scrollTop 0 → 0`. То есть листать
 * БЫЛО что, и не листалось не из-за высоты.
 *
 * ПРИЧИНА — ЗАМОК МОДАЛКИ, А НЕ ЭТОТ ФАЙЛ. `ConfirmationModal` — это Radix Dialog в модальном
 * режиме, а он оборачивает оверлей в `react-remove-scroll`. Тот вешает на **`document`** живой
 * (`{passive:false}`) обработчик `wheel` и `touchmove` и зовёт `preventDefault()` на всём, что
 * лежит ВНЕ диалога: разрешены только его собственный узел и «осколки» (`shards`), а осколок у
 * него ровно один — `Dialog.Content`. Поповер же портируется в `document.body`, то есть диалогу
 * он СОСЕД, а не потомок, и под разрешение не попадает. Клик работал (указатель ходит по другой
 * дороге — `DismissableLayer`), а колесо гасилось молча.
 *
 * ЛЕЧЕНИЕ — ОСТАНОВИТЬ СОБЫТИЕ, НЕ ДОЙДЯ ДО `document`. Обработчик на самом скроллере: он в
 * дереве ниже, значит срабатывает раньше документного, и `stopPropagation()` лишает замок повода
 * что-либо отменять. `preventDefault` мы не зовём — прокрутка остаётся штатной, браузерной.
 *
 * ⚠ СЛУШАТЕЛЬ ЖИВОЙ И НАТИВНЫЙ, А НЕ `onWheel`. React вешает `wheel` пассивно и НА КОНТЕЙНЕР
 * портала, и полагаться на то, что этот контейнер окажется ниже `document`, значит поставить
 * починку в зависимость от внутренностей рендерера. Тот же довод уже записан у колеса схемы
 * сборки (`assembly-canvas.tsx`).
 *
 * ⚠ И ПРИВЯЗЫВАЕТСЯ ОН REF-ФУНКЦИЕЙ, А НЕ `useEffect` ПО `useRef`. Первый заход был именно
 * такой и не сработал ВОВСЕ: `PopoverContent` монтируется вместе с `Popover.Root`, а его тело
 * появляется в DOM только при открытии — эффект успевал сходить один раз, увидеть `null` и
 * больше не звался никогда. Ref-функция зовётся тогда, когда узел ЕСТЬ, и ещё раз при его
 * уходе, поэтому слушатель живёт ровно столько, сколько открыт поповер.
 *
 * ⚠ И `overscroll-contain` ЗДЕСЬ — ВТОРАЯ ПОЛОВИНА, А НЕ УКРАШЕНИЕ. Без него докрученный до
 * упора список отдаёт остаток колеса странице под собой, и «починка» читалась бы как уехавшая
 * из-под поповера страница. Вне модалки замка нет вовсе, и от правки остаётся ровно это: список
 * листается сам и никуда не отдаёт.
 */
function useScrollableInsideLock() {
  const detach = useRef<(() => void) | null>(null);
  return useCallback((el: HTMLDivElement | null) => {
    detach.current?.();
    detach.current = null;
    if (!el) return;
    const stop = (e: Event) => e.stopPropagation();
    el.addEventListener('wheel', stop, { passive: true });
    el.addEventListener('touchmove', stop, { passive: true });
    detach.current = () => {
      el.removeEventListener('wheel', stop);
      el.removeEventListener('touchmove', stop);
    };
  }, []);
}

export function PopoverContent({
  children,
  title,
  className,
  noTail,
  ...contentProps
}: {
  children: React.ReactNode;
  title?: string;
  className?: string;
  noTail?: boolean;
}) {
  const bindScroller = useScrollableInsideLock();

  return (
    <Popover.Portal>
      <Popover.Content
        side='bottom'
        align='start'
        sideOffset={noTail ? 0 : 6}
        collisionPadding={8}
        className={cn(
          'relative z-[var(--z-popover)] flex w-[240px] flex-col border border-textColor bg-bgColor shadow-[var(--shadow-popover)]',
          className,
        )}
        {...contentProps}
      >
        {!noTail && (
          // The tail. A rotated square inheriting the panel's ink border on two sides,
          // so it reads as the panel pointing rather than as a separate diamond.
          <span
            aria-hidden
            className='absolute -top-[5px] left-[22px] size-2 rotate-45 border-t border-l border-textColor bg-bgColor'
          />
        )}
        {title && (
          <div className='flex shrink-0 items-center gap-2 border-b border-borderColor px-2 py-1'>
            <Text
              size='micro'
              variant='uppercase'
              tracking='group'
              component='span'
              className='font-bold'
            >
              {title}
            </Text>
            <Popover.Close aria-label='close' className='ml-auto text-labelColor'>
              ✕
            </Popover.Close>
          </div>
        )}
        {/* single scroll owner — children keep their own internal spacing.
            ⚠ ПОТОЛОК ТЕПЕРЬ ИЗМЕРЕН, А НЕ УГАДАН. `50vh` — догадка о том, что панель поместится;
            когда триггер стоит посреди высокой модалки, места нет ни снизу, ни сверху, и панель
            на 437px уезжала за верхний край экрана вместе с полем поиска (замерено: top −37).
            `--radix-popper-available-height` — это Radix МЕРЯЕТ остаток до края в ту сторону,
            куда он панель поставил; вычитаем шапку и свои поля. Фолбэк `100vh` обязателен: без
            него отсутствие переменной сделало бы всё выражение невалидным и сняло потолок вовсе.
            Значение выставлено переменной, чтобы содержимое могло взять ТО ЖЕ ЧИСЛО (пикер
            пантона держит своё поле поиска на месте, отдавая скролл только сетке). */}
        <div
          ref={bindScroller}
          style={
            {
              '--popover-body-max':
                'min(50vh, calc(var(--radix-popper-available-height, 100vh) - 2.5rem))',
            } as React.CSSProperties
          }
          className='max-h-[var(--popover-body-max)] min-h-0 overflow-y-auto overscroll-contain px-2 py-1.5'
        >
          {children}
        </div>
      </Popover.Content>
    </Popover.Portal>
  );
}
