import ArrowBackIosIcon from '@mui/icons-material/ArrowBackIos';
import ExitToAppIcon from '@mui/icons-material/ExitToApp';
import { Button, Grid } from '@mui/material';
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

  return (
    <Grid container justifyContent='center' className={styles.layout}>
      <Grid item xs={1} className={styles.layout_logo}>
        <Button
          variant='contained'
          size='small'
          startIcon={<ArrowBackIosIcon />}
          onClick={() => window.history.back()}
          sx={{ whiteSpace: 'nowrap' }}
        >
          Go Back
        </Button>
      </Grid>
      <Grid item xs={11} className={styles.layout_content}>
        {children}
      </Grid>
      <Grid item xs={12} className={styles.layout_logout}>
        <Button
          variant='outlined'
          color='secondary'
          size='small'
          startIcon={<ExitToAppIcon />}
          onClick={handleLogout}
          className={styles.hide_btn}
        >
          Log Out
        </Button>
      </Grid>
    </Grid>
  );
};
