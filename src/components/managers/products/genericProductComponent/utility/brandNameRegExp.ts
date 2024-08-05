export const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    const allowedKeys = /^[a-zA-Z0-9._-]$/;
    const specialSymbols = /^[._-]$/;
    const inputElement = e.currentTarget;
    const inputValue = inputElement.value;

    if (inputValue === '' && specialSymbols.test(e.key)) {
        return;
    }

    const controlKeys = [
        'Backspace',
        'Tab',
        'Enter',
        'ArrowLeft',
        'ArrowUp',
        'ArrowRight',
        'ArrowDown',
    ];
    if (!allowedKeys.test(e.key) && !controlKeys.includes(e.key)) {
        e.preventDefault();
    }
};