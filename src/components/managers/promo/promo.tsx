import { FC, useEffect } from 'react';
import { Layout } from 'ui/layout';
import { CreatePromo } from './createPromo';
import { ListPromo } from './listPromo';
import usePromo from './usePromo';

export const Promo: FC = () => {
  const { promos, fetchPromos, createNewPromo } = usePromo();

  useEffect(() => {
    fetchPromos(50, 0);
  }, [fetchPromos]);

  return (
    <Layout>
      <div className='flex flex-col gap-10'>
        <CreatePromo createNewPromo={createNewPromo} />
        <ListPromo promos={promos} fetchPromos={fetchPromos} />
      </div>
    </Layout>
  );
};
