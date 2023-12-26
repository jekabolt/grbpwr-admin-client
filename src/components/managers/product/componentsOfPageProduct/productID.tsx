/* eslint-disable no-case-declarations */
import React, { FC, useState, useEffect } from 'react';
import { Layout } from 'components/layout/layout';
import {
  common_GenderEnum,
  common_Genders,
  common_MeasurementName,
  common_ProductFull,
  common_Size,
} from 'api/proto-http/admin';
import { getProductByID, getDictionary } from 'api/admin';
import { UpdateInputField } from './updateInputField';
import { UpdateColors } from './updateColors';
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
} from 'api/byID';
import queryString from 'query-string';
import styles from 'styles/productID.scss';
// TODO: ????
interface ProductFields {
  // TODO: ???
  [key: string]: number | string | common_GenderEnum;
  newProductName: string;
  newSku: string;
  newPreorder: string;
  newColor: string;
  newColorHEX: string;
  newCountry: string;
  newBrand: string;
  newGender: common_GenderEnum;
  newThumbnail: string;
  newPrice: string;
  newSale: string;
  newCategory: number;
}

type MeasurementUpdates = {
  [key: string]: string;
};

export const ProductId: FC = () => {
  const queryParams = queryString.parse(window.location.search);
  const productId = queryParams.productId as string;
  const [product, setProuct] = useState<common_ProductFull | undefined>(undefined);
  const [sizeDictionary, setSizeDictionary] = useState<common_Size[]>([]);
  const [genders, setGenders] = useState<common_Genders[] | undefined>(undefined);
  const [productFields, setProductFields] = useState<ProductFields>({
    newProductName: '',
    newSku: '',
    newPreorder: '',
    newColor: '',
    newColorHEX: '',
    newCountry: '',
    newBrand: '',
    newGender: '' as common_GenderEnum,
    newThumbnail: '',
    newPrice: '',
    newSale: '',
    newCategory: 0,
  });
  const [sizeUpdates, setSizeUpdates] = useState<{ [sizeId: string]: number }>({});
  const [measurement, setMeasurement] = useState<common_MeasurementName[]>([]);
  const [measurementUpdates, setMeasurementUpdates] = useState<MeasurementUpdates>({});

  const handleMeasurementChange = (
    e: React.ChangeEvent<HTMLInputElement>,
    sizeId: number,
    measurementNameId: number,
  ) => {
    const key = `${sizeId}-${measurementNameId}`;
    setMeasurementUpdates({
      ...measurementUpdates,
      [key]: e.target.value,
    });
  };

  // Function to update measurement
  const updateMeasurementValue = async (sizeId: number, measurementNameId: number) => {
    const key = `${sizeId}-${measurementNameId}`;
    const measurementValue = measurementUpdates[key];
    if (!sizeId || !measurementNameId || !measurementValue || !product?.product?.id) return;

    try {
      const decimalValue = createDecimalObject(measurementValue);
      await updateMeasurement({
        productId: product.product.id,
        sizeId,
        measurementNameId,
        measurementValue: decimalValue,
      });
      // Optionally, update local state or refetch measurement details
    } catch (error) {
      console.error('Error updating measurement:', error);
    }
  };

  const handleSizeChange = (sizeId: number | undefined, quantity: number) => {
    if (typeof sizeId !== 'undefined') {
      setSizeUpdates((prev) => ({ ...prev, [sizeId]: quantity }));
    }
  };

  const updateSizeQuantity = async (sizeId: number | undefined, quantity: number | undefined) => {
    if (typeof sizeId === 'undefined' || typeof quantity === 'undefined' || !product?.product?.id)
      return;
    try {
      await updateSize({ productId: product.product.id, sizeId, quantity });
      // Optionally, update local state or refetch product details
    } catch (error) {
      console.error('Error updating size:', error);
    }
  };

  const handleChange = (
    e: React.ChangeEvent<HTMLInputElement> | React.ChangeEvent<HTMLSelectElement>,
  ) => {
    const { name, value } = e.target;
    setProductFields((prevState) => ({
      ...prevState,
      [name]: value,
    }));
  };

  const updateProduct = async (fieldName: string) => {
    if (!product || !product.product?.id) {
      console.error('id undefined');
      return;
    }
    const fieldValue = productFields[fieldName as keyof typeof productFields];
    const value = typeof fieldValue === 'number' ? fieldValue.toString() : fieldValue;

    if (!value) return;

    try {
      switch (fieldName) {
        case 'newProductName':
          if (typeof value === 'string') {
            await updateName({ productId: product.product.id, name: value });
          }
          break;
        case 'newSku':
          if (typeof value === 'string') {
            await updateSku({ productId: product.product.id, sku: value });
          }
          break;
        case 'newPreorder':
          if (typeof value === 'string') {
            await updatePreorder({ productId: product.product.id, preorder: value });
          }
          break;
        case 'newColor':
          if (productFields.newColor && productFields.newColorHEX) {
            await updateColors({
              productId: product.product.id,
              color: productFields.newColor,
              colorHex: productFields.newColorHEX,
            });
          }
          break;
        case 'newCountry':
          if (typeof value === 'string') {
            await updateCountry({ productId: product.product.id, countryOfOrigin: value });
          }
          break;
        case 'newBrand':
          if (typeof value === 'string') {
            await updateBrand({ productId: product.product.id, brand: value });
          }
          break;
        case 'newGender':
          await updateGender({
            productId: product.product.id,
            gender: productFields.newGender,
          });
          break;
        case 'newThumbnail':
          if (typeof value === 'string') {
            await updateThumbnail({ productId: product.product.id, thumbnail: value });
          }
          break;
        case 'newPrice':
          const decimalPrice = createDecimalObject(productFields.newPrice);
          await updatePrice({ productId: product.product.id, price: decimalPrice });
          break;
        case 'newSale':
          const decimalSale = createDecimalObject(productFields.newSale);
          await updateSale({ productId: product.product.id, sale: decimalSale });
          break;
        case 'newCategory':
          await updateCategory({ productId: product.product.id, categoryId: Number(value) });
          break;
        default:
          break;
      }
      updateLocalProductDetails(fieldName, value);
    } catch (error) {
      console.error(error);
    }
  };

  function createDecimalObject(decimalString: string) {
    if (!decimalString) return { value: '0' };
    return { value: decimalString };
  }

  const updateLocalProductDetails = (fieldName: string, newValue: string | common_GenderEnum) => {
    setProuct((prevProduct) => {
      if (!prevProduct || !prevProduct.product) {
        return prevProduct;
      }

      const updatedProduct = { ...prevProduct };
      if (fieldName === 'newProductName' && updatedProduct.product?.productInsert) {
        updatedProduct.product.productInsert.name = newValue;
      } else if (fieldName === 'newSku' && updatedProduct.product?.productInsert) {
        updatedProduct.product.productInsert.sku = newValue;
      } else if (fieldName === 'newColor' && updatedProduct.product?.productInsert) {
        updatedProduct.product.productInsert.color = newValue;
      } else if (fieldName === 'newColorHEX' && updatedProduct.product?.productInsert) {
        updatedProduct.product.productInsert.colorHex = newValue;
      } else if (fieldName === 'newPreorder' && updatedProduct.product?.productInsert) {
        updatedProduct.product.productInsert.preorder = newValue;
      } else if (fieldName === 'newCountry' && updatedProduct.product?.productInsert) {
        updatedProduct.product.productInsert.countryOfOrigin = newValue;
      } else if (fieldName === 'newBrand' && updatedProduct.product?.productInsert) {
        updatedProduct.product.productInsert.brand = newValue;
      } else if (fieldName === 'newGender' && updatedProduct.product?.productInsert) {
        // updatedProduct.product.productInsert.targetGender = newValue;
      } else if (fieldName === 'newThumbnail' && updatedProduct.product?.productInsert) {
        updatedProduct.product.productInsert.thumbnail = newValue;
      } else if (fieldName === 'newPrice' && updatedProduct.product?.productInsert) {
        updatedProduct.product.productInsert.price = createDecimalObject(newValue);
      } else if (fieldName === 'newSale' && updatedProduct.product?.productInsert) {
        updatedProduct.product.productInsert.salePercentage = createDecimalObject(newValue);
      } else if (fieldName === 'newCategory' && updatedProduct.product?.productInsert) {
        updatedProduct.product.productInsert.categoryId = Number(newValue);
      }

      return updatedProduct;
    });
  };

  useEffect(() => {
    const fetchData = async () => {
      try {
        const response = await getProductByID({ id: Number(productId) });
        setProuct(response.product);
      } catch (error) {
        console.error('Error fetching product data:', error);
      }
    };

    fetchData();
  }, [productId]);

  useEffect(() => {
    const fetchSize = async () => {
      try {
        const response = await getDictionary({});
        setSizeDictionary(response.dictionary?.sizes || []);
        setGenders(response.dictionary?.genders || []);
        setMeasurement(response.dictionary?.measurements || []);
      } catch (error) {
        console.error(error);
      }
    };
    fetchSize();
  }, []);

  const getSizeName = (sizeId: number | undefined): string => {
    const size = sizeDictionary.find((s) => s.id === sizeId);
    if (size && size.name) {
      return size.name.replace('SIZE_ENUM_', '');
    }
    return 'size not found';
  };

  const getMeasuremntName = (measurementId: number | undefined): string => {
    const measure = measurement.find((m) => m.id === measurementId);
    if (measure && measure.name) {
      return measure.name.replace('MEASUREMENT_NAME_ENUM_', '');
    }
    return 'size not found';
  };

  return (
    <Layout>
      <div className={styles.product_id_full_content}>
        <div className={styles.img_grid}>
          <div className={styles.main_img_container}>
            <img
              src={product?.product?.productInsert?.thumbnail}
              alt='thumbnail'
              className={styles.main_img}
            />
          </div>
          <ul className={styles.product_by_id_media_list}>
            {product?.media?.map((media, index) => (
              <li key={index}>
                <p>{index + 1}</p>
                <img src={media.productMediaInsert?.compressed} alt='' />
              </li>
            ))}
          </ul>
        </div>
        <div className={styles.product_id_information}>
          <UpdateInputField
            label='Name'
            productInfo={product?.product?.productInsert?.name}
            name='newProductName'
            value={productFields.newProductName}
            onChange={handleChange}
            updateFunction={() => updateProduct('newProductName')}
          />
          <UpdateInputField
            label='Sku'
            productInfo={product?.product?.productInsert?.sku}
            name='newSku'
            value={productFields.newSku}
            onChange={handleChange}
            updateFunction={() => updateProduct('newSku')}
          />
          <UpdateInputField
            label='Preorder'
            productInfo={product?.product?.productInsert?.preorder}
            name='newPreorder'
            value={productFields.newPreorder}
            onChange={handleChange}
            updateFunction={() => updateProduct('newPreorder')}
          />
          <UpdateColors
            label='Colors'
            productInfo={product?.product?.productInsert?.color}
            productInfoHEX={product?.product?.productInsert?.colorHex}
            colorName='newColor'
            hexName='newColorHEX'
            colorValue={productFields.newColor}
            hexValue={productFields.newColorHEX}
            onChange={handleChange}
            updateFunction={() => updateProduct('newColor')}
          />
          <UpdateInputField
            label='Country'
            productInfo={product?.product?.productInsert?.countryOfOrigin}
            name='newCountry'
            value={productFields.newCountry}
            onChange={handleChange}
            updateFunction={() => updateProduct('newCountry')}
          />
          <UpdateInputField
            label='Brand'
            productInfo={product?.product?.productInsert?.brand}
            name='newBrand'
            value={productFields.newBrand}
            onChange={handleChange}
            updateFunction={() => updateProduct('newBrand')}
          />
          <UpdateInputField
            label='Thumbnail'
            productInfo={product?.product?.productInsert?.thumbnail}
            name='newThumbnail'
            value={productFields.newThumbnail}
            onChange={handleChange}
            updateFunction={() => updateProduct('newThumbnail')}
          />
          <UpdateInputField
            label='Price'
            productInfo={product?.product?.productInsert?.price?.value}
            name='newPrice'
            value={productFields.newPrice}
            onChange={handleChange}
            updateFunction={() => updateProduct('newPrice')}
          />
          <UpdateInputField
            label='Sale'
            productInfo={product?.product?.productInsert?.salePercentage?.value}
            name='newSale'
            value={productFields.newSale}
            onChange={handleChange}
            updateFunction={() => updateProduct('newSale')}
          />
          <UpdateInputField
            label='Category'
            productInfo={product?.product?.productInsert?.categoryId}
            name='newCategory'
            value={productFields.newCategory}
            onChange={handleChange}
            updateFunction={() => updateProduct('newCategory')}
          />
          <h3>{product?.product?.productInsert?.targetGender}</h3>
          <select name='newGender' value={productFields.newGender} onChange={handleChange}>
            <option value='GENDER_ENUM_UNKNOWN'>Select gender</option>
            {genders?.map((gender, _) => (
              <option key={gender.id} value={gender.id}>
                {gender.name}
              </option>
            ))}
          </select>
          <button onClick={() => updateProduct('newGender')}>+</button>

          {product?.sizes
            ?.filter((size) => typeof size.sizeId !== 'undefined')
            .map((size, index) => (
              <div key={index}>
                <span>
                  {getSizeName(size.sizeId)}: {size.quantity?.value}
                </span>
                <input
                  type='number'
                  value={size.sizeId !== undefined ? sizeUpdates[size.sizeId] : 0}
                  onChange={(e) => handleSizeChange(size.sizeId!, Number(e.target.value))}
                />
                <button
                  onClick={() =>
                    size.sizeId !== undefined &&
                    updateSizeQuantity(size.sizeId, sizeUpdates[size.sizeId])
                  }
                >
                  Update Quantity
                </button>
              </div>
            ))}
          <ul>
            {product?.sizes?.map((size, sizeIndex) =>
              product?.measurements?.map((m, measurementIndex) => {
                const key = `${size.sizeId}-${m.measurementNameId}`;
                return (
                  <li key={`${sizeIndex}-${measurementIndex}`}>
                    {getMeasuremntName(m.measurementNameId)}:{m.measurementValue?.value}
                    <input
                      type='text'
                      value={measurementUpdates[key] || ''}
                      onChange={(e) =>
                        handleMeasurementChange(e, size.sizeId!, m.measurementNameId!)
                      }
                    />
                    <button
                      onClick={() => updateMeasurementValue(size.sizeId!, m.measurementNameId!)}
                    >
                      Update
                    </button>
                  </li>
                );
              }),
            )}
          </ul>
        </div>
      </div>
    </Layout>
  );
};
