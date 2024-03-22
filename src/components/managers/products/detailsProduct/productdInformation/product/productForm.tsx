import { Grid, TextField, Typography } from '@mui/material';
import React, { FC } from 'react';

interface ProductFormProps {
  title: string;
  isEdit: boolean;
  value: string | undefined;
  onChange: (
    event: React.ChangeEvent<HTMLTextAreaElement> | React.ChangeEvent<HTMLInputElement>,
  ) => void;
  currentInfo: string | undefined;
}

export const ProductForm: FC<ProductFormProps> = ({
  title,
  isEdit,
  value,
  onChange,
  currentInfo,
}) => {
  return (
    <Grid container spacing={2} alignItems='flex-start'>
      <Grid item xs={4}>
        <Typography variant='h4'>{title}</Typography>
      </Grid>
      <Grid item xs={8}>
        {!isEdit ? (
          title === 'description' ? (
            <textarea disabled cols={20} rows={5} value={currentInfo}></textarea>
          ) : (
            <Typography variant='h4'>{currentInfo}</Typography>
          )
        ) : (
          <TextField
            type='text'
            name={title}
            value={value || ''}
            onChange={onChange}
            size='small'
            multiline={title === 'description'}
            rows={title === 'description' ? 4 : 1}
            fullWidth
          />
        )}
      </Grid>
    </Grid>
  );
};
