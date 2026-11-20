import { useQueryClient } from '@tanstack/react-query';
import { authService } from 'api/api';
import type { MyProfile, TeamRef } from 'api/proto-http/auth';
import { errMessage } from 'components/auth/api-error';
import { currentHost } from 'lib/host';
import { type ChangeEvent, useState } from 'react';
import { Button, ConfirmationModal, Input, Section, Text } from 'ui';
import { confirmMatches, restoreUntil, serverWord, teamHostWord, untilWord } from './model';
import { BLOCK_BUTTON, myProfileKey, Note, PlainRow } from './parts';

// `delete account` (P0 §3.5, profile mockup version 3): the dialog lists the teams that close
// with the person and the day it can still be restored, then asks for the @username. While the
// person is the only owner of a team with other people it opens blocked, listing those teams.

function Teams({ label, teams }: { label: string; teams: TeamRef[] }) {
  const base = currentHost().base;
  return (
    <div className='flex flex-col'>
      <Text component='span' variant='label' size='micro' className='mb-1.5 block'>
        {label}
      </Text>
      <div className='flex flex-col'>
        {teams.map((t) => (
          <PlainRow key={t.slug} word={t.name || t.slug} quiet={teamHostWord(t, base)} />
        ))}
      </div>
    </div>
  );
}

/** The dialog's body: blocked by sole ownership, or the closing teams, the date and the box. */
export function DeleteBody({
  profile,
  typed,
  invalid,
  until,
  onType,
}: {
  profile: MyProfile;
  typed: string;
  invalid: boolean;
  until: Date;
  onType: (v: string) => void;
}) {
  const sole = profile.soleOwnerTeams ?? [];
  if (sole.length) return <Teams label='sole owner' teams={sole} />;
  const closing = profile.closingTeams ?? [];
  const want = `@${profile.publicUsername ?? ''}`;
  return (
    <div className='flex flex-col gap-3'>
      {closing.length > 0 && <Teams label='closes with you' teams={closing} />}
      <span className='block border-y border-hairline py-1.5'>
        restore until {untilWord(until)}
      </span>
      <label className='flex flex-col gap-1.5'>
        <Text component='span' variant='label' size='micro'>
          type {want}
        </Text>
        <Input
          name='confirmUsername'
          aria-label={`type ${want}`}
          value={typed}
          autoComplete='off'
          spellCheck={false}
          autoCapitalize='none'
          aria-invalid={invalid || undefined}
          onChange={(e: ChangeEvent<HTMLInputElement>) => onType(e.target.value)}
        />
      </label>
    </div>
  );
}

export function ProfileDelete({
  profile,
  onDeleted,
}: {
  profile: MyProfile;
  onDeleted: () => void;
}) {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [typed, setTyped] = useState('');
  const [busy, setBusy] = useState(false);
  const [refused, setRefused] = useState('');
  const [badConfirm, setBadConfirm] = useState(false);
  const username = profile.publicUsername ?? '';
  const blocked = (profile.soleOwnerTeams ?? []).length > 0;
  const can = !blocked && confirmMatches(typed, username) && !busy;

  const close = () => {
    setOpen(false);
    setTyped('');
    setRefused('');
    setBadConfirm(false);
  };

  const submit = async () => {
    if (!can) return;
    setBusy(true);
    setRefused('');
    try {
      await authService.DeleteMyAccount({ confirmUsername: username });
      close();
      onDeleted();
    } catch (e) {
      const m = errMessage(e);
      if (m.includes('bad_confirm')) setBadConfirm(true);
      else if (m.includes('sole_owner')) void qc.invalidateQueries({ queryKey: myProfileKey });
      else setRefused(serverWord(m));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Section>
      <div className='flex'>
        <Button
          variant='secondary'
          className={BLOCK_BUTTON}
          onClick={() => {
            setOpen(true);
            // the newest list of teams before the person decides
            void qc.invalidateQueries({ queryKey: myProfileKey });
          }}
        >
          delete account
        </Button>
      </div>
      <ConfirmationModal
        open={open}
        onOpenChange={(o) => (o ? setOpen(true) : close())}
        onCancel={close}
        onConfirm={() => void submit()}
        title='delete account'
        confirmLabel='delete'
        confirmDisabled={!can}
        closeOnConfirm={false}
        width='sm'
        lowercase
        sheet
        footerHint={refused ? <Note bad>{refused}</Note> : undefined}
      >
        <DeleteBody
          profile={profile}
          typed={typed}
          invalid={badConfirm}
          until={restoreUntil()}
          onType={(v) => {
            setTyped(v);
            setBadConfirm(false);
          }}
        />
      </ConfirmationModal>
    </Section>
  );
}
