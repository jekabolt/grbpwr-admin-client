import { readAuthToken } from 'api/auth-headers';
import { TeamLogin } from 'components/auth/team-login';
import { ROUTES } from 'constants/routes';
import { currentHost } from 'lib/host';
import { ReactNode, useEffect, useState } from 'react';
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
  const kind = currentHost().kind;
  // a lekalo host signs in where it stands, so the page asked for opens right after
  const [, signedIn] = useState(0);

  useEffect(() => {
    const token = readAuthToken();
    if (kind === 'legacy' && isTokenExpired(token)) {
      navigate(ROUTES.login);
    }
  }, [navigate, kind]);

  if (!isTokenExpired(readAuthToken())) return <>{children}</>;
  if (kind === 'team') return <TeamLogin onSignedIn={() => signedIn((n) => n + 1)} />;
  if (kind === 'console')
    return <TeamLogin target='SIGN_IN_TARGET_CONSOLE' onSignedIn={() => signedIn((n) => n + 1)} />;
  return <LoginBlock></LoginBlock>;
};

export default ProtectedRoute;
