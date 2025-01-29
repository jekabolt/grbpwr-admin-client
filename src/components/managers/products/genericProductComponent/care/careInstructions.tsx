import {
  FormControl,
  FormControlLabel,
  Grid2 as Grid,
  Radio,
  RadioGroup,
  Typography,
  useMediaQuery,
  useTheme,
} from '@mui/material';
import { Dialog } from 'components/common/utility/dialog';
import { FC, useState } from 'react';
import styles from './care.scss';
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
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('sm'));
  // const currentCategoryIndex = careCategories.indexOf(selectedCare!);

  const handleSelectCare = (category: string) => {
    setSelectedCare(category);
  };

  const renderCareMethods = (methods: Record<string, any>, subCategory?: string) => {
    return Object.entries(methods).map(([method, codeOrSubMethods]) => {
      if (typeof codeOrSubMethods === 'object' && codeOrSubMethods !== null) {
        if ('code' in codeOrSubMethods || 'img' in codeOrSubMethods) {
          const { code, img } = codeOrSubMethods;
          const selectionKey = subCategory ? `${selectedCare!}-${subCategory}` : selectedCare!;
          const isSelected = selectedInstructions[selectionKey] === code;

          return (
            <Grid size={{ xs: 4, sm: 1.7 }} key={code}>
              <Grid
                container
                onClick={() => onSelectCareInstruction(selectedCare!, method, code, subCategory)}
                className={styles['care-instructions-container']}
                data-selected={isSelected}
              >
                <Grid container className={styles['care-card']}>
                  {img && (
                    <Grid className={styles['care-card-img-container']}>
                      <img
                        src={img}
                        alt={method}
                        style={{
                          width: isSelected ? '80%' : '50%',
                          height: 'auto',
                        }}
                      />
                    </Grid>
                  )}
                  <Grid className={styles['care-card-text']}>
                    <Typography
                      variant='overline'
                      fontSize={isMobile ? '0.4em' : '0.58em'}
                      className={styles.text}
                    >
                      {isSelected ? code : method}
                    </Typography>
                  </Grid>
                </Grid>
              </Grid>
            </Grid>
          );
        } else {
          return (
            <Grid size={{ xs: 12 }} key={method}>
              <Typography variant='subtitle1' fontWeight='bold' sx={{ mb: 1 }}>
                {method.toUpperCase()}
              </Typography>
              <Grid container spacing={2}>
                {renderCareMethods(codeOrSubMethods, method)}
              </Grid>
            </Grid>
          );
        }
      }
      return null;
    });
  };

  return (
    <Dialog open={isCareTableOpen} onClose={close}>
      <Grid container spacing={2} sx={{ p: 2 }}>
        <Grid
          size={{ xs: 12 }}
          sx={{
            display: 'flex',
            justifyContent: isMobile ? 'flex-start' : 'center',
          }}
        >
          <FormControl>
            <RadioGroup
              row={!isMobile}
              value={selectedCare}
              onChange={(e) => handleSelectCare(e.target.value)}
              sx={{
                gap: isMobile ? 1 : 4,
                display: isMobile ? 'grid' : 'flex',
                gridTemplateColumns: isMobile ? 'repeat(2, 1fr)' : 'none',
              }}
            >
              {careCategories.map((category) => (
                <FormControlLabel
                  key={category}
                  value={category}
                  control={<Radio />}
                  label={category.toUpperCase()}
                  sx={{
                    '& .MuiFormControlLabel-label': {
                      fontSize: isMobile ? '0.8rem' : '1rem',
                      fontWeight: 'bold',
                    },
                  }}
                />
              ))}
            </RadioGroup>
          </FormControl>
        </Grid>
        {selectedCare && (
          <Grid size={{ xs: 12 }}>
            <Grid container spacing={2}>
              {renderCareMethods(
                careInstruction.care_instructions[
                  selectedCare as keyof typeof careInstruction.care_instructions
                ],
              )}
            </Grid>
          </Grid>
        )}
      </Grid>
    </Dialog>
  );
};
