import { ADMIN_GROUP, ROUTES } from 'constants/routes';
import { cn } from 'lib/utility';
import { FC, ReactNode, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { GrbpwrMark } from './icons/grbpwr-mark';
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
            <Link to='/' className='flex items-center gap-2'>
              <GrbpwrMark className='h-5 w-5 shrink-0' />
              grbpwr
            </Link>
          </Button>
        </div>

        <div className='flex grow basis-0 items-center justify-end gap-1'>
          <div className='hidden lg:block'>
            <NavDropdownMenu groups={[ADMIN_GROUP]} align='end' onOpenChange={setIsNavOpen} />
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
