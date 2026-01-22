import { common_HeroType } from 'api/proto-http/admin';

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
