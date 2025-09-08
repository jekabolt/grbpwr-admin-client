
import { common_HeroEntityInsert, common_HeroFullInsert } from "api/proto-http/admin";


export interface HeroStore {
    hero: common_HeroFullInsert | undefined;
    entities: common_HeroEntityInsert[];
    fetchHero: () => Promise<void>;
    saveHero: (values: common_HeroFullInsert) => Promise<{ success: boolean, invalidUrls: string[], nonAllowedDomainUrls: string[] }>;
}