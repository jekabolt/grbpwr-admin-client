import { AppBar, Button, CircularProgress, Grid, Toolbar } from '@mui/material';
import { getProductByID } from 'api/admin';
import { common_ProductFull, common_ProductNew } from 'api/proto-http/admin';
import { Field, Form, Formik, FormikHelpers } from 'formik';
import isEqual from 'lodash/isEqual';
import { FC, useEffect, useState } from 'react';
import { BasicFields } from './basicFields/basicFields';
import { GenericProductFormInterface } from './interface/interface';
import { MediaView } from './mediaView/mediaView';
import { SizesAndMeasurements } from './sizesAndMeasurements/sizesAndMeasurements';
import { Tags } from './tags/tags';
import { productInitialValues } from './utility/productInitialValues';

export const GenericProductForm: FC<GenericProductFormInterface> = ({
  initialProductState,
  isEditMode = false,
  isAddingProduct = false,
  productId,
  dictionary,
  onSubmit,
  onEditModeChange,
}) => {
  const [product, setProduct] = useState<common_ProductFull | undefined>();
  const [clearMediaPreview, setClearMediaPreview] = useState(false);
  const [initialValues, setInitialValues] = useState<common_ProductNew>(initialProductState);
  const [isFormChanged, setIsFormChanged] = useState<boolean>(false);

  useEffect(() => {
    if (productId) {
      const fetchProduct = async () => {
        try {
          const response = await getProductByID({ id: parseInt(productId) });
          setProduct(response.product);
          setInitialValues(productInitialValues(response.product));
        } catch (error) {
          console.error(error);
        }
      };
      fetchProduct();
    }
  }, [productId]);

  useEffect(() => {
    const handleKeydown = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && isEditMode) {
        if (onEditModeChange) onEditModeChange(false);
      }
    };

    const handleDoubleClick = () => {
      if (isEditMode && onEditModeChange) {
        onEditModeChange(false);
      }
    };

    document.addEventListener('keydown', handleKeydown);
    document.addEventListener('dblclick', handleDoubleClick);

    return () => {
      document.removeEventListener('keydown', handleKeydown);
      document.removeEventListener('dblclick', handleDoubleClick);
    };
  }, [isEditMode, onEditModeChange]);

  const handleFormSubmit = async (
    values: common_ProductNew,
    actions: FormikHelpers<common_ProductNew>,
  ) => {
    await onSubmit(values, actions);
    setInitialValues(values);
    setIsFormChanged(false);
    if (onEditModeChange) {
      onEditModeChange(false);
    }
  };

  return (
    <Formik initialValues={initialValues} onSubmit={handleFormSubmit} enableReinitialize={true}>
      {({ values, handleSubmit, isSubmitting }) => {
        useEffect(() => {
          setIsFormChanged(!isEqual(values, initialValues));
        }, [values, initialValues]);

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
                      initialTags={
                        product
                          ? product.tags?.map((tag) => tag.productTagInsert?.tag || '') || []
                          : undefined
                      }
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
