import { useNavigate } from '@tanstack/react-location';
import { ROUTES } from 'constants/routes';
import { ReactNode, useEffect } from 'react';

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
      navigate({ to: ROUTES.login });
    }
  }, [navigate]);

  return <>{children}</>;
};

export default ProtectedRoute;
