import {
  common_GenderEnum,
  common_HeroType,
  common_OrderFactor,
  common_SortFactor,
} from 'api/proto-http/admin';

export type OrderFactorOption = {
  factor: common_OrderFactor;
  name: string;
  sale?: boolean;
};

export type SortFactorConfig = {
  label?: string;
  orderFactors: OrderFactorOption[];
};

export const currencySymbols: Record<string, string> = {
  CNY: '¥', // Chinese Yuan
  EUR: '€', // Euro
  KRW: '₩', // Korean Won
  GBP: '£', // British Pound Sterling
  JPY: '¥', // Japanese Yen
  USD: '$', // United States Dollar
};

export const LANGUAGES = [
  { id: 1, name: 'english', code: 'en', isDefault: true },
  { id: 2, name: 'french', code: 'fr', isDefault: false },
  { id: 3, name: 'german', code: 'de', isDefault: false },
  { id: 4, name: 'italian', code: 'it', isDefault: false },
  { id: 5, name: 'japanese', code: 'ja', isDefault: false },
  { id: 6, name: 'chinese', code: 'cn', isDefault: false },
  { id: 7, name: 'korean', code: 'kr', isDefault: false },
];

export const heroTypes: { value: common_HeroType; label: string }[] = [
  { value: 'HERO_TYPE_MAIN', label: 'main add' },
  { value: 'HERO_TYPE_SINGLE', label: 'single add' },
  { value: 'HERO_TYPE_DOUBLE', label: 'double add' },
  { value: 'HERO_TYPE_FEATURED_PRODUCTS', label: 'featured products' },
  { value: 'HERO_TYPE_FEATURED_PRODUCTS_TAG', label: 'featured products tag' },
];

export const ASPECT_RATIOS = [
  { label: '16:9', value: 1.7778, color: '#cc0000' },
  { label: '4:3', value: 1.3333, color: '#e69138' },
  { label: '2:1', value: 2, color: '#c0c0c0' },
  { label: '1:1', value: 1.0, color: '#f1c232' },
  { label: '4:5', value: 0.8, color: '#6aa84f' },
  { label: '3:4', value: 0.75, color: '#45818e' },
  { label: '5:4', value: 1.25, color: '#3d85c6' },
  { label: '9:16', value: 0.5625, color: '#674ea7' },
  { label: 'Custom', value: undefined, color: '#000000' },
];

export const SORT_MAP: Partial<Record<common_SortFactor, SortFactorConfig>> = {
  SORT_FACTOR_CREATED_AT: {
    orderFactors: [{ factor: 'ORDER_FACTOR_DESC', name: 'latest arrivals' }],
  },
  SORT_FACTOR_PRICE: {
    label: 'price',
    orderFactors: [
      { factor: 'ORDER_FACTOR_ASC', name: 'low to high' },
      { factor: 'ORDER_FACTOR_DESC', name: 'high to low' },
      { factor: 'ORDER_FACTOR_ASC', name: 'low to high', sale: true },
      { factor: 'ORDER_FACTOR_DESC', name: 'high to low', sale: true },
    ],
  },
};

export const ORDER_MAP: Record<string, common_OrderFactor> = {
  asc: 'ORDER_FACTOR_ASC',
  desc: 'ORDER_FACTOR_DESC',
};

export const SORT_MAP_URL: Record<string, common_SortFactor> = {
  created_at: 'SORT_FACTOR_CREATED_AT',
  updated_at: 'SORT_FACTOR_UPDATED_AT',
  name: 'SORT_FACTOR_NAME',
  price: 'SORT_FACTOR_PRICE',
};

export const GENDER_MAP: Record<string, common_GenderEnum> = {
  men: 'GENDER_ENUM_MALE',
  women: 'GENDER_ENUM_FEMALE',
  unisex: 'GENDER_ENUM_UNISEX',
  ukn: 'GENDER_ENUM_UNKNOWN',
};

/** Slug for category/size filtering (men | women | unisex). URL may store enum; use this for UI logic. */
export const GENDER_ENUM_TO_SLUG: Record<string, string> = {
  GENDER_ENUM_MALE: 'men',
  GENDER_ENUM_FEMALE: 'women',
  GENDER_ENUM_UNISEX: 'unisex',
  GENDER_ENUM_UNKNOWN: '',
};
