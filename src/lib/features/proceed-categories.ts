import { common_Category } from 'api/proto-http/admin';

interface ProcessedCategory {
  id: number;
  name: string;
  subCategories: {
    id: number;
    name: string;
    types: {
      id: number;
      name: string;
    }[];
  }[];
}

export const processCategories = (categories: common_Category[]): ProcessedCategory[] => {
  console.log('processCategories - raw categories:', categories);
  const topCategories = categories.filter((cat) => cat.level === 'top_category');
  console.log('processCategories - topCategories:', topCategories);

  return topCategories.map((topCat) => {
    console.log('processCategories - processing topCat:', topCat);
    console.log('processCategories - topCat.name:', topCat.name);
    const subCategories = categories.filter(
      (cat) => cat.level === 'sub_category' && cat.parentId === topCat.id!,
    );
    console.log('processCategories - subCategories for topCat:', subCategories);

    if (subCategories.length === 0) {
      const directTypes = categories.filter(
        (cat) => cat.level === 'type' && cat.parentId === topCat.id!,
      );

      return {
        id: topCat.id!,
        name: topCat.name || 'Unknown',
        subCategories: [
          {
            id: topCat.id!,
            name: topCat.name || 'Unknown',
            types: directTypes.map((type) => ({
              id: type.id!,
              name: type.name || 'Unknown',
            })),
          },
        ],
      };
    }

    const processedSubCategories = subCategories.map((subCat) => {
      const types = categories.filter((cat) => cat.level === 'type' && cat.parentId === subCat.id!);

      return {
        id: subCat.id!,
        name: subCat.name || 'Unknown',
        types: types.map((type) => ({
          id: type.id!,
          name: type.name || 'Unknown',
        })),
      };
    });

    return {
      id: topCat.id!,
      name: topCat.name || 'Unknown',
      subCategories: processedSubCategories,
    };
  });
};
