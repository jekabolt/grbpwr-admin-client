import { useQueryClient } from '@tanstack/react-query';
import { clearAuthToken, readAuthToken } from 'api/auth-headers';
import { HelpCenter, Landing, OurStory } from 'components/public-site/pages';
import { Pricing } from 'components/public-site/pricing';
import { PublicSite } from 'components/public-site/site-shell';
import { SnackBar } from 'components/shell/snackbar';
import { type ReactNode, useCallback, useMemo, useState } from 'react';
import { Navigate, Route, Routes, useNavigate } from 'react-router-dom';

import { LegalPage } from './legal-page';
import { ResetPassword } from './reset';
import { RootLogin } from './root-login';
import { ConfirmLink, SignUp } from './signup';
import { MY_TEAMS_KEY, MyTeams, NewTeam, OAuthReturn, type RootSession } from './teams';

/**
 * Everything the root host (beta.lekalo.studio) shows. Signed in (a root token in this origin's
 * storage, 30 days): workspace selection at `/` and workspace creation at `/new`.
 * Signed out: the landing at `/`, workspace signup at `/signup`, and log in at `/login`.
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

  const publicPage = (children: ReactNode) => (
    <PublicSite signedIn={signedIn}>{children}</PublicSite>
  );

  return (
    <>
      <Routes>
        <Route
          path='/'
          element={publicPage(signedIn ? <MyTeams session={session} /> : <Landing />)}
        />
        <Route path='/overview' element={publicPage(<Landing />)} />
        <Route path='/pricing' element={publicPage(<Pricing />)} />
        <Route path='/help' element={publicPage(<HelpCenter signedIn={signedIn} />)} />
        <Route path='/our-story' element={publicPage(<OurStory signedIn={signedIn} />)} />
        <Route
          path='/signup'
          element={
            signedIn ? (
              <Navigate to='/new' replace />
            ) : (
              publicPage(<SignUp onSignedIn={onSignedIn} />)
            )
          }
        />
        <Route
          path='/login'
          element={
            signedIn ? (
              <Navigate to='/' replace />
            ) : (
              publicPage(<RootLogin onSignedIn={onSignedIn} />)
            )
          }
        />
        <Route
          path='/new'
          element={
            signedIn ? publicPage(<NewTeam session={session} />) : <Navigate to='/login' replace />
          }
        />
        <Route path='/auth/oauth' element={publicPage(<OAuthReturn onSignedIn={onSignedIn} />)} />
        <Route path='/confirm' element={publicPage(<ConfirmLink onSignedIn={onSignedIn} />)} />
        <Route path='/reset' element={publicPage(<ResetPassword />)} />
        <Route path='/terms' element={publicPage(<LegalPage doc='terms' />)} />
        <Route path='/privacy' element={publicPage(<LegalPage doc='privacy' />)} />
        <Route path='*' element={<Navigate to='/' replace />} />
      </Routes>
      <SnackBar />
    </>
  );
}
