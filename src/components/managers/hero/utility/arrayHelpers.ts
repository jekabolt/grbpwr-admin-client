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
