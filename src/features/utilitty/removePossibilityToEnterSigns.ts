export const restrictNumericInput = (event: React.KeyboardEvent<HTMLInputElement>) => {
    const invalidChars = ['-', '+', 'e', 'E', ',', '/'];
    const { key, target } = event;

    const allowedControlKeys = [
        'Backspace',
        'Delete',
        'ArrowUp',
        'ArrowDown',
        'ArrowLeft',
        'ArrowRight',
    ];

    if (
        invalidChars.includes(key) ||
        (key === '.' && (target as HTMLInputElement).value.includes('.')) ||
        !allowedControlKeys.includes(key) && (isNaN(Number(key)) && key !== '.')
    ) {
        event.preventDefault();
    }
};
