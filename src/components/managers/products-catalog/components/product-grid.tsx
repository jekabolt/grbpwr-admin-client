import { common_Product } from 'api/proto-http/admin';
import { ProductItem } from './product-item';
export function ProductGrid({
  products,
  refresh,
}: {
  products: common_Product[];
  refresh: (id: number | undefined) => void;
}) {
  return (
    <div className='grid grid-cols-2 lg:grid-cols-4 2xl:grid-cols-6 gap-4'>
      {products.map((p) => (
        <div key={p.id}>
          <ProductItem product={p} refresh={refresh} />
        </div>
      ))}
    </div>
  );
}
