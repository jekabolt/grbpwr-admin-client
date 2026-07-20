import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { adminService } from 'api/api';
import { AlertSettings } from 'api/proto-http/admin';
import { usePermissions } from 'components/managers/accounts/utils/permissions';
import { SECTION } from 'constants/routes';
import { useSnackBarStore } from 'lib/stores/store';
import { useEffect, useState } from 'react';
import { ConfirmationModal } from 'ui/components/confirmation-modal';
import Text from 'ui/components/text';

const cell =
  'w-24 border border-textInactiveColor bg-bgColor px-2 py-1 text-textBaseSize disabled:opacity-50';

type Draft = {
  coverageWarnPct: string;
  refundRateWarnPct: string;
  rateFloorN: string;
  contributionTrustPct: string;
  ga4CoverageWarnPct: string;
  productionRunStaleDays: string;
  acctPostingLagHours: string;
};

const FIELDS: { key: keyof Draft; label: string; hint: string; step?: string }[] = [
  {
    key: 'coverageWarnPct',
    label: 'Cost coverage warn %',
    hint: 'warn when < this % of revenue is costed',
  },
  {
    key: 'refundRateWarnPct',
    label: 'Refund rate warn %',
    hint: 'warn when refund rate exceeds this',
  },
  {
    key: 'rateFloorN',
    label: 'Rate floor (orders)',
    hint: 'min orders before a rate is trusted',
    step: '1',
  },
  {
    key: 'contributionTrustPct',
    label: 'Contribution trust %',
    hint: 'min coverage to trust contribution',
  },
  {
    key: 'ga4CoverageWarnPct',
    label: 'GA4 coverage warn %',
    hint: 'warn when GA4 sees < this % of revenue',
  },
  {
    key: 'productionRunStaleDays',
    label: 'Production run stale (days)',
    hint: 'warn when a run sits in-progress this many days',
    step: '1',
  },
  {
    key: 'acctPostingLagHours',
    label: 'Posting lag warn (hours)',
    hint: 'warn when the accounting posting backlog is older than this',
    step: '1',
  },
];

const numOrUndef = (s: string) => (s.trim() === '' ? undefined : Number(s));

// Thresholds that drive the dashboard alert codes (coverage / refund / rate-floor / contribution
// trust / GA4 coverage). Get + Upsert.
export function AlertSettingsModal({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
}) {
  const { canWrite } = usePermissions();
  const canEdit = canWrite(SECTION.analytics);
  const { showMessage } = useSnackBarStore();
  const qc = useQueryClient();
  const [d, setD] = useState<Draft>({
    coverageWarnPct: '',
    refundRateWarnPct: '',
    rateFloorN: '',
    contributionTrustPct: '',
    ga4CoverageWarnPct: '',
    productionRunStaleDays: '',
    acctPostingLagHours: '',
  });

  const { data, isLoading } = useQuery({
    queryKey: ['alertSettings'],
    queryFn: () => adminService.GetAlertSettings({}),
    enabled: open,
  });

  useEffect(() => {
    if (!open) return;
    const s = data?.settings;
    setD({
      coverageWarnPct: s?.coverageWarnPct != null ? String(s.coverageWarnPct) : '',
      refundRateWarnPct: s?.refundRateWarnPct != null ? String(s.refundRateWarnPct) : '',
      rateFloorN: s?.rateFloorN != null ? String(s.rateFloorN) : '',
      contributionTrustPct: s?.contributionTrustPct != null ? String(s.contributionTrustPct) : '',
      ga4CoverageWarnPct: s?.ga4CoverageWarnPct != null ? String(s.ga4CoverageWarnPct) : '',
      productionRunStaleDays:
        s?.productionRunStaleDays != null ? String(s.productionRunStaleDays) : '',
      acctPostingLagHours: s?.acctPostingLagHours != null ? String(s.acctPostingLagHours) : '',
    });
  }, [data, open]);

  const save = useMutation({
    mutationFn: (settings: AlertSettings) => adminService.UpsertAlertSettings({ settings }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['alertSettings'] });
      showMessage('Alert thresholds saved', 'success');
      onOpenChange(false);
    },
    onError: (e) =>
      showMessage(e instanceof Error ? e.message : 'Failed to save thresholds', 'error'),
  });

  const handleSave = () =>
    save.mutate({
      coverageWarnPct: numOrUndef(d.coverageWarnPct),
      refundRateWarnPct: numOrUndef(d.refundRateWarnPct),
      rateFloorN: numOrUndef(d.rateFloorN),
      contributionTrustPct: numOrUndef(d.contributionTrustPct),
      ga4CoverageWarnPct: numOrUndef(d.ga4CoverageWarnPct),
      productionRunStaleDays: numOrUndef(d.productionRunStaleDays),
      acctPostingLagHours: numOrUndef(d.acctPostingLagHours),
    });

  return (
    <ConfirmationModal
      open={open}
      onOpenChange={onOpenChange}
      onConfirm={handleSave}
      title='Alert thresholds'
      confirmLabel={save.isPending ? 'saving…' : 'save'}
      confirmDisabled={!canEdit || save.isPending}
    >
      <div className='flex min-w-[min(90vw,32rem)] flex-col gap-3'>
        <Text variant='inactive' size='small'>
          Thresholds that raise dashboard alerts. Leave a field blank to use the server default.
        </Text>
        {isLoading ? (
          <Text size='small'>loading…</Text>
        ) : (
          FIELDS.map((f) => (
            <div key={f.key} className='flex items-center justify-between gap-3'>
              <div className='flex flex-col'>
                <Text size='small'>{f.label}</Text>
                <Text variant='inactive' size='small'>
                  {f.hint}
                </Text>
              </div>
              <input
                className={cell}
                type='number'
                min='0'
                step={f.step ?? '0.1'}
                disabled={!canEdit}
                value={d[f.key]}
                onChange={(e) => setD((prev) => ({ ...prev, [f.key]: e.target.value }))}
              />
            </div>
          ))
        )}
      </div>
    </ConfirmationModal>
  );
}
