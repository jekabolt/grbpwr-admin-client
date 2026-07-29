'use client';

import * as Popover from '@radix-ui/react-popover';
import React, { useState } from 'react';

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
        {/* single scroll owner — children keep their own internal spacing */}
        <div className='max-h-[50vh] min-h-0 overflow-y-auto px-2 py-1.5'>{children}</div>
      </Popover.Content>
    </Popover.Portal>
  );
}
