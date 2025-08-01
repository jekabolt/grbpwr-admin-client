import { common_MediaFull, common_Product } from "api/proto-http/admin";
import { common_ArchiveFull, common_ArchiveList, common_HeroEntity } from "api/proto-http/frontend";
import { FieldArrayRenderProps } from "formik";


export interface EntitiesProps {
    entities: common_HeroEntity[];
    entityRefs: React.MutableRefObject<{ [key: number]: HTMLDivElement | null }>;
    arrayHelpers: FieldArrayRenderProps;
}

export interface Props {
    title: string;
    prefix: string;
    landscapeLink: string;
    portraitLink: string;
    size: { xs: number; md?: number };
    aspectRatio: string[] | { Portrait: string[], Landscape: string[] };
    isDoubleAd?: boolean;
    onSaveMedia: (selectedMedia: common_MediaFull[], orientation: 'Portrait' | 'Landscape') => void;
}

export interface HeroProductEntityInterface {
    index: number;
    entity: any;
    product: { [key: number]: common_Product[] };
    title: string;
    prefix?: string;
    isModalOpen?: boolean;
    showProductPicker?: boolean;
    currentEntityIndex?: number | null;
    handleProductsReorder?: (newProductsOrder: common_Product[], index: number) => void;
    handleOpenProductSelection?: (index: number) => void;
    handleCloseModal?: () => void;
    handleSaveNewSelection?: (selectedProduct: common_Product[], index: number) => void;
}


export interface FeatureArchiveProps {
    archive: { [key: number]: common_ArchiveFull[] };
    // product: { [key: number]: common_Product[] }
    index: number;
    currentEntityIndex: number | null;
    open: boolean;
    onClose: () => void;
    handleSaveArchiveSelection: (newSelectedArchive: common_ArchiveList[], index: number) => void;
    handleOpenArchiveSelection: (index: number) => void;
}
