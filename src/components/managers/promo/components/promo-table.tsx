import { zodResolver } from '@hookform/resolvers/zod';
import { common_PromoCodeInsert } from 'api/proto-http/admin';
import { usePermissions } from 'components/managers/accounts/utils/permissions';
import { formatDateShort } from 'components/managers/orders-catalog/components/utility';
import { SECTION } from 'constants/routes';
import { cn } from 'lib/utility';
import { useForm } from 'react-hook-form';
import { Button } from 'ui/components/button';
import CheckboxCommon from 'ui/components/checkbox';
import { ConfirmationModal } from 'ui/components/confirmation-modal';
import Text from 'ui/components/text';
import { PromoCreateRow } from './promo-create-row';
import { PromoEditRow } from './promo-edit-row';
import { emptyPromoDraft, promoDraftSchema, type PromoDraftSchema } from './schema';
import { usePromo } from './usePromo';
import { useInfinitePromo } from './usePromoQuery';

type Promo = NonNullable<
  ReturnType<typeof useInfinitePromo>['data']
>['pages'][number]['promoCodes'][number];

// ISO timestamp -> the YYYY-MM-DD an <input type="date"> expects, on the same UTC
// basis usePromo's toPromoInsert uses to build it back up.
function toDateInputValue(iso: string | undefined): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return d.toISOString().slice(0, 10);
}

function isExpired(iso: string | undefined): boolean {
  if (!iso) return false;
  const t = new Date(iso).getTime();
  return !Number.isNaN(t) && t < Date.now();
}

