// THE CARD'S HINTS, LIVE (SPEC-F §5). One hook reads the stored run for the SAVED card (Get: no AI,
// cheap), says whether the card moved since (stale), runs the model by itself once per input
// fingerprint when the card is awake (§5a, `wake.ts`) or on the owner's «rerun» (forced), writes the owner's word (overrides, the code dictionary) and hands out two values:
//
// - `hints` — AI ∪ the owner's rows by piece NAME, for the owner screen (shown even when stale,
//   marked so);
// - `forGuess` — the same by piece KEY for the seam model, with the AI run left out while it is
//   stale (a stale run is no evidence: SPEC §5 «stale digest → hints empty»). The owner's rows
//   stay: they are facts about this card, not about one run.

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { adminService } from 'api/api';
import type { GetTechCardSeamHintsResponse } from 'api/proto-http/admin';
import { useEffect, useMemo, useState, useSyncExternalStore } from 'react';

import { atlasPngBase64 } from './atlas';
import {
  dictRoleOf,
  ownerCodesVersion,
  setOwnerCodes,
  subscribeOwnerCodes,
  type OwnerCode,
} from './dictionary';
import {
  buildSeamHintsInput,
  cardSources,
  keyedSeamHints,
  type SeamHintsCard,
  type SeamHintsShape,
} from './input';
import { EMPTY_SEAM_HINTS, mergeSeamHints, type SeamHints } from './merge';
import {
  claimAutoRun,
  isSeamHintsAwake,
  seamHintsWakeVersion,
  subscribeSeamHintsWake,
  wakeSeamHints,
} from './wake';
import {
  overrideFromWire,
  overrideValueJson,
  parseSeamHintsJson,
  seamRoleSchema,
  type SeamHintOverride,
  type SeamRole,
} from './schema';

export const seamHintKeys = {
  all: ['seamHints'] as const,
  card: (id: number) => [...seamHintKeys.all, 'card', id] as const,
  get: (id: number, sig: string) => [...seamHintKeys.card(id), sig] as const,
  dictionary: () => [...seamHintKeys.all, 'dictionary'] as const,
};

/** A short stable signature of the input text (FNV-1a): the query key, not a digest. */
function sigOf(text: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i += 1) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return `${text.length}:${(h >>> 0).toString(16)}`;
}

const handOf = (hand: string | undefined): 'L' | 'R' | null =>
  hand === 'L' || hand === 'R' ? hand : null;

/** The owner's code dictionary, fed into the one accessor every name reading goes through. */
export function usePieceCodeDictionary() {
  const query = useQuery({
    queryKey: seamHintKeys.dictionary(),
    queryFn: () => adminService.ListPieceCodeDictionary({}),
    staleTime: 5 * 60_000,
  });
  const rows = useMemo<OwnerCode[]>(
    () =>
      (query.data?.entries ?? []).flatMap((entry) => {
        const role = seamRoleSchema.safeParse(entry.role);
        return entry.code && role.success
          ? [{ code: entry.code, role: role.data, hand: handOf(entry.hand) }]
          : [];
      }),
    [query.data],
  );
  useEffect(() => {
    if (query.data) setOwnerCodes(rows);
  }, [query.data, rows]);
  return { rows, isPending: query.isPending };
}

export type SeamHintsRun = {
  model: string;
  createdAt: string;
};

export type SuggestResult = { cached: boolean; costUsd: string; calls: number };

export type SeamHintsState = {
  /** AI ∪ owner rows by piece name (owner screen). */
  hints: SeamHints;
  /** AI (unless stale) ∪ owner rows by piece key (seam model). */
  forGuess: SeamHints;
  /** A run exists for this card (at any digest). */
  hasRun: boolean;
  /** The stored run was made for another state of the card. */
  stale: boolean;
  run: SeamHintsRun | null;
  overrides: readonly SeamHintOverride[];
  isLoading: boolean;
  isError: boolean;
  /** A sent name → the piece keys under it (unit → its pieces). */
  piecesOfName: ReadonlyMap<string, readonly string[]>;
  nameOfKey: ReadonlyMap<string, string>;
  /** The owner's «rerun»: roles and every step, forced. */
  rerun: () => void;
  suggesting: boolean;
  suggestError: string | null;
  lastSuggest: SuggestResult | null;
  setOverride: (
    row: SeamHintOverride | { kind: 'role' | 'join'; hint_key: string; state: '' },
  ) => void;
  setDictionary: (code: string, role: SeamRole | '', hand: 'L' | 'R' | null) => Promise<void>;
  writing: boolean;
};

const AUTO_SETTLE_MS = 4000;

const errText = (error: unknown) => (error instanceof Error ? error.message : 'failed');

