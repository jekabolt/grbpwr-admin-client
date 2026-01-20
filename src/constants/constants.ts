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
