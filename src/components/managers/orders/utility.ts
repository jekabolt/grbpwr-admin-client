import { common_Dictionary } from 'api/proto-http/admin';

/* eslint-disable @typescript-eslint/no-unused-vars */
type Pattern = {
    [key: string]: RegExp;
};

const pattern: Pattern = {
    size: /SIZE_ENUM_/,
    measurement: /MEASUREMENT_NAME_ENUM_/,
}

type dictionaryTypes = 'size' | 'order' | 'carrier' | 'status' | 'gender' | 'measurement';

export const findInDictionary = (
    dictionary: common_Dictionary | undefined,
    id: number | undefined,
    type: dictionaryTypes,
) => {
    if (!dictionary || id === undefined) return null;

    let data;
    switch (type) {
        case 'size':
            data = dictionary.sizes?.find((s) => s.id === id)?.name?.replace(pattern[type], '');
            break;
        case 'measurement':
            data = dictionary.measurements?.find((s) => s.id === id)?.name?.replace(pattern[type], '');
            break;
        case 'order':
            data = dictionary.orderStatuses?.find((s) => s.id === id)?.name?.replace(pattern[type], '');
            break;
        case 'carrier':
            data = dictionary.shipmentCarriers?.find((s) => s.id === id)?.shipmentCarrier?.carrier;
            break;
        case 'status':
            data = dictionary.orderStatuses?.find((s) => s.id === id)?.name?.replace(pattern[type], '');
            break;
        case 'gender':
            // common_SizeEnum in dictionary === 'string'
            data = dictionary.genders
                ?.find((s) => s.id !== undefined && parseInt(s.id) === id)
                ?.name?.replace(pattern[type], '');
            break;

        default:
            data = null;
    }

    return data;
};
