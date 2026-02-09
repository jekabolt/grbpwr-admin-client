import * as NavigationMenu from '@radix-ui/react-navigation-menu';
import { LEFT_SIDE_MANAGERS, PRODUCT_MEDIA } from 'constants/routes';
import { cn } from 'lib/utility';
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Button } from './button';
import Text from './text';

export function LeftSideNavMenu({
  className,
  onNavOpenChange,
}: {
  className?: string;
  onNavOpenChange: (value: boolean) => void;
}) {
  const [isNavOpen, setIsNavOpen] = useState(false);
  return (
    <NavigationMenu.Root
      className={cn('w-full', className)}
      onValueChange={(value) => {
        const isOpen = !!value;
        setIsNavOpen(isOpen);
        onNavOpenChange(isOpen);
      }}
    >
      <NavigationMenu.List className='flex items-center'>
        {PRODUCT_MEDIA.map(({ label, route }, id) => (
          <NavigationMenu.Item key={route}>
            <Button asChild>
              <Link
                to={route}
                className={cn(
                  'flex items-center px-2 text-textBaseSize underline-offset-2 hover:underline transition-colors hover:opacity-70 active:opacity-50',
                  {
                    'pl-0': id === 0,
                  },
                )}
              >
                {label}
              </Link>
            </Button>
          </NavigationMenu.Item>
        ))}
        <NavigationMenu.Item>
          <NavigationMenu.Trigger className='flex items-center px-2 text-textBaseSize underline-offset-2 hover:underline transition-colors hover:opacity-70 active:opacity-50 cursor-pointer'>
            <Text>managers</Text>
          </NavigationMenu.Trigger>
          <NavigationMenu.Content>
            <div className='flex flex-col gap-2'>
              {LEFT_SIDE_MANAGERS.map(({ label, route }) => (
                <NavigationMenu.Link key={route} href={route}>
                  <Text>{label}</Text>
                </NavigationMenu.Link>
              ))}
            </div>
          </NavigationMenu.Content>
        </NavigationMenu.Item>
      </NavigationMenu.List>
      <div
        className={cn('fixed inset-x-2.5 top-12 flex justify-center', {
          'border-x border-b border-textInactiveColor': isNavOpen,
        })}
      >
        <NavigationMenu.Viewport className='h-[var(--radix-navigation-menu-viewport-height)] w-full' />
      </div>
    </NavigationMenu.Root>
  );
}
