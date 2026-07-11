import { zodResolver } from '@hookform/resolvers/zod';
import { adminService } from 'api/api';
import { common_ProductFull, common_SizeWithMeasurementInsert } from 'api/proto-http/admin';
import { usePermissions } from 'components/managers/accounts/utils/permissions';
import { FittingsReadonlyList } from 'components/managers/fittings/components/fittings-readonly-list';
import { ROUTES, SECTION } from 'constants/routes';
import { useSnackBarStore } from 'lib/stores/store';
import { useEffect, useState } from 'react';
import { FieldErrors, useForm } from 'react-hook-form';
import { Link, useNavigate } from 'react-router-dom';
import { Button } from 'ui/components/button';
import Text from 'ui/components/text';
import { Form } from 'ui/form';
import { defaultData, ProductFormData, productSchema } from '../utility/schema';
import { BodyFields } from './body-fields';
import { MediaAds } from './media-ads';
import { SizeMeasurements } from './size-measurements';
import { Tags } from './tags';
import { Thumbnail } from './thumbnail';
import { createProductPayload, mapProductDataToForm, mapProductFullToFormData } from './utils';

type Props = {
  isEditMode: boolean;
  isAddingProduct: boolean;
  isCopyMode: boolean;
  product: common_ProductFull | undefined;
  productId?: string;
  onEditModeChange: (isEditMode: boolean) => void;
  onStockUpdated?: () => void;
};

