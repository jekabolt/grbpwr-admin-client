import { Grid } from '@mui/material';
import { DataGrid } from '@mui/x-data-grid';
import { common_PromoCode } from 'api/proto-http/admin';
import { FC } from 'react';

export const ListPromo: FC<{ promos: common_PromoCode[] }> = ({ promos }) => {
  const transformPromoForDataGrid = promos.map((promo) => ({
    id: promo.id,
    code: promo.promoCodeInsert?.code,
    freeShipping: promo.promoCodeInsert?.freeShipping ? 'free' : 'paid',
    discount: promo.promoCodeInsert?.discount ? `${promo.promoCodeInsert.discount.value}%` : '',
    expiration: promo.promoCodeInsert?.expiration
      ? new Date(promo.promoCodeInsert.expiration).toLocaleDateString('en-US', {
          year: 'numeric',
          month: 'numeric',
          day: 'numeric',
        })
      : undefined,
    allowed: promo.promoCodeInsert?.allowed,
    voucher: promo.promoCodeInsert?.voucher,
  }));

  const columns = [
    { field: 'id', headerName: 'ID', width: 30 },
    { field: 'code', headerName: 'CODE', width: 200 },
    { field: 'discount', headerName: 'DISCOUNT', width: 150 },
    { field: 'expiration', headerName: 'EXPIRATION', width: 220 },
    { field: 'freeShipping', headerName: 'SHIPPING', width: 150 },
    { field: 'allowed', headerName: 'ALLOWED', width: 150 },
    { field: 'voucher', headerName: 'VOUCHER', width: 150 },
  ];

  return (
    <Grid container justifyContent='center'>
      <Grid item xs={12}>
        <DataGrid
          rows={transformPromoForDataGrid}
          columns={columns}
          pageSizeOptions={[10, 25, 100]}
          initialState={{
            pagination: {
              paginationModel: { pageSize: 10, page: 0 },
            },
          }}
        />
      </Grid>
    </Grid>
  );
};
