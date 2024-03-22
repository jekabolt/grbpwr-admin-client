import { Button, Grid } from '@mui/material';
import { updateProductById } from 'api/byID';
import { common_ProductInsert } from 'api/proto-http/admin';
import { FC, useState } from 'react';
import { ProductIdProps } from '../../utility/interfaces';
import { useChangeProductDetails } from '../utility/changeProductDetails';
import { initialProductDetails } from '../utility/initialProductDetails';
import { ProductForm } from './productForm';

export const Product: FC<ProductIdProps> = ({ product, id, fetchProduct }) => {
  const { inputValues, handleInputChange, changedFields, resetChangedFields } =
    useChangeProductDetails(initialProductDetails(product));

  const [isEdit, setIsEdit] = useState(false);

  const handleUpdateProduct = async () => {
    if (changedFields.size === 0) return;

    let updatePayload: Partial<common_ProductInsert> = {};

    if (changedFields.has('price')) {
      updatePayload.price = { value: inputValues['price'] || '' };
    }
    if (changedFields.has('name')) {
      updatePayload.name = inputValues['name'];
    }
    if (changedFields.has('description')) {
      updatePayload.description = inputValues['description'];
    }

    await updateProductById({
      id: Number(id),
      product: { ...product?.product?.productInsert, ...updatePayload } as common_ProductInsert,
    });

    fetchProduct();
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
          value={inputValues.name || ''}
          onChange={handleInputChange}
          currentInfo={product?.product?.productInsert?.name}
        />
      </Grid>
      <Grid item>
        <ProductForm
          isEdit={isEdit}
          title='price'
          value={inputValues.price}
          onChange={handleInputChange}
          currentInfo={product?.product?.productInsert?.price?.value}
        />
      </Grid>

      <Grid item>
        <ProductForm
          isEdit={isEdit}
          title='description'
          value={inputValues.description}
          onChange={handleInputChange}
          currentInfo={product?.product?.productInsert?.description}
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
