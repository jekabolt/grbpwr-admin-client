import { ADMIN_GROUP, ROUTES } from 'constants/routes';
import { cn } from 'lib/utility';
import { FC, ReactNode, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Button } from './components/button';
import { LeftSideNavMenu } from './components/left-side-nav-menu';
import { NavDropdownMenu } from './components/nav-dropdown-menu';
import { SnackBar } from './components/snackbar';

interface LayoutProps {
  children: ReactNode;
}

export const Layout: FC<LayoutProps> = ({ children }) => {
  const navigate = useNavigate();
  const [isNavOpen, setIsNavOpen] = useState(false);

  const handleLogout = () => {
    localStorage.removeItem('authToken');
    navigate(ROUTES.login, { replace: true });
  };

  return (
    <>
      <div
        className={cn(
          'fixed inset-x-2.5 top-2 z-[var(--z-nav)] h-12 py-2 lg:gap-0 lg:px-5 lg:py-3 print:hidden',
          'flex items-center gap-1',
          'border border-textInactiveColor bg-bgColor text-textColor lg:border-transparent',
          'transform-gpu transition-transform duration-150 ease-[cubic-bezier(0.25,0.46,0.45,0.94)]',
          'lg:transform-none lg:transition-[top] lg:duration-150 lg:ease-[cubic-bezier(0.25,0.46,0.45,0.94)]',
          {
            '!border-b-transparent lg:border-textInactiveColor lg:bg-bgColor lg:text-textColor lg:mix-blend-normal':
              isNavOpen,
          },
        )}
      >
        <LeftSideNavMenu onNavOpenChange={setIsNavOpen} />

        <div className='flex grow basis-0 items-center justify-center'>
          <Button
            asChild
            size='lg'
            className='text-center transition-colors hover:opacity-70 active:opacity-50'
          >
            <Link to='/'>grbpwr</Link>
          </Button>
        </div>

        <div className='flex grow basis-0 items-center justify-end gap-1'>
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
      <div className='h-full print:h-full print:pt-0 pt-26 px-2.5'>{children}</div>
      <SnackBar />
    </>
  );
};
