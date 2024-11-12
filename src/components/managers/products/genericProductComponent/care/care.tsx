import { Button, Grid, Typography } from '@mui/material';
import { common_ProductNew } from 'api/proto-http/admin';
import { useFormikContext } from 'formik';
import { FC, useState } from 'react';
import { CareInstructions } from './careInstructions';

interface SelectedInstructions {
  [category: string]: string;
}

export const Care: FC = () => {
  const [isCareTableOpen, setIsCareTableOpen] = useState(false);
  const { values, setFieldValue } = useFormikContext<common_ProductNew>();
  const [selectedInstructions, setSelectedInstructions] = useState<SelectedInstructions>({});

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

  return (
    <Grid>
      <Button onClick={handleOpenCareTable}>Care Instructions</Button>
      {Object.keys(selectedInstructions).length > 0 && (
        <Grid item xs={12}>
          <Typography variant='subtitle2'>Selected Instructions:</Typography>
          <Typography variant='body2'>{Object.values(selectedInstructions).join(', ')}</Typography>
        </Grid>
      )}
      <CareInstructions
        isCareTableOpen={isCareTableOpen}
        close={handleCloseCareTable}
        onSelectCareInstruction={handleSelectCareInstruction}
        selectedInstructions={selectedInstructions}
      />
    </Grid>
  );
};
