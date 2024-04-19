export const removePossibilityToUseSigns = (e: React.KeyboardEvent<HTMLInputElement>) => {
    console.log('Key pressed:', e.key);
    if (e.key === '+' || e.key === '-') {
        e.preventDefault();
    }
};