import { useState } from 'react';
import { useFormContext, useWatch } from 'react-hook-form';
import { Button } from 'ui/components/button';
import Text from 'ui/components/text';
import InputField from 'ui/form/fields/input-field';
import { ReadOnlyField } from '../read-only-field';
import { CARE_CODE_META } from './care-picker';
import { careInstruction } from './careInstruction';
import { CareInstructions } from './careInstructions';

interface SelectedInstructions {
  [category: string]: string;
}

interface CareInterface {
  editMode: boolean;
}

export function Care({ editMode }: CareInterface) {
  const [isCareTableOpen, setIsCareTableOpen] = useState(false);
  const { setValue, getValues } = useFormContext();
  const [selectedInstructions, setSelectedInstructions] = useState<SelectedInstructions>({});
  // Watch so the read-only display re-renders when a care code is (re)loaded into the form.
  const careValue =
    (useWatch({ name: 'product.productBodyInsert.careInstructions' }) as string) || '';

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

  // Care is a STYLE fact (edited on the tech card) — render the selected codes as their laundry
  // SYMBOLS in a clean read-only row, never as an input showing raw "MWN,DNB…" codes.
  if (!editMode) {
    const codes = careValue
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);
    return (
      <ReadOnlyField label='care instructions'>
        {codes.length === 0 ? (
          <Text size='small' className='text-textInactiveColor'>
            —
          </Text>
        ) : (
          <div className='flex flex-wrap items-center gap-1'>
            {codes.map((code) => {
              const m = CARE_CODE_META[code];
              return m?.img ? (
                <img key={code} src={m.img} title={m.name} alt={m.name} className='size-7' />
              ) : (
                <span key={code} className='text-textBaseSize'>
                  {code}
                </span>
              );
            })}
          </div>
        )}
      </ReadOnlyField>
    );
  }

  return (
    <>
      <div className='border-b border-textInactiveColor flex items-center w-full'>
        <div className='flex-1'>
          <InputField
            name='product.productBodyInsert.careInstructions'
            label='care instructions'
            className='w-full border-none leading-4 bg-transparent'
            readOnly={!editMode}
          />
        </div>

        {editMode && (
          <div className='flex gap-2'>
            <Button variant='simple' size='lg' onClick={handleClearInstructions}>
              clear
            </Button>
            <Button
              variant='simpleReverseWithBorder'
              size='lg'
              onClick={(e: React.MouseEvent) => handleOpenCareTable(e)}
            >
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
