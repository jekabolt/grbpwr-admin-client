import SearchIcon from '@mui/icons-material/Search';
import {
  Button,
  FormControl,
  Grid2 as Grid,
  InputLabel,
  MenuItem,
  Select,
  TextField,
} from '@mui/material';
import { common_OrderStatusEnum, common_PaymentMethodNameEnum } from 'api/proto-http/admin';
import { useState } from 'react';
import { FilterProps } from '../interfaces/interface';

export function Filter({ dictionary, loading, onSearch }: FilterProps) {
  const [status, setStatus] = useState('');
  const [paymentMethod, setPaymentMethod] = useState('');
  const [orderId, setOrderId] = useState('');
  const [email, setEmail] = useState('');

  const handleSearch = () => {
    const filters = {
      status: (status as common_OrderStatusEnum) || undefined,
      paymentMethod: (paymentMethod as common_PaymentMethodNameEnum) || undefined,
      orderId: orderId || undefined,
      email: email || undefined,
    };
    onSearch(filters);
  };

  return (
    <Grid container spacing={2}>
      <Grid size={{ xs: 12, md: 2 }}>
        <FormControl fullWidth>
          <InputLabel sx={{ textTransform: 'uppercase' }}>status</InputLabel>
          <Select value={status} label='status' onChange={(e) => setStatus(e.target.value)}>
            <MenuItem value='' sx={{ textTransform: 'uppercase' }}>
              any
            </MenuItem>
            {dictionary?.orderStatuses?.map((status) => (
              <MenuItem key={status.id} value={status.id}>
                {status.name?.replace('ORDER_STATUS_ENUM_', '').replace('_', ' ')}
              </MenuItem>
            ))}
          </Select>
        </FormControl>
      </Grid>
      <Grid size={{ xs: 12, md: 2 }}>
        <FormControl fullWidth>
          <InputLabel sx={{ textTransform: 'uppercase' }}>payment</InputLabel>
          <Select
            value={paymentMethod}
            label='payment'
            onChange={(e) => setPaymentMethod(e.target.value)}
          >
            <MenuItem value='' sx={{ textTransform: 'uppercase' }}>
              any
            </MenuItem>
            {dictionary?.paymentMethods?.map((method) => (
              <MenuItem key={method.id} value={method.id}>
                {method.name?.replace('PAYMENT_METHOD_NAME_ENUM_', '').replace('_', ' ')}
              </MenuItem>
            ))}
          </Select>
        </FormControl>
      </Grid>
      <Grid size={{ xs: 12, md: 2 }}>
        <TextField
          label='order id'
          value={orderId}
          onChange={(e) => setOrderId(e.target.value)}
          fullWidth
          slotProps={{
            inputLabel: { style: { textTransform: 'uppercase' } },
          }}
        />
      </Grid>
      <Grid size={{ xs: 12, md: 5 }}>
        <TextField
          label='email'
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          fullWidth
          slotProps={{
            inputLabel: { style: { textTransform: 'uppercase' } },
          }}
        />
      </Grid>
      <Grid size={{ xs: 12, md: 1 }} display='flex' justifyContent='center'>
        <Button
          variant='contained'
          disabled={loading}
          sx={{ height: '56px', width: '100%' }}
          onClick={handleSearch}
        >
          <SearchIcon sx={{ fontSize: '30px' }} />
        </Button>
      </Grid>
    </Grid>
  );
}
