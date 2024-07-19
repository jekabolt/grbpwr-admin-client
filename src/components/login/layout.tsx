import ArrowBackIosIcon from '@mui/icons-material/ArrowBackIos';
import ExitToAppIcon from '@mui/icons-material/ExitToApp';
import { AppBar, Box, Button, Container, IconButton, Toolbar, styled } from '@mui/material';
import { useNavigate } from '@tanstack/react-location';
import { ROUTES } from 'constants/routes';
import logo from 'img/tex-text.png';
import { FC, ReactNode } from 'react';
import { HideOnScroll } from './scroll';

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
      <HideOnScroll>
        <AppBar
          position='sticky'
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
      <Container component='main' sx={{ flexGrow: 1, overflowY: 'auto' }}>
        {children}
      </Container>
    </Box>
  );
};
