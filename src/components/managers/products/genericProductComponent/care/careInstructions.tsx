import CloseIcon from '@mui/icons-material/Close';
import {
  Dialog,
  FormControl,
  FormControlLabel,
  Grid,
  IconButton,
  Radio,
  RadioGroup,
  Typography,
  useMediaQuery,
  useTheme,
} from '@mui/material';
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
  close,
  onSelectCareInstruction,
  selectedInstructions,
}) => {
  const careCategories = Object.keys(careInstruction.care_instructions);
  const [selectedCare, setSelectedCare] = useState<string | null>(null);
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('sm'));

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
            <Grid item xs={4} sm={1.5} key={code}>
              <Grid
                container
                onClick={() => onSelectCareInstruction(selectedCare!, method, code, subCategory)}
                className={styles['care-instructions-container']}
                data-selected={isSelected}
              >
                <Grid container className={styles['care-card']}>
                  {img && (
                    <Grid item className={styles['care-card-img-container']}>
                      <img src={img} alt={method} style={{ width: isMobile ? '25px' : '50px' }} />
                    </Grid>
                  )}
                  <Grid item className={styles['care-card-text']}>
                    <Typography
                      variant='overline'
                      fontSize={isMobile ? '0.3rem' : '0.5rem'}
                      className={styles.text}
                    >
                      {method}
                    </Typography>
                  </Grid>
                </Grid>
              </Grid>
            </Grid>
          );
        } else {
          return (
            <Grid item xs={12} key={method}>
              <Typography variant='subtitle1' fontWeight='bold' sx={{ mb: 1 }}>
                {method}
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
    <Dialog
      open={isCareTableOpen}
      onClose={close}
      maxWidth='xl'
      fullScreen={isMobile}
      fullWidth
      PaperProps={{
        sx: {
          m: isMobile ? 0 : 2,
          height: isMobile ? '100%' : 'auto',
          maxHeight: isMobile ? '100%' : '90vh',
          position: 'relative',
        },
      }}
    >
      <IconButton onClick={close} sx={{ position: 'absolute', top: 0, right: 0, zIndex: 1 }}>
        <CloseIcon />
      </IconButton>
      <Grid container spacing={2} sx={{ p: 2 }}>
        <Grid item xs={12} sx={{ display: 'flex', justifyContent: 'center' }}>
          <FormControl>
            <RadioGroup
              row
              value={selectedCare}
              onChange={(e) => handleSelectCare(e.target.value)}
              sx={{ gap: 4 }}
            >
              {careCategories.map((category) => (
                <FormControlLabel
                  key={category}
                  value={category}
                  control={<Radio />}
                  label={category}
                />
              ))}
            </RadioGroup>
          </FormControl>
        </Grid>
        {selectedCare && (
          <Grid item xs={12}>
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
