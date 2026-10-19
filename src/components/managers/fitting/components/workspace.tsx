import { common_FittingChangeRequest, common_MediaFull } from 'api/proto-http/admin';
import { AnnotationKindKey } from 'components/managers/tech-card/annotation/kinds';
import { createContext, useContext } from 'react';

// Shared state of the fitting workspace (FITTING-WORKSPACE wave). Fitting-level fields
// (mediaIds, callouts, comment, outcome, status) live in the react-hook-form FittingFormData
// (useFormContext) and are autosaved by the shell; change requests have their own CRUD RPCs and
// come from the server copy below. Everything the photo stage, the edit list and the note share
// goes through this context, so each part stays in its own file.

// A mark drawn on a photo that is not yet attached to an edit: the composer shows it as a Chip and
// turns it into a callout with the edit's number on Add. Points are 0..1 decimal strings, as in
// the form's callout schema.
export type PendingMark = {
  mediaId: number;
  kind: AnnotationKindKey;
  posX: string;
  posY: string;
  points: { x: string; y: string }[];
};

// One AI-drafted edit: never stored until accepted (✓ = AddFittingChangeRequest).
export type DraftEdit = { note: string; target: string };

export type SaveState = 'idle' | 'saving' | 'saved' | 'error';

export type FittingWorkspace = {
  fittingId: number;
  techCardId: number;
  roundNumber: number;
  // Finished fitting (status done): the screen is read-only.
  readOnly: boolean;
  mediaById: Map<number, common_MediaFull>;
  addPicked: (items: common_MediaFull[]) => void;
  changeRequests: common_FittingChangeRequest[];
  currentMediaId: number;
  setCurrentMediaId: (id: number) => void;
  // The edit number highlighted on both sides (hover a row / click a mark).
  hotNumber: number | null;
  setHotNumber: (n: number | null) => void;
  pendingMark: PendingMark | null;
  setPendingMark: (m: PendingMark | null) => void;
  drafts: DraftEdit[];
  setDrafts: (d: DraftEdit[]) => void;
  // Flush the form-backed fields now instead of waiting for the debounce.
  saveNow: () => void;
  saveState: SaveState;
};

export const FittingWorkspaceContext = createContext<FittingWorkspace | null>(null);

export function useFittingWorkspace(): FittingWorkspace {
  const ws = useContext(FittingWorkspaceContext);
  if (!ws) throw new Error('useFittingWorkspace outside FittingWorkspaceContext');
  return ws;
}
