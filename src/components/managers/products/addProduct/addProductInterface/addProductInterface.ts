import { common_Dictionary } from 'api/proto-http/admin';

export interface AddProductInterface {
    dictionary: common_Dictionary | undefined
}

export interface Country {
    value: string;
    label: string;
}
