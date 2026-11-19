import { useQuery, useQueryClient } from '@tanstack/react-query';
import { adminService, authService } from 'api/api';
import type { GetCurrentAccountResponse } from 'api/proto-http/admin';
import { errMessage } from 'components/auth/api-error';
import { readLogo } from 'components/auth/logo';
import { TeamMark } from 'components/auth/logo-step';
import {
  AuthSheet,
  SheetFoot,
  SheetForm,
  SheetInput,
  SheetLink,
  SheetRow,
  SheetSubmit,
  TeamSide,
} from 'components/auth/sheet';
import { accountsKeys, useCurrentAccount } from 'components/managers/accounts/utils/hooks';
import { useAdmins } from 'components/managers/tech-card/components/useRoles';
import { ROUTES } from 'constants/routes';
import { cn } from 'lib/utility';
import { useWorkspace } from 'lib/workspace/use-workspace';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Navigate, useNavigate } from 'react-router-dom';
import { AddDoor, Button, Chip, ChipRow, Input, Loader } from 'ui';

import {
  type Field,
  goodUsername,
  normalUsername,
  offeredSpecialties,
  type Photo,
  refusalOf,
  runContinue,
} from './model';

// `/welcome` — first entry `a` (P0 §4): once per team, right after joining it. The team plate on
// the left; on the right the person's photo, name, @username and specialties. `continue` saves it
// all and opens the team; `skip` only closes the screen for good.

const myProfileKey = ['myProfile'] as const;

export default function WelcomePage() {
  const { workspace, readOnly } = useWorkspace();
  const account = useCurrentAccount();
  const profile = useQuery({
    queryKey: myProfileKey,
    queryFn: () => authService.GetMyProfile({}),
    retry: false,
    staleTime: 0,
  });
  const admins = useAdmins();

  const ready = !!workspace && !profile.isLoading && !admins.isLoading;
  if (account.data && !account.data.workspace?.entryNeeded)
    return <Navigate to={ROUTES.main} replace />;
  if (!ready)
    return (
      <main className='min-h-screen bg-pageBg'>
        <Loader />
      </main>
    );

  const handle = account.data?.account?.username ?? '';
  const p = profile.data?.profile;
  const me = admins.data?.admins?.find((a) => a.username === handle);
  return (
    <WelcomeForm
      teamName={workspace.name}
      logoUrl={workspace.logoUrl}
      paused={readOnly}
      handle={handle}
      email={p?.email ?? ''}
      firstName={p?.firstName ?? ''}
      lastName={p?.lastName ?? ''}
      username={p?.publicUsername || handle}
      avatarUrl={p?.avatarUrl ?? ''}
      vocabulary={admins.data?.specialties ?? []}
      specialties={me?.specialties ?? []}
    />
  );
}

