import { DataGrid } from '@mui/x-data-grid';
import { common_Order } from 'api/proto-http/admin';
import { orderData } from 'components/managers/orders-catalog/components/orders-data';
import { ROUTES } from 'constants/routes';
import { useDictionaryStore } from 'lib/stores/store';
import { useNavigate } from 'react-router-dom';

export function OrderList({ rows }: { rows: common_Order[] }) {
  const { dictionary } = useDictionaryStore();
  const navigate = useNavigate();

  const handleRowClick = (params: any) => {
    navigate(`${ROUTES.orders}/${params.row.uuid}`);
  };

  console.log('rows', rows);

  return (
    <div className='w-full border-2 border-text'>
      <DataGrid
        rows={rows}
        columns={orderData(dictionary)}
        rowSelection={false}
        pageSizeOptions={[]}
        onRowClick={handleRowClick}
        hideFooterPagination
        hideFooter
      />
    </div>
  );
}
