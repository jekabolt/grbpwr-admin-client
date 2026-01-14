import { useDictionaryStore } from 'lib/stores/store';
import { getCategoriesByParentId } from 'lib/utility';
import { useFormContext } from 'react-hook-form';
import SelectField from 'ui/form/fields/select-field';

export function CategoryFields({ editMode }: { editMode: boolean }) {
  const { dictionary } = useDictionaryStore();
  const { watch } = useFormContext();
  const topCategoryId = watch('product.productBodyInsert.topCategoryId');
  const subCategoryId = watch('product.productBodyInsert.subCategoryId');

  const topCategories = dictionary?.categories?.filter((cat) => cat.level === 'top_category') || [];
  const subCategories = topCategoryId
    ? getCategoriesByParentId(dictionary?.categories || [], parseInt(topCategoryId))
    : [];
  const types = subCategoryId
    ? getCategoriesByParentId(dictionary?.categories || [], parseInt(subCategoryId))
    : [];

  return (
    <div className='space-y-3'>
      <SelectField
        name='product.productBodyInsert.topCategoryId'
        label='category'
        items={topCategories.map((category) => ({
          label: category.name || '',
          value: category.id?.toString() || '',
        }))}
        readOnly={!editMode}
      />
      <SelectField
        name='product.productBodyInsert.subCategoryId'
        label='sub category'
        items={subCategories.map((category) => ({
          label: category.name || '',
          value: category.id?.toString() || '',
        }))}
        disabled={!topCategoryId}
        readOnly={!editMode}
      />
      <SelectField
        name='product.productBodyInsert.typeId'
        label='type'
        items={types.map((type) => ({
          label: type.name || '',
          value: type.id?.toString() || '',
        }))}
        disabled={!subCategoryId}
        readOnly={!editMode}
      />
    </div>
  );
}
