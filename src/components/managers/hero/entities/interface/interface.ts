import { common_MediaFull, common_Product } from "api/proto-http/admin";

export interface HeroMediaEntityInterface {
    index: number;
    entity: any;
    link?: string;
    singleLink?: { [key: number]: string; };
    doubleLinks?: {
        [key: number]: { left: string | undefined; right: string | undefined };
    };
    allowedRatios?: { [key: number]: string[] };
    saveMedia?: (selectedMedia: common_MediaFull[], index: number) => void;
    saveDoubleMedia?: (selectedMedia: common_MediaFull[], side: 'left' | 'right', index: number) => void;
}


export interface HeroProductEntityInterface {
    index: number;
    entity: any;
    product: { [key: number]: common_Product[] };
    isModalOpen: boolean;
    currentEntityIndex: number | null;
    showMessage: (message: string, severity: 'success' | 'error') => void;
    handleProductsReorder: (newProductsOrder: common_Product[], index: number) => void;
    handleOpenProductSelection: (index: number) => void;
    handleCloseModal: () => void;
    handleSaveNewSelection: (selectedProduct: common_Product[], index: number) => void;
}

export interface HeroProductTagEntityInterface {
    index: number;
    entity: any;
    productTags: { [key: number]: common_Product[] };
}