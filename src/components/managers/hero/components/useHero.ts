import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { addHero, getHero } from 'api/hero';
import { common_HeroFullInsert } from 'api/proto-http/admin';
import { common_HeroFullWithTranslations } from 'api/proto-http/frontend';

export const heroKeys = {
  all: ['hero'] as const,
  details: () => [...heroKeys.all, 'detail'] as const,
  detail: () => [...heroKeys.details()] as const,
};

export function useHero() {
  return useQuery({
    queryKey: heroKeys.detail(),
    queryFn: async () => {
      const response = await getHero({});
      if (!response?.hero) return null;

      return {
        hero: response.hero as common_HeroFullWithTranslations,
      };
    },
    staleTime: 5 * 60 * 1000, // 5 minutes
    retry: 2,
  });
}

export function useSaveHero() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (heroData: common_HeroFullInsert) => addHero({ hero: heroData }),
    onSuccess: () => {
      // Invalidate and refetch hero data
      queryClient.invalidateQueries({ queryKey: heroKeys.detail() });
    },
    onError: (error) => {
      console.error('Failed to save hero:', error);
    },
  });
}
