import { useEffect } from 'react';
import { adminService } from 'api/api';
import { common_OrderFull } from 'api/proto-http/admin';
import { useFormContext } from 'react-hook-form';
import { useSnackBarStore } from 'lib/stores/store';
import TextareaField from 'ui/form/fields/textarea-field';

export function Comment({ orderDetails }: { orderDetails?: common_OrderFull }) {
  const { showMessage } = useSnackBarStore();
  const { setValue } = useFormContext();

  useEffect(() => {
    setValue('notes', orderDetails?.order?.orderComment || '');
  }, [orderDetails?.order?.orderComment, setValue]);

  async function onUpsert(value: string) {
    if (!orderDetails?.order?.uuid) return;
    try {
      await adminService.AddOrderComment({
        orderUuid: orderDetails.order.uuid,
        comment: value,
      });
      showMessage('Comment added successfully', 'success');
    } catch (error) {
      const msg = error instanceof Error ? error.message : 'Failed to leave comment';
      showMessage(msg, 'error');
    }
  }

  return (
    <TextareaField
      variant='secondary'
      name='notes'
      placeholder='leave comments here'
      showCharCount
      maxLength={1500}
      upsertButton={true}
      onUpsert={onUpsert}
      className='placeholder:uppercase placeholder:text-textInactiveColor'
    />
  );
}