export function useSeamHints(
  techCardId: number | undefined,
  card: SeamHintsCard | undefined,
  shapes: ReadonlyMap<string, SeamHintsShape>,
  /** False while the DXF is unread: shape numbers would move the digest. */
  ready: boolean,
  /** The construction screen is open: the first open with no run wakes the card. */
  open = false,
): SeamHintsState {
  const queryClient = useQueryClient();
  const dictionary = usePieceCodeDictionary();
  const codesVersion = useSyncExternalStore(subscribeOwnerCodes, ownerCodesVersion);

  const built = useMemo(() => {
    const src = cardSources(card, shapes, dictRoleOf);
    return buildSeamHintsInput(src.pieces, src.ops, src.sketchMediaIds);
    // The dictionary version re-reads every `dict_role` when the owner's rows change.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [card, shapes, codesVersion]);
  const inputJson = useMemo(() => JSON.stringify(built.input), [built]);
  const sig = useMemo(() => sigOf(inputJson), [inputJson]);
  const enabled = !!techCardId && ready && !dictionary.isPending;
  const getKey = seamHintKeys.get(techCardId ?? 0, sig);

  const get = useQuery({
    queryKey: getKey,
    queryFn: () =>
      adminService.GetTechCardSeamHints({ techCardId, inputJson, inputDigest: undefined }),
    enabled,
    staleTime: 60_000,
  });

  const data = get.data;
  const ai = useMemo(() => parseSeamHintsJson(data?.hintsJson), [data?.hintsJson]);
  const overrides = useMemo(
    () =>
      (data?.overrides ?? []).flatMap((wire) => {
        const row = overrideFromWire(wire);
        return row ? [row] : [];
      }),
    [data?.overrides],
  );
  const stale = !!ai && !!data?.stale;
  const hints = useMemo(() => mergeSeamHints(ai, overrides), [ai, overrides]);
  const forGuess = useMemo(
    () =>
      ai || overrides.length
        ? keyedSeamHints(mergeSeamHints(stale ? null : ai, overrides), built.keyOfName)
        : EMPTY_SEAM_HINTS,
    [ai, overrides, stale, built.keyOfName],
  );

  const patchGet = (patch: Partial<GetTechCardSeamHintsResponse>) =>
    queryClient.setQueryData<GetTechCardSeamHintsResponse>(getKey, (old) =>
      old ? { ...old, ...patch } : (patch as GetTechCardSeamHintsResponse),
    );

  const [lastSuggest, setLastSuggest] = useState<SuggestResult | null>(null);
  const suggestMutation = useMutation({
    // A quiet run is never retried (a refused / limited call stays silent); «rerun» is the owner's.
    retry: false,
    mutationFn: async ({ force }: { force: boolean; auto: boolean }) => {
      const atlas = atlasPngBase64(
        [...shapes].flatMap(([key, shape]) => {
          const name = built.nameOfKey.get(key);
          return name ? [{ name, outline: shape.geom.rs }] : [];
        }),
      );
      const withAtlas = JSON.stringify(atlas ? { ...built.input, atlas_png: atlas } : built.input);
      // Not forced → the server asks the model only for what has no row at its current digest.
      return adminService.SuggestTechCardSeamHints({ techCardId, inputJson: withAtlas, force });
    },
    onSuccess: (res) => {
      setLastSuggest({
        cached: !!res.cached,
        costUsd: res.costUsd ?? '',
        calls: res.calls ?? 0,
      });
      patchGet({
        hintsJson: res.hintsJson,
        runDigest: res.inputDigest,
        inputDigest: res.inputDigest,
        model: res.model,
        createdAt: res.createdAt,
        stale: false,
      });
      void queryClient.invalidateQueries({ queryKey: seamHintKeys.card(techCardId ?? 0) });
    },
  });

  const overrideMutation = useMutation({
    mutationFn: (row: SeamHintOverride | { kind: 'role' | 'join'; hint_key: string; state: '' }) =>
      adminService.SetTechCardSeamHintOverride({
        techCardId,
        kind: row.kind,
        hintKey: row.hint_key,
        valueJson: row.state === '' ? '' : overrideValueJson(row as SeamHintOverride),
        state: row.state,
      }),
    onSuccess: (res) => patchGet({ overrides: res.overrides ?? [] }),
  });

  // §5a: once awake, every fingerprint with no current run gets one quiet Suggest, after the card
  // has held still for a moment (a save refetches the card, the DXF parses after it).
  useEffect(() => {
    if (open && techCardId) wakeSeamHints(techCardId);
  }, [open, techCardId]);
  useSyncExternalStore(subscribeSeamHintsWake, seamHintsWakeVersion);
  const awake = isSeamHintsAwake(techCardId);
  const hasPieces = built.input.pieces.length > 0;
  const missing = get.isSuccess && (!ai || stale);
  const { mutate: runSuggest, isPending: suggestPending } = suggestMutation;
  useEffect(() => {
    if (!techCardId || !awake || !enabled || !hasPieces || !missing || suggestPending) return;
    const timer = setTimeout(() => {
      if (claimAutoRun(techCardId, sig)) runSuggest({ force: false, auto: true });
    }, AUTO_SETTLE_MS);
    return () => clearTimeout(timer);
  }, [techCardId, awake, enabled, hasPieces, missing, suggestPending, sig, runSuggest]);

  const dictionaryMutation = useMutation({
    mutationFn: (entry: { code: string; role: SeamRole | ''; hand: 'L' | 'R' | null }) =>
      adminService.SetPieceCodeDictionaryEntry({
        code: entry.code,
        role: entry.role,
        hand: entry.hand ?? '',
      }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: seamHintKeys.dictionary() }),
  });

  return {
    hints,
    forGuess,
    hasRun: !!ai,
    stale,
    run: ai ? { model: data?.model ?? '', createdAt: String(data?.createdAt ?? '') } : null,
    overrides,
    isLoading: enabled && get.isPending,
    isError: get.isError,
    piecesOfName: built.piecesOfName,
    nameOfKey: built.nameOfKey,
    rerun: () => suggestMutation.mutate({ force: true, auto: false }),
    suggesting: suggestMutation.isPending,
    // An automatic run fails silently: empty hints, the guess as before.
    suggestError:
      suggestMutation.isError && !suggestMutation.variables?.auto
        ? errText(suggestMutation.error)
        : null,
    lastSuggest,
    setOverride: (row) => overrideMutation.mutate(row),
    setDictionary: async (code, role, hand) => {
      await dictionaryMutation.mutateAsync({ code, role, hand });
    },
    writing: overrideMutation.isPending || dictionaryMutation.isPending,
  };
}
