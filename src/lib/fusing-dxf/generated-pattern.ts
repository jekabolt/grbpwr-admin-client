import type { common_TechCardSizePattern } from 'api/proto-http/admin';

export const GENERATED_FUSING_NAME_PREFIX = 'Fusing · generated · ';
export const isGenerated = (pattern: common_TechCardSizePattern) =>
  (pattern.name ?? '').startsWith(GENERATED_FUSING_NAME_PREFIX);
