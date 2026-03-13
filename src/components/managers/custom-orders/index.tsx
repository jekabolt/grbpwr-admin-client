import Text from 'ui/components/text';
import { CustomOrderForm } from './components/custom-order-form';
import { ProductPicker } from './components/prodcut-picker';
import { useCustomOrder } from './components/useCustomOrder';

export function CustomOrders() {
  const { products, selectedProducts, handleSelectProduct, loadMore, hasMore, clearSelection } =
    useCustomOrder();

  return (
    <div className='flex flex-col gap-6'>
      <div className='flex items-center justify-between'>
        <ProductPicker
          products={products}
          selectedProducts={selectedProducts}
          handleSelectProduct={handleSelectProduct}
          loadMore={loadMore}
          hasMore={hasMore}
        />
      </div>

      {selectedProducts.length > 0 ? (
        <>
          <div className='flex items-center gap-4'>
            {/* <Button variant='secondary' size='lg' onClick={clearSelection}>
              change products
            </Button> */}
          </div>
          <CustomOrderForm selectedProducts={selectedProducts} onSuccess={clearSelection} />
        </>
      ) : (
        <Text variant='uppercase' className='text-textInactiveColor'>
          select products to create a custom order
        </Text>
      )}
    </div>
  );
}
