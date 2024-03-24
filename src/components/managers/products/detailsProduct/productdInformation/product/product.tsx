import { Button, Grid } from '@mui/material';
import { updateProductById } from 'api/byID';
import { common_Dictionary, common_ProductInsert } from 'api/proto-http/admin';
import { findInDictionary } from 'components/managers/orders/utility';
import { FC, useEffect, useState } from 'react';
import { ProductIdProps } from '../../utility/interfaces';
import { useChangeProductDetails } from '../utility/changeProductDetails';
import { initialProductDetails } from '../utility/initialProductDetails';
import { ProductForm } from './productForm';

interface UpdatePayload extends Partial<common_ProductInsert> {
  [key: string]: any;
}

export const Product: FC<ProductIdProps> = ({ product, id, fetchProduct }) => {
  const { inputValues, handleInputChange, changedFields } = useChangeProductDetails(
    initialProductDetails(product),
  );

  const [isEdit, setIsEdit] = useState(false);
  const [dict, setDict] = useState<common_Dictionary>();

  useEffect(() => {
    const data = localStorage.getItem('dictionary');
    if (data) {
      setDict(JSON.parse(data));
    }
  }, []);
  const handleUpdateProduct = async () => {
    if (changedFields.size === 0) return;

    let updatePayload: UpdatePayload = {};

    changedFields.forEach((field) => {
      if (field in inputValues) {
        const value = inputValues[field];
        if (['price', 'salePercentage'].includes(field)) {
          updatePayload[field] = { value: value || '' };
        } else {
          updatePayload[field] = value;
        }
      }
    });

    const response = await updateProductById({
      id: Number(id),
      product: { ...product?.product?.productInsert, ...updatePayload } as common_ProductInsert,
    });
    if (response) {
      fetchProduct();
    }
  };

  return (
    <Grid
      container
      direction='column'
      spacing={1}
      style={{ border: '1px solid black', width: '100%' }}
    >
      <Grid item>
        <ProductForm
          isEdit={isEdit}
          title='name'
          name='name'
          value={inputValues.name?.toLocaleString() || ''}
          onChange={handleInputChange}
          currentInfo={product?.product?.productInsert?.name}
        />
      </Grid>
      <Grid item>
        <ProductForm
          isEdit={isEdit}
          title='description'
          name='description'
          value={inputValues.description?.toLocaleString() || ''}
          onChange={handleInputChange}
          currentInfo={product?.product?.productInsert?.description}
        />
      </Grid>
      <Grid item>
        <ProductForm
          isEdit={isEdit}
          name='countryOfOrigin'
          title='contry'
          value={inputValues.countryOfOrigin?.toLocaleString()}
          onChange={handleInputChange}
          currentInfo={product?.product?.productInsert?.countryOfOrigin}
        />
      </Grid>
      <Grid item>
        <ProductForm
          isEdit={isEdit}
          name='preorder'
          title='preorder'
          value={inputValues.preorder?.toLocaleString() || ''}
          onChange={handleInputChange}
          currentInfo={product?.product?.productInsert?.preorder}
        />
      </Grid>
      <Grid item>
        <ProductForm
          isEdit={isEdit}
          title='price'
          name='price'
          value={inputValues.price?.toLocaleString()}
          onChange={handleInputChange}
          currentInfo={product?.product?.productInsert?.price?.value}
        />
      </Grid>
      <Grid item>
        <ProductForm
          isEdit={isEdit}
          name='salePercentage'
          title='sale'
          value={inputValues.salePercentage?.toLocaleString()}
          onChange={handleInputChange}
          currentInfo={product?.product?.productInsert?.salePercentage?.value}
        />
      </Grid>
      <Grid item>
        <ProductForm
          isEdit={isEdit}
          name='brand'
          title='brand'
          value={inputValues.brand?.toLocaleString()}
          onChange={handleInputChange}
          currentInfo={product?.product?.productInsert?.brand}
        />
      </Grid>
      <Grid item>
        <ProductForm
          isEdit={isEdit}
          name='color'
          title='color'
          value={inputValues.color?.toLocaleString()}
          onChange={handleInputChange}
          currentInfo={product?.product?.productInsert?.color}
        />
      </Grid>
      <Grid item>
        <ProductForm
          isEdit={isEdit}
          name='colorHex'
          title='color hex'
          value={inputValues.colorHex?.toLocaleString()}
          onChange={handleInputChange}
          currentInfo={product?.product?.productInsert?.colorHex}
        />
      </Grid>
      <Grid item>
        <ProductForm
          isEdit={isEdit}
          name='categoryId'
          title='category'
          value={inputValues.categoryId?.toLocaleString()}
          onChange={handleInputChange}
          currentInfo={
            findInDictionary(dict, product?.product?.productInsert?.categoryId, 'category') || ''
          }
          dictionary={dict}
        />
      </Grid>
      <Grid item>
        <ProductForm
          isEdit={isEdit}
          name='targetGender'
          title='gender'
          value={inputValues.targetGender?.toLocaleString()}
          onChange={handleInputChange}
          currentInfo={product?.product?.productInsert?.targetGender?.replace('GENDER_ENUM_', '')}
          dictionary={dict}
        />
      </Grid>
      <Grid item>
        <ProductForm
          isEdit={isEdit}
          name='sku'
          title='vendore code'
          value={inputValues.sku?.toLocaleString()}
          onChange={handleInputChange}
          currentInfo={product?.product?.productInsert?.sku}
        />
      </Grid>
      <Grid item>
        <ProductForm
          isEdit={isEdit}
          name='hidden'
          title='hidden'
          value={Boolean(inputValues.hidden)}
          onChange={handleInputChange}
          currentInfo={product?.product?.productInsert?.hidden ? 'true' : 'false'}
        />
      </Grid>

      {!isEdit && (
        <Button onClick={() => setIsEdit(true)} size='medium' variant='contained'>
          Edit
        </Button>
      )}
      {isEdit && (
        <Button
          size='medium'
          variant='contained'
          onClick={() => {
            handleUpdateProduct();
            setIsEdit(false);
          }}
        >
          Update Product
        </Button>
      )}
    </Grid>
  );
};
