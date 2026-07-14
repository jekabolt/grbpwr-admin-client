import * as DialogPrimitives from '@radix-ui/react-dialog';
import { Employee } from 'api/proto-http/admin';
import { usePermissions } from 'components/managers/accounts/utils/permissions';
import { SECTION } from 'constants/routes';
import { CURRENCIES } from 'constants/constants';
import { useSnackBarStore } from 'lib/stores/store';
import { useEffect, useState } from 'react';
import { Button } from 'ui/components/button';
import { ConfirmationModal } from 'ui/components/confirmation-modal';
import Text from 'ui/components/text';
import { decimalToInput, normalizeDecimalInput, parseDecimalNumber } from 'utils/decimal';
import { useArchiveEmployee, useEmployees, useUpsertEmployee } from './utils/hooks';

const cell = 'w-full border border-textInactiveColor bg-bgColor px-2 py-1.5 text-textBaseSize';
const th =
  'border border-textInactiveColor bg-textInactiveColor/20 px-2 py-1 text-left text-textBaseSize uppercase';
const td = 'border border-textInactiveColor px-2 py-1 text-textBaseSize';
const day = (v?: string) => (v ? v.slice(0, 10) : '');

// Employee registry (gap-07 v2 A): a simple people list an OPEX salary template can link to.
// Analytics-gated like OPEX; default_monthly_cost is a template pre-fill only, not a booked cost.
export function Employees() {
  const { canWrite } = usePermissions();
  const canEdit = canWrite(SECTION.analytics);
  const { showMessage } = useSnackBarStore();
  const [showArchived, setShowArchived] = useState(false);
  const { data, isLoading, isError, refetch } = useEmployees(showArchived);
  const archive = useArchiveEmployee();
  const rows = data?.employees ?? [];

  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<Employee | undefined>();
  const [archiving, setArchiving] = useState<Employee | undefined>();

  const confirmArchive = () => {
    if (!archiving?.id) return;
    archive.mutate(archiving.id, {
      onSuccess: () => showMessage('Employee archived', 'success'),
      onError: (e) => showMessage(e instanceof Error ? e.message : 'Failed to archive', 'error'),
      onSettled: () => setArchiving(undefined),
    });
  };

  return (
    <div className='flex flex-col gap-6 pb-16'>
      <div className='-mx-2.5 flex flex-wrap items-center justify-between gap-3 border-b border-textInactiveColor bg-bgColor px-2.5 py-3'>
        <Text variant='uppercase' size='large'>
          employees
        </Text>
        {canEdit && (
          <Button
            type='button'
            variant='main'
            size='lg'
            className='uppercase'
            onClick={() => {
              setEditing(undefined);
              setFormOpen(true);
            }}
          >
            + employee
          </Button>
        )}
      </div>

      <label className='flex items-center gap-2'>
        <input
          type='checkbox'
          checked={showArchived}
          onChange={(e) => setShowArchived(e.target.checked)}
        />
        <Text size='small'>show archived</Text>
      </label>

      {isLoading ? (
        <Text variant='inactive' size='small'>
          loading…
        </Text>
      ) : isError ? (
        <div className='flex items-center gap-3'>
          <Text variant='error' size='small'>
            failed to load employees
          </Text>
          <button
            type='button'
            className='text-textBaseSize uppercase underline'
            onClick={() => refetch()}
          >
            retry
          </button>
        </div>
      ) : rows.length === 0 ? (
        <Text variant='inactive' size='small'>
          no employees
        </Text>
      ) : (
        <div className='overflow-x-auto'>
          <table className='w-full min-w-max border-collapse'>
            <thead>
              <tr>
                <th className={th}>name</th>
                <th className={th}>role</th>
                <th className={th}>from</th>
                <th className={th}>to</th>
                <th className={th}>default / month</th>
                <th className={th}>note</th>
                <th className={th} />
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => {
                const e = r.employee;
                return (
                  <tr key={r.id} className={r.archived ? 'opacity-50' : ''}>
                    <td className={td}>
                      {e?.fullName || '—'}
                      {r.archived ? ' · archived' : ''}
                    </td>
                    <td className={td}>{e?.role || '—'}</td>
                    <td className={`${td} whitespace-nowrap`}>{day(e?.employmentStart) || '—'}</td>
                    <td className={`${td} whitespace-nowrap`}>{day(e?.employmentEnd) || 'open'}</td>
                    <td className={td}>
                      {e?.defaultMonthlyCost?.value
                        ? `${decimalToInput(e.defaultMonthlyCost)} ${e.defaultCurrency || ''}`
                        : '—'}
                    </td>
                    <td className={td}>{e?.note || '—'}</td>
                    <td className={`${td} whitespace-nowrap`}>
                      {canEdit && !r.archived && (
                        <div className='flex items-center gap-2'>
                          <button
                            type='button'
                            className='uppercase underline hover:text-textColor'
                            onClick={() => {
                              setEditing(r);
                              setFormOpen(true);
                            }}
                          >
                            edit
                          </button>
                          <button
                            type='button'
                            className='uppercase text-textInactiveColor hover:text-error'
                            onClick={() => setArchiving(r)}
                          >
                            archive
                          </button>
                        </div>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      <EmployeeFormModal open={formOpen} onOpenChange={setFormOpen} existing={editing} />

      <ConfirmationModal
        open={archiving != null}
        onOpenChange={(v) => !v && setArchiving(undefined)}
        onConfirm={confirmArchive}
        title='archive employee?'
        confirmLabel='archive'
      >
        <Text size='small'>
          Archive “{archiving?.employee?.fullName}”? They stop appearing in the salary-template
          picker.
        </Text>
      </ConfirmationModal>
    </div>
  );
}

type Draft = {
  fullName: string;
  role: string;
  employmentStart: string;
  employmentEnd: string;
  defaultCurrency: string;
  defaultMonthlyCost: string;
  note: string;
};

const emptyDraft: Draft = {
  fullName: '',
  role: '',
  employmentStart: '',
  employmentEnd: '',
  defaultCurrency: 'EUR',
  defaultMonthlyCost: '',
  note: '',
};

function EmployeeFormModal({
  open,
  onOpenChange,
  existing,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  existing?: Employee;
}) {
  const { showMessage } = useSnackBarStore();
  const upsert = useUpsertEmployee();
  const [d, setD] = useState<Draft>(emptyDraft);

  useEffect(() => {
    if (!open) return;
    const e = existing?.employee;
    setD(
      e
        ? {
            fullName: e.fullName ?? '',
            role: e.role ?? '',
            employmentStart: day(e.employmentStart),
            employmentEnd: day(e.employmentEnd),
            defaultCurrency: e.defaultCurrency ?? 'EUR',
            defaultMonthlyCost: decimalToInput(e.defaultMonthlyCost),
            note: e.note ?? '',
          }
        : emptyDraft,
    );
  }, [existing, open]);

  const set = (patch: Partial<Draft>) => setD((prev) => ({ ...prev, ...patch }));

  const submit = async () => {
    if (!d.fullName.trim()) {
      showMessage('Enter a name', 'error');
      return;
    }
    if (d.defaultMonthlyCost.trim()) {
      const n = parseDecimalNumber(d.defaultMonthlyCost);
      if (!Number.isFinite(n) || n < 0) {
        showMessage('Default monthly cost must be a non-negative number', 'error');
        return;
      }
    }
    // YYYY-MM-DD strings compare lexicographically.
    if (d.employmentEnd && d.employmentStart && d.employmentEnd < d.employmentStart) {
      showMessage('End date is before the start date', 'error');
      return;
    }
    try {
      await upsert.mutateAsync({
        id: existing?.id ?? 0,
        employee: {
          fullName: d.fullName.trim(),
          role: d.role.trim(),
          employmentStart: d.employmentStart,
          employmentEnd: d.employmentEnd,
          defaultCurrency: d.defaultCurrency,
          defaultMonthlyCost: d.defaultMonthlyCost.trim()
            ? { value: normalizeDecimalInput(d.defaultMonthlyCost) }
            : undefined,
          note: d.note.trim(),
        },
      });
      showMessage(existing ? 'Employee saved' : 'Employee added', 'success');
      onOpenChange(false);
    } catch (e) {
      showMessage(e instanceof Error ? e.message : 'Failed to save employee', 'error');
    }
  };

  return (
    <DialogPrimitives.Root open={open} onOpenChange={onOpenChange}>
      <DialogPrimitives.Portal>
        <DialogPrimitives.Overlay className='fixed inset-0 z-20 h-screen bg-overlay' />
        <DialogPrimitives.Content className='fixed inset-x-2.5 top-1/2 z-50 flex max-h-[90vh] w-auto -translate-y-1/2 flex-col overflow-y-auto border border-textInactiveColor bg-bgColor text-textColor lg:inset-x-auto lg:left-1/2 lg:w-[440px] lg:-translate-x-1/2'>
          <div className='sticky top-0 z-10 flex items-center justify-between gap-2 border-b border-textInactiveColor bg-bgColor px-4 py-3'>
            <DialogPrimitives.Title className='text-lg uppercase'>
              {existing ? 'edit employee' : 'add employee'}
            </DialogPrimitives.Title>
            <DialogPrimitives.Close asChild>
              <Button type='button' className='shrink-0 cursor-pointer'>
                [x]
              </Button>
            </DialogPrimitives.Close>
          </div>
          <DialogPrimitives.Description className='sr-only'>
            employee registry entry
          </DialogPrimitives.Description>
          <div className='flex flex-col gap-3 p-4'>
            <label className='flex flex-col gap-1'>
              <Text size='small'>full name *</Text>
              <input
                className={cell}
                value={d.fullName}
                onChange={(e) => set({ fullName: e.target.value })}
              />
            </label>
            <label className='flex flex-col gap-1'>
              <Text size='small'>role</Text>
              <input
                className={cell}
                value={d.role}
                onChange={(e) => set({ role: e.target.value })}
                placeholder='e.g. pattern maker'
              />
            </label>
            <div className='grid grid-cols-2 gap-2'>
              <label className='flex flex-col gap-1'>
                <Text size='small'>employment from</Text>
                <input
                  className={cell}
                  type='date'
                  value={d.employmentStart}
                  onChange={(e) => set({ employmentStart: e.target.value })}
                />
              </label>
              <label className='flex flex-col gap-1'>
                <Text size='small'>to (optional)</Text>
                <input
                  className={cell}
                  type='date'
                  value={d.employmentEnd}
                  onChange={(e) => set({ employmentEnd: e.target.value })}
                />
              </label>
            </div>
            <div className='grid grid-cols-[1fr_7rem] gap-2'>
              <label className='flex flex-col gap-1'>
                <Text size='small'>default monthly cost</Text>
                <input
                  className={cell}
                  type='number'
                  step='0.01'
                  min='0'
                  value={d.defaultMonthlyCost}
                  onChange={(e) => set({ defaultMonthlyCost: e.target.value })}
                />
              </label>
              <label className='flex flex-col gap-1'>
                <Text size='small'>currency</Text>
                <select
                  className={cell}
                  value={d.defaultCurrency}
                  onChange={(e) => set({ defaultCurrency: e.target.value })}
                >
                  {CURRENCIES.map((c) => (
                    <option key={c.value} value={c.value}>
                      {c.value}
                    </option>
                  ))}
                </select>
              </label>
            </div>
            <Text variant='inactive' size='small'>
              Default monthly cost only pre-fills a salary OPEX template — it is never itself a
              booked cost.
            </Text>
            <label className='flex flex-col gap-1'>
              <Text size='small'>note (optional)</Text>
              <input
                className={cell}
                value={d.note}
                onChange={(e) => set({ note: e.target.value })}
              />
            </label>
          </div>
          <div className='sticky bottom-0 flex justify-end gap-2 border-t border-textInactiveColor bg-bgColor px-4 py-3'>
            <Button type='button' variant='secondary' size='lg' onClick={() => onOpenChange(false)}>
              cancel
            </Button>
            <Button
              type='button'
              variant='main'
              size='lg'
              disabled={upsert.isPending}
              onClick={submit}
            >
              {upsert.isPending ? 'saving…' : 'save'}
            </Button>
          </div>
        </DialogPrimitives.Content>
      </DialogPrimitives.Portal>
    </DialogPrimitives.Root>
  );
}
