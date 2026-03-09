import { composition } from 'constants/garment-composition';
import { cn } from 'lib/utility';
import { Button } from 'ui/components/button';
import Text from 'ui/components/text';

interface MaterialCategorySelectorProps {
  selectedCategory: string;
  onCategoryChange: (category: string) => void;
}

export function MaterialCategorySelector({
  selectedCategory,
  onCategoryChange,
}: MaterialCategorySelectorProps) {
  const categories = Object.keys(composition.garment_composition);

  return (
    <div>
      <Text variant='uppercase'>material categories:</Text>
      <div className='grid lg:grid-cols-4 grid-cols-1 gap-2'>
        {categories.map((category) => (
          <Button
            key={category}
            size='lg'
            onClick={() => onCategoryChange(category)}
            className={cn(
              'uppercase border border-textColor bg-bgColor hover:bg-textColor hover:text-bgColor',
              selectedCategory === category && 'bg-textColor text-bgColor',
            )}
          >
            {category}
          </Button>
        ))}
      </div>
    </div>
  );
}
