type MediaConfig = {
    fieldPath: string;
    state: (url: string) => void
};

export const createMediaSaveConfigs = (
    setMain: (url: string) => void,
    setSingle: (updater: (prev: Record<number, string>) => Record<number, string>) => void,
    setDoubleAdd: (updater: (prev: Record<number, any>) => Record<number, any>) => void,
) => {
    const createConfig = (baseFieldPath: string, orientation: 'Portrait' | 'Landscape') => ({
        fieldPath: `${baseFieldPath}media${orientation}Id`,
        // state: /* ... existing state logic ... */
    });

    return {
        main: (index: number, orientation: 'Portrait' | 'Landscape'): MediaConfig => ({
            fieldPath: `entities.${index}.main.single.media${orientation}Id`,
            state: setMain,
        }),
        single: (index: number, orientation: 'Portrait' | 'Landscape'): MediaConfig => ({
            fieldPath: `entities.${index}.single.media${orientation}Id`,
            state: (url) => setSingle((prev) => ({ ...prev, [index]: url })),
        }),
        doubleLeft: (index: number, orientation: 'Portrait' | 'Landscape'): MediaConfig => ({
            fieldPath: `entities.${index}.double.left.media${orientation}Id`,
            state: (url) =>
                setDoubleAdd((prev) => ({ ...prev, [index]: { ...prev[index], left: url } })),
        }),
        doubleRight: (index: number, orientation: 'Portrait' | 'Landscape'): MediaConfig => ({
            fieldPath: `entities.${index}.double.right.media${orientation}Id`,
            state: (url) =>
                setDoubleAdd((prev) => ({ ...prev, [index]: { ...prev[index], right: url } })),
        }),
    };
};