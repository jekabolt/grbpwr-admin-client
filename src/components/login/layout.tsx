import ArrowBackIosIcon from '@mui/icons-material/ArrowBackIos';
import ExitToAppIcon from '@mui/icons-material/ExitToApp';
import { Button } from '@mui/material';
import { useNavigate } from '@tanstack/react-location';
import { ROUTES } from 'constants/routes';
import { FC, ReactNode } from 'react';
import styles from 'styles/layout.scss';

interface LayoutProps {
  children: ReactNode;
}

export const Layout: FC<LayoutProps> = ({ children }) => {
  const navigate = useNavigate();

  const handleLogout = () => {
    localStorage.removeItem('authToken');
    navigate({ to: ROUTES.login, replace: true });
  };

  const handleLogo = () => {
    navigate({ to: ROUTES.main });
  };

  return (
    <div className={styles.layout}>
      <div className={styles.layout_logo}>
        <Button
          variant='contained'
          startIcon={<ArrowBackIosIcon />}
          onClick={() => window.history.back()}
          className={styles.hide_btn}
        >
          Go Back
        </Button>
      </div>
      <div className={styles.layout_content}>{children}</div>
      <div className={styles.layout_logout}>
        <Button
          variant='outlined'
          color='secondary' // Choose a color that fits your app's theme
          startIcon={<ExitToAppIcon />}
          onClick={handleLogout}
          className={styles.hide_btn}
        >
          Log Out
        </Button>
      </div>
    </div>
  );
};
