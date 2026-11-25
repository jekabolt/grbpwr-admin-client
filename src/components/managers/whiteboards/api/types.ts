// The UI view model of a whiteboard. Mirrors the `whiteboards` row in the guide's backend spec
// (CLAUDE.md → Backend); the adapter maps the generated proto type onto it once the RPCs exist.

export type Whiteboard = {
  uuid: string;
  title: string;
  createdBy: string;
  createdAt: string;
  updatedBy: string;
  updatedAt: string;
  /** Empty while the whiteboard is live. */
  archivedAt: string;
};

export type WhiteboardInsert = { title: string };

export type ListWhiteboardsFilter = {
  /** Title substring, case-insensitive. */
  search?: string;
  /** Only whiteboards created by this username. */
  createdBy?: string;
  archived?: boolean;
};

export const UNTITLED = 'untitled';
