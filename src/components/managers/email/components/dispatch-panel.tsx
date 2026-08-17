import {
  common_EmailCampaignFull,
  common_EmailCampaignRecipient,
  common_EmailCampaignStatus,
} from 'api/proto-http/admin';
import {
  COHORT_FILTER_OPTIONS,
  COHORT_LABELS,
  RECIPIENT_FILTER_ALL,
  RECIPIENT_STATUS_FILTER_OPTIONS,
  RECIPIENT_STATUS_LABELS,
  STATUS_LABELS,
} from 'constants/email-campaign';
import { useMemo, useState } from 'react';
import { Button } from 'ui/components/button';
import { ConfirmationModal } from 'ui/components/confirmation-modal';
import { GroupLabel } from 'ui/components/group-label';
import { Section } from 'ui/components/section';
import Select from 'ui/components/select';
import Text from 'ui/components/text';
import { fmtInt, StatTile, StatTone } from './stat-tile';
import {
  useCancelCampaign,
  useDispatchStatus,
  usePauseCampaign,
  useRecipients,
  useResumeCampaign,
  useScheduleCampaign,
  useSendCampaignNow,
} from './useCampaign';

// ── datetime-local <-> unix-seconds (backend ScheduleCampaign wants unix seconds) ──
function epochToLocalInput(epoch: number | undefined): string {
  if (!epoch || epoch <= 0) return '';
  const d = new Date(epoch * 1000);
  if (Number.isNaN(d.getTime())) return '';
  const tzOffsetMs = d.getTimezoneOffset() * 60000;
  return new Date(d.getTime() - tzOffsetMs).toISOString().slice(0, 16);
}
function localInputToEpoch(local: string): number {
  if (!local) return 0;
  const d = new Date(local); // parsed as local time
  return Number.isNaN(d.getTime()) ? 0 : Math.floor(d.getTime() / 1000);
}
function fmtTime(epoch: number | undefined): string {
  if (!epoch || epoch <= 0) return '—';
  try {
    return new Date(epoch * 1000).toLocaleString('en-US', {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return '—';
  }
}

const DRAFT: common_EmailCampaignStatus = 'EMAIL_CAMPAIGN_STATUS_DRAFT';
const SCHEDULED: common_EmailCampaignStatus = 'EMAIL_CAMPAIGN_STATUS_SCHEDULED';
const SENDING: common_EmailCampaignStatus = 'EMAIL_CAMPAIGN_STATUS_SENDING';
const PAUSED: common_EmailCampaignStatus = 'EMAIL_CAMPAIGN_STATUS_PAUSED';
const SENT: common_EmailCampaignStatus = 'EMAIL_CAMPAIGN_STATUS_SENT';
const CANCELLED: common_EmailCampaignStatus = 'EMAIL_CAMPAIGN_STATUS_CANCELLED';

function statusTone(s: common_EmailCampaignStatus | undefined): StatTone {
  if (s === SENDING || s === SCHEDULED) return 'warning';
  if (s === CANCELLED) return 'error';
  return 'default';
}

export function DispatchPanel({
  campaign,
  canOperate,
}: {
  campaign: common_EmailCampaignFull | null | undefined;
  canOperate: boolean;
}) {
  const id = campaign?.id ?? 0;
  const statusQuery = useDispatchStatus(id, id > 0);
  // Live dispatch status is the source of truth for which transition is valid next;
  // fall back to the loaded campaign's status until the first status fetch resolves.
  const status = (statusQuery.data?.status || campaign?.status || DRAFT) as common_EmailCampaignStatus;

  const sendNow = useSendCampaignNow();
  const schedule = useScheduleCampaign();
  const pause = usePauseCampaign();
  const resume = useResumeCampaign();
  const cancel = useCancelCampaign();

  const [scheduleLocal, setScheduleLocal] = useState<string>(() =>
    epochToLocalInput(campaign?.scheduleAt),
  );
  const [cancelOpen, setCancelOpen] = useState(false);

  const busy =
    sendNow.isPending ||
    schedule.isPending ||
    pause.isPending ||
    resume.isPending ||
    cancel.isPending;

  const terminal = status === SENT || status === CANCELLED;
  const canSendNow = status === DRAFT || status === SCHEDULED;
  const canSchedule = status === DRAFT || status === SCHEDULED;
  const canPause = status === SENDING;
  const canResume = status === PAUSED;
  const canCancel = status === SCHEDULED || status === SENDING || status === PAUSED;

  const scheduleEpoch = localInputToEpoch(scheduleLocal);
  const scheduleInPast = scheduleEpoch > 0 && scheduleEpoch <= Math.floor(Date.now() / 1000);
  const scheduleInvalid = scheduleEpoch <= 0 || scheduleInPast;

  const ds = statusQuery.data;
  const recipientsEnabled = id > 0 && status !== DRAFT;

  if (id <= 0) return null;

  return (
    <Section
      title='dispatch'
      action={
        <span className='border border-borderColor px-1.5 py-0.5 leading-none'>
          <Text size='small' variant='uppercase'>
            {STATUS_LABELS[status as keyof typeof STATUS_LABELS] ?? status}
          </Text>
        </span>
      }
    >
      {/* dispatch error banner */}
      {ds?.dispatchError ? (
        <div className='border border-error p-2'>
          <Text size='small' variant='error'>
            dispatch error: {ds.dispatchError}
          </Text>
        </div>
      ) : null}

      {/* ── lifecycle controls (only valid transitions) ─────────────────────── */}
      {!canOperate ? (
        <Text variant='inactive' size='small'>
          you don&apos;t have permission to operate dispatch.
        </Text>
      ) : terminal ? (
        <Text variant='inactive' size='small'>
          this campaign is {STATUS_LABELS[status as keyof typeof STATUS_LABELS]} — no further
          dispatch actions.
        </Text>
      ) : (
        <div className='flex flex-col gap-3'>
          <div className='flex flex-wrap items-center gap-2'>
            {canSendNow && (
              <Button
                type='button'
                variant='main'
                size='lg'
                className='uppercase'
                disabled={busy}
                loading={sendNow.isPending}
                onClick={() => sendNow.mutate({ id })}
              >
                send now
              </Button>
            )}
            {canPause && (
              <Button
                type='button'
                variant='secondary'
                size='lg'
                className='uppercase'
                disabled={busy}
                loading={pause.isPending}
                onClick={() => pause.mutate({ id })}
              >
                pause
              </Button>
            )}
            {canResume && (
              <Button
                type='button'
                variant='main'
                size='lg'
                className='uppercase'
                disabled={busy}
                loading={resume.isPending}
                onClick={() => resume.mutate({ id })}
              >
                resume
              </Button>
            )}
            {canCancel && (
              <Button
                type='button'
                variant='secondary'
                size='lg'
                className='uppercase text-error'
                disabled={busy}
                onClick={() => setCancelOpen(true)}
              >
                cancel
              </Button>
            )}
          </div>

          {/* schedule row */}
          {canSchedule && (
            <div className='flex flex-col gap-2'>
              <Text variant='label' size='small'>
                schedule for later (rejected if in the past; requires a default-language
                subject &amp; a configured unsubscribe)
              </Text>
              <div className='flex flex-wrap items-end gap-2'>
                <input
                  type='datetime-local'
                  name='schedule-at'
                  value={scheduleLocal}
                  onChange={(e) => setScheduleLocal(e.target.value)}
                  className='appearance-none rounded-none border-b border-textInactiveColor bg-bgColor text-textBaseSize transition-colors focus:border-textInactiveColor focus:outline-none'
                />
                <Button
                  type='button'
                  variant='secondary'
                  size='lg'
                  className='uppercase'
                  disabled={busy || scheduleInvalid}
                  loading={schedule.isPending}
                  onClick={() => schedule.mutate({ id, scheduleAt: scheduleEpoch })}
                >
                  {status === SCHEDULED ? 'reschedule' : 'schedule'}
                </Button>
              </div>
              {scheduleInPast && (
                <Text variant='error' size='small'>
                  pick a time in the future.
                </Text>
              )}
            </div>
          )}
        </div>
      )}

      {/* ── status tiles ─────────────────────────────────────────────────────── */}
      <div className='grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5'>
        <StatTile
          label='status'
          value={STATUS_LABELS[status as keyof typeof STATUS_LABELS] ?? status}
          tone={statusTone(status)}
        />
        <StatTile label='recipients' value={fmtInt(ds?.recipientCount)} />
        <StatTile label='pending' value={fmtInt(ds?.pending)} tone='muted' />
        <StatTile
          label='accepted'
          value={fmtInt(ds?.accepted)}
          sub='handed to provider'
        />
        <StatTile
          label='failed'
          value={fmtInt(ds?.failed)}
          tone={(ds?.failed || 0) > 0 ? 'error' : 'muted'}
        />
        <StatTile label='skipped' value={fmtInt(ds?.skipped)} tone='muted' />
        <StatTile
          label='audience'
          value={ds?.audienceMaterializedAt ? 'materialized' : 'pending'}
          sub={fmtTime(ds?.audienceMaterializedAt)}
          tone={ds?.audienceMaterializedAt ? 'default' : 'warning'}
        />
        {/* Fan-out cursor lives on the campaign, not the dispatch-status projection. */}
        <StatTile
          label='fan-out'
          value={
            campaign?.fanoutMaxAccountId
              ? `${fmtInt(campaign?.fanoutCursorAccountId)} / ${fmtInt(campaign?.fanoutMaxAccountId)}`
              : '—'
          }
          sub='cursor / max account'
          tone={status === SENDING ? 'warning' : 'muted'}
        />
      </div>

      {statusQuery.isError && (
        <div className='flex items-center gap-2'>
          <Text variant='error' size='small'>
            couldn&apos;t load dispatch status.
          </Text>
          <Button
            type='button'
            variant='secondary'
            className='px-2 py-1'
            onClick={() => statusQuery.refetch()}
          >
            retry
          </Button>
        </div>
      )}

      {recipientsEnabled && <RecipientsTable id={id} />}

      <ConfirmationModal
        open={cancelOpen}
        onOpenChange={setCancelOpen}
        title='cancel campaign'
        confirmLabel='cancel campaign'
        cancelLabel='keep sending'
        onConfirm={() => cancel.mutate({ id })}
      >
        <Text>
          cancel this campaign? in-flight sends stop and pending recipients will not be delivered.
          this can&apos;t be undone.
        </Text>
      </ConfirmationModal>
    </Section>
  );
}

// ── recipients ledger (keyset pagination, client-side filters over loaded rows) ──
function RecipientsTable({ id }: { id: number }) {
  const query = useRecipients(id, true);
  const [statusFilter, setStatusFilter] = useState(RECIPIENT_FILTER_ALL);
  const [cohortFilter, setCohortFilter] = useState(RECIPIENT_FILTER_ALL);

  const allRows: common_EmailCampaignRecipient[] = useMemo(
    () => (query.data?.pages ?? []).flatMap((p) => p.recipients),
    [query.data],
  );

  const rows = useMemo(
    () =>
      allRows.filter(
        (r) =>
          (statusFilter === RECIPIENT_FILTER_ALL || r.status === statusFilter) &&
          (cohortFilter === RECIPIENT_FILTER_ALL || r.cohort === cohortFilter),
      ),
    [allRows, statusFilter, cohortFilter],
  );

  return (
    <div className='space-y-2'>
      <GroupLabel
        action={
          <div className='flex flex-wrap items-center gap-2'>
            <div className='w-40'>
              <Select
                name='recipient-status-filter'
                items={RECIPIENT_STATUS_FILTER_OPTIONS}
                value={statusFilter}
                onValueChange={(v: string) => setStatusFilter(v || RECIPIENT_FILTER_ALL)}
                placeholder='all statuses'
                fullWidth
              />
            </div>
            <div className='w-40'>
              <Select
                name='recipient-cohort-filter'
                items={COHORT_FILTER_OPTIONS}
                value={cohortFilter}
                onValueChange={(v: string) => setCohortFilter(v || RECIPIENT_FILTER_ALL)}
                placeholder='all cohorts'
                fullWidth
              />
            </div>
          </div>
        }
      >
        recipients
      </GroupLabel>

      <Text variant='inactive' size='small'>
        filters apply to loaded rows only — the ledger RPC paginates by keyset (no server-side
        filter). per-recipient engagement (opens/clicks/bounces) is aggregated in metrics, not on
        the ledger.
      </Text>

      {query.isLoading ? (
        <Text variant='inactive' size='small' className='animate-pulse'>
          loading recipients…
        </Text>
      ) : query.isError ? (
        <div className='flex items-center gap-2'>
          <Text variant='error' size='small'>
            couldn&apos;t load recipients.
          </Text>
          <Button
            type='button'
            variant='secondary'
            className='px-2 py-1'
            onClick={() => query.refetch()}
          >
            retry
          </Button>
        </div>
      ) : allRows.length === 0 ? (
        <Text variant='inactive' size='small'>
          no recipients materialized yet.
        </Text>
      ) : (
        <div className='overflow-x-auto'>
          <table className='w-full min-w-[720px] border-collapse text-left'>
            <thead>
              <tr className='border-b border-textInactiveColor'>
                {['email', 'status', 'variant', 'cohort', 'attempts', 'resend id', 'sent', 'error'].map(
                  (h) => (
                    <th key={h} className='py-2 pr-3'>
                      <Text variant='label' size='small' className='uppercase'>
                        {h}
                      </Text>
                    </th>
                  ),
                )}
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => {
                const failed = r.status === 'EMAIL_CAMPAIGN_RECIPIENT_STATUS_FAILED';
                return (
                  <tr key={r.id} className='border-b border-textInactiveColor/40 align-top'>
                    <td className='py-2 pr-3'>
                      <Text size='small' className='break-all'>
                        {r.email || '—'}
                      </Text>
                    </td>
                    <td className='py-2 pr-3'>
                      <Text size='small' variant={failed ? 'error' : 'default'} className='uppercase'>
                        {RECIPIENT_STATUS_LABELS[r.status || ''] ?? r.status ?? '—'}
                      </Text>
                    </td>
                    <td className='py-2 pr-3'>
                      <Text size='small'>{r.variantId ? `#${r.variantId}` : '—'}</Text>
                    </td>
                    <td className='py-2 pr-3'>
                      <Text size='small'>{COHORT_LABELS[r.cohort || ''] ?? '—'}</Text>
                    </td>
                    <td className='py-2 pr-3'>
                      <Text size='small' className='tabular-nums'>
                        {fmtInt(r.attemptCount)}
                      </Text>
                    </td>
                    <td className='py-2 pr-3'>
                      <Text size='small' variant='inactive' className='break-all'>
                        {r.resendEmailId || '—'}
                      </Text>
                    </td>
                    <td className='py-2 pr-3'>
                      <Text size='small' variant='inactive'>
                        {fmtTime(r.sentAt)}
                      </Text>
                    </td>
                    <td className='py-2 pr-3'>
                      <Text size='small' variant={r.lastError ? 'error' : 'inactive'}>
                        {r.lastError || r.errorCode || '—'}
                      </Text>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>

          {rows.length === 0 && (
            <Text variant='inactive' size='small' className='py-2'>
              no loaded rows match the filters.
            </Text>
          )}

          <div className='flex items-center gap-3 pt-3'>
            {query.hasNextPage ? (
              <Button
                type='button'
                variant='secondary'
                size='lg'
                className='uppercase'
                disabled={query.isFetchingNextPage}
                loading={query.isFetchingNextPage}
                onClick={() => query.fetchNextPage()}
              >
                load more
              </Button>
            ) : (
              <Text variant='inactive' size='small'>
                all recipients loaded ({fmtInt(allRows.length)}).
              </Text>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
