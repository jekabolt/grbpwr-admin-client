import React, { FC, useState, useEffect } from 'react';
import { Layout } from 'components/layout/layout';
import { common_ProductFull, common_Size } from 'api/proto-http/admin';
import { getProductByID, getDictionary } from 'api/admin';
import { AddMediaByID } from './addMediaById';
import queryString from 'query-string';
import styles from 'styles/productID.scss';

export const ProductId: FC = () => {
  const queryParams = queryString.parse(window.location.search);
  const productId = queryParams.productId as string;
  const [product, setProuct] = useState<common_ProductFull | undefined>(undefined);
  const [sizeDictionary, setSizeDictionary] = useState<common_Size[]>([]);
  const [isHovered, setIsHovered] = useState<boolean>(false);

  const handleThumbnailHover = () => {
    setIsHovered(true);
  };

  const handleThumbnailLeave = () => {
    setIsHovered(false);
  };

  useEffect(() => {
    const fetchData = async () => {
      try {
        const response = await getProductByID({ id: Number(productId) });
        setProuct(response.product);
      } catch (error) {
        console.error('Error fetching product data:', error);
      }
    };

    fetchData();
  }, [productId]);

  useEffect(() => {
    const fetchSize = async () => {
      try {
        const response = await getDictionary({});
        setSizeDictionary(response.dictionary?.sizes || []);
      } catch (error) {
        console.error(error);
      }
    };
    fetchSize();
  }, []);

  const getSizeName = (sizeId: number | undefined): string => {
    const size = sizeDictionary.find((s) => s.id === sizeId);
    if (size && size.name) {
      return size.name.replace('SIZE_ENUM_', '');
    }
    return 'size not found';
  };

  return (
    <Layout>
      <div className={styles.product_id_full_content}>
        <div
          className={styles.img_grid}
          onMouseEnter={handleThumbnailHover}
          onMouseLeave={handleThumbnailLeave}
        >
          <div className={styles.main_img_container}>
            <img
              src={product?.product?.productInsert?.thumbnail}
              alt='thumbnail'
              className={styles.main_img}
            />
          </div>
          {isHovered && <AddMediaByID />}
          <ul className={styles.product_by_id_media_list}>
            {product?.media?.map((media, index) => (
              <li key={index}>
                <p>{index + 1}</p>
                <img src={media.productMediaInsert?.compressed} alt='' />
              </li>
            ))}
          </ul>
          {/* <AddMediaByID /> */}
        </div>
        <div className={styles.product_id_information}>
          <h3>{product?.product?.productInsert?.brand}</h3>
          <ul>
            {product?.sizes?.map((size, index) => (
              <li key={index}>{getSizeName(size.sizeId)}</li>
            ))}
          </ul>
        </div>
      </div>
    </Layout>
  );
};
