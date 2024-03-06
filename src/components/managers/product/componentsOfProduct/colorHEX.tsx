import React, { FC, useState, useRef, useEffect } from 'react';
import { ChromePicker } from 'react-color';
import { common_ProductNew } from 'api/proto-http/admin';
import { handleChange } from '../addProduct';
import update from 'immutability-helper';
import styles from 'styles/addProd.scss';

interface colorHEXProps {
  product: common_ProductNew;
  setProduct: React.Dispatch<React.SetStateAction<common_ProductNew>>;
}

export const ColorHEX: FC<colorHEXProps> = ({ product, setProduct }) => {
  const [color, setColor] = useState('#000000');
  const [showHex, setShowHex] = useState(false);
  const colorPickerRef = useRef<any>(null);
  const productContainerRef = useRef<any>(null);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (productContainerRef.current && !productContainerRef.current.contains(event.target)) {
        setShowHex(false);
      }
    }

    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, []);

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    handleChange(e, setProduct);
  };

  const handleColorHexClick = () => {
    setShowHex(!showHex);
  };

  const onColorPickerInfoChange = (color: any) => {
    setProduct((prevProduct) => {
      return update(prevProduct, {
        product: {
          colorHex: { $set: color.hex },
        },
      });
    });
    setColor(color.hex);
  };

  return (
    <div className={styles.product_container} ref={productContainerRef}>
      <label htmlFor='color_hex' className={styles.title}>
        Color Hex
      </label>
      <input
        type='text'
        name='colorHex'
        value={product.product?.colorHex}
        id='color_hex'
        onClick={handleColorHexClick}
        className={styles.product_input}
        onChange={handleInputChange}
      />
      <div ref={colorPickerRef} className={styles.color}>
        {showHex && (
          <ChromePicker
            className={styles.color_picker}
            color={color}
            onChangeComplete={onColorPickerInfoChange}
            disableAlpha={true}
          />
        )}
      </div>
    </div>
  );
};
