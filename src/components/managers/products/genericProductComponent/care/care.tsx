import { Button, Grid2 as Grid, TextField } from '@mui/material';
import { common_ProductNew } from 'api/proto-http/admin';
import { useFormikContext } from 'formik';
import { FC, useState } from 'react';
import { careInstruction } from './careInstruction';
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
  const [selectedInstructions, setSelectedInstructions] = useState<SelectedInstructions>({});

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
    if (values.product?.productBody?.careInstructions) {
      const codes = values.product.productBody.careInstructions.split(',');
      const newSelectedInstructions: SelectedInstructions = {};

      Object.entries(careInstruction.care_instructions).forEach(([category, methods]) => {
        if (category === 'Professional Care') {
          Object.entries(methods).forEach(([subCategory, subMethods]) => {
            Object.values(subMethods).forEach((method: any) => {
              if (codes.includes(method.code)) {
                newSelectedInstructions[`${category}-${subCategory}`] = method.code;
              }
            });
          });
        } else {
          Object.values(methods).forEach((method: any) => {
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
