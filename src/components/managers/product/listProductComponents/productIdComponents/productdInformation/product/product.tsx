import { Grid } from '@mui/material';
// import { updateDescription, updateName } from 'api/byID';
import { FC, useState } from 'react';
import { ProductIdProps } from '../../utility/interfaces';
import { getInitialFormData } from '../utility/initialProductForm';
import { useProductForm } from '../utility/useProductForm';
import { ProductForm } from './productForm';

export const Product: FC<ProductIdProps> = ({ product, setProduct, id, fetchProduct }) => {
  const [btnClick, setBtnClick] = useState('edit');
  const { inputValues, handleInputChange } = useProductForm(getInitialFormData(product));

  const fields = [
    { type: 'name', initialValue: product?.product?.productInsert?.name },
    { type: 'description', initialValue: product?.product?.productInsert?.description },
  ];

  const handleUpdateProduct = async () => {
    const updatedFields = [];

    // if (inputValues.name !== product?.product?.productInsert?.name) {
    //   updatedFields.push(updateName({ productId: Number(id), name: inputValues.name }));
    // }

    // if (inputValues.description !== product?.product?.productInsert?.description) {
    //   updatedFields.push(
    //     updateDescription({ productId: Number(id), description: inputValues.description }),
    //   );
    // }

    // await Promise.all(updatedFields);
    fetchProduct();
    setBtnClick('edit');
  };

  return (
    <Grid container direction='column' style={{ border: '1px solid black', width: '100%' }}>
      {fields.map((field) => (
        <ProductForm
          key={field.type}
          type={field.type}
          inputValues={inputValues}
          handleInputChange={handleInputChange}
          btnClick={btnClick}
          setBtnClick={setBtnClick}
          handleUpdateProduct={handleUpdateProduct}
          initialValue={field.initialValue}
        />
      ))}
    </Grid>
  );
};
