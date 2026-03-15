export type CountryOption = {
  name: string;
  currency: string;
  currencyKey: string;
  lng: string;
  countryCode: string;
  phoneCode: string;
  displayLng?: string;
  vatRate?: number; // VAT rate as percentage (e.g., 19 for 19%)
  taxType?: 'VAT' | 'Sales Tax' | 'GST'; // Tax terminology used in the country
};

// Helper to create country with defaults
const country = (
  name: string,
  countryCode: string,
  phoneCode: string,
  overrides: Partial<Omit<CountryOption, 'name' | 'countryCode' | 'phoneCode'>> = {},
): CountryOption => ({
  currency: '€',
  currencyKey: 'EUR',
  lng: 'en',
  displayLng: 'english',
  ...overrides,
  name,
  countryCode,
  phoneCode,
});

export const COUNTRIES_BY_REGION = {
  AFRICA: [country('south africa', 'za', '27')],
  AMERICAS: [
    country('canada', 'ca', '1', { currency: '$', currencyKey: 'USD' }),
    country('chile', 'cl', '56', { currency: '$', currencyKey: 'USD' }),
    country('mexico', 'mx', '52', { currency: '$', currencyKey: 'USD' }),
    country('united states', 'us', '1', { currency: '$', currencyKey: 'USD' }),
  ],
  'ASIA PACIFIC': [
    country('australia', 'au', '61'),
    country('hong kong sar', 'hk', '852'),
    country('india', 'in', '91'),
    country('japan', 'jp', '81', { currency: '¥', currencyKey: 'JPY' }),
    country('日本', 'jp', '81', {
      currency: '¥',
      currencyKey: 'JPY',
      lng: 'ja',
      displayLng: '日本語',
    }),
    country('macau sar', 'mo', '853'),
    country('mainland china', 'cn', '86', {
      currency: '¥',
      currencyKey: 'CNY',
    }),
    country('中国大陆', 'cn', '86', {
      currency: '¥',
      currencyKey: 'CNY',
      lng: 'zh',
      displayLng: '简体中文',
    }),
    country('malaysia', 'my', '60'),
    country('new zealand', 'nz', '64'),
    country('singapore', 'sg', '65'),
    country('south korea', 'kr', '82', { currency: '₩', currencyKey: 'KRW' }),
    country('대한민국', 'kr', '82', {
      currency: '₩',
      currencyKey: 'KRW',
      lng: 'ko',
      displayLng: '한국인',
    }),
    country('taiwan', 'tw', '886'),
    country('台湾地区', 'tw', '886', { lng: 'zh', displayLng: '繁體中文' }),
    country('thailand', 'th', '66'),
  ],
  EUROPE: [
    country('aland islands', 'ax', '358', { vatRate: 0 }),
    country('andorra', 'ad', '376', { vatRate: 4.5 }),
    country('austria', 'at', '43', { vatRate: 20 }),
    country('belgium', 'be', '32', { vatRate: 21 }),
    country('bulgaria', 'bg', '359', { vatRate: 20 }),
    country('croatia', 'hr', '385', { vatRate: 25 }),
    country('cyprus', 'cy', '357', { vatRate: 19 }),
    country('czech republic', 'cz', '420', { vatRate: 21 }),
    country('denmark', 'dk', '45', { vatRate: 25 }),
    country('estonia', 'ee', '372', { vatRate: 20 }),
    country('faroe islands', 'fo', '298', { vatRate: 0 }),
    country('finland', 'fi', '358', { vatRate: 24 }),
    country('france', 'fr', '33', { vatRate: 20 }),
    country('france', 'fr', '33', { lng: 'fr', displayLng: 'français', vatRate: 20 }),
    country('germany', 'de', '49', { vatRate: 19 }),
    country('deutschland', 'de', '49', { lng: 'de', displayLng: 'deutsch', vatRate: 19 }),
    country('gibraltar', 'gi', '350', { vatRate: 0 }),
    country('greece', 'gr', '30', { vatRate: 24 }),
    country('greenland', 'gl', '299', { vatRate: 0 }),
    country('guernsey', 'gg', '44', { vatRate: 0 }),
    country('hungary', 'hu', '36', { vatRate: 27 }),
    country('iceland', 'is', '354', { vatRate: 24 }),
    country('italy', 'it', '39', { vatRate: 22 }),
    country('italy', 'it', '39', { lng: 'it', displayLng: 'italiano', vatRate: 22 }),
    country('jersey', 'je', '44', { vatRate: 0 }),
    country('latvia', 'lv', '371', { vatRate: 21 }),
    country('liechtenstein', 'li', '423', { vatRate: 7.7 }),
    country('lithuania', 'lt', '370', { vatRate: 21 }),
    country('luxembourg', 'lu', '352', { vatRate: 17 }),
    country('malta', 'mt', '356', { vatRate: 18 }),
    country('monaco', 'mc', '377', { vatRate: 20 }),
    country('netherland', 'nl', '31', { vatRate: 21 }),
    country('norway', 'no', '47', { vatRate: 25 }),
    country('poland', 'pl', '48', { vatRate: 23 }),
    country('portugal', 'pt', '351', { vatRate: 23 }),
    country('romania', 'ro', '40', { vatRate: 19 }),
    country('slovakia', 'sk', '421', { vatRate: 20 }),
    country('slovenia', 'si', '386', { vatRate: 22 }),
    country('spain', 'es', '34', { vatRate: 21 }),
    country('sweeden', 'se', '46', { vatRate: 25 }),
    country('switzerland', 'ch', '41', { vatRate: 7.7 }),
    country('turkey', 'tr', '90', { vatRate: 20 }),
    country('united kingdom', 'gb', '44', { currency: '£', currencyKey: 'GBP', vatRate: 20 }),
  ],
  'MIDDLE EAST': [
    country('bahrain', 'bh', '973'),
    country('israel', 'il', '972'),
    country('kuwait', 'kw', '965'),
    country('qatar', 'qa', '974'),
    country('saudi arabia', 'sa', '966'),
    country('united arab emirates', 'ae', '971'),
  ],
} satisfies Record<string, CountryOption[]>;

export function getUniqueCountries() {
  const countries = Object.values(COUNTRIES_BY_REGION).flat();
  const countryMap = new Map();

  for (const country of countries) {
    const key = country.countryCode;
    const existing = countryMap.get(key);

    if (!existing || (existing.lng !== 'en' && country.lng === 'en')) {
      countryMap.set(key, country);
    }
  }

  return Array.from(countryMap.values());
}
