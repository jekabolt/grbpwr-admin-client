// import { useCategories } from 'lib/features/useCategories';
// import Selector from 'ui/components/selector';
// import useFilter from '../../../../lib/useFilter';

// export default function Categories() {
//   const { defaultValue: topCategory, handleFilterChange: handleTopCategoryChange } = useFilter(
//     'topCategory',
//     true,
//   );
//   const { defaultValue: subCategory, handleFilterChange: handleSubCategoryChange } = useFilter(
//     'subCategory',
//     true,
//   );
//   const { defaultValue: type, handleFilterChange: handleTypeChange } = useFilter('type', true);

//   const { topCategoryOptions, subCategoryOptions, typeOptions } = useCategories(
//     Number(topCategory[0]) || 0,
//     Number(subCategory[0]) || 0,
//     Number(type[0]) || 0,
//   );

//   const handleTopCategoryChangeWithClear = (value: string) => {
//     handleTopCategoryChange(value, {
//       subCategory: '',
//       type: '',
//     });
//   };

//   const handleSubCategoryChangeWithClear = (value: string) => {
//     handleSubCategoryChange(value, {
//       type: '',
//     });
//   };

//   return (
//     <>
//       <Selector
//         label='Top Category'
//         value={topCategory || []}
//         options={topCategoryOptions}
//         onChange={handleTopCategoryChangeWithClear}
//         showAll
//         multiple
//       />
//       <Selector
//         label='Sub Category'
//         value={subCategory || []}
//         options={subCategoryOptions}
//         onChange={handleSubCategoryChangeWithClear}
//         disabled={!topCategory}
//         showAll
//         multiple
//       />
//       <Selector
//         label='Type'
//         value={type || []}
//         options={typeOptions}
//         onChange={handleTypeChange}
//         disabled={!subCategory}
//         showAll
//         multiple
//       />
//     </>
//   );
// }
