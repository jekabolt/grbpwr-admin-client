import * as Tabs from '@radix-ui/react-tabs';
import { composition, CompositionStructure } from 'constants/garment-composition';
import { Button } from 'ui/components/button';
import Text from 'ui/components/text';

interface GarmentPartTabsProps {
  selectedPart: string;
  localComposition: CompositionStructure;
  onPartChange: (part: string) => void;
  onRemovePart: (part: string) => void;
}

export function GarmentPartTabs({
  selectedPart,
  localComposition,
  onPartChange,
  onRemovePart,
}: GarmentPartTabsProps) {
  const garmentParts = Object.keys(composition.garment_parts);

  return (
    <div>
      <Text variant='uppercase'>select garment part</Text>
      <Tabs.Root value={selectedPart} onValueChange={onPartChange}>
        <Tabs.List className='flex gap-2 overflow-x-auto'>
          {garmentParts.map((part) => (
            <Tabs.Trigger
              key={part}
              value={part}
              className='px-3 py-1 border border-textColor bg-bgColor data-[state=active]:text-bgColor data-[state=active]:bg-textColor'
            >
              <div className='flex items-center gap-2'>
                <Text variant='uppercase'>
                  {composition.garment_parts[part as keyof typeof composition.garment_parts]}
                </Text>
                {localComposition[part as keyof CompositionStructure] && (
                  <Button
                    onClick={(e: React.MouseEvent) => {
                      e.stopPropagation();
                      onRemovePart(part);
                    }}
                  >
                    ✕
                  </Button>
                )}
              </div>
            </Tabs.Trigger>
          ))}
        </Tabs.List>
      </Tabs.Root>
    </div>
  );
}
