import { common_Category } from 'api/proto-http/admin';
import {
  getSubCategoriesForTopCategory,
  getSubCategoryName,
  getTopCategoryName,
} from 'lib/features/categories';
import { useDictionaryStore } from 'lib/stores/store';
import { useSearchParams } from 'react-router-dom';
import Text from 'ui/components/text';
import { CategoryButton } from './category-btn';
import { TopCategories } from './top-categories';
import { useRouteParams } from './useRouteParams';
import { buildCatalogSearch } from './utility';

function filterSubCategories(
  categories: { name: string; id: number; href: string }[],
  gender: string,
) {
  if (gender === 'men') {
    return categories.filter(
      (c) => !['swimwear_w', 'bralettes', 'heels'].includes(c.name?.toLowerCase() ?? ''),
    );
  }
  return categories.filter((c) => c.name?.toLowerCase() !== 'swimwear_m');
}

export function isCategoryDisabled(category: common_Category, gender: string) {
  if (!category) return true;

  if (!gender) {
    return !category.countMen && !category.countWomen;
  }

  return gender === 'men' ? !category.countMen : !category.countWomen;
}

export function Categories() {
  const { dictionary } = useDictionaryStore();
  const [searchParams] = useSearchParams();
  const { gender, categoryName, subCategoryName, topCategory, subCategory } = useRouteParams();
  const genderParam = searchParams.get('gender') || undefined;

  const categories = dictionary?.categories || [];
  const subCategories = getSubCategoriesForTopCategory(categories, topCategory?.id || 0);
  const filteredSubCategories = filterSubCategories(subCategories, gender);

  if (!categoryName && !topCategory?.id) {
    return <TopCategories />;
  }

  const topCategoryName = topCategory
    ? getTopCategoryName(categories, topCategory.id || 0)
    : categoryName;

  const hasSubSelected = subCategory?.id != null;
  const baseHref = buildCatalogSearch(searchParams, {
    topCategory: hasSubSelected && topCategory?.id != null ? String(topCategory.id) : '',
    subCategory: '',
    gender: genderParam,
  });

  return (
    <div className='flex items-center gap-2'>
      <CategoryButton href={baseHref}>{topCategoryName || categoryName || ''}</CategoryButton>

      {!!filteredSubCategories.length && <Text>/</Text>}

      {filteredSubCategories.map((subCategory, index) => {
        const findSubCategory = categories.find((c) => c.id === subCategory.id) as common_Category;

        const isDisabled = isCategoryDisabled(findSubCategory, gender);
        const subCatName = getSubCategoryName(categories, subCategory.id);

        const subCategoryHref = buildCatalogSearch(searchParams, {
          topCategory: topCategory?.id != null ? String(topCategory.id) : '',
          subCategory: String(subCategory.id),
          gender: genderParam,
        });

        return (
          <div className='flex items-center gap-1' key={subCategory.id}>
            <CategoryButton
              href={subCategoryHref}
              variant={
                subCategoryName === subCategory.name?.toLowerCase() ? 'underline' : 'default'
              }
              disabled={isDisabled}
            >
              {subCatName ? subCatName : ''}
            </CategoryButton>
            {index < filteredSubCategories.length - 1 && <Text>/</Text>}
          </div>
        );
      })}
    </div>
  );
}
