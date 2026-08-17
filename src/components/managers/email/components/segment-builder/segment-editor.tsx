// Segment editor (route /email-segments/:id, id=0/new for create). Name + description
// + the recursive predicate-tree builder, plus the audience-count preview seam and a
// delete action. State is plain useState (name/description/root) rather than RHF: the
// predicate tree is already controlled recursion, so a single local model keeps the
// editor coherent instead of straddling two state systems.

import { common_EmailSegment } from 'api/proto-http/admin';
import { usePermissions } from 'components/managers/accounts/utils/permissions';
import { ROUTES, SECTION } from 'constants/routes';
import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useSnackBarStore } from 'lib/stores/store';
import { Button } from 'ui/components/button';
import { ConfirmationModal } from 'ui/components/confirmation-modal';
import Input from 'ui/components/input';
import { Section, SectionStack } from 'ui/components/section';
import Textarea from 'ui/components/text-area';
import Text from 'ui/components/text';
import { useDeleteSegment, useSegment, useUpsertSegment } from '../useCampaign';
import { PredicateBuilder } from './predicate-builder';
import {
  fromPredicate,
  GroupNode,
  isEmptyPredicate,
  newRootGroup,
  toPredicate,
  validateTree,
} from './predicate-model';
import { usePreviewSegmentCount } from './usePreviewSegmentCount';

function formatCount(n: number | undefined): string | undefined {
  if (typeof n !== 'number') return undefined;
  return n.toLocaleString('en-US');
}

