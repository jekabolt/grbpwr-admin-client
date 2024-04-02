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
import { SingleMediaViewAndSelect } from 'components/common/singleMediaViewAndSelect';
import { Layout } from 'components/login/layout';
import { findInDictionary } from 'components/managers/orders/utility';
import { MediaSelectorLayout } from 'features/mediaSelector/mediaSelectorLayout';
import update from 'immutability-helper';
import React, { FC, useEffect, useState } from 'react';
import styles from 'styles/addProd.scss';
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
  const [imagePreviewUrl, setImagePreviewUrl] = useState('');

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

  const uploadThumbnailInProduct = (newSelectedMedia: string[]) => {
    if (!product.product || !newSelectedMedia.length) {
      return;
    }

    const thumbnailUrl = newSelectedMedia[0];
    setImagePreviewUrl(thumbnailUrl);

    setProduct((prevProduct) => {
      return update(prevProduct, {
        product: {
          thumbnail: { $set: thumbnailUrl },
        },
      });
    });
  };

  const uploadMediasInProduct = (newSelectedMedia: string[]) => {
    if (newSelectedMedia.length === 0) {
      alert('no selected media');
    }

    for (const imageUrl of newSelectedMedia) {
      const compressed = imageUrl.replace(/-og\.jpg$/, '-compressed.jpg');
    }

    const newMedia = newSelectedMedia.map((imageUrl) => {
      const compressed = imageUrl.replace(/-og\.jpg$/, '-compressed.jpg');
      const thumbnail = imageUrl.replace(/-og\.jpg$/, '-thumbnail.jpg');

      return {
        fullSize: imageUrl,
        thumbnail: thumbnail,
        compressed: compressed,
      };
    });

    setProduct((prevProduct) => ({
      ...prevProduct,
      media: [...(prevProduct.media || []), ...newMedia],
    }));
  };

  return (
    <Layout>
      <Grid container justifyContent='center'>
        <Grid item>
          <form onSubmit={handleSubmit} className={styles.form}>
            <Grid container direction='column' alignItems='center' spacing={2}>
              <Grid item>
                <TextField
                  variant='outlined'
                  label='NAME'
                  name='name'
                  value={product.product?.name || ''}
                  onChange={handleInputChange}
                  required
                  InputLabelProps={{ shrink: true }}
                />
              </Grid>

              <Grid item>
                <TextField
                  variant='outlined'
                  label='COUNTRY'
                  name='countryOfOrigin'
                  value={product?.product?.countryOfOrigin || ''}
                  onChange={handleInputChange}
                  required
                  InputLabelProps={{ shrink: true }}
                />
              </Grid>

              <Grid item>
                <TextField
                  variant='outlined'
                  label='BRAND'
                  name='brand'
                  value={product?.product?.brand || ''}
                  onChange={handleInputChange}
                  required
                  InputLabelProps={{ shrink: true }}
                />
              </Grid>

              <Grid item>
                <TextField
                  variant='outlined'
                  label='PRICE'
                  name='price'
                  value={product?.product?.price?.value || ''}
                  onChange={handleInputChange}
                  type='number'
                  inputProps={{ min: 0 }}
                  required
                  InputLabelProps={{ shrink: true }}
                />
              </Grid>

              <Grid item>
                <TextField
                  label='SALES'
                  name='salePercentage'
                  value={product?.product?.salePercentage?.value || ''}
                  onChange={handleInputChange}
                  type='number'
                  inputProps={{ min: 0 }}
                  required
                  InputLabelProps={{ shrink: true }}
                />
              </Grid>

              <Grid item>
                <TextField
                  label='PREORDER'
                  name='preorder'
                  value={product?.product?.preorder || ''}
                  onChange={handleInputChange}
                  required
                  InputLabelProps={{ shrink: true }}
                />
              </Grid>

              <Grid item>
                <FormControl sx={{ width: 193 }} required>
                  <InputLabel shrink>GENDER</InputLabel>
                  <Select
                    value={product.product?.targetGender}
                    onChange={handleInputChange}
                    autoWidth
                    label='GENDER'
                    displayEmpty
                    name='targetGender'
                  >
                    {dictionary?.genders?.map((gender) => (
                      <MenuItem key={gender.id} value={gender.id}>
                        {gender.name?.replace('GENDER_ENUM_', '').toUpperCase()}
                      </MenuItem>
                    ))}
                  </Select>
                </FormControl>
              </Grid>

              <Grid item>
                <TextField
                  label='DESCRIPTION'
                  name='description'
                  value={product.product?.description}
                  InputLabelProps={{ shrink: true }}
                  onChange={handleInputChange}
                  multiline
                  required
                />
              </Grid>

              <Grid item>
                <TextField
                  label='VENDORE CODE'
                  name='sku'
                  value={product?.product?.sku || ''}
                  onChange={handleInputChange}
                  InputLabelProps={{ shrink: true }}
                  required
                />
              </Grid>

              <Grid item>
                <TextField
                  label='COLOR'
                  name='color'
                  value={product?.product?.color || ''}
                  onChange={handleInputChange}
                  InputLabelProps={{ shrink: true }}
                  required
                />
              </Grid>

              <Grid item>
                <TextField
                  type='color'
                  label='COLOR HEX'
                  name='colorHex'
                  value={product.product?.colorHex}
                  onChange={handleInputChange}
                  InputLabelProps={{ shrink: true }}
                  sx={{ width: 193 }}
                  required
                />
              </Grid>

              <Grid item>
                <FormControl required sx={{ width: 193 }}>
                  <InputLabel shrink>CATEGORY</InputLabel>
                  <Select
                    name='categoryId'
                    value={product.product?.categoryId?.toString() || ''}
                    onChange={handleInputChange}
                    label='CATEGORY'
                    displayEmpty
                  >
                    {dictionary?.categories?.map((category) => (
                      <MenuItem value={category.id} key={category.id}>
                        {findInDictionary(dictionary, category.id, 'category')}
                      </MenuItem>
                    ))}
                  </Select>
                </FormControl>
              </Grid>

              <Grid item>
                <SingleMediaViewAndSelect
                  link={imagePreviewUrl}
                  saveSelectedMedia={uploadThumbnailInProduct}
                />
              </Grid>

              <Grid item>
                <MediaSelectorLayout
                  allowMultiple={true}
                  saveSelectedMedia={uploadMediasInProduct}
                  label='media selector'
                />
              </Grid>

              <Grid item>
                <Tags setProduct={setProduct} product={product} />
              </Grid>

              <Sizes setProduct={setProduct} dictionary={dictionary} product={product} />

              <Grid item>
                <Button type='submit' variant='contained' size='large'>
                  submit
                </Button>
              </Grid>
            </Grid>
          </form>
        </Grid>
      </Grid>
    </Layout>
  );
};
