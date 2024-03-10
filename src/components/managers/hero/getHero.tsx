import { getHero } from 'api/hero';
import { common_HeroFull } from 'api/proto-http/admin';
import { Layout } from 'components/login/layout';
import { FC, useEffect, useState } from 'react';

export const GetHero: FC = () => {
  const [hero, setHero] = useState<common_HeroFull>();

  useEffect(() => {
    const fetchHero = async () => {
      try {
        const response = await getHero({});
        setHero(response.hero);
      } catch (error) {
        console.error(error);
      }
    };
    fetchHero();
  }, []);
  return (
    <Layout>
      <div>
        <div>
          <h3>MAIN</h3>
          <img src={hero?.main?.exploreLink} alt='' style={{ width: '100px', height: '100px' }} />
          <p>{hero?.main?.exploreText}</p>
          <p>{hero?.main?.exploreLink}</p>
        </div>
        <div>
          <h3>ADS</h3>
          <ul>
            {hero?.ads?.map((ad, id) => (
              <li key={id}>
                <img src={ad.contentLink} alt='' style={{ width: '100px', height: '100px' }} />
                <p>{ad.exploreText}</p>
              </li>
            ))}
          </ul>
        </div>
        <div>{hero?.createdAt}</div>
      </div>
    </Layout>
  );
};
