import React, { FC, useState } from 'react';
import {
  common_ProductSizeInsert,
  googletype_Decimal,
  common_ProductNew,
  common_Dictionary,
} from 'api/proto-http/admin';
import styles from 'styles/sizesMeasurement.scss';
import { findInDictionary } from 'components/managers/orders/utility';

interface sizeProps {
  setProduct: React.Dispatch<React.SetStateAction<common_ProductNew>>;
  dictionary: common_Dictionary | undefined;
}

interface SelectedMeasurements {
  [sizeIndex: number]: number | undefined;
}

const pattern: { [key: string]: RegExp } = {
  size: /SIZE_ENUM_/,
  measurement: /MEASUREMENT_NAME_ENUM_/,
};

export const Sizes: FC<sizeProps> = ({ setProduct, dictionary }) => {
  const [selectedMeasurements, setSelectedMeasurements] = useState<SelectedMeasurements>({});
  const [numSizes, setNumSizes] = useState(0);

  const handleMeasurementSelection = (sizeIndex: number | undefined, measurementId: number) => {
    if (typeof sizeIndex === 'undefined') {
      return;
    }
    setSelectedMeasurements((prev) => ({ ...prev, [sizeIndex]: measurementId }));
  };
  const handleMeasurementValueChange = (
    sizeIndex: number | undefined,
    measurementId: number | undefined,
    value: number,
  ) => {
    if (typeof sizeIndex === 'undefined') {
      return;
    }
    setProduct((prevProduct) => {
      const updatedProduct = JSON.parse(JSON.stringify(prevProduct));

      if (!updatedProduct.sizeMeasurements) {
        updatedProduct.sizeMeasurements = [];
      }

      if (!updatedProduct.sizeMeasurements[sizeIndex]) {
        updatedProduct.sizeMeasurements[sizeIndex] = {
          productSize: { sizeId: sizeIndex },
          measurements: [],
        };
      }

      const measurementIndex = updatedProduct.sizeMeasurements[sizeIndex].measurements.findIndex(
        (m: { measurementNameId: number }) => m.measurementNameId === measurementId,
      );
      if (measurementIndex === -1) {
        updatedProduct.sizeMeasurements[sizeIndex].measurements.push({
          measurementNameId: measurementId,
          measurementValue: { value },
        });
      } else {
        updatedProduct.sizeMeasurements[sizeIndex].measurements[measurementIndex].measurementValue =
          { value };
      }

      return updatedProduct;
    });
  };

  const handleSizeChange = (
    e: React.ChangeEvent<HTMLInputElement>,
    sizeIndex: number | undefined,
  ) => {
    if (typeof sizeIndex === 'undefined') {
      return;
    }

    const { value } = e.target;
    setNumSizes(parseInt(value) || 0);
    setProduct((prevProduct) => {
      const updatedSizeMeasurements = [...(prevProduct.sizeMeasurements || [])];
      const sizeQuantity: googletype_Decimal = { value: value };

      if (!updatedSizeMeasurements[sizeIndex]) {
        const sizeId = sizeIndex;
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

  return (
    <div className={styles.size_measurement_container}>
      <label className={styles.size_measurement_container_title}>Sizes</label>
      <ul className={styles.size_measurement_list}>
        {dictionary?.sizes?.map((size) => (
          <li key={size.id}>
            <div className={styles.size_selector}>
              <p className={styles.size_name}>
                {findInDictionary(dictionary, size.id, 'size', pattern)}
              </p>
              <input
                type='number'
                id={size.name}
                name='quantity'
                onChange={(e) => handleSizeChange(e, size.id)}
                className={styles.size_input}
                placeholder='quantity'
              />
            </div>
            {numSizes > 0 && (
              <div className={styles.measurement_selector}>
                <select
                  className={styles.measurementSelect}
                  onChange={(e) =>
                    handleMeasurementSelection(size.id, parseInt(e.target.value, 10))
                  }
                >
                  <option value=''>measurements</option>
                  {dictionary.measurements?.map((measurement) => (
                    <option key={measurement.id} value={measurement.id}>
                      {findInDictionary(dictionary, measurement.id, 'measurement', pattern)}
                    </option>
                  ))}
                </select>
                {selectedMeasurements[size.id as number] && (
                  <input
                    type='number'
                    className={styles.measurementInput}
                    placeholder='quantity'
                    onChange={(e) =>
                      handleMeasurementValueChange(
                        size.id,
                        selectedMeasurements[size.id as number],
                        parseInt(e.target.value, 10),
                      )
                    }
                  />
                )}
              </div>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
};
