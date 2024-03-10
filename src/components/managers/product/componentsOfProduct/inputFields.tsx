import React, { FC } from 'react';
import { googletype_Decimal } from 'api/proto-http/admin';
import styles from 'styles/addProd.scss';

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
    <div className={styles.product_container}>
      <label htmlFor={name} className={styles.title}>
        {label}
      </label>
      <input
        type={type}
        name={name}
        value={displayValue}
        onChange={handleInputChange}
        id={name}
        className={styles.product_input}
        onKeyDown={(e) => {
          if (e.key === '-' || e.key === 'e') {
            e.preventDefault();
          }
        }}
        required
      />
    </div>
  );
};
