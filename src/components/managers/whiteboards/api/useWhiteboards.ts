import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect } from 'react';
import { useCurrentAccount } from 'components/managers/accounts/utils/hooks';
import { notifyFailure } from 'components/shared/notify-failure';
import { ListWhiteboardsFilter, Whiteboard, WhiteboardInsert } from './types';
import { setLocalActor, whiteboardService } from './whiteboardService';

export const whiteboardKeys = {
  all: ['whiteboards'] as const,
  list: (filter: ListWhiteboardsFilter) => [...whiteboardKeys.all, 'list', filter] as const,
  detail: (uuid: string) => [...whiteboardKeys.all, 'detail', uuid] as const,
};

/** The caller's username; also hands it to the local adapter until the backend reads the JWT. */
export function useActor(): string {
  const username = useCurrentAccount().data?.account?.username ?? '';
  useEffect(() => setLocalActor(username), [username]);
  return username;
}

export function useWhiteboards(filter: ListWhiteboardsFilter) {
  return useQuery({
    queryKey: whiteboardKeys.list(filter),
    queryFn: () => whiteboardService.ListWhiteboards(filter),
    // Typing in search changes the key on every keystroke; keep the grid instead of blinking empty.
    placeholderData: keepPreviousData,
  });
}

export function useWhiteboard(uuid: string) {
  return useQuery({
    queryKey: whiteboardKeys.detail(uuid),
    queryFn: () => whiteboardService.GetWhiteboard(uuid),
    retry: false,
  });
}

function useSettle() {
  const qc = useQueryClient();
  return (w?: Whiteboard) => {
    if (w) qc.setQueryData(whiteboardKeys.detail(w.uuid), w);
    return qc.invalidateQueries({ queryKey: [...whiteboardKeys.all, 'list'] });
  };
}

export function useAddWhiteboard() {
  const settle = useSettle();
  return useMutation({
    mutationFn: (insert: WhiteboardInsert) => whiteboardService.AddWhiteboard(insert),
    onSuccess: settle,
    onError: (e) => notifyFailure('WHITEBOARD', 'The whiteboard was not created.', e),
  });
}

export function useRenameWhiteboard(uuid: string) {
  const settle = useSettle();
  return useMutation({
    mutationFn: (title: string) => whiteboardService.UpdateWhiteboard(uuid, { title }),
    onSuccess: settle,
    onError: (e) => notifyFailure('WHITEBOARD', 'The title was not saved.', e),
  });
}
