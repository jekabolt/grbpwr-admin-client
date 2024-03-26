import { common_Category, common_Dictionary, common_ProductNew } from 'api/proto-http/admin';
import update from 'immutability-helper';
import React, { FC, useState } from 'react';
import styles from 'styles/addProd.scss';

interface categoriesProps {
  product: common_ProductNew;
  setProduct: React.Dispatch<React.SetStateAction<common_ProductNew>>;
  dictionary: common_Dictionary | undefined;
}

export const Categories: FC<categoriesProps> = ({ product, setProduct, dictionary }) => {
  const [categoriesEnum, setCategoriesEnum] = useState<common_Category[] | undefined>();

  const handleCategorySelectChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const selectedCategoryId = parseInt(e.target.value, 10);
    setProduct((prevProduct) => {
      return update(prevProduct, {
        product: {
          categoryId: { $set: selectedCategoryId },
        },
      });
    });
  };

  return (
    <div className={styles.product_container}>
      <label htmlFor='category' className={styles.title}>
        Categories
      </label>
      <select
        name='categoryId'
        value={product.product?.categoryId}
        id=''
        onChange={handleCategorySelectChange}
        className={styles.product_input}
      >
        <option value=''>Select category</option>
        {dictionary?.categories?.map((category) => (
          <option value={category.id} key={category.id}>
            {category.name?.replace('CATEGORY_ENUM_', '')}
          </option>
        ))}
      </select>
    </div>
  );
};
