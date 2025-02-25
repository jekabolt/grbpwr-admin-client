import MenuIcon from '@mui/icons-material/Menu';
import { ROUTES } from 'constants/routes';
import { cn } from 'lib/utility';
import { FC, ReactNode, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from 'ui/components/button';
import { SnackBar } from 'ui/components/snackbar';
import { Logo } from 'ui/icons/logo';
import { SideBarItems } from './components/sidebar-items';

interface LayoutProps {
  children: ReactNode;
}

export const Layout: FC<LayoutProps> = ({ children }) => {
  const navigate = useNavigate();
  const [isSidebarOpen, setSidebarOpen] = useState(true);

  const handleLogout = () => {
    localStorage.removeItem('authToken');
    navigate(ROUTES.login, { replace: true });
  };

  const navigateMainPage = () => {
    navigate(ROUTES.main, { replace: true });
  };

  const toggleSidebar = () => {
    setSidebarOpen(!isSidebarOpen);
  };

  return (
    <div className='flex h-screen'>
      <div
        className={`fixed h-full w-[240px] border-r border-text bg-white print:hidden transition-transform duration-300 ${
          isSidebarOpen ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        <div className='flex flex-col h-full'>
          <div className='flex h-16 items-center justify-center border-b border-text'>
            <Logo onClick={navigateMainPage} />
          </div>

          <div className='overflow-y-auto h-full flex items-center justify-center'>
            <SideBarItems />
          </div>

          <div className='w-full border-t border-text p-4'>
            <Button onClick={handleLogout} size='lg'>
              Logout
            </Button>
          </div>
        </div>
      </div>
      <button
        onClick={toggleSidebar}
        className='fixed left-0 top-4 z-50 ml-2 rounded-md bg-white p-2 text-gray-600 shadow-md hover:bg-gray-100 print:hidden'
      >
        <MenuIcon />
      </button>
      <div className={cn('transition-all duration-300 w-full', { 'pl-[240px]': isSidebarOpen })}>
        <div className='h-full pt-20 px-2'>{children}</div>
        <SnackBar />
      </div>
    </div>
  );
};
