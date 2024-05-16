import { Button, Checkbox, FormControlLabel, Grid, TextField } from '@mui/material';
import { DateTimePicker, LocalizationProvider } from '@mui/x-date-pickers';
import { AdapterDateFns } from '@mui/x-date-pickers/AdapterDateFns';
import { addPromo } from 'api/promo';
import { common_PromoCodeInsert } from 'api/proto-http/admin';
import { Layout } from 'components/login/layout';
import { removePossibilityToUseSigns } from 'features/utilitty/removePossibilityToEnterSigns';
import { FC, useState } from 'react';

export const Promo: FC = () => {
  const initialPromoStates: common_PromoCodeInsert = {
    code: '',
    freeShipping: false,
    discount: { value: '0' },
    expiration: '',
    allowed: true,
    voucher: false,
  };
  const [promo, setPromo] = useState<common_PromoCodeInsert>(initialPromoStates);
  const [snackBarMessage, setSnackBarMessage] = useState<string>('');
  const [isSnackBarOpen, setIsSnackBarOpen] = useState<boolean>(false);
  const [snackBarSeverity, setSnackBarSeverity] = useState<'success' | 'error'>('success');

  const showMessage = (message: string, severity: 'success' | 'error') => {
    setSnackBarMessage(message);
    setSnackBarSeverity(severity);
    setIsSnackBarOpen(true);
  };

  const handlePromoFieldsChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value, type, checked } = e.target;
    setPromo((prevPromo: common_PromoCodeInsert): common_PromoCodeInsert => {
      if (type === 'checkbox') {
        return {
          ...prevPromo,
          [name]: checked,
        };
      } else {
        if (name === 'discount') {
          return {
            ...prevPromo,
            discount: { value },
          };
        }
        return {
          ...prevPromo,
          [name]: value,
        };
      }
    });
  };

  const handleDateTimeChange = (newValue: Date | null) => {
    handlePromoFieldsChange({
      target: {
        name: 'expiration',
        value: newValue ? newValue.toISOString() : '',
        type: 'date',
      },
    } as React.ChangeEvent<HTMLInputElement>); // Casting as needed for the synthetic event
  };

  const createNewPromo = async () => {
    await addPromo({ promo });
    setPromo(initialPromoStates);
  };

  return (
    <LocalizationProvider dateAdapter={AdapterDateFns}>
      <Layout>
        <Grid container marginTop={4} justifyContent='center' spacing={4}>
          <Grid item xs={12} sm={8} md={7}>
            <Grid container spacing={2}>
              <Grid item xs={12} sm={4}>
                <TextField
                  name='code'
                  value={promo.code}
                  variant='outlined'
                  label='PROMO CODE'
                  size='medium'
                  fullWidth
                  onChange={handlePromoFieldsChange}
                />
              </Grid>
              <Grid item xs={12} sm={4}>
                <TextField
                  name='discount'
                  value={promo.discount?.value}
                  type='number'
                  inputProps={{ min: 0, max: 99 }}
                  onKeyDown={removePossibilityToUseSigns}
                  variant='outlined'
                  label='DISCOUNT'
                  size='medium'
                  fullWidth
                  onChange={handlePromoFieldsChange}
                />
              </Grid>
              <Grid item xs={12} sm={4}>
                <DateTimePicker
                  value={promo.expiration ? new Date(promo.expiration) : null}
                  onChange={handleDateTimeChange}
                  label='EXPIRATION DATE'
                />
              </Grid>
            </Grid>
            <Grid container>
              <Grid item xs={12} sm={4}>
                <FormControlLabel
                  control={
                    <Checkbox
                      name='freeShipping'
                      size='large'
                      checked={promo.freeShipping}
                      onChange={handlePromoFieldsChange}
                    />
                  }
                  label='FREE SHIPPING'
                  labelPlacement='end'
                />
              </Grid>
              <Grid item xs={12} sm={4}>
                <FormControlLabel
                  control={
                    <Checkbox
                      name='allowed'
                      size='large'
                      checked={promo.allowed}
                      onChange={handlePromoFieldsChange}
                    />
                  }
                  label='ALLOWED'
                  labelPlacement='end'
                />
              </Grid>
              <Grid item xs={12} sm={4}>
                <FormControlLabel
                  control={
                    <Checkbox
                      name='voucher'
                      size='large'
                      checked={promo.voucher}
                      onChange={handlePromoFieldsChange}
                    />
                  }
                  label='VOUCHER'
                  labelPlacement='end'
                />
              </Grid>
            </Grid>
          </Grid>
          <Grid item xs={12} sm={4} md={2} container alignItems='center'>
            <Button variant='contained' size='large' onClick={createNewPromo}>
              Create Promo
            </Button>
          </Grid>
        </Grid>
      </Layout>
    </LocalizationProvider>
  );
};
