import { getProductByID } from 'api/admin';
import { common_ProductFull } from 'api/proto-http/admin';
import { FC, useEffect, useState } from 'react';

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

  return <div>{product?.product?.createdAt}</div>;
};
