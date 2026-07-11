import { Member } from 'api/proto-http/admin';
import { ROUTES } from 'constants/routes';
import { Link, useParams } from 'react-router-dom';
import { Button } from 'ui/components/button';
import Text from 'ui/components/text';
import { formatDateShort } from '../../orders-catalog/components/utility';
import { useMember, useTierHistory } from '../utils/hooks';
import {
  formatEur,
  formatStatusLabel,
  formatTierLabel,
  getStatusColor,
  getTierColor,
} from '../utils/tier-utils';
import { MemberActions } from './components/member-actions';
import { TierHistoryTable } from './components/tier-history-table';

function InfoRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className='flex gap-2'>
      <Text variant='inactive' size='small' className='min-w-36 shrink-0'>
        {label}
      </Text>
      <Text size='small'>{value || '-'}</Text>
    </div>
  );
}

function boolLabel(v: boolean | undefined): string {
  return v ? 'yes' : 'no';
}

export function MemberDetails() {
  const { id } = useParams();
  const userId = id ? parseInt(id, 10) : NaN;
  const validId = !Number.isNaN(userId);

  const { data: memberData, isLoading, isError, error } = useMember(validId ? userId : null);
  const { data: historyData } = useTierHistory(validId ? userId : null);

  const member: Member | undefined = memberData?.member;

  return (
    <div className='flex flex-col w-full gap-4 pb-16'>
      <div className='flex items-center justify-between'>
        <Text variant='uppercase' size='large'>
          Member detail
        </Text>
        <Button variant='secondary' size='lg' asChild>
          <Link to={ROUTES.members}>Back to members</Link>
        </Button>
      </div>

      {!validId && <Text variant='error'>Invalid member id</Text>}
      {isLoading && <Text variant='inactive'>Loading…</Text>}
      {isError && (
        <Text variant='error'>{error instanceof Error ? error.message : 'Failed to load'}</Text>
      )}

      {member && (
        <>
          <div className='grid grid-cols-1 lg:grid-cols-2 gap-4'>
            {/* Profile */}
            <div className='flex flex-col gap-2 border border-textInactiveColor p-4'>
              <Text variant='uppercase' size='default'>
                Profile
              </Text>
              <InfoRow label='User ID' value={member.userId} />
              <InfoRow label='Name' value={member.name} />
              <InfoRow label='Email' value={member.email} />
              <InfoRow label='Phone' value={member.phone} />
              <InfoRow label='Date of birth' value={formatDateShort(member.birthDate)} />
              <InfoRow label='Registered' value={formatDateShort(member.createdAt)} />
              <InfoRow label='Last order' value={formatDateShort(member.lastOrderDate)} />
              <InfoRow label='Newsletter' value={boolLabel(member.subscribeNewsletter)} />
              <InfoRow label='New arrivals' value={boolLabel(member.subscribeNewArrivals)} />
              <InfoRow label='Events' value={boolLabel(member.subscribeEvents)} />
            </div>

            {/* Membership */}
            <div className='flex flex-col gap-2 border border-textInactiveColor p-4'>
              <Text variant='uppercase' size='default'>
                Membership
              </Text>
              <InfoRow
                label='Current tier'
                value={
                  <span className={`inline-block px-2 py-0.5 ${getTierColor(member.currentTier)}`}>
                    {formatTierLabel(member.currentTier, member.currentTierDisplay)}
                  </span>
                }
              />
              <InfoRow
                label='Status'
                value={
                  <span className={`inline-block px-2 py-0.5 ${getStatusColor(member.status)}`}>
                    {formatStatusLabel(member.status)}
                  </span>
                }
              />
              <InfoRow
                label='Qualifying spend (12mo)'
                value={formatEur(member.qualifyingSpendEur12mo)}
              />
              <InfoRow label='Tier upgrade date' value={formatDateShort(member.tierUpgradeDate)} />
              <InfoRow label='Next review' value={formatDateShort(member.nextReviewDate)} />
            </div>
          </div>

          <MemberActions member={member} />

          <div className='flex flex-col gap-2'>
            <Text variant='uppercase' size='default'>
              Tier history
            </Text>
            <TierHistoryTable entries={historyData?.entries ?? []} />
          </div>
        </>
      )}
    </div>
  );
}
