import { getTopCategoryName } from 'lib/features/categories';
import { useDictionary } from 'lib/providers/dictionary-provider';
import Text from 'ui/components/text';
import { useSearchParams } from 'react-router-dom';
import { isCategoryDisabled } from './categories';
import { CategoryButton } from './category-btn';
import { useRouteParams } from './useRouteParams';
import { buildCatalogSearch } from './utility';

export function TopCategories() {
  const [searchParams] = useSearchParams();
  const { gender } = useRouteParams();
  const genderParam = searchParams.get('gender') || undefined;
  const { dictionary } = useDictionary();
  const categories = dictionary?.categories || [];

  const topCategories = dictionary?.categories
    ?.filter((c) => {
      return c.level === 'top_category' && c.name !== 'objects';
    })
    ?.filter((c) => {
      if (gender === 'men') {
        const categoryName = getTopCategoryName(categories, c.id || 0);
        return categoryName?.toLowerCase() !== 'dresses';
      }
      return true;
    })
    .sort((a, b) => (a.id || 0) - (b.id || 0));

  return (
    <div className='flex items-center gap-2'>
      {topCategories?.map((category, index) => {
        const categoryName = getTopCategoryName(categories, category.id || 0);
        const originalCategoryName = category.name?.toLowerCase() || '';

        if (!categoryName) return null;

        const href = buildCatalogSearch(searchParams, {
          topCategory: String(category.id),
          subCategory: '',
          gender: genderParam,
        });

        return (
          <div className='flex items-center gap-2' key={category.id}>
            <CategoryButton href={href} disabled={isCategoryDisabled(category, gender)}>
              {originalCategoryName ? originalCategoryName : ''}
            </CategoryButton>
            {index < topCategories.length - 1 && <Text>/</Text>}
          </div>
        );
      })}
    </div>
  );
}
