import React, { FC, useState, useEffect } from 'react';
import { common_Category, common_ProductNew } from 'api/proto-http/admin';
import update from 'immutability-helper';
import { getDictionary } from 'api/admin';
import styles from 'styles/addProd.scss';

interface categoriesProps {
  product: common_ProductNew;
  setProduct: React.Dispatch<React.SetStateAction<common_ProductNew>>;
}

export const Categories: FC<categoriesProps> = ({ product, setProduct }) => {
  const [categoriesEnum, setCategoriesEnum] = useState<common_Category[] | undefined>();

  const handleCategorySelectChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const selectedCategoryId = parseInt(e.target.value, 10); // Parse the selected value to a number
    setProduct((prevProduct) => {
      return update(prevProduct, {
        product: {
          categoryId: { $set: selectedCategoryId },
        },
      });
    });
  };

  useEffect(() => {
    const fetchDictionary = async () => {
      try {
        const response = await getDictionary({});
        const categories = response.dictionary?.categories;

        setCategoriesEnum(categories);
      } catch (error) {
        console.error(error);
      }
    };
    fetchDictionary();
  }, []);

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
        {categoriesEnum?.map((category, categoryIndex) => (
          <option value={categoryIndex + 1} key={categoryIndex}>
            {category.name}
          </option>
        ))}
      </select>
    </div>
  );
};
