import { Grid, TextField } from '@mui/material';
import { googletype_Decimal } from 'api/proto-http/admin';
import React from 'react';

interface InputFieldProps {
  label: string;
  name: string;
  value: string | number | googletype_Decimal | undefined;
  onChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  type?: 'text' | 'number';
}

export const InputField: React.FC<InputFieldProps> = ({
  label,
  name,
  value,
  onChange,
  type = 'text',
}) => {
  const displayValue =
    value !== undefined ? (typeof value === 'object' ? value.value?.toString() ?? '' : value) : '';

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (type === 'number') {
      const inputValue = parseFloat(e.target.value);
      if (inputValue < 0) {
        return;
      }
    }
    onChange(e);
  };

  return (
    <Grid container>
      <Grid item>
        <TextField
          variant='outlined'
          label={label}
          type={type}
          name={name}
          value={displayValue}
          onChange={handleInputChange}
          id={name}
          onKeyDown={(e) => {
            if (e.key === '-') {
              e.preventDefault();
            }
          }}
          required
          InputLabelProps={{ shrink: true }}
        />
      </Grid>
    </Grid>
  );
};
