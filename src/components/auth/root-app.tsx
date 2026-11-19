import { useQueryClient } from '@tanstack/react-query';
import { clearAuthToken, readAuthToken } from 'api/auth-headers';
import { SnackBar } from 'components/shell/snackbar';
import { useCallback, useMemo, useState } from 'react';
import { Navigate, Route, Routes, useNavigate } from 'react-router-dom';

import { LegalPage } from './legal-page';
import { ResetPassword } from './reset';
import { RootLogin } from './root-login';
import { ConfirmLink, SignUp } from './signup';
import { MY_TEAMS_KEY, MyTeams, NewTeam, OAuthReturn, type RootSession } from './teams';

/**
 * Everything the root host (beta.lekalo.studio) shows. Signed in (a root token in this origin's
 * storage, 30 days): `your teams` at `/` and `/login`, `new team` at `/new`. Signed out: sign up,
 * log in, the letter links. A 401 from any root call clears the token and shows `log in`.
 */
export default function RootApp() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [signedIn, setSignedIn] = useState(() => !!readAuthToken());

  const onSignedIn = useCallback(() => {
    void queryClient.invalidateQueries({ queryKey: MY_TEAMS_KEY });
    setSignedIn(true);
    navigate('/', { replace: true });
  }, [navigate, queryClient]);

  const session = useMemo<RootSession>(
    () => ({
      out: (to) => {
        clearAuthToken();
        queryClient.removeQueries({ queryKey: MY_TEAMS_KEY });
        setSignedIn(false);
        navigate(to, { replace: true });
      },
    }),
    [navigate, queryClient],
  );

  return (
    <>
      <Routes>
        <Route path='/' element={signedIn ? <MyTeams session={session} /> : <SignUp />} />
        <Route
          path='/login'
          element={signedIn ? <Navigate to='/' replace /> : <RootLogin onSignedIn={onSignedIn} />}
        />
        <Route
          path='/new'
          element={signedIn ? <NewTeam session={session} /> : <Navigate to='/login' replace />}
        />
        <Route path='/auth/oauth' element={<OAuthReturn onSignedIn={onSignedIn} />} />
        <Route path='/confirm' element={<ConfirmLink />} />
        <Route path='/reset' element={<ResetPassword />} />
        <Route path='/terms' element={<LegalPage doc='terms' />} />
        <Route path='/privacy' element={<LegalPage doc='privacy' />} />
        <Route path='*' element={<Navigate to='/' replace />} />
      </Routes>
      <SnackBar />
    </>
  );
}
