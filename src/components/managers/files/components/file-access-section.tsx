import { useEffect, useMemo, useState, type ChangeEvent, type FocusEvent } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { LibraryFile, LibraryFileAccess } from 'api/proto-http/admin';
import { publicFilePageUrl, shareTokenOf } from 'components/file-share-viewer/link';
import { usePermissions } from 'components/managers/accounts/utils/permissions';
import { useAdmins } from 'components/managers/tech-card/components/useRoles';
import { useSnackBarStore } from 'lib/stores/store';
import {
  Avatar,
  Button,
  CalloutBox,
  Chip,
  ChipRow,
  ConfirmationModal,
  Input,
  Pill,
  Text,
} from 'ui';
import {
  ACCESS_LEVEL_TITLE,
  ACCESS_LEVELS,
  accessService,
  asAccessLevel,
  LINK_TTLS,
  type AccessLevel,
} from '../api/accessService';
import { isUnknownRoute } from '../api/rpc-error';
import { filesKeys, invalidateFileViews } from '../hooks/useFiles';
import { plural } from '../upload/text';
import { formatWhen, formatWhenShort } from '../utils/format';
import { FailureText } from './failure-text';

export const accessKeys = {
  ofFile: (fileId: number) => [...filesKeys.file(fileId), 'access'] as const,
};

export function useFileAccess(fileId: number, enabled = true) {
  return useQuery({
    queryKey: accessKeys.ofFile(fileId),
    queryFn: () => accessService.get(fileId),
    enabled: enabled && fileId > 0,
    retry: false,
    staleTime: 60 * 1000,
  });
}

