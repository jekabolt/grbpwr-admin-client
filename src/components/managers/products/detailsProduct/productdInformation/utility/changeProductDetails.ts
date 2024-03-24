import { useState } from "react";

interface ProductDataDetails {
    [key: string]: string | number | boolean | undefined;
}

interface ChangeProductDetailsHook {
    inputValues: ProductDataDetails;
    handleInputChange: (event: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement | HTMLInputElement>) => void;
    changedFields: Set<string>;
    resetChangedFields: () => void;
}

export const useChangeProductDetails = (initialValues: ProductDataDetails): ChangeProductDetailsHook => {
    const [inputValues, setInputValues] = useState<ProductDataDetails>(initialValues);
    const [changedFields, setChangedFields] = useState<Set<string>>(new Set());

    const handleInputChange = (event: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement | HTMLInputElement>) => {
        const target = event.target as HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement;
        const name = target.name;
        const isCheckbox = target instanceof HTMLInputElement && target.type === 'checkbox';
        const value = isCheckbox ? target.checked : target.value;
        setInputValues(prevState => ({
            ...prevState,
            [name]: value,
        }));
        setChangedFields(prevFields => new Set(prevFields).add(name));
    };

    const resetChangedFields = () => setChangedFields(new Set());

    return { inputValues, handleInputChange, changedFields, resetChangedFields };
};