export function PromoTable({ promos }: { promos: Promo[] }) {
  const {
    handleDisablePromo,
    handleEnablePromo,
    handleDeletePromo,
    confirm,
    isCreating,
    startCreate,
    cancelCreate,
    submitCreate,
    editingCode,
    startEdit,
    cancelEdit,
    submitEdit,
  } = usePromo();

  const { canWrite } = usePermissions();
  const canEdit = canWrite(SECTION.promo);

  const form = useForm<PromoDraftSchema>({
    resolver: zodResolver(promoDraftSchema),
    defaultValues: emptyPromoDraft,
  });

  const editForm = useForm<PromoDraftSchema>({
    resolver: zodResolver(promoDraftSchema),
    defaultValues: emptyPromoDraft,
  });

  const handleStartEdit = (insert: common_PromoCodeInsert | undefined) => {
    if (!insert?.code) return;
    editForm.reset({
      code: insert.code,
      start: toDateInputValue(insert.start),
      expiration: toDateInputValue(insert.expiration),
      discount: insert.discount?.value || '0',
      freeShipping: !!insert.freeShipping,
      voucher: !!insert.voucher,
      allowed: !!insert.allowed,
    });
    cancelCreate();
    startEdit(insert.code);
  };

  const handleStartCreate = () => {
    cancelEdit();
    startCreate();
    form.reset(emptyPromoDraft);
  };

  const COLUMNS: { label: string; accessor: (p: Promo) => React.ReactNode }[] = [
    {
      label: 'Allowed',
      accessor: (p) => {
        const isAllowed = p.promoCodeInsert?.allowed;
        return (
          <div className='w-full h-full flex items-center justify-center'>
            <CheckboxCommon
              name='allowed'
              checked={isAllowed}
              disabled={!canEdit}
              onChange={() => {
                // H2: this used to unconditionally call disable, even on an
                // already-disabled code — there was no way back. Now it's a real
                // two-way toggle (re-enable recreates the code under the hood,
                // see useUpdatePromo — the backend has no EnablePromoCode RPC).
                const insert = p.promoCodeInsert;
                if (!insert) return;
                isAllowed ? handleDisablePromo(insert.code || '') : handleEnablePromo(insert);
              }}
            />
          </div>
        );
      },
    },
    { label: 'Code', accessor: (p) => p.promoCodeInsert?.code },
    {
      label: 'Start',
      accessor: (p) => (p.promoCodeInsert?.start ? formatDateShort(p.promoCodeInsert?.start) : '-'),
    },
    {
      label: 'Expiration',
      accessor: (p) => {
        const exp = p.promoCodeInsert?.expiration;
        if (!exp) return '-';
        const expired = isExpired(exp);
        return (
          <span className={expired ? 'text-error' : undefined}>
            {formatDateShort(exp)}
            {expired ? ' (expired)' : ''}
          </span>
        );
      },
    },
    { label: 'Discount', accessor: (p) => `${p.promoCodeInsert?.discount?.value ?? 0}%` },
    {
      label: 'Free Shipping',
      accessor: (p) => (p.promoCodeInsert?.freeShipping ? 'free' : 'paid'),
    },
    { label: 'Voucher', accessor: (p) => (p.promoCodeInsert?.voucher ? 'yes' : 'no') },
    {
      label: 'Edit',
      accessor: (p) => (
        <div className='w-full h-full flex items-center justify-center'>
          <Button
            size='lg'
            variant='simple'
            className='hover:cursor-pointer'
            onClick={() => handleStartEdit(p.promoCodeInsert)}
          >
            edit
          </Button>
        </div>
      ),
    },
    {
      label: 'Delete',
      accessor: (p) => (
        <div className='w-full h-full flex items-center justify-center bg-error'>
          <Button
            size='lg'
            className='text-bgColor hover:cursor-pointer'
            onClick={() => handleDeletePromo(p.promoCodeInsert?.code || '')}
          >
            [x]
          </Button>
        </div>
      ),
    },
  ];
  const visibleColumns = COLUMNS.filter(
    (c) => (c.label !== 'Delete' && c.label !== 'Edit') || canEdit,
  );
  return (
    <div className='w-full flex flex-col gap-4'>
      <ConfirmationModal
        open={confirm.open}
        onOpenChange={confirm.onOpenChange}
        onConfirm={confirm.onConfirm}
      >
        {confirm.message}
      </ConfirmationModal>
      {canEdit && (
        <div className='flex justify-end'>
          <Button variant='main' size='lg' onClick={handleStartCreate} disabled={isCreating}>
            Create
          </Button>
        </div>
      )}
      <div className='overflow-x-auto w-full'>
        <table className='w-full border-collapse border-2 border-textInactiveColor min-w-max'>
          <thead className='bg-textInactiveColor h-7 overflow-x-scroll'>
            <tr className='border-b border-textInactiveColor'>
              {visibleColumns.map((col) => (
                <th
                  key={col.label}
                  className='text-center min-w-1 border border-r border-textInactiveColor'
                >
                  <Text variant='uppercase'>{col.label}</Text>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {isCreating && (
              <PromoCreateRow form={form} onSubmit={submitCreate} onCancel={cancelCreate} />
            )}
            {promos.map((p) => {
              const code = p.promoCodeInsert?.code || '';
              if (editingCode && editingCode === code) {
                return (
                  <PromoEditRow
                    key={code}
                    form={editForm}
                    allowed={!!p.promoCodeInsert?.allowed}
                    onSubmit={(data) => submitEdit(code, data)}
                    onCancel={cancelEdit}
                  />
                );
              }
              const allowed = !!p.promoCodeInsert?.allowed;
              const expired = isExpired(p.promoCodeInsert?.expiration);
              return (
                <tr
                  key={code}
                  className={cn(
                    !allowed && 'bg-textInactiveColor',
                    allowed && expired && 'text-textInactiveColor',
                  )}
                >
                  {visibleColumns.map((col) => (
                    <td
                      key={col.label}
                      className={cn('border border-r border-textInactiveColor text-center px-2', {
                        'px-0': col.label === 'Delete' || col.label === 'Edit',
                      })}
                    >
                      <Text>{col.accessor(p) ?? '-'}</Text>
                    </td>
                  ))}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
