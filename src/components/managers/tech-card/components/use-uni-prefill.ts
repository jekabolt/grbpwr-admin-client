// UNI PREFILL — the «ungraded» tick of a piece prefilled from the UNI token in its DXF block names.
//
// Moved out of pieces-tab.tsx (PATTERNS-LITE, decision 12): the CUT PIECES block is gone, the rule
// is not. Mounted by PatternsField, inside the card's FormProvider. The full reasoning lives with
// the original effect's history; the rules, briefly:
//   · only pieces NOT on the server are prefilled — a stored answer is never touched;
//   · every block of the piece must carry UNI (two drawings that disagree are not ours to settle);
//   · never on a released (frozen) card: a fieldset disables controls, not effects;
//   · never during a save (the save resets the form to its snapshot), and after the save the
//     decision is re-applied to pieces whose mark the reset rolled back.
//
// The parse is read PASSIVELY (`useDxfGeometry(pack, false)`): the cache key is the pack itself,
// so PatternsField's armed parse of the same pack is what this reads, and this hook never starts a
// download of its own.
import { useTechCard } from 'components/managers/tech-cards/components/useTechCardQuery';
import { useEffect, useMemo, useRef } from 'react';
import { useFormContext, useFormState, useWatch } from 'react-hook-form';
import { useParams } from 'react-router-dom';
import { uniOf } from './nesting/block-code';
import { useCardDxfPack } from './nesting/card-dxf-pack';
import { useDxfGeometry, useDxfIndex } from './nesting/dxf-geometry';
import { pieceBlockRefs, rollGoodsScopes, type PieceAliasRow } from './piece-block-refs';
import type { TechCardFormData } from './schema';

const RELEASED_STATE = 'TECH_CARD_APPROVAL_STATE_RELEASED';

type FormPiece = NonNullable<TechCardFormData['pieces']>[number];

export function useUniPrefill(): void {
  const { control, getValues, setValue } = useFormContext<TechCardFormData>();
  const { isSubmitting } = useFormState({ control });

  // The saved card — the same react-query read the page feeds the form with (page.tsx), so no
  // extra request. A new card (no id) has nothing saved and is never frozen, as before.
  const { id } = useParams<{ id: string }>();
  const numId = id ? parseInt(id, 10) : undefined;
  const { data: techCard } = useTechCard(numId && numId > 0 ? numId : undefined);

  const aliases = (useWatch({ control, name: 'pieceDxfAliases' }) ?? []) as PieceAliasRow[];
  const bomItems = (useWatch({ control, name: 'bomItems' }) ?? []) as Array<{
    lineKey?: string;
    section?: string;
    purpose?: string;
    name?: string;
  }>;
  const scopes = useMemo(() => rollGoodsScopes(bomItems), [bomItems]);
  const blocksByPiece = useMemo(() => pieceBlockRefs(aliases, scopes), [aliases, scopes]);

  const pack = useCardDxfPack();
  const geometry = useDxfGeometry(pack, false);
  const index = useDxfIndex(geometry.data);

  const savedPieceKeys = useMemo(() => {
    const set = new Set<string>();
    for (const p of techCard?.techCard?.pieces ?? []) {
      const key = (p.lineKey ?? '').trim().toLowerCase();
      if (key) set.add(key);
    }
    return set;
  }, [techCard?.techCard?.pieces]);

  const frozen = techCard?.techCard?.approvalState === RELEASED_STATE;
  const uniPrefilled = useRef(new Set<string>());
  const uniWritten = useRef(new Set<string>());
  const sawSubmitting = useRef(false);
  useEffect(() => {
    if (isSubmitting) {
      sawSubmitting.current = true;
      return;
    }
    if (!index || frozen) return;
    const afterSubmit = sawSubmitting.current;
    sawSubmitting.current = false;
    // Read imperatively: the decision depends on the parse and the links, not on every keystroke.
    const rows = (getValues('pieces') ?? []) as FormPiece[];
    rows.forEach((p, pi) => {
      const key = (p.lineKey ?? '').trim().toLowerCase();
      if (!key) return;
      if (afterSubmit && !p.ungraded && uniWritten.current.has(key)) {
        // Our mark did not survive the save's reset — the decision is taken again.
        uniPrefilled.current.delete(key);
        uniWritten.current.delete(key);
      }
      if (uniPrefilled.current.has(key)) return;
      if (savedPieceKeys.has(key)) return;
      const refs = blocksByPiece.get(key) ?? [];
      if (refs.length === 0 || !refs.every((r) => uniOf(r.block))) return;
      uniPrefilled.current.add(key);
      if (p.ungraded) return;
      setValue(`pieces.${pi}.ungraded`, true, { shouldDirty: true });
      // Remember that WE set it: only this tells a save rollback from a human unticking it.
      uniWritten.current.add(key);
    });
  }, [index, blocksByPiece, frozen, isSubmitting, savedPieceKeys, getValues, setValue]);
}
