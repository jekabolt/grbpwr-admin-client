import { TextField } from '@mui/material';
import { common_ProductNew } from 'api/proto-http/admin';
import { composition } from 'constants/garment-composition';
import { useFormikContext } from 'formik';
import { FC, useState } from 'react';
import { Button } from 'ui/components/button';
import { CompositionModal } from './composition-modal/composition-modal';

interface CompositionProps {
  isAddingProduct: boolean;
  isEditMode?: boolean;
}
interface SelectedInstructions {
  [key: string]: {
    code: string;
    percentage: number;
  };
}

export const Composition: FC<CompositionProps> = ({ isAddingProduct, isEditMode }) => {
  const { values, setFieldValue } = useFormikContext<common_ProductNew>();
  const [isCompositionModalOpen, setIsCompositionModalOpen] = useState(false);
  const [selectedInstructions, setSelectedInstructions] = useState<SelectedInstructions>({});

  const handleSelectComposition = (newInstructions: SelectedInstructions) => {
    let updatedInstructions: SelectedInstructions;
    updatedInstructions = newInstructions;

    setSelectedInstructions(updatedInstructions);

    const formattedValue = Object.values(updatedInstructions)
      .filter((item) => item.percentage > 0)
      .map((item) => `${item.code}:${item.percentage}`)
      .join(',');

    setFieldValue('product.productBody.composition', formattedValue);
  };

  const handleOpenCompositionModal = () => {
    const currentComposition = values.product?.productBody?.composition || '';
    const instructions = currentComposition
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);

    const currentInstructions = instructions.reduce((acc, item) => {
      const [code, percentage] = item.split(':').map((s) => s.trim());
      if (code) {
        let foundKey = '';
        Object.values(composition.garment_composition).forEach((category) => {
          Object.entries(category).forEach(([key, value]) => {
            if (value === code) {
              foundKey = key;
            }
          });
        });

        if (foundKey) {
          acc[foundKey] = {
            code,
            percentage: parseInt(percentage) || 0,
          };
        }
      }
      return acc;
    }, {} as SelectedInstructions);
    setSelectedInstructions(currentInstructions);
    setIsCompositionModalOpen(true);
  };

  const handleCloseCompositionModal = () => {
    setIsCompositionModalOpen(false);
  };

  const handleClearCompositionField = () => {
    setFieldValue('product.productBody.composition', '');
  };

  return (
    <div className='w-full'>
      <div className='w-full'>
        <TextField
          fullWidth
          name='product.productBody.composition'
          value={values.product?.productBody?.composition || ''}
          label='Composition'
          slotProps={{
            input: {
              readOnly: true,
              endAdornment: (isEditMode || isAddingProduct) && (
                <div className='flex gap-2'>
                  <Button
                    disabled={!values.product?.productBody?.composition}
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
        selectedInstructions={selectedInstructions}
        selectComposition={handleSelectComposition}
        onClose={handleCloseCompositionModal}
      />
    </div>
  );
};
