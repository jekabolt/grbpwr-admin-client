import { Button, Grid, SelectChangeEvent } from '@mui/material';
import { addProduct, getDictionary } from 'api/admin';
import { AddProductRequest, common_Dictionary, common_ProductNew } from 'api/proto-http/admin';
import { Layout } from 'components/login/layout';
import update from 'immutability-helper';
import React, { FC, useEffect, useState } from 'react';
import { CommonProductInsert } from './commonProductInsert/commonProductInsert';
import { Media } from './media/media';
import { Sizes } from './sizes/sizes';

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

export const AddProducts: FC = () => {
  const [product, setProduct] = useState<common_ProductNew>({
    ...initialProductState,
  });
  const [dictionary, setDictionary] = useState<common_Dictionary>();

  const handleChange = (
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

  return (
    <Layout>
      <form onSubmit={handleSubmit}>
        <Grid container justifyContent='center' style={{ width: '90%', margin: '3%' }} spacing={2}>
          <Grid item xs={7}>
            <Media product={product} setProduct={setProduct} />
          </Grid>
          <Grid item xs={4}>
            <CommonProductInsert
              product={product}
              setProduct={setProduct}
              dictionary={dictionary}
              handleInputChange={handleInputChange}
            />
          </Grid>
          <Grid item xs={11}>
            <Sizes setProduct={setProduct} dictionary={dictionary} />
          </Grid>
          <Grid item>
            <Button type='submit' variant='contained' size='large'>
              submit
            </Button>
          </Grid>
        </Grid>
      </form>
    </Layout>
  );
};
