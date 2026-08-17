import { common_TechCard } from 'api/proto-http/admin';
import { findInDictionary } from 'lib/features/findInDictionary';
import { useDictionary } from 'lib/providers/dictionary-provider';
import { useSnackBarStore } from 'lib/stores/store';
import { useState } from 'react';
import { Button } from 'ui/components/button';
import { CalloutBox } from 'ui/components/callout-box';
import CheckboxCommon from 'ui/components/checkbox';
import { GroupLabel } from 'ui/components/group-label';
import Text from 'ui/components/text';
import {
  Field,
  selectCell,
  useSampleWriteoff,
  useWriteoffBatch,
  WriteoffSheet,
} from './sample-panels';
import {
  sampleFabricSourceFieldLabel,
  sampleFabricSourceHint,
  sampleFabricSourceOptions,
  samplePurposeOptions,
  sampleStatusOptions,
} from './sample-options';
import { saveSampleErrorMessage, useSaveSample } from './useSamples';

// Feature #47 — creating a sample and writing off what it ate. Owner ask (verbatim): "создание
// семпла должно списывать ткани и т.д. (помеченные как sample) из материалов со склада →
// dev-стоимость."
//
// Redesign 10.2: creating a sample and consuming stock are SEPARABLE jobs. The old 4-step inline
// wizard (basics → write-off → review → result) made the write-off feel mandatory and put three
// screens between "I sewed a sample" and a saved row. This is one short form; the write-off is a
// pre-filled block you can untick and do later from the sample's page.
//
// Orchestration only: it drives two EXISTING RPCs client-side — AddSample (→ new id) then ONE
// BatchIssueMaterialStock({ sampleId }) for the whole sheet (the same movements SampleMovements
// posts, so the sample's cost.materials_base and the stock ledger stay one source of truth).
//
// BACKEND GAP (narrowed): the write-off itself IS atomic now — the batch posts every line or none.
// What is still not one transaction is the SEAM between the two RPCs: there is no combined
// create-sample-with-writeoff, so the sample is created FIRST and a rejected write-off never rolls it
// back. The only reachable failure state is therefore "a sample with nothing issued against it" —
// never a half-issued one — and it is cleared by re-sending the same sheet, here or from the
// sample's materials panel. A combined transactional RPC would still be the fix if the create must
// be undone too.

type Colorway = { id?: number; code?: string; name?: string };

type BasicsDraft = {
  purpose: string;
  sizeId: number;
  colorwayId: number;
  status: string;
  fabricSource: string;
  startedAt: string;
  finishedAt: string;
  notes: string;
};

const emptyBasics: BasicsDraft = {
  purpose: 'proto',
  sizeId: 0,
  colorwayId: 0,
  status: 'planned',
  fabricSource: 'sample',
  startedAt: '',
  finishedAt: '',
  notes: '',
};

const colorwayText = (c?: Colorway): string =>
  c ? c.name || c.code || `colourway #${c.id ?? '?'}` : '—';

