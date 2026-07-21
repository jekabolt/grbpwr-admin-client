import { zodResolver } from '@hookform/resolvers/zod';
import { useSnackBarStore } from 'lib/stores/store';
import { SubmitHandler, useForm } from 'react-hook-form';
import { ConfirmationModal } from 'ui/components/confirmation-modal';
import { Form } from 'ui/form';
import InputField from 'ui/form/fields/input-field';
import TextareaField from 'ui/form/fields/textarea-field';
import { applyServerFieldErrors } from 'utils/field-errors';
import { z } from 'zod';
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
  const { showMessage } = useSnackBarStore();
  const create = useCreateSupplier();

  const form = useForm<SupplierForm>({
    resolver: zodResolver(schema),
    defaultValues: { name: '', vatId: '', notes: '' },
  });

  const onSubmit: SubmitHandler<SupplierForm> = (data) => {
    create.mutate(
      { name: data.name, vatId: data.vatId, notes: data.notes },
      {
        onSuccess: () => {
          showMessage('Supplier created', 'success');
          form.reset({ name: '', vatId: '', notes: '' });
          onOpenChange(false);
        },
        onError: (e) => {
          applyServerFieldErrors(e, form.setError, {
            allow: (p) => ['name', 'vatId', 'notes'].includes(p),
          });
          showMessage(e instanceof Error ? e.message : 'Failed to create supplier', 'error');
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
            <TextareaField name='notes' label='notes (optional)' placeholder='anything to remember' />
          </div>
        </Form>
      </div>
    </ConfirmationModal>
  );
}
