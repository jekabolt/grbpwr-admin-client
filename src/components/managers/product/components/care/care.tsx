import { useState } from 'react';
import { useFormContext } from 'react-hook-form';
import { Button } from 'ui/components/button';
import InputField from 'ui/form/fields/input-field';
import { careInstruction } from './careInstruction';
import { CareInstructions } from './careInstructions';

interface SelectedInstructions {
  [category: string]: string;
}

interface CareInterface {
  isAddingProduct?: boolean;
  isEditMode?: boolean;
}

export function Care({ isAddingProduct = true, isEditMode }: CareInterface) {
  const [isCareTableOpen, setIsCareTableOpen] = useState(false);
  const { setValue, getValues } = useFormContext();
  const [selectedInstructions, setSelectedInstructions] = useState<SelectedInstructions>({});

  const handleSelectCareInstruction = (
    category: string,
    method: string,
    code: string,
    subCategory?: string,
  ) => {
    setSelectedInstructions((prev) => {
      const newState = { ...prev } as SelectedInstructions;

      if (category === 'Professional Care' && subCategory) {
        const selectionKey = `${category}-${subCategory}`;

        if (prev[selectionKey] === code) {
          delete newState[selectionKey];
        } else {
          newState[selectionKey] = code;
        }
      } else {
        if (prev[category] === code) {
          delete newState[category];
        } else {
          newState[category] = code;
        }
      }

      setValue('product.productBodyInsert.careInstructions', Object.values(newState).join(','), {
        shouldDirty: true,
        shouldTouch: true,
        shouldValidate: true,
      });
      return newState;
    });
  };

  const handleOpenCareTable = (e: React.MouseEvent) => {
    e.preventDefault();
    const existing = getValues('product.productBodyInsert.careInstructions') as string | undefined;
    if (existing) {
      const codes = existing.split(',');
      const newSelectedInstructions: SelectedInstructions = {};

      Object.entries(careInstruction.care_instructions).forEach(([category, methods]) => {
        if (category === 'Professional Care') {
          Object.entries(methods as Record<string, any>).forEach(([subCategory, subMethods]) => {
            Object.values(subMethods as Record<string, any>).forEach((method: any) => {
              if (codes.includes(method.code)) {
                newSelectedInstructions[`${category}-${subCategory}`] = method.code;
              }
            });
          });
        } else {
          Object.values(methods as Record<string, any>).forEach((method: any) => {
            if (codes.includes(method.code)) {
              newSelectedInstructions[category] = method.code;
            }
          });
        }
      });

      setSelectedInstructions(newSelectedInstructions);
    }
    setIsCareTableOpen(true);
  };

  const handleCloseCareTable = () => {
    setIsCareTableOpen(false);
  };

  const handleClearInstructions = () => {
    setSelectedInstructions({});
    setValue('product.productBodyInsert.careInstructions', '', {
      shouldDirty: true,
      shouldTouch: true,
      shouldValidate: true,
    });
  };

  return (
    <>
      <div className='border-b border-textColor flex items-center w-full'>
        <div className='flex-1'>
          <InputField
            name='product.productBodyInsert.careInstructions'
            label='care instructions'
            className='w-full border-none leading-4 bg-transparent'
          />
        </div>

        {(isAddingProduct || isEditMode) && (
          <div className='flex gap-2'>
            <Button size='lg' onClick={handleClearInstructions}>
              clear
            </Button>
            <Button size='lg' onClick={(e: React.MouseEvent) => handleOpenCareTable(e)}>
              select
            </Button>
          </div>
        )}
      </div>
      <CareInstructions
        isCareTableOpen={isCareTableOpen}
        close={handleCloseCareTable}
        onSelectCareInstruction={handleSelectCareInstruction}
        selectedInstructions={selectedInstructions}
      />
    </>
  );
}
