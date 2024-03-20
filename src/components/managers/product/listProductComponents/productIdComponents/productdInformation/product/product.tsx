import { Grid } from '@mui/material';
import { updateProductById } from 'api/byID';
import { FC } from 'react';
import { ProductIdProps } from '../../utility/interfaces';
import { getInitialFormData } from '../utility/initialProductForm';
import { useProductForm } from '../utility/useProductForm';
import { ProductForm } from './productForm';

type ProductKey =
  | 'preorder'
  | 'name'
  | 'brand'
  | 'sku'
  | 'color'
  | 'colorHex'
  | 'countryOfOrigin'
  | 'targetGender'
  | 'description'
  | 'sale';

export const Product: FC<ProductIdProps> = ({ product, id, fetchProduct }) => {
  const { inputValues, handleInputChange } = useProductForm(getInitialFormData(product));

  const fields: { type: ProductKey; initialValue: any }[] = [
    { type: 'name', initialValue: product?.product?.productInsert?.name },
    { type: 'description', initialValue: product?.product?.productInsert?.description },
    { type: 'sale', initialValue: product?.product?.productInsert?.salePercentage?.value },
  ];

  const handleUpdateProduct = async () => {
    const baseProductInsert = product?.product?.productInsert;
    if (baseProductInsert) {
      const updateProductInsert = {
        ...baseProductInsert,
        name: inputValues.name,
        salePercentage: {
          ...baseProductInsert.salePercentage,
          value: inputValues.salePercentage,
        },
      };
      await updateProductById({
        id: Number(id),
        product: updateProductInsert,
      });
    }
  };

  return (
    <Grid container direction='column' style={{ border: '1px solid black', width: '100%' }}>
      {fields.map((field) => (
        <ProductForm
          key={field.type}
          type={field.type}
          inputValues={inputValues}
          handleInputChange={handleInputChange}
          handleUpdateProduct={handleUpdateProduct}
          initialValue={field.initialValue}
        />
      ))}
    </Grid>
  );
};
