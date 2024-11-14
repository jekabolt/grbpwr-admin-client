import { Button, Grid2 as Grid, TextField } from '@mui/material';
import { common_ProductNew } from 'api/proto-http/admin';
import { useFormikContext } from 'formik';
import { FC, useState } from 'react';
import { CareInstructions } from './careInstructions';

interface SelectedInstructions {
  [category: string]: string;
}

interface CareInterface {
  isAddingProduct: boolean;
  isEditMode?: boolean;
}

export const Care: FC<CareInterface> = ({ isAddingProduct, isEditMode }) => {
  const [isCareTableOpen, setIsCareTableOpen] = useState(false);
  const { values, setFieldValue } = useFormikContext<common_ProductNew>();
  const [selectedInstructions, setSelectedInstructions] = useState<SelectedInstructions>(() => {
    const careInstructions = values.product?.productBody?.careInstructions || '';
    const instructions = careInstructions.split(',').filter(Boolean);
    return instructions.reduce((acc, code) => {
      acc[code] = code;
      return acc;
    }, {} as SelectedInstructions);
  });

  // ... existing code ...
  const handleSelectCareInstruction = (
    category: string,
    method: string,
    code: string,
    subCategory?: string,
  ) => {
    setSelectedInstructions((prev) => {
      const newState = { ...prev };

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

      setFieldValue('product.productBody.careInstructions', Object.values(newState).join(','));
      return newState;
    });
  };

  const handleOpenCareTable = () => {
    setIsCareTableOpen(true);
  };

  const handleCloseCareTable = () => {
    setIsCareTableOpen(false);
  };

  const handleClearInstructions = () => {
    setSelectedInstructions({});
    setFieldValue('product.productBody.careInstructions', '');
  };

  return (
    <Grid container>
      <Grid size={{ xs: 12 }}>
        <TextField
          fullWidth
          variant='outlined'
          name='product.productBody.careInstructions'
          label='Care Instructions'
          value={values.product?.productBody?.careInstructions || ''}
          slotProps={{
            input: {
              readOnly: true,
              endAdornment: (isAddingProduct || isEditMode) && (
                <>
                  <Button
                    variant='outlined'
                    onClick={handleClearInstructions}
                    sx={{ mr: 1 }}
                    disabled={!values.product?.productBody?.careInstructions}
                  >
                    Clear
                  </Button>
                  <Button variant='contained' onClick={handleOpenCareTable}>
                    Select
                  </Button>
                </>
              ),
            },
          }}
        />
      </Grid>
      <CareInstructions
        isCareTableOpen={isCareTableOpen}
        close={handleCloseCareTable}
        onSelectCareInstruction={handleSelectCareInstruction}
        selectedInstructions={selectedInstructions}
      />
    </Grid>
  );
};
