let selectedDot = false;

export const restrictNumericInput = (e: React.KeyboardEvent<HTMLInputElement>) => {
    const { key, target } = e;
    const inputElement = target as HTMLInputElement;
    const inputValue = inputElement.value;

    const allowedControlKeys = [
        'backspace',
        'arrowup',
        'arrowdown',
        'arrowleft',
        'arrowright',
        'control',
        'meta',
        'v',
        'c',
        'tab',
        'shift',
        'delete'
    ];

    // Convert key to lowercase for consistent checking
    const lowerKey = key.toLowerCase();

    // Check if it's a copy/paste command (Windows: Ctrl, Mac: Command)
    const isCopyPaste = (e.ctrlKey || e.metaKey) && (lowerKey === 'c' || lowerKey === 'v');

    if (
        (lowerKey === 'e' ||
            (isNaN(Number(key)) && key !== '.' && !allowedControlKeys.includes(lowerKey)))
        && !isCopyPaste
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
