'use client';

import * as Popover from '@radix-ui/react-popover';
import React, { useState } from 'react';

import { cn } from 'lib/utility';

import Text from './text';

type Props = {
  children: React.ReactNode;
  openElement: React.ReactNode | ((isOpen: boolean) => React.ReactNode);
  title?: string;
  contentProps?: Popover.PopoverContentProps;
  // e.g. { 'aria-label': 'more actions' } when openElement is an icon with no text.
  triggerProps?: Popover.PopoverTriggerProps;
  className?: string;
  gap?: 'default' | 'large';
  variant?: 'default' | 'no-borders';
};

export default function GenericPopover({
  openElement,
  title,
  children,
  contentProps,
  triggerProps,
  className,
  gap = 'default',
  variant = 'default',
}: Props) {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <Popover.Root open={isOpen} onOpenChange={setIsOpen}>
      <Popover.Trigger className='flex items-center' {...triggerProps}>
        {typeof openElement === 'function' ? openElement(isOpen) : openElement}
      </Popover.Trigger>
      <PopoverContent
        className={className}
        title={title}
        gap={gap}
        variant={variant}
        {...contentProps}
      >
        {children}
      </PopoverContent>
    </Popover.Root>
  );
}

function PopoverContent({
  children,
  title,
  className,
  gap = 'default',
  variant = 'default',
  ...contentProps
}: {
  children: React.ReactNode;
  title?: string;
  className?: string;
  gap?: 'default' | 'large';
  variant?: 'default' | 'no-borders';
}) {
  return (
    <Popover.Portal>
      <Popover.Content
        side='bottom'
        align='center'
        className={cn(
          // flex column: an in-flow title bar that stays put + a single scroll region below it.
          // (Was a position:fixed header that detached from the card and stretched full-viewport
          // width — the "поехавшая вёрстка".)
          'relative z-20 flex w-full flex-col border border-textInactiveColor bg-bgColor px-2.5 py-2.5',
          {
            'border-none': variant === 'no-borders',
          },
          className,
        )}
        {...contentProps}
      >
        {title && (
          <Popover.Close
            className={cn(
              'flex shrink-0 appearance-none items-center justify-between border-0 bg-bgColor outline-none focus:outline-none',
              gap === 'large' ? 'mb-16' : 'mb-10',
            )}
          >
            <Text variant='uppercase'>{title}</Text>
            <Text>[x]</Text>
          </Popover.Close>
        )}
        {/* single scroll owner — children keep their own internal spacing */}
        <div className='max-h-[50vh] min-h-0 overflow-y-auto'>{children}</div>
      </Popover.Content>
    </Popover.Portal>
  );
}
