import {
  FormControl,
  FormControlLabel,
  Radio,
  RadioGroup,
  useMediaQuery,
  useTheme,
} from '@mui/material';
import { cn } from 'lib/utility';
import { FC, useState } from 'react';
import { Dialog } from 'ui/components/dialog';
import Media from 'ui/components/media';
import Text from 'ui/components/text';
import { careInstruction } from './careInstruction';

interface SelectedInstructions {
  [category: string]: string;
}

interface CareInstructionsProps {
  isCareTableOpen: boolean;
  close: () => void;
  onSelectCareInstruction: (
    category: string,
    method: string,
    code: string,
    subCategory?: string,
  ) => void;
  selectedInstructions: SelectedInstructions;
}

export const CareInstructions: FC<CareInstructionsProps> = ({
  isCareTableOpen,
  selectedInstructions,
  close,
  onSelectCareInstruction,
}) => {
  const careCategories = Object.keys(careInstruction.care_instructions);
  const [selectedCare, setSelectedCare] = useState<string | null>('Washing');
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('sm'));
  const nestedCareMethods = Object.values(
    careInstruction.care_instructions[
      selectedCare as keyof typeof careInstruction.care_instructions
    ],
  )[0]?.code;
  // const currentCategoryIndex = careCategories.indexOf(selectedCare!);

  const handleSelectCare = (category: string) => {
    setSelectedCare(category);
  };

  const renderCareMethods = (methods: Record<string, any>, subCategory?: string) => {
    return Object.entries(methods).map(([method, codeOrSubMethods]) => {
      if (typeof codeOrSubMethods === 'object' && codeOrSubMethods !== null) {
        if ('code' in codeOrSubMethods || 'img' in codeOrSubMethods) {
          const { code, img } = codeOrSubMethods;
          const selectionKey = subCategory ? `${selectedCare!}-${subCategory}` : selectedCare!;
          const isSelected = selectedInstructions[selectionKey] === code;
          console.log(isSelected);

          return (
            <div
              key={`${method}-${code}`}
              onClick={() => onSelectCareInstruction(selectedCare!, method, code, subCategory)}
              className={cn('border rounded-md cursor-pointer flex flex-col items-center w-full', {
                'bg-black/50': isSelected,
              })}
            >
              <div className='w-full f-full'>
                <Media src={img} alt={method} aspectRatio='1/1' fit='cover' />
              </div>
              <Text size='small'>{isSelected ? code : method}</Text>
            </div>
          );
        } else {
          return (
            <div key={`subcategory-${method}`} className='space-y-3'>
              <Text variant='uppercase' className='font-bold'>
                {method}
              </Text>
              <div className='grid grid-cols-2 lg:grid-cols-8 gap-2'>
                {renderCareMethods(codeOrSubMethods, method)}
              </div>
            </div>
          );
        }
      }
      return null;
    });
  };

  return (
    <Dialog open={isCareTableOpen} onClose={close} fullWidth>
      <div className='space-y-6'>
        <div>
          <FormControl>
            <RadioGroup
              row={!isMobile}
              value={selectedCare}
              onChange={(e) => handleSelectCare(e.target.value)}
              sx={{
                gap: isMobile ? 1 : 4,
                display: isMobile ? 'grid' : 'flex',
                gridTemplateColumns: isMobile ? 'repeat(2, 1fr)' : 'none',
              }}
            >
              {careCategories.map((category) => (
                <FormControlLabel
                  key={category}
                  value={category}
                  control={<Radio />}
                  label={category.toUpperCase()}
                  sx={{
                    '& .MuiFormControlLabel-label': {
                      fontSize: isMobile ? '0.8rem' : '1rem',
                      fontWeight: 'bold',
                    },
                  }}
                />
              ))}
            </RadioGroup>
          </FormControl>
        </div>
        {selectedCare && (
          <div
            className={cn('w-full', {
              'flex flex-col space-y-4': !nestedCareMethods,
              'grid grid-cols-2  lg:grid-cols-8 gap-2': nestedCareMethods,
            })}
          >
            {renderCareMethods(
              careInstruction.care_instructions[
                selectedCare as keyof typeof careInstruction.care_instructions
              ],
            )}
          </div>
        )}
      </div>
    </Dialog>
  );
};
