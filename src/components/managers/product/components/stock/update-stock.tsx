import { Button } from 'ui/components/button';
import Text from 'ui/components/text';
import { Form } from 'ui/form';
import CheckboxField from 'ui/form/fields/checkbox-field';
import InputField from 'ui/form/fields/input-field';
import SelectField from 'ui/form/fields/select-field';
import TextareaField from 'ui/form/fields/textarea-field';
import { StockModal } from './stock-modal';
import { UpdateStockData } from './update-stock-schema';
import { useUpdateStock } from './useUpdateStock';

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
  const {
    form,
    mode,
    direction,
    sizeItems,
    modeOptions,
    reasonOptions,
    directionOptions,
    commentPlaceholder,
    onSubmit,
  } = useUpdateStock({ productId, sizes, onStockUpdated });

  return (
    <StockModal title='update stock'>
      <Form {...form}>
        <form
          onSubmit={form.handleSubmit(onSubmit)}
          className='lg:w-[600px] flex flex-col justify-between h-full'
        >
          <div className='w-full space-y-5'>
            <div className='space-y-3'>
              <Text>mode</Text>
              <div className='flex gap-x-10'>
                {modeOptions.map((o) => (
                  <CheckboxField
                    key={o.value}
                    name='mode'
                    label={o.label}
                    checked={mode === o.value}
                    onCheckedChange={() => form.setValue('mode', o.value as UpdateStockData['mode'])}
                  />
                ))}
              </div>
            </div>
            {mode === 'STOCK_ADJUSTMENT_MODE_ADJUST' && (
              <div className='space-y-3'>
                <Text>direction</Text>
                <div className='flex gap-x-10'>
                  {directionOptions.map((o) => (
                    <CheckboxField
                      key={o.value}
                      name='direction'
                      label={o.label}
                      checked={direction === o.value}
                      onCheckedChange={() =>
                        form.setValue('direction', o.value as UpdateStockData['direction'])
                      }
                    />
                  ))}
                </div>
              </div>
            )}
            <SelectField name='sizeId' label='size' items={sizeItems} valueAsNumber />
            <InputField
              name='quantity'
              label='quantity'
              type='number'
              placeholder='0'
              valueAsNumber
            />
            <SelectField name='reason' label='reason' items={reasonOptions} />
            <TextareaField
              variant='secondary'
              name='comment'
              placeholder={commentPlaceholder}
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
