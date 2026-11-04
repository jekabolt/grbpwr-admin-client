// The composition label as a row of its own block: location, pin, material like any sewn-in, but the
// artwork comes from `rebuild`: ONE pdf per colourway × size, made by the same generator as the ZIP,
// put in the library behind a secret link, or from a file a person chose (see
// composition-artwork-model.ts). The set changes in one write once every file has arrived, so a
// failure halfway leaves the printed QR codes pointing where they did.
import type { common_TechCard } from 'api/proto-http/admin';
import { usePermissions } from 'components/managers/accounts/utils/permissions';
import { failureText } from 'components/managers/files/api/rpc-error';
import { SECTION } from 'constants/routes';
import { notify } from 'lib/stores/store';
import { useMemo, useRef, useState, type JSX } from 'react';
import { useFormContext } from 'react-hook-form';
import { Button, Pill, Progress, Text } from 'ui';
import type { FullPlan } from '../../care-labels/print-job';
import { fileSlug, variantHash, variantPdf } from '../../care-labels/pages';
import type { Readiness } from '../../care-labels/readiness';
import { upsertGarmentLabel } from '../form-writers';
import { uploadPublicFile } from '../label-artwork-upload';
import type { FormGarmentLabel } from '../labels-schema';
import type { TechCardFormData } from '../schema';
import {
  COMPOSITION_LABEL_KEY,
  isCompositionLabel,
  isOwnArtworkFile,
  type LabelAxes,
} from '../sewn-label-model';
import { bornLabelFacts, SewnLabelRow } from '../sewn-label-row';
import { useUndoHistory } from '../undo-history';
import { useLabelAxes } from '../use-label-axes';
import { wireInt } from '../wire-int';
import { ArtworkChoiceChips, CompositionArtwork, type ArtworkCellRef } from './composition-artwork';
import { oneFileOf, type ArtworkChoice } from './composition-artwork-model';

type StoredFile = NonNullable<FormGarmentLabel['files']>[number];

const cellOf = (colorwayId: number, sizeId: number) => `${colorwayId}:${sizeId}`;

/** The input fingerprint of every cell the plan can make, keyed by colourway and size. */
function useVariantHashes(plan: FullPlan | null, axes: LabelAxes): Map<string, string> {
  return useMemo(() => {
    const out = new Map<string, string>();
    if (!plan) return out;
    for (const c of axes.colorways) {
      const set = plan.sets.get(c.id);
      if (!set) continue;
      for (const s of axes.sizes) {
        const hash = variantHash(set, s.id);
        if (hash) out.set(cellOf(c.id, s.id), hash);
      }
    }
    return out;
  }, [plan, axes]);
}

