import { Button, Grid, TextField, Typography } from '@mui/material';
import { login } from 'api/auth';
import { ROUTES } from 'constants/routes';
import { Field, Formik } from 'formik';
import { FC, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
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
      navigate(ROUTES.main, { replace: true });
    }
  }, [navigate]);

  const handleLoginSubmit = async (values: LoginFormValues, { setSubmitting }: any) => {
    try {
      const response = await login(values);
      if (!response.authToken) throw new Error('Invalid credentials');
      localStorage.setItem('authToken', response.authToken);
      navigate(ROUTES.main, { replace: true });
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
    <div className='border border-red-500 h-screen flex items-center justify-center'>
      <Formik
        initialValues={{ username: '', password: '' }}
        validationSchema={LoginSchema}
        onSubmit={handleLoginSubmit}
      >
        {({ isSubmitting, errors, touched, handleSubmit }) => (
          <form onSubmit={handleSubmit} className='border border-blue-500 flex flex-col gap-4'>
            <Grid item xs={12}>
              <Field
                as={TextField}
                name='username'
                placeholder='USERNAME'
                // size='medium'
                fullWidth
                error={touched.username && Boolean(errors.username)}
                // className={styles.input}
              />
            </Grid>
            <Grid item xs={12}>
              <Field
                as={TextField}
                name='password'
                placeholder='PASSWORD'
                type={showPassword ? 'text' : 'password'}
                // size='medium'
                fullWidth
                error={touched.password && Boolean(errors.password)}
                // className={styles.input}
                // InputProps={{
                //   style: { fontSize: '1.5em', width: '300px' },
                //   endAdornment: (
                //     <IconButton onClick={() => setShowPassword(!showPassword)}>
                //       {showPassword ? <VisibilityOff /> : <Visibility />}
                //     </IconButton>
                //   ),
                // }}
              />
            </Grid>
            {generalError && (
              <Grid item xs={12}>
                <Typography variant='overline' color='error' align='center'>
                  {generalError}
                </Typography>
              </Grid>
            )}

            <Button size='medium' variant='contained' type='submit' disabled={isSubmitting}>
              Login
            </Button>
          </form>
        )}
      </Formik>
    </div>
  );
};
