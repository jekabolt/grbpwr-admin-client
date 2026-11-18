import { SnackBar } from 'components/shell/snackbar';
import { Navigate, Route, Routes } from 'react-router-dom';

import { LegalPage } from './legal-page';
import { ResetPassword } from './reset';
import { RootLogin } from './root-login';
import { ConfirmLink, SignUp } from './signup';

/** Everything the root host (beta.lekalo.studio) shows: sign up, log in, the letter links. */
export default function RootApp() {
  return (
    <>
      <Routes>
        <Route path='/' element={<SignUp />} />
        <Route path='/login' element={<RootLogin />} />
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
