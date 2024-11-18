import { AppBar, Button, CircularProgress, Grid2 as Grid, Toolbar } from '@mui/material';
import { useNavigate } from '@tanstack/react-location';
import { common_ProductNew, common_SizeWithMeasurementInsert } from 'api/proto-http/admin';
import { ROUTES } from 'constants/routes';
import { Field, Form, Formik, FormikHelpers } from 'formik';
import { FC, useCallback, useEffect, useMemo, useState } from 'react';
import { BasicFields } from './basicFields/basicFields';
import { GenericProductFormInterface } from './interface/interface';
import { MediaView } from './mediaView/mediaView';
import { SizesAndMeasurements } from './sizesAndMeasurements/sizesAndMeasurements';
import { Tags } from './tags/tags';
import { comparisonOfInitialProductValues } from './utility/deepComparisonOfInitialProductValues';
import { validationSchema } from './utility/formilValidationShema';

export const GenericProductForm: FC<GenericProductFormInterface> = ({
  initialProductState,
  isEditMode = false,
  isAddingProduct = false,
  isCopyMode,
  dictionary,
  product,
  onSubmit,
  onEditModeChange,
}) => {
  const [isFormChanged, setIsFormChanged] = useState(false);
  const [clearMediaPreview, setClearMediaPreview] = useState(false);
  const initialValues = useMemo(() => initialProductState, [initialProductState]);

  const navigate = useNavigate();

  useEffect(() => {
    const handleKeydown = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && isEditMode && onEditModeChange) onEditModeChange(false);
    };
    document.addEventListener('keydown', handleKeydown);
    return () => document.removeEventListener('keydown', handleKeydown);
  }, [isEditMode, onEditModeChange]);

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
    await onSubmit(
      { ...values, sizeMeasurements: filterEmptySizes(values.sizeMeasurements) },
      actions,
    );

    setIsFormChanged(false);
    if (isAddingProduct && !isCopyMode) {
      setClearMediaPreview(true);
      setTimeout(() => setClearMediaPreview(false), 0);
    } else if (isCopyMode) {
      navigate({ to: ROUTES.product, replace: true });
    }
  };

  const checkChanges = useCallback(
    (values: common_ProductNew) =>
      setIsFormChanged(!comparisonOfInitialProductValues(values, initialValues)),
    [initialValues],
  );

  const handleCopyProductClick = (id: number | undefined) => {
    navigate({ to: `${ROUTES.copyProduct}/${id}` });
  };

  return (
    <Formik
      initialValues={initialValues}
      onSubmit={handleFormSubmit}
      enableReinitialize={true}
      validationSchema={validationSchema}
    >
      {({ handleSubmit, isSubmitting, values }) => {
        useEffect(() => checkChanges(values), [checkChanges, values]);
        return (
          <Form>
            <AppBar
              position='fixed'
              sx={{ top: 'auto', bottom: 0, backgroundColor: 'transparent', boxShadow: 'none' }}
            >
              <Toolbar sx={{ display: 'flex', justifyContent: 'space-between' }}>
                {!isAddingProduct && (
                  <Button
                    onClick={() => handleCopyProductClick(product?.product?.id)}
                    size='small'
                    variant='contained'
                  >
                    copy
                  </Button>
                )}
                <Button
                  size='small'
                  variant='contained'
                  type='button'
                  onClick={() => {
                    if (isEditMode || isAddingProduct || isCopyMode) {
                      handleSubmit();
                    } else if (onEditModeChange) {
                      onEditModeChange(true);
                    }
                  }}
                  disabled={isEditMode && !isFormChanged}
                  style={{ position: 'absolute', right: '30px' }}
                >
                  {isSubmitting ? (
                    <CircularProgress size={24} />
                  ) : isAddingProduct || isEditMode ? (
                    'save'
                  ) : (
                    'edit'
                  )}
                </Button>
              </Toolbar>
            </AppBar>
            <Grid container justifyContent='center' padding='2%' spacing={2}>
              <Grid size={{ xs: 12, sm: 6 }}>
                <Field
                  component={MediaView}
                  name='mediaIds'
                  {...{
                    isEditMode,
                    isCopyMode,
                    isAddingProduct,
                    product,
                    clearMediaPreview,
                  }}
                />
              </Grid>
              <Grid size={{ xs: 12, sm: 6 }}>
                <Grid container spacing={2}>
                  <Grid size={{ xs: 12 }}>
                    <Field
                      component={BasicFields}
                      name='product.productBody'
                      {...{ product, dictionary, isEditMode, isAddingProduct, isCopyMode }}
                    />
                  </Grid>
                  <Grid size={{ xs: 12 }}>
                    <Field
                      component={Tags}
                      name='tags'
                      {...{
                        isEditMode,
                        isAddingProduct,
                        isCopyMode,
                      }}
                    />
                  </Grid>
                </Grid>
              </Grid>
              <Grid size={{ xs: 12 }}>
                <Field
                  component={SizesAndMeasurements}
                  name='sizeMeasurements'
                  {...{ dictionary, isEditMode, isAddingProduct }}
                />
              </Grid>
            </Grid>
          </Form>
        );
      }}
    </Formik>
  );
};
