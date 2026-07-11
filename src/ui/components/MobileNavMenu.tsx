'use client';

import * as DialogPrimitives from '@radix-ui/react-dialog';

import { usePermissions } from 'components/managers/accounts/utils/permissions';
import { ADMIN_GROUP, isActiveRoute, NAV_GROUPS } from 'constants/routes';
import { cn } from 'lib/utility';
import { useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { Button } from './button';
import Text from './text';

export function MobileNavMenu() {
  const [open, setOpen] = useState(false);
  const { canRead } = usePermissions();
  const { pathname } = useLocation();

  // Same grouped source as desktop; drop unreadable items, then drop empty groups.
  const groups = [...NAV_GROUPS, ADMIN_GROUP]
    .map((group) => ({ ...group, items: group.items.filter((item) => canRead(item.section)) }))
    .filter((group) => group.items.length > 0);

  return (
    <DialogPrimitives.Root open={open} onOpenChange={setOpen}>
      <DialogPrimitives.Trigger asChild>
        <Button className='pl-2 w-full text-left transition-colors hover:opacity-70 active:opacity-50'>
          menu
        </Button>
      </DialogPrimitives.Trigger>
      <DialogPrimitives.Portal>
        <DialogPrimitives.Overlay className='fixed inset-0 z-[var(--z-nav)] h-screen bg-overlay' />
        <DialogPrimitives.Content className='fixed inset-x-2 bottom-2 top-2 z-[var(--z-nav)] flex flex-col border border-textInactiveColor bg-bgColor'>
          <div className='flex items-center justify-between border-b border-textInactiveColor px-2.5 py-3'>
            <DialogPrimitives.Title asChild>
              <Text variant='uppercase'>menu</Text>
            </DialogPrimitives.Title>
            <DialogPrimitives.Close asChild>
              <Button className='cursor-pointer'>[x]</Button>
            </DialogPrimitives.Close>
          </div>
          <div className='min-h-0 flex-1 overflow-y-auto p-2.5'>
            <div className='flex flex-col gap-5'>
              {groups.map((group) => (
                <section key={group.label}>
                  <Text variant='uppercase' className='text-labelColor'>
                    {group.label}
                  </Text>
                  <div className='mt-2 grid grid-cols-2 gap-2'>
                    {group.items.map((item) => {
                      const active = isActiveRoute(pathname, item.route);
                      return (
                        <DialogPrimitives.Close asChild key={item.route}>
                          <Link
                            to={item.route}
                            aria-current={active ? 'page' : undefined}
                            className={cn(
                              'flex min-h-12 items-center justify-center border border-textInactiveColor px-2 py-3 text-center leading-tight uppercase transition-colors active:opacity-80',
                              active
                                ? 'bg-textColor text-bgColor'
                                : 'hover:bg-textColor hover:text-bgColor',
                            )}
                          >
                            {item.label}
                          </Link>
                        </DialogPrimitives.Close>
                      );
                    })}
                  </div>
                </section>
              ))}
            </div>
          </div>
        </DialogPrimitives.Content>
      </DialogPrimitives.Portal>
    </DialogPrimitives.Root>
  );
}
