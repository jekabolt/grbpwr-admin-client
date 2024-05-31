export const checkIsHttpHttpsMediaLink = (url: string) => {
    const urlPattern = new RegExp('^https?:\\/\\/' + // Протокол HTTP или HTTPS является обязательным
        '(([a-z\\d]([a-z\\d-]*[a-z\\d])*)\\.)+[a-z]{2,}' + // Доменное имя
        '(\\:\\d+)?(\\/[-a-z\\d%_.~+]*)*' + // Порт и путь (необязательны)
        '(\\?[;&amp;a-z\\d%_.~+=-]*)?' + // Query параметры (необязательны)
        '(\\#[-a-z\\d_]*)?$', 'i'); // Якорь (необязательный)
    return urlPattern.test(url);
};
