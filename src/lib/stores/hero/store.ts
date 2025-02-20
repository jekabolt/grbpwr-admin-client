import { getHero } from "api/hero";

import { addHero } from "api/hero";
import { create } from "zustand";
import { HeroStore } from "./store-types";

export const useHeroStore = create<HeroStore>((set) => ({
    hero: undefined,
    entities: [],
    fetchHero: async () => {
        const response = await getHero({});
        if (!response) return;

        const heroEntities = response.hero?.entities || [];
        set({ hero: response.hero, entities: heroEntities });
    },
    saveHero: async (values) => {
        try {
            await addHero({ hero: values });
            await useHeroStore.getState().fetchHero();
            return { success: true, invalidUrls: [], nonAllowedDomainUrls: [] };
        } catch (error) {
            return { success: false, invalidUrls: [], nonAllowedDomainUrls: [] };
        }
    },
}))