export function CompositionLabelRow({
  techCard,
  plan,
  readiness,
  skuOf,
  canEdit,
  files,
  choice,
  onChoice,
  onChooseFile,
  onClearFile,
  onEditText,
}: {
  techCard?: common_TechCard;
  plan: FullPlan | null;
  readiness: Readiness | null;
  skuOf: (colorwayId: number) => string;
  canEdit: boolean;
  files: readonly StoredFile[];
  choice: ArtworkChoice;
  onChoice: (choice: ArtworkChoice) => void;
  onChooseFile: (cell: ArtworkCellRef) => void;
  onClearFile: (cell: ArtworkCellRef) => void;
  onEditText: () => void;
}): JSX.Element {
  const { getValues, setValue } = useFormContext<TechCardFormData>();
  const { canWrite } = usePermissions();
  const undoHistory = useUndoHistory();
  const axes = useLabelAxes(techCard);
  const hashes = useVariantHashes(plan, axes);

  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  // Files that already arrived this session, by input: a retry after a failure re-uploads nothing.
  const arrived = useRef(new Map<string, { libraryFileId: number; publicUrl: string }>());

  const stale = files.some((f) => {
    if (isOwnArtworkFile(f)) return false;
    const want = hashes.get(cellOf(wireInt(f.colorwayId), wireInt(f.sizeId)));
    return !!want && f.sourceHash !== want;
  });

  const blockedIds = useMemo(
    () => new Set((readiness?.colorways ?? []).filter((c) => c.blocked).map((c) => c.colorwayId)),
    [readiness],
  );

  const rebuild = async (): Promise<void> => {
    if (!plan || progress) return;
    if (!canWrite(SECTION.files)) {
      notify({ sev: 'error', subject: '', text: '', bad: 'no files access' });
      return;
    }
    const live = ((getValues('garmentLabels') ?? []) as FormGarmentLabel[]).find((r) =>
      isCompositionLabel(r.key),
    );
    const old = live?.files ?? [];
    const oldCell = (colorwayId: number, sizeId: number) =>
      old.find((f) => wireInt(f.colorwayId) === colorwayId && wireInt(f.sizeId) === sizeId);

    const usable = axes.colorways.filter((c) => !blockedIds.has(c.id) && plan.sets.has(c.id));
    const skipped = axes.colorways.filter((c) => !usable.includes(c));
    if (usable.length === 0) {
      notify({ sev: 'error', subject: '', text: '', bad: 'label has blocks' });
      return;
    }

    // Own files are not this button's to touch: they pass through, and their cells are not built.
    const next: StoredFile[] = old.filter(isOwnArtworkFile);
    const queue: { colorwayId: number; sizeId: number; hash: string; name: string }[] = [];
    for (const c of usable) {
      for (const s of axes.sizes) {
        const hash = hashes.get(cellOf(c.id, s.id));
        if (!hash) continue;
        const have = oldCell(c.id, s.id);
        if (have && isOwnArtworkFile(have)) continue;
        if (have?.publicUrl?.trim() && have.sourceHash === hash) {
          next.push(have);
          continue;
        }
        const ready = arrived.current.get(`${c.id}:${s.id}:${hash}`);
        if (ready) {
          next.push({ colorwayId: c.id, sizeId: s.id, sourceHash: hash, ...ready });
          continue;
        }
        const stem = [skuOf(c.id) || `${c.id}`, c.name, s.label].map(fileSlug).join('-');
        queue.push({ colorwayId: c.id, sizeId: s.id, hash, name: `composition-${stem}.pdf` });
      }
    }
    // A colourway that cannot be laid out now keeps the files it had.
    for (const c of skipped) {
      next.push(...old.filter((f) => wireInt(f.colorwayId) === c.id && !isOwnArtworkFile(f)));
    }

    undoHistory.cut('label-upload');
    setProgress({ done: 0, total: queue.length });
    try {
      for (let i = 0; i < queue.length; i += 1) {
        const job = queue[i];
        const set = plan.sets.get(job.colorwayId);
        if (!set) continue;
        const bytes = variantPdf(set, job.sizeId);
        const file = new File([bytes as BlobPart], job.name, { type: 'application/pdf' });
        const up = await uploadPublicFile(file);
        arrived.current.set(`${job.colorwayId}:${job.sizeId}:${job.hash}`, up);
        next.push({
          colorwayId: job.colorwayId,
          sizeId: job.sizeId,
          sourceHash: job.hash,
          ...up,
        });
        setProgress({ done: i + 1, total: queue.length });
      }
    } catch (e) {
      notify({
        sev: 'error',
        subject: '',
        text: '',
        bad: failureText(e, 'rebuild failed'),
        action: { label: 'retry', onClick: () => void rebuild() },
      });
      setProgress(null);
      return;
    }
    upsertGarmentLabel(
      getValues,
      setValue,
      COMPOSITION_LABEL_KEY,
      live ? { files: next } : { ...bornLabelFacts(COMPOSITION_LABEL_KEY), files: next },
      { keepBare: true },
    );
    setProgress(null);
    if (skipped.length > 0) {
      notify({
        sev: 'error',
        subject: '',
        text: '',
        bad: `skipped: ${skipped.map((c) => c.name).join(', ')}`,
      });
    }
  };

  const one = choice === 'one';
  const nothingToBuild =
    !plan || axes.colorways.length === 0 || axes.sizes.length === 0 || !canEdit;

  return (
    <SewnLabelRow
      labelKey={COMPOSITION_LABEL_KEY}
      title='composition label'
      removable={false}
      techCard={techCard}
      axes={axes}
      canEdit={canEdit}
      last
      generated={{
        pills: one ? (
          oneFileOf(files) ? null : (
            <Pill tone='warn'>! no file</Pill>
          )
        ) : stale ? (
          <Pill tone='warn'>! rebuild</Pill>
        ) : null,
        hideMissing: one,
        action: (
          <span className='flex flex-wrap items-center gap-x-3 gap-y-1'>
            <ArtworkChoiceChips
              choice={choice}
              disabled={!canEdit || !!progress}
              onChoose={onChoice}
            />
            {one ? null : (
              <>
                <Button
                  type='button'
                  variant='underline'
                  size='xs'
                  data-composition-edit-text=''
                  onClick={onEditText}
                >
                  edit text
                </Button>
                <Button
                  type='button'
                  variant='underline'
                  size='xs'
                  disabled={nothingToBuild || !!progress}
                  onClick={() => void rebuild()}
                  data-composition-rebuild=''
                >
                  rebuild
                </Button>
              </>
            )}
            {progress ? (
              <span className='flex w-32 items-center gap-2' data-composition-progress=''>
                <Progress
                  value={progress.total ? (progress.done / progress.total) * 100 : 100}
                  className='flex-1'
                />
                <Text size='micro' variant='label' component='span' className='tabular-nums'>
                  {progress.done}/{progress.total}
                </Text>
              </span>
            ) : null}
          </span>
        ),
        body: (
          <CompositionArtwork
            choice={choice}
            files={files}
            axes={axes}
            plan={plan}
            blocked={blockedIds}
            canEdit={canEdit}
            onChoose={onChooseFile}
            onClear={onClearFile}
          />
        ),
      }}
    />
  );
}
