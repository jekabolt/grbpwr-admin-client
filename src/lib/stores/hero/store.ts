// import { getHero } from 'api/hero';

// import { addHero } from 'api/hero';
// import { common_HeroEntityInsert, common_HeroFullInsert } from 'api/proto-http/admin';
// import { mapHeroFunction } from 'components/managers/hero/utility/mapHeroFunction';
// import { create } from 'zustand';
// import { HeroStore } from './store-types';

// export const useHeroStore = create<HeroStore>((set) => ({
//   hero: undefined,
//   entities: [],
//   fetchHero: async () => {
//     const response = await getHero({});
//     if (!response) return;

//     const mapped = mapHeroFunction(response.hero);
//     const heroEntities = mapped.entities || [];
//     set({
//       hero: mapped as common_HeroFullInsert,
//       entities: heroEntities as common_HeroEntityInsert[],
//     });
//   },
//   saveHero: async (values) => {
//     try {
//       await addHero({ hero: values });
//       await useHeroStore.getState().fetchHero();
//       return { success: true, invalidUrls: [], nonAllowedDomainUrls: [] };
//     } catch (error) {
//       return { success: false, invalidUrls: [], nonAllowedDomainUrls: [] };
//     }
//   },
// }));
