import { isValid, parseISO } from 'date-fns';


export const parseWellKnownTimestamp = (timestamp: string): Date | null => {
    if (!timestamp || timestamp === '0001-01-01T00:00:00Z') return null;
    const parsedDate = parseISO(timestamp);
    return isValid(parsedDate) ? parsedDate : null;
};

export const formatWellKnownTimestamp = (date: Date | null): string => {
    if (!date) return '0001-01-01T00:00:00Z';
    return date.toISOString();
};