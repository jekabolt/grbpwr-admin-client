import type { FeatureInfo, PlatformTeam } from 'api/proto-http/admin';
import { type ChangeEvent, type KeyboardEvent, useRef, useState } from 'react';
import { Avatar, Button, ConfirmationModal, Input, Loader, Text } from 'ui';
import { FeatureSquare } from './feature-square';
import {
  canDelete,
  capChange,
  featureGroups,
  gb,
  isReadOnly,
  keptTillIfDeleted,
  seenWord,
} from './model';
import { useConsoleActions, useDeleteTeam, useTeamDetail } from './use-console';

/**
 * The `delete team` sheet: the operator's own password confirms it. The password lives only in this
 * component's state; the sheet is mounted while open, so closing it drops the password with it.
 */
function DeleteTeamSheet({ team, onClose }: { team: PlatformTeam; onClose: () => void }) {
  const slug = team.slug ?? '';
  const run = useDeleteTeam();
  const field = useRef<HTMLInputElement>(null);
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const close = () => {
    setPassword('');
    onClose();
  };

  const submit = async () => {
    if (!password || busy) return;
    setBusy(true);
    setError('');
    const refusal = await run(slug, password);
    setBusy(false);
    if (!refusal) return close();
    if (refusal === 'wrong password') setPassword('');
    setError(refusal);
    field.current?.focus();
  };

  return (
    <ConfirmationModal
      open
      width='sm'
      lowercase
      sheet
      title={`delete ${team.name || slug}`}
      confirmLabel='delete'
      cancelLabel='cancel'
      confirmDisabled={!password || busy}
      closeOnConfirm={false}
      cancelDisabled={busy}
      onConfirm={submit}
      onOpenChange={(v) => {
        if (!v && !busy) close();
      }}
      onOpenAutoFocus={(e) => {
        e.preventDefault();
        field.current?.focus();
      }}
    >
      <div className='flex flex-col gap-3'>
        <div>
          <Text variant='label' component='span'>
            kept till{' '}
          </Text>
          {keptTillIfDeleted()}
        </div>
        <div className='flex flex-col gap-1'>
          <Text
            variant='label'
            size='micro'
            tracking='label'
            component='label'
            htmlFor='console-delete-password'
          >
            password
          </Text>
          <Input
            ref={field}
            name='console-delete-password'
            type='password'
            autoComplete='current-password'
            value={password}
            aria-invalid={!!error}
            onChange={(e: ChangeEvent<HTMLInputElement>) => setPassword(e.target.value)}
            onKeyDown={(e: KeyboardEvent<HTMLInputElement>) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                submit();
              }
            }}
          />
          {error && (
            <Text variant='errorLabel' role='alert'>
              {error}
            </Text>
          )}
        </div>
      </div>
    </ConfirmationModal>
  );
}

/**
 * The operator's cap: gb, `no cap`, save. An emptied field saves the team back to the installation's
 * default, which the empty field shows as its placeholder.
 */
function CapControl({ team }: { team: PlatformTeam }) {
  const slug = team.slug ?? '';
  const act = useConsoleActions();
  const capBytes = Number(team.storageCapBytes ?? 0) || 0;
  const followsDefault = !!team.storageCapDefault;
  const initialNo = !followsDefault && capBytes === 0;
  const initialField = followsDefault || initialNo ? '' : gb(capBytes);
  const [field, setField] = useState(initialField);
  const [noCap, setNoCap] = useState(initialNo);
  const change = capChange(field, noCap);
  const dirty = field !== initialField || noCap !== initialNo;
  const busy = act.savingCap(slug);

  const save = async () => {
    if (!change || !dirty || busy) return;
    await act.setStorageCap(slug, change); // the row's new cap remounts this control (key)
  };

  return (
    <>
      <span className='inline-flex items-center gap-1.5'>
        <Text variant='label' size='micro' component='label' htmlFor={`cap-${slug}`}>
          cap
        </Text>
        <Input
          name={`cap-${slug}`}
          inputMode='decimal'
          className='w-16 text-right tabular-nums'
          value={noCap ? '' : field}
          placeholder={followsDefault && !noCap ? gb(capBytes) : undefined}
          disabled={noCap}
          aria-label='cap in gb'
          onChange={(e: ChangeEvent<HTMLInputElement>) => setField(e.target.value)}
          onKeyDown={(e: KeyboardEvent<HTMLInputElement>) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              save();
            }
          }}
        />
        <Text variant='label' size='micro' component='span'>
          gb
        </Text>
      </span>
      <FeatureSquare name={`nocap-${slug}`} checked={noCap} onChange={setNoCap}>
        no cap
      </FeatureSquare>
      <Button
        variant='main'
        className='whitespace-nowrap px-3 py-0.5'
        disabled={!change || !dirty || busy}
        onClick={save}
      >
        save
      </Button>
    </>
  );
}

