export const removeEntityIndex = <T extends unknown>(
    state: { [key: number]: T },
    indexToRemove: number,
): { [key: number]: T } => {
    const newState = { ...state };
    delete newState[indexToRemove];

    return Object.keys(newState).reduce(
        (acc, key) => {
            const keyAsNumber = Number(key);
            const newKey = keyAsNumber > indexToRemove ? keyAsNumber - 1 : keyAsNumber;
            acc[newKey] = newState[keyAsNumber];
            return acc;
        },
        {} as { [key: number]: T },
    );
};

export const unshiftNewEntity = <T extends unknown>(
    state: { [key: number]: T },
    initialValue: T,
): { [key: number]: T } => {
    const updatedState = Object.keys(state).reduce(
        (acc, key) => {
            const newKey = Number(key) + 1;
            acc[newKey] = state[Number(key)];
            return acc;
        },
        {} as { [key: number]: T },
    );
    return { 0: initialValue, ...updatedState };
};