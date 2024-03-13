import { getProductByID } from 'api/admin';
import { common_ProductFull } from 'api/proto-http/admin';
import { Layout } from 'components/login/layout';
import { FC, useEffect, useState } from 'react';
import styles from 'styles/product-id-media.scss';
import { MediaWrapper } from './product-id-components/product-id-media/mediaWrapper';

interface ProductIDProps {
  params: {
    id: string;
  };
}

export const ProductID: FC<ProductIDProps> = ({ params }) => {
  const [product, setProduct] = useState<common_ProductFull>();

  useEffect(() => {
    const fetchProduct = async () => {
      const response = await getProductByID({
        id: Number(params.id),
      });
      setProduct(response.product);
    };
    fetchProduct();
  }, [params.id]);

  return (
    <Layout>
      <div className={styles.product_id_container}>
        <MediaWrapper product={product} setProduct={setProduct} />
      </div>
    </Layout>
  );
};
