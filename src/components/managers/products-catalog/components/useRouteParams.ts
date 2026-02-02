'use client';

import { GENDER_ENUM_TO_SLUG } from 'constants/constants';
import { useDictionaryStore } from 'lib/stores/store';
import { useSearchParams } from 'react-router-dom';

interface RouteParams {
  gender: string;
  categoryName: string;
  subCategoryName: string;
  topCategory?: { id?: number; name?: string; level?: string; parentId?: number } | null;
  subCategory?: { id?: number; name?: string; level?: string; parentId?: number } | null;
}

export function useRouteParams(): RouteParams {
  const { dictionary } = useDictionaryStore();
  const [searchParams] = useSearchParams();

  const topCategoryId = searchParams.get('topCategory');
  const subCategoryId = searchParams.get('subCategory');
  const genderParam = searchParams.get('gender') || '';
  const gender = GENDER_ENUM_TO_SLUG[genderParam] ?? genderParam;

  const categories = dictionary?.categories || [];

  const topCategory = topCategoryId
    ? categories.find((c) => c.level === 'top_category' && String(c.id) === topCategoryId) ?? null
    : null;

  const subCategory = subCategoryId
    ? categories.find(
        (c) =>
          c.level === 'sub_category' &&
          String(c.id) === subCategoryId &&
          (topCategory ? c.parentId === topCategory.id : true),
      ) ?? null
    : null;

  const categoryName = topCategory
    ? (topCategory.name?.toLowerCase() ?? '')
    : '';
  const subCategoryName = subCategory ? (subCategory.name?.toLowerCase() ?? '') : '';

  return {
    gender: gender || '',
    categoryName,
    subCategoryName,
    topCategory: topCategory ?? undefined,
    subCategory: subCategory ?? undefined,
  };
}
