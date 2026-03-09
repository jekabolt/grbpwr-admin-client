import { cn } from 'lib/utility';
import { FC, useState } from 'react';
import { Button } from 'ui/components/button';
import { CareCompositionModal } from '../care-composition-modal';
import { CareMethodsList } from './care-card';
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
  const nestedCareMethods = Object.values(
    careInstruction.care_instructions[
      selectedCare as keyof typeof careInstruction.care_instructions
    ],
  )[0]?.code;

  const handleSelectCare = (category: string) => {
    setSelectedCare(category);
  };

  return (
    <CareCompositionModal
      title='care'
      open={isCareTableOpen}
      onOpenChange={close}
      footer={
        <div className='flex justify-end items-center gap-2'>
          <Button size='lg' variant='secondary' onClick={close}>
            Cancel
          </Button>
          <Button size='lg' variant='main' onClick={close}>
            Save
          </Button>
        </div>
      }
    >
      <div className='space-y-6'>
        <div className='flex gap-3 sticky top-0 bg-bgColor'>
          {careCategories.map((category) => (
            <Button
              key={category}
              size='lg'
              variant='secondary'
              onClick={() => handleSelectCare(category)}
              className={cn('uppercase', selectedCare === category && 'bg-textInactiveColor')}
            >
              {category}
            </Button>
          ))}
        </div>
        {selectedCare && (
          <div
            className={cn('w-full', {
              'flex flex-col space-y-4': !nestedCareMethods,
              'grid grid-cols-2 lg:grid-cols-4 gap-2': nestedCareMethods,
            })}
          >
            <CareMethodsList
              methods={
                careInstruction.care_instructions[
                  selectedCare as keyof typeof careInstruction.care_instructions
                ]
              }
              selectedCare={selectedCare}
              selectedInstructions={selectedInstructions}
              onSelectCareInstruction={onSelectCareInstruction}
            />
          </div>
        )}
      </div>
    </CareCompositionModal>
  );
};
