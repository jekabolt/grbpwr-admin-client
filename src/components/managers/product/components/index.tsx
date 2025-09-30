import { zodResolver } from '@hookform/resolvers/zod';
import { upsertProduct } from 'api/admin';
import { common_ProductFull, common_SizeWithMeasurementInsert } from 'api/proto-http/admin';
import { ROUTES } from 'constants/routes';
import { useDictionaryStore } from 'lib/stores/store';
import { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { useNavigate } from 'react-router-dom';
import { Button } from 'ui/components/button';
import { Form } from 'ui/form';
import { defaultData, ProductFormData, productSchema } from '../utility/schema';
import { BodyFields } from './body-fields';
import { MediaAds } from './media-ads';
import { SizesAndMeasurements } from './sizesAndMeasurements';
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
  const { dictionary } = useDictionaryStore();
  const [isFormChanged, setIsFormChanged] = useState(false);
  const [mediaClearKey, setMediaClearKey] = useState(0);
  const navigate = useNavigate();

  const form = useForm<ProductFormData>({
    resolver: zodResolver(productSchema),
    defaultValues: defaultData,
  });

  // Populate form when product data is available
  useEffect(() => {
    if (product && (!isAddingProduct || isCopyMode)) {
      const formData = mapProductFullToFormData(product);
      form.reset(formData);
    }
  }, [product, isAddingProduct, isCopyMode, form]);

  // Track dirtiness similar to previous deep-compare logic
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
      await upsertProduct(payload);
      // After successful save
      setIsFormChanged(false);
      form.reset(data, { keepValues: true });

      if (isAddingProduct && !isCopyMode) {
        // Signal media components to clear their local selections
        setMediaClearKey((k) => k + 1);
      } else if (isCopyMode) {
        navigate(ROUTES.product, { replace: true });
      }
    } catch (e) {
      console.log('error', e);
    }
  }

  const handleFormError = (errors: any) => {
    console.log('Form validation errors:', errors);
  };

  const handleCopyProductClick = (id: number | undefined) => {
    navigate(`${ROUTES.copyProduct}/${id}`);
  };

  return (
    <Form {...form}>
      <form className='relative' onSubmit={form.handleSubmit(handleSubmit, handleFormError)}>
        <div className='w-full flex justify-between'>
          {!isAddingProduct && (
            <Button onClick={() => handleCopyProductClick(product?.product?.id)} size='lg'>
              copy
            </Button>
          )}

          <Button
            size='lg'
            disabled={isEditMode && !isFormChanged}
            className='fixed bottom-3 right-3'
            onClick={(e: React.MouseEvent<HTMLButtonElement>) => {
              e.preventDefault();
              if (isEditMode || isAddingProduct || isCopyMode) {
                form.handleSubmit(handleSubmit, handleFormError)();
              } else if (onEditModeChange) {
                onEditModeChange(true);
              }
            }}
          >
            {isAddingProduct || isEditMode ? 'save' : 'edit'}
          </Button>
        </div>

        <div>
          <div className='flex flex-col lg:flex-row lg:justify-between gap-5'>
            <div className='w-full lg:w-1/2 space-y-3'>
              <Thumbnail product={product} control={form.control} />
              <MediaAds product={product} control={form.control} clearKey={mediaClearKey} />
            </div>
            <div className='w-full lg:w-1/2 space-y-3'>
              <BodyFields />
              <Tags
                isAddingProduct={isAddingProduct}
                isEditMode={isEditMode}
                isCopyMode={isCopyMode}
              />
            </div>
          </div>
          <SizesAndMeasurements isAddingProduct={isAddingProduct} isEditMode={isEditMode} />
        </div>
      </form>
    </Form>
  );
}
