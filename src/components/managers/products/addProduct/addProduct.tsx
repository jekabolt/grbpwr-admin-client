import {
  Button,
  FormControl,
  Grid,
  InputLabel,
  MenuItem,
  Select,
  SelectChangeEvent,
  TextField,
} from '@mui/material';
import { addProduct, getDictionary } from 'api/admin';
import { AddProductRequest, common_Dictionary, common_ProductNew } from 'api/proto-http/admin';
import { Layout } from 'components/login/layout';
import { findInDictionary } from 'components/managers/orders/utility';
import { MediaSelectorLayout } from 'features/mediaSelector/mediaSelectorLayout';
import update from 'immutability-helper';
import React, { FC, useEffect, useState } from 'react';
import styles from 'styles/addProd.scss';
import { InputField } from './inputFields';
import { MediaSelector } from './mediaSelectorFolder/mediaSelector';
import { Sizes } from './sizes';
import { Tags } from './tag';

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
  e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement> | SelectChangeEvent,
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

  const handleInputChange = (
    e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement> | SelectChangeEvent,
  ) => {
    handleChange(e, setProduct);
  };

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

      await addProduct(productToDisplayInJSON);
      setProduct(initialProductState);
    } catch (error) {
      setProduct(initialProductState);
    }
  };

  const handleImage = (newSelectedMedia: string[]) => {
    if (!product.product || !newSelectedMedia.length) {
      return;
    }

    const thumbnailUrl = newSelectedMedia[0];

    setProduct((prevProduct) => {
      return update(prevProduct, {
        product: {
          thumbnail: { $set: thumbnailUrl },
        },
      });
    });
  };

  return (
    <Layout>
      <Grid container justifyContent='center'>
        <Grid item>
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

            <FormControl required>
              <InputLabel shrink>GENDER</InputLabel>
              <Select
                name='targetGender'
                value={product?.product?.targetGender || ''}
                onChange={handleInputChange}
                displayEmpty
                label='GENDER'
              >
                {dictionary?.genders?.map((gender) => (
                  <MenuItem key={gender.id} value={gender.id?.toString()}>
                    {gender.name?.replace('GENDER_ENUM_', '').toUpperCase()}
                  </MenuItem>
                ))}
              </Select>
            </FormControl>

            <TextField
              label='DESCRIPTION'
              name='description'
              value={product.product?.description}
              InputLabelProps={{ shrink: true }}
              onChange={handleInputChange}
              multiline
            />

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

            <TextField
              type='color'
              label='COLOR HEX'
              name='colorHex'
              value={product.product?.colorHex}
              onChange={handleInputChange}
              InputLabelProps={{ shrink: true }}
            />

            <FormControl required>
              <InputLabel shrink>CATEGORY</InputLabel>
              <Select
                name='categoryId'
                value={product.product?.categoryId?.toString() || ''}
                onChange={handleInputChange}
                label='CATEGORY'
                displayEmpty
              >
                <MenuItem value='' disabled>
                  select category
                </MenuItem>
                {dictionary?.categories?.map((category) => (
                  <MenuItem value={category.id} key={category.id}>
                    {findInDictionary(dictionary, category.id, 'category')}
                  </MenuItem>
                ))}
              </Select>
            </FormControl>

            {/* <Thumbnail product={product} setProduct={setProduct} /> */}

            <MediaSelectorLayout
              allowMultiple={false}
              label='select thumbnail'
              saveSelectedMedia={handleImage}
            />

            <MediaSelector product={product} setProduct={setProduct} />

            <Sizes setProduct={setProduct} dictionary={dictionary} product={product} />

            <Tags setProduct={setProduct} product={product} />

            <Button type='submit' variant='contained' size='large'>
              submit
            </Button>
          </form>
        </Grid>
      </Grid>
    </Layout>
  );
};
