export const isValidURL = (url: string | undefined): boolean => {
    if (!url) return false;
    try {
        new URL(url);
        return true;
    } catch (_) {
        return false;
    }
};

export const isValidUrlForHero = (url: string | undefined) => {
    if (url === undefined) {
        return false;
    }
    const pattern = new RegExp('https?://(?:[w-]+.)?grbpwr.com(?:/[^s]*)?');
    return !!pattern.test(url);
};