import { TextField } from '@mui/material';
import { common_ProductNew } from 'api/proto-http/admin';
import { composition, CompositionStructure } from 'constants/garment-composition';
import { useFormikContext } from 'formik';
import { FC, useState } from 'react';
import { Button } from 'ui/components/button';
import { CompositionModal } from './composition-modal/composition-modal';

interface CompositionProps {
  isAddingProduct: boolean;
  isEditMode?: boolean;
}

export const Composition: FC<CompositionProps> = ({ isAddingProduct, isEditMode }) => {
  const { values, setFieldValue } = useFormikContext<common_ProductNew>();
  const [isCompositionModalOpen, setIsCompositionModalOpen] = useState(false);
  const [selectedComposition, setSelectedComposition] = useState<CompositionStructure>({});

  // Parse composition from string to new structure (for backward compatibility)
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

  // Convert new structure to display string
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

    // Store composition as JSON string
    const compositionValue =
      Object.keys(newComposition).length > 0 ? JSON.stringify(newComposition) : '';

    setFieldValue('product.productBody.composition', compositionValue);
  };

  const handleOpenCompositionModal = () => {
    const currentCompositionValue = values.product?.productBodyInsert?.composition || '';
    let parsedComposition: CompositionStructure = {};

    if (currentCompositionValue) {
      try {
        // Try to parse as JSON
        parsedComposition = JSON.parse(currentCompositionValue);
      } catch {
        // Fall back to old string format parsing for backward compatibility
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
    setFieldValue('product.productBody.composition', '');
    setSelectedComposition({});
  };

  // Get display value
  const getDisplayValue = (): string => {
    const currentCompositionValue = values.product?.productBodyInsert?.composition || '';

    if (!currentCompositionValue) return '';

    try {
      // Try to parse as JSON
      const parsedComposition = JSON.parse(currentCompositionValue);
      return formatCompositionForDisplay(parsedComposition);
    } catch {
      // Fall back to displaying the old format as-is for backward compatibility
      return currentCompositionValue;
    }
  };

  return (
    <div className='w-full'>
      <div className='w-full'>
        <TextField
          fullWidth
          name='product.productBody.composition'
          value={getDisplayValue()}
          label='Composition'
          slotProps={{
            input: {
              readOnly: true,
              endAdornment: (isEditMode || isAddingProduct) && (
                <div className='flex gap-2'>
                  <Button
                    disabled={!values.product?.productBodyInsert?.composition}
                    size='lg'
                    onClick={handleClearCompositionField}
                  >
                    clear
                  </Button>
                  <Button size='lg' onClick={handleOpenCompositionModal}>
                    select
                  </Button>
                </div>
              ),
            },
          }}
        />
      </div>
      <CompositionModal
        isOpen={isCompositionModalOpen}
        selectedComposition={selectedComposition}
        selectComposition={handleSelectComposition}
        onClose={handleCloseCompositionModal}
      />
    </div>
  );
};
