import ArrowBackIosIcon from '@mui/icons-material/ArrowBackIos';
import ExitToAppIcon from '@mui/icons-material/ExitToApp';
import { AppBar, Box, Button, Grid2 as Grid, IconButton, Toolbar, styled } from '@mui/material';
import { useNavigate } from '@tanstack/react-location';
import { SnackBar } from 'components/common/utility/snackbar';
import { HideOnScroll } from 'components/login/scroll';
import { ROUTES } from 'constants/routes';
import logo from 'img/tex-text.png';
import { FC, ReactNode } from 'react';
interface LayoutProps {
  children: ReactNode;
}

const PrintHiddenToolbar = styled(Toolbar)(({ theme }) => ({
  '@media print': {
    display: 'none',
  },
}));

export const Layout: FC<LayoutProps> = ({ children }) => {
  const navigate = useNavigate();

  const handleLogout = () => {
    localStorage.removeItem('authToken');
    navigate({ to: ROUTES.login, replace: true });
  };

  const navigateMainPage = () => {
    navigate({ to: ROUTES.main, replace: true });
  };

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column' }}>
      <Box sx={{ margin: '10px 20px 64px 20px' }}>
        <HideOnScroll>
          <AppBar
            position='fixed'
            sx={{
              backgroundColor: 'transparent',
              boxShadow: 'none',
            }}
          >
            <PrintHiddenToolbar sx={{ display: 'flex', justifyContent: 'space-between' }}>
              <Button
                variant='contained'
                onClick={() => window.history.back()}
                sx={{ whiteSpace: 'nowrap' }}
                size='small'
              >
                <ArrowBackIosIcon fontSize='small' />
              </Button>
              <IconButton onClick={navigateMainPage}>
                <img src={logo} style={{ width: '30px', height: '30px' }} />
              </IconButton>
              <Button variant='outlined' color='secondary' size='small' onClick={handleLogout}>
                <ExitToAppIcon fontSize='small' />
              </Button>
            </PrintHiddenToolbar>
          </AppBar>
        </HideOnScroll>
      </Box>
      <Grid container px={2} display='flex' justifyContent='center'>
        <Grid size={{ xs: 12 }}>{children}</Grid>
      </Grid>
      <SnackBar />
    </Box>
  );
};
