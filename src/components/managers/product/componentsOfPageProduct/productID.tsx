/* eslint-disable no-case-declarations */
import React, { FC, useEffect, useReducer } from 'react';
import { reducer, initialState } from './componentsOfProductID/productIdReducer';
import { Layout } from 'components/login/layout';
import { ProductFields } from './componentsOfProductID/productIdReducer';
import { getProductByID, getDictionary } from 'api/admin';
import { ProductInformation } from './componentsOfProductID/prodyctInformation';
import { ProductMediaContainer } from './componentsOfProductID/productMediaContainer';
import {
  updateName,
  updateSku,
  updatePreorder,
  updateColors,
  updateCountry,
  updateBrand,
  updateGender,
  updateThumbnail,
  updatePrice,
  updateSale,
  updateCategory,
  updateSize,
  updateMeasurement,
  updateDescription,
  updateTag,
  deleteTag,
  updateHide,
} from 'api/byID';
import queryString from 'query-string';
import styles from 'styles/productID.scss';

interface ProductIdProps {
  productId: number | undefined;
}

export const ProductId: FC<ProductIdProps> = ({ productId }) => {
  // const queryParams = queryString.parse(window.location.search);
  // const productId = queryParams.productId as string;
  const [state, dispatch] = useReducer(reducer, initialState);

  const handleChange = (
    e: React.ChangeEvent<HTMLInputElement> | React.ChangeEvent<HTMLSelectElement>,
  ) => {
    const { name, value } = e.target;
    dispatch({
      type: 'UPDATE_PRODUCT_FIELD',
      fieldName: name as keyof ProductFields,
      value,
    });
  };
  // TODO: useCallback ???
  const updateProduct = async (fieldNameToUpdate: string) => {
    if (!state.product?.product?.id) {
      console.error('Product ID is undefined');
      return;
    }

    const productId = state.product.product.id;
    const value = state.productFields[fieldNameToUpdate as keyof ProductFields];

    try {
      switch (fieldNameToUpdate) {
        case 'newProductName':
          await updateName({ productId, name: value as string });
          break;
        case 'newSku':
          await updateSku({ productId, sku: value as string });
          break;
        case 'newPreorder':
          await updatePreorder({ productId, preorder: value as string });
          break;
        case 'newColor':
          if (state.productFields.newColor && state.productFields.newColorHEX) {
            await updateColors({
              productId,
              color: state.productFields.newColor,
              colorHex: state.productFields.newColorHEX,
            });
          }
          break;
        case 'newCountry':
          await updateCountry({ productId, countryOfOrigin: value as string });
          break;
        case 'newBrand':
          await updateBrand({ productId, brand: value as string });
          break;
        case 'newGender':
          await updateGender({
            productId,
            gender: state.productFields.newGender,
          });
          break;
        case 'newThumbnail':
          await updateThumbnail({ productId, thumbnail: value as string });
          break;
        case 'newPrice':
          const decimalPrice = createDecimalObject(state.productFields.newPrice);
          await updatePrice({ productId, price: decimalPrice });
          break;
        case 'newSale':
          const decimalSale = createDecimalObject(state.productFields.newSale);
          await updateSale({ productId, sale: decimalSale });
          break;
        case 'newCategory':
          await updateCategory({ productId, categoryId: Number(value) });
          break;
        case 'newDescription':
          await updateDescription({ productId, description: value as string });
          break;
        case 'newTag':
          await updateTag({ productId, tag: value as string });
          break;
        default:
          console.warn(`No update function for field: ${fieldNameToUpdate}`);
      }

      dispatch({
        type: 'UPDATE_PRODUCT_FIELD',
        fieldName: fieldNameToUpdate,
        value: value,
      });

      console.log(`Product field ${fieldNameToUpdate} updated successfully`);
    } catch (error) {
      console.error(`Error updating product field ${fieldNameToUpdate}:`, error);
    }
  };

  function createDecimalObject(decimalString: string) {
    if (!decimalString) return { value: '0' };
    return { value: decimalString };
  }

  useEffect(() => {
    const fetchData = async () => {
      try {
        const dictionaryResponse = await getDictionary({});
        dispatch({ type: 'SET_GENDERS', payload: dictionaryResponse.dictionary?.genders || [] });
        dispatch({ type: 'SET_SIZES', payload: dictionaryResponse.dictionary?.sizes || [] });
        dispatch({
          type: 'SET_MEASUREMENTS',
          payload: dictionaryResponse.dictionary?.measurements || [],
        });
      } catch (error) {
        console.error(error);
      }
    };
    fetchData();
  }, []);

  useEffect(() => {
    const fetchData = async () => {
      try {
        const response = await getProductByID({ id: Number(productId) });
        dispatch({ type: 'SET_PRODUCT', payload: response.product });
      } catch (error) {
        console.error(error);
      }
    };
    fetchData();
  }, [state.productFields]);

  const getSizeName = (sizeId: number | undefined): string => {
    const size = state.sizes.find((s) => s.id === sizeId);
    if (size && size.name) {
      return size.name.replace('SIZE_ENUM_', '');
    }
    return 'size not found';
  };

  const getMeasuremntName = (measurementId: number | undefined): string => {
    const measure = state.measurements?.find((m) => m.id === measurementId);
    if (measure && measure.name) {
      return measure.name.replace('MEASUREMENT_NAME_ENUM_', '');
    }
    return 'size not found';
  };

  const toogleAddMedia = () => {
    dispatch({ type: 'TOGGLE_ADD_MEDIA' });
  };

  const handleNewTagChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    dispatch({ type: 'SET_NEW_TAG', payload: e.target.value });
  };

  const deleteUpdatedTag = async (tag: string) => {
    if (tag && state.product?.product?.id) {
      try {
        await deleteTag({ productId: state.product.product.id, tag });
        dispatch({ type: 'REMOVE_TAG', tag });
      } catch (error) {
        console.error('Error deleting tag:', error);
      }
    }
  };

  const toggleHideProduct = async (
    productId: number | undefined,
    currentHideStatus: boolean | undefined,
  ) => {
    if (productId !== undefined) {
      try {
        await updateHide({ id: productId, hide: !currentHideStatus });
        dispatch({
          type: 'TOGGLE_HIDE_PRODUCT',
          payload: { productId, hideStatus: !currentHideStatus },
        });
      } catch (error) {
        console.error('Error toggling product hide status:', error);
      }
    }
  };

  const handleMeasurementChange = (
    e: React.ChangeEvent<HTMLInputElement>,
    sizeId: number,
    measurementNameId: number,
  ) => {
    const key = `${sizeId}-${measurementNameId}`;
    dispatch({
      type: 'UPDATE_MEASUREMENT',
      sizeId,
      measurementNameId,
      value: e.target.value,
    });
  };
  const updateMeasurementValue = async (sizeId: number, measurementNameId: number) => {
    const key = `${sizeId}-${measurementNameId}`;
    const measurementValue = state.measurement[key];
    if (!sizeId || !measurementNameId || !measurementValue || !state.product?.product?.id) return;

    try {
      const decimalValue = createDecimalObject(measurementValue);
      await updateMeasurement({
        productId: state.product.product.id,
        sizeId,
        measurementNameId,
        measurementValue: decimalValue,
      });
    } catch (error) {
      console.error('Error updating measurement:', error);
    }
  };

  const handleSizeChange = (sizeId: number | undefined, quantity: number | undefined) => {
    dispatch({
      type: 'UPDATE_SIZE',
      sizeId,
      quantity,
    });
  };

  const updateSizeQuantity = async (sizeId: number | undefined, quantity: number | undefined) => {
    if (
      typeof sizeId === 'undefined' ||
      typeof quantity === 'undefined' ||
      !state.product?.product?.id
    )
      return;
    try {
      await updateSize({ productId: state.product?.product?.id, sizeId, quantity });
    } catch (error) {
      console.error('Error updating size:', error);
    }
  };

  return (
    <Layout>
      <div className={styles.product_id_full_content}>
        <ProductMediaContainer
          product={state.product}
          toggleAddMedia={toogleAddMedia}
          showAddMedia={state.showAddMedia}
        />

        <ProductInformation
          product={state.product}
          productFields={state.productFields}
          handleChange={handleChange}
          updateProduct={updateProduct}
          toggleHideProduct={toggleHideProduct}
          deleteUpdatedTag={deleteUpdatedTag}
          handleNewTagChange={handleNewTagChange}
          getSizeName={getSizeName}
          getMeasuremntName={getMeasuremntName}
          handleSizeChange={handleSizeChange}
          updateSizeQuantity={updateSizeQuantity}
          handleMeasurementChange={handleMeasurementChange}
          updateMeasurementValue={updateMeasurementValue}
          sizeUpdates={state.sizeUpdates}
          tags={state.tags}
          genders={state.genders}
          sizes={undefined}
          measurements={undefined}
        />
      </div>
    </Layout>
  );
};