export function ProductForm({
  isEditMode = false,
  isAddingProduct = false,
  isCopyMode,
  product,
  productId,
  onEditModeChange,
  onStockUpdated,
}: Props) {
  const { showMessage } = useSnackBarStore();
  const [isFormChanged, setIsFormChanged] = useState(false);
  const [mediaClearKey, setMediaClearKey] = useState(0);
  const editMode = isEditMode || isAddingProduct;
  const navigate = useNavigate();
  const { canWrite } = usePermissions();

  const initialValues =
    product && (!isAddingProduct || isCopyMode) ? mapProductFullToFormData(product) : defaultData;

  const form = useForm<ProductFormData>({
    resolver: zodResolver(productSchema),
    defaultValues: initialValues,
    mode: 'onTouched',
  });

  useEffect(() => {
    setIsFormChanged(form.formState.isDirty);
  }, [form.formState.isDirty]);

  useEffect(() => {
    if (product && !isAddingProduct && !isCopyMode) {
      const values = mapProductFullToFormData(product);
      form.reset({ ...form.getValues(), sizeMeasurements: values.sizeMeasurements });
    }
  }, [product]);

  const filterEmptySizes = (sizes: ProductFormData['sizeMeasurements']) =>
    sizes
      ?.filter((size) => {
        const hasValidQuantity =
          size.productSize?.quantity?.value && size.productSize.quantity.value !== '0';
        const hasValidMeasurements = size.measurements?.some(
          (m) => m.measurementValue?.value && m.measurementValue.value !== '0',
        );
        return hasValidQuantity || hasValidMeasurements;
      })
      .map((size) => ({
        ...size,
        measurements: size.measurements || [],
      })) as common_SizeWithMeasurementInsert[];

  async function handleSubmit(data: ProductFormData) {
    const processedData = mapProductDataToForm(data);
    const filteredData = {
      ...processedData,
      sizeMeasurements: filterEmptySizes(data.sizeMeasurements),
    };

    const payload = createProductPayload(filteredData, productId, isCopyMode);

    try {
      await adminService.UpsertProduct(payload);
      setIsFormChanged(false);
      form.reset(data, { keepValues: true });
      showMessage(isAddingProduct ? 'Product created' : 'Product updated', 'success');

      if (isAddingProduct && !isCopyMode) {
        setMediaClearKey((k) => k + 1);
      } else if (isCopyMode) {
        navigate(ROUTES.product, { replace: true });
      } else {
        // Existing product saved — drop back to read-only view.
        onEditModeChange(false);
      }
    } catch (e) {
      const message = e instanceof Error ? e.message : 'Failed to save product';
      showMessage(message, 'error');
      console.error('UpsertProduct error', e);
    }
  }

  const getFirstErrorMessage = (errs: Record<string, unknown>): string | undefined => {
    for (const value of Object.values(errs)) {
      if (
        value &&
        typeof value === 'object' &&
        'message' in value &&
        typeof (value as { message: unknown }).message === 'string'
      ) {
        return (value as { message: string }).message;
      }
      if (value && typeof value === 'object' && !Array.isArray(value)) {
        const nested = getFirstErrorMessage(value as Record<string, unknown>);
        if (nested) return nested;
      }
    }
    return undefined;
  };

  const handleFormError = (errors: FieldErrors<ProductFormData>) => {
    const message =
      getFirstErrorMessage(errors as Record<string, unknown>) ?? 'Please fix the form errors';
    showMessage(message, 'error');
  };

  const productDisplayBody = product?.product?.productDisplay?.productBody;
  const productHidden = productDisplayBody?.productBodyInsert?.hidden;
  const headerTitle = isAddingProduct
    ? isCopyMode
      ? 'copy product'
      : 'new product'
    : `[${product?.product?.id ?? productId ?? ''}] ${
        productDisplayBody?.productBodyInsert?.brand ?? ''
      } ${productDisplayBody?.translations?.[0]?.name ?? ''}`.trim();

  const handleCancel = () => {
    if (isAddingProduct) {
      navigate(ROUTES.product);
      return;
    }
    form.reset(initialValues);
    setIsFormChanged(false);
    onEditModeChange(false);
  };

  const submitForm = () => form.handleSubmit(handleSubmit, handleFormError)();

  return (
    <Form {...form}>
      <form
        className='flex flex-col gap-6 px-2 pt-2 pb-24 lg:px-6'
        onSubmit={form.handleSubmit(handleSubmit, handleFormError)}
      >
        {/* Header — identity + status */}
        <div className='flex flex-wrap items-center justify-between gap-3 border-b border-textInactiveColor pb-3'>
          <div className='flex flex-wrap items-center gap-3'>
            <Button asChild variant='secondary' size='lg'>
              <Link to={ROUTES.product}>← products</Link>
            </Button>
            <Text variant='uppercase' size='large'>
              {headerTitle || 'product'}
            </Text>
            {productHidden && (
              <span className='bg-textColor px-1.5 py-0.5'>
                <Text className='!text-bgColor' size='small' variant='uppercase'>
                  hidden
                </Text>
              </span>
            )}
            {!editMode && (
              <Text variant='inactive' size='small'>
                view only
              </Text>
            )}
          </div>
        </div>

        <div className='flex flex-col lg:flex-row lg:items-start gap-6'>
          <Section title='media' className='w-full lg:w-1/2'>
            <div className='flex flex-row gap-5'>
              <Thumbnail
                product={product}
                control={form.control}
                variant='primary'
                editMode={editMode}
              />
              <Thumbnail
                product={product}
                control={form.control}
                variant='secondary'
                editMode={editMode}
              />
            </div>
            <MediaAds
              product={product}
              control={form.control}
              clearKey={mediaClearKey}
              editMode={editMode}
            />
          </Section>

          <Section title='details' className='w-full lg:w-1/2'>
            <BodyFields editMode={editMode} />
            <Tags
              isAddingProduct={isAddingProduct}
              isEditMode={isEditMode}
              isCopyMode={isCopyMode}
              editMode={editMode}
            />
          </Section>
        </div>

        <Section title='sizes & stock'>
          <SizeMeasurements
            editMode={editMode}
            productId={productId ? Number(productId) : undefined}
            onStockUpdated={onStockUpdated}
          />
        </Section>

        {productId && !isCopyMode && (
          <Section title='fittings'>
            <FittingsReadonlyList productId={Number(productId)} />
          </Section>
        )}
      </form>

      {/* Sticky action bar */}
      <div className='fixed inset-x-0 bottom-0 z-40 flex items-center justify-between gap-3 border-t border-textInactiveColor bg-bgColor px-3 py-2 print:hidden'>
        <Text variant='inactive' size='small'>
          {editMode && isFormChanged ? 'unsaved changes' : ' '}
        </Text>
        {canWrite(SECTION.products) && (
          <div className='flex items-center gap-2'>
            {!editMode ? (
              <Button
                type='button'
                variant='main'
                size='lg'
                className='uppercase cursor-pointer'
                onClick={() => onEditModeChange(true)}
              >
                edit
              </Button>
            ) : (
              <>
                <Button
                  type='button'
                  variant='secondary'
                  size='lg'
                  className='uppercase cursor-pointer'
                  onClick={handleCancel}
                >
                  cancel
                </Button>
                <Button
                  type='button'
                  variant='main'
                  size='lg'
                  className='uppercase cursor-pointer'
                  disabled={(isEditMode && !isFormChanged) || form.formState.isSubmitting}
                  loading={form.formState.isSubmitting}
                  onClick={submitForm}
                >
                  {isAddingProduct ? (isCopyMode ? 'create copy' : 'create') : 'save'}
                </Button>
              </>
            )}
          </div>
        )}
      </div>
    </Form>
  );
}

function Section({
  title,
  className,
  children,
}: {
  title: string;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <section className={`space-y-4 border border-textInactiveColor p-4 ${className ?? ''}`}>
      <Text variant='uppercase' size='large'>
        {title}
      </Text>
      {children}
    </section>
  );
}
