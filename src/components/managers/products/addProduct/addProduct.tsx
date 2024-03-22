import { addProduct, getDictionary } from 'api/admin';
import {
  AddProductRequest,
  common_Dictionary,
  common_ProductNew,
  googletype_Decimal,
} from 'api/proto-http/admin';
import { Layout } from 'components/login/layout';
import update from 'immutability-helper';
import React, { FC, useEffect, useState } from 'react';
import styles from 'styles/addProd.scss';
import { Categories } from './categories';
import { ColorHEX } from './colorHEX';
import { InputField } from './inputFields';
import { MediaSelector } from './mediaSelectorFolder/mediaSelector';
import { Thumbnail } from './mediaSelectorFolder/thumbnail';
import { Sizes } from './sizes';
import { Tags } from './tag';

interface ProductInsert {
  preorder: string | undefined;
  name: string | undefined;
  brand: string | undefined;
  sku: string | undefined;
  color: string | undefined;
  colorHex: string | undefined;
  countryOfOrigin: string | undefined;
  thumbnail: string | undefined;
  price: googletype_Decimal | undefined;
  salePercentage: googletype_Decimal | undefined;
  categoryId: number | undefined;
  description: string | undefined;
  targetGender: string | undefined;
}

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
    price: { value: '0' },
    salePercentage: { value: '0' },
    categoryId: 0,
    description: '',
    hidden: false,
    targetGender: 'GENDER_ENUM_UNKNOWN',
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
  const [dictionary, setDictionary] = useState<common_Dictionary>();
  const [isFormValid, setIsFormValid] = useState<boolean | undefined>(false);

  const handleInputChange = (
    e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>,
  ) => {
    handleChange(e, setProduct);
  };

  // TODO:
  const checkFormValidity = () => {
    if (!product || !product.product) {
      setIsFormValid(false);
      return;
    }

    const productData = product.product as ProductInsert;

    const nameFields: (keyof ProductInsert)[] = [
      'name',
      'countryOfOrigin',
      'brand',
      'price',
      'preorder',
      'sku',
      'color',
      'colorHex',
      'categoryId',
      'description',
      'salePercentage',
      'thumbnail',
      'targetGender',
    ];
    const isNameFieldsValid = nameFields.every(
      (field: keyof ProductInsert) => !!productData[field],
    );
    const isTagsValid = product.tags && product.tags.length > 0;

    const isMediaValid = product.media && product.media.length > 0;

    const isSizeMeasurementsValid = product.sizeMeasurements && product.sizeMeasurements.length > 0;
    const isValid = isNameFieldsValid && isTagsValid && isMediaValid && isSizeMeasurementsValid;

    setIsFormValid(isValid);
  };

  useEffect(() => {
    checkFormValidity();
  }, [product]);

  useEffect(() => {
    const storedDictionary = localStorage.getItem('dictionary');
    if (storedDictionary) {
      setDictionary(JSON.parse(storedDictionary));
    } else {
      const fetchDictionary = async () => {
        const response = await getDictionary({});
        setDictionary(response.dictionary);
        localStorage.setItem('dictionary', JSON.stringify(response.dictionary));
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
      setProduct(initialProductState);
    } catch (error) {
      setProduct(initialProductState);
    }
  };

  return (
    <Layout>
      <form onSubmit={handleSubmit} className={styles.form}>
        <InputField
          label='NAME'
          name='name'
          value={product?.product?.name || ''}
          onChange={handleInputChange}
        />

        <InputField
          label='COUNTRY'
          name='countryOfOrigin'
          value={product?.product?.countryOfOrigin || ''}
          onChange={handleInputChange}
        />

        <InputField
          label='BRAND'
          name='brand'
          value={product?.product?.brand || ''}
          onChange={handleInputChange}
        />

        <InputField
          label='PRICE'
          name='price'
          value={product?.product?.price || ''}
          onChange={handleInputChange}
          type='number'
        />

        <InputField
          label='SALES'
          name='salePercentage'
          value={product?.product?.salePercentage || ''}
          onChange={handleInputChange}
          type='number'
        />

        <InputField
          label='PREORDER'
          name='preorder'
          value={product?.product?.preorder || ''}
          onChange={handleInputChange}
        />

        <div className={styles?.product_container}>
          <label htmlFor='gender' className={styles.title}>
            GENDER
          </label>
          <select
            name='targetGender'
            id='gender'
            value={product?.product?.targetGender || ''}
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
            value={product?.product?.description || ''}
            cols={1}
            rows={2}
            style={{ width: '150px' }}
            onChange={handleInputChange}
          ></textarea>
        </div>

        <InputField
          label='VENDORE CODE'
          name='sku'
          value={product?.product?.sku || ''}
          onChange={handleInputChange}
        />

        <InputField
          label='COLOR'
          name='color'
          value={product?.product?.color || ''}
          onChange={handleInputChange}
        />

        <ColorHEX product={product} setProduct={setProduct} />

        <Thumbnail product={product} setProduct={setProduct} />

        <MediaSelector product={product} setProduct={setProduct} />

        <Categories product={product} setProduct={setProduct} dictionary={dictionary} />

        <Sizes setProduct={setProduct} dictionary={dictionary} product={product} />

        <Tags setProduct={setProduct} product={product} />

        <button
          type='submit'
          className={`${isFormValid ? styles.submit : styles.disabled}`}
          disabled={!isFormValid}
        >
          SUBMIT
        </button>
      </form>
    </Layout>
  );
};
