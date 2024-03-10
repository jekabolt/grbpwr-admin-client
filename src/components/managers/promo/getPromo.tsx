import { getPromo } from 'api/promo';
import { common_PromoCode } from 'api/proto-http/admin';
import { Layout } from 'components/login/layout';
import { FC, useEffect, useState } from 'react';
import styles from 'styles/getPromo.scss';

function formatDate(dateString: string | number | Date | undefined) {
  if (!dateString) {
    return '';
  }

  const options = { year: 'numeric', month: 'short', day: 'numeric' };
  const date = new Date(dateString);
  return date.toLocaleDateString('en-US', options as Intl.DateTimeFormatOptions);
}

export const GetPromo: FC = () => {
  const [promos, setPromos] = useState<common_PromoCode[] | undefined>([]);

  useEffect(() => {
    const listPromo = async () => {
      try {
        const response = await getPromo({});
        setPromos(response.promoCodes);
      } catch (error) {
        console.error(error);
      }
    };
    listPromo();
  }, []);
  return (
    <Layout>
      <div className={styles.list_promo_main}>
        <ul>
          {promos?.map((promo) => (
            <li key={promo.id}>
              <h2>{promo.promoCodeInsert?.code}</h2>
              <h2>{formatDate(promo.promoCodeInsert?.expiration)}</h2>
              <h2>discount: {promo.promoCodeInsert?.discount?.value}</h2>
              <h2>{promo.promoCodeInsert?.allowed ? 'allowed' : 'not allowed'}</h2>
              <h2>{promo.promoCodeInsert?.freeShipping ? 'free shipping' : 'paid delivery'}</h2>
              <h2>{promo.promoCodeInsert?.voucher ? 'voucher' : 'no voucher'}</h2>
            </li>
          ))}
        </ul>
      </div>
    </Layout>
  );
};
