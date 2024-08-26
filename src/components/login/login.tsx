import { Visibility, VisibilityOff } from '@mui/icons-material';
import { Button, Grid, IconButton, TextField, Typography } from '@mui/material';
import { useNavigate } from '@tanstack/react-location';
import { login } from 'api/auth';
import { ROUTES } from 'constants/routes';
import { Field, Formik } from 'formik';
import { FC, useEffect, useState } from 'react';
import styles from 'styles/login-block.module.scss';
import * as Yup from 'yup';
import { isTokenExpired } from './protectedRoute';

interface LoginFormValues {
  username: string;
  password: string;
}

export const LoginBlock: FC = () => {
  const navigate = useNavigate();
  const [generalError, setGeneralError] = useState<string | null>(null);
  const [showPassword, setShowPassword] = useState(false);

  useEffect(() => {
    const authToken = localStorage.getItem('authToken');
    if (authToken && !isTokenExpired(authToken)) {
      navigate({ to: ROUTES.main, replace: true });
    }
  }, [navigate]);

  const handleLoginSubmit = async (values: LoginFormValues, { setSubmitting }: any) => {
    try {
      const response = await login(values);
      if (!response.authToken) throw new Error('Invalid credentials');
      localStorage.setItem('authToken', response.authToken);
      navigate({ to: ROUTES.main, replace: true });
    } catch {
      setGeneralError('Invalid username or password. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  const LoginSchema = Yup.object({
    username: Yup.string().required('Username is required'),
    password: Yup.string().required('Password is required'),
  });

  return (
    <Grid container alignItems='center' justifyContent='center' sx={{ minHeight: '100vh' }}>
      <Formik
        initialValues={{ username: '', password: '' }}
        validationSchema={LoginSchema}
        onSubmit={handleLoginSubmit}
      >
        {({ isSubmitting, errors, touched, handleSubmit }) => (
          <form onSubmit={handleSubmit}>
            <Grid
              container
              direction='column'
              justifyContent='center'
              alignItems='center'
              spacing={2}
            >
              <div className={styles.logo}></div>
              <Grid item xs={12}>
                <Field
                  as={TextField}
                  name='username'
                  placeholder='USERNAME'
                  size='medium'
                  fullWidth
                  error={touched.username && Boolean(errors.username)}
                  className={styles.input}
                  InputProps={{ style: { fontSize: '1.5em', width: '300px' } }}
                />
              </Grid>
              <Grid item xs={12}>
                <Field
                  as={TextField}
                  name='password'
                  placeholder='PASSWORD'
                  type={showPassword ? 'text' : 'password'}
                  size='medium'
                  fullWidth
                  error={touched.password && Boolean(errors.password)}
                  className={styles.input}
                  InputProps={{
                    style: { fontSize: '1.5em', width: '300px' },
                    endAdornment: (
                      <IconButton onClick={() => setShowPassword(!showPassword)}>
                        {showPassword ? <VisibilityOff /> : <Visibility />}
                      </IconButton>
                    ),
                  }}
                />
              </Grid>
              {generalError && (
                <Grid item xs={12}>
                  <Typography variant='overline' color='error' align='center'>
                    {generalError}
                  </Typography>
                </Grid>
              )}
              <Grid item xs={2} alignSelf='center'>
                <Button size='medium' variant='contained' type='submit' disabled={isSubmitting}>
                  Login
                </Button>
              </Grid>
            </Grid>
          </form>
        )}
      </Formik>
    </Grid>
  );
};
