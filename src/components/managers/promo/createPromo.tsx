import { DatePicker, LocalizationProvider } from '@mui/x-date-pickers';
import { AdapterDateFns } from '@mui/x-date-pickers/AdapterDateFns';
import { common_PromoCodeInsert } from 'api/proto-http/admin';
import { useSnackBarStore } from 'lib/stores/store';
import { FC, useState } from 'react';
import { Button } from 'ui/components/button';
import CheckboxCommon from 'ui/components/checkbox';
import Input from 'ui/components/input';
import Text from 'ui/components/text';

interface CreatePromoInterface {
  createNewPromo: (newPromo: common_PromoCodeInsert) => void;
}

const addMonths = (date: Date, months: number) => {
  const newDate = new Date(date);
  newDate.setMonth(newDate.getMonth() + months);
  return newDate;
};

export const CreatePromo: FC<CreatePromoInterface> = ({ createNewPromo }) => {
  const { showMessage } = useSnackBarStore();
  const defaultDate = addMonths(new Date(), 3);
  const initialPromoStates: common_PromoCodeInsert = {
    code: '',
    freeShipping: false,
    discount: { value: '' },
    expiration: defaultDate.toISOString(),
    allowed: true,
    voucher: false,
    start: new Date().toISOString(),
  };

  const [promo, setPromo] = useState<common_PromoCodeInsert>(initialPromoStates);
  const [error, setError] = useState('');
  const [codeError, setCodeError] = useState('');

  const handlePromoCodeChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    setPromo((prev) => ({
      ...prev,
      code: value,
    }));
    if (codeError) setCodeError('');
  };

  const handleDiscountChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    if (!/^\d*$/.test(value)) return;

    if (parseInt(value, 10) > 100) {
      setError('discount cannot exceed 100%');
    } else {
      setError('');
    }
    setPromo((prev) => ({
      ...prev,
      discount: { value },
    }));
  };

  const handleCheckboxChange = (name: string) => (checked: boolean) => {
    setPromo((prev) => ({
      ...prev,
      [name]: checked,
    }));
  };

  const handleDateChange = (field: 'start' | 'expiration', newValue: Date | null) => {
    if (!newValue) return;

    const dateWithNoon = new Date(newValue);
    dateWithNoon.setHours(12, 0, 0, 0);

    setPromo((prev) => ({
      ...prev,
      [field]: dateWithNoon.toISOString(),
    }));
  };

  const validatePromoCode = (code: string) => {
    const trimmedCode = code.trim();

    const promoCodeRegex = /^[a-zA-Z0-9-_]+$/;

    if (!promoCodeRegex.test(trimmedCode)) {
      showMessage(
        'Promo code can only contain letters, numbers, hyphens, and underscores, and cannot contain spaces',
        'error',
      );
      return false;
    }
    setCodeError('');
    return true;
  };

  const uploadNewPromo = () => {
    if (promo.code?.trim() === '') {
      setCodeError('Promo code is required');
      return;
    } else {
      setCodeError('');
    }

    if (!validatePromoCode(promo.code || '')) {
      return;
    }

    if (parseFloat(promo.discount?.value || '') > 100) {
      showMessage("PROMO CAN'T BE CREATED: DISCOUNT CAN'T BE MORE THAN A HUNDRED", 'error');
      return;
    }
    const newPromo = { ...promo, code: promo.code };
    createNewPromo(newPromo);
    setPromo(initialPromoStates);
  };

  return (
    <LocalizationProvider dateAdapter={AdapterDateFns}>
      <div className='flex flex-col gap-2 items-start'>
        <div className='flex lg:flex-row flex-col gap-2 items-center w-full order-2 sm:order-1'>
          <div className='w-full'>
            <Input
              name='code'
              placeholder='PROMO CODE'
              value={promo.code || ''}
              onChange={handlePromoCodeChange}
              className='h-10'
            />
          </div>

          <div className='space-y-1 w-full'>
            <Input
              name='discount'
              placeholder='DISCOUNT'
              value={promo.discount?.value}
              onChange={handleDiscountChange}
              className='h-10'
            />
            {error && <p className='text-red-500 text-sm mt-1'>{error}</p>}
          </div>

          <div className='flex gap-2 w-full'>
            <DatePicker
              value={promo.start ? new Date(promo.start) : null}
              onChange={(newValue) => handleDateChange('start', newValue)}
              label='START DATE'
              slotProps={{ textField: { size: 'small', required: true } }}
            />
            <DatePicker
              value={promo.expiration ? new Date(promo.expiration) : null}
              onChange={(newValue) => handleDateChange('expiration', newValue)}
              minDate={new Date()}
              label='EXPIRATION DATE'
              slotProps={{ textField: { size: 'small', required: true } }}
            />
          </div>
          <Button size='lg' onClick={uploadNewPromo} className='lg:w-96 w-full'>
            Create Promo
          </Button>
        </div>

        <div className='flex gap-2 order-1 sm:order-2'>
          <div className='flex items-center gap-2'>
            <Text size='small' variant='uppercase'>
              free shipping
            </Text>
            <CheckboxCommon
              name='freeShipping'
              size='large'
              checked={promo.freeShipping}
              onChange={handleCheckboxChange('freeShipping')}
            />
          </div>

          <div className='flex items-center gap-2'>
            <Text size='small' variant='uppercase'>
              allowed
            </Text>
            <CheckboxCommon
              name='allowed'
              size='large'
              checked={promo.allowed}
              onChange={handleCheckboxChange('allowed')}
            />
          </div>

          <div className='flex items-center gap-2'>
            <Text size='small' variant='uppercase'>
              voucher
            </Text>
            <CheckboxCommon
              name='voucher'
              size='large'
              checked={promo.voucher}
              onChange={handleCheckboxChange('voucher')}
            />
          </div>
        </div>
      </div>
    </LocalizationProvider>
  );
};
