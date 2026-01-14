import { composition, CompositionStructure } from 'constants/garment-composition';
import { useState } from 'react';
import { useFormContext } from 'react-hook-form';
import { Button } from 'ui/components/button';
import InputField from 'ui/form/fields/input-field';
import { CompositionModal } from './composition-modal/composition-modal';

interface CompositionProps {
  editMode: boolean;
}

export function Composition({ editMode }: CompositionProps) {
  const { getValues, setValue } = useFormContext();
  const [isCompositionModalOpen, setIsCompositionModalOpen] = useState(false);
  const [selectedComposition, setSelectedComposition] = useState<CompositionStructure>({});

  const parseOldComposition = (compositionString: string): CompositionStructure => {
    if (!compositionString) return {};

    const instructions = compositionString
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);

    const bodyItems = instructions
      .map((item) => {
        const [code, percentage] = item.split(':').map((s) => s.trim());
        return {
          code,
          percent: parseInt(percentage) || 0,
        };
      })
      .filter((item) => item.code);

    return bodyItems.length > 0 ? { body: bodyItems } : {};
  };

  const formatCompositionForDisplay = (compositionStructure: CompositionStructure): string => {
    const parts: string[] = [];

    Object.entries(compositionStructure).forEach(([partKey, items]) => {
      if (items && items.length > 0) {
        const partName =
          composition.garment_parts[partKey as keyof typeof composition.garment_parts];
        const itemsString = items
          .filter((item: any) => item.percent > 0)
          .map((item: any) => `${item.code}:${item.percent}%`)
          .join(', ');

        if (itemsString) {
          parts.push(`${partName}: ${itemsString}`);
        }
      }
    });

    return parts.join(' | ');
  };

  const handleSelectComposition = (newComposition: CompositionStructure) => {
    setSelectedComposition(newComposition);

    const compositionValue =
      Object.keys(newComposition).length > 0 ? JSON.stringify(newComposition) : '';

    setValue('product.productBodyInsert.composition', compositionValue, {
      shouldDirty: true,
      shouldTouch: true,
      shouldValidate: true,
    });
  };

  const handleOpenCompositionModal = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    const currentCompositionValue =
      (getValues('product.productBodyInsert.composition') as string) || '';
    let parsedComposition: CompositionStructure = {};

    if (currentCompositionValue) {
      try {
        parsedComposition = JSON.parse(currentCompositionValue);
      } catch {
        parsedComposition = parseOldComposition(currentCompositionValue);
      }
    }

    setSelectedComposition(parsedComposition);
    setIsCompositionModalOpen(true);
  };

  const handleCloseCompositionModal = () => {
    setIsCompositionModalOpen(false);
  };

  const handleClearCompositionField = () => {
    setValue('product.productBodyInsert.composition', '', {
      shouldDirty: true,
      shouldTouch: true,
      shouldValidate: true,
    });
    setSelectedComposition({});
  };

  const getDisplayValue = (): string => {
    const currentCompositionValue =
      (getValues('product.productBodyInsert.composition') as string) || '';

    if (!currentCompositionValue) return '';

    try {
      const parsedComposition = JSON.parse(currentCompositionValue);
      return formatCompositionForDisplay(parsedComposition);
    } catch {
      return currentCompositionValue;
    }
  };

  return (
    <div className='w-full h-full'>
      <div className='border-b border-textColor flex items-center w-full'>
        <div className='flex-1'>
          <InputField
            name='product.productBodyInsert.composition'
            value={getDisplayValue()}
            label='composition'
            className='w-full border-none leading-4 bg-transparent'
            readOnly={!editMode}
          />
        </div>
        {editMode && (
          <div className='flex gap-2'>
            <Button size='lg' onClick={handleClearCompositionField}>
              clear
            </Button>
            <Button size='lg' onClick={(e: React.MouseEvent) => handleOpenCompositionModal(e)}>
              select
            </Button>
          </div>
        )}
      </div>
      <CompositionModal
        isOpen={isCompositionModalOpen}
        selectedComposition={selectedComposition}
        selectComposition={handleSelectComposition}
        onClose={handleCloseCompositionModal}
      />
    </div>
  );
}
