import { zodResolver } from '@hookform/resolvers/zod';
import { formatDateShort } from 'components/managers/orders-catalog/components/utility';
import { cn } from 'lib/utility';
import { useForm } from 'react-hook-form';
import { Button } from 'ui/components/button';
import CheckboxCommon from 'ui/components/checkbox';
import { ConfirmationModal } from 'ui/components/confirmation-modal';
import Text from 'ui/components/text';
import { PromoCreateRow } from './promo-create-row';
import { emptyPromoDraft, promoDraftSchema, type PromoDraftSchema } from './schema';
import { usePromo } from './usePromo';
import { useInfinitePromo } from './usePromoQuery';

type Promo = NonNullable<
  ReturnType<typeof useInfinitePromo>['data']
>['pages'][number]['promoCodes'][number];

export function PromoTable({ promos }: { promos: Promo[] }) {
  const {
    handleDisablePromo,
    handleDeletePromo,
    confirm,
    isCreating,
    startCreate,
    cancelCreate,
    submitCreate,
  } = usePromo();

  const form = useForm<PromoDraftSchema>({
    resolver: zodResolver(promoDraftSchema),
    defaultValues: emptyPromoDraft,
  });

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
              onChange={() => handleDisablePromo(p.promoCodeInsert?.code || '')}
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
      accessor: (p) =>
        p.promoCodeInsert?.expiration ? formatDateShort(p.promoCodeInsert?.expiration) : '-',
    },
    { label: 'Discount', accessor: (p) => `${p.promoCodeInsert?.discount?.value ?? 0}%` },
    {
      label: 'Free Shipping',
      accessor: (p) => (p.promoCodeInsert?.freeShipping ? 'free' : 'paid'),
    },
    { label: 'Voucher', accessor: (p) => (p.promoCodeInsert?.voucher ? 'yes' : 'no') },
    {
      label: 'Delete',
      accessor: (p) => (
        <div className='w-full h-full flex items-center justify-center bg-red-500'>
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
  return (
    <div className='w-full flex flex-col gap-4'>
      <ConfirmationModal
        open={confirm.open}
        onOpenChange={confirm.onOpenChange}
        onConfirm={confirm.onConfirm}
      >
        {confirm.message}
      </ConfirmationModal>
      <div className='flex justify-end'>
        <Button
          variant='main'
          size='lg'
          onClick={() => {
            startCreate();
            form.reset(emptyPromoDraft);
          }}
          disabled={isCreating}
        >
          Create
        </Button>
      </div>
      <div className='overflow-x-auto w-full'>
        <table className='w-full border-collapse border-2 border-textColor min-w-max'>
          <thead className='bg-textInactiveColor h-7 overflow-x-scroll'>
            <tr className='border-b border-textColor'>
              {COLUMNS.map((col) => (
                <th
                  key={col.label}
                  className='text-center min-w-1 border border-r border-textColor'
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
            {promos.map((p) => (
              <tr
                key={p.promoCodeInsert?.code}
                className={cn(!p.promoCodeInsert?.allowed && 'bg-textInactiveColor')}
              >
                {COLUMNS.map((col) => (
                  <td
                    key={col.label}
                    className={cn('border border-r border-textColor text-center px-2', {
                      'px-0': col.label === 'Delete',
                    })}
                  >
                    <Text>{col.accessor(p) ?? '-'}</Text>
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