/** The unfolded team row: on the phone the team's switches, then read only, delete and the people. */
export function TeamDetail({
  team,
  catalog,
  teamOne,
  onFeature,
  onReadOnly,
}: {
  team: PlatformTeam;
  catalog: FeatureInfo[];
  /** Team #1 can never go read-only or be deleted (the server refuses `team_one`). */
  teamOne: boolean;
  onFeature: (key: string, on: boolean) => void;
  onReadOnly: (on: boolean) => void;
}) {
  const slug = team.slug ?? '';
  const detail = useTeamDetail(slug);
  const people = detail.data?.members ?? [];
  const ro = isReadOnly(team);
  const on = new Set(team.features ?? []);
  const [deleting, setDeleting] = useState(false);

  return (
    <div className='sticky left-0 flex w-[100cqw] flex-col gap-1.5 px-3 pb-3.5 pt-2.5'>
      <div className='md:hidden'>
        {featureGroups(catalog).map((g) => (
          <div key={g.group} className='border-b border-hairline py-1'>
            <div className='pt-1.5 text-micro font-bold tracking-group text-labelColor'>
              {g.group}
            </div>
            <div className='flex flex-wrap gap-x-4'>
              {g.items.map((f) => {
                const key = f.key ?? '';
                return (
                  <FeatureSquare
                    key={key}
                    name={`fp-${slug}-${key}`}
                    checked={on.has(key)}
                    locked={!!f.teamOneOnly}
                    onChange={(v) => onFeature(key, v)}
                  >
                    {f.title}
                  </FeatureSquare>
                );
              })}
            </div>
          </div>
        ))}
      </div>
      <div className='flex min-h-8 flex-wrap items-center gap-x-4 gap-y-2 border-b border-borderColor pb-1 md:gap-x-5'>
        <span className='mr-auto text-micro font-bold tracking-group text-labelColor'>people</span>
        <CapControl key={`${team.storageCapBytes}-${team.storageCapDefault}`} team={team} />
        <FeatureSquare name={`ro-${slug}`} checked={ro} locked={teamOne} onChange={onReadOnly}>
          read only
        </FeatureSquare>
        {canDelete(team, teamOne) && (
          <Button variant='underline' onClick={() => setDeleting(true)}>
            delete
          </Button>
        )}
      </div>
      {deleting && <DeleteTeamSheet team={team} onClose={() => setDeleting(false)} />}
      {detail.isLoading ? (
        <Loader />
      ) : (
        <div className='grid grid-cols-1 gap-x-8 md:grid-cols-[repeat(auto-fill,minmax(16.25rem,1fr))]'>
          {people.map((p) => {
            const who = p.handle || p.email || '';
            const seen = seenWord(p.lastSeenAt);
            return (
              <div
                key={who}
                className='flex min-h-9 min-w-0 items-center gap-2 border-b border-hairline py-1'
              >
                <Avatar name={who} size={20} />
                <span className='min-w-0 flex-1 truncate'>{who}</span>
                <Text variant='label' size='micro' className='whitespace-nowrap'>
                  {p.role}
                </Text>
                {seen !== '—' && (
                  <Text variant='label' size='micro' className='whitespace-nowrap'>
                    seen {seen}
                  </Text>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
