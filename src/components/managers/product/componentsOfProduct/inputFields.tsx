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
    typeof value === 'object' && value !== null && value !== undefined
      ? value.value?.toString() ?? ''
      : value;

  return (
    <div className={styles.product_container}>
      <label htmlFor={name} className={styles.title}>
        {label}
      </label>
      <input
        type={type}
        name={name}
        value={displayValue}
        onChange={onChange}
        id={name}
        className={styles.product_input}
      />
    </div>
  );
};
