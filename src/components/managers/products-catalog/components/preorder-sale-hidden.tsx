import Checkbox from 'ui/components/checkbox';
import Text from 'ui/components/text';
import useFilter from '../../../../lib/useFilter';
import StatusFilter from './status-filter';

export default function PreorderSaleHidden() {
  const { defaultValue: preorder, handleFilterChange: handlePreorderChange } =
    useFilter('preorder');
  const { defaultValue: sale, handleFilterChange: handleSaleChange } = useFilter('sale');

  return (
    <div className='space-y-6'>
      {/* Explicit lifecycle filter replaces the old "show drafts & hidden" + "archived only" checkboxes,
          which overlapped and hid the state model. */}
      <StatusFilter />

      <div className='flex flex-wrap gap-3'>
        <div className='flex items-center gap-2'>
          <Checkbox
            name='preorder'
            label='preorder'
            checked={preorder === 'true'}
            onChange={(checked) => handlePreorderChange(checked.toString())}
          />
          <Text variant='uppercase'>preorder</Text>
        </div>

        <div className='flex items-center gap-2'>
          <Checkbox
            name='sale'
            label='sale'
            checked={sale === 'true'}
            onChange={(checked) => handleSaleChange(checked.toString())}
          />
          <Text variant='uppercase'>sale</Text>
        </div>
      </div>
    </div>
  );
}
