import { Member, TierCode } from 'api/proto-http/admin';
import { usePermissions } from 'components/managers/accounts/utils/permissions';
import { SECTION } from 'constants/routes';
import { useState } from 'react';
import { ConfirmationModal } from 'ui/components/confirmation-modal';
import { Button } from 'ui/components/button';
import Input from 'ui/components/input';
import Selector from 'ui/components/selector';
import Text from 'ui/components/text';
import {
  useHardEraseMember,
  useOverrideTier,
  useRevokeHackerStatus,
  useSetMemberStatus,
  useSoftDeleteMember,
} from '../../utils/hooks';
import { TIER_OPTIONS, TOGGLEABLE_STATUS_OPTIONS, formatTierLabel } from '../../utils/tier-utils';
import { SendEmailModal } from './send-email-modal';

export function MemberActions({ member }: { member: Member }) {
  const userId = member.userId!;
  const overrideTier = useOverrideTier();
  const setStatus = useSetMemberStatus();
  const softDelete = useSoftDeleteMember();
  const hardErase = useHardEraseMember();
  const revokeHacker = useRevokeHackerStatus();
  const { canWrite } = usePermissions();

  const [newTier, setNewTier] = useState<TierCode>(member.currentTier ?? 'TIER_CODE_MEMBER');
  const [reason, setReason] = useState('');
  const [status, setStatusValue] = useState<string>(
    member.status === 'frozen' ? 'frozen' : 'active',
  );

  const [deleteOpen, setDeleteOpen] = useState(false);
  const [eraseOpen, setEraseOpen] = useState(false);
  const [eraseConfirm, setEraseConfirm] = useState(false);
  const [emailOpen, setEmailOpen] = useState(false);

  const isErased = member.status === 'erased';
  const tierChanged = newTier !== member.currentTier;
  const statusChanged = status !== member.status;
  const isHacker = member.currentTier === 'TIER_CODE_HACKER';

  if (!canWrite(SECTION.members)) return null;

  const handleOverride = () => {
    if (!tierChanged || !reason.trim()) return;
    overrideTier.mutate(
      { userId, newTier, reason: reason.trim() },
      { onSuccess: () => setReason('') },
    );
  };

  return (
    <div className='flex flex-col gap-5 border border-textInactiveColor p-4'>
      <Text variant='uppercase' size='default'>
        Actions
      </Text>

      {isErased && <Text variant='inactive'>This account is erased. Actions are disabled.</Text>}

      {/* Manual tier override */}
      <div className='flex flex-col gap-2'>
        <Text variant='inactive' size='small'>
          Manual tier change
        </Text>
        <div className='flex flex-wrap gap-2 items-center'>
          <span className='inline-block px-2 py-0.5 bg-textInactiveColor/30'>
            <Text>{formatTierLabel(member.currentTier, member.currentTierDisplay)}</Text>
          </span>
          <Text variant='inactive'>&rarr;</Text>
          <Selector
            label='New tier'
            options={TIER_OPTIONS}
            value={newTier}
            onChange={(v: string) => setNewTier(v as TierCode)}
            disabled={isErased}
          />
        </div>
        <Input
          name='reason'
          type='text'
          placeholder='reason (required)'
          value={reason}
          onChange={(e: React.ChangeEvent<HTMLInputElement>) => setReason(e.target.value)}
          disabled={isErased}
          className='w-full'
        />
        <Button
          variant='main'
          size='lg'
          onClick={handleOverride}
          disabled={isErased || !tierChanged || !reason.trim()}
          loading={overrideTier.isPending}
        >
          Override tier
        </Button>
      </div>

      {/* Status toggle */}
      <div className='flex flex-col gap-2'>
        <Text variant='inactive' size='small'>
          Status (active ↔ frozen)
        </Text>
        <div className='flex flex-wrap gap-2 items-center'>
          <Selector
            label='Status'
            options={TOGGLEABLE_STATUS_OPTIONS}
            value={status}
            onChange={(v: string) => setStatusValue(v)}
            disabled={isErased || member.status === 'deleted'}
          />
          <Button
            variant='main'
            size='lg'
            onClick={() => setStatus.mutate({ userId, status })}
            disabled={isErased || !statusChanged}
            loading={setStatus.isPending}
          >
            Update status
          </Button>
        </div>
      </div>

      {/* Hacker revoke */}
      {isHacker && (
        <div className='flex flex-col gap-2'>
          <Text variant='inactive' size='small'>
            Hacker
          </Text>
          <Button
            variant='secondary'
            size='lg'
            onClick={() => revokeHacker.mutate({ userId })}
            loading={revokeHacker.isPending}
          >
            Revoke hacker status
          </Button>
        </div>
      )}

      {/* Communication + destructive */}
      <div className='flex flex-wrap gap-2'>
        <Button
          variant='secondary'
          size='lg'
          onClick={() => setEmailOpen(true)}
          disabled={isErased}
        >
          Send custom email
        </Button>
        <Button
          variant='secondary'
          size='lg'
          onClick={() => setDeleteOpen(true)}
          disabled={isErased || member.status === 'deleted'}
        >
          Soft-delete account
        </Button>
        <Button
          variant='secondary'
          size='lg'
          onClick={() => {
            setEraseConfirm(false);
            setEraseOpen(true);
          }}
          disabled={isErased}
          className='!text-error !border-error hover:!bg-error hover:!text-bgColor'
        >
          Erase account (GDPR)
        </Button>
      </div>

      <SendEmailModal open={emailOpen} onOpenChange={setEmailOpen} userId={userId} />

      <ConfirmationModal
        open={deleteOpen}
        onOpenChange={setDeleteOpen}
        onConfirm={() => softDelete.mutate({ userId })}
      >
        <Text variant='uppercase'>Soft-delete account</Text>
        <Text variant='inactive' className='mt-2'>
          This sets the account status to “deleted”. The member can be restored by reactivating.
        </Text>
      </ConfirmationModal>

      <ConfirmationModal
        open={eraseOpen}
        onOpenChange={setEraseOpen}
        confirmDisabled={!eraseConfirm}
        onConfirm={() => hardErase.mutate({ userId, confirm: true })}
        onCancel={() => setEraseConfirm(false)}
      >
        <Text variant='uppercase' className='text-error'>
          Hard-erase account (irreversible)
        </Text>
        <Text variant='inactive' className='mt-2'>
          GDPR right-to-erasure. This permanently removes personal data and cannot be undone.
        </Text>
        <label className='mt-3 flex items-center gap-2 cursor-pointer'>
          <input
            type='checkbox'
            checked={eraseConfirm}
            onChange={(e) => setEraseConfirm(e.target.checked)}
          />
          <Text>I understand this is permanent</Text>
        </label>
      </ConfirmationModal>
    </div>
  );
}
