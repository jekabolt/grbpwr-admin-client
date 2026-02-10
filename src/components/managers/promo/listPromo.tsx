import DeleteIcon from '@mui/icons-material/Delete';
import { IconButton } from '@mui/material';
// import { DataGrid } from '@mui/x-data-grid';
import { adminService } from 'api/api';
import { common_PromoCode } from 'api/proto-http/admin';
import { useSnackBarStore } from 'lib/stores/store';
import { FC, useCallback } from 'react';

interface ListPromosInterface {
  promos: common_PromoCode[];
  fetchPromos: (limit: number, offset: number) => void;
}

export const ListPromo: FC<ListPromosInterface> = ({ promos, fetchPromos }) => {
  const { showMessage } = useSnackBarStore();

  const transformPromoForDataGrid = promos.map((promo, index) => ({
    id: index,
    code: promo.promoCodeInsert?.code,
    freeShipping: promo.promoCodeInsert?.freeShipping ? 'free' : 'paid',
    discount: promo.promoCodeInsert?.discount ? `${promo.promoCodeInsert.discount.value}%` : '',
    start: promo.promoCodeInsert?.start
      ? new Date(promo.promoCodeInsert.start).toLocaleDateString('en-US', {
          year: 'numeric',
          month: 'numeric',
          day: 'numeric',
        })
      : undefined,
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

  const deletePromoFromList = useCallback(async (code: string | undefined) => {
    if (!code) return;
    try {
      await adminService.DeletePromoCode({ code });
      showMessage('PROMO REMOVED FROM LIST', 'success');
      fetchPromos(50, 0);
    } catch (e) {
      const msg = e instanceof Error ? e.message : "PROMO CAN'T BE REMOVED FROM LIST";
      showMessage(msg, 'error');
    }
  }, []);

  const columns = [
    { field: 'code', headerName: 'CODE', width: 120 },
    { field: 'start', headerName: 'START', width: 120 },
    { field: 'expiration', headerName: 'EXPIRATION', width: 120 },
    { field: 'discount', headerName: 'DISCOUNT', flex: 1 },
    { field: 'freeShipping', headerName: 'SHIPPING', flex: 1 },
    { field: 'allowed', headerName: 'ALLOWED', flex: 1 },
    { field: 'voucher', headerName: 'VOUCHER', flex: 1 },
    {
      field: 'delete',
      headerName: 'DELETE',
      flex: 0.5,
      renderCell: (params: any) => (
        <IconButton onClick={() => deletePromoFromList(params.row.code)}>
          <DeleteIcon fontSize='medium' />
        </IconButton>
      ),
    },
  ];

  return (
    <div>promo</div>
    // <DataGrid
    //   rowSelection={false}
    //   rows={transformPromoForDataGrid}
    //   columns={columns}
    //   getRowId={(row) => row.id}
    //   pageSizeOptions={[10, 25, 100]}
    //   initialState={{
    //     pagination: {
    //       paginationModel: { pageSize: 10, page: 0 },
    //     },
    //   }}
    // />
  );
};
