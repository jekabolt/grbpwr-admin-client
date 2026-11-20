import { authService } from 'api/api';
import { clearAuthToken, readAuthToken } from 'api/auth-headers';
import { isTokenExpired } from 'components/login/protectedRoute';
import { currentHost, goToUrl, teamUrl } from 'lib/host';
import { type ReactNode, useEffect, useState } from 'react';
import { Avatar, Loader, Text } from 'ui';

import { clearHash, isRefusal } from './api-error';
import { JoinLinkAccess } from './join-link-access';
import { joinErrorWord } from './join-link-error';
import { AuthSheet, SheetFoot, SheetForm, SheetRow, SheetSubmit } from './sheet';

type JoinPhase = 'loading' | 'form' | 'signed' | 'sent' | 'expired' | 'error';

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

function SignedJoin({
  link,
  teamName,
  email,
  initialNote,
  renderSide,
  onResult,
}: {
  link: string;
  teamName: string;
  email: string;
  initialNote: string;
  renderSide: (name: string) => ReactNode;
  onResult: (state: string | undefined, email: string) => void;
}) {
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState(initialNote);

  const request = async () => {
    if (busy) return;
    setBusy(true);
    setNote('');
    try {
      const r = await authService.JoinTeam({ link });
      onResult(r.state, email);
    } catch (e) {
      setNote(joinErrorWord(e, 'try again'));
      setBusy(false);
    }
  };

  return (
    <AuthSheet side={renderSide(teamName)}>
      <SheetForm title='join' note={note} onSubmit={request}>
        <SheetRow label='email'>
          <div className='flex min-w-0 items-center gap-2'>
            <Avatar name={email} />
            <Text component='span' className='min-w-0 break-all'>
              {email}
            </Text>
          </div>
        </SheetRow>
        <SheetFoot>
          <SheetSubmit loading={busy}>request to join</SheetSubmit>
        </SheetFoot>
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
  const [email, setEmail] = useState('');
  const [signedNote, setSignedNote] = useState('');

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
      try {
        const profile = await authService.GetMyProfile({});
        if (!live) return;
        const profileEmail = profile.profile?.email ?? '';
        if (!profileEmail) {
          setPhase('error');
          return;
        }
        setEmail(profileEmail);
        setPhase('signed');
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

  const showSigned = (nextEmail: string, note = '') => {
    setEmail(nextEmail);
    setSignedNote(note);
    setPhase('signed');
  };

  const finish = (state: string | undefined, nextEmail: string) => {
    const result = state?.toLowerCase();
    if (result === 'pending') {
      setEmail(nextEmail);
      setPhase('sent');
    } else if (result === 'joined' || result === 'already_member') teamHome();
    else showSigned(nextEmail, 'try again');
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
  if (phase === 'signed')
    return (
      <SignedJoin
        key={signedNote}
        link={link}
        teamName={teamName}
        email={email}
        initialNote={signedNote}
        renderSide={renderSide}
        onResult={finish}
      />
    );
  return (
    <JoinLinkAccess
      link={link}
      teamName={teamName}
      renderSide={renderSide}
      onResult={finish}
      onSession={showSigned}
    />
  );
}
