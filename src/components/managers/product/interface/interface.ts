import { common_ProductFull } from "api/proto-http/admin";

export interface Country {
    value: string;
    label: string;
}



export interface BasicProductFieldsInterface {
    product?: common_ProductFull;
    isEditMode?: boolean;
    isAddingProduct: boolean;
    isCopyMode: boolean;
}

export interface MediaViewInterface {
    clearMediaPreview?: boolean;
    isEditMode?: boolean;
    isAddingProduct: boolean;
    product?: common_ProductFull;
    isCopyMode: boolean;
}

export interface ProductSizesAndMeasurementsInterface {
    isEditMode?: boolean;
    isAddingProduct: boolean;
}

export interface ProductTagsInterface {
    isEditMode?: boolean;
    isAddingProduct: boolean;
    isCopyMode: boolean
}