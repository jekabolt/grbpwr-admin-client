import { zodResolver } from '@hookform/resolvers/zod';
import { adminService } from 'api/api';
import { common_ProductFull, common_SizeWithMeasurementInsert } from 'api/proto-http/admin';
import { ROUTES } from 'constants/routes';
import { useSnackBarStore } from 'lib/stores/store';
import { useEffect, useState } from 'react';
import { FieldErrors, useForm } from 'react-hook-form';
import { useNavigate } from 'react-router-dom';
import { Button } from 'ui/components/button';
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
};

export function ProductForm({
  isEditMode = false,
  isAddingProduct = false,
  isCopyMode,
  product,
  productId,
  onEditModeChange,
}: Props) {
  const { showMessage } = useSnackBarStore();
  const [isFormChanged, setIsFormChanged] = useState(false);
  const [mediaClearKey, setMediaClearKey] = useState(0);
  const editMode = isEditMode || isAddingProduct;
  const navigate = useNavigate();

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

  return (
    <Form {...form}>
      <form
        className='relative lg:py-16 lg:px-10'
        onSubmit={form.handleSubmit(handleSubmit, handleFormError)}
      >
        <div className='w-full flex justify-between'>
          <Button
            size='lg'
            disabled={isEditMode && !isFormChanged}
            className='fixed bottom-3 right-3 z-50 cursor-pointer'
            onClick={(e: React.MouseEvent<HTMLButtonElement>) => {
              e.preventDefault();
              if (editMode || isCopyMode) {
                form.handleSubmit(handleSubmit, handleFormError)();
              } else if (onEditModeChange) {
                onEditModeChange(true);
              }
            }}
          >
            {editMode ? 'save' : 'edit'}
          </Button>
        </div>

        <div className='space-y-5'>
          <div className='flex flex-col lg:flex-row lg:justify-between lg:items-start gap-5'>
            <div className='w-full lg:w-1/2 space-y-8'>
              <div className='flex flex-col lg:flex-row gap-5'>
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
            </div>
            <div className='w-full lg:w-1/2 space-y-3'>
              <BodyFields editMode={editMode} />
              <Tags
                isAddingProduct={isAddingProduct}
                isEditMode={isEditMode}
                isCopyMode={isCopyMode}
              />
            </div>
          </div>
          <SizeMeasurements isAddingProduct={isAddingProduct} isEditMode={isEditMode} />
        </div>
      </form>
    </Form>
  );
}
