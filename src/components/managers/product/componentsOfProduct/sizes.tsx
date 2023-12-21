import React, { FC, useState, useEffect } from 'react';
import {
  common_Size,
  common_MeasurementName,
  common_ProductSizeInsert,
  googletype_Decimal,
  common_ProductNew,
} from 'api/proto-http/admin';
import { getDictionary } from 'api/admin';
import styles from 'styles/addProd.scss';

interface sizeProps {
  product: common_ProductNew;
  setProduct: React.Dispatch<React.SetStateAction<common_ProductNew>>;
}

export const Sizes: FC<sizeProps> = ({ product, setProduct }) => {
  const [sizeEnum, setSizeEnum] = useState<common_Size[] | undefined>();
  const [measurementEnum, setMeasurementEnum] = useState<common_MeasurementName[] | undefined>();

  const handleSizeChange = (e: React.ChangeEvent<HTMLInputElement>, sizeIndex: number) => {
    const { name, value } = e.target;

    setProduct((prevProduct) => {
      const updatedSizeMeasurements = [...(prevProduct.sizeMeasurements || [])];
      const sizeQuantity: googletype_Decimal = { value: value };

      if (!updatedSizeMeasurements[sizeIndex]) {
        const sizeId = sizeIndex + 1;

        const productSize: common_ProductSizeInsert = {
          quantity: sizeQuantity,
          sizeId: sizeId,
        };

        updatedSizeMeasurements[sizeIndex] = {
          productSize: productSize,
          measurements: [],
        };
      } else {
        updatedSizeMeasurements[sizeIndex] = {
          productSize: {
            quantity: sizeQuantity,
            sizeId: updatedSizeMeasurements[sizeIndex].productSize?.sizeId || sizeIndex,
          },
          measurements: [],
        };
      }

      return { ...prevProduct, sizeMeasurements: updatedSizeMeasurements };
    });
  };

  const handleMeasurementChange = (
    e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>,
    sizeIndex: number,
    measurementIndex: number,
  ) => {
    const { name, value } = e.target;

    setProduct((prevProduct) => {
      const updatedSizeMeasurements = [...(prevProduct.sizeMeasurements || [])];

      if (updatedSizeMeasurements[sizeIndex]) {
        const updatedMeasurements = [...(updatedSizeMeasurements[sizeIndex].measurements || [])];

        const measurementValue: googletype_Decimal = { value: value };

        updatedMeasurements[measurementIndex] = {
          measurementNameId: measurementIndex + 1, // You may adjust this index based on your requirements
          measurementValue: measurementValue,
        };

        updatedSizeMeasurements[sizeIndex] = {
          ...updatedSizeMeasurements[sizeIndex],
          measurements: updatedMeasurements,
        };

        return { ...prevProduct, sizeMeasurements: updatedSizeMeasurements };
      }

      return prevProduct;
    });
  };

  useEffect(() => {
    const fetchDictionary = async () => {
      try {
        const response = await getDictionary({});
        const sizes = response.dictionary?.sizes;
        const measurements = response.dictionary?.measurements;

        setSizeEnum(sizes);
        setMeasurementEnum(measurements);
      } catch (error) {
        console.error('Error fetching dictionary:', error);
      }
    };
    fetchDictionary();
  }, []);

  return (
    <div className={styles.product_container}>
      <label className={styles.title}>Sizes</label>
      <div>
        {sizeEnum?.map((size, sizeIndex) => (
          <div key={sizeIndex}>
            <label htmlFor={size.name}>{size.name}</label>
            <input
              type='number'
              id={size.name}
              name='quantity'
              onChange={(e) => handleSizeChange(e, sizeIndex)}
            />
            <div>
              {measurementEnum?.map((measurement, measurementIndex) => (
                <div key={measurementIndex}>
                  <label htmlFor={measurement.name}>{measurement.name}</label>
                  <input
                    type='text'
                    id={measurement.name}
                    name='measurementValue'
                    onChange={(e) => handleMeasurementChange(e, sizeIndex, measurementIndex)}
                  />
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};
