import { zodResolver } from '@hookform/resolvers/zod';
import { adminService } from 'api/api';
import type { CreateCustomOrderRequest } from 'api/proto-http/admin';
import { common_CustomOrderItemInsert, common_Dictionary, common_Colorway } from 'api/proto-http/admin';
import { usePermissions } from 'components/managers/accounts/utils/permissions';
import { getFilteredSizes } from 'components/managers/product/utility/sizes';
import { ROUTES, SECTION } from 'constants/routes';
import { useDictionary } from 'lib/providers/dictionary-provider';
import { useSnackBarStore } from 'lib/stores/store';
import { useEffect, useMemo } from 'react';
import type { Resolver } from 'react-hook-form';
import { SubmitHandler, useForm } from 'react-hook-form';
import { useNavigate } from 'react-router-dom';
import { Button } from 'ui/components/button';
import Text from 'ui/components/text';
import { Form } from 'ui/form';
import { BillingFieldsGroup } from './billing-fields-group';
import { ContactFieldsGroup } from './contact-fields-group';
import { ProductPicker } from './prodcut-picker';
import { CustomOrderFormData, customOrderSchema, defaultCustomOrder } from './schema';
import { SelectedProduct } from './selected-product';
import { ShippingFieldsGroup } from './shipping-fields-group';

interface CustomOrderFormProps {
  selectedProducts: common_Colorway[];
  onSuccess?: () => void;
  productPickerProps?: {
    products: common_Colorway[];
    hasMore: boolean;
    handleSaveProducts: (products: common_Colorway[]) => void;
    loadMore: () => void;
  };
}

function buildItemsFromProducts(
  products: common_Colorway[],
  dictionary: common_Dictionary | undefined,
): CustomOrderFormData['items'] {
  return products.map((p) => {
    const baseCurrency = dictionary?.baseCurrency ?? 'USD';
    const productPrice = p.prices?.find((p) => p.currency === baseCurrency)?.price?.value ?? '0';
    const merch = p.display?.merchandising;
    const topCategoryId = Number(merch?.topCategoryId) || 0;
    const typeId = Number(merch?.typeId) || 0;
    const filteredSizes = getFilteredSizes(dictionary, topCategoryId, typeId, {
      gender: merch?.targetGender,
    });
    const firstSizeId = filteredSizes[0]?.id ?? 1;
    return {
      productId: p.id!,
      quantity: 1,
      sizeId: firstSizeId,
      customPrice: { value: productPrice },
    };
  });
}

export function CustomOrderForm({
  selectedProducts,
  productPickerProps,
  onSuccess,
}: CustomOrderFormProps) {
  const { dictionary } = useDictionary();
  const { showMessage } = useSnackBarStore();
  const { canWrite } = usePermissions();
  const currency = dictionary?.baseCurrency || '';
  const navigate = useNavigate();

  const defaultValues = useMemo<CustomOrderFormData>(() => {
    const items = buildItemsFromProducts(selectedProducts, dictionary);
    return {
      ...defaultCustomOrder,
      items,
      shipmentCarrierId:
        dictionary?.shipmentCarriers?.find((c) => c.shipmentCarrier?.allowed === true)?.id ?? 0,
    };
  }, [selectedProducts, dictionary]);

  const resolver: Resolver<CustomOrderFormData> = async (values, context, options) => {
    const preprocessed: CustomOrderFormData =
      values.billingSameAsShipping && values.shippingAddress
        ? { ...values, billingAddress: { ...values.shippingAddress } }
        : values;
    return zodResolver(customOrderSchema)(preprocessed, context, options);
  };

  const form = useForm<CustomOrderFormData>({
    resolver,
    defaultValues,
  });

  useEffect(() => {
    form.reset(defaultValues, { keepDirtyValues: true });
  }, [defaultValues]);

  const onSubmit: SubmitHandler<CustomOrderFormData> = async (data) => {
    const billingAddress = data.billingSameAsShipping
      ? { ...data.shippingAddress }
      : data.billingAddress;
    try {
      // R2/p021: a custom-order line references a variant now. The picker yields colourways (no
      // variants), and the form tracks the chosen size per line, so resolve size_id -> variant_id per
      // colourway before building the request.
      const items: common_CustomOrderItemInsert[] = [];
      for (const item of data.items) {
        const full = await adminService.GetColorwayByID({ colorwayId: item.productId });
        const variant = full.colorway?.variants?.find((v) => v.sizeId === item.sizeId);
        if (!variant?.variantId) {
          showMessage('Selected size is not an available variant of the product', 'error');
          return;
        }
        items.push({
          quantity: item.quantity,
          customPrice: item.customPrice,
          variantId: variant.variantId,
        });
      }
      const payload: CreateCustomOrderRequest = {
        ...data,
        items,
        billingAddress,
        currency,
      } as CreateCustomOrderRequest;
      const response = await adminService.CreateCustomOrder(payload);
      showMessage('Custom order created successfully', 'success');
      onSuccess?.();
      if (response.order?.uuid) {
        navigate(`${ROUTES.orders}/${response.order.uuid}`);
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Failed to create order';
      showMessage(msg, 'error');
    }
  };

  return (
    <div className='px-2.5 pb-20 lg:relative lg:min-h-screen lg:px-32 lg:pb-24'>
      <Form {...form}>
        <form onSubmit={form.handleSubmit(onSubmit)} className='relative'>
          <div className='flex flex-col gap-14 lg:grid lg:grid-cols-2 lg:gap-28 relative'>
            <div className='space-y-10 lg:space-y-16'>
              <ContactFieldsGroup />
              <ShippingFieldsGroup prefix='shipping' />
              <BillingFieldsGroup />
            </div>
            <div className='space-y-10'>
              {selectedProducts.length === 0 && productPickerProps && (
                <Text variant='uppercase' className='text-textInactiveColor'>
                  select products
                </Text>
              )}
              {selectedProducts.length > 0 && (
                <>
                  <div className='max-h-[50vh] overflow-y-auto'>
                    {form.watch('items').map((item, idx) => {
                      return (
                        <SelectedProduct
                          key={item.productId}
                          product={selectedProducts.find((p) => p.id === item.productId)}
                          itemIdx={idx}
                        />
                      );
                    })}
                  </div>
                  <div className='flex items-center justify-between'>
                    <Text variant='uppercase' className='w-full'>
                      {selectedProducts.length} product{selectedProducts.length !== 1 ? 's' : ''}{' '}
                      selected
                    </Text>
                  </div>
                </>
              )}
              {productPickerProps && (
                <ProductPicker
                  products={productPickerProps.products}
                  selectedProducts={selectedProducts}
                  handleSaveProducts={productPickerProps.handleSaveProducts}
                  loadMore={productPickerProps.loadMore}
                  hasMore={productPickerProps.hasMore}
                  triggerClassName='w-full uppercase'
                />
              )}
              {selectedProducts.length > 0 && canWrite(SECTION.orders) && (
                <Button
                  type='submit'
                  variant='main'
                  className='w-full uppercase fixed bottom-2.5 inset-x-2.5'
                  size='lg'
                >
                  create order
                </Button>
              )}
            </div>
          </div>
        </form>
      </Form>
    </div>
  );
}