export function SegmentEditor() {
  const { id: idParam } = useParams<{ id: string }>();
  const routeId = idParam && /^\d+$/.test(idParam) ? Number(idParam) : 0;
  const navigate = useNavigate();
  const { canWrite } = usePermissions();
  const { showMessage } = useSnackBarStore();
  const canEdit = canWrite(SECTION.marketing);

  const { data: segment, isLoading, isError, refetch } = useSegment(routeId);
  const upsert = useUpsertSegment();
  const del = useDeleteSegment();
  const preview = usePreviewSegmentCount();

  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [root, setRoot] = useState<GroupNode>(() => newRootGroup());
  const [nameTouched, setNameTouched] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  // Incomplete conditions are only marked once the operator tries to save/preview —
  // a freshly-added condition starts empty and shouldn't shout before it's been filled.
  const [treeTouched, setTreeTouched] = useState(false);

  // Hydrate the editor from a loaded segment (edit route).
  useEffect(() => {
    if (routeId > 0 && segment) {
      setName(segment.name ?? '');
      setDescription(segment.description ?? '');
      setRoot(fromPredicate(segment.predicate));
    }
  }, [segment, routeId]);

  const nameError = nameTouched && name.trim() === '';
  const empty = isEmptyPredicate(root);

  // The backend compiler rejects a leaf whose values don't match its operator's arity
  // and reports it as one opaque error for the whole tree, so check locally first and
  // mark the offending rows instead of letting the operator guess which one broke.
  const leafIssues = useMemo(() => validateTree(root), [root]);
  const issueMap = useMemo(
    () => Object.fromEntries(leafIssues.map((i) => [i.id, i.message])),
    [leafIssues],
  );

  const treeComplete = () => {
    setTreeTouched(true);
    if (leafIssues.length === 0) return true;
    showMessage(
      `${leafIssues.length} condition${leafIssues.length === 1 ? ' is' : 's are'} incomplete — see the highlighted row${leafIssues.length === 1 ? '' : 's'}`,
      'error',
    );
    return false;
  };

  const handleSave = async () => {
    setNameTouched(true);
    if (name.trim() === '') {
      showMessage('segment name is required', 'error');
      return;
    }
    if (!treeComplete()) return;
    const seg: common_EmailSegment = {
      id: routeId || undefined,
      name: name.trim(),
      description: description.trim(),
      predicate: toPredicate(root),
      lastCount: undefined,
      lastCountAt: undefined,
    };
    try {
      const res = await upsert.mutateAsync({ id: routeId, segment: seg });
      showMessage('segment saved', 'success');
      if (routeId === 0 && res?.id) navigate(`${ROUTES.emailSegments}/${res.id}`);
    } catch {
      // error toast surfaced by useUpsertSegment.onError
    }
  };

  const handleDelete = async () => {
    try {
      await del.mutateAsync(routeId);
      showMessage('segment deleted', 'success');
      navigate(ROUTES.emailSegments);
    } catch {
      // error toast surfaced by useDeleteSegment.onError
    }
  };

  if (routeId > 0 && isLoading) {
    return (
      <div className='flex justify-center py-20'>
        <Text variant='inactive' className='animate-pulse'>
          loading segment…
        </Text>
      </div>
    );
  }

  if (routeId > 0 && isError) {
    return (
      <div className='flex flex-col items-center gap-3 py-20'>
        <Text variant='error'>couldn&apos;t load this segment.</Text>
        <Button type='button' variant='secondary' size='lg' onClick={() => refetch()}>
          retry
        </Button>
      </div>
    );
  }

  const lastCount = formatCount(segment?.lastCount);

  return (
    <div className='flex flex-col'>
      {/* header bar */}
      <div className='sticky top-0 z-10 -mx-2.5 mb-6 flex flex-wrap items-center justify-between gap-3 border-b border-textInactiveColor bg-bgColor px-2.5 py-3'>
        <div className='flex items-baseline gap-2'>
          <Button
            type='button'
            variant='secondary'
            className='px-2 py-1'
            onClick={() => navigate(ROUTES.emailSegments)}
          >
            ← segments
          </Button>
          <Text variant='uppercase' size='large'>
            {routeId > 0 ? 'edit segment' : 'new segment'}
          </Text>
        </div>
        <div className='flex items-center gap-2'>
          {routeId > 0 && canEdit && (
            <Button
              type='button'
              variant='secondary'
              size='lg'
              className='uppercase'
              onClick={() => setDeleteOpen(true)}
            >
              delete
            </Button>
          )}
          <Button
            type='button'
            variant='main'
            size='lg'
            className='uppercase'
            onClick={handleSave}
            disabled={!canEdit || upsert.isPending}
            loading={upsert.isPending}
          >
            save
          </Button>
        </div>
      </div>

      <SectionStack className='mx-auto w-full max-w-[900px]'>
        {/* details */}
        <Section title='segment details'>
          <div className='flex flex-col gap-1'>
            <Text variant='label' size='small'>
              name
            </Text>
            <Input
              name='segment-name'
              value={name}
              onChange={(e: React.ChangeEvent<HTMLInputElement>) => setName(e.target.value)}
              onBlur={() => setNameTouched(true)}
              disabled={!canEdit}
              placeholder='internal segment name'
              aria-invalid={nameError || undefined}
              className='px-0'
            />
            {nameError && (
              <Text variant='error' size='small'>
                name is required
              </Text>
            )}
          </div>
          <div className='flex flex-col gap-1'>
            <Text variant='label' size='small'>
              description (optional)
            </Text>
            <Textarea
              name='segment-description'
              value={description}
              onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) =>
                setDescription(e.target.value)
              }
              disabled={!canEdit}
              placeholder='what this audience is / when to use it'
              className='mb-0 min-h-20 border border-borderColor px-3 py-2'
            />
          </div>
        </Section>

        {/* predicate builder */}
        <Section
          title='audience rules'
          question='build a tree of conditions. groups combine their conditions with AND (match all) or OR (match any); an empty tree targets everyone.'
          action={
            empty && (
              <span className='border border-borderColor px-1.5 py-0.5 leading-none'>
                <Text size='small' variant='uppercase'>
                  everyone
                </Text>
              </span>
            )
          }
        >
          <PredicateBuilder
            value={root}
            onChange={setRoot}
            disabled={!canEdit}
            issues={treeTouched ? issueMap : undefined}
          />
        </Section>

        {/* audience-count preview seam */}
        <Section>
          <div className='flex flex-wrap items-center gap-3'>
            <Button
              type='button'
              variant='secondary'
              size='lg'
              className='uppercase'
              onClick={() => {
                if (!preview.available) return;
                if (!treeComplete()) return;
                // Passing the saved id lets the backend cache the count on the segment
                // (last_count / last_count_at) — with id=0 (new segment) it just counts.
                preview.mutate({ id: routeId, predicate: toPredicate(root) });
              }}
              disabled={!preview.available || preview.isPending}
              loading={preview.isPending}
              title={preview.available ? undefined : 'live count available after deploy'}
            >
              preview audience count
            </Button>
            {!preview.available ? (
              <Text size='small' variant='inactive'>
                live count available after deploy
              </Text>
            ) : preview.data != null ? (
              <Text size='small'>≈ {formatCount(preview.data)} recipients</Text>
            ) : null}
            {lastCount && (
              <Text size='small' variant='inactive'>
                last known: {lastCount}
              </Text>
            )}
          </div>
        </Section>
      </SectionStack>

      <ConfirmationModal
        open={deleteOpen}
        onOpenChange={setDeleteOpen}
        title='delete segment'
        confirmLabel='delete'
        onConfirm={handleDelete}
      >
        <Text>
          delete this segment? campaigns that reference it will fall back to no segment (everyone).
        </Text>
      </ConfirmationModal>
    </div>
  );
}

export default SegmentEditor;
