import * as NavigationMenu from '@radix-ui/react-navigation-menu';
import { LEFT_SIDE_ITEMS } from 'constants/routes';
import { cn } from 'lib/utility';
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Button } from './button';

export function DesktopNavMenu({
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
        {LEFT_SIDE_ITEMS.map(({ label, route }, id) => (
          <NavigationMenu.Item key={route}>
            <Button asChild>
              <Link
                to={route}
                className={cn(
                  'flex items-center px-2 text-textBaseSize underline-offset-2 hover:underline transition-colors hover:opacity-70 active:opacity-50 whitespace-nowrap',
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
      </NavigationMenu.List>
    </NavigationMenu.Root>
  );
}
