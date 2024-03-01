import React, { FC, useEffect, useState } from 'react';
import update from 'immutability-helper';
import { Layout } from 'components/login/layout';
import { common_ProductNew, AddProductRequest, common_Dictionary } from 'api/proto-http/admin';
import { addProduct, getDictionary } from 'api/admin';
import { Thumbnail } from './componentsOfProduct/thumbnail';
import { Sizes } from './componentsOfProduct/sizes';
import { Tags } from './componentsOfProduct/tag';
import { Categories } from './componentsOfProduct/categories';
import { ColorHEX } from './componentsOfProduct/colorHEX';
import { InputField } from './componentsOfProduct/inputFields';
import { findInDictionary } from '../orders/utility';
import styles from 'styles/addProd.scss';

const pattern: { [key: string]: RegExp } = {
  size: /SIZE_ENUM_/,
  order: /ORDER_STATUS_ENUM_/,
  payment: /PAYMENT_METHOD_NAME_ENUM_/,
  status: /ORDER_STATUS_ENUM_/,
  gender: /GENDER_ENUM_/,
};

export const initialProductState: common_ProductNew = {
  media: [],
  product: {
    preorder: '',
    name: '',
    brand: '',
    sku: '',
    color: '',
    colorHex: '',
    countryOfOrigin: '',
    thumbnail: '',
    price: undefined,
    salePercentage: undefined,
    categoryId: 0,
    description: '',
    hidden: false,
    targetGender: undefined,
  },
  sizeMeasurements: [],
  tags: [],
};

export const handleChange = (
  e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>,
  setProduct: React.Dispatch<React.SetStateAction<common_ProductNew>>,
) => {
  const { name, value } = e.target;

  setProduct((prevProduct) => {
    return update(prevProduct, {
      product: {
        [name]: {
          $set: name === 'price' || name === 'salePercentage' ? { value: value } : value,
        },
      },
    });
  });
};

export const AddProducts: FC = () => {
  const [product, setProduct] = useState<common_ProductNew>({
    ...initialProductState,
  });

  const handleInputChange = (
    e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>,
  ) => {
    handleChange(e, setProduct);
  };

  const [dictionary, setDictionary] = useState<common_Dictionary>();

  useEffect(() => {
    const fetchDictionary = async () => {
      try {
        const response = await getDictionary({});
        setDictionary(response.dictionary);
      } catch (error) {
        console.error(error);
      }
    };
    fetchDictionary();
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const nonEmptySizeMeasurements = product.sizeMeasurements?.filter(
        (sizeMeasurement) =>
          sizeMeasurement &&
          sizeMeasurement.productSize &&
          sizeMeasurement.productSize.quantity !== null,
      );

      const productToDisplayInJSON: AddProductRequest = {
        product: {
          ...product,
          sizeMeasurements: nonEmptySizeMeasurements,
        },
      };

      const response = await addProduct(productToDisplayInJSON);
      console.log('Product added:', response);
      setProduct(initialProductState);
    } catch (error) {
      setProduct(initialProductState);
      console.error('Error adding product:', error);
    }
  };

  const updateTags = (updatedTags: any) => {
    setProduct((prevProduct) => ({
      ...prevProduct,
      tags: updatedTags,
    }));
  };

  return (
    <Layout>
      <form onSubmit={handleSubmit} className={styles.form}>
        <InputField
          label='NAME'
          name='name'
          value={product.product?.name}
          onChange={handleInputChange}
        />

        <InputField
          label='COUNTRY'
          name='countryOfOrigin'
          value={product.product?.countryOfOrigin}
          onChange={handleInputChange}
        />

        <InputField
          label='BRAND'
          name='brand'
          value={product.product?.brand}
          onChange={handleInputChange}
        />

        <InputField
          label='PRICE'
          name='price'
          value={product.product?.price}
          onChange={handleInputChange}
        />

        <InputField
          label='SALES'
          name='salePercentage'
          value={product.product?.salePercentage}
          onChange={handleInputChange}
        />

        <InputField
          label='PREORDER'
          name='preorder'
          value={product.product?.preorder}
          onChange={handleInputChange}
        />

        <div className={styles.product_container}>
          <label htmlFor='gender' className={styles.title}>
            GENDER
          </label>
          <select
            name='targetGender'
            id='gender'
            value={product.product?.targetGender}
            onChange={handleInputChange}
            className={styles.product_input}
          >
            <option value=''>select gender</option>
            {dictionary?.genders?.map((gender, id) => (
              <option value={gender.id} key={id}>
                {/* in dictionary common_SizeEnum is a string so that doesn't show gender*/}
                {gender.id && findInDictionary(dictionary, parseInt(gender.id), 'gender', pattern)}
              </option>
            ))}
          </select>
        </div>

        <div className={styles.product_container}>
          <label htmlFor='descrip' className={styles.title}>
            DESCRIPTION
          </label>
          <textarea
            name='description'
            id='descrip'
            value={product.product?.description}
            cols={1}
            rows={2}
            style={{ width: '150px' }}
            onChange={handleInputChange}
          ></textarea>
        </div>

        <InputField
          label='VENDORE CODE'
          name='sku'
          value={product.product?.sku}
          onChange={handleInputChange}
        />

        <InputField
          label='COLOR'
          name='color'
          value={product.product?.color}
          onChange={handleInputChange}
        />

        <ColorHEX product={product} setProduct={setProduct} />

        <InputField
          label='THUMBNAIL'
          name='thumbnail'
          value={product.product?.thumbnail}
          onChange={handleInputChange}
        />

        <Thumbnail product={product} setProduct={setProduct} />

        <Categories product={product} setProduct={setProduct} dictionary={dictionary} />

        <Sizes setProduct={setProduct} dictionary={dictionary} />

        <Tags updateTags={updateTags} />

        <button type='submit' className={styles.submit}>
          SUBMIT
        </button>
      </form>
    </Layout>
  );
};
