export const isValidURL = (url: string | undefined): boolean => {
    if (!url) return false;
    try {
        new URL(url);
        return true;
    } catch (_) {
        return false;
    }
};