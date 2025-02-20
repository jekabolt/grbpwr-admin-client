import { login } from 'api/auth';
import { Button } from 'components/ui/button';
import { Logo } from 'components/ui/icons/logo';
import Input from 'components/ui/input';
import Text from 'components/ui/text';
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
    <div className='h-screen flex items-center justify-center'>
      <Formik
        initialValues={{ username: '', password: '' }}
        validationSchema={LoginSchema}
        onSubmit={handleLoginSubmit}
      >
        {({ isSubmitting, handleSubmit }) => (
          <form onSubmit={handleSubmit} className='items-center flex flex-col gap-4 w-64'>
            <div className='w-1/5 flex justify-center'>
              <Logo />
            </div>
            <div className='w-full space-y-3'>
              <Field as={Input} name='username' placeholder='username' className='h-10' />

              <Field
                as={Input}
                name='password'
                placeholder='password'
                className='h-10 text-base'
                type='password'
              />
            </div>

            {generalError && (
              <Text variant='error' size='small' className='text-center'>
                {generalError}
              </Text>
            )}

            <div className='w-full flex justify-center'>
              <Button size='lg' type='submit' className='uppercase' disabled={isSubmitting}>
                Login
              </Button>
            </div>
          </form>
        )}
      </Formik>
    </div>
  );
};
