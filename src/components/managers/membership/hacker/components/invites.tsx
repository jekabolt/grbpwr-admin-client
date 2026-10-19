import { GenerateHackerInviteResponse } from 'api/proto-http/admin';
import { usePermissions } from 'components/managers/accounts/utils/permissions';
import { SECTION } from 'constants/routes';
import { useState } from 'react';
import { errorSentence, isRefusal } from 'components/shared/notify-failure';
import { Button, CalloutBox, CopyToClipboard, Input, Section, Text, EmptyCell } from 'ui';
import { formatDateShort } from '../../../orders-catalog/components/utility';
import {
  useGenerateHackerInvite,
  useHackerInvites,
  useRevokeHackerInvite,
} from '../../utils/hooks';

export function HackerInvites() {
  const generate = useGenerateHackerInvite();
  const revoke = useRevokeHackerInvite();
  const [activeOnly, setActiveOnly] = useState(true);
  const { data, isLoading } = useHackerInvites(activeOnly);
  const { canWrite } = usePermissions();

  const [email, setEmail] = useState('');
  const [expiresInDays, setExpiresInDays] = useState('14');
  const [lastGenerated, setLastGenerated] = useState<GenerateHackerInviteResponse | null>(null);
  // The server's refusal of the form stands under it until the next attempt.
  const [refusal, setRefusal] = useState<string | null>(null);

  const invites = data?.invites ?? [];

  const handleGenerate = () => {
    setRefusal(null);
    generate.mutate(
      {
        email: email || undefined,
        expiresInDays: expiresInDays ? Number(expiresInDays) : undefined,
      },
      {
        onSuccess: (res) => {
          setLastGenerated(res);
          setEmail('');
        },
        onError: (e) => isRefusal(e) && setRefusal(errorSentence(e, 'not generated')),
      },
    );
  };

  return (
    <Section title='invites'>
      {/* Generate */}
      {canWrite(SECTION.members) && (
        <div className='flex flex-wrap gap-3 items-end'>
          <div className='flex flex-col gap-1'>
            <Text variant='inactive' size='small'>
              Pre-bound email (optional)
            </Text>
            <Input
              name='inviteEmail'
              type='email'
              placeholder='someone@example.com'
              value={email}
              onChange={(e: React.ChangeEvent<HTMLInputElement>) => setEmail(e.target.value)}
              className='w-56'
            />
          </div>
          <div className='flex flex-col gap-1'>
            <Text variant='inactive' size='small'>
              Expires in (days)
            </Text>
            <Input
              name='expiresInDays'
              type='number'
              value={expiresInDays}
              onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                setExpiresInDays(e.target.value)
              }
              className='w-24'
            />
          </div>
          <Button variant='main' size='lg' onClick={handleGenerate} loading={generate.isPending}>
            Generate invite
          </Button>
        </div>
      )}

      {refusal && (
        <CalloutBox tone='error'>
          <Text size='micro' component='span' role='alert'>
            <b>not generated</b> · {refusal}
          </Text>
        </CalloutBox>
      )}

      {lastGenerated && (
        <CalloutBox tone='note' className='flex flex-col gap-1 bg-highlightColor/10'>
          <Text variant='inactive' size='small'>
            One-time invite link (copy now — token is shown only once):
          </Text>
          <div className='flex items-center gap-2 break-all'>
            <Text size='small'>{lastGenerated.inviteUrl}</Text>
            <CopyToClipboard text={lastGenerated.inviteUrl ?? ''} />
          </div>
          <Text variant='inactive' size='small'>
            Expires {formatDateShort(lastGenerated.expiresAt, true)}
          </Text>
        </CalloutBox>
      )}

      {/* List */}
      <label className='flex items-center gap-2 cursor-pointer'>
        <input
          type='checkbox'
          checked={activeOnly}
          onChange={(e) => setActiveOnly(e.target.checked)}
        />
        <Text size='small'>active invites only</Text>
      </label>

      <div className='overflow-x-auto w-full'>
        <table className='w-full border-collapse border border-borderColor min-w-max'>
          <thead className='bg-borderColor h-9'>
            <tr>
              {['ID', 'Email', 'Created by', 'Created', 'Expires', 'Status', ''].map((h) => (
                <th key={h} className='border border-borderColor px-2 h-9'>
                  <Text variant='uppercase' size='small'>
                    {h}
                  </Text>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {invites.length === 0 ? (
              <tr>
                <td colSpan={7} className='text-center py-6'>
                  <Text variant='inactive'>{isLoading ? 'loading…' : 'no invites'}</Text>
                </td>
              </tr>
            ) : (
              invites.map((inv) => {
                const statusLabel = inv.consumedAt
                  ? 'consumed'
                  : inv.revokedAt
                    ? 'revoked'
                    : inv.active
                      ? 'active'
                      : 'expired';
                return (
                  <tr key={inv.id} className='border-b border-borderColor last:border-b-0 h-9'>
                    <td className='border border-borderColor text-center px-2'>
                      <Text size='small'>{inv.id}</Text>
                    </td>
                    <td className='border border-borderColor text-center px-2'>
                      <Text size='small'>{inv.email || <EmptyCell />}</Text>
                    </td>
                    <td className='border border-borderColor text-center px-2'>
                      <Text size='small'>{inv.createdBy || <EmptyCell />}</Text>
                    </td>
                    <td className='border border-borderColor text-center px-2'>
                      <Text size='small'>{formatDateShort(inv.createdAt)}</Text>
                    </td>
                    <td className='border border-borderColor text-center px-2'>
                      <Text size='small'>{formatDateShort(inv.expiresAt)}</Text>
                    </td>
                    <td className='border border-borderColor text-center px-2'>
                      <Text size='small'>{statusLabel}</Text>
                    </td>
                    <td className='border border-borderColor text-center px-2'>
                      {inv.active && canWrite(SECTION.members) && (
                        <Button
                          variant='underline'
                          onClick={() => revoke.mutate({ inviteId: inv.id! })}
                        >
                          revoke
                        </Button>
                      )}
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </Section>
  );
}
