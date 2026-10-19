import { zodResolver } from '@hookform/resolvers/zod';
import { notify } from 'lib/stores/store';
import { useState } from 'react';
import { SubmitHandler, useForm } from 'react-hook-form';
import { CalloutBox, ConfirmationModal, Form, InputField, TextareaField } from 'ui';
import { applyServerFieldErrors } from 'utils/field-errors';
import { z } from 'zod';
import { errorText, isRefused, reasonOf } from '../../utils/feedback';
import { useCreateSupplier } from '../../utils/hooks';

const schema = z.object({
  name: z.string().trim().min(1, 'name is required'),
  vatId: z.string().trim().optional(),
  notes: z.string().trim().optional(),
});
type SupplierForm = z.infer<typeof schema>;

// Create a purchase-side supplier (4.4): the AP catalog entry that tags a 2010 Accounts-Payable
// position. Only the name is required; VAT id and notes are reference fields. Mirrors
// upsert-account-modal's ConfirmationModal + RHF shape.
export function CreateSupplierModal({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const create = useCreateSupplier();
  // A refusal no field took stands over the form until the next attempt.
  const [refusal, setRefusal] = useState<string | null>(null);

  const form = useForm<SupplierForm>({
    resolver: zodResolver(schema),
    defaultValues: { name: '', vatId: '', notes: '' },
  });

  const onSubmit: SubmitHandler<SupplierForm> = (data) => {
    setRefusal(null);
    create.mutate(
      { name: data.name, vatId: data.vatId, notes: data.notes },
      {
        // No receipt: the supplier appears in the list.
        onSuccess: () => {
          form.reset({ name: '', vatId: '', notes: '' });
          onOpenChange(false);
        },
        onError: (e) => {
          const { applied, unmapped } = applyServerFieldErrors(e, form.setError, {
            allow: (p) => ['name', 'vatId', 'notes'].includes(p),
          });
          const said = errorText(e, 'failed to create supplier') ?? '';
          if (isRefused(e)) {
            if (applied.length === 0 || unmapped.length > 0) setRefusal(said);
            return;
          }
          notify({
            sev: 'error',
            subject: `SUPPLIER ${data.name}`,
            text: 'not created',
            bad: reasonOf(e),
            detail: said,
          });
        },
      },
    );
  };

  return (
    <ConfirmationModal
      open={open}
      onOpenChange={onOpenChange}
      onConfirm={form.handleSubmit(onSubmit)}
      closeOnConfirm={false}
      title='New supplier'
      confirmLabel={create.isPending ? 'saving…' : 'create'}
      confirmDisabled={create.isPending}
    >
      <div className='min-w-[min(90vw,22rem)]'>
        <Form {...form}>
          <div className='flex flex-col gap-4'>
            <InputField name='name' label='name' placeholder='supplier name' autoFocus />
            <InputField name='vatId' label='VAT id (optional)' placeholder='VAT number' />
            <TextareaField
              name='notes'
              label='notes (optional)'
              placeholder='anything to remember'
            />
            {refusal && <CalloutBox tone='error'>{refusal}</CalloutBox>}
          </div>
        </Form>
      </div>
    </ConfirmationModal>
  );
}
