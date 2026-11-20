import { useQueryClient } from '@tanstack/react-query';
import { authService } from 'api/api';
import type { MyProfile } from 'api/proto-http/auth';
import { errMessage } from 'components/auth/api-error';
import { cn } from 'lib/utility';
import { type ChangeEvent, useState } from 'react';
import { Button, CheckboxCommon, Input, Section } from 'ui';
import { MIN_PASSWORD, passwordReady, passwordRefusal, passwordWord, serverWord } from './model';
import { BLOCK_BUTTON, Line, myProfileKey, mySessionsKey, Note } from './parts';

// The `password` block: at rest one header line `password · changed 3 mo ago` + `change`; open,
// current / new with `show`, `sign out others` (on), `forgot password`, `wrong password` under
// the current one. An account that signs in only with Google sets its first password here.

function PasswordBox({
  id,
  label,
  value,
  invalid,
  autoComplete,
  onChange,
}: {
  id: string;
  label: string;
  value: string;
  invalid?: boolean;
  autoComplete: string;
  onChange: (v: string) => void;
}) {
  const [shown, setShown] = useState(false);
  return (
    <div className='relative min-w-0'>
      <Input
        name={id}
        type={shown ? 'text' : 'password'}
        aria-label={label}
        value={value}
        autoComplete={autoComplete}
        spellCheck={false}
        aria-invalid={invalid || undefined}
        className='h-[1.625rem] pr-13'
        onChange={(e: ChangeEvent<HTMLInputElement>) => onChange(e.target.value)}
      />
      <Button
        className='absolute inset-y-px right-px bg-bgColor px-2'
        aria-pressed={shown}
        onClick={() => setShown((s) => !s)}
      >
        {shown ? 'hide' : 'show'}
      </Button>
    </div>
  );
}

export function ProfilePassword({ profile }: { profile: MyProfile }) {
  const qc = useQueryClient();
  const set = !!profile.passwordSet;
  const [open, setOpen] = useState(false);
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [signOutOthers, setSignOutOthers] = useState(true);
  const [badCurrent, setBadCurrent] = useState('');
  const [refused, setRefused] = useState<{ field: 'current' | 'new' | ''; word: string } | null>(
    null,
  );
  const [busy, setBusy] = useState(false);
  const [letter, setLetter] = useState<'' | 'sent' | 'busy'>('');

  const when = passwordWord(set, profile.passwordChangedAt);
  const label = set ? 'change' : 'set password';

  const close = () => {
    setOpen(false);
    setCurrent('');
    setNext('');
    setBadCurrent('');
    setRefused(null);
    setLetter('');
  };

  const submit = async () => {
    if (busy || !passwordReady(set, current, next, badCurrent)) return;
    setBusy(true);
    setRefused(null);
    try {
      const r = await authService.ChangeMyPassword({
        currentPassword: set ? current : '',
        newPassword: next,
        signOutOthers,
      });
      qc.setQueryData<{ profile: MyProfile | undefined }>(myProfileKey, (old) =>
        old?.profile
          ? {
              profile: {
                ...old.profile,
                passwordSet: true,
                passwordChangedAt: r.passwordChangedAt ?? new Date().toISOString(),
              },
            }
          : old,
      );
      void qc.invalidateQueries({ queryKey: myProfileKey });
      if (signOutOthers) void qc.invalidateQueries({ queryKey: mySessionsKey });
      close();
    } catch (e) {
      const r = passwordRefusal(errMessage(e));
      if (r.field === 'current') setBadCurrent(current);
      setRefused(r);
    } finally {
      setBusy(false);
    }
  };

  const forgot = async () => {
    if (letter || !profile.email) return;
    setLetter('busy');
    try {
      await authService.RequestPasswordReset({ email: profile.email });
      setLetter('sent');
    } catch (e) {
      setLetter('');
      setRefused({ field: '', word: serverWord(errMessage(e)) });
    }
  };

  const action = !open ? (
    <Button variant='underline' onClick={() => setOpen(true)}>
      {label}
    </Button>
  ) : undefined;

  const short = next.length > 0 && next.length < MIN_PASSWORD;
  const wrong = refused?.field === 'current' && current === badCurrent;

  return (
    <Section
      title='password'
      question={when || undefined}
      action={action}
      headerClassName={cn('[&_h3]:normal-case', !open && '!mb-0 !border-b-0 !pb-0')}
    >
      {open && (
        <form
          className='flex flex-col'
          onSubmit={(e) => {
            e.preventDefault();
            void submit();
          }}
        >
          <div className='flex flex-col md:max-w-[35rem]'>
            {set && (
              <Line label='current' top>
                <div className='flex min-w-0 flex-col gap-1'>
                  <PasswordBox
                    id='currentPassword'
                    label='current password'
                    value={current}
                    invalid={wrong}
                    autoComplete='current-password'
                    onChange={(v) => {
                      setCurrent(v);
                      if (refused?.field === 'current' && v !== badCurrent) setRefused(null);
                    }}
                  />
                  {wrong && <Note bad>{refused?.word}</Note>}
                </div>
              </Line>
            )}
            <Line label='new' top>
              <div className='flex min-w-0 flex-col gap-1'>
                <PasswordBox
                  id='newPassword'
                  label='new password'
                  value={next}
                  invalid={refused?.field === 'new'}
                  autoComplete='new-password'
                  onChange={(v) => {
                    setNext(v);
                    if (refused?.field === 'new') setRefused(null);
                  }}
                />
                {(short || refused?.field === 'new') && (
                  <Note bad={refused?.field === 'new'}>8+ characters</Note>
                )}
              </div>
            </Line>
            <Line label=''>
              <label className='inline-flex cursor-pointer items-center gap-2'>
                <CheckboxCommon
                  name='signOutOthers'
                  checked={signOutOthers}
                  onChange={(v) => setSignOutOthers(v === true)}
                />
                <span>sign out others</span>
              </label>
            </Line>
          </div>
          <div className='flex flex-wrap items-center justify-end gap-3 border-t border-hairline pt-2.5'>
            <span className='mr-auto max-md:basis-full'>
              {refused && !refused.field ? (
                <Note bad>{refused.word}</Note>
              ) : set ? (
                letter === 'sent' ? (
                  <Note>letter sent</Note>
                ) : (
                  <Button
                    variant='underline'
                    disabled={letter === 'busy'}
                    onClick={() => void forgot()}
                  >
                    forgot password
                  </Button>
                )
              ) : null}
            </span>
            <Button variant='secondary' className={BLOCK_BUTTON} onClick={close}>
              cancel
            </Button>
            <Button
              type='submit'
              variant='main'
              className={BLOCK_BUTTON}
              loading={busy}
              disabled={!passwordReady(set, current, next, badCurrent)}
            >
              {label}
            </Button>
          </div>
        </form>
      )}
    </Section>
  );
}
