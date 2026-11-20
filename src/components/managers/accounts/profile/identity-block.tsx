import { useQueryClient } from '@tanstack/react-query';
import { authService } from 'api/api';
import type { MyProfile } from 'api/proto-http/auth';
import { errMessage } from 'components/auth/api-error';
import { readLogo } from 'components/auth/logo';
import { normalUsername, goodUsername, refusalOf, type Field } from 'components/welcome/model';
import { useDockBottom } from 'hooks/useDockBottom';
import { cn } from 'lib/utility';
import { type ChangeEvent, useEffect, useRef, useState } from 'react';
import { Button, Input, Section, Text, useDoneFlash } from 'ui';
import { SpecialtiesField } from '../components/specialties-field';
import { type Avatar, runSave } from './model';
import { BLOCK_BUTTON, Line, myProfileKey } from './parts';

// The `profile` block of profile `b`: avatar square · first name, last name, @username · email
// (read only), specialties; `log out` at its foot leaves this device. Names, @username and the
// avatar save from the dock at the foot of the screen; specialties save as they are picked
// (the product's SpecialtiesField).

const SQUARE =
  'relative flex size-30 flex-none items-center justify-center overflow-hidden border bg-bgColor md:size-32';
const HATCH =
  'bg-[repeating-linear-gradient(135deg,var(--color-bgColor)_0_6px,var(--color-hairline)_6px_7px)]';

function AvatarSquare({
  src,
  bad,
  onPick,
  onBad,
  onRemove,
}: {
  src: string;
  bad: boolean;
  onPick: (base64: string, preview: string) => void;
  onBad: () => void;
  onRemove: () => void;
}) {
  const pick = async (file: File | undefined) => {
    if (!file) return;
    const read = await readLogo(file);
    if (!read) return onBad();
    onPick(read.base64, read.preview);
  };
  return (
    <div className='flex flex-col items-start gap-2'>
      <label
        className={cn(
          SQUARE,
          'cursor-pointer transition-colors duration-150 ease-out hover:border-textColor has-[:focus-visible]:outline has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-textColor',
          bad ? 'border-error' : 'border-borderColor',
          !src && HATCH,
        )}
      >
        <input
          type='file'
          accept='image/png,image/jpeg'
          aria-label='avatar'
          aria-invalid={bad || undefined}
          className='pointer-events-none absolute size-px opacity-0'
          onChange={(e) => {
            void pick(e.target.files?.[0]);
            e.target.value = '';
          }}
        />
        {src ? (
          <img src={src} alt='avatar' className='block size-full object-cover' />
        ) : (
          <Text size='micro' variant='label' component='span' className='bg-bgColor px-1'>
            avatar
          </Text>
        )}
      </label>
      {src && (
        <Button variant='underline' onClick={onRemove}>
          remove
        </Button>
      )}
    </div>
  );
}

