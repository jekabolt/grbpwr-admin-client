import React, { FC, useState } from 'react';
import { googletype_Decimal, common_ProductNew, common_Dictionary } from 'api/proto-http/admin';
import { findInDictionary } from 'components/managers/orders/utility';
import styles from 'styles/addProd.scss';

interface sizeProps {
  product: common_ProductNew;
  setProduct: React.Dispatch<React.SetStateAction<common_ProductNew>>;
  dictionary: common_Dictionary | undefined;
}

interface SelectedMeasurements {
  [sizeIndex: number]: number | undefined;
}

function sortItems(item: { id?: number }[]) {
  return [...(item || [])]
    .filter((item) => item !== undefined)
    .sort((a, b) => {
      if (a.id !== undefined && b.id !== undefined) {
        return a.id - b.id;
      }
      return 0;
    });
}

export const Sizes: FC<sizeProps> = ({ setProduct, dictionary, product }) => {
  const [selectedMeasurements, setSelectedMeasurements] = useState<SelectedMeasurements>({});
  const sortedSizes = dictionary && dictionary.sizes ? sortItems(dictionary.sizes) : [];
  const sortedMeasurements =
    dictionary && dictionary.measurements ? sortItems(dictionary.measurements) : [];

  const handleMeasurementSelection = (sizeIndex: number | undefined, measurementId: number) => {
    if (typeof sizeIndex === 'undefined') {
      return;
    }
    setSelectedMeasurements((prev) => ({ ...prev, [sizeIndex]: measurementId }));
  };

  const handleMeasurementValueChange = (
    sizeIndex: number | undefined,
    measurementId: number | undefined,
    value: string,
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
    setProduct((prevProduct) => {
      const updatedSizeMeasurements = [...(prevProduct.sizeMeasurements || [])];
      const sizeQuantity: googletype_Decimal = { value };

      updatedSizeMeasurements[sizeIndex] = {
        productSize: {
          quantity: sizeQuantity,
          sizeId: sizeIndex,
        },
        measurements: [],
      };

      return { ...prevProduct, sizeMeasurements: updatedSizeMeasurements };
    });
  };

  return (
    <div className={styles.product_container}>
      <label className={styles.title}>Sizes</label>
      <ul className={styles.product_container_size_list}>
        {sortedSizes.map((size) => (
          <li key={size.id} className={styles.product_container_size_item}>
            {size.id !== undefined && (
              <>
                <div className={styles.define_size_quantity_container}>
                  <h3>{findInDictionary(dictionary, size.id, 'size')}</h3>
                  <input
                    type='number'
                    name='quantity'
                    onChange={(e) => handleSizeChange(e, size.id)}
                  />
                </div>
                {product.sizeMeasurements &&
                  product.sizeMeasurements[size.id] &&
                  product.sizeMeasurements[size.id].productSize?.quantity?.value &&
                  parseInt(
                    product?.sizeMeasurements[size.id]?.productSize?.quantity?.value || '0',
                    10,
                  ) > 0 && (
                    <div className={styles.define_measurement_container}>
                      <select
                        onChange={(e) =>
                          handleMeasurementSelection(size.id, parseInt(e.target.value, 10))
                        }
                      >
                        <option value=''>measurements</option>
                        {sortedMeasurements.map((measurement) => (
                          <option key={measurement.id} value={measurement.id}>
                            {findInDictionary(dictionary, measurement.id, 'measurement')}
                          </option>
                        ))}
                      </select>
                      {selectedMeasurements[size.id as number] && (
                        <input
                          type='number'
                          className={styles.measurementInput}
                          onChange={(e) =>
                            handleMeasurementValueChange(
                              size.id,
                              selectedMeasurements[size.id as number],
                              e.target.value,
                            )
                          }
                        />
                      )}
                    </div>
                  )}
              </>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
};
