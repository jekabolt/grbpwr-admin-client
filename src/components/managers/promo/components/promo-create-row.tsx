import { UseFormReturn } from 'react-hook-form';
import { Button } from 'ui/components/button';
import { Form } from 'ui/form';
import CheckboxField from 'ui/form/fields/checkbox-field';
import InputField from 'ui/form/fields/input-field';
import { emptyPromoDraft, type PromoDraftSchema } from './schema';

type Props = {
  form: UseFormReturn<PromoDraftSchema>;
  onSubmit: (data: PromoDraftSchema) => void;
  onCancel: () => void;
};

export function PromoCreateRow({ form, onSubmit, onCancel }: Props) {
  return (
    <Form {...form}>
      <tr className='bg-bgColor'>
        <td className='border border-r border-textColor px-0'>
          <div className='flex justify-center'>
            <CheckboxField name='allowed' readOnly />
          </div>
        </td>
        <td className='border border-r border-textColor text-center px-2'>
          <InputField
            name='code'
            label='Code'
            srLabel
            placeholder='promo code'
            className='w-full text-center border-none'
          />
        </td>
        <td className='border border-r border-textColor px-2'>
          <InputField
            name='start'
            type='date'
            label='Start'
            srLabel
            className='w-full text-center border-none'
          />
        </td>
        <td className='border border-r border-textColor px-2'>
          <InputField
            name='expiration'
            type='date'
            label='Expiration'
            srLabel
            className='w-full text-center border-none'
          />
        </td>
        <td className='border border-r border-textColor px-2'>
          <div className='flex items-center justify-center gap-1'>
            <InputField
              name='discount'
              type='number'
              label=''
              srLabel
              min={0}
              max={100}
              className='w-full text-center border-none'
            />
            <span>%</span>
          </div>
        </td>
        <td className='border border-r border-textColor px-0'>
          <div className='flex justify-center'>
            <CheckboxField name='freeShipping' />
          </div>
        </td>
        <td className='border border-r border-textColor px-0'>
          <div className='flex justify-center'>
            <CheckboxField name='voucher' />
          </div>
        </td>
        <td className='border border-r border-textColor'>
          <div className='flex justify-center gap-1'>
            <Button
              size='lg'
              variant='simpleReverseWithBorder'
              className='w-full'
              onClick={form.handleSubmit(onSubmit)}
            >
              Save
            </Button>
            <Button
              size='lg'
              variant='main'
              className='w-full'
              onClick={() => {
                onCancel();
                form.reset(emptyPromoDraft);
              }}
            >
              Cancel
            </Button>
          </div>
        </td>
      </tr>
    </Form>
  );
}
