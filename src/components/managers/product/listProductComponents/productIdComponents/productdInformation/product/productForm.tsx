import { Button, Grid, TextField, Typography } from '@mui/material';
import { FC, useState } from 'react';

interface ProductFormProps {
  type: string;
  inputValues: { [key: string]: any };
  handleInputChange: (event: React.ChangeEvent<HTMLInputElement>) => void;
  handleUpdateProduct: () => void;
  initialValue: string | undefined;
}

export const ProductForm: FC<ProductFormProps> = ({
  type,
  inputValues,
  handleInputChange,
  handleUpdateProduct,
  initialValue,
}) => {
  const [isEditing, setIsEditing] = useState(false);

  return (
    <Grid item style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
      <Typography variant='h4'>{type}</Typography>
      {!isEditing ? (
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
      {!isEditing && (
        <Button
          onClick={() => setIsEditing(true)}
          variant='contained'
          size='large'
          sx={{ backgroundColor: 'black' }}
        >
          Edit
        </Button>
      )}
      {isEditing && (
        <>
          <Button
            onClick={() => {
              handleUpdateProduct();
              setIsEditing(false);
            }}
            variant='contained'
            size='large'
            sx={{ backgroundColor: 'black' }}
          >
            update
          </Button>
        </>
      )}
    </Grid>
  );
};
