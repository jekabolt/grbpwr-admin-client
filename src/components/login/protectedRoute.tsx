import { ROUTES } from 'constants/routes';
import { ReactNode, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { LoginBlock } from './login';

interface ProtectedRouteProps {
  children: ReactNode;
}

export function isTokenExpired(token: string | null) {
  if (!token) return true;

  try {
    const { exp } = JSON.parse(atob(token.split('.')[1]));
    const now = new Date();
    return now.getTime() > exp * 1000;
  } catch (error) {
    console.error('Error decoding token: ', error);
    return true;
  }
}

const ProtectedRoute: React.FC<ProtectedRouteProps> = ({ children }) => {
  const navigate = useNavigate();

  useEffect(() => {
    const token = localStorage.getItem('authToken');
    if (isTokenExpired(token)) {
      navigate(ROUTES.login);
    }
  }, [navigate]);

  return isTokenExpired(localStorage.getItem('authToken')) ? (
    <LoginBlock></LoginBlock>
  ) : (
    <>{children}</>
  );
};

export default ProtectedRoute;