export function SampleCreationWizard({
  techCardId,
  techCard,
  colorways,
  canEdit,
  canReadCosting,
  onCancel,
  onCreated,
}: {
  techCardId: number;
  techCard?: common_TechCard;
  // Resolved by the parent (SamplesTab) off the live techCard — passed in to avoid a circular import.
  colorways: Colorway[];
  canEdit: boolean;
  canReadCosting: boolean;
  onCancel: () => void;
  // Called with the fresh server id — the parent swaps in the full sample editor (its sub-panels
  // need a saved id).
  onCreated: (id: number) => void;
}) {
  const { dictionary } = useDictionary();
  const { showMessage } = useSnackBarStore();
  const save = useSaveSample();
  const issuer = useWriteoffBatch();
  const busy = save.isPending || issuer.isPending;

  const [d, setD] = useState<BasicsDraft>(emptyBasics);
  const set = (patch: Partial<BasicsDraft>) => setD((prev) => ({ ...prev, ...patch }));

  // The write-off sheet reads the style's BOM and pre-fills each line from the colourway recipe's
  // consumption norm for the size being sewn — so it re-derives as the operator picks them.
  const wo = useSampleWriteoff({
    techCard,
    colorwayId: d.colorwayId,
    sizeId: d.sizeId,
    canReadCosting,
  });

  // Checked by default: the common path (sew a sample, consume the BOM) is unchanged.
  const [writeOff, setWriteOff] = useState(true);
  const [editLines, setEditLines] = useState(false);

  // Post-create state. `createdId` is the guard that a retry can never re-create the sample; a
  // non-empty `failure` means the sample exists and its write-off wrote nothing at all.
  const [createdId, setCreatedId] = useState(0);
  const [failure, setFailure] = useState('');

  const sizeIds = techCard?.techCard?.sizeIds ?? [];
  const blocked = writeOff && wo.incomplete > 0;

  const create = async () => {
    if (!canEdit || busy) return;
    // 1) Create the sample. Photos, provenance and the pattern snapshot are added next, in the
    //    full editor — creation stays one screen.
    let newId = 0;
    try {
      newId = await save.mutateAsync({
        id: 0,
        expectedLockVersion: 0,
        sample: {
          techCardId,
          purpose: d.purpose,
          sizeId: d.sizeId || 0,
          colorwayId: d.colorwayId || 0,
          status: d.status,
          fabricSource: d.fabricSource,
          notes: d.notes.trim(),
          startedAt: d.startedAt,
          finishedAt: d.finishedAt,
          mediaIds: [],
          patternUrl: '',
          patternNote: '',
          roundNumber: 0,
          specReleaseId: 0,
          previousSampleId: 0,
        },
      });
    } catch (e) {
      showMessage(saveSampleErrorMessage(e), 'error');
      return;
    }
    if (!newId) {
      showMessage('Sample created, but its id was not returned — open it from the board.', 'error');
      return;
    }
    setCreatedId(newId);

    // 2) No write-off asked for (or nothing ticked) → straight into the sample editor.
    if (!writeOff || wo.selected.length === 0) {
      showMessage('Sample created', 'success');
      onCreated(newId);
      return;
    }

    // 3) Write off the ticked lines in ONE atomic batch. A failure here neither unmakes the sample
    //    nor moves any stock, so there is nothing to reconcile — only a sheet to re-send.
    const res = await issuer.run(newId, wo.selected, 'sample creation write-off');
    if (res.ok) {
      showMessage(`Sample created · ${res.lines.length} material(s) written off`, 'success');
      onCreated(newId);
      return;
    }
    setFailure(res.error);
    showMessage(
      "Sample created, but nothing was written off — retry below or issue from the sample's materials panel",
      'error',
    );
  };

  // Re-send the WHOLE sheet against the already-created sample: the rejected batch wrote nothing, so
  // there is no failed subset to single out.
  const retryWriteoff = async () => {
    if (!createdId || !wo.selected.length || busy) return;
    const res = await issuer.run(createdId, wo.selected, 'sample creation write-off (retry)');
    if (res.ok) {
      showMessage(`${res.lines.length} material(s) written off`, 'success');
      onCreated(createdId);
      return;
    }
    setFailure(res.error);
    showMessage('Still nothing written off — the whole batch was rejected again', 'error');
  };

  // ---- failure report: the sample exists, NO stock moved ----
  if (failure) {
    return (
      <div className='flex flex-col gap-2.5 border border-borderColor p-2.5'>
        <CalloutBox tone='error'>
          <Text size='micro'>
            <b>The sample was created, but nothing was written off.</b> The write-off posts as one
            transaction, so its rejection left the ledger and every balance untouched — no material
            is half-issued against this sample. {failure}
          </Text>
        </CalloutBox>
        <Text size='micro' variant='label'>
          retry sends the same {wo.selected.length} line(s) again — creating the sample is already
          done and is never repeated
        </Text>
        <div className='flex flex-wrap items-center justify-between gap-2'>
          <Button
            type='button'
            variant='secondary'
            size='sm'
            disabled={busy || !wo.selected.length}
            onClick={retryWriteoff}
          >
            {busy ? 'issuing…' : 'retry write-off'}
          </Button>
          <Button type='button' variant='main' size='sm' onClick={() => onCreated(createdId)}>
            open sample →
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className='flex flex-col gap-2.5 border border-borderColor p-2.5'>
      <div className='grid grid-cols-1 gap-2 sm:grid-cols-3'>
        <Field label='purpose'>
          <select
            className={selectCell}
            disabled={!canEdit}
            value={d.purpose}
            onChange={(e) => set({ purpose: e.target.value })}
          >
            {samplePurposeOptions.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </Field>
        <Field label='size'>
          <select
            className={selectCell}
            disabled={!canEdit}
            value={d.sizeId || 0}
            onChange={(e) => set({ sizeId: Number(e.target.value) || 0 })}
          >
            <option value={0}>— unset —</option>
            {sizeIds.map((sid) => (
              <option key={sid} value={sid}>
                {findInDictionary(dictionary, sid, 'size') || sid}
              </option>
            ))}
          </select>
        </Field>
        <Field label='colourway'>
          <select
            className={selectCell}
            disabled={!canEdit || colorways.length === 0}
            value={d.colorwayId || 0}
            onChange={(e) => set({ colorwayId: Number(e.target.value) || 0 })}
          >
            <option value={0}>— unset —</option>
            {colorways.map((c) => (
              <option key={c.id} value={c.id ?? 0}>
                {colorwayText(c)}
              </option>
            ))}
          </select>
        </Field>
      </div>

      <div className='grid grid-cols-1 gap-2 sm:grid-cols-2'>
        <Field label='started'>
          <input
            className={selectCell}
            type='date'
            disabled={!canEdit}
            value={d.startedAt}
            onChange={(e) => set({ startedAt: e.target.value })}
          />
        </Field>
        <Field label='status'>
          <select
            className={selectCell}
            disabled={!canEdit}
            value={d.status}
            onChange={(e) => set({ status: e.target.value })}
          >
            {sampleStatusOptions.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </Field>
      </div>

      <div className='grid grid-cols-1 gap-2 sm:grid-cols-2'>
        <Field label={sampleFabricSourceFieldLabel} hint={sampleFabricSourceHint}>
          <select
            className={selectCell}
            disabled={!canEdit}
            value={d.fabricSource}
            onChange={(e) => set({ fabricSource: e.target.value })}
          >
            {sampleFabricSourceOptions.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </Field>
        <Field label='notes'>
          <input
            className={selectCell}
            disabled={!canEdit}
            value={d.notes}
            onChange={(e) => set({ notes: e.target.value })}
          />
        </Field>
      </div>

      {/* Material write-off — pre-filled from the BOM lines whose material is marked "sample".
          Untick to create the sample only; stock can be issued later from its page. */}
      <CalloutBox tone='note'>
        <div className='flex flex-col gap-1'>
          <Text size='micro'>
            <b>Material write-off</b>
            {' — pre-filled from the BOM lines marked “sample”: '}
            {wo.stockLoading
              ? 'reading stock…'
              : wo.selected.length === 0
                ? 'nothing pre-fills (no sample-marked BOM line carries a consumption norm) — expand to pick lines by hand'
                : `${wo.summary}${wo.selected.length > 3 ? ` +${wo.selected.length - 3} more` : ''}`}
            {wo.hasCost ? (
              <>
                {' ≈ '}
                <b>{wo.money(wo.totalCost)}</b>
              </>
            ) : null}
          </Text>
          <label className='flex items-center gap-2'>
            <CheckboxCommon
              name='sample-write-off'
              checked={writeOff}
              disabled={!canEdit}
              onChange={(v) => setWriteOff(v)}
            />
            <Text size='micro' component='span' className='uppercase'>
              write these off now
            </Text>
          </label>
          <Text size='micro' variant='label'>
            uncheck to create the sample only — you can issue stock later from the sample page
          </Text>
          <div>
            <Button
              type='button'
              variant='secondary'
              size='xs'
              onClick={() => setEditLines((v) => !v)}
            >
              {editLines ? '− hide lines' : '+ edit lines'}
            </Button>
          </div>
        </div>
      </CalloutBox>

      {editLines ? (
        <div className='flex flex-col gap-1.5'>
          <GroupLabel>lines to write off</GroupLabel>
          <WriteoffSheet wo={wo} canEdit={canEdit && writeOff} />
        </div>
      ) : null}

      {!canEdit ? (
        <Text size='micro' variant='error'>
          you don't have permission to create samples on this card
        </Text>
      ) : null}

      <Text size='micro' variant='label'>
        Photos, fittings, provenance (round · spec release · previous sample) and dev expenses are
        added next, in the sample editor.
      </Text>

      <div className='flex flex-wrap items-center justify-between gap-2 border-t border-borderColor pt-2'>
        <Button type='button' variant='secondary' size='sm' onClick={onCancel}>
          cancel
        </Button>
        <Button
          type='button'
          variant='main'
          size='sm'
          disabled={!canEdit || busy || blocked}
          onClick={create}
        >
          {busy
            ? 'creating…'
            : writeOff && wo.selected.length > 0
              ? `create sample & write off ${wo.selected.length}`
              : 'create sample'}
        </Button>
      </div>
    </div>
  );
}
