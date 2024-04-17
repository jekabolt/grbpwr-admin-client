import { Button, Grid, Typography } from '@mui/material';
import { useNavigate } from '@tanstack/react-location';
import { ROUTES } from 'constants/routes';
import { FC, useEffect, useState } from 'react';

export const ErrorPage: FC = () => {
  const [errorName, setErrorName] = useState<string | null>(null);
  const navigate = useNavigate();

  useEffect(() => {
    const storedErrorName = sessionStorage.getItem('errorCode');
    if (storedErrorName) {
      setErrorName(storedErrorName);
    }
  }, []);

  const moveToMain = () => {
    navigate({ to: ROUTES.main, replace: true });
  };
  return (
    <Grid container spacing={3} margin='40vh auto' justifyContent='center'>
      <Grid item xs={7} textAlign='center'>
        <Typography variant='h4' textTransform='uppercase'>
          {errorName}
        </Typography>
      </Grid>
      <Grid item xs={10}>
        <Grid container justifyContent='space-between'>
          <Grid item xs={6} textAlign='center'>
            <Button variant='contained' size='large' onClick={moveToMain}>
              go main
            </Button>
          </Grid>
          <Grid item xs={6} textAlign='center'>
            <Button variant='contained' size='large' onClick={() => window.history.back()}>
              go back
            </Button>
          </Grid>
        </Grid>
      </Grid>
    </Grid>
  );
};
