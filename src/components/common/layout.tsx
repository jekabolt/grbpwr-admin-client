import ExitToAppIcon from '@mui/icons-material/ExitToApp';
import MenuIcon from '@mui/icons-material/Menu';
import { SnackBar } from 'components/common/utility/snackbar';
import { SideBarItems } from 'components/managers/sidebar-items';
import { Logo } from 'components/ui/icons/logo';
import { ROUTES } from 'constants/routes';
import { FC, ReactNode, useState } from 'react';
import { useNavigate } from 'react-router-dom';

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
        className={`fixed h-full border-r border-green-500 w-[240px] border-r border-gray-200 bg-white print:hidden transition-transform duration-300 ${
          isSidebarOpen ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        <div className='flex flex-col h-full'>
          <div className='flex h-16 items-center justify-center border-b border-inactive'>
            <Logo onClick={navigateMainPage} />
          </div>

          <div className='overflow-y-auto border border-red-500 h-full flex items-center justify-center'>
            <SideBarItems />
          </div>

          <div className='w-full border-t border-gray-200 p-4'>
            <button
              onClick={handleLogout}
              className='flex w-full items-center justify-center gap-2 rounded-md border border-gray-300 px-4 py-2 text-sm text-gray-700 hover:bg-gray-50'
            >
              <ExitToAppIcon fontSize='small' />
              <span>Logout</span>
            </button>
          </div>
        </div>
      </div>

      <button
        onClick={toggleSidebar}
        className='fixed left-0 top-4 z-50 ml-2 rounded-md bg-white p-2 text-gray-600 shadow-md hover:bg-gray-100 print:hidden'
      >
        <MenuIcon />
      </button>

      <div
        className={`flex-1 transition-all duration-300 ${isSidebarOpen ? 'pl-[240px]' : 'pl-0'}`}
      >
        <div className='container mx-auto p-6'>{children}</div>
        <SnackBar />
      </div>
    </div>
  );
};
