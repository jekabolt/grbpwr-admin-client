import { common_Category } from 'api/proto-http/admin';
import clsx, { ClassValue } from 'clsx';
import { GENDER_MAP } from 'constants/constants';
import { twMerge } from 'tailwind-merge';

const VALID_GENDERS = Object.keys(GENDER_MAP);

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function getCategoriesByParentId(
  categories: common_Category[],
  parentId: number,
): common_Category[] {
  return categories.filter((cat) => cat.parentId === parentId);
}

function decodeParam(param: string): string {
  try {
    return decodeURIComponent(param);
  } catch {
    return param;
  }
}

export function parseRouteParams(params: string[] = []): {
  gender: string | undefined;
  categoryName: string;
  subCategoryName: string;
} {
  const [firstParam, secondParam, thirdParam] = params.map((param) =>
    param ? decodeParam(param) : param,
  );

  if (firstParam === 'objects') {
    return {
      gender: undefined,
      categoryName: 'objects',
      subCategoryName: secondParam || '',
    };
  }

  // Check if firstParam is a valid gender
  const isGender = firstParam && VALID_GENDERS.includes(firstParam.toLowerCase());

  if (!isGender && firstParam) {
    return {
      gender: undefined,
      categoryName: firstParam,
      subCategoryName: secondParam || '',
    };
  }

  return {
    gender: firstParam,
    categoryName: secondParam || '',
    subCategoryName: thirdParam || '',
  };
}
