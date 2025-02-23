import isEqual from 'lodash/isEqual';

const normalizeDate = (date: string | null): string | null => {
  if (!date) return null;
  const parsedDate = new Date(date);
  return parsedDate.toISOString().split('.')[0] + 'Z';
};

export const comparisonOfInitialProductValues = (obj1: any, obj2: any): boolean => {
  const normalize = (obj: any): any => {
    if (obj === null || obj === undefined) return obj;
    if (typeof obj === 'string' && !isNaN(Date.parse(obj))) {
      return normalizeDate(obj);
    }
    if (typeof obj !== 'object') return obj;
    if (Array.isArray(obj)) return obj.map(normalize);
    return Object.fromEntries(Object.entries(obj).map(([k, v]) => [k, normalize(v)]));
  };

  return isEqual(normalize(obj1), normalize(obj2));
};
