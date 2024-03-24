import { Checkbox, FormControlLabel, Grid, TextField, Typography } from '@mui/material';
import { common_Dictionary } from 'api/proto-http/admin';
import { findInDictionary } from 'components/managers/orders/utility';
import React, { FC } from 'react';

interface ProductFormProps {
  title: string;
  name: string;
  isEdit: boolean;
  value: string | undefined;
  checked?: boolean | undefined;
  onChange: (
    event: React.ChangeEvent<
      HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement | HTMLInputElement
    >,
  ) => void;
  currentInfo: string | undefined;
  dictionary?: common_Dictionary;
}

export const ProductForm: FC<ProductFormProps> = ({
  title,
  isEdit,
  value,
  onChange,
  currentInfo,
  name,
  dictionary,
}) => {
  return (
    <Grid container spacing={2} alignItems='flex-start'>
      <Grid item xs={4}>
        <Typography variant='h4'>{title}</Typography>
      </Grid>
      <Grid item xs={4}>
        {!isEdit ? (
          title === 'description' ? (
            <textarea
              disabled
              cols={20}
              rows={5}
              value={currentInfo ? String(currentInfo) : ''}
            ></textarea>
          ) : (
            <Typography variant='h4'>{currentInfo}</Typography>
          )
        ) : name === 'colorHex' ? (
          <TextField
            type='color'
            name={name}
            value={value || ''}
            onChange={onChange}
            size='small'
            fullWidth
          />
        ) : name === 'categoryId' ? (
          <select onChange={onChange} name={name} value={String(value || '')} id=''>
            <option value=''>Select category</option>
            {dictionary?.categories?.map((category) => (
              <option value={category.id} key={category.id}>
                {findInDictionary(dictionary, category.id, 'category')}
              </option>
            ))}
          </select>
        ) : name === 'targetGender' ? (
          <select name={name} value={String(value || '')} onChange={onChange} id=''>
            <option value=''>select gender</option>
            {dictionary?.genders?.map((gender) => (
              <option key={gender.id} value={gender.id}>
                {gender.name?.replace('GENDER_ENUM_', '')}
              </option>
            ))}
          </select>
        ) : name === 'hidden' ? (
          <FormControlLabel
            control={
              <Checkbox
                checked={Boolean(!value)}
                onChange={onChange}
                name={name}
                value={value || ''}
              />
            }
            label='Hidden'
          />
        ) : (
          <TextField
            type='text'
            name={name}
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