/** Access editor mounted only while the card's access row is open. */
export function FileAccessSection({
  file,
  writable,
  phone,
  onLinkChange,
}: {
  file: LibraryFile;
  writable: boolean;
  phone: boolean;
  onLinkChange?: (url?: string) => void;
}) {
  const qc = useQueryClient();
  const { account, isSuper, resolved } = usePermissions();
  const { data: adminsData } = useAdmins();
  const { showMessage } = useSnackBarStore();
  const fileId = Number(file.id ?? 0);
  const { data, isLoading, isError, error } = useFileAccess(fileId);

  const [applied, setApplied] = useState<LibraryFileAccess>();
  useEffect(() => setApplied(undefined), [data]);

  const access = applied ?? data?.access;
  const level: AccessLevel =
    asAccessLevel(access?.level) ?? asAccessLevel(file.accessLevel) ?? 'team';
  const link = access?.link;
  const people = useMemo(() => access?.people ?? [], [access]);
  const peopleIds = useMemo(
    () => people.map((person) => Number(person.id ?? 0)).filter((id) => id > 0),
    [people],
  );

  const uploaderId = Number(file.uploadedById ?? 0);
  const uploaderName = file.uploadedBy ?? '';
  const me = account?.username ?? '';
  const owners = useMemo(() => file.owners ?? [], [file.owners]);
  const inCircle =
    !resolved ||
    isSuper ||
    (!!me &&
      ((me === uploaderName && uploaderId > 0) || owners.some((owner) => owner.username === me)));
  const mayEdit = writable && inCircle;

  const [picking, setPicking] = useState(false);
  const [picked, setPicked] = useState<number[]>([]);
  const [query, setQuery] = useState('');
  const [pendingLevel, setPendingLevel] = useState<AccessLevel>();
  const [confirmRotate, setConfirmRotate] = useState(false);
  const [confirmForever, setConfirmForever] = useState(false);
  const [chosenTtl, setChosenTtl] = useState<number>();

  const invalidate = () => invalidateFileViews(qc);
  const setAccess = useMutation({
    mutationFn: (args: { level: AccessLevel; adminIds: number[]; linkTtl: number }) =>
      accessService.set({ fileId, ...args }),
    retry: 0,
    onSuccess: (response, variables) => {
      setApplied(response.access ?? undefined);
      setChosenTtl(variables.level === 'link' ? variables.linkTtl : undefined);
      if (variables.level === 'people' && variables.adminIds.length === 0 && !picking) {
        setPicked([]);
        setQuery('');
        setPicking(true);
      }
      invalidate();
    },
  });
  const rotate = useMutation({
    mutationFn: () => accessService.rotate(fileId),
    retry: 0,
    onSuccess: (response) => {
      setApplied((current) => {
        const base = current ?? access;
        return base ? { ...base, link: response.link } : base;
      });
      invalidate();
      showMessage('link rotated', 'success');
    },
  });

  const busy = setAccess.isPending || rotate.isPending;
  const currentTtl = chosenTtl ?? (link?.url ? (link.expiresAt ? undefined : 0) : undefined);
  const linkTtlFor = (next: AccessLevel): number => {
    if (next !== 'link') return 0;
    if (chosenTtl !== undefined) return chosenTtl;
    if (link?.url) return link.expiresAt ? 168 : 0;
    return 168;
  };
  const adminIdsFor = (next: AccessLevel): number[] => (next === 'people' ? peopleIds : []);
  const applyLevel = (next: AccessLevel) =>
    setAccess.mutate({ level: next, adminIds: adminIdsFor(next), linkTtl: linkTtlFor(next) });

  const shownUrl = publicFilePageUrl(link?.url);
  const shareToken = shareTokenOf(link?.url);
  useEffect(() => onLinkChange?.(shownUrl || undefined), [onLinkChange, shownUrl]);

  const copyLink = async () => {
    if (!shownUrl) return;
    try {
      await navigator.clipboard.writeText(shownUrl);
      showMessage('link copied', 'success');
    } catch {
      showMessage('copy failed', 'error');
    }
  };

  const openPicker = () => {
    setPicked(peopleIds);
    setQuery('');
    setAccess.reset();
    setPicking(true);
  };

  const admins = useMemo(() => adminsData?.admins ?? [], [adminsData]);
  const pickerRows = useMemo(() => {
    const seen = new Set<number>();
    const known = new Set(admins.map((admin) => Number(admin.id ?? 0)).filter((id) => id > 0));
    const rows: { id: number; username: string; specialties: string[]; missing: boolean }[] = [];
    people.forEach((person) => {
      const id = Number(person.id ?? 0);
      if (!id || seen.has(id)) return;
      seen.add(id);
      rows.push({
        id,
        username: person.username ?? `#${id}`,
        specialties: person.specialties ?? [],
        missing: known.size > 0 && !known.has(id),
      });
    });
    admins.forEach((admin) => {
      const id = Number(admin.id ?? 0);
      if (!id || seen.has(id)) return;
      seen.add(id);
      rows.push({
        id,
        username: admin.username ?? `#${id}`,
        specialties: admin.specialties ?? [],
        missing: false,
      });
    });
    return rows;
  }, [admins, people]);
  const normalizedQuery = query.trim().toLowerCase();
  const found = normalizedQuery
    ? pickerRows.filter(
        (person) =>
          person.username.toLowerCase().includes(normalizedQuery) ||
          person.specialties.some((specialty) => specialty.toLowerCase().includes(normalizedQuery)),
      )
    : pickerRows;

  const pendingTtl = linkTtlFor('link');
  const pendingTtlLabel = LINK_TTLS.find((ttl) => ttl.hours === pendingTtl)?.label ?? '';
  const touchClass = phone ? 'min-h-11' : undefined;

  if (isLoading) {
    return (
      <Text size='micro' variant='label'>
        loading…
      </Text>
    );
  }

  if (isError) {
    return (
      <Text size='micro' variant='error'>
        {isUnknownRoute(error) ? (
          'access unavailable'
        ) : (
          <FailureText e={error} fallback='access unavailable' />
        )}
      </Text>
    );
  }

  return (
    <div className='flex flex-col gap-2'>
      <ChipRow>
        {ACCESS_LEVELS.map((candidate) => {
          const selected = level === candidate;
          return (
            <Chip
              key={candidate}
              selected={selected}
              pressed={selected}
              disabled={!mayEdit || busy}
              className={touchClass}
              onClick={() => {
                if (selected) return;
                setAccess.reset();
                setPendingLevel(candidate);
              }}
            >
              {ACCESS_LEVEL_TITLE[candidate]}
            </Chip>
          );
        })}
      </ChipRow>

      {level === 'people' && (
        <div className='flex flex-wrap items-center gap-1.5'>
          <ChipRow>
            {people.map((person) => (
              <Chip key={person.id} selected>
                {person.username || `#${person.id}`}
              </Chip>
            ))}
            {!people.length && (
              <Text size='micro' variant='label' component='span'>
                none
              </Text>
            )}
          </ChipRow>
          <Button
            size='xs'
            variant='underline'
            disabled={!mayEdit || busy}
            className={touchClass}
            onClick={openPicker}
          >
            people
          </Button>
        </div>
      )}

      {level === 'link' && (
        <div className='flex flex-col gap-2'>
          {shownUrl ? (
            <div className='flex flex-wrap items-center gap-1.5'>
              <Input
                name='publicLink'
                aria-label='public link'
                value={shownUrl}
                readOnly
                className={`${phone ? 'min-h-11' : ''} min-w-[220px] flex-1`}
                onFocus={(event: FocusEvent<HTMLInputElement>) => event.target.select()}
              />
              <Button size='xs' variant='underline' className={touchClass} onClick={copyLink}>
                copy link
              </Button>
              {link?.expired && <Pill tone='warn'>expired</Pill>}
            </div>
          ) : (
            <Text size='micro' variant='label'>
              {link?.url ? (shareToken ? 'domain missing' : 'link unavailable') : 'no link'}
            </Text>
          )}

          <div className='flex flex-wrap items-center gap-1.5'>
            <Text size='micro' variant='label' component='span'>
              expiry
            </Text>
            <ChipRow>
              {LINK_TTLS.map((ttl) => (
                <Chip
                  key={ttl.hours}
                  selected={currentTtl === ttl.hours}
                  pressed={currentTtl === ttl.hours}
                  disabled={!mayEdit || busy}
                  className={touchClass}
                  onClick={() => {
                    if (ttl.hours === 0 && currentTtl !== 0) {
                      setConfirmForever(true);
                      return;
                    }
                    setAccess.mutate({ level: 'link', adminIds: [], linkTtl: ttl.hours });
                  }}
                >
                  {ttl.label}
                </Chip>
              ))}
            </ChipRow>
          </div>
          <div className='flex flex-wrap items-center gap-2'>
            <Text size='micro' variant='label' component='span'>
              {link?.expiresAt
                ? `${link.expired ? 'expired' : 'valid'} · ${formatWhen(link.expiresAt)}`
                : 'no expiry'}
            </Text>
            <Button
              size='xs'
              variant='underline'
              disabled={!mayEdit || busy || !link?.url}
              className={touchClass}
              onClick={() => {
                rotate.reset();
                setConfirmRotate(true);
              }}
            >
              rotate link
            </Button>
            {!!Number(link?.accessCount ?? 0) && (
              <Text size='micro' variant='label' component='span' className='tabular-nums'>
                opened {Number(link?.accessCount ?? 0)}{' '}
                {plural(Number(link?.accessCount ?? 0), 'time')}
                {link?.lastAccessAt ? ` · ${formatWhenShort(link.lastAccessAt)}` : ''}
              </Text>
            )}
          </div>
        </div>
      )}

      {setAccess.isError && (
        <CalloutBox tone='error'>
          <Text size='micro' component='span'>
            <FailureText e={setAccess.error} fallback="couldn't change access" />
          </Text>
        </CalloutBox>
      )}
      {rotate.isError && (
        <CalloutBox tone='error'>
          <Text size='micro' component='span'>
            <FailureText e={rotate.error} fallback="couldn't rotate link" />
          </Text>
        </CalloutBox>
      )}

      <ConfirmationModal
        open={!!pendingLevel}
        onOpenChange={(open) => !open && setPendingLevel(undefined)}
        onConfirm={() => {
          if (pendingLevel) applyLevel(pendingLevel);
          setPendingLevel(undefined);
        }}
        title={pendingLevel ? `access: ${ACCESS_LEVEL_TITLE[pendingLevel]}` : 'access'}
        confirmLabel='apply'
        width='sm'
      >
        <div className='flex flex-col gap-2'>
          {pendingLevel === 'link' && (
            <Text>Anyone with the link can open the file. Expiry: {pendingTtlLabel}.</Text>
          )}
          {pendingLevel === 'people' && (
            <Text>
              {peopleIds.length
                ? 'The file disappears for everyone outside the list.'
                : 'The list is empty. Only the uploader, owners, and super admins keep access.'}
            </Text>
          )}
          {pendingLevel === 'team' && <Text>The whole team gets access.</Text>}
          {level === 'link' && pendingLevel !== 'link' && (
            <Text>The current public link stops working immediately.</Text>
          )}
        </div>
      </ConfirmationModal>

      <ConfirmationModal
        open={confirmForever}
        onOpenChange={setConfirmForever}
        onConfirm={() => setAccess.mutate({ level: 'link', adminIds: [], linkTtl: 0 })}
        title='no expiry'
        confirmLabel='keep open'
        cancelLabel='keep expiry'
        width='sm'
      >
        <Text>The link stays open until it is rotated or access changes.</Text>
      </ConfirmationModal>

      <ConfirmationModal
        open={confirmRotate}
        onOpenChange={setConfirmRotate}
        onConfirm={() => rotate.mutate()}
        title='rotate link'
        confirmLabel='rotate'
        cancelLabel='keep'
        width='sm'
      >
        <Text>The current link stops working immediately. Send the new address again.</Text>
      </ConfirmationModal>

      <ConfirmationModal
        open={picking}
        onOpenChange={(open) => {
          if (!open) setAccess.reset();
          setPicking(open);
        }}
        onConfirm={async () => {
          try {
            await setAccess.mutateAsync({ level: 'people', adminIds: picked, linkTtl: 0 });
            setPicking(false);
          } catch {
            // Keep the rejected selection visible.
          }
        }}
        title='these people'
        confirmLabel={setAccess.isPending ? 'saving…' : 'save'}
        confirmDisabled={setAccess.isPending}
        closeOnConfirm={false}
        width='md'
      >
        <div className='flex flex-col gap-2'>
          <div className='flex flex-wrap items-center gap-2'>
            <Input
              name='accessQuery'
              aria-label='find people'
              value={query}
              placeholder='find people'
              className={`${phone ? 'min-h-11' : ''} max-w-[240px]`}
              onChange={(event: ChangeEvent<HTMLInputElement>) => setQuery(event.target.value)}
            />
            <Text size='micro' variant='label' component='span' className='tabular-nums'>
              {picked.length} selected
            </Text>
          </div>
          <div className='flex max-h-72 flex-col overflow-y-auto'>
            {found.map((person) => {
              const isUploader = uploaderId > 0 && person.id === uploaderId;
              const selected = isUploader || picked.includes(person.id);
              return (
                <button
                  key={person.id}
                  type='button'
                  aria-pressed={selected}
                  disabled={isUploader}
                  onClick={() =>
                    setPicked((current) =>
                      current.includes(person.id)
                        ? current.filter((id) => id !== person.id)
                        : [...current, person.id],
                    )
                  }
                  className='flex min-h-11 items-center gap-2 border-b border-hairline px-1 py-1.5 text-left last:border-b-0 enabled:hover:bg-pageBg focus-visible:outline focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-textColor disabled:cursor-not-allowed'
                >
                  <span
                    aria-hidden
                    className={`flex size-3.5 flex-none items-center justify-center border ${
                      selected ? 'border-textColor bg-textColor text-bgColor' : 'border-borderColor'
                    }`}
                  >
                    {selected && <span className='text-nano leading-none'>✓</span>}
                  </span>
                  <Avatar name={person.username} size={20} />
                  <span className='flex min-w-0 flex-col'>
                    <Text size='micro' component='span' className='truncate uppercase'>
                      {person.username}
                    </Text>
                    <Text
                      size='nano'
                      variant='label'
                      component='span'
                      className='truncate uppercase'
                    >
                      {isUploader
                        ? 'uploader'
                        : person.missing
                          ? 'disabled'
                          : person.specialties.join(', ') || 'no specialty'}
                    </Text>
                  </span>
                </button>
              );
            })}
            {!found.length && (
              <Text size='micro' variant='label'>
                none
              </Text>
            )}
          </div>
          {setAccess.isError && (
            <CalloutBox tone='error'>
              <Text size='micro' component='span'>
                <FailureText e={setAccess.error} fallback="couldn't change people" />
              </Text>
            </CalloutBox>
          )}
        </div>
      </ConfirmationModal>
    </div>
  );
}
