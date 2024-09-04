export const isValidUrl = (url: string | undefined) => {
    if (!url) return;
    try {
        new URL(url);
        return true;
    } catch (e) {
        return false;
    }
};