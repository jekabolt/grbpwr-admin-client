import React, { FC, useState, useEffect } from 'react';
import { Layout } from 'components/layout/layout';
import { common_ProductFull, common_Size } from 'api/proto-http/admin';
import { getProductByID, getDictionary } from 'api/admin';
import { AddMediaByID } from './addMediaById';
import { updateName, updateSku, updatePreorder, updateColors } from 'api/byID';
import queryString from 'query-string';
import styles from 'styles/productID.scss';

export const ProductId: FC = () => {
  const queryParams = queryString.parse(window.location.search);
  const productId = queryParams.productId as string;
  const [product, setProuct] = useState<common_ProductFull | undefined>(undefined);
  const [sizeDictionary, setSizeDictionary] = useState<common_Size[]>([]);
  const [productFields, setProductFields] = useState({
    newProductName: '',
    newSku: '',
    newPreorder: '',
    newColor: '',
    newColorHEX: '',
  });

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    setProductFields((prevState) => ({
      ...prevState,
      [name]: value,
    }));
  };

  const updateProductDetails = async () => {
    if (!product || !product.product?.id) {
      console.error('Product ID is not available');
      return;
    }

    try {
      const { newProductName, newSku, newPreorder, newColor, newColorHEX } = productFields;

      if (newProductName !== '') {
        await updateName({ productId: product.product.id, name: newProductName });
      }

      if (newSku !== '') {
        await updateSku({ productId: product.product.id, sku: newSku });
      }

      if (newPreorder !== '') {
        await updatePreorder({ productId: product.product.id, preorder: newPreorder });
      }

      if (newColor !== '') {
        await updateColors({
          productId: product.product.id,
          color: newColor,
          colorHex: newColorHEX,
        });
      }

      updateLocalProductDetails(
        newProductName !== '' ? newProductName : null,
        newSku !== '' ? newSku : null,
        newPreorder !== '' ? newPreorder : null,
        newColor !== '' ? newColor : null,
        newColorHEX !== '' ? newColorHEX : undefined,
      );
    } catch (error) {
      console.error('Error updating product', error);
    }
  };

  const updateLocalProductDetails = (
    newName: string | null,
    newSku: string | null,
    newPreorder: string | null,
    newColor: string | null,
    newColorHEX: string | undefined,
  ) => {
    setProuct((prevProduct) => {
      if (!prevProduct || !prevProduct.product || !prevProduct.product.productInsert) {
        return prevProduct;
      }
      // TODO: spreading ?
      const updatedProduct: common_ProductFull = {
        ...prevProduct,
        product: {
          ...prevProduct.product,
          productInsert: {
            ...prevProduct.product.productInsert,
            name: newName || prevProduct.product.productInsert.name,
            sku: newSku || prevProduct.product.productInsert.sku,
            preorder: newPreorder || prevProduct.product.productInsert.preorder,
            color: newColor || prevProduct.product.productInsert.color,
            colorHex: newColorHEX || prevProduct.product.productInsert.colorHex,
          },
        },
      };
      return updatedProduct;
    });
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
        <div className={styles.img_grid}>
          <div className={styles.main_img_container}>
            <img
              src={product?.product?.productInsert?.thumbnail}
              alt='thumbnail'
              className={styles.main_img}
            />
          </div>
          <ul className={styles.product_by_id_media_list}>
            {product?.media?.map((media, index) => (
              <li key={index}>
                <p>{index + 1}</p>
                <img src={media.productMediaInsert?.compressed} alt='' />
              </li>
            ))}
          </ul>
        </div>
        <div className={styles.product_id_information}>
          <h3>{product?.product?.productInsert?.name}</h3>
          <input
            type='text'
            name='newProductName'
            value={productFields.newProductName}
            onChange={handleChange}
          />
          <button onClick={() => updateProductDetails()}>+</button>
          <br />

          <h3>{product?.product?.productInsert?.sku}</h3>
          <input type='text' name='newSku' value={productFields.newSku} onChange={handleChange} />
          <button onClick={updateProductDetails}>+</button>
          <br />
          <h3>{product?.product?.productInsert?.preorder}</h3>
          <input
            type='text'
            name='newPreorder'
            value={productFields.newPreorder}
            onChange={handleChange}
          />
          <button onClick={() => updateProductDetails()}>+</button>

          <h3>
            {product?.product?.productInsert?.color} - {product?.product?.productInsert?.colorHex}
          </h3>
          <input
            type='text'
            name='newColor'
            value={productFields.newColor}
            onChange={handleChange}
          />
          <input
            type='text'
            name='newColorHEX'
            value={productFields.newColorHEX}
            onChange={handleChange}
          />
          <button onClick={updateProductDetails}>+</button>

          <h3>{product?.product?.productInsert?.targetGender}</h3>
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
