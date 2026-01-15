// import { isValidUrlForHero } from 'lib/features/isValidUrl';

// import { common_HeroFullInsert } from 'api/proto-http/admin';
// import { isValidURL } from 'lib/features/isValidUrl';

// export const validateExploreLinks = (values: common_HeroFullInsert) => {
//   const invalidUrls: string[] = [];
//   const nonAllowedDomainUrls: string[] = [];

//   values.entities?.forEach((entity) => {
//     const checkUrl = (url: string | undefined, type: string) => {
//       if (!url) return;

//       if (!isValidURL(url)) {
//         invalidUrls.push(`${type} URL is not valid`);
//       } else if (!isValidUrlForHero(url)) {
//         nonAllowedDomainUrls.push(`${type} URL is not from allowed domain`);
//       }
//     };
//     if (entity.single) {
//       checkUrl(entity.single.exploreLink, 'Single Add');
//     }
//     if (entity.main) {
//       checkUrl(entity.main.exploreLink, 'Main Add');
//     }
//     if (entity.double) {
//       checkUrl(entity.double.left?.exploreLink, 'Double Add Left');
//       checkUrl(entity.double.right?.exploreLink, 'Double Add Right');
//     }
//     if (entity.featuredProducts) {
//       checkUrl(entity.featuredProducts.exploreLink, 'Featured Products');
//     }
//   });

//   return { invalidUrls, nonAllowedDomainUrls };
// };
