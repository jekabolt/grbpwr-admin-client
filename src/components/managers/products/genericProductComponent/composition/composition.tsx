import { Button, Grid2 as Grid, TextField } from '@mui/material';
import { common_ProductNew } from 'api/proto-http/admin';
import { useFormikContext } from 'formik';
import { FC, useState } from 'react';
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
  const [selectedInstructions, setSelectedInstructions] = useState<SelectedInstructions>(() => {
    const composition = values.product?.productBody?.composition || '';
    const instructions = composition.split(',').filter(Boolean);
    return instructions.reduce((acc, item) => {
      const [code, percentage] = item.split(':');
      if (code) {
        acc[code] = {
          code,
          percentage: parseInt(percentage) || 0,
        };
      }
      return acc;
    }, {} as SelectedInstructions);
  });

  const handleSelectComposition = (newInstructions: SelectedInstructions) => {
    setSelectedInstructions(newInstructions);
    const formattedValue = Object.values(newInstructions)
      .map((item) => `${item.code}:${item.percentage}`)
      .join(',');
    setFieldValue('product.productBody.composition', formattedValue);
  };

  const handleOpenCompositionModal = () => {
    setIsCompositionModalOpen(true);
  };

  const handleCloseCompositionModal = () => {
    setIsCompositionModalOpen(false);
  };

  const handleClearCompositionField = () => {
    setFieldValue('product.productBody.composition', '');
  };

  return (
    <Grid container spacing={2}>
      <Grid size={{ xs: 12 }}>
        <TextField
          fullWidth
          name='product.productBody.composition'
          value={values.product?.productBody?.composition || ''}
          label='Composition'
          slotProps={{
            input: {
              readOnly: true,
              endAdornment: (isEditMode || isAddingProduct) && (
                <>
                  <Button variant='outlined' sx={{ mr: 1 }} onClick={handleClearCompositionField}>
                    Clean
                  </Button>
                  <Button variant='contained' onClick={handleOpenCompositionModal}>
                    Select
                  </Button>
                </>
              ),
            },
          }}
        />
      </Grid>
      <CompositionModal
        isOpen={isCompositionModalOpen}
        selectedInstructions={selectedInstructions}
        selectComposition={handleSelectComposition}
        onClose={handleCloseCompositionModal}
      />
    </Grid>
  );
};
