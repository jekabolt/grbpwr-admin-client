let selectedDot = false;

export const restrictNumericInput = (e: React.KeyboardEvent<HTMLInputElement>) => {
    const { key, target } = e;
    const inputElement = target as HTMLInputElement;
    const inputValue = inputElement.value;

    const allowedControlKeys = [
        'Backspace',
        'ArrowUp',
        'ArrowDown',
        'ArrowLeft',
        'ArrowRight',
    ];

    if (
        key === 'e' ||
        key === 'E' ||
        (isNaN(Number(key)) && key !== '.' && !allowedControlKeys.includes(key))
    ) {
        e.preventDefault();
    }

    if (key === '.' && (inputValue.includes('.') || selectedDot)) {
        e.preventDefault();
    }

    selectedDot = key === '.';
};
