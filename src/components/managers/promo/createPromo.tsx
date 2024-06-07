import { Button, Checkbox, FormControlLabel, Grid, TextField } from '@mui/material';
import { DatePicker, LocalizationProvider } from '@mui/x-date-pickers';
import { AdapterDateFns } from '@mui/x-date-pickers/AdapterDateFns';
import { addPromo } from 'api/promo';
import { common_PromoCodeInsert } from 'api/proto-http/admin';
import { removePossibilityToUseSigns } from 'features/utilitty/removePossibilityToEnterSigns';
import { FC, useState } from 'react';

interface CreatePromoInterface {
  fetchPromos: (limit: number, offset: number) => void;
  showMessage: (message: string, severity: 'success' | 'error') => void;
}

export const CreatePromo: FC<CreatePromoInterface> = ({ fetchPromos, showMessage }) => {
  const initialPromoStates: common_PromoCodeInsert = {
    code: '',
    freeShipping: false,
    discount: { value: '0' },
    expiration: '',
    allowed: true,
    voucher: false,
  };

  const [promo, setPromo] = useState<common_PromoCodeInsert>(initialPromoStates);
  const [error, setError] = useState('');

  const handlePromoFieldsChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value, type, checked } = e.target;
    if (name === 'discount' && parseInt(value, 10) > 100) {
      setError('discount cannot exceed 100%');
    } else {
      setError('');
    }
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
      },
    } as React.ChangeEvent<HTMLInputElement>);
  };

  const createNewPromo = async () => {
    try {
      if (parseFloat(promo.discount?.value || '') > 100) {
        showMessage("PRODUCT CAN'T BE CREATED", 'error');
      } else {
        await addPromo({ promo });
        setPromo(initialPromoStates);
        showMessage('PROMO CREATED', 'success');
        fetchPromos(50, 0);
      }
    } catch {
      showMessage('smth', 'error');
    }
  };

  return (
    <LocalizationProvider dateAdapter={AdapterDateFns}>
      <Grid container marginTop={4} justifyContent='center' spacing={4}>
        <Grid item xs={12} sm={8} md={7}>
          <Grid container spacing={2}>
            <Grid item xs={12} sm={4}>
              <TextField
                name='code'
                value={promo.code}
                variant='outlined'
                label='PROMO CODE'
                size='small'
                onChange={handlePromoFieldsChange}
              />
            </Grid>
            <Grid item xs={12} sm={4}>
              <TextField
                error={!!error}
                helperText={error}
                name='discount'
                value={promo.discount?.value}
                type='number'
                inputProps={{ min: 0, max: 99 }}
                onKeyDown={removePossibilityToUseSigns}
                variant='outlined'
                label='DISCOUNT'
                size='small'
                onChange={handlePromoFieldsChange}
                style={{ width: '195px' }}
              />
            </Grid>
            <Grid item xs={12} sm={4}>
              <DatePicker
                value={promo.expiration ? new Date(promo.expiration) : null}
                onChange={handleDateTimeChange}
                minDate={new Date()}
                label='EXPIRATION DATE'
                slotProps={{ textField: { size: 'small' } }}
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
    </LocalizationProvider>
  );
};