function WelcomeForm(props: {
  teamName: string;
  logoUrl?: string;
  paused: boolean;
  handle: string;
  email: string;
  firstName: string;
  lastName: string;
  username: string;
  avatarUrl: string;
  vocabulary: string[];
  specialties: string[];
}) {
  const qc = useQueryClient();
  const navigate = useNavigate();
  const [firstName, setFirstName] = useState(props.firstName);
  const [lastName, setLastName] = useState(props.lastName);
  const [username, setUsername] = useState(props.username);
  const [photo, setPhoto] = useState<Photo>({ kind: props.avatarUrl ? 'keep' : 'none' });
  const [preview, setPreview] = useState(props.avatarUrl);
  const [mine, setMine] = useState<string[]>(props.specialties);
  const [busy, setBusy] = useState<'' | 'continue' | 'skip'>('');
  const [note, setNote] = useState('');
  const [bad, setBad] = useState<Field>('');

  const offered = useMemo(
    () => offeredSpecialties(props.vocabulary, mine),
    [props.vocabulary, mine],
  );

  // an object URL lives until the next pick or the page goes
  useEffect(
    () => () => {
      if (preview.startsWith('blob:')) URL.revokeObjectURL(preview);
    },
    [preview],
  );

  const refuse = (e: unknown) => {
    const r = refusalOf(errMessage(e));
    setNote(r.note);
    setBad(r.field);
    setBusy('');
  };

  /** Leave for the team: the cached account stops asking for this screen at once. */
  const done = () => {
    qc.setQueryData<GetCurrentAccountResponse>(accountsKeys.current(), (old) =>
      old?.workspace ? { ...old, workspace: { ...old.workspace, entryNeeded: false } } : old,
    );
    void qc.invalidateQueries({ queryKey: accountsKeys.current() });
    void qc.invalidateQueries({ queryKey: ['admins'] });
    void qc.invalidateQueries({ queryKey: myProfileKey });
    navigate(ROUTES.main, { replace: true });
  };

  const submit = async () => {
    if (busy) return;
    if (!goodUsername(username)) {
      setNote('bad username');
      setBad('username');
      return;
    }
    setBusy('continue');
    setNote('');
    setBad('');
    try {
      await runContinue(
        { firstName, lastName, username, photo, hadPhoto: !!props.avatarUrl, specialties: mine },
        props.paused,
        {
          updateProfile: (r) => authService.UpdateMyProfile(r),
          setAvatar: (r) => authService.SetMyAvatar(r),
          setSpecialties: (r) =>
            adminService.SetAccountSpecialties({
              username: props.handle,
              specialtyIds: [],
              newSpecialties: r.specialties,
            }),
          finish: () => authService.FinishTeamEntry({}),
        },
      );
      done();
    } catch (e) {
      refuse(e);
    }
  };

  const skip = async () => {
    if (busy) return;
    setBusy('skip');
    setNote('');
    try {
      await authService.FinishTeamEntry({});
      done();
    } catch (e) {
      refuse(e);
    }
  };

  const toggle = (s: string) =>
    setMine((cur) =>
      cur.some((x) => x.toLowerCase() === s.toLowerCase())
        ? cur.filter((x) => x.toLowerCase() !== s.toLowerCase())
        : [...cur, s],
    );

  return (
    <AuthSheet
      side={
        <TeamSide
          name={props.teamName}
          sub={props.email}
          brand
          mark={props.logoUrl ? <TeamMark src={props.logoUrl} size='plate' /> : undefined}
        />
      }
    >
      <SheetForm title='profile' note={note} onSubmit={() => void submit()}>
        <div className='grid grid-cols-[5.5rem_minmax(0,1fr)] items-start gap-3 pb-2 pt-3.5 sm:grid-cols-[7rem_minmax(0,1fr)] sm:gap-5'>
          <PhotoSquare
            preview={photo.kind === 'none' ? '' : preview}
            bad={bad === 'photo'}
            onPick={(picked) => {
              if (!picked) {
                setBad('photo');
                setNote('bad photo');
                return;
              }
              if (bad === 'photo') {
                setBad('');
                setNote('');
              }
              setPreview(picked.preview);
              setPhoto({ kind: 'new', base64: picked.base64 });
            }}
            onRemove={() => setPhoto({ kind: 'none' })}
          />
          <div className='flex min-w-0 flex-col [&>*:first-child]:pt-0'>
            <SheetRow label='first name'>
              <SheetInput
                name='firstName'
                value={firstName}
                maxLength={60}
                autoComplete='given-name'
                invalid={bad === 'name'}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) => setFirstName(e.target.value)}
              />
            </SheetRow>
            <SheetRow label='last name'>
              <SheetInput
                name='lastName'
                value={lastName}
                maxLength={60}
                autoComplete='family-name'
                invalid={bad === 'name'}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) => setLastName(e.target.value)}
              />
            </SheetRow>
            <SheetRow label='username'>
              <div className='relative min-w-0'>
                <span
                  aria-hidden
                  className='pointer-events-none absolute inset-y-px left-px flex select-none items-center pl-2 text-labelColor'
                >
                  @
                </span>
                <SheetInput
                  name='username'
                  aria-label='username'
                  value={username}
                  maxLength={31}
                  autoComplete='username'
                  autoCapitalize='none'
                  invalid={bad === 'username'}
                  className='pl-5'
                  onChange={(e: React.ChangeEvent<HTMLInputElement>) => {
                    setUsername(normalUsername(e.target.value));
                    if (bad === 'username') {
                      setBad('');
                      setNote('');
                    }
                  }}
                />
              </div>
            </SheetRow>
          </div>
        </div>
        {!props.paused && (
          <div className='border-t border-hairline'>
            <SheetRow label='specialties' top>
              <Specialties offered={offered} mine={mine} onToggle={toggle} />
            </SheetRow>
          </div>
        )}
        <SheetFoot left={<SheetLink onClick={() => void skip()}>skip</SheetLink>}>
          <SheetSubmit loading={busy === 'continue'} disabled={busy === 'skip'}>
            continue
          </SheetSubmit>
        </SheetFoot>
      </SheetForm>
    </AuthSheet>
  );
}

