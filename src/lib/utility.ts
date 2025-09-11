import { common_Category } from 'api/proto-http/admin';
import clsx, { ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
    return twMerge(clsx(inputs));
}


export function getCategoriesByParentId(categories: common_Category[], parentId: number): common_Category[] {
    return categories.filter(cat => cat.parentId === parentId);
}

