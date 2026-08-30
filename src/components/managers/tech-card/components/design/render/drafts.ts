import type { GetDesignBandResponse, common_DesignColourRecipe } from 'api/proto-http/admin';
import { useEffect, useRef, useState } from 'react';
import { useFormContext, type UseFormReturn } from 'react-hook-form';

import type { TechCardFormData } from '../../schema';
import { EMPTY_RECIPE, type Presentation } from './model';

/**
 * THE SUBMISSION DRAFTS — what is about to be asked for, and nothing else.
 *
 * A draft is NOT card data and never becomes any. It is the state of a menu: the colour a render
 * would be given, the frames a turntable would be turned in. It lives in the studio, dies with the
 * tab, and reaches the server exactly once — inside `StartDesignRun.params`, which the run then
 * freezes as its own history. Storing any of it on the card would put a second, competing answer to
 * «what colour is this style» next to the colourways, which is the one thing the palette's own
 * warning says it must never become.
 */

/* ─────────────────────────── the card's fit ─────────────────────────── */

/**
 * THE CARD'S FIT, READ WITHOUT ASSUMING THE FORM IS THERE.
 *
 * `fit` is a garment property: the studio only ever DISPLAYS it, and 3D may state a one-run
 * deviation from it. It lives in the tech card form, so it is read through the form context — but
 * the studio is also mounted by composers that are not inside a form (a print root, a harness), and
 * `useFormContext` answers `null` there while its type promises it never does. There is no error
 * boundary over this tab, so a `null.control` would take the whole screen white for the sake of a
 * grey caption.
 *
 * `useWatch` CANNOT BE USED HERE for exactly that reason: with no `control` prop it dereferences
 * the context itself. So the subscription is made by hand — `watch(callback)` returns a
 * subscription and is safe to skip entirely — and the hook count stays constant either way.
 */
export function useCardFit(): string {
  const form = useFormContext<TechCardFormData>() as UseFormReturn<TechCardFormData> | null;
  const [fit, setFit] = useState<string>(() => ((form?.getValues('fit') as string) ?? '').trim());

  useEffect(() => {
    if (!form) return;
    setFit(((form.getValues('fit') as string) ?? '').trim());
    const subscription = form.watch((values, { name }) => {
      if (name && name !== 'fit') return;
      setFit(((values.fit as string) ?? '').trim());
    });
    return () => subscription.unsubscribe();
  }, [form]);

  return fit;
}

/* ─────────────────────────── the colour draft ─────────────────────────── */

export type ColourDraft = {
  recipe: common_DesignColourRecipe;
  /** Replace one field of the recipe. */
  patch: (next: Partial<common_DesignColourRecipe>) => void;
  /** Restore a whole recipe — what a colour-history chip does. */
  restore: (recipe: common_DesignColourRecipe) => void;
};

/**
 * The colour a render would be given, seeded from the LAST recipe this card actually used.
 *
 * SEEDED ONCE, AND ONLY WHILE UNTOUCHED. `colour_recipes` is newest first, so the first entry is
 * what the card last rendered — opening the studio on it is what makes «render the same thing in
 * another size» a single press. The seed is dropped the moment a human touches anything, because a
 * band refetch (any write on the card invalidates it) would otherwise reach in and overwrite a
 * half-made choice with the last finished one.
 */
export function useColourDraft(band: GetDesignBandResponse): ColourDraft {
  const [recipe, setRecipe] = useState<common_DesignColourRecipe>(EMPTY_RECIPE);
  const touched = useRef(false);
  const seeded = useRef(false);

  const latest = (band.colourRecipes ?? [])[0];
  useEffect(() => {
    if (touched.current || seeded.current || !latest) return;
    seeded.current = true;
    setRecipe(latest);
  }, [latest]);

  return {
    recipe,
    patch: (next) => {
      touched.current = true;
      setRecipe((prev) => ({ ...prev, ...next }));
    },
    restore: (next) => {
      touched.current = true;
      setRecipe({
        source: next.source ?? '',
        code: next.code ?? '',
        hex: next.hex ?? '',
        words: next.words ?? '',
        fabricMediaId: next.fabricMediaId ?? 0,
      });
    },
  };
}

/* ─────────────────────────── the 3D draft ─────────────────────────── */

export type ThreedDraft = {
  frames: number;
  presentation: Presentation;
  /** 0 = no model chosen. A real id, from the models dictionary. */
  modelId: number;
  /** 0 = no size chosen. A real id, from the sizes dictionary. */
  garmentSizeId: number;
  /** '' = the card's fit was used. Anything else is a stated deviation and is stamped as one. */
  fitOverride: string;
};

export type ThreedDraftState = {
  draft: ThreedDraft;
  patch: (next: Partial<ThreedDraft>) => void;
};

const INITIAL_THREED: ThreedDraft = {
  frames: 12,
  presentation: 'air',
  modelId: 0,
  garmentSizeId: 0,
  fitOverride: '',
};

export function useThreedDraft(): ThreedDraftState {
  const [draft, setDraft] = useState<ThreedDraft>(INITIAL_THREED);
  return {
    draft,
    patch: (next) => setDraft((prev) => ({ ...prev, ...next })),
  };
}
