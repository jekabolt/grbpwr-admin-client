import { getProductByID } from 'api/admin';
import { common_ProductNew } from 'api/proto-http/admin';
import { useParams } from 'react-router-dom';
import { Layout } from 'ui/layout';
import { ProductForm } from './components/product-form';

const validatePrice = (values: common_ProductNew): boolean => {
  const price = parseFloat(values.product?.productBodyInsert?.price?.value || '');
  return price > 0;
};

export async function Product() {
  const { id } = useParams();
  const { product } = await getProductByID({ id: Number(id) });

  return (
    <Layout>
      <ProductForm product={product} />
    </Layout>
  );
}
