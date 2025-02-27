import { common_HeroEntity } from "api/proto-http/frontend";

import { common_HeroFullInsert } from "api/proto-http/admin";
import { common_HeroFull } from "api/proto-http/frontend";

export interface HeroStore {
    hero: common_HeroFull | undefined;
    entities: common_HeroEntity[];
    fetchHero: () => Promise<void>;
    saveHero: (values: common_HeroFullInsert) => Promise<{ success: boolean, invalidUrls: string[], nonAllowedDomainUrls: string[] }>;
}