export const calculateAspectRatio = (width?: number, height?: number): string | undefined => {
    if (!width || !height) return undefined;

    const gcd = (a: number, b: number): number => (b === 0 ? a : gcd(b, a % b));
    const divisor = gcd(width, height);

    return `${width / divisor}:${height / divisor}`;
};