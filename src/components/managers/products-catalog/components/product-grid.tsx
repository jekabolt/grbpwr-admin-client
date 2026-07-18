import { common_Colorway } from 'api/proto-http/admin';
import { ProductItem } from './product-item';

export function ProductGrid({
  products,
  refresh,
  selectionMode = false,
  isSelected,
  onToggleSelect,
}: {
  products: common_Colorway[];
  refresh: (id: number | undefined) => void;
  selectionMode?: boolean;
  isSelected?: (id?: number) => boolean;
  onToggleSelect?: (id: number) => void;
}) {
  return (
    <div className='grid grid-cols-2 lg:grid-cols-4 2xl:grid-cols-6 gap-4'>
      {products.map((p) => (
        <div key={p.id}>
          <ProductItem
            product={p}
            refresh={refresh}
            selectionMode={selectionMode}
            selected={!!isSelected?.(p.id)}
            onToggleSelect={onToggleSelect}
          />
        </div>
      ))}
    </div>
  );
}
