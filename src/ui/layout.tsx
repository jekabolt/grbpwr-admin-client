import { ROUTES } from 'constants/routes';
import { cn } from 'lib/utility';
import { FC, ReactNode, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Button } from './components/button';
import { LeftSideNavMenu } from './components/left-side-nav-menu';
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
          'fixed inset-x-2.5 top-2 z-30 h-12 py-2 lg:gap-0 lg:px-5 lg:py-3',
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
        <div className='flex grow basis-0 items-center justify-start'>
          <LeftSideNavMenu onNavOpenChange={setIsNavOpen} />
        </div>

        <div className='flex grow basis-0 items-center justify-center'>
          <Button
            asChild
            size='lg'
            className='text-center transition-colors hover:opacity-70 active:opacity-50'
          >
            <Link to='/'>grbpwr</Link>
          </Button>
        </div>

        <div className='flex grow basis-0 items-center justify-end'>
          <div className='relative w-full lg:w-auto'>
            <div className='flex'>
              <Button
                asChild
                className='px-2 underline-offset-2 hover:underline transition-colors hover:opacity-70'
              >
                <Link to={ROUTES.settings}>settings</Link>
              </Button>
              <Button
                className='pl-2 pr-0 underline-offset-2 hover:underline transition-colors hover:opacity-70 cursor-pointer'
                onClick={handleLogout}
              >
                logout
              </Button>
            </div>
          </div>
        </div>
      </div>
      <div className='h-full pt-26 px-2.5'>{children}</div>
      <SnackBar />
    </>
  );
};
