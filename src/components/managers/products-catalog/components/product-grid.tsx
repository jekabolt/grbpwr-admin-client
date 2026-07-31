import { common_Colorway } from 'api/proto-http/admin';
import { Tiles } from 'ui/components/tiles';
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
    // The same auto-filling grid the tech-cards list uses, rather than hand-set column counts at
    // three breakpoints: the tiles reflow on their own width, so the catalogue keeps one card size
    // from a phone to an ultrawide instead of three.
    <Tiles min={160}>
      {products.map((p) => (
        <ProductItem
          key={p.id}
          product={p}
          refresh={refresh}
          selectionMode={selectionMode}
          selected={!!isSelected?.(p.id)}
          onToggleSelect={onToggleSelect}
        />
      ))}
    </Tiles>
  );
}