const SQUARE = 'size-22 sm:size-28';

/** The photo square: the add door, or the picked photo (click it to pick another) with `remove`. */
function PhotoSquare({
  preview,
  bad,
  onPick,
  onRemove,
}: {
  preview: string;
  bad: boolean;
  onPick: (picked: Awaited<ReturnType<typeof readLogo>>) => void;
  onRemove: () => void;
}) {
  const file = useRef<HTMLInputElement>(null);
  const pick = async (f: File | undefined) => {
    if (f) onPick(await readLogo(f));
  };
  const drop = {
    onDragOver: (e: React.DragEvent) => e.preventDefault(),
    onDrop: (e: React.DragEvent) => {
      e.preventDefault();
      void pick(e.dataTransfer.files?.[0]);
    },
  };
  const input = (
    <input
      ref={file}
      type='file'
      accept='image/png,image/jpeg'
      aria-label='photo'
      aria-invalid={bad || undefined}
      tabIndex={preview ? 0 : -1}
      className='pointer-events-none absolute size-px opacity-0'
      onChange={(e) => {
        void pick(e.target.files?.[0]);
        e.target.value = '';
      }}
    />
  );
  if (!preview)
    return (
      <div className='relative'>
        {input}
        <AddDoor
          {...drop}
          shape='tile'
          lowercase
          aria-invalid={bad || undefined}
          className={cn(SQUARE, bad && 'border-error')}
          onClick={() => file.current?.click()}
        >
          photo
        </AddDoor>
      </div>
    );
  return (
    <div className='relative flex flex-col items-start gap-2'>
      <label
        {...drop}
        className={cn(
          'relative flex flex-none cursor-pointer overflow-hidden border bg-bgColor hover:border-textColor has-[:focus-visible]:outline has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-textColor',
          SQUARE,
          bad ? 'border-error' : 'border-borderColor',
        )}
      >
        {input}
        <img src={preview} alt='photo' className='block size-full object-cover' />
      </label>
      <SheetLink onClick={onRemove}>remove</SheetLink>
    </div>
  );
}

// the team's own words keep their case, as in the mockup
const WORD = 'normal-case tracking-normal';

/** The team's words as chips (the chosen ones inked), then `+ add a specialty` for an own word. */
function Specialties({
  offered,
  mine,
  onToggle,
}: {
  offered: string[];
  mine: string[];
  onToggle: (s: string) => void;
}) {
  const [adding, setAdding] = useState(false);
  const [typed, setTyped] = useState('');
  const has = (s: string) => mine.some((x) => x.toLowerCase() === s.toLowerCase());
  const commit = () => {
    const v = typed.trim();
    setTyped('');
    setAdding(false);
    if (v && !has(v)) onToggle(v);
  };
  return (
    <ChipRow>
      {offered.map((s) => (
        <Chip
          key={s}
          selected={has(s)}
          pressed={has(s)}
          className={WORD}
          onClick={() => onToggle(s)}
        >
          {s}
        </Chip>
      ))}
      {adding ? (
        <span className='inline-flex items-center gap-1'>
          <Input
            name='newSpecialty'
            aria-label='new specialty'
            value={typed}
            autoFocus
            autoComplete='off'
            className='w-40'
            onChange={(e: React.ChangeEvent<HTMLInputElement>) => setTyped(e.target.value)}
            onKeyDown={(e: React.KeyboardEvent<HTMLInputElement>) => {
              if (e.key === 'Escape') {
                setTyped('');
                setAdding(false);
                return;
              }
              if (e.key !== 'Enter') return;
              e.preventDefault();
              commit();
            }}
          />
          <Button size='xs' variant='secondary' onClick={commit}>
            add
          </Button>
        </span>
      ) : (
        <Chip dashed className={WORD} onClick={() => setAdding(true)}>
          + add a specialty
        </Chip>
      )}
    </ChipRow>
  );
}
