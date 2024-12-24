type MediaConfig = {
    fieldPath: string;
    state: (url: string) => void
};


export const createMediaSaveConfigs = (
    setMain: (url: string) => void,
    setSingle: (updater: (prev: Record<number, string>) => Record<number, string>) => void,
    setDoubleAdd: (updater: (prev: Record<number, any>) => Record<number, any>) => void,
) => {
    return {
        main: (index: number): MediaConfig => ({
            fieldPath: `entities.${index}.mainAdd.singleAdd.mediaId`,
            state: setMain,
        }),
        single: (index: number): MediaConfig => ({
            fieldPath: `entities.${index}.singleAdd.mediaId`,
            state: (url) => setSingle((prev) => ({ ...prev, [index]: url })),
        }),
        doubleLeft: (index: number): MediaConfig => ({
            fieldPath: `entities.${index}.doubleAdd.left.mediaId`,
            state: (url) =>
                setDoubleAdd((prev) => ({ ...prev, [index]: { ...prev[index], left: url } })),
        }),
        doubleRight: (index: number): MediaConfig => ({
            fieldPath: `entities.${index}.doubleAdd.right.mediaId`,
            state: (url) =>
                setDoubleAdd((prev) => ({ ...prev, [index]: { ...prev[index], right: url } })),
        }),
    };
};