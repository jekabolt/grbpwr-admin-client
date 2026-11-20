import { authService } from 'api/api';
import { clearAuthToken, readAuthToken } from 'api/auth-headers';
import { isTokenExpired } from 'components/login/protectedRoute';
import { currentHost, goToUrl, teamUrl } from 'lib/host';
import { type ReactNode, useEffect, useState } from 'react';
import { Loader } from 'ui';

import { clearHash, isRefusal } from './api-error';
import { JoinLinkAccess } from './join-link-access';
import { AuthSheet, SheetForm } from './sheet';

type JoinPhase = 'loading' | 'form' | 'sent' | 'expired' | 'error';

function teamHome(): void {
  goToUrl(teamUrl(currentHost().slug));
}

function JoinLoading({
  teamName,
  note,
  renderSide,
}: {
  teamName: string;
  note?: string;
  renderSide: (name: string) => ReactNode;
}) {
  return (
    <AuthSheet side={renderSide(teamName)}>
      <SheetForm title='join' note={note}>
        {!note && (
          <div className='flex justify-center py-6'>
            <Loader />
          </div>
        )}
      </SheetForm>
    </AuthSheet>
  );
}

/** `/join#link=…`: request access through a team's public join link. */
export function JoinByLink({
  link,
  renderSide,
}: {
  link: string;
  renderSide: (name: string) => ReactNode;
}) {
  const [phase, setPhase] = useState<JoinPhase>('loading');
  const [teamName, setTeamName] = useState('');

  useEffect(() => {
    clearHash();
    let live = true;
    const token = readAuthToken();
    const hasSession = !isTokenExpired(token);
    if (token && !hasSession) clearAuthToken();

    const load = async () => {
      try {
        const info = await authService.JoinLinkInfo({ link });
        if (!live) return;
        setTeamName(info.teamName ?? '');
      } catch {
        if (live) setPhase('expired');
        return;
      }
      if (!hasSession) {
        setPhase('form');
        return;
      }
      // a session on a team host belongs to this team: the person is in already
      try {
        await authService.GetMyProfile({});
        if (live) teamHome();
      } catch (e) {
        if (!live) return;
        if (isRefusal(e)) {
          clearAuthToken();
          setPhase('form');
        } else setPhase('error');
      }
    };

    void load();
    return () => {
      live = false;
    };
  }, [link]);

  const finish = (state: string | undefined) => {
    const result = state?.toLowerCase();
    if (result === 'pending') setPhase('sent');
    else if (result === 'joined' || result === 'already_member') teamHome();
    else setPhase('error');
  };

  if (phase === 'loading') return <JoinLoading teamName={teamName} renderSide={renderSide} />;
  if (phase === 'expired')
    return <JoinLoading teamName={teamName} note='link expired' renderSide={renderSide} />;
  if (phase === 'error')
    return <JoinLoading teamName={teamName} note='try again' renderSide={renderSide} />;
  if (phase === 'sent')
    return (
      <AuthSheet side={renderSide(teamName)}>
        <SheetForm title='request sent'>{null}</SheetForm>
      </AuthSheet>
    );
  return (
    <JoinLinkAccess link={link} teamName={teamName} renderSide={renderSide} onResult={finish} />
  );
}
