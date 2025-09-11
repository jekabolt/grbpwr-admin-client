import { FormControl, FormControlLabel, Input, Radio, RadioGroup } from '@mui/material';
import * as Tabs from '@radix-ui/react-tabs';
import { composition, CompositionItem, CompositionStructure } from 'constants/garment-composition';
import { cn } from 'lib/utility';
import { useEffect, useMemo, useState } from 'react';
import { Button } from 'ui/components/button';
import { Dialog } from 'ui/components/dialog';
import Text from 'ui/components/text';

interface CompositionModalProps {
  isOpen: boolean;
  onClose: () => void;
  selectedComposition: CompositionStructure;
  selectComposition: (composition: CompositionStructure) => void;
}

export function CompositionModal({
  isOpen,
  selectedComposition,
  onClose,
  selectComposition,
}: CompositionModalProps) {
  if (!isOpen) return null;
  const compositionCategories = Object.keys(composition.garment_composition);
  const garmentParts = Object.keys(composition.garment_parts);

  const [selectedCategory, setSelectedCategory] = useState<string>('Natural Fibers');
  const [selectedPart, setSelectedPart] = useState<string>('body');
  const [localComposition, setLocalComposition] =
    useState<CompositionStructure>(selectedComposition);
  // Radix Tabs do not measure layout like MUI; no need to defer mount

  const compositionGarment = Object.entries(
    composition.garment_composition[
      selectedCategory as keyof typeof composition.garment_composition
    ],
  );

  const isSelected = (materialKey: string) => {
    const currentPart = localComposition[selectedPart as keyof CompositionStructure];
    return currentPart?.some((item) => {
      // Find the code for this material key
      const code = compositionGarment.find(([key]) => key === materialKey)?.[1];
      return item.code === code;
    });
  };

  useEffect(() => {
    setLocalComposition(selectedComposition);
  }, [selectedComposition]);

  const currentPartItems = localComposition[selectedPart as keyof CompositionStructure] || [];

  const totalPercentage = useMemo(() => {
    return currentPartItems.reduce((acc, curr) => acc + curr.percent, 0);
  }, [currentPartItems]);

  const handlePercentageChange = (materialKey: string, value: string) => {
    const percentage = parseInt(value) || 0;
    if (percentage >= 0 && percentage <= 100) {
      const code = compositionGarment.find(([key]) => key === materialKey)?.[1];
      if (!code) return;

      const currentItem = currentPartItems.find((item) => item.code === code);
      const currentPercent = currentItem?.percent || 0;
      const newTotal = totalPercentage - currentPercent + percentage;

      if (newTotal > 100) {
        alert('Total percentage cannot exceed 100');
        return;
      }

      setLocalComposition((prev) => {
        const newComposition = { ...prev };
        const currentPart = newComposition[selectedPart as keyof CompositionStructure] || [];

        const updatedPart = currentPart.map((item) =>
          item.code === code ? { ...item, percent: percentage } : item,
        );

        newComposition[selectedPart as keyof CompositionStructure] = updatedPart;
        selectComposition(newComposition);
        return newComposition;
      });
    }
  };

  const handleSelectCategory = (category: string) => {
    setSelectedCategory(category);
  };

  const handleSelectPart = (part: string) => {
    setSelectedPart(part);
  };

  const handleContainerClick = (materialKey: string, materialCode: string) => {
    setLocalComposition((prev) => {
      const newComposition = { ...prev };
      const currentPart = newComposition[selectedPart as keyof CompositionStructure] || [];

      const existingIndex = currentPart.findIndex((item) => item.code === materialCode);

      if (existingIndex >= 0) {
        // Remove the item
        const updatedPart = currentPart.filter((_, index) => index !== existingIndex);
        newComposition[selectedPart as keyof CompositionStructure] =
          updatedPart.length > 0 ? updatedPart : undefined;
      } else {
        // Add the item
        const updatedPart = [...currentPart, { code: materialCode, percent: 0 }];
        newComposition[selectedPart as keyof CompositionStructure] = updatedPart;
      }

      selectComposition(newComposition);
      return newComposition;
    });
  };

  const handleRemovePart = (part: string) => {
    setLocalComposition((prev) => {
      const newComposition = { ...prev };
      delete newComposition[part as keyof CompositionStructure];
      selectComposition(newComposition);
      return newComposition;
    });
  };

  const getPercentageForMaterial = (materialKey: string): number => {
    const code = compositionGarment.find(([key]) => key === materialKey)?.[1];
    if (!code) return 0;
    return currentPartItems.find((item) => item.code === code)?.percent || 0;
  };

  const handleAutoAdjust = () => {
    if (currentPartItems.length === 0) return;

    const currentTotal = totalPercentage;
    const difference = 100 - currentTotal;

    // Find the item with the highest percentage to adjust
    const highestItem = currentPartItems.reduce((max, item) =>
      item.percent > max.percent ? item : max,
    );

    const newPercent = Math.max(0, highestItem.percent + difference);

    setLocalComposition((prev) => {
      const newComposition = { ...prev };
      const currentPart = newComposition[selectedPart as keyof CompositionStructure] || [];

      const updatedPart = currentPart.map((item) =>
        item.code === highestItem.code ? { ...item, percent: newPercent } : item,
      );

      newComposition[selectedPart as keyof CompositionStructure] = updatedPart;
      selectComposition(newComposition);
      return newComposition;
    });
  };

  return (
    <Dialog open={isOpen} onClose={onClose} keepMounted>
      <div className='w-full h-full space-y-4'>
        <Text>composition setup</Text>
        <div>
          <Text>select garment part</Text>
          <Tabs.Root value={selectedPart} onValueChange={setSelectedPart}>
            <Tabs.List className='flex gap-2 overflow-x-auto'>
              {garmentParts.map((part) => (
                <Tabs.Trigger
                  key={part}
                  value={part}
                  className='px-3 py-1 border rounded data-[state=active]:bg-green-50'
                >
                  <div className='flex items-center gap-2'>
                    {composition.garment_parts[part as keyof typeof composition.garment_parts]}
                    {localComposition[part as keyof CompositionStructure] && (
                      <Button
                        size='sm'
                        onClick={(e: React.MouseEvent) => {
                          e.stopPropagation();
                          handleRemovePart(part);
                        }}
                        className='text-xs'
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
        <div>
          <Text className='font-semibold mb-2'>Material Categories:</Text>
          <FormControl>
            <RadioGroup
              value={selectedCategory}
              onChange={(e) => handleSelectCategory(e.target.value)}
              sx={{
                display: 'grid',
                gridTemplateColumns: 'repeat(2, 1fr)',
                gap: 1,
              }}
            >
              {compositionCategories.map((category) => (
                <FormControlLabel
                  key={category}
                  value={category}
                  control={<Radio />}
                  label={category.toUpperCase()}
                  sx={{
                    '& .MuiFormControlLabel-label': {
                      fontWeight: 'bold',
                      fontSize: '0.875rem',
                    },
                  }}
                />
              ))}
            </RadioGroup>
          </FormControl>
        </div>
        <div>
          <Text className='font-semibold mb-2'>
            Materials for{' '}
            {composition.garment_parts[selectedPart as keyof typeof composition.garment_parts]}
            (Total: {totalPercentage}%)
          </Text>
          <div className='grid gap-2 max-h-64 overflow-y-auto'>
            {compositionGarment.map(([key, value]) => (
              <div
                key={key}
                className={cn(
                  'border border-text w-full h-16 flex gap-4 p-4 items-center justify-between hover:cursor-pointer',
                  {
                    'border-4 border-green-500': isSelected(key),
                  },
                )}
                onClick={() => handleContainerClick(key, value)}
              >
                <div className='flex items-center gap-2'>
                  <Text>{key.toUpperCase()}</Text>
                  <Text className='text-sm text-gray-500'>({value})</Text>
                </div>
                {isSelected(key) && (
                  <div className='flex items-center gap-2'>
                    <Input
                      name={key}
                      type='number'
                      value={getPercentageForMaterial(key)}
                      onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                        handlePercentageChange(key, e.target.value)
                      }
                      onClick={(e: React.MouseEvent) => e.stopPropagation()}
                      className='w-20'
                    />
                    <span>%</span>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
        <div className='flex justify-between items-center'>
          <Text className='text-sm text-gray-600'>
            Click materials to select/deselect, then set percentages
          </Text>
          <div className='flex items-center gap-4'>
            <Text
              className={cn('font-semibold', {
                'text-red-500':
                  totalPercentage > 100 || (currentPartItems.length > 0 && totalPercentage !== 100),
                'text-green-500': totalPercentage === 100,
                'text-yellow-500': totalPercentage > 0 && totalPercentage < 100,
              })}
            >
              {selectedPart}: {totalPercentage}%
            </Text>
            {currentPartItems.length > 0 && totalPercentage !== 100 && (
              <>
                <Text className='text-red-500 text-sm'>Must equal 100%</Text>
                <Button size='sm' onClick={handleAutoAdjust} className='text-xs'>
                  Auto-adjust to 100%
                </Button>
              </>
            )}
          </div>
        </div>
        <div className='flex justify-end gap-2 pt-4'>
          <Button onClick={onClose}>Cancel</Button>
          <Button
            onClick={() => {
              const hasInvalidParts = Object.entries(localComposition).some(([partKey, items]) => {
                if (!items || items.length === 0) return false;
                const partTotal = items.reduce(
                  (acc: number, item: CompositionItem) => acc + item.percent,
                  0,
                );
                return partTotal !== 100;
              });

              if (hasInvalidParts) {
                alert('All composition parts must total exactly 100%');
                return;
              }

              onClose();
            }}
            disabled={Object.entries(localComposition).some(([partKey, items]) => {
              if (!items || items.length === 0) return false;
              const partTotal = items.reduce(
                (acc: number, item: CompositionItem) => acc + item.percent,
                0,
              );
              return partTotal !== 100;
            })}
          >
            Save Composition
          </Button>
        </div>
      </div>
    </Dialog>
  );
}
