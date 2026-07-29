import { common_Category } from 'api/proto-http/admin';
import clsx, { ClassValue } from 'clsx';
import { GENDER_MAP } from 'constants/constants';
import { extendTailwindMerge } from 'tailwind-merge';

const VALID_GENDERS = Object.keys(GENDER_MAP);

/**
 * tailwind-merge has no idea about our custom `--text-*` tokens, so out of the box it
 * classifies `text-micro`, `text-nano`, `text-stat`… as text *colours*. That makes
 * `cn('text-micro text-labelColor', 'text-error')` silently drop the font size — the
 * class survives in the source and vanishes in the DOM, which is close to impossible
 * to spot by reading code.
 *
 * Registering them in the `font-size` group fixes it globally: a size and a colour can
 * now be passed through `cn` together, which every screen in the app does.
 */
const twMerge = extendTailwindMerge({
  extend: {
    classGroups: {
      'font-size': [
        {
          text: [
            'textBaseSize',
            'small',
            'control',
            'micro',
            'nano',
            'stat',
            'statBig',
            'giantSmall',
          ],
        },
      ],
    },
  },
});

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

// Children of a category node, optionally narrowed to one tree level. The level filter matters
// because the tree is NOT uniformly 3-deep: `dresses` hangs its types straight off the top category
// (0001_initial_setup.sql, "Dresses types (no sub-category)"), so filtering by parentId alone hands
// back types where a caller asked for sub-categories.
export function getCategoriesByParentId(
  categories: common_Category[],
  parentId: number,
  level?: string,
): common_Category[] {
  return categories.filter(
    (cat) => cat.parentId === parentId && (level === undefined || cat.level === level),
  );
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
