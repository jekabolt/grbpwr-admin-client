import { authService } from 'api/api';
import { writeAuthToken } from 'api/auth-headers';
import { ROUTES } from 'constants/routes';
import { currentHost } from 'lib/host';
import { useSnackBarStore } from 'lib/stores/store';
import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Loader } from 'ui';

import { clearHash, errStatus, hashParam } from './api-error';
import { AuthSheet, SheetFoot, SheetForm, SheetSubmit, TeamSide } from './sheet';

const RETRY_MS = 2000;

/** `/auth#code=…` on a team host: trade the one-time code for this origin's token. */
export function Handoff() {
  const navigate = useNavigate();
  const { showMessage } = useSnackBarStore();
  const [{ code, fromSignup }] = useState(() => ({
    code: hashParam('code'),
    fromSignup: hashParam('from') === 'signup',
  }));
  const [state, setState] = useState<'working' | 'preparing' | 'expired'>(
    code ? 'working' : 'expired',
  );

  useEffect(() => {
    clearHash();
    if (!code) return;
    let live = true;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const attempt = async () => {
      try {
        const r = await authService.ExchangeHandoff({ code });
        if (!live) return;
        writeAuthToken(r.token ?? '');
        if (fromSignup) showMessage('email confirmed', 'success');
        navigate(fromSignup ? ROUTES.tasks : ROUTES.main, { replace: true });
      } catch (e) {
        if (!live) return;
        // the team's database is still being made: wait and ask again
        if (errStatus(e) === 503) {
          setState('preparing');
          timer = setTimeout(attempt, RETRY_MS);
        } else setState('expired');
      }
    };
    void attempt();
    return () => {
      live = false;
      if (timer) clearTimeout(timer);
    };
  }, [code, fromSignup, navigate, showMessage]);

  return (
    <AuthSheet side={<TeamSide name={currentHost().slug} />}>
      <SheetForm
        title='log in'
        note={
          state === 'expired' ? 'link expired' : state === 'preparing' ? 'preparing' : undefined
        }
        noteTone={state === 'expired' ? 'warn' : 'mut'}
      >
        {state === 'expired' ? (
          <SheetFoot>
            <SheetSubmit onClick={() => navigate(ROUTES.main, { replace: true })}>
              log in
            </SheetSubmit>
          </SheetFoot>
        ) : (
          <div className='flex justify-center py-6'>
            <Loader />
          </div>
        )}
      </SheetForm>
    </AuthSheet>
  );
}
