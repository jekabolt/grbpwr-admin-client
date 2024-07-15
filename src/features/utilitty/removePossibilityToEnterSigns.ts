export const restrictNumericInput = (event: React.KeyboardEvent<HTMLInputElement>) => {
    const invalidChars = ['-', '+', 'e', 'E', '.', ','];
    if (invalidChars.includes(event.key)) {
        event.preventDefault();
    }
};
