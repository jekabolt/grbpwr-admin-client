import { useNavigate } from '@tanstack/react-location';
import { addPromo } from 'api/promo';
import { AddPromoRequest } from 'api/proto-http/admin';
import { Layout } from 'components/login/layout';
import { ROUTES } from 'constants/routes';
import { FC, useState } from 'react';
import styles from 'styles/promo.scss';

interface PromoState {
  code: string;
  discount: number;
  expiration: string;
  freeShipping: boolean;
  allowed: boolean;
  voucher: boolean;
}

export const Promo: FC = () => {
  const [promoState, setPromoState] = useState<PromoState>({
    code: '',
    discount: 0,
    expiration: '',
    freeShipping: false,
    allowed: false,
    voucher: false,
  });

  const { code, freeShipping, discount, expiration, allowed, voucher } = promoState;
  const navigate = useNavigate();

  const handleChange = (key: keyof PromoState, value: string | boolean | number) => {
    if (key === 'discount' && typeof value === 'number') {
      // Ensure discount value is within the range of 0 to 99
      if (value < 0) {
        value = 0;
      } else if (value > 99) {
        value = 99;
      }
    }
    setPromoState((prevState) => ({ ...prevState, [key]: value }));
  };

  const createPromo = async () => {
    const formattedExpiration = expiration.endsWith('Z') ? expiration : expiration + ':00Z';

    const promo: AddPromoRequest = {
      promo: {
        code: code,
        discount: { value: discount.toString() },
        expiration: formattedExpiration,
        freeShipping,
        allowed,
        voucher,
      },
    };

    await addPromo(promo);
  };

  const navigateGetPromo = () => {
    navigate({ to: ROUTES.getPromo, replace: true });
  };

  return (
    <Layout>
      <div className={styles.promo}>
        <div className={styles.promo_fields_container}>
          {Object.entries(promoState).map(([key, value]) => (
            <div
              key={key}
              className={
                key === 'freeShipping' || key === 'voucher' || key === 'allowed'
                  ? styles.boolean
                  : styles.fields
              }
            >
              <label htmlFor={key}>{key}</label>
              {typeof value === 'boolean' ? (
                <input
                  type='checkbox'
                  checked={value}
                  onChange={() => handleChange(key as keyof PromoState, !value)}
                  id={key}
                />
              ) : (
                <>
                  {key === 'discount' ? (
                    <input
                      type='number'
                      value={value as number}
                      onChange={(e) =>
                        handleChange(key as keyof PromoState, parseInt(e.target.value))
                      }
                      id={key}
                    />
                  ) : (
                    <input
                      type={key === 'expiration' ? 'datetime-local' : 'text'}
                      value={key === 'expiration' ? value.slice(0, -1) : value}
                      onChange={(e) =>
                        handleChange(
                          key as keyof PromoState,
                          key === 'expiration' ? e.target.value + ':00Z' : e.target.value,
                        )
                      }
                      id={key}
                    />
                  )}
                </>
              )}
            </div>
          ))}
        </div>
        <div className={styles.promo_btns}>
          <button type='button' onClick={createPromo}>
            Add Promo
          </button>
          <button type='button' onClick={navigateGetPromo}>
            Get Promo
          </button>
        </div>
      </div>
    </Layout>
  );
};
