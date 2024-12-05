import { Button, Grid2 as Grid } from '@mui/material';
import { DataGrid } from '@mui/x-data-grid';
import { useNavigate } from '@tanstack/react-location';
import { getDictionary } from 'api/admin';
import { common_Dictionary } from 'api/proto-http/admin';
import { Layout } from 'components/login/layout';
import { ROUTES } from 'constants/routes';
import { FC, useEffect, useState } from 'react';
import { SearchFilters } from './interfaces/interface';
import { Filter } from './orders-components/filter';
import { orderData } from './orders-components/orders-data';
import { useOrders } from './utility/use-orders';

const searchFilters: SearchFilters = {
  status: undefined,
  paymentMethod: undefined,
  orderId: undefined,
  email: undefined,
};

export const Orders: FC = () => {
  const { rows, loading, newSearch, loadMore, loadMoreVisible } = useOrders();
  const [dictionary, setDictionary] = useState<common_Dictionary>();
  const navigate = useNavigate();

  useEffect(() => {
    const initializeData = async () => {
      const response = await getDictionary({});
      setDictionary(response.dictionary);
    };

    initializeData();
    newSearch(searchFilters);
  }, [searchFilters]);

  const handleRowClick = (params: any) => {
    navigate({ to: `${ROUTES.orders}/${params.row.uuid}` });
  };

  return (
    <Layout>
      <Grid container spacing={2} marginTop='2%'>
        <Grid size={{ xs: 12 }} justifyContent='center'>
          <Filter dictionary={dictionary} loading={loading} onSearch={newSearch} />
        </Grid>
        <Grid size={{ xs: 12 }}>
          <DataGrid
            rows={rows}
            columns={orderData(dictionary)}
            autoHeight
            loading={loading}
            rowSelection={false}
            pageSizeOptions={[]}
            onRowClick={handleRowClick}
            hideFooterPagination
            hideFooter
          />
          {loadMoreVisible && (
            <Button
              variant='contained'
              onClick={loadMore}
              disabled={loading}
              style={{ marginTop: '20px' }}
            >
              Load More
            </Button>
          )}
        </Grid>
      </Grid>
    </Layout>
  );
};
