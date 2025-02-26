import Checkbox from 'ui/components/checkbox';
import Text from 'ui/components/text';
import useFilter from '../../../../lib/useFilter';

export default function PreorderSaleHidden() {
  const { defaultValue: preorder, handleFilterChange: handlePreorderChange } =
    useFilter('preorder');
  const { defaultValue: hidden, handleFilterChange: handleHiddenChange } = useFilter('hidden');
  const { defaultValue: sale, handleFilterChange: handleSaleChange } = useFilter('sale');

  return (
    <div className='flex gap-3'>
      <div className='flex items-center gap-2'>
        <Checkbox
          name='preorder'
          label='preorder'
          checked={preorder === 'true'}
          onChange={(checked) => handlePreorderChange(checked.toString())}
        />
        <Text variant='uppercase' size='small'>
          preorder
        </Text>
      </div>

      <div className='flex items-center gap-2'>
        <Checkbox
          name='hidden'
          label='hidden'
          checked={hidden === 'true'}
          onChange={(checked) => handleHiddenChange(checked.toString())}
        />
        <Text variant='uppercase' size='small'>
          hidden
        </Text>
      </div>
      <div className='flex items-center gap-2'>
        <Checkbox
          name='sale'
          label='sale'
          checked={sale === 'true'}
          onChange={(checked) => handleSaleChange(checked.toString())}
        />
        <Text variant='uppercase' size='small'>
          sale
        </Text>
      </div>
    </div>
  );
}
