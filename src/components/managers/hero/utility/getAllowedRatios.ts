import { calculateAspectRatio } from "features/utilitty/calculateAspectRatio";

export const getAllowedRatios = (entity: any) => {
    if (!entity.doubleAdd) return [];

    const leftRatio = calculateAspectRatio(
        entity.doubleAdd.left?.media?.media?.thumbnail?.width,
        entity.doubleAdd.left?.media?.media?.thumbnail?.height,
    );
    const rightRatio = calculateAspectRatio(
        entity.doubleAdd.right?.media?.media?.thumbnail?.width,
        entity.doubleAdd.right?.media?.media?.thumbnail?.height,
    );

    const leftAllowedRatios = leftRatio === '1:1' ? ['1:1'] : ['4:5', '1:1'];
    const rightAllowedRatios = rightRatio === '1:1' ? ['1:1'] : ['4:5', '1:1'];

    return [...new Set([...leftAllowedRatios, ...rightAllowedRatios])];
};