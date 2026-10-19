import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { adminService, frontendService } from 'api/api';
import { common_HeroFullInsert } from 'api/proto-http/admin';
import { common_HeroFullWithTranslations } from 'api/proto-http/frontend';
import { failureClassOfError } from 'components/managers/tech-card/components/useTechCardAutosave';
import { notify } from 'lib/stores/store';

export const heroKeys = {
  all: ['hero'] as const,
  details: () => [...heroKeys.all, 'detail'] as const,
  detail: () => [...heroKeys.details()] as const,
};

export function useHero() {
  return useQuery({
    queryKey: heroKeys.detail(),
    queryFn: async () => {
      const response = await frontendService.GetHero({});
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

  const m = useMutation({
    mutationFn: (heroData: common_HeroFullInsert) => adminService.AddHero({ hero: heroData }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: heroKeys.detail() });
    },
    onError: (error, vars) => {
      notify({
        sev: 'error',
        subject: 'HERO',
        text: 'not published',
        detail: error instanceof Error ? error.message : undefined,
        action:
          failureClassOfError(error) === 'transient'
            ? { label: 'retry', onClick: () => m.mutate(vars) }
            : undefined,
      });
    },
  });
  return m;
}
