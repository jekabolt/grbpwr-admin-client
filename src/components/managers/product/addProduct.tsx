import React, { FC, useEffect, useState } from 'react';
import update from 'immutability-helper';
import { Layout } from 'components/login/layout';
import { common_ProductNew, AddProductRequest, common_Dictionary } from 'api/proto-http/admin';
import { addProduct, getDictionary } from 'api/admin';
import { Sizes } from './componentsOfProduct/sizes';
import { Tags } from './componentsOfProduct/tag';
import { Categories } from './componentsOfProduct/categories';
import { ColorHEX } from './componentsOfProduct/colorHEX';
import { InputField } from './componentsOfProduct/inputFields';
import { MediaSelector } from './componentsOfProduct/mediaSelector';
import styles from 'styles/addProd.scss';

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
    const storedDictionary = localStorage.getItem('dictionary');
    if (storedDictionary) {
      setDictionary(JSON.parse(storedDictionary));
    } else {
      const fetchDictionary = async () => {
        try {
          const response = await getDictionary({});
          setDictionary(response.dictionary);
          localStorage.setItem('dictionary', JSON.stringify(response.dictionary));
        } catch (error) {
          console.error(error);
        }
      };
      fetchDictionary();
    }
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
          type='number'
        />

        <InputField
          label='SALES'
          name='salePercentage'
          value={product.product?.salePercentage}
          onChange={handleInputChange}
          type='number'
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
                {gender.name?.replace('GENDER_ENUM_', '')}
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

        <MediaSelector
          product={product}
          setProduct={setProduct}
          handleInputChange={handleInputChange}
        />

        <Categories product={product} setProduct={setProduct} dictionary={dictionary} />

        <Sizes setProduct={setProduct} dictionary={dictionary} product={product} />

        <Tags setProduct={setProduct} product={product} />

        <button type='submit' className={styles.submit}>
          SUBMIT
        </button>
      </form>
    </Layout>
  );
};
