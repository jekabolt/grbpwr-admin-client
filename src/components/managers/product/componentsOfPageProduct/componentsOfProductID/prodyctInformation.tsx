import {
  common_Genders,
  common_ProductFull,
  common_ProductMeasurement,
  common_ProductSize,
} from 'api/proto-http/admin';
import React, { FC } from 'react';
import styles from 'styles/productID.scss';
import { MeasurementUpdates, ProductFields } from './productIdReducer';
import { UpdateColors } from './updateColors';
import { UpdateInputField } from './updateInputField';
import { UpdateSizeMeasurements } from './updateSizeMeasurements';

interface ProductInfo {
  product: common_ProductFull | undefined; // Replace with your actual product type
  productFields: ProductFields; // Assuming ProductFields is the type you've defined earlier
  handleChange: (
    e: React.ChangeEvent<HTMLInputElement> | React.ChangeEvent<HTMLSelectElement>,
  ) => void;
  updateProduct: (fieldNameToUpdate: string) => Promise<void>; // Adjust the type based on your actual implementation
  toggleHideProduct: (
    productId: number | undefined,
    currentHideStatus: boolean | undefined,
  ) => Promise<void>;
  deleteUpdatedTag: (tag: string) => Promise<void>;
  handleNewTagChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  getSizeName: (sizeId: number | undefined) => string;
  getMeasuremntName: (measurementId: number | undefined) => string;
  handleSizeChange: (sizeId: number | undefined, quantity: number | undefined) => void;
  updateSizeQuantity: (sizeId: number | undefined, quantity: number | undefined) => Promise<void>;
  handleMeasurementChange: (
    e: React.ChangeEvent<HTMLInputElement>,
    sizeId: number,
    measurementNameId: number,
  ) => void;
  updateMeasurementValue: (sizeId: number, measurementNameId: number) => Promise<void>;
  sizes: common_ProductSize[] | undefined; // Replace with your actual size type
  measurements: common_ProductMeasurement[] | undefined; // Replace with your actual measurement type
  sizeUpdates: { [sizeId: string]: number }; // Replace with your actual size update type
  measurementUpdates?: MeasurementUpdates; // Replace with your actual measurement update type
  tags: string[];
  genders: common_Genders[] | undefined;
}

export const ProductInformation: FC<ProductInfo> = ({
  product,
  productFields,
  handleChange,
  updateProduct,
  toggleHideProduct,
  deleteUpdatedTag,
  handleNewTagChange,
  getSizeName,
  getMeasuremntName,
  handleSizeChange,
  updateSizeQuantity,
  handleMeasurementChange,
  updateMeasurementValue,
  sizeUpdates,
  tags,
  genders,
}) => {
  function transformMeasurements(
    measurements: common_ProductMeasurement[] | undefined,
  ): MeasurementUpdates {
    const updates: MeasurementUpdates = {};
    measurements?.forEach((measurement) => {
      if (
        measurement.measurementNameId !== undefined &&
        measurement.measurementValue !== undefined
      ) {
        // Assuming measurementValue can be correctly represented as a string.
        // Adjust the conversion based on its actual structure.
        const key = measurement.measurementNameId.toString();
        const value = measurement.measurementValue.toString();
        updates[key] = value;
      }
    });
    return updates;
  }
  return (
    <div className={styles.product_id_information}>
      <button
        onClick={() =>
          toggleHideProduct(product?.product?.id, product?.product?.productInsert?.hidden)
        }
      >
        {product?.product?.productInsert?.hidden ? 'Unhide Product' : 'Hide Product'}
      </button>
      <UpdateInputField
        label='Name'
        productInfo={product?.product?.productInsert?.name}
        name='newProductName'
        value={productFields.newProductName}
        onChange={handleChange}
        updateFunction={() => updateProduct('newProductName')}
      />

      <UpdateInputField
        label='description'
        productInfo={product?.product?.productInsert?.description}
        name='newDescription'
        value={productFields.newDescription}
        onChange={handleChange}
        updateFunction={() => updateProduct('newDescription')}
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

      <div className={styles.update_info_container}>
        <label>Tags:</label>
        {tags?.map((tag, index) => (
          <div key={index} className={styles.tags}>
            {tag} <button onClick={() => deleteUpdatedTag(tag)}>X</button>
          </div>
        ))}
        <input
          type='text'
          placeholder='Add new tag'
          value={productFields.newTag}
          onChange={handleNewTagChange}
        />
        <button onClick={() => updateProduct('newTag')}>+</button>
      </div>

      <div className={styles.update_info_container}>
        <label>{product?.product?.productInsert?.targetGender}</label>
        <select name='newGender' value={productFields.newGender} onChange={handleChange}>
          <option value='GENDER_ENUM_UNKNOWN'>Select gender</option>
          {genders?.map((gender, _) => (
            <option key={gender.id} value={gender.id}>
              {gender.name}
            </option>
          ))}
        </select>
        <button onClick={() => updateProduct('newGender')}>+</button>
      </div>

      <UpdateSizeMeasurements
        sizes={product?.sizes}
        measurements={product?.measurements}
        sizeUpdates={sizeUpdates}
        measurementUpdates={transformMeasurements(product?.measurements)}
        getSizeName={getSizeName}
        getMeasuremntName={getMeasuremntName}
        handleSizeChange={handleSizeChange}
        handleMeasurementChange={handleMeasurementChange}
        updateSizeQuantity={updateSizeQuantity}
        updateMeasurementValue={updateMeasurementValue}
      />
    </div>
  );
};
