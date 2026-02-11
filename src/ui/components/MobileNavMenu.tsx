'use client';

import * as DialogPrimitives from '@radix-ui/react-dialog';

import { useState } from 'react';

import { SIDE_BAR_ITEMS } from 'constants/routes';
import { Link } from 'react-router-dom';
import { Button } from './button';
import Text from './text';

export function MobileNavMenu() {
  const [open, setOpen] = useState(false);

  return (
    <DialogPrimitives.Root open={open} onOpenChange={setOpen}>
      <DialogPrimitives.Trigger asChild>
        <Button className='pl-2 w-full text-left transition-colors hover:opacity-70 active:opacity-50'>
          managers
        </Button>
      </DialogPrimitives.Trigger>
      <DialogPrimitives.Portal>
        <DialogPrimitives.Overlay className='fixed inset-0 z-40 h-screen bg-overlay' />
        <DialogPrimitives.Content className='fixed inset-x-2 bottom-2 top-2 z-50 border border-textInactiveColor bg-bgColor px-2.5 pb-4 pt-5'>
          <DialogPrimitives.Title className='sr-only'>managers</DialogPrimitives.Title>
          <div className='flex h-full flex-col gap-10'>
            <DialogPrimitives.Close asChild>
              <div className='flex items-center justify-between'>
                <Text variant='uppercase'>managers</Text>
                <Button>[x]</Button>
              </div>
            </DialogPrimitives.Close>
            <div className='flex flex-col gap-5'>
              {SIDE_BAR_ITEMS.map(({ label, route }, id) => (
                <DialogPrimitives.Close asChild key={id}>
                  <Button asChild>
                    <Link to={route}>{label}</Link>
                  </Button>
                </DialogPrimitives.Close>
              ))}
            </div>
          </div>
        </DialogPrimitives.Content>
      </DialogPrimitives.Portal>
    </DialogPrimitives.Root>
  );
}
