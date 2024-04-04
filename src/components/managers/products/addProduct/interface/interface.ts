import { SelectChangeEvent } from '@mui/material';
import { common_Dictionary, common_ProductNew } from 'api/proto-http/admin';

export interface CommonProductInsertInterface {
    product: common_ProductNew;
    setProduct: React.Dispatch<React.SetStateAction<common_ProductNew>>
    handleInputChange: (
        e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement> | SelectChangeEvent,
    ) => void;
    dictionary: common_Dictionary | undefined
}


export interface AddProductMediaInterface {
    product: common_ProductNew;
    setProduct: React.Dispatch<React.SetStateAction<common_ProductNew>>
}

export interface AddproductSizesInterface {
    setProduct: React.Dispatch<React.SetStateAction<common_ProductNew>>
    dictionary: common_Dictionary | undefined
}

export interface AddProductTagInterface {
    setProduct: React.Dispatch<React.SetStateAction<common_ProductNew>>
}