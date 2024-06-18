export const checkIsHttpHttpsMediaLink = (url: string) => {
    const urlPattern = new RegExp('^https?:\\/\\/' +
        '(([a-z\\d]([a-z\\d-]*[a-z\\d])*)\\.)+[a-z]{2,}' +
        '(\\:\\d+)?(\\/[-a-z\\d%_.~+]*)*' +
        '(\\?[;&amp;a-z\\d%_.~+=-]*)?' +
        '(\\#[-a-z\\d_]*)?$', 'i');
    return urlPattern.test(url);
};
