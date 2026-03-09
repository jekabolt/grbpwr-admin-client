import { zodResolver } from '@hookform/resolvers/zod';
import { useQueryClient } from '@tanstack/react-query';
import { adminService } from 'api/api';
import { useSnackBarStore } from 'lib/stores/store';
import { useForm } from 'react-hook-form';
import { Button } from 'ui/components/button';
import { Form } from 'ui/form';
import InputField from 'ui/form/fields/input-field';
import SelectField from 'ui/form/fields/select-field';
import TextareaField from 'ui/form/fields/textarea-field';
import { stockChangeHistoryKeys } from './useStockChangeHistory';
import { StockModal } from './stock-modal';
import {
  defaultData,
  REASON_OPTIONS,
  UpdateStockData,
  updateStockSchema,
} from './update-stock-schema';

interface SizeOption {
  id?: number;
  name?: string;
}

export function UpdateStock({
  productId,
  sizes = [],
  onStockUpdated,
}: {
  productId?: number;
  sizes?: SizeOption[];
  onStockUpdated?: () => void;
}) {
  const queryClient = useQueryClient();
  const sizeItems = sizes
    .filter((s) => s.id != null)
    .map((s) => ({ value: String(s.id), label: s.name ?? String(s.id) }));
  const { showMessage } = useSnackBarStore();

  const form = useForm<UpdateStockData>({
    resolver: zodResolver(updateStockSchema),
    defaultValues: defaultData,
  });

  async function onSubmit(data: UpdateStockData) {
    if (!productId) {
      showMessage('Product ID is required', 'error');
      return;
    }
    try {
      await adminService.UpdateProductSizeStock({
        productId,
        ...data,
      });
      showMessage('Stock updated successfully', 'success');
      form.reset();
      queryClient.invalidateQueries({ queryKey: stockChangeHistoryKeys.all });
      onStockUpdated?.();
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to update stock';
      showMessage(message, 'error');
      console.error('Failed to update stock', error);
    }
  }
  return (
    <StockModal title='update stock'>
      <Form {...form}>
        <form
          onSubmit={form.handleSubmit(onSubmit)}
          className='lg:w-[600px] flex flex-col justify-between h-full'
        >
          <div className='w-full space-y-5'>
            <SelectField name='sizeId' label='size' items={sizeItems} valueAsNumber />
            <InputField
              name='quantity'
              label='quantity'
              type='number'
              placeholder='0'
              valueAsNumber
            />
            <SelectField name='reason' label='reason' items={REASON_OPTIONS} />
            <TextareaField
              variant='secondary'
              name='comment'
              placeholder='leave comment (optional)'
              showCharCount
              maxLength={1500}
              className='placeholder:uppercase placeholder:text-textInactiveColor'
            />
          </div>
          <Button
            type='button'
            variant='main'
            size='lg'
            className='self-end'
            onClick={() => form.handleSubmit(onSubmit)()}
          >
            update
          </Button>
        </form>
      </Form>
    </StockModal>
  );
}
