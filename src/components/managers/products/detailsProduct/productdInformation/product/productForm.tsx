import { Checkbox, FormControlLabel, Grid, TextField, Typography } from '@mui/material';
import { common_Dictionary } from 'api/proto-http/admin';
import { findInDictionary } from 'components/managers/orders/utility';
import React, { FC } from 'react';
import styles from 'styles/product-details.scss';

interface ProductFormProps {
  title: string;
  name: string;
  isEdit: boolean;
  value: string | boolean | undefined;
  onChange: (
    event: React.ChangeEvent<
      HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement | HTMLInputElement
    >,
  ) => void;
  currentInfo: string | undefined;
  dictionary?: common_Dictionary;
  type?: 'text' | 'number' | 'color';
}

export const ProductForm: FC<ProductFormProps> = ({
  title,
  isEdit,
  value,
  onChange,
  currentInfo,
  name,
  dictionary,
  type = 'text',
}) => {
  return (
    <Grid container spacing={3} alignItems='flex-start'>
      <Grid item xs={4}>
        <Typography variant='h4' className={styles.title}>
          {title}
        </Typography>
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
            <Typography variant='h4' className={styles.current_info}>
              {currentInfo}
            </Typography>
          )
        ) : name === 'colorHex' ? (
          <TextField
            type={type}
            name={name}
            value={value || ''}
            onChange={onChange}
            size='small'
            fullWidth
          />
        ) : name === 'categoryId' ? (
          <select onChange={onChange} name={name} value={String(value || '')} id=''>
            <option value=''>{currentInfo}</option>
            {dictionary?.categories?.map((category) => (
              <option value={category.id} key={category.id}>
                {findInDictionary(dictionary, category.id, 'category')}
              </option>
            ))}
          </select>
        ) : name === 'targetGender' ? (
          <select name={name} value={String(value || '')} onChange={onChange} id=''>
            <option value=''>{currentInfo}</option>
            {dictionary?.genders?.map((gender) => (
              <option key={gender.id} value={gender.id}>
                {gender.name?.replace('GENDER_ENUM_', '')}
              </option>
            ))}
          </select>
        ) : name === 'hidden' ? (
          <FormControlLabel
            control={<Checkbox checked={Boolean(value)} onChange={onChange} name={name} />}
            label='Hidden'
          />
        ) : (
          <TextField
            type={type}
            name={name}
            value={value || ''}
            onChange={onChange}
            size='small'
            multiline={title === 'description'}
            rows={title === 'description' ? 4 : 1}
            fullWidth
            placeholder={currentInfo}
            inputProps={{ min: 0 }}
          />
        )}
      </Grid>
    </Grid>
  );
};
