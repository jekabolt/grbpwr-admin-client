export const removePossibilityToUseSigns = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === '+' || e.key === '-') {
        e.preventDefault();
    }
};