export function ProfileIdentity({
  profile,
  handle,
  specialties,
  specialtiesEditable,
  onLogOut,
}: {
  profile: MyProfile;
  handle: string;
  specialties: string[] | undefined;
  specialtiesEditable: boolean;
  onLogOut: () => void;
}) {
  const qc = useQueryClient();
  const saved = useDoneFlash();
  const dockRef = useRef<HTMLDivElement>(null);
  const start = {
    firstName: profile.firstName ?? '',
    lastName: profile.lastName ?? '',
    username: profile.publicUsername || handle,
  };
  const startKey = `${start.firstName}|${start.lastName}|${start.username}|${profile.avatarUrl ?? ''}`;
  const [firstName, setFirstName] = useState(start.firstName);
  const [lastName, setLastName] = useState(start.lastName);
  const [username, setUsername] = useState(start.username);
  const [avatar, setAvatar] = useState<Avatar>({ kind: 'keep' });
  const [preview, setPreview] = useState('');
  const [busy, setBusy] = useState(false);
  const [bad, setBad] = useState<Field>('');
  const [refused, setRefused] = useState('');

  // a new answer (save, refresh) is the new start
  useEffect(() => {
    setFirstName(start.firstName);
    setLastName(start.lastName);
    setUsername(start.username);
    setAvatar({ kind: 'keep' });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [startKey]);

  // an object URL lives until the next pick or the page goes
  useEffect(
    () => () => {
      if (preview.startsWith('blob:')) URL.revokeObjectURL(preview);
    },
    [preview],
  );

  const dirty =
    firstName !== start.firstName ||
    lastName !== start.lastName ||
    normalUsername(username) !== start.username ||
    avatar.kind !== 'keep';
  const showDock = dirty || saved.on || !!refused;
  useDockBottom(dockRef, [showDock]);

  const shownAvatar =
    avatar.kind === 'new' ? preview : avatar.kind === 'none' ? '' : profile.avatarUrl ?? '';

  const save = async () => {
    if (busy || !dirty) return;
    if (!goodUsername(username)) {
      setBad('username');
      setRefused('bad username');
      return;
    }
    setBusy(true);
    setBad('');
    setRefused('');
    try {
      await runSave(
        { firstName, lastName, username, avatar, hadAvatar: !!profile.avatarUrl },
        {
          updateProfile: (r) => authService.UpdateMyProfile(r),
          setAvatar: (r) => authService.SetMyAvatar(r),
        },
        normalUsername,
      );
      saved.flash();
      await qc.invalidateQueries({ queryKey: myProfileKey });
      void qc.invalidateQueries({ queryKey: ['admins'] });
    } catch (e) {
      const r = refusalOf(errMessage(e));
      setBad(r.field);
      setRefused(r.note === 'bad photo' ? 'bad avatar' : r.note);
    } finally {
      setBusy(false);
    }
  };

  const clearBad = (f: Field) => {
    if (bad === f) {
      setBad('');
      setRefused('');
    }
  };

  const box = 'h-[1.625rem]';

  return (
    <>
      <Section title='profile' headerClassName='[&_h3]:normal-case'>
        <div className='grid grid-cols-1 gap-4 md:grid-cols-[8rem_minmax(0,1fr)]'>
          <AvatarSquare
            src={shownAvatar}
            bad={bad === 'photo'}
            onPick={(base64, p) => {
              clearBad('photo');
              setPreview(p);
              setAvatar({ kind: 'new', base64 });
            }}
            onBad={() => {
              setBad('photo');
              setRefused('bad avatar');
            }}
            onRemove={() => {
              clearBad('photo');
              setAvatar({ kind: 'none' });
            }}
          />
          <div className='flex min-w-0 flex-col'>
            <Line label='first name'>
              <Input
                name='firstName'
                aria-label='first name'
                value={firstName}
                maxLength={60}
                autoComplete='given-name'
                spellCheck={false}
                aria-invalid={bad === 'name' || undefined}
                className={box}
                onChange={(e: ChangeEvent<HTMLInputElement>) => {
                  setFirstName(e.target.value);
                  clearBad('name');
                }}
              />
            </Line>
            <Line label='last name'>
              <Input
                name='lastName'
                aria-label='last name'
                value={lastName}
                maxLength={60}
                autoComplete='family-name'
                spellCheck={false}
                aria-invalid={bad === 'name' || undefined}
                className={box}
                onChange={(e: ChangeEvent<HTMLInputElement>) => {
                  setLastName(e.target.value);
                  clearBad('name');
                }}
              />
            </Line>
            <Line label='username'>
              <div className='relative min-w-0'>
                <span
                  aria-hidden
                  className='pointer-events-none absolute inset-y-px left-px flex select-none items-center pl-2 text-labelColor'
                >
                  @
                </span>
                <Input
                  name='username'
                  aria-label='username'
                  value={username}
                  maxLength={31}
                  autoComplete='username'
                  autoCapitalize='none'
                  spellCheck={false}
                  aria-invalid={bad === 'username' || !goodUsername(username) || undefined}
                  className={cn(box, 'pl-5')}
                  onChange={(e: ChangeEvent<HTMLInputElement>) => {
                    setUsername(normalUsername(e.target.value));
                    clearBad('username');
                  }}
                />
              </div>
            </Line>
          </div>
          <div className='flex min-w-0 flex-col md:col-start-2'>
            <Line label='email'>
              <span className='min-w-0 break-words py-1'>{profile.email}</span>
            </Line>
            <Line label='specialties' top>
              <SpecialtiesField
                username={handle}
                specialties={specialties}
                editable={specialtiesEditable}
              />
            </Line>
          </div>
        </div>
        <div className='flex justify-end gap-3 border-t border-hairline pt-2.5'>
          <Button variant='secondary' className={BLOCK_BUTTON} onClick={onLogOut}>
            log out
          </Button>
        </div>
      </Section>

      {showDock && (
        <div
          ref={dockRef}
          className='fixed inset-x-0 bottom-0 z-40 flex items-center justify-between gap-3 border-t border-borderColor bg-bgColor px-3 py-2'
        >
          {refused ? (
            <Text component='span' variant='errorLabel' size='small' role='alert'>
              {refused}
            </Text>
          ) : (
            <Text component='span' variant='label' size='small'>
              {saved.on && !dirty ? 'saved' : 'unsaved'}
            </Text>
          )}
          <Button
            type='button'
            variant='main'
            className='px-4 py-1.5'
            disabled={busy || !dirty}
            loading={busy}
            onClick={() => void save()}
          >
            save
          </Button>
        </div>
      )}
    </>
  );
}
