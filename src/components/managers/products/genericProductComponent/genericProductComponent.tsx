import { AppBar, Button, CircularProgress, Grid, Toolbar } from '@mui/material';
import { common_ProductNew, common_SizeWithMeasurementInsert } from 'api/proto-http/admin';
import { Field, Form, Formik, FormikHelpers, FormikProps } from 'formik';
import { FC, useEffect, useRef, useState } from 'react';
import { BasicFields } from './basicFields/basicFields';
import { GenericProductFormInterface } from './interface/interface';
import { MediaView } from './mediaView/mediaView';
import { SizesAndMeasurements } from './sizesAndMeasurements/sizesAndMeasurements';
import { Tags } from './tags/tags';

export const GenericProductForm: FC<GenericProductFormInterface> = ({
  initialProductState,
  isEditMode = false,
  isAddingProduct = false,
  dictionary,
  product,
  onSubmit,
  onEditModeChange,
}) => {
  const [clearMediaPreview, setClearMediaPreview] = useState(false);
  const [isFormChanged, setIsFormChanged] = useState(false);
  const initialProductRef = useRef(initialProductState);

  useEffect(() => {
    initialProductRef.current = initialProductState;
  }, [initialProductState]);

  useEffect(() => {
    const handleKeydown = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && isEditMode) {
        if (onEditModeChange) onEditModeChange(false);
      }
    };

    document.addEventListener('keydown', handleKeydown);

    return () => {
      document.removeEventListener('keydown', handleKeydown);
    };
  }, [isEditMode, onEditModeChange]);

  const filterEmptySizes = (sizes: common_SizeWithMeasurementInsert[] | undefined) => {
    return sizes?.filter((size) => {
      const hasValidQuantity =
        size.productSize?.quantity?.value && size.productSize.quantity.value !== '0';
      const hasValidMeasurements = size.measurements?.some(
        (m) => m.measurementValue?.value && m.measurementValue.value !== '0',
      );
      return hasValidQuantity || hasValidMeasurements;
    });
  };

  const handleFormSubmit = async (
    values: common_ProductNew,
    actions: FormikHelpers<common_ProductNew>,
  ) => {
    const filteredValues = {
      ...values,
      sizeMeasurements: filterEmptySizes(values.sizeMeasurements),
    };
    await onSubmit(filteredValues, actions);
    setIsFormChanged(false);
    if (onEditModeChange) {
      onEditModeChange(false);
    }
  };

  return (
    <Formik
      initialValues={initialProductState}
      onSubmit={handleFormSubmit}
      enableReinitialize={true}
    >
      {({ handleSubmit, isSubmitting, values }: FormikProps<common_ProductNew>) => {
        useEffect(() => {
          setIsFormChanged(JSON.stringify(values) !== JSON.stringify(initialProductRef.current));
        }, [values]);

        return (
          <Form>
            <AppBar
              position='fixed'
              sx={{ top: 'auto', bottom: 0, backgroundColor: 'transparent', boxShadow: 'none' }}
            >
              <Toolbar sx={{ display: 'flex', justifyContent: 'flex-end' }}>
                <Button
                  size='small'
                  variant='contained'
                  type='button'
                  onClick={() => {
                    if (isEditMode) {
                      handleSubmit();
                    } else if (onEditModeChange) {
                      onEditModeChange(true);
                    } else {
                      handleSubmit();
                    }
                  }}
                  disabled={isEditMode && !isFormChanged}
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
              <Grid item xs={12} sm={6}>
                <Field
                  component={MediaView}
                  name='mediaIds'
                  isEditMode={isEditMode}
                  isAddingProduct={isAddingProduct}
                  product={product}
                  clearMediaPreview={clearMediaPreview}
                />
              </Grid>
              <Grid item xs={12} sm={6}>
                <Grid container spacing={2}>
                  <Grid item xs={12}>
                    <Field
                      component={BasicFields}
                      name='product.productBody'
                      product={product}
                      dictionary={dictionary}
                      isEditMode={isEditMode}
                      isAddingProduct={isAddingProduct}
                    />
                  </Grid>
                  <Grid item xs={12}>
                    <Field
                      component={Tags}
                      name='tags'
                      isEditMode={isEditMode}
                      isAddingProduct={isAddingProduct}
                    />
                  </Grid>
                </Grid>
              </Grid>
              <Grid item xs={12}>
                <Field
                  component={SizesAndMeasurements}
                  name='sizeMeasurements'
                  dictionary={dictionary}
                  isEditMode={isEditMode}
                  isAddingProduct={isAddingProduct}
                />
              </Grid>
            </Grid>
          </Form>
        );
      }}
    </Formik>
  );
};
