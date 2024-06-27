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
      <Grid item className={styles.layout_logo}>
        <Button
          variant='contained'
          // startIcon={<ArrowBackIosIcon fontSize='small' />}
          onClick={() => window.history.back()}
          sx={{ whiteSpace: 'nowrap', width: 10 }}
        >
          <ArrowBackIosIcon fontSize='small' />
        </Button>
      </Grid>
      <Grid item xs={12} className={styles.layout_content}>
        {children}
      </Grid>
      <Grid item className={styles.layout_logout}>
        <Button
          variant='outlined'
          color='secondary'
          size='small'
          // startIcon={<ExitToAppIcon fontSize='small' />}
          onClick={handleLogout}
          className={styles.hide_btn}
        >
          <ExitToAppIcon fontSize='small' />
        </Button>
      </Grid>
    </Grid>
  );
};
