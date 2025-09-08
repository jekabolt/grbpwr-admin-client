import {
  common_ProductFull,
  common_ProductNew,
  common_SizeWithMeasurementInsert,
} from 'api/proto-http/admin';
// import { initialProductState } from 'constants/product/initial-values';
import { ROUTES } from 'constants/routes';
import { Field, Form, Formik, FormikHelpers } from 'formik';
import { useDictionaryStore } from 'lib/stores/store';
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from 'ui/components/button';
import { validationSchema } from '../utility/formilValidationShema';
import { defaultData } from '../utility/schema';
import { BasicFields } from './basicFields/basicFields';
import { MediaView } from './mediaView';
import { SizesAndMeasurements } from './sizesAndMeasurements';
import { Tags } from './tags';

export function ProductForm({ product }: { product: common_ProductFull | undefined }) {
  const { dictionary } = useDictionaryStore();
  const [isFormChanged, setIsFormChanged] = useState(false);
  const [clearMediaPreview, setClearMediaPreview] = useState(false);
  const navigate = useNavigate();

  const filterEmptySizes = (sizes: common_SizeWithMeasurementInsert[] | undefined) =>
    sizes?.filter((size) => {
      const hasValidQuantity =
        size.productSize?.quantity?.value && size.productSize.quantity.value !== '0';
      const hasValidMeasurements = size.measurements?.some(
        (m) => m.measurementValue?.value && m.measurementValue.value !== '0',
      );
      return hasValidQuantity || hasValidMeasurements;
    });

  const handleFormSubmit = async (
    values: common_ProductNew,
    actions: FormikHelpers<common_ProductNew>,
  ) => {
    if (!isFormChanged) return;

    // await onSubmit(
    //   { ...values, sizeMeasurements: filterEmptySizes(values.sizeMeasurements) },
    //   actions,
    // );

    setIsFormChanged(false);
    // if (isAddingProduct && !isCopyMode) {
    //   setClearMediaPreview(true);
    //   setTimeout(() => setClearMediaPreview(false), 0);
    // } else if (isCopyMode) {
    //   navigate(ROUTES.product, { replace: true });
    // }
  };

  // const checkChanges = useCallback(
  //   (values: common_ProductNew) =>
  //     setIsFormChanged(!comparisonOfInitialProductValues(values, initialValues)),
  //   [initialValues],
  // );

  const handleCopyProductClick = (id: number | undefined) => {
    navigate(`${ROUTES.copyProduct}/${id}`);
  };

  return (
    <Formik
      initialValues={defaultData as unknown as common_ProductNew}
      onSubmit={handleFormSubmit}
      enableReinitialize
      validationSchema={validationSchema}
    >
      {({ handleSubmit, values }) => {
        // useEffect(() => checkChanges(values), [checkChanges, values]);
        return (
          <Form className='h-full flex flex-col gap-10'>
            <div className='w-full flex justify-between'>
              {/* {!isAddingProduct && (
                <Button onClick={() => handleCopyProductClick(product?.product?.id)} size='lg'>
                  copy
                </Button>
              )} */}
              <Button
                size='lg'
                // disabled={isEditMode && !isFormChanged}
                className='fixed bottom-2 right-2 z-20'
                // onClick={(e: React.MouseEvent) => {
                //   e.preventDefault();
                //   if (isEditMode || isAddingProduct || isCopyMode) {
                //     handleSubmit();
                //   } else if (onEditModeChange) {
                //     onEditModeChange(true);
                //   }
                // }}
                onClick={handleSubmit}
              >
                {/* {isAddingProduct || isEditMode ? 'save' : 'edit'} */}
                save
              </Button>
            </div>

            <div className='flex flex-col lg:flex-row gap-10'>
              <div className='w-full lg:w-1/2'>
                <Field
                  component={MediaView}
                  name='mediaIds'
                  {...{
                    // isEditMode,
                    // isCopyMode,
                    // isAddingProduct,
                    product,
                    clearMediaPreview,
                  }}
                />
              </div>
              <div className='w-full space-y-4 lg:w-1/2'>
                <Field
                  component={BasicFields}
                  name='product.productBodyInsert'
                  {...{
                    product,
                    // isEditMode, isAddingProduct, isCopyMode }}
                  }}
                />
                <Field
                  component={Tags}
                  name='tags'
                  {
                    ...{
                      // isEditMode,
                      // isAddingProduct,
                      // isCopyMode,
                    }
                  }
                />
              </div>
            </div>
            <div className='w-full'>
              <Field
                component={SizesAndMeasurements}
                name='sizeMeasurements'
                {...{
                  dictionary,
                  // isEditMode, isAddingProduct }}
                }}
              />
            </div>
          </Form>
        );
      }}
    </Formik>
  );
}
