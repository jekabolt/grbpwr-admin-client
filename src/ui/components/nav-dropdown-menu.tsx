import { ChevronDownIcon } from '@radix-ui/react-icons';
import * as NavigationMenu from '@radix-ui/react-navigation-menu';
import { usePermissions } from 'components/managers/accounts/utils/permissions';
import { isActiveRoute, type NavGroup } from 'constants/routes';
import { cn } from 'lib/utility';
import { Link, useLocation } from 'react-router-dom';

interface NavDropdownMenuProps {
  groups: NavGroup[];
  // Which edge the dropdown panels align to. Left-bar groups open from their left
  // edge; the right-aligned admin cluster opens from its right edge.
  align?: 'start' | 'end';
  onOpenChange?: (open: boolean) => void;
  className?: string;
}

export function NavDropdownMenu({
  groups,
  align = 'start',
  onOpenChange,
  className,
}: NavDropdownMenuProps) {
  const { canRead } = usePermissions();
  const { pathname } = useLocation();

  // Hide items the account can't read, then hide any group left empty.
  const visibleGroups = groups
    .map((group) => ({ ...group, items: group.items.filter((item) => canRead(item.section)) }))
    .filter((group) => group.items.length > 0);

  if (visibleGroups.length === 0) return null;

  return (
    <NavigationMenu.Root
      delayDuration={100}
      skipDelayDuration={300}
      className={cn('relative', className)}
      onValueChange={(value) => onOpenChange?.(Boolean(value))}
    >
      <NavigationMenu.List className={cn('flex items-center', align === 'end' && 'justify-end')}>
        {visibleGroups.map((group) => {
          const groupActive = group.items.some((item) => isActiveRoute(pathname, item.route));
          return (
            <NavigationMenu.Item key={group.label} className='relative'>
              <NavigationMenu.Trigger
                className={cn(
                  'group flex items-center gap-1 px-2 py-1 text-textBaseSize whitespace-nowrap cursor-pointer',
                  'underline-offset-4 transition-colors hover:underline',
                  'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-textColor',
                  'data-[state=open]:underline',
                  groupActive && 'underline',
                )}
              >
                {group.label}
                <ChevronDownIcon
                  aria-hidden
                  className='size-3 opacity-50 transition-transform duration-150 group-data-[state=open]:rotate-180'
                />
              </NavigationMenu.Trigger>

              <NavigationMenu.Content
                className={cn(
                  'nav-dropdown absolute top-full z-40',
                  align === 'end' ? 'right-0' : 'left-0',
                )}
              >
                {/* Transparent bridge: keeps the panel in one hover target as the
                    pointer travels down from the trigger, and drops it clear of the
                    bar's bottom edge. */}
                <div className='pt-2'>
                  <ul className='flex min-w-40 flex-col border border-textColor bg-bgColor py-1'>
                    {group.items.map((item) => {
                      const itemActive = isActiveRoute(pathname, item.route);
                      return (
                        <li key={item.route}>
                          <NavigationMenu.Link asChild active={itemActive}>
                            <Link
                              to={item.route}
                              className={cn(
                                'block whitespace-nowrap px-3 py-2 text-textBaseSize transition-colors',
                                'hover:bg-textColor hover:text-bgColor',
                                'focus-visible:bg-textColor focus-visible:text-bgColor focus-visible:outline-none',
                                itemActive && 'bg-textColor text-bgColor',
                              )}
                            >
                              {item.label}
                            </Link>
                          </NavigationMenu.Link>
                        </li>
                      );
                    })}
                  </ul>
                </div>
              </NavigationMenu.Content>
            </NavigationMenu.Item>
          );
        })}
      </NavigationMenu.List>
    </NavigationMenu.Root>
  );
}
