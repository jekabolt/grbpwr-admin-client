'use client';

import * as DialogPrimitives from '@radix-ui/react-dialog';

import { useState } from 'react';

import { usePermissions } from 'components/managers/accounts/utils/permissions';
import { SIDE_BAR_ITEMS } from 'constants/routes';
import { Link } from 'react-router-dom';
import { Button } from './button';
import Text from './text';

export function MobileNavMenu() {
  const [open, setOpen] = useState(false);
  const { canRead } = usePermissions();
  const items = SIDE_BAR_ITEMS.filter((item) => canRead(item.section));

  return (
    <DialogPrimitives.Root open={open} onOpenChange={setOpen}>
      <DialogPrimitives.Trigger asChild>
        <Button className='pl-2 w-full text-left transition-colors hover:opacity-70 active:opacity-50'>
          managers
        </Button>
      </DialogPrimitives.Trigger>
      <DialogPrimitives.Portal>
        <DialogPrimitives.Overlay className='fixed inset-0 z-40 h-screen bg-overlay' />
        <DialogPrimitives.Content className='fixed inset-x-2 bottom-2 top-2 z-50 flex flex-col border border-textColor bg-bgColor'>
          <div className='flex items-center justify-between border-b border-textColor px-2.5 py-3'>
            <DialogPrimitives.Title asChild>
              <Text variant='uppercase'>managers</Text>
            </DialogPrimitives.Title>
            <DialogPrimitives.Close asChild>
              <Button className='cursor-pointer'>[x]</Button>
            </DialogPrimitives.Close>
          </div>
          <div className='min-h-0 flex-1 overflow-y-auto p-2.5'>
            <div className='grid grid-cols-2 gap-2'>
              {items.map(({ label, route }, id) => (
                <DialogPrimitives.Close asChild key={id}>
                  <Link
                    to={route}
                    className='flex min-h-12 items-center justify-center border border-textColor px-2 py-3 text-center leading-tight uppercase transition-colors hover:bg-textColor hover:text-bgColor active:opacity-80'
                  >
                    {label}
                  </Link>
                </DialogPrimitives.Close>
              ))}
            </div>
          </div>
        </DialogPrimitives.Content>
      </DialogPrimitives.Portal>
    </DialogPrimitives.Root>
  );
}
