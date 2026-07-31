import { zodResolver } from '@hookform/resolvers/zod';
import { adminService } from 'api/api';
import type { CreateCustomOrderRequest } from 'api/proto-http/admin';
import {
  common_Colorway,
  common_CustomOrderItemInsert,
  common_Dictionary,
} from 'api/proto-http/admin';
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
import { CalloutBox } from 'ui/components/callout-box';
import { Section, SectionStack } from 'ui/components/section';
import Text from 'ui/components/text';
import { Toolbar } from 'ui/components/toolbar';
import { Form } from 'ui/form';
import SelectField from 'ui/form/fields/select-field';
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

/**
 * custFlow v2 — one page, products first.
 *
 * The numbered accordion wizard is gone. The order is now a single scroll of explained sections in
 * the order you actually build one: (1) products — the basket sits at the top, (2) contact, (3)
 * shipping & billing, (4) payment. A sticky action bar carries the running total and the create
 * action. The RHF + zod schema and the submit logic (resolve size → variant per line, then
 * CreateCustomOrder) are unchanged.
 */
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
        // Optional B2B EU VAT id (phase 2); omit when blank so the backend keeps the B2C path.
        buyerVatId: data.buyerVatId?.trim() || undefined,
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

  const removeProduct = (id?: number) =>
    productPickerProps?.handleSaveProducts(selectedProducts.filter((p) => p.id !== id));

  const items = form.watch('items');
  // Running items subtotal (qty × custom price) for the action bar — carrier cost is charged
  // separately below. Best-effort parse; a half-typed price simply contributes 0.
  const subtotal = items.reduce((sum, it) => {
    const price = Number(it.customPrice?.value);
    const qty = Number(it.quantity) || 0;
    return sum + (Number.isFinite(price) ? price * qty : 0);
  }, 0);
  const money = (n: number) => `${n.toFixed(2)} ${currency}`.trim();

  const canCreate = canWrite(SECTION.orders);
  const isSubmitting = form.formState.isSubmitting;
  const productCount = selectedProducts.length;

  return (
    <div className='mx-auto w-full max-w-3xl px-2.5 pb-28 lg:px-0'>
      <Form {...form}>
        <form onSubmit={form.handleSubmit(onSubmit)}>
          <SectionStack>
            {/* 1 — products (basket first) */}
            <Section
              title='1 · products'
              question='what is being made — pick colourways, then set size, qty and price per line'
              action={
                productCount > 0 ? (
                  <Text size='micro' variant='label' component='span' className='uppercase'>
                    {productCount} product{productCount !== 1 ? 's' : ''}
                  </Text>
                ) : undefined
              }
            >
              {productCount === 0 ? (
                <CalloutBox tone='note' className='flex flex-col items-start gap-2 border-dashed'>
                  <Text
                    size='micro'
                    variant='label'
                    tracking='label'
                    component='span'
                    className='font-bold uppercase'
                  >
                    no products yet
                  </Text>
                  <Text size='micro' variant='label' component='span'>
                    Add colourways to build the order. Each line gets its own size, quantity and
                    price.
                  </Text>
                  {productPickerProps && (
                    <ProductPicker
                      products={productPickerProps.products}
                      selectedProducts={selectedProducts}
                      handleSaveProducts={productPickerProps.handleSaveProducts}
                      loadMore={productPickerProps.loadMore}
                      hasMore={productPickerProps.hasMore}
                      triggerClassName='mt-1'
                    />
                  )}
                </CalloutBox>
              ) : (
                <>
                  <div className='divide-y divide-hairline'>
                    {items.map((item, idx) => (
                      <SelectedProduct
                        key={item.productId}
                        product={selectedProducts.find((p) => p.id === item.productId)}
                        itemIdx={idx}
                        currency={currency}
                        onRemove={() => removeProduct(item.productId)}
                      />
                    ))}
                  </div>
                  {productPickerProps && (
                    <ProductPicker
                      products={productPickerProps.products}
                      selectedProducts={selectedProducts}
                      handleSaveProducts={productPickerProps.handleSaveProducts}
                      loadMore={productPickerProps.loadMore}
                      hasMore={productPickerProps.hasMore}
                      triggerClassName='self-start'
                    />
                  )}
                </>
              )}
            </Section>

            {/* 2 — contact */}
            <Section title='2 · contact' question='who the order is for'>
              <ContactFieldsGroup />
            </Section>

            {/* 3 — shipping & billing */}
            <Section title='3 · shipping & billing' question='where it ships, and who is invoiced'>
              <ShippingFieldsGroup prefix='shipping' />
              <BillingFieldsGroup />
            </Section>

            {/* 4 — payment */}
            <Section title='4 · payment' question='how this order is settled'>
              <div className='max-w-xs'>
                <SelectField
                  name='paymentMethod'
                  label='payment method'
                  items={[
                    { value: 'PAYMENT_METHOD_NAME_ENUM_BANK_INVOICE', label: 'Bank invoice' },
                    { value: 'PAYMENT_METHOD_NAME_ENUM_CASH', label: 'Cash' },
                  ]}
                />
              </div>
            </Section>

            {/* action bar — sticky chrome, not a floating slab */}
            {canCreate && (
              <Toolbar sticky className='sticky bottom-2 justify-between'>
                <Text size='micro' variant='label' component='span' className='uppercase'>
                  {productCount === 0
                    ? 'add a product to begin'
                    : `${productCount} product${productCount !== 1 ? 's' : ''} · items ${money(subtotal)}`}
                </Text>
                <Button
                  type='submit'
                  variant='main'
                  size='lg'
                  className='uppercase'
                  loading={isSubmitting}
                  disabled={isSubmitting || productCount === 0}
                >
                  create order
                </Button>
              </Toolbar>
            )}
          </SectionStack>
        </form>
      </Form>
    </div>
  );
}
