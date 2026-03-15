import { CustomOrderForm } from './components/custom-order-form';
import { useCustomOrder } from './components/useCustomOrder';

export function CustomOrders() {
  const { products, selectedProducts, hasMore, handleSaveProducts, loadMore, clearSelection } =
    useCustomOrder();

  return (
    <div className='flex flex-col gap-6'>
      <CustomOrderForm
        selectedProducts={selectedProducts}
        onSuccess={clearSelection}
        productPickerProps={{
          products,
          hasMore,
          handleSaveProducts,
          loadMore,
        }}
      />
    </div>
  );
}
