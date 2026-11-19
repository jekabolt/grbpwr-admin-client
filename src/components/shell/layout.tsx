import { useQueryClient } from '@tanstack/react-query';
import { authService } from 'api/api';
import { clearAuthToken } from 'api/auth-headers';
import { accountsKeys } from 'components/managers/accounts/utils/hooks';
import { ADMIN_GROUP, ROUTES } from 'constants/routes';
import { currentHost, isLekaloHost, rootUrl } from 'lib/host';
import { cn } from 'lib/utility';
import { useWorkspace } from 'lib/workspace/use-workspace';
import { FC, ReactNode, useCallback, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { Button, HeaderNote, Pill } from 'ui';
import { CommandPalette, PALETTE_KEY_HINT, useCommandPaletteShortcut } from './command-palette';
import { LeftSideNavMenu } from './left-side-nav-menu';
import { NavDropdownMenu } from './nav-dropdown-menu';
import { SnackBar } from './snackbar';

interface LayoutProps {
  children: ReactNode;
}

export const Layout: FC<LayoutProps> = ({ children }) => {
  const navigate = useNavigate();
  const [isNavOpen, setIsNavOpen] = useState(false);
  const [paletteOpen, setPaletteOpen] = useState(false);
  useCommandPaletteShortcut(useCallback(() => setPaletteOpen(true), []));

  const queryClient = useQueryClient();
  const { workspace, gate } = useWorkspace();
  const lekalo = isLekaloHost();
  const team = currentHost().kind === 'team';
  const { pathname } = useLocation();
  const title = lekalo ? workspace?.name || '' : 'grbpwr';

  const handleLogout = () => {
    // A backend before teams has no SignOut: only a workspace says the call exists.
    if (workspace) authService.SignOut({}).catch(() => undefined);
    clearAuthToken();
    queryClient.removeQueries({ queryKey: accountsKeys.all });
    navigate(ROUTES.login, { replace: true });
  };

  return (
    <>
      <div
        className={cn(
          'fixed inset-x-2.5 top-2 z-[var(--z-nav)] h-12 py-2 lg:gap-0 lg:px-5 lg:py-3 print:hidden',
          'flex items-center gap-1',
          'border border-borderColor bg-bgColor text-textColor lg:border-transparent',
          'transform-gpu transition-transform duration-150 ease-[cubic-bezier(0.25,0.46,0.45,0.94)]',
          'lg:transform-none lg:transition-[top] lg:duration-150 lg:ease-[cubic-bezier(0.25,0.46,0.45,0.94)]',
          {
            '!border-b-transparent lg:border-borderColor lg:bg-bgColor lg:text-textColor lg:mix-blend-normal':
              isNavOpen,
          },
        )}
      >
        <LeftSideNavMenu onNavOpenChange={setIsNavOpen} />

        <div className='flex grow basis-0 items-center justify-center gap-2'>
          <Button
            asChild
            size='lg'
            className='text-center transition-colors hover:opacity-70 active:opacity-50'
          >
            <Link to='/'>{title}</Link>
          </Button>
          {workspace?.readOnly && <Pill tone='warn'>read only</Pill>}
        </div>

        <div className='flex grow basis-0 items-center justify-end gap-1'>
          {/* teams mode: back to the root's list of own teams (it asks to log in when needed) */}
          {team && (
            <Button
              asChild
              className='px-2 underline-offset-2 transition-colors hover:underline hover:opacity-70'
            >
              <a href={rootUrl('/login')}>teams</a>
            </Button>
          )}
          <Button
            className='flex items-center gap-1.5 px-2 underline-offset-2 transition-colors hover:underline hover:opacity-70'
            onClick={() => setPaletteOpen(true)}
          >
            search
            <span className='hidden text-labelColor lg:inline'>{PALETTE_KEY_HINT}</span>
          </Button>
          <div className='hidden lg:block'>
            <NavDropdownMenu groups={[ADMIN_GROUP]} align='end' onOpenChange={setIsNavOpen} />
          </div>
          {/* «Мой профиль» стоит рядом с «logout», а не в выпадающем «admin», и это не
              вкусовщина: пункты «admin» гейтятся правами и у фотографа группа исчезает целиком,
              а профиль обязан быть виден каждому. Здесь же он оказывается в единственном месте
              шапки, которое и так про личность вошедшего — «выйти» и «это я» одна категория.
              Ниже lg шапка держит только menu / логотип / logout: там пункт живёт в ящике
              (MobileNavMenu), иначе три подписи не помещаются в 12 строк высоты. */}
          {/* Скрытие — на обёртке, а не на самой кнопке: базовый класс `Button` — это `block`,
              cva собирает строку через clsx без tailwind-merge, и `hidden` на кнопке оставил бы
              в разметке оба display-класса, разводя их только порядком правил в таблице стилей.
              Тот же приём, что у соседнего выпадающего «admin». */}
          {team && (
            <div className='hidden lg:block'>
              <Button
                asChild
                className={cn(
                  'px-2 underline-offset-2 transition-colors hover:underline hover:opacity-70',
                  pathname === ROUTES.people && 'underline',
                )}
              >
                <Link to={ROUTES.people}>people</Link>
              </Button>
            </div>
          )}
          <div className='hidden lg:block'>
            <Button
              asChild
              className='px-2 underline-offset-2 transition-colors hover:underline hover:opacity-70'
            >
              <Link to={ROUTES.me}>my profile</Link>
            </Button>
          </div>
          <Button
            className='px-2 underline-offset-2 hover:underline transition-colors hover:opacity-70 cursor-pointer'
            onClick={handleLogout}
          >
            logout
          </Button>
        </div>
      </div>
      <div className='h-full print:h-full print:pt-0 pt-26 px-2.5'>
        {gate === 'missing' ? (
          <div className='flex justify-center pt-block'>
            <HeaderNote tone='warn'>no workspace</HeaderNote>
          </div>
        ) : (
          children
        )}
      </div>
      <SnackBar />
      <CommandPalette open={paletteOpen} onOpenChange={setPaletteOpen} />
    </>
  );
};
