import Checkbox from 'ui/components/checkbox';
import Text from 'ui/components/text';
import useFilter from '../../../../lib/useFilter';

export default function PreorderSaleHidden() {
  const { defaultValue: preorder, handleFilterChange: handlePreorderChange } =
    useFilter('preorder');
  const { defaultValue: hidden, handleFilterChange: handleHiddenChange } = useFilter('hidden');
  const { defaultValue: sale, handleFilterChange: handleSaleChange } = useFilter('sale');
  const { defaultValue: archived, handleFilterChange: handleArchivedChange } =
    useFilter('archived');

  const showingArchived = archived === 'true';

  return (
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

      {/* The old "show hidden" checkbox silently also gated DRAFT (unchecked = ACTIVE only). Relabel it
          so the operator knows both draft and hidden colourways are affected. */}
      <div className='flex items-center gap-2'>
        <Checkbox
          name='hidden'
          label='show drafts & hidden'
          checked={hidden !== 'false'}
          disabled={showingArchived}
          onChange={(checked) => handleHiddenChange(checked ? 'true' : 'false')}
        />
        <Text variant='uppercase'>show drafts & hidden</Text>
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

      {/* #60: a dedicated, exclusive view for retired (ARCHIVED) colourways so they are findable and
          restorable again. */}
      <div className='flex items-center gap-2'>
        <Checkbox
          name='archived'
          label='archived'
          checked={showingArchived}
          onChange={(checked) => handleArchivedChange(checked ? 'true' : 'false')}
        />
        <Text variant='uppercase'>archived only</Text>
      </div>
    </div>
  );
}
