import { Button, Grid, TextField, Typography } from '@mui/material';
import { FC } from 'react';

interface ProductFormdProps {
  type: string;
  inputValues: { [key: string]: any };
  handleInputChange: (event: React.ChangeEvent<HTMLInputElement>) => void;
  btnClick: string;
  setBtnClick: (value: string) => void;
  handleUpdateProduct: () => void;
  initialValue: string | undefined;
}

export const ProductForm: FC<ProductFormdProps> = ({
  type,
  inputValues,
  handleInputChange,
  btnClick,
  setBtnClick,
  handleUpdateProduct,
  initialValue,
}) => {
  return (
    <Grid item style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
      <Typography variant='h4'>{type}</Typography>
      {btnClick === 'edit' ? (
        <Typography variant='h4'>{initialValue}</Typography>
      ) : (
        <TextField
          size='small'
          variant='outlined'
          name={type}
          value={inputValues[type] || ''}
          onChange={handleInputChange}
          placeholder={initialValue}
        />
      )}
      <Button
        onClick={btnClick === 'edit' ? () => setBtnClick('upload') : handleUpdateProduct}
        variant='contained'
        size='large'
        sx={{ backgroundColor: 'black' }}
      >
        {btnClick}
      </Button>
    </Grid>
  );
};
