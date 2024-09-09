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
        'Control',
        'v',
        'c',
    ];

    if (
        (key === 'e' || key === 'E' || (isNaN(Number(key)) && key !== '.' && !allowedControlKeys.includes(key)))
        && !(e.ctrlKey && (key === 'v' || key === 'c'))
    ) {
        e.preventDefault();
    }

    if (key === '.' && (inputValue.includes('.') || selectedDot)) {
        e.preventDefault();
    }

    selectedDot = key === '.';
};

export const handlePaste = (e: React.ClipboardEvent<HTMLInputElement>) => {
    const pasteData = e.clipboardData.getData('text');

    if (isNaN(Number(pasteData)) || (pasteData.split('.').length - 1 > 1)) {
        e.preventDefault();
    }
};
