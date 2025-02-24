import { FormControl, FormControlLabel, Radio, RadioGroup } from '@mui/material';
import { composition } from 'constants/garment-composition';
import { cn } from 'lib/utility';
import { FC, useEffect, useMemo, useState } from 'react';
import { Dialog } from 'ui/components/dialog';
import Input from 'ui/components/input';
import Text from 'ui/components/text';

interface SelectedInstructions {
  [key: string]: {
    code: string;
    percentage: number;
  };
}

interface CompositionModalProps {
  isOpen: boolean;
  onClose: () => void;
  selectedInstructions: SelectedInstructions;
  selectComposition: (instructions: SelectedInstructions) => void;
}

export const CompositionModal: FC<CompositionModalProps> = ({
  isOpen,
  selectedInstructions,
  onClose,
  selectComposition,
}) => {
  const compositionCategories = Object.keys(composition.garment_composition);
  const [selectedCategory, setSelectedCategory] = useState<string>('Natural Fibers');
  const [instructions, setInstructions] = useState<SelectedInstructions>(selectedInstructions);
  const compositionGarment = Object.entries(
    composition.garment_composition[
      selectedCategory as keyof typeof composition.garment_composition
    ],
  );

  const isSelected = (key: string) => {
    return !!instructions[key];
  };

  useEffect(() => {
    setInstructions(selectedInstructions);
  }, [selectedInstructions]);

  const totalPercentage = useMemo(() => {
    return Object.values(instructions).reduce((acc, curr) => acc + curr.percentage, 0);
  }, [instructions]);

  const handlePercentageChange = (key: string, value: string) => {
    const percentage = parseInt(value) || 0;
    if (percentage >= 0 && percentage <= 100) {
      const newTotal = totalPercentage - (instructions[key]?.percentage || 0) + percentage;
      if (newTotal > 100) {
        alert('Total percentage cannot exceed 100');
        return;
      }
      setInstructions((prev) => {
        const newState = { ...prev };
        if (newState[key]) {
          newState[key] = {
            ...newState[key],
            percentage,
          };
        }
        selectComposition(newState);
        return newState;
      });
    }
  };

  const handleSelectCategory = (category: string) => {
    setSelectedCategory(category);
  };

  const handleContainerClick = (key: string, value: string) => {
    setInstructions((prev) => {
      const newState = { ...prev };
      if (newState[key]) {
        delete newState[key];
      } else {
        newState[key] = {
          code: value,
          percentage: 0,
        };
      }
      selectComposition(newState);
      return newState;
    });
  };

  return (
    <Dialog open={isOpen} onClose={onClose}>
      <div className='space-y-4 h-full'>
        <div>
          <FormControl>
            <RadioGroup
              value={selectedCategory}
              onChange={(e) => handleSelectCategory(e.target.value)}
              sx={{
                display: 'grid',
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
                    },
                  }}
                />
              ))}
            </RadioGroup>
          </FormControl>
        </div>
        <div>
          <div className='grid gap-2'>
            {compositionGarment.map(([key, value]) => (
              <div
                key={key}
                className={cn(
                  'border border-text w-full h-20 flex gap-4 p-4 items-center justify-center hover:cursor-pointer',
                  {
                    'border-4': isSelected(key),
                  },
                )}
                onClick={() => handleContainerClick(key, value)}
              >
                <Text>{key.toUpperCase()}</Text>
                {isSelected(key) && (
                  <Input
                    name={key}
                    type='number'
                    value={instructions[key]?.percentage || ''}
                    onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                      handlePercentageChange(key, e.target.value)
                    }
                    onClick={(e: React.MouseEvent) => e.stopPropagation()}
                  />
                )}
              </div>
            ))}
          </div>
        </div>
      </div>
    </Dialog>
  );
};
