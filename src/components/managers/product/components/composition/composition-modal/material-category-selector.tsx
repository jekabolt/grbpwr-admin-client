import { composition } from 'constants/garment-composition';
import Select from 'ui/components/select';

interface MaterialCategorySelectorProps {
  selectedCategory: string;
  onCategoryChange: (category: string) => void;
}

// Which slice of the fibre dictionary to browse. A select, not a row of buttons: seven categories
// with names like "Blends (natural + synthetic)" cost four wrapped lines as chips and one line here.
export function MaterialCategorySelector({
  selectedCategory,
  onCategoryChange,
}: MaterialCategorySelectorProps) {
  const items = Object.keys(composition.garment_composition).map((category) => ({
    value: category,
    label: category,
  }));

  return (
    <Select
      name='fibre-category'
      items={items}
      value={selectedCategory}
      onValueChange={onCategoryChange}
      placeholder='fibre category'
      fullWidth
    />
  );
}
